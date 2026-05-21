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

const TAB_QUICK_ACTIONS = {
    dashboard: [
        { id: 'qa_novo_cliente', icon: 'bi-person-plus', label: 'Novo cliente' },
        { id: 'qa_nova_locacao', icon: 'bi-cart-plus', label: 'Nova locacao' },
        { id: 'qa_registrar_devolucao', icon: 'bi-arrow-return-left', label: 'Registrar devolucao' }
    ],
    locadores: [
        { id: 'qa_novo_cliente', icon: 'bi-person-plus', label: 'Novo cliente' },
        { id: 'qa_busca_cliente', icon: 'bi-search', label: 'Buscar cliente' },
        { id: 'qa_nova_locacao', icon: 'bi-cart-plus', label: 'Nova locacao' }
    ],
    tipos: [
        { id: 'qa_novo_tipo', icon: 'bi-tags', label: 'Novo tipo' },
        { id: 'qa_ir_estoque', icon: 'bi-box-seam', label: 'Ir para estoque' },
        { id: 'qa_abrir_auditoria', icon: 'bi-shield-check', label: 'Ver auditoria' }
    ],
    estoque: [
        { id: 'qa_novo_item', icon: 'bi-box2', label: 'Novo item' },
        { id: 'qa_busca_estoque', icon: 'bi-search', label: 'Buscar item' },
        { id: 'qa_importar_excel', icon: 'bi-file-earmark-spreadsheet', label: 'Importar Excel' }
    ],
    checklist: [
        { id: 'qa_novo_checklist', icon: 'bi-check2-square', label: 'Preencher checklist' },
        { id: 'qa_modelo_checklist', icon: 'bi-diagram-3', label: 'Selecionar modelo' },
        { id: 'qa_gerar_pdf_checklist', icon: 'bi-printer', label: 'Gerar PDF' }
    ],
    locacoes: [
        { id: 'qa_nova_locacao', icon: 'bi-cart-plus', label: 'Nova locacao' },
        { id: 'qa_filtro_aberto', icon: 'bi-play-circle', label: 'Em aberto' },
        { id: 'qa_filtro_atrasado', icon: 'bi-clock-history', label: 'Atrasados' }
    ],
    devolucoes: [
        { id: 'qa_registrar_devolucao', icon: 'bi-arrow-return-left', label: 'Registrar devolucao' },
        { id: 'qa_filtro_dev_parcial', icon: 'bi-hourglass-split', label: 'Parciais' },
        { id: 'qa_filtro_dev_total', icon: 'bi-check2-circle', label: 'Concluidas' }
    ],
    auditoria: [
        { id: 'qa_log_locacao', icon: 'bi-cart', label: 'Logs de locacoes' },
        { id: 'qa_log_sistema', icon: 'bi-cpu', label: 'Logs do sistema' },
        { id: 'qa_busca_auditoria', icon: 'bi-search', label: 'Buscar logs' }
    ],
    config: [
        { id: 'qa_editar_config', icon: 'bi-gear', label: 'Editar config' },
        { id: 'qa_backup_json', icon: 'bi-download', label: 'Baixar backup' },
        { id: 'qa_ir_estoque', icon: 'bi-box-seam', label: 'Voltar estoque' }
    ]
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

function focarCampo(id, selecionar = false, alinhamento = 'center') {
    const el = document.getElementById(id);
    if (!el) return;

    setTimeout(() => {
        const semRolagem = alinhamento === 'none';
        try {
            el.focus({ preventScroll: semRolagem });
        } catch (_) {
            el.focus();
        }

        if (selecionar && typeof el.select === 'function') {
            el.select();
        }

        if (semRolagem) return;

        const bloco = el.closest('.card, .panel-block, .dash-section');
        if (bloco && typeof bloco.scrollIntoView === 'function') {
            bloco.scrollIntoView({
                behavior: 'smooth',
                block: alinhamento === 'start' ? 'start' : 'center'
            });
        }
    }, 90);
}

function aplicarFiltroDevolucoes(valor) {
    const select = document.getElementById('devFiltroHistorico');
    if (select) select.value = valor;
    if (typeof renderDevolucoes === 'function') renderDevolucoes();
}

function avisarAtalhoIndisponivel(mensagem) {
    if (typeof mostrarToast === 'function') {
        mostrarToast(mensagem, 'erro');
        return;
    }
    console.warn(mensagem);
}

function focarCampoAtalho(id, selecionar = false, alinhamento = 'center', rotulo = 'campo') {
    const el = document.getElementById(id);
    if (!el) {
        avisarAtalhoIndisponivel(`Atalho indisponível: ${rotulo} não encontrado.`);
        return false;
    }
    focarCampo(id, selecionar, alinhamento);
    return true;
}

function clicarSeletorAtalho(seletor, mensagemErro) {
    const el = document.querySelector(seletor);
    if (!el) {
        avisarAtalhoIndisponivel(mensagemErro || 'Atalho indisponível no momento.');
        return false;
    }
    el.click();
    return true;
}

function atualizarAtalhosRapidos(tabId) {
    const barra = document.getElementById('quickActionsBar');
    const lista = document.getElementById('quickActionsList');
    if (!barra || !lista) return;

    const atalhos = TAB_QUICK_ACTIONS[tabId] || [];
    if (!atalhos.length) {
        barra.style.display = 'none';
        lista.innerHTML = '';
        return;
    }

    lista.innerHTML = atalhos.map((atalho) => `
        <button class="btn btn-sm btn-secondary quick-action-btn" type="button" data-quick-action="${atalho.id}">
            <i class="bi ${atalho.icon}"></i>
            <span>${atalho.label}</span>
        </button>
    `).join('');

    barra.style.display = 'flex';
}

function executarAtalhoRapido(atalhoId) {
    switch (atalhoId) {
        case 'qa_novo_cliente':
            abrirTab('locadores');
            focarCampoAtalho('locNome', false, 'center', 'Nome do cliente');
            return;
        case 'qa_busca_cliente':
            abrirTab('locadores');
            focarCampoAtalho('buscaCliente', true, 'center', 'Busca de clientes');
            return;
        case 'qa_nova_locacao':
            abrirTab('locacoes');
            if (typeof irEtapaLocacao === 'function') irEtapaLocacao(1);
            focarCampoAtalho('aluguelCliente', false, 'center', 'Cliente da locação');
            return;
        case 'qa_filtro_aberto':
            abrirTab('locacoes');
            if (typeof mudarFiltro === 'function') {
                mudarFiltro('ativo');
            } else {
                clicarSeletorAtalho('[data-action="mudarFiltro"][data-arg="ativo"]', 'Filtro Em Aberto indisponível.');
            }
            return;
        case 'qa_filtro_atrasado':
            abrirTab('locacoes');
            if (typeof mudarFiltro === 'function') {
                mudarFiltro('atrasado');
            } else {
                clicarSeletorAtalho('[data-action="mudarFiltro"][data-arg="atrasado"]', 'Filtro Atrasados indisponível.');
            }
            return;
        case 'qa_registrar_devolucao':
            abrirTab('devolucoes');
            focarCampoAtalho('devLocacao', false, 'center', 'Locação pendente');
            return;
        case 'qa_filtro_dev_parcial':
            abrirTab('devolucoes');
            aplicarFiltroDevolucoes('parcial');
            return;
        case 'qa_filtro_dev_total':
            abrirTab('devolucoes');
            aplicarFiltroDevolucoes('total');
            return;
        case 'qa_novo_tipo':
            abrirTab('tipos');
            focarCampoAtalho('tipoNome', false, 'center', 'Nome do tipo');
            return;
        case 'qa_ir_estoque':
            abrirTab('estoque');
            focarCampoAtalho('pecaNome', false, 'center', 'Nome do item');
            return;
        case 'qa_novo_item':
            abrirTab('estoque');
            focarCampoAtalho('pecaNome', false, 'center', 'Nome do item');
            return;
        case 'qa_busca_estoque':
            abrirTab('estoque');
            focarCampoAtalho('buscaEstoque', true, 'none', 'Busca do estoque');
            return;
        case 'qa_importar_excel':
            abrirTab('estoque');
            {
                const inputExcel = document.getElementById('inputExcel');
                if (!inputExcel) {
                    avisarAtalhoIndisponivel('Importação indisponível: seletor de arquivo não encontrado.');
                    return;
                }
                inputExcel.click();
            }
            return;
        case 'qa_novo_checklist':
            abrirTab('checklist');
            focarCampoAtalho('checklistCliente', false, 'center', 'Cliente do checklist');
            return;
        case 'qa_modelo_checklist':
            abrirTab('checklist');
            focarCampoAtalho('checklistModeloSelect', false, 'center', 'Modelo do checklist');
            return;
        case 'qa_gerar_pdf_checklist':
            abrirTab('checklist');
            if (typeof gerarPDFChecklistMontagem === 'function') gerarPDFChecklistMontagem();
            return;
        case 'qa_log_locacao':
            abrirTab('auditoria');
            if (typeof renderLogs === 'function') {
                renderLogs('locacao');
            } else {
                clicarSeletorAtalho('[data-action="renderLogs"][data-arg="locacao"]', 'Filtro de logs de locações indisponível.');
            }
            return;
        case 'qa_log_sistema':
            abrirTab('auditoria');
            if (typeof renderLogs === 'function') {
                renderLogs('sistema');
            } else {
                clicarSeletorAtalho('[data-action="renderLogs"][data-arg="sistema"]', 'Filtro de logs do sistema indisponível.');
            }
            return;
        case 'qa_busca_auditoria':
            abrirTab('auditoria');
            focarCampoAtalho('auditBusca', true, 'center', 'Busca da auditoria');
            return;
        case 'qa_editar_config':
            abrirTab('config');
            focarCampoAtalho('confRodape', false, 'center', 'Rodapé da configuração');
            return;
        case 'qa_backup_json':
            abrirTab('config');
            if (typeof baixarBackup === 'function') baixarBackup();
            return;
        case 'qa_abrir_auditoria':
            abrirTab('auditoria');
            return;
        default:
            return;
    }
}

document.addEventListener('click', function(event) {
    const botaoAtalho = event.target.closest('[data-quick-action]');
    if (!botaoAtalho) return;
    executarAtalhoRapido(botaoAtalho.dataset.quickAction);
});

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
        atualizarAtalhosRapidos(id);
    }
    
    function fecharModal(id) { const m = document.getElementById(id); if(m) m.classList.remove('active'); }
