// Renderizações de clientes, tipos e configurações
    // ========================================
// 🔥 RENDERIZAR LOCADORES OTIMIZADA
// ========================================
function renderLocadores() {
    const termoRaw = String(DOM.get('buscaCliente')?.value || '').trim();
    const termo = termoRaw.toLowerCase();
    const tbody = DOM.get('tblLocadores');
    if (!tbody) return;
    
    const clientesFiltrados = locadores.filter(c => 
        String(c.nome || '').toLowerCase().includes(termo) || 
        String(c.documento || '').toLowerCase().includes(termo)
    );
    
    if (clientesFiltrados.length === 0) {
        const termoSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(termoRaw) : termoRaw;
        const mensagem = termoRaw
            ? `Nenhum cliente combina com "${termoSeguro}".`
            : 'Cadastre o primeiro cliente para começar.';

        tbody.innerHTML = typeof criarLinhaTabelaEstado === 'function'
            ? criarLinhaTabelaEstado(4, {
                tipo: 'empty',
                titulo: 'Sem clientes para mostrar',
                mensagem: termoRaw
                    ? `Nenhum cliente combina com "${termoRaw}".`
                    : 'Cadastre o primeiro cliente para começar.'
            })
            : `<tr class="table-empty-row"><td colspan="4">${mensagem}</td></tr>`;
        return;
    }
    
    // 🔥 OTIMIZAÇÃO: DocumentFragment
    const fragment = document.createDocumentFragment();
    
    clientesFiltrados.forEach((c) => {
        const nome = typeof sanitizarTexto === 'function' ? sanitizarTexto(c.nome || '') : (c.nome || '');
        const documento = typeof sanitizarTexto === 'function' ? sanitizarTexto(c.documento || '') : (c.documento || '');
        const email = typeof sanitizarTexto === 'function' ? sanitizarTexto(c.email || '-') : (c.email || '-');
        const telefone = typeof sanitizarTexto === 'function' ? sanitizarTexto(c.telefone || '-') : (c.telefone || '-');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="table-cell-title">${nome}</div>
                <div class="table-cell-sub">${documento || 'Sem documento'}</div>
            </td>
            <td>${email}</td>
            <td>${telefone}</td>
            <td class="col-actions">
                <div class="actions-cell">
                    <button class="btn btn-sm btn-info" data-action="abrirEditarLocador" data-arg="${c.id}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" data-action="gerarRelatorioAnual" data-arg="${c.id}">
                        <i class="bi bi-file-text"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" data-acesso="admin" data-action="removerItem" data-arg="locadores" data-arg2="${c.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
    if (typeof aplicarPermissoesInterface === 'function') aplicarPermissoesInterface();
}

// --- TIPOS (RECOLOCAR) ---
function renderTipos() {
    const tbody = document.getElementById('tblTipos');
    if(!tbody) return;

    if (!tipos.length) {
        tbody.innerHTML = typeof criarLinhaTabelaEstado === 'function'
            ? criarLinhaTabelaEstado(3, {
                tipo: 'empty',
                titulo: 'Nenhum tipo cadastrado',
                mensagem: 'Cadastre um tipo para organizar o estoque.'
            })
            : '<tr class="table-empty-row"><td colspan="3">Nenhum tipo cadastrado.</td></tr>';
        return;
    }
    
    tbody.innerHTML = tipos.map((t) => {
        const nome = typeof sanitizarTexto === 'function' ? sanitizarTexto(t.nome || '') : (t.nome || '');
        const desc = typeof sanitizarTexto === 'function' ? sanitizarTexto(t.desc || '-') : (t.desc || '-');
        return `
        <tr>
            <td><b>${nome}</b></td>
            <td>${desc}</td>
            <td class="col-actions">
                <div class="actions-cell">
                    <button class="btn btn-sm btn-info" data-action="abrirEditarTipo" data-arg="${t.id}">
                        <i class="bi bi-pencil"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

   // --- ATUALIZAR LISTAS (CORRIGIDO: SEM LISTA DE PEÇAS GIGANTE) ---
    function updateSelects() { 
        // 1. Clientes
        const c = document.getElementById('aluguelCliente');
        if(c) c.innerHTML='<option value="">Selecione...</option>'+locadores.map((x) => {
            const nome = typeof sanitizarTexto === 'function' ? sanitizarTexto(x.nome || '') : (x.nome || '');
            return `<option value="${x.id}">${nome}</option>`;
        }).join(''); 
        
        // 2. PEÇAS: REMOVIDO! (Agora usamos busca inteligente)
        
        // 3. Devoluções
        const d = document.getElementById('devLocacao');
        if(d) d.innerHTML='<option value="">Selecione...</option>'+locacoes.filter(l=>l.status!=='devolvido').map((l) => {
            const nomeBruto = locadores.find((x) => x.id == l.locadorId)?.nome || 'Cliente';
            const nome = typeof sanitizarTexto === 'function' ? sanitizarTexto(nomeBruto) : nomeBruto;
            return `<option value="${l.id}">#${l.id.toString().slice(-4)} - ${nome}</option>`;
        }).join(''); 
        
        // 4. Tipos
        const tOpts = '<option value="0">Geral</option>'+tipos.map((x) => {
            const nome = typeof sanitizarTexto === 'function' ? sanitizarTexto(x.nome || '') : (x.nome || '');
            return `<option value="${x.id}">${nome}</option>`;
        }).join('');
        const t = document.getElementById('pecaTipo'); if(t) t.innerHTML=tOpts;
        const tE = document.getElementById('editPecaTipo'); if(tE) tE.innerHTML=tOpts;
    } 

function renderConfig() {
    // Preenche os inputs com os dados da memória
    const elRodape = document.getElementById('confRodape');
    const elTel = document.getElementById('confTel');
    const elEmail = document.getElementById('confEmail');
    const elEmailsPermitidos = document.getElementById('confEmailsPermitidos');
    const elAdminEmails = document.getElementById('confAdminEmails');
    const elLogo = document.getElementById('previewLogo');

    if (elRodape) elRodape.value = config.rodape || '';
    if (elTel) elTel.value = config.tel || '';
    if (elEmail) elEmail.value = config.email || '';
    if (elEmailsPermitidos) elEmailsPermitidos.value = config.emailsPermitidos || '';
    if (elAdminEmails) elAdminEmails.value = config.adminEmails || '';
    
    // Mostra a logo se existir
    if (elLogo && config.logo) {
        const logoURL = typeof sanitizarImagemURL === 'function' ? sanitizarImagemURL(config.logo) : config.logo;
        if (logoURL) {
            elLogo.innerHTML = `<img src="${logoURL}" style="height:50px; border:1px solid #ccc; padding:2px; border-radius:4px;">`;
        } else {
            elLogo.innerHTML = '';
        }
    }
}
