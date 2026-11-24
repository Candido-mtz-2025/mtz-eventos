const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const parser=process.env.MTZ_BABEL_BUNDLE||require.resolve('playwright/lib/transform/babelBundle.js');
const {babelParse,traverse}=require(parser),repo=path.resolve(__dirname,'..'),file='assets/js/modules/propostas.js';
const source=fs.readFileSync(path.join(repo,file),'utf8');let scope;
traverse(babelParse(source,file),{FunctionExpression(p){if(!scope&&p.parentPath.isCallExpression())scope=p.scope;}});
const defs=new Map();for(const[name,b]of Object.entries(scope.bindings)){
 const deps=new Set(),globals=new Set();b.path.traverse({ReferencedIdentifier(p){const d=p.scope.getBinding(p.node.name);if(d?.scope===scope&&p.node.name!==name)deps.add(p.node.name);else if(!d)globals.add(p.node.name);}});
 defs.set(name,{name,node:b.path.node,deps:[...deps],globals:[...globals]});
}
const roots=['construirPropostaComercialCalculada','normalizarProposta','calcularResumoProposta','calcularItemProposta','gerarCodigoProposta','obterInconsistenciaQuantidadeOperacionalItem','normalizarUrlAnexoProposta','montarClientePropostaNormalizado','normalizarAnexoProposta','obterPendenciasPropostaPronta','obterPendenciasFiscaisObrigatoriasProposta','aplicarDatasAutomaticasStatus','obterProximaRevisaoProposta','obterPadroesOrcamento','obterPerfilFiscalEmpresa','obterCategoriasOrcamento','normalizarIdCategoriaOrcamento','normalizarPadroesOrcamento','normalizarCategoriaConfigOrcamento','normalizarCategoriasOrcamentoConfig','normalizarPerfilFiscalEmpresa','normalizarTipoFiscalItem','normalizarRegraMatrizFiscal','obterCategoriaOrcamentoPorValor','VERSAO_POLITICA_CUSTOS_PROPRIOS','calcularFechamentoGerencialProposta','calcularItemGerencialProposta'];
roots.push('construirPropostaGerencialCalculada');
const cut=new Set(['obterUsuarioAtualNomeOuEmail','avisarPercentualRealProposta']),seen=new Set();
const allowed=new Set(['Array','Boolean','Date','JSON','Map','Math','Number','Object','Set','String','URL','Error','BigInt','config','propostas','normalizarIdEntidadeExato']);
function visit(n){if(cut.has(n)||seen.has(n))return;const d=defs.get(n);if(!d||d.globals.some(g=>!allowed.has(g)))throw Error('DEPENDENCIA_IMPURA '+n+' '+JSON.stringify(d?.globals));seen.add(n);d.deps.forEach(visit);}roots.forEach(visit);
const decls=[...seen].map(n=>defs.get(n)).sort((a,b)=>a.node.start-b.node.start),hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const manifest=Object.fromEntries(decls.map(d=>[d.name,hash(source.slice(d.node.start,d.node.end))]));
const body=decls.map(d=>(d.node.type==='VariableDeclarator'?'let ':'')+source.slice(d.node.start,d.node.end)+(d.node.type==='VariableDeclarator'?';':'')).join('\n\n');
const output=`// GERADO por AST das regras reais. Sem DOM, storage ou publicacao.\nexport const manifesto=Object.freeze(${JSON.stringify(manifest,null,2)});\nexport function criarNucleoPropostas(contexto){\nconst config=contexto.config, propostas=contexto.propostas;\nconst Relogio=globalThis.Date;\nconst Date=class extends Relogio{constructor(...args){super(...(args.length?args:[contexto.timestamp]));}static now(){return Relogio.parse(contexto.timestamp);}};\nconst avisos=new Set();\nconst obterUsuarioAtualNomeOuEmail=()=>contexto.ator;\nconst avisarPercentualRealProposta=()=>avisos.add('PERCENTUAL_REAL_INVALIDO');\nconst normalizarIdEntidadeExato=id=>({valido:typeof id==='string'?id.trim().length>0:typeof id==='number'&&Number.isSafeInteger(id)&&!Object.is(id,-0)});\n${body}\nreturn Object.freeze({${roots.join(',')},obterAvisos:()=>Object.freeze([...avisos])});\n}\n`;
const target=path.join(repo,'assets/js/core/proposal-kernel.generated.mjs');
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8').replaceAll('\r\n','\n')!==output.replaceAll('\r\n','\n'))throw Error('ESPELHO_DIVERGENTE');}else fs.writeFileSync(target,output);
console.log(JSON.stringify({declaracoes:decls.length,sha256:hash(output)}));
