// Clientes: cadastro e edição
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

function valorCampoCliente(id) {
    return limparTextoCliente(document.getElementById(id)?.value);
}

function checkboxClienteMarcado(id) {
    return document.getElementById(id)?.checked === true;
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

function obterDadosClienteFormulario(prefixo) {
    const nome = valorCampoCliente(`${prefixo}Nome`);
    const documento = valorCampoCliente(`${prefixo}Doc`);
    const telefone = valorCampoCliente(`${prefixo}Tel`);
    const email = valorCampoCliente(`${prefixo}Email`);
    const cep = valorCampoCliente(`${prefixo}Cep`);
    const ruaEndereco = valorCampoCliente(`${prefixo}End`);
    const numero = valorCampoCliente(`${prefixo}Numero`);
    const complemento = valorCampoCliente(`${prefixo}Complemento`);
    const bairro = valorCampoCliente(`${prefixo}Bairro`);
    const cidade = valorCampoCliente(`${prefixo}Cidade`);
    const uf = valorCampoCliente(`${prefixo}Uf`).toUpperCase().slice(0, 2);
    const responsavelPedido = valorCampoCliente(`${prefixo}Responsavel`);
    const enderecoCompleto = montarEnderecoCompletoCliente({
        rua: ruaEndereco,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        cep
    });
    const usarMesmoEnderecoCliente = checkboxClienteMarcado(`${prefixo}FiscalUsarEndereco`);
    const enderecoFiscalDigitado = valorCampoCliente(`${prefixo}FiscalEndereco`);

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
            razaoSocial: valorCampoCliente(`${prefixo}FiscalRazaoSocial`),
            cpfCnpj: valorCampoCliente(`${prefixo}FiscalCpfCnpj`) || documento,
            inscricaoEstadual: valorCampoCliente(`${prefixo}FiscalIE`),
            inscricaoMunicipal: valorCampoCliente(`${prefixo}FiscalIM`),
            emailFiscal: valorCampoCliente(`${prefixo}FiscalEmail`) || email,
            enderecoFiscal: usarMesmoEnderecoCliente ? (enderecoCompleto || ruaEndereco) : enderecoFiscalDigitado,
            usarMesmoEnderecoCliente
        }
    };
}

function preencherFormularioCliente(prefixo, cliente = {}) {
    const fiscal = cliente.dadosFiscais && typeof cliente.dadosFiscais === 'object' ? cliente.dadosFiscais : {};
    const mapa = {
        [`${prefixo}Nome`]: cliente.nome || '',
        [`${prefixo}Doc`]: cliente.documento || '',
        [`${prefixo}Tel`]: cliente.telefone || cliente.whatsapp || '',
        [`${prefixo}Email`]: cliente.email || '',
        [`${prefixo}Cep`]: cliente.cep || '',
        [`${prefixo}End`]: cliente.ruaEndereco || cliente.rua || cliente.endereco || '',
        [`${prefixo}Numero`]: cliente.numero || '',
        [`${prefixo}Complemento`]: cliente.complemento || '',
        [`${prefixo}Bairro`]: cliente.bairro || '',
        [`${prefixo}Cidade`]: cliente.cidade || '',
        [`${prefixo}Uf`]: cliente.uf || '',
        [`${prefixo}Responsavel`]: cliente.responsavelPedido || '',
        [`${prefixo}FiscalRazaoSocial`]: fiscal.razaoSocial || '',
        [`${prefixo}FiscalCpfCnpj`]: fiscal.cpfCnpj || cliente.documento || '',
        [`${prefixo}FiscalIE`]: fiscal.inscricaoEstadual || '',
        [`${prefixo}FiscalIM`]: fiscal.inscricaoMunicipal || '',
        [`${prefixo}FiscalEmail`]: fiscal.emailFiscal || cliente.email || '',
        [`${prefixo}FiscalEndereco`]: fiscal.enderecoFiscal || ''
    };

    Object.entries(mapa).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.value = valor;
    });

    const usarEnderecoEl = document.getElementById(`${prefixo}FiscalUsarEndereco`);
    if (usarEnderecoEl) usarEnderecoEl.checked = fiscal.usarMesmoEnderecoCliente !== false;
}

function limparFormularioCliente(prefixo) {
    [
        'Nome', 'Doc', 'Tel', 'Email', 'Cep', 'End', 'Numero', 'Complemento', 'Bairro', 'Cidade', 'Uf',
        'Responsavel', 'FiscalRazaoSocial', 'FiscalCpfCnpj', 'FiscalIE', 'FiscalIM', 'FiscalEmail', 'FiscalEndereco'
    ].forEach((campo) => {
        const el = document.getElementById(`${prefixo}${campo}`);
        if (el) el.value = '';
    });

    const usarEnderecoEl = document.getElementById(`${prefixo}FiscalUsarEndereco`);
    if (usarEnderecoEl) usarEnderecoEl.checked = true;
}

function encontrarLocadorDuplicado(dados, idIgnorar = null) {
    const nome = normalizarTextoCliente(dados?.nome);
    const email = normalizarEmailCliente(dados?.email);
    const telefone = normalizarTelefoneCliente(dados?.telefone);
    const documento = normalizarDocumentoCliente(dados?.documento);

    return locadores.find((locador) => {
        if (idIgnorar != null && String(locador.id) === String(idIgnorar)) return false;

        const mesmoNome = normalizarTextoCliente(locador.nome) === nome;
        const mesmoDocumento = documento && normalizarDocumentoCliente(locador.documento) === documento;
        const mesmoEmail = email && normalizarEmailCliente(locador.email) === email;
        const mesmoTelefone = telefone && normalizarTelefoneCliente(locador.telefone) === telefone;

        return Boolean(mesmoDocumento || (mesmoNome && (mesmoEmail || mesmoTelefone)));
    }) || null;
}

function salvarLocador() {
    const dados = obterDadosClienteFormulario('loc');
    const { nome, documento, email, telefone } = dados;

    if (!nome) {
        mostrarToast('Informe o nome do cliente.', 'erro');
        document.getElementById('locNome')?.focus();
        return;
    }

    if (!emailClienteValido(email)) {
        mostrarToast('Informe um e-mail válido para o cliente.', 'erro');
        document.getElementById('locEmail')?.focus();
        return;
    }

    const duplicado = encontrarLocadorDuplicado({ nome, email, telefone, documento });
    if (duplicado) {
        mostrarToast(`Cliente possivelmente duplicado: ${duplicado.nome}.`, 'erro');
        document.getElementById('locNome')?.focus();
        return;
    }

    const novoId = Date.now();
    locadores.push({
        id: novoId,
        ...dados
    });

    salvarLocal();
    renderTudo();
    if (typeof focarRegistroRecemSalvo === 'function') {
        focarRegistroRecemSalvo({ tipo: 'locador', id: novoId, limparBusca: true });
    }
    sincronizar('salvar');

    limparFormularioCliente('loc');

    document.getElementById('locNome').focus();
    mostrarToast("Cliente Salvo!");
}

function abrirEditarLocador(id) {
    const c = locadores.find((x) => String(x.id) === String(id));
    if (!c) return;

    document.getElementById('editLocId').value = c.id;
    preencherFormularioCliente('editLoc', c);
    document.getElementById('modalEditarLocador').classList.add('active');
}

function salvarEdicaoLocador() {
    const id = document.getElementById('editLocId').value;
    const c = locadores.find((x) => String(x.id) === String(id));
    if (!c) return;

    const dados = obterDadosClienteFormulario('editLoc');
    const { nome, email, telefone, documento } = dados;
    if (!nome) {
        mostrarToast('Informe o nome do cliente.', 'erro');
        document.getElementById('editLocNome')?.focus();
        return;
    }

    if (!emailClienteValido(email)) {
        mostrarToast('Informe um e-mail válido para o cliente.', 'erro');
        document.getElementById('editLocEmail')?.focus();
        return;
    }

    const duplicado = encontrarLocadorDuplicado(
        {
            nome,
            email,
            telefone,
            documento
        },
        id
    );
    if (duplicado) {
        mostrarToast(`Já existe cliente parecido: ${duplicado.nome}.`, 'erro');
        document.getElementById('editLocNome')?.focus();
        return;
    }

    Object.assign(c, dados);

    salvarLocal();
    renderTudo();
    if (typeof focarRegistroRecemSalvo === 'function') {
        focarRegistroRecemSalvo({ tipo: 'locador', id: c.id, limparBusca: true });
    }
    sincronizar('salvar');

    document.getElementById('modalEditarLocador').classList.remove('active');
    registrarLog('cliente', 'editar', `Cliente editado: ${c.nome}`);
    mostrarToast("Cliente atualizado!");
}
