import { validarIdentidadeBaseTexto } from './legacy-state-codec.mjs';

const falha = codigo => Object.freeze({ ok: false, codigo, publicado: false });
const congelar = v => {
    if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); }
    return v;
};

/** Bootstrap privado de ENSAIO. Nao importado pelo aplicativo e sem API de ativacao real.
 * O banco auxiliar guarda apenas a selecao da autoridade, nunca dados ou outro journal.
 * Todos os participantes usam o mesmo lock por banco, inclusive na troca de modo.
 */
export function criarFronteiraEscritaDeEnsaio(c) {
    const identidade = validarIdentidadeBaseTexto(c.identidadeBaseTexto);
    if (c.ensaioSintetico !== true || !identidade.ok
        || !/^mtz-idb-fundacao-lote1-teste-interdominios-[a-zA-Z0-9-]+$/.test(c.nomeBanco)
        || typeof c.criarGatewayPrivado !== 'function' || typeof c.publicarConfirmado !== 'function') {
        throw new TypeError('FRONTEIRA_DE_ENSAIO_OBRIGATORIA');
    }
    const idb = Object.hasOwn(c, 'indexedDB') ? c.indexedDB : globalThis.indexedDB;
    const locks = Object.hasOwn(c, 'locks') ? c.locks : globalThis.navigator?.locks;
    const nome = `${c.nomeBanco}-fronteira`, lock = `mtz:autoridade:${c.nomeBanco}`;
    let legado = false, gatewayPermitido = false, revisaoVisual = -1, ocupado = false;
    const g = c.criarGatewayPrivado(() => gatewayPermitido);
    const permitidos = new Set(g.comandosDisponiveis);
    async function gateway(fn) {
        gatewayPermitido = true;
        try { return await fn(); } finally { gatewayPermitido = false; }
    }
    async function registro(alterar) {
        if (!idb) throw Error('AUTORIDADE_INDISPONIVEL');
        const db = await new Promise((ok, no) => {
            const r = idb.open(nome, 1);
            r.onupgradeneeded = () => r.result.createObjectStore('selecao', { keyPath: 'chave' });
            r.onerror = () => no(Error('AUTORIDADE_INDISPONIVEL'));
            r.onblocked = () => no(Error('AUTORIDADE_INDISPONIVEL'));
            r.onsuccess = () => ok(r.result);
        });
        try {
            return await new Promise((ok, no) => {
                const tx = db.transaction('selecao', alterar ? 'readwrite' : 'readonly');
                let valor, erro;
                tx.onabort = tx.onerror = () => no(Error(erro || 'AUTORIDADE_INDISPONIVEL'));
                tx.oncomplete = () => ok(valor);
                const store = tx.objectStore('selecao'), r = store.getAll();
                r.onsuccess = () => {
                    try {
                        if (r.result.length > 1) throw Error('AUTORIDADE_INCONSISTENTE');
                        valor = r.result[0] || null;
                        if (valor && (Object.keys(valor).sort().join('|') !== 'chave|identidadeBaseTexto|modo|protocolo'
                            || valor.chave !== 'atual' || valor.protocolo !== 1
                            || valor.identidadeBaseTexto !== identidade.texto
                            || !['LEGADO', 'TRANSACIONAL'].includes(valor.modo))) throw Error('AUTORIDADE_INCONSISTENTE');
                        if (alterar) {
                            valor = alterar(valor);
                            store.put(valor);
                        }
                    } catch (e) { erro = e.message; tx.abort(); }
                };
            });
        } finally { db.close(); }
    }
    async function executarProtegido(fn) {
        if (!locks?.request) return falha('COORDENACAO_INDISPONIVEL');
        // Reentrada local nao espera por um lock que ela propria esta segurando.
        if (ocupado) return falha('OPERACAO_EM_ANDAMENTO');
        ocupado = true;
        try { return await locks.request(lock, { mode: 'exclusive' }, fn); }
        catch (e) { return falha(e.message || 'AUTORIDADE_INDISPONIVEL'); }
        finally { ocupado = false; legado = false; gatewayPermitido = false; }
    }
    async function modoExigido(modo) {
        const r = await registro();
        if (!r || r.modo !== modo) throw Error(r ? 'AUTORIDADE_INCOMPATIVEL' : 'AUTORIDADE_DESCONHECIDA');
    }
    function comando(d) {
        if (!d || Object.getPrototypeOf(d) !== Object.prototype
            || Object.keys(d).sort().join('|') !== 'dadosTexto|operacaoId|revisaoEsperada|tipo'
            || !permitidos.has(d.tipo) || typeof d.dadosTexto !== 'string'
            || typeof d.operacaoId !== 'string' || !Number.isSafeInteger(d.revisaoEsperada)
            || d.revisaoEsperada < 0) throw Error('COMANDO_NAO_CERTIFICADO');
        return Object.freeze({ ...d });
    }
    async function publicar(r) {
        if (!r.ok) return r;
        if (r.codigo === 'OPERACAO_HISTORICA_RECONHECIDA') return r;
        // Leitura integral revalida journal, recibos e permissoes; nunca publica o candidato.
        const atual = await gateway(() => g.ler());
        if (!atual.ok || atual.identidadeBaseTexto !== identidade.texto
            || !Number.isSafeInteger(atual.revisaoAtual) || atual.revisaoAtual < r.revisaoAtual
            || atual.revisaoAtual < revisaoVisual) return falha('ESTADO_CONFIRMADO_REQUER_RECUPERACAO');
        if (atual.revisaoAtual === revisaoVisual) return Object.freeze({ ...r, publicado: false });
        try {
            const estado = congelar(JSON.parse(atual.snapshotTexto));
            // Portas de publicacao sao sincronas: confirmacao e troca visual sob o mesmo lock.
            if (c.publicarConfirmado(estado, Object.freeze({ revisao: atual.revisaoAtual,
                identidadeBaseTexto: identidade.texto, recibo: r.recibo || null })) !== true) {
                throw Error('PUBLICACAO_RECUSADA');
            }
            revisaoVisual = atual.revisaoAtual;
            return Object.freeze({ ...r, revisaoVisual, publicado: true });
        } catch (_) { return falha('ESTADO_CONFIRMADO_REQUER_RECUPERACAO'); }
    }
    const cliente = Object.freeze({
        async executar(d) {
            let pedido; try { pedido = comando(d); } catch (e) { return falha(e.message); }
            return executarProtegido(async () => {
                await modoExigido('TRANSACIONAL');
                const e = await gateway(() => g.prepararComando(pedido.operacaoId, pedido.tipo,
                    pedido.revisaoEsperada, pedido.dadosTexto));
                if (!e.ok) return e;
                // Consulta antes de repetir: resposta perdida nunca exige uma nova operacao.
                let r = await gateway(() => g.recuperarResultado(e.entrada));
                if (r.codigo === 'OPERACAO_NAO_ENCONTRADA') {
                    try { r = await gateway(() => g.executar(e.entrada)); }
                    catch (_) { r = await gateway(() => g.recuperarResultado(e.entrada)); }
                }
                return publicar(r);
            });
        },
        async recuperar(d) {
            let pedido; try { pedido = comando(d); } catch (e) { return falha(e.message); }
            return executarProtegido(async () => {
                await modoExigido('TRANSACIONAL');
                const e = await gateway(() => g.prepararComando(pedido.operacaoId, pedido.tipo,
                    pedido.revisaoEsperada, pedido.dadosTexto));
                return e.ok ? publicar(await gateway(() => g.recuperarResultado(e.entrada))) : e;
            });
        },
        async atualizar() {
            return executarProtegido(async () => {
                await modoExigido('TRANSACIONAL');
                return publicar(await gateway(() => g.ler()));
            });
        },
        async executarLegado(fn) {
            return executarProtegido(async () => {
                await modoExigido('LEGADO');
                if (typeof fn !== 'function' || fn.constructor.name !== 'Function') return falha('ESCRITOR_ASSINCRONO_NAO_MIGRADO');
                legado = true;
                let r; try { r = fn(); } finally { legado = false; }
                if (r && typeof r.then === 'function') return falha('ESCRITOR_ASSINCRONO_NAO_MIGRADO');
                // A lease coordena o escritor; nao transforma seu retorno em recibo de commit.
                return r === true ? Object.freeze({ ok: true, codigo: 'ESCRITOR_LEGADO_EXECUTADO',
                    persistenciaConfirmada: false, publicado: false }) : falha('LEGADO_NAO_CONFIRMADO');
            });
        }
    });
    return Object.freeze({ cliente,
        permitirLegado: () => legado,
        // Capacidade de bootstrap de testes. Nao entregar a formularios ou eventos.
        async selecionarModoDeEnsaio(modo) {
            if (!['LEGADO', 'TRANSACIONAL'].includes(modo)) return falha('AUTORIDADE_DESCONHECIDA');
            return executarProtegido(async () => {
                const anterior = await registro();
                if (!anterior) {
                    const base = await gateway(() => g.ler());
                    if (!base.ok || base.revisaoAtual !== 0) return falha('SELECAO_AUSENTE_REQUER_RECUPERACAO');
                }
                if (modo === 'TRANSACIONAL') {
                    const r = await gateway(() => g.ler());
                    if (!r.ok || r.identidadeBaseTexto !== identidade.texto) return falha('BASE_NAO_VERIFICADA');
                }
                await registro(anterior => {
                    if ((!anterior && modo !== 'LEGADO') || anterior?.modo === 'TRANSACIONAL') throw Error('CORTE_NAO_PERMITIDO');
                    return { chave: 'atual', protocolo: 1, identidadeBaseTexto: identidade.texto, modo };
                });
                return Object.freeze({ ok: true, codigo: 'MODO_DE_ENSAIO_CONFIRMADO', publicado: false });
            });
        }
    });
}
