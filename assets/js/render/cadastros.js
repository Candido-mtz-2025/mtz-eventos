// Renderizações de clientes, tipos e configurações
    // ========================================
// 🔥 RENDERIZAR LOCADORES OTIMIZADA
// ========================================
function renderLocadores() {
    const termo = (DOM.get('buscaCliente')?.value || '').toLowerCase();
    const tbody = DOM.get('tblLocadores');
    if (!tbody) return;
    
    const clientesFiltrados = locadores.filter(c => 
        c.nome.toLowerCase().includes(termo) || 
        (c.documento && c.documento.toLowerCase().includes(termo))
    );
    
    if (clientesFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; opacity:0.6;">Nenhum cliente encontrado.</td></tr>';
        return;
    }
    
    // 🔥 OTIMIZAÇÃO: DocumentFragment
    const fragment = document.createDocumentFragment();
    
    clientesFiltrados.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:600">${c.nome}</div>
                <div style="font-size:0.75rem; opacity:0.7;">${c.documento || ''}</div>
            </td>
            <td>${c.email || '-'}</td>
            <td>${c.telefone || '-'}</td>
            <td class="col-actions">
                <div class="actions-cell">
                    <button class="btn btn-sm btn-info" onclick="abrirEditarLocador(${c.id})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="gerarRelatorioAnual(${c.id})">
                        <i class="bi bi-file-text"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="removerItem('locadores', ${c.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

// --- TIPOS (RECOLOCAR) ---
function renderTipos() {
    const tbody = document.getElementById('tblTipos');
    if(!tbody) return;
    
    tbody.innerHTML = tipos.map(t => `
        <tr>
            <td><b>${t.nome}</b></td>
            <td>${t.desc || '-'}</td>
            <td class="col-actions">
                <div class="actions-cell">
                    <button class="btn btn-sm btn-info" onclick="abrirEditarTipo(${t.id})">
                        <i class="bi bi-pencil"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

   // --- ATUALIZAR LISTAS (CORRIGIDO: SEM LISTA DE PEÇAS GIGANTE) ---
    function updateSelects() { 
        // 1. Clientes
        const c = document.getElementById('aluguelCliente');
        if(c) c.innerHTML='<option value="">Selecione...</option>'+locadores.map(x=>`<option value="${x.id}">${x.nome}</option>`).join(''); 
        
        // 2. PEÇAS: REMOVIDO! (Agora usamos busca inteligente)
        
        // 3. Devoluções
        const d = document.getElementById('devLocacao');
        if(d) d.innerHTML='<option value="">Selecione...</option>'+locacoes.filter(l=>l.status!=='devolvido').map(l=>`<option value="${l.id}">#${l.id.toString().slice(-4)} - ${locadores.find(x=>x.id==l.locadorId)?.nome}</option>`).join(''); 
        
        // 4. Tipos
        const tOpts = '<option value="0">Geral</option>'+tipos.map(x=>`<option value="${x.id}">${x.nome}</option>`).join('');
        const t = document.getElementById('pecaTipo'); if(t) t.innerHTML=tOpts;
        const tE = document.getElementById('editPecaTipo'); if(tE) tE.innerHTML=tOpts;
    } 

    function renderConfig() {
    // Preenche os inputs com os dados da memória
    const elRodape = document.getElementById('confRodape');
    const elTel = document.getElementById('confTel');
    const elEmail = document.getElementById('confEmail');
    const elLogo = document.getElementById('previewLogo');

    if (elRodape) elRodape.value = config.rodape || '';
    if (elTel) elTel.value = config.tel || '';
    if (elEmail) elEmail.value = config.email || '';
    
    // Mostra a logo se existir
    if (elLogo && config.logo) {
        elLogo.innerHTML = `<img src="${config.logo}" style="height:50px; border:1px solid #ccc; padding:2px; border-radius:4px;">`;
    }
}
