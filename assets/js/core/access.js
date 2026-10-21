// Controle de perfis de acesso (Admin / Operação)
const PERFIL_ADMIN = 'admin';
const PERFIL_OPERACAO = 'operacao';
const PERFIL_KEY = 'mtzUserRole';
const PERMISSOES_ABAS_RESTRITAS = Object.freeze({
    auditoria: 'visualizar_auditoria',
    config: 'visualizar_configuracoes',
    'fluxo-caixa': 'visualizar_fluxo_caixa',
    'contas-pagar': 'visualizar_contas_pagar',
    'classificacoes-financeiras': 'visualizar_classificacoes_financeiras'
});

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
        'conciliar_pagamento',
        'desconsiderar_conciliacao',
        'visualizar_fluxo_caixa',
        'visualizar_fornecedores',
        'cadastrar_fornecedor',
        'editar_fornecedor',
        'visualizar_contas_pagar',
        'criar_conta_pagar',
        'visualizar_classificacoes_financeiras',
        'cadastrar_categoria_financeira',
        'editar_categoria_financeira',
        'inativar_categoria_financeira',
        'cadastrar_centro_custo',
        'editar_centro_custo',
        'inativar_centro_custo',
        'pagar_conta',
        'estornar_pagamento_conta',
        'alterar_vencimento_conta_pagar',
        'cancelar_conta_pagar',
        'encerrar_conta_pagar',
        'conciliar_pagamento_conta_pagar',
        'desconsiderar_conciliacao_conta_pagar',
        'cancelar_locacao',
        'visualizar_auditoria',
        'visualizar_configuracoes',
        'configuracao'
    ]);

    return !bloqueadas.has(acao);
}

function temAcessoAba(aba) {
    if (typeof aba !== 'string') return false;
    const permissao = PERMISSOES_ABAS_RESTRITAS[aba];
    return !permissao || temPermissao(permissao);
}

function validarAcessoAba(aba, opcoes = {}) {
    if (temAcessoAba(aba)) return true;
    if (opcoes.silencioso !== true && typeof mostrarToast === 'function') {
        mostrarToast('Você não possui permissão para acessar esta área.', 'erro');
    }
    return false;
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

    document.querySelectorAll('[data-tab]').forEach((el) => {
        const aba = el.getAttribute('data-tab');
        if (!PERMISSOES_ABAS_RESTRITAS[aba]) return;
        const permitido = temAcessoAba(aba);
        el.hidden = !permitido;
        if ('disabled' in el) el.disabled = !permitido;
        el.setAttribute('aria-hidden', permitido ? 'false' : 'true');
    });
    document.querySelectorAll('.nav-menu-trigger[aria-controls]').forEach((gatilho) => {
        const menu = document.getElementById(gatilho.getAttribute('aria-controls'));
        if (!menu) return;
        const itens = Array.from(menu.querySelectorAll('[data-tab]'));
        const possuiItemVisivel = itens.some((item) => !item.hidden);
        gatilho.hidden = !possuiItemVisivel;
        gatilho.setAttribute('aria-hidden', possuiItemVisivel ? 'false' : 'true');
    });

    const abaAtiva = document.querySelector('.tab-content.active')?.id?.replace(/^tab-/, '') || '';
    if (abaAtiva && !temAcessoAba(abaAtiva) && typeof abrirTab === 'function') {
        abrirTab('dashboard', { semRolagem: true });
    }

    if (!admin) {
        const tabelaAuditoria = document.getElementById('tblLogs');
        if (tabelaAuditoria) tabelaAuditoria.replaceChildren();
        document.querySelectorAll('#tab-config input, #tab-config textarea, #tab-config select')
            .forEach((campo) => {
                if (campo instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(campo.type)) return;
                if (campo instanceof HTMLInputElement && ['checkbox', 'radio'].includes(campo.type)) campo.checked = false;
                else campo.value = '';
            });
        const previewLogo = document.getElementById('previewLogo');
        if (previewLogo) previewLogo.replaceChildren();
    }

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
window.temAcessoAba = temAcessoAba;
window.validarAcessoAba = validarAcessoAba;
window.ehAdmin = ehAdmin;
window.obterPerfilAcesso = obterPerfilAcesso;
window.rotuloPerfilAcesso = rotuloPerfilAcesso;
window.aplicarPermissoesInterface = aplicarPermissoesInterface;
window.atualizarPerfilAcesso = atualizarPerfilAcesso;
window.atualizarIndicadorPerfilCabecalho = atualizarIndicadorPerfilCabecalho;
