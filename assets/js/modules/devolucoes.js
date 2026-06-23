// --- OUTROS ---
    function carregarItensDevolucao() { 
        const id = document.getElementById('devLocacao').value; const div = document.getElementById('divItensDevolucao'); 
        div.innerHTML = ""; if(!id) return; const l = locacoes.find(x => x.id == id); if(!l) return;
        div.innerHTML = l.items.map((item) => `<div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid var(--border);"><span>${item.nome} (${item.quantidade})</span> <span class="badge badge-success">OK</span></div>`).join('');
    }
    function confirmarDevolucao() { 
    const id = document.getElementById('devLocacao').value;
    if(!id) return alert("Selecione!");
    
    const l = locacoes.find(x => x.id == id);
    l.status = 'devolvido';
    
    devolucoes.push({ 
        id: Date.now(), 
        locacaoId: l.id, 
        dataDevolucao: document.getElementById('devData').value, 
        obs: 'Total' 
    });
    
    salvarLocal();
    renderTudo();
    sincronizar('salvar');
    
    // Registra no log de auditoria
    const cliente = locadores.find(x => x.id === l.locadorId);
    registrarLog('devolucao', 'criar', `Devolução registrada: ${cliente?.nome || 'Cliente'}`);
    
    mostrarToast("Baixa confirmada!");
}
