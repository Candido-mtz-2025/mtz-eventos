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

    const marcado = (window.estoqueSelecionados && window.estoqueSelecionados.has(p.id)) ? 'checked' : '';

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
