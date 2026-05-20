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
    const termoSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(termoRaw) : termoRaw;
    tbody.innerHTML = typeof criarLinhaTabelaVazia === 'function'
      ? criarLinhaTabelaVazia(8, `Nenhum item encontrado para "${termoSeguro}".`)
      : `<tr class="table-empty-row"><td colspan="8">Nenhum item encontrado para "${termoSeguro}".</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  itensFiltrados.forEach(p => {
    const tipo = tipos.find(x => x.id === p.tipoId);
    const fotoSegura = typeof sanitizarImagemURL === 'function' ? sanitizarImagemURL(p.foto) : (p.foto || '');
    const codigoSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(p.codigo || '') : (p.codigo || '');
    const tipoSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(tipo ? tipo.nome : '-') : (tipo ? tipo.nome : '-');
    const nomeSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(p.nome || '') : (p.nome || '');
    const medidaSegura = typeof sanitizarTexto === 'function' ? sanitizarTexto(p.medida || '') : (p.medida || '');

    const thumb = fotoSegura
      ? `<img src="${fotoSegura}" class="table-thumb-img">`
      : `<div class="table-thumb-fallback"><i class="bi bi-box"></i></div>`;

    const statusEstoqueClass =
      p.disponivel === 0 ? 'stock-critical' :
      p.disponivel <= 3 ? 'stock-warning' : 'stock-ok';

    const marcado = (window.estoqueSelecionados && window.estoqueSelecionados.has(p.id)) ? 'checked' : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="table-select-col">
        <input class="chk-estoque" type="checkbox" data-id="${p.id}" ${marcado}
               data-change="onSelectEstoque" data-arg="${p.id}" data-arg2="__checked__">
      </td>
      <td>${thumb}</td>
      <td><span class="table-code">${codigoSeguro}</span></td>
      <td>${tipoSeguro}</td>
      <td>
        <div class="table-cell-title">${nomeSeguro}</div>
        <div class="table-cell-sub">${medidaSegura || '-'}</div>
      </td>
      <td>R$ ${Number(p.valor || 0).toFixed(2)}</td>
      <td>
        <span class="stock-pill ${statusEstoqueClass}">${p.disponivel}</span>
        <span class="table-cell-muted">/ ${p.quantidade}</span>
      </td>
      <td class="col-actions">
        <div class="actions-cell">
          <button class="btn btn-sm btn-info" data-acesso="admin" data-action="abrirEditarPeca" data-arg="${p.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-danger" data-acesso="admin" data-action="removerItem" data-arg="pecas" data-arg2="${p.id}"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    `;

    fragment.appendChild(tr);
  });

  tbody.innerHTML = '';
  tbody.appendChild(fragment);
  if (typeof aplicarPermissoesInterface === 'function') aplicarPermissoesInterface();
}
