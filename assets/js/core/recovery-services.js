(() => {
    'use strict';

    const COLECOES_SEM_ORDEM_SEMANTICA = new Set([
        'locadores',
        'pecas',
        'tipos',
        'usuarios',
        'locacoes',
        'devolucoes'
    ]);
    const CHAVES_METADADOS_PERSISTENCIA = new Set(['versao', 'data', 'ultimaEdicao']);
    const CAMPO_PROVAS_RECUPERACAO = 'provasRecuperacao';
    const publicadoresAtomicosAutorizados = new WeakSet();
    const contextoPublicadoresAtomicos = new WeakMap();
    const contextoPortasAtomicas = new WeakMap();
    const travasRecuperacaoPorArmazenamento = new WeakMap();

    function referenciaEstrita(valor) {
        if (typeof valor === 'string' && valor.length <= 200
            && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(valor)) return `string:${valor}`;
        if (typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0) {
            return `number:${valor}`;
        }
        return '';
    }

    function assinaturaValida(valor) {
        return typeof valor === 'string'
            && /^ajuste-reserva-v1:fnv1a64:[a-f0-9]{16}$/.test(valor);
    }

    function fingerprintRecuperacaoValido(valor) {
        return typeof valor === 'string'
            && /^recuperacao-estado-v1:fnv1a64:[a-f0-9]{16}$/.test(valor);
    }

    function chaveValida(valor) {
        return typeof valor === 'string' && valor.length > 0 && valor.length <= 160 && !/\s/.test(valor);
    }

    function clonarRetorno(valor, referencias = new WeakMap()) {
        if (valor === null || typeof valor !== 'object') return valor;
        if (referencias.has(valor)) return referencias.get(valor);
        const copia = Array.isArray(valor) ? [] : {};
        referencias.set(valor, copia);
        Object.keys(valor).forEach((chave) => {
            copia[chave] = clonarRetorno(valor[chave], referencias);
        });
        return copia;
    }

    function resultadoBase(codigo, opcoes = {}) {
        return clonarRetorno({
            ok: opcoes.ok === true,
            codigo,
            estado: opcoes.estado || 'bloqueado',
            recuperacaoAutomaticaPermitida: opcoes.recuperacaoAutomaticaPermitida === true,
            requerIntervencao: opcoes.requerIntervencao !== false,
            operacao: opcoes.operacao || null,
            evidencias: opcoes.evidencias || null,
            comparacao: opcoes.comparacao || null,
            acoesPermitidas: Array.isArray(opcoes.acoesPermitidas) ? opcoes.acoesPermitidas : [],
            diagnosticoId: opcoes.diagnosticoId || '',
            bloqueios: Array.isArray(opcoes.bloqueios) ? opcoes.bloqueios : [],
            avisos: Array.isArray(opcoes.avisos) ? opcoes.avisos : [],
            publicacaoRealizada: opcoes.publicacaoRealizada === true,
            efeitos: {
                publicarMemoria: opcoes.publicarMemoria === true,
                atualizarSync: opcoes.atualizarSync === true,
                renderizar: opcoes.renderizar === true,
                sincronizar: opcoes.sincronizar === true
            }
        });
    }

    function resultadoClonagem(clonar, valor) {
        if (typeof clonar !== 'function') return { ok: false, codigo: 'DEPENDENCIA_CLONAGEM_AUSENTE' };
        const resultado = clonar(valor);
        return resultado && typeof resultado === 'object'
            ? resultado
            : { ok: false, codigo: 'FALHA_CLONAGEM' };
    }

    function clonarJsonInterno(valor) {
        try {
            const json = JSON.stringify(valor);
            if (typeof json !== 'string') return { ok: false, codigo: 'FALHA_CLONAGEM_INTERNA' };
            return { ok: true, valor: JSON.parse(json), json };
        } catch (_erro) {
            return { ok: false, codigo: 'FALHA_CLONAGEM_INTERNA' };
        }
    }

    function compararTexto(a, b) {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    }

    function canonicalizar(valor, caminho = []) {
        if (Array.isArray(valor)) {
            const itens = valor.map((item, indice) => canonicalizar(item, [...caminho, indice]));
            if (caminho.length === 1 && COLECOES_SEM_ORDEM_SEMANTICA.has(caminho[0])) {
                return itens.map((item, indice) => {
                    const id = item && typeof item === 'object'
                        ? referenciaEstrita(item.id ?? item.locacaoId)
                        : '';
                    return {
                        item,
                        indice,
                        chave: `${id ? `0:${id}` : '1:sem-id'}:${JSON.stringify(item)}`
                    };
                }).sort((a, b) => compararTexto(a.chave, b.chave) || a.indice - b.indice)
                    .map((registro) => registro.item);
            }
            return itens;
        }
        if (!valor || typeof valor !== 'object') return valor;
        return Object.keys(valor).sort().reduce((resultado, chave) => {
            resultado[chave] = canonicalizar(valor[chave], [...caminho, chave]);
            return resultado;
        }, {});
    }

    function canonicalizarFingerprintRecuperacao(valor, caminho = [], estadoCompleto = false) {
        if (Array.isArray(valor)) {
            const itens = valor.map((item, indice) => (
                canonicalizarFingerprintRecuperacao(item, [...caminho, indice], estadoCompleto)
            ));
            if (estadoCompleto && caminho.length === 1
                && COLECOES_SEM_ORDEM_SEMANTICA.has(caminho[0])) {
                return itens.map((item, indice) => {
                    const id = item && typeof item === 'object'
                        ? referenciaEstrita(item.id ?? item.locacaoId)
                        : '';
                    return {
                        item,
                        indice,
                        chave: `${id ? `0:${id}` : '1:sem-id'}:${JSON.stringify(item)}`
                    };
                }).sort((a, b) => compararTexto(a.chave, b.chave) || a.indice - b.indice)
                    .map((registro) => registro.item);
            }
            return itens;
        }
        if (!valor || typeof valor !== 'object') return valor;
        return Object.keys(valor).sort().reduce((resultado, chave) => {
            if (estadoCompleto && caminho.length === 0
                && CHAVES_METADADOS_PERSISTENCIA.has(chave)) return resultado;
            resultado[chave] = canonicalizarFingerprintRecuperacao(
                valor[chave],
                [...caminho, chave],
                estadoCompleto
            );
            return resultado;
        }, {});
    }

    function removerProvasTecnicasOperacao(valor, entrada, estadoCompleto) {
        const referenciaLocacao = referenciaEstrita(entrada?.locacaoId);
        const registroAlvo = (registro) => registro?.operacaoId === entrada?.operacaoId
            && registro?.assinaturaPlano === entrada?.assinaturaPlano
            && referenciaEstrita(registro?.locacaoId) === referenciaLocacao;
        const limparLocacao = (locacao) => {
            if (referenciaEstrita(locacao?.id ?? locacao?.locacaoId) !== referenciaLocacao) return;
            (Array.isArray(locacao.historicoOperacional) ? locacao.historicoOperacional : [])
                .filter(registroAlvo)
                .forEach((registro) => delete registro[CAMPO_PROVAS_RECUPERACAO]);
        };
        if (!estadoCompleto) {
            limparLocacao(valor);
            return;
        }
        (Array.isArray(valor?.locacoes) ? valor.locacoes : []).forEach(limparLocacao);
        (Array.isArray(valor?.logsAuditoria) ? valor.logsAuditoria : [])
            .filter(registroAlvo)
            .forEach((registro) => delete registro[CAMPO_PROVAS_RECUPERACAO]);
    }

    function fingerprintFnv1a64(texto) {
        let hash = 0xcbf29ce484222325n;
        const primo = 0x100000001b3n;
        for (let indice = 0; indice < texto.length; indice += 1) {
            hash ^= BigInt(texto.charCodeAt(indice));
            hash = BigInt.asUintN(64, hash * primo);
        }
        return hash.toString(16).padStart(16, '0');
    }

    function prepararValorParaFingerprint(valor, clonar, estadoCompleto = false, entrada = {}) {
        const clonagem = resultadoClonagem(clonar, valor);
        if (!clonagem.ok) return clonagem;
        removerProvasTecnicasOperacao(clonagem.valor, entrada, estadoCompleto);
        const canonico = canonicalizarFingerprintRecuperacao(
            clonagem.valor,
            [],
            estadoCompleto
        );
        const json = JSON.stringify(canonico);
        return {
            ok: true,
            valor: canonico,
            json,
            fingerprint: `recuperacao-estado-v1:fnv1a64:${fingerprintFnv1a64(json)}`
        };
    }

    function prepararEstadoParaFingerprint(estado, clonar, entrada) {
        return prepararValorParaFingerprint(estado, clonar, true, entrada);
    }

    function localizarLocacaoUnica(locacoes, locacaoId) {
        const referencia = referenciaEstrita(locacaoId);
        if (!referencia || !Array.isArray(locacoes)) return { quantidade: 0, locacao: null };
        const encontradas = locacoes.filter((locacao) => (
            referenciaEstrita(locacao?.id ?? locacao?.locacaoId) === referencia
        ));
        return { quantidade: encontradas.length, locacao: encontradas.length === 1 ? encontradas[0] : null };
    }

    function historicosGlobais(locacoes) {
        return (Array.isArray(locacoes) ? locacoes : []).flatMap((locacao) => (
            Array.isArray(locacao?.historicoOperacional) ? locacao.historicoOperacional : []
        ));
    }

    function inteiroSeguro(valor) {
        return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
    }

    function validarProvasRecuperacao(provasHistorico, provasAuditoria, entrada, revisao) {
        if (!provasHistorico || typeof provasHistorico !== 'object'
            || !provasAuditoria || typeof provasAuditoria !== 'object') {
            return { valido: false, codigo: 'PROVAS_RECUPERACAO_AUSENTES', provas: null };
        }
        if (JSON.stringify(canonicalizar(provasHistorico))
            !== JSON.stringify(canonicalizar(provasAuditoria))) {
            return { valido: false, codigo: 'PROVAS_RECUPERACAO_DIVERGENTES', provas: null };
        }
        const revisaoAnterior = inteiroSeguro(provasHistorico.revisaoAnterior);
        const revisaoPosterior = inteiroSeguro(provasHistorico.revisaoPosterior);
        const fingerprintsValidos = [
            provasHistorico.fingerprintEstadoAnterior,
            provasHistorico.fingerprintEstadoPosterior,
            provasHistorico.fingerprintLocacaoAnterior,
            provasHistorico.fingerprintLocacaoPosterior
        ].every(fingerprintRecuperacaoValido);
        if (provasHistorico.versao !== 1 || !fingerprintsValidos
            || revisaoAnterior === null || revisaoPosterior === null
            || revisaoPosterior !== revisaoAnterior + 1
            || revisaoPosterior !== revisao
            || provasHistorico.operacaoId !== entrada.operacaoId
            || provasHistorico.assinaturaPlano !== entrada.assinaturaPlano) {
            return { valido: false, codigo: 'PROVAS_RECUPERACAO_INVALIDAS', provas: null };
        }
        return { valido: true, codigo: 'SUCESSO', provas: clonarRetorno(provasHistorico) };
    }

    function avaliarEvidencias(estado, entrada, dependencias) {
        const localizacao = localizarLocacaoUnica(estado?.locacoes, entrada.locacaoId);
        if (localizacao.quantidade !== 1) {
            return {
                valido: false,
                estado: 'inconsistente',
                codigo: localizacao.quantidade === 0 ? 'LOCACAO_NAO_ENCONTRADA' : 'LOCACAO_ID_DUPLICADO',
                revisao: null,
                evidencias: { controle: 0, movimentacoes: 0, historicos: 0, auditorias: 0 }
            };
        }
        const controle = dependencias.normalizarControleEdicaoLocacao(localizacao.locacao);
        if (!controle?.valido || inteiroSeguro(controle.revisao) === null) {
            return {
                valido: false,
                estado: 'inconsistente',
                codigo: 'CONTROLE_EDICAO_INVALIDO',
                revisao: null,
                evidencias: { controle: 0, movimentacoes: 0, historicos: 0, auditorias: 0 }
            };
        }

        const todosHistoricos = historicosGlobais(estado.locacoes);
        const movimentosOperacao = (Array.isArray(estado.movimentacoesEstoque)
            ? estado.movimentacoesEstoque : []).filter((registro) => registro?.operacaoId === entrada.operacaoId);
        const historicosOperacao = todosHistoricos.filter((registro) => registro?.operacaoId === entrada.operacaoId);
        const historicoCoerente = historicosOperacao.filter((registro) => (
            referenciaEstrita(registro?.locacaoId) === referenciaEstrita(entrada.locacaoId)
            && registro?.assinaturaPlano === entrada.assinaturaPlano
        ));
        const movimentosCoerentes = movimentosOperacao.filter((registro) => (
            referenciaEstrita(registro?.locacaoId) === referenciaEstrita(entrada.locacaoId)
            && registro?.assinaturaPlano === entrada.assinaturaPlano
        ));
        const historicoReferencia = historicoCoerente.length === 1 ? historicoCoerente[0] : null;
        const reservarHistorico = inteiroSeguro(historicoReferencia?.resumoMovimentacoes?.reservar);
        const liberarHistorico = inteiroSeguro(historicoReferencia?.resumoMovimentacoes?.liberar);
        const quantidadeEsperada = reservarHistorico !== null && liberarHistorico !== null
            ? reservarHistorico + liberarHistorico
            : movimentosCoerentes.length;
        const planoEvidencias = {
            ajustes: {
                reservar: Array.from({ length: reservarHistorico ?? quantidadeEsperada }, () => ({})),
                liberar: Array.from({ length: liberarHistorico ?? 0 }, () => ({}))
            }
        };
        const dominio = dependencias.verificarEstadoOperacaoLocacao({
            locacao: localizacao.locacao,
            operacaoId: entrada.operacaoId,
            assinaturaPlano: entrada.assinaturaPlano,
            plano: planoEvidencias,
            movimentacoes: Array.isArray(estado.movimentacoesEstoque) ? estado.movimentacoesEstoque : [],
            historicoOperacional: todosHistoricos
        });
        const auditorias = (Array.isArray(estado.logsAuditoria) ? estado.logsAuditoria : [])
            .filter((registro) => registro?.operacaoId === entrada.operacaoId);
        const auditoriasCoerentes = auditorias.filter((registro) => (
            referenciaEstrita(registro?.locacaoId) === referenciaEstrita(entrada.locacaoId)
            && registro?.assinaturaPlano === entrada.assinaturaPlano
        ));
        const evidencias = {
            controle: dominio?.evidencias?.controle || 0,
            movimentacoes: movimentosOperacao.length,
            historicos: historicosOperacao.length,
            auditorias: auditorias.length
        };
        if (movimentosCoerentes.length !== movimentosOperacao.length
            || historicoCoerente.length !== historicosOperacao.length
            || auditoriasCoerentes.length !== auditorias.length) {
            return {
                valido: false,
                estado: 'inconsistente',
                codigo: 'EVIDENCIA_ASSOCIADA_A_OUTRA_LOCACAO_OU_ASSINATURA',
                revisao: controle.revisao,
                evidencias
            };
        }
        if (dominio?.estado === 'concluida' && auditoriasCoerentes.length === 1) {
            const provas = validarProvasRecuperacao(
                historicoReferencia?.[CAMPO_PROVAS_RECUPERACAO],
                auditoriasCoerentes[0]?.[CAMPO_PROVAS_RECUPERACAO],
                entrada,
                controle.revisao
            );
            if (!provas.valido) {
                return {
                    valido: false,
                    estado: 'inconsistente',
                    codigo: provas.codigo,
                    revisao: controle.revisao,
                    evidencias,
                    locacao: localizacao.locacao,
                    provas: null
                };
            }
            return {
                valido: true,
                estado: 'concluida',
                codigo: 'OPERACAO_CONCLUIDA',
                revisao: controle.revisao,
                evidencias,
                locacao: localizacao.locacao,
                provas: provas.provas
            };
        }
        if (dominio?.estado === 'nao_executada' && auditoriasCoerentes.length === 0) {
            return {
                valido: true,
                estado: 'nao_executada',
                codigo: 'OPERACAO_NAO_EXECUTADA',
                revisao: controle.revisao,
                evidencias,
                locacao: localizacao.locacao,
                provas: null
            };
        }
        const inconsistente = dominio?.estado === 'inconsistente'
            || movimentosOperacao.length > quantidadeEsperada
            || historicosOperacao.length > 1
            || auditorias.length > 1;
        return {
            valido: false,
            estado: inconsistente ? 'inconsistente' : 'parcial',
            codigo: inconsistente ? (dominio?.codigo || 'OPERACAO_INCONSISTENTE') : 'OPERACAO_PARCIAL',
            revisao: controle.revisao,
            evidencias,
            locacao: localizacao.locacao,
            provas: null
        };
    }

    function validarEstadoMemoria(estado, dependencias) {
        const clonagem = resultadoClonagem(dependencias.clonarJsonPersistivelEstrito, estado);
        if (!clonagem.ok) return { valido: false, codigo: clonagem.codigo };
        const candidato = {
            ...clonagem.valor,
            versao: 'memoria',
            data: 'memoria',
            ultimaEdicao: 'memoria'
        };
        return dependencias.validarEstruturaSnapshotPersistivelCompleto(candidato);
    }

    function validarDependenciasDiagnostico(dependencias) {
        const funcoes = [
            'obterEstadoMemoriaAtual',
            'lerSnapshotLocalConfirmavel',
            'validarEstruturaSnapshotPersistivelCompleto',
            'clonarJsonPersistivelEstrito',
            'validarOperacaoIdLocacao',
            'normalizarControleEdicaoLocacao',
            'verificarEstadoOperacaoLocacao',
            'obterMetadadoSincronizacaoAtual'
        ];
        const ausentes = funcoes.filter((nome) => typeof dependencias?.[nome] !== 'function');
        if (!dependencias?.armazenamento) ausentes.push('armazenamento');
        return ausentes;
    }

    function validarEntrada(entrada, dependencias) {
        const operacao = dependencias.validarOperacaoIdLocacao(entrada?.operacaoId);
        if (!referenciaEstrita(entrada?.locacaoId) || !operacao?.valido
            || !assinaturaValida(entrada?.assinaturaPlano)
            || !chaveValida(entrada?.chaveArmazenamento)) {
            return { valido: false, codigo: 'ENTRADA_RECUPERACAO_INVALIDA' };
        }
        return { valido: true, operacaoId: operacao.operacaoId };
    }

    function montarDiagnosticoId(dados) {
        const json = JSON.stringify(canonicalizar(dados));
        return `recuperacao-ajuste-v1:fnv1a64:${fingerprintFnv1a64(json)}`;
    }

    // A célula da referência raiz permanece privada; a porta pública só permite leitura.
    function criarPortaEstadoConfirmadoAtomica(estadoInicial) {
        if (!estadoInicial || typeof estadoInicial !== 'object') return null;
        const contexto = { estado: estadoInicial, publicacoesConfirmadas: 0, publicador: null };
        const publicador = (estadoAnterior, estadoConfirmado) => {
            if (contexto.estado !== estadoAnterior) {
                return { ok: false, codigo: 'REFERENCIA_RAIZ_DIVERGENTE' };
            }
            contexto.estado = estadoConfirmado;
            contexto.publicacoesConfirmadas += 1;
            return { ok: true, codigo: 'PUBLICACAO_ATOMICA_CONFIRMADA' };
        };
        const porta = Object.freeze({
            obterEstadoAtual: () => contexto.estado,
            obterQuantidadePublicacoesConfirmadas: () => contexto.publicacoesConfirmadas
        });
        contexto.publicador = publicador;
        publicadoresAtomicosAutorizados.add(publicador);
        contextoPublicadoresAtomicos.set(publicador, contexto);
        contextoPortasAtomicas.set(porta, contexto);
        return porta;
    }

    function obterContextoPortaAtomica(porta) {
        const contexto = porta && typeof porta === 'object'
            ? contextoPortasAtomicas.get(porta)
            : null;
        if (!contexto || !publicadoresAtomicosAutorizados.has(contexto.publicador)
            || contextoPublicadoresAtomicos.get(contexto.publicador) !== contexto) return null;
        return contexto;
    }

    function obterTravasArmazenamento(armazenamento) {
        if (!armazenamento || (typeof armazenamento !== 'object'
            && typeof armazenamento !== 'function')) return null;
        let travas = travasRecuperacaoPorArmazenamento.get(armazenamento);
        if (!travas) {
            travas = new Set();
            travasRecuperacaoPorArmazenamento.set(armazenamento, travas);
        }
        return travas;
    }

    function chaveTravaRecuperacao(entrada) {
        return [
            referenciaEstrita(entrada?.locacaoId),
            typeof entrada?.operacaoId === 'string' ? entrada.operacaoId : '',
            typeof entrada?.acao === 'string' ? entrada.acao : ''
        ].join('|');
    }

    function diagnosticarInterno(entrada = {}, dependencias = {}) {
        const ausentes = validarDependenciasDiagnostico(dependencias);
        if (ausentes.length) {
            return { publico: resultadoBase('DEPENDENCIAS_RECUPERACAO_INVALIDAS', {
                bloqueios: [{ codigo: 'DEPENDENCIAS_AUSENTES', campos: ausentes }]
            }) };
        }
        const validacaoEntrada = validarEntrada(entrada, dependencias);
        if (!validacaoEntrada.valido) return { publico: resultadoBase(validacaoEntrada.codigo) };
        const entradaNormalizada = {
            locacaoId: entrada.locacaoId,
            operacaoId: validacaoEntrada.operacaoId,
            assinaturaPlano: entrada.assinaturaPlano,
            chaveArmazenamento: entrada.chaveArmazenamento
        };

        let estadoMemoria;
        try {
            estadoMemoria = dependencias.obterEstadoMemoriaAtual();
        } catch (_erro) {
            return { publico: resultadoBase('FALHA_LEITURA_ESTADO_MEMORIA') };
        }
        const memoriaValida = validarEstadoMemoria(estadoMemoria, dependencias);
        if (!memoriaValida?.valido) {
            return { publico: resultadoBase('ESTADO_MEMORIA_INVALIDO', {
                bloqueios: [{ codigo: memoriaValida?.codigo || 'ESTADO_MEMORIA_INVALIDO' }]
            }) };
        }
        const leitura = dependencias.lerSnapshotLocalConfirmavel({
            armazenamento: dependencias.armazenamento,
            chave: entradaNormalizada.chaveArmazenamento
        });
        if (!leitura?.ok) {
            return { publico: resultadoBase(leitura?.codigo || 'SNAPSHOT_PERSISTIDO_INVALIDO', {
                estado: 'snapshot_invalido',
                bloqueios: [{ codigo: leitura?.codigo || 'SNAPSHOT_PERSISTIDO_INVALIDO' }]
            }) };
        }

        const fingerprintMemoria = prepararEstadoParaFingerprint(
            estadoMemoria,
            dependencias.clonarJsonPersistivelEstrito,
            entradaNormalizada
        );
        const fingerprintPersistido = prepararEstadoParaFingerprint(
            leitura.snapshot,
            dependencias.clonarJsonPersistivelEstrito,
            entradaNormalizada
        );
        const memoria = avaliarEvidencias(estadoMemoria, entradaNormalizada, dependencias);
        const persistido = avaliarEvidencias(leitura.snapshot, entradaNormalizada, dependencias);
        const fingerprintLocacaoMemoria = memoria.locacao
            ? prepararValorParaFingerprint(
                memoria.locacao,
                dependencias.clonarJsonPersistivelEstrito,
                false,
                entradaNormalizada
            )
            : { ok: false };
        const fingerprintLocacaoPersistida = persistido.locacao
            ? prepararValorParaFingerprint(
                persistido.locacao,
                dependencias.clonarJsonPersistivelEstrito,
                false,
                entradaNormalizada
            )
            : { ok: false };
        if (!fingerprintMemoria.ok || !fingerprintPersistido.ok) {
            return { publico: resultadoBase('FALHA_FINGERPRINT_RECUPERACAO') };
        }
        let marcadorSync;
        try {
            marcadorSync = dependencias.obterMetadadoSincronizacaoAtual();
        } catch (_erro) {
            marcadorSync = null;
        }
        const marcadorEsperado = leitura.snapshot.ultimaEdicao;
        const syncPendente = String(marcadorSync ?? '') !== String(marcadorEsperado ?? '');
        const mesmaRevisao = memoria.revisao !== null && memoria.revisao === persistido.revisao;
        const mesmoEstado = fingerprintMemoria.fingerprint === fingerprintPersistido.fingerprint;
        const provasPersistidas = persistido.provas;
        const provasMemoria = memoria.provas;
        const provasCoerentesEntreEstados = !!provasPersistidas && !!provasMemoria
            && JSON.stringify(canonicalizar(provasPersistidas))
                === JSON.stringify(canonicalizar(provasMemoria));
        const persistidoComprovado = !!provasPersistidas
            && fingerprintLocacaoPersistida.ok
            && provasPersistidas.fingerprintEstadoPosterior === fingerprintPersistido.fingerprint
            && provasPersistidas.fingerprintLocacaoPosterior === fingerprintLocacaoPersistida.fingerprint;
        const memoriaCorrespondeAnterior = !!provasPersistidas
            && fingerprintLocacaoMemoria.ok
            && provasPersistidas.fingerprintEstadoAnterior === fingerprintMemoria.fingerprint
            && provasPersistidas.fingerprintLocacaoAnterior === fingerprintLocacaoMemoria.fingerprint
            && provasPersistidas.revisaoAnterior === memoria.revisao;
        const memoriaCorrespondePosterior = !!provasPersistidas
            && fingerprintLocacaoMemoria.ok
            && provasPersistidas.fingerprintEstadoPosterior === fingerprintMemoria.fingerprint
            && provasPersistidas.fingerprintLocacaoPosterior === fingerprintLocacaoMemoria.fingerprint;
        const diferencasAtribuiveis = persistidoComprovado && memoriaCorrespondeAnterior;

        let codigo = 'RECUPERACAO_INCONSISTENTE_BLOQUEADA';
        let estado = 'inconsistente';
        let acaoPermitida = '';
        let automatica = false;
        let requerIntervencao = true;

        if (persistido.codigo === 'PROVAS_RECUPERACAO_AUSENTES'
            || memoria.codigo === 'PROVAS_RECUPERACAO_AUSENTES') {
            codigo = 'PROVAS_RECUPERACAO_AUSENTES';
            estado = 'inconsistente';
        } else if (persistido.codigo === 'PROVAS_RECUPERACAO_DIVERGENTES'
            || persistido.codigo === 'PROVAS_RECUPERACAO_INVALIDAS'
            || memoria.codigo === 'PROVAS_RECUPERACAO_DIVERGENTES'
            || memoria.codigo === 'PROVAS_RECUPERACAO_INVALIDAS') {
            codigo = persistido.codigo.startsWith('PROVAS_') ? persistido.codigo : memoria.codigo;
            estado = 'inconsistente';
        } else if (persistido.estado === 'parcial' || memoria.estado === 'parcial') {
            codigo = 'RECUPERACAO_PARCIAL_BLOQUEADA';
            estado = 'parcial';
        } else if (persistido.estado === 'inconsistente' || memoria.estado === 'inconsistente') {
            codigo = 'RECUPERACAO_INCONSISTENTE_BLOQUEADA';
        } else if (persistido.estado === 'nao_executada' && memoria.estado === 'nao_executada') {
            codigo = 'RECUPERACAO_OPERACAO_NAO_EXECUTADA';
            estado = 'nao_executada';
        } else if (persistido.estado === 'concluida' && memoria.estado === 'nao_executada') {
            if (!persistidoComprovado) {
                codigo = 'FINGERPRINT_POSTERIOR_DIVERGENTE';
            } else if (!memoriaCorrespondeAnterior) {
                codigo = 'MEMORIA_DIVERGIU_DO_ESTADO_ANTERIOR';
            } else if (persistido.revisao === memoria.revisao + 1) {
                codigo = 'RECUPERACAO_MEMORIA_DESATUALIZADA';
                estado = 'persistida_nao_publicada';
                acaoPermitida = 'recarregar_memoria';
                automatica = true;
                requerIntervencao = false;
            } else {
                codigo = persistido.revisao <= memoria.revisao
                    ? 'SNAPSHOT_PERSISTIDO_MAIS_ANTIGO'
                    : 'ESTADOS_DIVERGENTES_NAO_ORDENAVEIS';
            }
        } else if (persistido.estado === 'nao_executada' && memoria.estado === 'concluida') {
            codigo = 'SNAPSHOT_PERSISTIDO_MAIS_ANTIGO';
            estado = 'snapshot_mais_antigo';
        } else if (persistido.estado === 'concluida' && memoria.estado === 'concluida') {
            if (!provasCoerentesEntreEstados) {
                codigo = 'PROVAS_RECUPERACAO_DIVERGENTES';
            } else if (!persistidoComprovado || !memoriaCorrespondePosterior) {
                codigo = 'FINGERPRINT_POSTERIOR_DIVERGENTE';
            } else if (!mesmaRevisao || !mesmoEstado) {
                codigo = persistido.revisao < memoria.revisao
                    ? 'SNAPSHOT_PERSISTIDO_MAIS_ANTIGO'
                    : 'ESTADOS_DIVERGENTES_NAO_ORDENAVEIS';
            } else if (syncPendente) {
                codigo = 'RECUPERACAO_SYNC_PENDENTE';
                estado = 'sync_pendente';
                acaoPermitida = 'reparar_sync';
                automatica = true;
                requerIntervencao = false;
            } else {
                codigo = 'RECUPERACAO_OPERACAO_CONCLUIDA';
                estado = 'concluida';
                requerIntervencao = false;
            }
        }

        const comparacao = {
            snapshotValido: true,
            mesmaOperacao: persistido.estado === 'concluida' || memoria.estado === 'concluida',
            mesmaAssinatura: !['inconsistente'].includes(persistido.estado)
                && !['inconsistente'].includes(memoria.estado),
            mesmaRevisao,
            estadoEquivalente: mesmoEstado,
            diferencasAtribuiveis,
            memoriaCorrespondeAnterior,
            memoriaCorrespondePosterior,
            persistidoComprovado,
            provasCoerentesEntreEstados,
            marcadorSyncPendente: syncPendente
        };
        const operacao = {
            locacaoId: entradaNormalizada.locacaoId,
            operacaoId: entradaNormalizada.operacaoId,
            revisaoMemoria: memoria.revisao,
            revisaoPersistida: persistido.revisao
        };
        const evidencias = {
            memoria: memoria.evidencias,
            persistido: persistido.evidencias
        };
        const diagnosticoId = montarDiagnosticoId({
            locacaoId: entradaNormalizada.locacaoId,
            operacaoId: entradaNormalizada.operacaoId,
            assinaturaPlano: entradaNormalizada.assinaturaPlano,
            revisaoMemoria: memoria.revisao,
            revisaoPersistida: persistido.revisao,
            fingerprintMemoria: fingerprintMemoria.fingerprint,
            fingerprintPersistido: fingerprintPersistido.fingerprint,
            provasMemoria: provasMemoria || null,
            provasPersistidas: provasPersistidas || null,
            marcadorSync: marcadorSync ?? null,
            marcadorEsperado: marcadorEsperado ?? null,
            estado,
            acaoPermitida
        });
        return {
            publico: resultadoBase(codigo, {
                ok: estado === 'concluida',
                estado,
                recuperacaoAutomaticaPermitida: automatica,
                requerIntervencao,
                operacao,
                evidencias,
                comparacao,
                acoesPermitidas: acaoPermitida ? [acaoPermitida] : [],
                diagnosticoId
            }),
            privado: {
                entrada: entradaNormalizada,
                snapshotPersistido: leitura.snapshot,
                acaoPermitida,
                marcadorEsperado
            }
        };
    }

    function diagnosticarRecuperacaoAjusteLocacao(entrada = {}, dependencias = {}) {
        return diagnosticarInterno(entrada, dependencias).publico;
    }

    function publicarSnapshotConfirmadoAtomico(snapshotPersistido, entrada, dependencias, contexto) {
        let estadoAnterior;
        try {
            estadoAnterior = dependencias.obterEstadoMemoriaAtual();
        } catch (_erro) {
            return { ok: false, codigo: 'FALHA_LEITURA_ESTADO_MEMORIA', publicacaoRealizada: false };
        }
        if (contexto.estado !== estadoAnterior
            || !publicadoresAtomicosAutorizados.has(contexto.publicador)
            || contextoPublicadoresAtomicos.get(contexto.publicador) !== contexto) {
            return { ok: false, codigo: 'REFERENCIA_RAIZ_DIVERGENTE', publicacaoRealizada: false };
        }

        let estadoConfirmado;
        try {
            const snapshotReferencia = clonarJsonInterno(snapshotPersistido);
            if (!snapshotReferencia.ok) {
                return {
                    ok: false,
                    codigo: snapshotReferencia.codigo,
                    publicacaoRealizada: false
                };
            }
            const fingerprintEsperado = prepararEstadoParaFingerprint(
                snapshotReferencia.valor,
                clonarJsonInterno,
                entrada
            );
            const clonagem = resultadoClonagem(
                dependencias.clonarJsonPersistivelEstrito,
                snapshotReferencia.valor
            );
            if (!clonagem.ok) {
                return {
                    ok: false,
                    codigo: clonagem.codigo || 'FALHA_CLONAGEM_SNAPSHOT',
                    publicacaoRealizada: false
                };
            }
            const candidatoDestacado = clonarJsonInterno(clonagem.valor);
            if (!candidatoDestacado.ok) {
                return {
                    ok: false,
                    codigo: candidatoDestacado.codigo,
                    publicacaoRealizada: false
                };
            }
            estadoConfirmado = candidatoDestacado.valor;
            const fingerprintConfirmado = prepararEstadoParaFingerprint(
                estadoConfirmado,
                clonarJsonInterno,
                entrada
            );
            if (!fingerprintEsperado.ok || !fingerprintConfirmado.ok
                || fingerprintConfirmado.fingerprint !== fingerprintEsperado.fingerprint) {
                return {
                    ok: false,
                    codigo: 'PREPARACAO_PUBLICACAO_DIVERGENTE',
                    publicacaoRealizada: false
                };
            }
        } catch (_erro) {
            return { ok: false, codigo: 'FALHA_PREPARACAO_PUBLICACAO', publicacaoRealizada: false };
        }

        const publicacoesAntes = contexto.publicacoesConfirmadas;
        let erroPublicacao = false;
        try {
            contexto.publicador(estadoAnterior, estadoConfirmado);
        } catch (_erro) {
            erroPublicacao = true;
        }

        // Depois da troca, somente a célula privada é consultada: nenhuma dependência externa é chamada.
        const publicacaoRealizada = contexto.estado === estadoConfirmado;
        const contadorCoerente = contexto.publicacoesConfirmadas === publicacoesAntes + 1;
        if (publicacaoRealizada && contadorCoerente) {
            return {
                ok: true,
                codigo: erroPublicacao
                    ? 'PUBLICACAO_ATOMICA_CONFIRMADA_APOS_EXCECAO'
                    : 'PUBLICACAO_ATOMICA_CONFIRMADA',
                publicacaoRealizada: true
            };
        }
        return {
            ok: false,
            codigo: erroPublicacao ? 'PUBLICACAO_MEMORIA_FALHOU' : 'PUBLICACAO_ATOMICA_VIOLADA',
            publicacaoRealizada
        };
    }

    function executarRecuperacaoAjusteLocacao(entrada = {}, dependencias = {}) {
        if (!['recarregar_memoria', 'reparar_sync'].includes(entrada?.acao)
            || typeof entrada?.diagnosticoId !== 'string' || !entrada.diagnosticoId) {
            return resultadoBase('ACAO_RECUPERACAO_INVALIDA');
        }
        const contextoPorta = entrada.acao === 'recarregar_memoria'
            ? obterContextoPortaAtomica(dependencias.portaEstadoConfirmadoAtomica)
            : null;
        if (entrada.acao === 'recarregar_memoria' && !contextoPorta) {
            return resultadoBase('PUBLICADOR_ATOMICO_OBRIGATORIO');
        }
        const travas = obterTravasArmazenamento(dependencias.armazenamento);
        const chaveTrava = chaveTravaRecuperacao(entrada);
        if (!travas || !chaveTrava || travas.has(chaveTrava)) {
            return resultadoBase('RECUPERACAO_EM_EXECUCAO');
        }
        travas.add(chaveTrava);
        try {
            const primeira = diagnosticarInterno(entrada, dependencias);
            if (!primeira.privado || primeira.publico.diagnosticoId !== entrada.diagnosticoId
                || !primeira.publico.acoesPermitidas.includes(entrada.acao)) {
                return resultadoBase('DIAGNOSTICO_RECUPERACAO_OBSOLETO', {
                    estado: 'bloqueado',
                    bloqueios: [{ codigo: primeira.publico.codigo }]
                });
            }
            const confirmacao = diagnosticarInterno(entrada, dependencias);
            if (!confirmacao.privado || confirmacao.publico.diagnosticoId !== entrada.diagnosticoId
                || !confirmacao.publico.acoesPermitidas.includes(entrada.acao)) {
                return resultadoBase('DIAGNOSTICO_RECUPERACAO_OBSOLETO');
            }

            if (entrada.acao === 'recarregar_memoria') {
                const publicacao = publicarSnapshotConfirmadoAtomico(
                    confirmacao.privado.snapshotPersistido,
                    confirmacao.privado.entrada,
                    dependencias,
                    contextoPorta
                );
                if (!publicacao.ok) {
                    return resultadoBase(publicacao.codigo, {
                        estado: publicacao.publicacaoRealizada
                            ? 'persistida_memoria_publicada_inconsistente'
                            : 'persistida_nao_publicada',
                        publicacaoRealizada: publicacao.publicacaoRealizada
                    });
                }
                return resultadoBase('MEMORIA_RECARREGADA', {
                    ok: true,
                    estado: 'concluida',
                    requerIntervencao: false,
                    operacao: confirmacao.publico.operacao,
                    publicacaoRealizada: true,
                    publicarMemoria: true,
                    renderizar: true,
                    sincronizar: false
                });
            }

            if (typeof dependencias.atualizarMetadadoSincronizacao !== 'function') {
                return resultadoBase('DEPENDENCIA_ATUALIZACAO_SYNC_AUSENTE', { estado: 'sync_pendente' });
            }
            try {
                const atualizado = dependencias.atualizarMetadadoSincronizacao({
                    locacaoId: confirmacao.privado.entrada.locacaoId,
                    operacaoId: confirmacao.privado.entrada.operacaoId,
                    assinaturaPlano: confirmacao.privado.entrada.assinaturaPlano,
                    ultimaEdicao: confirmacao.privado.marcadorEsperado
                });
                if (atualizado === false) throw new Error('Atualização recusada.');
                const marcadorConfirmado = dependencias.obterMetadadoSincronizacaoAtual();
                if (String(marcadorConfirmado ?? '')
                    !== String(confirmacao.privado.marcadorEsperado ?? '')) {
                    throw new Error('Marcador não confirmado.');
                }
            } catch (_erro) {
                return resultadoBase('METADADO_SYNC_PENDENTE', { estado: 'sync_pendente' });
            }
            return resultadoBase('METADADO_SYNC_ATUALIZADO', {
                ok: true,
                estado: 'concluida',
                requerIntervencao: false,
                operacao: confirmacao.publico.operacao,
                atualizarSync: true,
                sincronizar: true
            });
        } finally {
            travas.delete(chaveTrava);
        }
    }

    window.criarPortaEstadoConfirmadoAtomica = criarPortaEstadoConfirmadoAtomica;
    window.diagnosticarRecuperacaoAjusteLocacao = diagnosticarRecuperacaoAjusteLocacao;
    window.executarRecuperacaoAjusteLocacao = executarRecuperacaoAjusteLocacao;
})();
