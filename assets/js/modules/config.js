// Configurações gerais
function normalizarEmailsPermitidos(texto) {
    return String(texto || '')
        .split(/[\n,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
        .join('\n');
}

function salvarConfig() {
    const elRodape = document.getElementById('confRodape');
    const elTel = document.getElementById('confTel');
    const elEmail = document.getElementById('confEmail');
    const elEmailsPermitidos = document.getElementById('confEmailsPermitidos');

    if (elRodape) config.rodape = elRodape.value;
    if (elTel) config.tel = elTel.value;
    if (elEmail) config.email = elEmail.value;
    if (elEmailsPermitidos) {
        config.emailsPermitidos = normalizarEmailsPermitidos(elEmailsPermitidos.value);
        elEmailsPermitidos.value = config.emailsPermitidos;
    }

    salvarLocal();
    sincronizar('salvar');
    mostrarToast('Config salva!');
}

function converterLogo() {
    const input = document.getElementById('confLogo');
    if (!input?.files?.[0]) return;

    const reader = new FileReader();
    reader.onloadend = function() {
        config.logo = reader.result;
        const preview = document.getElementById('previewLogo');
        if (preview) preview.innerHTML = `<img src="${config.logo}" style="height:50px">`;
    };
    reader.readAsDataURL(input.files[0]);
}
