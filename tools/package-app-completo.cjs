const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');

function arquivosAplicativo() {
    return execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0')
        .filter(f => /^(?:index\.html|manifest\.json|sw\.js|logo\.png|\.nojekyll|assets\/(?:css\/[\w.-]+\.css|js\/(?:core|modules|render|ui)\/[\w.-]+\.(?:js|mjs)))$/.test(f));
}
function prepararPacote() {
    const output = fs.mkdtempSync(path.join(process.env.MTZ_PACKAGE_PARENT || os.tmpdir(), 'mtz-app-completo-436-'));
    const files = arquivosAplicativo();
    const hashes = {};
    for (const file of files) {
        const bytes = fs.readFileSync(path.join(repo, file));
        const target = path.join(output, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
    }
    // O inventario fica fora da pasta publicavel.
    fs.writeFileSync(output + '.json', JSON.stringify({ output, base: 'e7e56d075a20cd0f98e7571e54ab820277809f85',
        homologado: 'ed958bc2c70ec27e1a7a2795f063c24e356fd4be', files, hashes }, null, 2));
    return { output, files, hashes };
}
module.exports = { arquivosAplicativo, prepararPacote };
if (require.main === module) console.log(JSON.stringify(prepararPacote(), null, 2));
