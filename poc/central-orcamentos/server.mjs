import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadOnlineConfig, createHostedPool } from './online-config.mjs';
import { createSupabaseVerifier, createSupabaseSessions } from './auth.mjs';
import { createService } from './service.mjs';
import { createHttpServer } from './http.mjs';
export async function startOnline(env) {
    const config = loadOnlineConfig(env), pool = await createHostedPool(config);
    try {
        const verify = createSupabaseVerifier(config), sessions = createSupabaseSessions({ url: config.supabaseUrl, publishableKey: config.publishableKey, verify });
        const tls = config.tlsCertFile ? { cert: await readFile(config.tlsCertFile), key: await readFile(config.tlsKeyFile) } : null;
        const server = createHttpServer({ service: createService(pool), verify, sessions, config, tls,
            logger: entry => process.stdout.write(JSON.stringify(entry) + '\n') });
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '0.0.0.0', resolve); });
        return { server, stop: async () => { await new Promise(r => server.close(r)); await pool.end(); } };
    } catch (e) { await pool.end(); throw e; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const app = await startOnline(process.env); console.log('Homologacao online configurada. Somente dois comandos habilitados.');
        process.once('SIGINT', app.stop); process.once('SIGTERM', app.stop);
    } catch { console.error('INICIALIZACAO_RECUSADA: confira configuracao, TLS, role e schema.'); process.exitCode = 1; }
}
