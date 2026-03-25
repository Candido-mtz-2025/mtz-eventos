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
