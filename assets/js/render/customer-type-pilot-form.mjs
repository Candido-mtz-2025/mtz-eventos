import { CAMPOS_FORMULARIO_CLIENTE } from '../core/customer-type-pilot.mjs';
const vinculados = new WeakSet();
const estadosOriginais = new WeakMap();

/** Somente o publicador privado chama esta projecao; nao cria Geral nem salva. */
export function atualizarSelecoesPiloto(raiz, {clientes=[],tipos=[]} = {}) {
    for(const [dominio,registros,controles]of [['cliente',raiz.locadores,clientes],['tipo',raiz.tipos,tipos]]) {
        for(const select of controles) {
            if(select.tagName!=='SELECT'||select.dataset.mtzPiloto!=='sintetico-v1')throw Error('SELETOR_NAO_ISOLADO');
            const anterior=select.value,doc=select.ownerDocument,opcoes=[doc.createElement('option')];
            opcoes[0].value='';opcoes[0].textContent='';
            for(const registro of registros){const option=doc.createElement('option');
                option.value=`${dominio}:${encodeURIComponent(JSON.stringify([typeof registro.id,registro.id]))}`;
                option.textContent=registro.nome;opcoes.push(option);}
            select.replaceChildren(...opcoes);
            select.value=opcoes.some(o=>o.value===anterior)?anterior:'';
        }
    }
    return true;
}

/** Adaptador opt-in para formulario do host SINTETICO; nunca vincula a aba real. */
export async function vincularFormularioPiloto({piloto,formulario,prefixo,intencaoTexto}) {
    if(!formulario || formulario.tagName!=='FORM' || vinculados.has(formulario)
        || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(prefixo) || formulario.dataset.mtzPiloto!=='sintetico-v1'
        || [formulario,...formulario.querySelectorAll('*')].some(el=>el.getAttributeNames().some(n=>/^on/i.test(n)))) {
        throw Error('FORMULARIO_NAO_ISOLADO');
    }
    vinculados.add(formulario);
    let aberto;
    try{aberto=await piloto.abrir(intencaoTexto);}catch(e){vinculados.delete(formulario);throw e;}
    if(!aberto.ok){vinculados.delete(formulario);return aberto;}
    const token=aberto.draft,v=piloto.lerDraft(token),mapa=v.dominio==='cliente'?CAMPOS_FORMULARIO_CLIENTE:{nome:'Nome',desc:'Desc'};
    const campo=k=>formulario.querySelector(`[id="${prefixo}${mapa[k]}"]`);
    const status=formulario.querySelector('[data-piloto-status]');
    const informar=codigo=>{if(status)status.textContent=codigo;};
    const controles=[...formulario.querySelectorAll('button,input,textarea,select')];
    const desabilitados=new Map(controles.map(el=>{
        if(!estadosOriginais.has(el))estadosOriginais.set(el,el.disabled);
        el.disabled=estadosOriginais.get(el);return [el,el.disabled];
    }));
    let pendente=false,fechado=false;
    const suspender=valor=>{pendente=valor;for(const el of controles)el.disabled=valor||desabilitados.get(el);};
    const handlers=[];
    function ouvir(el,event,fn){el.addEventListener(event,fn);handlers.push(()=>el.removeEventListener(event,fn));}
    function fechar(){fechado=true;vinculados.delete(formulario);for(const remover of handlers)remover();for(const el of controles)el.disabled=true;}
    for(const [k,valor]of Object.entries(v.campos)){
        const el=campo(k);if(!el)continue;
        if(k==='usarMesmoEnderecoCliente')el.checked=valor;else el.value=valor;
        ouvir(el,k==='usarMesmoEnderecoCliente'?'change':'input',()=>{
            if(pendente||fechado)return;
            const r=piloto.alterar(token,JSON.stringify({[k]:k==='usarMesmoEnderecoCliente'?el.checked:el.value}));
            if(!r.ok)informar(r.codigo);
        });
    }
    ouvir(formulario,'submit',async e=>{
        e.preventDefault();if(pendente||fechado)return;
        suspender(true);informar('OPERACAO_EM_ANDAMENTO');
        let r;try{r=await piloto.salvar(token);}catch(_){r={ok:false,codigo:'FALHA_COMUNICACAO'};}
        suspender(false);informar(r.ok?'SUCESSO_CONFIRMADO':r.codigo);
        if(r.ok)fechar();
    });
    const cancelar=formulario.querySelector('[data-piloto-cancelar]');
    if(cancelar)ouvir(cancelar,'click',e=>{e.preventDefault();if(pendente||fechado)return;
        const r=piloto.cancelar(token);informar(r.codigo);if(r.ok)fechar();});
    const recuperar=formulario.querySelector('[data-piloto-recuperar]');
    if(recuperar)ouvir(recuperar,'click',async e=>{e.preventDefault();if(pendente||fechado)return;
        suspender(true);informar('CONSULTANDO_RECIBO');let r;
        try{r=await piloto.recuperar(token);}catch(_){r={ok:false,codigo:'FALHA_COMUNICACAO'};}
        suspender(false);informar(r.ok?'SUCESSO_CONFIRMADO':r.codigo);
        if(r.ok||r.codigo==='OPERACAO_NAO_ENCONTRADA')fechar();});
    return Object.freeze({ok:true,draft:token,desvincular:fechar});
}
