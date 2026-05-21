// Render central e inicialização da aplicação
// === RENDERIZAÇÃO GERAL (GARANTE QUE AS ABAS CARREGUEM) ===
function renderTudo() {
    if(typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade();
    if(typeof renderLocacoes === 'function') renderLocacoes();
    if(typeof renderLocadores === 'function') renderLocadores();
    if(typeof renderEstoque === 'function') renderEstoque();
    if(typeof renderModelosChecklist === 'function') renderModelosChecklist();
    if(typeof popularChecklistModeloSelect === 'function') popularChecklistModeloSelect();
    if(typeof renderChecklistMontagem === 'function') renderChecklistMontagem();
    if(typeof renderDevolucoes === 'function') renderDevolucoes();
    if(typeof renderTipos === 'function') renderTipos();
    if(typeof renderStats === 'function') renderStats();
    if(typeof updateSelects === 'function') updateSelects();
    if(typeof renderLogs === 'function') renderLogs();
    if(typeof renderConfig === 'function') renderConfig();
    if(typeof atualizarFluxoLocacao === 'function') atualizarFluxoLocacao();
    if(typeof aplicarPermissoesInterface === 'function') aplicarPermissoesInterface();
}

const TAB_TOPBAR_CONFIG = {
    dashboard: { icon: 'bi-grid', titulo: 'Dashboard', descricao: 'Visão executiva da operação.', meta: 'Tempo real' },
    locadores: { icon: 'bi-people', titulo: 'Clientes', descricao: 'Cadastro e relacionamento com clientes.', meta: 'Base comercial' },
    tipos: { icon: 'bi-tags', titulo: 'Tipos', descricao: 'Organização das categorias de itens.', meta: 'Catálogo' },
    estoque: { icon: 'bi-box-seam', titulo: 'Estoque', descricao: 'Controle completo de itens e disponibilidade.', meta: 'Inventário' },
    checklist: { icon: 'bi-check2-square', titulo: 'Checklist', descricao: 'Separação e conferência de montagem.', meta: 'Operação de campo' },
    locacoes: { icon: 'bi-cart', titulo: 'Locações', descricao: 'Gestão ponta a ponta dos pedidos.', meta: 'Fluxo comercial' },
    devolucoes: { icon: 'bi-arrow-return-left', titulo: 'Devoluções', descricao: 'Conferência e fechamento de retorno.', meta: 'Pós-operação' },
    auditoria: { icon: 'bi-shield-check', titulo: 'Auditoria', descricao: 'Rastreamento de ações do sistema.', meta: 'Governança' },
    config: { icon: 'bi-gear', titulo: 'Configurações', descricao: 'Ajustes gerais e políticas de acesso.', meta: 'Administração' }
};

function atualizarTopbarModulo(tabId) {
    const topbar = document.getElementById('moduleTopbar');
    const titleEl = document.getElementById('moduleTopbarTitle');
    const descEl = document.getElementById('moduleTopbarDesc');
    const metaEl = document.getElementById('moduleTopbarMeta');

    if (!topbar || !titleEl || !descEl || !metaEl) return;

    if (tabId === 'dashboard') {
        topbar.style.display = 'none';
        return;
    }

    const cfg = TAB_TOPBAR_CONFIG[tabId] || TAB_TOPBAR_CONFIG.dashboard;
    titleEl.innerHTML = `<i class="bi ${cfg.icon}"></i> ${cfg.titulo}`;
    descEl.textContent = cfg.descricao;
    metaEl.textContent = cfg.meta;
    topbar.style.display = 'flex';
}

    // --- INICIALIZAÇÃO ---
    window.onload = function() {
    carregarLocal();
    if(typeof atualizarPerfilAcesso === 'function') atualizarPerfilAcesso();
    renderTudo();
        
    const checklistData = document.getElementById('checklistData');
    if (checklistData && !checklistData.value) {
    checklistData.value = new Date().toISOString().split('T')[0];
}
    const hoje = new Date().toISOString().split('T')[0];
    const elIni = document.getElementById('aluguelIni');
    const elDev = document.getElementById('devData');
    if(elIni) elIni.value = hoje;
    if(elDev) elDev.value = hoje;
    if(typeof inicializarFluxoLocacao === 'function') inicializarFluxoLocacao();

    const style = document.createElement('style');
    style.innerHTML = `
        @media print { @page { margin: 0; } body { background: white; } }
        
       /* CONFIGURAÇÃO DA FOLHA A4 CHEIA */
        #printArea { 
            position: relative !important;
            background-color: #ffffff !important;
            color: #000000 !important; 
            box-shadow: none !important; 
            margin: 0 auto !important; 
            width: 100% !important;
            padding: 15mm 15mm 30mm 15mm !important; 
            min-height: 297mm !important;
            display: flex;
            flex-direction: column;
        }
        #printArea * { color: #000000 !important; border-color: #000000 !important; }
        #printArea thead { background-color: #000000 !important; }
        #printArea thead th { color: #ffffff !important; background-color: #000000 !important; }
        #printArea .footer-bar, #printArea .footer-bar div { background-color: #000000 !important; color: #ffffff !important; }
    `;
    document.head.appendChild(style);
    
    if(localStorage.getItem('theme') === 'dark') document.body.setAttribute('data-theme', 'dark');
    if(typeof inicializarSessaoLogin === 'function') inicializarSessaoLogin();
    const btnInicial = document.querySelector('.tab-btn.active[data-tab]');
    abrirTab(btnInicial?.dataset.tab || 'dashboard');
    iniciarBackupAutomatico();
    setInterval(salvarLocal, 60000);
    console.log('✅ Sistema de backup ativado');
};
    function toggleTheme() { 
        const body = document.body;
        const isDark = body.getAttribute('data-theme') === 'dark'; 
        body.setAttribute('data-theme', isDark ? 'light' : 'dark'); 
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
    }

    function abrirTab(id) {
        const alvoId = `tab-${id}`;
        const tabs = document.querySelectorAll('.tab-content');
        tabs.forEach((tab) => {
            const ativa = tab.id === alvoId;
            tab.classList.toggle('active', ativa);
            tab.hidden = !ativa;
            tab.setAttribute('aria-hidden', ativa ? 'false' : 'true');
        });

        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach((btn) => {
            const ativa = btn.dataset.tab === id;
            btn.classList.toggle('active', ativa);
            btn.setAttribute('aria-pressed', ativa ? 'true' : 'false');
        });

        atualizarTopbarModulo(id);
    }
    
    function fecharModal(id) { const m = document.getElementById(id); if(m) m.classList.remove('active'); }
