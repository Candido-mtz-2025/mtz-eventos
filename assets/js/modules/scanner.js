// --- FUNÇÕES DO SCANNER ---
    let scannerAtivo = false;
    let scannerHandlerAtivo = null;
    function iniciarScanner(modo) {
        const modal = document.getElementById('modalScanner');
        const alvoScanner = document.querySelector('#interactive');
        if (!modal || !alvoScanner) {
            mostrarToast("Scanner indisponível nesta tela.", "erro");
            return;
        }

        if (typeof Quagga === 'undefined') {
            mostrarToast("Leitor de código de barras não carregou. Recarregue o app e tente novamente.", "erro");
            return;
        }

        modal.classList.add('active');
        
        if (scannerAtivo) Quagga.stop();

        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: alvoScanner,
                constraints: { facingMode: "environment" }
            },
            decoder: { readers: ["code_128_reader", "ean_reader"] }
        }, function(err) {
            if (err) {
                console.warn('Falha ao iniciar scanner:', err);
                mostrarToast("Não foi possível acessar a câmera. Verifique a permissão do navegador.", "erro");
                fecharScanner();
                return;
            }
            Quagga.start();
            scannerAtivo = true;
        });

        if (scannerHandlerAtivo && typeof Quagga.offDetected === 'function') {
            Quagga.offDetected(scannerHandlerAtivo);
        }

        scannerHandlerAtivo = function(result) {
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
        };

        Quagga.onDetected(scannerHandlerAtivo);
    }

    function fecharScanner() {
        const modal = document.getElementById('modalScanner');
        if (modal) modal.classList.remove('active');

        if (scannerAtivo && typeof Quagga !== 'undefined') {
            Quagga.stop();
            scannerAtivo = false;
        }
        if (scannerHandlerAtivo && typeof Quagga !== 'undefined' && typeof Quagga.offDetected === 'function') {
            Quagga.offDetected(scannerHandlerAtivo);
            scannerHandlerAtivo = null;
        }
    }
