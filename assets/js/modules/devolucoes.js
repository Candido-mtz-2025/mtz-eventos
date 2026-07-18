// Devoluções: conferência total ou parcial por item
function getQtdPendenteItem(item) {
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
        return;
    }
    resumo.classList.remove('is-empty');

    let totalPendente = 0;
    let totalDevolvido = 0;
    let totalAvaria = 0;

    itens.forEach((item) => {
        const qtd = item.querySelector('.dev-qtd');
        const avaria = item.querySelector('.dev-avaria');
        const pendente = parseInt(qtd?.max, 10) || 0;

        totalPendente += pendente;
        totalDevolvido += parseInt(qtd?.value, 10) || 0;
        totalAvaria += parseInt(avaria?.value, 10) || 0;
    });

    const restante = Math.max(totalPendente - totalDevolvido - totalAvaria, 0);
    const classe = restante === 0 ? 'badge-success' : 'badge-warning';
    const texto = restante === 0 ? 'Conferência completa' : `${restante} item(ns) ainda pendente(s)`;

    resumo.innerHTML = `
        <span><b>Pendente:</b> ${totalPendente}</span>
        <span><b>Devolvido:</b> ${totalDevolvido}</span>
        <span><b>Avaria/perda:</b> ${totalAvaria}</span>
        <span class="badge ${classe}">${texto}</span>
    `;
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
        .map((item) => ({
            pecaId: String(item?.pecaId ?? '').trim(),
            qtd: parseInt(item?.quantidadeDevolvida, 10) || 0,
            avaria: parseInt(item?.quantidadeAvaria, 10) || 0
        }))
        .filter((item) => item.pecaId && (item.qtd > 0 || item.avaria > 0))
        .sort((a, b) => a.pecaId.localeCompare(b.pecaId))
        .map((item) => `${item.pecaId}:${item.qtd}:${item.avaria}`)
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

    const cliente = locadores.find(x => x.id === l.locadorId);
    const itensPendentes = (l.items || []).filter(item => getQtdPendenteItem(item) > 0);
    const totalPendente = itensPendentes.reduce((total, item) => total + getQtdPendenteItem(item), 0);

    if (itensPendentes.length === 0) {
        div.innerHTML = criarEstadoDevolucaoPainel({
            tipo: 'success',
            titulo: 'Conferência finalizada',
            mensagem: 'Todos os itens desta locação já foram devolvidos.'
        });
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
            ${itensPendentes.map((item, index) => {
                const pendente = getQtdPendenteItem(item);
                const valor = Number(item.valor || 0);

                return `
                    <div class="devolucao-item">
                        <div class="devolucao-item-info">
                            <strong>${escaparHTMLDevolucao(item.nome)}</strong>
                            <small>Locado: ${item.quantidade} | Já devolvido: ${item.devolvidos || 0} | Pendente: ${pendente}</small>
                        </div>
                        <div class="form-group">
                            <label>Qtd devolvida</label>
                            <input type="number" class="dev-qtd" data-peca-id="${item.pecaId}" data-index="${index}" min="0" max="${pendente}" value="${pendente}" data-input="onInputConferenciaDevolucao" data-arg="__this__">
                        </div>
                        <div class="form-group">
                            <label>Avaria/perda</label>
                            <input type="number" class="dev-avaria" data-peca-id="${item.pecaId}" min="0" max="${pendente}" value="0" data-input="onInputConferenciaDevolucao" data-arg="__this__">
                        </div>
                        <div class="form-group">
                            <label>Observação</label>
                            <input type="text" class="dev-obs" data-peca-id="${item.pecaId}" placeholder="Ex: peça riscada">
                        </div>
                        <input type="hidden" class="dev-valor" data-peca-id="${item.pecaId}" value="${valor}">
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
    const maximo = parseInt(input.max) || 0;
    let valor = parseInt(input.value);

    if (isNaN(valor) || valor < 0) valor = 0;
    if (valor > maximo) valor = maximo;

    input.value = valor;
}

function confirmarDevolucao() {
    const id = document.getElementById('devLocacao').value;
    if (!id) {
        mostrarToast("Selecione uma locacao para devolver.", "erro");
        focarCampoDevolucao('devLocacao');
        return;
    }

    const dataDevolucao = document.getElementById('devData').value;
    if (!dataDevolucao) {
        mostrarToast("Informe a data da devolucao.", "erro");
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
    let validacaoFalhou = false;

    (l.items || []).forEach(item => {
        const pendenteAntes = getQtdPendenteItem(item);
        if (pendenteAntes <= 0) return;

        const inputQtd = document.querySelector(`.dev-qtd[data-peca-id="${item.pecaId}"]`);
        const inputAvaria = document.querySelector(`.dev-avaria[data-peca-id="${item.pecaId}"]`);
        const inputObs = document.querySelector(`.dev-obs[data-peca-id="${item.pecaId}"]`);

        const qtdDevolvidaInformada = Math.max(0, parseInt(inputQtd?.value, 10) || 0);
        const qtdAvariaInformada = Math.max(0, parseInt(inputAvaria?.value, 10) || 0);
        const qtdDevolvida = Math.min(qtdDevolvidaInformada, pendenteAntes);
        const qtdAvaria = Math.min(qtdAvariaInformada, pendenteAntes);
        const obs = (inputObs?.value || '').trim();

        if (qtdDevolvidaInformada > pendenteAntes
            || qtdAvariaInformada > pendenteAntes
            || (qtdDevolvidaInformada + qtdAvariaInformada) > pendenteAntes) {
            mostrarToast(`"${item.nome}" excedeu a quantidade pendente (${pendenteAntes}).`, "erro");
            const primeiroCampoInvalido = inputQtd || inputAvaria;
            if (primeiroCampoInvalido instanceof HTMLElement) primeiroCampoInvalido.focus();
            validacaoFalhou = true;
            return;
        }

        if (qtdDevolvida <= 0 && qtdAvaria <= 0) return;

        pendencias.push({
            item,
            pendenteAntes,
            qtdDevolvida,
            qtdAvaria,
            obs
        });
    });

    if (validacaoFalhou) return;

    if (pendencias.length === 0) {
        mostrarToast("Informe pelo menos uma quantidade para devolucao ou avaria.", "erro");
        const primeiroCampoQtd = document.querySelector('.dev-qtd');
        if (primeiroCampoQtd instanceof HTMLElement) primeiroCampoQtd.focus();
        return;
    }

    pendencias.forEach((registro) => {
        const { item, pendenteAntes, qtdDevolvida, qtdAvaria, obs } = registro;
        itensDevolvidos.push({
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

    const devolucaoTotal = (l.items || []).every((item) => {
        const reg = pendencias.find((p) => String(p.item?.pecaId) === String(item?.pecaId));
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
    const assinaturaConfirmacaoDevolucao = normalizarAssinaturaItensDevolucao(itensDevolvidos);
    const identificadorConfirmacaoDevolucao = `dev-${String(l.id || '')}-${String(dataDevolucao || '')}-${assinaturaConfirmacaoDevolucao}`;

    const concluirRegistroDevolucao = () => {
        pendencias.forEach((registro) => {
            const { item, qtdDevolvida, qtdAvaria } = registro;
            item.devolvidos = (parseInt(item.devolvidos, 10) || 0) + qtdDevolvida;
            item.avariadosEstoqueProprio = (parseInt(item.avariadosEstoqueProprio, 10) || 0) + qtdAvaria;

            if (qtdAvaria > 0 && Array.isArray(pecas)) {
                const peca = pecas.find((registroPeca) => String(registroPeca?.id || '') === String(item.pecaId || ''));
                if (peca) {
                    peca.avariado = (parseInt(peca.avariado, 10) || 0) + qtdAvaria;
                }
            }
        });

        if (typeof registrarMovimentacaoEstoque === 'function') {
            pendencias.forEach((registro) => {
                const { item, qtdDevolvida, qtdAvaria, obs } = registro;
                const pecaIdMov = String(item.pecaId || '');

                if (qtdDevolvida > 0) {
                    registrarMovimentacaoEstoque({
                        id: `mov-${l.id}-${item.pecaId}-devolucao-${dataDevolucao}`,
                        chaveIdempotencia: `devolucao|conf:${identificadorConfirmacaoDevolucao}|locacao:${String(l.id)}|peca:${pecaIdMov}|q:${qtdDevolvida}`,
                        tipoMovimentacao: 'devolucao',
                        quantidade: Math.max(0, Math.trunc(qtdDevolvida)),
                        pecaId: pecaIdMov,
                        pecaNome: item.nome,
                        locacaoId: String(l.id),
                        origemEvento: identificadorConfirmacaoDevolucao,
                        observacao: obs ? `Devolução: ${obs}` : `Devolução registrada em ${dataDevolucao}.`
                    });
                }

                if (qtdAvaria > 0) {
                    registrarMovimentacaoEstoque({
                        id: `mov-${l.id}-${item.pecaId}-avaria-${dataDevolucao}`,
                        chaveIdempotencia: `avaria|conf:${identificadorConfirmacaoDevolucao}|locacao:${String(l.id)}|peca:${pecaIdMov}|q:${qtdAvaria}`,
                        tipoMovimentacao: 'avaria',
                        quantidade: Math.max(0, Math.trunc(qtdAvaria)),
                        pecaId: pecaIdMov,
                        pecaNome: item.nome,
                        locacaoId: String(l.id),
                        origemEvento: identificadorConfirmacaoDevolucao,
                        observacao: obs ? `Avaria: ${obs}` : `Avaria registrada em ${dataDevolucao}.`
                    });
                }
            });
        }

        l.status = devolucaoTotal ? 'devolvido' : 'ativo';
        if (devolucaoTotal && typeof atualizarStatusLocacaoDominio === 'function') {
            atualizarStatusLocacaoDominio(l, 'devolvido', {
                acao: 'devolucao_total',
                descricao: 'Locação encerrada com devolução total dos itens.',
                origem: 'devolucoes'
            });
        } else if (typeof registrarHistoricoLocacaoDominio === 'function') {
            registrarHistoricoLocacaoDominio(l, {
                acao: 'devolucao_parcial',
                descricao: 'Devolução parcial registrada para a locação.',
                origem: 'devolucoes'
            });
        }
        const novaDevolucaoId = Date.now();

        devolucoes.push({
            id: novaDevolucaoId,
            ...dadosNovaDevolucao
        });

        if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
        salvarLocal();
        renderTudo();
        if (typeof focarRegistroRecemSalvo === 'function') {
            focarRegistroRecemSalvo({ tipo: 'devolucao', id: novaDevolucaoId, limparBusca: false });
        }
        sincronizar('salvar');

        const cliente = locadores.find(x => x.id === l.locadorId);
        registrarLog('devolucao', devolucaoTotal ? 'criar' : 'parcial', `Devolução ${devolucaoTotal ? 'total' : 'parcial'}: ${cliente?.nome || 'Cliente'} - ${itensDevolvidos.length} item(ns)`);

        mostrarToast(devolucaoTotal ? "Devolução total registrada!" : "Devolução parcial registrada!");
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

window.preencherDevolucaoCompleta = preencherDevolucaoCompleta;
window.limparConferenciaDevolucao = limparConferenciaDevolucao;
window.atualizarResumoConferenciaDevolucao = atualizarResumoConferenciaDevolucao;
window.onInputConferenciaDevolucao = onInputConferenciaDevolucao;
