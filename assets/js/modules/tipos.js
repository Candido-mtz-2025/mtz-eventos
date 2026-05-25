// Tipos: cadastro e edição
function normalizarNomeTipo(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function salvarTipo() {
    const nome = String(document.getElementById('tipoNome')?.value || '').trim();
    const desc = String(document.getElementById('tipoDesc')?.value || '').trim();

    if (!nome) {
        mostrarToast('Informe o nome do tipo.', 'erro');
        document.getElementById('tipoNome')?.focus();
        return;
    }

    const nomeNormalizado = normalizarNomeTipo(nome);
    const existente = tipos.some((t) => normalizarNomeTipo(t.nome) === nomeNormalizado);
    if (existente) {
        mostrarToast('Já existe um tipo com esse nome.', 'erro');
        document.getElementById('tipoNome')?.focus();
        return;
    }

    const novoId = Date.now();
    tipos.push({ id: novoId, nome, desc });
    salvarLocal();
    renderTudo();
    if (typeof focarRegistroRecemSalvo === 'function') {
        focarRegistroRecemSalvo({ tipo: 'tipo', id: novoId, limparBusca: true });
    }
    sincronizar('salvar');
    document.getElementById('tipoNome').value = "";
    document.getElementById('tipoDesc').value = "";
    mostrarToast("Tipo Salvo!");
}

function abrirEditarTipo(id) {
    const t = tipos.find((x) => String(x.id) === String(id));
    if (!t) return;
    document.getElementById('editTipoId').value = t.id;
    document.getElementById('editTipoNome').value = t.nome;
    document.getElementById('editTipoDesc').value = t.desc || '';
    document.getElementById('modalEditarTipo').classList.add('active');
}

function salvarEdicaoTipo() {
    const id = document.getElementById('editTipoId')?.value;
    const t = tipos.find((x) => String(x.id) === String(id));
    if (!t) return;

    const nome = String(document.getElementById('editTipoNome')?.value || '').trim();
    const desc = String(document.getElementById('editTipoDesc')?.value || '').trim();
    if (!nome) {
        mostrarToast('Informe o nome do tipo.', 'erro');
        document.getElementById('editTipoNome')?.focus();
        return;
    }

    const nomeNormalizado = normalizarNomeTipo(nome);
    const duplicado = tipos.some((tipo) => String(tipo.id) !== String(id) && normalizarNomeTipo(tipo.nome) === nomeNormalizado);
    if (duplicado) {
        mostrarToast('Já existe um tipo com esse nome.', 'erro');
        document.getElementById('editTipoNome')?.focus();
        return;
    }

    t.nome = nome;
    t.desc = desc;
    salvarLocal();
    renderTudo();
    if (typeof focarRegistroRecemSalvo === 'function') {
        focarRegistroRecemSalvo({ tipo: 'tipo', id: t.id, limparBusca: true });
    }
    sincronizar('salvar');
    document.getElementById('modalEditarTipo').classList.remove('active');
    mostrarToast("Tipo atualizado!");
}
