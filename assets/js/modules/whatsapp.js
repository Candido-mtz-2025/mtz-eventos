// --- FUNÇÃO WHATSAPP (TEXTO LIMPO - SEM NEGRITO) ---
    function enviarZap(id) {
        const l = locacoes.find(x => x.id === id);
        if(!l) return;
        const c = locadores.find(x => x.id === l.locadorId);
        
        if (!c || !c.telefone) {
            return mostrarToast("Cliente sem telefone cadastrado!", "erro");
        }

        let fone = c.telefone.replace(/\D/g, '');
        if(fone.length <= 11) fone = "55" + fone;

        let textoItens = "";
        l.items.forEach(item => {
            textoItens += `>> ${item.quantidade}x ${item.nome}\n`;
        });

        let total = 0;
        l.items.forEach(i => total += (parseFloat(i.valor||0)*parseInt(i.quantidade||1)));
        let div = parseFloat(l.divisorFatura||1); if(div<=0) div=1;
        let valorFinal = total/div;

        // MENSAGEM LIMPA (Tirei todos os asteriscos *)
        const msg = `Olá ${c.nome}! Tudo bem?
Aqui está o seu pedido na MTZ Eventos:

DATA: ${formatarData(l.dataAluguel).replace(/<[^>]*>/g, '')}

ITENS SELECIONADOS:
${textoItens}
TOTAL FINAL: R$ ${valorFinal.toFixed(2)}

Fico no aguardo!`;

        window.open(`https://wa.me/${fone}?text=${encodeURIComponent(msg)}`, '_blank');
    }
