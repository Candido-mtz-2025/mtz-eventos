const { criarServidor } = require('./serve-orcamentos.cjs');
const { chromium } = require(process.env.MTZ_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve(process.env.MTZ_TEST_OUTPUT);
const server = criarServidor();
(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await chromium.launch({headless:true, executablePath:process.env.MTZ_CHROME});
    try {
        const page = await browser.newPage({acceptDownloads:true, viewport:{width:1280,height:800}});
        const logs = [];
        page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
        page.on('pageerror', e => logs.push(e.stack));
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        await page.waitForFunction(() => document.querySelector('#localEstado')?.textContent.includes('Clique'));
        await page.click('#localIniciar');
        await page.waitForFunction(() => document.querySelector('#localEstado').textContent === 'Base confirmada.');
        await page.waitForFunction(() => window.jspdf && window.html2canvas);
        await page.evaluate(() => {
            const original = html2canvas;
            window.html2canvas = async (...args) => {
                try { return await original(...args); }
                catch (e) { window.erroCanvasOriginal = {message:e.message,stack:e.stack}; throw e; }
            };
            const v = (s,x) => { document.querySelector(s).value = x; };
            v('#propClienteNome','Cliente ficticio PDF interno');
            v('#propClienteTelefone','00000000');
            v('#propEventoNome','Evento ficticio PDF');
            v('#propDataEvento','2026-12-10');
            v('.prop-item-descricao','Estrutura mista sintetica');
            v('.prop-item-tipo-fiscal','cessao_estrutura_temporaria_3_05');
            v('.prop-item-quantidade','3');
            v('.prop-item-unitario','1000');
            v('.prop-item-origem-custo','misto');
            v('.prop-item-quantidade-propria','2');
            v('.prop-item-quantidade-terceirizada','1');
            v('.prop-item-custo-terceirizado-real','450');
            v('.prop-item-percentual-encargos','2');
            v('#propCustoInternoTotal','300');
            adicionarTributoGerencial({nome:'ISS ilustrativo',codigo:'ISS',natureza:'tributo',baseCalculo:'manual',baseManual:1000,percentual:3,incidencia:'aplica',tipoFiscalAlvo:'cessao_estrutura_temporaria_3_05'});
            adicionarTributoGerencial({nome:'IRRF ilustrativo',codigo:'IRRF',natureza:'retencao',baseCalculo:'comercial',percentual:1.5,incidencia:'aplica'});
            recalcularResumoProposta();
        });
        await page.locator('[data-action="salvarProposta"]').first().click();
        await page.waitForFunction(() => !document.querySelector('[data-action="salvarProposta"]').disabled);
        assert.match(await page.locator('#localEstado').textContent(), /Salvo com sucesso/);
        await page.locator('#propostasSubtabLista').click();
        await page.locator('[data-action="editarProposta"]:visible').first().click();
        const before = await page.evaluate(() => JSON.stringify({propostas,logsAuditoria}));
        const f = await page.evaluate(() => propostas[0].controleInterno.fechamentoGerencial);
        assert.equal(f.valorFinal,3060);
        assert.equal(f.custoTotalProposta,750);
        assert.equal(f.encargosTotal,60);
        assert.equal(f.tributosTotal,30);
        assert.equal(f.retencoesTotal,45.9);
        assert.equal(f.depreciacaoGerencial,444);
        assert.equal(f.lucroPrevisto,1776);
        fs.writeFileSync(path.join(out,'fechamento.json'),JSON.stringify(f,null,2));
        await page.evaluate(() => gerarPDFPropostaAtualInterno());
        await page.locator('#printArea').getByText('Resumo interno',{exact:true}).waitFor();
        const preview = await page.locator('#printArea').innerText();
        assert.match(preview,/Custo total interno/);
        assert.match(preview,/Depreciação gerencial/);
        assert.match(preview,/Resultado gerencial estimado/);
        for (const value of ['750,00','60,00','30,00','45,90','444,00','1.776,00']) assert.ok(preview.includes(value),value);
        const originalPreview = await page.locator('#printArea').evaluate(e => e.outerHTML);
        fs.writeFileSync(path.join(out,'internal-preview.txt'),preview);
        fs.writeFileSync(path.join(out,'geometry.json'),JSON.stringify(await page.evaluate(() =>
            ['#printArea','.proposal-pdf-document','.proposal-bottom-grid','.proposal-terms-box','.proposal-summary-box','.proposal-internal-summary'].map(s => {
                const e=document.querySelector(s),c=getComputedStyle(e),r=e.getBoundingClientRect();
                return {s,width:r.width,height:r.height,scrollWidth:e.scrollWidth,grid:c.gridTemplateColumns,display:c.display};
            })),null,2));
        const download = page.waitForEvent('download',{timeout:20000}).catch(() => null);
        await page.locator('#modalRelatorio [data-action="gerarPDF"]').click();
        const d = await download;
        const error = await page.evaluate(() => window.erroCanvasOriginal || null);
        fs.writeFileSync(path.join(out,'diagnostico.json'),JSON.stringify({error,logs},null,2));
        if (!d) throw Error('DOWNLOAD_INTERNO_FALHOU: ' + JSON.stringify(error));
        await d.saveAs(path.join(out,'interno.pdf'));
        assert.ok(fs.statSync(path.join(out,'interno.pdf')).size > 10000);
        assert.equal(await page.evaluate(() => JSON.stringify({propostas,logsAuditoria})),before);
        assert.equal(await page.locator('#printArea').evaluate(e => e.outerHTML),originalPreview);
        await page.screenshot({path:path.join(out,'internal-preview.png'),fullPage:true});
        await page.locator('#modalRelatorio').getByRole('button',{name:'Fechar',exact:true}).click();
        await page.evaluate(() => gerarPDFPropostaAtualCliente());
        await page.locator('#printArea .proposta-cliente-page').first().waitFor();
        const commercial = await page.locator('#printArea').innerText();
        assert.doesNotMatch(commercial,/Custo total interno|Depreciação gerencial|Resultado gerencial estimado|64%/);
        fs.writeFileSync(path.join(out,'commercial-preview.txt'),commercial);
        const dc = page.waitForEvent('download',{timeout:30000});
        await page.locator('#modalRelatorio [data-action="gerarPDF"]').click();
        await (await dc).saveAs(path.join(out,'comercial.pdf'));
        assert.ok(fs.statSync(path.join(out,'comercial.pdf')).size > 10000);
        assert.equal(await page.evaluate(() => JSON.stringify({propostas,logsAuditoria})),before);
        assert.equal(await page.evaluate(() => window.erroCanvasOriginal || null),null);
        await page.locator('#modalRelatorio').getByRole('button',{name:'Fechar',exact:true}).click();
        await page.evaluate(() => gerarPDFPropostaAtualInterno());
        await page.locator('#printArea .proposal-internal-summary').waitFor();
        await page.evaluate(() => {
            window.canvasSemFalha=window.html2canvas;
            window.html2canvas=()=>Promise.reject(new Error('FALHA_CANVAS_SINTETICA'));
        });
        await page.locator('#modalRelatorio [data-action="gerarPDF"]').click();
        await page.waitForFunction(() => document.querySelector('#localEstado').textContent.includes('Erro ao gerar PDF'));
        await page.waitForFunction(() => !document.querySelector('#modalRelatorio [data-action="gerarPDF"]').disabled);
        assert.ok(logs.some(l=>l.includes('FALHA_CANVAS_SINTETICA')));
        assert.equal(await page.evaluate(() => JSON.stringify({propostas,logsAuditoria})),before);
        await page.evaluate(() => {window.html2canvas=window.canvasSemFalha;});
        const repeat = page.waitForEvent('download',{timeout:20000});
        await page.locator('#modalRelatorio [data-action="gerarPDF"]').click();
        await (await repeat).saveAs(path.join(out,'interno-repetido.pdf'));
        assert.equal(await page.evaluate(() => JSON.stringify({propostas,logsAuditoria})),before);
        const report = {
            passed:10,failed:0,
            checks:['calculos preservados','previa interna completa','download interno',
                'previa original sem mutacao','estado autoritativo sem mutacao',
                'comercial sem dados internos','download comercial','sem erro de cores',
                'falha registrada e botao recuperado','exportacao apos falha'],
            logs
        };
        fs.writeFileSync(path.join(out,'resultado.json'),JSON.stringify(report,null,2));
        console.log(JSON.stringify(report,null,2));
    } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => {console.error(e.stack);process.exitCode=1;});
