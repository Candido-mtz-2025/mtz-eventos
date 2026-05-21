// 🔥 RENDERIZAR LOCAÇÕES OTIMIZADA
// ========================================
function atualizarFiltroVisualLocacoes() {
    const botoes = document.querySelectorAll('#tab-locacoes .filters-row [data-filtro]');
    botoes.forEach((btn) => {
        const ativo = btn.getAttribute('data-filtro') === filtroAtual;
        btn.classList.toggle('is-active', ativo);
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
        if (!l.pago && l.statusVisual !== 'devolvido') return acc + (Number(l.valorTotal) || 0);
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

function renderLocacoes() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const tbody = DOM.get('tblLocacoes');
    if (!tbody) return;
    atualizarFiltroVisualLocacoes();
    
    // Processar dados
    const lista = locacoes.map(l => {
        let dataD = l.dataDevolucaoPrevisao ? new Date(l.dataDevolucaoPrevisao) : null;
        let st = l.status;
        if (l.status === 'ativo' && dataD && dataD < hoje) st = 'atrasado';
        const qtdDevolvida = (l.items || []).reduce((total, item) => total + (parseInt(item.devolvidos) || 0), 0);
        const devolucaoParcial = l.status !== 'devolvido' && qtdDevolvida > 0;
        
        let total = 0;
        (l.items || []).forEach(i => total += (parseFloat(i.valor) || 0) * (parseInt(i.quantidade) || 1));
        let div = parseFloat(l.divisorFatura) || 1;
        if (div <= 0) div = 1;
        
        return { ...l, statusVisual: st, devolucaoParcial, valorTotal: total / div, pago: l.pago || false };
    });
    atualizarResumoExecutivoLocacoes(lista);
    
    const filtrados = lista.filter(l => filtroAtual === 'todos' || l.statusVisual === filtroAtual);
    filtrados.sort((a, b) => b.id - a.id);
    
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
                titulo: 'Sem devoluções no filtro',
                mensagem: 'Não há locações devolvidas para exibir agora.'
            }
        };
        const estadoAtual = mapaVazio[filtroAtual] || mapaVazio.todos;

        tbody.innerHTML = typeof criarLinhaTabelaEstado === 'function'
            ? criarLinhaTabelaEstado(5, {
                tipo: filtroAtual === 'atrasado' ? 'success' : 'empty',
                titulo: estadoAtual.titulo,
                mensagem: estadoAtual.mensagem
            })
            : `<tr class="table-empty-row"><td colspan="5">${estadoAtual.titulo}</td></tr>`;
        return;
    }
    
    // 🔥 OTIMIZAÇÃO: DocumentFragment (1 reflow)
    const fragment = document.createDocumentFragment();
    
    itensPagina.forEach((l) => {
        const c = locadores.find((x) => x.id === l.locadorId);
        const nomeCliente = typeof sanitizarTexto === 'function'
            ? sanitizarTexto(c ? c.nome : 'Removido')
            : (c ? c.nome : 'Removido');

        const statusVisual = l.statusVisual === 'atrasado'
            ? 'atrasado'
            : l.statusVisual === 'devolvido'
                ? 'devolvido'
                : 'ativo';

        const badgeClass = statusVisual === 'atrasado'
            ? 'badge-danger'
            : statusVisual === 'devolvido'
                ? 'badge-info'
                : 'badge-success';
        
        const tr = document.createElement('tr');
        const statusPagamentoClass = l.pago ? 'locacao-action-pay-paid' : 'locacao-action-pay-open';
        const statusPagamentoLabel = l.pago ? 'Marcar como pendente' : 'Marcar como pago';
        tr.className = `locacao-row locacao-row--${statusVisual}`;
        tr.innerHTML = `
            <td>
                <div class="locacao-cell-main">${nomeCliente}</div>
                <div class="locacao-cell-meta">#${l.id.toString().slice(-4)}</div>
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
                    <span class="badge ${badgeClass}">${statusVisual}</span>
                    ${l.devolucaoParcial ? '<span class="badge badge-warning">PARCIAL</span>' : ''}
                </span>
            </td>
            <td class="col-actions" style="min-width:188px;width:188px;white-space:nowrap;text-align:right;">
                <div style="display:inline-flex;align-items:center;justify-content:flex-end;gap:7px;white-space:nowrap;">
                <button style="display:inline-flex;width:36px;height:36px;min-height:36px;padding:0;align-items:center;justify-content:center;" class="btn btn-sm locacao-action-btn ${statusPagamentoClass}" data-acesso="admin" title="${statusPagamentoLabel}" data-action="alternarPagamento" data-arg="${l.id}">
                    <i class="bi bi-currency-dollar"></i>
                </button>
                <button style="display:inline-flex;width:36px;height:36px;min-height:36px;padding:0;align-items:center;justify-content:center;" class="btn btn-sm locacao-action-btn locacao-action-whats" title="Enviar WhatsApp" data-action="enviarZap" data-arg="${l.id}">
                    <i class="bi bi-whatsapp"></i>
                </button>
                <button style="display:inline-flex;width:36px;height:36px;min-height:36px;padding:0;align-items:center;justify-content:center;" class="btn btn-sm locacao-action-btn locacao-action-romaneio" title="Gerar romaneio" data-action="gerarRomaneio" data-arg="${l.id}">
                    <i class="bi bi-truck"></i>
                </button>
                <button style="display:inline-flex;width:36px;height:36px;min-height:36px;padding:0;align-items:center;justify-content:center;" class="btn btn-sm locacao-action-btn locacao-action-relatorio" title="Abrir relatório" data-action="gerarRelatorio" data-arg="${l.id}">
                    <i class="bi bi-file-text"></i>
                </button>
                ${l.status !== 'devolvido' ? `<button style="display:inline-flex;width:36px;height:36px;min-height:36px;padding:0;align-items:center;justify-content:center;" class="btn btn-sm btn-danger locacao-action-btn" data-acesso="admin" title="Cancelar locação" data-action="cancelarLocacao" data-arg="${l.id}"><i class="bi bi-trash"></i></button>` : ''}
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
