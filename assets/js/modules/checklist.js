function popularChecklistModeloSelect() {
    const select = document.getElementById('checklistModeloSelect');
    if (!select) return;

    const modelos = typeof listarModelosChecklist === 'function'
        ? listarModelosChecklist()
        : modelosChecklist;

    select.innerHTML = '<option value="">Selecione um modelo</option>';

    modelos.forEach(modelo => {
        const option = document.createElement('option');
        option.value = modelo.id;
        option.textContent = `${modelo.nome}${modelo.familiaEstrutural ? ' - ' + modelo.familiaEstrutural : ''}`;
        select.appendChild(option);
    });
}

function adicionarModeloAoChecklist() {
    const select = document.getElementById('checklistModeloSelect');
    if (!select || !select.value) {
        alert('Selecione um modelo.');
        return;
    }

    const modeloId = select.value;

    const modelo = typeof buscarModeloChecklist === 'function'
        ? buscarModeloChecklist(modeloId)
        : modelosChecklist.find(m => String(m.id) === String(modeloId));

    if (!modelo) {
        alert('Modelo não encontrado.');
        return;
    }

    if (!modelo.itens || !modelo.itens.length) {
        alert('Esse modelo não possui itens.');
        return;
    }

    modelo.itens.forEach(itemModelo => {
        const pecaId = itemModelo.pecaId || itemModelo.idPeca || itemModelo.peca || itemModelo.id;

        const peca = pecas.find(p => String(p.id) === String(pecaId));
        if (!peca) {
            console.warn('Peça não encontrada para o item do modelo:', itemModelo);
            return;
        }

        const existente = checklistMontagem.find(item => String(item.pecaId) === String(pecaId));

        if (existente) {
            existente.quantidade += Number(itemModelo.quantidade || itemModelo.qtd || 0);
        } else {
            checklistMontagem.push({
                modeloId: modelo.id,
                modeloNome: modelo.nome,
                pecaId: peca.id,
                nome: peca.nome || 'Peça sem nome',
                grupoChecklist: peca.grupoChecklist || 'outros',
                familiaEstrutural: peca.familiaEstrutural || '',
                subtipoEstrutural: peca.subtipoEstrutural || '',
                quantidade: Number(itemModelo.quantidade || itemModelo.qtd || 0)
            });
        }
    });

    window.checklistMontagem = checklistMontagem;

    montarEtapasMontagemAPartirDaSeparacao();

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistMontagem();
    renderChecklistEtapasMontagem();
}

function removerItemChecklistMontagem(index) {
    if (index < 0 || index >= checklistMontagem.length) return;

    checklistMontagem.splice(index, 1);
    window.checklistMontagem = checklistMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistMontagem();
}

function limparChecklistMontagem() {
    const confirmar = confirm('Deseja limpar o checklist em montagem?');
    if (!confirmar) return;

    checklistMontagem = [];
    checklistEtapasMontagem = [];

    window.checklistMontagem = checklistMontagem;
    window.checklistEtapasMontagem = checklistEtapasMontagem;

    const campoCliente = document.getElementById('checklistCliente');
    const campoEvento = document.getElementById('checklistEvento');
    const campoData = document.getElementById('checklistData');

    if (campoCliente) campoCliente.value = '';
    if (campoEvento) campoEvento.value = '';
    if (campoData) campoData.value = new Date().toISOString().split('T')[0];

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistMontagem();
    renderChecklistEtapasMontagem();
}

function formatarNomeGrupoChecklist(grupo) {
    const mapa = {
        estrutura: 'Estrutura',
        cobertura: 'Cobertura',
        elétrica: 'Elétrica',
        eletrica: 'Elétrica',
        moveis: 'Móveis',
        móveis: 'Móveis',
        acabamento: 'Acabamento',
        outros: 'Outros'
    };

    return mapa[grupo] || grupo;
}

function renderChecklistMontagem() {
    const container = document.getElementById('listaChecklistMontagem');
    if (!container) return;

    if (!checklistMontagem || !checklistMontagem.length) {
        container.innerHTML = `
            <p>Nenhum item adicionado.</p>
        `;
        return;
    }

    const grupos = {};

    checklistMontagem.forEach((item, index) => {
        let grupo = item.grupoChecklist || 'outros';

        if (grupo === 'móveis') grupo = 'moveis';
        if (grupo === 'elétrica') grupo = 'eletrica';

        if (!grupos[grupo]) grupos[grupo] = [];
        grupos[grupo].push({ ...item, index });
    });

    const gruposOrdem = ['estrutura', 'cobertura', 'eletrica', 'moveis', 'acabamento', 'outros'];

    let html = '';

    gruposOrdem.forEach(grupo => {
        if (!grupos[grupo] || !grupos[grupo].length) return;

        html += `
            <div class="card" style="margin-bottom:15px;">
                <h4>${formatarNomeGrupoChecklist(grupo)}</h4>
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Peça</th>
                                <th>Família</th>
                                <th>Subtipo</th>
                                <th>Quantidade</th>
                                <th>Ação</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        grupos[grupo].forEach(item => {
            html += `
                <tr>
                    <td>${item.nome || ''}</td>
                    <td>${item.familiaEstrutural || '-'}</td>
                    <td>${item.subtipoEstrutural || '-'}</td>
                    <td>${item.quantidade || 0}</td>
                    <td>
                        <button class="btn btn-danger btn-sm" onclick="removerItemChecklistMontagem(${item.index})">
                            Remover
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function gerarPDFChecklistMontagem() {
    if ((!checklistMontagem || !checklistMontagem.length) && (!checklistEtapasMontagem || !checklistEtapasMontagem.length)) {
        alert('Nenhum item no checklist para gerar PDF.');
        return;
    }

    const printArea = document.getElementById('printArea');
    const modalRelatorio = document.getElementById('modalRelatorio');

    if (!printArea) {
        alert('printArea não encontrada.');
        return;
    }

    const cliente = document.getElementById('checklistCliente')?.value || '';
    const evento = document.getElementById('checklistEvento')?.value || '';
    const data = document.getElementById('checklistData')?.value || '';

    const dataFormatada = data
        ? new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
        : '-';

    const modeloSelecionadoId = document.getElementById('checklistModeloSelect')?.value || '';
    const modeloSelecionado = typeof buscarModeloChecklist === 'function'
        ? buscarModeloChecklist(modeloSelecionadoId)
        : null;

    const tituloEstrutura = modeloSelecionado?.familiaEstrutural
        ? `Estrutura ${modeloSelecionado.familiaEstrutural}`
        : 'Estrutura';

    const nomeModelo = modeloSelecionado?.nome || 'Modelo não informado';

    const gruposMap = {};

(checklistMontagem || []).forEach(item => {
    let grupo = item.grupoChecklist || 'outros';

    if (grupo === 'elétrica') grupo = 'eletrica';
    if (grupo === 'móveis') grupo = 'moveis';

    if (!gruposMap[grupo]) {
        gruposMap[grupo] = new Map();
    }

    const nome = item.nome || 'Item';

    const atual = gruposMap[grupo].get(nome) || 0;
    gruposMap[grupo].set(nome, atual + (Number(item.quantidade) || 0));
});

let htmlSeparacao = '';

Object.keys(gruposMap).forEach(grupo => {
    let titulo = grupo;

    if (grupo === 'estrutura_q15') titulo = 'Estrutura Q15';
    else if (grupo === 'estrutura_q30') titulo = 'Estrutura Q30';
    else if (grupo === 'estrutura') titulo = 'Estrutura';
    else if (grupo === 'moveis') titulo = 'Móveis';
    else if (grupo === 'comunicacao') titulo = 'Comunicação Visual';
    else if (grupo === 'escritorio') titulo = 'Escritório';
    else if (grupo === 'cobertura') titulo = 'Cobertura';
    else if (grupo === 'acabamento') titulo = 'Acabamento';
    else if (grupo === 'eletrica') titulo = 'Elétrica';
    else if (grupo === 'outros') titulo = 'Outros';

    htmlSeparacao += `
        <div style="margin-top:25px;">
            <div style="background:#f3ef00; font-weight:bold; text-align:center; padding:8px; border:1px solid #000;">
                ${titulo}
            </div>

            <table style="width:100%; border-collapse:collapse;" border="1">
                <thead>
                    <tr style="background:#f3ef00;">
                        <th style="padding:6px; text-align:left;">Item</th>
                        <th style="padding:6px; text-align:center; width:180px;">Quantidade de Saída</th>
                        <th style="padding:6px; text-align:center; width:180px;">Quantidade de Retorno</th>
                    </tr>
                </thead>
                <tbody>
    `;

    gruposMap[grupo].forEach((qtd, nome) => {
        htmlSeparacao += `
            <tr>
                <td style="padding:6px;">${nome}</td>
                <td style="padding:6px; text-align:center;">${qtd}</td>
                <td style="padding:6px; text-align:center;">_______</td>
            </tr>
        `;
    });

    htmlSeparacao += `
                </tbody>
            </table>
        </div>
    `;
});

    printArea.innerHTML = html;

    if (modalRelatorio) {
        modalRelatorio.classList.add('active');
    }
}
function montarEtapasMontagemAPartirDaSeparacao() {
    checklistEtapasMontagem = checklistMontagem.map(item => ({
        etapa: item.grupoChecklist || 'montagem',
        modelo: item.modeloNome || '',
        descricao: item.modeloNome || '',
        peca: item.nome || '',
        quantidade: item.quantidade || 0,
        observacao: '',
        conferido: false
    }));

    window.checklistEtapasMontagem = checklistEtapasMontagem;
}

function adicionarLinhaManualMontagem() {
    checklistEtapasMontagem.push({
        etapa: 'montagem',
        item: '',
        quantidade: 1,
        observacao: '',
        conferido: false
    });

    window.checklistEtapasMontagem = checklistEtapasMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistEtapasMontagem();
}

function atualizarLinhaMontagem(index, campo, valor) {
    if (!checklistEtapasMontagem[index]) return;

    checklistEtapasMontagem[index][campo] = valor;

    if (campo === 'quantidade') {
        checklistEtapasMontagem[index][campo] = Number(valor) || 0;
    }

    if (campo === 'conferido') {
        checklistEtapasMontagem[index][campo] = !!valor;
    }

    window.checklistEtapasMontagem = checklistEtapasMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
}

function removerLinhaMontagem(index) {
    if (index < 0 || index >= checklistEtapasMontagem.length) return;

    checklistEtapasMontagem.splice(index, 1);
    window.checklistEtapasMontagem = checklistEtapasMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistEtapasMontagem();
}

function renderChecklistEtapasMontagem() {
    const container = document.getElementById('listaChecklistEtapasMontagem');
    if (!container) return;

    if (!checklistEtapasMontagem || !checklistEtapasMontagem.length) {
        container.innerHTML = '<p>Nenhuma etapa de montagem adicionada.</p>';
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Etapa</th>
                        <th>Estrutura / Item selecionado</th>
                        <th>Peça da composição</th>
                        <th>Qtd</th>
                        <th>Observação de Montagem</th>
                        <th>Conferido</th>
                    </tr>
                </thead>
                <tbody>
    `;

    checklistEtapasMontagem.forEach((linha, index) => {
        html += `
            <tr>
    <td>
        <input type="text"
               value="${linha.etapa || ''}"
               onchange="atualizarLinhaMontagem(${index}, 'etapa', this.value)">
    </td>
    <td>
        <input type="text"
               value="${linha.descricao || ''}"
               onchange="atualizarLinhaMontagem(${index}, 'descricao', this.value)">
    </td>
    <td>
        <input type="text"
               value="${linha.peca || ''}"
               onchange="atualizarLinhaMontagem(${index}, 'peca', this.value)">
    </td>
    <td>
        <input type="number"
               min="0"
               value="${linha.quantidade || 0}"
               onchange="atualizarLinhaMontagem(${index}, 'quantidade', this.value)">
    </td>
    <td>
        <textarea
            rows="2"
            onchange="atualizarLinhaMontagem(${index}, 'observacao', this.value)">${linha.observacao || ''}</textarea>
    </td>
    <td style="text-align:center;">
        <input type="checkbox"
               ${linha.conferido ? 'checked' : ''}
               onchange="atualizarLinhaMontagem(${index}, 'conferido', this.checked)">
    </td>
    <td>
        <button class="btn btn-danger btn-sm" onclick="removerLinhaMontagem(${index})">
            Remover
        </button>
    </td>
</tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

window.popularChecklistModeloSelect = popularChecklistModeloSelect;
window.adicionarModeloAoChecklist = adicionarModeloAoChecklist;
window.removerItemChecklistMontagem = removerItemChecklistMontagem;
window.limparChecklistMontagem = limparChecklistMontagem;
window.renderChecklistMontagem = renderChecklistMontagem;
window.gerarPDFChecklistMontagem = gerarPDFChecklistMontagem;
