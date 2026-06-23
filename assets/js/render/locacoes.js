// 🔥 RENDERIZAR LOCAÇÕES OTIMIZADA
// ========================================
function renderLocacoes() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const tbody = DOM.get('tblLocacoes');
    if (!tbody) return;
    
    // Processar dados
    const lista = locacoes.map(l => {
        let dataD = l.dataDevolucaoPrevisao ? new Date(l.dataDevolucaoPrevisao) : null;
        let st = l.status;
        if (l.status === 'ativo' && dataD && dataD < hoje) st = 'atrasado';
        
        let total = 0;
        (l.items || []).forEach(i => total += (parseFloat(i.valor) || 0) * (parseInt(i.quantidade) || 1));
        let div = parseFloat(l.divisorFatura) || 1;
        if (div <= 0) div = 1;
        
        return { ...l, statusVisual: st, valorTotal: total / div, pago: l.pago || false };
    });
    
    const filtrados = lista.filter(l => filtroAtual === 'todos' || l.statusVisual === filtroAtual);
    filtrados.sort((a, b) => b.id - a.id);
    
    // Paginação
    const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA);
    const inicio = (paginaAtual.locacoes - 1) * ITENS_POR_PAGINA;
    const itensPagina = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA);
    
    if (itensPagina.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; opacity:0.6;">Nenhum registro.</td></tr>';
        return;
    }
    
    // 🔥 OTIMIZAÇÃO: DocumentFragment (1 reflow)
    const fragment = document.createDocumentFragment();
    
    itensPagina.forEach(l => {
     const c = locadores.find(x => x.id === l.locadorId);
        let badgeClass = l.statusVisual === 'atrasado' ? 'badge-danger' : 
                        l.statusVisual === 'devolvido' ? 'badge-info' : 'badge-success';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:600">${c ? c.nome : 'Removido'}</div>
                <div style="font-size:0.75rem; opacity:0.7;">#${l.id.toString().slice(-4)}</div>
            </td>
            <td>
                <div style="font-size:0.85rem">${formatarData(l.dataAluguel)}</div>
                <div style="font-size:0.85rem; font-weight:600;">Até ${formatarData(l.dataDevolucaoPrevisao)}</div>
            </td>
            <td>
                <div style="font-weight:700">R$ ${l.valorTotal.toFixed(2)}</div>
                ${l.pago ? '<span class="badge badge-success">PAGO</span>' : '<span class="badge badge-warning">PENDENTE</span>'}
            </td>
            <td><span class="badge ${badgeClass}">${l.statusVisual}</span></td>
            <td class="col-actions">
                <div class="actions-cell">
                    <button class="btn btn-sm" style="${l.pago ? 'background:var(--border); color:var(--text-light)' : 'background:#10b981; color:white'}" onclick="alternarPagamento(${l.id})">
                        <i class="bi bi-currency-dollar"></i>
                    </button>
                    <button class="btn btn-sm" style="background:#25D366; color:white" onclick="enviarZap(${l.id})">
                        <i class="bi bi-whatsapp"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" style="color:white" onclick="gerarRomaneio(${l.id})">
                        <i class="bi bi-truck"></i>
                    </button>
                    <button class="btn btn-sm btn-info" onclick="gerarRelatorio(${l.id})">
                        <i class="bi bi-file-text"></i>
                    </button>
                    ${l.status !== 'devolvido' ? `<button class="btn btn-sm btn-danger" onclick="cancelarLocacao(${l.id})"><i class="bi bi-trash"></i></button>` : ''}
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment); // 🚀 1 reflow ao invés de 50+
    
    criarControlesPaginacao('locacoes', totalPaginas, filtrados.length);
}
        
// === CRIAR BOTÕES DE PAGINAÇÃO ===
function criarControlesPaginacao(tipo, totalPaginas, totalItens) {
    if (totalPaginas <= 1) return; // Não precisa de paginação
    
    const tbody = document.getElementById(`tbl${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
    if (!tbody) return;
    
    const paginaAtualTipo = paginaAtual[tipo];
    
    const controles = `
        <tr style="background: var(--surface-hover);">
            <td colspan="10" style="text-align: center; padding: 15px;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <button class="btn btn-sm btn-secondary" onclick="irParaPagina('${tipo}', ${paginaAtualTipo - 1})" ${paginaAtualTipo === 1 ? 'disabled' : ''}>
                        <i class="bi bi-chevron-left"></i> Anterior
                    </button>
                    <span style="font-weight: 600; color: var(--text);">
                        Página ${paginaAtualTipo} de ${totalPaginas} 
                        <span style="opacity: 0.6; font-size: 0.85rem;">(${totalItens} itens)</span>
                    </span>
                    <button class="btn btn-sm btn-secondary" onclick="irParaPagina('${tipo}', ${paginaAtualTipo + 1})" ${paginaAtualTipo === totalPaginas ? 'disabled' : ''}>
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
