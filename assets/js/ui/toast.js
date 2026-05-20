let toastTimer = null;

function mostrarToast(mensagem, tipo = 'ok', duracao = 3200) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }

    toast.innerText = mensagem || '';
    toast.dataset.tipo = tipo;
    toast.className = 'show';

    toastTimer = setTimeout(() => {
        toast.className = '';
        toastTimer = null;
    }, duracao);
}

function garantirModalConfirmacao() {
    let modal = document.getElementById('modalConfirmacaoRapida');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'modalConfirmacaoRapida';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content modal-confirmacao">
            <h3 id="confirmacaoTitulo">Confirmar ação</h3>
            <p id="confirmacaoTexto" class="confirmacao-texto"></p>
            <div class="confirmacao-acoes">
                <button type="button" class="btn btn-secondary" id="confirmacaoCancelar">Cancelar</button>
                <button type="button" class="btn btn-danger" id="confirmacaoOk">Confirmar</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}

function fecharModalConfirmacao() {
    const modal = document.getElementById('modalConfirmacaoRapida');
    if (!modal) return;
    modal.classList.remove('active');
}

function confirmarAcao(mensagem, onConfirm, opcoes = {}) {
    const modal = garantirModalConfirmacao();
    const titulo = modal.querySelector('#confirmacaoTitulo');
    const texto = modal.querySelector('#confirmacaoTexto');
    const btnCancelar = modal.querySelector('#confirmacaoCancelar');
    const btnOk = modal.querySelector('#confirmacaoOk');

    if (!titulo || !texto || !btnCancelar || !btnOk) {
        if (confirm(mensagem || 'Tem certeza?') && typeof onConfirm === 'function') {
            onConfirm();
        }
        return;
    }

    titulo.textContent = opcoes.titulo || 'Confirmar ação';
    texto.textContent = mensagem || 'Deseja continuar?';
    btnOk.textContent = opcoes.textoConfirmar || 'Confirmar';
    btnCancelar.textContent = opcoes.textoCancelar || 'Cancelar';

    btnOk.className = `btn ${opcoes.classeConfirmar || 'btn-danger'}`;

    const cancelar = () => {
        fecharModalConfirmacao();
        btnOk.onclick = null;
        btnCancelar.onclick = null;
        modal.onclick = null;
    };

    btnCancelar.onclick = cancelar;
    modal.onclick = (evento) => {
        if (evento.target === modal) cancelar();
    };

    btnOk.onclick = () => {
        cancelar();
        if (typeof onConfirm === 'function') onConfirm();
    };

    modal.classList.add('active');
}

window.mostrarToast = mostrarToast;
window.confirmarAcao = confirmarAcao;
window.fecharModalConfirmacao = fecharModalConfirmacao;
