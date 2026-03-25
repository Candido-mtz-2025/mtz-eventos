// Estado global do sistema
// === SISTEMA MTZ EVENTOS (V11 FINAL CORRIGIDA) ===
let locadores = [], pecas = [], locacoes = [], devolucoes = [], tipos = [], carrinhoLocacao = [];

    let logsAuditoria = []; // NOVO: Sistema de auditoria
    let config = { rodape: "MTZ Eventos", tel: "", email: "", logo: "" };
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
