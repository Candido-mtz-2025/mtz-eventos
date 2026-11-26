import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createSupabaseVerifier, createSupabaseSessions } from './auth.mjs';
import { createHttpServer } from './http.mjs';
import { testCertificate, trustedFetch } from './tls-test-helper.mjs';
import { genesis, ids, canonical } from './fixture.mjs';
const close = server => server ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
test('Convite e recuperacao por HTTPS local; nenhum usuario ou email real', { timeout: 120000 }, async t => {
    const cert = await testCertificate(), fetchTLS = trustedFetch(cert.cert), keys = await generateKeyPair('ES256');
    let provider, api, browser, issuer, base, clock = Date.now(), logoutFailure = false;
    const results = [], calls = [], tokens = new Map(), links = new Map(), passwords = new Map(), disabled = new Set();
    const password = 'Synthetic-password-123!', callbackOrigin = 'https://homolog.example.invalid';
    const out = new URL('./reports/auth/', import.meta.url); await mkdir(out, { recursive: true });
    t.after(async () => { if (browser) await browser.close(); await close(api); await close(provider);
        await writeFile(new URL('resultado.json', out), JSON.stringify({ externalSupabase: false, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }, null, 2)); });
    const check = (name, fn) => t.test(name, async () => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); throw e; } });
    const issue = async (subject = ids.alice) => {
        const access_token = await new SignJWT({ role: 'authenticated', is_anonymous: false }).setProtectedHeader({ alg: 'ES256', kid: 'test', typ: 'JWT' })
            .setIssuer(issuer).setAudience('authenticated').setSubject(subject).setJti(randomBytes(12).toString('hex')).setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);
        tokens.set(access_token, subject); return { access_token, refresh_token: randomBytes(32).toString('hex'), expires_in: 3600 };
    };
    const newLink = (type, subject = ids.alice) => { const tokenHash = randomBytes(32).toString('hex'); links.set(tokenHash, { type, subject }); return { tokenHash, type }; };
    provider = https.createServer({ key: cert.key, cert: cert.cert }, async (req, res) => {
        const reply = (status, data) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
        if (req.url.endsWith('/.well-known/jwks.json')) return reply(200, { keys: [{ ...await exportJWK(keys.publicKey), kid: 'test', alg: 'ES256' }] });
        if (req.headers.apikey !== 'sb_publishable_auth_fixture') return reply(401, {});
        let body = ''; for await (const chunk of req) body += chunk; const data = JSON.parse(body || '{}');
        const token = req.headers.authorization?.slice(7), subject = tokens.get(token);
        calls.push({ path: req.url, method: req.method });
        if (req.url === '/auth/v1/user' && req.method === 'GET') return reply(subject && !disabled.has(subject) ? 200 : 401, { id: subject });
        if (req.url === '/auth/v1/user' && req.method === 'PUT') { if (!subject) return reply(401, {}); passwords.set(subject, data.password); return reply(200, { id: subject }); }
        // Como no provedor real, o JWT pode continuar valido ate exp mesmo apos logout.
        if (req.url.startsWith('/auth/v1/logout?scope=')) return logoutFailure ? reply(500, {}) : res.writeHead(204).end();
        if (req.url.startsWith('/auth/v1/recover?')) return reply(data.email.startsWith('missing') ? 400 : 200, {});
        if (req.url === '/auth/v1/verify') {
            const link = links.get(data.token_hash); if (!link || link.type !== data.type) return reply(403, {});
            links.delete(data.token_hash); return reply(200, await issue(link.subject));
        }
        if (req.url === '/auth/v1/token?grant_type=password' && data.email === 'alice@example.invalid' && data.password === (passwords.get(ids.alice) || password)) return reply(200, await issue());
        return reply(401, {});
    });
    await new Promise(r => provider.listen(0, '127.0.0.1', r)); issuer = `https://127.0.0.1:${provider.address().port}/auth/v1`;
    const verify = createSupabaseVerifier({ issuer, audience: 'authenticated', jwksUrl: issuer + '/.well-known/jwks.json', algorithms: ['ES256'], fetcher: fetchTLS });
    const sessions = createSupabaseSessions({ url: issuer.replace('/auth/v1', ''), publishableKey: 'sb_publishable_auth_fixture', verify, fetcher: fetchTLS, origin: callbackOrigin });
    const service = { me: async identity => ({ usuario: identity.subject, empresas: identity.subject === ids.alice ? [{ id: ids.A, name: 'Empresa ficticia A', policy: 'mtz-gerencial-v2-20:1', permissions: ['ler_propostas', 'ler_aplicativo', 'criar_proposta', 'editar_proposta'] }] : [] }),
        read: async () => ({ ok: true, revisao: 0, snapshotTexto: canonical(genesis('A')) }) };
    const config = { mode: 'online', origin: callbackOrigin, trustedProxy: () => false, authClock: () => clock, limits: { login: 30 } };
    api = createHttpServer({ service, verify, sessions, config, tls: { key: cert.key, cert: cert.cert } });
    await new Promise(r => api.listen(0, '127.0.0.1', r)); base = `https://127.0.0.1:${api.address().port}`; config.origin = base;
    const request = async (method, path, data, cookie, origin = base) => {
        const r = await fetchTLS(base + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
        return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie') };
    };
    const flowCookie = r => r.cookie.match(/__Host-central_password=[A-Za-z0-9_-]+/)[0];
    await check('GET de convite nao consome token; nenhuma URL externa e seguida', async () => {
        const link = newLink('invite'), before = calls.length;
        const r = await fetchTLS(base + '/auth/confirm?token_hash=' + link.tokenHash + '&type=invite&next=https://attacker.invalid');
        assert.equal(r.status, 200); assert.ok(links.has(link.tokenHash)); assert.equal(calls.length, before);
        assert.match(r.headers.get('referrer-policy'), /no-referrer/); assert.doesNotMatch(await r.text(), new RegExp(link.tokenHash));
    });
    await check('Convite valido emite somente cookie restrito; senha curta e token reutilizado recusados', async () => {
        const link = newLink('invite'), r = await request('POST', '/api/auth/verify-link', link); assert.equal(r.status, 200);
        const cookie = flowCookie(r); assert.match(r.cookie, /HttpOnly; Secure; SameSite=Strict/);
        assert.equal((await request('GET', '/api/me', undefined, cookie)).status, 401);
        assert.equal((await request('POST', '/api/auth/password', { password: 'curta' }, cookie)).status, 400);
        const saved = await request('POST', '/api/auth/password', { password }, cookie);
        assert.equal(saved.status, 200); assert.equal(saved.body.sessionRevocationConfirmed, true);
        assert.equal(passwords.get(ids.alice), password);
        assert.equal((await request('POST', '/api/auth/password', { password }, cookie)).status, 401);
        assert.equal((await request('POST', '/api/auth/verify-link', link)).status, 401);
        assert.equal((await request('GET', '/api/me', undefined, cookie)).status, 401);
    });
    await check('Login apos senha, consulta ao provedor e logout invalidam cookie capturado', async () => {
        const r = await request('POST', '/api/auth/login', { email: 'alice@example.invalid', password }); assert.equal(r.status, 200);
        const cookie = r.cookie.match(/__Host-central_session=[A-Za-z0-9_.-]+/)[0];
        assert.equal((await request('GET', '/api/me', undefined, cookie)).status, 200);
        disabled.add(ids.alice); assert.equal((await request('GET', '/api/me', undefined, cookie)).status, 401); disabled.delete(ids.alice);
        assert.equal((await request('POST', '/api/auth/logout', undefined, cookie)).status, 200);
        assert.equal((await request('GET', '/api/me', undefined, cookie)).status, 401);
        assert.ok(calls.some(c => c.path === '/auth/v1/user' && c.method === 'GET'));
    });
    await check('Recuperacao nao enumera contas e redireciona somente para origem configurada', async () => {
        for (const email of ['alice@example.invalid', 'missing@example.invalid']) assert.deepEqual((await request('POST', '/api/auth/recover', { email })).body, { ok: true });
        assert.ok(calls.filter(c => c.path.startsWith('/auth/v1/recover?')).every(c => new URL(c.path, issuer).searchParams.get('redirect_to') === callbackOrigin + '/auth/confirm'));
        assert.equal((await request('POST', '/api/auth/recover', { email: 'alice@example.invalid', redirectTo: 'https://attacker.invalid' })).status, 400);
        const r = await request('POST', '/api/auth/verify-link', newLink('recovery'));
        assert.equal((await request('POST', '/api/auth/password', { password }, flowCookie(r))).status, 200);
    });
    await check('Link invalido, tipo indevido, expiracao e CSRF recusados', async () => {
        assert.equal((await request('POST', '/api/auth/verify-link', { tokenHash: 'invalido', type: 'signup' })).status, 400);
        const link = newLink('invite'); assert.equal((await request('POST', '/api/auth/verify-link', link, undefined, 'https://attacker.invalid')).status, 403);
        const r = await request('POST', '/api/auth/verify-link', link); assert.equal(r.status, 200);
        clock += 600001; assert.equal((await request('POST', '/api/auth/password', { password }, flowCookie(r))).status, 401);
    });
    // Outro servidor zera apenas limites de teste, nao registros do provedor fixture.
    await close(api); config.limits.login = 30;
    api = createHttpServer({ service, verify, sessions, config, tls: { key: cert.key, cert: cert.cert } });
    await new Promise(r => api.listen(0, '127.0.0.1', r)); base = `https://127.0.0.1:${api.address().port}`; config.origin = base;
    await check('Falha de logout remoto e informada; cookies e JWT local continuam encerrados', async () => {
        const r = await request('POST', '/api/auth/login', { email: 'alice@example.invalid', password });
        const cookie = r.cookie.match(/__Host-central_session=[A-Za-z0-9_.-]+/)[0];
        logoutFailure = true;
        try {
            const ended = await request('POST', '/api/auth/logout', undefined, cookie);
            assert.equal(ended.status, 502); assert.match(ended.cookie, /Max-Age=0/);
            assert.equal((await request('GET', '/api/me', undefined, cookie)).status, 401);
            const flow = await request('POST', '/api/auth/verify-link', newLink('recovery'));
            const saved = await request('POST', '/api/auth/password', { password }, flowCookie(flow));
            assert.deepEqual(saved.body, { ok: true, sessionRevocationConfirmed: false });
            assert.match(saved.cookie, /Max-Age=0/);
        } finally { logoutFailure = false; }
    });
    await check('Interface: convite, confirmacao de senha, login completo, recuperar e sair', async () => {
        const { chromium } = createRequire(import.meta.url)(process.env.MTZ_PLAYWRIGHT || 'playwright');
        browser = await chromium.launch({ headless: true, executablePath: process.env.MTZ_CHROME });
        const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' }), page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await context.route('https://cdnjs.cloudflare.com/**', r => r.abort()); await context.route('https://cdn.jsdelivr.net/**', r => r.abort());
        const link = newLink('invite');
        await page.goto(base + '/auth/confirm?token_hash=' + link.tokenHash + '&type=invite');
        await page.locator('#centralVerifyLink').waitFor({ state: 'visible' });
        assert.equal(new URL(page.url()).search, ''); assert.ok(links.has(link.tokenHash));
        await page.click('#centralVerifyLink'); await page.fill('#centralNewPassword', password); await page.fill('#centralConfirmPassword', password + 'x');
        await page.click('#centralSetPassword button'); assert.match(await page.locator('#centralPasswordEstado').innerText(), /iguais/);
        await page.fill('#centralConfirmPassword', password); await page.click('#centralSetPassword button');
        await page.locator('#centralLogin').waitFor({ state: 'visible' }); assert.match(await page.locator('#centralLoginEstado').innerText(), /Senha salva/);
        await page.click('#centralForgot'); await page.fill('#centralRecoveryEmail', 'alice@example.invalid'); await page.click('#centralRecovery button[type=submit]');
        await page.waitForFunction(() => document.querySelector('#centralRecoveryEstado').textContent.includes('elegivel'));
        await page.click('#centralBackLogin'); await page.fill('#centralEmail', 'alice@example.invalid'); await page.fill('#centralPassword', password); await page.click('#centralLogin button[type=submit]');
        await page.waitForFunction(() => document.querySelector('#centralEstado').textContent.includes('Base central SQL confirmada'));
        assert.equal(await page.evaluate(() => new Set([...document.querySelectorAll('[data-menu-item][data-tab], .tab-btn[data-tab]')].map(e => e.dataset.tab)).size), 17);
        assert.equal(await page.evaluate(() => __permitirEscritaLegada()), false);
        assert.equal(await page.evaluate(() => localStorage.getItem('mtzBackup')), null);
        await page.getByRole('button', { name: 'Sair', exact: true }).filter({ visible: true }).click();
        await page.locator('#centralLogin').waitFor({ state: 'visible' });
        assert.deepEqual((await context.cookies()).filter(c => c.name.startsWith('__Host-central_')), []);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: new URL('login-desktop.png', out).pathname.replace(/^\/(.:)/, '$1') });
        await page.setViewportSize({ width: 390, height: 740 }); await page.screenshot({ path: new URL('login-mobile.png', out).pathname.replace(/^\/(.:)/, '$1') });
        await context.close();
    });
});
