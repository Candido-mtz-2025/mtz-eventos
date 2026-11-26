import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './service.mjs';
import { createAuthHttp } from './auth-http.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const csp = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob:; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
export function createHttpServer({ service, verify, hooks = {}, config = {}, sessions, tls, logger = () => {} }) {
    const online = config.mode === 'online', buckets = new Map();
    const auth = online ? createAuthHttp({ sessions, verify, service, now: config.authClock }) : null;
    const accessName = online ? '__Host-central_session' : 'central_session';
    const limited = (key, max) => {
        const now = Date.now(); let item = buckets.get(key);
        if (!item || item.until < now) { item = { count: 0, until: now + 60000 }; buckets.set(key, item); }
        if (++item.count > max) fail(429, 'LIMITE_DE_REQUISICOES');
        if (buckets.size > 10000) for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
        if (buckets.size > 10000) fail(429, 'LIMITE_DE_REQUISICOES');
    };
    const server = (tls ? https : http).createServer(...(tls ? [tls] : []), async (req, res) => {
        const requestId = randomUUID(), started = Date.now();
        res.once('finish', () => { if (online) logger({ requestId, method: req.method, status: res.statusCode, elapsedMs: Date.now() - started }); });
        const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': csp, 'X-Frame-Options': 'DENY',
            ...(online ? { 'Strict-Transport-Security': 'max-age=15552000', 'X-Request-Id': requestId } : {}) };
        const json = (status, value) => res.writeHead(status, { ...headers, 'Content-Type': 'application/json' }).end(JSON.stringify(value));
        try {
            const origin = online ? config.origin : 'http://127.0.0.1:' + server.address().port, authority = new URL(origin).host;
            if (req.headers.host !== authority) fail(403, 'HOST_RECUSADO');
            if (online && !req.socket.encrypted && !(config.trustedProxy?.(req.socket.remoteAddress) && req.headers['x-forwarded-proto'] === 'https')) fail(403, 'HTTPS_OBRIGATORIO');
            if (req.headers.origin && req.headers.origin !== origin) fail(403, 'ORIGEM_RECUSADA');
            if (online && req.method !== 'GET' && req.headers.origin !== origin) fail(403, 'ORIGEM_OBRIGATORIA');
            if (req.url.startsWith('/api/')) limited(req.socket.remoteAddress + ':api', config.limits?.api || 240);
            const url = new URL(req.url, origin), method = req.method;
            const bearer = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
            const getCookie = name => req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
            const cookie = getCookie(accessName);
            const body = async () => {
                if (!/^application\/json(?:;|$)/.test(req.headers['content-type'] || '')) fail(415, 'JSON_OBRIGATORIO');
                const chunks = []; let length = 0;
                for await (const chunk of req) { length += chunk.length; if (length > 256000) fail(413, 'PEDIDO_EXCESSIVO'); chunks.push(chunk); }
                try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'JSON_INVALIDO'); }
            };
            if (online && await auth.handle({ route: url.pathname, method, body, getCookie, limited, ip: req.socket.remoteAddress, res, json, limits: config.limits })) return;
            if (url.pathname.startsWith('/api/')) {
                const identity = await (online ? auth.authorize(bearer || cookie) : verify(bearer || cookie));
                if (url.pathname === '/api/session' && method === 'POST') {
                    if (online) fail(404, 'ROTA_INEXISTENTE');
                    if (!bearer) fail(401, 'TOKEN_OBRIGATORIO'); await service.me(identity);
                    res.setHeader('Set-Cookie', `central_session=${bearer}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`);
                    return json(200, { ok: true });
                }
                if (url.pathname === '/api/me' && method === 'GET') return json(200, await service.me(identity));
                const route = url.pathname.match(/^\/api\/companies\/([0-9a-f-]{36})\/(state|commands|receipts\/([a-z0-9._:-]{1,160}))$/);
                if (!route || url.search) fail(404, 'ROTA_INEXISTENTE');
                const tenant = route[1];
                if (route[2] === 'state' && method === 'GET') return json(200, await service.read(identity, tenant));
                if (route[3] && method === 'GET') return json(200, await service.recover(identity, tenant, route[3]));
                if (route[2] === 'commands' && method === 'POST') {
                    const request = await body(), result = await service.execute(identity, tenant, request);
                    if (await hooks.dropResponse?.(request.operacaoId)) { res.destroy(); return; }
                    return json(200, result);
                }
                fail(405, 'METODO_RECUSADO');
            }
            if (method !== 'GET') fail(404, 'ROTA_INEXISTENTE');
            let bytes, type;
            if (url.pathname === '/central-config.json') {
                const html = await readFile(path.join(repo, 'index.html'), 'utf8');
                const modules = [...html.matchAll(/<script src="(\.\/assets\/js\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1].slice(1));
                return json(200, { mode: online ? 'online' : 'local', fullApp: online, modules: online ? modules : [] });
            }
            if (url.pathname === '/' || url.pathname === '/index.html' || online && url.pathname === '/auth/confirm') {
                bytes = (await readFile(path.join(repo, 'index.html'), 'utf8'))
                    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<link[^>]*rel="manifest"[^>]*>/gi, '')
                    .replace('</head>', (online ? '<meta name="mtz-central" content="online-homologacao-v1">' : '<meta name="mtz-homologacao" content="orcamentos-sinteticos-v1">') + '</head>')
                    .replace('</body>', '<script type="module" src="/central-ui.mjs"></script></body>');
                type = 'text/html';
            } else if (url.pathname === '/central-ui.mjs') { bytes = await readFile(path.join(here, 'ui.mjs')); type = 'text/javascript'; }
            else if (online && url.pathname === '/central-auth-ui.mjs') { bytes = await readFile(path.join(here, 'auth-ui.mjs')); type = 'text/javascript'; }
            else if (/^\/(assets\/(js\/(core|modules|render|ui)\/[a-z0-9.-]+\.(js|mjs)|css\/[a-z0-9.-]+\.css)|logo\.png)$/.test(url.pathname)) {
                bytes = await readFile(path.join(repo, url.pathname.slice(1)));
                type = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(url.pathname)];
            } else fail(404, 'ROTA_INEXISTENTE');
            res.writeHead(200, { ...headers, 'Content-Type': type + (type.startsWith('text/') ? '; charset=utf-8' : '') }).end(bytes);
        } catch (e) {
            if (!res.destroyed) json(e.status || 503, { ok: false, codigo: e.status ? e.code : 'OPERACAO_NAO_CONFIRMADA' });
        }
    });
    server.requestTimeout = 20000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
    return server;
}
