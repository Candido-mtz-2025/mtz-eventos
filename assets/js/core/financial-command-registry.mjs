import { criarGatewayComandos } from './command-gateway.mjs';
import { decodificarTextoEstrito, validarIdentidadeBaseTexto } from './legacy-state-codec.mjs';
import { consultarNucleoFinanceiro, planejarFinanceiroTexto, validarDadosComandoMonetarioTexto } from './financial-kernel-contracts.mjs';
import { criarReconhecedorHistoricoFinanceiro } from './financial-history-recognition.mjs';
import { validarCatalogosRestauraveisTexto } from './financial-catalog-validation.generated.mjs';
import { obterRegrasInternasConfiaveis } from './financial-kernels.generated.mjs';
import { confirmarRaizLedgerEstoque, confirmarCatalogoTiposJournal, confirmarPropostasJournal } from './operational-stock-ledger.mjs';
import { comprovarConversoesJournalTexto } from './proposal-conversion-replay.mjs';

const regras = obterRegrasInternasConfiaveis();
export const COMANDOS_FINANCEIROS_ENSAIO = Object.freeze({
    'receber.registrar.v1': Object.freeze({ operacao: 'receber', permissao: 'alterar_pagamento' }),
    'pagar.pagar.v1': Object.freeze({ operacao: 'pagar', permissao: 'pagar_conta' }),
    'receber.estornar.v1': Object.freeze({ operacao: 'estornar_recebimento', permissao: 'alterar_pagamento' }),
    'pagar.estornar.v1': Object.freeze({ operacao: 'estornar_pagamento', permissao: 'estornar_pagamento_conta' }),
    'receber.conciliar.v1': Object.freeze({ operacao: 'conciliar_recebimento', permissao: 'conciliar_pagamento' }),
    'receber.desconsiderar.v1': Object.freeze({ operacao: 'desconciliar_recebimento', permissao: 'desconsiderar_conciliacao' }),
    'pagar.conciliar.v1': Object.freeze({ operacao: 'conciliar_pagamento', permissao: 'conciliar_pagamento_conta_pagar' }),
    'pagar.desconsiderar.v1': Object.freeze({ operacao: 'desconciliar_pagamento', permissao: 'desconsiderar_conciliacao_conta_pagar' })
});
const falha = (codigo, recuperar = false) => Object.freeze({ ok: false, codigo, requerRecuperacao: recuperar, publicado: false });
const igual = (a, b) => a === undefined || b === undefined ? a === b
    : decodificarTextoEstrito(JSON.stringify(a)).texto === decodificarTextoEstrito(JSON.stringify(b)).texto;
const chave = id => JSON.stringify([typeof id, id]);
function unicos(itens, campo) {
    const ids = new Set(), refs = new Set();
    for (const item of itens) {
        if (!item || !['number', 'string'].includes(typeof item.id) || ids.has(chave(item.id))
            || typeof item[campo] !== 'string' || refs.has(item[campo])) return false;
        ids.add(chave(item.id)); refs.add(item[campo]);
    }
    return true;
}

// Perfil de ensaio FECHADO. Nao substitui validadores de dominos dos Lotes 3-7.
function perfilSuportado(s, permitirTransporte = false, operacionalComprovado = false, tiposComprovados = false, propostasComprovadas = false, convertidas = []) {
    if (s.encargosFinanceiros.length || s.propostas.length && !(operacionalComprovado && propostasComprovadas)) return false;
    for (const k of ['pecas', 'devolucoes', 'transportes', 'movimentacoesEstoque', 'tipos', 'usuarios',
        'modelosChecklist', 'checklistsGerados', 'checklistMontagem', 'checklistEtapasMontagem']) {
        if (k === 'transportes' && permitirTransporte) continue;
        if (operacionalComprovado && ['pecas', 'devolucoes', 'movimentacoesEstoque'].includes(k)) continue;
        if (operacionalComprovado && tiposComprovados && k === 'tipos') continue;
        if (s[k].length) return false;
    }
    if (Object.keys(s.checklistConferencia).length) return false;
    for (const l of s.locacoes) {
        const conversaoComprovada = convertidas.some(c => Object.is(l.id, c.id)
            && igual(l.conversaoProposta, c.conversaoProposta));
        if ((Object.hasOwn(l, 'conversaoProposta') && !conversaoComprovada)
            || (!operacionalComprovado && Object.hasOwn(l, 'itensHistoricosRemovidos'))) return false;
        if (!operacionalComprovado && (['controleEdicao', 'estoqueReserva', 'historicoOperacional']
            .some(k => Object.hasOwn(l, k)) || (Object.hasOwn(l, 'items') && (!Array.isArray(l.items) || l.items.length)))) return false;
        // Sem inferencia para legados sem conta: falta integrar sua prova de origem.
        const ref = regras.criarReferenciaTipadaPagar('locacao', l.id);
        const contas = s.contasReceber.filter(c => c.locacaoReferencia === ref).length;
        if (contas !== 1 && !(conversaoComprovada && contas === 0)) return false;
    }
    return true;
}

function criacoesPagarIntegras(s) {
    for (const [tipo, colecao] of [['fornecedor', s.fornecedores], ['conta-pagar', s.contasPagar]]) {
        for (const registro of colecao) {
            const r = regras.obterEvidenciaCriacaoPagar(s, registro.operacaoId, tipo);
            if (!r.completo || r.registro !== registro || !registro.evidenciaCriacao) return false;
            const { assinaturaPlano, ...base } = registro.evidenciaCriacao;
            if (assinaturaPlano !== registro.assinaturaPlano || regras.assinaturaCriacaoPagar(tipo, base) !== assinaturaPlano
                || !igual(base.operacaoId, registro.operacaoId)) return false;
            const refCampo = tipo === 'fornecedor' ? 'fornecedorReferencia' : 'contaPagarReferencia';
            const idCampo = tipo === 'fornecedor' ? 'fornecedorId' : 'contaId';
            if (!igual(base[idCampo], registro.id) || base[refCampo] !== registro[refCampo]
                || base.criadoEm !== registro.criadoEm) return false;
            if (tipo === 'conta-pagar') {
                const reclassificada = registro.historico.some(h => h.acao === 'conta_pagar_reclassificada');
                if (base.previstoCentavos !== registro.previstoCentavos) return false;
                for (const k of ['fornecedorId', 'fornecedorReferencia', 'locacaoReferencia', 'propostaReferencia',
                    'originalCentavos', 'quantidadeParcelas', 'dataEmissao', 'categoriaFinanceiraReferencia',
                    'categoriaFinanceiraSnapshot', 'centroCustoReferencia', 'centroCustoSnapshot',
                    'classificacaoLegada', 'provenienciaCodigo', 'origem', 'categoria', 'centroCusto']) {
                    if (reclassificada && ['categoriaFinanceiraReferencia', 'categoriaFinanceiraSnapshot',
                        'centroCustoReferencia', 'centroCustoSnapshot', 'classificacaoLegada',
                        'provenienciaCodigo', 'origem', 'categoria', 'centroCusto'].includes(k)) continue;
                    if (!igual(base[k], registro[k])) return false;
                }
                if (!Array.isArray(base.parcelas) || base.parcelas.length !== registro.parcelas.length) return false;
                for (let i = 0; i < base.parcelas.length; i++) for (const k of ['parcelaId', 'parcelaReferencia', 'numero', 'originalCentavos']) {
                    if (!igual(base.parcelas[i][k], registro.parcelas[i][k])) return false;
                }
            }
        }
    }
    return true;
}

function catalogosIntegro(s, texto) {
    if (!validarCatalogosRestauraveisTexto(texto)) return false;
    for (const c of [...s.categoriasFinanceiras, ...s.centrosCusto]) for (const h of c.historico) {
        const { operacaoId: _id, assinaturaPlano, ...plano } = h.evidenciaOperacao;
        if (regras.assinaturaPlanoClassificacaoFinanceira(plano) !== assinaturaPlano) return false;
    }
    return true;
}

/** Valida uma raiz financeira completa SOMENTE no perfil sintetico suportado. */
function validarRaizFinanceiraEnsaioInterna(texto, dataReferencia, permitirTransporte, comprovacao = null, contexto = null) {
    try {
        const p = decodificarTextoEstrito(texto), s = p.valor;
        if (!Number.isSafeInteger(s.ultimaEdicao) || s.ultimaEdicao < 0 || s.ultimaEdicao >= Number.MAX_SAFE_INTEGER
            || typeof s.versao !== 'string' || !/^12(?:\.\d+){0,2}$/.test(s.versao)
            || typeof s.data !== 'string' || !Number.isFinite(Date.parse(s.data)) || new Date(s.data).toISOString() !== s.data) return false;
        for (const d of ['receber', 'pagar', 'classificacoes', 'conciliacoes']) {
            const r = consultarNucleoFinanceiro(d, p.texto, dataReferencia);
            if (!r.ok || r.resultadoTexto !== 'true') return false;
        }
        const operacional = confirmarRaizLedgerEstoque(comprovacao, p.texto);
        const tiposComprovados = confirmarCatalogoTiposJournal(comprovacao, p.texto);
        const propostasComprovadas = confirmarPropostasJournal(comprovacao, p.texto);
        const convertidas = operacional && propostasComprovadas
            ? comprovarConversoesJournalTexto(p.texto, contexto).map(p => JSON.parse(p.locacaoTexto)) : [];
        if (!perfilSuportado(s, permitirTransporte, operacional, tiposComprovados, propostasComprovadas, convertidas) || !catalogosIntegro(s, p.texto) || !criacoesPagarIntegras(s)) return false;
        if (!unicos(s.contasReceber.flatMap(c => c.parcelas), 'parcelaReferencia')
            || !unicos(s.contasPagar.flatMap(c => c.parcelas), 'parcelaReferencia')) return false;
        const primarios = [...s.fornecedores, ...s.contasReceber, ...s.contasPagar,
            ...s.categoriasFinanceiras.flatMap(c => c.historico), ...s.centrosCusto.flatMap(c => c.historico),
            ...s.locacoes.flatMap(l => l.financeiro?.lancamentosRecebimentos || []),
            ...s.contasReceber.flatMap(c => c.reclassificacoesFinanceiras || []),
            ...s.contasPagar.flatMap(c => [...(c.operacoesAdministrativas || []),
                ...c.historico.filter(h => h.acao === 'conta_pagar_reclassificada'),
                ...c.parcelas.flatMap(p => [...p.pagamentos, ...(p.estornos || [])])]),
            ...s.conciliacoesFinanceiras, ...s.conciliacoesPagamentosPagar];
        const ids = new Set();
        for (const r of primarios) {
            if (typeof r.operacaoId !== 'string' || ids.has(r.operacaoId)) return false;
            ids.add(r.operacaoId);
        }
        const primariosAP = new Set([...s.fornecedores, ...s.contasPagar,
            ...s.contasPagar.flatMap(c => [...(c.operacoesAdministrativas || []),
                ...c.historico.filter(h => h.acao === 'conta_pagar_reclassificada'),
                ...c.parcelas.flatMap(p => [...p.pagamentos, ...(p.estornos || [])])]),
            ...s.conciliacoesPagamentosPagar].map(r => r.operacaoId));
        return !s.logsAuditoria.some(h => (h.origem === 'contas_pagar' || ['criar_fornecedor', 'criar_conta_pagar'].includes(h.acao))
            && !primariosAP.has(h.operacaoId));
    } catch (_erro) { return false; }
}

export function validarRaizFinanceiraEnsaioTexto(texto, dataReferencia) {
    return validarRaizFinanceiraEnsaioInterna(texto, dataReferencia, false);
}

// Gate financeiro necessario, mas NAO suficiente: o registro operacional deve
// validar Transporte separadamente e restringir a importacao inicial.
export function validarFinanceiroComTransporteEnsaioTexto(texto, dataReferencia, comprovacaoOperacional = null, contexto = null) {
    return validarRaizFinanceiraEnsaioInterna(texto, dataReferencia, true, comprovacaoOperacional, contexto);
}

export function criarDescritoresFinanceirosDeEnsaio() {
    return Object.freeze(Object.fromEntries(Object.entries(COMANDOS_FINANCEIROS_ENSAIO).map(([tipo, d]) => [tipo, Object.freeze({
        validar: texto => validarDadosComandoMonetarioTexto(d.operacao, texto),
        reconhecerHistorico: criarReconhecedorHistoricoFinanceiro(d.operacao),
        aplicar: (anterior, dados, meta) => {
            const r = planejarFinanceiroTexto(d.operacao, anterior, dados, JSON.stringify(meta));
            if (!r.ok || r.idempotente) throw new Error(r.codigo);
            return r.snapshotTexto;
        }
    })])));
}

/** Nao carregado pelo index. Nunca cria autoridade ativa ou importa dados reais automaticamente. */
export function criarGatewayFinanceiroDeEnsaio(configuracao) {
    if (configuracao.ensaioSintetico !== true || typeof configuracao.nomeBanco !== 'string'
        || !/^mtz-idb-fundacao-lote1-teste-financeiro-[a-zA-Z0-9-]+$/.test(configuracao.nomeBanco)
        || typeof configuracao.obterAtorAutorizado !== 'function') throw new TypeError('ENSAIO_FINANCEIRO_EXPLICITO_OBRIGATORIO');
    const identidade = validarIdentidadeBaseTexto(configuracao.identidadeBaseTexto);
    if (!identidade.ok || !JSON.parse(identidade.texto).baseId.startsWith('ensaio-financeiro:')) throw new TypeError('BASE_DE_ENSAIO_OBRIGATORIA');
    const data = configuracao.dataReferencia;
    if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)
        || !Number.isFinite(Date.parse(`${data}T12:00:00Z`)) || new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) !== data) throw new TypeError('DATA_INVALIDA');
    const comandos = criarDescritoresFinanceirosDeEnsaio();
    const permissao = tipo => tipo === '@inicializar' ? 'restaurar_backup' : tipo === 'ler'
        ? 'visualizar_fluxo_caixa' : COMANDOS_FINANCEIROS_ENSAIO[tipo]?.permissao;
    const ator = tipo => { try { const acao = permissao(tipo); return acao ? configuracao.obterAtorAutorizado(acao) : null; } catch (_erro) { return null; } };
    const validar = texto => validarRaizFinanceiraEnsaioTexto(texto, data);
    // Todos os dominios passam pelo gate estrito; os nao integrados sao recusados
    // pelo perfil, em vez de receberem um validador que aprove qualquer estado.
    const validadores = Object.fromEntries(['receber', 'pagar', 'classificacoes', 'conciliacoes', 'conversoes', 'operacional', 'encargos'].map(k => [k, validar]));
    const gateway = criarGatewayComandos({ ...configuracao, validadores, comandos, autorizar: ator });
    const tipos = new WeakMap();
    const conferir = (r, tipo, esperado) => {
        if (!r.ok) return r;
        const autor = r.recibo?.atorReferencia || r.comprovacao?.atorReferencia || esperado;
        if (typeof autor !== 'string' || ator(tipo) !== autor) return falha(r.codigo === 'COMMIT_CONFIRMADO'
            ? 'ESTADO_CONFIRMADO_REQUER_RECUPERACAO' : 'PERMISSAO_NEGADA', r.codigo === 'COMMIT_CONFIRMADO');
        return r;
    };
    return Object.freeze({ ...gateway, perfil: 'ensaio-financeiro-restrito-v1', comandosDisponiveis: Object.freeze(Object.keys(comandos)),
        async prepararImportacao(id, texto) { const r = await gateway.prepararImportacao(id, texto); if (r.ok) tipos.set(r.entrada, '@inicializar'); return r; },
        async prepararComando(id, tipo, revisao, dados) { const r = await gateway.prepararComando(id, tipo, revisao, dados); if (r.ok) tipos.set(r.entrada, tipo); return r; },
        async executar(entrada) { const tipo = tipos.get(entrada); return conferir(await gateway.executar(entrada), tipo); },
        async recuperarResultado(entrada) { const tipo = tipos.get(entrada); return conferir(await gateway.recuperarResultado(entrada), tipo); },
        async ler() { const antes = ator('ler'); return conferir(await gateway.ler(), 'ler', antes); }
    });
}
