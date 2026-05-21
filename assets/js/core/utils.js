// Utilitários compartilhados
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// === BUSCA COM DEBOUNCE (ANTI-LAG) ===
const buscarComDebounce = debounce(function(tipo) {
    if (tipo === 'locadores') renderLocadores();
    if (tipo === 'estoque') renderEstoque();
}, 300);

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

window.sanitizarTexto = sanitizarTexto;
window.sanitizarImagemURL = sanitizarImagemURL;
window.criarEstadoUI = criarEstadoUI;
window.criarEstadoPainel = criarEstadoPainel;
window.criarLinhaTabelaEstado = criarLinhaTabelaEstado;
window.criarLinhaTabelaVazia = criarLinhaTabelaVazia;
window.criarLinhaTabelaCarregando = criarLinhaTabelaCarregando;
window.buscarComDebounce = buscarComDebounce;

    // --- FORMATAÇÃO DE DATA ---
    function formatarData(dataString) {
        if (!dataString) return '<span class="date-empty">---</span>';
        const data = new Date(dataString);
        if (isNaN(data.getTime())) return '<span class="date-empty">Em aberto</span>';
        const dataCorrigida = new Date(data.getTime() + data.getTimezoneOffset() * 60000);
        return dataCorrigida.toLocaleDateString('pt-BR');
    }
