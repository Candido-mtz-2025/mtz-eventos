// Configuração de autenticação e status de sincronização
const GOOGLE_CLIENT_ID = '981345912804-uim8kctqnts15kt6l8odhif3hil6udek.apps.googleusercontent.com';
const API_URL = 'https://script.google.com/macros/s/AKfycbxZoCyJZrG2WZfIuPA3Iyz6d-PIdnzFi-Ejnl3gAUB-l9mGnBJt0BpyBErzMI_GFuZuhA/exec';

    // --- AUTENTICAÇÃO E SYNC ---
    function gisLoaded() { tokenClient = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/drive.file', callback: (resp) => { if(resp.error) return alert(JSON.stringify(resp)); localStorage.setItem('gToken', resp.access_token); entrarApp(); sincronizar('carregar'); } }); }
    function fazerLoginGoogle() { if(tokenClient) tokenClient.requestAccessToken({prompt: 'consent'}); else if(window.google) gisLoaded(); }
    function entrarOffline() { entrarApp(); document.getElementById('syncText').innerText="Offline"; document.getElementById('syncBadge').className="sync-badge sync-offline"; }
    function entrarApp() { document.getElementById('loginArea').style.display='none'; document.getElementById('appArea').style.display='block'; renderTudo(); }
    function sair() { localStorage.removeItem('gToken'); location.reload(); }

    function updStatus(s) { const b=document.getElementById('syncBadge'), t=document.getElementById('syncText'); if(s==='online'){b.className="sync-badge sync-online";t.innerText="Online";} else if(s==='saving'){b.className="sync-badge sync-saving";t.innerText="Salvando...";} else {b.className="sync-badge sync-offline";t.innerText="Offline";} }
