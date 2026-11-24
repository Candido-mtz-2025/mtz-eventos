const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.MTZ_PLAYWRIGHT || 'playwright');
const { arquivosAplicativo, prepararPacote } = require('./package-app-completo.cjs');
const repo = path.resolve(__dirname, '..');
const baseline = 'e7e56d075a20cd0f98e7571e54ab820277809f85';
const output = process.env.MTZ_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'mtz-integracao-436-'));
fs.mkdirSync(output, { recursive: true });
const results = [];
const old = file => execFileSync('git', ['show', `${baseline}:${file}`], { cwd: repo, maxBuffer: 16000000 });
const fixture = {
    itens: [{ descricao: 'Estrutura sintetica', tipoFiscal: 'cessao_estrutura_temporaria_3_05', origemCusto: 'misto',
        quantidade: 3, quantidadePropria: 2, quantidadeTerceirizada: 1, custoUnitario: 2000,
        periodoDias: 1, custoTerceirizadoReal: 1200, aplicarHonorarios: false, aplicarEncargos: false, aplicarINSS: false }],
    custos: { frete: 400, maoObra: 600 }, controleInterno: { custoInternoTotal: 500 }, desconto: 200,
    tipoDescontoFiscal: 'incondicional', dataFiscal: '2026-11-18', incluirMaoObra: true,
    tributos: [
        { nome: 'ISS ilustrativo', codigo: 'ISS', natureza: 'tributo', baseCalculo: 'manual', baseManual: 2000, percentual: 3, incidencia: 'aplica', tipoFiscalAlvo: 'cessao_estrutura_temporaria_3_05' },
        { nome: 'Encargo ilustrativo', codigo: 'OUTRO', natureza: 'encargo', baseCalculo: 'manual', baseManual: 1000, percentual: 2, incidencia: 'aplica' },
        { nome: 'IRRF ilustrativo', codigo: 'IRRF', natureza: 'retencao', baseCalculo: 'comercial', percentual: 1.5, incidencia: 'aplica' }
    ]
};
async function test(name, fn) {
    try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
    catch (e) { results.push({ name, ok: false, error: e.stack }); console.error('FAIL', name, e.message); }
}
function criarServidor() {
    const allowed = new Set(arquivosAplicativo());
    return http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        let file = url.pathname.slice(1) || 'index.html';
        const previous = file.startsWith('baseline/');
        if (previous) file = file.slice(9) || 'index.html';
        if (req.method !== 'GET' || !allowed.has(file)) { res.writeHead(404); return res.end(); }
        try {
            const body = previous ? old(file) : fs.readFileSync(path.join(repo, file));
            res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript',
                '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' })[path.extname(file)] });
            res.end(body);
        } catch { res.writeHead(404); res.end(); }
    });
}
module.exports = { criarServidor };
if (process.argv.includes('--serve')) {
    criarServidor().listen(54146, '127.0.0.1', () => console.log('Aplicativo completo isolado: http://127.0.0.1:54146/'));
} else if (require.main === module) (async () => {
    const libs = new Map();
    const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
    for (const [, url] of html.matchAll(/<script src="(https:[^"]+)"/g)) {
        const r = await fetch(url); assert.equal(r.status, 200);
        libs.set(url, { contentType: 'text/javascript', body: await r.text() });
    }
    const iconUrl = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css';
    const iconResponse = await fetch(iconUrl); assert.equal(iconResponse.status, 200);
    const iconCss = await iconResponse.text(); libs.set(iconUrl, { contentType: 'text/css', body: iconCss });
    for (const [, relative] of iconCss.matchAll(/url\("([^"]+)"\)/g)) {
        const url = new URL(relative, iconUrl).href; const r = await fetch(url); assert.equal(r.status, 200);
        libs.set(url, { contentType: 'font/woff2', body: Buffer.from(await r.arrayBuffer()) });
    }
    const server = criarServidor(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.MTZ_CHROME });
    const contexts = [];
    const open = async previous => {
        const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
        contexts.push(context);
        await context.route('**/*', route => {
            const url = route.request().url();
            if (libs.has(url)) return route.fulfill(libs.get(url));
            return new URL(url).origin === origin ? route.continue() : route.abort();
        });
        const page = await context.newPage(); const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(origin + (previous ? '/baseline/index.html' : '/index.html'));
        await page.waitForFunction(() => typeof entrarOffline === 'function' && typeof abrirTab === 'function');
        await page.evaluate(() => entrarOffline());
        await page.waitForFunction(() => document.getElementById('appArea').style.display === 'block');
        return { page, errors };
    };
    try {
        const previous = await open(true), current = await open(false), p = current.page;
        const tabs = page => page.evaluate(() => [...document.querySelectorAll('[data-menu-item][data-tab], .tab-btn[data-tab]')]
            .map(el => el.dataset.tab).filter((x, i, a) => a.indexOf(x) === i));
        await test('Todas as abas originais e scripts foram preservados', async () => {
            assert.deepEqual(await tabs(p), await tabs(previous.page));
            const sources = s => [...s.matchAll(/<script src="(\.\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
            assert.deepEqual(sources(html), sources(old('index.html').toString()));
            assert.doesNotMatch(html, /mtz-homologacao|src="[^\"]*homologacao\//);
            assert.equal(await p.evaluate(() => typeof window.__instalarOrcamentosHomologacao), 'undefined');
        });
        for (const tab of await tabs(p)) await test('Navegacao completa: ' + tab, async () => {
            await p.evaluate(id => abrirTab(id, { semRolagem: true }), tab);
            assert.ok(await p.locator('#tab-' + tab).isVisible());
        });
        await test('Calculos integrais iguais a main para o mesmo orcamento', async () => {
            const calc = page => page.evaluate(d => calcularFechamentoGerencialProposta(d), fixture);
            const a = await calc(previous.page), b = await calc(p); assert.deepEqual(b, a);
            assert.deepEqual([b.valorFinal, b.custoTotalProposta, b.tributosTotal, b.encargosTotal, b.retencoesTotal,
                b.resultadoAntesDepreciacao, b.depreciacaoGerencial, b.lucroPrevisto], [6800, 1700, 60, 20, 102, 5020, 1004, 4016]);
            fs.writeFileSync(path.join(output, 'comparacao-financeira.json'), JSON.stringify({ antes: a, depois: b }, null, 2));
        });
        await test('Formulario integrado: composicao, logistica e modalidades fiscais', async () => {
            await p.evaluate(() => irParaPropostasFormulario());
            await p.click('#propostaFormTabItens'); await p.click('#propBtnAdicionarItem');
            await p.fill('.prop-item-descricao', 'Estrutura sintetica de integracao'); await p.fill('.prop-item-unitario', '2000');
            await p.fill('.prop-item-quantidade', '3'); await p.selectOption('.prop-item-origem-custo', 'misto');
            await p.fill('.prop-item-quantidade-propria', '2'); await p.fill('.prop-item-quantidade-terceirizada', '1');
            await p.fill('.prop-item-custo-terceirizado-real', '1200'); await p.evaluate(() => document.activeElement.blur());
            for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 700 }]) {
                await p.setViewportSize(size);
                await p.waitForTimeout(300); await p.evaluate(() => fecharSidebarMobile());
                await p.waitForFunction(() => getComputedStyle(document.getElementById('toast')).opacity === '0');
                await p.evaluate(() => document.fonts.ready);
                const fit = await p.locator('.proposta-items-table-wrap').evaluate(el => el.scrollWidth <= el.clientWidth + 2);
                assert.ok(fit); await p.locator('#propostaSecaoItens').screenshot({ path: path.join(output, `formulario-${size.width}.png`) });
            }
            await p.setViewportSize({ width: 1280, height: 900 });
            await p.click('#propostaFormTabLogistica');
            assert.equal(await p.locator('details').filter({ has: p.locator('#propFreteTrechos') }).evaluate(el => el.open), false);
            await p.fill('#propCustoFrete', '400'); await p.fill('#propCustoInternoTotal', '500');
            await p.click('#propostaFormTabComercial'); await p.selectOption('#propModalidadeFiscal', 'agregado');
            await p.fill('#propPercentualNF', '2'); await p.evaluate(() => document.activeElement.blur());
            await p.selectOption('#propModalidadeFiscal', 'individualizado');
            const aviso = await p.locator('#propModalidadeFiscalAviso').innerText(); assert.ok(aviso);
            await p.fill('#propDesconto', '200'); await p.evaluate(() => document.activeElement.blur());
            assert.equal(await p.locator('#propModalidadeFiscalAviso').innerText(), aviso);
            assert.equal(await p.inputValue('#propPercentualNF'), '2');
        });
        await test('Salvar publico continua bloqueado sem alterar memoria ou banco', async () => {
            const result = await p.evaluate(async () => {
                const before = JSON.stringify({ propostas, logsAuditoria });
                const dbs = await indexedDB.databases();
                const r = salvarProposta();
                return { r, equal: before === JSON.stringify({ propostas, logsAuditoria }), dbs, after: await indexedDB.databases() };
            });
            assert.equal(result.r.codigo, 'PERSISTENCIA_PROPOSTA_SEGURA_INDISPONIVEL');
            assert.ok(result.equal); assert.deepEqual(result.dbs, result.after); assert.deepEqual(result.after, []);
        });
        await test('Historico sintetico nao e recalculado ao abrir e recarregar', async () => {
            const r = await p.evaluate(() => {
                const historico = { id: 'historico-sintetico', codigo: 'SINTETICO', status: 'rascunho',
                    cliente: { nome: 'Cliente ficticio' }, evento: { nome: 'Evento ficticio' },
                    itens: [{ descricao: 'Item antigo', quantidade: 1, custoUnitario: 1234, periodoDias: 1 }],
                    financeiro: { valorFinal: 1234, valorFinalComNF: 1234 }, controleInterno: { lucroPrevisto: 999 }, fiscal: {},
                    anexos: [{ nome: 'Anexo ficticio', conteudo: 'sintetico' }], futuro: { preservar: true } };
                propostas.push(historico); salvarLocal(); const before = JSON.stringify(propostas);
                editarProposta(historico.id); return { before, after: JSON.stringify(propostas) };
            });
            assert.equal(r.before, r.after);
            await p.reload(); await p.evaluate(() => entrarOffline());
            const loaded = await p.evaluate(() => propostas.find(x => x.id === 'historico-sintetico'));
            // A migracao legada existente completa campos ausentes na releitura.
            // O contrato historico aqui e preservar valores, anexos e campos desconhecidos.
            const before = JSON.parse(r.before)[0];
            assert.equal(loaded.financeiro.valorFinal, before.financeiro.valorFinal);
            assert.equal(loaded.controleInterno.lucroPrevisto, before.controleInterno.lucroPrevisto);
            assert.equal(loaded.controleInterno.fechamentoGerencial, undefined);
            assert.deepEqual(loaded.anexos, before.anexos); assert.deepEqual(loaded.futuro, before.futuro);
        });
        for (const internal of [false, true]) await test('PDF ' + (internal ? 'interno' : 'comercial') + ' no aplicativo completo', async () => {
            await p.evaluate(({ fixture, internal }) => {
                limparFormularioProposta();
                const set = (s, v) => { document.querySelector(s).value = v; };
                set('#propClienteNome', 'Cliente ficticio integracao'); set('#propClienteTelefone', '00000000');
                set('#propEventoNome', 'Evento ficticio integracao'); set('#propDataEvento', '2026-12-15');
                set('.prop-item-descricao', fixture.itens[0].descricao); set('.prop-item-tipo-fiscal', fixture.itens[0].tipoFiscal);
                set('.prop-item-unitario', '2000'); set('.prop-item-quantidade', '3');
                set('.prop-item-origem-custo', 'misto'); set('.prop-item-quantidade-propria', '2');
                set('.prop-item-quantidade-terceirizada', '1'); set('.prop-item-custo-terceirizado-real', '1200');
                set('#propCustoFrete', '400'); set('#propCustoInternoTotal', '500');
                set('#propMaoObraMontagemPessoas', '2'); set('#propMaoObraMontagemValorPessoaDia', '300'); set('#propMaoObraMontagemDias', '1');
                set('#propDesconto', '200'); set('#propTipoDescontoFiscal', 'incondicional'); set('#propDataFiscalGerencial', '2026-11-18');
                fixture.tributos.forEach(t => adicionarTributoGerencial(t)); recalcularResumoProposta();
                if (internal) gerarPDFPropostaAtualInterno(); else gerarPDFPropostaAtualCliente();
            }, { fixture, internal });
            await p.waitForFunction(() => document.getElementById('modalRelatorio').classList.contains('active'));
            const text = await p.locator('#printArea').innerText();
            if (internal) {
                assert.match(text, /1\.700,00/); assert.match(text, /1\.004,00/); assert.match(text, /4\.016,00/);
                const overflow = await p.locator('.pdf-items-table--internal th, .pdf-items-table--internal td').evaluateAll(cells => cells.filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent));
                assert.deepEqual(overflow, []);
                assert.equal(await p.locator('.proposal-highlight-card.total strong').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
            } else assert.doesNotMatch(text, /Custo total interno|Depreciação gerencial|Resultado gerencial|1\.700,00|1\.004,00|4\.016,00/);
            await p.locator('#printArea').screenshot({ path: path.join(output, internal ? 'pdf-interno.png' : 'pdf-comercial.png') });
            const download = p.waitForEvent('download', { timeout: 60000 });
            await p.click('#modalRelatorio [data-action="gerarPDF"]'); const file = await download;
            const target = path.join(output, internal ? 'interno.pdf' : 'comercial.pdf'); await file.saveAs(target);
            assert.equal(fs.readFileSync(target).subarray(0, 5).toString(), '%PDF-');
            await p.evaluate(() => fecharModal('modalRelatorio'));
        });
        await test('Permissoes herdadas preservadas e sem erros novos de inicializacao', async () => {
            const roles = async page => page.evaluate(() => {
                config.adminEmails = 'admin@example.invalid'; localStorage.setItem('usuarioEmail', 'operacao@example.invalid');
                atualizarPerfilAcesso(); return { role: obterPerfilAcesso(), config: temAcessoAba('config') };
            });
            assert.deepEqual(await roles(p), await roles(previous.page));
            assert.deepEqual(current.errors, previous.errors);
        });
        await test('Pacote completo exclui bootstrap sintetico, docs, testes e arquivos locais', async () => {
            const pkg = prepararPacote(); assert.ok(pkg.files.includes('assets/js/modules/transporte.js'));
            assert.ok(pkg.files.includes('assets/js/render/contas-pagar.js'));
            assert.ok(pkg.files.every(f => !/^(?:homologacao|tools|docs|\.git)\/|\.patch$|^dq$/.test(f)));
            fs.writeFileSync(path.join(output, 'pacote.json'), JSON.stringify(pkg, null, 2));
        });
    } finally { for (const c of contexts) await c.close(); await browser.close(); await new Promise(r => server.close(r)); }
    const report = { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
    fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report })); if (report.failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
