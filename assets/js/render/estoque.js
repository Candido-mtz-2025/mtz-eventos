// --- RENDERIZAR ESTOQUE (COM ORDEM ALFABÉTICA) ---
const FILTROS_RAPIDOS_ESTOQUE_VALIDOS = new Set(['todos', 'disponiveis', 'criticos', 'valor']);
let filtroRapidoEstoqueAtual = null;

function normalizarFiltroRapidoEstoque(valor) {
  const filtro = String(valor || '').trim().toLowerCase();
  return FILTROS_RAPIDOS_ESTOQUE_VALIDOS.has(filtro) ? filtro : 'todos';
}

function obterFiltroRapidoEstoqueAtual() {
  if (filtroRapidoEstoqueAtual != null) return filtroRapidoEstoqueAtual;
  try {
    filtroRapidoEstoqueAtual = normalizarFiltroRapidoEstoque(localStorage.getItem('mtz:estoqueFiltroRapido'));
  } catch (_) {
    filtroRapidoEstoqueAtual = 'todos';
  }
  return filtroRapidoEstoqueAtual;
}

function persistirFiltroRapidoEstoque(filtro) {
  try {
    localStorage.setItem('mtz:estoqueFiltroRapido', filtro);
  } catch (_) {
    // Falha de storage não deve bloquear o uso.
  }
}

function atualizarFiltroRapidoEstoqueVisual() {
  const atual = obterFiltroRapidoEstoqueAtual();
  const cards = document.querySelectorAll('#tab-estoque .estoque-kpi-card[data-filtro-estoque]');
  cards.forEach((card) => {
    const filtroCard = normalizarFiltroRapidoEstoque(card.dataset.filtroEstoque);
    const ativo = filtroCard === atual;
    card.classList.toggle('is-active', ativo);
    card.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  });
}

function itemAtendeFiltroRapidoEstoque(peca, filtro) {
  const disponivel = Math.max(Number(peca?.disponivel ?? 0), 0);
  const valor = Number(peca?.valor ?? 0);

  switch (filtro) {
    case 'disponiveis':
      return disponivel > 0;
    case 'criticos':
      return disponivel <= 3;
    case 'valor':
      return valor > 0;
    default:
      return true;
  }
}

function formatarMoedaResumoEstoque(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function atualizarResumoExecutivoEstoque() {
  const lista = Array.isArray(pecas) ? pecas : [];
  const resumo = typeof calcularResumoEstoqueDominio === 'function'
    ? calcularResumoEstoqueDominio(lista)
    : {
        totalItens: lista.length,
        totalDisponiveis: lista.reduce((acc, p) => acc + Math.max(Number(p.disponivel) || 0, 0), 0),
        totalCriticos: lista.filter((p) => (Number(p.disponivel) || 0) <= 3).length,
        valorEstoque: lista.reduce((acc, p) => {
          const valor = Number(p.valor) || 0;
          const disponivel = Math.max(Number(p.disponivel) || 0, 0);
          return acc + (valor * disponivel);
        }, 0)
      };

  const mapa = [
    ['estoqueKpiTotal', String(resumo.totalItens)],
    ['estoqueKpiDisponiveis', String(resumo.totalDisponiveis)],
    ['estoqueKpiCriticos', String(resumo.totalCriticos)],
    ['estoqueKpiValor', formatarMoedaResumoEstoque(resumo.valorEstoque)]
  ];

  mapa.forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  });
}

function renderEstoque() {
  const termoRaw = DOM.get('buscaEstoque')?.value || '';
  const filtroRapido = obterFiltroRapidoEstoqueAtual();
  
  const normalizar = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  
  const termo = normalizar(termoRaw);
  const tbody = DOM.get('tblEstoque');
  if (!tbody) return;
  atualizarResumoExecutivoEstoque();

  // Evita varreduras repetidas em `tipos.find(...)` durante filtro/sort/render.
  const mapaTiposNomePorId = new Map(
    (Array.isArray(tipos) ? tipos : []).map((tipo) => [String(tipo.id), tipo.nome || ''])
  );

  let itensFiltrados = pecas.filter((pecaOriginal) => {
    const p = typeof normalizarPecaDominio === 'function' ? normalizarPecaDominio(pecaOriginal) : pecaOriginal;
    const nome = normalizar(p?.nome || '');
    const codigo = normalizar(p?.codigo || '');
    const medida = normalizar(p?.medida || '');
    const nomeTipo = mapaTiposNomePorId.get(String(p?.tipoId)) || '';
    const categoria = nomeTipo ? normalizar(nomeTipo) : '';

    const atendeBusca = nome.includes(termo) || 
           codigo.includes(termo) || 
           categoria.includes(termo) ||
           medida.includes(termo);

    if (!atendeBusca) return false;
    return itemAtendeFiltroRapidoEstoque(p, filtroRapido);
  });

  if (typeof atualizarMetaBusca === 'function') {
    const rotulosFiltro = {
      todos: 'Todos',
      disponiveis: 'Disponíveis',
      criticos: 'Críticos',
      valor: 'Com valor'
    };
    atualizarMetaBusca('metaBuscaEstoque', {
      total: Array.isArray(pecas) ? pecas.length : 0,
      filtrados: itensFiltrados.length,
      termo: termoRaw,
      filtro: filtroRapido,
      filtroLabel: rotulosFiltro[filtroRapido] || 'Todos',
      rotulo: 'itens'
    });
  }
  atualizarFiltroRapidoEstoqueVisual();

  // --- PARTE NOVA: ORDENAÇÃO ---
  itensFiltrados.sort((a, b) => {
      const tipoA = mapaTiposNomePorId.get(String(a.tipoId)) || "ZZZ";
      const tipoB = mapaTiposNomePorId.get(String(b.tipoId)) || "ZZZ";

      // 1. Compara Categorias
      const comparacaoCategoria = tipoA.localeCompare(tipoB, undefined, {numeric: true});
      if (comparacaoCategoria !== 0) return comparacaoCategoria;

      // 2. Compara Nomes (se for mesma categoria)
      return (a.nome || "").localeCompare(b.nome || "", undefined, {numeric: true});
  });
  // -----------------------------

  if (itensFiltrados.length === 0) {
    const buscaAtiva = Boolean(String(termoRaw || '').trim());
    const termoSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(termoRaw) : termoRaw;
    const mensagemFallback = buscaAtiva
      ? `Nenhum item encontrado para "${termoSeguro}".`
      : 'Cadastre uma peça para iniciar o estoque.';

    tbody.innerHTML = typeof criarLinhaTabelaEstado === 'function'
      ? criarLinhaTabelaEstado(8, {
          tipo: 'empty',
          titulo: buscaAtiva ? 'Nenhum item encontrado' : 'Estoque vazio',
          mensagem: buscaAtiva
            ? `A busca por "${termoRaw}" não retornou itens.`
            : 'Cadastre uma peça para iniciar o estoque.'
      })
      : `<tr class="table-empty-row"><td colspan="8">${mensagemFallback}</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  itensFiltrados.forEach((pecaOriginal) => {
    const p = typeof normalizarPecaDominio === 'function' ? normalizarPecaDominio(pecaOriginal) : pecaOriginal;
    const nomeTipo = mapaTiposNomePorId.get(String(p.tipoId)) || '';
    const fotoSegura = typeof sanitizarImagemURL === 'function' ? sanitizarImagemURL(p.foto) : (p.foto || '');
    const codigoSeguro = typeof sanitizarTexto === 'function' ? sanitizarTexto(p.codigo || '') : (p.codigo || '');
    const tipoSeguro = typeof sanitizarTexto === 'function'
      ? sanitizarTexto(nomeTipo || '-')
      : (nomeTipo || '-');
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
    tr.setAttribute('data-peca-id', String(p.id));
    const classeLinha =
      p.disponivel === 0 ? 'estoque-row estoque-row--critical' :
      p.disponivel <= 3 ? 'estoque-row estoque-row--warning' :
      'estoque-row estoque-row--ok';
    tr.className = classeLinha;
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
          <button class="btn btn-sm btn-info table-action-btn" title="Editar item" aria-label="Editar item" data-acesso="admin" data-action="abrirEditarPeca" data-arg="${p.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-danger table-action-btn" title="Excluir item" aria-label="Excluir item" data-acesso="admin" data-action="removerItem" data-arg="pecas" data-arg2="${p.id}"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    `;

    fragment.appendChild(tr);
  });

  tbody.innerHTML = '';
  tbody.appendChild(fragment);
  if (typeof aplicarPermissoesInterface === 'function') aplicarPermissoesInterface();
}

function definirFiltroRapidoEstoque(filtro, opcoes = {}) {
  const destinoNormalizado = normalizarFiltroRapidoEstoque(filtro);
  const atual = obterFiltroRapidoEstoqueAtual();
  const alternar = opcoes?.alternar !== false;
  const destino = (alternar && atual === destinoNormalizado) ? 'todos' : destinoNormalizado;

  filtroRapidoEstoqueAtual = destino;
  persistirFiltroRapidoEstoque(destino);
  renderEstoque();

  if (opcoes?.rolar === false) return destino;

  const alvo = document.querySelector('#tab-estoque .estoque-search-toolbar')
    || document.getElementById('buscaEstoque')
    || document.querySelector('#tab-estoque .card');
  if (alvo && typeof rolarParaElementoAtalho === 'function') {
    rolarParaElementoAtalho(alvo, 'start');
  }
  return destino;
}

function aplicarFiltroEstoqueResumo(filtro) {
  definirFiltroRapidoEstoque(filtro, { alternar: true, rolar: true });
}

window.aplicarFiltroEstoqueResumo = aplicarFiltroEstoqueResumo;
window.definirFiltroRapidoEstoque = definirFiltroRapidoEstoque;
