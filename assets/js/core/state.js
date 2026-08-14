// Estado global do sistema
// === SISTEMA MTZ EVENTOS (V11 FINAL CORRIGIDA) ===
(() => {
    const estadoInicial = {
        locadores: [],
        pecas: [],
        locacoes: [],
        propostas: [],
        devolucoes: [],
        movimentacoesEstoque: [],
        transportes: [],
        tipos: [],
        usuarios: [],
        logsAuditoria: [],
        modelosChecklist: [],
        checklistsGerados: [],
        checklistMontagem: [],
        checklistConferencia: {},
        checklistEtapasMontagem: [],
        config: {
        rodape: "MTZ Eventos",
        tel: "",
        email: "",
        logo: "",
        emailsPermitidos: "",
        adminEmails: "",
        valorKmFretePadrao: 0,
        padroesOrcamento: null,
        categoriasOrcamento: null,
        perfilFiscalEmpresa: {
            regimeTributario: "",
            cnpj: "",
            inscricaoMunicipal: "",
            municipioEstabelecimento: "",
            ufEstabelecimento: "",
            cnaes: [],
            validadoPorContador: false,
            responsavelValidacao: "",
            dataValidacao: "",
            vigenciaInicio: "",
            observacoes: ""
        }
        }
    };
    const chaves = Object.freeze(Object.keys(estadoInicial));
    let estadoRaiz = estadoInicial;
    let controladorEntregue = false;

    chaves.forEach((chave) => {
        Object.defineProperty(window, chave, {
            configurable: false,
            enumerable: true,
            get: () => estadoRaiz[chave],
            set: (valor) => {
                estadoRaiz[chave] = valor;
            }
        });
    });

    Object.defineProperty(window, '__obterControladorEstadoAplicacao', {
        configurable: true,
        enumerable: false,
        value: () => {
            if (controladorEntregue) return null;
            controladorEntregue = true;
            return Object.freeze({
                chaves: chaves.slice(),
                obterReferencia: () => estadoRaiz,
                publicarReferencia: (estadoAnterior, estadoConfirmado) => {
                    if (estadoRaiz !== estadoAnterior || !estadoConfirmado
                        || typeof estadoConfirmado !== 'object' || Array.isArray(estadoConfirmado)) {
                        return false;
                    }
                    estadoRaiz = estadoConfirmado;
                    return true;
                }
            });
        }
    });
})();

let carrinhoLocacao = [];
let tokenClient, filtroAtual = 'todos';
let paginaAtual = {
    locadores: 1,
    pecas: 1,
    locacoes: 1
};
const ITENS_POR_PAGINA = 50;

// Cache auxiliar de disponibilidade
let cacheDisponibilidade = null;
let ultimaAtualizacaoCache = 0;
