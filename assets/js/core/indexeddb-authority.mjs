// Fundacao inativa: importar este modulo nao abre banco nem altera o aplicativo.
const COLECOES = Object.freeze([
    'locadores', 'pecas', 'locacoes', 'propostas', 'devolucoes', 'contasReceber',
    'fornecedores', 'contasPagar', 'categoriasFinanceiras', 'centrosCusto',
    'conciliacoesFinanceiras', 'conciliacoesPagamentosPagar', 'movimentacoesEstoque',
    'transportes', 'tipos', 'usuarios', 'logsAuditoria', 'modelosChecklist',
    'checklistsGerados', 'checklistMontagem', 'checklistEtapasMontagem'
]);
const MAX_TEXTO = 10 * 1024 * 1024;
const contextosJournal = new WeakMap();

// Somente o replay da autoridade emite estas capacidades; nunca sao DTOs da UI.
export function consultarContextoJournal(contexto) {
    return contextosJournal.get(contexto) || null;
}

function congelar(valor) {
    if (valor && typeof valor === 'object') {
        Object.values(valor).forEach(congelar);
        Object.freeze(valor);
    }
    return valor;
}

function falha(codigo) {
    return Object.freeze({ ok: false, codigo, requerRecuperacao: codigo === 'OPERACAO_REQUER_RECUPERACAO' });
}

function inteiro(valor) {
    return Number.isSafeInteger(valor) && valor >= 0 && valor < Number.MAX_SAFE_INTEGER;
}

function texto(valor, max = 200) {
    return typeof valor === 'string' && valor.length > 0 && valor.length <= max && valor.trim() === valor;
}

// Somente valores provenientes de JSON.parse sao percorridos por este canonizador.
function canonicoInterno(valor, profundidade = 0) {
    if (profundidade > 100) throw new Error('PROFUNDIDADE_INVALIDA');
    if (typeof valor === 'number' && (!Number.isFinite(valor)
        || (Number.isInteger(valor) && !Number.isSafeInteger(valor)))) throw new Error('NUMERO_INVALIDO');
    if (Array.isArray(valor)) return valor.map(item => canonicoInterno(item, profundidade + 1));
    if (!valor || typeof valor !== 'object') return valor;
    const resultado = Object.create(null);
    Object.keys(valor).sort().forEach(chave => {
        Object.defineProperty(resultado, chave, {
            value: canonicoInterno(valor[chave], profundidade + 1), enumerable: true
        });
    });
    return resultado;
}

function decodificar(valor) {
    if (typeof valor !== 'string' || valor.length === 0 || valor.length > MAX_TEXTO) throw new Error('TEXTO_INVALIDO');
    const dados = JSON.parse(valor);
    return { dados, texto: JSON.stringify(canonicoInterno(dados)) };
}

export function validarEstruturaSnapshotIndexedDB(textoSnapshot) {
    try {
        const { dados: s } = decodificar(textoSnapshot);
        return !!s && typeof s === 'object' && !Array.isArray(s)
            && COLECOES.every(chave => Array.isArray(s[chave]))
            && (!Object.hasOwn(s, 'encargosFinanceiros') || Array.isArray(s.encargosFinanceiros))
            && !!s.config && typeof s.config === 'object' && !Array.isArray(s.config)
            && !!s.checklistConferencia && typeof s.checklistConferencia === 'object' && !Array.isArray(s.checklistConferencia)
            && texto(s.versao, 100) && texto(s.data, 100)
            && ((typeof s.ultimaEdicao === 'number' && inteiro(s.ultimaEdicao)) || texto(s.ultimaEdicao, 100));
    } catch (_erro) { return false; }
}

/**
 * Configuracao e redutores sao capacidades do bootstrap confiavel, nunca da UI.
 * validar/aplicar recebem texto JSON; devem ser sincronos, puros e versionados.
 * autorizar retorna uma referencia de ator estavel, ou null. Nao e autenticacao.
 */
export function criarAutoridadeIndexedDB(configuracao) {
    const { nomeBanco, validarSnapshot, comandos, autorizar } = configuracao;
    // Formato 2 e opt-in: nao atualiza bancos da fundacao nem bancos do aplicativo.
    let identidadeBaseTexto = null;
    if (Object.hasOwn(configuracao, 'identidadeBaseTexto')) {
        const identidade = decodificar(configuracao.identidadeBaseTexto);
        const b = identidade.dados;
        if (!b || Array.isArray(b) || Object.keys(b).sort().join('|') !== 'baseId|epocaAutoridade|protocolo'
            || !texto(b.baseId) || !texto(b.epocaAutoridade) || b.protocolo !== 1) {
            throw new TypeError('IDENTIDADE_BASE_INVALIDA');
        }
        identidadeBaseTexto = identidade.texto;
    }
    const FORMATO = identidadeBaseTexto ? 2 : 1;
    const LOJAS = identidadeBaseTexto
        ? ['raiz', 'historico', 'auditoria', 'recibos', 'controle']
        : ['raiz', 'historico', 'auditoria', 'recibos'];
    const CHAVES = { raiz: 'chave', historico: 'revisao', auditoria: 'revisao', recibos: 'operacaoId', controle: 'chave' };
    if (!texto(nomeBanco) || !nomeBanco.startsWith('mtz-idb-fundacao-')
        || typeof validarSnapshot !== 'function' || typeof autorizar !== 'function'
        || !comandos || typeof comandos !== 'object') throw new TypeError('CONFIGURACAO_CONFIAVEL_OBRIGATORIA');
    const definicoes = new Map();
    Object.entries(comandos).forEach(([tipo, definicao]) => {
        if (!texto(tipo) || tipo.startsWith('@') || typeof definicao.validar !== 'function'
            || typeof definicao.aplicar !== 'function'
            || (Object.hasOwn(definicao, 'reconhecerHistorico') && typeof definicao.reconhecerHistorico !== 'function')) {
            throw new TypeError('COMANDO_INVALIDO');
        }
        definicoes.set(tipo, Object.freeze({ validar: definicao.validar, aplicar: definicao.aplicar,
            reconhecerHistorico: definicao.reconhecerHistorico || null,
            dominio: texto(definicao.dominio) ? definicao.dominio : tipo.split('.')[0] }));
    });
    let provedor;
    try { provedor = Object.hasOwn(configuracao, 'indexedDB') ? configuracao.indexedDB : globalThis.indexedDB; }
    catch (_erro) { provedor = null; }
    const entradas = new WeakMap();

    function snapshotValido(valor, contexto = null) {
        try {
            const decodificado = decodificar(valor);
            return validarEstruturaSnapshotIndexedDB(decodificado.texto)
                && validarSnapshot(decodificado.texto, contexto) === true ? decodificado.texto : null;
        } catch (_erro) { return null; }
    }

    function identidade(tipo, dadosTexto) {
        const ator = autorizar(tipo, dadosTexto);
        return texto(ator) ? ator : null;
    }

    function emitir(operacaoId, tipo, revisaoEsperada, dadosTexto) {
        if (!texto(operacaoId) || typeof tipo !== 'string'
            || (tipo !== '@inicializar' && !inteiro(revisaoEsperada))) return falha('ENTRADA_INVALIDA');
        try {
            const dados = decodificar(dadosTexto);
            const definicao = definicoes.get(tipo);
            if (tipo === '@inicializar' ? !snapshotValido(dados.texto)
                : !definicao || definicao.validar(dados.texto) !== true) return falha('COMANDO_INVALIDO');
            const atorReferencia = identidade(tipo, dados.texto);
            if (!atorReferencia) return falha('PERMISSAO_NEGADA');
            const plano = { operacaoId, tipo, revisaoEsperada, dadosTexto: dados.texto, atorReferencia };
            if (identidadeBaseTexto) plano.identidadeBaseTexto = identidadeBaseTexto;
            const assinaturaComando = JSON.stringify(canonicoInterno(plano));
            const entrada = Object.freeze({ operacaoId, tipo, revisaoEsperada });
            entradas.set(entrada, Object.freeze({ ...plano, assinaturaComando }));
            return Object.freeze({ ok: true, entrada });
        } catch (_erro) { return falha('ENTRADA_INVALIDA'); }
    }

    function abrir() {
        return new Promise(resolve => {
            try {
                if (!provedor || typeof provedor.open !== 'function') return resolve(falha('INDEXEDDB_INDISPONIVEL'));
            } catch (_erro) { resolve(falha('INDEXEDDB_INDISPONIVEL')); return; }
            let encerrada = false;
            let timeout;
            const concluir = valor => { if (!encerrada) { encerrada = true; clearTimeout(timeout); resolve(valor); } };
            timeout = setTimeout(() => concluir(falha('ABERTURA_INDETERMINADA')), 10000);
            try {
                const pedido = provedor.open(nomeBanco, FORMATO);
                pedido.onblocked = () => concluir(falha('ABERTURA_BLOQUEADA'));
                pedido.onerror = () => concluir(falha(pedido.error?.name === 'VersionError' ? 'BANCO_INCOMPATIVEL' : 'FALHA_ABERTURA'));
                pedido.onupgradeneeded = evento => {
                    if (encerrada || evento.oldVersion !== 0) { pedido.transaction.abort(); return; }
                    const db = pedido.result;
                    db.createObjectStore('raiz', { keyPath: 'chave' });
                    db.createObjectStore('historico', { keyPath: 'revisao' });
                    db.createObjectStore('auditoria', { keyPath: 'revisao' });
                    db.createObjectStore('recibos', { keyPath: 'operacaoId' });
                    if (identidadeBaseTexto) db.createObjectStore('controle', { keyPath: 'chave' });
                };
                pedido.onsuccess = () => {
                    const db = pedido.result;
                    db.onversionchange = () => db.close();
                    if (encerrada) { db.close(); return; }
                    if (db.version !== FORMATO || db.objectStoreNames.length !== LOJAS.length
                        || !LOJAS.every(loja => db.objectStoreNames.contains(loja))) {
                        db.close(); concluir(falha('BANCO_INCOMPATIVEL')); return;
                    }
                    let esquemaValido = false;
                    try {
                        const esquema = db.transaction(LOJAS, 'readonly');
                        esquemaValido = LOJAS.every(loja => {
                            const store = esquema.objectStore(loja);
                            return store.keyPath === CHAVES[loja] && !store.autoIncrement && !store.indexNames.length;
                        });
                    } catch (_erro) { /* esquema inacessivel nao pode ser considerado valido */ }
                    if (!esquemaValido) {
                        db.close(); concluir(falha('BANCO_INCOMPATIVEL')); return;
                    }
                    concluir({ ok: true, db });
                };
            } catch (_erro) { concluir(falha('FALHA_ABERTURA')); }
        });
    }

    function auditoriaDe(evento) {
        const { snapshotTexto: _snapshot, revisaoAnterior: _anterior, ...auditoria } = evento;
        return auditoria;
    }

    function reciboDe(evento) {
        const { revisaoAnterior: _anterior, snapshotTexto: _snapshot, ...recibo } = evento;
        return recibo;
    }

    function igualdade(a, b) {
        return JSON.stringify(canonicoInterno(a)) === JSON.stringify(canonicoInterno(b));
    }

    function reconstruir(plano, anterior, timestamp, prefixo = []) {
        if (plano.tipo === '@inicializar') return snapshotValido(plano.dadosTexto);
        const definicao = definicoes.get(plano.tipo);
        if (!definicao || definicao.validar(plano.dadosTexto) !== true) return null;
        const dados = { identidadeBaseTexto, tipo: plano.tipo, dominio: definicao.dominio,
            operacaoId: plano.operacaoId, atorReferencia: plano.atorReferencia, timestamp,
            assinaturaComando: plano.assinaturaComando, dadosTexto: plano.dadosTexto,
            revisaoAnterior: prefixo.length - 1, revisao: prefixo.length, snapshotAnteriorTexto: anterior,
            eventosAnteriores: prefixo.map(e => ({ revisao: e.revisao, tipo: e.tipo,
                operacaoId: e.operacaoId, assinaturaComando: e.assinaturaComando,
                snapshotTexto: e.snapshotTexto })) };
        const emitirContexto = extra => {
            const capacidade = Object.freeze({});
            contextosJournal.set(capacidade, congelar({ ...dados, ...extra }));
            return capacidade;
        };
        const candidato = decodificar(definicao.aplicar(anterior, plano.dadosTexto, Object.freeze({
            operacaoId: plano.operacaoId, atorReferencia: plano.atorReferencia, timestamp
        }), emitirContexto({ fase: 'aplicar' }))).texto;
        return snapshotValido(candidato, emitirContexto({ fase: 'validar', snapshotPosteriorTexto: candidato }));
    }

    // Reexecutar a cadeia detecta adulteracao convergente do snapshot e suas copias.
    // Isto nao substitui autenticacao/assinatura externa contra um administrador local.
    function validarCadeia(base) {
        const { raiz, historico, auditoria, recibos } = base;
        if (!raiz) return !historico.length && !auditoria.length && !recibos.length;
        if (raiz.chave !== 'atual' || !inteiro(raiz.revisao)
            || historico.length !== raiz.revisao + 1
            || auditoria.length !== historico.length || recibos.length !== historico.length) return false;
        const ordenados = historico.slice().sort((a, b) => a.revisao - b.revisao);
        const auditoriasPorRevisao = new Map(auditoria.map(item => [item.revisao, item]));
        const recibosPorId = new Map(recibos.map(item => [item.operacaoId, item]));
        if (auditoriasPorRevisao.size !== auditoria.length || recibosPorId.size !== recibos.length) return false;
        const ids = new Set();
        let anterior = null;
        for (let revisao = 0; revisao < ordenados.length; revisao++) {
            const evento = ordenados[revisao];
            if (!igualdade(Object.keys(evento).sort(), ['assinaturaComando', 'atorReferencia', 'operacaoId',
                'revisao', 'revisaoAnterior', 'snapshotTexto', 'timestamp', 'tipo'])
                || evento.revisao !== revisao || evento.revisaoAnterior !== revisao - 1
                || !texto(evento.operacaoId) || ids.has(evento.operacaoId)
                || !texto(evento.atorReferencia) || !texto(evento.timestamp, 100)
                || new Date(evento.timestamp).toISOString() !== evento.timestamp) return false;
            ids.add(evento.operacaoId);
            const assinatura = decodificar(evento.assinaturaComando);
            const plano = assinatura.dados;
            if (assinatura.texto !== evento.assinaturaComando
                || !igualdade(Object.keys(plano).sort(), (identidadeBaseTexto
                    ? ['atorReferencia', 'dadosTexto', 'identidadeBaseTexto', 'operacaoId', 'revisaoEsperada', 'tipo']
                    : ['atorReferencia', 'dadosTexto', 'operacaoId', 'revisaoEsperada', 'tipo']))
                || (identidadeBaseTexto && plano.identidadeBaseTexto !== identidadeBaseTexto)
                || plano.operacaoId !== evento.operacaoId || plano.tipo !== evento.tipo
                || plano.atorReferencia !== evento.atorReferencia || plano.revisaoEsperada !== revisao - 1
                || ((revisao === 0) !== (plano.tipo === '@inicializar'))
                || decodificar(plano.dadosTexto).texto !== plano.dadosTexto) return false;
            const aud = auditoriasPorRevisao.get(revisao), rec = recibosPorId.get(evento.operacaoId);
            if (!aud || !rec || !igualdade(aud, auditoriaDe(evento)) || !igualdade(rec, reciboDe(evento))) return false;
            const esperado = reconstruir({ ...plano, assinaturaComando: evento.assinaturaComando }, anterior,
                evento.timestamp, ordenados.slice(0, revisao));
            if (!esperado || esperado !== evento.snapshotTexto) return false;
            anterior = esperado;
        }
        return raiz.snapshotTexto === anterior
            && igualdade(Object.keys(raiz).sort(), ['chave', 'revisao', 'snapshotTexto']);
    }

    function sucesso(base, recibo, codigo) {
        return congelar({ ok: true, codigo, revisaoAtual: base.raiz.revisao,
            snapshotTexto: base.raiz.snapshotTexto, recibo: recibo ? { ...recibo } : null });
    }

    function reconhecerHistorico(base, plano) {
        const reconhecer = definicoes.get(plano.tipo)?.reconhecerHistorico;
        if (!base.raiz || !reconhecer) return null;
        // A revisao solicitada nao faz parte da identidade da operacao historica.
        // O restante do comando, incluindo ator, tipos e epoca, deve corresponder.
        const { revisaoEsperada: _revisao, assinaturaComando: _assinatura, ...requisicao } = plano;
        const assinaturaRequisicao = JSON.stringify(canonicoInterno(requisicao));
        const contexto = Object.freeze({ operacaoId: plano.operacaoId, tipo: plano.tipo,
            atorReferencia: plano.atorReferencia, assinaturaRequisicao,
            identidadeBaseTexto, revisaoAtual: base.raiz.revisao,
            revisaoEsperada: plano.revisaoEsperada });
        // Apenas texto primitivo pode sair da capacidade confiavel. Objetos,
        // Proxies e Promises nunca sao inspecionados para tentar obter uma prova.
        const decisao = decodificar(reconhecer(base.raiz.snapshotTexto, plano.dadosTexto, contexto)).dados;
        if (!decisao || typeof decisao !== 'object' || Array.isArray(decisao)) throw new Error('PROVA_HISTORICA_INVALIDA');
        if (igualdade(Object.keys(decisao).sort(), ['estado'])) {
            if (decisao.estado === 'nao_encontrada') return null;
            if (decisao.estado === 'conflito') return falha('CONFLITO_OPERACAO_ID');
            if (decisao.estado === 'invalida') return falha('OPERACAO_REQUER_RECUPERACAO');
        }
        if (!igualdade(Object.keys(decisao).sort(), ['assinaturaHistorica', 'assinaturaRequisicao',
            'atorReferencia', 'estado', 'operacaoId', 'operacaoReferencia', 'snapshotTexto', 'tipo'])
            || decisao.estado !== 'comprovada' || decisao.operacaoId !== plano.operacaoId
            || decisao.tipo !== plano.tipo || decisao.atorReferencia !== plano.atorReferencia
            || decisao.assinaturaRequisicao !== assinaturaRequisicao
            || decisao.snapshotTexto !== base.raiz.snapshotTexto
            || !texto(decisao.assinaturaHistorica, 10000) || !texto(decisao.operacaoReferencia, 2000)) {
            throw new Error('PROVA_HISTORICA_INVALIDA');
        }
        const { snapshotTexto: _snapshot, ...comprovacao } = decisao;
        return congelar({ ...sucesso(base, null, 'OPERACAO_HISTORICA_RECONHECIDA'),
            historica: true, idempotente: true, gravado: false, publicado: false, comprovacao });
    }

    async function transacionar(entrada, modo) {
        // WeakMap.has nao inspeciona objetos arbitrarios, nem Proxies revogados.
        if (modo !== 'ler' && !entradas.has(entrada)) return falha('ENTRADA_NAO_CONFIAVEL');
        const plano = modo === 'ler' ? null : entradas.get(entrada);
        const autorizado = () => {
            try { return plano ? identidade(plano.tipo, plano.dadosTexto) === plano.atorReferencia : !!identidade('ler', '{}'); }
            catch (_erro) { return false; }
        };
        if (!autorizado()) return falha('PERMISSAO_NEGADA');
        const abertura = await abrir();
        if (!abertura.ok) return abertura;
        const db = abertura.db;
        return new Promise(resolve => {
            let tx;
            let resultado = null;
            let codigoFalha = 'FALHA_TRANSACAO';
            let escrita = false;
            const abortar = codigo => {
                codigoFalha = codigo;
                try { tx.abort(); } catch (_erro) { /* a transacao pode ja ter abortado */ }
            };
            try {
                tx = db.transaction(LOJAS, modo === 'executar' ? 'readwrite' : 'readonly',
                    modo === 'executar' ? { durability: 'strict' } : undefined);
                tx.onabort = () => { db.close(); resolve(falha(codigoFalha)); };
                tx.onerror = () => { if (codigoFalha === 'FALHA_TRANSACAO') codigoFalha = escrita ? 'FALHA_GRAVACAO_OU_COMMIT' : 'FALHA_LEITURA'; };
                // Nenhum onsuccess de request confirma o comando. So oncomplete o faz.
                tx.oncomplete = () => { db.close(); resolve(resultado || falha('FALHA_CONFIRMACAO')); };
                if (modo === 'executar' && tx.durability !== 'strict') {
                    abortar('DURABILIDADE_NAO_SUPORTADA'); return;
                }
                const base = {};
                let pendentes = LOJAS.length;
                function processar() {
                    try {
                        if (!autorizado()) return abortar('PERMISSAO_NEGADA');
                        if (!Array.isArray(base.raizes) || base.raizes.length > 1) return abortar('OPERACAO_REQUER_RECUPERACAO');
                        base.raiz = base.raizes[0];
                        if (identidadeBaseTexto) {
                            const esperado = { chave: 'base', identidadeBaseTexto };
                            if (base.raiz ? base.controle.length !== 1 || !igualdade(base.controle[0], esperado)
                                : base.controle.length !== 0) return abortar('OPERACAO_REQUER_RECUPERACAO');
                        }
                        if (!validarCadeia(base)) return abortar('OPERACAO_REQUER_RECUPERACAO');
                        if (modo === 'ler') {
                            resultado = base.raiz ? sucesso(base, null, 'ESTADO_CONFIRMADO') : falha('NAO_INICIALIZADO');
                            return;
                        }
                        const existente = base.recibos.find(item => item.operacaoId === plano.operacaoId);
                        if (existente) {
                            if (existente.assinaturaComando !== plano.assinaturaComando) return abortar('CONFLITO_OPERACAO_ID');
                            resultado = sucesso(base, existente, 'OPERACAO_JA_CONCLUIDA');
                            return;
                        }
                        if (base.raiz && definicoes.get(plano.tipo)?.reconhecerHistorico) {
                            if (plano.revisaoEsperada > base.raiz.revisao) return abortar('CONFLITO_REVISAO');
                            const historica = reconhecerHistorico(base, plano);
                            if (historica) {
                                if (!historica.ok) return abortar(historica.codigo);
                                if (!autorizado()) return abortar('PERMISSAO_NEGADA');
                                resultado = historica;
                                return;
                            }
                        }
                        if (modo === 'consultar') { resultado = falha('OPERACAO_NAO_ENCONTRADA'); return; }
                        if (plano.tipo === '@inicializar' && base.raiz) return abortar('JA_INICIALIZADO');
                        if (plano.tipo !== '@inicializar' && !base.raiz) return abortar('NAO_INICIALIZADO');
                        const revisao = base.raiz ? base.raiz.revisao : -1;
                        if (revisao !== plano.revisaoEsperada) return abortar('CONFLITO_REVISAO');
                        const timestamp = new Date().toISOString();
                        const candidato = reconstruir(plano, base.raiz?.snapshotTexto ?? null, timestamp,
                            base.historico.slice().sort((a, b) => a.revisao - b.revisao));
                        if (!candidato) return abortar('CANDIDATO_INVALIDO');
                        if (base.raiz && definicoes.get(plano.tipo)?.reconhecerHistorico
                            && candidato === base.raiz.snapshotTexto) return abortar('OPERACAO_REQUER_RECUPERACAO');
                        const evento = { revisao: revisao + 1, revisaoAnterior: revisao,
                            operacaoId: plano.operacaoId, tipo: plano.tipo, atorReferencia: plano.atorReferencia,
                            timestamp, assinaturaComando: plano.assinaturaComando, snapshotTexto: candidato };
                        const recibo = reciboDe(evento);
                        const novaBase = { raiz: { chave: 'atual', revisao: evento.revisao, snapshotTexto: candidato },
                            historico: [...base.historico, evento], auditoria: [...base.auditoria, auditoriaDe(evento)],
                            recibos: [...base.recibos, recibo] };
                        if (!validarCadeia(novaBase)) return abortar('CANDIDATO_INVALIDO');
                        if (!autorizado()) return abortar('PERMISSAO_NEGADA');
                        escrita = true;
                        if (identidadeBaseTexto && !base.raiz) {
                            tx.objectStore('controle').add({ chave: 'base', identidadeBaseTexto });
                        }
                        tx.objectStore('raiz').put(novaBase.raiz);
                        tx.objectStore('historico').add(evento);
                        tx.objectStore('auditoria').add(auditoriaDe(evento));
                        tx.objectStore('recibos').add(recibo);
                        resultado = sucesso(novaBase, recibo, 'COMMIT_CONFIRMADO');
                    } catch (_erro) { abortar(escrita ? 'FALHA_GRAVACAO_OU_COMMIT' : 'OPERACAO_REQUER_RECUPERACAO'); }
                }
                for (const loja of LOJAS) {
                    const pedido = tx.objectStore(loja).getAll();
                    pedido.onsuccess = () => { base[loja === 'raiz' ? 'raizes' : loja] = pedido.result; if (--pendentes === 0) processar(); };
                }
            } catch (_erro) {
                if (tx) abortar(codigoFalha);
                else { db.close(); resolve(falha('FALHA_TRANSACAO')); }
            }
        });
    }

    return Object.freeze({
        prepararInicializacao: (operacaoId, snapshotTexto) => emitir(operacaoId, '@inicializar', -1, snapshotTexto),
        prepararComando: (operacaoId, tipo, revisaoEsperada, dadosTexto) =>
            tipo === '@inicializar' ? falha('COMANDO_INVALIDO') : emitir(operacaoId, tipo, revisaoEsperada, dadosTexto),
        executar: entrada => transacionar(entrada, 'executar'),
        consultarResultado: entrada => transacionar(entrada, 'consultar'),
        ler: () => transacionar(null, 'ler')
    });
}
