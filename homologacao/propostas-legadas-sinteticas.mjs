import { criarNucleoPropostas } from '../assets/js/core/proposal-kernel.generated.mjs';
import { criarNucleoCadastroCliente } from '../assets/js/core/customer-kernel.generated.mjs';

// Fixture fixa de ensaio. Nao le arquivos, storage, dados de usuario ou rede.
export function criarPropostasLegadasSinteticas(vazio) {
    const s=JSON.parse(JSON.stringify(vazio));
    const clientes=criarNucleoCadastroCliente();
    s.locadores=[1,'1'].map((id,i)=>({id,...clientes.montarDadosClienteCampos({
        nome:`Cliente sintetico ${i+1}`,documento:'',telefone:'00000000',email:'',
        usarMesmoEnderecoCliente:true}),campoFuturo:{origem:'fixture'}}));
    s.tipos=[{id:1,nome:'Tipo numerico sintetico',desc:''},{id:'1',nome:'Tipo textual sintetico',desc:''}];
    const ids=[1,'1','001','550e8400-e29b-41d4-a716-446655440000'];
    s.propostas=[];
    for(const [ix,id] of ids.entries()) {
        const timestamp=ix===3?'2026-11-06T12:00:00.000Z':'2024-06-10T12:00:00.000Z';
        const n=criarNucleoPropostas({config:s.config,propostas:s.propostas,timestamp,ator:'autor-sintetico-historico'});
        const cliente=n.montarClientePropostaNormalizado(s.locadores[ix%2]);
        const entrada={id,codigo:`PROP-${ix===3?'2026':'2024'}-000${ix+1}`,clienteId:cliente.id,
            cliente,clienteSnapshot:cliente,clientePrecisaNotaFiscal:false,
            evento:{nome:`Evento historico sintetico ${ix+1}`,dataEvento:'2026-12-10',cidadeEvento:'Cidade sintetica'},
            itens:[{descricao:'Estrutura sintetica',categoria:'outros',tipoId:ix%2===0?1:'1',
                tipoFiscal:'cessao_estrutura_temporaria_3_05',quantidade:3,periodoDias:1,custoUnitario:1000.01,
                origemCusto:'misto',quantidadePropria:2,quantidadeTerceirizada:1,custoTerceirizadoReal:450,
                aplicarHonorarios:false,aplicarEncargos:false,aplicarINSS:false,campoFuturo:{documento:'preservar'}}],
            financeiro:{desconto:100.03,acrescimo:120,percentualNF:ix===3?0:4,tipoCalculoNF:'descontar',percentualEntrada:50,validadePropostaData:'2026-12-01'},
            custos:{frete:300,maoObra:200},controleInterno:{custoInternoTotal:10.01},
            status:'rascunho',dataCriacao:timestamp,dataUltimaAlteracao:timestamp,
            criadoPor:'autor-sintetico-historico',alteradoPor:'autor-sintetico-historico',
            anexos:[{id:`anexo-${ix}`,propostaId:id,nome:'Documento externo sintetico',url:'https://example.invalid/documento.pdf',futuro:{sha:'sintetico'}}],
            historicoRevisoes:[{id:`revisao-historica-${ix}`,revisao:0,status:'rascunho',data:timestamp,futuro:{tipos:[1,'1']}}],
            documentos:{extensaoFutura:['001',1,'1']},campoFuturo:{origem:'legado-sintetico'}};
        const p=ix===3?n.construirPropostaGerencialCalculada(entrada,null,{incluirMaoObra:true,dataFiscal:'2026-11-06',
            tipoDescontoFiscal:'incondicional',coberturaFiscalConfirmada:false,justificativaFiscalSemTributos:'',
            tributos:[{nome:'ISS',codigo:'ISS',natureza:'tributo',baseCalculo:'manual',baseManual:1000,percentual:3,incidencia:'aplica'},
                {nome:'IRRF',codigo:'IRRF',natureza:'retencao',baseCalculo:'comercial',percentual:1.5,incidencia:'aplica'}]})
            :n.construirPropostaComercialCalculada(entrada);
        s.propostas.push(p);
    }
    s.ultimaEdicao=17;s.data='2026-11-06T12:00:00.000Z';
    s.logsAuditoria=[{id:'evidencia-legada-sintetica',tipo:'proposta',acao:'importacao_historica',data:'2024-06-10T12:00:00.000Z',evidencia:{naoReescrever:true}}];
    return s;
}
