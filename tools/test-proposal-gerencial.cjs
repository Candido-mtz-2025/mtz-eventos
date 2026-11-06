const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const core=n=>import(pathToFileURL(path.join(__dirname,'../assets/js/core',n)).href);
(async()=>{
 const {prepararComandoPropostaTexto:plan,validarComandoPropostaTexto:valid,validarPropostasTexto:validRoot}=await core('proposal-command-kernels.mjs');
 const {criarNucleoPropostas}=await core('proposal-kernel.generated.mjs');
 const clone=v=>JSON.parse(JSON.stringify(v)),text=JSON.stringify,ref=id=>`proposta:${encodeURIComponent(JSON.stringify([typeof id,id]))}`;
 const seed={versao:'12',data:'2026-11-06T12:00:00.000Z',ultimaEdicao:0,config:{},checklistConferencia:{}};
 for(const k of 'locadores pecas locacoes propostas devolucoes contasReceber contasPagar fornecedores categoriasFinanceiras centrosCusto conciliacoesFinanceiras conciliacoesPagamentosPagar movimentacoesEstoque transportes tipos usuarios logsAuditoria modelosChecklist checklistsGerados checklistMontagem checklistEtapasMontagem encargosFinanceiros'.split(' '))seed[k]=[];
 const meta=op=>text({operacaoId:op,atorReferencia:'ensaio:teste',timestamp:'2026-11-06T12:00:00.000Z'});
 const dto=id=>({id,campos:{clienteManual:{nome:'Cliente sintetico'},evento:{nome:'Evento sintetico'},financeiro:{desconto:100,acrescimo:120,percentualNF:0,percentualEntrada:50},custos:{frete:300,maoObra:200},controleInterno:{maoObraOperacional:{pessoas:2,dias:1,valorPessoaDia:80}}},itens:[{descricao:'Estrutura sintetica',tipoFiscal:'cessao_estrutura_temporaria_3_05',origemCusto:'misto',quantidade:3,quantidadePropria:2,quantidadeTerceirizada:1,custoUnitario:1000,custoTerceirizadoReal:450,periodoDias:1,aplicarHonorarios:false,aplicarEncargos:false,aplicarINSS:false}],gerencial:{incluirMaoObra:true,dataFiscal:'2026-11-06',tipoDescontoFiscal:'incondicional',coberturaFiscalConfirmada:false,justificativaFiscalSemTributos:'',tributos:[{nome:'ISS',codigo:'ISS',natureza:'tributo',baseCalculo:'manual',baseManual:1000,percentual:3,incidencia:'aplica'},{nome:'IRRF',codigo:'IRRF',natureza:'retencao',baseCalculo:'comercial',percentual:1.5,incidencia:'aplica'}]}});
 const run=(s,d,op='criar',tipo='proposta.criar.v1')=>{const r=plan(tipo,text(s),text(d),meta(op));assert.ok(r.ok,JSON.stringify(r));return JSON.parse(r.snapshotTexto);};
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 for(const id of [1,'1','001','550e8400-e29b-41d4-a716-446655440000','id-com-hifen'])test('gerencial tipado '+JSON.stringify(id),()=>{
  const s=run(seed,dto(id)),p=s.propostas[0],f=p.controleInterno.fechamentoGerencial;assert.equal(p.id,id);assert.ok(validRoot(text(s)));
  assert.equal(f.valorFinal,3520);assert.equal(f.custoTotalProposta,610);assert.equal(f.tributosTotal,30);assert.equal(f.retencoesTotal,52.8);assert.equal(f.depreciacaoGerencial,576);assert.equal(f.lucroPrevisto,2304);
  assert.equal(p.fiscal.resumo.valorLiquidoPrevisto,3467.2);assert.equal(p.fiscal.resumo.impostosEstimados,30);
  const d={propostaReferencia:ref(id),campos:{evento:{nome:'Editado'}},itens:[{indiceOrigem:0}],gerencial:dto(id).gerencial};
  const end=run(s,d,'editar','proposta.editar.v1');assert.equal(end.propostas[0].id,id);assert.deepEqual(end.propostas[0].controleInterno.fechamentoGerencial,f);assert.deepEqual(end.logsAuditoria[1].anteriorSnapshot,p);
 });
 test('cinco identidades coexistem; editar somente a textual',()=>{let s=clone(seed);for(const [i,id]of [1,'1','001','uuid-com-hifen','-'].entries())s=run(s,dto(id),'criar:'+i);const before=clone(s.propostas);s=run(s,{propostaReferencia:ref('1'),campos:{evento:{nome:'Texto'}},itens:[{indiceOrigem:0}],gerencial:dto('1').gerencial},'editar','proposta.editar.v1');for(const i of [0,2,3,4])assert.deepEqual(s.propostas[i],before[i]);assert.equal(s.propostas[1].evento.nome,'Texto');});
 test('campos futuros, anexos e revisoes preservados integralmente',()=>{
  const s=run(seed,dto(1));s.logsAuditoria=[];const p=s.propostas[0];
  p.futuro={tipados:[1,'1','001']};p.cliente.extensao={valor:1};p.clienteSnapshot.extensao={valor:1};
  p.documentos={extensao:[1,'1']};p.itens[0].futuro={montante:1.01};p.financeiro.futuro={x:1};
  p.fiscal.tributosIndividualizados[0].futuro={fonte:'original'};
  p.anexos=[{id:1,propostaId:1,nome:'Documento sintetico',url:'https://example.invalid/sintetico.pdf',futuro:{x:1}}];p.historicoRevisoes=[{id:'anterior',revisao:0,futuro:1}];
  // Checkpoint sintetico, normalizado pela mesma regra, nunca importacao de base real.
  const n=criarNucleoPropostas({config:s.config,propostas:[],timestamp:p.dataUltimaAlteracao,ator:p.alteradoPor});
  const g={...dto(1).gerencial,tributos:p.fiscal.tributosIndividualizados};s.propostas[0]=n.construirPropostaGerencialCalculada(p,p,g);
  assert.ok(validRoot(text(s)));
  const d=dto(1);delete d.id;d.propostaReferencia=ref(1);d.itens=[{indiceOrigem:0,quantidade:3}];d.gerencial.tributos[0].indiceOrigem=0;d.gerencial.tributos[1].indiceOrigem=1;
  const q=run(s,d,'editar','proposta.editar.v1').propostas[0];
  for(const k of ['anexos','historicoRevisoes','documentos','futuro'])assert.deepEqual(q[k],p[k]);
  assert.deepEqual(q.itens[0].futuro,p.itens[0].futuro);assert.deepEqual(q.financeiro.futuro,p.financeiro.futuro);assert.deepEqual(q.cliente.extensao,p.cliente.extensao);assert.deepEqual(q.fiscal.tributosIndividualizados[0].futuro,{fonte:'original'});
 });
 test('mao de obra opcional reconstruida sem custo ou receita fantasma',()=>{const d=dto(1);d.gerencial.incluirMaoObra=false;const p=run(seed,d).propostas[0];assert.equal(p.financeiro.valorFinal,3320);assert.equal(p.controleInterno.fechamentoGerencial.custoTotalProposta,450);assert.equal(p.custos.maoObra,0);assert.ok(validRoot(text({...run(seed,d)})));});
 for(const [name,change]of [['total forjado',d=>d.campos.financeiro.valorFinal=1],['snapshot forjado',d=>d.snapshot={}],['perfil fiscal cliente',d=>d.gerencial.perfilFiscalEmpresa={}],['historico cliente',d=>d.campos.historicoRevisoes=[]],['assinatura cliente',d=>d.assinatura='falsa'],['resultado gerencial cliente',d=>d.gerencial.lucroPrevisto=10000]])test('recusa '+name,()=>{const d=dto(1);change(d);assert.equal(valid('proposta.criar.v1',text(d)),false);assert.equal(plan('proposta.criar.v1',text(seed),text(d),meta('falha')).ok,false);});
 for(const [name,change]of [['quantidade',d=>d.itens[0].quantidadePropria=20],['overflow',d=>d.itens[0].custoUnitario=Number.MAX_SAFE_INTEGER],['retencao indevida',d=>d.gerencial.tributos[1].percentual=101]])test('recusa '+name,()=>{const d=dto(1);change(d);assert.equal(plan('proposta.criar.v1',text(seed),text(d),meta('falha')).ok,false);});
 test('calculo salvo adulterado e recusado',()=>{const s=run(seed,dto(1));s.propostas[0].controleInterno.fechamentoGerencial.lucroPrevisto+=0.01;assert.equal(validRoot(text(s)),false);});
 test('ausencia de modo gerencial nao recalcula historico v3',()=>{const s=run(seed,dto(1));assert.equal(plan('proposta.editar.v1',text(s),text({propostaReferencia:ref(1),campos:{},itens:[{indiceOrigem:0}]}),meta('editar')).ok,false);});
 test('centavos e descontos nao sao arredondados pela serializacao',()=>{const d=dto(1);d.campos.financeiro.desconto=0.03;d.itens[0].custoUnitario=12.37;const s=run(seed,d),p=s.propostas[0];assert.deepEqual(JSON.parse(text(s)),s);assert.equal(p.financeiro.valorFinal,657.08);assert.ok(validRoot(text(s)));});
 test('desconto limitado preserva tambem o valor solicitado sem dupla deducao',()=>{
  const d=dto(1);d.campos.financeiro.desconto=10000;d.gerencial.tributos=[];
  const p=run(seed,d).propostas[0];assert.equal(p.financeiro.valorFinal,0);assert.equal(p.financeiro.desconto,3620);
  assert.equal(p.controleInterno.fechamentoGerencial.descontoSolicitado,10000);
 });
 console.log(JSON.stringify({passed:count,failed:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
