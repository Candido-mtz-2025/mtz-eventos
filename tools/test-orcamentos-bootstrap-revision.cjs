const {criarServidor}=require('./serve-orcamentos.cjs');
const {chromium}=require(process.env.MTZ_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(process.env.MTZ_TEST_OUTPUT);
(async()=>{
 const server=criarServidor();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.MTZ_CHROME});
 try {
  const context=await browser.newContext({acceptDownloads:true});
  if(process.env.MTZ_REPRO_ORIGINAL==='1'){
   const original=require('node:child_process').execFileSync('git',
    ['show','94c2c6966af7621c8f60cc64030eb7f5f0f000ba:homologacao/orcamentos.mjs'],{encoding:'utf8'});
   await context.route('**/homologacao/orcamentos.mjs',route=>route.fulfill({body:original,contentType:'text/javascript'}));
  }
  await context.route('**/assets/js/core/write-authority-boundary.mjs',async route=>{
   const response=await route.fetch();const source=await response.text();
   assert.equal(source.split('function comando(d) {').length,2);
   await route.fulfill({response,body:source.replace('function comando(d) {',
    'function comando(d) { globalThis.__pedidosTeste ??= []; globalThis.__pedidosTeste.push(JSON.parse(JSON.stringify(d)));')});
  });
  const page=await context.newPage(),url='http://127.0.0.1:'+server.address().port+'/';
  const ready=async p=>{await p.goto(url);await p.waitForFunction(()=>/Clique|Base confirmada/.test(document.querySelector('#localEstado')?.textContent||''));};
  const dump=p=>p.evaluate(async()=>{
   const db=await new Promise((ok,no)=>{const q=indexedDB.open('mtz-idb-fundacao-lote1-teste-interdominios-orcamentos-local-v1',2);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
   return new Promise((ok,no)=>{const tx=db.transaction(['raiz','historico','auditoria','recibos','controle'],'readonly'),all={};
    for(const s of tx.objectStoreNames){const q=tx.objectStore(s).getAll();q.onsuccess=()=>all[s]=q.result;}
    tx.oncomplete=()=>{db.close();ok(JSON.stringify(all));};tx.onabort=()=>{db.close();no(tx.error);};
   });
  });
  const fill=async(p,percentual)=>{
   if(await p.locator('.prop-item-descricao').count()===0){
    await p.locator('#propostaFormTabItens').click();await p.locator('#propBtnAdicionarItem').click();
   }
   return p.evaluate(percentual=>{
   propClienteNome.value='Cliente ficticio revisao bootstrap';
   propClienteTelefone.value='00000000';propEventoNome.value='Evento ficticio bootstrap';propDataEvento.value='2026-12-10';
   document.querySelector('.prop-item-descricao').value='Estrutura ficticia';
   document.querySelector('.prop-item-unitario').value='1500';
   document.querySelector('.prop-item-origem-custo').value='proprio';
   document.querySelector('.prop-item-percentual-encargos').value=String(percentual);
   propCustoInternoTotal.value='300';recalcularResumoProposta();
  },percentual);};
  const save=async p=>{
   await p.locator('[data-action="salvarProposta"]').first().click();
   await p.waitForFunction(()=>!document.querySelector('[data-action="salvarProposta"]').disabled);
   return p.locator('#localEstado').textContent();
  };
  await ready(page);await page.click('#localIniciar');
  await page.waitForFunction(()=>document.querySelector('#localEstado').textContent==='Base confirmada.');
  await fill(page,0);assert.match(await save(page),/Salvo com sucesso/);
  const before=await dump(page);
  await ready(page);await fill(page,Number(process.env.MTZ_TEST_ENCARGO??2));
  const result=await save(page),after=await dump(page);
  const pedidos=await page.evaluate(()=>__pedidosTeste);
  const pedido=pedidos[pedidos.length-1];
  const receiptFound=JSON.parse(after).recibos.some(r=>JSON.stringify(r).includes(pedido.operacaoId));
  const journalFound=JSON.parse(after).historico.some(r=>JSON.stringify(r).includes(pedido.operacaoId));
  fs.writeFileSync(path.join(out,'tentativa.json'),JSON.stringify({result,pedido,receiptFound,journalFound,storesIguais:before===after},null,2));
  fs.writeFileSync(path.join(out,'cinco-stores-anteriores.json'),before);
  fs.writeFileSync(path.join(out,'cinco-stores-posteriores.json'),after);
  if(process.env.MTZ_REPRO_ORIGINAL==='1'){
   assert.match(result,/COMANDO_NAO_CERTIFICADO/);assert.equal(pedido.tipo,'proposta.criar.v1');
   assert.equal(pedido.revisaoEsperada,null);assert.equal(before,after);assert.equal(receiptFound,false);assert.equal(journalFound,false);
   console.log('REPRODUZIDO: revisaoEsperada null; cinco stores identicos; nenhum recibo ou evento');
   return;
  }
  assert.match(result,/Salvo com sucesso/);assert.equal(pedido.tipo,'proposta.criar.v1');
  assert.equal(pedido.revisaoEsperada,1);assert.ok(receiptFound&&journalFound);
  const p2=await page.evaluate(()=>JSON.parse(JSON.stringify(propostas[1])));
  assert.equal(p2.controleInterno.fechamentoGerencial.encargosTotal,30);
  assert.equal(p2.controleInterno.fechamentoGerencial.depreciacaoGerencial,240);
  assert.equal(p2.controleInterno.fechamentoGerencial.lucroPrevisto,960);
  await ready(page);assert.equal(await dump(page),after);
  await page.locator('#propostasSubtabLista').click();
  await page.locator('[data-action="editarProposta"]:visible').last().click();
  await page.evaluate(()=>{revisarFechamentoGerencialProposta();propEventoNome.value='Evento editado apos reabrir';});
  assert.match(await save(page),/Salvo com sucesso/);
  const other=await context.newPage();await ready(other);await fill(other,0);
  await page.evaluate(()=>limparFormularioProposta());await fill(page,2);
  assert.match(await save(page),/Salvo com sucesso/);
  const confirmed=await dump(page);
  assert.match(await save(other),/Conflito de edição/);assert.equal(await dump(page),confirmed);
  assert.equal(await page.evaluate(()=>salvarLocal()),false);
  console.log('PASS: criar apos reload, encargos 2%, zero encargo em outra aba, edicao, conflito sem sobrescrita, recibos e journal');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
