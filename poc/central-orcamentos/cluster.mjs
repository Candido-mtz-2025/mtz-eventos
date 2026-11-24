// Mesmo padrao da POC PostgreSQL local anterior; nenhum banco instalado e acessado.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { initdb, pg_ctl } from '@embedded-postgres/windows-x64';
const root = path.dirname(fileURLToPath(import.meta.url));
function run(binary, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
        child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
        child.once('error', reject); child.once('exit', code => {
            child.stdout.destroy(); child.stderr.destroy();
            code === 0 ? resolve(output) : reject(Error(path.basename(binary) + ': ' + output));
        });
    });
}
export async function startCluster() {
    const base = path.join(root, '.local-data'), directory = path.resolve(base, 'run-' + randomUUID());
    if (!directory.startsWith(base + path.sep)) throw Error('UNSAFE_CLUSTER_PATH');
    await mkdir(directory, { recursive: true }); const data = path.join(directory, 'database');
    const password = randomBytes(32).toString('hex'), passwordFile = path.join(directory, 'bootstrap-password');
    await writeFile(passwordFile, password, { mode: 0o600 });
    await run(initdb, ['-D', data, '-U', 'poc_bootstrap', '--pwfile=' + passwordFile, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--locale=C']);
    const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port; await new Promise(r => probe.close(r)); let started = false;
    const stop = async () => { if (started) { await run(pg_ctl, ['-D', data, '-m', 'fast', '-w', 'stop']); started = false; } };
    try {
        await run(pg_ctl, ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c fsync=on -c synchronous_commit=on -c full_page_writes=on`, '-w', 'start']);
        started = true; return { directory, adminUrl: `postgresql://poc_bootstrap:${password}@127.0.0.1:${port}/postgres`, stop };
    } catch (e) { await stop(); throw e; }
}
