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

const STORAGE_BUSCAS_RAPIDAS = 'mtz:buscasRapidas';
const CAMPOS_BUSCA_PERSISTENTES = [
    'buscaCliente',
    'buscaTipos',
    'buscaEstoque',
    'buscaLocacoes',
    'devBuscaHistorico',
    'auditBusca'
];
const IDS_CAMPOS_BUSCA_PERSISTENTES = new Set(CAMPOS_BUSCA_PERSISTENTES);
const IDS_CAMPOS_BUSCA_ESCAPE = new Set([
    ...CAMPOS_BUSCA_PERSISTENTES,
    'inputBuscaPeca'
]);
const META_BUSCA_POR_ABA = Object.freeze({
    locadores: 'metaBuscaLocadores',
    tipos: 'metaBuscaTipos',
    estoque: 'metaBuscaEstoque',
    locacoes: 'metaBuscaLocacoes',
    devolucoes: 'metaBuscaDevolucoes',
    auditoria: 'metaBuscaAuditoria'
});

let timeoutFeedbackTrocaAba = null;
let observerMetaTopbar = null;

function atualizarMetaTopbarContextual(tabId = obterAbaAtivaAtual()) {
    const metaEl = document.getElementById('moduleTopbarMeta');
    if (!metaEl || tabId === 'dashboard') return;

    const cfg = TAB_TOPBAR_CONFIG[tabId] || TAB_TOPBAR_CONFIG.dashboard;
    const idMetaBusca = META_BUSCA_POR_ABA[tabId];
    const textoMetaBusca = idMetaBusca
        ? String(document.getElementById(idMetaBusca)?.textContent || '').trim()
        : '';

    if (!textoMetaBusca) {
        metaEl.textContent = cfg.meta;
        metaEl.classList.remove('is-context');
        metaEl.removeAttribute('title');
        delete metaEl.dataset.state;
        return;
    }

    metaEl.textContent = textoMetaBusca;
    metaEl.classList.add('is-context');
    metaEl.setAttribute('title', textoMetaBusca);
    if (/busca:/i.test(textoMetaBusca)) {
        metaEl.dataset.state = 'search';
    } else if (/filtro:/i.test(textoMetaBusca)) {
        metaEl.dataset.state = 'filter';
    } else {
        metaEl.dataset.state = 'summary';
    }
}

function inicializarMetaTopbarContextual() {
    if (observerMetaTopbar) {
        observerMetaTopbar.disconnect();
        observerMetaTopbar = null;
    }

    const metas = Object.values(META_BUSCA_POR_ABA)
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    if (!metas.length) return;

    observerMetaTopbar = new MutationObserver(() => {
        atualizarMetaTopbarContextual();
    });

    metas.forEach((el) => {
        observerMetaTopbar.observe(el, {
            childList: true,
            characterData: true,
            subtree: true
        });
    });

    atualizarMetaTopbarContextual();
}

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
            atualizarMetaTopbarContextual(tabId);
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

function normalizarFiltroDevolucoes(valor) {
    const filtrosValidos = new Set(['todos', 'parcial', 'total']);
    const filtro = String(valor || '').trim().toLowerCase();
    return filtrosValidos.has(filtro) ? filtro : 'todos';
}

function obterFiltroDevolucoesPersistido() {
    try {
        return normalizarFiltroDevolucoes(localStorage.getItem('mtz:devolucoesFiltro'));
    } catch (_) {
        return 'todos';
    }
}

function aplicarFiltroHistoricoDevolucoes(filtro = null, focarBusca = false, rolar = true) {
    const select = document.getElementById('devFiltroHistorico');
    const filtroNormalizado = normalizarFiltroDevolucoes(
        (typeof filtro === 'string' && filtro.trim()) ? filtro : (select?.value || 'todos')
    );

    if (select) {
        select.value = filtroNormalizado;
    }

    try {
        localStorage.setItem('mtz:devolucoesFiltro', filtroNormalizado);
    } catch (_) {
        // Falha de storage não impede uso do filtro.
    }

    if (typeof renderDevolucoes === 'function') renderDevolucoes();

    if (!rolar) {
        if (focarBusca) focarCampoDepoisDaRolagem('devBuscaHistorico', true);
        return;
    }

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
        document.querySelector('header'),
        document.querySelector('#appArea > header'),
        document.querySelector('#appArea .tabs-container'),
        document.querySelector('#appArea .container > .tabs-container'),
        document.getElementById('moduleTopbar')
    ];

    let offset = 12;
    candidatos.forEach((el) => {
        if (!el) return;
        const estilos = window.getComputedStyle(el);
        if (estilos.display === 'none' || estilos.visibility === 'hidden') return;
        if (estilos.position === 'sticky' || estilos.position === 'fixed') {
            const ret = el.getBoundingClientRect();
            // Conta apenas elementos realmente ocupando a faixa superior da viewport.
            if (ret.bottom > 0 && ret.top < Math.max(120, window.innerHeight * 0.35)) {
                offset += ret.height;
            }
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
        locacoes: '#locacoesPrincipalCard',
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

function garantirCampoVisivelNaViewport(campo, alinhamentoPreferido = 'start') {
    if (!(campo instanceof HTMLElement)) return false;

    const ret = campo.getBoundingClientRect();
    const margemTopo = obterOffsetCabecalhoApp() + 10;
    const margemBase = 14;
    const limiteInferior = Math.max(margemTopo + 40, window.innerHeight - margemBase);
    const foraDaAreaUtil = ret.top < margemTopo || ret.bottom > limiteInferior;

    if (!foraDaAreaUtil) return false;
    rolarParaElementoAtalho(campo, alinhamentoPreferido);
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

        // No mobile, o teclado pode empurrar a viewport após o focus.
        // Fazemos duas checagens curtas para garantir que o campo fique visível.
        if (window.innerWidth <= 1024) {
            setTimeout(() => {
                garantirCampoVisivelNaViewport(campo, 'start');
            }, 70);
            setTimeout(() => {
                garantirCampoVisivelNaViewport(campo, 'start');
            }, 220);
        }
    }, 220);
}

function aguardarElementoAtalho(resolverElemento, aoEncontrar, opcoes = {}) {
    const maxTentativas = Number.isFinite(Number(opcoes.maxTentativas))
        ? Math.max(1, Number(opcoes.maxTentativas))
        : 12;
    const intervaloMs = Number.isFinite(Number(opcoes.intervaloMs))
        ? Math.max(40, Number(opcoes.intervaloMs))
        : 90;
    const onFalha = typeof opcoes.onFalha === 'function' ? opcoes.onFalha : null;

    let tentativas = 0;
    const tentar = () => {
        const elemento = typeof resolverElemento === 'function' ? resolverElemento() : null;
        if (elemento) {
            if (typeof aoEncontrar === 'function') aoEncontrar(elemento);
            return;
        }

        tentativas += 1;
        if (tentativas >= maxTentativas) {
            if (onFalha) onFalha();
            return;
        }
        setTimeout(tentar, intervaloMs);
    };

    tentar();
}

function navegarComFocoAtalho(opcoes = {}) {
    const tabId = String(opcoes.tabId || '').trim();
    if (!tabId) return false;

    abrirTab(tabId, { semRolagem: true });

    if (typeof opcoes.preparar === 'function') {
        opcoes.preparar();
    }

    if (typeof opcoes.render === 'function') {
        opcoes.render();
    }

    const resolverAlvo = typeof opcoes.resolverAlvo === 'function'
        ? opcoes.resolverAlvo
        : () => document.getElementById(`tab-${tabId}`);

    const alinhar = opcoes.alinhamento || 'start';
    const idFoco = String(opcoes.idFoco || '').trim();
    const selecionar = opcoes.selecionar === true;

    aguardarElementoAtalho(
        resolverAlvo,
        (alvo) => {
            rolarParaElementoAtalho(alvo, alinhar);
            if (idFoco) {
                const campoFoco = document.getElementById(idFoco);
                if (campoFoco) {
                    focarCampoDepoisDaRolagem(idFoco, selecionar);
                    return;
                }
            }
            if (typeof opcoes.focarCustom === 'function') {
                opcoes.focarCustom(alvo);
            }
        },
        {
            onFalha: typeof opcoes.onFalha === 'function'
                ? opcoes.onFalha
                : () => avisarAtalhoIndisponivel(opcoes.mensagemFalha || 'Atalho indisponível no momento.'),
            maxTentativas: Number.isFinite(Number(opcoes.maxTentativas)) ? Number(opcoes.maxTentativas) : 12,
            intervaloMs: Number.isFinite(Number(opcoes.intervaloMs)) ? Number(opcoes.intervaloMs) : 90
        }
    );

    return true;
}

function focarRegistroRecemSalvo(opcoes = {}) {
    const tipo = String(opcoes.tipo || '').trim().toLowerCase();
    const idRegistro = String(opcoes.id ?? '').trim();
    if (!tipo || !idRegistro) return false;

    const mapa = {
        locador: {
            tabId: 'locadores',
            tabelaId: 'tblLocadores',
            attr: 'data-locador-id',
            buscaId: 'buscaCliente',
            renderFn: 'renderLocadores'
        },
        tipo: {
            tabId: 'tipos',
            tabelaId: 'tblTipos',
            attr: 'data-tipo-id',
            buscaId: 'buscaTipos',
            renderFn: 'renderTipos'
        },
        peca: {
            tabId: 'estoque',
            tabelaId: 'tblEstoque',
            attr: 'data-peca-id',
            buscaId: 'buscaEstoque',
            renderFn: 'renderEstoque'
        },
        locacao: {
            tabId: 'locacoes',
            tabelaId: 'tblLocacoes',
            attr: 'data-locacao-id',
            buscaId: 'buscaLocacoes',
            renderFn: 'renderLocacoes',
            preparar: () => {
                if (typeof mudarFiltro === 'function') mudarFiltro('ativo');
            }
        },
        devolucao: {
            tabId: 'devolucoes',
            tabelaId: 'tblDevolucoes',
            attr: 'data-devolucao-id',
            buscaId: 'devBuscaHistorico',
            renderFn: 'renderDevolucoes',
            preparar: () => {
                if (typeof aplicarFiltroHistoricoDevolucoes === 'function') {
                    aplicarFiltroHistoricoDevolucoes('todos', false, false);
                }
            }
        }
    };

    const cfg = mapa[tipo];
    if (!cfg) return false;

    abrirTab(cfg.tabId, { semRolagem: true });

    if (opcoes.limparBusca && cfg.buscaId) {
        const campoBusca = document.getElementById(cfg.buscaId);
        if (campoBusca && campoBusca.value) {
            campoBusca.value = '';
            atualizarPersistenciaBuscaRapida(cfg.buscaId, '');
        }
    }

    if (typeof cfg.preparar === 'function') {
        cfg.preparar();
    }

    const renderRef = window[cfg.renderFn];
    if (typeof renderRef === 'function') {
        renderRef();
    }

    const maxTentativas = 5;
    const destacar = (tentativa = 0) => {
        const seletor = `#${cfg.tabelaId} tr[${cfg.attr}="${idRegistro}"]`;
        const linha = document.querySelector(seletor);

        if (!linha) {
            if (tentativa < maxTentativas) {
                setTimeout(() => destacar(tentativa + 1), 100);
            }
            return;
        }

        rolarParaElementoAtalho(linha, 'center');
        linha.classList.remove('table-row-recent');
        // Força reinício da animação caso o usuário salve o mesmo registro em sequência.
        void linha.offsetWidth;
        linha.classList.add('table-row-recent');
        setTimeout(() => linha.classList.remove('table-row-recent'), 2800);
    };

    setTimeout(() => destacar(0), 120);
    return true;
}

window.focarRegistroRecemSalvo = focarRegistroRecemSalvo;

// Fluxo completo do atalho de busca: abre aba, rola para o ponto útil e já deixa pronto para digitar.
function executarAtalhoBuscaEstoque() {
    navegarComFocoAtalho({
        tabId: 'estoque',
        render: () => {
            if (typeof renderEstoque === 'function') renderEstoque();
        },
        resolverAlvo: () => document.getElementById('buscaEstoque')
            || document.querySelector('#tab-estoque input.search-input'),
        idFoco: 'buscaEstoque',
        selecionar: true,
        alinhamento: 'start',
        focarCustom: (campoBusca) => {
            setTimeout(() => {
                try {
                    campoBusca.focus({ preventScroll: true });
                } catch (_) {
                    campoBusca.focus();
                }
                if (typeof campoBusca.select === 'function') campoBusca.select();
            }, 220);
        },
        mensagemFalha: 'Busca do estoque não encontrada.',
        maxTentativas: 16,
        intervaloMs: 90
    });
}

function obterAlvoListaLocacoes() {
    return document.getElementById('locacoesLista')
        || document.querySelector('#tab-locacoes #tblLocacoes')?.closest('.panel-block');
}

function normalizarFiltroLocacoesAtalho(filtro) {
    if (typeof normalizarFiltroLocacoes === 'function') {
        return normalizarFiltroLocacoes(filtro);
    }
    const valor = String(filtro || '').trim().toLowerCase();
    const filtrosValidos = new Set(['todos', 'ativo', 'atrasado', 'devolvido']);
    return filtrosValidos.has(valor) ? valor : 'todos';
}

function aplicarFiltroLocacoesInterno(filtro) {
    const destino = normalizarFiltroLocacoesAtalho(filtro);
    if (typeof mudarFiltro === 'function') {
        mudarFiltro(destino);
        return true;
    }
    if (clicarSeletorAtalho(
        `[data-action="aplicarFiltroLocacoesLista"][data-arg="${destino}"], [data-action="mudarFiltro"][data-arg="${destino}"]`,
        `Filtro ${destino} indisponível.`
    )) {
        return true;
    }
    return false;
}

function rolarParaListaLocacoesComFiltro(filtro) {
    const destino = normalizarFiltroLocacoesAtalho(filtro);
    return navegarComFocoAtalho({
        tabId: 'locacoes',
        preparar: () => {
            aplicarFiltroLocacoesInterno(destino);
        },
        resolverAlvo: () => obterAlvoListaLocacoes(),
        alinhamento: 'start',
        mensagemFalha: 'Lista de locações não encontrada.',
        maxTentativas: 14,
        intervaloMs: 90
    });
}

// Fluxo completo do filtro em locações: abre tab, aplica filtro, rola para lista e evidencia estado ativo.
function aplicarFiltroLocacoesLista(filtro) {
    rolarParaListaLocacoesComFiltro(filtro);
}

// Mantém compatibilidade com atalhos já existentes.
function executarAtalhoFiltroLocacoes(filtro) {
    aplicarFiltroLocacoesLista(filtro);
}

function executarAtalhoFiltroDevolucoes(filtro) {
    abrirTab('devolucoes', { semRolagem: true });

    aguardarElementoAtalho(
        () => document.getElementById('devFiltroHistorico'),
        () => {
            aplicarFiltroHistoricoDevolucoes(filtro, false, false);

            aguardarElementoAtalho(
                () => obterAlvoHistoricoDevolucoes(),
                (alvoHistorico) => {
                    rolarParaElementoAtalho(alvoHistorico, 'start');
                },
                {
                    onFalha: () => avisarAtalhoIndisponivel('Histórico de devoluções não encontrado.'),
                    maxTentativas: 12,
                    intervaloMs: 80
                }
            );
        },
        {
            onFalha: () => avisarAtalhoIndisponivel('Filtro de devoluções não encontrado.'),
            maxTentativas: 12,
            intervaloMs: 80
        }
    );
}

function irParaDevolucoesFormulario() {
    navegarComFocoAtalho({
        tabId: 'devolucoes',
        resolverAlvo: () => document.getElementById('devLocacao')
            || document.querySelector('#tab-devolucoes .card'),
        idFoco: 'devLocacao',
        alinhamento: 'start',
        mensagemFalha: 'Formulário de devolução não encontrado.'
    });
}

function irParaClientesLista() {
    navegarComFocoAtalho({
        tabId: 'locadores',
        resolverAlvo: () => document.getElementById('buscaCliente')
            || document.querySelector('#tab-locadores .card:last-of-type')
            || document.querySelector('#tab-locadores .card'),
        idFoco: 'buscaCliente',
        selecionar: true,
        alinhamento: 'start',
        mensagemFalha: 'Busca de clientes não encontrada.'
    });
}

function irParaTiposCadastro() {
    navegarComFocoAtalho({
        tabId: 'tipos',
        resolverAlvo: () => document.getElementById('tipoNome')
            || document.querySelector('#tab-tipos .card'),
        idFoco: 'tipoNome',
        alinhamento: 'start',
        mensagemFalha: 'Formulário de tipos não encontrado.'
    });
}

function irParaEstoqueBusca() {
    executarAtalhoBuscaEstoque();
}

function irParaEstoqueCadastro() {
    navegarComFocoAtalho({
        tabId: 'estoque',
        render: () => {
            if (typeof renderEstoque === 'function') renderEstoque();
        },
        resolverAlvo: () => document.getElementById('pecaNome')
            || document.querySelector('#tab-estoque .panel-block')
            || document.querySelector('#tab-estoque .card'),
        idFoco: 'pecaNome',
        alinhamento: 'start',
        mensagemFalha: 'Formulário do estoque não encontrado.'
    });
}

function irParaChecklistOperacional() {
    navegarComFocoAtalho({
        tabId: 'checklist',
        resolverAlvo: () => document.getElementById('checklistCliente')
            || document.querySelector('#tab-checklist .card'),
        idFoco: 'checklistCliente',
        alinhamento: 'start',
        mensagemFalha: 'Checklist operacional não encontrado.'
    });
}

function irParaLocacoesCobrancas() {
    rolarParaListaLocacoesComFiltro('ativo');
}

function irParaLocacoesFormulario() {
    navegarComFocoAtalho({
        tabId: 'locacoes',
        preparar: () => {
            if (typeof irEtapaLocacao === 'function') irEtapaLocacao(1);
        },
        resolverAlvo: () => document.getElementById('aluguelCliente')
            || document.querySelector('#tab-locacoes #locacaoEtapa1')
            || document.querySelector('#tab-locacoes .card'),
        idFoco: 'aluguelCliente',
        alinhamento: 'start',
        mensagemFalha: 'Formulário de locação não encontrado.'
    });
}

function irParaAuditoriaBusca() {
    navegarComFocoAtalho({
        tabId: 'auditoria',
        preparar: () => {
            if (typeof renderLogs === 'function') {
                renderLogs(window.filtroLogAtual || 'todos');
            }
        },
        resolverAlvo: () => document.getElementById('auditBusca')
            || document.querySelector('#tab-auditoria .card'),
        idFoco: 'auditBusca',
        selecionar: true,
        alinhamento: 'start',
        mensagemFalha: 'Busca de auditoria não encontrada.'
    });
}

function aplicarFiltroAuditoria(filtro = 'todos', focarBusca = false) {
    navegarComFocoAtalho({
        tabId: 'auditoria',
        preparar: () => {
            if (typeof renderLogs === 'function') renderLogs(filtro || 'todos');
        },
        resolverAlvo: () => document.getElementById('auditoriaCard')
            || document.getElementById('tblLogs')?.closest('.card')
            || document.querySelector('#tab-auditoria .card'),
        idFoco: focarBusca ? 'auditBusca' : '',
        selecionar: focarBusca,
        alinhamento: 'start',
        mensagemFalha: 'Lista de auditoria não encontrada.'
    });
}

function irParaConfigGeral() {
    navegarComFocoAtalho({
        tabId: 'config',
        preparar: () => {
            if (typeof renderConfig === 'function') renderConfig();
        },
        resolverAlvo: () => document.getElementById('confRodape')
            || document.querySelector('#tab-config .config-card')
            || document.querySelector('#tab-config .card'),
        idFoco: 'confRodape',
        alinhamento: 'start',
        mensagemFalha: 'Configurações não encontradas.'
    });
}

function irParaClientesCadastro() {
    navegarComFocoAtalho({
        tabId: 'locadores',
        resolverAlvo: () => document.getElementById('locNome')
            || document.querySelector('#tab-locadores .card'),
        idFoco: 'locNome',
        alinhamento: 'start',
        mensagemFalha: 'Formulário de cliente não encontrado.'
    });
}

function irParaChecklistModelo() {
    navegarComFocoAtalho({
        tabId: 'checklist',
        resolverAlvo: () => document.getElementById('checklistModeloSelect')
            || document.querySelector('#tab-checklist .card'),
        idFoco: 'checklistModeloSelect',
        alinhamento: 'start',
        mensagemFalha: 'Seleção de modelo do checklist não encontrada.'
    });
}

function gerarChecklistPDFViaAtalho() {
    navegarComFocoAtalho({
        tabId: 'checklist',
        resolverAlvo: () => document.querySelector('#tab-checklist .inline-chip-row')
            || document.getElementById('checklistCardLista')
            || document.querySelector('#tab-checklist .card'),
        alinhamento: 'start',
        mensagemFalha: 'Ações de checklist não encontradas.'
    });
    setTimeout(() => {
        if (typeof gerarPDFChecklistMontagem === 'function') {
            gerarPDFChecklistMontagem();
        } else {
            avisarAtalhoIndisponivel('Geração de PDF do checklist indisponível.');
        }
    }, 140);
}

function acionarImportacaoEstoqueViaAtalho() {
    navegarComFocoAtalho({
        tabId: 'estoque',
        render: () => {
            if (typeof renderEstoque === 'function') renderEstoque();
        },
        resolverAlvo: () => document.getElementById('tab-estoque')
            || document.querySelector('#tab-estoque .card'),
        alinhamento: 'start',
        mensagemFalha: 'Tela de estoque não encontrada.'
    });

    setTimeout(() => {
        const inputExcel = document.getElementById('inputExcel');
        if (!inputExcel) {
            avisarAtalhoIndisponivel('Importação indisponível: seletor de arquivo não encontrado.');
            return;
        }
        inputExcel.click();
    }, 120);
}

function irParaConfigBackup() {
    navegarComFocoAtalho({
        tabId: 'config',
        preparar: () => {
            if (typeof renderConfig === 'function') renderConfig();
        },
        resolverAlvo: () => document.querySelector('#tab-config .config-actions-card')
            || document.querySelector('#tab-config .card'),
        alinhamento: 'start',
        mensagemFalha: 'Área de backup não encontrada.'
    });
}

function obterAbaAtivaAtual() {
    const ativa = document.querySelector('.tab-content.active');
    if (!ativa?.id) return 'dashboard';
    return ativa.id.replace('tab-', '');
}

const IDS_BUSCA_ENTER_LIVRE = new Set([
    ...CAMPOS_BUSCA_PERSISTENTES,
    'inputBuscaPeca'
]);

function focarElementoSemRolar(elemento, selecionar = false) {
    if (!(elemento instanceof HTMLElement)) return false;
    setTimeout(() => {
        try {
            elemento.focus({ preventScroll: true });
        } catch (_) {
            elemento.focus();
        }
        if (selecionar && typeof elemento.select === 'function') {
            elemento.select();
        }
    }, 40);
    return true;
}

function tentarSelecionarPrimeiraSugestaoLocacao() {
    const lista = document.getElementById('listaSugestoes');
    if (!lista || !lista.classList.contains('ativo')) return false;

    const primeiroItem = lista.querySelector('.sugestao-item');
    if (!(primeiroItem instanceof HTMLElement)) return false;

    primeiroItem.click();
    return true;
}

function executarAtalhoEnterModal(event, modalAtivo, alvo) {
    if (!modalAtivo?.id || !(alvo instanceof HTMLElement)) return false;

    const mapaCamposModal = {
        modalEditarLocador: ['editLocNome', 'editLocEmail', 'editLocTel'],
        modalEditarTipo: ['editTipoNome', 'editTipoDesc'],
        modalEditarPeca: [
            'editPecaCod',
            'editPecaTipo',
            'editPecaNome',
            'editPecaMedida',
            'editPecaValor',
            'editPecaQtd',
            'editPecaBar',
            'editPecaGrupoChecklist',
            'editPecaFamiliaEstrutural',
            'editPecaSubtipoEstrutural',
            'editPecaPodeCompor'
        ]
    };

    const ordemIds = mapaCamposModal[modalAtivo.id];
    if (!Array.isArray(ordemIds) || !ordemIds.length) return false;

    const ordemCampos = ordemIds
        .map((id) => modalAtivo.querySelector(`#${id}`))
        .filter(elementoAcionavelVisivel);

    const indiceAtual = ordemCampos.indexOf(alvo);
    if (indiceAtual < 0) return false;

    event.preventDefault();
    if (indiceAtual < ordemCampos.length - 1) {
        focarElementoSemRolar(ordemCampos[indiceAtual + 1], true);
        return true;
    }

    return executarSalvarModalAtivo(modalAtivo);
}

function executarAtalhoEnterFormulario(event) {
    if (event.defaultPrevented) return false;
    if (event.key !== 'Enter') return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    const alvo = event.target;
    if (!(alvo instanceof HTMLElement)) return false;

    const modalAtivo = obterModalAtiva();
    if (modalAtivo && modalAtivo.contains(alvo)) {
        return executarAtalhoEnterModal(event, modalAtivo, alvo);
    }

    const tag = alvo.tagName?.toLowerCase();
    if (tag !== 'input' && tag !== 'select') return false;

    if (alvo instanceof HTMLInputElement) {
        const tipo = String(alvo.type || '').toLowerCase();
        const tiposIgnorados = new Set(['button', 'submit', 'reset', 'file', 'checkbox', 'radio']);
        if (tiposIgnorados.has(tipo)) return false;
    }

    const idAtual = String(alvo.id || '').trim();
    if (!idAtual) return false;

    if (alvo.classList.contains('search-input') && idAtual !== 'inputBuscaPeca') {
        return false;
    }

    const abaAtual = obterAbaAtivaAtual();
    const escopoAba = document.getElementById(`tab-${abaAtual}`) || document;

    if (abaAtual === 'locacoes') {
        const etapa1Ativa = document.getElementById('locacaoEtapa1')?.classList.contains('is-active');
        const etapa2Ativa = document.getElementById('locacaoEtapa2')?.classList.contains('is-active');

        if (etapa1Ativa) {
            const ordemEtapa1 = ['aluguelCliente', 'aluguelDivisor', 'aluguelIni', 'aluguelFim']
                .map((id) => document.getElementById(id))
                .filter(elementoAcionavelVisivel);

            const indiceAtual = ordemEtapa1.indexOf(alvo);
            if (indiceAtual >= 0) {
                event.preventDefault();
                if (indiceAtual < ordemEtapa1.length - 1) {
                    focarElementoSemRolar(ordemEtapa1[indiceAtual + 1], true);
                    return true;
                }
                const botaoEtapa2 = document.getElementById('btnIrEtapa2');
                if (elementoAcionavelVisivel(botaoEtapa2)) {
                    botaoEtapa2.click();
                    return true;
                }
                return false;
            }
        }

        if (etapa2Ativa && idAtual === 'inputBuscaPeca') {
            event.preventDefault();
            const itemSelecionado = document.getElementById('aluguelItemSelect')?.value;
            if (!itemSelecionado) {
                tentarSelecionarPrimeiraSugestaoLocacao();
            }
            focarElementoSemRolar(document.getElementById('aluguelQtd'), true);
            return true;
        }

        if (etapa2Ativa && idAtual === 'aluguelQtd') {
            event.preventDefault();
            acionarPrimeiraAcaoDisponivel(['addItemCarrinho'], escopoAba);
            return true;
        }
    }

    if (abaAtual === 'checklist') {
        const ordemChecklist = [
            'checklistCliente',
            'checklistLocal',
            'checklistMontagemData',
            'checklistHorario',
            'checklistEvento',
            'checklistDesmontagemData',
            'checklistRespSaida',
            'checklistRespRetorno',
            'checklistModeloSelect'
        ]
            .map((id) => document.getElementById(id))
            .filter(elementoAcionavelVisivel);

        const indiceChecklist = ordemChecklist.indexOf(alvo);
        if (indiceChecklist >= 0) {
            event.preventDefault();
            if (indiceChecklist < ordemChecklist.length - 1) {
                focarElementoSemRolar(ordemChecklist[indiceChecklist + 1], true);
                return true;
            }

            return acionarPrimeiraAcaoDisponivel(['adicionarModeloAoChecklist'], escopoAba);
        }
    }

    if (abaAtual === 'devolucoes') {
        const ordemCadastroDevolucao = ['devLocacao', 'devData']
            .map((id) => document.getElementById(id))
            .filter(elementoAcionavelVisivel);

        const indiceCadastro = ordemCadastroDevolucao.indexOf(alvo);
        if (indiceCadastro >= 0) {
            event.preventDefault();
            if (indiceCadastro < ordemCadastroDevolucao.length - 1) {
                focarElementoSemRolar(ordemCadastroDevolucao[indiceCadastro + 1], true);
                return true;
            }

            const camposConferencia = Array.from(document.querySelectorAll('#divItensDevolucao .dev-qtd, #divItensDevolucao .dev-avaria'))
                .filter(elementoAcionavelVisivel);
            if (camposConferencia.length) {
                focarElementoSemRolar(camposConferencia[0], true);
                return true;
            }

            return acionarPrimeiraAcaoDisponivel(['confirmarDevolucao'], escopoAba);
        }

        if (alvo.classList.contains('dev-qtd') || alvo.classList.contains('dev-avaria')) {
            event.preventDefault();

            const camposConferencia = Array.from(document.querySelectorAll('#divItensDevolucao .dev-qtd, #divItensDevolucao .dev-avaria'))
                .filter(elementoAcionavelVisivel);
            const indiceConferencia = camposConferencia.indexOf(alvo);
            if (indiceConferencia >= 0 && indiceConferencia < camposConferencia.length - 1) {
                focarElementoSemRolar(camposConferencia[indiceConferencia + 1], true);
                return true;
            }

            return acionarPrimeiraAcaoDisponivel(['confirmarDevolucao'], escopoAba);
        }
    }

    if (!IDS_BUSCA_ENTER_LIVRE.has(idAtual)) {
        const fluxos = {
            locadores: {
                campos: ['locNome', 'locDoc', 'locEnd', 'locEmail', 'locTel'],
                acoes: ['salvarLocador']
            },
            tipos: {
                campos: ['tipoNome', 'tipoDesc'],
                acoes: ['salvarTipo']
            },
            estoque: {
                campos: [
                    'pecaCod',
                    'pecaTipo',
                    'pecaNome',
                    'pecaMedida',
                    'pecaValor',
                    'pecaQtd',
                    'pecaBar',
                    'pecaGrupoChecklist',
                    'pecaFamiliaEstrutural',
                    'pecaSubtipoEstrutural',
                    'pecaPodeCompor'
                ],
                acoes: ['salvarPeca']
            },
            config: {
                campos: ['confRodape', 'confTel', 'confEmail'],
                acoes: ['salvarConfig']
            }
        };

        const fluxo = fluxos[abaAtual];
        if (!fluxo) return false;

        const ordemCampos = fluxo.campos
            .map((id) => document.getElementById(id))
            .filter(elementoAcionavelVisivel);

        const indiceAtual = ordemCampos.indexOf(alvo);
        if (indiceAtual < 0) return false;

        event.preventDefault();
        if (indiceAtual < ordemCampos.length - 1) {
            focarElementoSemRolar(ordemCampos[indiceAtual + 1], true);
            return true;
        }

        return acionarPrimeiraAcaoDisponivel(fluxo.acoes, escopoAba);
    }

    return false;
}

function lerBuscasRapidasPersistidas() {
    try {
        const bruto = localStorage.getItem(STORAGE_BUSCAS_RAPIDAS);
        if (!bruto) return {};
        const dados = JSON.parse(bruto);
        return dados && typeof dados === 'object' ? dados : {};
    } catch (_) {
        return {};
    }
}

function gravarBuscasRapidasPersistidas(payload) {
    try {
        localStorage.setItem(STORAGE_BUSCAS_RAPIDAS, JSON.stringify(payload || {}));
    } catch (_) {
        // Falha de storage não deve bloquear fluxo.
    }
}

function atualizarPersistenciaBuscaRapida(idCampo, valor) {
    if (!IDS_CAMPOS_BUSCA_PERSISTENTES.has(String(idCampo || ''))) return;
    const estado = lerBuscasRapidasPersistidas();
    const texto = String(valor || '');
    if (!texto.trim()) {
        delete estado[idCampo];
    } else {
        estado[idCampo] = texto;
    }
    gravarBuscasRapidasPersistidas(estado);
}

function restaurarBuscasRapidasPersistidas() {
    const estado = lerBuscasRapidasPersistidas();

    CAMPOS_BUSCA_PERSISTENTES.forEach((idCampo) => {
        const campo = document.getElementById(idCampo);
        if (!campo) return;

        const valor = typeof estado[idCampo] === 'string' ? estado[idCampo] : '';
        if (!valor) return;

        campo.value = valor;
        if (typeof buscarComDebounce === 'function') {
            buscarComDebounce(campo.dataset.arg || '');
        }
    });
}

function inicializarPersistenciaBuscasRapidas() {
    document.addEventListener('input', (event) => {
        const alvo = event.target;
        if (!(alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement)) return;
        if (!IDS_CAMPOS_BUSCA_PERSISTENTES.has(alvo.id)) return;
        atualizarPersistenciaBuscaRapida(alvo.id, alvo.value);
    });
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

function abrirModalAtalhos() {
    const modal = document.getElementById('modalShortcuts');
    if (!modal) return false;
    modal.classList.add('active');
    return true;
}

function obterModalAtiva() {
    const ativos = Array.from(document.querySelectorAll('.modal.active'));
    return ativos.length ? ativos[ativos.length - 1] : null;
}

function fecharModalAtiva() {
    const modal = obterModalAtiva();
    if (!modal?.id) return false;

    if (modal.id === 'modalScanner' && typeof fecharScanner === 'function') {
        fecharScanner();
        return true;
    }

    if (modal.id === 'modalModeloChecklist' && typeof fecharModalModeloChecklist === 'function') {
        fecharModalModeloChecklist();
        return true;
    }

    if (typeof fecharModal === 'function') {
        fecharModal(modal.id);
        return true;
    }

    modal.classList.remove('active');
    return true;
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

function elementoAcionavelVisivel(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.disabled) return false;
    if (el.hidden) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;

    const estilos = window.getComputedStyle(el);
    if (estilos.display === 'none' || estilos.visibility === 'hidden') return false;

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function acionarPrimeiraAcaoDisponivel(listaAcoes = [], raiz = document) {
    for (const acao of listaAcoes) {
        const candidatos = Array.from(raiz.querySelectorAll(`[data-action="${acao}"]`));
        const alvo = candidatos.find(elementoAcionavelVisivel);
        if (!alvo) continue;
        alvo.click();
        return true;
    }
    return false;
}

function executarSalvarModalAtivo(modal) {
    if (!modal?.id) return false;

    const acoesPorModal = {
        modalEditarLocador: ['salvarEdicaoLocador'],
        modalEditarTipo: ['salvarEdicaoTipo'],
        modalEditarPeca: ['salvarEdicaoPeca'],
        modalModeloChecklist: ['salvarModeloChecklistForm']
    };

    const lista = acoesPorModal[modal.id];
    if (Array.isArray(lista) && acionarPrimeiraAcaoDisponivel(lista, modal)) {
        return true;
    }

    // Fallback seguro para modais novos que usem padrão "salvar*".
    const fallback = Array.from(modal.querySelectorAll('[data-action^="salvar"]'));
    const botaoSalvar = fallback.find(elementoAcionavelVisivel);
    if (!botaoSalvar) return false;
    botaoSalvar.click();
    return true;
}

function executarAtalhoSalvarContextual() {
    const modalAtivo = obterModalAtiva();
    if (modalAtivo && executarSalvarModalAtivo(modalAtivo)) {
        return true;
    }

    const abaAtual = obterAbaAtivaAtual();
    const escopoAba = document.getElementById(`tab-${abaAtual}`) || document;
    const acoesPorAba = {
        locadores: ['salvarLocador'],
        tipos: ['salvarTipo'],
        estoque: ['salvarPeca'],
        locacoes: ['finalizarLocacao'],
        devolucoes: ['confirmarDevolucao'],
        config: ['salvarConfig']
    };

    if (acionarPrimeiraAcaoDisponivel(acoesPorAba[abaAtual] || [], escopoAba)) {
        return true;
    }

    if (typeof mostrarToast === 'function') {
        mostrarToast('Nenhuma ação de salvar disponível nesta tela.', 'info');
    }
    return false;
}

function atualizarAtalhosRapidos(tabId) {
    // Atalhos rápidos desativados por decisão de usabilidade.
    return;
}

function executarAtalhoRapido(atalhoId) {
    switch (atalhoId) {
        case 'qa_novo_cliente':
            irParaClientesCadastro();
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
            acionarImportacaoEstoqueViaAtalho();
            return;
        case 'qa_novo_checklist':
            irParaChecklistOperacional();
            return;
        case 'qa_modelo_checklist':
            irParaChecklistModelo();
            return;
        case 'qa_gerar_pdf_checklist':
            gerarChecklistPDFViaAtalho();
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
            irParaConfigBackup();
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
    if (typeof aplicarFiltroHistoricoDevolucoes === 'function') {
        aplicarFiltroHistoricoDevolucoes(obterFiltroDevolucoesPersistido(), false, false);
    }
        
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
    const ultimaAba = String(localStorage.getItem('mtz:lastTab') || '').trim();
    const abaInicial = document.querySelector(`.tab-btn[data-tab="${ultimaAba}"]`)
        ? ultimaAba
        : (btnInicial?.dataset.tab || 'dashboard');
    abrirTab(abaInicial, { semRolagem: true });
    inicializarPersistenciaBuscasRapidas();
    restaurarBuscasRapidasPersistidas();
    inicializarMetaTopbarContextual();
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
        const tabExiste = document.getElementById(alvoId);
        if (!tabExiste) return;

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
        localStorage.setItem('mtz:lastTab', id);

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
    const modalAtalhosAberto = document.getElementById('modalShortcuts')?.classList.contains('active');
    const idCampoBusca = String(alvo?.id || '');

    if (event.key === 'Escape' && modalAtalhosAberto) {
        event.preventDefault();
        fecharModal('modalShortcuts');
        return;
    }

    if (event.key === 'Escape' && IDS_CAMPOS_BUSCA_ESCAPE.has(idCampoBusca)) {
        const valorAtual = String(alvo?.value || '');
        if (valorAtual.length) {
            event.preventDefault();
            alvo.value = '';
            if (IDS_CAMPOS_BUSCA_PERSISTENTES.has(idCampoBusca)) {
                atualizarPersistenciaBuscaRapida(idCampoBusca, '');
            }
            if (alvo.dataset.input) {
                alvo.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (alvo.dataset.keyup) {
                alvo.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
            }
        }
        return;
    }

    if (event.key === 'Escape') {
        const modalAtivo = obterModalAtiva();
        if (modalAtivo) {
            event.preventDefault();
            fecharModalAtiva();
            return;
        }
    }

    if (!digitando && (event.key === '?' || event.key === 'F1')) {
        event.preventDefault();
        abrirModalAtalhos();
        return;
    }

    if (!digitando && event.key === '/') {
        event.preventDefault();
        ativarBuscaRapidaDaAbaAtual();
        return;
    }

    if (digitando && executarAtalhoEnterFormulario(event)) {
        return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        executarAtalhoSalvarContextual();
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

document.addEventListener('click', (event) => {
    const alvo = event.target;
    if (!(alvo instanceof HTMLElement)) return;
    if (!alvo.classList.contains('modal') || !alvo.classList.contains('active')) return;
    if (alvo.querySelector('.modal-content')?.contains(event.target)) return;
    fecharModalAtiva();
});
