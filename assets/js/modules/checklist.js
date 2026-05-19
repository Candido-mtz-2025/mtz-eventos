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
            medida: peca.medida || '',
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
    const confirmar = confirm('Deseja limpar o checklist?');
    if (!confirmar) return;

    checklistMontagem = [];
    window.checklistMontagem = checklistMontagem;

    [
        'checklistCliente',
        'checklistLocal',
        'checklistMontagemData',
        'checklistHorario',
        'checklistEvento',
        'checklistDesmontagemData',
        'checklistRespSaida',
        'checklistRespRetorno'
    ].forEach(id => {
        const campo = document.getElementById(id);
        if (campo) campo.value = '';
    });

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistMontagem();
}

function normalizarGrupoChecklist(grupo) {
    const valor = String(grupo || '').trim().toLowerCase();
    const mapa = {
        'elétrica': 'eletrica',
        eletrica: 'eletrica',
        'móveis': 'moveis',
        moveis: 'moveis',
        'estrutura q15': 'estrutura_q15',
        'estrutura q30': 'estrutura_q30'
    };

    return mapa[valor] || valor || 'outros';
}

function formatarNomeGrupoChecklist(grupo) {
    const mapa = {
        estrutura: 'Estrutura',
        estrutura_q15: 'Estrutura Q15',
        estrutura_q30: 'Estrutura Q30',
        cobertura: 'Cobertura',
        elétrica: 'Elétrica',
        eletrica: 'Elétrica',
        moveis: 'Móveis',
        móveis: 'Móveis',
        comunicacao: 'Comunicação Visual',
        escritorio: 'Escritório',
        acabamento: 'Acabamento',
        outros: 'Outros'
    };

    return mapa[grupo] || grupo || 'Outros';
}

function escaparHTMLChecklist(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function formatarDataChecklist(valor) {
    if (!valor) return '-';
    const data = new Date(`${valor}T00:00:00`);
    if (isNaN(data.getTime())) return '-';
    return data.toLocaleDateString('pt-BR');
}

function obterDadosCabecalhoChecklist() {
    return {
        cliente: document.getElementById('checklistCliente')?.value || '',
        local: document.getElementById('checklistLocal')?.value || '',
        montagem: document.getElementById('checklistMontagemData')?.value || '',
        horario: document.getElementById('checklistHorario')?.value || '',
        evento: document.getElementById('checklistEvento')?.value || '',
        desmontagem: document.getElementById('checklistDesmontagemData')?.value || '',
        respSaida: document.getElementById('checklistRespSaida')?.value || '',
        respRetorno: document.getElementById('checklistRespRetorno')?.value || ''
    };
}

function obterNomeItemChecklist(item) {
    const nome = String(item.nome || '').trim();
    const medida = String(item.medida || '').trim();
    const subtipo = String(item.subtipoEstrutural || '').trim();

    if (nome && medida && !nome.toLowerCase().includes(medida.toLowerCase())) {
        return `${nome} - ${medida}`;
    }

    return nome || medida || subtipo || 'Item';
}

function obterGruposChecklist() {
    const gruposMap = {};

    (checklistMontagem || []).forEach(item => {
        const grupo = normalizarGrupoChecklist(item.grupoChecklist || item.grupo || item.categoriaChecklist || item.categoria);

        if (!gruposMap[grupo]) {
            gruposMap[grupo] = {
                chave: grupo,
                titulo: formatarNomeGrupoChecklist(grupo),
                total: 0,
                modelos: new Set(),
                itens: new Map()
            };
        }

        const referencia = obterNomeItemChecklist(item);

        const qtd = Number(item.quantidade) || 0;
        const linhaAtual = gruposMap[grupo].itens.get(referencia) || {
            nome: referencia,
            quantidade: 0
        };

        linhaAtual.quantidade += qtd;
        gruposMap[grupo].itens.set(referencia, linhaAtual);
        gruposMap[grupo].total += qtd;

        if (item.modeloNome) gruposMap[grupo].modelos.add(item.modeloNome);
    });

    const ordem = [
        'estrutura',
        'estrutura_q15',
        'estrutura_q30',
        'cobertura',
        'eletrica',
        'moveis',
        'acabamento',
        'comunicacao',
        'escritorio',
        'outros'
    ];

    return Object.keys(gruposMap)
        .sort((a, b) => {
            const posA = ordem.includes(a) ? ordem.indexOf(a) : 999;
            const posB = ordem.includes(b) ? ordem.indexOf(b) : 999;
            if (posA !== posB) return posA - posB;
            return formatarNomeGrupoChecklist(a).localeCompare(formatarNomeGrupoChecklist(b));
        })
        .map(chave => ({
            ...gruposMap[chave],
            modelos: Array.from(gruposMap[chave].modelos),
            itens: Array.from(gruposMap[chave].itens.values())
        }));
}

function renderChecklistMontagem() {
    const container = document.getElementById('listaChecklistMontagem');
    if (!container) return;

    if (!checklistMontagem || !checklistMontagem.length) {
        container.innerHTML = `<p>Nenhum item adicionado.</p>`;
        return;
    }

    const grupos = obterGruposChecklist();

    container.innerHTML = `
        <div class="checklist-preview-grid">
            ${grupos.map(grupo => `
                <div class="checklist-preview-card">
                    <div class="checklist-preview-head">
                        <div>
                            <strong>${escaparHTMLChecklist(grupo.titulo)}</strong>
                            ${grupo.modelos.length ? `<div style="font-size:0.8rem;color:var(--text-light);margin-top:3px;">${grupo.modelos.map(escaparHTMLChecklist).join(' • ')}</div>` : ''}
                        </div>
                        <span>${grupo.total} item(ns)</span>
                    </div>
                    <table class="checklist-preview-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Saída</th>
                                <th>Retorno</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${grupo.itens.map(item => `
                                <tr>
                                    <td>${escaparHTMLChecklist(item.nome)}</td>
                                    <td>${item.quantidade}</td>
                                    <td>_______</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `).join('')}
        </div>
    `;
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

    const dados = obterDadosCabecalhoChecklist();
    const grupos = obterGruposChecklist();
    const totalItens = grupos.reduce((total, grupo) => total + grupo.total, 0);
    const totalLinhas = grupos.reduce((total, grupo) => total + grupo.itens.length, 0);

    const infoCard = (label, value) => `
        <div style="border:1px solid #d7dde8;border-radius:10px;padding:10px 12px;background:#f8fafc;">
            <div style="font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700;">${label}</div>
            <div style="margin-top:4px;font-size:12px;color:#111827;font-weight:700;line-height:1.3;">${escaparHTMLChecklist(value || '-')}</div>
        </div>
    `;

    const htmlSeparacao = grupos.map((grupo, index) => `
        <section style="margin-top:16px;border:1px solid #d7dde8;border-radius:14px;overflow:hidden;break-inside:avoid;background:#ffffff;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:#111827;color:#ffffff;padding:12px 14px;">
                <div>
                    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#bfdbfe;font-weight:800;">Grupo ${String(index + 1).padStart(2, '0')}</div>
                    <div style="font-size:15px;font-weight:800;margin-top:2px;">${escaparHTMLChecklist(grupo.titulo)}</div>
                </div>
                <div style="font-size:11px;font-weight:800;background:#2563eb;color:#ffffff;border-radius:999px;padding:6px 10px;white-space:nowrap;">${grupo.total} item(ns)</div>
            </div>

            ${grupo.modelos.length ? `
                <div style="padding:10px 14px;background:#eff6ff;border-bottom:1px solid #d7dde8;color:#1e3a8a;font-size:11px;">
                    <strong>Modelo:</strong> ${grupo.modelos.map(escaparHTMLChecklist).join(' • ')}
                </div>
            ` : ''}

            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                    <tr style="background:#f8fafc;color:#475569;">
                        <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #d7dde8;width:46%;">Item</th>
                        <th style="padding:10px 12px;text-align:center;border-bottom:1px solid #d7dde8;width:16%;">Saída</th>
                        <th style="padding:10px 12px;text-align:center;border-bottom:1px solid #d7dde8;width:20%;">Retorno</th>
                        <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #d7dde8;width:18%;">Observação</th>
                    </tr>
                </thead>
                <tbody>
                    ${grupo.itens.map((item, linhaIndex) => `
                        <tr style="background:${linhaIndex % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:700;">${escaparHTMLChecklist(item.nome)}</td>
                            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#111827;font-weight:800;">${item.quantidade}</td>
                            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
                                <span style="display:inline-block;width:82px;border-bottom:1.8px solid #111827;height:14px;"></span>
                            </td>
                            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">
                                <span style="display:block;border-bottom:1px solid #cbd5e1;height:14px;"></span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </section>
    `).join('');

    const html = `
        <div style="font-family:Inter,Arial,sans-serif;background:#ffffff;color:#111827;width:100%;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:16px;border-bottom:3px solid #111827;">
                <div>
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#2563eb;font-weight:900;">MTZ Eventos</div>
                    <h1 style="margin:5px 0 4px 0;font-size:28px;line-height:1;color:#111827;">Checklist Operacional</h1>
                    <div style="font-size:12px;color:#64748b;font-weight:700;">Separação, saída e retorno de materiais</div>
                </div>
                <div style="text-align:right;">
                    <img src="./logo.png" alt="MTZ Eventos" style="height:64px;object-fit:contain;margin-bottom:6px;">
                    <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:800;">Gerado em</div>
                    <div style="font-size:11px;color:#111827;font-weight:800;">${new Date().toLocaleString('pt-BR')}</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px;">
                ${infoCard('Cliente', dados.cliente)}
                ${infoCard('Evento', dados.evento)}
                ${infoCard('Local', dados.local)}
                ${infoCard('Montagem', `${formatarDataChecklist(dados.montagem)}${dados.horario ? ' às ' + dados.horario : ''}`)}
                ${infoCard('Desmontagem', formatarDataChecklist(dados.desmontagem))}
                ${infoCard('Resp. saída', dados.respSaida)}
                ${infoCard('Resp. retorno', dados.respRetorno)}
                ${infoCard('Itens', `${totalItens} peças • ${totalLinhas} linhas`)}
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
                <div>
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#1d4ed8;font-weight:900;">Checklist de separação</div>
                    <div style="font-size:12px;color:#1e3a8a;margin-top:3px;">Conferir saída, registrar retorno e anotar divergências.</div>
                </div>
                <div style="font-size:20px;font-weight:900;color:#1d4ed8;">${String(grupos.length).padStart(2, '0')}</div>
            </div>

            <div>
                ${htmlSeparacao || '<p>Nenhum item adicionado.</p>'}
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:38px;break-inside:avoid;">
                <div style="text-align:center;">
                    <div style="border-top:1.5px solid #111827;padding-top:9px;font-size:10px;font-weight:800;color:#111827;text-transform:uppercase;">Responsável pela saída</div>
                </div>
                <div style="text-align:center;">
                    <div style="border-top:1.5px solid #111827;padding-top:9px;font-size:10px;font-weight:800;color:#111827;text-transform:uppercase;">Responsável pelo retorno</div>
                </div>
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
        peca: item.medida || item.subtipoEstrutural || item.nome || '',
        quantidade: item.quantidade || 0,
        observacao: '',
        conferido: false
    }));

    window.checklistEtapasMontagem = checklistEtapasMontagem;
}

function adicionarLinhaManualMontagem() {
    checklistEtapasMontagem.push({
    etapa: 'montagem',
    descricao: '',
    peca: '',
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
                        <th>Ação</th>
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
