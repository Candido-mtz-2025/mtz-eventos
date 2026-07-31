// Devoluções: conferência total ou parcial por item
let devolucaoEmProcessamento = false;
let devolucaoSubmissaoId = '';
let devolucaoSubmissaoLocacaoId = '';

function obterDataLocalIsoDevolucao(data = new Date()) {
    const dataLocal = data instanceof Date ? data : new Date(data);
    if (Number.isNaN(dataLocal.getTime())) return '';

    const ano = dataLocal.getFullYear();
    const mes = String(dataLocal.getMonth() + 1).padStart(2, '0');
    const dia = String(dataLocal.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function limparErroLocacaoDevolucao() {
    const campo = document.getElementById('devLocacao');
    const mensagem = document.getElementById('devLocacaoErro');

    campo?.removeAttribute('aria-invalid');
    if (mensagem) {
        mensagem.textContent = '';
        mensagem.hidden = true;
    }
}

function informarErroLocacaoDevolucao() {
    const campo = document.getElementById('devLocacao');
    const mensagem = document.getElementById('devLocacaoErro');
    const texto = 'Selecione uma locação pendente para registrar a devolução.';

    campo?.setAttribute('aria-invalid', 'true');
    if (mensagem) {
        mensagem.textContent = texto;
        mensagem.hidden = false;
    }

    mostrarToast(texto, 'erro');
    focarCampoDevolucao('devLocacao');
}

function getQtdPendenteItem(item) {
    if (typeof obterQuantidadePendenteDevolucaoItem === 'function') {
        return obterQuantidadePendenteDevolucaoItem(item);
    }
    const quantidade = typeof obterQuantidadePropriaOperacional === 'function'
        ? obterQuantidadePropriaOperacional(item)
        : Math.max(parseInt(item.quantidade, 10) || 0, 0);
    const devolvidos = parseInt(item.devolvidos) || 0;
    const avariados = parseInt(item.avariadosEstoqueProprio, 10) || 0;
    return Math.max(quantidade - devolvidos - avariados, 0);
}

function locacaoEstaTotalmenteDevolvida(locacao) {
    return (locacao.items || []).every(item => getQtdPendenteItem(item) === 0);
}

function escaparHTMLDevolucao(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function criarEstadoDevolucaoPainel(opcoes = {}) {
    if (typeof criarEstadoPainel === 'function') {
        return criarEstadoPainel(opcoes.mensagem, {
            tipo: opcoes.tipo || 'info',
            titulo: opcoes.titulo || 'Informação'
        });
    }
    return `<small class="muted-note">${escaparHTMLDevolucao(opcoes.mensagem || 'Sem dados para mostrar.')}</small>`;
}

function focarCampoDevolucao(idCampo) {
    const campo = document.getElementById(idCampo);
    if (!campo) return;

    setTimeout(() => {
        try {
            campo.focus({ preventScroll: false });
        } catch (_) {
            campo.focus();
        }
    }, 40);
}

function obterResponsavelDevolucao() {
    return String(localStorage.getItem('usuarioEmail') || 'sistema_local').trim() || 'sistema_local';
}

function gerarOperacaoIdDevolucao() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return `devolucao-${window.crypto.randomUUID()}`;
    }
    return `devolucao-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function renovarSubmissaoDevolucao(locacaoId = '') {
    devolucaoSubmissaoId = gerarOperacaoIdDevolucao();
    devolucaoSubmissaoLocacaoId = String(locacaoId || '');
    return devolucaoSubmissaoId;
}

function obterSubmissaoDevolucao(locacaoId) {
    const idLocacao = String(locacaoId || '');
    if (!devolucaoSubmissaoId || devolucaoSubmissaoLocacaoId !== idLocacao) {
        return renovarSubmissaoDevolucao(idLocacao);
    }
    return devolucaoSubmissaoId;
}

function obterValorQuantidadeDevolucao(input) {
    const valor = parseInt(input?.value, 10);
    return Number.isFinite(valor) && valor >= 0 ? valor : 0;
}

function validarLinhaConferenciaDevolucao(linha, opcoes = {}) {
    if (!(linha instanceof HTMLElement)) return { valida: true, informado: 0 };

    const qtd = linha.querySelector('.dev-qtd');
    const avaria = linha.querySelector('.dev-avaria');
    const erro = linha.querySelector('.dev-linha-erro');
    const pendente = Math.max(parseInt(linha.dataset.pendente, 10) || 0, 0);
    const quantidadeDevolvida = obterValorQuantidadeDevolucao(qtd);
    const quantidadeAvaria = obterValorQuantidadeDevolucao(avaria);
    const informado = quantidadeDevolvida + quantidadeAvaria;
    const valida = informado <= pendente;

    linha.classList.toggle('is-invalid', !valida);
    linha.setAttribute('aria-invalid', valida ? 'false' : 'true');
    [qtd, avaria].forEach((input) => {
        if (input) input.setAttribute('aria-invalid', valida ? 'false' : 'true');
    });
    if (erro) {
        erro.hidden = valida;
        erro.textContent = valida
            ? ''
            : `A soma devolvida e avaria não pode ultrapassar ${pendente} unidade(s) pendente(s).`;
    }

    if (!valida && opcoes.focar === true) {
        focarCampoDevolucao(qtd?.id || avaria?.id || '');
    }

    return {
        valida,
        informado,
        pendente,
        quantidadeDevolvida,
        quantidadeAvaria
    };
}

function atualizarEstadoBotaoRegistroDevolucao(estadoResumo = null) {
    const botao = document.getElementById('btnRegistrarDevolucao');
    if (!botao) return;

    const estado = estadoResumo || Array.from(document.querySelectorAll('.devolucao-item'))
        .reduce((acc, linha) => {
            const validacao = validarLinhaConferenciaDevolucao(linha);
            acc.informado += validacao.informado;
            acc.temInvalido = acc.temInvalido || !validacao.valida;
            return acc;
        }, { informado: 0, temInvalido: false });

    botao.disabled = devolucaoEmProcessamento;
    botao.setAttribute('aria-busy', devolucaoEmProcessamento ? 'true' : 'false');
    botao.innerHTML = devolucaoEmProcessamento
        ? '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Registrando...'
        : '<i class="bi bi-check-lg" aria-hidden="true"></i> Registrar Devolução';
}

function atualizarResumoConferenciaDevolucao() {
    const resumo = document.getElementById('devResumoLive');
    if (!resumo) return;

    const itens = Array.from(document.querySelectorAll('.devolucao-item'));
    if (itens.length === 0) {
        resumo.classList.add('is-empty');
        resumo.innerHTML = criarEstadoDevolucaoPainel({
            tipo: 'empty',
            titulo: 'Sem itens para conferência',
            mensagem: 'Selecione uma locação em aberto para iniciar.'
        });
        atualizarEstadoBotaoRegistroDevolucao({ informado: 0, temInvalido: false });
        return;
    }
    resumo.classList.remove('is-empty');

    let totalPendente = 0;
    let totalDevolvido = 0;
    let totalAvaria = 0;
    let totalInvalido = 0;

    itens.forEach((item) => {
        const validacao = validarLinhaConferenciaDevolucao(item);

        totalPendente += validacao.pendente;
        totalDevolvido += validacao.quantidadeDevolvida;
        totalAvaria += validacao.quantidadeAvaria;
        if (!validacao.valida) totalInvalido += 1;
    });

    const restante = Math.max(totalPendente - totalDevolvido - totalAvaria, 0);
    const classe = totalInvalido > 0
        ? 'badge-danger'
        : (restante === 0 ? 'badge-success' : 'badge-warning');
    const texto = totalInvalido > 0
        ? `${totalInvalido} linha(s) com valores inválidos`
        : (restante === 0 ? 'Conferência completa' : `${restante} item(ns) ainda pendente(s)`);

    resumo.innerHTML = `
        <span><b>Pendente:</b> ${totalPendente}</span>
        <span><b>Devolvido:</b> ${totalDevolvido}</span>
        <span><b>Avaria/perda:</b> ${totalAvaria}</span>
        <span class="badge ${classe}">${texto}</span>
    `;
    atualizarEstadoBotaoRegistroDevolucao({
        informado: totalDevolvido + totalAvaria,
        temInvalido: totalInvalido > 0
    });
}

function preencherDevolucaoCompleta() {
    document.querySelectorAll('.dev-qtd').forEach((input) => {
        input.value = parseInt(input.max, 10) || 0;
    });
    document.querySelectorAll('.dev-avaria').forEach((input) => {
        input.value = 0;
    });
    atualizarResumoConferenciaDevolucao();
}

function limparConferenciaDevolucao() {
    document.querySelectorAll('.dev-qtd, .dev-avaria').forEach((input) => {
        input.value = 0;
    });
    document.querySelectorAll('.dev-obs').forEach((input) => {
        input.value = '';
    });
    atualizarResumoConferenciaDevolucao();
}

function onInputConferenciaDevolucao(input) {
    validarQtdDevolucao(input);
    atualizarResumoConferenciaDevolucao();
}

function normalizarAssinaturaItensDevolucao(itens = []) {
    return itens
        .map((item, indice) => ({
            itemIndex: Number.isInteger(Number(item?.itemIndex))
                ? Number(item.itemIndex)
                : indice,
            pecaId: String(item?.pecaId ?? '').trim(),
            qtd: parseInt(item?.quantidadeDevolvida, 10) || 0,
            avaria: parseInt(item?.quantidadeAvaria, 10) || 0
        }))
        .filter((item) => item.pecaId && (item.qtd > 0 || item.avaria > 0))
        .sort((a, b) => a.itemIndex - b.itemIndex || a.pecaId.localeCompare(b.pecaId))
        .map((item) => `${item.itemIndex}:${item.pecaId}:${item.qtd}:${item.avaria}`)
        .join('|');
}

function encontrarDevolucaoPossivelmenteDuplicada(dadosDevolucao) {
    const locacaoId = Number(dadosDevolucao?.locacaoId || 0);
    const dataDevolucao = String(dadosDevolucao?.dataDevolucao || '').trim();
    const assinatura = normalizarAssinaturaItensDevolucao(dadosDevolucao?.itens || []);

    if (!locacaoId || !dataDevolucao || !assinatura) return null;

    return devolucoes.find((registro) => {
        if (Number(registro?.locacaoId || 0) !== locacaoId) return false;
        if (String(registro?.dataDevolucao || '').trim() !== dataDevolucao) return false;
        const assinaturaExistente = normalizarAssinaturaItensDevolucao(registro?.itens || []);
        return assinaturaExistente === assinatura;
    }) || null;
}

function carregarItensDevolucao() {
    const id = document.getElementById('devLocacao').value;
    const div = document.getElementById('divItensDevolucao');
    if (!div) return;

    div.innerHTML = "";
    if (!id) {
        div.innerHTML = criarEstadoDevolucaoPainel({
            tipo: 'info',
            titulo: 'Selecione uma locação',
            mensagem: 'Escolha uma locação em aberto para iniciar a conferência.'
        });
        focarCampoDevolucao('devLocacao');
        return;
    }

    const l = locacoes.find(x => x.id == id);
    if (!l) {
        div.innerHTML = criarEstadoDevolucaoPainel({
            tipo: 'error',
            titulo: 'Locação não encontrada',
            mensagem: 'Atualize a lista e tente novamente.'
        });
        focarCampoDevolucao('devLocacao');
        return;
    }
    limparErroLocacaoDevolucao();
    const submissaoId = obterSubmissaoDevolucao(l.id);
    div.dataset.devolucaoSubmissaoId = submissaoId;

    const cliente = locadores.find(x => x.id === l.locadorId);
    const itensPendentes = (l.items || [])
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) => getQtdPendenteItem(item) > 0);
    const totalPendente = itensPendentes.reduce((total, { item }) => total + getQtdPendenteItem(item), 0);

    if (itensPendentes.length === 0) {
        div.innerHTML = criarEstadoDevolucaoPainel({
            tipo: 'success',
            titulo: 'Conferência finalizada',
            mensagem: 'Todos os itens desta locação já foram devolvidos.'
        });
        atualizarEstadoBotaoRegistroDevolucao({ informado: 0, temInvalido: false });
        return;
    }

    div.innerHTML = `
        <div class="devolucao-resumo">
            <span><b>Cliente:</b> ${escaparHTMLDevolucao(cliente?.nome || 'Removido')}</span>
            <span><b>Pendentes:</b> ${totalPendente} item(ns)</span>
        </div>
        <div class="inline-chip-row section-gap-small">
            <button class="btn btn-sm btn-success" data-action="preencherDevolucaoCompleta">
                <i class="bi bi-check2-all"></i> Marcar conferência completa
            </button>
            <button class="btn btn-sm btn-secondary" data-action="limparConferenciaDevolucao">
                <i class="bi bi-eraser"></i> Limpar conferência
            </button>
        </div>
        <div class="devolucao-lista">
            ${itensPendentes.map(({ item, itemIndex }) => {
                const pendente = getQtdPendenteItem(item);
                const valor = Number(item.valor || 0);
                const quantidadePropria = typeof obterQuantidadePropriaOperacional === 'function'
                    ? obterQuantidadePropriaOperacional(item)
                    : Math.max(parseInt(item.quantidade, 10) || 0, 0);
                const idQtd = `dev-qtd-${itemIndex}`;
                const idAvaria = `dev-avaria-${itemIndex}`;
                const idObs = `dev-obs-${itemIndex}`;
                const idErro = `dev-erro-${itemIndex}`;

                return `
                    <div class="devolucao-item" data-item-index="${itemIndex}" data-pendente="${pendente}" aria-invalid="false">
                        <div class="devolucao-item-info">
                            <strong>${escaparHTMLDevolucao(item.nome)}</strong>
                            <small>Total comercial: ${item.quantidade} | Próprio: ${quantidadePropria} | Já conferido: ${(parseInt(item.devolvidos, 10) || 0) + (parseInt(item.avariadosEstoqueProprio, 10) || 0)} | Pendente: ${pendente}</small>
                        </div>
                        <div class="form-group">
                            <label for="${idQtd}">Qtd devolvida</label>
                            <input id="${idQtd}" type="number" class="dev-qtd" data-item-index="${itemIndex}" data-peca-id="${item.pecaId}" min="0" max="${pendente}" value="0" aria-describedby="${idErro}" aria-invalid="false" data-input="onInputConferenciaDevolucao" data-arg="__this__">
                        </div>
                        <div class="form-group">
                            <label for="${idAvaria}">Avaria/perda</label>
                            <input id="${idAvaria}" type="number" class="dev-avaria" data-item-index="${itemIndex}" data-peca-id="${item.pecaId}" min="0" max="${pendente}" value="0" aria-describedby="${idErro}" aria-invalid="false" data-input="onInputConferenciaDevolucao" data-arg="__this__">
                        </div>
                        <div class="form-group">
                            <label for="${idObs}">Observação</label>
                            <input id="${idObs}" type="text" class="dev-obs" data-item-index="${itemIndex}" data-peca-id="${item.pecaId}" placeholder="Ex: peça riscada">
                        </div>
                        <input type="hidden" class="dev-valor" data-item-index="${itemIndex}" data-peca-id="${item.pecaId}" value="${valor}">
                        <small id="${idErro}" class="dev-linha-erro" role="alert" hidden></small>
                    </div>
                `;
            }).join('')}
        </div>
        <div id="devResumoLive" class="devolucao-resumo-live"></div>
        <small style="display:block; margin-top:10px; color:var(--text-light)">
            A quantidade em "Qtd devolvida" volta para o estoque. Use "Avaria/perda" apenas para registrar conferência.
        </small>
    `;

    atualizarResumoConferenciaDevolucao();
    const primeiroCampoQtd = div.querySelector('.dev-qtd');
    if (primeiroCampoQtd instanceof HTMLElement) {
        setTimeout(() => primeiroCampoQtd.focus(), 80);
    }
}

function validarQtdDevolucao(input) {
    let valor = parseInt(input.value);

    if (isNaN(valor) || valor < 0) valor = 0;
    input.value = valor;
    const linha = input.closest('.devolucao-item');
    if (linha) validarLinhaConferenciaDevolucao(linha);
}

function confirmarDevolucao() {
    if (devolucaoEmProcessamento) return;

    const id = document.getElementById('devLocacao').value;
    if (!id) {
        informarErroLocacaoDevolucao();
        return;
    }

    const dataDevolucao = document.getElementById('devData').value;
    if (!dataDevolucao) {
        mostrarToast("Informe a data da devolução.", "erro");
        focarCampoDevolucao('devData');
        return;
    }

    const l = locacoes.find(x => x.id == id);
    if (!l) {
        mostrarToast("Locação não encontrada.", "erro");
        focarCampoDevolucao('devLocacao');
        return;
    }

    const itensDevolvidos = [];
    const pendencias = [];
    const linhas = Array.from(document.querySelectorAll('.devolucao-item'));
    const primeiraLinhaInvalida = linhas.find((linha) => !validarLinhaConferenciaDevolucao(linha).valida);
    if (primeiraLinhaInvalida) {
        const itemIndex = parseInt(primeiraLinhaInvalida.dataset.itemIndex, 10);
        const item = l.items?.[itemIndex];
        const pendente = Math.max(parseInt(primeiraLinhaInvalida.dataset.pendente, 10) || 0, 0);
        mostrarToast(`"${item?.nome || 'Item'}" excedeu a quantidade própria pendente (${pendente}).`, 'erro');
        validarLinhaConferenciaDevolucao(primeiraLinhaInvalida, { focar: true });
        return;
    }

    linhas.forEach((linha) => {
        const itemIndex = parseInt(linha.dataset.itemIndex, 10);
        const item = l.items?.[itemIndex];
        if (!item) return;

        const validacao = validarLinhaConferenciaDevolucao(linha);
        if (validacao.informado <= 0) return;

        pendencias.push({
            item,
            itemIndex,
            pendenteAntes: validacao.pendente,
            qtdDevolvida: validacao.quantidadeDevolvida,
            qtdAvaria: validacao.quantidadeAvaria,
            obs: String(linha.querySelector('.dev-obs')?.value || '').trim()
        });
    });

    if (pendencias.length === 0) {
        mostrarToast("Informe pelo menos uma quantidade para devolução ou avaria.", "erro");
        const primeiroCampoQtd = document.querySelector('.dev-qtd');
        if (primeiroCampoQtd instanceof HTMLElement) primeiroCampoQtd.focus();
        return;
    }

    pendencias.forEach((registro) => {
        const { item, itemIndex, pendenteAntes, qtdDevolvida, qtdAvaria, obs } = registro;
        itensDevolvidos.push({
            itemIndex,
            pecaId: item.pecaId,
            nome: item.nome,
            quantidadeLocada: parseInt(item.quantidade, 10) || 0,
            quantidadeDevolvida: qtdDevolvida,
            quantidadeAvaria: qtdAvaria,
            quantidadePendenteAntes: pendenteAntes,
            quantidadePendenteApos: Math.max(pendenteAntes - qtdDevolvida - qtdAvaria, 0),
            valorUnitario: parseFloat(item.valor) || 0,
            observacao: obs
        });
    });

    const devolucaoTotal = (l.items || []).every((item, itemIndex) => {
        const reg = pendencias.find((p) => p.itemIndex === itemIndex);
        const qtdDevolvida = reg?.qtdDevolvida || 0;
        const qtdAvaria = reg?.qtdAvaria || 0;
        const pendenteApos = Math.max(getQtdPendenteItem(item) - qtdDevolvida - qtdAvaria, 0);
        return pendenteApos === 0;
    });

    const dadosNovaDevolucao = {
        locacaoId: l.id,
        dataDevolucao,
        tipo: devolucaoTotal ? 'total' : 'parcial',
        obs: devolucaoTotal ? 'Total' : 'Parcial',
        itens: itensDevolvidos
    };
    const operacaoId = obterSubmissaoDevolucao(l.id);

    const concluirRegistroDevolucao = () => {
        if (devolucaoEmProcessamento) return;
        if (devolucoes.some((registro) => String(registro?.operacaoId || '') === operacaoId)) {
            mostrarToast('Esta operação de devolução já foi registrada.', 'info');
            return;
        }

        devolucaoEmProcessamento = true;
        atualizarEstadoBotaoRegistroDevolucao();

        const estadoAnteriorItens = pendencias.map(({ item }) => ({
            item,
            devolvidos: item.devolvidos,
            avariadosEstoqueProprio: item.avariadosEstoqueProprio
        }));
        const estadoAnteriorPecas = new Map();
        pendencias.forEach(({ item }) => {
            const peca = Array.isArray(pecas)
                ? pecas.find((registroPeca) => String(registroPeca?.id || '') === String(item.pecaId || ''))
                : null;
            if (peca && !estadoAnteriorPecas.has(peca)) estadoAnteriorPecas.set(peca, peca.avariado);
        });
        const estadoAnteriorLocacao = {
            status: l.status,
            statusFluxo: l.statusFluxo,
            estoqueReserva: l.estoqueReserva && typeof l.estoqueReserva === 'object'
                ? JSON.parse(JSON.stringify(l.estoqueReserva))
                : l.estoqueReserva,
            historicoAlteracoes: Array.isArray(l.historicoAlteracoes)
                ? l.historicoAlteracoes.slice()
                : l.historicoAlteracoes
        };
        const movimentacoesAnteriores = Array.isArray(movimentacoesEstoque)
            ? movimentacoesEstoque.slice()
            : [];
        const devolucoesAnteriores = devolucoes.slice();
        const movimentacoesRegistradas = [];

        try {
            if (typeof registrarMovimentacaoEstoque !== 'function') {
                throw new Error('Serviço de movimentação de estoque indisponível.');
            }

            pendencias.forEach((registro) => {
                const { item, itemIndex, qtdDevolvida, qtdAvaria, obs } = registro;
                const pecaIdMov = String(item.pecaId || '');

                if (qtdDevolvida > 0) {
                    const movimentacao = registrarMovimentacaoEstoque({
                        id: `mov-${operacaoId}-${itemIndex}-devolucao`,
                        chaveIdempotencia: `devolucao|op:${operacaoId}|item:${itemIndex}|peca:${pecaIdMov}`,
                        tipoMovimentacao: 'devolucao',
                        quantidade: Math.max(0, Math.trunc(qtdDevolvida)),
                        pecaId: pecaIdMov,
                        pecaNome: item.nome,
                        locacaoId: String(l.id),
                        origemEvento: operacaoId,
                        observacao: obs ? `Devolução: ${obs}` : `Devolução registrada em ${dataDevolucao}.`
                    });
                    if (!movimentacao) throw new Error(`Falha ao registrar devolução de "${item.nome}".`);
                    movimentacoesRegistradas.push(movimentacao);
                }

                if (qtdAvaria > 0) {
                    const movimentacao = registrarMovimentacaoEstoque({
                        id: `mov-${operacaoId}-${itemIndex}-avaria`,
                        chaveIdempotencia: `avaria|op:${operacaoId}|item:${itemIndex}|peca:${pecaIdMov}`,
                        tipoMovimentacao: 'avaria',
                        quantidade: Math.max(0, Math.trunc(qtdAvaria)),
                        pecaId: pecaIdMov,
                        pecaNome: item.nome,
                        locacaoId: String(l.id),
                        origemEvento: operacaoId,
                        observacao: obs ? `Avaria: ${obs}` : `Avaria registrada em ${dataDevolucao}.`
                    });
                    if (!movimentacao) throw new Error(`Falha ao registrar avaria de "${item.nome}".`);
                    movimentacoesRegistradas.push(movimentacao);
                }
            });

            pendencias.forEach((registro) => {
                const { item, qtdDevolvida, qtdAvaria } = registro;
                item.devolvidos = (parseInt(item.devolvidos, 10) || 0) + qtdDevolvida;
                item.avariadosEstoqueProprio = (parseInt(item.avariadosEstoqueProprio, 10) || 0) + qtdAvaria;

                if (qtdAvaria > 0 && Array.isArray(pecas)) {
                    const peca = pecas.find((registroPeca) => String(registroPeca?.id || '') === String(item.pecaId || ''));
                    if (peca) peca.avariado = (parseInt(peca.avariado, 10) || 0) + qtdAvaria;
                }
            });

            const agora = new Date().toISOString();
            const responsavel = obterResponsavelDevolucao();
            l.status = devolucaoTotal ? 'devolvido' : 'ativo';
            if (devolucaoTotal) {
                if (typeof atualizarStatusLocacaoDominio === 'function') {
                    atualizarStatusLocacaoDominio(l, 'devolvido', {
                        acao: 'devolucao_total',
                        descricao: 'Locação encerrada com devolução total dos itens.',
                        origem: 'devolucoes',
                        usuario: responsavel
                    });
                }

                const reservaAnterior = l.estoqueReserva && typeof l.estoqueReserva === 'object'
                    ? l.estoqueReserva
                    : {};
                l.estoqueReserva = {
                    ...reservaAnterior,
                    status: 'liberado',
                    liberadoEm: agora,
                    liberadoPor: responsavel,
                    motivo: 'devolucao_total',
                    movimentacaoIds: Array.from(new Set([
                        ...(Array.isArray(reservaAnterior.movimentacaoIds) ? reservaAnterior.movimentacaoIds : []),
                        ...movimentacoesRegistradas.map((movimentacao) => movimentacao.id).filter(Boolean)
                    ]))
                };
                if (typeof registrarHistoricoLocacaoDominio === 'function') {
                    registrarHistoricoLocacaoDominio(l, {
                        acao: 'estoque_reserva_liberada',
                        descricao: 'Reserva de estoque liberada após devolução total.',
                        origem: 'devolucoes',
                        usuario: responsavel
                    });
                }
            } else if (typeof registrarHistoricoLocacaoDominio === 'function') {
                registrarHistoricoLocacaoDominio(l, {
                    acao: 'devolucao_parcial',
                    descricao: 'Devolução parcial registrada para a locação.',
                    origem: 'devolucoes',
                    usuario: responsavel
                });
            }
            const novaDevolucaoId = Date.now();

            devolucoes.push({
                id: novaDevolucaoId,
                operacaoId,
                criadoEm: agora,
                criadoPor: responsavel,
                ...dadosNovaDevolucao
            });

            if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
            salvarLocal();
            renderTudo();
            limparFormularioDevolucaoAposRegistro();
            if (typeof focarRegistroRecemSalvo === 'function') {
                focarRegistroRecemSalvo({ tipo: 'devolucao', id: novaDevolucaoId, limparBusca: false });
            }
            sincronizar('salvar');

            const cliente = locadores.find(x => x.id === l.locadorId);
            registrarLog('devolucao', devolucaoTotal ? 'criar' : 'parcial', `Devolução ${devolucaoTotal ? 'total' : 'parcial'}: ${cliente?.nome || 'Cliente'} - ${itensDevolvidos.length} item(ns)`);
            mostrarToast(devolucaoTotal ? 'Devolução total registrada!' : 'Devolução parcial registrada!');
        } catch (erro) {
            estadoAnteriorItens.forEach((estado) => {
                estado.item.devolvidos = estado.devolvidos;
                estado.item.avariadosEstoqueProprio = estado.avariadosEstoqueProprio;
            });
            estadoAnteriorPecas.forEach((avariado, peca) => {
                peca.avariado = avariado;
            });
            l.status = estadoAnteriorLocacao.status;
            l.statusFluxo = estadoAnteriorLocacao.statusFluxo;
            l.estoqueReserva = estadoAnteriorLocacao.estoqueReserva;
            l.historicoAlteracoes = estadoAnteriorLocacao.historicoAlteracoes;
            if (Array.isArray(movimentacoesEstoque)) {
                movimentacoesEstoque.splice(0, movimentacoesEstoque.length, ...movimentacoesAnteriores);
            }
            devolucoes.splice(0, devolucoes.length, ...devolucoesAnteriores);
            mostrarToast(erro?.message || 'Não foi possível registrar a devolução.', 'erro');
        } finally {
            devolucaoEmProcessamento = false;
            atualizarResumoConferenciaDevolucao();
            atualizarEstadoBotaoRegistroDevolucao({ informado: 0, temInvalido: false });
        }
    };

    const devolucaoDuplicada = encontrarDevolucaoPossivelmenteDuplicada(dadosNovaDevolucao);
    if (devolucaoDuplicada) {
        const sufixo = String(devolucaoDuplicada.id || '').slice(-4) || '----';
        confirmarAcao(
            `Já existe uma devolução parecida nesta data (#${sufixo}). Deseja registrar mesmo assim?`,
            () => {
                concluirRegistroDevolucao();
            },
            {
                titulo: 'Possível duplicidade',
                textoConfirmar: 'Registrar mesmo assim',
                classeConfirmar: 'btn-warning'
            }
        );
        return;
    }

    concluirRegistroDevolucao();
}

function limparFormularioDevolucaoAposRegistro() {
    const seletor = document.getElementById('devLocacao');
    const data = document.getElementById('devData');
    const painel = document.getElementById('divItensDevolucao');
    const botao = document.getElementById('btnRegistrarDevolucao');

    if (seletor) seletor.value = '';
    if (data) data.value = obterDataLocalIsoDevolucao();
    if (painel) {
        painel.dataset.devolucaoSubmissaoId = renovarSubmissaoDevolucao();
        painel.innerHTML = criarEstadoDevolucaoPainel({
            tipo: 'info',
            titulo: 'Selecione uma locação',
            mensagem: 'Escolha uma locação em aberto para iniciar a conferência.'
        });
    }
    if (botao?.dataset.actionBusy === '1') {
        botao.dataset.actionDisabledPrev = '1';
    }
    limparErroLocacaoDevolucao();
    atualizarEstadoBotaoRegistroDevolucao({ informado: 0, temInvalido: false });
}

window.preencherDevolucaoCompleta = preencherDevolucaoCompleta;
window.limparConferenciaDevolucao = limparConferenciaDevolucao;
window.atualizarResumoConferenciaDevolucao = atualizarResumoConferenciaDevolucao;
window.onInputConferenciaDevolucao = onInputConferenciaDevolucao;

window.addEventListener('load', () => {
    setTimeout(() => {
        atualizarEstadoBotaoRegistroDevolucao();
    }, 180);
}, { once: true });
