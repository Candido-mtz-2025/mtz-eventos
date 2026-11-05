import { criarGatewayInterdominiosDeEnsaio, validarCadastroClienteTexto } from './interdomain-command-registry.mjs';
import { criarFronteiraEscritaDeEnsaio } from './write-authority-boundary.mjs';
import { decodificarTextoEstrito, validarIdentidadeBaseTexto } from './legacy-state-codec.mjs';
import { validarComandoCadastralTexto } from './catalog-command-kernels.mjs';

export const CONTRATO_PILOTO_CADASTROS = 'cadastros-piloto-v1';
export const CAMPOS_FORMULARIO_CLIENTE = Object.freeze({ nome:'Nome', documento:'Doc', telefone:'Tel',
    email:'Email', cep:'Cep', ruaEndereco:'End', numero:'Numero', complemento:'Complemento', bairro:'Bairro',
    cidade:'Cidade', uf:'Uf', responsavelPedido:'Responsavel', fiscalRazaoSocial:'FiscalRazaoSocial',
    fiscalCpfCnpj:'FiscalCpfCnpj', fiscalIE:'FiscalIE', fiscalIM:'FiscalIM', fiscalEmail:'FiscalEmail',
    fiscalEndereco:'FiscalEndereco', usarMesmoEnderecoCliente:'FiscalUsarEndereco' });
const COMANDOS = Object.freeze(['cliente.cadastrar.v1','cliente.editar.v1','cliente.excluir.v1',
    'tipo.cadastrar.v1','tipo.editar.v1','tipo.excluir.v1']);
const PERMISSOES = new Set(['visualizar_locacoes','cadastrar_cliente','editar_cliente',
    'cadastrar_tipo','editar_tipo','excluir_registro']);
const ler = t => decodificarTextoEstrito(t).valor;
const texto = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
const clone = v => JSON.parse(texto(v));
const congelar = v => { if(v && typeof v==='object'){Object.values(v).forEach(congelar);Object.freeze(v);}return v; };
const falha = codigo => Object.freeze({ok:false,codigo,publicado:false});
const exigir = (v,m) => { if(!v)throw Error(m); };
const referencia = (dominio,id) => `${dominio}:${encodeURIComponent(JSON.stringify([typeof id,id]))}`;

function camposCliente(c = {}) {
    const f=c.dadosFiscais||{}, campos={};
    for(const k of Object.keys(CAMPOS_FORMULARIO_CLIENTE))campos[k]='';
    for(const k of ['nome','documento','email','cep','numero','complemento','bairro','cidade','uf','responsavelPedido'])campos[k]=c[k]||'';
    campos.telefone=c.telefone||c.whatsapp||'';
    campos.ruaEndereco=c.ruaEndereco||c.rua||c.endereco||'';
    Object.assign(campos,{fiscalRazaoSocial:f.razaoSocial||'',fiscalCpfCnpj:f.cpfCnpj||c.documento||'',
        fiscalIE:f.inscricaoEstadual||'',fiscalIM:f.inscricaoMunicipal||'',fiscalEmail:f.emailFiscal||c.email||'',
        fiscalEndereco:f.enderecoFiscal||'',usarMesmoEnderecoCliente:f.usarMesmoEnderecoCliente!==false});
    return campos;
}

/** Sem importacao/ativacao. O bootstrap de ENSAIO recebe capacidades privadas, nao DTOs de formularios. */
export function criarPilotoCadastrosDeEnsaio(c) {
    exigir(c?.ensaioSintetico===true && c.contrato===CONTRATO_PILOTO_CADASTROS
        && typeof c.instalarFronteira==='function' && typeof c.renderizar==='function'
        && typeof c.obterAtorAutorizado==='function','BOOTSTRAP_PILOTO_INVALIDO');
    const identidade=validarIdentidadeBaseTexto(c.identidadeBaseTexto);
    exigir(identidade.ok,'IDENTIDADE_PILOTO_INVALIDA');
    c=Object.freeze({...c,identidadeBaseTexto:identidade.texto});
    const drafts=new WeakMap(), ids=new Set();
    let estado='AGUARDANDO_BOOTSTRAP', atual=null, porta=null, ocupado=false;
    const notificar=(codigo)=>{try{c.notificar?.(codigo);}catch(_){/* Notificacao nao comprova commit. */}};
    const fronteira=criarFronteiraEscritaDeEnsaio({...c,
        criarGatewayPrivado:permitir=>{
            const g=criarGatewayInterdominiosDeEnsaio({...c,
                obterAtorAutorizado:p=>permitir() && PERMISSOES.has(p)?c.obterAtorAutorizado(p):null});
            exigir(COMANDOS.every(t=>g.comandosDisponiveis.includes(t)),'PERFIL_CADASTRAL_INDISPONIVEL');
            return Object.freeze({...g,comandosDisponiveis:COMANDOS});
        },
        publicarConfirmado:(raiz,meta)=>{
            exigir(porta && meta.identidadeBaseTexto===c.identidadeBaseTexto
                && Number.isSafeInteger(meta.revisao) && meta.revisao>=0
                && (!atual || meta.revisao>=atual.revisao),'RAIZ_PILOTO_DIVERGENTE');
            exigir(porta.publicarConfirmado(raiz)===true,'PUBLICACAO_PILOTO_RECUSADA');
            atual={raiz,revisao:meta.revisao};
            exigir(c.renderizar(raiz,meta)===true,'RENDERIZACAO_PILOTO_RECUSADA');
            return true;
        }});
    // Instalar antes de carregar qualquer handler legado no host de ensaio.
    porta=c.instalarFronteira(fronteira.permitirLegado);
    exigir(porta && typeof porta.selar==='function' && typeof porta.publicarConfirmado==='function','PORTA_PILOTO_INVALIDA');
    porta.selar();
    const draft = token => {const d=drafts.get(token);exigir(d,'DRAFT_INVALIDO');return d;};
    async function exclusivo(fn) {
        if(ocupado)return falha('OPERACAO_EM_ANDAMENTO');
        ocupado=true;try{return await fn();}catch(e){return falha(e.message||'FALHA_PILOTO');}finally{ocupado=false;}
    }
    function operacao() {
        const id=c.gerarOperacaoId ? c.gerarOperacaoId() : `piloto:${globalThis.crypto.randomUUID()}`;
        exigir(typeof id==='string' && /^[a-z0-9][a-z0-9._:-]{0,119}$/.test(id) && !ids.has(id),'IDENTIDADE_OPERACAO_INVALIDA');
        ids.add(id);return id;
    }
    function pedido(d) {
        const tipo=`${d.dominio}.${d.acao==='criar'?'cadastrar':d.acao}.v1`;
        const chave=d.dominio==='cliente'?'clienteReferencia':'tipoReferencia';
        const dados=d.acao==='criar'?{id:d.id,campos:d.campos}
            :{[chave]:d.referencia,...(d.acao==='excluir'?{}:{campos:d.campos})};
        const dadosTexto=texto(dados);
        exigir(tipo==='cliente.cadastrar.v1'?validarCadastroClienteTexto(dadosTexto)
            :validarComandoCadastralTexto(tipo,dadosTexto),'CAMPOS_CADASTRAIS_INVALIDOS');
        return Object.freeze({operacaoId:d.operacaoId,tipo,revisaoEsperada:d.revisao,dadosTexto});
    }
    function concluir(d,r) {
        if(r.ok && r.recibo?.operacaoId===d.operacaoId && atual
            && atual.revisao>=r.recibo.revisao
            && ['COMMIT_CONFIRMADO','OPERACAO_JA_CONCLUIDA'].includes(r.codigo)) {
            d.status='CONFIRMADO';estado='PRONTO';notificar('SUCESSO_CONFIRMADO');return r;
        }
        d.status='AGUARDANDO_RECUPERACAO';
        if(r.codigo==='ESTADO_CONFIRMADO_REQUER_RECUPERACAO')estado='RECUPERACAO_VISUAL';
        notificar(r.codigo);return r.ok?falha('CONFIRMACAO_CADASTRAL_INSUFICIENTE'):r;
    }
    return Object.freeze({
        estado:()=>estado,
        async iniciar() {
            return exclusivo(async()=>{
                estado='BOOTSTRAP';notificar('CARREGANDO_ESTADO_CONFIRMADO');
                const r=await fronteira.cliente.atualizar();
                estado=r.ok && atual?'PRONTO':'BLOQUEADO';notificar(r.ok?'ESTADO_CONFIRMADO':r.codigo);return r;
            });
        },
        async atualizar() {
            return exclusivo(async()=>{
                exigir(estado==='PRONTO','PILOTO_NAO_PRONTO');
                const r=await fronteira.cliente.atualizar();if(!r.ok)estado='BLOQUEADO';return r;
            });
        },
        async abrir(intencaoTexto) {
            return exclusivo(async()=>{
                exigir(estado==='PRONTO','PILOTO_NAO_PRONTO');
                const v=ler(intencaoTexto);
                exigir(v && ['cliente','tipo'].includes(v.dominio) && ['criar','editar','excluir'].includes(v.acao)
                    && Object.keys(v).sort().join('|')===(v.acao==='criar'?'acao|dominio':'acao|dominio|referencia'),'INTENCAO_DRAFT_INVALIDA');
                const r=await fronteira.cliente.atualizar();
                if(!r.ok){estado='BLOQUEADO';return r;}
                const lista=atual.raiz[v.dominio==='cliente'?'locadores':'tipos'];
                const registros=v.acao==='criar'?[]:lista.filter(x=>referencia(v.dominio,x.id)===v.referencia);
                exigir(v.acao==='criar'||registros.length===1,'REFERENCIA_AUSENTE_OU_AMBIGUA');
                const original=registros[0], idOperacao=operacao();
                const d={dominio:v.dominio,acao:v.acao,referencia:v.referencia||null,
                    id:original?original.id:`piloto-${v.dominio}-${idOperacao}`,operacaoId:idOperacao,
                    revisao:atual.revisao,campos:v.dominio==='cliente'?camposCliente(original)
                        :{nome:original?.nome||'',desc:original?.desc||''},status:'EDICAO',pedido:null};
                const token=Object.freeze({});drafts.set(token,d);return Object.freeze({ok:true,draft:token});
            });
        },
        lerDraft(token) {
            try{const d=draft(token);return congelar({ok:true,dominio:d.dominio,acao:d.acao,
                revisaoOrigem:d.revisao,status:d.status,campos:clone(d.campos)});}catch(e){return falha(e.message);}
        },
        alterar(token,patchTexto) {
            try{
                exigir(!ocupado && estado==='PRONTO','PILOTO_NAO_PRONTO');const d=draft(token);
                exigir(d.status==='EDICAO' && d.acao!=='excluir','DRAFT_NAO_EDITAVEL');
                const p=ler(patchTexto),permitidos=d.dominio==='cliente'?Object.keys(CAMPOS_FORMULARIO_CLIENTE):['nome','desc'];
                exigir(p && typeof p==='object' && !Array.isArray(p) && Object.keys(p).every(k=>permitidos.includes(k)
                    && (k==='usarMesmoEnderecoCliente'?typeof p[k]==='boolean':typeof p[k]==='string'&&p[k].length<=2000)), 'CAMPOS_DRAFT_INVALIDOS');
                d.campos={...d.campos,...p};return Object.freeze({ok:true,codigo:'DRAFT_ALTERADO',publicado:false});
            }catch(e){return falha(e.message);}
        },
        cancelar(token) {
            try{exigir(!ocupado,'OPERACAO_EM_ANDAMENTO');const d=draft(token);
                exigir(['EDICAO','NAO_CONFIRMADO'].includes(d.status),'CONSULTAR_RESULTADO_ANTES_DE_DESCARTAR');drafts.delete(token);
                return Object.freeze({ok:true,codigo:'DRAFT_DESCARTADO',publicado:false});}catch(e){return falha(e.message);}
        },
        async salvar(token) {
            return exclusivo(async()=>{
                exigir(estado==='PRONTO','PILOTO_NAO_PRONTO');const d=draft(token);
                exigir(d.status==='EDICAO','CONSULTAR_RESULTADO_ANTES_DE_REPETIR');
                d.pedido=pedido(d);d.status='EM_ANDAMENTO';notificar('OPERACAO_EM_ANDAMENTO');
                return concluir(d,await fronteira.cliente.executar(d.pedido));
            });
        },
        async recuperar(token) {
            return exclusivo(async()=>{
                const d=draft(token);exigir(d.pedido && d.status==='AGUARDANDO_RECUPERACAO','SEM_OPERACAO_PARA_RECUPERAR');
                const r=await fronteira.cliente.recuperar(d.pedido);
                if(r.codigo==='OPERACAO_NAO_ENCONTRADA') {
                    const l=await fronteira.cliente.atualizar();
                    if(!l.ok){estado='BLOQUEADO';return l;}
                    // O usuario deve reabrir/mesclar o draft; nunca reenvio automatico.
                    d.status='NAO_CONFIRMADO';estado='PRONTO';notificar('OPERACAO_NAO_CONFIRMADA_REABRIR_FORMULARIO');return r;
                }
                return concluir(d,r);
            });
        }
    });
}
