// Configuração de autenticação e status de sincronização
const GOOGLE_CLIENT_ID = '981345912804-uim8kctqnts15kt6l8odhif3hil6udek.apps.googleusercontent.com';
const API_URL = 'https://script.google.com/macros/s/AKfycbxZoCyJZrG2WZfIuPA3Iyz6d-PIdnzFi-Ejnl3gAUB-l9mGnBJt0BpyBErzMI_GFuZuhA/exec';
const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');
const GOOGLE_SDK_URL = 'https://accounts.google.com/gsi/client';
const GOOGLE_SESSION_TTL_MS = 55 * 60 * 1000;
const LAST_GOOGLE_USER_KEY = 'mtzLastGoogleUser';
const AUTH_MODE_KEY = 'mtzAuthMode';

let loginEventosRegistrados = false;
let carregamentoSDKGooglePromise = null;

function carregarSDKGoogleSobDemanda() {
    if (window.google?.accounts?.oauth2) {
        return Promise.resolve(true);
    }

    if (carregamentoSDKGooglePromise) {
        return carregamentoSDKGooglePromise;
    }

    carregamentoSDKGooglePromise = new Promise((resolve) => {
        const scriptExistente = document.querySelector('script[data-google-gsi="true"]');
        if (scriptExistente) {
            const timeoutExistente = setTimeout(() => resolve(false), 8000);
            scriptExistente.addEventListener('load', () => {
                clearTimeout(timeoutExistente);
                resolve(!!window.google?.accounts?.oauth2);
            }, { once: true });
            scriptExistente.addEventListener('error', () => {
                clearTimeout(timeoutExistente);
                resolve(false);
            }, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = GOOGLE_SDK_URL;
        script.async = true;
        script.defer = true;
        script.dataset.googleGsi = 'true';

        const timeout = setTimeout(() => resolve(false), 8000);
        script.onload = () => {
            clearTimeout(timeout);
            resolve(!!window.google?.accounts?.oauth2);
        };
        script.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
        };

        document.head.appendChild(script);
    }).finally(() => {
        carregamentoSDKGooglePromise = null;
    });

    return carregamentoSDKGooglePromise;
}

function atualizarStatusLogin(texto, tipo = 'info') {
    const box = document.getElementById('loginStatus');
    const textoEl = document.getElementById('loginStatusText');
    const icon = document.getElementById('loginStatusIcon');

    if (!box || !textoEl) return;

    box.className = `login-status ${tipo}`;
    textoEl.textContent = texto || 'Pronto para entrar.';

    if (icon) {
        const mapaIcone = {
            info: 'bi bi-shield-check',
            success: 'bi bi-check-circle',
            warn: 'bi bi-wifi-off',
            error: 'bi bi-exclamation-triangle'
        };
        icon.className = mapaIcone[tipo] || mapaIcone.info;
    }
}

function alternarBotoesLogin(desativado) {
    const botoes = [
        'btnLoginGoogle',
        'btnEntrarOffline',
        'btnAcessoRapidoGoogle',
        'btnSessaoGoogle',
        'btnSessaoOffline'
    ];

    botoes.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !!desativado;
    });
}

function salvarSessaoGoogle(token) {
    localStorage.setItem('gToken', token);
    localStorage.setItem('gTokenCreatedAt', String(Date.now()));
}

function limparSessaoGoogle() {
    localStorage.removeItem('gToken');
    localStorage.removeItem('gTokenCreatedAt');
}

function sessaoGoogleExpirada() {
    const criadoEm = Number(localStorage.getItem('gTokenCreatedAt') || 0);
    if (!criadoEm) return true;
    return (Date.now() - criadoEm) > GOOGLE_SESSION_TTL_MS;
}

function loginVisivel() {
    const loginArea = document.getElementById('loginArea');
    return !!loginArea && loginArea.style.display !== 'none';
}

function obterUltimoUsuarioGoogle() {
    try {
        const texto = localStorage.getItem(LAST_GOOGLE_USER_KEY);
        if (!texto) return null;
        const dados = JSON.parse(texto);
        if (!dados || typeof dados !== 'object') return null;
        return dados;
    } catch (erro) {
        console.warn('Falha ao ler último usuário Google:', erro);
        return null;
    }
}

function salvarUltimoUsuarioGoogle(dados) {
    if (!dados || typeof dados !== 'object') return;
    localStorage.setItem(LAST_GOOGLE_USER_KEY, JSON.stringify(dados));
}

function obterEmailsPermitidosConfig() {
    const bruto = config?.emailsPermitidos || '';
    return String(bruto)
        .split(/[\n,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

function emailGooglePermitido(email) {
    const regras = obterEmailsPermitidosConfig();
    if (!regras.length) return true;

    const alvo = String(email || '').trim().toLowerCase();
    if (!alvo) return false;

    return regras.some((regra) => {
        if (regra.startsWith('@')) return alvo.endsWith(regra);
        return alvo === regra;
    });
}

function renderAcessoRapidoLogin() {
    const bloco = document.getElementById('loginLastUser');
    const nomeEl = document.getElementById('loginLastUserName');
    const emailEl = document.getElementById('loginLastUserEmail');
    const avatarEl = document.getElementById('loginLastUserAvatar');

    if (!bloco || !nomeEl || !emailEl || !avatarEl) return;

    const dados = obterUltimoUsuarioGoogle();
    if (!dados || (!dados.email && !dados.nome)) {
        bloco.style.display = 'none';
        return;
    }

    nomeEl.textContent = dados.nome || 'Conta Google';
    emailEl.textContent = dados.email || 'Usuário Google';
    avatarEl.src = dados.foto || './logo.png';
    bloco.style.display = 'block';
}

function renderUsuarioCabecalho() {
    const box = document.getElementById('headerUser');
    const nomeEl = document.getElementById('headerUserName');
    const emailEl = document.getElementById('headerUserEmail');
    const avatarEl = document.getElementById('headerUserAvatar');

    if (!box || !nomeEl || !emailEl || !avatarEl) return;

    const modo = localStorage.getItem(AUTH_MODE_KEY) || 'offline';
    const ultimo = obterUltimoUsuarioGoogle();
    const emailSessao = localStorage.getItem('usuarioEmail') || '';

    let nome = '';
    let email = '';
    let foto = './logo.png';

    if (modo === 'google') {
        nome = ultimo?.nome || 'Conta Google';
        email = ultimo?.email || emailSessao || 'Sincronização ativa';
        foto = ultimo?.foto || './logo.png';
    } else {
        nome = 'Modo offline';
        if (ultimo?.email) {
            email = `Último Google: ${ultimo.email}`;
            foto = ultimo?.foto || './logo.png';
        } else {
            email = 'Sem sincronização ativa';
        }
    }

    nomeEl.textContent = nome;
    emailEl.textContent = email;
    avatarEl.src = foto;
    box.style.display = 'inline-flex';
    if (typeof atualizarIndicadorPerfilCabecalho === 'function') atualizarIndicadorPerfilCabecalho();
}

function mostrarTelaSessaoExpirada() {
    const loginArea = document.getElementById('loginArea');
    const sessaoArea = document.getElementById('sessionExpiredArea');

    if (loginArea) loginArea.style.display = 'none';
    if (sessaoArea) sessaoArea.style.display = 'flex';
}

function ocultarTelaSessaoExpirada(mostrarLogin = false) {
    const loginArea = document.getElementById('loginArea');
    const sessaoArea = document.getElementById('sessionExpiredArea');

    if (sessaoArea) sessaoArea.style.display = 'none';
    if (loginArea) loginArea.style.display = mostrarLogin ? 'flex' : loginArea.style.display;
}

async function atualizarUltimoUsuarioGoogle(accessToken) {
    const base = obterUltimoUsuarioGoogle() || {};
    const perfil = {
        nome: base.nome || 'Conta Google',
        email: base.email || localStorage.getItem('usuarioEmail') || '',
        foto: base.foto || '',
        atualizadoEm: new Date().toISOString()
    };

    try {
        const resposta = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (resposta.ok) {
            const dados = await resposta.json();
            if (dados?.name) perfil.nome = dados.name;
            if (dados?.email) perfil.email = dados.email;
            if (dados?.picture) perfil.foto = dados.picture;
        }
    } catch (erro) {
        console.warn('Não foi possível carregar perfil Google:', erro);
    }

    if (perfil.email) {
        localStorage.setItem('usuarioEmail', perfil.email);
    }

    salvarUltimoUsuarioGoogle(perfil);
    renderAcessoRapidoLogin();
    renderUsuarioCabecalho();
    return perfil;
}

function registrarEventosRedeLogin() {
    if (loginEventosRegistrados) return;
    loginEventosRegistrados = true;

    window.addEventListener('online', () => {
        if (loginVisivel()) {
            atualizarStatusLogin('Internet restabelecida. Você já pode entrar com Google.', 'info');
        } else {
            mostrarToast('Conexao restabelecida.', 'info');
        }
    });

    window.addEventListener('offline', () => {
        if (loginVisivel()) {
            atualizarStatusLogin('Sem internet. Você pode continuar offline.', 'warn');
        } else {
            mostrarToast('Sem internet. O app segue no modo local.', 'erro');
        }
    });
}

// --- AUTENTICAÇÃO E SYNC ---
function gisLoaded() {
    if (!window.google?.accounts?.oauth2) {
        atualizarStatusLogin('Não foi possível carregar o Google no momento.', 'error');
        return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: () => {},
        error_callback: (erro) => {
            alternarBotoesLogin(false);

            if (erro?.type === 'popup_failed_to_open') {
                atualizarStatusLogin('O navegador bloqueou a janela do Google. Libere pop-ups para este site e tente novamente.', 'warn');
                return;
            }

            if (erro?.type === 'popup_closed') {
                atualizarStatusLogin('Login cancelado. Quando quiser, tente novamente.', 'warn');
                return;
            }

            atualizarStatusLogin('Não foi possível abrir o login Google agora. Tente novamente.', 'error');
            console.warn('Erro no fluxo Google:', erro);
        }
    });

    if (loginVisivel() && !localStorage.getItem('gToken')) {
        atualizarStatusLogin('Google pronto para login.', 'info');
    }
}

async function processarRespostaGoogle(resp, origem = 'login') {
    if (resp?.error) {
        if (resp.error === 'popup_closed_by_user') {
            atualizarStatusLogin('Login cancelado. Quando quiser, tente novamente.', 'warn');
            return;
        }

        if (origem === 'acesso_rapido') {
            atualizarStatusLogin('Acesso rápido não concluído. Tente "Entrar com Google".', 'warn');
            return;
        }

        if (origem === 'revalidacao') {
            limparSessaoGoogle();
            localStorage.removeItem(AUTH_MODE_KEY);
            mostrarTelaSessaoExpirada();
            atualizarStatusLogin('Sessão expirada. Entre novamente com Google.', 'warn');
            return;
        }

        atualizarStatusLogin('Erro ao autenticar com Google. Tente novamente.', 'error');
        console.error('Erro Google OAuth:', resp.error);
        return;
    }

    if (!resp?.access_token) {
        atualizarStatusLogin('Não recebemos o token de acesso. Tente novamente.', 'error');
        return;
    }

    salvarSessaoGoogle(resp.access_token);
    const perfil = await atualizarUltimoUsuarioGoogle(resp.access_token);

    if (!emailGooglePermitido(perfil.email)) {
        limparSessaoGoogle();
        localStorage.removeItem(AUTH_MODE_KEY);
        atualizarStatusLogin('Este e-mail não está liberado para login Google neste sistema.', 'error');
        mostrarToast('Acesso negado para este e-mail.', 'erro');
        return;
    }

    localStorage.setItem(AUTH_MODE_KEY, 'google');
    if (typeof atualizarPerfilAcesso === 'function') atualizarPerfilAcesso();
    atualizarStatusLogin('Conectado com Google. Carregando seus dados...', 'success');
    entrarApp();
    sincronizar('carregar');
}

async function solicitarTokenGoogle(promptValue = 'consent', origem = 'login') {
    if (!navigator.onLine) {
        atualizarStatusLogin('Sem internet. Use o modo offline ou conecte a internet.', 'warn');
        return;
    }

    if (!window.google?.accounts?.oauth2) {
        atualizarStatusLogin('Conectando ao serviço Google...', 'info');
        const sdkCarregado = await carregarSDKGoogleSobDemanda();
        if (!sdkCarregado) {
            atualizarStatusLogin('Não foi possível carregar o login Google nesta rede. Você pode continuar offline e tentar novamente depois.', 'warn');
            return;
        }
    }

    if (!tokenClient) {
        gisLoaded();
    }

    if (!tokenClient) {
        atualizarStatusLogin('Google ainda não está pronto. Tente novamente em instantes.', 'warn');
        return;
    }

    alternarBotoesLogin(true);
    const mensagem = origem === 'acesso_rapido'
        ? 'Reconectando com o último usuário...'
        : 'Abrindo autenticação Google...';
    atualizarStatusLogin(mensagem, 'info');

    tokenClient.callback = async (resp) => {
        alternarBotoesLogin(false);
        await processarRespostaGoogle(resp, origem);
    };

    try {
        tokenClient.requestAccessToken({ prompt: promptValue });
    } catch (erro) {
        alternarBotoesLogin(false);
        atualizarStatusLogin('Não foi possível iniciar o login agora. Tente novamente.', 'error');
        console.error('Falha ao solicitar token Google:', erro);
    }
}

function fazerLoginGoogle() {
    ocultarTelaSessaoExpirada(true);
    solicitarTokenGoogle('consent', 'login');
}

function entrarComUltimoUsuarioGoogle() {
    const ultimo = obterUltimoUsuarioGoogle();
    if (!ultimo) {
        atualizarStatusLogin('Nenhum usuário salvo para acesso rápido. Entre com Google primeiro.', 'warn');
        return;
    }

    ocultarTelaSessaoExpirada(true);
    solicitarTokenGoogle('', 'acesso_rapido');
}

function entrarOffline() {
    localStorage.setItem(AUTH_MODE_KEY, 'offline');
    if (typeof atualizarPerfilAcesso === 'function') atualizarPerfilAcesso();
    entrarApp();
    updStatus('offline');
    mostrarToast('Modo offline ativado.', 'info');
}

function entrarApp() {
    const loginArea = document.getElementById('loginArea');
    const appArea = document.getElementById('appArea');

    ocultarTelaSessaoExpirada(false);
    if (loginArea) loginArea.style.display = 'none';
    if (appArea) appArea.style.display = 'block';

    renderUsuarioCabecalho();
    if (typeof atualizarPerfilAcesso === 'function') atualizarPerfilAcesso();
    renderTudo();
}

function sair() {
    limparSessaoGoogle();
    localStorage.removeItem(AUTH_MODE_KEY);
    location.reload();
}

function updStatus(s) {
    const b = document.getElementById('syncBadge');
    const t = document.getElementById('syncText');
    if (!b || !t) return;

    if (s === 'online') {
        b.className = 'sync-badge sync-online';
        t.innerText = 'Online';
        return;
    }

    if (s === 'saving') {
        b.className = 'sync-badge sync-saving';
        t.innerText = 'Salvando...';
        return;
    }

    b.className = 'sync-badge sync-offline';
    t.innerText = 'Offline';
}

function tentarRevalidacaoSilenciosa() {
    const token = localStorage.getItem('gToken');
    if (!token) return false;

    const ultimo = obterUltimoUsuarioGoogle();
    const emailBase = ultimo?.email || localStorage.getItem('usuarioEmail') || '';
    if (!emailGooglePermitido(emailBase)) {
        limparSessaoGoogle();
        localStorage.removeItem(AUTH_MODE_KEY);
        atualizarStatusLogin('Este e-mail não está liberado para login Google neste sistema.', 'error');
        return false;
    }

    if (!sessaoGoogleExpirada()) {
        localStorage.setItem(AUTH_MODE_KEY, 'google');
        entrarApp();
        sincronizar('carregar');
        return true;
    }

    limparSessaoGoogle();
    localStorage.removeItem(AUTH_MODE_KEY);

    if (!navigator.onLine) {
        mostrarTelaSessaoExpirada();
        atualizarStatusLogin('Sessão expirada. Conecte a internet ou continue offline.', 'warn');
        return false;
    }

    mostrarTelaSessaoExpirada();
    atualizarStatusLogin('Sessão expirada. Clique em "Reativar com Google" para continuar.', 'warn');
    return false;
}

function inicializarSessaoLogin() {
    registrarEventosRedeLogin();
    alternarBotoesLogin(false);
    ocultarTelaSessaoExpirada(true);
    renderAcessoRapidoLogin();
    renderUsuarioCabecalho();
    if (typeof atualizarPerfilAcesso === 'function') atualizarPerfilAcesso();

    if (!navigator.onLine) {
        atualizarStatusLogin('Sem internet. Você pode continuar offline.', 'warn');
    } else {
        atualizarStatusLogin('Pronto para entrar.', 'info');
    }

    if (window.google?.accounts?.oauth2) gisLoaded();

    if (!localStorage.getItem('gToken')) return;
    tentarRevalidacaoSilenciosa();
}
