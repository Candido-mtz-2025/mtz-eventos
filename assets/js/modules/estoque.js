// Estoque: cadastro, edição, remoção e seleção em lote
    // === RECALCULAR DISPONIBILIDADE COM CACHE ===
function recalcularDisponibilidade(forcar = false) {
        const agora = Date.now();
        
        if (!forcar && cacheDisponibilidade && (agora - ultimaAtualizacaoCache) < 5000) {
            return;
        }
        
        const aluguelPorPeca = new Map();
        
        locacoes.forEach(l => {
            const locacaoNormalizada = typeof normalizarLocacaoDominio === 'function'
                ? normalizarLocacaoDominio(l, { hoje: new Date() })
                : l;
            const statusVisual = String(locacaoNormalizada?.statusVisual || locacaoNormalizada?.status || '').toLowerCase();
            if (statusVisual !== 'devolvido' && statusVisual !== 'cancelado') {
                (l.items || []).forEach(i => {
                    const quantidadeEstoque = typeof obterQuantidadePropriaOperacional === 'function'
                        ? obterQuantidadePropriaOperacional(i)
                        : Math.max(parseInt(i.quantidade, 10) || 0, 0);
                    const qtdDevolvida = Math.max(parseInt(i.devolvidos, 10) || 0, 0);
                    const qtdAvariada = Math.max(parseInt(i.avariadosEstoqueProprio, 10) || 0, 0);
                    const qtdAlugada = Math.max(quantidadeEstoque - qtdDevolvida - qtdAvariada, 0);
                    const atual = aluguelPorPeca.get(i.pecaId) || 0;
                    aluguelPorPeca.set(i.pecaId, atual + qtdAlugada);
                });
            }
        });
        
        pecas.forEach(p => {
            if (typeof normalizarPecaDominio === 'function') {
                Object.assign(p, normalizarPecaDominio(p));
            }
            const alugado = aluguelPorPeca.get(p.id) || 0;
            p.reservado = Math.max(alugado, 0);
            p.disponivel = Math.max((p.quantidadeTotal || p.quantidade || 0) - p.reservado, 0);
            if (typeof normalizarPecaDominio === 'function') {
                Object.assign(p, normalizarPecaDominio(p));
            }
        });
        
        cacheDisponibilidade = true;
        ultimaAtualizacaoCache = agora;
    }

function obterOuCriarTipoGeral() {
    const nomePadrao = 'geral';
    let tipo = tipos.find((t) => String(t?.nome || '').trim().toLowerCase() === nomePadrao);

    if (!tipo) {
        tipo = {
            id: Date.now(),
            nome: 'Geral',
            desc: 'Itens sem categoria específica'
        };
        tipos.push(tipo);
    }

    return Number(tipo.id);
}

function resolverTipoSelecionado(valorSelecionado) {
    const tipoId = Number(valorSelecionado);
    if (Number.isFinite(tipoId) && tipoId > 0) {
        return tipoId;
    }
    return obterOuCriarTipoGeral();
}

function normalizarTextoEstoque(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function normalizarIdentificadorEstoque(valor) {
    return String(valor || '')
        .trim()
        .toLowerCase();
}

function encontrarPecaDuplicada(dados, idIgnorar = null) {
    const nome = normalizarTextoEstoque(dados?.nome);
    const codigo = normalizarIdentificadorEstoque(dados?.codigo);
    const barras = normalizarIdentificadorEstoque(dados?.barras);
    const medida = normalizarTextoEstoque(dados?.medida);
    const tipoId = Number(dados?.tipoId || 0);

    return pecas.find((peca) => {
        if (idIgnorar != null && String(peca.id) === String(idIgnorar)) return false;

        const codigoPeca = normalizarIdentificadorEstoque(peca.codigo);
        const barrasPeca = normalizarIdentificadorEstoque(peca.barras || peca.codigoBarras);
        const nomePeca = normalizarTextoEstoque(peca.nome);
        const medidaPeca = normalizarTextoEstoque(peca.medida);
        const tipoPeca = Number(peca.tipoId || 0);

        if (codigo && codigoPeca && codigo === codigoPeca) return true;
        if (barras && barrasPeca && barras === barrasPeca) return true;

        const mesmoNome = nome && nomePeca && nome === nomePeca;
        const mesmaMedida = medida && medidaPeca && medida === medidaPeca;
        const mesmoTipo = tipoId > 0 && tipoPeca > 0 && tipoId === tipoPeca;

        return Boolean(mesmoNome && (mesmaMedida || mesmoTipo));
    }) || null;
}

function limparFormularioCadastroPeca() {
    const defaults = {
        pecaCod: '',
        pecaNome: '',
        pecaMedida: '',
        pecaBar: '',
        pecaValor: '',
        pecaQtd: '1',
        pecaFamiliaEstrutural: '',
        pecaSubtipoEstrutural: '',
        pecaPodeCompor: 'sim'
    };

    Object.entries(defaults).forEach(([id, valor]) => {
        const campo = document.getElementById(id);
        if (!campo) return;
        campo.value = valor;
    });

    const foto = document.getElementById('pecaFoto');
    if (foto) foto.value = '';
}
    
function salvarPeca() {
    if (typeof validarPermissao === 'function' && !validarPermissao('editar_valor', 'Somente administrador pode cadastrar ou alterar valores de estoque.')) {
        return;
    }

    const n = (document.getElementById('pecaNome').value || '').trim();
    const codigo = (document.getElementById('pecaCod').value || '').trim();
    const medida = (document.getElementById('pecaMedida').value || '').trim();
    const barras = (document.getElementById('pecaBar').value || '').trim();
    const valor = parseFloat(document.getElementById('pecaValor').value);
    const quantidade = parseInt(document.getElementById('pecaQtd').value, 10);
    const tipoId = resolverTipoSelecionado(document.getElementById('pecaTipo').value);

    if (!n) {
        mostrarToast("Informe o nome da peca.", "erro");
        document.getElementById('pecaNome')?.focus();
        return;
    }
    if (!Number.isFinite(valor) || valor < 0) {
        mostrarToast("Informe um valor valido (maior ou igual a zero).", "erro");
        document.getElementById('pecaValor')?.focus();
        return;
    }
    if (!Number.isInteger(quantidade) || quantidade < 0) {
        mostrarToast("Informe uma quantidade valida (maior ou igual a zero).", "erro");
        document.getElementById('pecaQtd')?.focus();
        return;
    }

    const duplicada = encontrarPecaDuplicada({
        nome: n,
        codigo,
        barras,
        medida,
        tipoId
    });
    if (duplicada) {
        if (codigo && normalizarIdentificadorEstoque(duplicada.codigo) === normalizarIdentificadorEstoque(codigo)) {
            mostrarToast("Ja existe item com esse codigo.", "erro");
            document.getElementById('pecaCod')?.focus();
            return;
        }

        if (barras && normalizarIdentificadorEstoque(duplicada.barras || duplicada.codigoBarras) === normalizarIdentificadorEstoque(barras)) {
            mostrarToast("Ja existe item com esse codigo de barras.", "erro");
            document.getElementById('pecaBar')?.focus();
            return;
        }

        mostrarToast(`Item possivelmente duplicado: ${duplicada.nome}.`, "erro");
        document.getElementById('pecaNome')?.focus();
        return;
    }

    const novoId = Date.now();
    const novaPecaBase = {
        id: novoId,
        nome: n,
        codigo,
        valor,
        quantidade,
        quantidadeTotal: quantidade,
        disponivel: quantidade,
        reservado: 0,
        manutencao: 0,
        avariado: 0,
        perdido: 0,
        localizacao: '',
        historicoMovimentacoes: [],
        codigoInterno: codigo,
        qrCode: barras,
        status: 'ativo',
        tipoId,
        medida,
        barras,

        grupoChecklist: document.getElementById('pecaGrupoChecklist').value || 'outros',
        familiaEstrutural: document.getElementById('pecaFamiliaEstrutural').value || '',
        subtipoEstrutural: document.getElementById('pecaSubtipoEstrutural').value || '',
        podeComporEstrutura: document.getElementById('pecaPodeCompor').value === 'sim'
    };

    const novaPeca = typeof normalizarPecaDominio === 'function'
        ? normalizarPecaDominio(novaPecaBase)
        : novaPecaBase;
    pecas.push(novaPeca);

    if (typeof registrarMovimentacaoEstoque === 'function') {
        const quantidadeMov = Math.max(0, Math.trunc(quantidade));
        registrarMovimentacaoEstoque({
            id: `mov-${novoId}-entrada-cadastro`,
            chaveIdempotencia: `entrada|origem:cadastro|peca:${String(novaPeca.id)}|codigo:${normalizarIdentificadorEstoque(novaPeca.codigo || codigo)}|q:${quantidadeMov}`,
            tipoMovimentacao: 'entrada',
            quantidade: quantidadeMov,
            pecaId: String(novaPeca.id),
            pecaNome: novaPeca.nome,
            origemEvento: 'cadastro_estoque',
            observacao: `Cadastro manual do item ${novaPeca.codigo || codigo || String(novaPeca.id)}.`
        });
    }

    limparFormularioCadastroPeca();
    salvarLocal();
    renderTudo();
    if (typeof focarRegistroRecemSalvo === 'function') {
        focarRegistroRecemSalvo({ tipo: 'peca', id: novoId, limparBusca: true });
    }
    sincronizar('salvar');
    mostrarToast("Item Salvo!");
}

  function abrirEditarPeca(id) {
    if (typeof validarPermissao === 'function' && !validarPermissao('editar_valor', 'Somente administrador pode editar itens de estoque.')) {
        return;
    }

    const p = pecas.find(x => String(x.id) === String(id));
    if (!p) {
        mostrarToast("Item não encontrado!", "erro");
        return;
    }

    document.getElementById('editPecaId').value = p.id;
    document.getElementById('editPecaCod').value = p.codigo || '';
    document.getElementById('editPecaNome').value = p.nome || '';
    document.getElementById('editPecaMedida').value = p.medida || '';
    document.getElementById('editPecaValor').value = p.valor || 0;
    document.getElementById('editPecaQtd').value = p.quantidade || 0;
    document.getElementById('editPecaBar').value = p.barras || p.codigoBarras || '';

    updateSelects();
    const sel = document.getElementById('editPecaTipo');
    if (sel) sel.value = p.tipoId || 0;

    document.getElementById('editPecaGrupoChecklist').value = p.grupoChecklist || 'outros';
    document.getElementById('editPecaFamiliaEstrutural').value = p.familiaEstrutural || '';
    document.getElementById('editPecaSubtipoEstrutural').value = p.subtipoEstrutural || '';
    document.getElementById('editPecaPodeCompor').value = p.podeComporEstrutura ? 'sim' : 'nao';

    document.getElementById('modalEditarPeca').classList.add('active');
}
function salvarEdicaoPeca() {
    if (typeof validarPermissao === 'function' && !validarPermissao('editar_valor', 'Somente administrador pode salvar alterações de valores/estoque.')) {
        return;
    }

    const id = document.getElementById('editPecaId').value;
    const p = pecas.find(x => String(x.id) === String(id));

    if (!p) {
        mostrarToast("Item não encontrado para salvar!", "erro");
        return;
    }

    const novoCodigo = (document.getElementById('editPecaCod').value || '').trim();
    const novoNome = (document.getElementById('editPecaNome').value || '').trim();
    const novaMedida = (document.getElementById('editPecaMedida').value || '').trim();
    const novoBarras = (document.getElementById('editPecaBar').value || '').trim();
    const novoTipoId = resolverTipoSelecionado(document.getElementById('editPecaTipo').value);
    const novaQtd = parseInt(document.getElementById('editPecaQtd').value) || 0;
    const pAtual = typeof normalizarPecaDominio === 'function' ? normalizarPecaDominio(p) : p;
    const qtdAnterior = parseInt(pAtual.quantidadeTotal ?? pAtual.quantidade, 10) || 0;
    const diff = novaQtd - qtdAnterior;

    if (!novoNome) {
        mostrarToast("Informe o nome da peca.", "erro");
        document.getElementById('editPecaNome')?.focus();
        return;
    }

    const duplicada = encontrarPecaDuplicada(
        {
            nome: novoNome,
            codigo: novoCodigo,
            barras: novoBarras,
            medida: novaMedida,
            tipoId: novoTipoId
        },
        id
    );
    if (duplicada) {
        if (novoCodigo && normalizarIdentificadorEstoque(duplicada.codigo) === normalizarIdentificadorEstoque(novoCodigo)) {
            mostrarToast("Ja existe item com esse codigo.", "erro");
            document.getElementById('editPecaCod')?.focus();
            return;
        }

        if (novoBarras && normalizarIdentificadorEstoque(duplicada.barras || duplicada.codigoBarras) === normalizarIdentificadorEstoque(novoBarras)) {
            mostrarToast("Ja existe item com esse codigo de barras.", "erro");
            document.getElementById('editPecaBar')?.focus();
            return;
        }

        mostrarToast(`Item possivelmente duplicado: ${duplicada.nome}.`, "erro");
        document.getElementById('editPecaNome')?.focus();
        return;
    }

    p.codigo = novoCodigo;
    p.nome = novoNome;
    p.medida = novaMedida;
    p.valor = parseFloat(document.getElementById('editPecaValor').value) || 0;
    p.tipoId = novoTipoId;
    p.quantidadeTotal = novaQtd;
    p.quantidade = novaQtd;
    p.disponivel = (p.disponivel || 0) + diff;
    p.barras = novoBarras;

    p.grupoChecklist = document.getElementById('editPecaGrupoChecklist').value || 'outros';
    p.familiaEstrutural = document.getElementById('editPecaFamiliaEstrutural').value || '';
    p.subtipoEstrutural = document.getElementById('editPecaSubtipoEstrutural').value || '';
    p.podeComporEstrutura = document.getElementById('editPecaPodeCompor').value === 'sim';

    if (typeof normalizarPecaDominio === 'function') {
        Object.assign(p, normalizarPecaDominio(p));
    }

    if (diff !== 0 && typeof registrarMovimentacaoEstoque === 'function') {
        const quantidadeMov = Math.abs(Math.trunc(diff));
        registrarMovimentacaoEstoque({
            id: `mov-${p.id}-ajuste-${qtdAnterior}-${novaQtd}`,
            chaveIdempotencia: `ajuste|origem:manual|peca:${String(p.id)}|codigo:${normalizarIdentificadorEstoque(p.codigo || novoCodigo)}|de:${qtdAnterior}|para:${novaQtd}`,
            tipoMovimentacao: 'ajuste',
            quantidade: quantidadeMov,
            pecaId: String(p.id),
            pecaNome: p.nome,
            origemEvento: 'ajuste_manual_estoque',
            observacao: `Ajuste manual de quantidade: ${qtdAnterior} -> ${novaQtd}.`
        });
    }

    document.getElementById('modalEditarPeca').classList.remove('active');
    document.getElementById('editPecaId').value = "";

    salvarLocal();
    sincronizar('salvar');
    if (typeof focarRegistroRecemSalvo === 'function') {
        focarRegistroRecemSalvo({ tipo: 'peca', id: p.id, limparBusca: true });
    } else {
        renderEstoque();
    }

    registrarLog('item', 'editar', `Item atualizado: ${p.nome}`);
    mostrarToast("Item atualizado!");
}


window.estoqueSelecionados = new Set();

function onSelectEstoque(id, checked){
  id = Number(id);
  if (checked) window.estoqueSelecionados.add(id);
  else window.estoqueSelecionados.delete(id);
}

function toggleSelecionarTodosEstoque(marcar) {
  const checks = document.querySelectorAll('.chk-estoque');
  checks.forEach(chk => {
    chk.checked = marcar;
    onSelectEstoque(chk.dataset.id, marcar);
  });
}

function excluirSelecionadosEstoque(){
  if (typeof validarPermissao === 'function' && !validarPermissao('excluir_registro', 'Somente administrador pode excluir itens de estoque.')) {
    return;
  }

  if (window.estoqueSelecionados.size === 0) return mostrarToast('Selecione pelo menos 1 item.', 'erro');
  confirmarAcao(`Excluir ${window.estoqueSelecionados.size} item(ns) do estoque?`, () => {
    const ids = new Set([...window.estoqueSelecionados].map(Number));
    const removidos = pecas.filter(p => ids.has(p.id));
    pecas = pecas.filter(p => !ids.has(p.id));

    removidos.forEach(p => registrarLog('item', 'deletar', `Item removido (lote): ${p.nome} ID ${p.id}`));

    window.estoqueSelecionados.clear();
    salvarLocal();
    renderEstoque();
    sincronizar('salvar');
    mostrarToast('Itens excluidos!');
  }, {
    titulo: "Excluir itens",
    textoConfirmar: "Excluir",
    classeConfirmar: "btn-danger"
  });
}
window.salvarPeca = salvarPeca;
window.abrirEditarPeca = abrirEditarPeca;
window.salvarEdicaoPeca = salvarEdicaoPeca;
window.onSelectEstoque = onSelectEstoque;
window.toggleSelecionarTodosEstoque = toggleSelecionarTodosEstoque;
window.excluirSelecionadosEstoque = excluirSelecionadosEstoque;
// ===== MODELOS DE CHECKLIST / ESTRUTURA =====

function salvarModeloChecklist(nome, familiaEstrutural, itens, origem = 'manual') {
    nome = (nome || '').trim();
    familiaEstrutural = (familiaEstrutural || '').trim();

    if (!nome) {
        mostrarToast("Informe o nome do modelo.", "erro");
        return null;
    }

    if (!Array.isArray(itens) || itens.length === 0) {
        mostrarToast("Adicione pelo menos 1 peça ao modelo.", "erro");
        return null;
    }

    const modelo = {
        id: Date.now(),
        nome,
        familiaEstrutural,
        origem,
        criadoEm: new Date().toISOString(),
        itens: itens.map(item => ({
            pecaId: item.pecaId,
            nome: item.nome || '',
            qtd: parseInt(item.qtd) || 0
        })).filter(item => item.pecaId && item.qtd > 0)
    };

    if (modelo.itens.length === 0) {
        mostrarToast("Nenhuma peça válida foi adicionada.", "erro");
        return null;
    }

    modelosChecklist.push(modelo);
    
    salvarLocal();
    sincronizar('salvar');
    registrarLog('checklist', 'criar-modelo', `Modelo criado: ${modelo.nome}`);
    mostrarToast("Modelo salvo com sucesso!");

    return modelo;
}

function buscarModeloChecklist(id) {
    return modelosChecklist.find(x => String(x.id) === String(id));
}

function listarModelosChecklist(familiaEstrutural = '') {
    if (!familiaEstrutural) return [...modelosChecklist];

    return modelosChecklist.filter(x =>
        (x.familiaEstrutural || '').toLowerCase() === familiaEstrutural.toLowerCase()
    );
}

function excluirModeloChecklist(id) {
    const antes = modelosChecklist.length;
    modelosChecklist = modelosChecklist.filter(x => String(x.id) !== String(id));

    if (modelosChecklist.length === antes) {
        mostrarToast("Modelo não encontrado.", "erro");
        return;
    }

    salvarLocal();
    sincronizar('salvar');
    registrarLog('checklist', 'excluir-modelo', `Modelo removido: ${id}`);
    mostrarToast("Modelo excluído!");
}
window.salvarModeloChecklist = salvarModeloChecklist;
window.buscarModeloChecklist = buscarModeloChecklist;
window.listarModelosChecklist = listarModelosChecklist;
window.excluirModeloChecklist = excluirModeloChecklist;

let itensModeloChecklistTemp = [];

function abrirModalModeloChecklist() {
    itensModeloChecklistTemp = [];

    const id = document.getElementById('modeloChecklistId');
    const nome = document.getElementById('modeloChecklistNome');
    const familia = document.getElementById('modeloChecklistFamilia');
    const qtd = document.getElementById('modeloChecklistQtd');

    if (id) id.value = '';
    if (nome) nome.value = '';
    if (familia) familia.value = '';
    if (qtd) qtd.value = 1;

    atualizarSelectModeloChecklist();
    renderItensModeloChecklistTemp();

    document.getElementById('modalModeloChecklist').classList.add('active');
}

function fecharModalModeloChecklist() {
    document.getElementById('modalModeloChecklist').classList.remove('active');
}

function atualizarSelectModeloChecklist() {
    const select = document.getElementById('modeloChecklistPeca');
    if (!select) return;

    const pecasEstruturais = pecas.filter(p => p.podeComporEstrutura);

    select.innerHTML = '<option value="">Selecione uma peça</option>';

    pecasEstruturais.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nome}${p.medida ? ' - ' + p.medida : ''}</option>`;
    });
}

function editarModeloChecklist(id) {
    const modelo = buscarModeloChecklist(id);

    if (!modelo) {
        mostrarToast("Modelo não encontrado.", "erro");
        return;
    }

    document.getElementById('modeloChecklistId').value = modelo.id;
    document.getElementById('modeloChecklistNome').value = modelo.nome || '';
    document.getElementById('modeloChecklistFamilia').value = modelo.familiaEstrutural || '';
    document.getElementById('modeloChecklistQtd').value = 1;

    itensModeloChecklistTemp = (modelo.itens || []).map(item => ({
        pecaId: item.pecaId,
        nome: item.nome,
        qtd: item.qtd
    }));

    atualizarSelectModeloChecklist();
    renderItensModeloChecklistTemp();

    document.getElementById('modalModeloChecklist').classList.add('active');
}

function adicionarItemModeloChecklist() {
    const select = document.getElementById('modeloChecklistPeca');
    const qtdInput = document.getElementById('modeloChecklistQtd');

    if (!select || !qtdInput) {
        mostrarToast("Campos do modelo não encontrados.", "erro");
        return;
    }

    const pecaId = select.value;
    const qtd = parseInt(qtdInput.value) || 0;

    if (!pecaId) {
        mostrarToast("Selecione uma peça.", "erro");
        return;
    }

    if (qtd <= 0) {
        mostrarToast("Informe uma quantidade válida.", "erro");
        return;
    }

    const peca = pecas.find(p => String(p.id) === String(pecaId));
    if (!peca) {
        mostrarToast("Peça não encontrada.", "erro");
        return;
    }

    const existente = itensModeloChecklistTemp.find(item => String(item.pecaId) === String(pecaId));

    if (existente) {
        existente.qtd += qtd;
    } else {
        itensModeloChecklistTemp.push({
            pecaId: peca.id,
            nome: peca.nome,
            qtd: qtd
        });
    }

    qtdInput.value = 1;
    select.value = '';

    renderItensModeloChecklistTemp();
    mostrarToast("Peça adicionada!");
}

function escaparHTMLEstoque(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function criarEstadoEstoquePainel(opcoes = {}) {
    if (typeof criarEstadoPainel === 'function') {
        return criarEstadoPainel(opcoes.mensagem, {
            tipo: opcoes.tipo || 'info',
            titulo: opcoes.titulo || 'Informação'
        });
    }
    return `<p class="muted-note">${escaparHTMLEstoque(opcoes.mensagem || 'Sem dados para mostrar.')}</p>`;
}

function renderItensModeloChecklistTemp() {
    const lista = document.getElementById('listaItensModeloChecklist');
    if (!lista) return;

    if (itensModeloChecklistTemp.length === 0) {
        lista.innerHTML = criarEstadoEstoquePainel({
            tipo: 'empty',
            titulo: 'Lista vazia',
            mensagem: 'Nenhuma peça adicionada ao modelo.'
        });
        return;
    }

    lista.innerHTML = itensModeloChecklistTemp.map((item, index) => `
        <div class="modelo-checklist-temp-item">
            <span>${escaparHTMLEstoque(item.nome)} - Qtd: ${parseInt(item.qtd, 10) || 0}</span>
            <button class="btn btn-danger btn-sm" data-action="removerItemModeloChecklistTemp" data-arg="${index}">Remover</button>
        </div>
    `).join('');
}

function removerItemModeloChecklistTemp(index) {
    itensModeloChecklistTemp.splice(index, 1);
    renderItensModeloChecklistTemp();
}
function salvarModeloChecklistForm() {
    const id = document.getElementById('modeloChecklistId').value;
    const nome = document.getElementById('modeloChecklistNome').value.trim();
    const familia = document.getElementById('modeloChecklistFamilia').value.trim();

    if (!nome) {
        mostrarToast("Informe o nome do modelo.", "erro");
        return;
    }

    if (itensModeloChecklistTemp.length === 0) {
        mostrarToast("Adicione pelo menos uma peça.", "erro");
        return;
    }

    if (id) {
        const modelo = buscarModeloChecklist(id);

        if (!modelo) {
            mostrarToast("Modelo não encontrado para editar.", "erro");
            return;
        }

        modelo.nome = nome;
        modelo.familiaEstrutural = familia;
        modelo.itens = itensModeloChecklistTemp.map(item => ({
            pecaId: item.pecaId,
            nome: item.nome,
            qtd: item.qtd
        }));

        salvarLocal();
        sincronizar('salvar');
        registrarLog('checklist', 'editar-modelo', `Modelo editado: ${modelo.nome}`);
        mostrarToast("Modelo atualizado com sucesso!");
    } else {
        const novo = salvarModeloChecklist(nome, familia, itensModeloChecklistTemp, 'manual');
        if (!novo) return;
    }

    fecharModalModeloChecklist();
    itensModeloChecklistTemp = [];
    renderItensModeloChecklistTemp();
    renderModelosChecklist();
}
function renderModelosChecklist() {
    const lista = document.getElementById('listaModelosChecklist');
    if (!lista) return;

    if (!modelosChecklist || modelosChecklist.length === 0) {
        lista.innerHTML = criarEstadoEstoquePainel({
            tipo: 'empty',
            titulo: 'Sem modelos salvos',
            mensagem: 'Crie um modelo para reaproveitar estruturas no checklist.'
        });
        return;
    }

    lista.innerHTML = modelosChecklist.map(modelo => `
        <div class="modelo-checklist-card">
            <div class="modelo-checklist-card-info">
                <strong>${escaparHTMLEstoque(modelo.nome)}</strong><br>
                <small>Família: ${escaparHTMLEstoque(modelo.familiaEstrutural || 'Não informada')}</small><br>
                <small>Peças: ${modelo.itens ? modelo.itens.length : 0}</small>
            </div>
            <div class="modelo-checklist-card-actions">
                <button class="btn btn-secondary" data-action="editarModeloChecklist" data-arg="${modelo.id}">Editar</button>
                <button class="btn btn-primary" data-action="gerarChecklistModelo" data-arg="${modelo.id}">Gerar Checklist</button>
                <button class="btn btn-danger" data-action="excluirModeloChecklistUI" data-arg="${modelo.id}">Excluir</button>
            </div>
        </div>
    `).join('');
}

function excluirModeloChecklistUI(id) {
    confirmarAcao('Deseja excluir este modelo?', () => {
        excluirModeloChecklist(id);
        renderModelosChecklist();
    }, {
        titulo: 'Excluir modelo',
        textoConfirmar: 'Excluir',
        classeConfirmar: 'btn-danger'
    });
}

function gerarChecklistModelo(id) {
    const modelo = buscarModeloChecklist(id);

    if (!modelo) {
        mostrarToast("Modelo não encontrado.", "erro");
        return;
    }

    const grupos = {};

    modelo.itens.forEach(itemModelo => {
        const peca = pecas.find(p => String(p.id) === String(itemModelo.pecaId));
        if (!peca) return;

        const grupo = peca.grupoChecklist || 'outros';

        if (!grupos[grupo]) grupos[grupo] = [];

        grupos[grupo].push({
            nome: peca.nome + (peca.medida ? ` - ${peca.medida}` : ''),
            qtd: itemModelo.qtd || 0
        });
    });

    const escapar = (valor) => {
        const div = document.createElement('div');
        div.textContent = valor ?? '';
        return div.innerHTML;
    };

    const tituloGrupo = (grupo) => {
        const mapa = {
            estrutura: 'Estrutura',
            cobertura: 'Cobertura',
            eletrica: 'Elétrica',
            moveis: 'Móveis',
            acabamento: 'Acabamento',
            outros: 'Outros'
        };
        return mapa[grupo] || 'Outros';
    };

    const ordemGrupos = ['estrutura', 'cobertura', 'eletrica', 'moveis', 'acabamento', 'outros'];
    const gruposOrdenados = ordemGrupos.filter(grupo => grupos[grupo] && grupos[grupo].length > 0);
    const totalLinhas = gruposOrdenados.reduce((acc, grupo) => acc + grupos[grupo].length, 0);

    const secoes = gruposOrdenados.map((grupo, index) => {
        const linhas = grupos[grupo].map((item, linhaIndex) => `
            <tr style="background:${linhaIndex % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding:9px 10px; border-bottom:1px solid #e5e7eb;">${escapar(item.nome)}</td>
                <td style="padding:9px 10px; border-bottom:1px solid #e5e7eb; text-align:center; font-weight:700;">${item.qtd}</td>
                <td style="padding:9px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">_______</td>
                <td style="padding:9px 10px; border-bottom:1px solid #e5e7eb;">&nbsp;</td>
            </tr>
        `).join('');

        return `
            <section style="margin-bottom:16px; border:1px solid #d7dde8; border-radius:12px; overflow:hidden; break-inside:avoid;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; background:#111827; color:#ffffff; padding:10px 12px;">
                    <div style="font-size:14px; font-weight:800;">${escapar(tituloGrupo(grupo))}</div>
                    <div style="font-size:11px; font-weight:800; background:#2563eb; border-radius:999px; padding:4px 8px;">Grupo ${String(index + 1).padStart(2, '0')}</div>
                </div>
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8fafc;">
                            <th style="padding:9px 10px; border-bottom:1px solid #d7dde8; text-align:left; color:#475569; font-size:11px;">Item</th>
                            <th style="padding:9px 10px; border-bottom:1px solid #d7dde8; text-align:center; color:#475569; width:90px; font-size:11px;">Qtd</th>
                            <th style="padding:9px 10px; border-bottom:1px solid #d7dde8; text-align:center; color:#475569; width:130px; font-size:11px;">Conferido</th>
                            <th style="padding:9px 10px; border-bottom:1px solid #d7dde8; text-align:left; color:#475569; font-size:11px;">Observação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhas}
                    </tbody>
                </table>
            </section>
        `;
    }).join('');

    const logoPdfSrc = (config && config.logo) ? config.logo : './logo.png';
    const layout = `
        <div style="font-family:Inter,Arial,sans-serif; background:#fff; color:#111827; padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:20px; border-bottom:3px solid #111827; padding-bottom:14px; margin-bottom:14px;">
                <div>
                    <div style="font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:#2563eb; font-weight:900;">MTZ Eventos</div>
                    <h2 style="margin:4px 0 0 0; font-size:24px;">Checklist de Separação</h2>
                    <div style="margin-top:4px; font-size:12px; color:#64748b; font-weight:700;">Conferência operacional por modelo</div>
                </div>
                <div style="text-align:right; font-size:11px;">
                    <img src="${logoPdfSrc}" alt="MTZ Eventos" style="height:54px; object-fit:contain; margin-bottom:4px;">
                    <div><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px;">
                <div style="border:1px solid #d7dde8; border-radius:8px; padding:8px 10px; background:#f8fafc;">
                    <div style="font-size:9px; text-transform:uppercase; color:#64748b; font-weight:800;">Modelo</div>
                    <div style="font-size:12px; font-weight:800; margin-top:3px;">${escapar(modelo.nome || '-')}</div>
                </div>
                <div style="border:1px solid #d7dde8; border-radius:8px; padding:8px 10px; background:#f8fafc;">
                    <div style="font-size:9px; text-transform:uppercase; color:#64748b; font-weight:800;">Família</div>
                    <div style="font-size:12px; font-weight:800; margin-top:3px;">${escapar(modelo.familiaEstrutural || 'Não informada')}</div>
                </div>
                <div style="border:1px solid #d7dde8; border-radius:8px; padding:8px 10px; background:#f8fafc;">
                    <div style="font-size:9px; text-transform:uppercase; color:#64748b; font-weight:800;">Grupos</div>
                    <div style="font-size:12px; font-weight:800; margin-top:3px;">${gruposOrdenados.length}</div>
                </div>
                <div style="border:1px solid #d7dde8; border-radius:8px; padding:8px 10px; background:#f8fafc;">
                    <div style="font-size:9px; text-transform:uppercase; color:#64748b; font-weight:800;">Itens</div>
                    <div style="font-size:12px; font-weight:800; margin-top:3px;">${totalLinhas}</div>
                </div>
            </div>

            ${secoes || '<p style="padding:12px; border:1px solid #d7dde8; border-radius:10px;">Nenhuma peça encontrada para este modelo.</p>'}

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:22px; margin-top:26px;">
                <div style="text-align:center;">
                    <div style="border-top:1.5px solid #111827; padding-top:8px; font-size:10px; font-weight:800; text-transform:uppercase;">Responsável pela Separação</div>
                </div>
                <div style="text-align:center;">
                    <div style="border-top:1.5px solid #111827; padding-top:8px; font-size:10px; font-weight:800; text-transform:uppercase;">Responsável pela Conferência</div>
                </div>
            </div>
        </div>
    `;

    const printArea = document.getElementById('printArea');
    if (!printArea) {
        mostrarToast("Área de impressão não encontrada.", "erro");
        return;
    }

    printArea.innerHTML = layout;
    document.getElementById('modalRelatorio').classList.add('active');
}

window.abrirModalModeloChecklist = abrirModalModeloChecklist;
window.fecharModalModeloChecklist = fecharModalModeloChecklist;
window.atualizarSelectModeloChecklist = atualizarSelectModeloChecklist;
window.adicionarItemModeloChecklist = adicionarItemModeloChecklist;
window.renderItensModeloChecklistTemp = renderItensModeloChecklistTemp;
window.removerItemModeloChecklistTemp = removerItemModeloChecklistTemp;
window.salvarModeloChecklistForm = salvarModeloChecklistForm;
window.renderModelosChecklist = renderModelosChecklist;
window.excluirModeloChecklistUI = excluirModeloChecklistUI;
window.gerarChecklistModelo = gerarChecklistModelo;
window.editarModeloChecklist = editarModeloChecklist;
window.checklistMontagem = checklistMontagem;
window.checklistEtapasMontagem = checklistEtapasMontagem;
