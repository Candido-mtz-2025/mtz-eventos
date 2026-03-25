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

    // --- FUNÇÕES DO SCANNER ---
    let scannerAtivo = false;
    function iniciarScanner(modo) {
        const modal = document.getElementById('modalScanner');
        modal.classList.add('active');
        
        if (scannerAtivo) Quagga.stop();

        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: document.querySelector('#interactive'),
                constraints: { facingMode: "environment" }
            },
            decoder: { readers: ["code_128_reader", "ean_reader"] }
        }, function(err) {
            if (err) { console.log(err); return; }
            Quagga.start();
            scannerAtivo = true;
        });

        Quagga.onDetected(function(result) {
            const code = result.codeResult.code;
            if (modo === 'cadastro') {
                document.getElementById('pecaBar').value = code;
                mostrarToast("Código lido: " + code);
            } else if (modo === 'locacao') {
                const peca = pecas.find(p => p.codigo === code || (p.barras && p.barras === code)); 
                if (peca) {
                    document.getElementById('aluguelItemSelect').value = peca.id;
                    mostrarToast("Item encontrado: " + peca.nome);
                } else {
                    mostrarToast("Item não encontrado!", "erro");
                }
            }
            fecharScanner();
        });
    }

    function fecharScanner() {
        document.getElementById('modalScanner').classList.remove('active');
        if (scannerAtivo) {
            Quagga.stop();
            scannerAtivo = false;
        }
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
        // --- FUNÇÕES DE TRAVA DE ESTOQUE ---
    function atualizarLimiteEstoque() {
        var select = document.getElementById('aluguelItemSelect');
        var inputQtd = document.getElementById('aluguelQtd');
        var aviso = document.getElementById('avisoEstoque');
        
        var id = select.value;
        var p = pecas.find(x => x.id == id);

        if (p) {
            inputQtd.max = p.disponivel; // Define o máximo
            inputQtd.value = 1; 
            aviso.innerText = `(Máx: ${p.disponivel})`; // Mostra o aviso vermelho
        } else {
            aviso.innerText = "";
            inputQtd.removeAttribute("max");
        }
    }

    function validarDigitacao(input) {
        var maximo = parseInt(input.max);
        var valorDigitado = parseInt(input.value);

        if (!isNaN(maximo) && valorDigitado > maximo) {
            input.value = maximo; // Se passar, volta pro máximo
            mostrarToast("Limite de estoque atingido!", "erro");
        }
        if (valorDigitado < 1) input.value = 1;
    }
      // 1. Registra o Service Worker (Obrigatório para instalar)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('Service Worker Registrado!'))
                .catch((err) => console.error('Erro no SW:', err));
        }

        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            const btn = document.createElement('div');
            btn.innerHTML = '<i class="bi bi-phone"></i> INSTALAR APP';
            btn.style.cssText = `
                position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
                background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white;
                padding: 12px 30px; border-radius: 50px; font-weight: bold;
                box-shadow: 0 10px 25px rgba(37, 99, 235, 0.5); cursor: pointer; z-index: 9999;
                display: flex; align-items: center; gap: 10px; font-family: sans-serif;
            `;
            
            document.body.appendChild(btn);

            btn.onclick = () => {
                // CHAMA A INSTALAÇÃO NA HORA (Sem atrasos!)
                deferredPrompt.prompt();
                
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        btn.style.display = 'none';
                    }
                    deferredPrompt = null;
                });
            };
        });
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

    
