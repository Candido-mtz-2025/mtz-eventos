// Dispatcher central para ações de UI via atributos data-*
function parseActionArg(raw, element, event) {
    if (typeof raw !== 'string') return raw;

    if (raw === '__this__') return element;
    if (raw === '__value__') return element.value;
    if (raw === '__checked__') return !!element.checked;
    if (raw === '__event__') return event;
    if (raw === '__filtro_log__') return window.filtroLogAtual || 'todos';

    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    return raw;
}

function collectActionArgs(element, event) {
    const args = [];

    if (Object.prototype.hasOwnProperty.call(element.dataset, 'arg')) {
        args.push(parseActionArg(element.dataset.arg, element, event));
    } else if (Object.prototype.hasOwnProperty.call(element.dataset, 'arg1')) {
        args.push(parseActionArg(element.dataset.arg1, element, event));
    }

    for (let idx = 2; idx <= 8; idx += 1) {
        const key = `arg${idx}`;
        if (Object.prototype.hasOwnProperty.call(element.dataset, key)) {
            args.push(parseActionArg(element.dataset[key], element, event));
        }
    }

    return args;
}

const ACTIONS_COM_BLOQUEIO_CURTO = new Set([
    'salvarLocador',
    'salvarTipo',
    'salvarPeca',
    'salvarConfig',
    'salvarEdicaoLocador',
    'salvarEdicaoTipo',
    'salvarEdicaoPeca',
    'salvarModeloChecklistForm',
    'finalizarLocacao',
    'confirmarDevolucao',
    'removerItem',
    'excluirModeloChecklistUI',
    'removerSelecionadosEstoque'
]);

function acaoTemBloqueioCurto(actionName) {
    return ACTIONS_COM_BLOQUEIO_CURTO.has(String(actionName || '').trim());
}

function travarBotaoAcao(element) {
    if (!(element instanceof HTMLButtonElement)) return null;
    if (element.dataset.actionBusy === '1') return false;

    element.dataset.actionBusy = '1';
    element.classList.add('is-busy');
    element.setAttribute('aria-busy', 'true');

    return () => {
        element.dataset.actionBusy = '0';
        element.classList.remove('is-busy');
        element.setAttribute('aria-busy', 'false');
    };
}

function runDataAction(actionName, element, event) {
    if (!actionName) return;

    if (actionName === 'triggerClick') {
        const targetId = element.dataset.targetId;
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (target) target.click();
        return;
    }

    if (actionName === 'confirmarLimparLogsAntigos') {
        if (window.confirm('Limpar logs antigos?') && typeof window.limparLogsAntigos === 'function') {
            window.limparLogsAntigos();
        }
        return;
    }

    const actionFn = window[actionName];
    if (typeof actionFn !== 'function') {
        console.warn(`Ação "${actionName}" não encontrada.`);
        return;
    }

    const args = collectActionArgs(element, event);
    const deveBloquear = acaoTemBloqueioCurto(actionName);
    const liberar = deveBloquear ? travarBotaoAcao(element) : null;
    if (deveBloquear && liberar === false) return;

    try {
        const retorno = actionFn(...args);
        if (liberar) {
            if (retorno && typeof retorno.then === 'function') {
                retorno.finally(() => liberar());
            } else {
                setTimeout(() => liberar(), 900);
            }
        }
    } catch (erro) {
        if (liberar) liberar();
        console.error(`Erro ao executar ação "${actionName}":`, erro);
        throw erro;
    }
}

document.addEventListener('click', function (event) {
    const actionEl = event.target.closest('[data-action]');
    if (actionEl && !actionEl.disabled) {
        runDataAction(actionEl.dataset.action, actionEl, event);
    }

    // Fecha a lista de sugestões ao clicar fora
    const lista = document.getElementById('listaSugestoes');
    if (lista && !event.target.closest('#inputBuscaPeca') && !event.target.closest('#listaSugestoes')) {
        lista.classList.remove('ativo');
    }
});

document.addEventListener('change', function (event) {
    const changeEl = event.target.closest('[data-change]');
    if (!changeEl || changeEl !== event.target) return;
    runDataAction(changeEl.dataset.change, changeEl, event);
});

document.addEventListener('input', function (event) {
    const inputEl = event.target.closest('[data-input]');
    if (!inputEl || inputEl !== event.target) return;
    runDataAction(inputEl.dataset.input, inputEl, event);
});

document.addEventListener('keyup', function (event) {
    const keyupEl = event.target.closest('[data-keyup]');
    if (!keyupEl || keyupEl !== event.target) return;
    runDataAction(keyupEl.dataset.keyup, keyupEl, event);
});

// Fecha a lista ao pressionar ESC
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const lista = document.getElementById('listaSugestoes');
        if (lista) lista.classList.remove('ativo');
    }
});
