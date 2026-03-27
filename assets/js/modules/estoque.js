// Estoque: cadastro, edição, remoção e seleção em lote
    // === RECALCULAR DISPONIBILIDADE COM CACHE ===
    function recalcularDisponibilidade(forcar = false) {
        const agora = Date.now();
        
        if (!forcar && cacheDisponibilidade && (agora - ultimaAtualizacaoCache) < 5000) {
            console.log('📦 Usando cache de disponibilidade');
            return;
        }
        
        console.log('🔄 Recalculando disponibilidade...');
        
        const aluguelPorPeca = new Map();
        
        locacoes.forEach(l => {
            if (l.status !== 'devolvido') {
                l.items.forEach(i => {
                    const qtdAlugada = (i.quantidade || 0) - (i.devolvidos || 0);
                    const atual = aluguelPorPeca.get(i.pecaId) || 0;
                    aluguelPorPeca.set(i.pecaId, atual + qtdAlugada);
                });
            }
        });
        
        pecas.forEach(p => {
            const alugado = aluguelPorPeca.get(p.id) || 0;
            p.disponivel = (p.quantidade || 0) - alugado;
        });
        
        cacheDisponibilidade = true;
        ultimaAtualizacaoCache = agora;
        
        console.log('✅ Disponibilidade recalculada');
    }

    function salvarLocador() { const n=document.getElementById('locNome').value; if(!n) return; locadores.push({id:Date.now(), nome:n, email:document.getElementById('locEmail').value, telefone:document.getElementById('locTel').value, documento:document.getElementById('locDoc').value}); salvarLocal(); renderTudo(); sincronizar('salvar'); document.getElementById('locNome').value=""; mostrarToast("Cliente Salvo!"); }
    
    function salvarPeca() {
    const n = document.getElementById('pecaNome').value;
    if (!n) return;

    pecas.push({
        id: Date.now(),
        nome: n,
        codigo: document.getElementById('pecaCod').value,
        valor: parseFloat(document.getElementById('pecaValor').value) || 0,
        quantidade: parseInt(document.getElementById('pecaQtd').value) || 0,
        disponivel: parseInt(document.getElementById('pecaQtd').value) || 0,
        tipoId: parseInt(document.getElementById('pecaTipo').value),
        medida: document.getElementById('pecaMedida').value,

        grupoChecklist: document.getElementById('pecaGrupoChecklist').value || 'outros',
        familiaEstrutural: document.getElementById('pecaFamiliaEstrutural').value || '',
        subtipoEstrutural: document.getElementById('pecaSubtipoEstrutural').value || '',
        podeComporEstrutura: document.getElementById('pecaPodeCompor').value === 'sim'
    });

    salvarLocal();
    renderTudo();
    sincronizar('salvar');

    document.getElementById('pecaNome').value = "";
    mostrarToast("Item Salvo!");
}
    function salvarTipo() { const n=document.getElementById('tipoNome').value; if(!n) return; tipos.push({id:Date.now(), nome:n, desc:document.getElementById('tipoDesc').value}); salvarLocal(); renderTudo(); sincronizar('salvar'); document.getElementById('tipoNome').value=""; mostrarToast("Tipo Salvo!"); }

    function removerItem(t, id) {
        if(!confirm("Tem certeza?")) return;
        
        if(t === 'locadores') {
            const item = locadores.find(x => x.id == id);
            locadores = locadores.filter(x => x.id !== id);
            registrarLog('cliente', 'deletar', `Cliente removido: ${item?.nome || 'ID:'+id}`);
        }
        if(t === 'pecas') {
            const item = pecas.find(x => x.id == id);
            pecas = pecas.filter(x => x.id !== id);
            registrarLog('item', 'deletar', `Item removido: ${item?.nome || 'ID:'+id}`);
        }
        if(t === 'tipos') {
            const item = tipos.find(x => x.id == id);
            tipos = tipos.filter(x => x.id !== id);
            registrarLog('item', 'deletar', `Tipo removido: ${item?.nome || 'ID:'+id}`);
        }
        
        salvarLocal();
        renderTudo();
        sincronizar('salvar');
    }

  function abrirEditarPeca(id) {
    const p = pecas.find(x => String(x.id) === String(id));
    if (!p) {
        mostrarToast("Item não encontrado!", "erro");
        return;
    }

    document.getElementById('editPecaId').value = p.id;
    document.getElementById('editPecaCod').value = p.codigo || '';
    document.getElementById('editPecaNome').value = p.nome || '';
    document.getElementById('editPecaMedida').value = p.medida || '';
    document.getElementById('editPecaValor').value = p.valor || 0;
    document.getElementById('editPecaQtd').value = p.quantidade || 0;
    document.getElementById('editPecaBar').value = p.barras || p.codigoBarras || '';

    updateSelects();
    const sel = document.getElementById('editPecaTipo');
    if (sel) sel.value = p.tipoId || 0;

    document.getElementById('editPecaGrupoChecklist').value = p.grupoChecklist || 'outros';
    document.getElementById('editPecaFamiliaEstrutural').value = p.familiaEstrutural || '';
    document.getElementById('editPecaSubtipoEstrutural').value = p.subtipoEstrutural || '';
    document.getElementById('editPecaPodeCompor').value = p.podeComporEstrutura ? 'sim' : 'nao';

    document.getElementById('modalEditarPeca').classList.add('active');
}
  function salvarEdicaoPeca() {
    const id = document.getElementById('editPecaId').value;
    const p = pecas.find(x => String(x.id) === String(id));

    if (!p) {
        mostrarToast("Item não encontrado para salvar!", "erro");
        return;
    }

    const novaQtd = parseInt(document.getElementById('editPecaQtd').value) || 0;
    const diff = novaQtd - (p.quantidade || 0);

    p.codigo = document.getElementById('editPecaCod').value;
    p.nome = document.getElementById('editPecaNome').value;
    p.medida = document.getElementById('editPecaMedida').value;
    p.valor = parseFloat(document.getElementById('editPecaValor').value) || 0;
    p.tipoId = parseInt(document.getElementById('editPecaTipo').value) || 0;
    p.quantidade = novaQtd;
    p.disponivel = (p.disponivel || 0) + diff;
    p.barras = document.getElementById('editPecaBar').value;

    p.grupoChecklist = document.getElementById('editPecaGrupoChecklist').value || 'outros';
    p.familiaEstrutural = document.getElementById('editPecaFamiliaEstrutural').value || '';
    p.subtipoEstrutural = document.getElementById('editPecaSubtipoEstrutural').value || '';
    p.podeComporEstrutura = document.getElementById('editPecaPodeCompor').value === 'sim';

    document.getElementById('modalEditarPeca').classList.remove('active');
    document.getElementById('editPecaId').value = "";

    salvarLocal();
    sincronizar('salvar');

    const busca = document.getElementById('buscaEstoque');
    if (busca) busca.value = '';

    renderEstoque();

    registrarLog('item', 'editar', `Item atualizado: ${p.nome}`);
    mostrarToast("Item atualizado!");
}


window.estoqueSelecionados = new Set();

function onSelectEstoque(id, checked){
  id = Number(id);
  if (checked) window.estoqueSelecionados.add(id);
  else window.estoqueSelecionados.delete(id);
}

function toggleSelecionarTodosEstoque(marcar) {
  const checks = document.querySelectorAll('.chk-estoque');
  checks.forEach(chk => {
    chk.checked = marcar;
    onSelectEstoque(chk.dataset.id, marcar);
  });
}

function excluirSelecionadosEstoque(){
  if (window.estoqueSelecionados.size === 0) return mostrarToast('Selecione pelo menos 1 item.', 'erro');
  if (!confirm(`Excluir ${window.estoqueSelecionados.size} item(ns) do estoque?`)) return;

  const ids = new Set([...window.estoqueSelecionados].map(Number));
  const removidos = pecas.filter(p => ids.has(p.id));
  pecas = pecas.filter(p => !ids.has(p.id));

  removidos.forEach(p => registrarLog('item', 'deletar', `Item removido (lote): ${p.nome} ID ${p.id}`));

  window.estoqueSelecionados.clear();
  salvarLocal();
  renderEstoque();
  sincronizar('salvar');
  mostrarToast('Itens excluídos!');
}
window.salvarPeca = salvarPeca;
window.abrirEditarPeca = abrirEditarPeca;
window.salvarEdicaoPeca = salvarEdicaoPeca;
window.onSelectEstoque = onSelectEstoque;
window.toggleSelecionarTodosEstoque = toggleSelecionarTodosEstoque;
window.excluirSelecionadosEstoque = excluirSelecionadosEstoque;
// ===== MODELOS DE CHECKLIST / ESTRUTURA =====

function salvarModeloChecklist(nome, familiaEstrutural, itens, origem = 'manual') {
    nome = (nome || '').trim();
    familiaEstrutural = (familiaEstrutural || '').trim();

    if (!nome) {
        mostrarToast("Informe o nome do modelo.", "erro");
        return null;
    }

    if (!Array.isArray(itens) || itens.length === 0) {
        mostrarToast("Adicione pelo menos 1 peça ao modelo.", "erro");
        return null;
    }

    const modelo = {
        id: Date.now(),
        nome,
        familiaEstrutural,
        origem,
        criadoEm: new Date().toISOString(),
        itens: itens.map(item => ({
            pecaId: item.pecaId,
            nome: item.nome || '',
            qtd: parseInt(item.qtd) || 0
        })).filter(item => item.pecaId && item.qtd > 0)
    };

    if (modelo.itens.length === 0) {
        mostrarToast("Nenhuma peça válida foi adicionada.", "erro");
        return null;
    }

    modelosChecklist.push(modelo);

    salvarLocal();
    sincronizar('salvar');
    registrarLog('checklist', 'criar-modelo', `Modelo criado: ${modelo.nome}`);
    mostrarToast("Modelo salvo com sucesso!");

    return modelo;
}

function buscarModeloChecklist(id) {
    return modelosChecklist.find(x => String(x.id) === String(id));
}

function listarModelosChecklist(familiaEstrutural = '') {
    if (!familiaEstrutural) return [...modelosChecklist];

    return modelosChecklist.filter(x =>
        (x.familiaEstrutural || '').toLowerCase() === familiaEstrutural.toLowerCase()
    );
}

function excluirModeloChecklist(id) {
    const antes = modelosChecklist.length;
    modelosChecklist = modelosChecklist.filter(x => String(x.id) !== String(id));

    if (modelosChecklist.length === antes) {
        mostrarToast("Modelo não encontrado.", "erro");
        return;
    }

    salvarLocal();
    sincronizar('salvar');
    registrarLog('checklist', 'excluir-modelo', `Modelo removido: ${id}`);
    mostrarToast("Modelo excluído!");
}

window.salvarModeloChecklist = salvarModeloChecklist;
window.buscarModeloChecklist = buscarModeloChecklist;
window.listarModelosChecklist = listarModelosChecklist;
window.excluirModeloChecklist = excluirModeloChecklist;
function abrirModalModeloChecklist() {
    document.getElementById('modalModeloChecklist').classList.add('active');
}

function fecharModalModeloChecklist() {
    document.getElementById('modalModeloChecklist').classList.remove('active');
}

window.abrirModalModeloChecklist = abrirModalModeloChecklist;
window.fecharModalModeloChecklist = fecharModalModeloChecklist;
