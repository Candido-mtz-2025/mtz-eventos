export async function loginOnline({ request, main }) {
    const area = document.getElementById('loginArea'); main.style.display = 'none'; area.style.display = 'flex';
    const params = new URLSearchParams(location.search), callback = location.pathname === '/auth/confirm';
    const logoutWarning = params.get('logout') === 'unconfirmed';
    let link = callback && !location.hash && [...params.keys()].every(k => ['token_hash', 'type'].includes(k))
        && params.getAll('token_hash').length === 1 && params.getAll('type').length === 1
        && ['invite', 'recovery'].includes(params.get('type')) ? { tokenHash: params.get('token_hash'), type: params.get('type') } : null;
    history.replaceState(null, '', callback ? '/auth/confirm' : '/');
    area.innerHTML = '<div class="login-box"><div class="login-brand"><img src="/logo.png" alt="MTZ Eventos"><h1>MTZ Eventos</h1></div><h2>Homologacao</h2><div id="centralAuthView"></div></div>';
    const view = document.getElementById('centralAuthView');
    const post = (path, data) => request('/api/auth/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await new Promise(resolve => {
        const showLogin = (notice = '') => {
            view.innerHTML = '<form id="centralLogin"><label for="centralEmail">E-mail</label><input id="centralEmail" type="email" autocomplete="username" required maxlength="254"><label for="centralPassword">Senha</label><input id="centralPassword" type="password" autocomplete="current-password" required maxlength="1024"><button type="submit" class="btn btn-primary">Entrar</button><button type="button" id="centralForgot" class="btn">Esqueci minha senha</button><output id="centralLoginEstado" role="status"></output></form>';
            const status = document.getElementById('centralLoginEstado'); status.textContent = notice;
            document.getElementById('centralForgot').onclick = showRecovery;
            document.getElementById('centralLogin').onsubmit = async event => {
                event.preventDefault(); const button = event.target.querySelector('[type=submit]'), input = document.getElementById('centralPassword'); button.disabled = true;
                document.getElementById('centralForgot').disabled = true;
                try {
                    const result = await post('login', { email: document.getElementById('centralEmail').value, password: document.getElementById('centralPassword').value });
                    if (!result.ok) throw Error();
                    history.replaceState(null, '', '/'); resolve();
                } catch { status.textContent = 'Acesso nao autorizado ou servico indisponivel.'; }
                finally { input.value = ''; button.disabled = false; const forgot = document.getElementById('centralForgot'); if (forgot) forgot.disabled = false; }
            };
        };
        const showRecovery = () => {
            view.innerHTML = '<h3>Recuperar senha</h3><form id="centralRecovery"><label for="centralRecoveryEmail">E-mail</label><input id="centralRecoveryEmail" type="email" autocomplete="email" required maxlength="254"><button type="submit" class="btn btn-primary">Solicitar recuperacao</button><button type="button" id="centralBackLogin" class="btn">Voltar ao login</button><output id="centralRecoveryEstado" role="status"></output></form>';
            document.getElementById('centralBackLogin').onclick = () => showLogin();
            document.getElementById('centralRecovery').onsubmit = async event => {
                event.preventDefault(); const button = event.target.querySelector('[type=submit]'); button.disabled = true;
                try {
                    const result = await post('recover', { email: document.getElementById('centralRecoveryEmail').value });
                    document.getElementById('centralRecoveryEstado').textContent = result.ok ? 'Se houver uma conta elegivel, voce recebera um link. Confira seu e-mail.' : 'Solicitacao indisponivel. Aguarde e tente novamente.';
                } catch { document.getElementById('centralRecoveryEstado').textContent = 'Servico indisponivel. Tente novamente mais tarde.'; }
                finally { button.disabled = false; }
            };
        };
        const showPassword = () => {
            view.innerHTML = '<h3>Definir senha</h3><form id="centralSetPassword"><label for="centralNewPassword">Nova senha (minimo 12 caracteres)</label><input id="centralNewPassword" type="password" autocomplete="new-password" minlength="12" maxlength="1024" required><label for="centralConfirmPassword">Confirmar senha</label><input id="centralConfirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="1024" required><button type="submit" class="btn btn-primary">Salvar senha</button><output id="centralPasswordEstado" role="status"></output></form>';
            document.getElementById('centralSetPassword').onsubmit = async event => {
                event.preventDefault(); const button = event.target.querySelector('button'), password = document.getElementById('centralNewPassword'), confirm = document.getElementById('centralConfirmPassword'), status = document.getElementById('centralPasswordEstado');
                if (password.value !== confirm.value) { status.textContent = 'As senhas devem ser iguais.'; return; }
                button.disabled = true;
                try {
                    const result = await post('password', { password: password.value });
                    if (!result.ok) { status.textContent = 'Senha recusada ou link expirado. Verifique a senha; se necessario, solicite outro link.'; return; }
                    showLogin(result.sessionRevocationConfirmed ? 'Senha salva. Entre com sua nova senha.' : 'Senha salva, mas o encerramento das sessoes no provedor nao foi confirmado. Contate o administrador antes de continuar.');
                } catch { status.textContent = 'Resultado nao confirmado. Tente entrar com a nova senha antes de repetir a operacao.'; }
                finally { password.value = ''; confirm.value = ''; button.disabled = false; }
            };
        };
        if (!callback) { showLogin(logoutWarning ? 'Sessao local encerrada, mas o logout no provedor nao foi confirmado. Contate o administrador.' : ''); return; }
        if (!link) { showLogin('Link invalido ou antigo. Solicite um novo link apos a configuracao da hospedagem.'); return; }
        view.innerHTML = '<h3>Confirmar acesso</h3><p>Continue para definir sua senha de homologacao.</p><button id="centralVerifyLink" type="button" class="btn btn-primary">Continuar</button><output id="centralLinkEstado" role="status"></output>';
        document.getElementById('centralVerifyLink').onclick = async event => {
            event.target.disabled = true;
            try {
                const result = await post('verify-link', link); link = null;
                if (!result.ok) { showLogin('Link invalido, ja utilizado ou expirado. Solicite um novo link.'); return; }
                showPassword();
            } catch { link = null; showLogin('Confirmacao indisponivel. O link pode ter sido utilizado; solicite outro se necessario.'); }
        };
    });
    area.style.display = 'none'; main.style.display = 'block';
}
