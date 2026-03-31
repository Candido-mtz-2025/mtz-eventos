function popularChecklistModeloSelect() {
    const select = document.getElementById('checklistModeloSelect');
    if (!select) return;

    const modelos = typeof listarModelosChecklist === 'function'
        ? listarModelosChecklist()
        : (window.modelosChecklist || []);

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
        : (window.modelosChecklist || []).find(m => String(m.id) === String(modeloId));

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

        const peca = (window.pecas || []).find(p => String(p.id) === String(pecaId));
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

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistMontagem();
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
    window.checklistMontagem = checklistMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistMontagem();
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
    if (!checklistMontagem || !checklistMontagem.length) {
        alert('Nenhum item no checklist para gerar PDF.');
        return;
    }

    const printArea = document.getElementById('printArea');
    const modalRelatorio = document.getElementById('modalRelatorio');

    if (!printArea) {
        alert('printArea não encontrada.');
        return;
    }

    const grupos = {};

    checklistMontagem.forEach(item => {
        let grupo = item.grupoChecklist || 'outros';

        if (grupo === 'móveis') grupo = 'moveis';
        if (grupo === 'elétrica') grupo = 'eletrica';

        if (!grupos[grupo]) grupos[grupo] = [];
        grupos[grupo].push(item);
    });

    const gruposOrdem = ['estrutura', 'cobertura', 'eletrica', 'moveis', 'acabamento', 'outros'];

    let html = `
        <div style="padding:20px; font-family:Arial,sans-serif;">
            <h2 style="margin-bottom:6px;">Checklist de Montagem</h2>
            <div style="margin-bottom:20px; color:#666;">
                Gerado em ${new Date().toLocaleString('pt-BR')}
            </div>
    `;

    gruposOrdem.forEach(grupo => {
        if (!grupos[grupo] || !grupos[grupo].length) return;

        html += `
            <h3 style="margin-top:20px; background:#f2f2f2; padding:8px; border:1px solid #ccc;">
                ${formatarNomeGrupoChecklist(grupo)}
            </h3>
            <table style="width:100%; border-collapse:collapse; margin-top:10px;" border="1">
                <thead>
                    <tr>
                        <th style="padding:8px;">Peça</th>
                        <th style="padding:8px;">Família</th>
                        <th style="padding:8px;">Subtipo</th>
                        <th style="padding:8px;">Quantidade</th>
                    </tr>
                </thead>
                <tbody>
        `;

        grupos[grupo].forEach(item => {
            html += `
                <tr>
                    <td style="padding:8px;">${item.nome || ''}</td>
                    <td style="padding:8px;">${item.familiaEstrutural || '-'}</td>
                    <td style="padding:8px;">${item.subtipoEstrutural || '-'}</td>
                    <td style="padding:8px; text-align:center;">${item.quantidade || 0}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
    });

    html += `</div>`;

    printArea.innerHTML = html;

    if (modalRelatorio) {
        modalRelatorio.classList.add('active');
    }
}

window.popularChecklistModeloSelect = popularChecklistModeloSelect;
window.adicionarModeloAoChecklist = adicionarModeloAoChecklist;
window.removerItemChecklistMontagem = removerItemChecklistMontagem;
window.limparChecklistMontagem = limparChecklistMontagem;
window.renderChecklistMontagem = renderChecklistMontagem;
window.gerarPDFChecklistMontagem = gerarPDFChecklistMontagem;
