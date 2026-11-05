import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
import { consultarContextoJournal } from './indexeddb-authority.mjs';
import { validarCatalogoTiposTexto } from './catalog-command-kernels.mjs';
import { validarPropostasTexto } from './proposal-command-kernels.mjs';
import { comprovarConversoesJournalTexto } from './proposal-conversion-replay.mjs';
import { criarReferenciaEstoque as ref, construirIdentidadeReservaV2Texto,
    classificarReservaHistoricaTexto, planejarIdentidadeMovimentoTexto,
    validarContinuidadeCheckpointReservaTexto, validarContinuidadeReservaV2Texto } from './operational-stock-identity.mjs';
import { consultarEstoqueTipadoTexto } from './operational-stock-contracts.mjs';
import { criarNucleoConfiavel } from './operational-stock-read.generated.mjs';
import { prepararCandidatoDevolucaoV2Texto, prepararCandidatoAjusteItensV2Texto,
    prepararCandidatoCancelamentoV2Texto, prepararCandidatoReservaInicialV2Texto, validarMaterializacaoEstoqueTexto } from './operational-return-planner.mjs';

// Reconciliador inativo. Nenhuma funcao abre armazenamento ou publica estado.
const regras = criarNucleoConfiavel();
const json = t => decodificarTextoEstrito(t).valor;
const canon = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
const clone = v => JSON.parse(JSON.stringify(v));
const exigir = (v, m) => { if (!v) throw Error(m); };
const inteiro = n => Number.isSafeInteger(n) && n >= 0;
const soma = (a, b) => { exigir(inteiro(a) && inteiro(b) && inteiro(a + b), 'QUANTIDADE_FORA_DO_LIMITE'); return a + b; };
const chaves = (v, ks) => v && typeof v === 'object' && !Array.isArray(v)
    && canon(Object.keys(v).sort()) === canon(ks.slice().sort());
const falha = motivo => Object.freeze({ ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', motivo,
    requerRecuperacao: true, gravado: false, publicado: false });
const sucesso = dados => Object.freeze({ ok: true, ...dados, gravado: false, publicado: false,
    comandoOperacionalDisponivel: false });
const provasRaiz = new WeakMap();
const provasTipos = new WeakMap();
const provasPropostas = new WeakMap();
function candidatoRaiz(texto, dadosTexto, metaTexto, comprovacao, causalidadeTexto = null) {
    const d = json(dadosTexto);
    if (d.tipo === 'reserva_inicial') return prepararCandidatoReservaInicialV2Texto(texto, dadosTexto, metaTexto, causalidadeTexto);
    if (d.tipo === 'cancelamento_locacao') return prepararCandidatoCancelamentoV2Texto(texto, dadosTexto, metaTexto, causalidadeTexto);
    return d.tipo === 'ajuste_itens' ? prepararCandidatoAjusteItensV2Texto(texto, dadosTexto, metaTexto, comprovacao, causalidadeTexto)
        : prepararCandidatoDevolucaoV2Texto(texto, dadosTexto, metaTexto, comprovacao, causalidadeTexto);
}

// Origem arquivada explicita. O checkpoint e uma ancora, nao uma reserva
// sintetizada nem uma afirmacao de que os predecessores inexistentes ocorreram.
function origemComprovada(ledger) {
    const o = json(ledger.origemTexto), s = json(ledger.baseTexto);
    if (chaves(o, ['tipo']) && o.tipo === 'sem_reserva_v2') {
        exigir(Array.isArray(s.movimentacoesEstoque) && s.movimentacoesEstoque.length === 0
            && Array.isArray(s.devolucoes) && s.devolucoes.length === 0, 'ORIGEM_COM_MOVIMENTOS');
        for (const l of s.locacoes) {
            const vazia = (objeto, campo) => !Object.hasOwn(objeto, campo)
                || Array.isArray(objeto[campo]) && objeto[campo].length === 0;
            exigir(construirIdentidadeReservaV2Texto(ledger.baseTexto, ref('locacao', l.id)).ok, 'IDENTIDADE_ORIGEM_INVALIDA');
            exigir(l.estoqueReserva?.status === 'nao_reservado' && !l.estoqueReserva.snapshot
                && vazia(l.estoqueReserva, 'movimentacaoIds')
                && !['reservadoEm', 'reservadoPor', 'liberadoEm', 'liberadoPor'].some(k => l.estoqueReserva[k])
                && vazia(l, 'historicoOperacional') && vazia(l, 'historicoAlteracoes')
                && vazia(l, 'itensHistoricosRemovidos') && !Object.hasOwn(l, 'controleEdicao'),
            'ORIGEM_SEM_RESERVA_NAO_DEMONSTRADA');
            exigir(l.items.every(i => (i.devolvidos ?? 0) === 0 && (i.avariadosEstoqueProprio ?? 0) === 0), 'ORIGEM_COM_RETORNOS');
        }
        exigir(!s.logsAuditoria.some(a => ['reserva_estoque', 'ajuste_reserva_locacao', 'devolucao_locacao'].includes(a.acao)
            || ['reserva_inicial_v2', 'cancelamento_locacao_v2'].includes(a.origem) || a.tipo === 'devolucao'), 'ORIGEM_COM_AUDITORIA_OPERACIONAL');
        exigir(s.pecas.every(p => p.reservado === 0), 'ORIGEM_COM_SALDO_RESERVADO');
        return { s, prova: null, referencia: null, causal: true };
    }
    const anterior = json(o.anteriorTexto);
    exigir(chaves(o, ['anteriorTexto', 'locacaoReferencia']), 'ORIGEM_INVALIDA');
    const l = localizar(s, o.locacaoReferencia), versao = l.estoqueReserva?.snapshot?.versao;
    const validar = versao === 1 ? validarContinuidadeCheckpointReservaTexto : validarContinuidadeReservaV2Texto;
    exigir(versao === 1 || versao === 2, 'ORIGEM_SEM_SNAPSHOT');
    const prova = validar(o.anteriorTexto, ledger.baseTexto, o.locacaoReferencia);
    exigir(prova.ok, prova.motivo);
    exigir(Array.isArray(s.devolucoes) && s.devolucoes.length === 0 && anterior.devolucoes.length === 0,
        'ORIGEM_COM_DEVOLUCOES_NAO_RECONSTRUIDAS');
    exigir(anterior.movimentacoesEstoque.length === 0
        && anterior.locacoes.every(x => !(x.historicoOperacional || []).length), 'PREDECESSORES_ANTERIORES_NAO_COMPROVADOS');
    for (const loc of s.locacoes) {
        exigir(!loc.itensHistoricosRemovidos || Array.isArray(loc.itensHistoricosRemovidos)
            && loc.itensHistoricosRemovidos.length === 0, 'TOMBSTONES_ORIGEM_SEM_CADEIA');
        exigir(construirIdentidadeReservaV2Texto(ledger.baseTexto, ref('locacao', loc.id)).ok, 'IDENTIDADE_ORIGEM_INVALIDA');
        if (loc !== l) exigir(loc.items.length === 0 && !loc.estoqueReserva?.snapshot
            && !(loc.historicoOperacional || []).length, 'OUTRA_RESERVA_SEM_ORIGEM_COMPROVADA');
    }
    exigir(l.estoqueReserva.status === 'reservado' && l.items.every(i => (i.devolvidos ?? 0) === 0
        && (i.avariadosEstoqueProprio ?? 0) === 0), 'ORIGEM_NAO_E_RESERVA_INICIAL');
    return { s, prova: prova.comprovacao, referencia: o.locacaoReferencia };
}

function replayRaiz(ledger) {
    exigir(chaves(ledger, ['versao', 'origemTexto', 'baseTexto', 'eventos', 'estadoFinalTexto'])
        && ledger.versao === 2 && Array.isArray(ledger.eventos) && ledger.eventos.length <= 1000, 'LEDGER_INVALIDO');
    const origem = origemComprovada(ledger);
    exigir(canon(origem.s) === ledger.baseTexto, 'BASE_NAO_CANONICA');
    let texto = ledger.baseTexto, predecessor = null;
    const ops = new Set(origem.s.logsAuditoria.map(a => a.operacaoId).filter(Boolean));
    for (const [indice, ev] of ledger.eventos.entries()) {
        exigir(chaves(ev, ['sequencia', 'predecessor', 'comandoTexto', 'metadadosTexto', 'assinaturaCanonica', 'estadoAntesTexto', 'estadoDepoisTexto'])
            && ev.sequencia === indice + 1 && ev.predecessor === predecessor && ev.estadoAntesTexto === texto,
        'PREDECESSOR_DIVERGENTE');
        const d = json(ev.comandoTexto), m = metadados(ev.metadadosTexto);
        exigir((origem.referencia === null || d.locacaoReferencia === origem.referencia)
            && !ops.has(m.operacaoId), 'ORIGEM_OPERACAO_DIVERGENTE');
        exigir(ev.assinaturaCanonica === canon({ sequencia: ev.sequencia, predecessor, comando: d, metadados: m }),
            'ASSINATURA_DIVERGENTE');
        // Reexecutar o MESMO construtor legado compartilhado verifica cada
        // campo: movimentos reais, assinaturas, conteiner, auditoria e futuro.
        const r = candidatoRaiz(texto, ev.comandoTexto, ev.metadadosTexto, indice === 0 ? origem.prova : null,
            origem.causal ? canon({ sequencia: ev.sequencia, predecessor }) : null);
        exigir(r.ok, r.motivo);
        exigir(r.candidatoTexto === ev.estadoDepoisTexto, 'RAIZ_EVENTO_DIVERGENTE');
        texto = r.candidatoTexto; predecessor = m.operacaoId; ops.add(predecessor);
    }
    exigir(texto === ledger.estadoFinalTexto, 'RAIZ_FINAL_DIVERGENTE');
    return { ledger, s: origem.s, snapshotTexto: texto };
}

/** Capacidade privada para a composicao financeira. Nunca e um booleano ou
 * marca textual aceito do chamador. Tambem exige materializacao integral. */
export function provarRaizLedgerEstoqueTexto(ledgerTexto, snapshotTexto, referenciaHoje) {
    try {
        const r = replay(ledgerTexto);
        exigir(r.snapshotTexto && r.snapshotTexto === decodificarTextoEstrito(snapshotTexto).texto,
            'LEDGER_RAIZ_ORIGEM_DIVERGENTE');
        return emitirProvaMaterializada(snapshotTexto, referenciaHoje);
    } catch (e) { return falha(e.message); }
}

export function provarRaizLedgerCatalogosTexto(ledgerTexto, snapshotTexto, referenciaHoje) {
    try {
        const origem = replay(ledgerTexto), texto = decodificarTextoEstrito(snapshotTexto).texto;
        exigir(origem.snapshotTexto === texto, 'LEDGER_RAIZ_ORIGEM_DIVERGENTE');
        // Um snapshot exportado nao substitui o journal nativo com seus recibos.
        exigir(!json(texto).logsAuditoria.some(a => a.origem === 'proposta_transacional'),
            'PROPOSTA_NATIVA_EXIGE_JOURNAL_ORIGINAL');
        exigir(validarCatalogoTiposTexto(texto), 'CATALOGO_TIPOS_INVALIDO');
        exigir(validarPropostasTexto(texto), 'PROPOSTAS_INVALIDAS');
        const r = emitirProvaMaterializada(texto, referenciaHoje, true);
        provasTipos.set(r.comprovacao, texto);
        provasPropostas.set(r.comprovacao, texto);
        return r;
    } catch (e) { return falha(e.message); }
}

export function confirmarCatalogoTiposJournal(comprovacao, snapshotTexto) {
    if (!provasTipos.has(comprovacao)) return false;
    try { return provasTipos.get(comprovacao) === decodificarTextoEstrito(snapshotTexto).texto; }
    catch (_) { return false; }
}

export function confirmarPropostasJournal(comprovacao, snapshotTexto) {
    if (!provasPropostas.has(comprovacao)) return false;
    try { return provasPropostas.get(comprovacao) === decodificarTextoEstrito(snapshotTexto).texto; }
    catch (_) { return false; }
}

function emitirProvaMaterializada(snapshotTexto, referenciaHoje, permitirCadastroSemEstoque = false, capacidade = null) {
    const s = json(snapshotTexto), refs = s.pecas.map(p => ref('peca', p.id));
    let locacoesSemEfeitoFisico = s.locacoes.length === 0;
    if (!refs.length && !locacoesSemEfeitoFisico && capacidade) {
        const origens = comprovarConversoesJournalTexto(snapshotTexto, capacidade);
        locacoesSemEfeitoFisico = s.locacoes.every(l =>
            origens.some(p => p.locacaoTexto === canon(l))
            && Array.isArray(l.items) && l.items.length > 0
            && l.items.every(i => inteiro(i.quantidade) && i.quantidade > 0
                && i.origemCusto === 'terceirizado' && i.quantidadePropria === 0
                && i.quantidadeTerceirizada === i.quantidade
                && (i.pecaId === '' || i.pecaId == null)
                && (i.devolvidos ?? 0) === 0 && (i.avariadosEstoqueProprio ?? 0) === 0));
    }
    exigir(refs.length > 0 || permitirCadastroSemEstoque && locacoesSemEfeitoFisico
        && s.movimentacoesEstoque.length === 0 && s.devolucoes.length === 0, 'ESTOQUE_AUSENTE');
    for (const p of s.pecas) {
        exigir(['quantidadeTotal', 'reservado', 'disponivel', 'manutencao', 'avariado', 'perdido']
            .every(k => inteiro(p[k])) && soma(soma(p.manutencao, p.avariado), p.perdido) <= p.quantidadeTotal,
        'SALDO_FISICO_INCONSISTENTE');
    }
    if (refs.length) {
        const m = validarMaterializacaoEstoqueTexto(snapshotTexto, canon(refs), referenciaHoje);
        exigir(m.ok, m.motivo);
    }
    const comprovacao = Object.freeze({});
    provasRaiz.set(comprovacao, decodificarTextoEstrito(snapshotTexto).texto);
    return Object.freeze({ ok: true, comprovacao, gravado: false, publicado: false });
}

/** A continuidade vem do MESMO journal nativo, sem reancorar raizes antigas.
 * O registro fechado ainda deve reconciliar o redutor concreto e todos os dominios. */
export function provarRaizJournalEstoqueTexto(contexto, snapshotTexto, referenciaHoje) {
    try {
        const c = consultarContextoJournal(contexto);
        exigir(c?.fase === 'validar' && c.revisao > 0 && c.revisaoAnterior === c.revisao - 1
            && c.eventosAnteriores.length === c.revisao
            && ['estoque', 'financeiro', 'transporte', 'clientes', 'tipos', 'propostas', 'configuracao'].includes(c.dominio)
            && c.snapshotPosteriorTexto === decodificarTextoEstrito(snapshotTexto).texto,
        'CONTEXTO_JOURNAL_NAO_COMPROVADO');
        exigir(validarCatalogoTiposTexto(snapshotTexto), 'CATALOGO_TIPOS_INVALIDO');
        exigir(validarPropostasTexto(snapshotTexto, contexto), 'PROPOSTAS_INVALIDAS');
        const r = emitirProvaMaterializada(snapshotTexto, referenciaHoje, true, contexto);
        provasTipos.set(r.comprovacao, decodificarTextoEstrito(snapshotTexto).texto);
        provasPropostas.set(r.comprovacao, decodificarTextoEstrito(snapshotTexto).texto);
        return r;
    } catch (e) { return falha(e.message); }
}
export function confirmarRaizLedgerEstoque(comprovacao, snapshotTexto) {
    if (!provasRaiz.has(comprovacao)) return false;
    try { return provasRaiz.get(comprovacao) === decodificarTextoEstrito(snapshotTexto).texto; }
    catch (_) { return false; }
}

// Reconstrucao deterministica para o journal nativo: os DTOs sao derivados dos
// registros da raiz e depois confrontados com o resultado INTEGRAL do replay.
export function reconstruirLedgerDevolucoesTexto(origemLedgerTexto, snapshotTexto) {
    try {
        const origem = replay(origemLedgerTexto), s = json(snapshotTexto);
        exigir(origem.snapshotTexto, 'ANCORA_INICIAL_OBRIGATORIA');
        exigir(Array.isArray(s.devolucoes) && s.devolucoes.length <= 1000, 'DEVOLUCOES_INVALIDAS');
        let ledgerTexto = canon({ ...origem.ledger, eventos: [], estadoFinalTexto: origem.ledger.baseTexto });
        const operacoesBase = new Set(origem.s.logsAuditoria.map(a => a.operacaoId));
        const cancelamentos = s.logsAuditoria.filter(a => !operacoesBase.has(a.operacaoId) && a.origem === 'cancelamento_locacao_v2');
        exigir(new Set(cancelamentos.map(a => ref('locacao', a.locacaoId))).size === cancelamentos.length, 'CANCELAMENTOS_CONFLITANTES');
        // O cancelamento legado faz unshift da auditoria e e terminal neste
        // perfil de uma locacao. Nao ordenar eventos por timestamps empatados.
        let eventos = [...s.logsAuditoria.filter(a => !operacoesBase.has(a.operacaoId)
            && (a.tipo === 'devolucao' || a.acao === 'ajuste_reserva_locacao' || a.origem === 'reserva_inicial_v2')), ...cancelamentos.slice().reverse()];
        if (json(origem.ledger.origemTexto).tipo === 'sem_reserva_v2') {
            exigir(eventos.every(a => Number.isSafeInteger(a.cadeiaOperacionalV2?.sequencia)
                && a.cadeiaOperacionalV2.sequencia > 0), 'SEQUENCIA_CAUSAL_AUSENTE');
            eventos = eventos.slice().sort((a, b) => a.cadeiaOperacionalV2.sequencia - b.cadeiaOperacionalV2.sequencia);
            eventos.forEach((a, i) => exigir(a.cadeiaOperacionalV2.sequencia === i + 1
                && a.cadeiaOperacionalV2.predecessor === (i === 0 ? null : eventos[i - 1].operacaoId), 'SEQUENCIA_CAUSAL_DIVERGENTE'));
        }
        exigir(eventos.length >= origem.ledger.eventos.length && eventos.length <= 1000, 'EVENTOS_INVALIDOS');
        for (const a of eventos) {
            let dados, meta;
            if (a.origem === 'cancelamento_locacao_v2' || a.origem === 'reserva_inicial_v2') {
                const hs = s.locacoes.flatMap(l => (l.historicoAlteracoes || [])
                    .filter(h => h.operacaoId === a.operacaoId).map(h => ({ l, h })));
                exigir(hs.length === 1 && hs[0].l.id === a.locacaoId && hs[0].h.locacaoId === a.locacaoId,
                    'CONTEINER_CANCELAMENTO_DIVERGENTE');
                dados = hs[0].h.comandoOperacionalV2;
                exigir(dados?.tipo === (a.origem === 'reserva_inicial_v2' ? 'reserva_inicial' : 'cancelamento_locacao'), 'COMANDO_HISTORICO_AUSENTE');
                meta = { operacaoId: a.operacaoId, atorReferencia: a.usuario, timestamp: a.timestamp };
            } else if (a.acao === 'ajuste_reserva_locacao') {
                const hs = s.locacoes.flatMap(l => (l.historicoOperacional || [])
                    .filter(h => h.operacaoId === a.operacaoId).map(h => ({ l, h })));
                exigir(hs.length === 1 && hs[0].l.id === a.locacaoId && hs[0].h.locacaoId === a.locacaoId,
                    'CONTEINER_AJUSTE_DIVERGENTE');
                dados = hs[0].h.comandoOperacionalV2;
                exigir(dados?.tipo === 'ajuste_itens', 'COMANDO_HISTORICO_AUSENTE');
                meta = { operacaoId: a.operacaoId, atorReferencia: a.usuario, timestamp: a.data };
            } else {
                const rs = s.devolucoes.filter(r => r.operacaoId === a.operacaoId);
                exigir(rs.length === 1, 'DEVOLUCAO_AUSENTE_OU_DUPLICADA');
                const r = rs[0];
                dados = { locacaoReferencia: ref('locacao', r.locacaoId), dataDevolucao: r.dataDevolucao,
                itens: r.itens.map(i => ({ itemId: i.itemId, pecaReferencia: ref('peca', i.pecaId),
                    quantidadeDevolvida: i.quantidadeDevolvida, quantidadeAvaria: i.quantidadeAvaria, observacao: i.observacao })) };
                meta = { operacaoId: r.operacaoId, atorReferencia: r.criadoPor, timestamp: r.criadoEm };
            }
            const proximo = planejarEventoLedgerEstoqueV2Texto(ledgerTexto, canon(dados), canon(meta));
            exigir(proximo.ok && !proximo.idempotente, proximo.motivo || 'DEVOLUCAO_DUPLICADA');
            ledgerTexto = proximo.ledgerTexto;
        }
        const r = reconciliarLedgerEstoqueV2Texto(ledgerTexto, snapshotTexto);
        exigir(r.ok, r.motivo);
        exigir(canon(json(ledgerTexto).eventos.slice(0, origem.ledger.eventos.length)) === canon(origem.ledger.eventos),
            'PREFIXO_HISTORICO_ORIGEM_DIVERGENTE');
        return sucesso({ codigo: 'RAIZ_OPERACIONAL_RECONSTRUIDA', ledgerTexto, snapshotTexto: r.snapshotTexto });
    } catch (e) { return falha(e.message); }
}
function localizar(s, referencia) {
    exigir(typeof referencia === 'string', 'REFERENCIA_INVALIDA');
    const ls = s.locacoes.filter(l => ref('locacao', l.id) === referencia);
    exigir(ls.length === 1, 'LOCACAO_AUSENTE_OU_DUPLICADA'); return ls[0];
}
function base(texto) {
    const s = json(texto);
    exigir(Array.isArray(s.pecas) && Array.isArray(s.locacoes)
        && Array.isArray(s.movimentacoesEstoque) && Array.isArray(s.devolucoes), 'BASE_INVALIDA');
    for (const l of s.locacoes) {
        const r = construirIdentidadeReservaV2Texto(texto, ref('locacao', l.id));
        exigir(r.ok, r.motivo);
        if (l.estoqueReserva?.snapshot?.versao === 1) {
            const h = classificarReservaHistoricaTexto(texto, ref('locacao', l.id));
            exigir(!h.ok, 'CHECKPOINT_LEGADO_EXIGE_PREDECESSORES');
            throw Error(h.motivo || 'IDENTIDADE_LEGADA_NAO_DEMONSTRADA');
        }
        exigir(l.estoqueReserva?.status === 'nao_reservado' && !l.estoqueReserva?.snapshot
            && !l.historicoOperacional?.length && !l.historicoAlteracoes?.length && !l.controleEdicao
            && !l.itensHistoricosRemovidos?.length, 'BASE_OPERACIONAL_NAO_VAZIA');
        for (const i of l.items) exigir((i.devolvidos ?? 0) === 0 && (i.avariadosEstoqueProprio ?? 0) === 0, 'BASE_COM_RETORNOS');
    }
    exigir(s.movimentacoesEstoque.length === 0 && s.devolucoes.length === 0, 'LEDGER_LEGADO_EXIGE_RECONSTRUCAO');
    exigir(!s.logsAuditoria.some(a => ['ajuste_reserva_locacao', 'devolucao_locacao', 'reserva_estoque'].includes(a.acao)
        || a.tipo === 'devolucao'), 'AUDITORIA_OPERACIONAL_SEM_CADEIA');
    for (const p of s.pecas) {
        for (const k of ['quantidadeTotal', 'reservado', 'disponivel', 'manutencao', 'avariado', 'perdido']) exigir(inteiro(p[k]), 'PECA_INVALIDA');
        exigir(p.reservado === 0 && soma(soma(p.manutencao, p.avariado), p.perdido) <= p.quantidadeTotal, 'BASE_FISICA_NAO_COMPROVADA');
    }
    return s;
}
function inicial(s) {
    return { locacoes: s.locacoes.map(l => ({ locacaoReferencia: ref('locacao', l.id), fase: 'nao_reservado',
        itens: l.items.map(i => ({ itemId: i.itemId, pecaReferencia: ref('peca', i.pecaId),
            reservado: 0, liberado: 0, devolvido: 0, avariado: 0, ultimoMovimento: null })) })), movimentos: [] };
}
function metadados(texto) {
    const m = json(texto);
    exigir(chaves(m, ['operacaoId', 'atorReferencia', 'timestamp']) && typeof m.operacaoId === 'string'
        && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId) && typeof m.atorReferencia === 'string'
        && m.atorReferencia.trim().length > 0 && typeof m.timestamp === 'string'
        && new Date(m.timestamp).toISOString() === m.timestamp, 'METADADOS_INVALIDOS'); return m;
}
function comando(texto) {
    const d = json(texto);
    exigir(d && ['reserva', 'liberacao', 'cancelamento', 'devolucao'].includes(d.tipo), 'OPERACAO_NAO_SUPORTADA');
    exigir(chaves(d, ['tipo', 'locacaoReferencia', ...(['liberacao', 'devolucao'].includes(d.tipo) ? ['itens'] : [])])
        && typeof d.locacaoReferencia === 'string', 'COMANDO_INVALIDO');
    if (d.itens) {
        exigir(Array.isArray(d.itens) && d.itens.length > 0, 'ITENS_INVALIDOS'); const ids = new Set();
        for (const i of d.itens) {
            const ks = d.tipo === 'devolucao' ? ['itemId', 'pecaReferencia', 'quantidadeDevolvida', 'quantidadeAvaria']
                : ['itemId', 'pecaReferencia', 'quantidade'];
            exigir(chaves(i, ks) && typeof i.itemId === 'string' && !ids.has(i.itemId) && typeof i.pecaReferencia === 'string', 'ITEM_INVALIDO');
            ids.add(i.itemId);
            const q = d.tipo === 'devolucao' ? soma(i.quantidadeDevolvida, i.quantidadeAvaria) : i.quantidade;
            exigir(inteiro(q) && q > 0, 'QUANTIDADE_INVALIDA');
        }
    }
    return d;
}
function projecao(s, e, alvo) {
    const p = clone(s);
    for (const l of p.locacoes) {
        const estado = e.locacoes.find(x => x.locacaoReferencia === ref('locacao', l.id));
        if (ref('locacao', l.id) !== alvo) {
            l.items = l.items.flatMap(i => {
                const at = estado.itens.find(x => x.itemId === i.itemId);
                return at.reservado > 0 ? [{ ...i, quantidade: at.reservado, quantidadePropria: at.reservado,
                    quantidadeTerceirizada: 0, origemCusto: 'proprio', devolvidos: 0, avariadosEstoqueProprio: 0 }] : [];
            });
            l.estoqueReserva = { status: estado.fase === 'cancelado' ? 'liberado' : 'reservado' };
        }
    }
    for (const peca of p.pecas) {
        let avarias = peca.avariado;
        for (const l of e.locacoes) for (const i of l.itens) if (i.pecaReferencia === ref('peca', peca.id)) avarias = soma(avarias, i.avariado);
        exigir(avarias <= peca.quantidadeTotal, 'AVARIAS_EXCEDEM_CAPACIDADE'); peca.avariado = avarias;
    }
    return p;
}
function transicao(s, estadoAnterior, d, m) {
    const e = clone(estadoAnterior), l = localizar(s, d.locacaoReferencia);
    const el = e.locacoes.find(x => x.locacaoReferencia === d.locacaoReferencia);
    exigir(!['cancelado', 'devolvido', 'encerrado'].includes(l.status)
        && !['cancelado', 'devolvido', 'encerrado'].includes(l.statusFluxo), 'STATUS_ORIGINAL_NAO_PERMITE_OPERACAO');
    const mover = (at, tipo, q) => {
        if (q === 0) return;
        const plano = planejarIdentidadeMovimentoTexto(canon(s), canon({ tipo, locacaoReferencia: d.locacaoReferencia,
            pecaReferencia: at.pecaReferencia, itemId: at.itemId, quantidade: q }), canon(m));
        exigir(plano.ok, plano.motivo); const v = json(plano.vinculoTexto);
        exigir(!e.movimentos.some(x => x.id === v.id), 'MOVIMENTO_DUPLICADO');
        const antes = at.reservado;
        at.reservado = tipo === 'reserva' ? soma(at.reservado, q) : at.reservado - q;
        exigir(inteiro(at.reservado), 'MOVIMENTO_SEM_PREDECESSOR_OU_EXCEDENTE');
        if (tipo === 'liberacao') at.liberado = soma(at.liberado, q);
        if (tipo === 'devolucao') at.devolvido = soma(at.devolvido, q);
        if (tipo === 'avaria') at.avariado = soma(at.avariado, q);
        e.movimentos.push({ ...v, predecessorMovimento: at.ultimoMovimento, reservadoAntes: antes, reservadoDepois: at.reservado });
        at.ultimoMovimento = v.id;
    };
    if (d.tipo === 'reserva') {
        exigir(el.fase === 'nao_reservado', 'RESERVA_JA_EXISTENTE_OU_ENCERRADA');
        const vista = projecao(s, e, d.locacaoReferencia), necessarios = new Map();
        for (const i of l.items) {
            const q = regras.obterQuantidadePropriaOperacional(i);
            if (q > 0) necessarios.set(ref('peca', i.pecaId), soma(necessarios.get(ref('peca', i.pecaId)) || 0, q));
        }
        exigir(necessarios.size > 0, 'SEM_ITENS_PROPRIOS');
        for (const [peca, q] of necessarios) {
            const c = consultarEstoqueTipadoTexto(canon(vista), peca, d.locacaoReferencia);
            exigir(c.ok && json(c.resultadoTexto).consulta.disponivel >= q, 'DISPONIBILIDADE_INSUFICIENTE');
        }
        for (const i of l.items) mover(el.itens.find(x => x.itemId === i.itemId), 'reserva', regras.obterQuantidadePropriaOperacional(i));
        el.fase = 'reservado';
    } else {
        exigir(el.fase === 'reservado', 'RESERVA_ANTERIOR_NAO_COMPROVADA');
        if (d.tipo === 'cancelamento') {
            for (const at of el.itens) mover(at, 'liberacao', at.reservado);
            el.fase = 'cancelado';
        } else {
            for (const i of d.itens) {
                const at = el.itens.find(x => x.itemId === i.itemId);
                exigir(at && at.pecaReferencia === i.pecaReferencia, 'IDENTIDADE_ITEM_DIVERGENTE');
                const q = d.tipo === 'devolucao' ? soma(i.quantidadeDevolvida, i.quantidadeAvaria) : i.quantidade;
                exigir(q <= at.reservado, 'QUANTIDADE_EXCEDE_RESERVA');
                if (d.tipo === 'devolucao') { mover(at, 'devolucao', i.quantidadeDevolvida); mover(at, 'avaria', i.quantidadeAvaria); }
                else mover(at, 'liberacao', q);
            }
            if (el.itens.every(x => x.reservado === 0)) {
                const retornoCompleto = l.items.every(i => {
                    const at = el.itens.find(x => x.itemId === i.itemId);
                    return soma(at.devolvido, at.avariado) === regras.obterQuantidadePropriaOperacional(i);
                });
                el.fase = d.tipo === 'devolucao' && retornoCompleto ? 'devolvido' : 'liberado';
            }
        }
    }
    return e;
}
function replay(texto) {
    const ledger = json(texto);
    if (Object.hasOwn(ledger, 'origemTexto')) return replayRaiz(ledger);
    exigir(chaves(ledger, ['versao', 'baseTexto', 'eventos', 'estadoFinalTexto']) && ledger.versao === 2
        && Array.isArray(ledger.eventos) && ledger.eventos.length <= 1000, 'LEDGER_INVALIDO');
    const s = base(ledger.baseTexto); exigir(canon(s) === ledger.baseTexto, 'BASE_NAO_CANONICA');
    let e = inicial(s), predecessor = null; const ops = new Set();
    ledger.eventos.forEach((ev, indice) => {
        exigir(chaves(ev, ['sequencia', 'predecessor', 'comandoTexto', 'metadadosTexto', 'assinaturaCanonica', 'estadoAntesTexto', 'estadoDepoisTexto'])
            && ev.sequencia === indice + 1 && ev.predecessor === predecessor && ev.estadoAntesTexto === canon(e), 'PREDECESSOR_DIVERGENTE');
        const d = comando(ev.comandoTexto), m = metadados(ev.metadadosTexto);
        exigir(!ops.has(m.operacaoId), 'OPERACAO_DUPLICADA'); ops.add(m.operacaoId);
        const assinatura = canon({ sequencia: ev.sequencia, predecessor, comando: d, metadados: m });
        exigir(ev.assinaturaCanonica === assinatura, 'ASSINATURA_DIVERGENTE');
        e = transicao(s, e, d, m); exigir(ev.estadoDepoisTexto === canon(e), 'ESTADO_DIVERGENTE');
        predecessor = m.operacaoId;
    });
    exigir(ledger.estadoFinalTexto === canon(e), 'ESTADO_FINAL_DIVERGENTE'); return { ledger, s, estado: e };
}
export function criarLedgerEstoqueV2Texto(snapshotTexto, origemTexto = null) {
    try {
        if (origemTexto !== null) {
            const texto = decodificarTextoEstrito(snapshotTexto).texto;
            const ledger = { versao: 2, origemTexto: decodificarTextoEstrito(origemTexto).texto,
                baseTexto: texto, eventos: [], estadoFinalTexto: texto };
            replay(canon(ledger));
            return sucesso({ codigo: 'LEDGER_ORIGEM_COMPROVADA', ledgerTexto: canon(ledger) });
        }
        const s = base(snapshotTexto), ledger = { versao: 2, baseTexto: canon(s), eventos: [], estadoFinalTexto: canon(inicial(s)) };
        return sucesso({ codigo: 'LEDGER_CAUSAL_INICIAL', ledgerTexto: canon(ledger) });
    } catch (e) { return falha(e.message); }
}
export function reconciliarLedgerEstoqueV2Texto(ledgerTexto, snapshotTexto = null) {
    try { const r = replay(ledgerTexto);
        if (snapshotTexto !== null) exigir(r.snapshotTexto === decodificarTextoEstrito(snapshotTexto).texto, 'LEDGER_RAIZ_ORIGEM_DIVERGENTE');
        return sucesso({ codigo: 'LEDGER_CAUSAL_RECONCILIADO',
            ...(r.snapshotTexto ? { snapshotTexto: r.snapshotTexto } : { estadoTexto: canon(r.estado) }), eventos: r.ledger.eventos.length }); }
    catch (e) { return falha(e.message); }
}
export function planejarEventoLedgerEstoqueV2Texto(ledgerTexto, comandoTexto, metadadosTexto) {
    try {
        const r = replay(ledgerTexto), d = r.snapshotTexto ? json(comandoTexto) : comando(comandoTexto), m = metadados(metadadosTexto);
        const existente = r.ledger.eventos.find(ev => json(ev.metadadosTexto).operacaoId === m.operacaoId);
        if (existente) {
            // O timestamp de uma nova tentativa vem da autoridade, nao e uma
            // alteracao do comando original. A data registrada ja foi revalidada.
            exigir(existente.comandoTexto === canon(d)
                && json(existente.metadadosTexto).atorReferencia === m.atorReferencia, 'CONFLITO_OPERACAO_ID');
            return sucesso({ codigo: 'OPERACAO_HISTORICA_RECONHECIDA', ledgerTexto: canon(r.ledger), idempotente: true });
        }
        const sequencia = r.ledger.eventos.length + 1;
        exigir(sequencia <= 1000, 'LIMITE_LEDGER');
        const predecessor = sequencia === 1 ? null : json(r.ledger.eventos[sequencia - 2].metadadosTexto).operacaoId;
        let depoisTexto;
        if (r.snapshotTexto) {
            const origem = origemComprovada(r.ledger);
            const candidato = candidatoRaiz(r.snapshotTexto, canon(d), canon(m),
                sequencia === 1 ? origem.prova : null, origem.causal ? canon({ sequencia, predecessor }) : null);
            exigir(candidato.ok, candidato.motivo); depoisTexto = candidato.candidatoTexto;
        } else depoisTexto = canon(transicao(r.s, r.estado, d, m));
        const ev = { sequencia, predecessor, comandoTexto: canon(d), metadadosTexto: canon(m),
            assinaturaCanonica: canon({ sequencia, predecessor, comando: d, metadados: m }),
            estadoAntesTexto: r.snapshotTexto || canon(r.estado), estadoDepoisTexto: depoisTexto };
        const ledger = { ...r.ledger, eventos: [...r.ledger.eventos, ev], estadoFinalTexto: depoisTexto };
        replay(canon(ledger));
        return sucesso({ codigo: 'CANDIDATO_LEDGER_SEM_COMMIT', ledgerTexto: canon(ledger) });
    } catch (e) { return falha(e.message); }
}
