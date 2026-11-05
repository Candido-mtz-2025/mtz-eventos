import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
import { criarNucleoConfiavel as criarHistorico } from './operational-stock-history.generated.mjs';
import { criarNucleoConfiavel as criarLeitores } from './operational-stock-read.generated.mjs';
import { consultarEstoqueTipadoTexto } from './operational-stock-contracts.mjs';

// Contratos inativos. Texto primitivo e a unica fronteira externa; nao ha I/O.
const historico = criarHistorico(), leitores = criarLeitores();
const dominios = new Set(['peca', 'locacao', 'proposta', 'movimento', 'reserva']);
const tiposMovimento = new Set(['reserva', 'liberacao', 'retirada', 'devolucao', 'avaria', 'perda']);
const quantidade = n => Number.isSafeInteger(n) && n >= 0;
const idValido = id => (typeof id === 'number' && Number.isSafeInteger(id) && !Object.is(id, -0))
    || (typeof id === 'string' && id.length > 0 && id.length <= 16384 && id.trim() === id && !/[\u0000-\u001f]/.test(id));
const canonico = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
const igual = (a, b) => canonico(a) === canonico(b);
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exigir = (condicao, motivo) => { if (!condicao) throw new Error(motivo); };
const somar = (a, b) => { exigir(quantidade(a) && quantidade(b) && quantidade(a + b), 'QUANTIDADE_FORA_DO_LIMITE'); return a + b; };
const falha = motivo => Object.freeze({ ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', motivo,
    requerRecuperacao: true, gravado: false, publicado: false });
const congelar = v => { if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); } return v; };
const sucesso = dados => congelar({ ok: true, ...dados, gravado: false, publicado: false });
const chaves = (v, nomes) => objeto(v) && igual(Object.keys(v).sort(), nomes.slice().sort());
const continuidadesCheckpoint = new WeakMap();

export function criarReferenciaEstoque(tipo, id) {
    return typeof tipo === 'string' && dominios.has(tipo) && idValido(id)
        ? `${tipo}:${encodeURIComponent(JSON.stringify([typeof id, id]))}` : null;
}
function lerReferencia(tipo, valor) {
    exigir(typeof valor === 'string' && valor.startsWith(`${tipo}:`), 'REFERENCIA_INVALIDA');
    const partes = JSON.parse(decodeURIComponent(valor.slice(tipo.length + 1)));
    exigir(Array.isArray(partes) && partes.length === 2 && typeof partes[1] === partes[0]
        && criarReferenciaEstoque(tipo, partes[1]) === valor, 'REFERENCIA_NAO_CANONICA');
    return partes[1];
}
function itemRef(locacaoId, itemId) {
    exigir(idValido(locacaoId) && typeof itemId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(itemId), 'ITEM_INVALIDO');
    return `item-estoque-v2:${encodeURIComponent(JSON.stringify([[typeof locacaoId, locacaoId], itemId]))}`;
}
function resolver(lista, tipo, referencia) {
    lerReferencia(tipo, referencia);
    const encontrados = lista.filter(r => criarReferenciaEstoque(tipo, r.id) === referencia);
    exigir(encontrados.length === 1, 'REFERENCIA_AUSENTE_OU_DUPLICADA'); return encontrados[0];
}
function indiceRaiz(texto) {
    const s = decodificarTextoEstrito(texto).valor;
    exigir(objeto(s), 'RAIZ_INVALIDA');
    for (const [colecao, tipo] of [['pecas', 'peca'], ['locacoes', 'locacao'], ['propostas', 'proposta'],
        ['movimentacoesEstoque', 'movimento']]) {
        exigir(Array.isArray(s[colecao]), 'COLECAO_AUSENTE'); const ids = new Set();
        for (const r of s[colecao]) {
            exigir(objeto(r), 'REGISTRO_INVALIDO'); const ref = criarReferenciaEstoque(tipo, r.id);
            exigir(ref && !ids.has(ref), 'ID_INVALIDO_OU_DUPLICADO'); ids.add(ref);
        }
    }
    exigir(Array.isArray(s.logsAuditoria) && Array.isArray(s.devolucoes), 'EVIDENCIAS_AUSENTES');
    const chavesMovimento = new Set();
    for (const m of s.movimentacoesEstoque) {
        exigir(typeof m.chaveIdempotencia === 'string' && m.chaveIdempotencia.length > 0
            && !chavesMovimento.has(m.chaveIdempotencia), 'MOVIMENTO_CHAVE_CONFLITANTE');
        chavesMovimento.add(m.chaveIdempotencia);
    }
    for (const l of s.locacoes) {
        exigir(Array.isArray(l.items), 'ITENS_AUSENTES'); const itens = new Set();
        for (const i of l.items) {
            exigir(objeto(i), 'ITEM_INVALIDO'); const ref = itemRef(l.id, i.itemId);
            exigir(!itens.has(ref), 'ITEM_DUPLICADO'); itens.add(ref);
            const terceirizadoSemPeca = (i.pecaId === '' || i.pecaId == null)
                && i.origemCusto === 'terceirizado' && i.quantidade > 0
                && i.quantidadePropria === 0 && i.quantidadeTerceirizada === i.quantidade;
            if (!terceirizadoSemPeca) resolver(s.pecas, 'peca', criarReferenciaEstoque('peca', i.pecaId));
            for (const k of ['quantidade', 'quantidadePropria', 'quantidadeTerceirizada', 'devolvidos', 'avariadosEstoqueProprio']) {
                if (k === 'quantidade' || Object.hasOwn(i, k)) exigir(quantidade(i[k]), 'QUANTIDADE_INVALIDA');
            }
            const propria = leitores.obterQuantidadePropriaOperacional(i);
            exigir(quantidade(propria) && propria <= i.quantidade
                && somar(i.devolvidos ?? 0, i.avariadosEstoqueProprio ?? 0) <= propria, 'COMPOSICAO_ITEM_INVALIDA');
            if (Object.hasOwn(i, 'quantidadeTerceirizada')) exigir(somar(propria, i.quantidadeTerceirizada) === i.quantidade, 'COMPOSICAO_ITEM_INVALIDA');
        }
    }
    return s;
}

// Valida apenas o cadastro operacional. Nao emite snapshot de reserva ou
// prova para o journal: a origem da locacao ainda precisa de replay.
export function validarIdentidadeItensLocacaoTexto(snapshotTexto, locacaoReferencia) {
    try {
        const s = indiceRaiz(snapshotTexto);
        const l = resolver(s.locacoes, 'locacao', locacaoReferencia);
        propostaDaLocacao(s, l);
        return sucesso({ codigo: 'IDENTIDADE_ITENS_LOCACAO_VALIDADA' });
    } catch (e) { return falha(e.message); }
}
function propostaDaLocacao(s, l) {
    const temId = Object.hasOwn(l, 'propostaId') && l.propostaId !== null && l.propostaId !== '';
    const temRef = Object.hasOwn(l, 'propostaReferencia') && l.propostaReferencia !== null && l.propostaReferencia !== '';
    if (!temId && !temRef) return null;
    const ref = temRef ? l.propostaReferencia : criarReferenciaEstoque('proposta', l.propostaId);
    const p = resolver(s.propostas, 'proposta', ref);
    exigir(!temId || criarReferenciaEstoque('proposta', l.propostaId) === criarReferenciaEstoque('proposta', p.id), 'PROPOSTA_CONTRADITORIA');
    return ref;
}
function snapshotV2(s, l) {
    return historico.criarSnapshotReservaTipadoV2Interno(s, l);
}

// Construcao pura a partir da raiz da autoridade, nao um snapshot pronto da UI.
export function construirIdentidadeReservaV2Texto(snapshotTexto, locacaoReferencia) {
    try {
        const s = indiceRaiz(snapshotTexto), l = resolver(s.locacoes, 'locacao', locacaoReferencia);
        return sucesso({ codigo: 'CONTRATO_IDENTIDADE_RESERVA_V2', contratoTexto: canonico(snapshotV2(s, l)) });
    } catch (e) { return falha(e.message); }
}
export function validarIdentidadeReservaV2Texto(snapshotTexto, contratoTexto, locacaoReferencia) {
    try {
        const esperado = construirIdentidadeReservaV2Texto(snapshotTexto, locacaoReferencia);
        exigir(esperado.ok && decodificarTextoEstrito(contratoTexto).texto === esperado.contratoTexto, 'CONTRATO_RESERVA_DIVERGENTE');
        return sucesso({ codigo: 'IDENTIDADE_RESERVA_VALIDADA' });
    } catch (e) { return falha(e.message); }
}

function chaveV2(d) {
    return `movimento-estoque-v2:${encodeURIComponent(JSON.stringify([d.operacaoId, d.tipo,
        d.locacaoReferencia, d.itemReferencia, d.pecaReferencia]))}`;
}
function dtoMovimento(texto) {
    const d = decodificarTextoEstrito(texto).valor;
    exigir(chaves(d, ['locacaoReferencia', 'itemId', 'pecaReferencia', 'tipo', 'quantidade'])
        && tiposMovimento.has(d.tipo) && quantidade(d.quantidade) && d.quantidade > 0, 'INTENCAO_MOVIMENTO_INVALIDA');
    lerReferencia('locacao', d.locacaoReferencia); lerReferencia('peca', d.pecaReferencia); return d;
}
function metaMovimento(texto) {
    const m = decodificarTextoEstrito(texto).valor;
    exigir(chaves(m, ['operacaoId', 'atorReferencia', 'timestamp']) && typeof m.operacaoId === 'string'
        && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId) && typeof m.atorReferencia === 'string'
        && m.atorReferencia.trim().length > 0 && typeof m.timestamp === 'string'
        && new Date(m.timestamp).toISOString() === m.timestamp, 'METADADOS_INVALIDOS'); return m;
}
function vinculo(s, d, m) {
    const l = resolver(s.locacoes, 'locacao', d.locacaoReferencia), itens = l.items.filter(i => i.itemId === d.itemId);
    exigir(itens.length === 1 && criarReferenciaEstoque('peca', itens[0].pecaId) === d.pecaReferencia, 'VINCULO_ITEM_DIVERGENTE');
    const i = itens[0], propria = leitores.obterQuantidadePropriaOperacional(i);
    exigir(d.quantidade <= propria, 'QUANTIDADE_EXCEDE_ITEM');
    if (['devolucao', 'avaria', 'perda', 'liberacao'].includes(d.tipo)) {
        exigir(d.quantidade <= leitores.obterQuantidadePropriaPendenteItem(i), 'QUANTIDADE_EXCEDE_PENDENTE');
    }
    const v = { versao: 2, ...m, ...d, locacaoId: l.id, pecaId: i.pecaId, itemReferencia: itemRef(l.id, i.itemId),
        propostaReferencia: propostaDaLocacao(s, l), reservaReferencia: criarReferenciaEstoque('reserva', d.locacaoReferencia) };
    v.chaveIdempotencia = chaveV2(v); v.id = v.chaveIdempotencia;
    v.movimentoReferencia = criarReferenciaEstoque('movimento', v.id);
    // Uma chave longa e valida como identidade interna; nao passa por limite de ID de UI.
    exigir(v.movimentoReferencia !== null, 'CHAVE_MOVIMENTO_FORA_DO_LIMITE');
    return v;
}

/** Somente plano de identidade: NAO e candidato de reserva/devolucao. Nao muda
 * quantidades, status, caixa ou historico; nunca registrado como comando de aba. */
export function planejarIdentidadeMovimentoTexto(snapshotTexto, intencaoTexto, metadadosTexto) {
    try {
        const s = indiceRaiz(snapshotTexto), d = dtoMovimento(intencaoTexto), m = metaMovimento(metadadosTexto);
        const v = vinculo(s, d, m);
        for (const atual of s.movimentacoesEstoque) {
            exigir(atual.id !== v.id && atual.chaveIdempotencia !== v.chaveIdempotencia, 'CHAVE_MOVIMENTO_JA_EXISTENTE');
        }
        return sucesso({ codigo: 'PLANO_IDENTIDADE_SEM_COMMIT', vinculoTexto: canonico(v), comandoDisponivel: false });
    } catch (e) { return falha(e.message); }
}
export function validarVinculoMovimentoV2Texto(snapshotTexto, vinculoTexto) {
    try {
        const s = indiceRaiz(snapshotTexto), v = decodificarTextoEstrito(vinculoTexto).valor;
        const d = dtoMovimento(canonico({ locacaoReferencia: v.locacaoReferencia, itemId: v.itemId,
            pecaReferencia: v.pecaReferencia, tipo: v.tipo, quantidade: v.quantidade }));
        const m = metaMovimento(canonico({ operacaoId: v.operacaoId, atorReferencia: v.atorReferencia, timestamp: v.timestamp }));
        exigir(igual(v, vinculo(s, d, m)), 'VINCULO_MOVIMENTO_ADULTERADO');
        return sucesso({ codigo: 'VINCULO_MOVIMENTO_VALIDADO' });
    } catch (e) { return falha(e.message); }
}

const clonar = v => ({ ok: true, valor: JSON.parse(JSON.stringify(v)), json: JSON.stringify(v) });
function provarUltimoAjuste(s, l, original) {
    const c = l.controleEdicao;
    if (!objeto(c) || typeof c.ultimaOperacaoId !== 'string' || !c.ultimaOperacaoId) return null;
    const op = c.ultimaOperacaoId;
    const historicos = s.locacoes.flatMap(loc => (loc.historicoOperacional || []).filter(h => h.operacaoId === op).map(h => ({ loc, h })));
    const auditorias = s.logsAuditoria.filter(a => a.operacaoId === op);
    exigir(historicos.length === 1 && auditorias.length === 1, 'EVIDENCIA_AUSENTE_OU_DUPLICADA');
    const { loc, h } = historicos[0], a = auditorias[0], p = h.provasRecuperacao;
    if (!p || !a.provasRecuperacao) return null;
    exigir(loc.id === l.id && h.locacaoId === l.id && a.locacaoId === l.id && a.entidade === 'locacao' && a.entidadeId === l.id
        && h.acao === 'ajuste_reserva_locacao' && a.acao === h.acao
        && p.versao === 1 && p.operacaoId === op && p.assinaturaPlano === h.assinaturaPlano
        && /^ajuste-reserva-v1:fnv1a64:[a-f0-9]{16}$/.test(p.assinaturaPlano)
        && h.assinaturaPlano === a.assinaturaPlano && igual(p, a.provasRecuperacao)
        && quantidade(h.revisaoAnterior) && quantidade(h.revisaoNova)
        && h.revisaoNova === c.revisao && h.revisaoAnterior + 1 === h.revisaoNova
        && p.revisaoAnterior === h.revisaoAnterior && p.revisaoPosterior === h.revisaoNova
        && a.revisaoAnterior === h.revisaoAnterior && a.revisaoNova === h.revisaoNova
        && typeof h.data === 'string' && new Date(h.data).toISOString() === h.data
        && h.data === c.atualizadoEm && a.data === h.data && original.capturadoEm === h.data
        && typeof h.usuario === 'string' && h.usuario.trim().length > 0
        && h.usuario === c.atualizadoPor && a.usuario === h.usuario, 'EVIDENCIA_CONTRADITORIA');
    for (const k of ['fingerprintEstadoAnterior', 'fingerprintEstadoPosterior', 'fingerprintLocacaoAnterior', 'fingerprintLocacaoPosterior']) {
        exigir(typeof p[k] === 'string' && /^recuperacao-estado-v1:fnv1a64:[a-f0-9]{16}$/.test(p[k]), 'PROVA_RECUPERACAO_INCOMPLETA');
    }
    const identidade = { locacaoId: l.id, operacaoId: op, assinaturaPlano: h.assinaturaPlano };
    const estado = historico.gerarFingerprintRecuperacao(s, clonar, identidade, 'estado');
    const local = historico.gerarFingerprintRecuperacao(l, clonar, identidade, 'locacao');
    // Sem reconstruir eventos posteriores, nao inferir que o checkpoint atual
    // equivale a um checkpoint historico antigo.
    if (!estado.ok || estado.fingerprint !== p.fingerprintEstadoPosterior
        || !local.ok || local.fingerprint !== p.fingerprintLocacaoPosterior) return null;
    const movimentos = s.movimentacoesEstoque.filter(m => m.operacaoId === op);
    exigir(Array.isArray(h.movimentacaoIds) && new Set(h.movimentacaoIds).size === h.movimentacaoIds.length
        && movimentos.length === h.movimentacaoIds.length && a.quantidadeMovimentacoes === movimentos.length
        && igual(movimentos.map(m => m.id).sort(), h.movimentacaoIds.slice().sort()), 'LISTA_MOVIMENTOS_DIVERGENTE');
    for (const m of movimentos) {
        const itens = l.items.filter(i => i.itemId === m.itemId);
        exigir(itens.length === 1 && m.locacaoId === l.id && m.pecaId === itens[0].pecaId
            && m.assinaturaPlano === h.assinaturaPlano && m.origemEvento === 'ajuste_transacional_reserva_locacao'
            && m.tipoMovimentacao === 'ajuste' && ['reserva_ajuste', 'liberacao_ajuste'].includes(m.subtipoMovimentacao)
            && m.statusProcessamento === 'confirmado' && m.revisaoAnterior === h.revisaoAnterior && m.revisaoNova === h.revisaoNova
            && m.dataHora === h.data && m.usuario === h.usuario
            && m.id === historico.chaveMovimentacao(op, l.id, m.subtipoMovimentacao, m.itemId, m.pecaId)
            && m.movimentacaoId === m.id && m.chaveIdempotencia === m.id
            && quantidade(m.quantidade) && m.quantidade > 0, 'MOVIMENTO_CONTRADITORIO');
        exigir(quantidade(m.saldoAntes) && quantidade(m.saldoDepois)
            && m.saldoDepois === leitores.obterQuantidadePropriaPendenteItem(itens[0])
            && (m.subtipoMovimentacao === 'reserva_ajuste'
                ? somar(m.saldoAntes, m.quantidade) === m.saldoDepois
                : m.saldoAntes >= m.quantidade && m.saldoAntes - m.quantidade === m.saldoDepois), 'SALDO_MOVIMENTO_CONTRADITORIO');
    }
    // Apenas itens com ancora tipada preservada no movimento confirmado.
    if (original.itens.some(g => g.itemIds.some(id => movimentos.filter(m => m.itemId === id).length !== 1))) return null;
    return op;
}
export function classificarReservaHistoricaTexto(snapshotTexto, locacaoReferencia) {
    try {
        const s = indiceRaiz(snapshotTexto), l = resolver(s.locacoes, 'locacao', locacaoReferencia), original = l.estoqueReserva?.snapshot;
        exigir(objeto(original), 'SNAPSHOT_HISTORICO_AUSENTE');
        if (original.versao === 2) {
            exigir(igual(original, snapshotV2(s, l)), 'SNAPSHOT_V2_DIVERGENTE');
            return sucesso({ classificacao: 'identidade_comprovada_v2', contratoTexto: canonico(original) });
        }
        exigir(original.versao === 1 && Array.isArray(original.itens), 'SNAPSHOT_LEGADO_INVALIDO');
        const esperado = historico.criarSnapshotReservaInterno(l, { origem: original.origem,
            capturadoEm: original.capturadoEm, statusReserva: original.statusReserva });
        // Campos futuros sao preservados na origem, nao sobrescrevem canonicos.
        for (const k of Object.keys(esperado)) exigir(igual(original[k], esperado[k]), 'SNAPSHOT_LEGADO_CONTRADITORIO');
        const ancoras = provarUltimoAjuste(s, l, original);
        if (!ancoras) return Object.freeze({ ...falha('PROVA_HISTORICA_TIPADA_INSUFICIENTE'), classificacao: 'identidade_ambigua' });
        return sucesso({ classificacao: 'identidade_recuperavel', operacaoAncora: ancoras,
            contratoTexto: canonico(snapshotV2(s, l)), snapshotOriginalTexto: canonico(original),
            migracaoAutorizada: false });
    } catch (e) { return Object.freeze({ ...falha(e.message), classificacao: 'identidade_inconsistente' }); }
}

/** Prova de uma aresta arquivada, nao fabricacao dos predecessores ausentes.
 * Deve ser chamada pelo bootstrap com arquivos internos, nunca com DTO de UI. */
function validarContinuidadeReservaTexto(antesTexto, depoisTexto, locacaoReferencia, versao) {
    try {
        const antes = indiceRaiz(antesTexto), depois = indiceRaiz(depoisTexto);
        const classificacao = classificarReservaHistoricaTexto(depoisTexto, locacaoReferencia);
        const l = resolver(depois.locacoes, 'locacao', locacaoReferencia);
        exigir(classificacao.ok && l.estoqueReserva?.snapshot?.versao === versao, 'CHECKPOINT_POSTERIOR_NAO_COMPROVADO');
        const opV2 = versao === 2 ? provarUltimoAjuste(depois, l, {
            capturadoEm: l.controleEdicao?.atualizadoEm,
            itens: l.estoqueReserva.snapshot.itens.map(g => ({ itemIds: g.itens.map(i => i.itemId) }))
        }) : null;
        exigir(versao === 2 ? opV2 : classificacao.classificacao === 'identidade_recuperavel',
            'CHECKPOINT_POSTERIOR_NAO_COMPROVADO');
        const anterior = resolver(antes.locacoes, 'locacao', locacaoReferencia);
        const op = versao === 2 ? opV2 : classificacao.operacaoAncora;
        const h = l.historicoOperacional.find(x => x.operacaoId === op), p = h.provasRecuperacao;
        const identidade = { locacaoId: l.id, operacaoId: op, assinaturaPlano: h.assinaturaPlano };
        exigir(historico.gerarFingerprintRecuperacao(antes, clonar, identidade, 'estado').fingerprint === p.fingerprintEstadoAnterior
            && historico.gerarFingerprintRecuperacao(anterior, clonar, identidade, 'locacao').fingerprint === p.fingerprintLocacaoAnterior,
        'CHECKPOINT_ANTERIOR_DIVERGENTE');
        exigir((anterior.controleEdicao?.revisao ?? 0) === p.revisaoAnterior, 'REVISAO_CHECKPOINT_DIVERGENTE');
        const semOperacao = lista => lista.filter(x => x.operacaoId !== op);
        exigir(igual(antes.movimentacoesEstoque, semOperacao(depois.movimentacoesEstoque))
            && igual(antes.logsAuditoria, semOperacao(depois.logsAuditoria)), 'CADEIA_CHECKPOINT_DIVERGENTE');
        const limpar = estado => {
            const copia = JSON.parse(JSON.stringify(estado));
            delete copia.data; delete copia.ultimaEdicao;
            copia.movimentacoesEstoque = []; copia.logsAuditoria = [];
            const loc = resolver(copia.locacoes, 'locacao', locacaoReferencia);
            for (const k of ['items', 'estoqueReserva', 'controleEdicao', 'historicoOperacional']) delete loc[k];
            return copia;
        };
        exigir(igual(limpar(antes), limpar(depois)), 'CAMPOS_FORA_DO_CHECKPOINT_ALTERADOS');
        const semCamposReserva = reserva => {
            const copia = { ...(reserva || {}) }; delete copia.snapshot; delete copia.movimentacaoIds; return copia;
        };
        exigir(igual(semCamposReserva(anterior.estoqueReserva), semCamposReserva(l.estoqueReserva)),
            'METADADOS_RESERVA_CHECKPOINT_DIVERGENTES');
        exigir(igual(anterior.historicoOperacional || [], semOperacao(l.historicoOperacional)), 'HISTORICO_ANTERIOR_DIVERGENTE');
        exigir(anterior.items.length === l.items.length, 'RECONSTRUCAO_ITENS_CHECKPOINT_PENDENTE');
        for (const item of l.items) {
            const anteriores = anterior.items.filter(i => i.itemId === item.itemId && i.pecaId === item.pecaId);
            exigir(anteriores.length === 1, 'ANCORA_ANTERIOR_AUSENTE');
            const a = { ...anteriores[0] }, b = { ...item };
            for (const k of ['quantidade', 'quantidadePropria']) { delete a[k]; delete b[k]; }
            exigir(igual(a, b), 'TRANSICAO_ITEM_CHECKPOINT_NAO_COMPROVADA');
            const movimentos = depois.movimentacoesEstoque.filter(m => m.operacaoId === op && m.itemId === item.itemId);
            exigir(movimentos.length === 1 && movimentos[0].saldoAntes === leitores.obterQuantidadePropriaPendenteItem(anteriores[0]),
                'PREDECESSOR_MOVIMENTO_DIVERGENTE');
        }
        const comprovacao = Object.freeze({});
        continuidadesCheckpoint.set(comprovacao, { depoisTexto: canonico(depois), locacaoReferencia, operacaoId: op });
        return Object.freeze({ ok: true, codigo: 'CONTINUIDADE_CHECKPOINT_COMPROVADA', comprovacao,
            migracaoAutorizada: false, gravado: false, publicado: false });
    } catch (e) { return falha(e.message); }
}
export function validarContinuidadeCheckpointReservaTexto(antesTexto, depoisTexto, locacaoReferencia) {
    return validarContinuidadeReservaTexto(antesTexto, depoisTexto, locacaoReferencia, 1);
}
export function validarContinuidadeReservaV2Texto(antesTexto, depoisTexto, locacaoReferencia) {
    return validarContinuidadeReservaTexto(antesTexto, depoisTexto, locacaoReferencia, 2);
}
export function confirmarContinuidadeCheckpointReserva(comprovacao, snapshotTexto, locacaoReferencia) {
    if (!continuidadesCheckpoint.has(comprovacao)) return false;
    try {
        const prova = continuidadesCheckpoint.get(comprovacao);
        return prova.locacaoReferencia === locacaoReferencia && prova.depoisTexto === decodificarTextoEstrito(snapshotTexto).texto;
    } catch (_) { return false; }
}

export function planejarDisponibilidadeEstoqueTexto(snapshotTexto, intencaoTexto) {
    try {
        const s = indiceRaiz(snapshotTexto), d = dtoMovimento(intencaoTexto);
        exigir(d.tipo === 'reserva', 'CONSULTA_EXIGE_RESERVA');
        const alvo = resolver(s.locacoes, 'locacao', d.locacaoReferencia);
        exigir(!['cancelado', 'devolvido', 'encerrado'].includes(alvo.status)
            && !['cancelado', 'devolvido', 'encerrado'].includes(alvo.statusFluxo), 'STATUS_NAO_PERMITE_RESERVA');
        const itens = alvo.items.filter(i => i.itemId === d.itemId);
        exigir(itens.length === 1 && criarReferenciaEstoque('peca', itens[0].pecaId) === d.pecaReferencia, 'VINCULO_ITEM_DIVERGENTE');
        for (const l of s.locacoes) {
            if (l.estoqueReserva?.snapshot) {
                const h = classificarReservaHistoricaTexto(snapshotTexto, criarReferenciaEstoque('locacao', l.id));
                exigir(h.ok, h.motivo);
            } else {
                // Sem prova, nao ignorar compromissos ou supor disponibilidade.
                exigir(l.items.length === 0 || l.estoqueReserva?.status === 'nao_reservado'
                    && !l.historicoOperacional?.length, 'RESERVA_HISTORICA_NAO_COMPROVADA');
            }
        }
        // Legados sem identidade demonstrada nao podem liberar estoque via um
        // registro total de devolucao. O contrato completo de retorno e pendente.
        exigir(s.devolucoes.length === 0, 'CADEIA_DEVOLUCAO_PENDENTE');
        exigir(s.movimentacoesEstoque.length === 0, 'CADEIA_MOVIMENTOS_PENDENTE');
        const consulta = consultarEstoqueTipadoTexto(snapshotTexto, d.pecaReferencia, d.locacaoReferencia);
        exigir(consulta.ok, 'DISPONIBILIDADE_NAO_COMPROVADA');
        const resultado = decodificarTextoEstrito(consulta.resultadoTexto).valor.consulta;
        // Considerar todos os itens do alvo, nao somente a linha selecionada.
        let necessario = 0;
        for (const i of alvo.items) if (criarReferenciaEstoque('peca', i.pecaId) === d.pecaReferencia) {
            necessario = somar(necessario, leitores.obterQuantidadePropriaPendenteItem(i));
        }
        exigir(d.quantidade <= necessario && necessario <= resultado.disponivel, 'DISPONIBILIDADE_INSUFICIENTE');
        return sucesso({ codigo: 'PLANO_DISPONIBILIDADE_SEM_COMMIT', necessario, disponivel: resultado.disponivel,
            locacaoReferencia: d.locacaoReferencia, pecaReferencia: d.pecaReferencia, comandoDisponivel: false });
    } catch (e) { return falha(e.message); }
}
