// GERADO das declaracoes compartilhadas; nao carregar no index.
export const manifesto=Object.freeze({
  "limparTextoCliente": {
    "arquivo": "assets/js/modules/clientes.js",
    "sha256": "ce38208d5e07ad52ef1a8b7bd339a14b6b1f310d4d27af9b256956d4c654049a"
  },
  "normalizarTextoCliente": {
    "arquivo": "assets/js/modules/clientes.js",
    "sha256": "d8ba9bf7895a500d7aec3faba9eda545535afddc5c0c3507bf0f531f59e56278"
  },
  "normalizarDocumentoCliente": {
    "arquivo": "assets/js/modules/clientes.js",
    "sha256": "0815a34f1638664785809a55265ab4df78d26ccfc15be1342d3c789098b2531c"
  },
  "normalizarTelefoneCliente": {
    "arquivo": "assets/js/modules/clientes.js",
    "sha256": "d66720c06027363eb5d43de0f05d7d6f05ee51ec1515d78ce5c9c80d77bb5d1b"
  },
  "normalizarEmailCliente": {
    "arquivo": "assets/js/modules/clientes.js",
    "sha256": "bd8108cec7ee6c509a0df865922bc1cf7653b7349146e2321be5d097206cc9b9"
  },
  "emailClienteValido": {
    "arquivo": "assets/js/modules/clientes.js",
    "sha256": "cb7c621753938e4561e9f2e2a1939b28e4d0b068f81a41297a4b194bec9e08a2"
  },
  "montarEnderecoCompletoCliente": {
    "arquivo": "assets/js/modules/clientes.js",
    "sha256": "a5df6870ec4cde1d09a5d2fd1c925e65215aaedab08370adc0d8986bcd2d6249"
  },
  "montarDadosClienteCampos": {
    "arquivo": "assets/js/modules/clientes.js",
    "sha256": "be688a2000da24fdfbf8ac274218458af9cdfd0cb5d5d0e0a66332dd57895dd3"
  },
  "normalizarIdEntidadeExato": {
    "arquivo": "assets/js/core/utils.js",
    "sha256": "8b7c83d3e4abdc4475957459c12a608e9bfb64a2446bb7bf5030e8a6d0e0f110"
  },
  "idsEntidadeExatos": {
    "arquivo": "assets/js/core/utils.js",
    "sha256": "f6c025104cb2545c07eeeee97c2f092e88250fa7d9634dc617052f724cedfbee"
  },
  "encontrarLocadorDuplicado": {
    "arquivo": "assets/js/modules/clientes.js",
    "sha256": "afcdd1baa70361d269ddaefb7d1e2621323d7daba223d86b66c25c442c4a0666"
  }
});
export function criarNucleoCadastroCliente(){
function limparTextoCliente(valor) {
    return String(valor || '').trim();
}

function normalizarTextoCliente(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function normalizarDocumentoCliente(valor) {
    return String(valor || '').replace(/\D+/g, '');
}

function normalizarTelefoneCliente(valor) {
    return String(valor || '').replace(/\D+/g, '');
}

function normalizarEmailCliente(valor) {
    return String(valor || '').trim().toLowerCase();
}

function emailClienteValido(valor) {
    const email = normalizarEmailCliente(valor);
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function montarEnderecoCompletoCliente(dados = {}) {
    const rua = limparTextoCliente(dados.rua || dados.endereco || dados.ruaEndereco);
    const numero = limparTextoCliente(dados.numero);
    const complemento = limparTextoCliente(dados.complemento);
    const bairro = limparTextoCliente(dados.bairro);
    const cidade = limparTextoCliente(dados.cidade);
    const uf = limparTextoCliente(dados.uf).toUpperCase().slice(0, 2);
    const cep = limparTextoCliente(dados.cep);

    const linhaEndereco = [rua, numero].filter(Boolean).join(', ');
    const linhaCidade = [bairro, cidade, uf].filter(Boolean).join(' - ');
    return [linhaEndereco, complemento, linhaCidade, cep ? `CEP ${cep}` : '']
        .filter(Boolean)
        .join(' | ');
}

function montarDadosClienteCampos(campos) {
    const nome = limparTextoCliente(campos.nome);
    const documento = limparTextoCliente(campos.documento);
    const telefone = limparTextoCliente(campos.telefone);
    const email = limparTextoCliente(campos.email);
    const cep = limparTextoCliente(campos.cep);
    const ruaEndereco = limparTextoCliente(campos.ruaEndereco);
    const numero = limparTextoCliente(campos.numero);
    const complemento = limparTextoCliente(campos.complemento);
    const bairro = limparTextoCliente(campos.bairro);
    const cidade = limparTextoCliente(campos.cidade);
    const uf = limparTextoCliente(campos.uf).toUpperCase().slice(0, 2);
    const responsavelPedido = limparTextoCliente(campos.responsavelPedido);
    const enderecoCompleto = montarEnderecoCompletoCliente({
        rua: ruaEndereco,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        cep
    });
    const usarMesmoEnderecoCliente = campos.usarMesmoEnderecoCliente === true;
    const enderecoFiscalDigitado = limparTextoCliente(campos.fiscalEndereco);

    return {
        nome,
        documento,
        telefone,
        whatsapp: telefone,
        email,
        endereco: enderecoCompleto || ruaEndereco,
        cep,
        ruaEndereco,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        responsavelPedido,
        dadosFiscais: {
            razaoSocial: limparTextoCliente(campos.fiscalRazaoSocial),
            cpfCnpj: limparTextoCliente(campos.fiscalCpfCnpj) || documento,
            inscricaoEstadual: limparTextoCliente(campos.fiscalIE),
            inscricaoMunicipal: limparTextoCliente(campos.fiscalIM),
            emailFiscal: limparTextoCliente(campos.fiscalEmail) || email,
            enderecoFiscal: usarMesmoEnderecoCliente ? (enderecoCompleto || ruaEndereco) : enderecoFiscalDigitado,
            usarMesmoEnderecoCliente
        }
    };
}

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

function encontrarLocadorDuplicado(dados, idIgnorar = null, lista = locadores) {
    const nome = normalizarTextoCliente(dados?.nome);
    const email = normalizarEmailCliente(dados?.email);
    const telefone = normalizarTelefoneCliente(dados?.telefone);
    const documento = normalizarDocumentoCliente(dados?.documento);

    return lista.find((locador) => {
        if (idIgnorar != null && idsEntidadeExatos(locador.id, idIgnorar)) return false;

        const mesmoNome = normalizarTextoCliente(locador.nome) === nome;
        const mesmoDocumento = documento && normalizarDocumentoCliente(locador.documento) === documento;
        const mesmoEmail = email && normalizarEmailCliente(locador.email) === email;
        const mesmoTelefone = telefone && normalizarTelefoneCliente(locador.telefone) === telefone;

        return Boolean(mesmoDocumento || (mesmoNome && (mesmoEmail || mesmoTelefone)));
    }) || null;
}
return Object.freeze({montarDadosClienteCampos,emailClienteValido,encontrarLocadorDuplicado});
}
