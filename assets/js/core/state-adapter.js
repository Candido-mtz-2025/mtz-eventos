// Ponte entre o estado global legado e os servicos transacionais.
(() => {
    'use strict';

    const CHAVE_SYNC = 'mtzUltimaEdicao';
    const controlador = typeof window.__obterControladorEstadoAplicacao === 'function'
        ? window.__obterControladorEstadoAplicacao()
        : null;
    if (!controlador) {
        console.error('Ponte transacional indisponivel: controlador do estado nao encontrado.');
        return;
    }
    try {
        delete window.__obterControladorEstadoAplicacao;
    } catch (_erro) {
        // A fabrica e de uso unico mesmo quando o ambiente impede a remocao.
    }

    const chavesObrigatorias = new Set(controlador.chaves);
    const chavesMetadadosPersistencia = Object.freeze(['versao', 'data', 'ultimaEdicao']);
    const clonarPersistivelEstrito = window.clonarJsonPersistivelEstrito;
    const confirmacoesPublicacao = new WeakMap();
    const autorizacoesPublicacao = new WeakMap();
    const autorizacoesConsumidas = new WeakSet();
    let autorizacaoAtiva = null;
    let publicacaoEmAndamento = false;

    function clonarJsonInterno(valor) {
        try {
            const json = JSON.stringify(valor);
            if (typeof json !== 'string') return { ok: false, codigo: 'ESTADO_NAO_SERIALIZAVEL' };
            const clone = JSON.parse(json);
            return { ok: true, valor: clone, json };
        } catch (_erro) {
            return { ok: false, codigo: 'ESTADO_NAO_SERIALIZAVEL' };
        }
    }

    function validarEstruturaInterna(estado) {
        if (!estado || typeof estado !== 'object' || Array.isArray(estado)) return false;
        for (const chave of chavesObrigatorias) {
            if (!Object.prototype.hasOwnProperty.call(estado, chave)) return false;
        }
        for (const chave of chavesObrigatorias) {
            if (chave === 'config' || chave === 'checklistConferencia') {
                if (!estado[chave] || typeof estado[chave] !== 'object'
                    || Array.isArray(estado[chave])) return false;
            } else if (!Array.isArray(estado[chave])) {
                return false;
            }
        }
        return true;
    }

    function obterEstadoMemoriaAtual() {
        return controlador.obterReferencia();
    }

    function fingerprintFnv1a64(texto) {
        let hash = 0xcbf29ce484222325n;
        const primo = 0x100000001b3n;
        const valor = String(texto);
        for (let indice = 0; indice < valor.length; indice += 1) {
            hash ^= BigInt(valor.charCodeAt(indice));
            hash = BigInt.asUintN(64, hash * primo);
        }
        return hash.toString(16).padStart(16, '0');
    }

    function contextoConfirmacaoValido(opcoes = {}) {
        return typeof opcoes.operacaoId === 'string'
            && opcoes.operacaoId.length <= 160
            && /^[a-z0-9][a-z0-9._:-]*$/.test(opcoes.operacaoId)
            && typeof opcoes.fingerprintPublicacaoEsperado === 'string'
            && /^[a-f0-9]{16}$/.test(opcoes.fingerprintPublicacaoEsperado);
    }

    function limparAutorizacaoPublicacao(registro) {
        if (!registro) return;
        if (registro.token && typeof registro.token === 'object') {
            autorizacoesConsumidas.add(registro.token);
            autorizacoesPublicacao.delete(registro.token);
            confirmacoesPublicacao.delete(registro.token);
        }
        if (autorizacaoAtiva === registro) autorizacaoAtiva = null;
        registro.token = null;
        registro.operacaoId = '';
        registro.fingerprintPublicacao = '';
        registro.estadoAnterior = null;
        registro.estadoPublicado = null;
        registro.estado = 'encerrada';
    }

    function prepararAutorizacaoPublicacao(consulta = {}) {
        if (!contextoConfirmacaoValido(consulta)
            || consulta.estadoAnterior !== controlador.obterReferencia()
            || autorizacaoAtiva) return null;
        const token = Object.freeze(Object.create(null));
        const registro = {
            token,
            operacaoId: consulta.operacaoId,
            fingerprintPublicacao: consulta.fingerprintPublicacaoEsperado,
            estadoAnterior: consulta.estadoAnterior,
            estadoPublicado: null,
            estado: 'emitida'
        };
        autorizacoesPublicacao.set(token, registro);
        autorizacaoAtiva = registro;
        return token;
    }

    function cancelarAutorizacaoPublicacao(token) {
        const registro = token && typeof token === 'object'
            ? (autorizacoesPublicacao.get(token)
                || (autorizacaoAtiva?.token === token ? autorizacaoAtiva : null))
            : null;
        if (!registro) return false;
        limparAutorizacaoPublicacao(registro);
        return true;
    }

    function consultarConfirmacaoPublicacao(consulta = {}) {
        const registro = autorizacaoAtiva;
        try {
            if (!registro || consulta.autorizacaoPublicacao !== registro.token
                || !contextoConfirmacaoValido(consulta)) return null;
            const confirmacao = confirmacoesPublicacao.get(registro.token);
            if (!confirmacao || confirmacao.operacaoId !== consulta.operacaoId
                || confirmacao.fingerprintPublicacao !== consulta.fingerprintPublicacaoEsperado
                || confirmacao.estadoAnterior !== consulta.estadoAnterior
                || confirmacao.estadoPublicado !== controlador.obterReferencia()
                || confirmacao.trocas !== 1) return null;
            return Object.freeze({
                confirmada: true,
                operacaoId: confirmacao.operacaoId,
                fingerprintPublicacao: confirmacao.fingerprintPublicacao,
                trocas: 1
            });
        } finally {
            limparAutorizacaoPublicacao(registro);
        }
    }

    function consumirAutorizacaoNaPrimeiraTentativa(estadoAnterior, opcoes = {}) {
        const registro = autorizacaoAtiva;
        if (!registro) {
            const tokenRecebido = opcoes?.autorizacaoPublicacao;
            if (tokenRecebido && typeof tokenRecebido === 'object'
                && autorizacoesConsumidas.has(tokenRecebido)) {
                return { ok: false, codigo: 'AUTORIZACAO_PUBLICACAO_CONSUMIDA', registro: null };
            }
            if ('autorizacaoPublicacao' in Object(opcoes) || opcoes?.exigirConfirmacaoInterna === true) {
                return { ok: false, codigo: 'AUTORIZACAO_PUBLICACAO_INVALIDA', registro: null };
            }
            return { ok: true, protegida: false, registro: null };
        }
        if (registro.estado !== 'emitida') {
            return { ok: false, codigo: 'AUTORIZACAO_PUBLICACAO_CONSUMIDA', registro };
        }

        // O primeiro ingresso no publicador consome a tentativa antes de qualquer validacao.
        registro.estado = 'consumida';
        autorizacoesPublicacao.delete(registro.token);
        autorizacoesConsumidas.add(registro.token);
        const tokenRecebido = opcoes?.autorizacaoPublicacao;
        if (registro.estado !== 'consumida' || tokenRecebido !== registro.token
            || estadoAnterior !== registro.estadoAnterior) {
            return { ok: false, codigo: 'AUTORIZACAO_PUBLICACAO_INVALIDA', registro };
        }
        return { ok: true, protegida: true, registro };
    }

    function publicarNaRaiz(estadoAnterior, estadoConfirmado, opcoes = {}) {
        const tentativa = consumirAutorizacaoNaPrimeiraTentativa(estadoAnterior, opcoes);
        if (!tentativa.ok) {
            return {
                ok: false,
                codigo: tentativa.codigo,
                publicacaoRealizada: false
            };
        }
        if (publicacaoEmAndamento) {
            return {
                ok: false,
                codigo: 'PUBLICACAO_ESTADO_EM_ANDAMENTO',
                publicacaoRealizada: false
            };
        }
        publicacaoEmAndamento = true;
        try {
            if (controlador.obterReferencia() !== estadoAnterior) {
                return {
                    ok: false,
                    codigo: 'REFERENCIA_RAIZ_DIVERGENTE',
                    publicacaoRealizada: false
                };
            }
            const clonagemEstrita = typeof clonarPersistivelEstrito === 'function'
                ? clonarPersistivelEstrito(estadoConfirmado)
                : { ok: false, codigo: 'CLONADOR_ESTRITO_INDISPONIVEL' };
            if (!clonagemEstrita?.ok) {
                return {
                    ok: false,
                    codigo: clonagemEstrita?.codigo || 'ESTADO_NAO_SERIALIZAVEL',
                    publicacaoRealizada: false
                };
            }
            const preparado = clonarJsonInterno(clonagemEstrita.valor);
            if (!preparado.ok) {
                return {
                    ok: false,
                    codigo: preparado.codigo || 'ESTADO_CONFIRMADO_INVALIDO',
                    publicacaoRealizada: false
                };
            }
            chavesMetadadosPersistencia.forEach((chave) => {
                delete preparado.valor[chave];
            });
            if (!validarEstruturaInterna(preparado.valor)) {
                return {
                    ok: false,
                    codigo: 'ESTADO_CONFIRMADO_INVALIDO',
                    publicacaoRealizada: false
                };
            }
            const jsonOperacional = JSON.stringify(preparado.valor);
            if (typeof opcoes.jsonOperacionalEsperado === 'string'
                && jsonOperacional !== opcoes.jsonOperacionalEsperado) {
                return {
                    ok: false,
                    codigo: 'ESTADO_CONFIRMADO_DIVERGENTE',
                    publicacaoRealizada: false
                };
            }
            const fingerprintCalculado = fingerprintFnv1a64(jsonOperacional);
            const autorizacaoPendente = tentativa.registro;
            const exigeConfirmacao = tentativa.protegida === true;
            if (exigeConfirmacao && autorizacaoPendente.fingerprintPublicacao !== fingerprintCalculado) {
                return {
                    ok: false,
                    codigo: 'AUTORIZACAO_PUBLICACAO_DIVERGENTE',
                    publicacaoRealizada: false
                };
            }
            // Da validacao final ate a troca da raiz nao ha chamadas externas.
            const estadoPublicado = preparado.valor;
            const publicado = controlador.publicarReferencia(estadoAnterior, estadoPublicado);
            if (publicado && exigeConfirmacao) {
                autorizacaoPendente.estado = 'confirmada';
                autorizacaoPendente.estadoPublicado = estadoPublicado;
                confirmacoesPublicacao.set(autorizacaoPendente.token, Object.freeze({
                    operacaoId: autorizacaoPendente.operacaoId,
                    fingerprintPublicacao: fingerprintCalculado,
                    estadoAnterior,
                    estadoPublicado,
                    trocas: 1
                }));
            }
            return publicado
                ? {
                    ok: true,
                    codigo: 'ESTADO_CONFIRMADO_PUBLICADO',
                    publicacaoRealizada: true,
                    estadoPublicado
                }
                : {
                    ok: false,
                    codigo: 'PUBLICACAO_ESTADO_RECUSADA',
                    publicacaoRealizada: false
                };
        } finally {
            publicacaoEmAndamento = false;
        }
    }

    function publicarEstadoConfirmado(estadoConfirmado, estadoEsperado = controlador.obterReferencia(), opcoes = {}) {
        const resultado = publicarNaRaiz(estadoEsperado, estadoConfirmado, opcoes);
        if (!resultado.ok) {
            const erro = new Error(resultado.codigo);
            erro.codigo = resultado.codigo;
            erro.publicacaoRealizada = resultado.publicacaoRealizada === true;
            throw erro;
        }
        return true;
    }

    const registrarFronteira = window.__registrarFronteiraPublicacaoTransacional;
    const fronteiraRegistrada = typeof registrarFronteira === 'function'
        && registrarFronteira(Object.freeze({
            prepararAutorizacaoPublicacao,
            cancelarAutorizacaoPublicacao,
            consultarConfirmacaoPublicacao
        }));
    if (!fronteiraRegistrada) {
        console.error('Fronteira privada de confirmação transacional indisponível.');
    }

    function obterMetadadoSincronizacaoAtual() {
        try {
            return window.localStorage.getItem(CHAVE_SYNC);
        } catch (_erro) {
            return null;
        }
    }

    function atualizarMetadadoSincronizacao(dados = {}) {
        const valor = dados.ultimaEdicao;
        const valido = (typeof valor === 'number' && Number.isFinite(valor))
            || (typeof valor === 'string' && valor.trim());
        if (!valido) return false;
        const texto = String(valor);
        try {
            window.localStorage.setItem(CHAVE_SYNC, texto);
            return window.localStorage.getItem(CHAVE_SYNC) === texto;
        } catch (_erro) {
            try {
                return window.localStorage.getItem(CHAVE_SYNC) === texto;
            } catch (_erroReleitura) {
                return false;
            }
        }
    }

    function dependenciasComuns(armazenamento, adicionais = {}) {
        return {
            armazenamento,
            planejarAjusteReservaLocacao: window.planejarAjusteReservaLocacao,
            gerarAssinaturaPlanoAjusteLocacao: window.gerarAssinaturaPlanoAjusteLocacao,
            validarOperacaoIdLocacao: window.validarOperacaoIdLocacao,
            normalizarControleEdicaoLocacao: window.normalizarControleEdicaoLocacao,
            verificarEstadoOperacaoLocacao: window.verificarEstadoOperacaoLocacao,
            criarCheckpointOperacionalEdicaoLocacao: window.criarCheckpointOperacionalEdicaoLocacao,
            prepararRegistroOperacaoConcluida: window.prepararRegistroOperacaoConcluida,
            clonarJsonPersistivelEstrito: window.clonarJsonPersistivelEstrito,
            criarSnapshotReservaLocacao: window.criarSnapshotReservaLocacao,
            obterQuantidadePendenteDevolucaoItem: window.obterQuantidadePendenteDevolucaoItem,
            prepararSnapshotPersistivelCompleto: window.prepararSnapshotPersistivelCompleto,
            persistirSnapshotLocalConfirmavel: window.persistirSnapshotLocalConfirmavel,
            lerSnapshotLocalConfirmavel: window.lerSnapshotLocalConfirmavel,
            validarEstruturaSnapshotPersistivelCompleto: window.validarEstruturaSnapshotPersistivelCompleto,
            obterEstadoMemoriaAtual,
            publicarEstadoConfirmado,
            obterMetadadoSincronizacaoAtual,
            atualizarMetadadoSincronizacao,
            ...adicionais
        };
    }

    function criarDependenciasExecutorAjusteLocacao(opcoes = {}) {
        const armazenamento = opcoes.armazenamento || window.localStorage;
        const dependencias = dependenciasComuns(armazenamento, opcoes.dependencias);
        Object.defineProperty(dependencias, 'estadoAtual', {
            configurable: false,
            enumerable: true,
            get: obterEstadoMemoriaAtual
        });
        return dependencias;
    }

    function criarDependenciasRecuperacaoAjusteLocacao(opcoes = {}) {
        const armazenamento = opcoes.armazenamento || window.localStorage;
        const dependencias = dependenciasComuns(armazenamento, opcoes.dependencias);
        const estadoAtual = obterEstadoMemoriaAtual();
        const porta = window.criarPortaEstadoConfirmadoAtomica(estadoAtual, { publicarNaRaiz });
        return { ...dependencias, portaEstadoConfirmadoAtomica: porta };
    }

    window.obterEstadoMemoriaAtual = obterEstadoMemoriaAtual;
    window.publicarEstadoConfirmado = publicarEstadoConfirmado;
    window.obterMetadadoSincronizacaoAtual = obterMetadadoSincronizacaoAtual;
    window.atualizarMetadadoSincronizacao = atualizarMetadadoSincronizacao;
    window.criarDependenciasExecutorAjusteLocacao = criarDependenciasExecutorAjusteLocacao;
    window.criarDependenciasRecuperacaoAjusteLocacao = criarDependenciasRecuperacaoAjusteLocacao;
})();
