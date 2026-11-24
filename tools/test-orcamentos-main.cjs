const {criarServidor,PORTA_HOMOLOGACAO}=require('./serve-orcamentos.cjs');
const {chromium}=require(process.env.MTZ_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const results=[];
async function test(name,f){try{await f();results.push({name,ok:true});console.log('PASS',name);}catch(e){results.push({name,ok:false,error:e.stack});console.log('FAIL',name,e.message);}}
(async()=>{const server=criarServidor();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const output=process.env.MTZ_TEST_OUTPUT,profile=fs.mkdtempSync(path.join(output?path.resolve(output):os.tmpdir(),'mtz-main-sintetico-'));
let context;const url=`http://127.0.0.1:${server.address().port}`;
const launch=()=>chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.MTZ_CHROME,acceptDownloads:true});
const ready=async p=>{await p.goto(url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>/Clique|Base confirmada/.test(document.getElementById('localEstado')?.textContent||''));};
try{
context=await launch();let p=await context.newPage();await ready(p);
const dump=()=>p.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('mtz-idb-fundacao-lote1-teste-interdominios-orcamentos-local-v1',2);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});return new Promise((ok,no)=>{const tx=db.transaction(['raiz','historico','auditoria','recibos','controle'],'readonly'),all={};for(const k of tx.objectStoreNames){const r=tx.objectStore(k).getAll();r.onsuccess=()=>all[k]=r.result;}tx.oncomplete=()=>{db.close();ok(JSON.stringify(all));};tx.onabort=()=>{db.close();no(tx.error);};});});
await test('estrutura principal original e origem canonica',async()=>{
 assert.equal(PORTA_HOMOLOGACAO,54145);assert.equal(await p.locator('#appMainSidebar').count(),1);assert.equal(await p.locator('#appArea header').count(),1);
 assert.equal(await p.locator('#tab-propostas').count(),1);assert.equal(await p.evaluate(()=>typeof abrirTab),'function');
 const response=await context.request.get(url+'/index.html');assert.equal(response.status(),200);assert.match(await response.text(),/mtz-homologacao/);
 const alias=await context.request.get(`http://localhost:${server.address().port}/index.html`,{maxRedirects:0});assert.equal(alias.status(),307);assert.equal(alias.headers().location,url+'/index.html');
 assert.match((await context.request.get(url)).headers()['content-security-policy'],/worker-src 'none'/);
});
await test('inicializacao sintetica e Salvar pela interface principal',async()=>{
 await p.click('#localIniciar');await p.waitForFunction(()=>document.getElementById('localEstado').textContent==='Base confirmada.');
 await p.locator('#propClienteNome').fill('Cliente sintetico reinicio');await p.locator('#propClienteTelefone').fill('00000000');
 await p.evaluate(()=>{propEventoNome.value='Evento sintetico reinicio';propDataEvento.value='2026-12-10';document.querySelector('.prop-item-descricao').value='Estrutura sintetica';document.querySelector('.prop-item-unitario').value='1234.56';document.querySelector('.prop-item-origem-custo').value='proprio';recalcularResumoProposta();});
 const btn=p.locator('[data-action="salvarProposta"]').first();await btn.evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));await btn.click();await p.waitForFunction(()=>document.getElementById('localEstado').textContent.includes('Salvo com sucesso'));
 assert.equal(await p.evaluate(()=>propostas.length),1);
});
let original=await dump(),proposal=await p.evaluate(()=>JSON.stringify(propostas[0]));
await test('chamadas reais legadas recusadas antes de leitura, rede ou escrita',async()=>{
 const r=await p.evaluate(async()=>{
  const before=JSON.stringify(propostas),get=Storage.prototype.getItem,set=Storage.prototype.setItem,f=window.fetch;let reads=0,writes=0,network=0;
  Storage.prototype.getItem=function(){reads++;throw Error('leitura proibida');};Storage.prototype.setItem=function(){writes++;throw Error('escrita proibida');};window.fetch=()=>{network++;throw Error('rede proibida');};
  const r={};try{
   r.save=salvarLocal();r.load=carregarLocal();r.persist=persistirSnapshotLocalConfirmavel({propostas:[{id:'falso'}]});
   try{aplicarDadosSistema({propostas:[{id:'falso'}]});}catch(e){r.import=e.message;}
   try{await sincronizar('salvar');}catch(e){r.sync=e.message;}
   window.onload();r.same=JSON.stringify(propostas)===before;r.reads=reads;r.writes=writes;r.network=network;
  }finally{Storage.prototype.getItem=get;Storage.prototype.setItem=set;window.fetch=f;}return r;
 });
 assert.equal(r.save,false);assert.equal(r.load.codigo,'ESCRITA_LEGADA_BLOQUEADA');assert.equal(r.persist.codigo,'ESCRITA_LEGADA_BLOQUEADA');
 assert.equal(r.import,'ESCRITA_LEGADA_BLOQUEADA');assert.equal(r.sync,'SINCRONIZACAO_LEGADA_BLOQUEADA');assert.deepEqual([r.reads,r.writes,r.network],[0,0,0]);assert.ok(r.same);assert.equal(await dump(),original);
});
await test('mutacao direta, substituicao da raiz e segunda fronteira recusadas',async()=>{
 const r=await p.evaluate(()=>{let nested=false,root=false,second=false;try{propostas.push({id:'falso'});}catch(_){nested=true;}try{window.propostas=[];}catch(_){root=true;}try{__instalarFronteiraEscrita(()=>true);}catch(_){second=true;}return {nested,root,second};});assert.deepEqual(r,{nested:true,root:true,second:true});assert.equal(await dump(),original);
});
await test('aba antiga escreve localStorage, mas nao sobrescreve IndexedDB nem UI',async()=>{
 const old=await context.newPage();await old.goto(url+'/assets/css/style.css',{waitUntil:'domcontentloaded'});
 await old.evaluate(()=>localStorage.setItem('mtzBackup',JSON.stringify({propostas:[{id:'legado-incompativel',cliente:{nome:'Falso'}}]})));
 await p.waitForFunction(()=>document.getElementById('localEstado').textContent.includes('Escrita legada detectada'));
 assert.equal(await dump(),original);assert.equal(await p.evaluate(()=>JSON.stringify(propostas[0])),proposal);
 await ready(p);assert.equal(await dump(),original);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('mtzBackup')).propostas[0].id),'legado-incompativel');await old.close();
});
await test('navegacao original Dashboard e Orcamentos sem habilitar outros modulos',async()=>{
 await p.locator('#appMainSidebar [data-action="irParaDashboard"]').click();await p.waitForFunction(()=>document.getElementById('tab-dashboard').classList.contains('active'));
 const comercial=p.locator('[data-menu-item][data-tab="propostas"]');
 if(!await comercial.isVisible())await p.locator('[data-menu-toggle="comercial"]').click();
 await comercial.click();await p.waitForFunction(()=>document.getElementById('tab-propostas').classList.contains('active'));
 for(const tab of ['locadores','tipos','estoque','locacoes'])assert.equal(await p.locator(`[data-menu-item][data-tab="${tab}"]`).isDisabled(),true);
 assert.equal(await p.evaluate(()=>abrirTab('locadores')),false);assert.equal(await p.evaluate(()=>typeof salvarLocador),'undefined');assert.equal(await dump(),original);
});
await test('fechar processo do navegador e reabrir preserva dados e cinco stores',async()=>{
 await context.close();context=await launch();p=await context.newPage();await ready(p);assert.equal(await dump(),original);assert.equal(await p.evaluate(()=>JSON.stringify(propostas[0])),proposal);
});
await test('backup e preflight existentes: copia exata, sem ativacao nem importacao',async()=>{
 const r=await p.evaluate(async()=>{
  const m=await import('/assets/js/core/migration-preflight.mjs');
  const all=await new Promise((ok,no)=>{const q=indexedDB.open('mtz-idb-fundacao-lote1-teste-interdominios-orcamentos-local-v1',2);q.onerror=()=>no(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('historico'),r=tx.objectStore('historico').getAll();r.onsuccess=()=>{const t=r.result[0].snapshotTexto;tx.oncomplete=()=>{db.close();ok(t);};};};});
  const opt=JSON.stringify({fonte:'arquivo_json',criadoEm:'2026-11-06T12:00:00.000Z',dataReferencia:'2026-11-06'});
  const b=await m.exportarBackupMigracaoTexto(all,opt),rest=await m.restaurarBackupMigracaoIsoladoTexto(b.backupTexto),pre=await m.inspecionarOrigemMigracaoTexto(all,opt);
  const adulterado=JSON.parse(b.backupTexto);adulterado.origemTexto+=' ';
  return {backup:b.ok,rest:rest.ok,exato:rest.textoOriginal===all,pre:pre.ok,ativado:pre.migracaoAutorizada,gravado:rest.gravado,adulterado:(await m.restaurarBackupMigracaoIsoladoTexto(JSON.stringify(adulterado))).ok};
 });assert.ok(r.backup&&r.rest&&r.exato&&r.pre);assert.equal(r.ativado,false);assert.equal(r.gravado,false);assert.equal(r.adulterado,false);assert.equal(await dump(),original);
});
await test('bootstrap publico sem fronteira nao ativa gateway ou desvia o caminho existente',async()=>{
 const r=await p.evaluate(async()=>{
  const frame=document.createElement('iframe');document.body.append(frame);const w=frame.contentWindow;
  const script=src=>new Promise((ok,no)=>{const el=w.document.createElement('script');el.src=src;el.onload=ok;el.onerror=no;w.document.head.append(el);});
  await script('/assets/js/core/state.js');await script('/assets/js/core/app.js');
  let chamadas=0,erro='';w.carregarLocal=()=>{chamadas++;throw Error('PARADA_DE_ENSAIO_ANTES_DA_LEITURA');};
  try{w.onload();}catch(e){erro=e.message;}
  const saida={chamadas,erro,legado:w.__permitirEscritaLegada(),gateway:typeof w.__instalarOrcamentosHomologacao};frame.remove();return saida;
 });assert.equal(r.chamadas,1);assert.equal(r.erro,'PARADA_DE_ENSAIO_ANTES_DA_LEITURA');assert.equal(r.legado,true);assert.equal(r.gateway,'undefined');assert.equal(await dump(),original);
});
if(output){await p.locator('#propostasSubtabLista').click();await p.screenshot({path:path.join(output,'main-desktop.png'),fullPage:true});await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(output,'main-mobile.png'),fullPage:true});}
}finally{await context?.close();await new Promise(r=>server.close(r));}
const report={passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,profile,results};if(output)fs.writeFileSync(path.join(output,'main-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
