import { validarEstruturaSnapshotIndexedDB } from './indexeddb-authority.mjs';

export const DOMINIOS_VALIDACAO = Object.freeze([
    'receber', 'pagar', 'classificacoes', 'conciliacoes', 'conversoes', 'operacional', 'encargos'
]);
const snapshots = new WeakMap();
const falha = codigo => Object.freeze({ ok: false, codigo, requerRecuperacao: true });
const congelar = v => {
    if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); }
    return v;
};

// O scanner rejeita chaves JSON duplicadas antes que JSON.parse perca essa evidencia.
// Nenhum objeto fornecido pelo chamador e percorrido; a unica entrada e texto primitivo.
export function decodificarTextoEstrito(texto) {
    if (typeof texto !== 'string' || !texto.length || texto.length > 10 * 1024 * 1024) throw new Error('TEXTO_INVALIDO');
    let i = 0;
    const espacos = () => { while (/\s/.test(texto[i] || '') && i < texto.length) i++; };
    const string = () => {
        const inicio = i++;
        while (i < texto.length) {
            const c = texto[i++];
            if (c === '\\') { i++; continue; }
            if (c === '"') return JSON.parse(texto.slice(inicio, i));
        }
        throw new Error('STRING_INVALIDA');
    };
    function valor(nivel) {
        if (nivel > 100) throw new Error('PROFUNDIDADE_INVALIDA');
        espacos();
        if (texto[i] === '"') { string(); return; }
        if (texto[i] === '{') {
            i++; espacos(); const chaves = new Set();
            if (texto[i] === '}') { i++; return; }
            for (;;) {
                espacos(); if (texto[i] !== '"') throw new Error('CHAVE_INVALIDA');
                const chave = string();
                if (chaves.has(chave)) throw new Error('CHAVE_DUPLICADA');
                chaves.add(chave); espacos();
                if (texto[i++] !== ':') throw new Error('JSON_INVALIDO');
                valor(nivel + 1); espacos();
                const c = texto[i++]; if (c === '}') return;
                if (c !== ',') throw new Error('JSON_INVALIDO');
            }
        }
        if (texto[i] === '[') {
            i++; espacos(); if (texto[i] === ']') { i++; return; }
            for (;;) {
                valor(nivel + 1); espacos(); const c = texto[i++];
                if (c === ']') return;
                if (c !== ',') throw new Error('JSON_INVALIDO');
            }
        }
        const inicio = i;
        while (i < texto.length && !/[\s,\]}]/.test(texto[i])) i++;
        const v = JSON.parse(texto.slice(inicio, i));
        if (typeof v === 'number' && (!Number.isFinite(v)
            || (Number.isInteger(v) && (!Number.isSafeInteger(v) || Object.is(v, -0))))) throw new Error('NUMERO_INVALIDO');
    }
    valor(0); espacos(); if (i !== texto.length) throw new Error('JSON_INVALIDO');
    const objeto = JSON.parse(texto);
    function ordenar(v) {
        if (Array.isArray(v)) return v.map(ordenar);
        if (!v || typeof v !== 'object') return v;
        const r = Object.create(null);
        Object.keys(v).sort().forEach(k => Object.defineProperty(r, k, { value: ordenar(v[k]), enumerable: true }));
        return r;
    }
    return congelar({ valor: objeto, texto: JSON.stringify(ordenar(objeto)) });
}

const idValido = id => (typeof id === 'string' && id.trim().length > 0)
    || (typeof id === 'number' && Number.isSafeInteger(id) && !Object.is(id, -0));
const chaveId = id => JSON.stringify([typeof id, id]);
const COLECOES_IDENTIDADE = Object.freeze(['locadores', 'pecas', 'locacoes', 'propostas', 'devolucoes',
    'contasReceber', 'contasPagar', 'fornecedores', 'categoriasFinanceiras', 'centrosCusto', 'transportes', 'tipos']);

function validarIdentidades(s) {
    for (const chave of COLECOES_IDENTIDADE) {
        const ids = new Set();
        for (const item of s[chave]) {
            if (!item || Array.isArray(item) || typeof item !== 'object' || !idValido(item.id)
                || ids.has(chaveId(item.id))) return false;
            ids.add(chaveId(item.id));
        }
    }
    return true;
}

/** Capacidades de bootstrap confiavel. Cada dominio deve reconciliar TODAS as
 * suas evidencias, nao somente estrutura ou igualdade memoria/armazenamento.
 * Os nucleos reais serao disponibilizados no Lote 2; ausencia nunca e aprovacao.
 */
export function criarCodecLegado({ validadores = {} } = {}) {
    const registro = new Map(DOMINIOS_VALIDACAO.map(d => [d, validadores[d]]));
    const pendentes = Object.freeze(DOMINIOS_VALIDACAO.filter(d => typeof registro.get(d) !== 'function'));
    function preparar(textoOriginal, contextoJournal = null) {
        try {
            const original = decodificarTextoEstrito(textoOriginal);
            const s = JSON.parse(original.texto);
            if (!s || Array.isArray(s) || typeof s !== 'object') return falha('ESTADO_LEGADO_INVALIDO');
            // Unica compatibilidade automatica permitida: catalogos ausentes em bases antigas.
            for (const k of ['categoriasFinanceiras', 'centrosCusto', 'encargosFinanceiros']) {
                if (!Object.hasOwn(s, k)) s[k] = [];
            }
            const normalizado = decodificarTextoEstrito(JSON.stringify(s));
            if (!validarEstruturaSnapshotIndexedDB(normalizado.texto) || !validarIdentidades(normalizado.valor)) {
                return falha('ESTADO_LEGADO_INVALIDO');
            }
            if (pendentes.length) return falha('VALIDACAO_GLOBAL_INDISPONIVEL');
            for (const dominio of DOMINIOS_VALIDACAO) {
                if (registro.get(dominio)(normalizado.texto, contextoJournal) !== true) return falha('INTEGRIDADE_DOMINIO_INVALIDA');
            }
            const snapshot = congelar({ estado: normalizado.valor });
            snapshots.set(snapshot, { codec: api, textoOriginal, textoCanonicoOrigem: original.texto,
                snapshotTexto: normalizado.texto });
            return Object.freeze({ ok: true, snapshot });
        } catch (_erro) { return falha('ESTADO_LEGADO_INVALIDO'); }
    }
    const api = Object.freeze({
        dominiosPendentes: pendentes,
        preparar,
        serializar(snapshot) {
            const dados = snapshots.get(snapshot);
            return dados?.codec === api ? Object.freeze({ ok: true, textoOriginal: dados.textoOriginal,
                textoCanonicoOrigem: dados.textoCanonicoOrigem, snapshotTexto: dados.snapshotTexto }) : falha('SNAPSHOT_NAO_CONFIAVEL');
        },
        validarTexto(texto, contextoJournal = null) { return preparar(texto, contextoJournal).ok === true; }
    });
    return api;
}

export function validarIdentidadeBaseTexto(texto) {
    try {
        const d = decodificarTextoEstrito(texto);
        const b = d.valor;
        if (!b || Array.isArray(b) || Object.keys(b).sort().join('|') !== 'baseId|epocaAutoridade|protocolo'
            || b.protocolo !== 1 || ![b.baseId, b.epocaAutoridade].every(v => typeof v === 'string'
                && v.length > 0 && v.length <= 200 && v.trim() === v)) return falha('IDENTIDADE_BASE_INVALIDA');
        return Object.freeze({ ok: true, texto: d.texto });
    } catch (_erro) { return falha('IDENTIDADE_BASE_INVALIDA'); }
}
