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
    if (typeof validarPermissao === 'function' && !validarPermissao('limpar_logs', 'Somente administrador pode limpar logs.')) {
        return;
    }

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
    
    const toCSV = (valor) => String(valor ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ');

    logsAuditoria.forEach(log => {
        const data = new Date(log.timestamp);
        const dataStr = data.toLocaleDateString('pt-BR');
        const horaStr = data.toLocaleTimeString('pt-BR');
        
        csv += `"${toCSV(dataStr)}","${toCSV(horaStr)}","${toCSV(log.tipo)}","${toCSV(log.acao)}","${toCSV(log.descricao)}","${toCSV(log.usuario)}"\n`;
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

    window.filtroLogAtual = filtro;

    document.querySelectorAll('.audit-filter').forEach((botao) => botao.classList.remove('active'));
    const btnAtivo = document.querySelector(`.audit-filter[data-filter="${filtro}"]`);
    if (btnAtivo) btnAtivo.classList.add('active');

    const termoBuscaRaw = (document.getElementById('auditBusca')?.value || '').trim();
    const termoBusca = termoBuscaRaw.toLowerCase();

    let logsFiltrados = logsAuditoria;
    if (filtro !== 'todos') {
        logsFiltrados = logsFiltrados.filter((log) => log.tipo === filtro);
    }

    if (termoBusca) {
        logsFiltrados = logsFiltrados.filter((log) => {
            const descricao = String(log.descricao || '').toLowerCase();
            const usuario = String(log.usuario || '').toLowerCase();
            const tipo = String(log.tipo || '').toLowerCase();
            const acao = String(log.acao || '').toLowerCase();
            return (
                descricao.includes(termoBusca) ||
                usuario.includes(termoBusca) ||
                tipo.includes(termoBusca) ||
                acao.includes(termoBusca)
            );
        });
    }

    if (typeof atualizarMetaBusca === 'function') {
        const rotulosFiltro = {
            todos: 'Todos',
            cliente: 'Clientes',
            item: 'Itens',
            locacao: 'Locacoes',
            devolucao: 'Devolucoes',
            sistema: 'Sistema'
        };
        atualizarMetaBusca('metaBuscaAuditoria', {
            total: Array.isArray(logsAuditoria) ? logsAuditoria.length : 0,
            filtrados: logsFiltrados.length,
            termo: termoBuscaRaw,
            rotulo: 'logs',
            filtro,
            filtroLabel: rotulosFiltro[filtro] || filtro
        });
    }

    const totalLogs = document.getElementById('totalLogs');
    if (totalLogs) totalLogs.textContent = String(logsAuditoria.length);

    const icones = {
        cliente: 'bi-person',
        item: 'bi-box',
        locacao: 'bi-cart',
        devolucao: 'bi-arrow-return-left',
        config: 'bi-gear',
        sistema: 'bi-cpu',
        checklist: 'bi-check2-square'
    };

    const cores = {
        criar: '#10b981',
        editar: '#f59e0b',
        deletar: '#ef4444',
        visualizar: '#0ea5e9',
        exportar: '#8b5cf6',
        parcial: '#f59e0b',
        limpeza: '#dc2626'
    };

    const lista = logsFiltrados.slice(0, 120);
    if (lista.length === 0) {
        tbody.innerHTML = typeof criarLinhaTabelaVazia === 'function'
            ? criarLinhaTabelaVazia(5, 'Nenhum log encontrado para este filtro.')
            : '<tr class="table-empty-row"><td colspan="5">Nenhum log encontrado para este filtro.</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map((log) => {
        const data = new Date(log.timestamp);
        const dataStr = data.toLocaleDateString('pt-BR');
        const horaStr = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const tipoSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(log.tipo || '') : (log.tipo || '');
        const acaoSegura = typeof sanitizarTexto === 'function' ? sanitizarTexto(log.acao || '') : (log.acao || '');
        const descricaoSegura = typeof sanitizarTexto === 'function' ? sanitizarTexto(log.descricao || '') : (log.descricao || '');
        const usuarioSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(log.usuario || '') : (log.usuario || '');
        const iconeSeguro = icones[log.tipo] || 'bi-circle';
        const corAcao = cores[log.acao] || 'var(--text)';

        return `
            <tr>
                <td>
                    <div class="table-cell-title">${dataStr}</div>
                    <div class="table-cell-sub">${horaStr}</div>
                </td>
                <td>
                    <span class="audit-type-label"><i class="bi ${iconeSeguro}"></i>${tipoSeguro}</span>
                </td>
                <td>
                    <span class="audit-action-label" style="--audit-action-color:${corAcao}">${acaoSegura}</span>
                </td>
                <td class="audit-description-cell">
                    ${descricaoSegura}
                </td>
                <td class="table-cell-muted">${usuarioSeguro}</td>
            </tr>
        `;
    }).join('');
}
