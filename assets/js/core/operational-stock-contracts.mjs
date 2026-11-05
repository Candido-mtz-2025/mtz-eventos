import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
import { criarNucleoConfiavel as criarLeitores } from './operational-stock-read.generated.mjs';
import { criarNucleoConfiavel as criarIdentidades } from './operational-transport.generated.mjs';
const ids = criarIdentidades();
const referencia = (tipo, id) => `${tipo}:${encodeURIComponent(JSON.stringify([typeof id, id]))}`;
const quantidade = n => Number.isSafeInteger(n) && n >= 0;

/** Projecao privada de referencias para os leitores legados. Nunca persiste IDs
 * projetados, snapshots ou disponibilidade. O comando de reserva segue bloqueado. */
function linhaTerceirizadaSemPeca(i) {
    return (i.pecaId == null || i.pecaId === '') && i.origemCusto === 'terceirizado'
        && quantidade(i.quantidade) && i.quantidade > 0
        && i.quantidadePropria === 0 && i.quantidadeTerceirizada === i.quantidade
        && (i.devolvidos ?? 0) === 0 && (i.avariadosEstoqueProprio ?? 0) === 0;
}

export function consultarEstoqueTipadoTexto(snapshotTexto, pecaReferencia, locacaoReferencia) {
    try {
        if (typeof pecaReferencia !== 'string' || typeof locacaoReferencia !== 'string') throw Error();
        const s = JSON.parse(decodificarTextoEstrito(snapshotTexto).texto);
        for (const tipo of ['pecas', 'locacoes', 'devolucoes']) {
            if (!Array.isArray(s[tipo])) throw Error();
            const vistos = new Set();
            for (const r of s[tipo]) {
                const chave = ids.criarReferenciaTransporteInterna(r.id);
                if (!chave || vistos.has(chave)) throw Error(); vistos.add(chave);
            }
        }
        for (const p of s.pecas) {
            if (typeof p.nome !== 'string' || typeof p.status !== 'string') throw Error();
            for (const k of ['quantidadeTotal', 'reservado', 'disponivel', 'manutencao', 'avariado', 'perdido']) if (!quantidade(p[k])) throw Error();
        }
        for (const l of s.locacoes) {
            if (!Array.isArray(l.items)) throw Error(); const itens = new Set();
            for (const i of l.items) {
                if (typeof i.itemId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(i.itemId) || itens.has(i.itemId)) throw Error();
                itens.add(i.itemId);
                if (!quantidade(i.quantidade)) throw Error();
                for (const k of ['quantidadePropria', 'quantidadeTerceirizada', 'devolvidos', 'avariadosEstoqueProprio']) {
                    if (Object.hasOwn(i, k) && !quantidade(i[k])) throw Error();
                }
                if (!linhaTerceirizadaSemPeca(i)
                    && !ids.resolverReferenciaEntidadeInterna(s.pecas, 'peca', referencia('peca', i.pecaId)).encontrado) throw Error();
            }
        }
        const peca = ids.resolverReferenciaEntidadeInterna(s.pecas, 'peca', pecaReferencia);
        const locacao = ids.resolverReferenciaEntidadeInterna(s.locacoes, 'locacao', locacaoReferencia);
        if (!peca.encontrado || !locacao.encontrado) throw Error();
        const contexto = {
            pecas: s.pecas.map(p => ({ ...p, id: referencia('peca', p.id) })),
            locacoes: s.locacoes.map(l => ({ ...l, id: referencia('locacao', l.id),
                // O leitor legado recebe apenas a projecao fisica, nunca a composicao autoritativa.
                items: l.items.filter(i => !linhaTerceirizadaSemPeca(i))
                    .map(i => ({ ...i, pecaId: referencia('peca', i.pecaId) })) })),
            devolucoes: s.devolucoes.map(d => {
                if (!ids.resolverReferenciaEntidadeInterna(s.locacoes, 'locacao', referencia('locacao', d.locacaoId)).encontrado) throw Error();
                return { ...d, locacaoId: referencia('locacao', d.locacaoId) };
            })
        };
        const regras = criarLeitores(contexto);
        const alvo = contexto.locacoes.find(l => l.id === locacaoReferencia);
        const consulta = regras.consultarDisponibilidadeItemPeriodo(pecaReferencia, alvo, {
            ...contexto, ignorarLocacaoId: locacaoReferencia });
        if (!consulta.valido) throw Error();
        for (const k of ['disponivel', 'quantidadeFisicaUtilizavel', 'quantidadeComprometida',
            'quantidadeComprometidaPeriodo', 'reservasExplicadas', 'reservaLegadaResidual']) if (!quantidade(consulta[k])) throw Error();
        consulta.conflitos = consulta.conflitos.map(c => {
            const r = ids.resolverReferenciaEntidadeInterna(s.locacoes, 'locacao', c.locacaoId);
            if (!r.encontrado) throw Error(); return { ...c, locacaoId: r.registro.id, locacaoReferencia: c.locacaoId };
        });
        const snapshot = regras.criarSnapshotReservaLocacao(alvo, { origem: 'consulta_tipada_inativa', capturadoEm: '' });
        snapshot.itens = snapshot.itens.map(i => {
            const r = ids.resolverReferenciaEntidadeInterna(s.pecas, 'peca', i.pecaId);
            if (!r.encontrado || !quantidade(i.quantidadePropria) || !quantidade(i.quantidadePendente)) throw Error();
            return { ...i, pecaId: r.registro.id, pecaReferencia: i.pecaId };
        });
        return Object.freeze({ ok: true, codigo: 'CONSULTA_OPERACIONAL_INATIVA',
            resultadoTexto: decodificarTextoEstrito(JSON.stringify({ consulta, snapshot })).texto,
            gravado: false, publicado: false });
    } catch (_) { return Object.freeze({ ok: false, codigo: 'ESTOQUE_REQUER_RECONCILIACAO', gravado: false, publicado: false }); }
}
