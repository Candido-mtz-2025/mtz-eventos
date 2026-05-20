// Configurações gerais
function normalizarEmailsPermitidos(texto) {
    return String(texto || '')
        .split(/[\n,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
        .join('\n');
}

function salvarConfig() {
    if (typeof validarPermissao === 'function' && !validarPermissao('configuracao', 'Somente administrador pode salvar configurações.')) {
        return;
    }

    const elRodape = document.getElementById('confRodape');
    const elTel = document.getElementById('confTel');
    const elEmail = document.getElementById('confEmail');
    const elEmailsPermitidos = document.getElementById('confEmailsPermitidos');
    const elAdminEmails = document.getElementById('confAdminEmails');

    if (elRodape) config.rodape = elRodape.value;
    if (elTel) config.tel = elTel.value;
    if (elEmail) config.email = elEmail.value;
    if (elEmailsPermitidos) {
        config.emailsPermitidos = normalizarEmailsPermitidos(elEmailsPermitidos.value);
        elEmailsPermitidos.value = config.emailsPermitidos;
    }
    if (elAdminEmails) {
        config.adminEmails = normalizarEmailsPermitidos(elAdminEmails.value);
        elAdminEmails.value = config.adminEmails;
    }

    salvarLocal();
    sincronizar('salvar');
    if (typeof atualizarPerfilAcesso === 'function') atualizarPerfilAcesso();
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
