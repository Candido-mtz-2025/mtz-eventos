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
    const btnInicial = document.querySelector('.tab-btn.active');
    if (btnInicial) {
        const clickExpr = btnInicial.getAttribute('onclick') || '';
        const match = clickExpr.match(/abrirTab\(['"]([^'"]+)['"]\)/);
        if (match && match[1]) abrirTab(match[1]);
    } else {
        abrirTab('dashboard');
    }
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
            const clickExpr = btn.getAttribute('onclick') || '';
            const ativa = clickExpr.includes(`abrirTab('${id}')`) || clickExpr.includes(`abrirTab(\"${id}\")`);
            btn.classList.toggle('active', ativa);
            btn.setAttribute('aria-pressed', ativa ? 'true' : 'false');
        });
    }
    
    function fecharModal(id) { const m = document.getElementById(id); if(m) m.classList.remove('active'); }
