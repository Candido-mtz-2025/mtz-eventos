// Ações compartilhadas entre módulos
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
