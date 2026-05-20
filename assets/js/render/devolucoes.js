function renderDevolucoes() {
    const tbody = document.getElementById('tblDevolucoes');
    if (!tbody) return;

    if (!Array.isArray(devolucoes)) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Dados não carregados</td></tr>';
        return;
    }

    const filtro = document.getElementById('devFiltroHistorico')?.value || 'todos';
    const termo = (document.getElementById('devBuscaHistorico')?.value || '').trim().toLowerCase();

    const listaComContexto = devolucoes.map((registro) => {
        const locacao = locacoes.find((x) => x.id === registro.locacaoId);
        const cliente = locadores.find((x) => x.id === (locacao ? locacao.locadorId : 0));
        const tipoNormalizado = registro.tipo === 'parcial' ? 'parcial' : 'total';
        const qtdItens = Array.isArray(registro.itens)
            ? registro.itens.reduce((total, item) => total + (parseInt(item.quantidadeDevolvida, 10) || 0), 0)
            : 0;

        return {
            ...registro,
            locacao,
            cliente,
            tipoNormalizado,
            qtdItens
        };
    });

    let filtrados = listaComContexto;
    if (filtro !== 'todos') {
        filtrados = filtrados.filter((registro) => registro.tipoNormalizado === filtro);
    }

    if (termo) {
        filtrados = filtrados.filter((registro) => {
            const nome = String(registro.cliente?.nome || '').toLowerCase();
            const descricao = String(registro.obs || '').toLowerCase();
            const codigo = String(registro.locacao?.id || '').toLowerCase();
            return nome.includes(termo) || descricao.includes(termo) || codigo.includes(termo);
        });
    }

    const ordenados = filtrados.slice().sort((a, b) => b.id - a.id);
    const lista = ordenados.slice(0, 40);

    const kpiRegistros = document.getElementById('devKpiRegistros');
    const kpiConcluidas = document.getElementById('devKpiConcluidas');
    const kpiParciais = document.getElementById('devKpiParciais');

    if (kpiRegistros) kpiRegistros.textContent = String(filtrados.length);
    if (kpiConcluidas) kpiConcluidas.textContent = String(filtrados.filter((x) => x.tipoNormalizado === 'total').length);
    if (kpiParciais) kpiParciais.textContent = String(filtrados.filter((x) => x.tipoNormalizado === 'parcial').length);

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; opacity:0.6;">Nenhuma devolução registrada para este filtro.</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map((registro) => {
        const cliente = registro.cliente ? registro.cliente.nome : 'Removido';
        const locacaoId = registro.locacao ? `#${registro.locacao.id.toString().slice(-4)}` : '#----';
        const tipo = registro.tipoNormalizado === 'parcial' ? 'Parcial' : 'Concluído';
        const badge = registro.tipoNormalizado === 'parcial' ? 'badge-warning' : 'badge-success';
        const itensTexto = registro.qtdItens > 0 ? `| ${registro.qtdItens} item(ns)` : '';

        return `
            <tr>
                <td>
                    <div style="font-weight:600;">${cliente}</div>
                    <div style="font-size:0.75rem; opacity:0.7;">${locacaoId} ${itensTexto}</div>
                </td>
                <td>${formatarData(registro.dataDevolucao)}</td>
                <td><span class="badge ${badge}">${tipo}</span></td>
                <td class="col-actions">
                    <button class="btn btn-sm btn-secondary" onclick="gerarReciboDevolucao(${registro.id})">
                        <i class="bi bi-printer"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}
