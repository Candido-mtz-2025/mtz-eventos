// Fecha a lista de sugestões ao clicar fora do campo de busca
document.addEventListener('click', function(e) {
    const lista = document.getElementById('listaSugestoes');
    const input = document.getElementById('inputBuscaPeca');
    
    // Se o clique não foi no input nem na lista, fecha a lista 
    if (lista && !e.target.closest('#inputBuscaPeca') && !e.target.closest('#listaSugestoes')) {
        lista.classList.remove('ativo');
    }
});

// Fecha a lista ao pressionar a tecla ESC
document.addEventListener('keydown', function(e) {
    if (e.key === "Escape") {
        const lista = document.getElementById('listaSugestoes');
        if (lista) lista.classList.remove('ativo');
    }
});
