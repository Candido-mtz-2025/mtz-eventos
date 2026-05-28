// Busca inteligente e operacoes de locacao
let locacaoEtapaAtual = 1;
let fluxoLocacaoInicializado = false;
const CHAVE_FILTRO_LOCACOES = 'mtz:locacoesFiltro';
const FILTROS_LOCACOES_VALIDOS = new Set(['todos', 'ativo', 'atrasado', 'devolvido']);

function obterDisponivelPecaLocacao(peca) {
    if (!peca) return 0;
    const normalizada = typeof normalizarPecaDominio === 'function' ? normalizarPecaDominio(peca) : peca;
    return Math.max(parseInt(normalizada?.disponivel, 10) || 0, 0);
}

function sincronizarFinanceiroLocacao(localLocacao) {
    if (!localLocacao || typeof localLocacao !== 'object') return localLocacao;
    if (typeof normalizarLocacaoDominio === 'function') {
        return normalizarLocacaoDominio(localLocacao, { incluirDerivados: false });
    }
    return localLocacao;
}

function focarCampoLocacao(idCampo) {
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

function normalizarFiltroLocacoes(valor) {
    const filtro = String(valor || '').trim().toLowerCase();
    return FILTROS_LOCACOES_VALIDOS.has(filtro) ? filtro : 'todos';
}

function restaurarFiltroLocacoesPersistido() {
    try {
        const salvo = localStorage.getItem(CHAVE_FILTRO_LOCACOES);
        filtroAtual = normalizarFiltroLocacoes(salvo || filtroAtual);
    } catch (_) {
        filtroAtual = normalizarFiltroLocacoes(filtroAtual);
    }
}

function persistirFiltroLocacoesAtual() {
    try {
        localStorage.setItem(CHAVE_FILTRO_LOCACOES, normalizarFiltroLocacoes(filtroAtual));
    } catch (_) {
        // Ignore falhas de storage e mantém experiência padrão.
    }
}

restaurarFiltroLocacoesPersistido();

function filtrarItensLocacao() {
    const termoInput = document.getElementById('inputBuscaPeca');
    const lista = document.getElementById('listaSugestoes');
    if (!termoInput || !lista) return;

    const normalizar = (t) => t ? t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
    const termo = normalizar(termoInput.value);

    lista.innerHTML = '';
    if (termo.length < 1) {
        lista.classList.remove('ativo');
        return;
    }

    const termos = termo.split(/\s+/).filter(Boolean);

    const scorePeca = (p) => {
        const nome = normalizar(p.nome);
        const codigo = normalizar(p.codigo);
        const medida = normalizar(p.medida);
        const tipo = tipos.find((t) => t.id === p.tipoId);
        const categoria = tipo ? normalizar(tipo.nome) : '';
        const alvo = `${nome} ${codigo} ${categoria} ${medida}`.trim();

        const ok = termos.every((t) => alvo.includes(t));
        if (!ok) return -1;

        let score = 0;
        if (nome.startsWith(termo)) score += 100;
        if (codigo.startsWith(termo)) score += 90;
        if (nome.includes(termo)) score += 60;
        if (codigo.includes(termo)) score += 50;

        termos.forEach((t) => {
            if (nome.startsWith(t)) score += 15;
            if (codigo.startsWith(t)) score += 10;
        });

        score += (obterDisponivelPecaLocacao(p) > 0 ? 5 : 0);
        return score;
    };

    const filtrados = pecas
        .map((p) => ({ p, s: scorePeca(p) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 20)
        .map((x) => x.p);

    if (filtrados.length === 0) {
        lista.innerHTML = '<div class="sugestao-item"><span>Nenhum item encontrado</span></div>';
        lista.classList.add('ativo');
        return;
    }

    filtrados.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'sugestao-item';
        item.innerHTML = `<span>${p.nome} <small style="opacity:0.6">[${p.codigo}]</small></span>
                          <span class="sugestao-estoque">(Disp: ${obterDisponivelPecaLocacao(p)})</span>`;
        item.onclick = function () {
            document.getElementById('inputBuscaPeca').value = p.nome;
            document.getElementById('aluguelItemSelect').value = p.id;
            document.getElementById('aluguelQtd').focus();
            if (typeof atualizarLimiteEstoque === 'function') atualizarLimiteEstoque();
            lista.classList.remove('ativo');
        };
        lista.appendChild(item);
    });
    lista.classList.add('ativo');
}

function formatarMoedaBR(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function escaparHTML(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function criarEstadoLocacaoPainel(opcoes = {}) {
    if (typeof criarEstadoPainel === 'function') {
        return criarEstadoPainel(opcoes.mensagem, {
            tipo: opcoes.tipo || 'info',
            titulo: opcoes.titulo || 'Informação',
            compacto: opcoes.compacto === true
        });
    }
    return `<small class="muted-note">${escaparHTML(opcoes.mensagem || 'Sem dados para mostrar.')}</small>`;
}

function parseDataIso(dataIso) {
    if (!dataIso) return null;
    const data = new Date(`${dataIso}T00:00:00`);
    return Number.isNaN(data.getTime()) ? null : data;
}

function obterClienteLocacaoAtual() {
    const clienteId = document.getElementById('aluguelCliente')?.value;
    if (!clienteId) return null;
    return locadores.find((x) => String(x.id) === String(clienteId)) || null;
}

function validarDadosBaseLocacao(exibirErro) {
    const cli = document.getElementById('aluguelCliente')?.value;
    const ini = document.getElementById('aluguelIni')?.value;
    const fim = document.getElementById('aluguelFim')?.value;

    if (!cli) {
        if (exibirErro) {
            mostrarToast('Selecione o cliente para continuar.', 'erro');
            focarCampoLocacao('aluguelCliente');
        }
        return false;
    }

    if (!obterClienteLocacaoAtual()) {
        if (exibirErro) {
            mostrarToast('Cliente selecionado invalido.', 'erro');
            focarCampoLocacao('aluguelCliente');
        }
        return false;
    }

    if (!ini || !fim) {
        if (exibirErro) {
            mostrarToast('Informe inicio e previsao de fim.', 'erro');
            focarCampoLocacao(!ini ? 'aluguelIni' : 'aluguelFim');
        }
        return false;
    }

    const dataInicio = parseDataIso(ini);
    const dataFim = parseDataIso(fim);
    if (!dataInicio || !dataFim) {
        if (exibirErro) {
            mostrarToast('Datas invalidas. Confira os campos.', 'erro');
            focarCampoLocacao('aluguelIni');
        }
        return false;
    }

    if (dataFim < dataInicio) {
        if (exibirErro) {
            mostrarToast('A previsao de fim nao pode ser antes do inicio.', 'erro');
            focarCampoLocacao('aluguelFim');
        }
        return false;
    }

    return true;
}

function calcularTotalCarrinhoLocacao() {
    return carrinhoLocacao.reduce((total, item) => {
        return total + ((parseFloat(item.valor) || 0) * (parseInt(item.quantidade, 10) || 0));
    }, 0);
}

function normalizarAssinaturaItensLocacao(itens = []) {
    return itens
        .map((item) => ({
            pecaId: String(item?.pecaId ?? item?.id ?? '').trim(),
            quantidade: parseInt(item?.quantidade, 10) || 0
        }))
        .filter((item) => item.pecaId && item.quantidade > 0)
        .sort((a, b) => a.pecaId.localeCompare(b.pecaId))
        .map((item) => `${item.pecaId}:${item.quantidade}`)
        .join('|');
}

function normalizarDivisorLocacao(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0) return 1;
    return Number(numero.toFixed(4));
}

function encontrarLocacaoPossivelmenteDuplicada(dadosLocacao) {
    const clienteId = Number(dadosLocacao?.locadorId || 0);
    const dataInicio = String(dadosLocacao?.dataAluguel || '').trim();
    const dataFim = String(dadosLocacao?.dataDevolucaoPrevisao || '').trim();
    const assinaturaItens = normalizarAssinaturaItensLocacao(dadosLocacao?.items || []);
    const divisor = normalizarDivisorLocacao(dadosLocacao?.divisorFatura);

    if (!clienteId || !dataInicio || !dataFim || !assinaturaItens) return null;

    return locacoes.find((locacao) => {
        const status = String(locacao?.status || '').toLowerCase();
        if (status === 'devolvido') return false;
        if (Number(locacao?.locadorId || 0) !== clienteId) return false;
        if (String(locacao?.dataAluguel || '').trim() !== dataInicio) return false;
        if (String(locacao?.dataDevolucaoPrevisao || '').trim() !== dataFim) return false;
        if (normalizarDivisorLocacao(locacao?.divisorFatura) !== divisor) return false;

        const assinaturaExistente = normalizarAssinaturaItensLocacao(locacao?.items || []);
        return assinaturaExistente === assinaturaItens;
    }) || null;
}

function montarResumoFinalLocacao() {
    const boxResumo = document.getElementById('locacaoResumoFinal');
    if (!boxResumo) return;

    const cliente = obterClienteLocacaoAtual();
    const ini = document.getElementById('aluguelIni')?.value;
    const fim = document.getElementById('aluguelFim')?.value;
    const dataInicio = parseDataIso(ini);
    const dataFim = parseDataIso(fim);

    if (!cliente || !dataInicio || !dataFim || carrinhoLocacao.length === 0) {
        boxResumo.innerHTML = criarEstadoLocacaoPainel({
            tipo: 'info',
            titulo: 'Revisão indisponível',
            mensagem: 'Preencha cliente, período e itens para revisar a locação.'
        });
        return;
    }

    const divisorRaw = parseFloat(document.getElementById('aluguelDivisor')?.value);
    const divisor = Number.isFinite(divisorRaw) && divisorRaw > 0 ? divisorRaw : 1;
    const totalBruto = calcularTotalCarrinhoLocacao();
    const totalFaturado = totalBruto / divisor;
    const totalItens = carrinhoLocacao.reduce((acc, item) => acc + (parseInt(item.quantidade, 10) || 0), 0);
    const duracaoDias = Math.max(1, Math.round((dataFim - dataInicio) / 86400000) + 1);

    const linhas = carrinhoLocacao.map((item) => {
        const qtd = parseInt(item.quantidade, 10) || 0;
        const valor = parseFloat(item.valor) || 0;
        const totalItem = qtd * valor;
        return `
            <tr>
                <td>${escaparHTML(item.nome)}</td>
                <td class="align-center">${qtd}</td>
                <td class="align-center">${formatarMoedaBR(valor)}</td>
                <td class="align-center">${formatarMoedaBR(totalItem)}</td>
            </tr>
        `;
    }).join('');

    boxResumo.innerHTML = `
        <div class="locacao-review-head">
            <div class="locacao-review-meta">
                <small>Cliente</small>
                <strong>${escaparHTML(cliente.nome)}</strong>
            </div>
            <div class="locacao-review-meta">
                <small>Periodo</small>
                <strong>${dataInicio.toLocaleDateString('pt-BR')} ate ${dataFim.toLocaleDateString('pt-BR')}</strong>
            </div>
            <div class="locacao-review-meta">
                <small>Duracao</small>
                <strong>${duracaoDias} dia(s)</strong>
            </div>
            <div class="locacao-review-meta">
                <small>Divisor</small>
                <strong>${divisor.toFixed(4)}</strong>
            </div>
        </div>
        <div class="table-responsive locacao-review-table-wrap">
            <table class="table locacao-review-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th class="table-head-center">Qtd</th>
                        <th class="table-head-center">Valor</th>
                        <th class="table-head-center">Total</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
        <div class="locacao-review-footer">
            <span>${totalItens} item(ns) no pedido</span>
            <div>
                <small>Total faturado</small>
                <strong>${formatarMoedaBR(totalFaturado)}</strong>
            </div>
        </div>
    `;
}

function atualizarFluxoLocacao() {
    const flow = document.getElementById('locacaoFlow');
    if (!flow) return;

    const dadosBaseOk = validarDadosBaseLocacao(false);
    const possuiItens = carrinhoLocacao.length > 0;

    if (locacaoEtapaAtual > 1 && !dadosBaseOk) locacaoEtapaAtual = 1;
    if (locacaoEtapaAtual > 2 && !possuiItens) locacaoEtapaAtual = 2;

    const etapas = [
        document.getElementById('locacaoStep1'),
        document.getElementById('locacaoStep2'),
        document.getElementById('locacaoStep3')
    ];

    const paineis = [
        document.getElementById('locacaoEtapa1'),
        document.getElementById('locacaoEtapa2'),
        document.getElementById('locacaoEtapa3')
    ];

    etapas.forEach((el, idx) => {
        if (!el) return;
        const numeroEtapa = idx + 1;
        el.classList.toggle('is-active', numeroEtapa === locacaoEtapaAtual);
        el.classList.toggle('is-done', numeroEtapa < locacaoEtapaAtual);

        let bloqueada = false;
        if (numeroEtapa === 2 && !dadosBaseOk) bloqueada = true;
        if (numeroEtapa === 3 && (!dadosBaseOk || !possuiItens)) bloqueada = true;
        el.classList.toggle('is-disabled', bloqueada);
    });

    paineis.forEach((painel, idx) => {
        if (!painel) return;
        painel.classList.toggle('is-active', idx + 1 === locacaoEtapaAtual);
    });

    const btnEtapa2 = document.getElementById('btnIrEtapa2');
    if (btnEtapa2) btnEtapa2.disabled = !dadosBaseOk;

    const btnEtapa3 = document.getElementById('btnIrEtapa3');
    if (btnEtapa3) btnEtapa3.disabled = !(dadosBaseOk && possuiItens);

    const btnFinalizar = document.getElementById('btnFinalizarLocacao');
    if (btnFinalizar) btnFinalizar.disabled = !(dadosBaseOk && possuiItens && locacaoEtapaAtual === 3);

    montarResumoFinalLocacao();
}

function irEtapaLocacao(etapa) {
    const destino = parseInt(etapa, 10);
    if (![1, 2, 3].includes(destino)) return;

    if (destino >= 2 && !validarDadosBaseLocacao(true)) return;
    if (destino === 3 && carrinhoLocacao.length === 0) {
        mostrarToast('Adicione pelo menos 1 item para revisar a locacao.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }

    locacaoEtapaAtual = destino;
    atualizarFluxoLocacao();

    if (destino === 2) {
        const campoBusca = document.getElementById('inputBuscaPeca');
        if (campoBusca) campoBusca.focus();
    }
}

function inicializarFluxoLocacao() {
    if (!document.getElementById('locacaoFlow')) return;

    if (!fluxoLocacaoInicializado) {
        const idsCampos = ['aluguelCliente', 'aluguelIni', 'aluguelFim', 'aluguelDivisor'];
        idsCampos.forEach((id) => {
            const campo = document.getElementById(id);
            if (!campo) return;
            campo.addEventListener('change', atualizarFluxoLocacao);
            if (id === 'aluguelDivisor') campo.addEventListener('input', atualizarFluxoLocacao);
        });
        fluxoLocacaoInicializado = true;
    }

    atualizarFluxoLocacao();
}

function renderCarrinhoLocacao() {
    const lista = document.getElementById('carrinhoList');
    const total = document.getElementById('checkoutTotalLocacao');
    const btnLimpar = document.getElementById('btnLimparCarrinho');
    if (!lista) return;

    if (carrinhoLocacao.length === 0) {
        lista.innerHTML = criarEstadoLocacaoPainel({
            tipo: 'empty',
            titulo: 'Pedido vazio',
            mensagem: 'Nenhum item adicionado à lista.',
            compacto: true
        });
    } else {
        lista.innerHTML = carrinhoLocacao.map((item, index) => {
            const valor = parseFloat(item.valor) || 0;
            const quantidade = parseInt(item.quantidade, 10) || 0;
            const totalItem = valor * quantidade;

            return `
                <div class="item-carrinho">
                    <div class="item-carrinho-main">
                        <span><b>${quantidade}x</b> ${escaparHTML(item.nome)}</span>
                        <span class="item-carrinho-meta">${formatarMoedaBR(valor)} por item</span>
                    </div>
                    <div class="item-carrinho-side">
                        <strong>${formatarMoedaBR(totalItem)}</strong>
                        <button class="btn btn-sm btn-danger btn-icon" data-action="removerItemCarrinho" data-arg="${index}" title="Remover item">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (total) total.innerText = formatarMoedaBR(calcularTotalCarrinhoLocacao());
    if (btnLimpar) btnLimpar.disabled = carrinhoLocacao.length === 0;
    atualizarFluxoLocacao();
}

function removerItemCarrinho(index) {
    carrinhoLocacao.splice(index, 1);
    renderCarrinhoLocacao();
}

function limparCarrinhoLocacao() {
    if (carrinhoLocacao.length === 0) return;
    confirmarAcao('Limpar todos os itens do pedido?', () => {
        carrinhoLocacao = [];
        renderCarrinhoLocacao();
        mostrarToast('Pedido limpo.');
    }, {
        titulo: 'Limpar pedido',
        textoConfirmar: 'Limpar',
        classeConfirmar: 'btn-danger'
    });
}

function addItemCarrinho() {
    var id = document.getElementById('aluguelItemSelect').value;
    if (!id) {
        mostrarToast('Busque e selecione um item!', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }

    var campoQtd = document.getElementById('aluguelQtd');
    var qtd = parseInt(campoQtd?.value, 10);
    if (!Number.isInteger(qtd) || qtd < 1) {
        mostrarToast('Informe uma quantidade valida (minimo 1).', 'erro');
        if (campoQtd) campoQtd.focus();
        return;
    }

    var p = pecas.find(function (x) { return x.id == id; });
    if (!p) {
        mostrarToast('Item nao encontrado.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }
    const disponivelAtual = obterDisponivelPecaLocacao(p);
    if (disponivelAtual <= 0) {
        mostrarToast('Esse item esta sem estoque disponivel.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }

    var itemNoCarrinho = carrinhoLocacao.find((x) => x.pecaId == p.id);
    var qtdJaNoCarrinho = itemNoCarrinho ? itemNoCarrinho.quantidade : 0;
    var qtdTotalSolicitada = qtd + qtdJaNoCarrinho;

    if (qtdTotalSolicitada > disponivelAtual) {
        if (campoQtd) campoQtd.value = String(Math.max(disponivelAtual - qtdJaNoCarrinho, 1));
        return mostrarToast(`Estoque insuficiente! So restam ${disponivelAtual}.`, 'erro');
    }

    if (itemNoCarrinho) {
        itemNoCarrinho.quantidade += qtd;
    } else {
        carrinhoLocacao.push({
            pecaId: p.id,
            nome: p.nome,
            valor: parseFloat(p.valor) || 0,
            quantidade: qtd
        });
    }

    renderCarrinhoLocacao();
    mostrarToast('Item adicionado!');

    document.getElementById('inputBuscaPeca').value = '';
    document.getElementById('aluguelItemSelect').value = '';
    document.getElementById('aluguelQtd').value = '1';
    document.getElementById('avisoEstoque').innerText = '';
    document.getElementById('inputBuscaPeca').focus();
}

function finalizarLocacao() {
    var cli = document.getElementById('aluguelCliente').value;
    var ini = document.getElementById('aluguelIni').value;
    var fim = document.getElementById('aluguelFim').value;

    var divInput = parseFloat(document.getElementById('aluguelDivisor').value);
    if (isNaN(divInput) || divInput <= 0) divInput = 1;

    if (!cli || carrinhoLocacao.length === 0) {
        mostrarToast('Preencha cliente e itens!', 'erro');
        focarCampoLocacao(!cli ? 'aluguelCliente' : 'inputBuscaPeca');
        return;
    }

    const cliente = locadores.find((x) => String(x.id) === String(cli));
    if (!cliente) {
        mostrarToast('Cliente selecionado e invalido.', 'erro');
        focarCampoLocacao('aluguelCliente');
        return;
    }

    if (!ini || !fim) {
        mostrarToast('Informe as datas da locacao.', 'erro');
        focarCampoLocacao(!ini ? 'aluguelIni' : 'aluguelFim');
        return;
    }

    const dataInicio = new Date(`${ini}T00:00:00`);
    const dataFim = new Date(`${fim}T00:00:00`);
    if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
        mostrarToast('Datas invalidas. Confira inicio e fim.', 'erro');
        focarCampoLocacao('aluguelIni');
        return;
    }

    if (dataFim < dataInicio) {
        mostrarToast('A previsao de fim nao pode ser antes do inicio.', 'erro');
        focarCampoLocacao('aluguelFim');
        return;
    }

    if (!Number.isFinite(divInput) || divInput <= 0) {
        mostrarToast('Divisor invalido. Informe um valor acima de zero.', 'erro');
        focarCampoLocacao('aluguelDivisor');
        return;
    }

    const itensInvalidos = carrinhoLocacao.filter((item) => {
        const qtd = parseInt(item.quantidade, 10);
        const valor = parseFloat(item.valor);
        return !Number.isInteger(qtd) || qtd < 1 || !Number.isFinite(valor) || valor < 0;
    });

    if (itensInvalidos.length > 0) {
        mostrarToast('Existem itens com quantidade/valor invalido no pedido.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }

    const itensParaSalvar = carrinhoLocacao.map((item) => ({ ...item }));
    const dadosNovaLocacao = {
        locadorId: parseInt(cli, 10),
        dataAluguel: ini,
        dataDevolucaoPrevisao: fim,
        items: itensParaSalvar,
        status: 'ativo',
        divisorFatura: divInput
    };

    const concluirCriacaoLocacao = () => {
        const novaLocacaoId = Date.now();
        const novaLocacao = sincronizarFinanceiroLocacao({
            id: novaLocacaoId,
            ...dadosNovaLocacao
        });
        if (typeof atualizarStatusLocacaoDominio === 'function') {
            atualizarStatusLocacaoDominio(novaLocacao, 'aprovado', {
                acao: 'criacao',
                descricao: 'Locação criada no fluxo de locações.',
                origem: 'locacoes',
                forcarHistorico: true
            });
        } else if (typeof registrarHistoricoLocacaoDominio === 'function') {
            registrarHistoricoLocacaoDominio(novaLocacao, {
                acao: 'criacao',
                descricao: 'Locação criada no fluxo de locações.',
                origem: 'locacoes'
            });
        }
        locacoes.push(novaLocacao);

        carrinhoLocacao = [];
        document.getElementById('aluguelCliente').value = '';
        document.getElementById('aluguelItemSelect').value = '';
        document.getElementById('aluguelQtd').value = '1';
        document.getElementById('inputBuscaPeca').value = '';
        document.getElementById('avisoEstoque').innerText = '';

        renderCarrinhoLocacao();

        if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
        salvarLocal();
        renderTudo();
        if (typeof focarRegistroRecemSalvo === 'function') {
            focarRegistroRecemSalvo({ tipo: 'locacao', id: novaLocacaoId, limparBusca: true });
        }

        registrarLog('locacao', 'criar', `Locacao criada: ${cliente?.nome || 'Cliente'} - ${itensParaSalvar.length} itens`);

        locacaoEtapaAtual = 1;
        inicializarFluxoLocacao();

        mostrarToast('Locacao concluida!');
        sincronizar('salvar');
    };

    const locacaoDuplicada = encontrarLocacaoPossivelmenteDuplicada(dadosNovaLocacao);
    if (locacaoDuplicada) {
        const sufixo = String(locacaoDuplicada.id || '').slice(-4) || '----';
        confirmarAcao(
            `Já existe uma locação parecida em aberto (#${sufixo}). Deseja criar mesmo assim?`,
            () => {
                concluirCriacaoLocacao();
            },
            {
                titulo: 'Possível duplicidade',
                textoConfirmar: 'Criar assim mesmo',
                classeConfirmar: 'btn-warning'
            }
        );
        return;
    }

    concluirCriacaoLocacao();
}

function cancelarLocacao(id) {
    if (typeof validarPermissao === 'function' && !validarPermissao('cancelar_locacao', 'Somente administrador pode cancelar locacoes.')) {
        return;
    }

    confirmarAcao('Cancelar locacao?', () => {
        locacoes = locacoes.filter((l) => l.id !== id);
        if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        mostrarToast('Locacao cancelada.');
    }, {
        titulo: 'Cancelar locacao',
        textoConfirmar: 'Cancelar locacao',
        classeConfirmar: 'btn-danger'
    });
}

function mudarFiltro(n) {
    filtroAtual = normalizarFiltroLocacoes(n);
    persistirFiltroLocacoesAtual();
    renderLocacoes();
}

function irParaLocacoes(f) {
    const filtroDestino = f || 'todos';

    if (typeof executarAtalhoFiltroLocacoes === 'function') {
        executarAtalhoFiltroLocacoes(filtroDestino);
        return;
    }

    abrirTab('locacoes', { semRolagem: true });

    setTimeout(() => {
        mudarFiltro(filtroDestino);

        if (typeof atualizarFiltroVisualLocacoes === 'function') {
            atualizarFiltroVisualLocacoes();
        }

        const alvoLista = document.getElementById('locacoesLista')
            || document.querySelector('#tab-locacoes #tblLocacoes')?.closest('.panel-block');

        if (alvoLista && typeof rolarParaElementoAtalho === 'function') {
            rolarParaElementoAtalho(alvoLista, 'start');
        } else if (alvoLista && typeof alvoLista.scrollIntoView === 'function') {
            alvoLista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 150);
}

function alternarPagamento(id) {
    if (typeof validarPermissao === 'function' && !validarPermissao('alterar_pagamento', 'Somente administrador pode alterar status de pagamento.')) {
        return;
    }
    const l = locacoes.find((x) => x.id == id);
    if (l) {
        const pagoAnterior = !!l.pago;
        l.pago = !l.pago;
        const statusPagamento = l.pago ? 'pago' : 'pendente';
        l.financeiro = {
            ...(l.financeiro || {}),
            statusPagamento
        };
        const normalizada = sincronizarFinanceiroLocacao(l);
        if (normalizada) Object.assign(l, normalizada);
        if (pagoAnterior !== l.pago && typeof registrarHistoricoLocacaoDominio === 'function') {
            registrarHistoricoLocacaoDominio(l, {
                acao: 'financeiro_status',
                descricao: l.pago
                    ? 'Pagamento marcado como pago.'
                    : 'Pagamento marcado como pendente.',
                origem: 'locacoes'
            });
        }
        salvarLocal();
        renderLocacoes();
        renderStats();
        sincronizar('salvar');
        mostrarToast('Pagamento atualizado!');
    }
}

function atualizarLimiteEstoque() {
    var select = document.getElementById('aluguelItemSelect');
    var inputQtd = document.getElementById('aluguelQtd');
    var aviso = document.getElementById('avisoEstoque');

    var id = select.value;
    var p = pecas.find((x) => x.id == id);

    if (p) {
        const disponivel = obterDisponivelPecaLocacao(p);
        inputQtd.max = disponivel;
        inputQtd.value = 1;
        aviso.innerText = `(Max: ${disponivel})`;
    } else {
        aviso.innerText = '';
        inputQtd.removeAttribute('max');
    }
}

function validarDigitacao(input) {
    var maximo = parseInt(input.max, 10);
    var valorDigitado = parseInt(input.value, 10);

    if (!isNaN(maximo) && valorDigitado > maximo) {
        input.value = maximo;
        mostrarToast('Limite de estoque atingido!', 'erro');
    }
    if (valorDigitado < 1) input.value = 1;
}

window.renderCarrinhoLocacao = renderCarrinhoLocacao;
window.removerItemCarrinho = removerItemCarrinho;
window.limparCarrinhoLocacao = limparCarrinhoLocacao;
window.irEtapaLocacao = irEtapaLocacao;
window.inicializarFluxoLocacao = inicializarFluxoLocacao;
window.atualizarFluxoLocacao = atualizarFluxoLocacao;
