// Utilitários compartilhados
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function capturarEstadoCampoAtivo(elementoPreferido = null) {
    const elemento = elementoPreferido instanceof HTMLElement
        ? elementoPreferido
        : document.activeElement;
    if (!(elemento instanceof HTMLElement)) return null;

    const tag = elemento.tagName?.toLowerCase();
    const editavel = tag === 'input' || tag === 'textarea' || tag === 'select' || elemento.isContentEditable;
    if (!editavel) return null;

    const estado = {
        elemento,
        id: elemento.id || '',
        inicio: null,
        fim: null
    };

    try {
        if (
            (elemento instanceof HTMLInputElement || elemento instanceof HTMLTextAreaElement)
            && typeof elemento.selectionStart === 'number'
            && typeof elemento.selectionEnd === 'number'
        ) {
            estado.inicio = elemento.selectionStart;
            estado.fim = elemento.selectionEnd;
        }
    } catch (_) {
        estado.inicio = null;
        estado.fim = null;
    }

    return estado;
}

function capturarEstadoRolagem() {
    const elementos = new Set([
        document.scrollingElement,
        document.documentElement,
        document.body
    ]);

    document.querySelectorAll([
        '#appArea',
        '.container',
        '.tab-content.active',
        '.modal-content',
        '.table-responsive',
        '.table-scroll',
        '.proposta-itens-table-wrap',
        '.prop-items-scroll',
        '.app-main',
        '.main-content',
        '.content-area',
        '[data-scroll-container]'
    ].join(',')).forEach((elemento) => {
        if (elemento instanceof HTMLElement) elementos.add(elemento);
    });

    return {
        janela: {
            x: window.scrollX || window.pageXOffset || 0,
            y: window.scrollY || window.pageYOffset || 0
        },
        elementos: Array.from(elementos)
            .filter((elemento) => elemento instanceof Element)
            .map((elemento) => ({
                elemento,
                top: elemento.scrollTop || 0,
                left: elemento.scrollLeft || 0
            }))
    };
}

function restaurarEstadoCampoAtivo(estadoCampo) {
    if (!estadoCampo) return;

    const campo = estadoCampo.id
        ? document.getElementById(estadoCampo.id)
        : estadoCampo.elemento;

    if (!(campo instanceof HTMLElement) || !document.contains(campo)) return;

    let focoRecuperado = false;

    try {
        if (document.activeElement !== campo) {
            campo.focus({ preventScroll: true });
            focoRecuperado = true;
        }
    } catch (_) {
        try {
            campo.focus();
            focoRecuperado = true;
        } catch (__) {}
    }

    if (!focoRecuperado) return;

    if (
        (campo instanceof HTMLInputElement || campo instanceof HTMLTextAreaElement)
        && estadoCampo.inicio !== null
        && estadoCampo.fim !== null
        && typeof campo.setSelectionRange === 'function'
    ) {
        try {
            campo.setSelectionRange(estadoCampo.inicio, estadoCampo.fim);
        } catch (_) {}
    }
}

function restaurarEstadoRolagem(estadoRolagem) {
    if (!estadoRolagem) return;

    estadoRolagem.elementos.forEach(({ elemento, top, left }) => {
        if (!(elemento instanceof Element)) return;
        if (elemento !== document.documentElement && elemento !== document.body && !document.contains(elemento)) return;
        if (Math.abs((elemento.scrollTop || 0) - top) > 1) elemento.scrollTop = top;
        if (Math.abs((elemento.scrollLeft || 0) - left) > 1) elemento.scrollLeft = left;
    });

    const deslocouJanela =
        Math.abs((window.scrollY || window.pageYOffset || 0) - estadoRolagem.janela.y) > 1 ||
        Math.abs((window.scrollX || window.pageXOffset || 0) - estadoRolagem.janela.x) > 1;

    if (deslocouJanela) {
        window.scrollTo({
            top: estadoRolagem.janela.y,
            left: estadoRolagem.janela.x,
            behavior: 'auto'
        });
    }
}

let sequenciaExecucaoMantendoScroll = 0;

function executarMantendoScroll(callback, elementoPreferido = null) {
    const sequenciaAtual = ++sequenciaExecucaoMantendoScroll;
    const estadoRolagem = capturarEstadoRolagem();
    const estadoCampo = capturarEstadoCampoAtivo(elementoPreferido);

    try {
        if (typeof callback === 'function') callback();
    } finally {
        const restaurar = () => {
            if (sequenciaAtual !== sequenciaExecucaoMantendoScroll) return;
            restaurarEstadoCampoAtivo(estadoCampo);
            restaurarEstadoRolagem(estadoRolagem);
        };

        requestAnimationFrame(restaurar);
        setTimeout(restaurar, 80);
        setTimeout(restaurar, 180);
    }
}

// === BUSCA COM DEBOUNCE (ANTI-LAG) ===
// Centraliza o comportamento de busca por área para reduzir re-render em digitação.
const buscarComDebounce = debounce(function(tipo) {
    const alvo = String(tipo || '').toLowerCase();

    if (alvo === 'locadores' && typeof renderLocadores === 'function') {
        renderLocadores();
        return;
    }

    if (alvo === 'estoque' && typeof renderEstoque === 'function') {
        renderEstoque();
        return;
    }

    if (alvo === 'devolucoes' && typeof renderDevolucoes === 'function') {
        renderDevolucoes();
        return;
    }

    if (alvo === 'locacoes' && typeof renderLocacoes === 'function') {
        renderLocacoes();
        return;
    }

    if (alvo === 'propostas' && typeof renderPropostas === 'function') {
        renderPropostas();
        return;
    }

    if (alvo === 'orcamentos' && typeof renderOrcamentos === 'function') {
        renderOrcamentos();
        return;
    }

    if (alvo === 'financeiro' && typeof renderFinanceiroResumo === 'function') {
        renderFinanceiroResumo();
        return;
    }

    if (alvo === 'agenda' && typeof renderAgendaOperacional === 'function') {
        renderAgendaOperacional();
        return;
    }

    if (alvo === 'transporte' && typeof renderTransporteOperacional === 'function') {
        renderTransporteOperacional();
        return;
    }

    if (alvo === 'tipos' && typeof renderTipos === 'function') {
        renderTipos();
        return;
    }

    if (alvo === 'auditoria' && typeof renderLogs === 'function') {
        renderLogs(window.filtroLogAtual || 'todos');
    }
}, 280);

function sanitizarTexto(valor) {
    const div = document.createElement('div');
    div.textContent = valor == null ? '' : String(valor);
    return div.innerHTML;
}

function sanitizarImagemURL(valor) {
    const bruto = String(valor || '').trim();
    if (!bruto) return '';

    if (bruto.startsWith('data:image/')) return bruto;

    try {
        const parsed = new URL(bruto, window.location.href);
        if (['http:', 'https:', 'blob:'].includes(parsed.protocol)) {
            return parsed.href;
        }
    } catch (_) {
        return '';
    }

    return '';
}

const ESTADOS_UI = {
    empty: {
        icone: 'bi-inbox',
        titulo: 'Sem registros',
        mensagem: 'Sem dados para mostrar no momento.'
    },
    loading: {
        icone: 'bi-arrow-repeat',
        titulo: 'Carregando',
        mensagem: 'Aguarde enquanto os dados são atualizados.'
    },
    error: {
        icone: 'bi-exclamation-triangle',
        titulo: 'Não foi possível carregar',
        mensagem: 'Tente novamente em alguns instantes.'
    },
    success: {
        icone: 'bi-check2-circle',
        titulo: 'Tudo certo',
        mensagem: 'Operação concluída com sucesso.'
    },
    info: {
        icone: 'bi-info-circle',
        titulo: 'Informação',
        mensagem: 'Sem atualizações no momento.'
    }
};

function normalizarTipoEstado(tipo) {
    const chave = String(tipo || '').toLowerCase();
    return ESTADOS_UI[chave] ? chave : 'info';
}

function criarEstadoUI(opcoes = {}) {
    const tipo = normalizarTipoEstado(opcoes.tipo);
    const config = ESTADOS_UI[tipo];
    const titulo = sanitizarTexto(opcoes.titulo || config.titulo);
    const mensagem = sanitizarTexto(opcoes.mensagem || config.mensagem || '');
    const compacto = opcoes.compacto !== false;
    const icone = tipo === 'loading'
        ? '<span class="inline-loader" aria-hidden="true"></span>'
        : `<i class="bi ${config.icone}" aria-hidden="true"></i>`;

    return `
        <div class="ui-state ui-state--${tipo}${compacto ? ' ui-state--compact' : ''}">
            <div class="ui-state-icon">${icone}</div>
            <div class="ui-state-content">
                <strong>${titulo}</strong>
                ${mensagem ? `<span>${mensagem}</span>` : ''}
            </div>
        </div>
    `;
}

function criarLinhaTabelaEstado(colspan, opcoes = {}) {
    const totalColunas = Number.isFinite(Number(colspan)) ? Math.max(1, Number(colspan)) : 1;
    return `
        <tr class="table-state-row table-state-row--${normalizarTipoEstado(opcoes.tipo)}">
            <td colspan="${totalColunas}">
                ${criarEstadoUI({ ...opcoes, compacto: true })}
            </td>
        </tr>
    `;
}

function criarEstadoPainel(mensagem, opcoes = {}) {
    return `
        <div class="ui-state-panel">
            ${criarEstadoUI({
                tipo: opcoes.tipo || 'info',
                titulo: opcoes.titulo,
                mensagem,
                compacto: opcoes.compacto === true
            })}
        </div>
    `;
}

function criarLinhaTabelaVazia(colspan, mensagem) {
    return criarLinhaTabelaEstado(colspan, {
        tipo: 'empty',
        titulo: 'Sem registros',
        mensagem: mensagem || 'Sem dados para mostrar no momento.'
    });
}

function criarLinhaTabelaCarregando(colspan, mensagem) {
    return criarLinhaTabelaEstado(colspan, {
        tipo: 'loading',
        titulo: 'Carregando dados',
        mensagem: mensagem || 'Aguarde enquanto os dados são atualizados.'
    });
}

function atualizarMetaBusca(id, opcoes = {}) {
    const el = document.getElementById(id);
    if (!el) return;

    const total = Math.max(0, Number(opcoes.total ?? 0));
    const filtrados = Math.max(0, Number(opcoes.filtrados ?? total));
    const rotulo = String(opcoes.rotulo || 'registros').trim();
    const termo = String(opcoes.termo || '').trim();
    const filtro = String(opcoes.filtro || '').trim().toLowerCase();
    const filtroLabel = String(opcoes.filtroLabel || opcoes.filtro || '').trim();

    const partes = [`${filtrados} de ${total} ${rotulo}`];
    if (termo) {
        partes.push(`Busca: "${termo}"`);
    } else if (filtro && filtro !== 'todos') {
        partes.push(`Filtro: ${filtroLabel || filtro}`);
    } else {
        partes.push('Lista completa');
    }

    el.textContent = partes.join(' • ');

    const ativo = Boolean(termo) || (filtro && filtro !== 'todos') || filtrados !== total;
    el.classList.toggle('is-active', ativo);
    el.classList.toggle('is-empty', filtrados === 0);
}

window.sanitizarTexto = sanitizarTexto;
window.sanitizarImagemURL = sanitizarImagemURL;
window.criarEstadoUI = criarEstadoUI;
window.criarEstadoPainel = criarEstadoPainel;
window.criarLinhaTabelaEstado = criarLinhaTabelaEstado;
window.criarLinhaTabelaVazia = criarLinhaTabelaVazia;
window.criarLinhaTabelaCarregando = criarLinhaTabelaCarregando;
window.atualizarMetaBusca = atualizarMetaBusca;
window.executarMantendoScroll = executarMantendoScroll;
window.buscarComDebounce = buscarComDebounce;

    // --- FORMATAÇÃO DE DATA ---
    function formatarData(dataString) {
        if (!dataString) return '<span class="date-empty">---</span>';
        const data = new Date(dataString);
        if (isNaN(data.getTime())) return '<span class="date-empty">Em aberto</span>';
        const dataCorrigida = new Date(data.getTime() + data.getTimezoneOffset() * 60000);
        return dataCorrigida.toLocaleDateString('pt-BR');
    }
