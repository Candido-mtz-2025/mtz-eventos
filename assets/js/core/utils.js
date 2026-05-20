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

window.sanitizarTexto = sanitizarTexto;
window.sanitizarImagemURL = sanitizarImagemURL;

    // --- FORMATAÇÃO DE DATA ---
    function formatarData(dataString) {
        if (!dataString) return '<span style="color:#999">---</span>';
        const data = new Date(dataString);
        if (isNaN(data.getTime())) return '<span>Em aberto</span>';
        const dataCorrigida = new Date(data.getTime() + data.getTimezoneOffset() * 60000);
        return dataCorrigida.toLocaleDateString('pt-BR');
    }
