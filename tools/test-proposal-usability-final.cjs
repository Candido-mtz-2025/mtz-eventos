const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.MTZ_PLAYWRIGHT || 'playwright');
const { criarServidor } = require('./serve-orcamentos.cjs');

const output = path.resolve(process.env.MTZ_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'mtz-final-sintetico-')));
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(output, 'perfil-sintetico-'));
const results = [], errors = [];
async function test(name, fn) {
    try { await fn(); results.push({ name, ok: true }); console.log('PASS', name); }
    catch (e) { results.push({ name, ok: false, error: e.stack }); console.error('FAIL', name, e.message); }
}
const tributos = [
    { nome: 'ISS ilustrativo', codigo: 'ISS', natureza: 'tributo', baseCalculo: 'manual', baseManual: 2000, percentual: 3, incidencia: 'aplica', tipoFiscalAlvo: 'cessao_estrutura_temporaria_3_05' },
    { nome: 'Encargo ilustrativo', codigo: 'OUTRO', natureza: 'encargo', baseCalculo: 'manual', baseManual: 1000, percentual: 2, incidencia: 'aplica' },
    { nome: 'IRRF ilustrativo', codigo: 'IRRF', natureza: 'retencao', baseCalculo: 'comercial', percentual: 1.5, incidencia: 'aplica' }
];
(async () => {
    const server = criarServidor();
    let context, p;
    // Mesmo codigo de terceiros do host; fetch TLS do Node evita a limitacao
    // de certificados do Chrome automatizado, sem alterar CSP ou o aplicativo.
    const libraries = [];
    for (const source of ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js']) {
        const response = await fetch(source); assert.equal(response.status, 200);
        const body = await response.text(); assert.ok(body.length > 100000);
        libraries.push({ source, body, sha256: crypto.createHash('sha256').update(body).digest('hex') });
    }
    fs.writeFileSync(path.join(output, 'bibliotecas-pdf.json'), JSON.stringify(libraries.map(({ source, sha256 }) => ({ source, sha256 })), null, 2));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    const launch = async () => {
        context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.MTZ_CHROME,
            acceptDownloads: true, viewport: { width: 1280, height: 900 } });
        for (const library of libraries) await context.route(library.source, r => r.fulfill({ contentType: 'text/javascript', body: library.body }));
        p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
        await p.goto(url); await p.waitForFunction(() => /Clique|Base confirmada/.test(document.getElementById('localEstado')?.textContent || ''));
    };
    const blur = async () => { await p.evaluate(() => document.activeElement?.blur()); await p.waitForTimeout(100); };
    const step = id => p.click('#propostaFormTab' + id);
    const save = async () => {
        await blur(); await p.locator('[data-action="salvarProposta"]:visible').first().click();
        await p.waitForFunction(() => document.getElementById('localEstado').textContent.includes('Salvo com sucesso'));
    };
    const root = () => p.evaluate(() => JSON.parse(JSON.stringify(propostas)));
    const openSaved = async () => {
        await p.click('#propostasSubtabLista'); await p.locator('[data-action="editarProposta"]:visible').first().click();
        await p.waitForFunction(() => document.getElementById('propostaIdAtual').value !== '');
    };
    try {
        await launch();
        await step('Itens'); await p.click('#propBtnAdicionarItem');
        await p.fill('.prop-item-descricao', 'Estrutura sintetica final'); await p.fill('.prop-item-unitario', '2000');
        await p.fill('.prop-item-quantidade', '3'); await p.selectOption('.prop-item-origem-custo', 'misto');
        await p.fill('.prop-item-quantidade-propria', '2'); await p.fill('.prop-item-quantidade-terceirizada', '1');
        await p.fill('.prop-item-custo-terceirizado-real', '1200'); await blur();
        await test('P2: composicao e acoes cabem em 1280x900 e 390x700', async () => {
            for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 700 }]) {
                await p.setViewportSize(size);
                const fit = await p.locator('.proposta-items-table-wrap').evaluate(el => {
                    const outer = el.getBoundingClientRect();
                    const fields = [...el.querySelectorAll('.prop-item-composicao input, .prop-item-composicao select, .proposta-item-actions button')];
                    return { width: el.clientWidth, content: el.scrollWidth, rowWidth: el.querySelector('.proposta-item-row').getBoundingClientRect().width, fits: fields.every(f => {
                        if (f.closest('[hidden]')) return true;
                        const r = f.getBoundingClientRect(); return r.left >= outer.left - 1 && r.right <= outer.right + 1;
                    }) };
                });
                assert.ok(fit.fits, JSON.stringify(fit)); assert.ok(fit.content <= fit.width + 2, JSON.stringify(fit));
                assert.ok(fit.rowWidth >= fit.width - 4, JSON.stringify(fit));
                await p.waitForFunction(() => getComputedStyle(document.getElementById('toast')).opacity === '0');
                await p.locator('#propostaSecaoItens').screenshot({ path: path.join(output, `itens-${size.width}.png`) });
            }
            await p.setViewportSize({ width: 1280, height: 900 });
        });
        await p.click('.prop-details-toggle-btn'); await p.selectOption('.prop-item-tipo-fiscal', 'cessao_estrutura_temporaria_3_05');
        await p.click('.prop-details-toggle-btn'); await step('Comercial');
        await test('P2: ISS exige escolha explicita e mantem bloqueio de locacao pura', async () => {
            await p.click('#propAdicionarTributo'); await p.fill('[data-tributo="nome"]', 'ISS sintetico de auditoria');
            await p.selectOption('[data-tributo="base"]', 'manual'); await p.fill('[data-tributo="manual"]', '1000');
            await p.fill('[data-tributo="percentual"]', '2');
            await p.locator('.prop-tributo-fundamento summary').click(); await p.selectOption('[data-tributo="codigo"]', 'ISS');
            const classification = p.locator('[data-tributo="tipoFiscalAlvo"]');
            assert.equal(await classification.inputValue(), ''); assert.ok(await classification.isVisible());
            await p.locator('.prop-tributo-fundamento summary').click(); assert.ok(await classification.isVisible());
            assert.match(await p.locator('#propFechamentoGerencial').innerText(), /CLASSIFICACAO_ISS_PENDENTE/);
            await classification.selectOption('locacao_pura_bem_movel');
            assert.match(await p.locator('#propFechamentoGerencial').innerText(), /ISS_BASE_CONTEM_LOCACAO_PURA/);
            assert.match(await p.locator('#propFechamentoGerencial').innerText(), /não reclassifique apenas para liberar/);
            await classification.selectOption('cessao_estrutura_temporaria_3_05');
            assert.match(await p.locator('#propFechamentoGerencial').innerText(), /R\$\s*20,00/);
            assert.equal(await p.locator('[data-tributo="manual"]').inputValue(), '1000');
            await p.getByRole('button', { name: 'Remover tributo', exact: true }).click();
        });
        await test('P3: trecho padrao nao abre frete; campos relevantes e recolhimento preservam valores', async () => {
            await p.getByRole('button', { name: /Limpar/, exact: false }).first().click();
            await step('Logistica');
            const detail = p.locator('details').filter({ has: p.locator('#propFreteTrechos') });
            assert.equal(await p.inputValue('#propFreteTrechos'), '1'); assert.equal(await detail.evaluate(e => e.open), false);
            await detail.locator('summary').click(); await p.fill('#propFreteDistanciaKm', '100'); await p.fill('#propFreteValorKm', '4'); await blur();
            assert.equal(await p.inputValue('#propCustoFrete'), 'R$\u00a0400,00');
            await detail.locator('summary').click(); await p.fill('#propOutrosCustosInternos', '10'); await blur();
            assert.equal(await detail.evaluate(e => e.open), false); assert.equal(await p.inputValue('#propFreteDistanciaKm'), '100');
            assert.equal(await p.inputValue('#propCustoFrete'), 'R$\u00a0400,00');
        });
        await test('P3: aviso fiscal sobrevive a recalculo e some somente apos resolver', async () => {
            await step('Comercial'); await p.selectOption('#propModalidadeFiscal', 'agregado'); await p.fill('#propPercentualNF', '2'); await blur();
            await p.selectOption('#propModalidadeFiscal', 'individualizado');
            const warning = p.locator('#propModalidadeFiscalAviso'); const text = await warning.innerText(); assert.ok(text);
            await p.fill('#propDesconto', '3'); await blur(); assert.equal(await warning.innerText(), text); assert.ok(await warning.isVisible());
            assert.equal(await p.inputValue('#propModalidadeFiscal'), 'agregado'); assert.equal(await p.inputValue('#propPercentualNF'), '2');
            await p.fill('#propPercentualNF', '0'); await blur(); assert.equal(await warning.isVisible(), false);
        });
        assert.ok(results.every(r => r.ok), 'Corrigir falhas focais antes do ensaio de persistencia');
        await p.getByRole('button', { name: /Limpar/, exact: false }).first().click(); await p.click('#localIniciar');
        await p.waitForFunction(() => document.getElementById('localEstado').textContent === 'Base confirmada.');
        await test('E2E: criar e salvar orçamento sintetico com os mesmos parametros financeiros', async () => {
            await p.fill('#propClienteNome', 'Empresa ficticia final'); await p.fill('#propClienteTelefone', '00000000');
            await step('Evento'); await p.fill('#propEventoNome', 'Evento ficticio final'); await p.fill('#propDataEvento', '2026-12-15');
            await step('Itens'); await p.fill('.prop-item-descricao', 'Estrutura temporaria sintetica');
            await p.fill('.prop-item-unitario', '2000'); await p.fill('.prop-item-quantidade', '3');
            await p.selectOption('.prop-item-origem-custo', 'misto'); await p.fill('.prop-item-quantidade-propria', '2');
            await p.fill('.prop-item-quantidade-terceirizada', '1'); await p.fill('.prop-item-custo-terceirizado-real', '1200');
            await p.click('.prop-details-toggle-btn'); await p.selectOption('.prop-item-tipo-fiscal', 'cessao_estrutura_temporaria_3_05');
            await step('Logistica'); await p.fill('#propCustoFrete', '400');
            await p.fill('#propMaoObraMontagemPessoas', '2'); await p.fill('#propMaoObraMontagemValorPessoaDia', '300');
            await p.fill('#propMaoObraMontagemDias', '1'); await p.fill('#propCustoInternoTotal', '500');
            await step('Comercial'); await p.fill('#propDesconto', '200'); await p.selectOption('#propTipoDescontoFiscal', 'incondicional');
            await p.fill('#propDataFiscalGerencial', '2026-11-18'); await p.evaluate(ts => ts.forEach(t => adicionarTributoGerencial(t)), tributos);
            await save(); const f = (await root())[0].controleInterno.fechamentoGerencial;
            assert.deepEqual([f.valorFinal, f.custoTotalProposta, f.tributosTotal, f.encargosTotal, f.retencoesTotal,
                f.resultadoAntesDepreciacao, f.depreciacaoGerencial, f.lucroPrevisto, f.caixaAposRetencoes],
            [6800, 1700, 60, 20, 102, 5020, 1004, 4016, 6698]);
        });
        const original = (await root())[0];
        await test('E2E: fechar navegador, reabrir e recuperar raiz integral', async () => {
            await context.close(); context = null; await launch(); assert.deepEqual((await root())[0], original);
            await openSaved(); await step('Itens');
            assert.equal(await p.inputValue('.prop-item-quantidade-propria'), '2');
            assert.equal(await p.inputValue('.prop-item-custo-terceirizado-real'), 'R$\u00a01.200,00');
            await step('Comercial'); assert.equal(await p.inputValue('[data-tributo="tipoFiscalAlvo"]:visible'), 'cessao_estrutura_temporaria_3_05');
        });
        await test('E2E: editar, salvar e recarregar sem recalcular valores historicos silenciosamente', async () => {
            await p.locator('[data-action="revisarFechamentoGerencialProposta"]').click();
            await step('Evento'); await p.fill('#propEventoNome', 'Evento ficticio editado'); await save();
            const current = (await root())[0]; assert.equal(current.id, original.id);
            assert.deepEqual(current.controleInterno.fechamentoGerencial, original.controleInterno.fechamentoGerencial);
            assert.deepEqual(await p.evaluate(() => logsAuditoria[1].anteriorSnapshot), original);
            await p.reload(); await p.waitForFunction(() => /Base confirmada/.test(document.getElementById('localEstado').textContent));
            assert.deepEqual((await root())[0], current); await openSaved();
        });
        for (const internal of [false, true]) await test(`E2E: previa e download do PDF ${internal ? 'interno' : 'comercial'}`, async () => {
            await p.evaluate(() => fecharModal('modalRelatorio'));
            await step('Revisao');
            if (internal) { await p.click('.proposta-more-actions-trigger'); await p.click('[data-action="gerarPDFPropostaAtualInterno"]'); }
            else await p.locator('[data-action="gerarPDFPropostaAtualCliente"]:visible').first().click();
            await p.waitForFunction(() => document.getElementById('modalRelatorio').classList.contains('active'));
            const text = await p.locator('#printArea').innerText();
            assert.match(text, /6\.800,00/);
            if (internal) {
                for (const value of ['1.700,00', '1.004,00', '4.016,00']) assert.ok(text.includes(value), value);
                assert.match(text, /Encargo ilustrativo[^\n]*\n[^\n]*20,00/);
            } else assert.doesNotMatch(text, /1\.700,00|1\.004,00|4\.016,00|Resultado gerencial|Margem gerencial|Custo total interno|Depreciação gerencial/);
            await p.waitForFunction(() => window.jspdf?.jsPDF && window.html2canvas, null, { timeout: 20000 });
            const download = p.waitForEvent('download', { timeout: 60000 });
            await p.click('#modalRelatorio [data-action="gerarPDF"]'); const file = await download;
            const target = path.join(output, internal ? 'interno.pdf' : 'comercial.pdf'); await file.saveAs(target);
            assert.ok(fs.statSync(target).size > 1000); assert.equal(fs.readFileSync(target).subarray(0, 5).toString(), '%PDF-');
            await p.evaluate(() => fecharModal('modalRelatorio'));
        });
        await test('E2E: escritores legados e demais modulos continuam bloqueados', async () => {
            assert.equal(await p.evaluate(() => __permitirEscritaLegada()), false);
            assert.equal(await p.locator('[data-menu-item][data-tab="locadores"]').isDisabled(), true);
            assert.equal((await root()).length, 1); assert.deepEqual(errors, []);
        });
    } finally { if (context) await context.close(); await new Promise(r => server.close(r)); }
    const report = { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, errors };
    fs.writeFileSync(path.join(output, 'resultado-final.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); if (report.failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
