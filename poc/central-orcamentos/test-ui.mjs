import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createLab } from './lab.mjs';
import { ids } from './fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MTZ_PLAYWRIGHT || 'playwright');
const out = new URL('./reports/ui/', import.meta.url); await mkdir(out, { recursive: true });
const results = [], errors = [];
const lab = await createLab();
let browser;
async function check(name, fn) { try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
    catch (e) { results.push({ name, ok: false, error: e.stack }); console.error('FAIL', name, e.message); } }
try {
    const libs = new Map();
    for (const url of ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js']) {
        const r = await fetch(url); assert.equal(r.status, 200); libs.set(url, { contentType: 'text/javascript', body: await r.text() });
    }
    const icon = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css';
    const cssResponse = await fetch(icon); assert.equal(cssResponse.status, 200); const css = await cssResponse.text();
    libs.set(icon, { contentType: 'text/css', body: css });
    for (const [, relative] of css.matchAll(/url\("([^"]+)"\)/g)) {
        const url = new URL(relative, icon).href, r = await fetch(url); libs.set(url, { contentType: 'font/woff2', body: Buffer.from(await r.arrayBuffer()) });
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.MTZ_CHROME });
    const pages = {}, contexts = {};
    for (const name of ['alice', 'bob', 'carol', 'bea']) {
        const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
        contexts[name] = context;
        await context.route('**/*', route => {
            const url = route.request().url();
            if (libs.has(url)) return route.fulfill(libs.get(url));
            return new URL(url).origin === lab.base ? route.continue() : route.abort();
        });
        const login = await context.request.post(lab.base + '/api/session', { headers: { Authorization: 'Bearer ' + await lab.tokenFor(name), Origin: lab.base } });
        assert.equal(login.status(), 200);
        const p = await context.newPage(); pages[name] = p; p.on('pageerror', e => errors.push({ name, error: e.message }));
        await p.goto(lab.base); await p.waitForFunction(() => /Base central SQL confirmada|Acesso bloqueado/.test(document.getElementById('centralEstado')?.textContent || ''));
    }
    const a = pages.alice, b = pages.bob, c = pages.carol;
    const status = p => p.locator('#centralEstado').innerText();
    const open = async p => { await p.click('#propostasSubtabLista'); await p.locator('[data-action="editarProposta"]:visible').first().click(); };
    const save = async p => { await p.evaluate(() => document.activeElement?.blur());
        await p.locator('[data-action="salvarProposta"]:visible').first().click();
        await p.waitForFunction(() => /Salvo com sucesso|Conflito de revisao|Nao confirmado/.test(document.getElementById('centralEstado').textContent)); };
    await check('Formulario original: Alice cria e confirma no SQL', async () => {
        await a.fill('#propClienteNome', 'Cliente ficticio central'); await a.fill('#propClienteTelefone', '00000000');
        await a.click('#propostaFormTabEvento'); await a.fill('#propEventoNome', 'Evento ficticio central'); await a.fill('#propDataEvento', '2026-12-15');
        await a.click('#propostaFormTabItens'); await a.click('#propBtnAdicionarItem');
        await a.fill('.prop-item-descricao', 'Estrutura propria sintetica'); await a.fill('.prop-item-unitario', '1000');
        await save(a); assert.match(await status(a), /Salvo com sucesso/, await status(a));
        assert.equal(await a.evaluate(() => propostas.length), 1);
    });
    if (!results.at(-1).ok) throw Error('Nao continuar ensaio apos falha de criacao');
    await check('Bob e Carol atualizam e recuperam o mesmo registro', async () => {
        for (const p of [b, c]) { await p.click('#centralAtualizar'); await p.waitForFunction(() => propostas.length === 1); await open(p); }
        const roots = await Promise.all([a, b, c].map(p => p.evaluate(() => JSON.stringify(propostas))));
        assert.equal(roots[0], roots[1]); assert.equal(roots[0], roots[2]);
    });
    await check('Duas edicoes abertas: Bob confirma e Carol recebe conflito sem sobrescrever', async () => {
        for (const p of [b, c]) { await p.click('#propostaFormTabComercial'); await p.locator('[data-action="revisarFechamentoGerencialProposta"]').click(); await p.click('#propostaFormTabEvento'); }
        await b.fill('#propEventoNome', 'Alteracao ficticia Bob'); await c.fill('#propEventoNome', 'Alteracao ficticia Carol');
        await save(b); assert.match(await status(b), /Salvo com sucesso/);
        await save(c); assert.match(await status(c), /Conflito de revisao/);
        assert.equal(await c.inputValue('#propEventoNome'), 'Alteracao ficticia Carol');
        await c.click('#centralAtualizar'); await open(c);
        assert.equal(await c.inputValue('#propEventoNome'), 'Alteracao ficticia Bob');
    });
    if (!results.at(-1).ok) throw Error('Nao continuar ensaio apos falha de concorrencia');
    await check('Recarregar preserva orcamento central e nao cria banco IndexedDB', async () => {
        await a.reload(); await a.waitForFunction(() => /Base central SQL confirmada/.test(document.getElementById('centralEstado').textContent));
        await open(a); assert.equal(await a.inputValue('#propEventoNome'), 'Alteracao ficticia Bob');
        assert.deepEqual(await a.evaluate(() => indexedDB.databases()), []);
        assert.equal(await a.evaluate(() => __permitirEscritaLegada()), false); assert.equal(await a.evaluate(() => salvarLocal()), false);
        assert.equal(await a.evaluate(() => localStorage.getItem('mtzBackup')), null);
    });
    await check('Resposta perdida pela interface: rascunho pendente e recuperacao por recibo', async () => {
        await a.click('#propostaFormTabComercial'); await a.locator('[data-action="revisarFechamentoGerencialProposta"]').click(); await a.click('#propostaFormTabEvento'); await a.fill('#propEventoNome', 'Resposta perdida sintetica');
        let dropped = false;
        await contexts.alice.route('**/api/companies/*/commands', async route => {
            const committed = await route.fetch(); assert.equal(committed.status(), 200);
            dropped = true; await route.abort('failed');
        });
        await save(a); assert.match(await status(a), /Nao confirmado/);
        assert.ok(dropped, 'A resposta confirmada deve ter sido descartada pelo harness');
        await contexts.alice.unroute('**/api/companies/*/commands'); await a.click('#centralRecuperar');
        await a.waitForFunction(() => /Salvo com sucesso/.test(document.getElementById('centralEstado').textContent));
        assert.equal(await a.inputValue('#propEventoNome'), 'Resposta perdida sintetica');
        assert.equal((await lab.db.owner.query('SELECT count(*)::int AS n FROM orc.journal')).rows[0].n, 3);
    });
    await check('Empresa B nao carrega o calculador MTZ; APIs e arquivos internos protegidos', async () => {
        assert.match(await status(pages.bea), /POLITICA_EMPRESA_NAO_SUPORTADA/);
        assert.equal(await pages.bea.evaluate(() => typeof calcularFechamentoGerencialProposta), 'undefined');
        const unauthorized = await browser.newContext();
        try { assert.equal((await unauthorized.request.get(lab.base + '/api/companies/' + ids.A + '/state')).status(), 401); }
        finally { await unauthorized.close(); }
        for (const file of ['schema.sql', 'fixture.mjs', '.local-data/bootstrap-password', 'service.mjs']) assert.equal((await contexts.alice.request.get(lab.base + '/' + file)).status(), 404);
        assert.equal((await contexts.alice.request.post(lab.base + '/api/companies/' + ids.A + '/commands', { headers: { Origin: 'https://attacker.invalid' }, data: {} })).status(), 403);
    });
    await check('Visual desktop e celular do formulario original', async () => {
        await a.click('#propostaFormTabItens');
        for (const width of [1280, 390]) {
            await a.setViewportSize({ width, height: width === 390 ? 700 : 900 }); await a.waitForTimeout(300); await a.evaluate(() => fecharSidebarMobile());
            assert.ok(await a.locator('.proposta-items-table-wrap').evaluate(el => el.scrollWidth <= el.clientWidth + 2));
            await a.locator('#propostaSecaoItens').screenshot({ path: new URL('itens-' + width + '.png', out).pathname.replace(/^\/(.:)/, '$1') });
        }
        await a.setViewportSize({ width: 1280, height: 900 });
    });
    for (const internal of [false, true]) await check('PDF original ' + (internal ? 'interno' : 'comercial') + ' de registro SQL recuperado', async () => {
        await a.evaluate(internal => internal ? gerarPDFPropostaAtualInterno() : gerarPDFPropostaAtualCliente(), internal);
        await a.waitForFunction(() => document.getElementById('modalRelatorio').classList.contains('active'));
        const text = await a.locator('#printArea').innerText();
        if (internal) assert.match(text, /Depreciação gerencial/); else assert.doesNotMatch(text, /Custo total interno|Resultado gerencial|Depreciação gerencial/);
        await a.waitForFunction(() => window.jspdf?.jsPDF && window.html2canvas);
        const download = a.waitForEvent('download', { timeout: 60000 }); await a.click('#modalRelatorio [data-action="gerarPDF"]');
        const file = await download, target = new URL(internal ? 'interno.pdf' : 'comercial.pdf', out);
        await file.saveAs(target.pathname.replace(/^\/(.:)/, '$1')); assert.equal((await readFile(target)).subarray(0, 5).toString(), '%PDF-');
        await a.evaluate(() => fecharModal('modalRelatorio'));
    });
    await check('Nenhum erro JavaScript nao tratado nas sessoes', async () => assert.deepEqual(errors, []));
} finally {
    if (browser) await browser.close(); await lab.stop();
    const report = { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, errors };
    await writeFile(new URL('resultado.json', out), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
    if (report.failed) process.exitCode = 1;
}
