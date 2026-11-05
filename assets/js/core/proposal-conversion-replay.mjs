import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
import { consultarContextoJournal } from './indexeddb-authority.mjs';
import { criarNucleoConfiavel } from './proposal-conversion.generated.mjs';
import { criarNucleoConfiavel as criarUtil } from './proposal-plan-utils.generated.mjs';
import { criarNucleoConfiavel as criarDominio } from './proposal-plan-domain.generated.mjs';
import { criarNucleoConfiavel as criarTransporte } from './proposal-plan-transport.generated.mjs';
import { criarNucleoConfiavel as criarPlano } from './proposal-plan.generated.mjs';

const regras = criarNucleoConfiavel();
const canon = valor => decodificarTextoEstrito(JSON.stringify(valor)).texto;
const falha = codigo => Object.freeze({ ok: false, codigo, publicado: false });
const util = criarUtil();
export const COMANDO_CONVERSAO_PROPOSTA = 'proposta.converter_em_locacao.v1';
const candidatosConversao = new WeakMap();

export function validarIntencaoConversaoTexto(texto) {
    try {
        const d = decodificarTextoEstrito(texto).valor;
        return d !== null && Object.keys(d).join('|') === 'propostaReferencia'
            && typeof d.propostaReferencia === 'string' && d.propostaReferencia.startsWith('proposta:');
    } catch (_) { return false; }
}

export function reduzirConversaoJournalTexto(anterior, intencao, metadados, capacidade) {
    const ctx = consultarContextoJournal(capacidade);
    if (!ctx || !['aplicar', 'validar'].includes(ctx.fase)
        || ctx.tipo !== COMANDO_CONVERSAO_PROPOSTA || ctx.dominio !== 'propostas'
        || ctx.snapshotAnteriorTexto !== anterior || ctx.dadosTexto !== intencao
        || ctx.operacaoId !== metadados?.operacaoId || ctx.atorReferencia !== metadados?.atorReferencia
        || ctx.timestamp !== metadados?.timestamp || ctx.revisao !== ctx.revisaoAnterior + 1
        || ctx.eventosAnteriores.length !== ctx.revisao || ctx.revisao < 1)
        throw Error('CONTEXTO_CONVERSAO_INVALIDO');
    if (candidatosConversao.has(capacidade)) return candidatosConversao.get(capacidade);
    const r = planejarConversaoAutoritativaTexto(anterior, intencao, canon({
        operacaoId: ctx.operacaoId, atorReferencia: ctx.atorReferencia, timestamp: ctx.timestamp
    }));
    if (!r.ok) throw Error(r.codigo);
    if (ctx.fase === 'validar' && ctx.snapshotPosteriorTexto !== r.snapshotTexto)
        throw Error('REPLAY_CONVERSAO_DIVERGENTE');
    candidatosConversao.set(capacidade, r.snapshotTexto);
    return r.snapshotTexto;
}

const provasConversao = new WeakMap();
const provasConversaoPrefixo = new WeakMap();
const semConversoes = Object.freeze([]);

export function comprovarConversoesJournalTexto(texto, capacidade, somentePrefixo = false) {
    const c = consultarContextoJournal(capacidade);
    if (somentePrefixo ? (!c || c.snapshotAnteriorTexto !== texto)
        : (c?.fase !== 'validar' || c.snapshotPosteriorTexto !== texto)) return semConversoes;
    const cache = somentePrefixo ? provasConversaoPrefixo : provasConversao;
    if (cache.has(capacidade)) return cache.get(capacidade);
    const eventos = c.eventosAnteriores;
    const provas = [];
    function incluir(antes, depois, operacaoId) {
        const anterior = JSON.parse(antes), posterior = JSON.parse(depois);
        for (const k of ['contasReceber', 'contasPagar', 'pecas', 'movimentacoesEstoque', 'devolucoes'])
            if (canon(anterior[k]) !== canon(posterior[k])) throw Error('EFEITO_CONVERSAO_INDEVIDO');
        const adicionados = k => posterior[k].filter(x => !anterior[k].some(a => Object.is(a.id, x.id)));
        const locacoes = adicionados('locacoes'), clientes = adicionados('locadores');
        const locacao = locacoes[0];
        if (locacoes.length !== 1 || locacao.conversaoProposta?.operacaoId !== operacaoId
            || locacao.estoqueReserva?.status !== 'nao_reservado') throw Error('LOCACAO_CONVERSAO_DIVERGENTE');
        if (clientes.length > 1 || (clientes.length && (!Object.is(clientes[0].id, locacao.clienteId)
            || clientes[0].conversaoProposta?.operacaoId !== operacaoId))) throw Error('CLIENTE_CONVERSAO_DIVERGENTE');
        const transportes = adicionados('transportes');
        if (transportes.some(t => !Object.is(t.locacaoId, locacao.id)
            || t.conversaoProposta?.operacaoId !== operacaoId)) throw Error('TRANSPORTE_CONVERSAO_DIVERGENTE');
        provas.push(Object.freeze({ locacaoTexto: canon(locacao), clienteTexto: clientes.length ? canon(clientes[0]) : null,
            transportesTexto: canon(transportes) }));
    }
    // A autoridade so emite este prefixo apos reproduzir e conferir cada revisao.
    for (const [i, e] of eventos.entries()) {
        if (e.tipo === COMANDO_CONVERSAO_PROPOSTA)
            incluir(eventos[i - 1].snapshotTexto, e.snapshotTexto, e.operacaoId);
    }
    if (!somentePrefixo && c.tipo === COMANDO_CONVERSAO_PROPOSTA) {
        const { snapshotAnteriorTexto, dadosTexto, operacaoId, atorReferencia, timestamp } = c;
        reduzirConversaoJournalTexto(snapshotAnteriorTexto, dadosTexto, { operacaoId, atorReferencia, timestamp }, capacidade);
        incluir(snapshotAnteriorTexto, texto, operacaoId);
    }
    Object.freeze(provas);
    cache.set(capacidade, provas);
    return provas;
}

// A revisao e a chave pertencem ao envelope do journal, nao aos dados comerciais.
export function planejarConversaoAutoritativaTexto(snapshotTexto, intencaoTexto, metadadosTexto) {
    try {
        const s = decodificarTextoEstrito(snapshotTexto).valor;
        const d = decodificarTextoEstrito(intencaoTexto).valor;
        const m = decodificarTextoEstrito(metadadosTexto).valor;
        if (!validarIntencaoConversaoTexto(intencaoTexto))
            return falha('INTENCAO_CONVERSAO_INVALIDA');
        if (!m || Object.keys(m).sort().join('|') !== 'atorReferencia|operacaoId|timestamp'
            || typeof m.operacaoId !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId)
            || typeof m.atorReferencia !== 'string' || !m.atorReferencia.trim()
            || typeof m.timestamp !== 'string' || new Date(m.timestamp).toISOString() !== m.timestamp)
            return falha('METADADOS_INVALIDOS');
        const alvo = util.resolverRegistroPorReferenciaTipada(s.propostas, 'proposta', d.propostaReferencia);
        if (!alvo.encontrado) return falha(alvo.codigo);
        const p = alvo.registro;
        if (p.status !== 'aprovada') return falha('PROPOSTA_NAO_APROVADA');
        const instante = Date.parse(m.timestamp);
        class RelogioAutoritativo extends Date {
            constructor(...args) { super(...(args.length ? args : [instante])); }
            static now() { return instante; }
        }
        const alocar = (tipo, colecao) => {
            const base = `conversao:${tipo}:${m.operacaoId}`;
            const ocupados = new Set(colecao.map(x => x.id));
            for (let i = 0; i <= ocupados.size; i++) {
                const id = i ? `${base}:${i}` : base;
                if (!ocupados.has(id)) return id;
            }
            throw Error('IDENTIDADE_INDISPONIVEL');
        };
        const ambiente = { ...util, Date: RelogioAutoritativo, config: s.config, locadores: s.locadores,
            pecas: s.pecas, devolucoes: s.devolucoes };
        const dominio = criarDominio({ ...ambiente,
            localStorage: { getItem: chave => chave === 'usuarioEmail' ? m.atorReferencia : null } });
        const transporte = criarTransporte(ambiente);
        const montagem = criarPlano({ ...ambiente, ...dominio, ...transporte, structuredClone,
            sincronizarFinanceiroLocacao: l => dominio.normalizarLocacaoDominio(l, { incluirDerivados: false }) });
        const cliente = montagem.planejarClienteDaProposta(p, s.locadores, () => alocar('cliente', s.locadores));
        if (!cliente.ok) return falha(cliente.codigo);
        const r = montagem.montarPlanoConversaoPropostaInterno(p, cliente, {
            hojeIso: m.timestamp.slice(0, 10), agoraIso: m.timestamp, responsavelConversao: m.atorReferencia,
            propostaReferencia: d.propostaReferencia, novaLocacaoId: alocar('locacao', s.locacoes),
            resolverPeca: item => montagem.encontrarPecaPorDescricao(item, s.pecas)
        });
        if (!r.ok) return falha('PLANO_CONVERSAO_INVALIDO');
        return reconstruirConversaoPropostaTexto(snapshotTexto, canon(r.plano), metadadosTexto);
    } catch (_) { return falha('OPERACAO_REQUER_RECUPERACAO'); }
}

// Consumidor interno de um plano legado. Nao e um descritor de comando:
// o futuro gateway deve construir o plano a partir da raiz e da intencao.
export function reconstruirConversaoPropostaTexto(snapshotTexto, planoInternoTexto, metadadosTexto) {
    try {
        const { versao, data: _data, ultimaEdicao, ...estado } = decodificarTextoEstrito(snapshotTexto).valor;
        const plano = decodificarTextoEstrito(planoInternoTexto).valor;
        const m = decodificarTextoEstrito(metadadosTexto).valor;
        if (!plano || Object.keys(plano).sort().join('|') !== 'cliente|locacao|propostaReferencia|transportes'
            || typeof plano.propostaReferencia !== 'string' || !m
            || Object.keys(m).sort().join('|') !== 'atorReferencia|operacaoId|timestamp'
            || typeof m.operacaoId !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId)
            || typeof m.atorReferencia !== 'string' || !m.atorReferencia.trim()
            || typeof m.timestamp !== 'string' || new Date(m.timestamp).toISOString() !== m.timestamp
            || typeof versao !== 'string' || !Number.isSafeInteger(ultimaEdicao)
            || ultimaEdicao < 0 || ultimaEdicao === Number.MAX_SAFE_INTEGER) return falha('ENTRADA_CONVERSAO_INVALIDA');
        const persistencia = { versao, data: m.timestamp, ultimaEdicao: ultimaEdicao + 1 };
        const entrada = { propostaReferencia: plano.propostaReferencia, operacaoId: m.operacaoId,
            atualizadoPor: m.atorReferencia, atualizadoEm: m.timestamp, persistencia, plano };
        if (estado.logsAuditoria.some(a => a.operacaoId === m.operacaoId)
            || regras.existemVestigiosConversaoProposta(estado, entrada)) return falha('OPERACAO_REQUER_RECUPERACAO');
        const resultado = regras.construirCandidatoConversaoPropostaInterno(
            estado, entrada, regras.assinaturaConversaoProposta(entrada));
        if (!resultado.ok) return falha(resultado.codigo);
        return Object.freeze({ ok: true, snapshotTexto: canon({ ...persistencia, ...resultado.candidato }),
            locacaoReferencia: resultado.locacaoReferencia, publicado: false });
    } catch (_) { return falha('OPERACAO_REQUER_RECUPERACAO'); }
}
