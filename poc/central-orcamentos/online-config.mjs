import { BlockList, isIP } from 'node:net';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
const invalid = () => { throw Error('CONFIGURACAO_HOMOLOGACAO_INVALIDA'); };
export function postgresConfig(connectionString, ca) {
    let url; try { url = new URL(connectionString); } catch { invalid(); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || !url.pathname.slice(1)
        || [...url.searchParams.keys()].some(k => /ssl|options/i.test(k))) invalid();
    return { connectionString, ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
        max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000 };
}
export function loadOnlineConfig(env) {
    if (env.APP_ENV !== 'homologation') invalid();
    const target = env.DEPLOYMENT_TARGET || 'direct', renderEdge = target === 'render';
    if (!['direct', 'render'].includes(target)) invalid();
    let renderOrigin;
    if (renderEdge) {
        let external;
        try { external = new URL(env.RENDER_EXTERNAL_URL); } catch { invalid(); }
        if (env.RENDER !== 'true' || env.RENDER_SERVICE_TYPE !== 'web' || !env.PORT
            || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.onrender\.com$/.test(env.RENDER_EXTERNAL_HOSTNAME || '')
            || external.protocol !== 'https:' || external.hostname !== env.RENDER_EXTERNAL_HOSTNAME || external.port
            || external.username || external.password || external.pathname !== '/' || external.search || external.hash
            || env.TLS_CERT_FILE || env.TLS_KEY_FILE || env.TRUSTED_PROXY_CIDRS?.trim()) invalid();
        renderOrigin = external.origin;
    }
    let origin, supabase;
    try { origin = new URL(env.PUBLIC_ORIGIN || renderOrigin); supabase = new URL(env.SUPABASE_URL); } catch { invalid(); }
    for (const u of [origin, supabase]) if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username || u.password
        || isIP(u.hostname) || u.hostname === 'localhost' || u.hostname.endsWith('.github.io')) invalid();
    if (renderEdge && origin.origin !== renderOrigin) invalid();
    const algorithms = (env.SUPABASE_JWT_ALGORITHMS || '').split(',').map(x => x.trim());
    if (!algorithms.length || algorithms.some(a => !['RS256', 'ES256'].includes(a)) || !env.SUPABASE_AUDIENCE
        || !env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) invalid();
    const database = postgresConfig(env.DATABASE_URL);
    if (!/^orc_app(?:\.[a-z0-9-]+)?$/.test(decodeURIComponent(new URL(env.DATABASE_URL).username))) invalid();
    const port = Number(env.PORT || 3000); if (!Number.isSafeInteger(port) || port < 1 || port > 65535) invalid();
    const cidrs = (env.TRUSTED_PROXY_CIDRS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (Boolean(env.TLS_CERT_FILE) !== Boolean(env.TLS_KEY_FILE) || (!renderEdge && !env.TLS_CERT_FILE && !cidrs.length)) invalid();
    const proxies = new BlockList();
    for (const cidr of cidrs) {
        const [address, prefix] = cidr.split('/'), family = isIP(address);
        if (!family || !/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)) invalid();
        proxies.addSubnet(address, Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
    }
    const issuer = supabase.origin + '/auth/v1';
    return Object.freeze({ mode: 'online', renderEdge, origin: origin.origin, supabaseUrl: supabase.origin, issuer,
        jwksUrl: issuer + '/.well-known/jwks.json', audience: env.SUPABASE_AUDIENCE, algorithms,
        publishableKey: env.SUPABASE_PUBLISHABLE_KEY, database, port,
        caFile: env.PG_CA_FILE || null, tlsCertFile: env.TLS_CERT_FILE || null, tlsKeyFile: env.TLS_KEY_FILE || null,
        trustedProxy: address => { const ip = (address || '').replace(/^::ffff:/, ''); const family = isIP(ip); return !!family && proxies.check(ip, family === 4 ? 'ipv4' : 'ipv6'); } });
}
export async function createHostedPool(config) {
    const pool = new pg.Pool({ ...config.database,
        ssl: { ...config.database.ssl, ...(config.caFile ? { ca: await readFile(config.caFile, 'utf8') } : {}) } });
    pool.on('error', () => {});
    try {
        const role = (await pool.query('SELECT current_user AS name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
        if (role?.name !== 'orc_app' || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole) throw Error('PRIVILEGIOS_OPERACIONAIS_INVALIDOS');
        const marker = (await pool.query("SELECT obj_description('orc'::regnamespace,'pg_namespace') AS marker")).rows[0].marker;
        if (marker !== 'mtz-homologation-synthetic-only-v1') throw Error('SCHEMA_HOMOLOGACAO_NAO_PREPARADO');
        return pool;
    } catch { await pool.end(); throw Error('CONEXAO_SEGURA_OU_SCHEMA_NAO_CONFIRMADO'); }
}
