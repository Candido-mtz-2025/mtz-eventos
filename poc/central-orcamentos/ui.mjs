import { selecionarEntradasComerciaisFormulario } from '/assets/js/core/proposal-command-kernels.mjs';
const online = Boolean(document.querySelector('meta[name="mtz-central"][content="online-homologacao-v1"]'));
if (online ? location.protocol !== 'https:' : location.hostname !== '127.0.0.1') throw Error('HOST_NAO_AUTORIZADO');
const main = document.getElementById('appArea'); main.style.display = 'block'; main.inert = true;
document.getElementById('loginArea').style.display = 'none';
const tab = document.getElementById('tab-propostas');
const bar = document.createElement('div'); bar.className = 'card-header';
bar.innerHTML = '<strong id="centralIdentidade">Prova local sintetica</strong> <button type="button" id="centralAtualizar" class="btn btn-sm">Atualizar lista</button> <button type="button" id="centralRecuperar" class="btn btn-sm">Recuperar salvamento</button> <output id="centralEstado" role="status">Autenticando...</output>';
tab.prepend(bar);
const state = document.getElementById('centralEstado'), say = value => { state.textContent = value; };
let refreshing;
async function request(url, options = {}, retry = true) {
    const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json();
    if (online && response.status === 401 && retry && !url.startsWith('/api/auth/')) {
        if (!refreshing) refreshing = request('/api/auth/refresh', { method: 'POST' }, false).finally(() => { refreshing = null; });
        if ((await refreshing).ok) return request(url, options, false);
    }
    if (!response.ok) return { ...result, status: response.status }; return result;
}
async function loginOnline() {
    const area = document.getElementById('loginArea'); main.style.display = 'none'; area.style.display = 'flex';
    area.innerHTML = '<div class="login-box"><div class="login-brand"><img src="/logo.png" alt="MTZ Eventos"><h1>MTZ Eventos</h1></div><h2>Homologacao</h2><form id="centralLogin"><label for="centralEmail">E-mail</label><input id="centralEmail" type="email" autocomplete="username" required><label for="centralPassword">Senha</label><input id="centralPassword" type="password" autocomplete="current-password" required><button type="submit" class="btn btn-primary">Entrar</button><output id="centralLoginEstado" role="status"></output></form></div>';
    await new Promise(resolve => {
        document.getElementById('centralLogin').onsubmit = async event => {
            event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
            try {
                const result = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: document.getElementById('centralEmail').value, password: document.getElementById('centralPassword').value }) });
                document.getElementById('centralPassword').value = '';
                if (!result.ok) throw Error('Acesso nao autorizado.');
                resolve();
            } catch { document.getElementById('centralLoginEstado').textContent = 'Acesso nao autorizado ou servico indisponivel.'; }
            finally { button.disabled = false; }
        };
    });
    area.style.display = 'none'; main.style.display = 'block';
}
try {
    if (!online && location.hash) {
        const token = location.hash.slice(1); history.replaceState(null, '', location.pathname);
        const result = await request('/api/session', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
        if (!result.ok) throw Error(result.codigo);
    }
    if (online && location.hash) history.replaceState(null, '', location.pathname);
    let me = await request('/api/me');
    if (online && me.status === 401) { await loginOnline(); me = await request('/api/me'); }
    if (!me.usuario || me.empresas.length !== 1) throw Error('SESSAO_LOCAL_NAO_AUTORIZADA');
    const company = me.empresas[0], base = '/api/companies/' + company.id;
    document.getElementById('centralIdentidade').textContent = company.name + ' | Usuario ' + me.usuario.slice(0, 8);
    if (company.policy !== 'mtz-gerencial-v2-20:1') throw Error('POLITICA_EMPRESA_NAO_SUPORTADA: nenhum calculo MTZ foi aplicado.');
    const script = src => new Promise((resolve, reject) => { const el = document.createElement('script'); el.src = src; el.onload = resolve; el.onerror = reject; document.head.append(el); });
    const runtime = await request('/central-config.json');
    await script('/assets/js/core/state.js');
    const boundary = window.__instalarFronteiraEscrita(() => false); boundary.selar();
    window.validarPermissao = p => company.permissions.includes(p);
    window.validarAcessoAba = id => ['dashboard', 'propostas'].includes(id);
    window.obterUsuarioAtual = () => ({ nome: (online ? 'Usuario autenticado ' : 'Usuario sintetico ') + me.usuario.slice(0, 8) });
    const modules = online ? runtime.modules.filter(src => !['/assets/js/core/state.js', '/assets/js/ui/pwa.js'].includes(src))
        : ['/assets/js/core/utils.js', '/assets/js/ui/toast.js', '/assets/js/core/storage.js', '/assets/js/core/app.js', '/assets/js/modules/relatorios.js', '/assets/js/modules/propostas.js'];
    for (const src of modules) await script(src);
    const canReadApp = online && company.permissions.includes('ler_aplicativo');
    window.validarPermissao = p => company.permissions.includes(p) || canReadApp && p.startsWith('visualizar_');
    window.temPermissao = window.validarPermissao;
    window.validarAcessoAba = id => canReadApp || ['dashboard', 'propostas'].includes(id);
    const readOnlyControls = () => {
        if (!online) return;
        for (const panel of document.querySelectorAll('.tab-content:not(#tab-propostas)'))
            for (const el of panel.querySelectorAll('input,select,textarea,button')) el.disabled = true;
        for (const el of document.querySelectorAll('#appMainSidebar [data-tab]')) { el.disabled = !window.validarAcessoAba(el.dataset.tab); el.hidden = false; }
        const badge = document.getElementById('headerUserRole'); if (badge) badge.textContent = 'Homologacao';
        const sync = document.getElementById('syncText'); if (sync) sync.textContent = 'Homologacao central';
    };
    if (online) {
        window.aplicarPermissoesInterface = readOnlyControls;
        window.atualizarPerfilAcesso = readOnlyControls;
        window.sincronizar = () => { throw Error('SINCRONIZACAO_LEGADA_BLOQUEADA'); };
    }
    if (navigator.serviceWorker && (navigator.serviceWorker.controller || (await navigator.serviceWorker.getRegistrations()).length)) throw Error('ORIGEM_COM_SERVICE_WORKER_ANTERIOR');
    let current = null, draftId = null, draftRevision = null, busy = false, form;
    const pendingKey = 'central-pendente:' + me.usuario + ':' + company.id;
    const ref = id => `proposta:${encodeURIComponent(JSON.stringify([typeof id, id]))}`;
    const buttons = enabled => { for (const el of document.querySelectorAll('[data-action="salvarProposta"]')) el.disabled = !enabled || busy; };
    async function refresh() {
        const result = await request(base + '/state');
        if (!result.ok) { buttons(false); throw Error(result.codigo); }
        const root = JSON.parse(result.snapshotTexto);
        if (!boundary.publicarConfirmado(root)) throw Error('PUBLICACAO_RECUSADA');
        current = { root, revision: result.revisao };
        if (draftRevision === null && draftId === null) draftRevision = current.revision;
        if (online) { window.renderTudo(); readOnlyControls(); } else window.renderPropostas();
        buttons(true); return current;
    }
    async function finish(result, pending) {
        if (result.ok && ['COMMIT_CONFIRMADO', 'OPERACAO_JA_CONCLUIDA'].includes(result.codigo) && result.recibo?.operacaoId === pending.operacaoId) {
            await refresh();
            const data = JSON.parse(pending.dadosTexto);
            const found = current.root.propostas.filter(p => Object.hasOwn(data, 'id') ? Object.is(p.id, data.id) : ref(p.id) === data.propostaReferencia);
            if (found.length !== 1) throw Error('IDENTIDADE_CONFIRMADA_DIVERGENTE');
            sessionStorage.removeItem(pendingKey); form.abrir(found[0].id); say('Salvo com sucesso. Commit SQL confirmado.'); return;
        }
        if (result.codigo === 'CONFLITO_REVISAO') sessionStorage.removeItem(pendingKey);
        say(result.codigo === 'CONFLITO_REVISAO' ? 'Conflito de revisao. Atualize a lista e reabra o registro; seus campos nao foram gravados.'
            : 'Nao confirmado: ' + result.codigo + '. Use Recuperar salvamento.');
    }
    async function save() {
        if (busy || !current) return; busy = true; buttons(false);
        try {
            if (sessionStorage.getItem(pendingKey)) throw Error('RECUPERE_A_OPERACAO_ANTERIOR');
            const collected = form.coletar(), dto = selecionarEntradasComerciaisFormulario(collected.proposta, collected.contexto, collected.indices);
            const dados = { ...(draftId === null ? { id: 'orcamento-' + crypto.randomUUID() } : { propostaReferencia: ref(draftId) }), ...dto };
            const pending = { operacaoId: 'central:' + crypto.randomUUID(), tipo: draftId === null ? 'proposta.criar.v1' : 'proposta.editar.v1',
                revisaoEsperada: draftRevision, dadosTexto: JSON.stringify(dados) };
            sessionStorage.setItem(pendingKey, JSON.stringify(pending));
            await finish(await request(base + '/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending) }), pending);
        } catch (e) { say('Nao confirmado: ' + e.message + '. Os campos foram preservados.'); }
        finally { busy = false; buttons(true); }
    }
    form = window.__instalarOrcamentosHomologacao({ aoNovo: () => { draftId = null; draftRevision = current?.revision ?? null; },
        aoAbrir: id => { draftId = id; draftRevision = current?.revision ?? null; }, salvar: save });
    form.iniciar(); if (!online) await script('/assets/js/ui/eventos.js');
    inicializarTemaSistema(); inicializarSidebarLayout(); inicializarNavegacaoPrincipal(); atualizarMedidasTopoApp();
    abrirTab('propostas', { semRolagem: true });
    for (const b of document.querySelectorAll('[data-menu-item][data-tab], #appMainSidebar [data-tab]')) if (!window.validarAcessoAba(b.dataset.tab)) b.disabled = true;
    for (const b of document.querySelectorAll('header [data-action]')) if (!['toggleSidebarMobile', 'toggleTheme', 'selecionarTema'].includes(b.dataset.action)) b.disabled = true;
    const blocked = new Set(['salvarConfigOrcamento', 'salvarConfigPropostas', 'salvarAnexoProposta', 'removerAnexoProposta', 'editarAnexoProposta', 'alterarStatusPropostaRapido', 'duplicarProposta', 'criarNovaRevisaoProposta', 'excluirProposta', 'converterPropostaEmLocacaoFechada', 'confirmarPerfilFiscalEmpresa', 'salvarValorKmFretePadraoProposta', 'aplicarConfigOrcamentoProposta', 'restaurarPadroesConfigOrcamentoProposta', 'salvarEditorCategoriaConfigOrcamento']);
    document.getElementById('propStatus').disabled = true;
    for (const b of tab.querySelectorAll('[data-action]')) if (blocked.has(b.dataset.action)) b.disabled = true;
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-action]'); if (!b) return;
        if (online && b.closest('#appMainSidebar') && b.dataset.tab) {
            e.preventDefault(); e.stopImmediatePropagation(); abrirTab(b.dataset.tab, { semRolagem: true }); readOnlyControls(); return;
        }
        if (online && b.closest('.tab-content:not(#tab-propostas)')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (blocked.has(b.dataset.action)) { e.preventDefault(); e.stopImmediatePropagation(); say('Operacao fora do escopo.'); }
        if (b.dataset.action === 'editarProposta' || b.dataset.action === 'gerarPDFProposta') {
            e.preventDefault(); e.stopImmediatePropagation();
            const found = current.root.propostas.filter(p => ref(p.id) === b.dataset.arg);
            if (found.length === 1) { form.abrir(found[0].id); if (b.dataset.action === 'gerarPDFProposta') gerarPDFPropostaAtualCliente(); }
        }
    }, true);
    document.getElementById('centralAtualizar').onclick = async () => { try { await refresh(); say('Lista atualizada; edicao em curso nao foi rebaseada.'); } catch (e) { say(e.message); } };
    document.getElementById('centralRecuperar').onclick = async () => {
        try {
            const pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
            if (!pending) { say('Nenhuma operacao pendente.'); return; }
            const result = await request(base + '/receipts/' + pending.operacaoId);
            if (result.status === 404) { sessionStorage.removeItem(pendingKey); say('Operacao nao encontrada; nenhuma confirmacao. Rascunho preservado.'); return; }
            await finish(result, pending);
        } catch (e) { say('Recuperacao bloqueada: ' + e.message); }
    };
    window.addEventListener('resize', () => { atualizarMedidasTopoApp(); atualizarControleSidebar(); });
    if (online) {
        const logout = document.createElement('button'); logout.type = 'button'; logout.className = 'btn btn-sm'; logout.textContent = 'Sair';
        logout.onclick = async () => { await request('/api/auth/logout', { method: 'POST' }); location.reload(); }; bar.append(logout);
    }
    await refresh(); say('Base central SQL confirmada. Somente dados ficticios.'); main.inert = false;
    for (const src of ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js']) script(src).catch(() => {});
} catch (e) { say('Acesso bloqueado: ' + e.message); }
