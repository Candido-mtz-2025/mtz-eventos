import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export async function testCertificate() {
    const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), '.local-data', 'tls-' + randomUUID());
    await mkdir(directory, { recursive: true });
    const keyFile = path.join(directory, 'key.pem'), certFile = path.join(directory, 'cert.pem');
    await promisify(execFile)(process.env.MTZ_TEST_OPENSSL || 'C:/Program Files/Git/usr/bin/openssl.exe',
        ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { windowsHide: true });
    return { directory, keyFile, certFile, key: await readFile(keyFile), cert: await readFile(certFile) };
}
export function trustedFetch(ca) {
    return (url, init = {}) => new Promise((resolve, reject) => {
        const request = https.request(url, { method: init.method || 'GET', headers: init.headers,
            ca, rejectUnauthorized: true, signal: init.signal }, response => {
            const chunks = []; response.on('data', c => chunks.push(c)); response.on('error', reject);
            response.on('end', () => resolve(new Response(response.statusCode === 204 ? null : Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
        });
        request.once('error', reject); if (init.body) request.write(init.body); request.end();
    });
}
