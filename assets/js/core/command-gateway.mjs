import { criarAutoridadeIndexedDB } from './indexeddb-authority.mjs';
import { criarCodecLegado, decodificarTextoEstrito, validarIdentidadeBaseTexto } from './legacy-state-codec.mjs';

const falha = codigo => Object.freeze({ ok: false, codigo, publicado: false,
    requerRecuperacao: codigo === 'OPERACAO_REQUER_RECUPERACAO' });

/** Nao carregado pelo aplicativo. Nao ha API para ativar producao neste lote.
 * Configuracao e registro de redutores sao capacidades privadas do bootstrap,
 * nunca argumentos vindos de formularios. So bancos de ensaio podem executar.
 */
export function criarGatewayComandos(configuracao = {}) {
    const identidade = validarIdentidadeBaseTexto(configuracao.identidadeBaseTexto);
    if (!identidade.ok) throw new TypeError('IDENTIDADE_BASE_INVALIDA');
    const codec = criarCodecLegado({ validadores: configuracao.validadores });
    const ensaio = configuracao.ensaioSintetico === true;
    const nomeBanco = configuracao.nomeBanco;
    if (ensaio && (typeof nomeBanco !== 'string' || !/^mtz-idb-fundacao-lote1-teste-[a-zA-Z0-9-]+$/.test(nomeBanco))) {
        throw new TypeError('BANCO_DE_ENSAIO_OBRIGATORIO');
    }
    const entradas = new WeakMap();
    let autoridade = null;
    function obterAutoridade() {
        if (!autoridade) autoridade = criarAutoridadeIndexedDB({ nomeBanco,
            identidadeBaseTexto: identidade.texto, validarSnapshot: (texto, contexto) => codec.validarTexto(texto, contexto),
            comandos: configuracao.comandos || {}, autorizar: configuracao.autorizar,
            ...(Object.hasOwn(configuracao, 'indexedDB') ? { indexedDB: configuracao.indexedDB } : {}) });
        return autoridade;
    }
    function guardar(resultado) {
        if (!resultado.ok) return resultado;
        const entrada = Object.freeze({});
        entradas.set(entrada, resultado.entrada);
        return Object.freeze({ ok: true, entrada });
    }
    const indisponivel = () => !ensaio ? falha('GATEWAY_INATIVO')
        : codec.dominiosPendentes.length ? falha('VALIDACAO_GLOBAL_INDISPONIVEL') : null;
    const resposta = r => Object.freeze({ ...r, identidadeBaseTexto: identidade.texto, publicado: false });
    return Object.freeze({
        estado: ensaio ? 'ENSAIO_SINTETICO' : 'INATIVO',
        identidadeBaseTexto: identidade.texto,
        dominiosPendentes: codec.dominiosPendentes,
        validarLegado: texto => codec.preparar(texto),
        async prepararImportacao(operacaoId, textoOriginal) {
            const bloqueio = indisponivel(); if (bloqueio) return bloqueio;
            const preparado = codec.preparar(textoOriginal);
            if (!preparado.ok) return preparado;
            const serializado = codec.serializar(preparado.snapshot);
            return guardar(obterAutoridade().prepararInicializacao(operacaoId, serializado.snapshotTexto));
        },
        async prepararComando(operacaoId, tipo, revisaoEsperada, dadosTexto) {
            const bloqueio = indisponivel(); if (bloqueio) return bloqueio;
            try {
                const dados = decodificarTextoEstrito(dadosTexto);
                return guardar(obterAutoridade().prepararComando(operacaoId, tipo, revisaoEsperada, dados.texto));
            } catch (_erro) { return falha('COMANDO_INVALIDO'); }
        },
        async executar(entrada) {
            const bloqueio = indisponivel(); if (bloqueio) return bloqueio;
            if (!entradas.has(entrada)) return falha('ENTRADA_NAO_CONFIAVEL');
            return resposta(await obterAutoridade().executar(entradas.get(entrada)));
        },
        async recuperarResultado(entrada) {
            const bloqueio = indisponivel(); if (bloqueio) return bloqueio;
            if (!entradas.has(entrada)) return falha('ENTRADA_NAO_CONFIAVEL');
            return resposta(await obterAutoridade().consultarResultado(entradas.get(entrada)));
        },
        async ler() {
            const bloqueio = indisponivel(); if (bloqueio) return bloqueio;
            return resposta(await obterAutoridade().ler());
        },
        // Contrato negativo: nao intercepta escritores antigos ou clientes ja abertos.
        permitirEscritorLegado() { return false; },
        permitirSnapshotRemoto() { return false; },
        permitirPublicacao() { return false; }
    });
}
