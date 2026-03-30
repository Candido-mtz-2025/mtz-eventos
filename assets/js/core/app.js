// Render central e inicialização da aplicação
// === RENDERIZAÇÃO GERAL (GARANTE QUE AS ABAS CARREGUEM) ===
function renderTudo() {
    if(typeof renderLocacoes === 'function') renderLocacoes();
    if(typeof renderLocadores === 'function') renderLocadores();
    if(typeof renderEstoque === 'function') renderEstoque();
    if(typeof renderModelosChecklist === 'function') renderModelosChecklist();
    if(typeof renderDevolucoes === 'function') renderDevolucoes();
    if(typeof renderTipos === 'function') renderTipos();
    if(typeof renderStats === 'function') renderStats();
    if(typeof updateSelects === 'function') updateSelects();
    if(typeof renderLogs === 'function') renderLogs();
    if(typeof renderConfig === 'function') renderConfig();
}

    // --- INICIALIZAÇÃO ---
    window.onload = function() {
        carregarLocal();
        const hoje = new Date().toISOString().split('T')[0];
        const elIni = document.getElementById('aluguelIni');
        const elDev = document.getElementById('devData');
        if(elIni) elIni.value = hoje;
        if(elDev) elDev.value = hoje;

        // INJEÇÃO DE ESTILO FORÇADO PARA O PDF FICAR PERFEITO
        const style = document.createElement('style');
        style.innerHTML = `
            @media print { @page { margin: 0; } body { background: white; } }
            
           /* CONFIGURAÇÃO DA FOLHA A4 CHEIA */
            #printArea { 
                position: relative !important; /* IMPORTANTE: Segura o rodapé no lugar */
                background-color: #ffffff !important;
                color: #000000 !important; 
                box-shadow: none !important; 
                margin: 0 auto !important; 
                width: 100% !important;
                /* Padding inferior maior (30mm) para o texto não ficar atrás da barra preta */
                padding: 15mm 15mm 30mm 15mm !important; 
                min-height: 297mm !important; /* Força altura total A4 */
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
        if(window.google) gisLoaded();
        if(localStorage.getItem('gToken')) { entrarApp(); sincronizar('carregar'); }
        iniciarBackupAutomatico();
        setInterval(salvarLocal, 60000); // Auto-salva a cada 1 minuto
        console.log('✅ Sistema de backup ativado');
    };

    function toggleTheme() { 
        const body = document.body;
        const isDark = body.getAttribute('data-theme') === 'dark'; 
        body.setAttribute('data-theme', isDark ? 'light' : 'dark'); 
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
    }

    function abrirTab(id) { 
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active')); 
        const tab = document.getElementById('tab-'+id);
        if(tab) tab.classList.add('active'); 
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(btn => { if(btn.getAttribute('onclick').includes(id)) btn.classList.add('active'); });
    }
    
    function fecharModal(id) { const m = document.getElementById(id); if(m) m.classList.remove('active'); }
