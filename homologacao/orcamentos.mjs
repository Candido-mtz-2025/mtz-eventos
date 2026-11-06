import { criarGatewayInterdominiosDeEnsaio } from '../assets/js/core/interdomain-command-registry.mjs';
import { criarFronteiraEscritaDeEnsaio } from '../assets/js/core/write-authority-boundary.mjs';
import { criarLedgerEstoqueV2Texto } from '../assets/js/core/operational-stock-ledger.mjs';
import { decodificarTextoEstrito } from '../assets/js/core/legacy-state-codec.mjs';
import { selecionarEntradasComerciaisFormulario } from '../assets/js/core/proposal-command-kernels.mjs';

if(location.hostname!=='127.0.0.1' || !document.querySelector('meta[name="mtz-homologacao"]'))throw Error('HOST_NAO_AUTORIZADO');
const texto=v=>decodificarTextoEstrito(JSON.stringify(v)).texto;
const ref=id=>`proposta:${encodeURIComponent(JSON.stringify([typeof id,id]))}`;
const nomeBanco='mtz-idb-fundacao-lote1-teste-interdominios-orcamentos-local-v1';
const identidadeBaseTexto=texto({baseId:'ensaio-interdominios:orcamentos-local-v1',epocaAutoridade:'1',protocolo:1});
const comandos=['proposta.criar.v1','proposta.editar.v1'];
const permissoes=new Set(['criar_proposta','editar_proposta','visualizar_locacoes','restaurar_backup']);
const script=src=>new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(Error('RECURSO_INDISPONIVEL'));document.head.append(s);});
const tab=document.getElementById('tab-propostas'), modal=document.getElementById('modalRelatorio');
document.body.replaceChildren();
const main=document.createElement('main');main.id='appArea';main.style.display='block';main.append(tab);document.body.append(main);
tab.style.display='block';tab.classList.add('active');document.title='MTZ | Orcamentos - homologacao sintetica local';
const barra=document.createElement('div');barra.className='card-header';
barra.innerHTML='<strong>Homologação local · dados sintéticos</strong> <button type="button" class="btn btn-sm" id="localIniciar">Iniciar base sintética</button> <button type="button" class="btn btn-sm" id="localAtualizar">Atualizar lista</button> <button type="button" class="btn btn-sm" id="localRecuperar">Recuperar salvamento</button> <output role="status" id="localEstado">Carregando…</output>';
main.prepend(barra);document.body.append(modal);
const estado=document.getElementById('localEstado');
const avisar=m=>{estado.textContent=m;};
window.mostrarToast=m=>avisar(m);
// Ator documental sintetico; nao representa autenticacao comercial nem aprovacao segregada.
window.validarPermissao=p=>!['converter_proposta_locacao','excluir_registro','configuracao'].includes(p);
window.obterUsuarioAtual=()=>({nome:'Equipe sintetica de homologacao'});
await script('/assets/js/core/state.js');
const controle=window.__obterControladorEstadoAplicacao();
const genesis={...JSON.parse(texto(controle.obterReferencia())),versao:'12',data:'2026-11-06T12:00:00.000Z',ultimaEdicao:0};
const origem=criarLedgerEstoqueV2Texto(texto(genesis),texto({tipo:'sem_reserva_v2'}));
if(!origem.ok)throw Error('ORIGEM_SINTETICA_INVALIDA');
const config={ensaioSintetico:true,nomeBanco,identidadeBaseTexto,dataReferencia:'2026-11-06',origemLedgerTexto:origem.ledgerTexto};
let atual=null, porta=null, formulario=null, revisaoDraft=null, idDraft=null, ocupado=false, pendente=null, pronto=false, abrirConfirmada=null;
const chavePendente='mtz-homologacao-orcamentos-operacao-v1';
const fronteira=criarFronteiraEscritaDeEnsaio({...config,
    criarGatewayPrivado:permitir=>{
        const g=criarGatewayInterdominiosDeEnsaio({...config,
            obterAtorAutorizado:p=>permitir()&&permissoes.has(p)?'ensaio:comercial-local':null});
        return Object.freeze({...g,comandosDisponiveis:comandos});
    },
    publicarConfirmado:(raiz,meta)=>{
        if(!porta || meta.identidadeBaseTexto!==identidadeBaseTexto)throw Error('IDENTIDADE_DIVERGENTE');
        if(porta.publicarConfirmado(raiz)!==true)return false;
        atual={raiz,revisao:meta.revisao};
        window.renderPropostas?.();return true;
    }});
porta=window.__instalarFronteiraEscrita(fronteira.permitirLegado);porta.selar();
await script('/assets/js/core/utils.js');
await script('/assets/js/modules/relatorios.js');
window.fecharModal=id=>document.getElementById(id)?.classList.remove('active');
await script('/assets/js/modules/propostas.js');
formulario=window.__instalarOrcamentosHomologacao({
    aoAbrir:id=>{idDraft=id;revisaoDraft=atual?.revisao??null;},
    aoNovo:()=>{idDraft=null;revisaoDraft=atual?.revisao??null;}, salvar
});
formulario.iniciar();
await script('/assets/js/ui/eventos.js');
// Somente criacao/edicao neste host. Demais escritores nao recebem capacidades.
const proibidos=new Set(['salvarConfigOrcamento','salvarConfigPropostas','salvarAnexoProposta',
    'aplicarConfigOrcamentoProposta','restaurarPadroesConfigOrcamentoProposta','salvarEditorCategoriaConfigOrcamento',
    'irParaClientesCadastro','removerAnexoProposta','editarAnexoProposta',
    'alterarStatusPropostaRapido','duplicarProposta','criarNovaRevisaoProposta','excluirProposta',
    'converterPropostaEmLocacaoFechada','salvarValorKmFretePadraoProposta','confirmarPerfilFiscalEmpresa']);
document.getElementById('propStatus').disabled=true;
document.getElementById('propStatus').title='Alteração de status fora do escopo desta homologação.';
for(const b of tab.querySelectorAll('[data-action]'))if(proibidos.has(b.dataset.action)){
    b.disabled=true;b.title='Operação fora do escopo desta homologação.';
}
document.addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');if(!b)return;
    if(proibidos.has(b.dataset.action)){e.preventDefault();e.stopImmediatePropagation();avisar('Operação fora do escopo desta homologação.');}
    if(b.dataset.action==='editarProposta'){
        e.preventDefault();e.stopImmediatePropagation();
        const lista=atual?.raiz.propostas.filter(p=>ref(p.id)===b.dataset.arg)||[];
        if(lista.length===1)formulario.abrir(lista[0].id);
    }
    if(b.dataset.action==='gerarPDFProposta'){
        e.preventDefault();e.stopImmediatePropagation();
        const lista=atual?.raiz.propostas.filter(p=>ref(p.id)===b.dataset.arg)||[];
        if(lista.length===1){formulario.abrir(lista[0].id);window.gerarPDFPropostaAtualCliente();}
    }
},true);
function botoes(ativo){for(const b of document.querySelectorAll('[data-action="salvarProposta"]')){b.disabled=!ativo;b.textContent=ocupado?'Salvando…':'Salvar orçamento';}
    for(const id of ['localIniciar','localAtualizar','localRecuperar'])document.getElementById(id).disabled=ocupado;
}
async function atualizar(){const r=await fronteira.cliente.atualizar();pronto=r.ok;avisar(r.ok?'Base confirmada.':`Base bloqueada: ${r.codigo}`);botoes(pronto);return r;}
document.getElementById('localAtualizar').onclick=async()=>{if(!ocupado)await atualizar();};
document.getElementById('localIniciar').onclick=async()=>{
    if(ocupado)return;ocupado=true;
    try {
        await navigator.locks.request(`mtz:bootstrap:${nomeBanco}`,async()=>{
            const g=criarGatewayInterdominiosDeEnsaio({...config,obterAtorAutorizado:p=>permissoes.has(p)?'ensaio:comercial-local':null});
            const leitura=await g.ler();
            if(leitura.ok){avisar('A base já existe. Use Atualizar lista.');return;}
            // Uma instalacao usada nunca e substituida por uma inicializacao automatica.
            const bancos=await indexedDB.databases();
            if(bancos.some(b=>b.name===`${nomeBanco}-fronteira`))throw Error('CONTINUIDADE_REQUER_RECUPERACAO');
            const e=await g.prepararImportacao('orcamentos:init',texto(genesis));
            if(!e.ok)throw Error(e.codigo);
            const r=await g.executar(e.entrada);if(!r.ok)throw Error(r.codigo);
            for(const modo of ['LEGADO','TRANSACIONAL']){const m=await fronteira.selecionarModoDeEnsaio(modo);if(!m.ok)throw Error(m.codigo);}
        });
        await atualizar();if(pronto)window.limparFormularioProposta();
    }catch(e){avisar(`Inicialização bloqueada: ${e.message}`);}finally{ocupado=false;botoes(pronto);}
};
async function concluir(r,pedido){
    if(r.ok&&['COMMIT_CONFIRMADO','OPERACAO_JA_CONCLUIDA'].includes(r.codigo)
        &&r.recibo?.operacaoId===pedido.operacaoId&&atual?.revisao>=r.recibo.revisao){
        const d=JSON.parse(pedido.dadosTexto);
        const registros=atual.raiz.propostas.filter(p=>Object.hasOwn(d,'id')?Object.is(p.id,d.id):ref(p.id)===d.propostaReferencia);
        if(registros.length!==1)throw Error('IDENTIDADE_CONFIRMADA_DIVERGENTE');
        pendente=null;sessionStorage.removeItem(chavePendente);
        abrirConfirmada=registros[0].id;avisar('Salvo com sucesso. Commit confirmado.');return true;
    }
    if(r.codigo==='CONFLITO_REVISAO'){pendente=null;sessionStorage.removeItem(chavePendente);}
    avisar(r.codigo==='CONFLITO_REVISAO'?'Conflito de edição. Atualize a lista e reabra o registro; seus campos não foram gravados.':`Não confirmado: ${r.codigo}. Use Recuperar salvamento antes de repetir.`);
    return false;
}
async function salvar(){
    if(ocupado||!pronto)return;
    ocupado=true;botoes(false);avisar('Salvando…');
    const campos=Array.from(tab.querySelectorAll('input,select,textarea,button')).map(el=>[el,el.disabled]);
    try {
        const f=formulario.coletar(),dto=selecionarEntradasComerciaisFormulario(f.proposta,f.contexto,f.indices);
        const nova=idDraft===null;
        const dados={...(nova?{id:`orcamento-${crypto.randomUUID()}`}:{propostaReferencia:ref(idDraft)}),...dto};
        const pedido={operacaoId:`orcamento:${crypto.randomUUID()}`,tipo:nova?'proposta.criar.v1':'proposta.editar.v1',revisaoEsperada:revisaoDraft,dadosTexto:texto(dados)};
        if(pendente)throw Error('RECUPERE_A_OPERACAO_ANTERIOR');
        sessionStorage.setItem(chavePendente,texto(pedido));pendente=pedido;
        campos.forEach(([el])=>{el.disabled=true;});
        await concluir(await fronteira.cliente.executar(pedido),pedido);
    }catch(e){avisar(e.message==='REVISAO_GERENCIAL_EXPLICITA_NECESSARIA'
        ?'Fechamento histórico preservado. Use Revisar cálculo atual antes de alterar e salvar valores.'
        :`Erro ao salvar: ${e.message==='FORMULARIO_INVALIDO'?estado.textContent:e.message}`);
    }finally{campos.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});
        if(abrirConfirmada!==null){formulario.abrir(abrirConfirmada);abrirConfirmada=null;}
        ocupado=false;botoes(pronto);}
}
document.getElementById('localRecuperar').onclick=async()=>{
    if(ocupado)return;ocupado=true;botoes(false);
    try {
        const pedido=pendente||JSON.parse(sessionStorage.getItem(chavePendente)||'null');
        if(!pedido){avisar('Nenhuma operação pendente.');return;}
        // A autoridade verifica assinatura e recibo; sessionStorage nunca e autoridade de dados.
        const r=await fronteira.cliente.recuperar(pedido);
        if(r.codigo==='OPERACAO_NAO_ENCONTRADA'){pendente=null;sessionStorage.removeItem(chavePendente);avisar('Operação não confirmada. Os dados anteriores permanecem íntegros; você pode tentar salvar novamente.');}
        else await concluir(r,pedido);
    }catch(e){avisar(`Recuperação bloqueada: ${e.message}`);}finally{
        if(abrirConfirmada!==null){formulario.abrir(abrirConfirmada);abrirConfirmada=null;}
        ocupado=false;botoes(pronto);}
};
// PDF usa o gerador existente; estas bibliotecas nao acessam dados remotos.
script('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js').catch(()=>{});
script('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js').catch(()=>{});
// Nao criar sequer a selecao de autoridade antes da primeira acao explicita.
if((await indexedDB.databases()).some(b=>b.name===`${nomeBanco}-fronteira`))await atualizar();
else {botoes(false);avisar('Clique em Iniciar base sintética. Nenhum dado real será importado.');}
