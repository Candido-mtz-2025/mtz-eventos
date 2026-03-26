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

    function abrirEditarPeca(id) { const p = pecas.find(x => x.id === id); if(!p) return; document.getElementById('editPecaId').value = p.id; document.getElementById('editPecaCod').value = p.codigo; document.getElementById('editPecaNome').value = p.nome; document.getElementById('editPecaValor').value = p.valor; document.getElementById('editPecaQtd').value = p.quantidade; updateSelects(); const sel = document.getElementById('editPecaTipo'); if(sel) sel.value = p.tipoId || 0; document.getElementById('modalEditarPeca').classList.add('active'); }
    function salvarEdicaoPeca() { const id = parseInt(document.getElementById('editPecaId').value); const p = pecas.find(x => x.id === id); if(p) { const novaQtd = parseInt(document.getElementById('editPecaQtd').value); const diff = novaQtd - (p.quantidade || 0); p.codigo = document.getElementById('editPecaCod').value; p.nome = document.getElementById('editPecaNome').value; p.valor = parseFloat(document.getElementById('editPecaValor').value); p.tipoId = parseInt(document.getElementById('editPecaTipo').value); p.quantidade = novaQtd; p.disponivel = (p.disponivel || 0) + diff; salvarLocal(); renderTudo(); sincronizar('salvar'); document.getElementById('modalEditarPeca').classList.remove('active'); registrarLog('item', 'editar', `Item atualizado: ${p.nome}`); mostrarToast("Item atualizado!"); } }

   let estoqueSelecionados = new Set();

function onSelectEstoque(id, checked){
  id = Number(id);
  if (checked) estoqueSelecionados.add(id);
  else estoqueSelecionados.delete(id);
}

function toggleSelecionarTodosEstoque(marcar) {
  const checks = document.querySelectorAll('.chk-estoque');
  checks.forEach(chk => {
    chk.checked = marcar;
    onSelectEstoque(chk.dataset.id, marcar);
  });
}

function excluirSelecionadosEstoque(){
  if (estoqueSelecionados.size === 0) return mostrarToast('Selecione pelo menos 1 item.', 'erro');
  if (!confirm(`Excluir ${estoqueSelecionados.size} item(ns) do estoque?`)) return;

  const ids = new Set([...estoqueSelecionados].map(Number));
  const removidos = pecas.filter(p => ids.has(p.id));
  pecas = pecas.filter(p => !ids.has(p.id));

  removidos.forEach(p => registrarLog('item', 'deletar', `Item removido (lote): ${p.nome} ID ${p.id}`));

  estoqueSelecionados.clear();
  salvarLocal();
  renderEstoque();
  sincronizar('salvar');
  mostrarToast('Itens excluídos!');
}
