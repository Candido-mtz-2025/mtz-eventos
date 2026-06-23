function registrarLog(tipo, acao, descricao, dados = null) {
    const log = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        data: new Date().toLocaleString('pt-BR'),
        tipo: tipo,        // 'cliente', 'item', 'locacao', 'devolucao', 'config', 'sistema'
        acao: acao,        // 'criar', 'editar', 'deletar', 'visualizar', 'exportar'
        descricao: descricao,
        usuario: localStorage.getItem('usuarioEmail') || 'Offline',
        dados: dados       // Dados relevantes da ação
    };
    
    logsAuditoria.unshift(log); // Adiciona no início
    
    // Limita a 1000 logs (mantém últimos 3 meses aprox.)
    if (logsAuditoria.length > 1000) {
        logsAuditoria = logsAuditoria.slice(0, 1000);
    }
    
    console.log('📝 LOG:', log.tipo, '→', log.acao, '→', log.descricao);
}

/**
 * Limpa logs antigos (mais de 90 dias)
 */
function limparLogsAntigos() {
    const treseMesesAtras = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const qtdAntes = logsAuditoria.length;
    
    logsAuditoria = logsAuditoria.filter(log => log.id > treseMesesAtras);
    
    const removidos = qtdAntes - logsAuditoria.length;
    if (removidos > 0) {
        console.log(`🗑️ ${removidos} logs antigos removidos`);
        registrarLog('sistema', 'limpeza', `${removidos} logs antigos removidos`);
    }
    
    salvarLocal();
}

/**
 * Exporta logs como CSV
 */
function exportarLogsCSV() {
    if (logsAuditoria.length === 0) {
        mostrarToast('Nenhum log para exportar!', 'erro');
        return;
    }
    
    let csv = 'Data,Hora,Tipo,Ação,Descrição,Usuário\n';
    
    logsAuditoria.forEach(log => {
        const data = new Date(log.timestamp);
        const dataStr = data.toLocaleDateString('pt-BR');
        const horaStr = data.toLocaleTimeString('pt-BR');
        
        csv += `"${dataStr}","${horaStr}","${log.tipo}","${log.acao}","${log.descricao}","${log.usuario}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MTZ-Auditoria-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    registrarLog('sistema', 'exportar', 'Logs de auditoria exportados');
    mostrarToast('Logs exportados com sucesso!');
}

/**
 * Renderiza a tabela de logs
 */
function renderLogs(filtro = 'todos') {
  const tbody = document.getElementById('tblLogs');
  if (!tbody) return;

  // (opcional) ativa botão
  document.querySelectorAll('.audit-filter').forEach(b => b.classList.remove('active'));
  const btnAtivo = document.querySelector(`.audit-filter[data-filter="${filtro}"]`);
  if (btnAtivo) btnAtivo.classList.add('active');

  let logsFiltrados = logsAuditoria;
  if (filtro !== 'todos') {
    logsFiltrados = logsAuditoria.filter(log => log.tipo === filtro);
  }
    const icones = {
        'cliente': 'bi-person',
        'item': 'bi-box',
        'locacao': 'bi-cart',
        'devolucao': 'bi-arrow-return-left',
        'config': 'bi-gear',
        'sistema': 'bi-cpu'
    };
    
    const cores = {
        'criar': '#10b981',
        'editar': '#f59e0b',
        'deletar': '#ef4444',
        'visualizar': '#0ea5e9',
        'exportar': '#8b5cf6'
    };
    
    tbody.innerHTML = logsFiltrados.slice(0, 100).map(log => {
        const data = new Date(log.timestamp);
        const dataStr = data.toLocaleDateString('pt-BR');
        const horaStr = data.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
        
        return `
            <tr>
                <td>
                    <div style="font-size:0.85rem; line-height:1.4">${dataStr}</div>
                    <div style="font-size:0.75rem; opacity:0.7">${horaStr}</div>
                </td>
                <td>
                    <i class="bi ${icones[log.tipo] || 'bi-circle'}" style="color:var(--primary); margin-right:4px"></i>
                    <span style="font-size:0.85rem">${log.tipo}</span>
                </td>
                <td>
                    <span style="color:${cores[log.acao]}; font-weight:600; font-size:0.85rem">${log.acao}</span>
                </td>
                <td style="max-width:400px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                    ${log.descricao}
                </td>
                <td style="font-size:0.85rem; opacity:0.8">${log.usuario}</td>
            </tr>
        `;
    }).join('');
}
