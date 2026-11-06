const {criarServidor}=require('./serve-orcamentos.cjs');
const {chromium}=require(process.env.MTZ_PLAYWRIGHT || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const results=[],errors=[],server=criarServidor();let pagina;
const test=async(name,fn)=>{try{await fn();results.push({name,ok:true});console.log('PASS',name);}catch(e){results.push({name,ok:false,error:e.stack});console.log('FAIL',name,e.message);if(process.env.MTZ_TEST_OUTPUT&&pagina)await pagina.screenshot({path:path.join(process.env.MTZ_TEST_OUTPUT,'failure-'+name.replace(/[^a-zA-Z0-9]/g,'-')+'.png')});}};
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.MTZ_CHROME});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:600}}),page=await context.newPage();
 pagina=page;
 const url=`http://127.0.0.1:${server.address().port}`;
 const watch=p=>p.on('pageerror',e=>errors.push(e.stack));watch(page);
 const boot=async p=>{await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>/Clique|Base confirmada/.test(document.querySelector('#localEstado')?.textContent||''));};
 const msg=p=>p.locator('#localEstado').textContent();
 const root=p=>p.evaluate(()=>JSON.parse(JSON.stringify(propostas)));
 const section=(p,s)=>p.evaluate(s=>mostrarSecaoFormularioProposta(s,{semRolagem:true,foco:false,ignorarValidacao:true}),s);
 const save=async p=>{await p.waitForFunction(()=>document.getElementById('tab-propostas').getAttribute('aria-busy')!=='true');
  const b=p.locator('[data-action="salvarProposta"]').first();await b.click();await p.waitForFunction(()=>!document.querySelector('[data-action="salvarProposta"]').disabled);return msg(p);};
 const edit=async p=>{await p.locator('#propostasSubtabLista').click();await p.locator('[data-action="editarProposta"]:visible').first().click();await p.waitForFunction(()=>document.getElementById('tab-propostas').getAttribute('aria-busy')!=='true');};
 const review=p=>p.evaluate(()=>revisarFechamentoGerencialProposta());
 const dump=p=>p.evaluate(async()=>{const name='mtz-idb-fundacao-lote1-teste-interdominios-orcamentos-local-v1';const db=await new Promise((ok,no)=>{const r=indexedDB.open(name,2);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});return new Promise((ok,no)=>{const tx=db.transaction(['raiz','historico','auditoria','recibos','controle'],'readonly'),data={};for(const k of tx.objectStoreNames){const r=tx.objectStore(k).getAll();r.onsuccess=()=>data[k]=r.result;}tx.oncomplete=()=>{db.close();ok(JSON.stringify(data));};tx.onabort=()=>{db.close();no(tx.error);};});});
 await boot(page);
 await test('isolamento: nenhum banco antes da criacao explicita e salvarLocal bloqueado',async()=>{assert.deepEqual(await page.evaluate(async()=>await indexedDB.databases()),[]);assert.equal(await page.evaluate(()=>salvarLocal()),false);});
 await test('criacao sintetica explicita e formulario original',async()=>{await page.click('#localIniciar');await page.waitForFunction(()=>document.querySelector('#localEstado').textContent==='Base confirmada.');assert.equal(await page.evaluate(()=>__permitirEscritaLegada()),false);});
 let expected,first;
 await test('A: criar pela UI: misto, custos, retencoes e depreciacao unica',async()=>{
  await page.locator('#propClienteNome').fill('Empresa sintetica - teste');await page.locator('#propClienteTelefone').fill('000000000');
  await section(page,'evento');await page.locator('#propEventoNome').fill('Evento sintetico');await page.locator('#propDataEvento').fill('2026-12-10');
  expected=await page.evaluate(()=>{
   const v=(s,value)=>{document.querySelector(s).value=value;};
   v('.prop-item-descricao','Estrutura mista sintetica');v('.prop-item-tipo-fiscal','cessao_estrutura_temporaria_3_05');v('.prop-item-unitario','1000');v('.prop-item-quantidade','3');
   v('.prop-item-origem-custo','misto');v('.prop-item-quantidade-propria','2');v('.prop-item-quantidade-terceirizada','1');v('.prop-item-custo-terceirizado-real','450');
   v('#propCustoFrete','300');v('#propCustoMaoObra','200');v('#propMaoObraPessoas','2');v('#propMaoObraValorPessoaDia','80');v('#propMaoObraDias','1');
   v('#propDesconto','100');v('#propAcrescimo','120');v('#propDataFiscalGerencial','2026-11-06');
   adicionarTributoGerencial({nome:'ISS',codigo:'ISS',natureza:'tributo',baseCalculo:'manual',baseManual:1000,percentual:3,incidencia:'aplica',tipoFiscalAlvo:'cessao_estrutura_temporaria_3_05'});
   adicionarTributoGerencial({nome:'IRRF',codigo:'IRRF',natureza:'retencao',baseCalculo:'comercial',percentual:1.5,incidencia:'aplica'});
   recalcularResumoProposta();
   return calcularFechamentoGerencialProposta({itens:[{descricao:'Estrutura mista sintetica',categoria:'outros',tipoFiscal:'verificar_contador',quantidade:3,periodoDias:1,custoUnitario:1000,origemCusto:'misto',quantidadePropria:2,quantidadeTerceirizada:1,custoTerceirizadoReal:450,aplicarHonorarios:true,percentualHonorarios:0,aplicarEncargos:true,percentualEncargos:0,aplicarINSS:false}],custos:{frete:300,maoObra:200},controleInterno:{maoObraOperacional:{pessoas:2,dias:1,valorPessoaDia:80,total:160}},desconto:100,acrescimo:120,percentualEntrada:50,dataFiscal:'2026-11-06',tributos:[{nome:'ISS',codigo:'ISS',natureza:'tributo',baseCalculo:'manual',baseManual:1000,percentual:3,incidencia:'aplica'},{nome:'IRRF',codigo:'IRRF',natureza:'retencao',baseCalculo:'comercial',percentual:1.5,incidencia:'aplica'}]});
  });
  assert.match(await save(page),/Salvo com sucesso/);first=(await root(page))[0];const f=first.controleInterno.fechamentoGerencial;
  for(const k of ['valorFinal','custoTotalProposta','tributosTotal','retencoesTotal','lucroPrevisto','depreciacaoGerencial','valorLiquidoPrevisto'])assert.equal(f[k],expected[k],k);
  assert.equal(f.valorFinal,3520);assert.equal(f.custoTotalProposta,610);assert.equal(f.tributosTotal,30);assert.equal(f.retencoesTotal,52.8);assert.equal(f.depreciacaoGerencial,576);assert.equal(f.lucroPrevisto,2304);
 });
 if(!first)throw Error('Primeira criacao nao confirmada; testes dependentes interrompidos.');
 await test('B: recarga recupera exatamente a proposta confirmada',async()=>{await boot(page);assert.deepEqual((await root(page))[0],first);});
 await test('historico nao recalculado; salvar exige revisao explicita',async()=>{await edit(page);const before=await dump(page);assert.match(await save(page),/histórico preservado/);assert.equal(await dump(page),before);assert.deepEqual((await root(page))[0],first);});
 await test('C: editar e salvar; anterior preservado na auditoria',async()=>{await review(page);await section(page,'evento');await page.locator('#propEventoNome').fill('Evento editado');assert.match(await save(page),/Salvo com sucesso/);const p=(await root(page))[0];assert.equal(p.id,first.id);assert.equal(p.evento.nome,'Evento editado');assert.deepEqual(p.controleInterno.fechamentoGerencial,first.controleInterno.fechamentoGerencial);assert.deepEqual(await page.evaluate(()=>logsAuditoria[1].anteriorSnapshot),first);});
 await test('D: repetir Salvar sem duplicidade',async()=>{const before=await dump(page);await save(page);assert.equal(await dump(page),before);assert.equal((await root(page)).length,1);});
 const other=await context.newPage();watch(other);await boot(other);
 await test('E: duas abas: um commit e um conflito',async()=>{await edit(page);await edit(other);await review(page);await review(other);await section(page,'evento');await section(other,'evento');await page.locator('#propEventoNome').fill('Aba A');await other.locator('#propEventoNome').fill('Aba B');const rs=await Promise.all([save(page),save(other)]);assert.equal(rs.filter(x=>x.includes('Salvo com sucesso')).length,1);assert.equal(rs.filter(x=>x.includes('Conflito de edição')).length,1);});
 await page.click('#localAtualizar');await edit(page);await review(page);
 await test('F: falha de escrita: cinco stores intactos, sem falso sucesso',async()=>{
  const before=await dump(page);await page.evaluate(()=>{window.putOriginal=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...a){if(this.name==='raiz'&&this.transaction.mode==='readwrite'){this.transaction.abort();throw Error('falha sintetica');}return window.putOriginal.apply(this,a);};});
  try{assert.doesNotMatch(await save(page),/Salvo com sucesso/);}finally{await page.evaluate(()=>{IDBObjectStore.prototype.put=window.putOriginal;});}
  assert.equal(await dump(page),before);await page.click('#localRecuperar');await page.waitForFunction(()=>!document.getElementById('localRecuperar').disabled);assert.match(await msg(page),/não confirmada/);
 });
 await test('G: perda de publicacao apos commit e recuperacao por recibo',async()=>{
  await page.evaluate(()=>{window.renderPropostas=()=>{throw Error('falha visual sintetica');};});
  const before=JSON.parse(await dump(page));assert.match(await save(page),/Não confirmado/);
  const after=JSON.parse(await dump(page));assert.equal(after.recibos.length,before.recibos.length+1);
  await boot(page);const committed=await dump(page);await page.click('#localRecuperar');await page.waitForFunction(()=>document.querySelector('#localEstado').textContent.includes('Salvo com sucesso'));assert.equal(await dump(page),committed);
  assert.equal(await page.locator('#propostaIdAtual').inputValue(),`proposta:${encodeURIComponent(JSON.stringify(['string',first.id]))}`);
 });
 await test('H: snapshot historico inicial preservado integralmente',async()=>{assert.deepEqual(await page.evaluate(()=>logsAuditoria[0].registroSnapshot),first);});
 await test('J: valores fiscais e gerenciais inalterados pela persistencia',async()=>{const f=(await root(page))[0].controleInterno.fechamentoGerencial;for(const k of ['valorFinal','custoTotalProposta','tributosTotal','retencoesTotal','lucroPrevisto','depreciacaoGerencial'])assert.equal(f[k],expected[k],k);});
 await test('I: previa e PDF recuperado sem custos internos no comercial',async()=>{
  await edit(page);await page.evaluate(()=>gerarPDFPropostaAtualCliente());
  assert.equal(await page.locator('#modalRelatorio').evaluate(e=>e.classList.contains('active')),true);
  const content=await page.locator('#printArea').innerText();assert.match(content,/3\.520,00/);assert.doesNotMatch(content,/2\.304,00|576,00|Custos reais|Depreciação/);
  await page.waitForFunction(()=>window.jspdf?.jsPDF&&window.html2canvas,{},{timeout:15000});
  const download=page.waitForEvent('download',{timeout:45000});await page.locator('#modalRelatorio [data-action="gerarPDF"]').click();const d=await download;const file=await d.path();assert.ok(fs.statSync(file).size>1000);
  if(process.env.MTZ_TEST_OUTPUT)await d.saveAs(path.join(process.env.MTZ_TEST_OUTPUT,'proposta-sintetica.pdf'));
  await page.evaluate(()=>fecharModal('modalRelatorio'));
 });
 await test('raiz congelada, sem escritores legados ou efeitos financeiros',async()=>{assert.deepEqual(await page.evaluate(()=>{let threw=false;try{propostas.push({id:'intruso'});}catch(_){threw=true;}return {threw,legacy:__permitirEscritaLegada(),customer:typeof window.__pilotoCadastros,receber:contasReceber.length,pagar:contasPagar.length,locacoes:locacoes.length};}),{threw:true,legacy:false,customer:'undefined',receber:0,pagar:0,locacoes:0});});
 await test('nova janela preserva identidade e recibos',async()=>{const before=await dump(page);const p=await context.newPage();await boot(p);assert.equal(await dump(p),before);assert.deepEqual(await root(p),await root(page));await p.close();});
 await test('UI: mao de obra desmarcada preserva entrada sem cobrar',async()=>{
  await edit(page);await review(page);await page.evaluate(()=>{document.getElementById('propIncluirMaoObra').checked=false;recalcularResumoProposta();});
  assert.match(await save(page),/Salvo com sucesso/);
  const f=(await root(page))[0].controleInterno.fechamentoGerencial;
  assert.equal(f.valorFinal,3320);assert.equal(f.custoTotalProposta,450);assert.equal(f.maoObraComercialInformada,200);
  await boot(page);assert.deepEqual((await root(page))[0].controleInterno.fechamentoGerencial,f);
 });
 await test('UI: adicionar e remover item antes do commit',async()=>{
  await edit(page);await review(page);await page.evaluate(()=>adicionarLinhaItemProposta());
  assert.equal(await page.locator('#propostaItensBody .proposta-item-row').count(),2);
  await page.evaluate(()=>{const l=document.querySelectorAll('#propostaItensBody .proposta-item-row')[1];l.querySelector('.prop-item-descricao').value='Item temporario';l.querySelector('.prop-item-unitario').value='10';recalcularResumoProposta();});
  await page.locator('#propostaItensBody .proposta-item-row').nth(1).locator('[data-action="removerLinhaItemProposta"]').evaluate(el=>el.click());
  assert.equal(await page.locator('#propostaItensBody .proposta-item-row').count(),1);
  assert.match(await save(page),/Salvo com sucesso/);assert.equal((await root(page))[0].itens.length,1);
 });
 if(process.env.MTZ_TEST_OUTPUT){await page.screenshot({path:path.join(process.env.MTZ_TEST_OUTPUT,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(process.env.MTZ_TEST_OUTPUT,'mobile.png'),fullPage:true});}
 await test('nenhum erro JavaScript inesperado',()=>assert.deepEqual(errors,[]));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
const report={passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
if(process.env.MTZ_TEST_OUTPUT)fs.writeFileSync(path.join(process.env.MTZ_TEST_OUTPUT,'ui-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
