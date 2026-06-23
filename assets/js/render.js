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

// --- RENDERIZAR ESTOQUE (COM ORDEM ALFABÉTICA) ---
function renderEstoque() {
  const termoRaw = DOM.get('buscaEstoque')?.value || '';
  
  const normalizar = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  
  const termo = normalizar(termoRaw);
  const tbody = DOM.get('tblEstoque');
  if (!tbody) return;

  let itensFiltrados = pecas.filter(p => {
    const nome = normalizar(p.nome || '');
    const codigo = normalizar(p.codigo || '');
    const medida = normalizar(p.medida || '');
    const tipo = tipos.find(t => t.id === p.tipoId);
    const categoria = tipo ? normalizar(tipo.nome) : '';

    return nome.includes(termo) || 
           codigo.includes(termo) || 
           categoria.includes(termo) ||
           medida.includes(termo);
  });

  // --- PARTE NOVA: ORDENAÇÃO ---
  itensFiltrados.sort((a, b) => {
      const tipoA = tipos.find(t => t.id === a.tipoId)?.nome || "ZZZ"; 
      const tipoB = tipos.find(t => t.id === b.tipoId)?.nome || "ZZZ";

      // 1. Compara Categorias
      const comparacaoCategoria = tipoA.localeCompare(tipoB, undefined, {numeric: true});
      if (comparacaoCategoria !== 0) return comparacaoCategoria;

      // 2. Compara Nomes (se for mesma categoria)
      return (a.nome || "").localeCompare(b.nome || "", undefined, {numeric: true});
  });
  // -----------------------------

  if (itensFiltrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; opacity:0.6;">Nenhum item encontrado para "${termoRaw}".</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  itensFiltrados.forEach(p => {
    const tipo = tipos.find(x => x.id === p.tipoId);

    const thumb = p.foto
      ? `<img src="${p.foto}" style="width:36px; height:36px; object-fit:cover; border-radius:6px;">`
      : `<div style="width:36px; height:36px; background:var(--border); border-radius:6px; display:flex; align-items:center; justify-content:center;"><i class="bi bi-box" style="opacity:0.5;"></i></div>`;

    let corEstoque =
      p.disponivel === 0 ? 'color:#ef4444; font-weight:bold;' :
      p.disponivel <= 3 ? 'color:#f59e0b; font-weight:bold;' : '';

    const marcado = (typeof estoqueSelecionados !== 'undefined' && estoqueSelecionados.has(p.id)) ? 'checked' : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="width:40px;">
        <input class="chk-estoque" type="checkbox" data-id="${p.id}" ${marcado}
               onchange="onSelectEstoque(${p.id}, this.checked)">
      </td>
      <td>${thumb}</td>
      <td><span style="font-family:monospace; font-weight:600; color:var(--text-light);">${p.codigo}</span></td>
      <td>${tipo ? tipo.nome : '-'}</td>
      <td>
        <div style="font-weight:600">${p.nome}</div>
        <div style="font-size:0.75rem; opacity:0.7;">${p.medida || ''}</div>
      </td>
      <td>R$ ${Number(p.valor || 0).toFixed(2)}</td>
      <td>
        <span style="${corEstoque}">${p.disponivel}</span>
        <span style="opacity:0.5; font-size:0.75rem;">/ ${p.quantidade}</span>
      </td>
      <td class="col-actions">
        <div class="actions-cell">
          <button class="btn btn-sm btn-info" onclick="abrirEditarPeca(${p.id})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-danger" onclick="removerItem('pecas', ${p.id})"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    `;

    fragment.appendChild(tr);
  });

  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}

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

    function renderStats() {
        const elC = document.getElementById('dashClientes');
        if(elC) elC.innerText = locadores.length;
        const ativas = locacoes.filter(l => l.status === 'ativo');
        const elL = document.getElementById('dashLocacoes'); if(elL) elL.innerText = ativas.length;
        let totalRecebido = 0, totalPendente = 0;
        ativas.forEach(loc => {
            let subtotal = 0; (loc.items || []).forEach(i => subtotal += (parseFloat(i.valor||0) * parseInt(i.quantidade||1)));
            let div = parseFloat(loc.divisorFatura || 1); if(div <= 0) div = 1;
            let vf = subtotal / div;
            if (loc.pago) totalRecebido += vf; else totalPendente += vf;
        });
        const elF = document.getElementById('dashFaturamento');
        if(elF) elF.innerHTML = `<span style="color:var(--primary)">R$ ${totalRecebido.toLocaleString('pt-BR',{minimumFractionDigits:0})}</span><br><span style="font-size:0.8rem; color:var(--text-light); font-weight:400;">+ R$ ${totalPendente.toLocaleString('pt-BR',{minimumFractionDigits:0})} pendente</span>`;
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        let atrasados = 0;
        let proximas = [];
        ativas.forEach(loc => {
            if(loc.dataDevolucaoPrevisao) {
                const d = new Date(loc.dataDevolucaoPrevisao); d.setHours(0,0,0,0);
                if (d < hoje) atrasados++;
                if (d >= hoje) proximas.push({ data: d, cliente: locadores.find(c => c.id === loc.locadorId)?.nome || '?' });
            }
        });
        const elA = document.getElementById('dashAtrasos'); if(elA) { elA.innerText = atrasados; elA.style.color = atrasados > 0 ? '#ef4444' : 'var(--text)'; }
        
        proximas.sort((a,b) => a.data - b.data);
        const tblDash = document.getElementById('tblDashDevolucoes');
        if(tblDash) {
            if(!proximas.length) tblDash.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; opacity:0.6;">Nada previsto.</td></tr>';
            else tblDash.innerHTML = proximas.slice(0, 5).map(p => `<tr><td>${p.data.toLocaleDateString('pt-BR')}</td><td>${p.cliente}</td><td style="text-align:center"><span class="badge badge-info">AGENDADO</span></td></tr>`).join('');
        }
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

