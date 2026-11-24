const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.MTZ_PLAYWRIGHT || 'playwright');
const { criarServidor } = require('./serve-orcamentos.cjs');

const repo = path.resolve(__dirname, '..');
const baseline = 'a15d3eb51bdb987ed83e25774da20c1fd1fbe8cd';
const results = [];
const output = process.env.MTZ_TEST_OUTPUT;
const old = file => execFileSync('git', ['show', `${baseline}:${file}`], { cwd: repo, encoding: 'utf8' });
const fixture = {
    itens: [{ descricao: 'Estrutura temporaria sintetica', tipoFiscal: 'cessao_estrutura_temporaria_3_05',
        origemCusto: 'misto', quantidade: 3, quantidadePropria: 2, quantidadeTerceirizada: 1,
        custoUnitario: 2000, periodoDias: 1, custoTerceirizadoReal: 1200,
        aplicarHonorarios: false, aplicarEncargos: false, aplicarINSS: false }],
    custos: { frete: 400, maoObra: 600 }, controleInterno: { custoInternoTotal: 500 },
    desconto: 200, percentualNF: 0, tipoCalculoNF: 'descontar', incluirMaoObra: true,
    tipoDescontoFiscal: 'incondicional', dataFiscal: '2026-11-18',
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

(async () => {
    const server = criarServidor();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.MTZ_CHROME });
    const contexts = [];
    try {
        if (output) fs.mkdirSync(output, { recursive: true });
        const open = async previous => {
            const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
            contexts.push(context);
            if (previous) {
                const html = old('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<link[^>]*rel="manifest"[^>]*>/gi, '')
                    .replace('</head>', '<meta name="mtz-homologacao" content="orcamentos-sinteticos-v1"></head>')
                    .replace('</body>', '<script type="module" src="/homologacao/orcamentos.mjs"></script></body>');
                await context.route(`${url}/index.html`, r => r.fulfill({ contentType: 'text/html', body: html }));
                await context.route('**/assets/js/modules/propostas.js*', r => r.fulfill({ contentType: 'text/javascript', body: old('assets/js/modules/propostas.js') }));
                await context.route('**/assets/css/style.css*', r => r.fulfill({ contentType: 'text/css', body: old('assets/css/style.css') }));
            }
            const page = await context.newPage();
            await page.goto(url + '/index.html');
            await page.waitForFunction(() => document.getElementById('localEstado')?.textContent.includes('Clique'));
            return page;
        };
        const fill = async (p, previous) => {
            await p.fill('#propClienteNome', 'Cliente ficticio usabilidade');
            await p.fill('#propClienteTelefone', '00000000');
            await p.click('#propostaFormTabEvento');
            await p.fill('#propEventoNome', 'Evento ficticio usabilidade');
            await p.fill('#propDataEvento', '2026-12-15');
            await p.click('#propostaFormTabItens');
            await p.click('#propBtnAdicionarItem');
            await p.fill('.prop-item-descricao', fixture.itens[0].descricao);
            await p.fill('.prop-item-quantidade', '3');
            await p.fill('.prop-item-unitario', '2000');
            if (previous) await p.click('.prop-details-toggle-btn');
            await p.selectOption('.prop-item-origem-custo', 'misto');
            await p.fill('.prop-item-quantidade-propria', '2');
            await p.fill('.prop-item-quantidade-terceirizada', '1');
            await p.fill('.prop-item-custo-terceirizado-real', '1200');
            if (!previous) await p.click('.prop-details-toggle-btn');
            await p.selectOption('.prop-item-tipo-fiscal', 'cessao_estrutura_temporaria_3_05');
            await p.click('.prop-details-toggle-btn');
            await p.locator('#propostaSecaoItens h4').click();
            if (output) await p.locator('#propostaSecaoItens').screenshot({ path: path.join(output, previous ? 'itens-antes.png' : 'itens-depois.png') });
            await p.click('#propostaFormTabLogistica');
            await p.fill('#propCustoFrete', '400');
            await p.fill('#propMaoObraMontagemPessoas', '2');
            await p.fill('#propMaoObraMontagemValorPessoaDia', '300');
            await p.fill('#propMaoObraMontagemDias', '1');
            await p.fill('#propCustoInternoTotal', '500');
            await p.click('#propostaFormTabComercial');
            await p.fill('#propDesconto', '200');
            await p.selectOption('#propTipoDescontoFiscal', 'incondicional');
            await p.fill('#propDataFiscalGerencial', '2026-11-18');
            await p.evaluate(tributos => tributos.forEach(t => adicionarTributoGerencial(t)), fixture.tributos);
        };
        const before = await open(true), after = await open(false);
        await test('fluxo comercial antes e depois sem salvar nem gerar PDF', async () => { await fill(before, true); await fill(after, false); });
        const read = async p => {
            // O resumo existente e publicado 50 ms depois de sair do campo.
            await p.evaluate(() => document.activeElement?.blur());
            await p.waitForTimeout(100);
            return p.evaluate(() => Object.fromEntries([
            'propSubtotal', 'propValorFinal', 'propCustoTotalProposta', 'propLucroPrevisto', 'propMargemPrevista',
            'propValorLiquidoPrevisto', 'propValorEntrada', 'propValorSaldo'
        ].map(id => [id, document.getElementById(id).value])));
        };
        await test('valores da interface identicos ao commit anterior', async () => {
            const atual = await read(after); assert.deepEqual(atual, await read(before));
            assert.equal(atual.propValorFinal, 'R$\u00a06.800,00');
            assert.equal(atual.propCustoTotalProposta, 'R$\u00a01.700,00');
            assert.match(atual.propLucroPrevisto, /4\.016,00/);
        });
        await test('fechamento integral identico e exemplo numerico exato', async () => {
            const a = await before.evaluate(d => calcularFechamentoGerencialProposta(d), fixture);
            const b = await after.evaluate(d => calcularFechamentoGerencialProposta(d), fixture);
            assert.deepEqual(b, a);
            assert.deepEqual([b.valorFinal, b.custoTotalProposta, b.tributosTotal, b.encargosTotal, b.retencoesTotal,
                b.resultadoAntesDepreciacao, b.depreciacaoGerencial, b.lucroPrevisto, b.caixaAposRetencoes],
            [6800, 1700, 60, 20, 102, 5020, 1004, 4016, 6698]);
            if (output) fs.writeFileSync(path.join(output, 'comparacao-calculos.json'), JSON.stringify({ baseline, antes: a, depois: b }, null, 2));
        });
        await test('proprio, terceirizado, misto, mao de obra opcional e prejuizo preservados', async () => {
            for (const origem of ['proprio', 'terceirizado', 'misto']) for (const incluirMaoObra of [true, false]) {
                const d = structuredClone(fixture); d.incluirMaoObra = incluirMaoObra; d.itens[0].origemCusto = origem;
                const a = await before.evaluate(d => calcularFechamentoGerencialProposta(d), d);
                const b = await after.evaluate(d => calcularFechamentoGerencialProposta(d), d);
                assert.deepEqual(b, a);
                if (origem === 'proprio') assert.equal(b.itensCalculados[0].custoInternoItemTotal, 0);
            }
            const d = structuredClone(fixture); d.controleInterno.custoInternoTotal = 10000;
            assert.deepEqual(await after.evaluate(d => calcularFechamentoGerencialProposta(d), d), await before.evaluate(d => calcularFechamentoGerencialProposta(d), d));
            assert.equal((await after.evaluate(d => calcularFechamentoGerencialProposta(d), d)).depreciacaoGerencial, 0);
        });
        await test('composicao visivel sem abrir detalhes e quantidade unica', async () => {
            await after.click('#propostaFormTabItens');
            for (const s of ['.prop-item-origem-custo', '.prop-item-quantidade-propria', '.prop-item-quantidade-terceirizada', '.prop-item-custo-terceirizado-real']) {
                assert.equal(await after.locator(s).count(), 1); assert.ok(await after.locator(s).isVisible());
            }
            assert.equal(await after.locator('.prop-item-advanced').isVisible(), false);
            const value = await read(after); await after.click('#propBtnExpandirCalculosItens');
            assert.ok(await after.locator('.prop-item-advanced').isVisible());
            await after.click('#propBtnExpandirCalculosItens'); assert.deepEqual(await read(after), value);
        });
        await test('origem propria e terceirizada sincronizam quantidades sem custo ficticio', async () => {
            await after.selectOption('.prop-item-origem-custo', 'proprio');
            assert.equal(await after.inputValue('.prop-item-quantidade-propria'), '3');
            assert.equal(await after.inputValue('.prop-item-quantidade-terceirizada'), '0');
            assert.equal(await after.locator('.prop-item-custo-terceirizado-real').isVisible(), false);
            assert.ok(await after.locator('.prop-item-quantidade-propria').evaluate(el => el.readOnly));
            await after.selectOption('.prop-item-origem-custo', 'terceirizado');
            assert.equal(await after.inputValue('.prop-item-quantidade-terceirizada'), '3');
            assert.ok(await after.locator('.prop-item-custo-terceirizado-real').isVisible());
            await after.selectOption('.prop-item-origem-custo', 'misto');
            await after.fill('.prop-item-quantidade-propria', '2'); await after.fill('.prop-item-quantidade-terceirizada', '1');
        });
        await test('composicao mista invalida continua recusada', async () => {
            await after.fill('.prop-item-quantidade-propria', '9');
            assert.ok(await after.locator('.prop-item-divisao-mista-erro').isVisible());
            await after.fill('.prop-item-quantidade-propria', '2');
            assert.equal(await after.locator('.prop-item-divisao-mista-erro').isVisible(), false);
        });
        await test('opcionais recolhidos preservam despesa e fechamento', async () => {
            await after.click('#propostaFormTabLogistica');
            const detail = after.locator('details').filter({ has: after.locator('#propHospedagemPessoas') });
            assert.equal(await detail.evaluate(el => el.open), false);
            await detail.locator('summary').click();
            await after.fill('#propHospedagemPessoas', '2'); await after.fill('#propHospedagemDiarias', '1'); await after.fill('#propHospedagemValorDiariaPessoa', '80');
            const a = await read(after); await detail.locator('summary').click();
            await after.fill('#propCustoFrete', '400');
            assert.equal(await detail.evaluate(el => el.open), false);
            assert.equal(await after.inputValue('#propHospedagemValorDiariaPessoa'), 'R$\u00a080,00');
            assert.deepEqual(await read(after), a);
            await detail.locator('summary').click();
            await after.fill('#propHospedagemValorDiariaPessoa', '0');
            await after.fill('#propHospedagemPessoas', '0'); await after.fill('#propHospedagemDiarias', '0');
            assert.equal((await read(after)).propCustoTotalProposta, 'R$\u00a01.700,00');
        });
        await test('modalidade fiscal impede troca com tributo ativo sem apagar dados', async () => {
            await after.click('#propostaFormTabComercial');
            const previous = await read(after);
            await after.selectOption('#propModalidadeFiscal', 'agregado');
            assert.equal(await after.inputValue('#propModalidadeFiscal'), 'individualizado');
            assert.ok(await after.locator('#propModalidadeFiscalAviso').isVisible());
            assert.equal(await after.locator('#propPercentualNF').isEnabled(), false);
            assert.deepEqual(await read(after), previous);
        });
        await test('agregado bloqueia tributo individual e conserva retencoes', async () => {
            const p = await open(false); await p.click('#propostaFormTabComercial');
            await p.selectOption('#propModalidadeFiscal', 'agregado'); await p.fill('#propPercentualNF', '3');
            await p.selectOption('#propModalidadeFiscal', 'individualizado');
            assert.equal(await p.inputValue('#propModalidadeFiscal'), 'agregado'); assert.equal(await p.inputValue('#propPercentualNF'), '3');
            await p.click('#propAdicionarTributo');
            assert.equal(await p.inputValue('[data-tributo="natureza"]'), 'retencao');
            assert.ok(await p.locator('[data-tributo="natureza"] option[value="tributo"]').evaluate(el => el.disabled));
            await p.fill('#propPercentualNF', '0'); await p.selectOption('#propModalidadeFiscal', 'individualizado');
            assert.equal(await p.locator('[data-tributo="natureza"] option[value="tributo"]').evaluate(el => el.disabled), false);
        });
        await test('duplicidade preexistente permanece bloqueada e visivel para correcao', async () => {
            await after.evaluate(() => { document.getElementById('propPercentualNF').value = '3'; recalcularResumoProposta(); });
            assert.match(await after.locator('#propFechamentoGerencial').innerText(), /FISCAL_AGREGADO_E_INDIVIDUAL_DUPLICADOS/);
            assert.ok(await after.locator('#propFiscalAgregadoCampos').isVisible());
            await after.fill('#propPercentualNF', '0');
            await after.locator('#propTributosTitulo').click();
            await after.waitForFunction(() => document.getElementById('propFechamentoGerencial').textContent.includes('Faturamento previsto'), null, {timeout: 2000})
                .catch(async () => { throw Error(await after.locator('#propFechamentoGerencial').innerText()); });
        });
        await test('resumo explicita faturamento, encargos, tributos e pendencia fiscal', async () => {
            const text = await after.locator('#propFechamentoGerencial').innerText();
            for (const label of ['Faturamento previsto', 'Custos reais', 'Tributos configurados', 'Encargos', 'Depreciação gerencial', 'Resultado gerencial', 'não lucro contábil', 'Fiscal pendente']) assert.ok(text.includes(label), label);
            assert.equal((text.match(/Depreciação gerencial/g) || []).length, 1);
            if (output) await after.locator('#propFechamentoGerencial').screenshot({ path: path.join(output, 'resumo-depois.png') });
        });
        await test('componentes em desktop e janela estreita sem sobreposicao', async () => {
            for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 700 }]) {
                await after.setViewportSize(viewport); await after.click('#propostaFormTabItens');
                const boxes = await after.locator('.prop-item-composicao .form-group').evaluateAll(els => els.filter(el => !el.hidden).map(el => {
                    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
                }));
                for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
                    const a = boxes[i], b = boxes[j]; assert.ok(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1);
                }
                const fit = await after.locator('.prop-item-composicao').evaluate(el => {
                    const r = el.getBoundingClientRect(), container = el.closest('.proposta-items-table-wrap').getBoundingClientRect();
                    return r.left >= container.left - 1 && r.right <= container.right + 1;
                });
                assert.ok(fit, 'Composicao deve caber sem rolagem horizontal');
                if (viewport.width < 760) {
                    const stepsFit = await after.locator('.proposta-form-tab').evaluateAll(els => els.every(el => {
                        const t = el.querySelector('.proposta-step-text').getBoundingClientRect();
                        const s = el.querySelector('.proposta-step-status').getBoundingClientRect();
                        return t.bottom <= s.top + 1;
                    }));
                    assert.ok(stepsFit, 'Status nao pode sobrepor o texto das etapas');
                }
                if (output) await after.locator('#propostaSecaoItens').screenshot({ path: path.join(output, `viewport-${viewport.width}.png`) });
            }
        });
        await test('nenhuma base IndexedDB criada durante o ensaio de interface', async () => {
            assert.deepEqual(await before.evaluate(() => indexedDB.databases()), []);
            assert.deepEqual(await after.evaluate(() => indexedDB.databases()), []);
        });
    } finally {
        for (const context of contexts) await context.close();
        await browser.close(); await new Promise(r => server.close(r));
    }
    const report = { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results };
    if (output) fs.writeFileSync(path.join(output, 'resultados-usabilidade.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); if (report.failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
