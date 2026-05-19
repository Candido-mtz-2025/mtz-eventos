// Devoluções: conferência total ou parcial por item
function getQtdPendenteItem(item) {
    const quantidade = parseInt(item.quantidade) || 0;
    const devolvidos = parseInt(item.devolvidos) || 0;
    return Math.max(quantidade - devolvidos, 0);
}

function locacaoEstaTotalmenteDevolvida(locacao) {
    return (locacao.items || []).every(item => getQtdPendenteItem(item) === 0);
}

function escaparHTMLDevolucao(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function carregarItensDevolucao() {
    const id = document.getElementById('devLocacao').value;
    const div = document.getElementById('divItensDevolucao');
    if (!div) return;

    div.innerHTML = "";
    if (!id) {
        div.innerHTML = '<small style="color:var(--text-light)">Selecione uma locação para conferir.</small>';
        return;
    }

    const l = locacoes.find(x => x.id == id);
    if (!l) {
        div.innerHTML = '<small style="color:var(--text-light)">Locação não encontrada.</small>';
        return;
    }

    const cliente = locadores.find(x => x.id === l.locadorId);
    const itensPendentes = (l.items || []).filter(item => getQtdPendenteItem(item) > 0);
    const totalPendente = itensPendentes.reduce((total, item) => total + getQtdPendenteItem(item), 0);

    if (itensPendentes.length === 0) {
        div.innerHTML = '<small style="color:var(--text-light)">Todos os itens desta locação já foram devolvidos.</small>';
        return;
    }

    div.innerHTML = `
        <div class="devolucao-resumo">
            <span><b>Cliente:</b> ${escaparHTMLDevolucao(cliente?.nome || 'Removido')}</span>
            <span><b>Pendentes:</b> ${totalPendente} item(ns)</span>
        </div>
        <div class="devolucao-lista">
            ${itensPendentes.map((item, index) => {
                const pendente = getQtdPendenteItem(item);
                const valor = Number(item.valor || 0);

                return `
                    <div class="devolucao-item">
                        <div class="devolucao-item-info">
                            <strong>${escaparHTMLDevolucao(item.nome)}</strong>
                            <small>Locado: ${item.quantidade} | Já devolvido: ${item.devolvidos || 0} | Pendente: ${pendente}</small>
                        </div>
                        <div class="form-group">
                            <label>Qtd devolvida</label>
                            <input type="number" class="dev-qtd" data-peca-id="${item.pecaId}" data-index="${index}" min="0" max="${pendente}" value="${pendente}" oninput="validarQtdDevolucao(this)">
                        </div>
                        <div class="form-group">
                            <label>Avaria/perda</label>
                            <input type="number" class="dev-avaria" data-peca-id="${item.pecaId}" min="0" max="${pendente}" value="0" oninput="validarQtdDevolucao(this)">
                        </div>
                        <div class="form-group">
                            <label>Observação</label>
                            <input type="text" class="dev-obs" data-peca-id="${item.pecaId}" placeholder="Ex: peça riscada">
                        </div>
                        <input type="hidden" class="dev-valor" data-peca-id="${item.pecaId}" value="${valor}">
                    </div>
                `;
            }).join('')}
        </div>
        <small style="display:block; margin-top:10px; color:var(--text-light)">
            A quantidade em "Qtd devolvida" volta para o estoque. Use "Avaria/perda" apenas para registrar conferência.
        </small>
    `;
}

function validarQtdDevolucao(input) {
    const maximo = parseInt(input.max) || 0;
    let valor = parseInt(input.value);

    if (isNaN(valor) || valor < 0) valor = 0;
    if (valor > maximo) valor = maximo;

    input.value = valor;
}

function confirmarDevolucao() {
    const id = document.getElementById('devLocacao').value;
    if (!id) return alert("Selecione!");

    const l = locacoes.find(x => x.id == id);
    if (!l) return mostrarToast("Locação não encontrada.", "erro");

    const itensDevolvidos = [];

    (l.items || []).forEach(item => {
        const pendenteAntes = getQtdPendenteItem(item);
        if (pendenteAntes <= 0) return;

        const inputQtd = document.querySelector(`.dev-qtd[data-peca-id="${item.pecaId}"]`);
        const inputAvaria = document.querySelector(`.dev-avaria[data-peca-id="${item.pecaId}"]`);
        const inputObs = document.querySelector(`.dev-obs[data-peca-id="${item.pecaId}"]`);

        const qtdDevolvida = Math.min(parseInt(inputQtd?.value) || 0, pendenteAntes);
        const qtdAvaria = Math.min(parseInt(inputAvaria?.value) || 0, pendenteAntes);
        const obs = inputObs?.value || '';

        if (qtdDevolvida <= 0 && qtdAvaria <= 0 && !obs.trim()) return;

        item.devolvidos = (parseInt(item.devolvidos) || 0) + qtdDevolvida;

        itensDevolvidos.push({
            pecaId: item.pecaId,
            nome: item.nome,
            quantidadeLocada: parseInt(item.quantidade) || 0,
            quantidadeDevolvida: qtdDevolvida,
            quantidadeAvaria: qtdAvaria,
            quantidadePendenteAntes: pendenteAntes,
            quantidadePendenteApos: getQtdPendenteItem(item),
            valorUnitario: parseFloat(item.valor) || 0,
            observacao: obs
        });
    });

    if (itensDevolvidos.length === 0) {
        mostrarToast("Informe pelo menos uma quantidade ou observação.", "erro");
        return;
    }

    const devolucaoTotal = locacaoEstaTotalmenteDevolvida(l);
    l.status = devolucaoTotal ? 'devolvido' : 'ativo';

    devolucoes.push({
        id: Date.now(),
        locacaoId: l.id,
        dataDevolucao: document.getElementById('devData').value,
        tipo: devolucaoTotal ? 'total' : 'parcial',
        obs: devolucaoTotal ? 'Total' : 'Parcial',
        itens: itensDevolvidos
    });

    if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
    salvarLocal();
    renderTudo();
    sincronizar('salvar');

    const cliente = locadores.find(x => x.id === l.locadorId);
    registrarLog('devolucao', devolucaoTotal ? 'criar' : 'parcial', `Devolução ${devolucaoTotal ? 'total' : 'parcial'}: ${cliente?.nome || 'Cliente'} - ${itensDevolvidos.length} item(ns)`);

    mostrarToast(devolucaoTotal ? "Devolução total registrada!" : "Devolução parcial registrada!");
}
