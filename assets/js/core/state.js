// Estado global do sistema
// === SISTEMA MTZ EVENTOS (V11 FINAL CORRIGIDA) ===
let locadores = [], pecas = [], locacoes = [], propostas = [], devolucoes = [], transportes = [], tipos = [], usuarios = [], carrinhoLocacao = [];

let modelosChecklist = [];
let checklistsGerados = [];
let checklistMontagem = [];
let checklistConferencia = {};
let checklistEtapasMontagem = [];

    let logsAuditoria = []; // NOVO: Sistema de auditoria
    let config = { rodape: "MTZ Eventos", tel: "", email: "", logo: "", emailsPermitidos: "", adminEmails: "", valorKmFretePadrao: 0 };
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
