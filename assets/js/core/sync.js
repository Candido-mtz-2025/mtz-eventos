// Configuração de autenticação e status de sincronização
const GOOGLE_CLIENT_ID = '981345912804-uim8kctqnts15kt6l8odhif3hil6udek.apps.googleusercontent.com';
const API_URL = 'https://script.google.com/macros/s/AKfycbxZoCyJZrG2WZfIuPA3Iyz6d-PIdnzFi-Ejnl3gAUB-l9mGnBJt0BpyBErzMI_GFuZuhA/exec';
const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');
const GOOGLE_SESSION_TTL_MS = 55 * 60 * 1000;
const LAST_GOOGLE_USER_KEY = 'mtzLastGoogleUser';

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
    const btnRapido = document.getElementById('btnAcessoRapidoGoogle');

    if (btnGoogle) btnGoogle.disabled = !!desativado;
    if (btnOffline) btnOffline.disabled = !!desativado;
    if (btnRapido) btnRapido.disabled = !!desativado;
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

        if (origem === 'acesso_rapido') {
            atualizarStatusLogin('Acesso rápido não concluído. Tente "Entrar com Google".', 'warn');
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
    atualizarUltimoUsuarioGoogle(resp.access_token);
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
    const mensagem = origem === 'acesso_rapido'
        ? 'Reconectando com o último usuário...'
        : 'Abrindo autenticação Google...';
    atualizarStatusLogin(mensagem, 'info');

    tokenClient.callback = (resp) => {
        alternarBotoesLogin(false);
        processarRespostaGoogle(resp, origem);
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
    solicitarTokenGoogle('consent', 'login');
}

function entrarComUltimoUsuarioGoogle() {
    const ultimo = obterUltimoUsuarioGoogle();
    if (!ultimo) {
        atualizarStatusLogin('Nenhum usuário salvo para acesso rápido. Entre com Google primeiro.', 'warn');
        return;
    }

    solicitarTokenGoogle('', 'acesso_rapido');
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
    renderAcessoRapidoLogin();

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
