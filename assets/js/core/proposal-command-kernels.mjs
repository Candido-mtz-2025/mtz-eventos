import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
import { criarNucleoPropostas } from './proposal-kernel.generated.mjs';
import { consultarContextoJournal } from './indexeddb-authority.mjs';
import { COMANDO_CONVERSAO_PROPOSTA, reduzirConversaoJournalTexto } from './proposal-conversion-replay.mjs';

// DTO comercial: valores calculados, documentos e estados administrativos nao entram.
export const COMANDOS_PROPOSTA = Object.freeze({
    'proposta.criar.v1': Object.freeze({ permissao: 'criar_proposta' }),
    'proposta.editar.v1': Object.freeze({ permissao: 'editar_proposta' }),
    'proposta.anexo_adicionar.v1': Object.freeze({ permissao: 'editar_proposta', acao: 'anexo_adicionar' }),
    'proposta.anexo_editar.v1': Object.freeze({ permissao: 'editar_proposta', acao: 'anexo_editar' }),
    'proposta.anexo_remover.v1': Object.freeze({ permissao: 'editar_proposta', acao: 'anexo_remover' }),
    'proposta.pdf_previa.v1': Object.freeze({ permissao: 'editar_proposta', acao: 'pdf_previa_solicitada' }),
    'proposta.status.v1': Object.freeze({ permissao: 'editar_proposta', acao: 'status' }),
    'proposta.duplicar.v1': Object.freeze({ permissao: 'criar_proposta', acao: 'duplicar', novo: true }),
    'proposta.revisar.v1': Object.freeze({ permissao: 'criar_proposta', acao: 'revisao', novo: true }),
    'proposta.excluir.v1': Object.freeze({ permissao: 'excluir_registro', acao: 'excluir' })
});
const ler = t => decodificarTextoEstrito(t).valor;
const canon = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
const exigir = (v, m) => { if (!v) throw Error(m); };
const objeto = v => v && typeof v === 'object' && !Array.isArray(v);
const idValido = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 160
    || typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0);
const ref = (t,id) => `${t}:${encodeURIComponent(JSON.stringify([typeof id,id]))}`;
const textos = nomes => Object.fromEntries(nomes.split(' ').map(k => [k,'texto']));
const numeros = nomes => Object.fromEntries(nomes.split(' ').map(k => [k,'numero']));
const equipe = { ...numeros('pessoas valorPessoaDia dias') };
const hospedagem = { ...numeros('pessoas diarias valorDiariaPessoa') };
const ITEM = { ...textos('categoria tipoFiscal descricao medida observacoes tipoCalculoEncargos tipoCalculoINSS origemCusto fornecedorCusto'),
    ...numeros('periodoDias quantidade custoUnitario percentualHonorarios percentualEncargos percentualINSS percentualCustoProprio custoProprioManualTotal quantidadePropria quantidadeTerceirizada custoTerceirizadoReal'),
    aplicarHonorarios:'boolean', aplicarEncargos:'boolean', aplicarINSS:'boolean', confirmacaoLocacaoPuraSeparada:'boolean',
    indiceOrigem:'indice', tipoReferencia:'texto', modoCustoProprio:'texto' };
const FINANCEIRO = { ...numeros('desconto acrescimo percentualNF percentualEntrada validadePropostaDias'),
    ...textos('tipoCalculoNF vencimentoEntrada vencimentoSaldo formaPagamento condicaoPagamento observacaoPagamento validadePropostaData') };
const CAMPOS = {
    clienteReferencia:'texto', clienteManual:{...textos('nome documento telefone email endereco cep ruaEndereco numero complemento bairro cidade uf responsavelPedido razaoSocial nomeFantasia cpfCnpj inscricaoEstadual inscricaoMunicipal enderecoFiscal cidadeFiscal ufFiscal cepFiscal emailFiscal contatoFinanceiro'),
        dadosFiscais:{usarMesmoEnderecoCliente:'boolean'}},
    clientePrecisaNotaFiscal:'boolean', responsavelProposta:'texto',
    evento:textos('nome local enderecoEvento cidadeEvento ufEvento referenciaAcesso dataMontagem horaMontagem dataEvento horaInicioEvento horaFimEvento dataDesmontagem horaDesmontagem observacoesGerais'),
    financeiro:FINANCEIRO,
    custos: { ...numeros('frete freteDistanciaKm freteValorKm freteTrechos maoObra hospedagem operador eletrica gerador terceirizados outros'),
        maoObraCobrada:{detalhada:'boolean',montagem:equipe,desmontagem:equipe}, hospedagemCobrada:hospedagem },
    controleInterno:{...numeros('custoInternoTotal custoTerceirizadoTotal outrosCustosInternos'),
        maoObraOperacional:equipe,hospedagemOperacional:hospedagem},
    fiscal:textos('tomador cpfCnpj emailFiscal municipioPrestacao codigoServicoMunicipal municipioIncidencia ufIncidencia descricaoFiscalSugerida observacoesEmissao'),
    escopo:textos('inclusoProposta naoInclusoProposta observacoesComerciais')
};
function campos(v, schema) {
    return objeto(v) && Object.entries(v).every(([k,x]) => Object.hasOwn(schema,k)
        && (objeto(schema[k]) ? campos(x,schema[k]) : schema[k] === 'texto' ? typeof x === 'string' && x.length <= 20000
            : schema[k] === 'boolean' ? typeof x === 'boolean'
                : typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= Number.MAX_SAFE_INTEGER / 100
                    && (schema[k] !== 'indice' || Number.isSafeInteger(x))));
}
function exatas(v, nomes) { return objeto(v) && canon(Object.keys(v).sort()) === canon(nomes.sort()); }

export const COMANDO_CONFIG_ORCAMENTO = 'config.orcamento_salvar.v1';
const GLOBAIS_ORCAMENTO = {
    ...numeros('percentualHonorariosPadrao percentualEncargosPadrao percentualINSSPadrao percentualEntradaPadrao percentualDescontoPadrao percentualFiscalPadrao'),
    ...textos('tipoCalculoEncargosPadrao tipoCalculoINSSPadrao tipoCalculoFiscalPadrao'),
    aplicarFiscalAutomaticamente:'boolean',
    politicaCustosProprios:{modo:'texto',percentual:'numero'}
};
const CATEGORIA_ORCAMENTO = {
    ...textos('nome cor icone tipoCalculoEncargos tipoCalculoINSS'),
    ...numeros('percentualHonorarios percentualEncargos percentualINSS'),
    ordem:'indice',ativa:'boolean',aplicarHonorarios:'boolean',aplicarEncargos:'boolean',aplicarINSS:'boolean'
};
const LINHA_FISCAL = {...textos('documentoSugerido observacaoFiscalPadrao'),
    entraBaseNfse:'boolean',exigeConferenciaContador:'boolean',permiteRetencaoINSS:'boolean'};
const PERFIL_FISCAL = {...textos('regimeTributario cnpj inscricaoMunicipal municipioEstabelecimento ufEstabelecimento responsavelValidacao dataValidacao vigenciaInicio observacoes cnaes'),
    validadoPorContador:'boolean'};

function parametrosValidos(v) {
    return Object.entries(v).every(([k,x])=>{
        if(k.startsWith('percentual')) return x<=(/^(percentualEntradaPadrao|percentualDescontoPadrao|percentual)$/.test(k)?100:99.99);
        if(k.startsWith('tipoCalculo')) return k==='tipoCalculoFiscalPadrao'
            ? ['descontar','acrescentar'].includes(x):['simples','por_dentro'].includes(x);
        if(k==='modo') return ['percentual','manual','nao_calcular'].includes(x);
        return !objeto(x)||parametrosValidos(x);
    });
}
export function validarConfigOrcamentoTexto(texto) {
    try {
        const d=ler(texto);
        return objeto(d)&&Object.keys(d).length>0&&Object.keys(d).every(k=>{
            const v=d[k];
            if(k==='globais') return campos(v,GLOBAIS_ORCAMENTO)&&parametrosValidos(v);
            if(k==='perfilFiscal') return campos(v,PERFIL_FISCAL)
                &&(!v.ufEstabelecimento||/^[a-z]{2}$/i.test(v.ufEstabelecimento.trim()))
                &&['dataValidacao','vigenciaInicio'].every(f=>!v[f]||/^\d{4}-\d{2}-\d{2}$/.test(v[f])
                    &&new Date(v[f]).toISOString().slice(0,10)===v[f]);
            if(k==='valorKmFretePadrao') return campos({v},{v:'numero'});
            if(k==='matrizFiscal') return objeto(v)&&Object.keys(v).length<=20
                &&Object.values(v).every(x=>campos(x,LINHA_FISCAL));
            if(k==='categorias') return Array.isArray(v)&&v.length<=500&&v.every(x=>
                (exatas(x,['referencia','campos'])&&typeof x.referencia==='string'||exatas(x,['campos'])&&!!x.campos?.nome?.trim())
                &&campos(x.campos,CATEGORIA_ORCAMENTO)&&parametrosValidos(x.campos));
            return false;
        });
    } catch (_) { return false; }
}

/** Apenas a configuracao muda; o journal guarda o evento e o contexto de replay. */
export function prepararConfigOrcamentoTexto(snapshotTexto,dadosTexto,meta) {
    exigir(validarConfigOrcamentoTexto(dadosTexto),'CONFIG_ORCAMENTO_INVALIDA');
    const s=ler(snapshotTexto), d=ler(dadosTexto), config=s.config;
    const nucleo=c=>criarNucleoPropostas({config:c,propostas:s.propostas,timestamp:meta.timestamp,ator:meta.atorReferencia});
    const n=nucleo(config), atuais=n.obterPadroesOrcamento();
    const globais=mesclar(atuais.globais,d.globais??{});
    globais.politicaCustosProprios={...globais.politicaCustosProprios,
        configurada:true,origem:'config_usuario',versao:n.VERSAO_POLITICA_CUSTOS_PROPRIOS};
    for(const lista of [config.categoriasOrcamento,config.padroesOrcamento?.categoriasOrcamento]) {
        if(!Array.isArray(lista)) continue;
        const ids=new Set();
        for(const c of lista) if(objeto(c)&&Object.hasOwn(c,'id')) {
            exigir(typeof c.id==='string'&&idValido(c.id)&&c.id===n.normalizarIdCategoriaOrcamento(c.id)
                &&!Object.hasOwn(Object.prototype,c.id)&&!ids.has(c.id),'CATALOGO_CATEGORIA_AMBIGUO');
            ids.add(c.id);
        }
    }
    const categoriasAtuais=n.obterCategoriasOrcamento();
    const categorias=n.normalizarCategoriasOrcamentoConfig(atuais.categoriasOrcamento,atuais.categorias,atuais.globais);
    for(const c of categoriasAtuais) if(!categorias.some(x=>x.id===c.id)) categorias.push(c);
    const porId=new Map(categorias.map(c=>[c.id,c])), alteradas=new Set();
    for(const {referencia,campos:c} of d.categorias??[]) {
        const antiga=referencia===undefined?null:resolver(categorias,'categoria-orcamento',referencia);
        let id=antiga?.id??n.normalizarIdCategoriaOrcamento(c.nome);
        exigir(idValido(id)&&!Object.hasOwn(Object.prototype,id)&&id!=='prototype','ID_CATEGORIA_INVALIDO');
        if(!antiga) {
            const base=id;
            for(let i=2;porId.has(id);i++) id=`${base}-${i}`;
        }
        exigir(idValido(id),'ID_CATEGORIA_INVALIDO');
        exigir(!alteradas.has(id),'CATEGORIA_REPETIDA');alteradas.add(id);
        const editada=n.normalizarCategoriaConfigOrcamento({...antiga,...c,id},porId.size,globais,atuais.categorias);
        exigir(editada.id===id&&editada.nome.trim(),'IDENTIDADE_CATEGORIA_DIVERGENTE');
        exigir(!(antiga?.fixa&&c.ativa===false),'CATEGORIA_FIXA');
        porId.set(id,editada);
    }
    const matriz={...atuais.matrizFiscal};
    for(const [tipo,campos] of Object.entries(d.matrizFiscal??{})) {
        exigir(n.normalizarTipoFiscalItem(tipo)===tipo&&Object.hasOwn(matriz,tipo),'TIPO_FISCAL_INVALIDO');
        matriz[tipo]=n.normalizarRegraMatrizFiscal(tipo,{...matriz[tipo],...campos});
    }
    const lista=[...porId.values()];
    const regras=Object.fromEntries(lista.map(c=>[c.id,c]));
    const catalogo=n.normalizarCategoriasOrcamentoConfig(lista,regras,globais);
    const perfil=n.obterPerfilFiscalEmpresa(), entradaPerfil={...d.perfilFiscal};
    if(Object.hasOwn(entradaPerfil,'cnaes')) entradaPerfil.cnaes=entradaPerfil.cnaes.split(/[\n,;]+/);
    const perfilFiscalEmpresa=n.normalizarPerfilFiscalEmpresa({...perfil,...entradaPerfil});
    const identidade=v=>v.trim().replace(/[.\/-]/g,'').toUpperCase();
    exigir(!perfil.cnpj||perfilFiscalEmpresa.cnpj
        &&identidade(perfil.cnpj)===identidade(perfilFiscalEmpresa.cnpj),'EMITENTE_DIVERGENTE');
    if(perfilFiscalEmpresa.validadoPorContador)
        exigir(['cnpj','regimeTributario','responsavelValidacao'].every(k=>perfilFiscalEmpresa[k].trim()),'PERFIL_FISCAL_INCOMPLETO');

    const padroes=n.normalizarPadroesOrcamento({globais,categorias:regras,categoriasOrcamento:lista,matrizFiscal:matriz});
    const conservarLista=(origem,lista)=>lista.map(c=>mesclar(
        Array.isArray(origem)?origem.find(x=>x?.id===c.id)??{}:{},c));
    const anterior=config.padroesOrcamento??{};
    // A lista derivada e indexada por identidade, nunca pela posicao da linha.
    const padroesOrcamento=mesclar(anterior,{...padroes,
        categoriasOrcamento:conservarLista(anterior.categoriasOrcamento,padroes.categoriasOrcamento)});
    const novo={...config,padroesOrcamento,categoriasOrcamento:conservarLista(config.categoriasOrcamento,catalogo),
        valorKmFretePadrao:d.valorKmFretePadrao??config.valorKmFretePadrao??0,perfilFiscalEmpresa};
    const posterior=nucleo(novo);
    for(const c of lista) exigir(posterior.obterCategoriaOrcamentoPorValor(c.id,{criarArquivada:false})?.id===c.id,
        'CATEGORIA_EM_USO_DIVERGENTE');
    const evidencias=s.logsAuditoria.filter(a=>a.origem==='proposta_transacional')
        .flatMap(a=>[a.anteriorSnapshot,a.registroSnapshot]).filter(Boolean);
    for(const p of [...s.propostas,...evidencias]) for(const i of p.itens) {
        exigir(n.obterCategoriaOrcamentoPorValor(i.categoria)?.id===posterior.obterCategoriaOrcamentoPorValor(i.categoria)?.id,
            'REFERENCIA_CATEGORIA_DIVERGENTE');
    }
    return canon({...s,config:novo});
}
export function validarComandoPropostaTexto(tipo,texto) {
    try {
        if (typeof tipo!=='string'||!Object.hasOwn(COMANDOS_PROPOSTA,tipo)) return false;
        const d=ler(texto), criar=tipo==='proposta.criar.v1', chave=criar?'id':'propostaReferencia';
        const aux=COMANDOS_PROPOSTA[tipo].acao;
        if(aux) {
            if(typeof d?.propostaReferencia!=='string') return false;
            if(aux==='anexo_adicionar'||aux==='anexo_editar') {
                const identidade=aux==='anexo_adicionar'?'id':'anexoReferencia';
                return exatas(d,['propostaReferencia',identidade,'campos'])
                    && (identidade==='id'?idValido(d.id):typeof d.anexoReferencia==='string')
                    && exatas(d.campos,['nome','categoria','url','descricao'])
                    && campos(d.campos,textos('nome categoria url descricao')) && !!d.campos.nome.trim();
            }
            if(aux==='anexo_remover') return exatas(d,['propostaReferencia','anexoReferencia'])&&typeof d.anexoReferencia==='string';
            if(aux==='pdf_previa_solicitada') return exatas(d,['propostaReferencia','interno'])&&typeof d.interno==='boolean';
            if(aux==='excluir') return exatas(d,['propostaReferencia']);
            if(aux==='status') return exatas(d,['propostaReferencia','status','motivo'])
                && ['rascunho','em_negociacao','enviada','aprovada','recusada','cancelada'].includes(d.status)
                && typeof d.motivo==='string'&&d.motivo.length<=20000
                && (['recusada','cancelada'].includes(d.status)?!!d.motivo.trim():d.motivo==='');
            return exatas(d,['propostaReferencia','id'])&&idValido(d.id);
        }
        return exatas(d,[chave,'campos','itens']) && (criar?idValido(d.id):typeof d.propostaReferencia==='string')
            && campos(d.campos,CAMPOS) && !(d.campos.clienteReferencia && d.campos.clienteManual)
            && Array.isArray(d.itens) && d.itens.length>0 && d.itens.length<=500
            && d.itens.every(i=>campos(i,ITEM) && (!criar || !Object.hasOwn(i,'indiceOrigem')));
    } catch (_) { return false; }
}
function resolver(lista,t,r) {
    exigir(typeof r==='string','REFERENCIA_INVALIDA');
    const encontrados=lista.filter(x=>idValido(x.id)&&ref(t,x.id)===r);
    exigir(encontrados.length===1,'REFERENCIA_AUSENTE_OU_AMBIGUA'); return encontrados[0];
}
function mesclar(a,b) {
    if (!objeto(a)||!objeto(b)) return b;
    return Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])]
        .map(k=>[k,Object.hasOwn(b,k)?mesclar(a[k],b[k]):a[k]]));
}
function verificarNumeros(v) {
    if (Array.isArray(v)) return v.forEach(verificarNumeros);
    if (objeto(v)) return Object.entries(v).forEach(([k,x])=>{
        // IDs e extensoes nao sao montantes. Limitar somente os valores do calculo.
        if(typeof x==='number'&&/^(valor|custo|subtotal|total|lucro|margem|quantidade|periodo|frete|desconto|acrescimo|percentual|pessoas|diarias|dias)/i.test(k))
            exigir(Number.isFinite(x)&&Math.abs(x)<=Number.MAX_SAFE_INTEGER/100,'VALOR_FORA_DO_LIMITE');
        else if(objeto(x)||Array.isArray(x))verificarNumeros(x);
    });
}
function verificarRegistro(s,p) {
    exigir(objeto(p)&&idValido(p.id)&&typeof p.codigo==='string'&&p.codigo.trim(),'PROPOSTA_INVALIDA');
    exigir(typeof p.dataCriacao==='string'&&Number.isFinite(Date.parse(p.dataCriacao))
        &&typeof p.dataUltimaAlteracao==='string'&&Number.isFinite(Date.parse(p.dataUltimaAlteracao)), 'DATA_PROPOSTA_INVALIDA');
    exigir(Array.isArray(p.itens)&&p.itens.length>0&&Array.isArray(p.anexos)&&Array.isArray(p.historicoRevisoes), 'CONTEUDO_PROPOSTA_INVALIDO');
    const n=criarNucleoPropostas({config:s.config,propostas:s.propostas,timestamp:p.dataUltimaAlteracao,ator:p.alteradoPor});
    exigir(p.cliente?.nome&&p.evento?.nome,'IDENTIFICACAO_COMERCIAL_AUSENTE');
    if (p.clienteId!=='') {
        resolver(s.locadores,'cliente',ref('cliente',p.clienteId));
        exigir(p.cliente.id===p.clienteId&&p.clienteSnapshot.id===p.clienteId,'CLIENTE_SNAPSHOT_DIVERGENTE');
    }
    for (const i of p.itens) {
        exigir(objeto(i)&&typeof i.descricao==='string'&&i.descricao.trim()&&i.quantidade>0
            &&!n.obterInconsistenciaQuantidadeOperacionalItem(i),'ITEM_INVALIDO');
        if (Object.hasOwn(i,'tipoId')) resolver(s.tipos,'tipo',ref('tipo',i.tipoId));
    }
    const ids=new Set();
    for (const a of p.anexos) {
        exigir(objeto(a)&&idValido(a.id)&&a.propostaId===p.id&&typeof a.nome==='string'&&a.nome.trim()
            &&n.normalizarUrlAnexoProposta(a.url)&&!ids.has(ref('anexo',a.id)), 'ANEXO_INVALIDO');
        ids.add(ref('anexo',a.id));
    }
    verificarNumeros(p);
    const recalculada=n.construirPropostaComercialCalculada(p,p);
    exigir(canon(recalculada)===canon(p),'CALCULO_COMERCIAL_DIVERGENTE');
}
// O prefixo foi reconstruido pela autoridade. A configuracao de um comando
// comercial e a da raiz anterior, nao a declarada na auditoria ou no DTO.
function validarPropostas(texto, contexto, incluirEvento = false, capacidade = null) {
    try {
        const s=ler(texto),ids=new Set(),codigos=new Set();
        exigir(Array.isArray(s.propostas),'PROPOSTAS_INVALIDAS');
        const eventos=contexto?.eventosAnteriores;
        const configuracoes=new Map();
        const genesis=eventos ? ler(eventos[0].snapshotTexto).config : s.config;
        if(eventos) {
            for(const [i,e] of eventos.entries()) {
                if(Object.hasOwn(COMANDOS_PROPOSTA,e.tipo)) {
                    const anterior=eventos[i-1];
                    exigir(anterior,'CONTEXTO_FISCAL_AUSENTE');
                    configuracoes.set(e.operacaoId,ler(anterior.snapshotTexto).config);
                }
            }
            if(incluirEvento && Object.hasOwn(COMANDOS_PROPOSTA,contexto.tipo))
                configuracoes.set(contexto.operacaoId,ler(contexto.snapshotAnteriorTexto).config);
        }
        for(const p of s.propostas){const r=ref('proposta',p.id);
            exigir(!ids.has(r)&&!codigos.has(p.codigoExibicao),'PROPOSTA_DUPLICADA');ids.add(r);codigos.add(p.codigoExibicao);}
        const cadeia=new Map(),ops=new Set(),contextos=new Map(),excluidas=new Set();
        for(const a of s.logsAuditoria.filter(a=>a.origem==='proposta_transacional')) {
            const plano=ler(a.assinaturaPlano),tipo=plano.comando,spec=COMANDOS_PROPOSTA[tipo];
            const criar=tipo==='proposta.criar.v1'||spec?.novo===true, aux=spec?.acao;
            exigir(validarComandoPropostaTexto(tipo,canon(plano.dados))
                &&exatas(plano,['comando','dados','metadados'])&&exatas(plano.metadados,['operacaoId','atorReferencia','timestamp'])
                &&plano.metadados.operacaoId===a.operacaoId&&plano.metadados.atorReferencia===a.usuario
                &&plano.metadados.timestamp===a.timestamp&&a.data===a.timestamp&&a.tipo==='proposta'
                &&a.acao===(aux??(criar?'criar':'editar'))&&!ops.has(a.operacaoId),'AUDITORIA_PROPOSTA_DIVERGENTE');
            ops.add(a.operacaoId);
            const p=aux==='excluir'?a.anteriorSnapshot:a.registroSnapshot,r=ref('proposta',p.id);
            exigir(a.propostaReferencia===r&&(criar?plano.dados.id===p.id:plano.dados.propostaReferencia===r), 'AUDITORIA_IDENTIDADE_DIVERGENTE');
            exigir(!excluidas.has(r)&&(!eventos||configuracoes.has(a.operacaoId)),'CONTEXTO_FISCAL_AUSENTE_OU_EXCLUIDO');
            if(aux==='excluir') {
                exigir(a.registroSnapshot===null&&(!cadeia.has(r)||canon(cadeia.get(r))===canon(p)),'EXCLUSAO_DIVERGENTE');
                verificarRegistro({...s,config:contextos.get(r)??genesis},p);
                exigir(!s.propostas.some(x=>Object.is(x.id,p.id)),'PROPOSTA_EXCLUIDA_REAPARECEU');
                exigir(!temVinculoProposta(s,p),'PROPOSTA_EXCLUIDA_COM_VINCULO');
                cadeia.delete(r);excluidas.add(r);
                continue;
            }
            if(criar)exigir(a.anteriorSnapshot===null&&!cadeia.has(r),'CRIACAO_CONTRADITORIA');
            else {
                exigir(a.anteriorSnapshot?.id===p.id&&(!cadeia.has(r)||canon(cadeia.get(r))===canon(a.anteriorSnapshot)), 'PREDECESSOR_PROPOSTA_DIVERGENTE');
                verificarRegistro({...s,config:contextos.get(r)??genesis},a.anteriorSnapshot);
                if(!aux) {
                    for(const k of ['anexos','historicoRevisoes','status','dataCriacao','criadoPor','locacaoId','locacaoVinculadaId'])
                        exigir(canon(a.anteriorSnapshot[k])===canon(p[k]),'CAMPO_PROTEGIDO_DIVERGENTE');
                } else {
                    exigir(canon(aplicarAuxiliarExistente(s,a.anteriorSnapshot,aux,plano.dados,plano.metadados))===canon(p),
                        'EFEITO_AUXILIAR_DIVERGENTE');
                }
            }
            const config=aux&&!criar ? contextos.get(r)??genesis : eventos?configuracoes.get(a.operacaoId):s.config;
            verificarRegistro({...s,config},p);cadeia.set(r,p);contextos.set(r,config);
        }
        // O prefixo ja foi reconstruido integralmente pela autoridade. O evento
        // atual so entra na comparacao depois de repetir seu redutor concreto.
        const conversoes = [];
        if (eventos) for (const [i, e] of eventos.entries()) {
            if (e.tipo === COMANDO_CONVERSAO_PROPOSTA)
                conversoes.push([eventos[i - 1].snapshotTexto, e.snapshotTexto,
                    ler(ler(e.assinaturaComando).dadosTexto).propostaReferencia]);
        }
        if (capacidade && contexto.tipo === COMANDO_CONVERSAO_PROPOSTA) {
            const { snapshotAnteriorTexto, dadosTexto, operacaoId, atorReferencia, timestamp } = contexto;
            const posterior = reduzirConversaoJournalTexto(snapshotAnteriorTexto, dadosTexto,
                { operacaoId, atorReferencia, timestamp }, capacidade);
            conversoes.push([snapshotAnteriorTexto, posterior, ler(dadosTexto).propostaReferencia]);
        }
        for (const [r,p] of cadeia) {
            let esperado = canon(p);
            for (const [anterior, posterior, referencia] of conversoes) {
                if (referencia === r && canon(resolver(ler(anterior).propostas,'proposta',r)) === esperado)
                    esperado = canon(resolver(ler(posterior).propostas,'proposta',r));
            }
            exigir(canon(resolver(s.propostas,'proposta',r)) === esperado,'CAUDA_PROPOSTA_DIVERGENTE');
        }
        for(const p of s.propostas) if(!cadeia.has(ref('proposta',p.id))) verificarRegistro({...s,config:genesis},p);
        return true;
    } catch (_) { return false; }
}
function aplicarAuxiliarExistente(s,p,acao,d,m) {
    if(acao==='pdf_previa_solicitada') return p;
    const q={...p,dataUltimaAlteracao:m.timestamp,atualizadoEm:m.timestamp,alteradoPor:m.atorReferencia};
    if(acao==='status') {
        exigir(p.status!==d.status,'STATUS_INALTERADO');
        q.status=d.status;
        const recusada=d.status==='recusada', cancelada=d.status==='cancelada';
        if(recusada||cancelada) {
            q.motivoStatus=d.motivo.trim();
            const motivo=recusada?'motivoRecusa':'motivoCancelamento';
            q[motivo]=q.motivoStatus;
        }
        const n=criarNucleoPropostas({config:s.config,propostas:s.propostas,timestamp:m.timestamp,ator:m.atorReferencia});
        n.aplicarDatasAutomaticasStatus(q,p,m.timestamp);
        return q;
    }
    const anexos=p.anexos.slice(), incluir=acao==='anexo_adicionar';
    const anterior=incluir?null:resolver(anexos,'anexo',d.anexoReferencia);
    if(acao==='anexo_remover') anexos.splice(anexos.indexOf(anterior),1);
    else {
        const id=incluir?d.id:anterior.id;
        exigir(!incluir||!anexos.some(a=>Object.is(a.id,id)),'ANEXO_DUPLICADO');
        const n=criarNucleoPropostas({config:s.config,propostas:s.propostas,timestamp:m.timestamp,ator:m.atorReferencia});
        // A normalizacao legada fornece o formato do link; nao recalcula a proposta persistida.
        const normal=n.normalizarAnexoProposta({...anterior,...d.campos,id:String(id),
            data:m.timestamp,usuario:m.atorReferencia,criadoEm:anterior?.criadoEm||m.timestamp,atualizadoEm:m.timestamp},p.id);
        exigir(normal.nome&&normal.url,'ANEXO_INVALIDO');
        const anexo={...anterior,...normal,id,propostaId:p.id,anexoOrigemId:anterior?.anexoOrigemId??''};
        if(incluir) anexos.push(anexo);else anexos[anexos.indexOf(anterior)]=anexo;
    }
    return {...q,anexos};
}

function criarDerivada(s,p,acao,d,m) {
    exigir(!s.propostas.some(x=>Object.is(x.id,d.id)),'PROPOSTA_DUPLICADA');
    const n=criarNucleoPropostas({config:s.config,propostas:s.propostas,timestamp:m.timestamp,ator:m.atorReferencia});
    const revisao=acao==='revisao', codigo=revisao?p.codigoBase:n.gerarCodigoProposta();
    const numero=revisao?n.obterProximaRevisaoProposta(codigo):0;
    exigir(Number.isSafeInteger(numero),'REVISAO_INVALIDA');
    const historico=revisao?p.historicoRevisoes.slice():[];
    if(revisao&&!historico.some(x=>Object.is(x.id,p.id))) historico.push({
        id:p.id,codigo:p.codigoExibicao,revisao:p.revisao,status:p.status,data:m.timestamp,usuario:m.atorReferencia
    });
    const anexos=revisao?p.anexos.map((a,i)=>({...a,id:`anexo-${i+1}`,
        propostaId:d.id,anexoOrigemId:a.id,copiadoEm:m.timestamp,copiadoPor:m.atorReferencia})):[];
    return n.construirPropostaComercialCalculada({...p,id:d.id,codigo,codigoBase:codigo,
        revisao:numero,numeroRevisao:numero,status:'rascunho',locacaoId:'',locacaoVinculadaId:'',
        dataCriacao:m.timestamp,dataUltimaAlteracao:m.timestamp,criadoPor:m.atorReferencia,alteradoPor:m.atorReferencia,
        dataEnvio:'',dataAprovacao:'',dataCancelamento:'',dataConversaoLocacao:'',
        propostaOrigemId:revisao?(idValido(p.propostaOrigemId)?p.propostaOrigemId:p.id):'',
        historicoRevisoes:historico,motivoRevisao:revisao?`Revisao criada a partir de ${p.codigoExibicao}`:'',
        anexos,evento:revisao?p.evento:{...p.evento,nome:`${p.evento.nome} (copia)`}});
}

function temVinculoProposta(s,p) {
    const referencia=ref('proposta',p.id);
    const camposId=new Set(['propostaId','propostaOrigemId','origemPropostaId','propostaBaseOrigemId']);
    function tem(v) {
        if(!v||typeof v!=='object') return false;
        if(Array.isArray(v)) return v.some(tem);
        return Object.entries(v).some(([k,x])=>(camposId.has(k)&&Object.is(x,p.id))
            || (k==='historicoRevisoes'&&Array.isArray(x)&&x.some(r=>Object.is(r?.id,p.id)))
            || (typeof x==='string'&&x===referencia) || tem(x));
    }
    return Object.entries(s).some(([k,v])=>k!=='logsAuditoria'
        &&tem(k==='propostas'?v.filter(x=>x!==p):v));
}
export function validarPropostasTexto(texto, capacidade) {
    if(capacidade===undefined) return validarPropostas(texto,null);
    const contexto=consultarContextoJournal(capacidade);
    return contexto?.fase==='validar' && contexto.snapshotPosteriorTexto===texto
        && validarPropostas(texto,contexto,true,capacidade);
}
/** Puro. O gateway fornece a raiz, o ator e o relogio da autoridade. */
export function prepararComandoPropostaTexto(tipo,snapshotTexto,dadosTexto,metadadosTexto,capacidade) {
    try {
        exigir(validarComandoPropostaTexto(tipo,dadosTexto),'COMANDO_PROPOSTA_INVALIDO');
        const s=JSON.parse(decodificarTextoEstrito(snapshotTexto).texto),d=ler(dadosTexto),m=ler(metadadosTexto),criar=tipo==='proposta.criar.v1';
        exigir(exatas(m,['operacaoId','atorReferencia','timestamp'])&&typeof m.operacaoId==='string'
            &&/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId)&&typeof m.atorReferencia==='string'&&m.atorReferencia.trim()
            &&typeof m.timestamp==='string'&&new Date(m.timestamp).toISOString()===m.timestamp,'METADADOS_INVALIDOS');
        const contexto=capacidade===undefined?null:consultarContextoJournal(capacidade);
        exigir(capacidade===undefined || contexto && contexto.tipo===tipo
            && contexto.snapshotAnteriorTexto===snapshotTexto && contexto.dadosTexto===dadosTexto
            && contexto.operacaoId===m.operacaoId && contexto.atorReferencia===m.atorReferencia
            && contexto.timestamp===m.timestamp,'CONTEXTO_COMERCIAL_INVALIDO');
        exigir(validarPropostas(snapshotTexto,contexto),'ORIGEM_PROPOSTAS_INVALIDA');
        exigir(!s.logsAuditoria.some(a=>a.operacaoId===m.operacaoId),'OPERACAO_REQUER_RECUPERACAO');
        const anterior=criar?null:resolver(s.propostas,'proposta',d.propostaReferencia),id=criar?d.id:anterior.id;
        const spec=COMANDOS_PROPOSTA[tipo];
        if(criar||spec.novo) {
            const r=ref('proposta',d.id);
            exigir(!s.logsAuditoria.some(a=>a.origem==='proposta_transacional'&&a.acao==='excluir'
                &&a.propostaReferencia===r),'IDENTIDADE_PROPOSTA_EXCLUIDA');
        }
        exigir(!criar||!s.propostas.some(p=>ref('proposta',p.id)===ref('proposta',id)),'PROPOSTA_DUPLICADA');
        const semVinculo=v=>v===''||v===null||v===undefined;
        if(anterior) exigir(semVinculo(anterior.locacaoVinculadaId)&&semVinculo(anterior.locacaoId)
            &&anterior.status!=='convertida','CONVERSAO_FORA_DO_ESCOPO');
        if(spec.acao) {
            const excluir=spec.acao==='excluir';
            if(excluir) exigir(!temVinculoProposta(s,anterior),'PROPOSTA_COM_VINCULO');
            const previa=spec.acao==='pdf_previa_solicitada';
            if(previa||spec.acao==='status'&&['enviada','aprovada'].includes(d.status)) {
                const n=criarNucleoPropostas({config:s.config,propostas:s.propostas,timestamp:m.timestamp,ator:m.atorReferencia});
                exigir(!n.obterPendenciasPropostaPronta(anterior,{modo:previa?'pdf':'status'}).length,
                    'PROPOSTA_NAO_PRONTA');
                if(previa) exigir(!n.obterPendenciasFiscaisObrigatoriasProposta(anterior).length,'DADOS_FISCAIS_INCOMPLETOS');
            }
            const proposta=excluir?null:spec.novo?criarDerivada(s,anterior,spec.acao,d,m)
                :aplicarAuxiliarExistente(s,anterior,spec.acao,d,m);
            if(excluir) s.propostas.splice(s.propostas.indexOf(anterior),1);
            else if(spec.novo) s.propostas.push(proposta);else s.propostas[s.propostas.indexOf(anterior)]=proposta;
            s.logsAuditoria.push({id:`audit-proposta-${m.operacaoId}`,tipo:'proposta',acao:spec.acao,
                origem:'proposta_transacional',operacaoId:m.operacaoId,usuario:m.atorReferencia,data:m.timestamp,timestamp:m.timestamp,
                propostaReferencia:ref('proposta',proposta?.id??anterior.id),assinaturaPlano:canon({comando:tipo,dados:d,metadados:m}),
                anteriorSnapshot:spec.novo?null:anterior,registroSnapshot:proposta});
            exigir(Number.isSafeInteger(s.ultimaEdicao)&&s.ultimaEdicao>=0&&s.ultimaEdicao<Number.MAX_SAFE_INTEGER,'REVISAO_INVALIDA');
            s.ultimaEdicao++;s.data=m.timestamp;
            const candidato=canon(s);
            exigir(validarPropostas(candidato,contexto,true),'CANDIDATO_PROPOSTAS_INVALIDO');
            return Object.freeze({ok:true,snapshotTexto:candidato,publicado:false});
        }
        const n=criarNucleoPropostas({config:s.config,propostas:s.propostas,timestamp:m.timestamp,ator:m.atorReferencia});
        const c=JSON.parse(canon(d.campos)), indices=new Set();
        const itens=d.itens.map(entrada=>{
            const i=JSON.parse(canon(entrada));let base={};
            if(Object.hasOwn(i,'indiceOrigem')) {const ix=i.indiceOrigem;
                exigir(anterior&&ix<anterior.itens.length&&!indices.has(ix),'INDICE_ITEM_INVALIDO');indices.add(ix);base=anterior.itens[ix];delete i.indiceOrigem;}
            if(Object.hasOwn(i,'tipoReferencia')) {const t=resolver(s.tipos,'tipo',i.tipoReferencia);i.tipoId=t.id;delete i.tipoReferencia;}
            const politica=base.politicaCustoProprioAplicada||n.calcularItemProposta({}).politicaCustoProprioAplicada;
            const modo=i.modoCustoProprio??politica.modo;
            exigir(['nao_calcular','percentual','manual'].includes(modo),'POLITICA_CUSTO_INVALIDA');
            const alterada=Object.hasOwn(i,'modoCustoProprio')&&modo!==politica.modo;
            const percentual=i.percentualCustoProprio??politica.percentual;
            delete i.modoCustoProprio;
            const item=mesclar(base,{...i,politicaCustoProprioAplicada:{...politica,modo,percentual,
                origem:alterada?'ajuste_manual':politica.origem,aplicadaEm:alterada?m.timestamp:politica.aplicadaEm}});
            exigir(item.descricao?.trim()&&item.quantidade>0&&!n.obterInconsistenciaQuantidadeOperacionalItem(item),'ITEM_INVALIDO');
            return mesclar(item,n.calcularItemProposta(item));
        });
        let cliente=anterior?.cliente,clienteSnapshot=anterior?.clienteSnapshot,clienteId=anterior?.clienteId??'';
        if(Object.hasOwn(c,'clienteReferencia')) {const a=resolver(s.locadores,'cliente',c.clienteReferencia);clienteId=a.id;
            cliente=n.montarClientePropostaNormalizado({...a,precisaNotaFiscal:c.clientePrecisaNotaFiscal??a.precisaNotaFiscal});clienteSnapshot=cliente;}
        if(Object.hasOwn(c,'clienteManual')) {clienteId='';cliente=n.montarClientePropostaNormalizado(c.clienteManual);clienteSnapshot=cliente;}
        delete c.clienteReferencia;delete c.clienteManual;
        exigir(cliente?.nome,'CLIENTE_OBRIGATORIO');
        if(Object.hasOwn(c,'clientePrecisaNotaFiscal')) {
            cliente=mesclar(cliente,{precisaNotaFiscal:c.clientePrecisaNotaFiscal});
            clienteSnapshot=mesclar(clienteSnapshot,{precisaNotaFiscal:c.clientePrecisaNotaFiscal});
        }
        const mudouCliente=Object.hasOwn(d.campos,'clienteReferencia')||Object.hasOwn(d.campos,'clienteManual');
        const precisaNF=c.clientePrecisaNotaFiscal??(mudouCliente?cliente.precisaNotaFiscal===true
            :anterior?.clientePrecisaNotaFiscal??cliente.precisaNotaFiscal===true);
        cliente=mesclar(cliente,{clientePrecisaNotaFiscal:precisaNF});
        const codigo=anterior?.codigo||n.gerarCodigoProposta();
        const bruto=mesclar(anterior||{}, {...c,id,codigo,codigoBase:anterior?.codigoBase||codigo,
            cliente,clienteSnapshot,clienteId,clientePrecisaNotaFiscal:precisaNF,
            itens,status:anterior?.status||'rascunho',
            dataCriacao:anterior?.dataCriacao||m.timestamp,dataUltimaAlteracao:m.timestamp,
            criadoPor:anterior?.criadoPor||m.atorReferencia,alteradoPor:m.atorReferencia,
            anexos:anterior?.anexos||[],historicoRevisoes:anterior?.historicoRevisoes||[]});
        // O formulario recalcula os detalhes, inclusive quando o valor passa a
        // zero. Totais antigos nao podem servir de fallback para campos editados.
        if(c.custos?.maoObraCobrada){
            bruto.custos.maoObraCobrada.total=0;
            for(const k of ['montagem','desmontagem'])if(c.custos.maoObraCobrada[k])bruto.custos.maoObraCobrada[k].total=0;
        }
        if(c.custos?.hospedagemCobrada){bruto.custos.hospedagemCobrada.total=0;bruto.custos.hospedagem=0;}
        for(const k of ['maoObraOperacional','hospedagemOperacional'])if(c.controleInterno?.[k]){
            bruto.controleInterno[k].total=0;
            if(Object.hasOwn(bruto.controleInterno,`${k}Total`))bruto.controleInterno[`${k}Total`]=0;
        }
        const proposta=n.construirPropostaComercialCalculada(bruto,anterior);
        verificarRegistro({...s,propostas:s.propostas.filter(p=>p.id!==id)},proposta);
        if(anterior)s.propostas[s.propostas.indexOf(anterior)]=proposta;else s.propostas.push(proposta);
        s.logsAuditoria.push({id:`audit-proposta-${m.operacaoId}`,tipo:'proposta',acao:criar?'criar':'editar',
            origem:'proposta_transacional',operacaoId:m.operacaoId,usuario:m.atorReferencia,data:m.timestamp,timestamp:m.timestamp,
            propostaReferencia:ref('proposta',id),assinaturaPlano:canon({comando:tipo,dados:d,metadados:m}),
            anteriorSnapshot:anterior,registroSnapshot:proposta});
        exigir(Number.isSafeInteger(s.ultimaEdicao)&&s.ultimaEdicao>=0&&s.ultimaEdicao<Number.MAX_SAFE_INTEGER,'REVISAO_INVALIDA');
        s.ultimaEdicao++;s.data=m.timestamp;
        exigir(validarPropostas(canon(s),contexto,true),'CANDIDATO_PROPOSTAS_INVALIDO');
        return Object.freeze({ok:true,snapshotTexto:canon(s),publicado:false});
    } catch(e){return Object.freeze({ok:false,codigo:'OPERACAO_REQUER_RECUPERACAO',motivo:e.message,requerRecuperacao:true,publicado:false});}
}
