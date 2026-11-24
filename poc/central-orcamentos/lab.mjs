import http from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { startCluster } from './cluster.mjs';
import { bootstrap, ids } from './fixture.mjs';
import { createVerifier } from './auth.mjs';
import { createService } from './service.mjs';
import { createHttpServer } from './http.mjs';
export const listen = async (server, port = 0) => { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return 'http://127.0.0.1:' + server.address().port; };
const close = server => server ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
export async function createLab({ hooks = {}, httpHooks = {}, port = 0 } = {}) {
    let cluster, db, api, issuerServer;
    const stop = async () => { await close(api); await close(issuerServer); if (db) { await db.pool.end(); await db.owner.end(); } if (cluster) await cluster.stop(); };
    try {
        const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
        const jwk = { ...await exportJWK(publicKey), kid: 'local-synthetic', alg: 'RS256', use: 'sig' };
        issuerServer = http.createServer((req, res) => {
            if (req.url !== '/jwks') return res.writeHead(404).end();
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
        });
        const issuer = await listen(issuerServer), audience = 'central-orcamentos-synthetic';
        cluster = await startCluster(); db = await bootstrap(cluster.adminUrl, issuer);
        const verify = createVerifier({ issuer, audience, jwksUrl: issuer + '/jwks' });
        const tokenFor = (name, claims = {}, options = {}) => new SignJWT(claims)
            .setProtectedHeader({ alg: 'RS256', kid: 'local-synthetic', typ: 'at+jwt' })
            .setIssuer(options.issuer || issuer).setAudience(options.audience || audience).setSubject('synthetic-' + name)
            .setIssuedAt(options.iat ?? Math.floor(Date.now() / 1000)).setExpirationTime(options.exp ?? '9m').sign(options.key || privateKey);
        const server = () => createHttpServer({ service: createService(db.pool, { hooks }), verify, hooks: httpHooks });
        api = server(); let base = await listen(api, port);
        return { db, cluster, ids, tokenFor, get base() { return base; }, stop,
            async restartHttp() { await close(api); api = server(); base = await listen(api, port); return base; } };
    } catch (e) { await stop(); throw e; }
}
