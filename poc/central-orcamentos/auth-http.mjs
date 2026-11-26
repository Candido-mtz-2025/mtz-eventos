import { randomBytes, createHash } from 'node:crypto';
import { decodeJwt } from 'jose';
import { fail } from './service.mjs';
const key = token => createHash('sha256').update(token).digest('hex');
export function createAuthHttp({ sessions, verify, service, now = Date.now }) {
    const flows = new Map(), revoked = new Map(), accessName = '__Host-central_session', refreshName = '__Host-central_refresh', flowName = '__Host-central_password';
    const prune = () => {
        for (const [id, value] of flows) if (value.until <= now()) flows.delete(id);
        for (const [id, until] of revoked) if (until <= now()) revoked.delete(id);
    };
    const revoke = async token => {
        if (!token) return;
        try { await verify(token); revoked.set(key(token), decodeJwt(token).exp * 1000); } catch { /* Cookie invalido nao impede logout. */ }
    };
    const authorize = async token => {
        prune();
        if (typeof token !== 'string' || revoked.has(key(token))) fail(401, 'SESSAO_ENCERRADA');
        return sessions.user(token);
    };
    const clear = name => `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
    const cookie = (name, value, age) => `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
    const sessionCookies = result => [cookie(accessName, result.accessToken, Math.floor(result.expiresIn)), cookie(refreshName, result.refreshToken, 86400)];
    return { authorize, async handle({ route, method, body, getCookie, limited, ip, res, json, limits }) {
        if (method !== 'POST' || !route.startsWith('/api/auth/')) return false;
        prune();
        const path = route.slice('/api/auth/'.length);
        if (path === 'login' || path === 'refresh') {
            limited(ip + ':' + path, path === 'login' ? limits?.login || 5 : 20);
            const result = path === 'login' ? await sessions.login(await body()) : await sessions.refresh(getCookie(refreshName));
            const identity = await authorize(result.accessToken), me = await service.me(identity);
            if (!me.empresas?.length) fail(403, 'SEM_VINCULO_AUTORIZADO');
            res.setHeader('Set-Cookie', sessionCookies(result)); json(200, { ok: true }); return true;
        }
        if (path === 'recover') {
            limited(ip + ':recover', 3);
            const data = await body();
            if (!data || Object.keys(data).join('|') !== 'email') fail(400, 'EMAIL_INVALIDO');
            await sessions.recover(data.email); json(200, { ok: true }); return true;
        }
        if (path === 'verify-link') {
            limited(ip + ':link', 5);
            if (flows.size >= 1000) fail(429, 'LIMITE_DE_REQUISICOES');
            const result = await sessions.verifyLink(await body());
            flows.delete(getCookie(flowName));
            const id = randomBytes(32).toString('base64url');
            flows.set(id, { token: result.accessToken, until: now() + 600000, busy: false });
            res.setHeader('Set-Cookie', [cookie(flowName, id, 600), clear(accessName), clear(refreshName)]);
            json(200, { ok: true }); return true;
        }
        if (path === 'password') {
            limited(ip + ':password', 5);
            const id = getCookie(flowName), flow = flows.get(id);
            if (!flow || flow.busy) fail(401, 'LINK_INVALIDO_OU_EXPIRADO');
            const data = await body();
            if (!data || Object.keys(data).join('|') !== 'password') fail(400, 'SENHA_INVALIDA');
            flow.busy = true;
            try {
                await authorize(flow.token); await sessions.setPassword(flow.token, data.password);
                flows.delete(id); await revoke(flow.token);
                res.setHeader('Set-Cookie', [clear(flowName), clear(accessName), clear(refreshName)]);
                let sessionRevocationConfirmed = true;
                try { await sessions.logout(flow.token, 'global'); } catch { sessionRevocationConfirmed = false; }
                json(200, { ok: true, sessionRevocationConfirmed }); return true;
            } finally { flow.busy = false; }
        }
        if (path === 'logout') {
            const token = getCookie(accessName), flow = flows.get(getCookie(flowName));
            flows.delete(getCookie(flowName));
            await revoke(token); if (flow) await revoke(flow.token);
            res.setHeader('Set-Cookie', [clear(accessName), clear(refreshName), clear(flowName)]);
            if (token) await sessions.logout(token);
            if (flow) await sessions.logout(flow.token);
            json(200, { ok: true }); return true;
        }
        return false;
    } };
}
