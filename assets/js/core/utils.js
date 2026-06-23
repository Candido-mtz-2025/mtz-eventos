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

    // --- FORMATAÇÃO DE DATA ---
    function formatarData(dataString) {
        if (!dataString) return '<span style="color:#999">---</span>';
        const data = new Date(dataString);
        if (isNaN(data.getTime())) return '<span>Em aberto</span>';
        const dataCorrigida = new Date(data.getTime() + data.getTimezoneOffset() * 60000);
        return dataCorrigida.toLocaleDateString('pt-BR');
    }
