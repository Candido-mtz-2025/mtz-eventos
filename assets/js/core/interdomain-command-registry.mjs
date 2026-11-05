import { criarGatewayComandos } from './command-gateway.mjs';
import { COMANDO_CONVERSAO_PROPOSTA, validarIntencaoConversaoTexto,
    reduzirConversaoJournalTexto } from './proposal-conversion-replay.mjs';
import { consultarContextoJournal } from './indexeddb-authority.mjs';
import { decodificarTextoEstrito, validarIdentidadeBaseTexto } from './legacy-state-codec.mjs';
import { criarNucleoCadastroCliente } from './customer-kernel.generated.mjs';
import { COMANDOS_PROPOSTA, validarComandoPropostaTexto, prepararComandoPropostaTexto,
    COMANDO_CONFIG_ORCAMENTO, validarConfigOrcamentoTexto, prepararConfigOrcamentoTexto } from './proposal-command-kernels.mjs';
import { COMANDOS_FINANCEIROS_ENSAIO, criarDescritoresFinanceirosDeEnsaio } from './financial-command-registry.mjs';
import { validarDadosTransporteTexto, prepararTransporteOperacionalTexto,
    validarRaizOperacionalTransporteTexto } from './operational-transactions.mjs';
import { reconciliarLedgerEstoqueV2Texto, provarRaizJournalEstoqueTexto } from './operational-stock-ledger.mjs';
import { provarRaizLedgerCatalogosTexto } from './operational-stock-ledger.mjs';
import { COMANDOS_CADASTRAIS, validarComandoCadastralTexto, prepararComandoCadastralTexto,
    validarHistoricoCadastralTexto, validarCamposCliente } from './catalog-command-kernels.mjs';
import { prepararCandidatoReservaInicialV2Texto, prepararCandidatoAjusteItensV2Texto,
    prepararCandidatoDevolucaoV2Texto, prepararCandidatoCancelamentoV2Texto } from './operational-return-planner.mjs';

const cadastro = criarNucleoCadastroCliente();
const canon = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
const ref = id => `cliente:${encodeURIComponent(JSON.stringify([typeof id, id]))}`;
const exigir = (v, m) => { if (!v) throw Error(m); };
const falha = (codigo, recuperar = false) => Object.freeze({ ok: false, codigo, requerRecuperacao: recuperar, publicado: false });
const idValido = id => typeof id === 'string' && id.trim().length > 0 && id.length <= 160
    || typeof id === 'number' && Number.isSafeInteger(id) && !Object.is(id, -0);

export function validarCadastroClienteTexto(texto) {
    try {
        const d = decodificarTextoEstrito(texto).valor;
        return d && !Array.isArray(d) && Object.keys(d).sort().join('|') === 'campos|id' && idValido(d.id)
            && validarCamposCliente(d.campos);
    } catch (_) { return false; }
}

/** Menor comando cadastral: reutiliza montagem e duplicidade do formulario real. */
export function prepararCadastroClienteTexto(snapshotTexto, dadosTexto, metadadosTexto) {
    try {
        exigir(validarCadastroClienteTexto(dadosTexto), 'CADASTRO_CLIENTE_INVALIDO');
        const s = JSON.parse(decodificarTextoEstrito(snapshotTexto).texto);
        const d = decodificarTextoEstrito(dadosTexto).valor, m = decodificarTextoEstrito(metadadosTexto).valor;
        exigir(Object.keys(m).sort().join('|') === 'atorReferencia|operacaoId|timestamp'
            && typeof m.operacaoId === 'string' && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId)
            && typeof m.atorReferencia === 'string' && m.atorReferencia.trim()
            && typeof m.timestamp === 'string' && new Date(m.timestamp).toISOString() === m.timestamp,
        'METADADOS_INVALIDOS');
        exigir(!s.locadores.some(c => typeof c.id === typeof d.id && c.id === d.id), 'CLIENTE_ID_DUPLICADO');
        exigir(!s.logsAuditoria.some(a => a.origem === 'cadastro_cliente_transacional'
            && a.clienteReferencia === ref(d.id)), 'CLIENTE_IDENTIDADE_JA_UTILIZADA');
        exigir(!s.logsAuditoria.some(a => a.operacaoId === m.operacaoId), 'OPERACAO_REQUER_RECUPERACAO');
        const dados = cadastro.montarDadosClienteCampos(d.campos);
        exigir(!cadastro.encontrarLocadorDuplicado(dados, null, s.locadores), 'CLIENTE_DUPLICADO');
        const registro = { id: d.id, ...dados };
        s.locadores.push(registro);
        s.logsAuditoria.push({ id: `audit-cliente-${m.operacaoId}`, tipo: 'cliente', acao: 'criar',
            origem: 'cadastro_cliente_transacional', operacaoId: m.operacaoId, usuario: m.atorReferencia,
            data: m.timestamp, timestamp: m.timestamp, clienteReferencia: ref(d.id),
            assinaturaPlano: canon({ comando: 'cliente.cadastrar.v1', dados: d, metadados: m }),
            registroSnapshot: registro });
        exigir(Number.isSafeInteger(s.ultimaEdicao) && s.ultimaEdicao >= 0
            && s.ultimaEdicao < Number.MAX_SAFE_INTEGER, 'REVISAO_LEGADA_INVALIDA');
        s.ultimaEdicao++; s.data = m.timestamp;
        return Object.freeze({ ok: true, snapshotTexto: canon(s), publicado: false });
    } catch (e) { return Object.freeze({ ...falha('OPERACAO_REQUER_RECUPERACAO', true), motivo: e.message }); }
}

const ESTOQUE = Object.freeze({
    'estoque.reservar.v2': { tipo: 'reserva_inicial', permissao: 'reservar_estoque', preparar: prepararCandidatoReservaInicialV2Texto },
    'locacao.ajustar_itens.v2': { tipo: 'ajuste_itens', permissao: 'editar_locacao', preparar: prepararCandidatoAjusteItensV2Texto },
    'estoque.devolver.v2': { permissao: 'registrar_devolucao', preparar: prepararCandidatoDevolucaoV2Texto },
    'locacao.cancelar.v2': { tipo: 'cancelamento_locacao', permissao: 'cancelar_locacao', preparar: prepararCandidatoCancelamentoV2Texto }
});
const TRANSPORTE = Object.freeze(['transporte.criar.v1', 'transporte.editar.v1', 'transporte.status.v1', 'transporte.excluir.v1']);
const CONFIRMAR_PERFIL = 'config.perfil_fiscal_confirmar.v1';
const FRETE_PADRAO = 'config.orcamento_frete_padrao.v1';
function validarFretePadrao(texto) {
    try {
        const d=decodificarTextoEstrito(texto).valor, v=d?.valorKmFretePadrao;
        return d && Object.keys(d).join('|')==='valorKmFretePadrao'
            && typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER/100;
    } catch (_) { return false; }
}
function validarConfirmacaoFiscal(texto) {
    try {
        const d=decodificarTextoEstrito(texto).valor;
        return d && Object.keys(d).join('|')==='validadoPorContador' && d.validadoPorContador===true;
    } catch (_) { return false; }
}
function validarEstoque(tipo, texto) {
    try {
        const d = decodificarTextoEstrito(texto).valor;
        if (!d || Array.isArray(d) || typeof d.locacaoReferencia !== 'string') return false;
        if (tipo === 'estoque.reservar.v2' || tipo === 'locacao.cancelar.v2')
            return Object.keys(d).sort().join('|') === 'locacaoReferencia|tipo' && d.tipo === ESTOQUE[tipo].tipo;
        // Os preparadores compartilhados fazem a validacao exata dos itens e campos.
        return tipo === 'locacao.ajustar_itens.v2'
            ? d.tipo === 'ajuste_itens' && Object.keys(d).sort().join('|') === 'itens|locacaoReferencia|tipo' && Array.isArray(d.itens)
            : Object.keys(d).sort().join('|') === 'dataDevolucao|itens|locacaoReferencia' && Array.isArray(d.itens);
    } catch (_) { return false; }
}

/** Ensaio FECHADO, origem sem reserva. Nenhuma aba nem importador geral o utiliza. */
export function criarGatewayInterdominiosDeEnsaio(c) {
    exigir(c.ensaioSintetico === true && typeof c.nomeBanco === 'string'
        && /^mtz-idb-fundacao-lote1-teste-interdominios-[a-zA-Z0-9-]+$/.test(c.nomeBanco)
        && typeof c.obterAtorAutorizado === 'function', 'ENSAIO_INTERDOMINIOS_OBRIGATORIO');
    const identidade = validarIdentidadeBaseTexto(c.identidadeBaseTexto);
    exigir(identidade.ok && JSON.parse(identidade.texto).baseId.startsWith('ensaio-interdominios:'), 'IDENTIDADE_ENSAIO_INVALIDA');
    const origem = reconciliarLedgerEstoqueV2Texto(c.origemLedgerTexto);
    exigir(origem.ok && origem.snapshotTexto, 'ORIGEM_INVALIDA');
    const l = decodificarTextoEstrito(c.origemLedgerTexto).valor;
    exigir(JSON.parse(l.origemTexto).tipo === 'sem_reserva_v2' && l.eventos.length === 0,
        'PERFIL_INICIAL_SEM_RESERVA_OBRIGATORIO');
    const data = c.dataReferencia;
    const catalogos = provarRaizLedgerCatalogosTexto(c.origemLedgerTexto, origem.snapshotTexto, `${data}T12:00:00.000Z`);
    exigir(catalogos.ok && validarRaizOperacionalTransporteTexto(origem.snapshotTexto, data, catalogos.comprovacao), 'ORIGEM_GLOBAL_INVALIDA');
    const financeiros = criarDescritoresFinanceirosDeEnsaio();
    const dominios = { [COMANDO_CONVERSAO_PROPOSTA]: 'propostas',
        ...Object.fromEntries(Object.keys(financeiros).map(t => [t, 'financeiro'])),
        ...Object.fromEntries(TRANSPORTE.map(t => [t, 'transporte'])),
        ...Object.fromEntries(Object.keys(ESTOQUE).map(t => [t, 'estoque'])), 'cliente.cadastrar.v1': 'clientes',
        ...Object.fromEntries(Object.entries(COMANDOS_CADASTRAIS).map(([t,s]) => [t, s.tipo === 'cliente' ? 'clientes' : 'tipos'])),
        ...Object.fromEntries(Object.keys(COMANDOS_PROPOSTA).map(t => [t, 'propostas'])),
        [CONFIRMAR_PERFIL]: 'configuracao', [FRETE_PADRAO]: 'configuracao', [COMANDO_CONFIG_ORCAMENTO]: 'configuracao' };
    const permissao = tipo => tipo === '@inicializar' ? 'restaurar_backup' : tipo === 'ler' ? 'visualizar_locacoes'
        : [CONFIRMAR_PERFIL,FRETE_PADRAO,COMANDO_CONFIG_ORCAMENTO].includes(tipo) ? 'configuracao'
        : tipo === COMANDO_CONVERSAO_PROPOSTA ? 'converter_proposta_locacao'
        : tipo === 'cliente.cadastrar.v1' ? 'cadastrar_cliente' : COMANDOS_PROPOSTA[tipo]?.permissao || COMANDOS_CADASTRAIS[tipo]?.permissao || ESTOQUE[tipo]?.permissao
            || COMANDOS_FINANCEIROS_ENSAIO[tipo]?.permissao || (TRANSPORTE.includes(tipo) ? 'gerenciar_transporte' : null);
    const ator = tipo => { try { const p = permissao(tipo); return p ? c.obterAtorAutorizado(p) : null; } catch (_) { return null; } };
    const validarDados = (tipo, t) => tipo === CONFIRMAR_PERFIL ? validarConfirmacaoFiscal(t)
        : tipo === COMANDO_CONVERSAO_PROPOSTA ? validarIntencaoConversaoTexto(t)
        : tipo === FRETE_PADRAO ? validarFretePadrao(t)
        : tipo === COMANDO_CONFIG_ORCAMENTO ? validarConfigOrcamentoTexto(t)
        : financeiros[tipo] ? financeiros[tipo].validar(t)
        : COMANDOS_PROPOSTA[tipo] ? validarComandoPropostaTexto(tipo,t) : TRANSPORTE.includes(tipo) ? validarDadosTransporteTexto(tipo, t)
            : ESTOQUE[tipo] ? validarEstoque(tipo, t) : COMANDOS_CADASTRAIS[tipo]
                ? validarComandoCadastralTexto(tipo, t) : validarCadastroClienteTexto(t);
    function reduzir(tipo, antes, dados, meta, capacidade) {
        const ctx = consultarContextoJournal(capacidade);
        exigir(ctx && ctx.tipo === tipo && ctx.dominio === dominios[tipo] && ctx.snapshotAnteriorTexto === antes
            && ctx.dadosTexto === dados && ctx.operacaoId === meta.operacaoId && ctx.timestamp === meta.timestamp
            && ctx.atorReferencia === meta.atorReferencia && validarDados(tipo, dados), 'CONTEXTO_COMANDO_INVALIDO');
        if (tipo === COMANDO_CONVERSAO_PROPOSTA) return reduzirConversaoJournalTexto(antes, dados, meta, capacidade);
        if (financeiros[tipo]) return financeiros[tipo].aplicar(antes, dados, meta);
        if (tipo === COMANDO_CONFIG_ORCAMENTO) return prepararConfigOrcamentoTexto(antes,dados,meta);
        if (tipo === FRETE_PADRAO) {
            const s=JSON.parse(antes), d=JSON.parse(dados);
            s.config.valorKmFretePadrao=d.valorKmFretePadrao;
            return canon(s);
        }
        if (tipo === CONFIRMAR_PERFIL) {
            const s=JSON.parse(antes), perfil=s.config?.perfilFiscalEmpresa;
            exigir(perfil && typeof perfil==='object' && !Array.isArray(perfil)
                && perfil.validadoPorContador===false,'PERFIL_FISCAL_NAO_CONFIRMAVEL');
            for(const campo of ['cnpj','regimeTributario','responsavelValidacao'])
                exigir(typeof perfil[campo]==='string' && perfil[campo].trim(),'PERFIL_FISCAL_INCOMPLETO');
            perfil.validadoPorContador=true;
            // O evento de configuracao fica na auditoria e no recibo do journal.
            return canon(s);
        }
        if (TRANSPORTE.includes(tipo)) {
            const r = prepararTransporteOperacionalTexto(tipo, antes, dados, canon(meta));
            exigir(r.ok, r.codigo); return r.snapshotTexto;
        }
        if (tipo === 'cliente.cadastrar.v1') {
            const r = prepararCadastroClienteTexto(antes, dados, canon(meta));
            exigir(r.ok, r.motivo); return r.snapshotTexto;
        }
        if (COMANDOS_CADASTRAIS[tipo]) {
            const r = prepararComandoCadastralTexto(tipo, antes, dados, canon(meta));
            exigir(r.ok, r.motivo); return r.snapshotTexto;
        }
        if (COMANDOS_PROPOSTA[tipo]) {
            const r = prepararComandoPropostaTexto(tipo, antes, dados, canon(meta), capacidade);
            exigir(r.ok, r.motivo); return r.snapshotTexto;
        }
        const anteriores = ctx.eventosAnteriores.filter(e => Object.hasOwn(ESTOQUE, e.tipo));
        const causal = canon({ sequencia: anteriores.length + 1, predecessor: anteriores.at(-1)?.operacaoId || null });
        const preparar = ESTOQUE[tipo].preparar;
        const r = tipo === 'locacao.ajustar_itens.v2' || tipo === 'estoque.devolver.v2'
            ? preparar(antes, dados, canon(meta), null, causal) : preparar(antes, dados, canon(meta), causal, capacidade);
        exigir(r.ok, r.motivo); return r.candidatoTexto;
    }
    const verificadas = new WeakMap();
    function validar(texto, capacidade) {
        if (!capacidade) return texto === origem.snapshotTexto;
        if (verificadas.has(capacidade)) return verificadas.get(capacidade) === texto;
        try {
            const ctx = consultarContextoJournal(capacidade);
            exigir(ctx?.fase === 'validar' && ctx.identidadeBaseTexto === identidade.texto
                && ctx.snapshotPosteriorTexto === texto && Object.hasOwn(dominios, ctx.tipo), 'CONTEXTO_JOURNAL_INVALIDO');
            const esperado = reduzir(ctx.tipo, ctx.snapshotAnteriorTexto, ctx.dadosTexto,
                { operacaoId: ctx.operacaoId, atorReferencia: ctx.atorReferencia, timestamp: ctx.timestamp }, capacidade);
            exigir(esperado === texto, 'DIFERENCA_NAO_AUTORIZADA');
            const prova = provarRaizJournalEstoqueTexto(capacidade, texto, `${data}T12:00:00.000Z`);
            exigir(prova.ok && validarRaizOperacionalTransporteTexto(texto, data, prova.comprovacao, capacidade), 'INTEGRIDADE_GLOBAL_DIVERGENTE');
            exigir(validarHistoricoCadastralTexto(texto, origem.snapshotTexto, capacidade), 'CADEIA_CADASTRAL_DIVERGENTE');
            verificadas.set(capacidade, texto); return true;
        } catch (_) { return false; }
    }
    const comandos = Object.fromEntries(Object.entries(dominios).map(([tipo, dominio]) => [tipo, {
        dominio, validar: dados => validarDados(tipo, dados),
        ...(financeiros[tipo]?.reconhecerHistorico ? { reconhecerHistorico: financeiros[tipo].reconhecerHistorico } : {}),
        aplicar: (antes, dados, meta, capacidade) => reduzir(tipo, antes, dados, meta, capacidade)
    }]));
    const g = criarGatewayComandos({ ...c, comandos, autorizar: ator,
        validadores: Object.fromEntries(['receber', 'pagar', 'classificacoes', 'conciliacoes', 'conversoes', 'operacional', 'encargos'].map(d => [d, validar])) });
    const entradas = new WeakMap();
    const conferir = (r, tipo, original) => {
        if (!r.ok) return r;
        const autor = r.recibo?.atorReferencia || r.comprovacao?.atorReferencia || original;
        return typeof autor === 'string' && ator(tipo) === autor ? r
            : falha(r.codigo === 'COMMIT_CONFIRMADO' ? 'ESTADO_CONFIRMADO_REQUER_RECUPERACAO' : 'PERMISSAO_NEGADA', r.codigo === 'COMMIT_CONFIRMADO');
    };
    return Object.freeze({ ...g, comandosDisponiveis: Object.freeze(Object.keys(comandos)),
        async prepararImportacao(id, texto) {
            try { if (decodificarTextoEstrito(texto).texto !== origem.snapshotTexto) return falha('IMPORTACAO_FORA_DA_ORIGEM_COMPROVADA', true); }
            catch (_) { return falha('SNAPSHOT_INVALIDO', true); }
            const r = await g.prepararImportacao(id, texto); if (r.ok) entradas.set(r.entrada, '@inicializar'); return r;
        },
        async prepararComando(id, tipo, rev, dados) {
            const r = await g.prepararComando(id, tipo, rev, dados); if (r.ok) entradas.set(r.entrada, tipo); return r;
        },
        async executar(e) { return conferir(await g.executar(e), entradas.get(e)); },
        async recuperarResultado(e) { return conferir(await g.recuperarResultado(e), entradas.get(e)); },
        async ler() { const a = ator('ler'); return conferir(await g.ler(), 'ler', a); }
    });
}
