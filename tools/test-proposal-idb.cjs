const {criarServidor}=require('./serve-orcamentos.cjs');
const {chromium}=require(process.env.MTZ_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{const server=criarServidor();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.MTZ_CHROME});const p=await browser.newPage();await p.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});
 const results=await p.evaluate(async()=>{
  const reg=await import('/assets/js/core/interdomain-command-registry.mjs'),led=await import('/assets/js/core/operational-stock-ledger.mjs');
  const {decodificarTextoEstrito}=await import('/assets/js/core/legacy-state-codec.mjs');
  const text=v=>decodificarTextoEstrito(JSON.stringify(v)).texto,copy=v=>JSON.parse(text(v)),check=(v,m)=>{if(!v)throw Error(m||'assertion');},out=[];
  const test=async(name,f)=>{try{await f();out.push({name,ok:true});}catch(e){out.push({name,ok:false,error:e.stack});}};
  const seed={versao:'12',data:'2026-11-06T12:00:00.000Z',ultimaEdicao:0,config:{},checklistConferencia:{}};
  for(const k of 'locadores pecas locacoes propostas devolucoes contasReceber contasPagar fornecedores categoriasFinanceiras centrosCusto conciliacoesFinanceiras conciliacoesPagamentosPagar movimentacoesEstoque transportes tipos usuarios logsAuditoria modelosChecklist checklistsGerados checklistMontagem checklistEtapasMontagem encargosFinanceiros'.split(' '))seed[k]=[];
  const dto=id=>({id,campos:{clienteManual:{nome:'Sintetico'},evento:{nome:'Ensaio'},financeiro:{desconto:0.03,acrescimo:120},custos:{frete:300}},itens:[{descricao:'Proprio sintetico',quantidade:1,periodoDias:1,custoUnitario:1000.05,origemCusto:'proprio',aplicarHonorarios:false,aplicarEncargos:false,aplicarINSS:false}],gerencial:{incluirMaoObra:true,dataFiscal:'2026-11-06',tipoDescontoFiscal:'incondicional',coberturaFiscalConfirmada:false,justificativaFiscalSemTributos:'Ensaio sem incidencia validada',tributos:[]}});
  const origin=led.criarLedgerEstoqueV2Texto(text(seed),text({tipo:'sem_reserva_v2'}));check(origin.ok);
  const make=()=>{const name=`mtz-idb-fundacao-lote1-teste-interdominios-orc-save-${crypto.randomUUID()}`,g=reg.criarGatewayInterdominiosDeEnsaio({ensaioSintetico:true,nomeBanco:name,identidadeBaseTexto:text({baseId:'ensaio-interdominios:orc-save',epocaAutoridade:'1',protocolo:1}),dataReferencia:'2026-11-06',origemLedgerTexto:origin.ledgerTexto,obterAtorAutorizado:()=> 'ensaio:teste'});return {name,g};};
  const prep=async(h,id,d=dto(1),revision=0)=>{const e=await h.g.prepararComando(id,'proposta.criar.v1',revision,text(d));check(e.ok,JSON.stringify(e));return e.entrada;};
  const init=async h=>{const e=await h.g.prepararImportacao('init',text(seed));check(e.ok);check((await h.g.executar(e.entrada)).ok);};
  const dump=async h=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open(h.name,2);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});return new Promise((ok,no)=>{const tx=db.transaction(['raiz','historico','auditoria','recibos','controle'],'readonly'),d={};for(const k of tx.objectStoreNames){const r=tx.objectStore(k).getAll();r.onsuccess=()=>d[k]=r.result;}tx.oncomplete=()=>{db.close();ok(text(d));};tx.onabort=()=>{db.close();no(tx.error);};});};
  await test('37 comandos preservados, sem nova API monetaria ou ativacao',async()=>{check(make().g.comandosDisponiveis.length===37);});
  for(const id of [1,'1','001','550e8400-e29b-41d4-a716-446655440000','-'])await test('commit gerencial e recibo tipado '+JSON.stringify(id),async()=>{const h=make();await init(h);const e=await prep(h,'create',dto(id)),r=await h.g.executar(e);check(r.ok&&r.codigo==='COMMIT_CONFIRMADO'&&r.publicado===false,JSON.stringify(r));const before=await dump(h),rec=await h.g.recuperarResultado(e);check(rec.codigo==='OPERACAO_JA_CONCLUIDA');check((await h.g.executar(e)).codigo==='OPERACAO_JA_CONCLUIDA');check(await dump(h)===before);const p=JSON.parse((await h.g.ler()).snapshotTexto).propostas[0];check(Object.is(p.id,id));check(p.financeiro.valorFinal===1420.02);check(p.controleInterno.fechamentoGerencial.depreciacaoGerencial===284);});
  await test('colisao de operacao e revisao obsoleta nao gravam',async()=>{const h=make();await init(h);check((await h.g.executar(await prep(h,'create'))).ok);const before=await dump(h);check(!(await h.g.executar(await prep(h,'create',dto(2),1))).ok);check((await h.g.executar(await prep(h,'stale',dto(2),0))).codigo==='CONFLITO_REVISAO');check(await dump(h)===before);});
  for(const store of ['raiz','historico','auditoria','recibos'])await test('rollback gerencial em '+store,async()=>{
   const h=make();await init(h);const before=await dump(h),e=await prep(h,'create'),add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;
   const wrap=f=>function(...a){if(this.name===store&&this.transaction.mode==='readwrite'){this.transaction.abort();throw Error('falha sintetica');}return f.apply(this,a);};
   IDBObjectStore.prototype.add=wrap(add);IDBObjectStore.prototype.put=wrap(put);let r;
   try{r=await h.g.executar(e);}finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;}
   check(!r.ok&&!r.publicado);check(await dump(h)===before);check((await h.g.executar(e)).ok);
  });
  await test('recibo request.success seguido de abort nao confirma',async()=>{const h=make();await init(h);const before=await dump(h),e=await prep(h,'create'),add=IDBObjectStore.prototype.add;
   IDBObjectStore.prototype.add=function(...a){const r=add.apply(this,a);if(this.name==='recibos')r.addEventListener('success',()=>this.transaction.abort());return r;};let r;
   try{r=await h.g.executar(e);}finally{IDBObjectStore.prototype.add=add;}check(!r.ok&&!r.publicado);check(await dump(h)===before);
  });
  await test('campos finais e identidade fiscal fornecidos pela UI recusados',async()=>{const h=make();await init(h);const before=await dump(h);for(const mutate of [d=>d.campos.financeiro.valorFinal=1,d=>d.gerencial.perfilFiscalEmpresa={},d=>d.snapshot={},d=>d.campos.anexos=[]]){const d=dto(1);mutate(d);const e=await h.g.prepararComando('bad','proposta.criar.v1',0,text(d));check(!e.ok||!(await h.g.executar(e.entrada)).ok);}check(await dump(h)===before);});
  await test('indisponibilidade IDB falha fechada, sem localStorage',async()=>{const h=make(),open=IDBFactory.prototype.open;let writes=0;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(){writes++;throw Error('fallback proibido');};IDBFactory.prototype.open=function(){throw Error('abertura sintetica');};
   try{check(!(await h.g.ler()).ok);check(writes===0);}finally{IDBFactory.prototype.open=open;Storage.prototype.setItem=set;}
  });
  return out;
 });
 const report={passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
 if(process.env.MTZ_TEST_OUTPUT)fs.writeFileSync(path.join(process.env.MTZ_TEST_OUTPUT,'idb-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
