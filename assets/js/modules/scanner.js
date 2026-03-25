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
