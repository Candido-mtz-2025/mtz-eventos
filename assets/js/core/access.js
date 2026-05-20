// Controle de perfis de acesso (Admin / Operação)
const PERFIL_ADMIN = 'admin';
const PERFIL_OPERACAO = 'operacao';
const PERFIL_KEY = 'mtzUserRole';

function normalizarListaEmails(texto) {
    return String(texto || '')
        .split(/[\n,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

function obterRegrasAdmin() {
    return normalizarListaEmails(config?.adminEmails || '');
}

function emailCombinaRegra(email, regra) {
    if (!regra) return false;
    if (!email) return false;
    if (regra.startsWith('@')) return email.endsWith(regra);
    return email === regra;
}

function obterEmailSessao() {
    const emailDireto = String(localStorage.getItem('usuarioEmail') || '').trim().toLowerCase();
    if (emailDireto) return emailDireto;

    if (typeof obterUltimoUsuarioGoogle === 'function') {
        const ultimo = obterUltimoUsuarioGoogle();
        return String(ultimo?.email || '').trim().toLowerCase();
    }

    return '';
}

function calcularPerfilAtual() {
    const regrasAdmin = obterRegrasAdmin();
    const modo = localStorage.getItem('mtzAuthMode') || 'offline';
    const email = obterEmailSessao();

    // Modo compatibilidade: sem regra de admin definida, mantém acesso total.
    if (regrasAdmin.length === 0) return PERFIL_ADMIN;

    // Sem e-mail válido no contexto atual, assume perfil operacional.
    if (!email) return PERFIL_OPERACAO;

    const ehAdmin = regrasAdmin.some((regra) => emailCombinaRegra(email, regra));
    if (ehAdmin) return PERFIL_ADMIN;

    // Em login Google sem regra compatível => Operação.
    if (modo === 'google') return PERFIL_OPERACAO;

    // Modo offline também respeita a lista de admin quando ela existe.
    return PERFIL_OPERACAO;
}

function obterPerfilAcesso() {
    const perfil = calcularPerfilAtual();
    localStorage.setItem(PERFIL_KEY, perfil);
    return perfil;
}

function ehAdmin() {
    return obterPerfilAcesso() === PERFIL_ADMIN;
}

function rotuloPerfilAcesso() {
    return ehAdmin() ? 'Admin' : 'Operação';
}

function temPermissao(acao) {
    if (ehAdmin()) return true;

    const bloqueadas = new Set([
        'excluir_registro',
        'editar_valor',
        'arquivar_historico',
        'restaurar_backup',
        'limpar_logs',
        'alterar_pagamento',
        'cancelar_locacao',
        'configuracao'
    ]);

    return !bloqueadas.has(acao);
}

function validarPermissao(acao, mensagem = '') {
    if (temPermissao(acao)) return true;
    mostrarToast(mensagem || 'Ação restrita ao perfil administrador.', 'erro');
    return false;
}

function atualizarIndicadorPerfilCabecalho() {
    const badge = document.getElementById('headerUserRole');
    if (!badge) return;

    const admin = ehAdmin();
    badge.textContent = admin ? 'Admin' : 'Operação';
    badge.className = `header-role-badge ${admin ? 'role-admin' : 'role-operacao'}`;
}

function bloquearCampo(campo, bloquear) {
    if (!campo) return;
    campo.disabled = !!bloquear;
    campo.classList.toggle('field-locked', !!bloquear);
}

function aplicarPermissoesInterface() {
    const perfil = obterPerfilAcesso();
    const admin = perfil === PERFIL_ADMIN;
    document.body.setAttribute('data-role', admin ? PERFIL_ADMIN : PERFIL_OPERACAO);

    document.querySelectorAll('[data-acesso="admin"]').forEach((el) => {
        const bloquear = !admin;
        if ('disabled' in el) el.disabled = bloquear;
        el.classList.toggle('is-locked', bloquear);
        if (bloquear) el.title = 'Disponível apenas para administradores';
    });

    const camposValor = [
        document.getElementById('pecaValor'),
        document.getElementById('editPecaValor'),
        document.getElementById('aluguelDivisor'),
        document.getElementById('confEmailsPermitidos'),
        document.getElementById('confAdminEmails')
    ];
    camposValor.forEach((campo) => bloquearCampo(campo, !admin));

    atualizarIndicadorPerfilCabecalho();
}

function atualizarPerfilAcesso() {
    const perfil = obterPerfilAcesso();
    aplicarPermissoesInterface();
    return perfil;
}

window.temPermissao = temPermissao;
window.validarPermissao = validarPermissao;
window.ehAdmin = ehAdmin;
window.obterPerfilAcesso = obterPerfilAcesso;
window.rotuloPerfilAcesso = rotuloPerfilAcesso;
window.aplicarPermissoesInterface = aplicarPermissoesInterface;
window.atualizarPerfilAcesso = atualizarPerfilAcesso;
window.atualizarIndicadorPerfilCabecalho = atualizarIndicadorPerfilCabecalho;
