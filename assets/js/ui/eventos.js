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

const ACTIONS_ESPECIAIS_DISPATCH = new Set([
    'triggerClick',
    'confirmarLimparLogsAntigos'
]);

const TAGS_ACIONAVEIS_NATIVOS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);

const ACTIONS_ALIAS = Object.freeze({
    removerSelecionadosEstoque: 'excluirSelecionadosEstoque'
});

const ATRIBUTOS_GATILHO_AUDITORIA = Object.freeze([
    'data-change',
    'data-input',
    'data-keyup'
]);

const ACTIONS_COM_BLOQUEIO_CURTO = new Set([
    'salvarLocador',
    'salvarTipo',
    'salvarPeca',
    'salvarProposta',
    'salvarTransporte',
    'salvarConfig',
    'salvarEdicaoLocador',
    'salvarEdicaoTipo',
    'salvarEdicaoPeca',
    'salvarModeloChecklistForm',
    'adicionarModeloAoChecklist',
    'addItemCarrinho',
    'finalizarLocacao',
    'confirmarDevolucao',
    'removerItem',
    'excluirModeloChecklistUI',
    'excluirSelecionadosEstoque',
    'arquivarHistorico'
]);

const ROTULOS_ACAO_BUSY = Object.freeze({
    salvarLocador: 'Salvando...',
    salvarTipo: 'Salvando...',
    salvarPeca: 'Salvando...',
    salvarProposta: 'Salvando...',
    salvarTransporte: 'Salvando...',
    salvarConfig: 'Salvando...',
    salvarEdicaoLocador: 'Salvando...',
    salvarEdicaoTipo: 'Salvando...',
    salvarEdicaoPeca: 'Salvando...',
    salvarModeloChecklistForm: 'Salvando...',
    adicionarModeloAoChecklist: 'Adicionando...',
    addItemCarrinho: 'Adicionando...',
    finalizarLocacao: 'Concluindo...',
    confirmarDevolucao: 'Registrando...',
    excluirSelecionadosEstoque: 'Excluindo...',
    excluirModeloChecklistUI: 'Excluindo...',
    arquivarHistorico: 'Arquivando...',
    exportarLogsCSV: 'Exportando...',
    baixarBackup: 'Baixando...'
});

function acaoTemBloqueioCurto(actionName) {
    return ACTIONS_COM_BLOQUEIO_CURTO.has(String(actionName || '').trim());
}

function resolverNomeAcao(actionName) {
    const nome = String(actionName || '').trim();
    return ACTIONS_ALIAS[nome] || nome;
}

function elementoAcaoNaoNativo(el) {
    if (!(el instanceof HTMLElement)) return false;
    return !TAGS_ACIONAVEIS_NATIVOS.has(el.tagName);
}

function prepararAcessibilidadeAcoes(contexto = document) {
    const raiz = (contexto instanceof HTMLElement || contexto instanceof Document) ? contexto : document;
    const elementos = raiz.querySelectorAll('[data-action]');

    elementos.forEach((el) => {
        if (!elementoAcaoNaoNativo(el)) return;
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    });
}

let observerAcessibilidadeAcoes = null;
let rafPrepararAcoes = null;

function agendarPrepararAcessibilidadeAcoes() {
    if (rafPrepararAcoes != null) return;
    rafPrepararAcoes = window.requestAnimationFrame(() => {
        rafPrepararAcoes = null;
        prepararAcessibilidadeAcoes(document);
    });
}

function obterRotuloBusy(actionName, element) {
    const personalizado = String(element?.dataset?.busyText || '').trim();
    if (personalizado) return personalizado;
    return ROTULOS_ACAO_BUSY[String(actionName || '').trim()] || '';
}

function marcarAcaoIndisponivel(elemento, mensagem) {
    if (!(elemento instanceof HTMLElement)) return;
    elemento.dataset.actionUnavailable = '1';
    elemento.classList.add('is-action-unavailable');
    if (typeof elemento.dataset.actionTitlePrev === 'undefined') {
        elemento.dataset.actionTitlePrev = elemento.getAttribute('title') || '';
    }
    if (mensagem) elemento.setAttribute('title', mensagem);

    if (elemento instanceof HTMLButtonElement) {
        elemento.disabled = true;
    } else {
        elemento.setAttribute('aria-disabled', 'true');
    }
}

function limparMarcacaoAcaoIndisponivel(elemento) {
    if (!(elemento instanceof HTMLElement)) return;
    delete elemento.dataset.actionUnavailable;
    elemento.classList.remove('is-action-unavailable');
    if (Object.prototype.hasOwnProperty.call(elemento.dataset, 'actionTitlePrev')) {
        const tituloOriginal = elemento.dataset.actionTitlePrev;
        if (tituloOriginal) elemento.setAttribute('title', tituloOriginal);
        else elemento.removeAttribute('title');
        delete elemento.dataset.actionTitlePrev;
    }

    if (elemento instanceof HTMLButtonElement) {
        if (elemento.dataset.actionBusy !== '1') {
            elemento.disabled = false;
        }
    } else {
        elemento.setAttribute('aria-disabled', 'false');
    }
}

function travarBotaoAcao(element, actionName) {
    if (!(element instanceof HTMLButtonElement)) return null;
    if (element.dataset.actionBusy === '1') return false;

    const estavaDesabilitado = element.disabled;
    const rotuloBusy = obterRotuloBusy(actionName, element);
    const podeTrocarConteudo = Boolean(rotuloBusy && element.textContent && element.textContent.trim().length >= 3);

    element.dataset.actionBusy = '1';
    element.dataset.actionDisabledPrev = estavaDesabilitado ? '1' : '0';
    if (podeTrocarConteudo) {
        element.dataset.actionBusyHtml = element.innerHTML;
        element.innerHTML = `<span class="inline-loader" aria-hidden="true"></span><span>${rotuloBusy}</span>`;
    }
    element.classList.add('is-busy');
    element.disabled = true;
    element.setAttribute('aria-busy', 'true');

    return () => {
        element.dataset.actionBusy = '0';
        const disabledPrev = element.dataset.actionDisabledPrev === '1';
        const htmlOriginal = element.dataset.actionBusyHtml;
        if (htmlOriginal) {
            element.innerHTML = htmlOriginal;
        }
        delete element.dataset.actionBusyHtml;
        delete element.dataset.actionDisabledPrev;
        element.classList.remove('is-busy');
        element.disabled = disabledPrev;
        element.setAttribute('aria-busy', 'false');
    };
}

function runDataAction(actionName, element, event) {
    if (!actionName) return;
    if (element?.dataset?.actionUnavailable === '1') {
        if (typeof mostrarToast === 'function') {
            mostrarToast('Esta ação está indisponível nesta tela.', 'erro');
        }
        return;
    }
    const acaoResolvida = resolverNomeAcao(actionName);

    if (acaoResolvida === 'triggerClick') {
        const targetId = element.dataset.targetId;
        if (!targetId) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Ação de atalho sem destino configurado.', 'erro');
            }
            return;
        }
        const target = document.getElementById(targetId);
        if (!target) {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Destino do atalho não encontrado na tela.', 'erro');
            }
            return;
        }
        target.click();
        return;
    }

    if (acaoResolvida === 'confirmarLimparLogsAntigos') {
        if (window.confirm('Limpar logs antigos?') && typeof window.limparLogsAntigos === 'function') {
            window.limparLogsAntigos();
        }
        return;
    }

    const actionFn = window[acaoResolvida];
    if (typeof actionFn !== 'function') {
        console.warn(`Ação "${acaoResolvida}" não encontrada.`);
        if (typeof mostrarToast === 'function') {
            mostrarToast('Esta ação ainda não está disponível.', 'erro');
        }
        return;
    }

    const args = collectActionArgs(element, event);
    const deveBloquear = acaoTemBloqueioCurto(acaoResolvida);
    const liberar = deveBloquear ? travarBotaoAcao(element, acaoResolvida) : null;
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
        console.error(`Erro ao executar ação "${acaoResolvida}":`, erro);
        if (typeof mostrarToast === 'function') {
            mostrarToast('Não foi possível concluir essa ação agora.', 'erro');
        }
    }
}

function auditarAcoesDaInterface() {
    const elementos = Array.from(document.querySelectorAll('[data-action]'));
    if (!elementos.length) return;

    const nomes = Array.from(new Set(
        elementos.map((el) => String(el.dataset.action || '').trim()).filter(Boolean)
    ));

    const faltantes = nomes.filter((nomeBruto) => {
        const nome = resolverNomeAcao(nomeBruto);
        if (nome === 'triggerClick') return false;
        if (ACTIONS_ESPECIAIS_DISPATCH.has(nome)) return false;
        return typeof window[nome] !== 'function';
    });

    elementos.forEach((el) => {
        const nomeBruto = String(el.dataset.action || '').trim();
        const nome = resolverNomeAcao(nomeBruto);

        if (nome === 'triggerClick') {
            const targetId = String(el.dataset.targetId || '').trim();
            if (!targetId || !document.getElementById(targetId)) {
                marcarAcaoIndisponivel(el, 'Atalho indisponível: destino não encontrado.');
            } else {
                limparMarcacaoAcaoIndisponivel(el);
            }
            return;
        }

        if (ACTIONS_ESPECIAIS_DISPATCH.has(nome) || typeof window[nome] === 'function') {
            limparMarcacaoAcaoIndisponivel(el);
            return;
        }

        marcarAcaoIndisponivel(el, 'Ação indisponível: função não encontrada.');
    });

    if (faltantes.length) {
        console.warn('Ações não mapeadas na interface:', faltantes);
    }

    // Auditoria complementar para gatilhos de formulário/evento.
    ATRIBUTOS_GATILHO_AUDITORIA.forEach((atributo) => {
        const elementosGatilho = Array.from(document.querySelectorAll(`[${atributo}]`));
        if (!elementosGatilho.length) return;

        const nomes = Array.from(new Set(
            elementosGatilho
                .map((el) => String(el.getAttribute(atributo) || '').trim())
                .filter(Boolean)
                .map((nome) => resolverNomeAcao(nome))
        ));

        const ausentes = nomes.filter((nome) => typeof window[nome] !== 'function');
        if (ausentes.length) {
            console.warn(`Gatilhos ${atributo} sem função mapeada:`, ausentes);
        }
    });
}

window.auditarAcoesDaInterface = auditarAcoesDaInterface;
window.prepararAcessibilidadeAcoes = prepararAcessibilidadeAcoes;

document.addEventListener('DOMContentLoaded', function () {
    // Pequeno atraso para garantir que scripts dos módulos já tenham registrado funções globais.
    setTimeout(auditarAcoesDaInterface, 120);
    prepararAcessibilidadeAcoes(document);

    if (observerAcessibilidadeAcoes) return;
    observerAcessibilidadeAcoes = new MutationObserver(() => {
        agendarPrepararAcessibilidadeAcoes();
    });
    observerAcessibilidadeAcoes.observe(document.body, {
        childList: true,
        subtree: true
    });
});

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
    const actionEl = event.target.closest('[data-action]');
    if (actionEl && !actionEl.disabled && elementoAcaoNaoNativo(actionEl) && (event.key === 'Enter' || event.key === ' ')) {
        const tag = event.target?.tagName?.toLowerCase();
        const digitando = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable;
        if (!digitando) {
            event.preventDefault();
            runDataAction(actionEl.dataset.action, actionEl, event);
            return;
        }
    }

    if (event.key === 'Escape') {
        const lista = document.getElementById('listaSugestoes');
        if (lista) lista.classList.remove('ativo');
    }
});
