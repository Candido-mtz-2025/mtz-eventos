const {criarServidor}=require('./serve-orcamentos.cjs');
const {chromium}=require(process.env.MTZ_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const results=[];const test=async(name,f)=>{try{await f();results.push({name,ok:true});console.log('PASS',name);}catch(e){results.push({name,ok:false,error:e.stack});console.log('FAIL',name,e.message);}};
(async()=>{const server=criarServidor();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.MTZ_CHROME});
 const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:600}}),p=await ctx.newPage(),url=`http://127.0.0.1:${server.address().port}/?simulacao=legado-sintetico`;
 const ready=async page=>{await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>/Clique|Base confirmada/.test(document.getElementById('localEstado')?.textContent||''));};
 const ref=id=>`proposta:${encodeURIComponent(JSON.stringify([typeof id,id]))}`;
 const edit=async(page,id)=>{await page.click('#propostasSubtabLista');await page.locator(`[data-action="editarProposta"][data-arg="${ref(id)}"]:visible`).first().click();};
 const save=async page=>{await page.locator('[data-action="salvarProposta"]').first().click();await page.waitForFunction(()=>!document.querySelector('[data-action="salvarProposta"]').disabled);return page.locator('#localEstado').textContent();};
 await ready(p);
 const setup=await p.evaluate(async()=>{
  const {criarPropostasLegadasSinteticas}=await import('/homologacao/propostas-legadas-sinteticas.mjs'),m=await import('/assets/js/core/migration-preflight.mjs'),c=await import('/assets/js/core/legacy-state-codec.mjs');
  window.text=v=>c.decodificarTextoEstrito(JSON.stringify(v)).texto;
  const vazio={versao:'12',data:'2026-11-06T12:00:00.000Z',ultimaEdicao:0};
  for(const k of 'locadores pecas locacoes propostas devolucoes contasReceber contasPagar fornecedores categoriasFinanceiras centrosCusto conciliacoesFinanceiras conciliacoesPagamentosPagar movimentacoesEstoque transportes tipos usuarios logsAuditoria modelosChecklist checklistsGerados checklistMontagem checklistEtapasMontagem encargosFinanceiros config checklistConferencia'.split(' '))vazio[k]=JSON.parse(JSON.stringify(window[k]));
  const original=text(criarPropostasLegadasSinteticas(vazio)),op=text({fonte:'arquivo_json',criadoEm:vazio.data,dataReferencia:'2026-11-06'});
  const backup=await m.exportarBackupMigracaoTexto(original,op),restore=await m.restaurarBackupMigracaoIsoladoTexto(backup.backupTexto),dry=await m.simularMigracaoTexto(original,op),art=m.obterArtefatoSimulacaoTexto(dry);
  window.migration={original,op,backup,dry,art,name:'mtz-idb-fundacao-lote1-teste-interdominios-migracao-'+JSON.parse(dry.relatorioTexto).sha256Origem.slice(0,32)};
  return {original,backup,restore,dry,art,name:window.migration.name};
 });
 const dump=page=>page.evaluate(async name=>{const db=await new Promise((ok,no)=>{const q=indexedDB.open(name,2);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});return new Promise((ok,no)=>{const tx=db.transaction(['raiz','historico','auditoria','recibos','controle'],'readonly'),v={};for(const k of tx.objectStoreNames){const q=tx.objectStore(k).getAll();q.onsuccess=()=>v[k]=q.result;}tx.oncomplete=()=>{db.close();ok(JSON.stringify(v));};tx.onabort=()=>{db.close();no(tx.error);};});},setup.name);
 const expected=JSON.parse(setup.original).propostas;
 await test('preflight e backup independente: quatro propostas antigas, dados exatos e nenhum commit',async()=>{
  assert.ok(setup.backup.ok&&setup.restore.ok&&setup.dry.ok&&setup.art.ok);assert.equal(setup.restore.textoOriginal,setup.original);assert.equal(setup.dry.gravado,false);assert.equal(setup.dry.migracaoAutorizada,false);
  assert.equal(await p.evaluate(async()=> (await indexedDB.databases()).length),0);assert.equal(expected.length,4);assert.equal(typeof expected[0].id,'number');assert.equal(typeof expected[1].id,'string');
  if(process.env.MTZ_TEST_OUTPUT){fs.writeFileSync(path.join(process.env.MTZ_TEST_OUTPUT,'legacy-original-sintetico.json'),setup.original);fs.writeFileSync(path.join(process.env.MTZ_TEST_OUTPUT,'legacy-backup-sintetico.json'),setup.backup.backupTexto);}
 });
 await test('migracao nativa real IDB: raiz, clientes, tipos, anexos e historicos identicos',async()=>{
  await p.click('#localIniciar');await p.waitForFunction(()=>document.getElementById('localEstado').textContent==='Base confirmada.');
  const d=JSON.parse(await dump(p));assert.equal(d.raiz[0].snapshotTexto,setup.art.snapshotTexto);
  assert.equal(d.historico.length,1);assert.equal(d.auditoria.length,1);assert.equal(d.recibos.length,1);assert.equal(d.controle.length,1);
  assert.deepEqual(await p.evaluate(()=>JSON.parse(JSON.stringify(propostas))),expected);assert.equal(d.raiz[0].revisao,0);
 });
 await test('reabrir na interface principal sem recalculo fiscal ou gerencial historico',async()=>{
  await ready(p);assert.deepEqual(await p.evaluate(()=>JSON.parse(JSON.stringify(propostas))),expected);
  for(const id of [1,'1','001',expected[3].id]){await edit(p,id);assert.equal(await p.locator('#propostaIdAtual').inputValue(),ref(id));}
  assert.deepEqual(await p.evaluate(()=>JSON.parse(JSON.stringify(propostas))),expected);
 });
 await test('editar somente ID textual migrado, com revisao explicita e evidencias originais',async()=>{
  await edit(p,'1');await p.evaluate(()=>revisarFechamentoGerencialProposta());await p.evaluate(()=>{propEventoNome.value='Evento revisado explicitamente';});
  assert.match(await save(p),/Salvo com sucesso/);
  const list=await p.evaluate(()=>JSON.parse(JSON.stringify(propostas)));
  for(const i of [0,2,3])assert.deepEqual(list[i],expected[i]);
  assert.deepEqual(list[1].anexos,expected[1].anexos);assert.deepEqual(list[1].historicoRevisoes,expected[1].historicoRevisoes);assert.deepEqual(list[1].documentos,expected[1].documentos);
  assert.deepEqual(await p.evaluate(()=>logsAuditoria.find(a=>a.origem==='proposta_transacional').anteriorSnapshot),expected[1]);
 });
 await test('duas abas editam proposta migrada: um commit e um conflito',async()=>{
  const b=await ctx.newPage();await ready(b);await edit(p,'1');await edit(b,'1');
  for(const page of [p,b])await page.evaluate(()=>revisarFechamentoGerencialProposta());
  const rs=await Promise.all([save(p),save(b)]);assert.equal(rs.filter(x=>x.includes('Salvo com sucesso')).length,1);assert.equal(rs.filter(x=>x.includes('Conflito de edição')).length,1);await b.close();
 });
 await ready(p);
 await test('falha transacional sobre registro migrado preserva os cinco stores',async()=>{
  await edit(p,1);await p.evaluate(()=>revisarFechamentoGerencialProposta());const before=await dump(p);
  await p.evaluate(()=>{window.addOriginal=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...a){if(this.name==='historico'){this.transaction.abort();throw Error('falha sintetica');}return window.addOriginal.apply(this,a);};});
  try{assert.doesNotMatch(await save(p),/Salvo com sucesso/);}finally{await p.evaluate(()=>{IDBObjectStore.prototype.add=window.addOriginal;});}
  assert.equal(await dump(p),before);await p.click('#localRecuperar');await p.waitForFunction(()=>!document.getElementById('localRecuperar').disabled);
 });
 await test('resposta perdida de edicao migrada recupera pelo recibo sem duplicar',async()=>{
  await p.evaluate(()=>{window.renderPropostas=()=>{throw Error('resposta visual perdida');};});
  const before=JSON.parse(await dump(p));assert.match(await save(p),/Não confirmado/);
  assert.equal(JSON.parse(await dump(p)).recibos.length,before.recibos.length+1);
  await ready(p);const committed=await dump(p);await p.click('#localRecuperar');await p.waitForFunction(()=>document.getElementById('localEstado').textContent.includes('Salvo com sucesso'));
  assert.equal(await dump(p),committed);assert.equal(await p.locator('#propostaIdAtual').inputValue(),ref(1));
 });
 await test('backup antigo nao pode substituir base com commits novos',async()=>{
  const before=await dump(p);
  const r=await p.evaluate(async setup=>{const {criarGatewayInterdominiosDeEnsaio}=await import('/assets/js/core/interdomain-command-registry.mjs');const g=criarGatewayInterdominiosDeEnsaio({ensaioSintetico:true,nomeBanco:setup.name,identidadeBaseTexto:setup.art.identidadeBaseTexto,origemLedgerTexto:setup.art.ledgerTexto,dataReferencia:'2026-11-06',obterAtorAutorizado:()=> 'ensaio:comercial-local'});const e=await g.prepararImportacao('restauracao.antiga',setup.art.snapshotTexto);return e.ok?g.executar(e.entrada):e;},setup);
  assert.equal(r.ok,false);assert.equal(await dump(p),before);
 });
 await test('duplicidade, vinculos orfaos e valores adulterados bloqueados sem normalizar origem',async()=>{
  const rs=await p.evaluate(async setup=>{const m=await import('/assets/js/core/migration-preflight.mjs');const out=[];
   for(const caso of ['duplicado','cliente','anexo','valor']){const s=JSON.parse(setup.original);if(caso==='duplicado')s.propostas.push(s.propostas[0]);if(caso==='cliente')s.propostas[0].clienteId='cliente-inexistente';if(caso==='anexo')s.propostas[0].anexos[0].propostaId='outro';if(caso==='valor')s.propostas[0].financeiro.valorFinal+=0.01;const text=JSON.stringify(s),r=await m.simularMigracaoTexto(text,JSON.stringify({fonte:'arquivo_json',criadoEm:'2026-11-06T12:00:00.000Z',dataReferencia:'2026-11-06'}));out.push({caso,ok:r.ok,gravado:r.gravado,autorizado:r.migracaoAutorizada,igual:text===JSON.stringify(s)});}return out;},setup);
  for(const r of rs){assert.equal(r.ok,false,r.caso);assert.equal(r.gravado,false);assert.equal(r.autorizado,false);assert.equal(r.igual,true);}
 });
 await test('PDF comercial recuperado preserva valor e oculta resultado interno',async()=>{
  await edit(p,expected[3].id);await p.evaluate(()=>gerarPDFPropostaAtualCliente());assert.equal(await p.locator('#modalRelatorio').evaluate(e=>e.classList.contains('active')),true);
  const txt=await p.locator('#printArea').innerText();assert.match(txt,/3\.520,00/);assert.doesNotMatch(txt,/Depreciação|Resultado gerencial|Custos reais/);await p.evaluate(()=>fecharModal('modalRelatorio'));
 });
 await test('foco e rolagem em janela baixa: sem restauracao atrasada e botoes clicaveis',async()=>{
  await edit(p,1);await p.evaluate(()=>revisarFechamentoGerencialProposta());
  await p.locator('#propClienteNome').focus();await p.locator('#propClienteNome').press('End');
  await p.evaluate(()=>recalcularResumoProposta());
  await p.locator('#propClienteTelefone').click();await p.evaluate(()=>window.scrollTo({top:500,behavior:'instant'}));
  const before=await p.evaluate(()=>({id:document.activeElement.id,y:scrollY}));await p.waitForTimeout(1500);
  assert.deepEqual(await p.evaluate(()=>({id:document.activeElement.id,y:scrollY})),before);
  const offsets=await p.evaluate(()=>({nav:getComputedStyle(document.documentElement).getPropertyValue('--app-nav-height'),sticky:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-sticky-total-height'))}));
  assert.equal(offsets.nav.trim(),'0px');assert.ok(offsets.sticky<200);
  assert.match(await save(p),/Salvo com sucesso/);assert.equal(await p.locator('#toast').isVisible(),true);
  const box=await p.locator('#toast').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=600);
 });
 await test('erro visivel e foco livre apos validacao em janela baixa',async()=>{
  const before=await dump(p);await p.evaluate(()=>limparFormularioProposta());assert.doesNotMatch(await save(p),/Salvo com sucesso/);
  await p.waitForFunction(()=>document.activeElement.id==='propClienteNome');
  const box=await p.locator('#propClienteNome').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=600);
  assert.equal(await p.locator('#toast').isVisible(),true);await p.locator('#propClienteTelefone').click();await p.waitForTimeout(2500);
  assert.equal(await p.evaluate(()=>document.activeElement.id),'propClienteTelefone');assert.equal(await dump(p),before);
 });
 if(process.env.MTZ_TEST_OUTPUT)await p.screenshot({path:path.join(process.env.MTZ_TEST_OUTPUT,'migracao-interface-600.png'),fullPage:true});
}finally{await browser?.close();await new Promise(r=>server.close(r));}
const report={passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};if(process.env.MTZ_TEST_OUTPUT)fs.writeFileSync(path.join(process.env.MTZ_TEST_OUTPUT,'migration-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
