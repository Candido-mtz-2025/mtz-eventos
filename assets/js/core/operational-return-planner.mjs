import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
import { criarNucleoConfiavel as criarConstrutor } from './operational-return.generated.mjs';
import { criarNucleoConfiavel as criarContexto } from './operational-context.generated.mjs';
import { criarNucleoConfiavel as criarLeitores } from './operational-stock-read.generated.mjs';
import { criarNucleoConfiavel as criarAjustes } from './operational-adjustment.generated.mjs';
import { consultarEstoqueTipadoTexto } from './operational-stock-contracts.mjs';
import { consultarContextoJournal } from './indexeddb-authority.mjs';
import { comprovarConversoesJournalTexto } from './proposal-conversion-replay.mjs';
import { criarReferenciaEstoque as ref, construirIdentidadeReservaV2Texto,
    classificarReservaHistoricaTexto, confirmarContinuidadeCheckpointReserva } from './operational-stock-identity.mjs';

const construtor = criarConstrutor(), contexto = criarContexto();
const canon = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
const exigir = (v, motivo) => { if (!v) throw Error(motivo); };
const chaves = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
    && canon(Object.keys(v).sort()) === canon(keys.slice().sort());
const quantidade = q => Number.isSafeInteger(q) && q >= 0;
function vincularCausalidadeV2(candidato, metadados, causalidadeTexto) {
    if (causalidadeTexto === null) return;
    const c = decodificarTextoEstrito(causalidadeTexto).valor;
    exigir(chaves(c, ['sequencia', 'predecessor']) && Number.isSafeInteger(c.sequencia) && c.sequencia > 0
        && (c.sequencia === 1 ? c.predecessor === null : typeof c.predecessor === 'string' && c.predecessor.length > 0),
    'CAUSALIDADE_INVALIDA');
    const auditorias = candidato.logsAuditoria.filter(a => a.operacaoId === metadados.operacaoId);
    exigir(auditorias.length === 1, 'AUDITORIA_CAUSAL_AUSENTE_OU_DUPLICADA');
    auditorias[0].cadeiaOperacionalV2 = { ...c };
}

// Componente para a futura composicao global; nao valida o ledger ou financeiro
// por si so e nunca autoriza persistencia/publicacao.
export function validarMaterializacaoEstoqueTexto(snapshotTexto, referenciasTexto, referenciaHoje) {
    try {
        exigir(typeof referenciaHoje === 'string' && Number.isFinite(Date.parse(referenciaHoje)), 'DATA_RECALCULO_INVALIDA');
        const s = decodificarTextoEstrito(snapshotTexto).valor, referencias = decodificarTextoEstrito(referenciasTexto).valor;
        exigir(Array.isArray(referencias) && referencias.length > 0 && new Set(referencias).size === referencias.length, 'REFERENCIAS_RECALCULO_INVALIDAS');
        const alvos = referencias.map(referencia => {
            exigir(typeof referencia === 'string', 'REFERENCIA_RECALCULO_INVALIDA');
            const matches = s.pecas.filter(p => ref('peca', p.id) === referencia);
            exigir(matches.length === 1, 'PECA_RECALCULO_AUSENTE_OU_DUPLICADA'); return matches[0].id;
        });
        const calculadas = contexto.recalcularDisponibilidadeEstado(s, referenciaHoje, alvos);
        for (const id of alvos) {
            const atual = s.pecas.find(p => p.id === id), calculada = calculadas.find(p => p.id === id);
            exigir(quantidade(atual.reservado) && quantidade(atual.disponivel)
                && atual.reservado === calculada.reservado && atual.disponivel === calculada.disponivel,
            'MATERIALIZACAO_ESTOQUE_DIVERGENTE');
        }
        validarCapacidadeAnterior(s, new Set(alvos), criarLeitores(s), referenciaHoje);
        return Object.freeze({ ok: true, codigo: 'MATERIALIZACAO_ESTOQUE_CONFERIDA', validacaoGlobalPendente: true, gravado: false, publicado: false });
    } catch (e) { return Object.freeze({ ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', motivo: e.message,
        requerRecuperacao: true, gravado: false, publicado: false }); }
}

function validarCapacidadeAnterior(s, alvos, leitores, referenciaHoje) {
    const vista = JSON.parse(JSON.stringify(s));
    // Inativacao impede novos usos, nao uma devolucao. Aqui apenas conferimos
    // a capacidade fisica de compromissos ja existentes, sem mudar o candidato.
    vista.pecas.forEach(p => { if (alvos.has(p.id)) p.status = 'ativo'; });
    for (const l of s.locacoes) {
        if (!contexto.locacaoComprometeEstoqueComRegistros(l, s.devolucoes, referenciaHoje)) continue;
        for (const pecaId of alvos) {
            const necessaria = l.items.filter(i => i.pecaId === pecaId)
                .reduce((soma, i) => soma + leitores.obterQuantidadePropriaPendenteItem(i), 0);
            exigir(Number.isSafeInteger(necessaria) && necessaria >= 0, 'RESERVA_ANTERIOR_INVALIDA');
            if (necessaria === 0) continue;
            const r = consultarEstoqueTipadoTexto(JSON.stringify(vista), ref('peca', pecaId), ref('locacao', l.id));
            exigir(r.ok && necessaria <= decodificarTextoEstrito(r.resultadoTexto).valor.consulta.disponivel,
                'CAPACIDADE_ANTERIOR_INCONSISTENTE');
        }
    }
}

/** Preparador do candidato LEGADO, para equivalencia. O construtor ainda exige
 * snapshot v1; este retorno NAO habilita gravacao nem e candidato v2 publicavel. */
function prepararCandidatoDevolucaoInterno(snapshotTexto, comandoTexto, metadadosTexto, versaoSnapshot, comprovacao, causalidadeTexto = null) {
    try {
        const s = JSON.parse(decodificarTextoEstrito(snapshotTexto).texto);
        const d = decodificarTextoEstrito(comandoTexto).valor, m = decodificarTextoEstrito(metadadosTexto).valor;
        exigir(chaves(d, ['locacaoReferencia', 'dataDevolucao', 'itens']) && typeof d.locacaoReferencia === 'string'
            && typeof d.dataDevolucao === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.dataDevolucao)
            && new Date(`${d.dataDevolucao}T12:00:00Z`).toISOString().slice(0, 10) === d.dataDevolucao
            && Array.isArray(d.itens) && d.itens.length > 0, 'COMANDO_DEVOLUCAO_INVALIDO');
        exigir(chaves(m, ['operacaoId', 'atorReferencia', 'timestamp']) && typeof m.operacaoId === 'string'
            && typeof m.atorReferencia === 'string' && m.atorReferencia.trim().length > 0
            && typeof m.timestamp === 'string' && new Date(m.timestamp).toISOString() === m.timestamp, 'METADADOS_INVALIDOS');
        exigir(construirIdentidadeReservaV2Texto(snapshotTexto, d.locacaoReferencia).ok, 'IDENTIDADES_NAO_RECONCILIADAS');
        const indice = s.locacoes.findIndex(l => ref('locacao', l.id) === d.locacaoReferencia), l = s.locacoes[indice];
        exigir(!l.historicoAlteracoes || Array.isArray(l.historicoAlteracoes)
            && (versaoSnapshot === 2 || l.historicoAlteracoes.length < 240),
            'HISTORICO_EXIGE_CONSTRUTOR_SEM_TRUNCAMENTO');
        if (versaoSnapshot === 2) {
            if (l.estoqueReserva?.snapshot?.versao === 1) {
                exigir(confirmarContinuidadeCheckpointReserva(comprovacao, snapshotTexto, d.locacaoReferencia),
                    'CONTINUIDADE_CHECKPOINT_NAO_COMPROVADA');
            } else {
                exigir(l.estoqueReserva?.snapshot?.versao === 2
                    && classificarReservaHistoricaTexto(snapshotTexto, d.locacaoReferencia).ok,
                'SNAPSHOT_V2_ORIGEM_DIVERGENTE');
            }
        }
        for (const p of s.pecas) {
            for (const k of ['quantidadeTotal', 'manutencao', 'avariado', 'perdido']) exigir(quantidade(p[k]), 'SALDO_FISICO_INVALIDO');
            exigir(quantidade(p.manutencao + p.avariado + p.perdido)
                && p.manutencao + p.avariado + p.perdido <= p.quantidadeTotal, 'SALDO_FISICO_INCONSISTENTE');
        }
        const status = typeof l.status === 'string' ? l.status.trim().toLowerCase() : '';
        const statusFluxo = typeof l.statusFluxo === 'string' ? l.statusFluxo.trim().toLowerCase() : '';
        exigir(!['cancelado', 'devolvido', 'encerrado'].includes(status)
            && !['cancelado', 'devolvido', 'encerrado'].includes(statusFluxo), 'STATUS_NAO_PERMITE_DEVOLUCAO');
        const usados = new Set();
        const itens = d.itens.map(i => {
            exigir(chaves(i, ['itemId', 'pecaReferencia', 'quantidadeDevolvida', 'quantidadeAvaria', 'observacao'])
                && typeof i.itemId === 'string' && !usados.has(i.itemId) && quantidade(i.quantidadeDevolvida)
                && quantidade(i.quantidadeAvaria) && quantidade(i.quantidadeDevolvida + i.quantidadeAvaria)
                && i.quantidadeDevolvida + i.quantidadeAvaria > 0 && typeof i.observacao === 'string'
                && i.observacao.length <= 1000, 'ITEM_DEVOLUCAO_INVALIDO');
            usados.add(i.itemId); const matches = l.items.map((it, itemIndex) => ({ it, itemIndex })).filter(x => x.it.itemId === i.itemId);
            exigir(matches.length === 1 && ref('peca', matches[0].it.pecaId) === i.pecaReferencia, 'ITEM_DEVOLUCAO_DIVERGENTE');
            return { itemIndex: matches[0].itemIndex, itemId: i.itemId, quantidadeDevolvida: i.quantidadeDevolvida,
                quantidadeAvaria: i.quantidadeAvaria, observacao: i.observacao };
        });
        const entrada = { locacaoId: l.id, operacaoId: m.operacaoId, atualizadoEm: m.timestamp,
            atualizadoPor: m.atorReferencia, dataDevolucao: d.dataDevolucao, itens };
        const assinatura = construtor.gerarAssinaturaDevolucaoLocacao(entrada);
        exigir(assinatura.ok, assinatura.codigo);
        const controle = contexto.normalizarControleEdicaoLocacao(l);
        exigir(controle.valido, 'CONTROLE_INVALIDO');
        const registro = contexto.prepararRegistroOperacaoConcluida({ locacao: l, ...entrada,
            revisaoEsperada: controle.revisao, assinaturaPlano: assinatura.assinatura });
        const checkpoint = contexto.criarCheckpointOperacionalEdicaoLocacao(s, { operacaoId: m.operacaoId,
            assinaturaPlano: assinatura.assinatura, criadoEm: m.timestamp });
        exigir(registro.valido && checkpoint.ok, 'CONTEXTO_DEVOLUCAO_INVALIDO');
        const leitores = criarLeitores(s);
        if (versaoSnapshot === 2) validarCapacidadeAnterior(s,
            new Set(itens.map(i => l.items[i.itemIndex].pecaId)), leitores, m.timestamp);
        const r = construtor.construirCandidatoDevolucao(s, { locacao: l, indice }, entrada, assinatura.assinatura,
            assinatura, registro, checkpoint.checkpoint, { criarSnapshotReservaLocacao: leitores.criarSnapshotReservaLocacao,
                obterQuantidadePendenteDevolucaoItem: leitores.obterQuantidadePropriaPendenteItem,
                recalcularDisponibilidadeEstado: contexto.recalcularDisponibilidadeEstado }, versaoSnapshot);
        exigir(r.ok, r.codigo);
        if (versaoSnapshot === 2) {
            const referencias = Array.from(new Set(itens.map(i => ref('peca', l.items[i.itemIndex].pecaId))));
            const materializacao = validarMaterializacaoEstoqueTexto(canon(r.candidato), canon(referencias), m.timestamp);
            exigir(materializacao.ok, materializacao.motivo);
        }
        for (const p of r.candidato.pecas) exigir(quantidade(p.avariado)
            && quantidade(p.manutencao + p.avariado + p.perdido)
            && p.manutencao + p.avariado + p.perdido <= p.quantidadeTotal, 'AVARIAS_EXCEDEM_CAPACIDADE');
        vincularCausalidadeV2(r.candidato, m, causalidadeTexto);
        const provas = construtor.anexarProvasRecuperacao(r, s, l, { ...entrada, revisaoEsperada: controle.revisao,
            assinaturaPlanoEsperada: assinatura.assinatura }, registro.controleEdicao.revisao, contexto.clonarJsonPersistivelEstrito);
        exigir(provas.ok, provas.codigo);
        return Object.freeze({ ok: true, codigo: versaoSnapshot === 2 ? 'CANDIDATO_DEVOLUCAO_V2_SEM_COMMIT' : 'CANDIDATO_LEGADO_PARA_EQUIVALENCIA',
            ...(versaoSnapshot === 2 ? { candidatoTexto: canon(r.candidato), validacaoGlobalPendente: true } : { candidatoLegadoTexto: canon(r.candidato) }),
            entradaTexto: canon(entrada), registroDisponivel: false, gravado: false, publicado: false });
    } catch (e) { return Object.freeze({ ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', motivo: e.message,
        requerRecuperacao: true, gravado: false, publicado: false }); }
}

export function prepararCandidatoDevolucaoLegadoTexto(snapshotTexto, comandoTexto, metadadosTexto) {
    return prepararCandidatoDevolucaoInterno(snapshotTexto, comandoTexto, metadadosTexto, 1, null);
}
export function prepararCandidatoDevolucaoV2Texto(snapshotTexto, comandoTexto, metadadosTexto, comprovacao = null, causalidadeTexto = null) {
    return prepararCandidatoDevolucaoInterno(snapshotTexto, comandoTexto, metadadosTexto, 2, comprovacao, causalidadeTexto);
}

/** Ajuste dos itens contratados, nao baixa independente de saldo. O planejador
 * v1 e executado numa projecao privada bijetiva; nenhum alias e persistido. */
export function prepararCandidatoAjusteItensV2Texto(snapshotTexto, comandoTexto, metadadosTexto, comprovacao = null, causalidadeTexto = null) {
    try {
        const s = JSON.parse(decodificarTextoEstrito(snapshotTexto).texto), d = decodificarTextoEstrito(comandoTexto).valor;
        const m = decodificarTextoEstrito(metadadosTexto).valor;
        exigir(chaves(d, ['tipo', 'locacaoReferencia', 'itens']) && d.tipo === 'ajuste_itens'
            && typeof d.locacaoReferencia === 'string' && Array.isArray(d.itens), 'COMANDO_AJUSTE_INVALIDO');
        exigir(chaves(m, ['operacaoId', 'atorReferencia', 'timestamp']) && typeof m.operacaoId === 'string'
            && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId) && typeof m.atorReferencia === 'string'
            && m.atorReferencia.trim().length > 0 && typeof m.timestamp === 'string'
            && new Date(m.timestamp).toISOString() === m.timestamp, 'METADADOS_INVALIDOS');
        const identidade = construirIdentidadeReservaV2Texto(snapshotTexto, d.locacaoReferencia);
        exigir(identidade.ok, identidade.motivo);
        const matches = s.locacoes.map((l, indice) => ({ l, indice })).filter(x => ref('locacao', x.l.id) === d.locacaoReferencia);
        exigir(matches.length === 1, 'LOCACAO_AUSENTE_OU_DUPLICADA');
        const { l, indice } = matches[0];
        if (l.estoqueReserva?.snapshot?.versao === 1) {
            exigir(confirmarContinuidadeCheckpointReserva(comprovacao, snapshotTexto, d.locacaoReferencia),
                'CONTINUIDADE_CHECKPOINT_NAO_COMPROVADA');
        } else exigir(l.estoqueReserva?.snapshot?.versao === 2 && classificarReservaHistoricaTexto(snapshotTexto, d.locacaoReferencia).ok,
            'AJUSTE_EXIGE_ORIGEM_V2_COMPROVADA');
        const leitoresOriginais = criarLeitores(s);
        const ids = new Set(), itens = d.itens.map(i => {
            exigir(chaves(i, ['itemId', 'pecaReferencia', 'quantidade']) && typeof i.itemId === 'string'
                && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(i.itemId) && !ids.has(i.itemId)
                && typeof i.pecaReferencia === 'string' && quantidade(i.quantidade), 'ITEM_AJUSTE_INVALIDO');
            ids.add(i.itemId);
            const ps = s.pecas.filter(p => ref('peca', p.id) === i.pecaReferencia);
            exigir(ps.length === 1, 'PECA_AUSENTE_OU_DUPLICADA');
            const atual = l.items.find(x => x.itemId === i.itemId);
            exigir(!atual || atual.pecaId === ps[0].id, 'TROCA_IDENTIDADE_ITEM_NAO_AUTORIZADA');
            const propria = atual ? leitoresOriginais.obterQuantidadePropriaOperacional(atual) : null;
            const item = atual ? { ...atual, quantidade: i.quantidade } : {
                itemId: i.itemId, pecaId: ps[0].id, nome: ps[0].nome, quantidade: i.quantidade
            };
            if (Object.hasOwn(item, 'quantidadePropria') && propria === atual?.quantidade) item.quantidadePropria = i.quantidade;
            return item;
        });
        // Percorrer a origem tambem impede omissao ou substituicao de itens protegidos.
        for (const atual of l.items) {
            if (leitoresOriginais.obterQuantidadePropriaOperacional(atual) === atual.quantidade) continue;
            const pretendido = itens.find(i => i.itemId === atual.itemId);
            exigir(pretendido && pretendido.pecaId === atual.pecaId && pretendido.quantidade === atual.quantidade,
                'COMPOSICAO_MISTA_EXIGE_CONTRATO');
        }
        const reverso = new Map();
        const alias = (tipo, id) => {
            const key = `${tipo}.` + Array.from(new TextEncoder().encode(JSON.stringify([typeof id, id])), b => b.toString(16).padStart(2, '0')).join('');
            exigir(key.length <= 160, 'IDENTIDADE_EXCEDE_CONTRATO_LEGADO');
            reverso.set(key, id); return key;
        };
        const shadow = JSON.parse(JSON.stringify(s));
        shadow.pecas.forEach(p => { p.id = alias('p', p.id); });
        shadow.locacoes.forEach(loc => { loc.id = alias('l', loc.id); loc.items.forEach(i => { i.pecaId = alias('p', i.pecaId); }); });
        shadow.devolucoes.forEach(r => { r.locacaoId = alias('l', r.locacaoId); });
        const alvo = shadow.locacoes[indice], leitores = criarLeitores(shadow);
        alvo.estoqueReserva.snapshot = leitores.criarSnapshotReservaLocacao(alvo, {
            origem: 'projecao_privada_ajuste', capturadoEm: m.timestamp, statusReserva: alvo.estoqueReserva.status
        });
        const dados = { items: itens.map(i => ({ ...i, pecaId: alias('p', i.pecaId) })) };
        const regrasAjuste = criarContexto(shadow), plano = regrasAjuste.planejarAjusteReservaLocacao(alvo, dados, shadow);
        exigir(plano.valido, plano.bloqueios?.map(b => b.codigo).join(',') || 'PLANO_AJUSTE_INVALIDO');
        exigir(plano.resumo.possuiAlteracoes, 'AJUSTE_SEM_ALTERACOES');
        const controle = contexto.normalizarControleEdicaoLocacao(l);
        exigir(controle.valido, 'CONTROLE_INVALIDO');
        // O mesmo assinador v1 recebe aliases que codificam o tipo e valor.
        // Assim 1 e "1" nao colidem no payload canonico compartilhado.
        const assinatura = regrasAjuste.gerarAssinaturaPlanoAjusteLocacao(plano, { revisaoEsperada: controle.revisao });
        exigir(assinatura.ok, assinatura.codigo);
        const restaurar = (v, chave = '') => {
            if (Array.isArray(v)) return v.map(x => restaurar(x));
            if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, restaurar(x, k)]));
            return ['id', 'pecaId', 'pecaIdAtual', 'pecaIdPretendido', 'locacaoId'].includes(chave) && reverso.has(v) ? reverso.get(v) : v;
        };
        const construtorAjuste = criarAjustes(), planoTipado = restaurar(plano), reconciliacao = construtorAjuste.reconciliarDeltas(planoTipado, 2);
        exigir(reconciliacao.valido, 'DELTAS_NAO_RECONCILIADOS');
        const editados = construtorAjuste.preservarCamposItensAtuais(l, { items: itens });
        const bloqueios = construtorAjuste.validarItemIdsHistoricos(l, editados);
        exigir(!bloqueios.length, bloqueios[0]?.codigo);
        const entrada = { locacaoId: l.id, operacaoId: m.operacaoId, revisaoEsperada: controle.revisao,
            atualizadoEm: m.timestamp, atualizadoPor: m.atorReferencia, assinaturaPlanoEsperada: assinatura.assinatura };
        const registro = contexto.prepararRegistroOperacaoConcluida({ locacao: l, ...entrada, assinaturaPlano: assinatura.assinatura });
        const cp = contexto.criarCheckpointOperacionalEdicaoLocacao(s, { operacaoId: m.operacaoId,
            assinaturaPlano: assinatura.assinatura, criadoEm: m.timestamp });
        exigir(registro.valido && cp.ok, 'CONTEXTO_AJUSTE_INVALIDO');
        const r = construtorAjuste.construirCandidato(s, l, indice, editados, planoTipado, reconciliacao,
            registro, cp.checkpoint, entrada, { clonarJsonPersistivelEstrito: contexto.clonarJsonPersistivelEstrito,
                recalcularDisponibilidadeEstado: contexto.recalcularDisponibilidadeEstado }, 2);
        exigir(r.ok, r.codigo);
        r.historico.comandoOperacionalV2 = JSON.parse(decodificarTextoEstrito(comandoTexto).texto);
        const refs = Array.from(new Set(s.pecas.map(p => ref('peca', p.id))));
        const estoque = validarMaterializacaoEstoqueTexto(canon(r.candidato), canon(refs), m.timestamp);
        exigir(estoque.ok, estoque.motivo);
        vincularCausalidadeV2(r.candidato, m, causalidadeTexto);
        const provas = construtorAjuste.anexarProvasRecuperacao(r, s, l, entrada, registro.controleEdicao.revisao,
            contexto.clonarJsonPersistivelEstrito);
        exigir(provas.ok, provas.codigo);
        return Object.freeze({ ok: true, codigo: 'CANDIDATO_AJUSTE_ITENS_V2_SEM_COMMIT', candidatoTexto: canon(r.candidato),
            assinaturaPlano: assinatura.assinatura, registroDisponivel: false, gravado: false, publicado: false });
    } catch (e) { return Object.freeze({ ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', motivo: e.message,
        requerRecuperacao: true, gravado: false, publicado: false }); }
}

export function prepararCandidatoCancelamentoV2Texto(snapshotTexto, comandoTexto, metadadosTexto, causalidadeTexto = null) {
    try {
        const s = JSON.parse(decodificarTextoEstrito(snapshotTexto).texto), d = decodificarTextoEstrito(comandoTexto).valor;
        const m = decodificarTextoEstrito(metadadosTexto).valor;
        exigir(chaves(d, ['tipo', 'locacaoReferencia']) && d.tipo === 'cancelamento_locacao'
            && typeof d.locacaoReferencia === 'string', 'COMANDO_CANCELAMENTO_INVALIDO');
        exigir(chaves(m, ['operacaoId', 'atorReferencia', 'timestamp']) && typeof m.operacaoId === 'string'
            && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId) && typeof m.atorReferencia === 'string'
            && m.atorReferencia.trim().length > 0 && typeof m.timestamp === 'string'
            && new Date(m.timestamp).toISOString() === m.timestamp, 'METADADOS_INVALIDOS');
        exigir(construirIdentidadeReservaV2Texto(snapshotTexto, d.locacaoReferencia).ok, 'IDENTIDADE_NAO_COMPROVADA');
        const ls = s.locacoes.map((l, indice) => ({ l, indice })).filter(x => ref('locacao', x.l.id) === d.locacaoReferencia);
        exigir(ls.length === 1, 'LOCACAO_AUSENTE_OU_DUPLICADA');
        const r = criarAjustes().construirCandidatoCancelamentoLocacaoInterno(s, ls[0].indice, m, {
            calcularAtualizacaoStatusLocacaoDominio: contexto.calcularAtualizacaoStatusLocacaoDominio,
            recalcularDisponibilidadeEstado: contexto.recalcularDisponibilidadeEstado
        });
        exigir(r.ok, r.codigo);
        vincularCausalidadeV2(r.candidato, m, causalidadeTexto);
        return Object.freeze({ ok: true, codigo: 'CANDIDATO_CANCELAMENTO_V2_SEM_COMMIT', candidatoTexto: canon(r.candidato),
            registroDisponivel: false, gravado: false, publicado: false });
    } catch (e) { return Object.freeze({ ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', motivo: e.message,
        requerRecuperacao: true, gravado: false, publicado: false }); }
}

export function prepararCandidatoReservaInicialV2Texto(snapshotTexto, comandoTexto, metadadosTexto, causalidadeTexto = null, capacidade = null) {
    try {
        const s = JSON.parse(decodificarTextoEstrito(snapshotTexto).texto), d = decodificarTextoEstrito(comandoTexto).valor;
        const m = decodificarTextoEstrito(metadadosTexto).valor;
        exigir(chaves(d, ['tipo', 'locacaoReferencia']) && d.tipo === 'reserva_inicial'
            && typeof d.locacaoReferencia === 'string', 'COMANDO_RESERVA_INVALIDO');
        exigir(chaves(m, ['operacaoId', 'atorReferencia', 'timestamp']) && typeof m.operacaoId === 'string'
            && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId) && typeof m.atorReferencia === 'string'
            && m.atorReferencia.trim().length > 0 && typeof m.timestamp === 'string'
            && new Date(m.timestamp).toISOString() === m.timestamp, 'METADADOS_INVALIDOS');
        exigir(construirIdentidadeReservaV2Texto(snapshotTexto, d.locacaoReferencia).ok, 'IDENTIDADE_RESERVA_INVALIDA');
        const ls = s.locacoes.map((l, indice) => ({ l, indice })).filter(x => ref('locacao', x.l.id) === d.locacaoReferencia);
        exigir(ls.length === 1, 'LOCACAO_AUSENTE_OU_DUPLICADA');
        const { l, indice } = ls[0];
        const ctx = consultarContextoJournal(capacidade);
        const composicaoComprovada = l.estoqueReserva?.snapshot && ctx?.tipo === 'estoque.reservar.v2'
            && ctx.dadosTexto === comandoTexto && ctx.operacaoId === m.operacaoId
            && ctx.atorReferencia === m.atorReferencia && ctx.timestamp === m.timestamp
            && comprovarConversoesJournalTexto(snapshotTexto, capacidade, true).some(p => p.locacaoTexto === canon(l))
            && !s.movimentacoesEstoque.some(v => Object.is(v.locacaoId, l.id)
                || v.locacaoReferencia === d.locacaoReferencia)
            && !s.devolucoes.some(v => Object.is(v.locacaoId, l.id) || v.locacaoReferencia === d.locacaoReferencia);
        exigir(l.estoqueReserva?.status === 'nao_reservado' && (!l.estoqueReserva.snapshot || composicaoComprovada)
            && !(l.estoqueReserva.movimentacaoIds || []).length && !(l.historicoOperacional || []).length,
        'RESERVA_ANTERIOR_NAO_RECONCILIADA');
        const fluxo = contexto.inferirStatusFluxoLocacao(l);
        exigir(!['cancelado', 'devolvido', 'finalizado'].includes(fluxo)
            && !['cancelado', 'devolvido', 'encerrado', 'historico', 'finalizado'].includes(l.status), 'STATUS_RESERVA_INVALIDO');
        const leitores = criarLeitores(s);
        for (const i of l.items) {
            const propria = leitores.obterQuantidadePropriaOperacional(i);
            const misto = i.origemCusto === 'misto' && quantidade(i.quantidadePropria)
                && quantidade(i.quantidadeTerceirizada) && propria === i.quantidadePropria
                && propria > 0 && i.quantidadeTerceirizada > 0
                && propria + i.quantidadeTerceirizada === i.quantidade;
            const terceirizadoSemPeca = (i.pecaId === '' || i.pecaId == null)
                && i.origemCusto === 'terceirizado' && i.quantidade > 0
                && i.quantidadePropria === 0 && i.quantidadeTerceirizada === i.quantidade;
            exigir((propria === i.quantidade || misto || terceirizadoSemPeca)
            && (i.devolvidos ?? 0) === 0 && (i.avariadosEstoqueProprio ?? 0) === 0
            && (i.nome === undefined || typeof i.nome === 'string')
            && (i.descricao === undefined || typeof i.descricao === 'string'), 'ITEM_RESERVA_NAO_SUPORTADO');
        }
        exigir(!contexto.encontrarPecaInativaVinculada(l.items, s.pecas), 'PECA_INATIVA');
        s.pecas = contexto.recalcularDisponibilidadeEstado(s, m.timestamp);
        const plano = contexto.planejarReservaInicialEstoqueLocacao(s.locacoes[indice], s.pecas, {
            tipado: true, operacaoId: m.operacaoId, consultar: id => {
                const consulta = consultarEstoqueTipadoTexto(canon(s), ref('peca', id), d.locacaoReferencia);
                exigir(consulta.ok, consulta.codigo);
                return decodificarTextoEstrito(consulta.resultadoTexto).valor.consulta;
            }
        });
        exigir(plano.ok, plano.bloqueios?.join(';') || 'PLANO_RESERVA_INVALIDO');
        exigir(plano.reservas.length > 0 && Array.from(plano.totaisPorPeca.values()).every(quantidade), 'QUANTIDADES_RESERVA_INVALIDAS');
        const r = criarAjustes().construirCandidatoReservaInicialInterno(s, indice, plano, m, contexto);
        exigir(r.ok, r.codigo);
        vincularCausalidadeV2(r.candidato, m, causalidadeTexto);
        const materializacao = validarMaterializacaoEstoqueTexto(canon(r.candidato), canon(s.pecas.map(p => ref('peca', p.id))), m.timestamp);
        exigir(materializacao.ok, materializacao.motivo);
        return Object.freeze({ ok: true, codigo: 'CANDIDATO_RESERVA_INICIAL_V2_SEM_COMMIT', candidatoTexto: canon(r.candidato),
            registroDisponivel: false, gravado: false, publicado: false });
    } catch (e) { return Object.freeze({ ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', motivo: e.message,
        requerRecuperacao: true, gravado: false, publicado: false }); }
}
