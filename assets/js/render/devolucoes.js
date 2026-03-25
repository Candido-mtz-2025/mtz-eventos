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
        return `<tr> 
            <td><div style="font-weight:600;">${c ? c.nome : 'Removido'}</div></td> 
            <td>${formatarData(d.dataDevolucao)}</td> 
            <td><span class="badge badge-success">Concluído</span></td> 
            <td class="col-actions"> 
                <button class="btn btn-sm btn-secondary" onclick="gerarRecibo(${l ? l.id : 0})"> 
                    <i class="bi bi-printer"></i> 
                </button> 
            </td> 
        </tr>`; 
    }).join(''); 
}
