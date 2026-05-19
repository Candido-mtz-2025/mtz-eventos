function renderDevolucoes() {
    // 1. Verifica se o elemento existe
    const tbody = document.getElementById('tblDevolucoes'); 
    if(!tbody) return; 

    // 2. Verifica se o array existe
    if(!Array.isArray(devolucoes)) { 
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Dados não carregados</td></tr>'; 
        return; 
    } 

    // 3. Pega as últimas 20 devoluções
    const lista = devolucoes.slice().reverse().slice(0, 20); 

    // 4. Se estiver vazio, mostra mensagem
    if (lista.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; opacity:0.6;">Nenhuma devolução registrada.</td></tr>`; 
        return; 
    } 

    // 5. Renderiza as linhas
    tbody.innerHTML = lista.map(d => { 
        const l = locacoes.find(x => x.id === d.locacaoId); 
        const c = locadores.find(x => x.id === (l ? l.locadorId : 0)); 
        const tipo = d.tipo === 'parcial' ? 'Parcial' : 'Concluído';
        const badge = d.tipo === 'parcial' ? 'badge-warning' : 'badge-success';
        const qtd = Array.isArray(d.itens)
            ? d.itens.reduce((total, item) => total + (parseInt(item.quantidadeDevolvida) || 0), 0)
            : '';

        return `<tr> 
            <td>
                <div style="font-weight:600;">${c ? c.nome : 'Removido'}</div>
                <div style="font-size:0.75rem; opacity:0.7;">#${l ? l.id.toString().slice(-4) : '----'} ${qtd ? `| ${qtd} item(ns)` : ''}</div>
            </td>
            <td>${formatarData(d.dataDevolucao)}</td> 
            <td><span class="badge ${badge}">${tipo}</span></td>
            <td class="col-actions"> 
                <button class="btn btn-sm btn-secondary" onclick="gerarReciboDevolucao(${d.id})">
                    <i class="bi bi-printer"></i> 
                </button> 
            </td> 
        </tr>`; 
    }).join(''); 
}
