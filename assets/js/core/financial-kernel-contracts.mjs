import { obterRegrasInternasConfiaveis } from './financial-kernels.generated.mjs';
import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
import { validarEstruturaSnapshotIndexedDB } from './indexeddb-authority.mjs';

// Apenas bootstrap de ensaio. As capacidades internas nunca sao entregues a formularios.
const regras = obterRegrasInternasConfiaveis();
const falha = codigo => Object.freeze({ ok: false, codigo, requerRecuperacao: true });
function ler(texto) {
    const d = decodificarTextoEstrito(texto);
    if (!validarEstruturaSnapshotIndexedDB(d.texto)) throw new Error('SNAPSHOT_INVALIDO');
    return d;
}
function dataValida(data) {
    return typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)
        && Number.isFinite(Date.parse(`${data}T12:00:00.000Z`))
        && new Date(`${data}T12:00:00.000Z`).toISOString().slice(0, 10) === data;
}
export function consultarNucleoFinanceiro(regra, snapshotTexto, dataReferencia, locacaoReferencia = '') {
    try {
        if (typeof regra !== 'string' || !dataValida(dataReferencia)
            || typeof locacaoReferencia !== 'string') return falha('CONSULTA_INVALIDA');
        const { valor: s } = ler(snapshotTexto);
        let valor;
        switch (regra) {
        case 'receber': valor = regras.validarFundacaoReclassificacaoReceber(s, dataReferencia); break;
        case 'pagar': valor = regras.validarFundacaoContasPagar(s, dataReferencia)
            && regras.reconciliarHistoricoReclassificacoesPagar(s, dataReferencia).ok; break;
        case 'classificacoes': valor = regras.validarFundacaoClassificacoesFinanceiras(s); break;
        case 'conciliacoes': valor = regras.validarColecaoConciliacoesFinanceiras(s).ok === true
            && regras.validarColecaoConciliacoesPagamentosPagar(s) === true; break;
        case 'fluxo': valor = regras.obterProjecaoFluxoCaixaFinanceiro(s, dataReferencia); break;
        case 'consolidado': valor = regras.obterProjecaoConsolidadoFinanceiro(s, dataReferencia); break;
        case 'resultado': valor = regras.obterResultadoFinanceiroLocacao(s, locacaoReferencia, dataReferencia); break;
        default: return falha('REGRA_NAO_DISPONIVEL');
        }
        return Object.freeze({ ok: true, resultadoTexto: decodificarTextoEstrito(JSON.stringify(valor)).texto });
    } catch (_erro) { return falha('OPERACAO_REQUER_RECUPERACAO'); }
}

function validarComandoCatalogo(texto) {
    try {
        const p = decodificarTextoEstrito(texto).valor;
        return p && !Array.isArray(p) && Object.keys(p).sort().join('|')
            === 'acao|classificacao|codigo|dataReferencia|id|nome|referencia|situacao|tipoEntidade|vinculoPrimario|vinculoSecundario'
            && ['categoria', 'centro'].includes(p.tipoEntidade)
            && ['cadastrar', 'editar', 'inativar', 'reativar'].includes(p.acao)
            && !!regras.criarReferenciaTipadaClassificacaoFinanceira(p.tipoEntidade, p.id)
            && ['classificacao', 'codigo', 'nome', 'referencia', 'situacao', 'vinculoPrimario', 'vinculoSecundario']
                .every(k => typeof p[k] === 'string') && dataValida(p.dataReferencia);
    } catch (_erro) { return false; }
}

// Redutor puro ja existente. Recebe somente JSON e metadados primitivos emitidos
// pela autoridade; nao recebe snapshots de classificacao enviados pela interface.
export function reduzirCatalogoFinanceiroTexto(snapshotTexto, comandoTexto, metadadosTexto) {
    const original = ler(snapshotTexto);
    if (!validarComandoCatalogo(comandoTexto)) throw new Error('COMANDO_INVALIDO');
    const p = decodificarTextoEstrito(comandoTexto).valor;
    const m = decodificarTextoEstrito(metadadosTexto).valor;
    if (!m || Object.keys(m).sort().join('|') !== 'atorReferencia|operacaoId|timestamp'
        || typeof m.atorReferencia !== 'string' || !m.atorReferencia.trim()
        || typeof m.operacaoId !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId)
        || typeof m.timestamp !== 'string' || !Number.isFinite(Date.parse(m.timestamp))
        || new Date(m.timestamp).toISOString() !== m.timestamp) throw new Error('METADADOS_INVALIDOS');
    for (const dominio of ['receber', 'pagar', 'classificacoes', 'conciliacoes']) {
        const r = consultarNucleoFinanceiro(dominio, original.texto, p.dataReferencia);
        if (!r.ok || r.resultadoTexto !== 'true') throw new Error('OPERACAO_REQUER_RECUPERACAO');
    }
    const s = JSON.parse(original.texto);
    if (s.logsAuditoria.some(h => h.operacaoId === m.operacaoId)) throw new Error('OPERACAO_ID_CONFLITANTE');
    const entrada = { ...p, operacaoId: m.operacaoId, atualizadoEm: m.timestamp, responsavel: m.atorReferencia };
    const alvo = p.acao === 'cadastrar' ? null : regras.resolverClassificacaoFinanceira(p.referencia, p.tipoEntidade, s);
    if (alvo && alvo.estado !== 'encontrada') throw new Error('IDENTIDADE_NAO_RECONCILIADA');
    const plano = regras.dadosPlanoClassificacaoFinanceira(entrada, alvo?.registro || null);
    const assinatura = regras.assinaturaPlanoClassificacaoFinanceira(plano);
    const r = regras.aplicarPlanoClassificacaoFinanceira(s, entrada, plano, assinatura);
    if (!r || !regras.validarFundacaoClassificacoesFinanceiras(s)
        || !regras.localizarEvidenciaClassificacaoFinanceira(s, m.operacaoId).completo) throw new Error('CANDIDATO_INVALIDO');
    return decodificarTextoEstrito(JSON.stringify(s)).texto;
}

/** Registro PARCIAL: nunca preenche com true os dominios ainda nao extraidos.
 * O gateway permanece fechado sem conversoes, operacional e encargos completos.
 */
export function criarRegistroFinanceiroDeEnsaio(dataReferencia) {
    if (!dataValida(dataReferencia)) throw new TypeError('DATA_INVALIDA');
    const validadores = Object.fromEntries(['receber', 'pagar', 'classificacoes', 'conciliacoes'].map(d => [d, texto => {
        const r = consultarNucleoFinanceiro(d, texto, dataReferencia);
        return r.ok && r.resultadoTexto === 'true';
    }]));
    return Object.freeze({
        validadores: Object.freeze(validadores),
        comandos: Object.freeze({ 'catalogo.operar.v1': Object.freeze({
            validar: validarComandoCatalogo,
            aplicar: (anterior, dados, meta) => reduzirCatalogoFinanceiroTexto(anterior, dados, JSON.stringify(meta))
        }) }),
        pendentes: Object.freeze(['receber.criar.v1', 'receber.registrar.v1', 'receber.estornar.v1',
            'pagar.criar.v1', 'pagar.pagar.v1', 'pagar.estornar.v1', 'receber.conciliar.v1',
            'pagar.conciliar.v1', 'receber.reclassificar.v1', 'pagar.reclassificar.v1'])
    });
}

const CAMPOS_COMANDOS_MONETARIOS = Object.freeze({
    receber: ['locacaoReferencia', 'parcelaReferencia', 'valorRecebidoTexto', 'valorLancamentoTexto'],
    pagar: ['contaPagarReferencia', 'parcelaReferencia', 'valorPagoTexto', 'dataPagamento', 'dataReferencia', 'formaPagamento', 'descricao', 'comprovante'],
    estornar_recebimento: ['contaReferencia', 'parcelaReferencia', 'lancamentoOriginalReferencia', 'valorEstornoTexto', 'motivo'],
    estornar_pagamento: ['contaPagarReferencia', 'parcelaReferencia', 'pagamentoOriginalReferencia', 'valorEstornoTexto', 'dataEstorno', 'dataReferencia', 'motivo', 'comprovante'],
    conciliar_recebimento: ['contaReferencia', 'parcelaReferencia', 'lancamentoReferencia', 'situacao', 'valorBancarioTexto', 'dataBancaria', 'meioPagamento', 'contaFinanceira', 'identificadorBancario', 'motivoDivergencia', 'observacao', 'comprovante'],
    desconciliar_recebimento: ['contaReferencia', 'parcelaReferencia', 'lancamentoReferencia', 'conciliacaoOriginalReferencia', 'motivo'],
    conciliar_pagamento: ['contaPagarReferencia', 'parcelaReferencia', 'pagamentoReferencia', 'situacao', 'valorBancarioTexto', 'dataBancaria', 'dataReferencia', 'meioPagamento', 'contaFinanceira', 'identificadorBancario', 'motivoDivergencia', 'observacao', 'comprovante'],
    desconciliar_pagamento: ['contaPagarReferencia', 'parcelaReferencia', 'pagamentoReferencia', 'conciliacaoOriginalReferencia', 'dataReferencia', 'motivo']
});

export function validarDadosComandoMonetarioTexto(operacao, dadosTexto) {
    try {
        if (typeof operacao !== 'string' || !Object.hasOwn(CAMPOS_COMANDOS_MONETARIOS, operacao)) return false;
        const d = decodificarTextoEstrito(dadosTexto).valor;
        return !!d && !Array.isArray(d) && typeof d === 'object'
            && !Object.keys(d).some(k => !CAMPOS_COMANDOS_MONETARIOS[operacao].includes(k))
            && !Object.keys(d).some(k => k !== 'comprovante' && typeof d[k] !== 'string');
    } catch (_erro) { return false; }
}

/** Preparacao pura. Nao e registro de comando nem confirmacao de persistencia.
 * O bootstrap fornece os metadados; nenhum saldo/snapshot de registro e aceito
 * no DTO. Snapshot e lido da autoridade pelo futuro adaptador, nao do formulario.
 */
export function planejarFinanceiroTexto(operacao, snapshotTexto, dadosTexto, metadadosTexto) {
    try {
        if (typeof operacao !== 'string' || !Object.hasOwn(CAMPOS_COMANDOS_MONETARIOS, operacao))
            return falha('COMANDO_MONETARIO_INDISPONIVEL');
        const s = ler(snapshotTexto);
        const d = decodificarTextoEstrito(dadosTexto).valor;
        const m = decodificarTextoEstrito(metadadosTexto).valor;
        if (!validarDadosComandoMonetarioTexto(operacao, dadosTexto)) return falha('COMANDO_INVALIDO');
        if (!m || Array.isArray(m) || Object.keys(m).sort().join('|') !== 'atorReferencia|operacaoId|timestamp'
            || typeof m.atorReferencia !== 'string' || typeof m.operacaoId !== 'string'
            || typeof m.timestamp !== 'string' || !Number.isFinite(Date.parse(m.timestamp))
            || new Date(m.timestamp).toISOString() !== m.timestamp) return falha('METADADOS_INVALIDOS');
        if (!Number.isSafeInteger(s.valor.ultimaEdicao) || s.valor.ultimaEdicao < 0
            || s.valor.ultimaEdicao >= Number.MAX_SAFE_INTEGER) return falha('METADADOS_LEGADOS_REQUEREM_RECUPERACAO');
        const persistencia = { versao: s.valor.versao, data: m.timestamp, ultimaEdicao: s.valor.ultimaEdicao + 1 };
        // Nova copia de dados JSON internos; nao ha referencias de objetos externos.
        const entrada = { ...JSON.parse(JSON.stringify(d)), operacaoId: m.operacaoId, persistencia };
        if (['receber', 'estornar_recebimento'].includes(operacao)) {
            entrada.atualizadoEm = m.timestamp;
            entrada.atualizadoPor = m.atorReferencia;
        } else {
            entrada.responsavel = m.atorReferencia;
            if (['pagar', 'estornar_pagamento'].includes(operacao)) entrada.criadoEm = m.timestamp;
            else entrada.registradoEm = m.timestamp;
        }
        const plano = regras.planejarOperacaoMonetariaAutoritativaInterna(operacao, s.valor, entrada);
        if (plano.planejado !== true) return Object.freeze({ ok: false, codigo: plano.codigo,
            requerRecuperacao: plano.requerRecuperacao === true });
        const candidato = plano.idempotente ? s.valor : { versao: persistencia.versao,
            data: persistencia.data, ultimaEdicao: persistencia.ultimaEdicao, ...plano.candidato };
        return Object.freeze({ ok: true, codigo: plano.idempotente ? 'OPERACAO_JA_CONCLUIDA' : 'CANDIDATO_PLANEJADO',
            idempotente: plano.idempotente, snapshotTexto: decodificarTextoEstrito(JSON.stringify(candidato)).texto,
            publicado: false });
    } catch (_erro) { return falha('OPERACAO_REQUER_RECUPERACAO'); }
}
