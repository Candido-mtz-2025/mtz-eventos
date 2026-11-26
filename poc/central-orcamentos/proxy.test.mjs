import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadOnlineConfig } from './online-config.mjs';
import { createHttpServer } from './http.mjs';
import { testCertificate, trustedFetch } from './tls-test-helper.mjs';
const host = 'mtz-proxy-test.onrender.com', origin = 'https://' + host;
const env = { APP_ENV: 'homologation', DEPLOYMENT_TARGET: 'render', RENDER: 'true', RENDER_SERVICE_TYPE: 'web',
    RENDER_EXTERNAL_URL: origin, RENDER_EXTERNAL_HOSTNAME: host, PORT: '10000',
    SUPABASE_URL: 'https://project.supabase.co', SUPABASE_AUDIENCE: 'authenticated', SUPABASE_JWT_ALGORITHMS: 'ES256',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_proxy_fixture', DATABASE_URL: 'postgresql://orc_app:fixture@db.example.invalid/postgres' };
const close = server => new Promise(resolve => server.close(resolve));
const send = (port, { path = '/central-config.json', method = 'GET', headers = {}, data, rawHeaders } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: rawHeaders || { Host: host, ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    }); req.on('error', reject); if (data) req.write(JSON.stringify(data)); req.end();
});
test('Proxy Render: somente origem fixa de infraestrutura, sem confiar em forwarded', async t => {
    const results = [], servers = [], logs = [];
    t.after(async () => { for (const server of servers.reverse()) await close(server);
        const out = new URL('./reports/proxy/', import.meta.url); await mkdir(out, { recursive: true });
        await writeFile(new URL('resultado.json', out), JSON.stringify({ externalRender: false, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }, null, 2)); });
    const check = (name, fn) => t.test(name, async () => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); throw e; } });
    await check('Modo explicito exige Render web real declarado e origem nativa coerente', () => {
        const config = loadOnlineConfig(env); assert.equal(config.renderEdge, true); assert.equal(config.origin, origin);
        assert.equal(config.port, 10000); assert.equal(config.database.ssl.rejectUnauthorized, true);
        assert.equal(config.trustedProxy('127.0.0.1'), false);
        for (const patch of [{ DEPLOYMENT_TARGET: 'desconhecido' }, { RENDER: '' }, { RENDER_SERVICE_TYPE: 'pserv' }, { RENDER_EXTERNAL_URL: '' },
            { RENDER_EXTERNAL_URL: 'http://' + host }, { RENDER_EXTERNAL_URL: origin + '/subpath' }, { RENDER_EXTERNAL_URL: origin + '?x=1' },
            { RENDER_EXTERNAL_URL: 'https://u:p@' + host }, { RENDER_EXTERNAL_URL: origin + ':444' }, { RENDER_EXTERNAL_HOSTNAME: 'other.onrender.com' },
            { RENDER_EXTERNAL_HOSTNAME: 'fake.onrender.com.evil.invalid', RENDER_EXTERNAL_URL: 'https://fake.onrender.com.evil.invalid' },
            { PUBLIC_ORIGIN: 'https://attacker.invalid' }, { PORT: '' }, { TRUSTED_PROXY_CIDRS: '0.0.0.0/0' }, { TRUSTED_PROXY_CIDRS: '10.0.0.0/8' },
            { TLS_CERT_FILE: 'certificate.pem', TLS_KEY_FILE: 'key.pem' }]) assert.throws(() => loadOnlineConfig({ ...env, ...patch }), JSON.stringify(patch));
        assert.throws(() => loadOnlineConfig({ ...env, DEPLOYMENT_TARGET: 'direct', PUBLIC_ORIGIN: origin }));
    });
    const keys = await generateKeyPair('ES256'), issuer = 'https://issuer.example.invalid/auth/v1';
    const issue = () => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', typ: 'JWT' }).setSubject('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
        .setIssuer(issuer).setAudience('authenticated').setIssuedAt().setJti(randomUUID()).setExpirationTime('5m').sign(keys.privateKey);
    const verify = async token => {
        const { payload } = await jwtVerify(token, keys.publicKey, { issuer, audience: 'authenticated', algorithms: ['ES256'], typ: 'JWT' });
        return { issuer: payload.iss, subject: payload.sub };
    };
    const sessions = { user: verify, login: async () => ({ accessToken: await issue(), refreshToken: 'synthetic-refresh', expiresIn: 300 }), logout: async token => { await verify(token); } };
    const service = { me: async identity => ({ usuario: identity.subject, empresas: [{ id: '11111111-1111-4111-8111-111111111111' }] }) };
    const start = async config => { const server = createHttpServer({ config, service, sessions, verify, logger: entry => logs.push(entry) });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server); return server.address().port; };
    const config = loadOnlineConfig(env), port = await start(config);
    await check('HTTP interno permitido apenas no modo Render; headers nao mudam a origem', async () => {
        for (const headers of [{}, { 'X-Forwarded-Proto': 'https' }, { 'X-Forwarded-Proto': 'http', 'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-For': '1.2.3.4' },
            { 'X-Forwarded-Proto': 'http, https', Forwarded: 'for=evil;host=attacker.invalid;proto=http' }]) {
            const r = await send(port, { headers }); assert.equal(r.status, 200); assert.match(r.headers['strict-transport-security'], /max-age/);
            assert.match(r.headers['cache-control'], /no-store/); assert.equal(r.headers.location, undefined);
        }
    });
    await check('Host/Origin falsos, POST sem Origin e pedidos ambiguos recusados', async () => {
        assert.equal((await send(port, { headers: { Host: 'attacker.invalid', 'X-Forwarded-Host': host, 'X-Forwarded-Proto': 'https' } })).status, 403);
        assert.equal((await send(port, { headers: { Origin: 'https://attacker.invalid', 'X-Forwarded-Host': host } })).status, 403);
        assert.equal((await send(port, { path: '/api/auth/login', method: 'POST', data: {}, headers: { 'X-Forwarded-Proto': 'https' } })).status, 403);
        assert.equal((await send(port, { path: '/api/auth/login', method: 'POST', data: {}, headers: { Origin: 'null' } })).status, 403);
        for (const path of ['https://attacker.invalid/central-config.json', '//attacker.invalid/central-config.json', '/\\attacker.invalid']) assert.equal((await send(port, { path })).status, 400);
        assert.equal((await send(port, { rawHeaders: ['Host', host, 'Host', 'attacker.invalid'] })).status, 400);
    });
    await check('Headers nao habilitam HTTP fora do Render; proxy explicito anterior continua restrito', async () => {
        const untrusted = await start({ mode: 'online', origin, trustedProxy: () => false });
        assert.equal((await send(untrusted, { headers: { RENDER: 'true', DEPLOYMENT_TARGET: 'render', 'X-Forwarded-Proto': 'https' } })).status, 403);
        const directConfig = loadOnlineConfig({ ...env, DEPLOYMENT_TARGET: 'direct', PUBLIC_ORIGIN: origin, TRUSTED_PROXY_CIDRS: '127.0.0.1/32' });
        assert.equal(directConfig.renderEdge, false);
        const trusted = await start(directConfig);
        assert.equal((await send(trusted)).status, 403);
        assert.equal((await send(trusted, { headers: { 'X-Forwarded-Proto': 'https' } })).status, 200);
        assert.equal((await send(trusted, { headers: { 'X-Forwarded-Proto': 'https,http' } })).status, 403);
    });
    await check('TLS na borda e HTTP interno mantem login, cookies Secure, CSRF e logout', async () => {
        const cert = await testCertificate(), edge = https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
            const forwarded = http.request({ hostname: '127.0.0.1', port, method: req.method, path: req.url,
                headers: { ...req.headers, host } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
            forwarded.on('error', () => res.destroy()); req.pipe(forwarded);
        });
        await new Promise(resolve => edge.listen(0, '127.0.0.1', resolve)); servers.push(edge);
        const fetchTLS = trustedFetch(cert.cert), base = 'https://127.0.0.1:' + edge.address().port;
        const r = await fetchTLS(base + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'http', 'X-Forwarded-Host': 'attacker.invalid' }, body: JSON.stringify({ email: 'alice@example.invalid', password: 'synthetic-password-123' }) });
        assert.equal(r.status, 200); const cookies = r.headers.get('set-cookie');
        assert.match(cookies, /__Host-central_session=/); assert.match(cookies, /HttpOnly; Secure; SameSite=Strict; Path=\//);
        const cookie = cookies.match(/__Host-central_session=[A-Za-z0-9_.-]+/)[0];
        assert.equal((await send(port, { path: '/api/me', headers: { Cookie: cookie } })).status, 200);
        assert.equal((await send(port, { path: '/api/auth/logout', method: 'POST', headers: { Origin: 'https://attacker.invalid', Cookie: cookie } })).status, 403);
        const ended = await send(port, { path: '/api/auth/logout', method: 'POST', headers: { Origin: origin, Cookie: cookie } });
        assert.equal(ended.status, 200); assert.match(ended.headers['set-cookie'].join(';'), /Secure; SameSite=Strict; Path=\/; Max-Age=0/);
        assert.equal((await send(port, { path: '/api/me', headers: { Cookie: cookie } })).status, 401);
    });
    await check('X-Forwarded-For nao burla limites nem entra nos logs', async () => {
        const limitedPort = await start({ ...config, limits: { login: 1 } });
        const first = await send(limitedPort, { path: '/api/auth/login', method: 'POST', data: {}, headers: { Origin: origin, 'X-Forwarded-For': '1.1.1.1' } });
        assert.equal(first.status, 200);
        const second = await send(limitedPort, { path: '/api/auth/login', method: 'POST', data: {}, headers: { Origin: origin, 'X-Forwarded-For': '2.2.2.2' } });
        assert.equal(second.status, 429);
        assert.ok(logs.every(e => Object.keys(e).sort().join('|') === 'elapsedMs|method|requestId|status'));
        assert.doesNotMatch(JSON.stringify(logs), /password|attacker|Bearer|1\.1\.1\.1|eyJ/);
    });
});
