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
    const nome = limparTextoCliente(document.getElementById('locNome')?.value);
    const documento = limparTextoCliente(document.getElementById('locDoc')?.value);
    const endereco = limparTextoCliente(document.getElementById('locEnd')?.value);
    const email = limparTextoCliente(document.getElementById('locEmail')?.value);
    const telefone = limparTextoCliente(document.getElementById('locTel')?.value);

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
        nome,
        email,
        telefone,
        documento,
        endereco
    });

    salvarLocal();
    renderTudo();
    if (typeof focarRegistroRecemSalvo === 'function') {
        focarRegistroRecemSalvo({ tipo: 'locador', id: novoId, limparBusca: true });
    }
    sincronizar('salvar');

    document.getElementById('locNome').value = "";
    const docEl = document.getElementById('locDoc');
    const endEl = document.getElementById('locEnd');
    const emailEl = document.getElementById('locEmail');
    const telEl = document.getElementById('locTel');
    if (docEl) docEl.value = "";
    if (endEl) endEl.value = "";
    if (emailEl) emailEl.value = "";
    if (telEl) telEl.value = "";

    document.getElementById('locNome').focus();
    mostrarToast("Cliente Salvo!");
}

function abrirEditarLocador(id) {
    const c = locadores.find((x) => String(x.id) === String(id));
    if (!c) return;

    document.getElementById('editLocId').value = c.id;
    document.getElementById('editLocNome').value = c.nome;
    document.getElementById('editLocEmail').value = c.email || '';
    document.getElementById('editLocTel').value = c.telefone || '';
    document.getElementById('modalEditarLocador').classList.add('active');
}

function salvarEdicaoLocador() {
    const id = document.getElementById('editLocId').value;
    const c = locadores.find((x) => String(x.id) === String(id));
    if (!c) return;

    const nome = limparTextoCliente(document.getElementById('editLocNome')?.value);
    const email = limparTextoCliente(document.getElementById('editLocEmail')?.value);
    const telefone = limparTextoCliente(document.getElementById('editLocTel')?.value);
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
            documento: c.documento
        },
        id
    );
    if (duplicado) {
        mostrarToast(`Já existe cliente parecido: ${duplicado.nome}.`, 'erro');
        document.getElementById('editLocNome')?.focus();
        return;
    }

    c.nome = nome;
    c.email = email;
    c.telefone = telefone;

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
