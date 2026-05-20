// Ações compartilhadas entre módulos
function removerItem(t, id) {
        confirmarAcao("Tem certeza que deseja excluir este registro?", () => {
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
            mostrarToast("Registro removido.");
        }, {
            titulo: "Excluir registro",
            textoConfirmar: "Excluir",
            classeConfirmar: "btn-danger"
        });
    }
