const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.MTZ_PLAYWRIGHT || 'playwright');
const { criarServidor } = require('./serve-orcamentos.cjs');
const baseline = 'f63ed0378ffd73e5c61712f8bd77a812cdc7d75a';
const output = process.env.MTZ_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'mtz-pdf-interno-'));
fs.mkdirSync(output, { recursive: true });
const results = [];
async function test(name, fn) {
    try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
    catch (e) { results.push({ name, ok: false, error: e.stack }); console.error('FAIL', name, e.message); }
}
async function overflow(page) {
    return page.locator('.pdf-items-table th, .pdf-item-row td, .pdf-category-subtotal td').evaluateAll(cells => {
        const issues = [];
        for (const cell of cells) {
            const box = cell.getBoundingClientRect();
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                if (!node.textContent.trim()) continue;
                const range = document.createRange(); range.selectNodeContents(node);
                for (const r of range.getClientRects()) if (r.left < box.left - 1 || r.right > box.right + 1) {
                    issues.push({ cell: cell.textContent.trim(), width: box.width, textWidth: r.width });
                }
            }
        }
        return issues;
    });
}
(async () => {
    const libs = [];
    for (const url of ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js']) {
        const r = await fetch(url); assert.equal(r.status, 200); libs.push({ url, body: await r.text() });
    }
    const server = criarServidor(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.MTZ_CHROME });
    const contexts = [];
    const open = async previous => {
        const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
        contexts.push(context);
        for (const lib of libs) await context.route(lib.url, r => r.fulfill({ contentType: 'text/javascript', body: lib.body }));
        if (previous) {
            const body = execFileSync('git', ['show', `${baseline}:assets/js/modules/propostas.js`], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
            await context.route('**/assets/js/modules/propostas.js*', r => r.fulfill({ contentType: 'text/javascript', body }));
        }
        const p = await context.newPage(); await p.goto(url);
        await p.waitForFunction(() => document.getElementById('localEstado')?.textContent.includes('Clique'));
        await p.fill('#propClienteNome', 'Cliente ficticio PDF'); await p.fill('#propClienteTelefone', '00000000');
        await p.click('#propostaFormTabEvento'); await p.fill('#propEventoNome', 'Evento ficticio PDF'); await p.fill('#propDataEvento', '2026-12-15');
        await p.click('#propostaFormTabItens'); await p.click('#propBtnAdicionarItem');
        await p.evaluate(() => {
            const set = (s, v) => { document.querySelector(s).value = v; };
            set('.prop-item-descricao', 'Estrutura temporaria sintetica com descricao detalhada para conferencia interna');
            set('.prop-item-unitario', '2000'); set('.prop-item-quantidade', '3');
            set('.prop-item-origem-custo', 'misto'); set('.prop-item-quantidade-propria', '2'); set('.prop-item-quantidade-terceirizada', '1');
            set('.prop-item-custo-terceirizado-real', '1200'); set('#propCustoFrete', '400'); set('#propCustoInternoTotal', '500');
            set('#propMaoObraMontagemPessoas', '2'); set('#propMaoObraMontagemValorPessoaDia', '300'); set('#propMaoObraMontagemDias', '1');
            set('#propDesconto', '200'); recalcularResumoProposta();
        });
        return p;
    };
    try {
        const before = await open(true), after = await open(false);
        const internal = async p => { await p.evaluate(() => gerarPDFPropostaAtualInterno()); await p.waitForSelector('#modalRelatorio.active'); await p.evaluate(() => document.fonts.ready); };
        await internal(before); await internal(after);
        await test('reproduz sobreposicao no commit f63ed03', async () => {
            const issues = await overflow(before); assert.ok(issues.length > 0);
            fs.writeFileSync(path.join(output, 'sobreposicoes-antes.json'), JSON.stringify(issues, null, 2));
        });
        await test('cabecalhos e valores dentro de suas celulas na tabela corrigida', async () => {
            assert.deepEqual(await overflow(after), []);
            const wrapped = await after.locator('.pdf-items-table th, .pdf-item-row td.money, .pdf-category-subtotal td.money').evaluateAll(cells => cells.filter(cell => {
                const range = document.createRange(); range.selectNodeContents(cell);
                return range.getClientRects().length > 1;
            }).map(cell => cell.textContent.trim()));
            assert.deepEqual(wrapped, [], 'Cabecalhos e valores usuais devem caber em uma linha');
            await after.locator('.pdf-items-table').screenshot({ path: path.join(output, 'tabela-depois.png') });
        });
        await test('textos e valores integrais preservados', async () => {
            const text = p => p.locator('.pdf-items-table').innerText(); assert.equal(await text(after), await text(before));
            const money = p => p.locator('#propValorFinal, #propCustoTotalProposta, #propLucroPrevisto').evaluateAll(es => es.map(e => e.value));
            assert.deepEqual(await money(after), await money(before));
        });
        await test('valores longos e quantidades grandes nao invadem outras colunas', async () => {
            const original = await after.locator('.pdf-items-table').innerHTML();
            await after.locator('.pdf-item-row td.money').evaluateAll(es => es.forEach(e => { e.textContent = 'R$\u00a01.234.567.890,12'; }));
            await after.locator('.pdf-item-row td.center').evaluateAll(es => es.forEach(e => { e.textContent = '123456789'; }));
            assert.deepEqual(await overflow(after), []);
            await after.locator('.pdf-items-table').evaluate((el, html) => { el.innerHTML = html; }, original);
        });
        await test('PDF interno gerado e baixado com os valores originais', async () => {
            const text = await after.locator('#printArea').innerText(); assert.match(text, /6\.800,00/); assert.match(text, /1\.700,00/);
            await after.waitForFunction(() => window.jspdf?.jsPDF && window.html2canvas);
            const download = after.waitForEvent('download', { timeout: 60000 });
            await after.click('#modalRelatorio [data-action="gerarPDF"]'); await (await download).saveAs(path.join(output, 'interno-corrigido.pdf'));
            assert.ok(fs.statSync(path.join(output, 'interno-corrigido.pdf')).size > 1000);
        });
        await test('documento comercial identico ao commit anterior e sem dados internos', async () => {
            for (const p of [before, after]) { await p.evaluate(() => { fecharModal('modalRelatorio'); gerarPDFPropostaAtualCliente(); }); await p.waitForSelector('#modalRelatorio.active'); }
            assert.equal(await after.locator('#printArea').innerHTML(), await before.locator('#printArea').innerHTML());
            assert.doesNotMatch(await after.locator('#printArea').innerText(), /Custo total interno|Resultado gerencial|Margem gerencial|Depreciação/);
            assert.deepEqual(await after.evaluate(() => indexedDB.databases()), []);
        });
    } finally { for (const c of contexts) await c.close(); await browser.close(); await new Promise(r => server.close(r)); }
    const report = { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
    fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
    if (report.failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
