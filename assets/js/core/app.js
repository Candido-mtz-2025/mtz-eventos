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

let timeoutFeedbackTrocaAba = null;

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

function aplicarFeedbackTrocaAba(tabId) {
    const tab = document.getElementById(`tab-${tabId}`);
    if (!tab) return;

    tab.classList.add('is-switching');
    tab.setAttribute('aria-busy', 'true');

    const topbarMeta = document.getElementById('moduleTopbarMeta');
    const metaOriginal = TAB_TOPBAR_CONFIG[tabId]?.meta || 'Resumo';
    if (topbarMeta && tabId !== 'dashboard') {
        topbarMeta.textContent = 'Carregando...';
    }

    if (timeoutFeedbackTrocaAba) {
        clearTimeout(timeoutFeedbackTrocaAba);
    }

    timeoutFeedbackTrocaAba = setTimeout(() => {
        tab.classList.remove('is-switching');
        tab.setAttribute('aria-busy', 'false');
        if (topbarMeta && tabId !== 'dashboard') {
            topbarMeta.textContent = metaOriginal;
        }
    }, 260);
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

function obterAlvoHistoricoDevolucoes() {
    return document.getElementById('devolucoesHistoricoCard')
        || document.getElementById('tblDevolucoes')?.closest('.card')
        || document.querySelector('#tab-devolucoes .card:nth-of-type(2)')
        || document.querySelector('#tab-devolucoes .card');
}

function aplicarFiltroHistoricoDevolucoes(filtro = null, focarBusca = false) {
    const select = document.getElementById('devFiltroHistorico');
    if (select && typeof filtro === 'string' && filtro.trim()) {
        select.value = filtro;
    }

    if (typeof renderDevolucoes === 'function') renderDevolucoes();

    const alvo = obterAlvoHistoricoDevolucoes();
    if (alvo) rolarParaElementoAtalho(alvo, 'start');
    if (focarBusca) focarCampoDepoisDaRolagem('devBuscaHistorico', true);
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

function obterOffsetCabecalhoApp() {
    const candidatos = [
        document.querySelector('#appArea > header'),
        document.querySelector('#appArea .container > .tabs-container')
    ];

    let offset = 12;
    candidatos.forEach((el) => {
        if (!el) return;
        const estilos = window.getComputedStyle(el);
        if (estilos.display === 'none' || estilos.visibility === 'hidden') return;
        if (estilos.position === 'sticky' || estilos.position === 'fixed') {
            offset += el.getBoundingClientRect().height;
        }
    });

    return Math.max(0, Math.min(offset, Math.round(window.innerHeight * 0.45)));
}

function obterAlvoInicialDaTab(tabId) {
    const tab = document.getElementById(`tab-${tabId}`);
    if (!tab) return null;

    const mapaAlvos = {
        dashboard: '#tab-dashboard .dashboard-topbar',
        locadores: '#tab-locadores .card',
        tipos: '#tab-tipos .card',
        estoque: '#tab-estoque .card',
        checklist: '#tab-checklist .card',
        locacoes: '#tab-locacoes .card',
        devolucoes: '#tab-devolucoes .card',
        auditoria: '#tab-auditoria .card',
        config: '#tab-config .card'
    };

    const seletor = mapaAlvos[tabId];
    if (seletor) {
        const alvoMapeado = document.querySelector(seletor);
        if (alvoMapeado) return alvoMapeado;
    }

    const alvoPrioritario = tab.querySelector('.dashboard-topbar, .card, .panel-block, .dash-section');
    return alvoPrioritario || tab;
}

function rolarParaElementoAtalho(elemento, block = 'start') {
    if (!elemento || typeof elemento.scrollIntoView !== 'function') return false;
    const rect = elemento.getBoundingClientRect();
    const topoDocumento = window.pageYOffset + rect.top;
    const offsetCabecalho = obterOffsetCabecalhoApp();
    let destino = topoDocumento - offsetCabecalho;

    if (block === 'center') {
        destino = topoDocumento - Math.max(16, ((window.innerHeight - rect.height) / 2));
    } else if (block === 'end') {
        destino = topoDocumento - Math.max(16, (window.innerHeight - rect.height - 24));
    }

    const destinoFinal = Math.max(0, Math.round(destino));
    const atual = Math.round(window.pageYOffset);
    if (Math.abs(destinoFinal - atual) < 3) return true;

    window.scrollTo({ top: destinoFinal, behavior: 'smooth' });
    return true;
}

function focarCampoDepoisDaRolagem(idCampo, selecionar = false, tentativa = 0) {
    setTimeout(() => {
        const campo = document.getElementById(idCampo);
        if (!campo) {
            if (tentativa < 2) focarCampoDepoisDaRolagem(idCampo, selecionar, tentativa + 1);
            return;
        }
        try {
            campo.focus({ preventScroll: true });
        } catch (_) {
            campo.focus();
        }
        if (selecionar && typeof campo.select === 'function') campo.select();
    }, 220);
}

// Fluxo completo do atalho de busca: abre aba, rola para o ponto útil e já deixa pronto para digitar.
function executarAtalhoBuscaEstoque() {
    abrirTab('estoque', { semRolagem: true });
    if (typeof renderEstoque === 'function') renderEstoque();

    setTimeout(() => {
        const campoBusca = document.getElementById('buscaEstoque');
        if (!campoBusca) {
            avisarAtalhoIndisponivel('Busca do estoque não encontrada.');
            return;
        }

        rolarParaElementoAtalho(campoBusca, 'start');
        focarCampoDepoisDaRolagem('buscaEstoque', true);
    }, 160);
}

// Fluxo completo do filtro em locações: abre tab, aplica filtro, rola para lista e evidencia estado ativo.
function aplicarFiltroLocacoesLista(filtro) {
    abrirTab('locacoes', { semRolagem: true });

    setTimeout(() => {
        if (typeof mudarFiltro === 'function') {
            mudarFiltro(filtro);
        } else if (
            !clicarSeletorAtalho(
                `[data-action="aplicarFiltroLocacoesLista"][data-arg="${filtro}"], [data-action="mudarFiltro"][data-arg="${filtro}"]`,
                `Filtro ${filtro} indisponível.`
            )
        ) {
            return;
        }

        if (typeof renderLocacoes === 'function') renderLocacoes();

        if (typeof atualizarFiltroVisualLocacoes === 'function') {
            atualizarFiltroVisualLocacoes();
        }

        setTimeout(() => {
            const alvoLista = document.getElementById('locacoesLista')
                || document.querySelector('#tab-locacoes #tblLocacoes')?.closest('.panel-block');
            if (alvoLista) {
                rolarParaElementoAtalho(alvoLista, 'start');
            }
        }, 90);
    }, 140);
}

// Mantém compatibilidade com atalhos já existentes.
function executarAtalhoFiltroLocacoes(filtro) {
    aplicarFiltroLocacoesLista(filtro);
}

function executarAtalhoFiltroDevolucoes(filtro) {
    abrirTab('devolucoes', { semRolagem: true });

    setTimeout(() => {
        aplicarFiltroHistoricoDevolucoes(filtro, false);
    }, 140);
}

function irParaDevolucoesFormulario() {
    abrirTab('devolucoes', { semRolagem: true });
    setTimeout(() => {
        const alvo = document.getElementById('devLocacao')
            || document.querySelector('#tab-devolucoes .card');
        if (alvo) rolarParaElementoAtalho(alvo, 'start');
        focarCampoDepoisDaRolagem('devLocacao', false);
    }, 140);
}

function irParaClientesLista() {
    abrirTab('locadores', { semRolagem: true });
    setTimeout(() => {
        const alvo = document.getElementById('buscaCliente')
            || document.querySelector('#tab-locadores .card:last-of-type')
            || document.querySelector('#tab-locadores .card');
        if (alvo) rolarParaElementoAtalho(alvo, 'start');
        focarCampoDepoisDaRolagem('buscaCliente', true);
    }, 140);
}

function irParaTiposCadastro() {
    abrirTab('tipos', { semRolagem: true });
    setTimeout(() => {
        const alvo = document.getElementById('tipoNome')
            || document.querySelector('#tab-tipos .card');
        if (alvo) rolarParaElementoAtalho(alvo, 'start');
        focarCampoDepoisDaRolagem('tipoNome', false);
    }, 140);
}

function irParaEstoqueBusca() {
    executarAtalhoBuscaEstoque();
}

function irParaEstoqueCadastro() {
    abrirTab('estoque', { semRolagem: true });
    if (typeof renderEstoque === 'function') renderEstoque();
    setTimeout(() => {
        const alvo = document.getElementById('pecaNome')
            || document.querySelector('#tab-estoque .panel-block')
            || document.querySelector('#tab-estoque .card');
        if (alvo) rolarParaElementoAtalho(alvo, 'start');
        focarCampoDepoisDaRolagem('pecaNome', false);
    }, 140);
}

function irParaChecklistOperacional() {
    abrirTab('checklist', { semRolagem: true });
    setTimeout(() => {
        const alvo = document.getElementById('checklistCliente')
            || document.querySelector('#tab-checklist .card');
        if (alvo) rolarParaElementoAtalho(alvo, 'start');
        focarCampoDepoisDaRolagem('checklistCliente', false);
    }, 140);
}

function irParaLocacoesCobrancas() {
    executarAtalhoFiltroLocacoes('ativo');
}

function irParaLocacoesFormulario() {
    abrirTab('locacoes', { semRolagem: true });
    if (typeof irEtapaLocacao === 'function') irEtapaLocacao(1);
    setTimeout(() => {
        const alvo = document.getElementById('aluguelCliente')
            || document.querySelector('#tab-locacoes #locacaoEtapa1')
            || document.querySelector('#tab-locacoes .card');
        if (alvo) rolarParaElementoAtalho(alvo, 'start');
        focarCampoDepoisDaRolagem('aluguelCliente', false);
    }, 140);
}

function irParaAuditoriaBusca() {
    abrirTab('auditoria', { semRolagem: true });
    if (typeof renderLogs === 'function') renderLogs(window.filtroLogAtual || 'todos');
    setTimeout(() => {
        const alvo = document.getElementById('auditBusca')
            || document.querySelector('#tab-auditoria .card');
        if (alvo) rolarParaElementoAtalho(alvo, 'start');
        focarCampoDepoisDaRolagem('auditBusca', true);
    }, 140);
}

function aplicarFiltroAuditoria(filtro = 'todos', focarBusca = false) {
    abrirTab('auditoria', { semRolagem: true });
    if (typeof renderLogs === 'function') renderLogs(filtro || 'todos');

    setTimeout(() => {
        const alvo = document.getElementById('auditoriaCard')
            || document.getElementById('tblLogs')?.closest('.card')
            || document.querySelector('#tab-auditoria .card');
        if (alvo) rolarParaElementoAtalho(alvo, 'start');
        if (focarBusca) focarCampoDepoisDaRolagem('auditBusca', true);
    }, 140);
}

function irParaConfigGeral() {
    abrirTab('config', { semRolagem: true });
    if (typeof renderConfig === 'function') renderConfig();
    setTimeout(() => {
        const alvo = document.getElementById('confRodape')
            || document.querySelector('#tab-config .config-card')
            || document.querySelector('#tab-config .card');
        if (alvo) rolarParaElementoAtalho(alvo, 'start');
        focarCampoDepoisDaRolagem('confRodape', false);
    }, 140);
}

function obterAbaAtivaAtual() {
    const ativa = document.querySelector('.tab-content.active');
    if (!ativa?.id) return 'dashboard';
    return ativa.id.replace('tab-', '');
}

function focoBuscaPorAba(abaId) {
    const mapaBusca = {
        locadores: 'buscaCliente',
        tipos: 'buscaTipos',
        estoque: 'buscaEstoque',
        locacoes: 'buscaLocacoes',
        devolucoes: 'devBuscaHistorico',
        auditoria: 'auditBusca'
    };
    const idCampo = mapaBusca[abaId];
    if (!idCampo) return false;

    const campo = document.getElementById(idCampo);
    if (!campo) return false;

    rolarParaElementoAtalho(campo, 'start');
    focarCampoDepoisDaRolagem(idCampo, true);
    return true;
}

function ativarBuscaRapidaDaAbaAtual() {
    const abaAtual = obterAbaAtivaAtual();
    return focoBuscaPorAba(abaAtual);
}

function navegarParaAbaPorAtalho(numero) {
    const mapa = {
        '1': 'dashboard',
        '2': 'locadores',
        '3': 'tipos',
        '4': 'estoque',
        '5': 'checklist',
        '6': 'locacoes',
        '7': 'devolucoes',
        '8': 'auditoria',
        '9': 'config'
    };
    const tab = mapa[String(numero)];
    if (!tab) return false;
    abrirTab(tab);
    return true;
}

function atualizarAtalhosRapidos(tabId) {
    // Atalhos rápidos desativados por decisão de usabilidade.
    return;
}

function executarAtalhoRapido(atalhoId) {
    switch (atalhoId) {
        case 'qa_novo_cliente':
            abrirTab('locadores', { semRolagem: true });
            focarCampoAtalho('locNome', false, 'center', 'Nome do cliente');
            return;
        case 'qa_busca_cliente':
            irParaClientesLista();
            return;
        case 'qa_nova_locacao':
            irParaLocacoesFormulario();
            return;
        case 'qa_filtro_aberto':
            executarAtalhoFiltroLocacoes('ativo');
            return;
        case 'qa_filtro_atrasado':
            executarAtalhoFiltroLocacoes('atrasado');
            return;
        case 'qa_registrar_devolucao':
            irParaDevolucoesFormulario();
            return;
        case 'qa_filtro_dev_parcial':
            executarAtalhoFiltroDevolucoes('parcial');
            return;
        case 'qa_filtro_dev_total':
            executarAtalhoFiltroDevolucoes('total');
            return;
        case 'qa_novo_tipo':
            irParaTiposCadastro();
            return;
        case 'qa_ir_estoque':
            irParaEstoqueCadastro();
            return;
        case 'qa_novo_item':
            irParaEstoqueCadastro();
            return;
        case 'qa_busca_estoque':
            irParaEstoqueBusca();
            return;
        case 'qa_importar_excel':
            abrirTab('estoque', { semRolagem: true });
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
            irParaChecklistOperacional();
            return;
        case 'qa_modelo_checklist':
            abrirTab('checklist', { semRolagem: true });
            focarCampoAtalho('checklistModeloSelect', false, 'center', 'Modelo do checklist');
            return;
        case 'qa_gerar_pdf_checklist':
            abrirTab('checklist', { semRolagem: true });
            if (typeof gerarPDFChecklistMontagem === 'function') gerarPDFChecklistMontagem();
            return;
        case 'qa_log_locacao':
            aplicarFiltroAuditoria('locacao', false);
            return;
        case 'qa_log_sistema':
            aplicarFiltroAuditoria('sistema', false);
            return;
        case 'qa_busca_auditoria':
            irParaAuditoriaBusca();
            return;
        case 'qa_editar_config':
            irParaConfigGeral();
            return;
        case 'qa_backup_json':
            abrirTab('config', { semRolagem: true });
            setTimeout(() => {
                const alvo = document.querySelector('#tab-config .config-actions-card')
                    || document.querySelector('#tab-config .card');
                if (alvo) rolarParaElementoAtalho(alvo, 'start');
            }, 120);
            if (typeof baixarBackup === 'function') baixarBackup();
            return;
        case 'qa_abrir_auditoria':
            irParaAuditoriaBusca();
            return;
        default:
            return;
    }
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
    abrirTab(btnInicial?.dataset.tab || 'dashboard', { semRolagem: true });
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

    function abrirTab(id, opcoes = {}) {
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
        aplicarFeedbackTrocaAba(id);

        if (opcoes.semRolagem) return;

        setTimeout(() => {
            const alvo = opcoes.seletorAlvo
                ? document.querySelector(opcoes.seletorAlvo)
                : obterAlvoInicialDaTab(id);
            if (alvo) rolarParaElementoAtalho(alvo, 'start');
        }, Number(opcoes.delayMs) || 80);
    }
    
    function fecharModal(id) { const m = document.getElementById(id); if(m) m.classList.remove('active'); }

document.addEventListener('keydown', (event) => {
    const alvo = event.target;
    const tag = alvo?.tagName?.toLowerCase();
    const digitando = tag === 'input' || tag === 'textarea' || tag === 'select' || alvo?.isContentEditable;
    const idCampoBusca = String(alvo?.id || '');
    const camposBuscaRapida = new Set([
        'buscaCliente',
        'buscaTipos',
        'buscaEstoque',
        'buscaLocacoes',
        'devBuscaHistorico',
        'auditBusca',
        'inputBuscaPeca'
    ]);

    if (event.key === 'Escape' && camposBuscaRapida.has(idCampoBusca)) {
        const valorAtual = String(alvo?.value || '');
        if (valorAtual.length) {
            event.preventDefault();
            alvo.value = '';
            if (alvo.dataset.input) {
                alvo.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (alvo.dataset.keyup) {
                alvo.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
            }
        }
        return;
    }

    if (!digitando && event.key === '/') {
        event.preventDefault();
        ativarBuscaRapidaDaAbaAtual();
        return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ativarBuscaRapidaDaAbaAtual();
        return;
    }

    if (!digitando && (event.ctrlKey || event.metaKey) && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        navegarParaAbaPorAtalho(event.key);
    }
});
