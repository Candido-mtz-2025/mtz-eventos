// Clientes: cadastro e edição
function limparTextoCliente(valor) {
    return String(valor || '').trim();
}

function salvarLocador() {
    const nome = limparTextoCliente(document.getElementById('locNome')?.value);
    if (!nome) {
        mostrarToast('Informe o nome do cliente.', 'erro');
        document.getElementById('locNome')?.focus();
        return;
    }

    locadores.push({
        id: Date.now(),
        nome,
        email: limparTextoCliente(document.getElementById('locEmail')?.value),
        telefone: limparTextoCliente(document.getElementById('locTel')?.value),
        documento: limparTextoCliente(document.getElementById('locDoc')?.value),
        endereco: limparTextoCliente(document.getElementById('locEnd')?.value)
    });

    salvarLocal();
    renderTudo();
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
    if (!nome) {
        mostrarToast('Informe o nome do cliente.', 'erro');
        document.getElementById('editLocNome')?.focus();
        return;
    }

    c.nome = nome;
    c.email = limparTextoCliente(document.getElementById('editLocEmail')?.value);
    c.telefone = limparTextoCliente(document.getElementById('editLocTel')?.value);

    salvarLocal();
    renderTudo();
    sincronizar('salvar');

    document.getElementById('modalEditarLocador').classList.remove('active');
    registrarLog('cliente', 'editar', `Cliente editado: ${c.nome}`);
    mostrarToast("Cliente atualizado!");
}
