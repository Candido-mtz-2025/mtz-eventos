// 🔥 RENDERIZAR LOCAÇÕES OTIMIZADA
// ========================================
function obterDataLocalLocacao(valor) {
    if (!valor) return null;

    if (typeof parseDataIso === 'function') {
        return parseDataIso(valor);
    }

    const data = new Date(`${valor}T00:00:00`);
    if (Number.isNaN(data.getTime())) return null;
    data.setHours(0, 0, 0, 0);
    return data;
}

function atualizarFiltroVisualLocacoes() {
    const botoes = document.querySelectorAll('#tab-locacoes .filters-row [data-filtro]');
    botoes.forEach((btn) => {
        const ativo = btn.getAttribute('data-filtro') === filtroAtual;
        btn.classList.toggle('is-active', ativo);
        btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
}

function formatarMoedaResumoLocacoes(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function atualizarResumoExecutivoLocacoes(lista) {
    const total = lista.length;
    const emAberto = lista.filter((l) => l.statusVisual === 'ativo').length;
    const atrasadas = lista.filter((l) => l.statusVisual === 'atrasado').length;
    const pendente = lista.reduce((acc, l) => {
        if (!l.pago && l.statusVisual !== 'devolvido' && l.statusVisual !== 'cancelado') return acc + (Number(l.valorTotal) || 0);
        return acc;
    }, 0);

    const campos = [
        ['locacaoKpiTotal', String(total)],
        ['locacaoKpiAbertas', String(emAberto)],
        ['locacaoKpiAtrasadas', String(atrasadas)],
        ['locacaoKpiPendente', formatarMoedaResumoLocacoes(pendente)]
    ];

    campos.forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    });
}

function atualizarResumoVisualLocacoes() {
    const cards = document.querySelectorAll('#tab-locacoes .locacao-kpi-card[data-arg]');
    if (!cards.length) return;

    const buscaAtual = String(document.getElementById('buscaLocacoes')?.value || '').trim().toLowerCase();
    const filtroNormalizado = typeof normalizarFiltroLocacoes === 'function'
        ? normalizarFiltroLocacoes(filtroAtual)
        : String(filtroAtual || 'todos').trim().toLowerCase();

    cards.forEach((card) => {
        const destino = String(card.dataset.arg || '').trim().toLowerCase();
        let ativo = false;

        if (destino === 'pendente') {
            ativo = buscaAtual === 'pendente';
        } else if (destino === 'todos') {
            ativo = filtroNormalizado === 'todos' && buscaAtual !== 'pendente';
        } else {
            ativo = filtroNormalizado === destino && buscaAtual !== 'pendente';
        }

        card.classList.toggle('is-active', ativo);
        card.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
}

function renderLocacoes() {
    const tbody = DOM.get('tblLocacoes');
    if (!tbody) return;

    if (!Array.isArray(locacoes)) {
        tbody.innerHTML = typeof criarLinhaTabelaEstado === 'function'
            ? criarLinhaTabelaEstado(5, {
                tipo: 'error',
                titulo: 'Falha ao carregar locações',
                mensagem: 'Atualize a tela para tentar novamente.'
            })
            : '<tr class="table-empty-row"><td colspan="5">Dados de locações indisponíveis.</td></tr>';
        return;
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const termoRaw = String(document.getElementById('buscaLocacoes')?.value || '').trim();
    const normalizar = (valor) => String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const termo = normalizar(termoRaw);

    // Evita buscas repetidas em locadores.find(...) para cada linha.
    const mapaLocadoresPorId = new Map(
        (Array.isArray(locadores) ? locadores : []).map((locador) => [String(locador.id), locador])
    );

    atualizarFiltroVisualLocacoes();
    atualizarResumoVisualLocacoes();
    
    // Processar dados
    const lista = locacoes.map(l => {
        const normalizada = typeof normalizarLocacaoDominio === 'function'
            ? normalizarLocacaoDominio(l, { hoje })
            : null;
        const statusVisualCalculado = String(normalizada?.statusVisual || '').trim().toLowerCase();
        const st = statusVisualCalculado || l.status;
        const qtdDevolvida = (l.items || []).reduce((total, item) => total + (parseInt(item.devolvidos) || 0), 0);
        const devolucaoParcial = st !== 'devolvido' && qtdDevolvida > 0;
        const valorTotal = typeof calcularValorLocacaoDominio === 'function'
            ? calcularValorLocacaoDominio(l)
            : (function () {
                let total = 0;
                (l.items || []).forEach(i => total += (parseFloat(i.valor) || 0) * (parseInt(i.quantidade) || 1));
                let div = parseFloat(l.divisorFatura) || 1;
                if (div <= 0) div = 1;
                return total / div;
            })();
        const clienteNome = mapaLocadoresPorId.get(String(l.locadorId))?.nome || 'Removido';
        const pago = typeof normalizada?.pago === 'boolean'
            ? normalizada.pago
            : Boolean(l.pago);
        return { ...l, statusVisual: st, devolucaoParcial, valorTotal, pago, clienteNome };
    });
    atualizarResumoExecutivoLocacoes(lista);
    
    const filtrados = lista.filter((l) => {
        if (filtroAtual === 'devolvido') {
            if (l.statusVisual !== 'devolvido' && l.statusVisual !== 'cancelado') return false;
        } else if (filtroAtual !== 'todos' && l.statusVisual !== filtroAtual) {
            return false;
        }
        if (!termo) return true;

        const idTexto = String(l.id || '');
        const periodoTexto = `${l.dataAluguel || ''} ${l.dataDevolucaoPrevisao || ''}`;
        const valorTexto = String((Number(l.valorTotal) || 0).toFixed(2)).replace('.', ',');
        const checklistGerado = String(l?.checklist?.status || '').toLowerCase() === 'gerado';
        const checklistTexto = checklistGerado ? 'checklist gerado com checklist' : 'sem checklist checklist pendente';
        const alvo = normalizar([
            l.clienteNome,
            idTexto,
            `#${idTexto.slice(-4)}`,
            l.codigoProposta,
            periodoTexto,
            l.statusVisual,
            l.pago ? 'pago' : 'pendente',
            checklistTexto,
            valorTexto
        ].join(' '));

        return alvo.includes(termo);
    });
    filtrados.sort((a, b) => b.id - a.id);

    if (typeof atualizarMetaBusca === 'function') {
        const rotulosFiltro = {
            todos: 'Todos',
            ativo: 'Em aberto',
            atrasado: 'Atrasados',
            devolvido: 'Historico',
            cancelado: 'Canceladas'
        };
        atualizarMetaBusca('metaBuscaLocacoes', {
            total: lista.length,
            filtrados: filtrados.length,
            rotulo: 'locacoes',
            termo: termoRaw,
            filtro: filtroAtual,
            filtroLabel: rotulosFiltro[filtroAtual] || filtroAtual
        });
    }
    
    // Paginação
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
    if (paginaAtual.locacoes > totalPaginas) paginaAtual.locacoes = totalPaginas;
    if (paginaAtual.locacoes < 1) paginaAtual.locacoes = 1;
    const inicio = (paginaAtual.locacoes - 1) * ITENS_POR_PAGINA;
    const itensPagina = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA);
    
    if (itensPagina.length === 0) {
        const mapaVazio = {
            todos: {
                titulo: 'Sem locações registradas',
                mensagem: 'Crie a primeira locação para começar o histórico.'
            },
            ativo: {
                titulo: 'Nenhuma locação em aberto',
                mensagem: 'Neste momento não há contratos ativos.'
            },
            atrasado: {
                titulo: 'Sem atrasos',
                mensagem: 'Ótimo: nenhuma locação está vencida neste filtro.'
            },
            devolvido: {
                titulo: 'Sem histórico no filtro',
                mensagem: 'Não há locações devolvidas ou canceladas para exibir agora.'
            },
            cancelado: {
                titulo: 'Sem locações canceladas',
                mensagem: 'Não há locações canceladas para exibir agora.'
            }
        };
        const estadoAtual = mapaVazio[filtroAtual] || mapaVazio.todos;
        const mensagem = termoRaw
            ? `Nenhuma locação encontrada para "${termoRaw}".`
            : estadoAtual.mensagem;

        tbody.innerHTML = typeof criarLinhaTabelaEstado === 'function'
            ? criarLinhaTabelaEstado(5, {
                tipo: filtroAtual === 'atrasado' ? 'success' : 'empty',
                titulo: termoRaw ? 'Nenhuma locação encontrada' : estadoAtual.titulo,
                mensagem
            })
            : `<tr class="table-empty-row"><td colspan="5">${estadoAtual.titulo}</td></tr>`;
        return;
    }
    
    // 🔥 OTIMIZAÇÃO: DocumentFragment (1 reflow)
    const fragment = document.createDocumentFragment();
    
    itensPagina.forEach((l) => {
        const nomeCliente = typeof sanitizarTexto === 'function'
            ? sanitizarTexto(l.clienteNome || 'Removido')
            : (l.clienteNome || 'Removido');
        const origemProposta = l.codigoProposta
            ? `Proposta ${l.codigoProposta}`
            : '';
        const origemPropostaHtml = origemProposta
            ? `<div class="locacao-cell-meta">${typeof sanitizarTexto === 'function' ? sanitizarTexto(origemProposta) : origemProposta}</div>`
            : '';

        const statusVisual = l.statusVisual === 'atrasado'
            ? 'atrasado'
            : l.statusVisual === 'devolvido'
                ? 'devolvido'
                : l.statusVisual === 'cancelado'
                    ? 'cancelado'
                : 'ativo';

        const badgeClass = statusVisual === 'atrasado'
            ? 'badge-danger'
            : statusVisual === 'devolvido'
                ? 'badge-info'
                : statusVisual === 'cancelado'
                    ? 'badge-warning'
                : 'badge-success';
        const statusLabel = statusVisual === 'atrasado'
            ? 'ATRASADO'
            : statusVisual === 'devolvido'
                ? 'DEVOLVIDO'
                : statusVisual === 'cancelado'
                    ? 'CANCELADO'
                    : 'ATIVO';
        const checklistGerado = String(l?.checklist?.status || '').toLowerCase() === 'gerado';
        const checklistTitulo = checklistGerado ? 'Abrir checklist da locação' : 'Gerar checklist da locação';
        const checklistResumo = l?.checklist?.resumo || {};
        const checklistTotal = Number(checklistResumo.totalLinhas) || 0;
        const checklistConferidos = Number(checklistResumo.conferidos) || 0;
        const checklistBadgeTexto = checklistTotal > 0
            ? `CHECKLIST ${checklistConferidos}/${checklistTotal}`
            : 'CHECKLIST';
        
        const tr = document.createElement('tr');
        const statusPagamentoClass = l.pago ? 'locacao-action-pay-paid' : 'locacao-action-pay-open';
        const statusPagamentoLabel = l.pago ? 'Marcar como pendente' : 'Marcar como pago';
        tr.setAttribute('data-locacao-id', String(l.id));
        tr.className = `locacao-row locacao-row--${statusVisual}`;
        tr.innerHTML = `
            <td>
                <div class="locacao-cell-main">${nomeCliente}</div>
                <div class="locacao-cell-meta">#${l.id.toString().slice(-4)}</div>
                ${origemPropostaHtml}
            </td>
            <td>
                <div class="locacao-period-main">${formatarData(l.dataAluguel)}</div>
                <div class="locacao-period-meta">Até ${formatarData(l.dataDevolucaoPrevisao)}</div>
            </td>
            <td>
                <div class="locacao-cell-main">R$ ${l.valorTotal.toFixed(2)}</div>
                ${l.pago ? '<span class="badge badge-success">PAGO</span>' : '<span class="badge badge-warning">PENDENTE</span>'}
            </td>
            <td>
                <span class="badge-row">
                    <span class="badge ${badgeClass}">${statusLabel}</span>
                    ${l.devolucaoParcial ? '<span class="badge badge-warning">PARCIAL</span>' : ''}
                    ${checklistGerado ? `<span class="badge badge-info">${checklistBadgeTexto}</span>` : ''}
                </span>
            </td>
            <td class="col-actions">
                <div class="actions-cell locacao-actions">
                <button class="btn btn-sm table-action-btn locacao-action-btn ${statusPagamentoClass}" data-acesso="admin" title="${statusPagamentoLabel}" aria-label="${statusPagamentoLabel}" data-action="alternarPagamento" data-arg="${l.id}">
                    <i class="bi bi-currency-dollar"></i>
                </button>
                <button class="btn btn-sm table-action-btn locacao-action-btn locacao-action-whats" title="Enviar WhatsApp" aria-label="Enviar WhatsApp" data-action="enviarZap" data-arg="${l.id}">
                    <i class="bi bi-whatsapp"></i>
                </button>
                <button class="btn btn-sm table-action-btn locacao-action-btn locacao-action-romaneio" title="Gerar romaneio" aria-label="Gerar romaneio" data-action="gerarRomaneio" data-arg="${l.id}">
                    <i class="bi bi-truck"></i>
                </button>
                <button class="btn btn-sm table-action-btn locacao-action-btn locacao-action-checklist" title="${checklistTitulo}" aria-label="${checklistTitulo}" data-action="gerarChecklistDaLocacao" data-arg="${l.id}">
                    <i class="bi bi-clipboard-check"></i>
                </button>
                <button class="btn btn-sm table-action-btn locacao-action-btn locacao-action-relatorio" title="Abrir relatório" aria-label="Abrir relatório" data-action="gerarRelatorio" data-arg="${l.id}">
                    <i class="bi bi-file-text"></i>
                </button>
                <button class="btn btn-sm table-action-btn locacao-action-btn locacao-action-history" title="Ver histórico da locação" aria-label="Ver histórico da locação" data-action="abrirHistoricoLocacao" data-arg="${l.id}">
                    <i class="bi bi-clock-history"></i>
                </button>
                ${(l.statusVisual !== 'devolvido' && l.statusVisual !== 'cancelado') ? `<button class="btn btn-sm btn-danger table-action-btn locacao-action-btn" data-acesso="admin" title="Cancelar locação" aria-label="Cancelar locação" data-action="cancelarLocacao" data-arg="${l.id}"><i class="bi bi-trash"></i></button>` : ''}
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment); // 🚀 1 reflow ao invés de 50+
    
    criarControlesPaginacao('locacoes', totalPaginas, filtrados.length);
    if (typeof aplicarPermissoesInterface === 'function') aplicarPermissoesInterface();
}
        
// === CRIAR BOTÕES DE PAGINAÇÃO ===
function criarControlesPaginacao(tipo, totalPaginas, totalItens) {
    if (totalPaginas <= 1) return; // Não precisa de paginação
    
    const tbody = document.getElementById(`tbl${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
    if (!tbody) return;
    
    const paginaAtualTipo = paginaAtual[tipo];
    
    const controles = `
        <tr class="table-pagination-row">
            <td colspan="10" class="table-pagination-cell">
                <div class="table-pagination">
                    <button class="btn btn-sm btn-secondary" data-action="irParaPagina" data-arg="${tipo}" data-arg2="${paginaAtualTipo - 1}" ${paginaAtualTipo === 1 ? 'disabled' : ''}>
                        <i class="bi bi-chevron-left"></i> Anterior
                    </button>
                    <span class="table-pagination-info">
                        Página ${paginaAtualTipo} de ${totalPaginas}
                        <span class="table-pagination-meta">(${totalItens} itens)</span>
                    </span>
                    <button class="btn btn-sm btn-secondary" data-action="irParaPagina" data-arg="${tipo}" data-arg2="${paginaAtualTipo + 1}" ${paginaAtualTipo === totalPaginas ? 'disabled' : ''}>
                        Próxima <i class="bi bi-chevron-right"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    
    tbody.insertAdjacentHTML('beforeend', controles);
}

// === NAVEGAÇÃO DE PÁGINAS ===
function irParaPagina(tipo, novaPagina) {
    paginaAtual[tipo] = novaPagina;
    
    if (tipo === 'locacoes') renderLocacoes();
    if (tipo === 'pecas') renderEstoque();
    if (tipo === 'locadores') renderLocadores();
}
