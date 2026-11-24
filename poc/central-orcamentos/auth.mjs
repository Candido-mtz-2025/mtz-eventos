import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';
import { fail } from './service.mjs';
// Emissor local fixado pelo harness, nunca por claims/jku enviados pelo cliente.
export function createVerifier({ issuer, audience, jwksUrl }) {
    for (const value of [issuer, jwksUrl]) {
        const u = new URL(value);
        if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || u.username || u.password) throw Error('EMISSOR_LOCAL_OBRIGATORIO');
    }
    const keys = createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 3000 });
    return async token => {
        try {
            if (typeof token !== 'string' || token.length > 8192) throw Error();
            const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256'], typ: 'at+jwt',
                requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: '10m', clockTolerance: 2 });
            if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 300) throw Error();
            return Object.freeze({ issuer: payload.iss, subject: payload.sub });
        } catch { fail(401, 'NAO_AUTENTICADO'); }
    };
}

// Configuracao exclusiva do servidor. Nao aceita jku, issuer ou algoritmos do pedido.
export function createSupabaseVerifier({ issuer, audience, jwksUrl, algorithms, fetcher }) {
    const iss = new URL(issuer), jwks = new URL(jwksUrl);
    if (iss.protocol !== 'https:' || iss.pathname !== '/auth/v1' || iss.search || iss.hash || iss.username || iss.password
        || jwks.href !== issuer + '/.well-known/jwks.json' || !audience
        || !Array.isArray(algorithms) || !algorithms.length || algorithms.some(a => !['ES256', 'RS256'].includes(a))) throw Error('SUPABASE_AUTH_CONFIG_INVALIDA');
    const keys = createRemoteJWKSet(jwks, { timeoutDuration: 5000, ...(fetcher ? { [customFetch]: fetcher } : {}) });
    return async token => {
        try {
            if (typeof token !== 'string' || token.length > 8192) throw Error();
            const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms, typ: 'JWT',
                requiredClaims: ['sub', 'iat', 'exp'], clockTolerance: 2 });
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)
                || payload.role !== 'authenticated' || payload.is_anonymous === true
                || payload.iat > Math.floor(Date.now() / 1000) + 2 || payload.exp <= payload.iat) throw Error();
            return Object.freeze({ issuer: payload.iss, subject: payload.sub });
        } catch { fail(401, 'NAO_AUTENTICADO'); }
    };
}

export function createSupabaseSessions({ url, publishableKey, fetcher = fetch, verify }) {
    if (new URL(url).protocol !== 'https:' || !publishableKey?.startsWith('sb_publishable_')) throw Error('SUPABASE_LOGIN_CONFIG_INVALIDA');
    const exchange = async (grant, data) => {
        const response = await fetcher(url + '/auth/v1/token?grant_type=' + grant, { method: 'POST', redirect: 'error',
            headers: { apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(8000) });
        if (!response.ok) fail(401, 'LOGIN_RECUSADO');
        const result = await response.json(); await verify(result.access_token);
        if (typeof result.refresh_token !== 'string' || !/^[A-Za-z0-9_.-]{1,512}$/.test(result.refresh_token)
            || !Number.isFinite(result.expires_in) || result.expires_in <= 0) fail(401, 'LOGIN_RECUSADO');
        return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresIn: Math.min(result.expires_in, 3600) };
    };
    return Object.freeze({
        login: data => {
            if (!data || Object.keys(data).sort().join('|') !== 'email|password' || typeof data.email !== 'string'
                || data.email.length > 254 || typeof data.password !== 'string' || data.password.length < 1 || data.password.length > 1024) fail(400, 'LOGIN_INVALIDO');
            return exchange('password', data);
        },
        logout: async accessToken => {
            await verify(accessToken);
            const response = await fetcher(url + '/auth/v1/logout?scope=local', { method: 'POST', redirect: 'error',
                headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(8000) });
            if (!response.ok) fail(502, 'LOGOUT_PROVEDOR_NAO_CONFIRMADO');
        },
        refresh: refreshToken => {
            if (typeof refreshToken !== 'string' || !/^[A-Za-z0-9_.-]{1,512}$/.test(refreshToken)) fail(401, 'SESSAO_EXPIRADA');
            return exchange('refresh_token', { refresh_token: refreshToken });
        }
    });
}
