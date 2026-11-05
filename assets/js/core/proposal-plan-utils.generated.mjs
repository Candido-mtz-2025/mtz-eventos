// GERADO por AST, somente declaracoes compartilhadas. Nao carregado pelo index.
export const manifesto = Object.freeze({
  "normalizarIdEntidadeExato": "8b7c83d3e4abdc4475957459c12a608e9bfb64a2446bb7bf5030e8a6d0e0f110",
  "idsEntidadeExatos": "f6c025104cb2545c07eeeee97c2f092e88250fa7d9634dc617052f724cedfbee",
  "resolverRegistroPorIdExato": "f1d23784544bb8c8f353a699ab38a51a5d40e8416c703628cddf7ba3caa02007",
  "criarReferenciaTipadaEntidade": "22a4590f19aec5df6413f096a3b5c001b112e107a8cc676b79de729147005fa9",
  "resolverRegistroPorReferenciaTipada": "3a00bcfa1fc112c03feb8ac72a2dc26d561619ba7bf1d870d09ef5117998d311",
  "resolverClientePorIdExato": "c2a81ca844cf62661231aafe1d6475dfec36c7a822e42c9348da1696e502a517",
  "criarReferenciaTipadaCliente": "6e5a5bb166d6f1b34081aaa5446f03124e888ecfd839565d9e07c312f655f12b",
  "resolverClientePorReferenciaTipada": "2952cac1771f103bc9917d1c93a1f45b45cad105b4095b2f266df1c03396c643"
});
export function criarNucleoConfiavel(contexto = {}) {

function normalizarIdEntidadeExato(id) {
    if (typeof id === 'string') {
        return id.trim() ? { valido: true, tipo: 'string', valor: id } : { valido: false };
    }
    if (typeof id === 'number' && Number.isFinite(id)) {
        // JSON representa -0 como 0; a identidade e a referencia de interface devem concordar.
        return { valido: true, tipo: 'number', valor: Object.is(id, -0) ? 0 : id };
    }
    return { valido: false };
}

function idsEntidadeExatos(idA, idB) {
    const a = normalizarIdEntidadeExato(idA);
    const b = normalizarIdEntidadeExato(idB);
    return a.valido && b.valido && a.tipo === b.tipo && Object.is(a.valor, b.valor);
}

function resolverRegistroPorIdExato(colecao, id) {
    const identidade = normalizarIdEntidadeExato(id);
    if (!identidade.valido) {
        return { encontrado: false, estado: 'invalido', codigo: 'ID_INVALIDO', registro: null, quantidade: 0 };
    }

    const correspondencias = (Array.isArray(colecao) ? colecao : []).filter((registro) => (
        registro && typeof registro === 'object' && !Array.isArray(registro)
        && Object.prototype.hasOwnProperty.call(registro, 'id')
        && idsEntidadeExatos(registro.id, identidade.valor)
    ));
    if (correspondencias.length === 1) {
        return {
            encontrado: true,
            estado: 'encontrado',
            codigo: 'REGISTRO_ENCONTRADO',
            registro: correspondencias[0],
            quantidade: 1
        };
    }
    return {
        encontrado: false,
        estado: correspondencias.length > 1 ? 'duplicado' : 'ausente',
        codigo: correspondencias.length > 1 ? 'ID_DUPLICADO' : 'REGISTRO_AUSENTE',
        registro: null,
        quantidade: correspondencias.length
    };
}

function criarReferenciaTipadaEntidade(prefixo, id) {
    if (typeof prefixo !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(prefixo)) return '';
    const identidade = normalizarIdEntidadeExato(id);
    if (!identidade.valido) return '';
    return `${prefixo}:${encodeURIComponent(JSON.stringify([identidade.tipo, identidade.valor]))}`;
}

function resolverRegistroPorReferenciaTipada(colecao, prefixo, referencia) {
    const invalido = {
        encontrado: false,
        estado: 'invalido',
        codigo: 'REFERENCIA_INVALIDA',
        registro: null,
        quantidade: 0
    };
    if (typeof prefixo !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(prefixo)
        || typeof referencia !== 'string' || !referencia.startsWith(`${prefixo}:`)) return invalido;
    let dados;
    try {
        dados = JSON.parse(decodeURIComponent(referencia.slice(prefixo.length + 1)));
    } catch (_erro) {
        return invalido;
    }
    if (!Array.isArray(dados) || dados.length !== 2) return invalido;
    const [tipo, id] = dados;
    const identidade = normalizarIdEntidadeExato(id);
    if (!identidade.valido || identidade.tipo !== tipo
        || criarReferenciaTipadaEntidade(prefixo, id) !== referencia) return invalido;
    return resolverRegistroPorIdExato(colecao, identidade.valor);
}

function resolverClientePorIdExato(clientes, id) {
    const resultado = resolverRegistroPorIdExato(clientes, id);
    return { ...resultado, cliente: resultado.registro };
}

function criarReferenciaTipadaCliente(id) {
    const identidade = normalizarIdEntidadeExato(id);
    if (!identidade.valido) return '';
    return `cliente:${encodeURIComponent(JSON.stringify([identidade.tipo, identidade.valor]))}`;
}

function resolverClientePorReferenciaTipada(clientes, referencia) {
    if (typeof referencia !== 'string' || !referencia.startsWith('cliente:')) {
        return { encontrado: false, estado: 'invalido', codigo: 'REFERENCIA_INVALIDA', registro: null, cliente: null, quantidade: 0 };
    }
    let dados;
    try {
        dados = JSON.parse(decodeURIComponent(referencia.slice('cliente:'.length)));
    } catch (_erro) {
        return { encontrado: false, estado: 'invalido', codigo: 'REFERENCIA_INVALIDA', registro: null, cliente: null, quantidade: 0 };
    }
    if (!Array.isArray(dados) || dados.length !== 2) {
        return { encontrado: false, estado: 'invalido', codigo: 'REFERENCIA_INVALIDA', registro: null, cliente: null, quantidade: 0 };
    }
    const [tipo, id] = dados;
    const identidade = normalizarIdEntidadeExato(id);
    if (!identidade.valido || identidade.tipo !== tipo || criarReferenciaTipadaCliente(id) !== referencia) {
        return { encontrado: false, estado: 'invalido', codigo: 'REFERENCIA_INVALIDA', registro: null, cliente: null, quantidade: 0 };
    }
    return resolverClientePorIdExato(clientes, identidade.valor);
}
return Object.freeze({normalizarIdEntidadeExato,criarReferenciaTipadaEntidade,resolverRegistroPorReferenciaTipada,resolverClientePorIdExato,resolverClientePorReferenciaTipada});
}
