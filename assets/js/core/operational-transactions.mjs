import { decodificarTextoEstrito, validarIdentidadeBaseTexto } from './legacy-state-codec.mjs';
import { consultarContextoJournal } from './indexeddb-authority.mjs';
import { comprovarConversoesJournalTexto } from './proposal-conversion-replay.mjs';
import { criarGatewayComandos } from './command-gateway.mjs';
import { criarNucleoConfiavel } from './operational-transport.generated.mjs';
import { COMANDOS_FINANCEIROS_ENSAIO, criarDescritoresFinanceirosDeEnsaio,
    validarFinanceiroComTransporteEnsaioTexto } from './financial-command-registry.mjs';
import { reconstruirLedgerDevolucoesTexto, provarRaizLedgerEstoqueTexto,
    planejarEventoLedgerEstoqueV2Texto, reconciliarLedgerEstoqueV2Texto } from './operational-stock-ledger.mjs';

const regras = criarNucleoConfiavel();
const ACOES = Object.freeze({ 'transporte.criar.v1': 'criar', 'transporte.editar.v1': 'editar',
    'transporte.excluir.v1': 'excluir', 'transporte.status.v1': 'status' });
const TEXTOS = Object.freeze(['clienteNome', 'endereco', 'cidade', 'tipoOperacao', 'veiculo', 'placa',
    'motorista', 'equipe', 'dataSaida', 'horaSaida', 'dataChegada', 'horaChegada', 'status', 'observacoes']);
const NUMEROS = Object.freeze(['distanciaKm', 'valorKm', 'trechos']);
const STATUS = Object.freeze(['pendente', 'em_rota', 'entregue', 'retirado', 'concluido', 'cancelado']);
const falha = (codigo, recuperar = false) => Object.freeze({ ok: false, codigo, publicado: false, requerRecuperacao: recuperar });
const dataValida = v => typeof v === 'string' && (v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v)
    && Number.isFinite(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v));
const ref = id => regras.criarReferenciaTransporteInterna(id);
function validarDados(tipo, texto) {
    try {
        if (!Object.hasOwn(ACOES, tipo)) return false;
        const d = decodificarTextoEstrito(texto).valor, acao = ACOES[tipo];
        if (!d || Array.isArray(d) || typeof d !== 'object') return false;
        const permitidos = ['descricao', ...(acao === 'criar' ? ['id', 'locacaoReferencia', ...TEXTOS, ...NUMEROS]
            : acao === 'editar' ? ['transporteReferencia', 'locacaoReferencia', ...TEXTOS, ...NUMEROS]
                : acao === 'status' ? ['transporteReferencia', 'status', 'dataConclusao'] : ['transporteReferencia'])];
        if (Object.keys(d).some(k => !permitidos.includes(k))) return false;
        if (acao === 'criar' ? !ref(d.id) : typeof d.transporteReferencia !== 'string' || !d.transporteReferencia) return false;
        for (const k of ['descricao', 'locacaoReferencia', ...TEXTOS]) if (Object.hasOwn(d, k)
            && (typeof d[k] !== 'string' || d[k].length > 1000 || /[\u0000-\u001f]/.test(d[k]))) return false;
        for (const k of NUMEROS) if (Object.hasOwn(d, k) && (typeof d[k] !== 'number'
            || !Number.isFinite(d[k]) || d[k] < 0 || d[k] > Number.MAX_SAFE_INTEGER / 100)) return false;
        if (Object.hasOwn(d, 'trechos') && (!Number.isSafeInteger(d.trechos) || d.trechos < 1)) return false;
        if (Object.hasOwn(d, 'status') && !STATUS.includes(d.status)) return false;
        if (acao === 'status' && !STATUS.includes(d.status)) return false;
        for (const k of ['dataSaida', 'dataChegada', 'dataConclusao']) if (Object.hasOwn(d, k) && !dataValida(d[k])) return false;
        for (const k of ['horaSaida', 'horaChegada']) if (Object.hasOwn(d, k) && d[k] !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d[k])) return false;
        return true;
    } catch (_) { return false; }
}

export { validarDados as validarDadosTransporteTexto };

// Somente texto e metadados da autoridade. Registro e vinculos sao construidos
// aqui; nao ha DTO de snapshot, saldo, historico ou assinatura vindo da UI.
export function prepararTransporteOperacionalTexto(tipo, snapshotTexto, dadosTexto, metadadosTexto) {
    try {
        if (!validarDados(tipo, dadosTexto)) return falha('COMANDO_TRANSPORTE_INVALIDO');
        const s = JSON.parse(decodificarTextoEstrito(snapshotTexto).texto), d = decodificarTextoEstrito(dadosTexto).valor;
        const m = decodificarTextoEstrito(metadadosTexto).valor;
        if (!m || Object.keys(m).sort().join('|') !== 'atorReferencia|operacaoId|timestamp'
            || typeof m.atorReferencia !== 'string' || !m.atorReferencia.trim()
            || typeof m.operacaoId !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId)
            || typeof m.timestamp !== 'string' || !Number.isFinite(Date.parse(m.timestamp))
            || new Date(m.timestamp).toISOString() !== m.timestamp
            || !Number.isSafeInteger(s.ultimaEdicao) || s.ultimaEdicao >= Number.MAX_SAFE_INTEGER) return falha('METADADOS_INVALIDOS');
        const acao = ACOES[tipo], referencia = acao === 'criar' ? ref(d.id) : d.transporteReferencia;
        const alvo = regras.resolverReferenciaEntidadeInterna(s.transportes, 'transporte', referencia);
        if (acao !== 'criar' && !alvo.encontrado) return falha('TRANSPORTE_NAO_RECONCILIADO');
        if (s.logsAuditoria.some(a => a.operacaoId === m.operacaoId)) return falha('OPERACAO_REQUER_RECUPERACAO', true);
        const entrada = { acao, operacaoId: m.operacaoId, atualizadoEm: m.timestamp,
            atualizadoPor: m.atorReferencia, transporteReferencia: referencia, descricao: d.descricao || '',
            persistencia: { versao: s.versao, data: m.timestamp, ultimaEdicao: s.ultimaEdicao + 1 } };
        if (acao === 'criar' || acao === 'editar') {
            const atual = alvo.encontrado ? alvo.registro : null, registro = { id: atual ? atual.id : d.id };
            for (const k of TEXTOS) registro[k] = Object.hasOwn(d, k) ? d[k]
                : atual?.[k] ?? (k === 'status' ? 'pendente' : k === 'tipoOperacao' ? 'entrega' : '');
            for (const k of NUMEROS) registro[k] = Object.hasOwn(d, k) ? d[k] : atual?.[k] ?? (k === 'trechos' ? 1 : 0);
            registro.custoEstimado = registro.distanciaKm * registro.valorKm * registro.trechos;
            if (!registro.clienteNome.trim() || !['entrega', 'retirada', 'montagem', 'desmontagem'].includes(registro.tipoOperacao)) return falha('CADASTRO_TRANSPORTE_INCOMPLETO');
            if (!Number.isFinite(registro.custoEstimado) || registro.custoEstimado > Number.MAX_SAFE_INTEGER / 100) return falha('CUSTO_TRANSPORTE_FORA_DO_LIMITE');
            if (Object.hasOwn(d, 'locacaoReferencia')) {
                const l = d.locacaoReferencia === '' ? null : regras.resolverReferenciaEntidadeInterna(s.locacoes, 'locacao', d.locacaoReferencia);
                if (l && !l.encontrado) return falha('LOCACAO_TRANSPORTE_INVALIDA');
                registro.locacaoId = l ? l.registro.id : '';
            } else registro.locacaoId = atual?.locacaoId ?? '';
            registro.criadoEm = atual?.criadoEm ?? m.timestamp; registro.atualizadoEm = m.timestamp;
            entrada.registro = registro;
        } else if (acao === 'status') { entrada.status = d.status; entrada.dataConclusao = d.dataConclusao || ''; }
        const { versao: _v, data: _d, ultimaEdicao: _u, ...estado } = s;
        const assinatura = regras.assinaturaOperacaoTransporte(entrada, referencia);
        const r = regras.construirCandidatoOperacaoTransporteInterno(estado, entrada, referencia, assinatura);
        if (!r.ok || r.idempotente) return falha(r.idempotente ? 'TRANSPORTE_SEM_ALTERACAO' : r.codigo);
        return Object.freeze({ ok: true, snapshotTexto: decodificarTextoEstrito(JSON.stringify({ ...entrada.persistencia, ...r.candidato })).texto,
            entradaTexto: decodificarTextoEstrito(JSON.stringify(entrada)).texto, publicado: false });
    } catch (_) { return falha('OPERACAO_REQUER_RECUPERACAO', true); }
}

const STATUS_TRANSPORTE = 'transporte.status.v1';
const textoCanonicoTransporte = t => decodificarTextoEstrito(JSON.stringify(t)).texto;

function estadosTransporteConvertido(texto, capacidade) {
    const estados = new Map();
    for (const prova of comprovarConversoesJournalTexto(texto, capacidade))
        for (const t of JSON.parse(prova.transportesTexto))
            estados.set(ref(t.id), textoCanonicoTransporte(t));
    if (!estados.size) return estados;
    const ctx = consultarContextoJournal(capacidade);
    function acompanhar(antes, depois, dadosTexto, eventoAtual = false) {
        const d = JSON.parse(dadosTexto), id = d.transporteReferencia;
        if (!estados.has(id)) return;
        const anterior = regras.resolverReferenciaEntidadeInterna(JSON.parse(antes).transportes, 'transporte', id);
        if (!anterior.encontrado || textoCanonicoTransporte(anterior.registro) !== estados.get(id)) return;
        if (eventoAtual) {
            const r = prepararTransporteOperacionalTexto(STATUS_TRANSPORTE, antes, dadosTexto,
                textoCanonicoTransporte({ operacaoId: ctx.operacaoId, atorReferencia: ctx.atorReferencia, timestamp: ctx.timestamp }));
            if (!r.ok || r.snapshotTexto !== depois) throw Error('STATUS_TRANSPORTE_DIVERGENTE');
        }
        const posterior = regras.resolverReferenciaEntidadeInterna(JSON.parse(depois).transportes, 'transporte', id);
        if (!posterior.encontrado || !Object.is(anterior.registro.locacaoId, posterior.registro.locacaoId)
            || posterior.registro.status !== d.status) throw Error('VINCULO_TRANSPORTE_DIVERGENTE');
        estados.set(id, textoCanonicoTransporte(posterior.registro));
    }
    // O journal ja reexecutou cada evento do prefixo, inclusive sua auditoria.
    for (const [i, e] of ctx.eventosAnteriores.entries()) if (e.tipo === STATUS_TRANSPORTE)
        acompanhar(ctx.eventosAnteriores[i - 1].snapshotTexto, e.snapshotTexto, JSON.parse(e.assinaturaComando).dadosTexto);
    if (ctx.tipo === STATUS_TRANSPORTE)
        acompanhar(ctx.snapshotAnteriorTexto, texto, ctx.dadosTexto, true);
    return estados;
}

export function validarRaizOperacionalTransporteTexto(texto, dataReferencia, comprovacaoOperacional = null, contexto = null) {
    try {
        if (!validarFinanceiroComTransporteEnsaioTexto(texto, dataReferencia, comprovacaoOperacional, contexto)) return false;
        const s = decodificarTextoEstrito(texto).valor, ids = new Set(), ops = new Set();
        const transportesConversao = estadosTransporteConvertido(texto, contexto);
        for (const t of s.transportes) {
            const r = ref(t.id); if (!r || ids.has(r) || !STATUS.includes(t.status)) return false; ids.add(r);
            if (!t.clienteNome?.trim() || !['entrega', 'retirada', 'montagem', 'desmontagem'].includes(t.tipoOperacao)) return false;
            if (t.locacaoId !== '' && !regras.resolverReferenciaEntidadeInterna(s.locacoes, 'locacao',
                `locacao:${encodeURIComponent(JSON.stringify([typeof t.locacaoId, t.locacaoId]))}`).encontrado) return false;
            if (transportesConversao.get(r) === textoCanonicoTransporte(t)) continue;
            for (const k of TEXTOS) if (typeof t[k] !== 'string') return false;
            for (const k of [...NUMEROS, 'custoEstimado']) if (typeof t[k] !== 'number' || !Number.isFinite(t[k]) || t[k] < 0) return false;
            if (t.custoEstimado !== t.distanciaKm * t.valorKm * t.trechos || !Number.isSafeInteger(t.trechos) || t.trechos < 1) return false;
            for (const k of ['criadoEm', 'atualizadoEm']) if (typeof t[k] !== 'string' || new Date(t[k]).toISOString() !== t[k]) return false;
        }
        for (const a of s.logsAuditoria) {
            if (a.operacaoId) { if (ops.has(a.operacaoId)) return false; ops.add(a.operacaoId); }
            if (a.origem !== 'transporte_transacional') continue;
            if (!['criar', 'editar', 'excluir', 'status'].includes(a.acaoTransporte) || a.acao !== `transporte_${a.acaoTransporte}`
                || typeof a.assinaturaPlano !== 'string' || !/^transporte-v1:fnv1a64:[a-f0-9]{16}$/.test(a.assinaturaPlano)
                || typeof a.transporteReferencia !== 'string' || !a.transporteReferencia.startsWith('transporte:')
                || a.data !== a.timestamp || new Date(a.timestamp).toISOString() !== a.timestamp) return false;
        }
        return true;
    } catch (_) { return false; }
}

export function validarRaizDevolucaoCompletaTexto(texto, origemLedgerTexto, dataReferencia) {
    try {
        if (!dataValida(dataReferencia) || !dataReferencia) return falha('DATA_INVALIDA', true);
        const cadeia = reconstruirLedgerDevolucoesTexto(origemLedgerTexto, texto);
        if (!cadeia.ok) return cadeia;
        const l = JSON.parse(cadeia.ledgerTexto);
        // Conferir tambem cada predecessor: uma devolucao nao pode "sanear"
        // uma origem invalida e assim passar somente pela validacao do final.
        for (let n = 0; n <= l.eventos.length; n++) {
            const snapshot = n === 0 ? l.baseTexto : l.eventos[n - 1].estadoDepoisTexto;
            const prefixo = { ...l, eventos: l.eventos.slice(0, n), estadoFinalTexto: snapshot };
            const prova = provarRaizLedgerEstoqueTexto(JSON.stringify(prefixo), snapshot, `${dataReferencia}T12:00:00.000Z`);
            if (!prova.ok) return prova;
            if (!validarRaizOperacionalTransporteTexto(snapshot, dataReferencia, prova.comprovacao)) {
                return falha('VALIDACAO_FINANCEIRA_OU_TRANSPORTE_DIVERGENTE', true);
            }
        }
        return Object.freeze({ ok: true, ledgerTexto: cadeia.ledgerTexto, publicado: false });
    } catch (_) { return falha('OPERACAO_REQUER_RECUPERACAO', true); }
}

/** Registro restrito ao ensaio de devolucao, nao ativacao das abas nem importador
 * geral. A origem arquivada pertence ao bootstrap e nunca ao DTO da interface. */
function criarGatewayEstoqueComprovadoDeEnsaio(c, tipos) {
    if (c.ensaioSintetico !== true || typeof c.nomeBanco !== 'string'
        || !/^mtz-idb-fundacao-lote1-teste-(?:reserva|devolucao|ajuste|cancelamento|locacoes)-[a-zA-Z0-9-]+$/.test(c.nomeBanco)
        || typeof c.obterAtorAutorizado !== 'function' || !dataValida(c.dataReferencia) || !c.dataReferencia) {
        throw new TypeError('ENSAIO_DEVOLUCAO_OBRIGATORIO');
    }
    const identidade = validarIdentidadeBaseTexto(c.identidadeBaseTexto);
    if (!identidade.ok || !JSON.parse(identidade.texto).baseId.startsWith('ensaio-operacional:')) throw new TypeError('BASE_DE_ENSAIO_OBRIGATORIA');
    const origemLedgerTexto = decodificarTextoEstrito(c.origemLedgerTexto).texto;
    const dataReferencia = c.dataReferencia;
    const origem = reconciliarLedgerEstoqueV2Texto(origemLedgerTexto);
    if (!origem.ok || !origem.snapshotTexto) throw new TypeError('ORIGEM_COMPROVADA_OBRIGATORIA');
    const inicial = decodificarTextoEstrito(origem.snapshotTexto).valor;
    // Transporte historico exige o seu journal nativo: nao o inferir na importacao.
    if (inicial.transportes.length || inicial.logsAuditoria.some(a => a.origem === 'transporte_transacional')) {
        throw new TypeError('TRANSPORTE_HISTORICO_SEM_JOURNAL');
    }
    // Cache privado por TEXTO INTEGRAL e origem/data fixas. Nao guarda permissao
    // nem substitui o replay do journal nativo; evita repetir sete vezes a mesma
    // validacao pura exigida pelos dominios do codec.
    const verificadas = new Map();
    const consultar = texto => {
        if (typeof texto !== 'string') return falha('SNAPSHOT_INVALIDO', true);
        if (verificadas.has(texto)) return verificadas.get(texto);
        const r = validarRaizDevolucaoCompletaTexto(texto, origemLedgerTexto, dataReferencia);
        if (r.ok) {
            if (verificadas.size >= 16) verificadas.clear();
            verificadas.set(texto, r);
        }
        return r;
    };
    const validar = texto => consultar(texto).ok;
    const ator = acao => { try {
        const permissao = acao === '@inicializar' ? 'restaurar_backup' : acao === 'ler' ? 'visualizar_locacoes'
            : acao === 'locacao.cancelar.v2' ? 'cancelar_locacao' : acao === 'locacao.ajustar_itens.v2' ? 'editar_locacao'
                : acao === 'estoque.devolver.v2' ? 'registrar_devolucao' : acao === 'estoque.reservar.v2' ? 'reservar_estoque' : null;
        return permissao ? c.obterAtorAutorizado(permissao) : null;
    } catch (_) { return null; } };
    const comandos = Object.fromEntries(tipos.map(tipo => [tipo, {
        validar: texto => {
            try { const d = decodificarTextoEstrito(texto).valor;
                if (tipo === 'estoque.reservar.v2') return Object.keys(d).sort().join('|') === 'locacaoReferencia|tipo'
                    && d.tipo === 'reserva_inicial' && typeof d.locacaoReferencia === 'string';
                if (tipo === 'locacao.cancelar.v2') return Object.keys(d).sort().join('|') === 'locacaoReferencia|tipo'
                    && d.tipo === 'cancelamento_locacao' && typeof d.locacaoReferencia === 'string';
                if (tipo === 'locacao.ajustar_itens.v2') return Object.keys(d).sort().join('|') === 'itens|locacaoReferencia|tipo'
                    && d.tipo === 'ajuste_itens' && typeof d.locacaoReferencia === 'string' && Array.isArray(d.itens)
                    && d.itens.every(i => Object.keys(i).sort().join('|') === 'itemId|pecaReferencia|quantidade'
                        && typeof i.itemId === 'string' && typeof i.pecaReferencia === 'string'
                        && Number.isSafeInteger(i.quantidade) && i.quantidade >= 0);
                return Object.keys(d).sort().join('|') === 'dataDevolucao|itens|locacaoReferencia'
                    && typeof d.locacaoReferencia === 'string' && dataValida(d.dataDevolucao) && d.dataDevolucao !== ''
                    && Array.isArray(d.itens) && d.itens.length > 0
                    && d.itens.every(i => Object.keys(i).sort().join('|') === 'itemId|observacao|pecaReferencia|quantidadeAvaria|quantidadeDevolvida'
                        && typeof i.itemId === 'string' && typeof i.pecaReferencia === 'string'
                        && typeof i.observacao === 'string' && i.observacao === i.observacao.trim()
                        && Number.isSafeInteger(i.quantidadeDevolvida) && i.quantidadeDevolvida >= 0
                        && Number.isSafeInteger(i.quantidadeAvaria) && i.quantidadeAvaria >= 0
                        && Number.isSafeInteger(i.quantidadeDevolvida + i.quantidadeAvaria) && i.quantidadeDevolvida + i.quantidadeAvaria > 0);
            } catch (_) { return false; }
        },
        reconhecerHistorico: (texto, dados, meta) => {
            const v = consultar(texto);
            if (!v.ok) return JSON.stringify({ estado: 'invalida' });
            const eventos = JSON.parse(v.ledgerTexto).eventos;
            const ev = eventos.find(x => JSON.parse(x.metadadosTexto).operacaoId === meta.operacaoId);
            if (!ev) return JSON.stringify({ estado: 'nao_encontrada' });
            if (ev.comandoTexto !== decodificarTextoEstrito(dados).texto
                || JSON.parse(ev.metadadosTexto).atorReferencia !== meta.atorReferencia) return JSON.stringify({ estado: 'conflito' });
            return JSON.stringify({ estado: 'comprovada', operacaoId: meta.operacaoId, tipo: meta.tipo,
                atorReferencia: meta.atorReferencia, assinaturaRequisicao: meta.assinaturaRequisicao,
                assinaturaHistorica: ev.assinaturaCanonica,
                operacaoReferencia: tipo === 'estoque.reservar.v2' ? `${tipo}:${meta.operacaoId}` : `devolucao-${meta.operacaoId}`,
                snapshotTexto: texto });
        },
        aplicar: (texto, dados, meta) => {
            const antes = consultar(texto);
            if (!antes.ok) throw Error(antes.codigo);
            const r = planejarEventoLedgerEstoqueV2Texto(antes.ledgerTexto, dados, JSON.stringify(meta));
            if (!r.ok || r.idempotente) throw Error(r.motivo || 'OPERACAO_JA_CONCLUIDA');
            const depois = reconciliarLedgerEstoqueV2Texto(r.ledgerTexto);
            if (!depois.ok || !validar(depois.snapshotTexto)) throw Error('VALIDACAO_GLOBAL_DIVERGENTE');
            return depois.snapshotTexto;
        }
    }]));
    const validadores = Object.fromEntries(['receber', 'pagar', 'classificacoes', 'conciliacoes', 'conversoes', 'operacional', 'encargos'].map(d => [d, validar]));
    const g = criarGatewayComandos({ ...c, comandos, validadores, autorizar: ator }), entradas = new WeakMap();
    const conferir = (r, acao, original) => {
        if (!r.ok) return r;
        const autor = r.recibo?.atorReferencia || r.comprovacao?.atorReferencia || original;
        return typeof autor === 'string' && ator(acao) === autor ? r
            : falha(r.codigo === 'COMMIT_CONFIRMADO' ? 'ESTADO_CONFIRMADO_REQUER_RECUPERACAO' : 'PERMISSAO_NEGADA', r.codigo === 'COMMIT_CONFIRMADO');
    };
    return Object.freeze({ ...g, comandosDisponiveis: Object.freeze(tipos.slice()),
        async prepararImportacao(id, texto) {
            try {
                if (decodificarTextoEstrito(texto).texto !== origem.snapshotTexto) return falha('IMPORTACAO_FORA_DA_ORIGEM_COMPROVADA', true);
            } catch (_) { return falha('SNAPSHOT_INVALIDO', true); }
            const r = await g.prepararImportacao(id, texto); if (r.ok) entradas.set(r.entrada, '@inicializar'); return r;
        },
        async prepararComando(id, comando, revisao, dados) {
            const r = await g.prepararComando(id, comando, revisao, dados); if (r.ok) entradas.set(r.entrada, comando); return r;
        },
        async executar(e) { return conferir(await g.executar(e), entradas.get(e)); },
        async recuperarResultado(e) { return conferir(await g.recuperarResultado(e), entradas.get(e)); },
        async ler() { const a = ator('ler'); return conferir(await g.ler(), 'ler', a); }
    });
}

export function criarGatewayDevolucaoDeEnsaio(c) {
    return criarGatewayEstoqueComprovadoDeEnsaio(c, ['estoque.devolver.v2']);
}
export function criarGatewayAjusteItensDeEnsaio(c) {
    return criarGatewayEstoqueComprovadoDeEnsaio(c, ['locacao.ajustar_itens.v2']);
}
export function criarGatewayCancelamentoLocacaoDeEnsaio(c) {
    return criarGatewayEstoqueComprovadoDeEnsaio(c, ['locacao.cancelar.v2']);
}
export function criarGatewayReservaInicialDeEnsaio(c) {
    return criarGatewayEstoqueComprovadoDeEnsaio(c, ['estoque.reservar.v2']);
}
export function criarGatewayLocacoesDeEnsaio(c) {
    return criarGatewayEstoqueComprovadoDeEnsaio(c, ['estoque.reservar.v2', 'locacao.ajustar_itens.v2', 'estoque.devolver.v2', 'locacao.cancelar.v2']);
}

export function criarGatewayOperacionalDeEnsaio(c) {
    if (c.ensaioSintetico !== true || typeof c.nomeBanco !== 'string'
        || !/^mtz-idb-fundacao-lote1-teste-operacional-[a-zA-Z0-9-]+$/.test(c.nomeBanco)
        || typeof c.obterAtorAutorizado !== 'function') throw new TypeError('ENSAIO_OPERACIONAL_OBRIGATORIO');
    const identidade = validarIdentidadeBaseTexto(c.identidadeBaseTexto);
    if (!identidade.ok || !JSON.parse(identidade.texto).baseId.startsWith('ensaio-operacional:')) throw new TypeError('BASE_DE_ENSAIO_OBRIGATORIA');
    if (!dataValida(c.dataReferencia) || !c.dataReferencia) throw new TypeError('DATA_INVALIDA');
    // O legado financeiro persiste o candidato canonico, ao contrario do
    // Transporte. Reutilizar sua ordenacao, sem reescrever regra monetaria.
    const financeiros = Object.fromEntries(Object.entries(criarDescritoresFinanceirosDeEnsaio()).map(([tipo, d]) => [tipo, {
        ...d, aplicar: (s, dados, meta) => decodificarTextoEstrito(JSON.stringify(regras.ordenarChavesCanonicas(
            JSON.parse(d.aplicar(s, dados, meta))))).texto
    }]));
    const comandos = { ...financeiros, ...Object.fromEntries(Object.keys(ACOES).map(tipo => [tipo, {
        validar: texto => validarDados(tipo, texto), aplicar: (s, d, m) => {
            const r = prepararTransporteOperacionalTexto(tipo, s, d, JSON.stringify(m));
            if (!r.ok) throw new Error(r.codigo); return r.snapshotTexto;
        }
    }])) };
    const permissao = tipo => Object.hasOwn(ACOES, tipo) ? 'gerenciar_transporte'
        : tipo === '@inicializar' ? 'restaurar_backup' : tipo === 'ler' ? 'visualizar_fluxo_caixa' : COMANDOS_FINANCEIROS_ENSAIO[tipo]?.permissao;
    const ator = tipo => { try { return permissao(tipo) ? c.obterAtorAutorizado(permissao(tipo)) : null; } catch (_) { return null; } };
    const validar = texto => validarRaizOperacionalTransporteTexto(texto, c.dataReferencia);
    const validadores = Object.fromEntries(['receber', 'pagar', 'classificacoes', 'conciliacoes', 'conversoes', 'operacional', 'encargos'].map(d => [d, validar]));
    const g = criarGatewayComandos({ ...c, autorizar: ator, validadores, comandos }), tipos = new WeakMap();
    const conferir = (r, tipo, original) => {
        if (!r.ok) return r;
        const esperado = r.recibo?.atorReferencia || r.comprovacao?.atorReferencia || original;
        return typeof esperado === 'string' && ator(tipo) === esperado ? r
            : falha(r.codigo === 'COMMIT_CONFIRMADO' ? 'ESTADO_CONFIRMADO_REQUER_RECUPERACAO' : 'PERMISSAO_NEGADA', r.codigo === 'COMMIT_CONFIRMADO');
    };
    return Object.freeze({ ...g, comandosDisponiveis: Object.freeze(Object.keys(comandos)),
        // Sem prova causal legada de Transporte: somente raiz inicial SEM
        // transportes ou suas auditorias. Depois, todo estado exige replay do
        // journal nativo integral. Nao e importador de backups operacionais.
        async prepararImportacao(id, texto) {
            try { const s = decodificarTextoEstrito(texto).valor;
                if (!Array.isArray(s.transportes) || s.transportes.length || s.logsAuditoria.some(a => a.origem === 'transporte_transacional')) return falha('IMPORTACAO_OPERACIONAL_HISTORICA_BLOQUEADA');
            } catch (_) { return falha('SNAPSHOT_INVALIDO'); }
            const r = await g.prepararImportacao(id, texto); if (r.ok) tipos.set(r.entrada, '@inicializar'); return r;
        },
        async prepararComando(id, tipo, revisao, dados) { const r = await g.prepararComando(id, tipo, revisao, dados); if (r.ok) tipos.set(r.entrada, tipo); return r; },
        async executar(e) { return conferir(await g.executar(e), tipos.get(e)); },
        async recuperarResultado(e) { return conferir(await g.recuperarResultado(e), tipos.get(e)); },
        async ler() { const a = ator('ler'); return conferir(await g.ler(), 'ler', a); }
    });
}
