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

    function publicarNaRaiz(estadoAnterior, estadoConfirmado) {
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

            // Da validacao final ate a troca da raiz nao ha chamadas externas.
            const estadoPublicado = preparado.valor;
            const publicado = controlador.publicarReferencia(estadoAnterior, estadoPublicado);
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

    function publicarEstadoConfirmado(estadoConfirmado, estadoEsperado = controlador.obterReferencia()) {
        const resultado = publicarNaRaiz(estadoEsperado, estadoConfirmado);
        if (!resultado.ok) {
            const erro = new Error(resultado.codigo);
            erro.codigo = resultado.codigo;
            throw erro;
        }
        return true;
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
