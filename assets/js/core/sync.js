// Configuração de autenticação e status de sincronização
const GOOGLE_CLIENT_ID = '981345912804-uim8kctqnts15kt6l8odhif3hil6udek.apps.googleusercontent.com';
const API_URL = 'https://script.google.com/macros/s/AKfycbxZoCyJZrG2WZfIuPA3Iyz6d-PIdnzFi-Ejnl3gAUB-l9mGnBJt0BpyBErzMI_GFuZuhA/exec';
const GOOGLE_SESSION_TTL_MS = 55 * 60 * 1000;

let loginEventosRegistrados = false;
let aguardandoSDKGoogle = false;

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
    const btnGoogle = document.getElementById('btnLoginGoogle');
    const btnOffline = document.getElementById('btnEntrarOffline');

    if (btnGoogle) btnGoogle.disabled = !!desativado;
    if (btnOffline) btnOffline.disabled = !!desativado;
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
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: () => {}
    });

    aguardandoSDKGoogle = false;
    if (loginVisivel() && !localStorage.getItem('gToken')) {
        atualizarStatusLogin('Google pronto para login.', 'info');
    }
}

function processarRespostaGoogle(resp, origem = 'login') {
    if (resp?.error) {
        if (resp.error === 'popup_closed_by_user') {
            atualizarStatusLogin('Login cancelado. Quando quiser, tente novamente.', 'warn');
            return;
        }

        if (origem === 'revalidacao') {
            limparSessaoGoogle();
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
    atualizarStatusLogin('Conectado com Google. Carregando seus dados...', 'success');
    entrarApp();
    sincronizar('carregar');
}

function solicitarTokenGoogle(promptValue = 'consent', origem = 'login') {
    if (!navigator.onLine) {
        atualizarStatusLogin('Sem internet. Use o modo offline ou conecte a internet.', 'warn');
        return;
    }

    if (!tokenClient) {
        if (window.google) {
            gisLoaded();
        } else {
            atualizarStatusLogin('Carregando serviço Google. Aguarde alguns segundos.', 'warn');
            return;
        }
    }

    if (!tokenClient) {
        atualizarStatusLogin('Google ainda não está pronto. Tente novamente em instantes.', 'warn');
        return;
    }

    alternarBotoesLogin(true);
    atualizarStatusLogin('Abrindo autenticação Google...', 'info');

    tokenClient.callback = (resp) => {
        alternarBotoesLogin(false);
        processarRespostaGoogle(resp, origem);
    };

    tokenClient.requestAccessToken({ prompt: promptValue });
}

function fazerLoginGoogle() {
    solicitarTokenGoogle('consent', 'login');
}

function entrarOffline() {
    entrarApp();
    updStatus('offline');
    mostrarToast('Modo offline ativado.', 'info');
}

function entrarApp() {
    const loginArea = document.getElementById('loginArea');
    const appArea = document.getElementById('appArea');
    if (loginArea) loginArea.style.display = 'none';
    if (appArea) appArea.style.display = 'block';
    renderTudo();
}

function sair() {
    limparSessaoGoogle();
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
    if (!localStorage.getItem('gToken')) return false;

    if (!sessaoGoogleExpirada()) {
        entrarApp();
        sincronizar('carregar');
        return true;
    }

    if (!navigator.onLine) {
        atualizarStatusLogin('Sessão antiga detectada. Conecte a internet ou continue offline.', 'warn');
        return false;
    }

    atualizarStatusLogin('Atualizando sessão Google...', 'info');
    solicitarTokenGoogle('', 'revalidacao');
    return true;
}

function aguardarSDKGoogle() {
    if (aguardandoSDKGoogle) return;
    aguardandoSDKGoogle = true;

    let tentativas = 0;
    const timer = setInterval(() => {
        tentativas += 1;

        if (window.google?.accounts?.oauth2) {
            clearInterval(timer);
            gisLoaded();
            return;
        }

        if (tentativas > 20) {
            clearInterval(timer);
            aguardandoSDKGoogle = false;
            atualizarStatusLogin('Não foi possível carregar o Google agora. Tente novamente.', 'error');
        }
    }, 500);
}

function inicializarSessaoLogin() {
    registrarEventosRedeLogin();
    alternarBotoesLogin(false);

    if (!navigator.onLine) {
        atualizarStatusLogin('Sem internet. Você pode continuar offline.', 'warn');
    } else {
        atualizarStatusLogin('Pronto para entrar.', 'info');
    }

    if (window.google?.accounts?.oauth2) {
        gisLoaded();
    } else {
        aguardarSDKGoogle();
    }

    if (!localStorage.getItem('gToken')) return;
    tentarRevalidacaoSilenciosa();
}
