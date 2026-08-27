// Devoluções: conferência total ou parcial por item
let devolucaoEmProcessamento = false;
let devolucaoSubmissaoId = '';
let devolucaoSubmissaoLocacaoId = '';

function criarReferenciaTipadaLocacao(id) {
    const identidade = normalizarIdEntidadeExato(id);
    if (!identidade.valido) return '';
    return `locacao:${encodeURIComponent(JSON.stringify([identidade.tipo, identidade.valor]))}`;
}

function resolverLocacaoPorIdExato(id, colecao = locacoes) {
    const resultado = resolverRegistroPorIdExato(colecao, id);
    return { ...resultado, locacao: resultado.registro };
}

function resolverLocacaoPorReferenciaTipada(referencia, colecao = locacoes) {
    if (typeof referencia !== 'string' || !referencia.startsWith('locacao:')) {
        return { encontrado: false, estado: 'invalido', codigo: 'REFERENCIA_INVALIDA', registro: null, locacao: null, quantidade: 0 };
    }

    let dados;
    try {
        dados = JSON.parse(decodeURIComponent(referencia.slice('locacao:'.length)));
    } catch (_erro) {
        return { encontrado: false, estado: 'invalido', codigo: 'REFERENCIA_INVALIDA', registro: null, locacao: null, quantidade: 0 };
    }

    if (!Array.isArray(dados) || dados.length !== 2) {
        return { encontrado: false, estado: 'invalido', codigo: 'REFERENCIA_INVALIDA', registro: null, locacao: null, quantidade: 0 };
    }

    const [tipo, id] = dados;
    const identidade = normalizarIdEntidadeExato(id);
    if (!identidade.valido || identidade.tipo !== tipo || criarReferenciaTipadaLocacao(id) !== referencia) {
        return { encontrado: false, estado: 'invalido', codigo: 'REFERENCIA_INVALIDA', registro: null, locacao: null, quantidade: 0 };
    }

    return resolverLocacaoPorIdExato(identidade.valor, colecao);
}

function obterMensagemIdentidadeLocacaoDevolucao(resultado) {
    if (resultado?.estado === 'duplicado') {
        return 'Existem locações com o mesmo identificador. Corrija o cadastro antes de registrar a devolução.';
    }
    if (resultado?.estado === 'invalido') {
        return 'A referência da locação é inválida. Atualize a lista e selecione novamente.';
    }
    return 'A locação selecionada não está mais disponível. Atualize a lista e tente novamente.';
}

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

function informarErroLocacaoDevolucao(texto = 'Selecione uma locação pendente para registrar a devolução.') {
    const campo = document.getElementById('devLocacao');
    const mensagem = document.getElementById('devLocacaoErro');

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
    devolucaoSubmissaoLocacaoId = criarReferenciaTipadaLocacao(locacaoId);
    return devolucaoSubmissaoId;
}

function obterSubmissaoDevolucao(locacaoId) {
    const referenciaLocacao = criarReferenciaTipadaLocacao(locacaoId);
    if (!referenciaLocacao) return '';
    if (!devolucaoSubmissaoId || devolucaoSubmissaoLocacaoId !== referenciaLocacao) {
        return renovarSubmissaoDevolucao(locacaoId);
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
    const identidadeLocacao = normalizarIdEntidadeExato(dadosDevolucao?.locacaoId);
    const dataDevolucao = String(dadosDevolucao?.dataDevolucao || '').trim();
    const assinatura = normalizarAssinaturaItensDevolucao(dadosDevolucao?.itens || []);

    if (!identidadeLocacao.valido || !dataDevolucao || !assinatura) return null;

    return devolucoes.find((registro) => {
        if (!idsEntidadeExatos(registro?.locacaoId, identidadeLocacao.valor)) return false;
        if (String(registro?.dataDevolucao || '').trim() !== dataDevolucao) return false;
        const assinaturaExistente = normalizarAssinaturaItensDevolucao(registro?.itens || []);
        return assinaturaExistente === assinatura;
    }) || null;
}

function carregarItensDevolucao() {
    const referenciaLocacao = document.getElementById('devLocacao').value;
    const div = document.getElementById('divItensDevolucao');
    if (!div) return;

    div.innerHTML = "";
    if (!referenciaLocacao) {
        div.innerHTML = criarEstadoDevolucaoPainel({
            tipo: 'info',
            titulo: 'Selecione uma locação',
            mensagem: 'Escolha uma locação em aberto para iniciar a conferência.'
        });
        focarCampoDevolucao('devLocacao');
        return;
    }

    const resultadoLocacao = resolverLocacaoPorReferenciaTipada(referenciaLocacao);
    const l = resultadoLocacao.encontrado ? resultadoLocacao.locacao : null;
    if (!l) {
        div.innerHTML = criarEstadoDevolucaoPainel({
            tipo: 'error',
            titulo: resultadoLocacao.estado === 'duplicado' ? 'Identificador duplicado' : 'Locação não encontrada',
            mensagem: obterMensagemIdentidadeLocacaoDevolucao(resultadoLocacao)
        });
        informarErroLocacaoDevolucao(obterMensagemIdentidadeLocacaoDevolucao(resultadoLocacao));
        focarCampoDevolucao('devLocacao');
        return;
    }
    limparErroLocacaoDevolucao();
    const submissaoId = obterSubmissaoDevolucao(l.id);
    div.dataset.devolucaoSubmissaoId = submissaoId;

    const clienteResolvido = resolverClientePorIdExato(locadores, l.locadorId);
    const cliente = clienteResolvido.encontrado ? clienteResolvido.cliente : null;
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

    const referenciaLocacao = document.getElementById('devLocacao').value;
    if (!referenciaLocacao) {
        informarErroLocacaoDevolucao();
        return;
    }

    const dataDevolucao = document.getElementById('devData').value;
    if (!dataDevolucao) {
        mostrarToast("Informe a data da devolução.", "erro");
        focarCampoDevolucao('devData');
        return;
    }

    const resultadoLocacao = resolverLocacaoPorReferenciaTipada(referenciaLocacao);
    const l = resultadoLocacao.encontrado ? resultadoLocacao.locacao : null;
    if (!l) {
        informarErroLocacaoDevolucao(obterMensagemIdentidadeLocacaoDevolucao(resultadoLocacao));
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
            itemId: String(item.itemId || '').trim(),
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
        devolucaoEmProcessamento = true;
        atualizarEstadoBotaoRegistroDevolucao();
        let resultado = null;
        try {
            if (typeof criarDependenciasExecutorAjusteLocacao !== 'function'
                || typeof executarDevolucaoLocacaoTransacional !== 'function') {
                throw new Error('Infraestrutura transacional de devoluções indisponível.');
            }
            const instante = new Date();
            const atualizadoEm = instante.toISOString();
            const dependencias = criarDependenciasExecutorAjusteLocacao({ armazenamento: localStorage });
            resultado = executarDevolucaoLocacaoTransacional({
                locacaoId: l.id,
                operacaoId,
                dataDevolucao,
                itens: itensDevolvidos.map((item) => ({
                    itemIndex: item.itemIndex,
                    itemId: item.itemId,
                    quantidadeDevolvida: item.quantidadeDevolvida,
                    quantidadeAvaria: item.quantidadeAvaria,
                    observacao: item.observacao
                })),
                atualizadoEm,
                atualizadoPor: obterResponsavelDevolucao(),
                persistencia: {
                    versao: window.SCHEMA_VERSION_V12 || '12.6',
                    data: atualizadoEm,
                    ultimaEdicao: instante.getTime()
                }
            }, dependencias);
        } catch (erro) {
            resultado = {
                ok: false,
                codigo: 'FALHA_INTEGRACAO_TRANSACIONAL',
                bloqueios: [{ mensagem: String(erro?.message || erro) }],
                efeitos: { renderizar: false, sincronizar: false }
            };
        } finally {
            devolucaoEmProcessamento = false;
            atualizarEstadoBotaoRegistroDevolucao();
        }

        if ((resultado?.codigo === 'DEVOLUCAO_APLICADA' || resultado?.codigo === 'OPERACAO_JA_CONCLUIDA')
            && resultado.ok) {
            const idempotente = resultado.codigo === 'OPERACAO_JA_CONCLUIDA';
            limparFormularioDevolucaoAposRegistro();
            if (resultado?.efeitos?.renderizar === true && typeof renderTudo === 'function') {
                try {
                    renderTudo();
                } catch (erro) {
                    console.error('Devolução confirmada, mas a atualização visual falhou:', erro);
                }
            }
            const devolucaoId = resultado?.operacao?.devolucaoId;
            if (devolucaoId && typeof focarRegistroRecemSalvo === 'function') {
                focarRegistroRecemSalvo({ tipo: 'devolucao', id: devolucaoId, limparBusca: false });
            }
            if (resultado?.efeitos?.sincronizar === true && typeof sincronizar === 'function') {
                try {
                    const sincronizacao = sincronizar('salvar');
                    if (sincronizacao && typeof sincronizacao.catch === 'function') {
                        sincronizacao.catch((erro) => console.error('Sincronização da devolução ficou pendente:', erro));
                    }
                } catch (erro) {
                    console.error('Sincronização da devolução não iniciou:', erro);
                }
            }
            const syncPendente = (resultado?.avisos || []).some((aviso) => aviso?.codigo === 'METADADO_SYNC_PENDENTE');
            if (syncPendente) {
                mostrarToast('Devolução aplicada. A atualização de sincronização ficou pendente.', 'info', 7200);
            } else {
                mostrarToast(idempotente
                    ? 'Esta devolução já estava registrada.'
                    : (resultado?.operacao?.tipo === 'total'
                        ? 'Devolução total registrada!'
                        : 'Devolução parcial registrada!'));
            }
            return;
        }
        if (resultado?.requerRecuperacao
            || ['OPERACAO_REQUER_RECUPERACAO', 'ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', 'PERSISTENCIA_INDETERMINADA'].includes(resultado?.codigo)) {
            mostrarToast('A devolução exige recuperação explícita. Nenhuma nova tentativa automática foi feita.', 'erro', 8500);
            return;
        }
        const mensagem = resultado?.bloqueios?.[0]?.mensagem
            || 'Não foi possível registrar a devolução com segurança.';
        mostrarToast(mensagem, 'erro', 7200);
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
window.criarReferenciaTipadaLocacao = criarReferenciaTipadaLocacao;
window.resolverLocacaoPorIdExato = resolverLocacaoPorIdExato;
window.resolverLocacaoPorReferenciaTipada = resolverLocacaoPorReferenciaTipada;

window.addEventListener('load', () => {
    setTimeout(() => {
        atualizarEstadoBotaoRegistroDevolucao();
    }, 180);
}, { once: true });
