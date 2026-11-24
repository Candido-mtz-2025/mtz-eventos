const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { babelParse, traverse } = require(process.env.MTZ_BABEL_BUNDLE || require.resolve('playwright/lib/transform/babelBundle.js'));
const repo = path.resolve(__dirname, '../..');
(async () => {
    const original = fs.readFileSync(path.join(repo, 'assets/js/modules/propostas.js'), 'utf8');
    const generatedPath = path.join(repo, 'assets/js/core/proposal-kernel.generated.mjs');
    const generated = fs.readFileSync(generatedPath, 'utf8');
    const { manifesto } = await import(pathToFileURL(generatedPath));
    let sourceScope, generatedScope;
    traverse(babelParse(original, 'propostas.js'), { FunctionExpression(p) { if (!sourceScope && p.parentPath.isCallExpression()) sourceScope = p.scope; } });
    traverse(babelParse(generated, 'proposal-kernel.generated.mjs'), { FunctionDeclaration(p) { if (p.node.id?.name === 'criarNucleoPropostas') generatedScope = p.scope; } });
    let rawHashMatches = 0, normalizedHashMatches = 0, compatibleManifest = 0;
    for (const name of Object.keys(manifesto)) {
        const a = sourceScope.bindings[name]?.path.node, b = generatedScope.bindings[name]?.path.node;
        assert.ok(a && b, name);
        assert.equal(original.slice(a.start, a.end).replaceAll('\r\n', '\n'), generated.slice(b.start, b.end).replaceAll('\r\n', '\n'), name);
        const code = original.slice(a.start, a.end), sha = text => createHash('sha256').update(text).digest('hex');
        if (sha(code) === manifesto[name]) rawHashMatches++;
        if (sha(code.replaceAll('\r\n', '\n')) === manifesto[name]) normalizedHashMatches++;
        if ([code, code.replaceAll('\r\n', '\n'), code.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')].some(text => sha(text) === manifesto[name])) compatibleManifest++;
    }
    console.log(JSON.stringify({ passed: Object.keys(manifesto).length, failed: 0, rawHashMatches, normalizedHashMatches, compatibleManifest,
        legacyManifestDivergent: Object.keys(manifesto).length - compatibleManifest,
        comparison: 'Independent AST declaration equality, CRLF normalized. Legacy raw manifest diagnostics are NOT a successful generator --check.' }));
})().catch(e => { console.error(e); process.exitCode = 1; });
