function renderDevolucoes() {
    const tbody = document.getElementById('tblDevolucoes');
    if (!tbody) return;

    if (!Array.isArray(devolucoes)) {
        tbody.innerHTML = typeof criarLinhaTabelaEstado === 'function'
            ? criarLinhaTabelaEstado(4, {
                tipo: 'error',
                titulo: 'Falha ao carregar devoluções',
                mensagem: 'Atualize a tela para tentar novamente.'
            })
            : '<tr class="table-empty-row"><td colspan="4">Dados não carregados.</td></tr>';
        return;
    }

    const filtro = document.getElementById('devFiltroHistorico')?.value || 'todos';
    const termoRaw = (document.getElementById('devBuscaHistorico')?.value || '').trim();
    const termo = termoRaw.toLowerCase();

    const atualizarKpiVisualDevolucoes = () => {
        const cards = document.querySelectorAll('#tab-devolucoes .devolucao-kpi[data-filtro-dev]');
        if (!cards.length) return;

        const filtroAtual = String(filtro || 'todos').trim().toLowerCase();
        cards.forEach((card) => {
            const destino = String(card.dataset.filtroDev || '').trim().toLowerCase();
            const ativo = destino === filtroAtual;
            card.classList.toggle('is-active', ativo);
            card.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });
    };
    atualizarKpiVisualDevolucoes();

    // Evita buscas O(n²) em locações/clientes quando há muitos registros de devolução.
    const mapaLocacoesPorId = new Map(
        (Array.isArray(locacoes) ? locacoes : []).map((locacao) => [String(locacao.id), locacao])
    );
    const mapaLocadoresPorId = new Map(
        (Array.isArray(locadores) ? locadores : []).map((locador) => [String(locador.id), locador])
    );

    const listaComContexto = devolucoes.map((registro) => {
        const locacao = mapaLocacoesPorId.get(String(registro.locacaoId)) || null;
        const cliente = locacao
            ? (mapaLocadoresPorId.get(String(locacao.locadorId)) || null)
            : null;
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

    if (typeof atualizarMetaBusca === 'function') {
        const rotulosFiltro = {
            todos: 'Todos',
            parcial: 'Parciais',
            total: 'Concluidas'
        };
        atualizarMetaBusca('metaBuscaDevolucoes', {
            total: listaComContexto.length,
            filtrados: filtrados.length,
            termo: termoRaw,
            rotulo: 'devolucoes',
            filtro,
            filtroLabel: rotulosFiltro[filtro] || filtro
        });
    }

    const ordenados = filtrados.slice().sort((a, b) => b.id - a.id);
    const lista = ordenados.slice(0, 40);

    const kpiRegistros = document.getElementById('devKpiRegistros');
    const kpiConcluidas = document.getElementById('devKpiConcluidas');
    const kpiParciais = document.getElementById('devKpiParciais');
    const kpiPendentes = document.getElementById('devKpiPendentes');
    const totalPendentes = Array.isArray(locacoes)
        ? locacoes.filter((x) => {
            if (!x) return false;
            const normalizada = typeof normalizarLocacaoDominio === 'function'
                ? normalizarLocacaoDominio(x)
                : null;
            const statusVisual = String(normalizada?.statusVisual || x?.status || '').trim().toLowerCase();
            return statusVisual !== 'devolvido' && statusVisual !== 'cancelado';
        }).length
        : 0;

    if (kpiRegistros) kpiRegistros.textContent = String(filtrados.length);
    if (kpiConcluidas) kpiConcluidas.textContent = String(filtrados.filter((x) => x.tipoNormalizado === 'total').length);
    if (kpiParciais) kpiParciais.textContent = String(filtrados.filter((x) => x.tipoNormalizado === 'parcial').length);
    if (kpiPendentes) kpiPendentes.textContent = String(totalPendentes);

    if (lista.length === 0) {
        const mapFiltro = {
            todos: 'Nenhuma devolução registrada.',
            total: 'Nenhuma devolução concluída neste filtro.',
            parcial: 'Nenhuma devolução parcial neste filtro.'
        };
        const mensagem = termoRaw
            ? `Nenhuma devolução encontrada para "${termoRaw}".`
            : (mapFiltro[filtro] || 'Nenhuma devolução registrada para este filtro.');
        const termoSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(termoRaw) : termoRaw;
        const fallback = termoRaw
            ? `Nenhuma devolução encontrada para "${termoSeguro}".`
            : (mapFiltro[filtro] || 'Nenhuma devolução registrada para este filtro.');

        tbody.innerHTML = typeof criarLinhaTabelaEstado === 'function'
            ? criarLinhaTabelaEstado(4, {
                tipo: 'empty',
                titulo: 'Sem devoluções para mostrar',
                mensagem
            })
            : `<tr class="table-empty-row"><td colspan="4">${fallback}</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map((registro) => {
        const clienteBruto = registro.cliente ? registro.cliente.nome : 'Removido';
        const cliente = typeof sanitizarTexto === 'function' ? sanitizarTexto(clienteBruto) : clienteBruto;
        const locacaoId = registro.locacao ? `#${registro.locacao.id.toString().slice(-4)}` : '#----';
        const locacaoIdCompleto = String(registro.locacao?.id || registro.locacaoId || '').trim();
        const tipo = registro.tipoNormalizado === 'parcial' ? 'Parcial' : 'Concluído';
        const badge = registro.tipoNormalizado === 'parcial' ? 'badge-warning' : 'badge-success';
        const itensTexto = registro.qtdItens > 0 ? `| ${registro.qtdItens} item(ns)` : '';
        const rowClasses = ['devolucao-row', `devolucao-row--${registro.tipoNormalizado}`];
        let rowActionAttr = '';
        if (locacaoIdCompleto) {
            rowClasses.push('devolucao-row-action');
            rowActionAttr = ` data-action="irParaLocacaoPorCodigo" data-arg="${locacaoIdCompleto}" title="Abrir locação #${locacaoIdCompleto.slice(-4)}"`;
        }

        return `
            <tr class="${rowClasses.join(' ')}"${rowActionAttr} data-devolucao-id="${registro.id}">
                <td>
                    <div class="table-cell-title">${cliente}</div>
                    <div class="table-cell-sub">${locacaoId} ${itensTexto}</div>
                </td>
                <td>
                    <div class="table-cell-title">${formatarData(registro.dataDevolucao)}</div>
                    <div class="table-cell-sub">Registro #${registro.id.toString().slice(-4)}</div>
                </td>
                <td><span class="badge ${badge}">${tipo}</span></td>
                <td class="col-actions">
                    <div class="actions-cell">
                        <button class="btn btn-sm btn-secondary table-action-btn" title="Imprimir recibo" aria-label="Imprimir recibo" data-action="gerarReciboDevolucao" data-arg="${registro.id}">
                            <i class="bi bi-printer"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}
