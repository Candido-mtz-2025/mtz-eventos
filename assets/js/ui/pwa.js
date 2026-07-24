// 1. Registra o Service Worker (Obrigatório para instalar)
if ('serviceWorker' in navigator) {
    const SW_VERSION = 'v60';

    function ativarWorkerEmEspera(worker) {
        if (!worker) return;
        try {
            worker.postMessage({ type: 'SKIP_WAITING' });
        } catch (_) {
            // Se falhar, o fluxo padrão do browser assume.
        }
    }

    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`./sw.js?${SW_VERSION}`, { updateViaCache: 'none' })
            .then((registration) => {
                registration.update();
                setInterval(() => registration.update(), 30 * 60 * 1000);

                if (registration.waiting) {
                    ativarWorkerEmEspera(registration.waiting);
                }

                registration.addEventListener('updatefound', () => {
                    const worker = registration.installing;
                    if (!worker) return;

                    worker.addEventListener('statechange', () => {
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                            if (typeof mostrarToast === 'function') {
                                mostrarToast('Nova versao disponivel. Atualizando...');
                            }
                            ativarWorkerEmEspera(worker);
                        }
                    });
                });
            })
            .catch((err) => console.error('Erro no SW:', err));
    });

    let atualizando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (atualizando) return;
        atualizando = true;
        window.location.reload();
    });
}

let deferredPrompt;

function pwaExecutandoComoAplicativo() {
    return window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

function elementoPwaVisivel(elemento) {
    if (!(elemento instanceof HTMLElement)) return false;
    if (elemento.hidden || elemento.getAttribute('aria-hidden') === 'true') return false;

    const estilo = window.getComputedStyle(elemento);
    return estilo.display !== 'none'
        && estilo.visibility !== 'hidden'
        && elemento.getClientRects().length > 0;
}

function existeCamadaInterfaceAberta() {
    const seletores = [
        '.proposta-config-drawer.is-open',
        '.modal.active',
        '.modal.show',
        '.modal[aria-hidden="false"]',
        '.drawer.is-open',
        '.offcanvas.show',
        'dialog[open]',
        '[role="dialog"][aria-modal="true"]'
    ].join(',');

    return Array.from(document.querySelectorAll(seletores)).some(elementoPwaVisivel);
}

function atualizarVisibilidadeBotaoInstalacao() {
    const btn = document.getElementById('pwaInstallButton');
    if (!btn) return;

    if (pwaExecutandoComoAplicativo()) {
        btn.remove();
        deferredPrompt = null;
        return;
    }

    const suspenso = existeCamadaInterfaceAberta();
    const estavaSuspenso = btn.classList.contains('is-suspended');
    if (suspenso === estavaSuspenso) return;

    btn.classList.toggle('is-suspended', suspenso);

    if (suspenso) {
        btn.setAttribute('aria-hidden', 'true');
        btn.setAttribute('tabindex', '-1');
    } else {
        btn.removeAttribute('aria-hidden');
        btn.removeAttribute('tabindex');
    }
}

let atualizacaoVisualPwaAgendada = false;
function agendarAtualizacaoVisualPwa() {
    if (atualizacaoVisualPwaAgendada) return;
    atualizacaoVisualPwaAgendada = true;

    requestAnimationFrame(() => {
        atualizacaoVisualPwaAgendada = false;
        atualizarVisibilidadeBotaoInstalacao();
    });
}

function observarCamadasInterfacePwa() {
    if (!document.body || window.__mtzObservadorCamadasPwa) return;

    const observador = new MutationObserver(agendarAtualizacaoVisualPwa);
    observador.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'hidden', 'open', 'aria-hidden', 'aria-modal', 'style']
    });

    window.__mtzObservadorCamadasPwa = observador;
}

if (document.body) {
    observarCamadasInterfacePwa();
} else {
    document.addEventListener('DOMContentLoaded', observarCamadasInterfacePwa, { once: true });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (pwaExecutandoComoAplicativo()) {
        deferredPrompt = null;
        return;
    }

    const existente = document.getElementById('pwaInstallButton');
    if (existente) existente.remove();

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'pwaInstallButton';
    btn.className = 'pwa-install-button';
    btn.setAttribute('aria-label', 'Instalar aplicativo MTZ Eventos');
    btn.innerHTML = '<i class="bi bi-phone"></i> INSTALAR APP';

    document.body.appendChild(btn);
    atualizarVisibilidadeBotaoInstalacao();

    btn.addEventListener('click', () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();

        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                btn.remove();
            }
            deferredPrompt = null;
        });
    });
});

window.addEventListener('appinstalled', () => {
    document.getElementById('pwaInstallButton')?.remove();
    deferredPrompt = null;
});
