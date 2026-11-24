import { writeFile } from 'node:fs/promises';
import { createLab } from './lab.mjs';
// Cada inicio cria somente uma base NOVA sintetica. Nunca conecta a PG* da maquina.
const lab = await createLab({ port: 54148 });
const links = [];
for (const name of ['alice', 'bob', 'carol', 'bea']) links.push(name + ': ' + lab.base + '/#' + await lab.tokenFor(name));
await writeFile(new URL('./.local-data/acessos-locais.txt', import.meta.url),
    'Somente sessoes sinteticas locais, validade de 9 minutos. Nao compartilhar.\n' + links.join('\n'), { mode: 0o600 });
console.log('POC sintetica central: ' + lab.base + '/');
console.log('Links de teste em poc/central-orcamentos/.local-data/acessos-locais.txt (nao versionado).');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await lab.stop(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
