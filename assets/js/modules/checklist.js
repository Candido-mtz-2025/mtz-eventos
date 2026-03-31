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

    const gruposSeparacao = {};
    const ordemGruposSeparacao = ['estrutura', 'cobertura', 'eletrica', 'elétrica', 'moveis', 'móveis', 'acabamento', 'outros'];

    (checklistMontagem || []).forEach(item => {
        let grupo = item.grupoChecklist || 'outros';

        if (grupo === 'móveis') grupo = 'moveis';
        if (grupo === 'elétrica') grupo = 'eletrica';

        if (!gruposSeparacao[grupo]) gruposSeparacao[grupo] = [];
        gruposSeparacao[grupo].push(item);
    });

    let htmlSeparacao = '';

    ordemGruposSeparacao.forEach(grupo => {
        if (!gruposSeparacao[grupo] || !gruposSeparacao[grupo].length) return;

        htmlSeparacao += `
            <div style="margin-top:20px;">
                <h3 style="margin:0 0 10px 0; background:#f2f2f2; padding:8px; border:1px solid #ccc;">
                    ${formatarNomeGrupoChecklist(grupo)}
                </h3>

                <table style="width:100%; border-collapse:collapse; margin-top:8px;" border="1">
                    <thead>
                        <tr>
                            <th style="padding:8px; text-align:left;">Peça</th>
                            <th style="padding:8px; text-align:left;">Família</th>
                            <th style="padding:8px; text-align:left;">Subtipo</th>
                            <th style="padding:8px; text-align:center; width:90px;">Quantidade</th>
                            <th style="padding:8px; text-align:center; width:120px;">Conferido</th>
                            <th style="padding:8px; text-align:left;">Observação</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        gruposSeparacao[grupo].forEach(item => {
            htmlSeparacao += `
                <tr>
                    <td style="padding:8px;">${item.nome || ''}</td>
                    <td style="padding:8px;">${item.familiaEstrutural || '-'}</td>
                    <td style="padding:8px;">${item.subtipoEstrutural || '-'}</td>
                    <td style="padding:8px; text-align:center;">${item.quantidade || 0}</td>
                    <td style="padding:8px; text-align:center;">_______</td>
                    <td style="padding:8px;">&nbsp;</td>
                </tr>
            `;
        });

        htmlSeparacao += `
                    </tbody>
                </table>
            </div>
        `;
    });

    let htmlMontagem = '';

    if (checklistEtapasMontagem && checklistEtapasMontagem.length) {
        htmlMontagem += `
            <table style="width:100%; border-collapse:collapse; margin-top:10px;" border="1">
                <thead>
                    <tr>
                        <th style="padding:8px; text-align:left; width:140px;">Etapa</th>
                        <th style="padding:8px; text-align:left;">Item / Atividade</th>
                        <th style="padding:8px; text-align:center; width:80px;">Qtd</th>
                        <th style="padding:8px; text-align:left;">Observação de Montagem</th>
                        <th style="padding:8px; text-align:center; width:100px;">Conferido</th>
                    </tr>
                </thead>
                <tbody>
        `;

        checklistEtapasMontagem.forEach(linha => {
            htmlMontagem += `
                <tr>
                    <td style="padding:8px;">${linha.etapa || '-'}</td>
                    <td style="padding:8px;">${linha.descricao || '-'}</td>
                    <td style="padding:8px;">${linha.peca || '-'}</td>
                    <td style="padding:8px; text-align:center;">${linha.quantidade || 0}</td>
                    <td style="padding:8px;">${linha.observacao ? linha.observacao.replace(/\n/g, '<br>') : '&nbsp;'}</td>
                    <td style="padding:8px; text-align:center;">${linha.conferido ? 'OK' : '_______'}</td>
                </tr>
            `;
        });

        htmlMontagem += `
                </tbody>
            </table>
        `;
    } else {
        htmlMontagem = `
            <table style="width:100%; border-collapse:collapse; margin-top:10px;" border="1">
                <thead>
                    <tr>
                        <th style="padding:8px; text-align:left; width:140px;">Etapa</th>
                        <th style="padding:8px; text-align:left;">Item / Atividade</th>
                        <th style="padding:8px; text-align:center; width:80px;">Qtd</th>
                        <th style="padding:8px; text-align:left;">Observação de Montagem</th>
                        <th style="padding:8px; text-align:center; width:100px;">Conferido</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:8px;">&nbsp;</td>
                        <td style="padding:8px;">&nbsp;</td>
                        <td style="padding:8px; text-align:center;">&nbsp;</td>
                        <td style="padding:8px;">&nbsp;</td>
                        <td style="padding:8px; text-align:center;">_______</td>
                    </tr>
                    <tr>
                        <td style="padding:8px;">&nbsp;</td>
                        <td style="padding:8px;">&nbsp;</td>
                        <td style="padding:8px; text-align:center;">&nbsp;</td>
                        <td style="padding:8px;">&nbsp;</td>
                        <td style="padding:8px; text-align:center;">_______</td>
                    </tr>
                    <tr>
                        <td style="padding:8px;">&nbsp;</td>
                        <td style="padding:8px;">&nbsp;</td>
                        <td style="padding:8px; text-align:center;">&nbsp;</td>
                        <td style="padding:8px;">&nbsp;</td>
                        <td style="padding:8px; text-align:center;">_______</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    const dataFormatada = data
        ? new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
        : '-';

    const html = `
        <div style="padding:20px; font-family:Arial,sans-serif; background:#fff; color:#000;">
            <div style="border-bottom:2px solid #000; padding-bottom:12px; margin-bottom:20px;">
                <h2 style="margin:0 0 10px 0;">Checklist de Evento</h2>

                <div style="font-size:14px; line-height:1.7;">
                    <div><strong>Cliente:</strong> ${cliente || '-'}</div>
                    <div><strong>Evento:</strong> ${evento || '-'}</div>
                    <div><strong>Data:</strong> ${dataFormatada}</div>
                    <div><strong>Gerado em:</strong> ${new Date().toLocaleString('pt-BR')}</div>
                </div>
            </div>

            <div style="margin-top:10px;">
                <h2 style="margin:0 0 10px 0;">1. Checklist de Separação</h2>
                ${htmlSeparacao || '<p>Nenhum item de separação adicionado.</p>'}
            </div>

            <div style="margin-top:35px;">
                <h2 style="margin:0 0 10px 0;">2. Checklist de Montagem</h2>
                ${htmlMontagem}
            </div>
        </div>
    `;

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
