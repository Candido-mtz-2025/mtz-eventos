// GERADO por AST, somente declaracoes compartilhadas. Nao carregado pelo index.
export const manifesto = Object.freeze({
  "textoSeguro": "629a5ac28b4f9d4ce53f44e6a0c79957a3f78c684a04e7d58b2f8a208722c653",
  "numero": "d55a08da7d28c2ada735cc8966310321bdc21c02569ead2d31b3bd501874258a",
  "hojeIso": "623046f898f8ea95e060c39254a4d46231f31055921c5c0df9e9250c89281124",
  "obterClientePorLocacao": "1bd4681fe6528240bc50dd46a56a2eb8a0a0d3af9a64c2f4076b9916eed7be5b",
  "obterNomeClienteLocacao": "afdc162fa9daa048e7b33698e3b32a003aad1f04801e1bb21aca87a8d06bfaa9",
  "obterEnderecoLocacao": "3b9869411ab275a6f33a4d47e9558a54d6eda0a70fa7cee89cea0aee908e7f5f",
  "obterCidadeLocacao": "c83b3eaddaf5832e64e60ec803ddd12d28ba038baa772626e51ef099152994ef",
  "obterDataSaidaLocacao": "91e374a39df5b4e2bff21a5b09843b80eaf822bd338320f891e55b2e7882e6ab",
  "obterValorKmPadrao": "a67219329fa0cddcaa8db24bb472fd302c806e73196f17fad45c20b958d6543a",
  "obterTrechosTransporte": "f14fc6b815f228e063bae42296d3334e52463ecba87c21d9dc9743eaa7635ddf",
  "normalizarTransporte": "35063768aa226c8463df3009033ec61685862ed8ee1b6aa587a7830f02c61d49",
  "montarTransporteDaLocacao": "be264ad60f9f6aba235fb021e7d7563b11459f11d6279829310358169e86fe73"
});
export function criarNucleoConfiavel(contexto = {}) {
const Date = contexto.Date;
const config = contexto.config;
const locadores = contexto.locadores;
const normalizarIdEntidadeExato = contexto.normalizarIdEntidadeExato;
const resolverClientePorIdExato = contexto.resolverClientePorIdExato;
function textoSeguro(valor, fallback = '') {
        const texto = valor == null ? '' : String(valor);
        return texto.trim() || fallback;
    }

function numero(valor, fallback = 0) {
        if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
        const normalizado = String(valor ?? '')
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^\d.-]/g, '');
        const convertido = Number(normalizado);
        return Number.isFinite(convertido) ? convertido : fallback;
    }

function hojeIso() {
        const data = new Date();
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

function obterClientePorLocacao(locacao) {
        if (!locacao) return null;
        const idCliente = locacao.locadorId ?? locacao.clienteId;
        const resultado = resolverClientePorIdExato(locadores, idCliente);
        return resultado.encontrado ? resultado.cliente : null;
    }

function obterNomeClienteLocacao(locacao) {
        const cliente = obterClientePorLocacao(locacao);
        return textoSeguro(
            cliente?.nome || cliente?.nomeCompleto || cliente?.empresa || locacao?.clienteNome,
            locacao ? `Cliente #${String(locacao.id || '').slice(-4)}` : ''
        );
    }

function obterEnderecoLocacao(locacao, cliente) {
        return textoSeguro(
            locacao?.logistica?.endereco ||
            locacao?.enderecoEvento ||
            locacao?.eventoEndereco ||
            locacao?.localEvento ||
            locacao?.local ||
            locacao?.endereco ||
            cliente?.endereco,
            ''
        );
    }

function obterCidadeLocacao(locacao, cliente) {
        return textoSeguro(
            locacao?.logistica?.cidade ||
            locacao?.cidadeEvento ||
            locacao?.eventoCidade ||
            locacao?.cidade ||
            cliente?.cidade,
            ''
        );
    }

function obterDataSaidaLocacao(locacao) {
        return textoSeguro(
            locacao?.datasMontagem?.inicio ||
            locacao?.dataMontagem ||
            locacao?.dataAluguel,
            hojeIso()
        );
    }

function obterValorKmPadrao() {
        return numero(config?.valorKmFretePadrao, 0);
    }

function obterTrechosTransporte(valor, fallback = 1) {
        const trechos = Math.trunc(numero(valor, fallback));
        return trechos > 0 ? trechos : 1;
    }

function normalizarTransporte(registro = {}) {
        const distanciaKm = numero(registro.distanciaKm, 0);
        const valorKm = numero(registro.valorKm, obterValorKmPadrao());
        const trechos = obterTrechosTransporte(registro.trechos, 1);
        const custoEstimado = numero(registro.custoEstimado, distanciaKm * valorKm * trechos);

        return {
            ...registro,
            id: registro.id ?? Date.now(),
            locacaoId: normalizarIdEntidadeExato(registro.locacaoId).valido
                ? normalizarIdEntidadeExato(registro.locacaoId).valor : '',
            clienteNome: textoSeguro(registro.clienteNome, 'Cliente nao informado'),
            endereco: textoSeguro(registro.endereco),
            cidade: textoSeguro(registro.cidade),
            tipoOperacao: textoSeguro(registro.tipoOperacao, 'entrega'),
            veiculo: textoSeguro(registro.veiculo),
            placa: textoSeguro(registro.placa),
            motorista: textoSeguro(registro.motorista),
            equipe: textoSeguro(registro.equipe),
            dataSaida: textoSeguro(registro.dataSaida),
            horaSaida: textoSeguro(registro.horaSaida),
            dataChegada: textoSeguro(registro.dataChegada),
            horaChegada: textoSeguro(registro.horaChegada),
            distanciaKm,
            valorKm,
            trechos,
            custoEstimado,
            status: textoSeguro(registro.status, 'pendente'),
            observacoes: textoSeguro(registro.observacoes),
            criadoEm: registro.criadoEm || new Date().toISOString(),
            atualizadoEm: registro.atualizadoEm || registro.criadoEm || new Date().toISOString()
        };
    }

function montarTransporteDaLocacao(locacao, opcoes = {}) {
        if (!locacao || !normalizarIdEntidadeExato(locacao.id).valido) return null;
        const tipoOperacao = textoSeguro(opcoes.tipoOperacao, 'entrega');
        if (!['entrega', 'retirada'].includes(tipoOperacao)) return null;
        const cliente = opcoes.cliente && typeof opcoes.cliente === 'object'
            ? opcoes.cliente
            : obterClientePorLocacao(locacao);
        const logistica = locacao.logistica || {};
        const distanciaKm = numero(opcoes.distanciaKm ?? logistica.distanciaKm, 0);
        const valorKm = numero(opcoes.valorKm ?? logistica.valorKm, obterValorKmPadrao());
        const trechos = obterTrechosTransporte(opcoes.trechos ?? logistica.trechos, 1);
        const custoEstimado = numero(opcoes.custoEstimado ?? logistica.custoFrete, distanciaKm * valorKm * trechos);

        return normalizarTransporte({
            id: opcoes.id ?? Date.now() + Math.floor(Math.random() * 900),
            locacaoId: locacao.id,
            clienteNome: textoSeguro(opcoes.clienteNome, obterNomeClienteLocacao(locacao)),
            endereco: textoSeguro(opcoes.endereco, obterEnderecoLocacao(locacao, cliente)),
            cidade: textoSeguro(opcoes.cidade, obterCidadeLocacao(locacao, cliente)),
            tipoOperacao,
            veiculo: textoSeguro(opcoes.veiculo, logistica.veiculo || ''),
            placa: textoSeguro(opcoes.placa, logistica.placa || ''),
            motorista: textoSeguro(opcoes.motorista, logistica.motorista || ''),
            equipe: textoSeguro(opcoes.equipe, locacao.equipe?.responsavel || ''),
            dataSaida: textoSeguro(opcoes.dataSaida, logistica.dataSaida || obterDataSaidaLocacao(locacao)),
            horaSaida: textoSeguro(opcoes.horaSaida, logistica.horarioSaida || ''),
            dataChegada: textoSeguro(opcoes.dataChegada, logistica.dataChegada || ''),
            horaChegada: textoSeguro(opcoes.horaChegada, logistica.horarioChegada || ''),
            distanciaKm,
            valorKm,
            trechos,
            custoEstimado,
            status: textoSeguro(opcoes.status, 'pendente'),
            observacoes: textoSeguro(opcoes.observacoes, logistica.observacoes || '')
        });
    }
return Object.freeze({montarTransporteDaLocacao});
}
