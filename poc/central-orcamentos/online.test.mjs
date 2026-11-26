import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import { generateKeyPair, exportJWK, SignJWT, decodeJwt } from 'jose';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createLab, listen } from './lab.mjs';
import { createSupabaseVerifier, createSupabaseSessions } from './auth.mjs';
import { loadOnlineConfig, postgresConfig, createHostedPool } from './online-config.mjs';
import { createService } from './service.mjs';
import { createHttpServer } from './http.mjs';
import { testCertificate, trustedFetch } from './tls-test-helper.mjs';
import { exportLogicalBackup, restoreLogicalBackup } from './backup.mjs';
import { startCluster } from './cluster.mjs';
import { canonical, ids, dto } from './fixture.mjs';
import { seedHostedDemo } from './admin.mjs';
const close = server => server ? new Promise(r => server.close(r)) : Promise.resolve();
test('Adaptacoes online em laboratorio HTTPS/TLS local, sem Supabase externo', { timeout: 240000 }, async t => {
    const results = [], cert = await testCertificate(), fetchTLS = trustedFetch(cert.cert), logs = [];
    await mkdir(new URL('./reports/online/', import.meta.url), { recursive: true });
    const lab = await createLab(); let provider, api, runtimePool, secureAdmin, restoreCluster, restorePool, browser;
    t.after(async () => {
        if (browser) await browser.close(); await close(api); await close(provider);
        if (runtimePool) await runtimePool.end(); if (secureAdmin) await secureAdmin.end(); if (restorePool) await restorePool.end();
        if (restoreCluster) await restoreCluster.stop(); await lab.stop();
        await mkdir(new URL('./reports/online/', import.meta.url), { recursive: true });
        await writeFile(new URL('./reports/online/resultado.json', import.meta.url), JSON.stringify({ provider: 'HTTPS fixture compatible with Supabase JWT; not external Supabase', passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }, null, 2));
    });
    const check = async (name, fn) => t.test(name, async () => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); throw e; } });
    const rsa = await generateKeyPair('RS256'), ec = await generateKeyPair('ES256'); let issuer, base;
    const token = async (name = 'alice', claims = {}, header = {}, options = {}) => new SignJWT({ role: 'authenticated', is_anonymous: false, ...claims })
        .setJti(randomBytes(16).toString('hex'))
        .setProtectedHeader({ alg: 'RS256', kid: 'rsa', typ: 'JWT', ...header })
        .setIssuer(options.issuer || issuer).setAudience(options.audience || 'authenticated').setSubject(ids[name])
        .setIssuedAt(options.iat ?? Math.floor(Date.now() / 1000)).setExpirationTime(options.exp ?? '5m').sign(options.key || (header.alg === 'ES256' ? ec.privateKey : rsa.privateKey));
    const publicKeys = [{ ...await exportJWK(rsa.publicKey), kid: 'rsa', alg: 'RS256' }, { ...await exportJWK(ec.publicKey), kid: 'ec', alg: 'ES256' }];
    provider = https.createServer({ key: cert.key, cert: cert.cert }, async (req, res) => {
        if (req.url === '/auth/v1/.well-known/jwks.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: publicKeys }));
        if (req.url.startsWith('/auth/v1/logout?scope=')) return res.writeHead(204).end();
        if (req.url === '/auth/v1/user' && req.method === 'GET') {
            try { return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: decodeJwt(req.headers.authorization.slice(7)).sub })); }
            catch { return res.writeHead(401).end('{}'); }
        }
        let text = ''; for await (const c of req) text += c;
        const data = JSON.parse(text || '{}'), name = data.email?.split('@')[0] || data.refresh_token?.replace('refresh-', '');
        if (!ids[name] || req.headers.apikey !== 'sb_publishable_local_fixture' || data.password && data.password !== 'Synthetic-local-only-123!') return res.writeHead(401, { 'Content-Type': 'application/json' }).end('{}');
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ access_token: await token(name), refresh_token: 'refresh-' + name, expires_in: 300 }));
    });
    const providerBase = (await listen(provider)).replace('http:', 'https:'); issuer = providerBase + '/auth/v1';
    const verify = createSupabaseVerifier({ issuer, audience: 'authenticated', jwksUrl: issuer + '/.well-known/jwks.json', algorithms: ['RS256', 'ES256'], fetcher: fetchTLS });
    for (const name of ['alice', 'bob', 'carol', 'bea', 'viewer', 'denied', 'revoked']) await lab.db.owner.query('UPDATE orc.users SET issuer=$1,subject=$2 WHERE id=$2', [issuer, ids[name]]);
    await lab.db.owner.query("UPDATE orc.members SET permissions=array_append(permissions,'ler_aplicativo') WHERE tenant_id=$1 AND active", [ids.A]);
    await check('Configuracao fail-closed, sem Pages, chaves simetricas ou SSL inseguro', async () => {
        const env = { APP_ENV: 'homologation', PUBLIC_ORIGIN: 'https://hml.example.invalid', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_AUDIENCE: 'authenticated', SUPABASE_JWT_ALGORITHMS: 'ES256', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', DATABASE_URL: 'postgresql://orc_app:fixture@db.example.invalid/postgres', TRUSTED_PROXY_CIDRS: '127.0.0.1/32' };
        assert.equal(loadOnlineConfig(env).database.ssl.rejectUnauthorized, true);
        for (const patch of [{ APP_ENV: 'production' }, { PUBLIC_ORIGIN: 'https://owner.github.io' }, { SUPABASE_JWT_ALGORITHMS: 'HS256' }, { TRUSTED_PROXY_CIDRS: '' }, { DATABASE_URL: env.DATABASE_URL + '?sslmode=no-verify' }, { DATABASE_URL: env.DATABASE_URL.replace('orc_app', 'postgres') }]) assert.throws(() => loadOnlineConfig({ ...env, ...patch }));
        const serverSource = await readFile(new URL('./server.mjs', import.meta.url), 'utf8');
        assert.doesNotMatch(serverSource, /fixture|startCluster|generateKeyPair|prepararImportacao/);
    });
    await check('JWT RS256/ES256 validos; assinatura, issuer, audience, expiracao e typ invalidos recusados', async () => {
        assert.equal((await verify(await token())).subject, ids.alice);
        assert.equal((await verify(await token('alice', {}, { alg: 'ES256', kid: 'ec' }))).subject, ids.alice);
        for (const bad of [await token('alice', {}, {}, { issuer: 'https://attacker.invalid/auth/v1' }), await token('alice', {}, {}, { audience: 'outro' }), await token('alice', {}, {}, { iat: 1, exp: 2 }), await token('alice', {}, { typ: 'at+jwt' }), await token('alice', { role: 'service_role' }), await token('alice', { is_anonymous: true })]) await assert.rejects(verify(bad), /NAO_AUTENTICADO/);
        const parts = (await token()).split('.'); parts[1] = Buffer.from(JSON.stringify({ sub: ids.bob })).toString('base64url'); await assert.rejects(verify(parts.join('.')), /NAO_AUTENTICADO/);
        const untrusted = createSupabaseVerifier({ issuer, audience: 'authenticated', jwksUrl: issuer + '/.well-known/jwks.json', algorithms: ['RS256'] });
        await assert.rejects(untrusted(await token()), /NAO_AUTENTICADO/);
    });
    await check('PostgreSQL TLS real: CA valida conecta e CA invalida recusa', async () => {
        for (const [name, value] of [['ssl', 'on'], ['ssl_cert_file', cert.certFile], ['ssl_key_file', cert.keyFile]]) {
            const sql = (await lab.db.owner.query('SELECT format(\'ALTER SYSTEM SET %I = %L\',$1::text,$2::text) AS sql', [name, value])).rows[0].sql; await lab.db.owner.query(sql);
        }
        await lab.db.owner.query('SELECT pg_reload_conf()'); await new Promise(r => setTimeout(r, 200));
        runtimePool = await createHostedPool({ database: postgresConfig(lab.db.pool.options.connectionString, cert.cert.toString()) });
        assert.equal((await runtimePool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl, true);
        const wrong = await testCertificate(), invalid = new pg.Pool(postgresConfig(lab.db.pool.options.connectionString, wrong.cert.toString()));
        try { await assert.rejects(invalid.query('SELECT 1')); } finally { await invalid.end(); }
        secureAdmin = new pg.Pool(postgresConfig(lab.db.owner.options.connectionString, cert.cert.toString()));
        await assert.rejects(createHostedPool({ database: postgresConfig(lab.db.owner.options.connectionString, cert.cert.toString()) }), /CONEXAO_SEGURA/);
    });
    if (!runtimePool || !secureAdmin) throw Error('TLS deve passar antes de prosseguir');
    const sessions = createSupabaseSessions({ url: providerBase, publishableKey: 'sb_publishable_local_fixture', verify, fetcher: fetchTLS });
    const config = { mode: 'online', origin: 'https://127.0.0.1:1', trustedProxy: () => false, limits: { login: 50 } };
    api = createHttpServer({ service: createService(runtimePool), verify, sessions, config, tls: { key: cert.key, cert: cert.cert }, logger: e => logs.push(e) });
    base = (await listen(api)).replace('http:', 'https:'); config.origin = base;
    const request = async (method, route, body, authorization, cookie, origin = base) => {
        const r = await fetchTLS(base + route, { method, headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(authorization ? { Authorization: 'Bearer ' + authorization } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie') };
    };
    await check('Login/refresh HTTPS com cookies Secure HttpOnly; sem emissor sintetico online', async () => {
        const r = await request('POST', '/api/auth/login', { email: 'alice@example.invalid', password: 'Synthetic-local-only-123!' }); assert.equal(r.status, 200);
        assert.match(r.cookie, /__Host-central_session=/); assert.match(r.cookie, /Secure/); assert.match(r.cookie, /HttpOnly/);
        const refreshed = await request('POST', '/api/auth/refresh', undefined, undefined, '__Host-central_refresh=refresh-alice'); assert.equal(refreshed.status, 200);
        assert.equal((await request('POST', '/api/session', undefined, await token())).status, 404);
        assert.equal((await request('POST', '/api/auth/login', { email: 'alice@example.invalid', password: 'errada' })).status, 401);
        assert.equal((await request('POST', '/api/auth/logout', undefined, undefined, '__Host-central_session=' + await token())).status, 200);
    });
    await check('Acesso cruzado, revogacao e claims de permissoes continuam verificados no banco', async () => {
        assert.equal((await request('GET', '/api/companies/' + ids.B + '/state', undefined, await token())).status, 403);
        assert.equal((await request('GET', '/api/companies/' + ids.A + '/state', undefined, await token('denied', { permissions: ['ler_propostas'], tenant_id: ids.A }))).status, 403);
        assert.equal((await request('GET', '/api/companies/' + ids.A + '/state', undefined, await token('revoked'))).status, 403);
        const signed = await token('carol');
        await secureAdmin.query('UPDATE orc.members SET active=false WHERE user_id=$1', [ids.carol]);
        assert.equal((await request('GET', '/api/companies/' + ids.A + '/state', undefined, signed)).status, 403);
        await secureAdmin.query('UPDATE orc.members SET active=true WHERE user_id=$1', [ids.carol]);
    });
    await check('Transacao hospedavel usa os mesmos comandos e recupera recibo sem duplicacao', async () => {
        const body = { operacaoId: 'online:create', tipo: 'proposta.criar.v1', revisaoEsperada: 0, dadosTexto: canonical(dto('online-1')) };
        const a = await request('POST', '/api/companies/' + ids.A + '/commands', body, await token()); assert.equal(a.status, 200, JSON.stringify(a.body));
        const repeat = await request('POST', '/api/companies/' + ids.A + '/commands', body, await token()); assert.equal(repeat.body.codigo, 'OPERACAO_JA_CONCLUIDA');
        const recovered = await request('GET', '/api/companies/' + ids.A + '/receipts/online:create', undefined, await token()); assert.deepEqual(recovered.body, a.body);
        const stale = await request('POST', '/api/companies/' + ids.A + '/commands', { ...body, operacaoId: 'online:stale', dadosTexto: canonical(dto('outro')) }, await token('bob')); assert.equal(stale.body.codigo, 'CONFLITO_REVISAO');
        assert.equal(JSON.parse(a.body.snapshotTexto).propostas[0].controleInterno.fechamentoGerencial.lucroPrevisto, 4016);
        for (const name of ['alice', 'bob', 'carol']) assert.equal((await request('GET', '/api/companies/' + ids.A + '/state', undefined, await token(name))).body.revisao, 1);
        assert.equal((await request('POST', '/api/companies/' + ids.A + '/commands', { ...body, tipo: 'cliente.criar.v1' }, await token())).status, 400);
    });
    await check('Falha transacional com TLS nao deixa estado, journal ou recibo parcial', async () => {
        const service = createService(runtimePool, { hooks: { afterJournal: () => { throw Error('FALHA_SINTETICA'); } } });
        const identity = await verify(await token()), before = await service.read(identity, ids.A);
        await assert.rejects(service.execute(identity, ids.A, { operacaoId: 'online:rollback', tipo: 'proposta.criar.v1', revisaoEsperada: 1, dadosTexto: canonical(dto('rollback')) }), /FALHA_SINTETICA/);
        assert.deepEqual(await service.read(identity, ids.A), before);
        assert.equal((await secureAdmin.query("SELECT 1 FROM orc.journal WHERE operation_id='online:rollback' UNION ALL SELECT 1 FROM orc.receipts WHERE operation_id='online:rollback'")).rowCount, 0);
    });
    await check('HTTP e X-Forwarded-Proto de origem nao confiavel sao recusados', async () => {
        const plainConfig = { mode: 'online', origin: 'https://example.invalid', trustedProxy: () => false };
        const plain = createHttpServer({ service: {}, verify, config: plainConfig });
        const address = await listen(plain);
        try {
            const status = await new Promise((resolve, reject) => {
                const req = http.get(address + '/central-config.json', { headers: { Host: 'example.invalid', 'X-Forwarded-Proto': 'https' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject);
            });
            assert.equal(status, 403);
        } finally { await close(plain); }
    });
    await check('Host/Origin/limites e logs nao expoem credenciais, tokens ou dados do pedido', async () => {
        config.limits.login = 5;
        assert.equal((await request('POST', '/api/auth/login', {}, undefined, undefined, 'https://attacker.invalid')).status, 403);
        for (let i = 0; i < 7; i++) await request('POST', '/api/auth/login', { email: 'x@example.invalid', password: 'erro' });
        assert.equal((await request('POST', '/api/auth/login', { email: 'x@example.invalid', password: 'erro' })).status, 429);
        assert.ok(logs.every(e => Object.keys(e).sort().join('|') === 'elapsedMs|method|requestId|status'));
        assert.doesNotMatch(JSON.stringify(logs), /password|Bearer|refresh-|example.invalid|eyJ|postgresql/);
        config.limits.login = 50;
        assert.equal((await request('POST', '/api/companies/' + ids.A + '/commands', { data: 'x'.repeat(256001) }, await token())).status, 413);
    });
    await check('Backup logico criptografado e restauracao atomica em cluster isolado', async () => {
        const key = randomBytes(32).toString('base64'), backup = await exportLogicalBackup(secureAdmin, key);
        assert.doesNotMatch(backup.archive, /Cliente ficticio|snapshot_text|synthetic-alice/);
        restoreCluster = await startCluster(); restorePool = new pg.Pool({ connectionString: restoreCluster.adminUrl, max: 2 });
        await restorePool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
        await assert.rejects(restoreLogicalBackup(restorePool, backup.archive, randomBytes(32).toString('base64')));
        const tampered = JSON.parse(backup.archive); tampered.sha256 = 'falso'; await assert.rejects(restoreLogicalBackup(restorePool, JSON.stringify(tampered), key));
        assert.deepEqual((await restoreLogicalBackup(restorePool, backup.archive, key)).counts, backup.counts);
        for (const table of ['state', 'journal', 'receipts', 'audit', 'companies', 'users', 'members']) {
            const a = (await secureAdmin.query('SELECT row_to_json(t) AS row FROM orc.' + table + ' t')).rows.map(r => canonical(r.row)).sort();
            const b = (await restorePool.query('SELECT row_to_json(t) AS row FROM orc.' + table + ' t')).rows.map(r => canonical(r.row)).sort(); assert.deepEqual(b, a);
        }
        const password = randomBytes(32).toString('hex');
        await restorePool.query((await restorePool.query("SELECT format('ALTER ROLE orc_app LOGIN PASSWORD %L',$1::text) AS sql", [password])).rows[0].sql);
        const target = new URL(restoreCluster.adminUrl); target.username = 'orc_app'; target.password = password;
        const restoredRuntime = new pg.Pool({ connectionString: target.href, max: 1 });
        try {
            const identity = await verify(await token());
            assert.deepEqual(await createService(restoredRuntime).read(identity, ids.A), await createService(runtimePool).read(identity, ids.A));
        } finally { await restoredRuntime.end(); }
        await assert.rejects(restoreLogicalBackup(restorePool, backup.archive, key), /DESTINO_DEVE_ESTAR_VAZIO/);
        await writeFile(new URL('./reports/online/backup-summary.json', import.meta.url), JSON.stringify({ sha256: backup.sha256, counts: backup.counts, restoreEqual: true }));
    });
    await check('Seed administrativo e explicito e nao sobrescreve base existente', async () => {
        await assert.rejects(seedHostedDemo(secureAdmin, issuer, [ids.alice, ids.bob, ids.carol].map(subject => ({ subject }))), /DEMO_EXIGE_BASE_VAZIA/);
    });
    await check('Aplicativo completo HTTPS preserva 17 abas, leitura e salvar central', async () => {
        const require = createRequire(import.meta.url), { chromium } = require(process.env.MTZ_PLAYWRIGHT || 'playwright');
        browser = await chromium.launch({ headless: true, executablePath: process.env.MTZ_CHROME });
        const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' }), errors = [];
        const p = await context.newPage(); p.on('pageerror', e => errors.push(e.stack));
        await context.route('https://cdnjs.cloudflare.com/**', route => route.abort());
        await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
        await context.route('**/central-ui.mjs', async route => {
            const source = await readFile(new URL('./ui.mjs', import.meta.url), 'utf8');
            await route.fulfill({ contentType: 'text/javascript', body: source.replace("} catch (e) { say('Acesso bloqueado: ' + e.message); }", "} catch (e) { window.__testFailure = e.stack; say('Acesso bloqueado: ' + e.message); }") });
        });
        await p.goto(base); await p.fill('#centralEmail', 'bob@example.invalid'); await p.fill('#centralPassword', 'Synthetic-local-only-123!');
        await p.click('#centralLogin button');
        await p.waitForFunction(() => /Base central SQL confirmada|Acesso bloqueado/.test(document.getElementById('centralEstado').textContent)).catch(async e => { throw Error(e.message + ': ' + await p.locator('#centralLoginEstado').textContent().catch(() => '') + JSON.stringify(errors)); });
        assert.match(await p.locator('#centralEstado').innerText(), /Base central SQL confirmada/, await p.evaluate(() => window.__testFailure));
        const tabs = await p.evaluate(() => [...new Set([...document.querySelectorAll('[data-menu-item][data-tab], .tab-btn[data-tab]')].map(e => e.dataset.tab))]); assert.equal(tabs.length, 17);
        for (const id of tabs) { await p.evaluate(id => abrirTab(id, { semRolagem: true }), id); assert.ok(await p.locator('#tab-' + id).isVisible(), id); await p.waitForTimeout(30); }
        assert.equal(await p.evaluate(() => __permitirEscritaLegada()), false); assert.equal(await p.evaluate(() => localStorage.getItem('mtzBackup')), null);
        assert.deepEqual(await p.evaluate(() => indexedDB.databases()), []); assert.deepEqual(errors, []);
        assert.equal(await p.locator('#tab-locadores input').first().isDisabled(), true);
        const r = await p.request.get(base + '/central-config.json'); const text = await r.text(); assert.doesNotMatch(text, /DATABASE_URL|publishable|PASSWORD|SECRET|private/);
        assert.equal((await p.request.get(base + '/schema.sql')).status(), 404);
        await p.evaluate(() => abrirTab('propostas', { semRolagem: true }));
        await p.fill('#propClienteNome', 'Cliente ficticio HTTPS'); await p.fill('#propClienteTelefone', '00000000');
        await p.click('#propostaFormTabEvento'); await p.fill('#propEventoNome', 'Evento sintetico HTTPS'); await p.fill('#propDataEvento', '2026-12-15');
        await p.click('#propostaFormTabItens'); await p.click('#propBtnAdicionarItem');
        await p.fill('.prop-item-descricao', 'Estrutura propria sintetica'); await p.fill('.prop-item-unitario', '1000');
        const saveUI = async () => {
            await p.evaluate(() => document.activeElement?.blur()); await p.locator('[data-action="salvarProposta"]:visible').first().click();
            await p.waitForFunction(() => /Salvo com sucesso|Nao confirmado|Conflito de revisao/.test(document.getElementById('centralEstado').textContent));
            assert.match(await p.locator('#centralEstado').innerText(), /Salvo com sucesso/);
        };
        await saveUI(); await p.reload();
        await p.waitForFunction(() => /Base central SQL confirmada/.test(document.getElementById('centralEstado').textContent));
        await p.click('#propostasSubtabLista');
        await p.locator('[data-action="editarProposta"]:visible').first().click();
        await p.click('#propostaFormTabComercial'); await p.locator('[data-action="revisarFechamentoGerencialProposta"]').click();
        await p.click('#propostaFormTabEvento'); await p.fill('#propEventoNome', 'Edicao sintetica HTTPS'); await saveUI();
        assert.equal((await secureAdmin.query('SELECT revision FROM orc.state WHERE tenant_id=$1', [ids.A])).rows[0].revision, 3);
        assert.deepEqual(errors, []);
        await p.screenshot({ path: new URL('./reports/online/desktop.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1'), fullPage: false });
        await p.setViewportSize({ width: 390, height: 740 });
        await p.evaluate(() => fecharSidebarMobile()); await p.waitForTimeout(350);
        await p.screenshot({ path: new URL('./reports/online/mobile.png', import.meta.url).pathname.replace(/^\/(.:)/, '$1'), fullPage: false });
        await context.close();
    });
});
