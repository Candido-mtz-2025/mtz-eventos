// Ações compartilhadas entre módulos
function removerItem(t, id) {
        if (t === 'pecas') return abrirExclusaoPeca(id);
        if (typeof validarPermissao === 'function' && !validarPermissao('excluir_registro', 'Somente administrador pode excluir registros.')) {
            return;
        }

        confirmarAcao("Tem certeza que deseja excluir este registro?", () => {
            if(t === 'locadores') {
                const resolucao = resolverClientePorReferenciaTipada(locadores, id);
                const item = resolucao.encontrado ? resolucao.cliente : null;
                if (!item) {
                    mostrarToast(resolucao.estado === 'duplicado'
                        ? 'O cadastro possui um identificador duplicado e não pode ser excluído por esta ação.'
                        : 'Cliente não encontrado.', 'erro');
                    return;
                }
                locadores = locadores.filter((cliente) => cliente !== item);
                registrarLog('cliente', 'deletar', `Cliente removido: ${item?.nome || 'ID:'+id}`);
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
