// Ferramentas de backup e limpeza
    // --- FUNÇÕES DE BACKUP ---
    function baixarBackup() {
        const dados = JSON.stringify({locadores, pecas, locacoes, devolucoes, tipos, config});
        const blob = new Blob([dados], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MTZ_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        mostrarToast("Backup baixado!");
    }

    function restaurarBackup(input) {
        if (!input.files || !input.files[0]) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const j = JSON.parse(e.target.result);
                if (confirm("Isso substituirá todos os dados atuais. Continuar?")) {
                    locadores = j.locadores || [];
                    pecas = j.pecas || [];
                    locacoes = j.locacoes || [];
                    devolucoes = j.devolucoes || [];
                    tipos = j.tipos || [];
                    config = j.config || config;
                    salvarLocal();
                    renderTudo();
                    sincronizar('salvar');
                    mostrarToast("Backup restaurado com sucesso!");
                }
            } catch (erro) {
                alert("Erro ao ler arquivo de backup: " + erro);
            }
        };
        reader.readAsText(input.files[0]);
    }

    // --- FUNÇÃO DE LIMPEZA E ARQUIVAMENTO (VERSÃO MATA-FANTASMAS) ---
    function arquivarHistorico() {
        // PASSO 1: FAXINA IMEDIATA (Remove os traços "-" da tela)
        const historicoAntes = devolucoes.length;
        devolucoes = devolucoes.filter(d => locacoes.some(l => l.id === d.locacaoId));
        
        const historicoDepois = devolucoes.length;
        const fantasmasRemovidos = historicoAntes - historicoDepois;

        // Se encontrou "fantasmas", limpa eles e avisa
        if (fantasmasRemovidos > 0) {
            salvarLocal();
            renderTudo();
            sincronizar('salvar');
            return mostrarToast(`Faxina completa! ${fantasmasRemovidos} registros vazios removidos.`);
        }

        // PASSO 2: ARQUIVAMENTO NORMAL
        const contratosParaArquivar = locacoes.filter(l => l.status === 'devolvido');
        const contratosParaManter = locacoes.filter(l => l.status !== 'devolvido');

        if (contratosParaArquivar.length === 0) return mostrarToast("Nada novo para arquivar!", "erro");

        if (!confirm(`Confirma arquivar ${contratosParaArquivar.length} contratos finalizados?\n(Eles sairão do sistema e serão salvos num arquivo)`)) return;

        const dadosMortos = JSON.stringify({ 
            data: new Date(), 
            contratos: contratosParaArquivar
        });
        
        const blob = new Blob([dadosMortos], {type: "application/json"});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `MTZ_Arquivo_Morto_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        locacoes = contratosParaManter;
        devolucoes = devolucoes.filter(d => locacoes.some(l => l.id === d.locacaoId));

        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        mostrarToast("Sistema limpo e otimizado!");
    }

// === MONITOR DE ARMAZENAMENTO ===
function verificarEspacoStorage() {
    try {
        const backup = localStorage.getItem('mtzBackup');
        if (!backup) return;
        
        const tamanhoKB = (new Blob([backup]).size / 1024).toFixed(2);
        const percentual = Math.round((tamanhoKB / 5120) * 100);
        
        console.log(`📊 Storage: ${tamanhoKB} KB (${percentual}% de 5 MB)`);
        
        if (percentual >= 90) {
            mostrarToast('🔴 CRÍTICO: Storage em ' + percentual + '%! FAÇA BACKUP AGORA!', 'erro');
        } else if (percentual >= 75) {
            mostrarToast('⚠️ ALERTA: Storage em ' + percentual + '%!', 'erro');
        }
    } catch (erro) {
        console.error('Erro ao verificar storage:', erro);
    }
}

// Executar verificação ao carregar
window.addEventListener('load', function() {
    setTimeout(verificarEspacoStorage, 2000);
});
