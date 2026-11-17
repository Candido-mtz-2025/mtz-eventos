import { criarGatewayInterdominiosDeEnsaio } from '../assets/js/core/interdomain-command-registry.mjs';
import { criarFronteiraEscritaDeEnsaio } from '../assets/js/core/write-authority-boundary.mjs';
import { criarLedgerEstoqueV2Texto } from '../assets/js/core/operational-stock-ledger.mjs';
import { decodificarTextoEstrito } from '../assets/js/core/legacy-state-codec.mjs';
import { selecionarEntradasComerciaisFormulario } from '../assets/js/core/proposal-command-kernels.mjs';

if(location.hostname!=='127.0.0.1' || !document.querySelector('meta[name="mtz-homologacao"]'))throw Error('HOST_NAO_AUTORIZADO');
const texto=v=>decodificarTextoEstrito(JSON.stringify(v)).texto;
const ref=id=>`proposta:${encodeURIComponent(JSON.stringify([typeof id,id]))}`;
const simulacaoLegada=document.querySelector('meta[name="mtz-homologacao"]').dataset.simulacao==='legado-sintetico';
let nomeBanco='mtz-idb-fundacao-lote1-teste-interdominios-orcamentos-local-v1';
let identidadeBaseTexto=texto({baseId:'ensaio-interdominios:orcamentos-local-v1',epocaAutoridade:'1',protocolo:1});
const comandos=['proposta.criar.v1','proposta.editar.v1'];
const permissoes=new Set(['criar_proposta','editar_proposta','visualizar_locacoes','restaurar_backup']);
const script=src=>new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(Error('RECURSO_INDISPONIVEL'));document.head.append(s);});
const tab=document.getElementById('tab-propostas'), modal=document.getElementById('modalRelatorio');
const main=document.getElementById('appArea');main.inert=true;main.style.display='block';
document.getElementById('loginArea').style.display='none';
document.title='MTZ Eventos | Homologacao local de Orcamentos';
const barra=document.createElement('div');barra.className='card-header';barra.id='homologacaoEstado';
barra.innerHTML='<strong>Homologação local · dados sintéticos</strong> <button type="button" class="btn btn-sm" id="localIniciar">Iniciar base sintética</button> <button type="button" class="btn btn-sm" id="localAtualizar">Atualizar lista</button> <button type="button" class="btn btn-sm" id="localRecuperar">Recuperar salvamento</button> <output role="status" id="localEstado">Carregando…</output>';
tab.prepend(barra);
const estado=document.getElementById('localEstado');
let notificarVisual=null;
const avisar=m=>{estado.textContent=m;notificarVisual?.(m);};
window.mostrarToast=m=>avisar(m);
// Ator documental sintetico; nao representa autenticacao comercial nem aprovacao segregada.
window.validarPermissao=p=>permissoes.has(p);
window.validarAcessoAba=id=>['dashboard','propostas'].includes(id);
window.obterUsuarioAtual=()=>({nome:'Equipe sintetica de homologacao'});
await script('/assets/js/core/state.js');
const controle=window.__obterControladorEstadoAplicacao();
let genesis={...JSON.parse(texto(controle.obterReferencia())),versao:'12',data:'2026-11-06T12:00:00.000Z',ultimaEdicao:0};
let origem;
if(simulacaoLegada){
    const {criarPropostasLegadasSinteticas}=await import('./propostas-legadas-sinteticas.mjs');
    const {simularMigracaoTexto,obterArtefatoSimulacaoTexto}=await import('../assets/js/core/migration-preflight.mjs');
    const r=await simularMigracaoTexto(texto(criarPropostasLegadasSinteticas(genesis)),texto({fonte:'arquivo_json',criadoEm:genesis.data,dataReferencia:'2026-11-06'}));
    if(!r.ok){avisar('Simulação legada bloqueada pelo preflight.');throw Error('PREFLIGHT_LEGADO_RECUSADO');}
    const artefato=obterArtefatoSimulacaoTexto(r);
    if(!artefato.ok)throw Error('SIMULACAO_NAO_COMPROVADA');
    genesis=JSON.parse(artefato.snapshotTexto);origem={ok:true,ledgerTexto:artefato.ledgerTexto};
    identidadeBaseTexto=artefato.identidadeBaseTexto;
    nomeBanco='mtz-idb-fundacao-lote1-teste-interdominios-migracao-'+JSON.parse(r.relatorioTexto).sha256Origem.slice(0,32);
    barra.querySelector('strong').textContent='Simulação legada · fixture sintética fixa';
    document.getElementById('localIniciar').textContent='Importar fixture sintética validada';
}else origem=criarLedgerEstoqueV2Texto(texto(genesis),texto({tipo:'sem_reserva_v2'}));
if(!origem.ok)throw Error('ORIGEM_SINTETICA_INVALIDA');
const config={ensaioSintetico:true,nomeBanco,identidadeBaseTexto,dataReferencia:'2026-11-06',origemLedgerTexto:origem.ledgerTexto};
let atual=null, porta=null, formulario=null, revisaoDraft=null, idDraft=null, ocupado=false, pendente=null, pronto=false, abrirConfirmada=null;
const chavePendente='mtz-homologacao-orcamentos-operacao-v1'+(simulacaoLegada?':'+nomeBanco:'');
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
        // Vincular somente o rascunho inicial ainda sem revisao; nunca rebasear uma edicao em curso.
        if(idDraft===null && revisaoDraft===null)revisaoDraft=meta.revisao;
        window.renderPropostas?.();return true;
    }});
porta=window.__instalarFronteiraEscrita(fronteira.permitirLegado);porta.selar();
// Recusar service worker anterior, sem apagar caches, registros ou dados do usuario.
if(navigator.serviceWorker && (navigator.serviceWorker.controller || (await navigator.serviceWorker.getRegistrations()).length)){
    avisar('Homologação bloqueada: há um service worker anterior nesta origem. Exige revisão explícita.');
    throw Error('ORIGEM_CONTROLADA_POR_VERSAO_ANTERIOR');
}
await script('/assets/js/core/utils.js');
await script('/assets/js/ui/toast.js');
const toastOriginal=window.mostrarToast;
document.getElementById('toast').setAttribute('role','status');
document.getElementById('toast').setAttribute('aria-live','polite');
document.getElementById('toast').style.pointerEvents='none';
notificarVisual=m=>toastOriginal(m,/Erro|bloquead|Não confirmado|Conflito/.test(m)?'erro':'ok',6000);
window.mostrarToast=m=>avisar(m);
await script('/assets/js/core/storage.js');
await script('/assets/js/core/app.js');
await script('/assets/js/modules/relatorios.js');
await script('/assets/js/modules/propostas.js');
formulario=window.__instalarOrcamentosHomologacao({
    aoAbrir:id=>{idDraft=id;revisaoDraft=atual?.revisao??null;},
    aoNovo:()=>{idDraft=null;revisaoDraft=atual?.revisao??null;}, salvar
});
formulario.iniciar();
await script('/assets/js/ui/eventos.js');
inicializarTemaSistema();inicializarSidebarLayout();inicializarNavegacaoPrincipal();atualizarMedidasTopoApp();
window.addEventListener('resize',()=>{atualizarMedidasTopoApp();atualizarControleSidebar();});
abrirTab('propostas',{semRolagem:true});
// A interface principal permanece visivel; modulos fora do escopo nao recebem handlers de escrita.
for(const b of document.querySelectorAll('[data-menu-item][data-tab], #appMainSidebar [data-tab]'))if(!['dashboard','propostas'].includes(b.dataset.tab)){
    b.disabled=true;b.setAttribute('aria-disabled','true');b.title='Módulo não ativado nesta homologação.';
}
for(const b of document.querySelectorAll('header [data-action]'))if(!['toggleSidebarMobile','toggleTheme','selecionarTema'].includes(b.dataset.action))b.disabled=true;
document.getElementById('syncText').textContent='Homologação local';
main.inert=false;
// Escritas de uma aba antiga em localStorage nao ingressam na autoridade nem sao apagadas.
window.addEventListener('storage',e=>{
    if(e.key===null || ['mtzBackup','mtzBackupEmergencia','mtzBackupAutomatico','mtzUltimaEdicao'].includes(e.key))
        avisar('Escrita legada detectada em outra aba. Nenhum dado foi importado ou publicado; a autoridade continua IndexedDB.');
});
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
else {botoes(false);avisar(simulacaoLegada?'Clique em Importar fixture sintética validada. Nenhum dado real será importado.':'Clique em Iniciar base sintética. Nenhum dado real será importado.');}
