// Busca inteligente e operacoes de locacao
let locacaoEtapaAtual = 1;
let fluxoLocacaoInicializado = false;
let indiceSugestaoLocacaoAtiva = -1;
const CHAVE_FILTRO_LOCACOES = 'mtz:locacoesFiltro';
const FILTROS_LOCACOES_VALIDOS = new Set(['todos', 'ativo', 'atrasado', 'devolvido', 'cancelado']);

function obterDisponivelPecaLocacao(peca) {
    if (!peca) return 0;
    const normalizada = typeof normalizarPecaDominio === 'function' ? normalizarPecaDominio(peca) : peca;
    return Math.max(parseInt(normalizada?.disponivel, 10) || 0, 0);
}

function obterIntervaloFormularioLocacao() {
    if (typeof normalizarIntervaloPeriodoEstoque !== 'function') return null;
    return normalizarIntervaloPeriodoEstoque(
        document.getElementById('aluguelIni')?.value,
        document.getElementById('aluguelFim')?.value
    );
}

function consultarDisponibilidadePecaFormularioLocacao(peca, opcoes = {}) {
    const intervalo = obterIntervaloFormularioLocacao();
    if (!intervalo?.completo || typeof consultarDisponibilidadeItemPeriodo !== 'function') {
        return {
            disponivel: obterDisponivelPecaLocacao(peca),
            intervalo,
            valido: Boolean(intervalo?.completo)
        };
    }
    return consultarDisponibilidadeItemPeriodo(peca, intervalo, opcoes);
}

function validarDisponibilidadeCarrinhoLocacao(opcoes = {}) {
    const exibirErro = opcoes.exibirErro !== false;
    const intervalo = obterIntervaloFormularioLocacao();
    if (!intervalo?.completo || typeof consultarDisponibilidadeItemPeriodo !== 'function') {
        return false;
    }

    if (document.getElementById('aluguelItemSelect')?.value) {
        const estadoQuantidade = validarQuantidadeItemFormularioLocacao({
            exibirToast: exibirErro,
            focar: exibirErro
        });
        if (!estadoQuantidade.valido) return false;
    }

    const totaisPorPeca = new Map();
    carrinhoLocacao.forEach((item) => {
        const pecaId = String(item?.pecaId || '');
        if (!pecaId) return;
        const quantidade = typeof obterQuantidadePropriaOperacional === 'function'
            ? obterQuantidadePropriaOperacional(item)
            : Math.max(parseInt(item?.quantidade, 10) || 0, 0);
        totaisPorPeca.set(pecaId, (totaisPorPeca.get(pecaId) || 0) + quantidade);
    });

    for (const [pecaId, solicitado] of totaisPorPeca.entries()) {
        const peca = pecas.find((item) => String(item?.id || '') === pecaId);
        const consulta = consultarDisponibilidadeItemPeriodo(peca, intervalo, {
            ignorarLocacaoId: opcoes.ignorarLocacaoId
        });
        if (!consulta.valido || solicitado > consulta.disponivel) {
            if (exibirErro) {
                const mensagem = consulta.valido
                    ? formatarMensagemDisponibilidadeEstoque({
                        item: peca?.nome || 'Item de estoque',
                        solicitado,
                        consulta
                    })
                    : formatarMensagemDisponibilidadeEstoque({
                        tipo: 'intervalo_invalido',
                        consulta
                    });
                mostrarToast(mensagem, 'erro', 6500);
                focarCampoLocacao(consulta.valido ? 'inputBuscaPeca' : 'aluguelFim');
            }
            return false;
        }
    }

    return true;
}

function sincronizarFinanceiroLocacao(localLocacao) {
    if (!localLocacao || typeof localLocacao !== 'object') return localLocacao;
    if (typeof normalizarLocacaoDominio === 'function') {
        return normalizarLocacaoDominio(localLocacao, { incluirDerivados: false });
    }
    return localLocacao;
}

function abrirPropostaOriginalDaLocacao(locacaoId) {
    const locacao = Array.isArray(locacoes)
        ? locacoes.find((item) => String(item?.id || '') === String(locacaoId || ''))
        : null;
    if (!locacao) {
        mostrarToast('Locação não encontrada para abrir a proposta original.', 'erro');
        return false;
    }

    const propostaId = String(
        locacao.propostaOrigemId
        || locacao.origemPropostaId
        || locacao.origem?.propostaId
        || ''
    );
    if (!propostaId) {
        mostrarToast('Esta locação não possui uma proposta de origem vinculada.', 'info', 5200);
        return false;
    }

    const propostaExiste = Array.isArray(propostas)
        && propostas.some((item) => String(item?.id || '') === propostaId);
    if (!propostaExiste || typeof window.editarProposta !== 'function') {
        mostrarToast('A proposta original não está disponível nesta base.', 'erro', 5200);
        return false;
    }

    if (typeof window.irParaPropostasFormulario === 'function') {
        window.irParaPropostasFormulario();
    }
    window.editarProposta(propostaId);
    return true;
}

function parseValorFinanceiroLocacao(valor) {
    const limpo = String(valor ?? '')
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(',', '.');
    if (!/\d/.test(limpo)) return NaN;
    const numero = Number(limpo);
    return Number.isFinite(numero) ? numero : NaN;
}

function formatarValorPromptFinanceiro(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function obterLocacaoPagamentoPorId(id) {
    return locacoes.find((x) => String(x.id) === String(id));
}

function obterResumoPagamentoLocacao(locacao) {
    const financeiroAtual = locacao?.financeiro || {};
    const valorTotal = typeof calcularValorLocacaoDominio === 'function'
        ? calcularValorLocacaoDominio(locacao)
        : Math.max(0, parseValorFinanceiroLocacao(
            financeiroAtual.valorTotal ?? locacao?.valorTotalCalculado ?? 0
        ) || 0);
    const sinalNormalizado = typeof normalizarValorMonetarioLegado === 'function'
        ? normalizarValorMonetarioLegado(financeiroAtual.sinal ?? locacao?.sinal)
        : parseValorFinanceiroLocacao(financeiroAtual.sinal ?? locacao?.sinal);
    const sinalAtual = Math.max(0, sinalNormalizado ?? 0);
    const restanteNormalizado = typeof normalizarValorMonetarioLegado === 'function'
        ? normalizarValorMonetarioLegado(financeiroAtual.valorRestante)
        : parseValorFinanceiroLocacao(financeiroAtual.valorRestante);
    const valorRestante = Math.max(
        0,
        restanteNormalizado ?? Math.max(valorTotal - sinalAtual, 0)
    );
    const recebidoAtual = Math.min(Math.max(sinalAtual, valorTotal - valorRestante, 0), valorTotal);

    return {
        financeiroAtual,
        valorTotal,
        sinalAtual,
        valorRestante,
        recebidoAtual
    };
}

function calcularStatusPagamentoLocacao(valorTotal, valorRecebido) {
    const total = Math.max(0, Number(valorTotal) || 0);
    const recebido = Math.max(0, Number(valorRecebido) || 0);
    const novoRestante = Math.max(total - recebido, 0);

    return {
        valorRecebido: Math.min(recebido, total),
        novoRestante,
        statusPagamento: recebido <= 0
            ? 'pendente'
            : novoRestante <= 0
                ? 'pago'
                : 'parcial'
    };
}

function classeBadgePagamentoLocacao(statusPagamento) {
    const chave = String(statusPagamento || '').toLowerCase();
    if (chave === 'pago') return 'badge-success';
    if (chave === 'atrasado' || chave === 'invalido') return 'badge-danger';
    if (chave === 'parcial') return 'badge-info';
    return 'badge-warning';
}

function atualizarBadgePreviewPagamento(statusPagamento, rotuloCustomizado) {
    const badge = document.getElementById('pagamentoLocacaoNovoStatus');
    if (!badge) return;

    const rotulo = rotuloCustomizado || rotuloStatusPagamentoLocacao(statusPagamento, statusPagamento === 'pago');
    badge.textContent = String(rotulo || 'Pendente').toUpperCase();
    badge.className = `badge ${classeBadgePagamentoLocacao(statusPagamento)}`;
}

function atualizarTextoElemento(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
}

function aplicarRecebimentoLocacao(locacao, valorRecebido, origem = 'financeiro') {
    if (!locacao) return false;

    const resumo = obterResumoPagamentoLocacao(locacao);
    const calculo = calcularStatusPagamentoLocacao(resumo.valorTotal, valorRecebido);

    locacao.pago = calculo.statusPagamento === 'pago';
    locacao.financeiro = {
        ...resumo.financeiroAtual,
        sinal: calculo.valorRecebido,
        valorRestante: calculo.novoRestante,
        statusPagamento: calculo.statusPagamento
    };

    const normalizada = sincronizarFinanceiroLocacao(locacao);
    if (normalizada) Object.assign(locacao, normalizada);

    if (typeof registrarHistoricoLocacaoDominio === 'function') {
        registrarHistoricoLocacaoDominio(locacao, {
            acao: 'financeiro_status',
            descricao: `Pagamento atualizado para ${rotuloStatusPagamentoLocacao(calculo.statusPagamento, locacao.pago)}.`,
            origem
        });
    }

    salvarLocal();
    renderLocacoes();
    if (typeof renderFinanceiroResumo === 'function') renderFinanceiroResumo();
    renderStats();
    sincronizar('salvar');
    mostrarToast(`Pagamento ${rotuloStatusPagamentoLocacao(calculo.statusPagamento, locacao.pago).toLowerCase()} atualizado.`);

    return true;
}

function solicitarPagamentoPromptLocacao(locacao) {
    const resumo = obterResumoPagamentoLocacao(locacao);
    const informado = prompt(
        'Informe o valor ja recebido desta locacao:',
        formatarValorPromptFinanceiro(resumo.recebidoAtual)
    );
    if (informado === null) return;

    const valorRecebido = parseValorFinanceiroLocacao(informado);
    if (!Number.isFinite(valorRecebido)) {
        mostrarToast('Valor recebido invalido.', 'erro');
        return;
    }

    aplicarRecebimentoLocacao(locacao, Math.min(Math.max(valorRecebido, 0), resumo.valorTotal), 'financeiro');
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

const ERROS_CAMPOS_LOCACAO = Object.freeze({
    aluguelCliente: 'aluguelClienteErro',
    aluguelDivisor: 'aluguelDivisorErro',
    aluguelIni: 'aluguelIniErro',
    aluguelFim: 'aluguelFimErro'
});

function limparErroCampoLocacao(idCampo) {
    const campo = document.getElementById(idCampo);
    const erro = document.getElementById(ERROS_CAMPOS_LOCACAO[idCampo]);
    campo?.removeAttribute('aria-invalid');
    if (erro) {
        erro.textContent = '';
        erro.hidden = true;
    }
}

function informarErroCampoLocacao(idCampo, mensagem, opcoes = {}) {
    const campo = document.getElementById(idCampo);
    const erro = document.getElementById(ERROS_CAMPOS_LOCACAO[idCampo]);
    if (campo) campo.setAttribute('aria-invalid', 'true');
    if (erro) {
        erro.textContent = mensagem;
        erro.hidden = false;
    }
    if (opcoes.toast !== false) mostrarToast(mensagem, 'erro');
    if (opcoes.focar !== false) focarCampoLocacao(idCampo);
}

function obterDivisorFormularioLocacao() {
    const valor = String(document.getElementById('aluguelDivisor')?.value ?? '').trim();
    if (!valor) return null;
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0 || numero > 1) return null;
    return numero;
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

function obterOpcoesSugestoesLocacao() {
    const lista = document.getElementById('listaSugestoes');
    return lista ? Array.from(lista.querySelectorAll('[role="option"]')) : [];
}

function fecharSugestoesLocacao() {
    const campo = document.getElementById('inputBuscaPeca');
    const lista = document.getElementById('listaSugestoes');
    if (lista) {
        lista.classList.remove('ativo');
        obterOpcoesSugestoesLocacao().forEach((opcao) => {
            opcao.classList.remove('is-active');
            opcao.setAttribute('aria-selected', 'false');
        });
    }
    if (campo) {
        campo.setAttribute('aria-expanded', 'false');
        campo.removeAttribute('aria-activedescendant');
    }
    indiceSugestaoLocacaoAtiva = -1;
}

function abrirSugestoesLocacao() {
    const campo = document.getElementById('inputBuscaPeca');
    const lista = document.getElementById('listaSugestoes');
    if (!campo || !lista) return;
    lista.classList.add('ativo');
    campo.setAttribute('aria-expanded', 'true');
}

function ativarSugestaoLocacao(indice) {
    const campo = document.getElementById('inputBuscaPeca');
    const opcoes = obterOpcoesSugestoesLocacao();
    if (!campo || opcoes.length === 0) return;

    indiceSugestaoLocacaoAtiva = (indice + opcoes.length) % opcoes.length;
    opcoes.forEach((opcao, opcaoIndice) => {
        const ativa = opcaoIndice === indiceSugestaoLocacaoAtiva;
        opcao.classList.toggle('is-active', ativa);
        opcao.setAttribute('aria-selected', ativa ? 'true' : 'false');
    });
    const ativa = opcoes[indiceSugestaoLocacaoAtiva];
    campo.setAttribute('aria-activedescendant', ativa.id);
    ativa.scrollIntoView({ block: 'nearest' });
}

function selecionarSugestaoLocacao(peca) {
    const campoBusca = document.getElementById('inputBuscaPeca');
    const campoItem = document.getElementById('aluguelItemSelect');
    const campoQuantidade = document.getElementById('aluguelQtd');
    if (!peca || !campoBusca || !campoItem || !campoQuantidade) return;

    campoBusca.value = peca.nome;
    campoItem.value = peca.id;
    fecharSugestoesLocacao();
    atualizarLimiteEstoque({ preservarQuantidade: false });
    campoQuantidade.focus();
}

function navegarSugestoesLocacao(evento) {
    const lista = document.getElementById('listaSugestoes');
    const opcoes = obterOpcoesSugestoesLocacao();
    if (!lista || !lista.classList.contains('ativo')) {
        if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') filtrarItensLocacao();
    }

    const opcoesAtuais = obterOpcoesSugestoesLocacao();
    if (evento.key === 'ArrowDown' && opcoesAtuais.length) {
        evento.preventDefault();
        ativarSugestaoLocacao(indiceSugestaoLocacaoAtiva + 1);
        return;
    }
    if (evento.key === 'ArrowUp' && opcoesAtuais.length) {
        evento.preventDefault();
        ativarSugestaoLocacao(indiceSugestaoLocacaoAtiva <= 0
            ? opcoesAtuais.length - 1
            : indiceSugestaoLocacaoAtiva - 1);
        return;
    }
    if (evento.key === 'Enter' && indiceSugestaoLocacaoAtiva >= 0) {
        evento.preventDefault();
        opcoesAtuais[indiceSugestaoLocacaoAtiva]?.click();
        return;
    }
    if (evento.key === 'Escape') {
        evento.preventDefault();
        fecharSugestoesLocacao();
    }
}

function inicializarAutocompleteLocacao() {
    const campo = document.getElementById('inputBuscaPeca');
    if (!campo || campo.dataset.autocompleteLocacaoBound === '1') return;

    campo.addEventListener('keydown', navegarSugestoesLocacao);
    campo.addEventListener('input', () => {
        const itemSelecionado = document.getElementById('aluguelItemSelect');
        const pecaSelecionada = pecas.find((peca) => String(peca?.id || '') === String(itemSelecionado?.value || ''));
        if (pecaSelecionada && String(campo.value || '') !== String(pecaSelecionada.nome || '')) {
            itemSelecionado.value = '';
            const quantidade = document.getElementById('aluguelQtd');
            quantidade?.removeAttribute('max');
            quantidade?.removeAttribute('aria-invalid');
            const aviso = document.getElementById('avisoEstoque');
            if (aviso) aviso.textContent = '';
        }
    });
    campo.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement?.closest('#listaSugestoes')) fecharSugestoesLocacao();
        }, 100);
    });
    campo.dataset.autocompleteLocacaoBound = '1';
}

function filtrarItensLocacao(evento) {
    const termoInput = document.getElementById('inputBuscaPeca');
    const lista = document.getElementById('listaSugestoes');
    if (!termoInput || !lista) return;

    if (evento && ['ArrowDown', 'ArrowUp', 'Enter'].includes(evento.key)) return;
    if (evento?.key === 'Escape') {
        if (!termoInput.value) {
            const itemSelecionado = document.getElementById('aluguelItemSelect');
            if (itemSelecionado) itemSelecionado.value = '';
            document.getElementById('aluguelQtd')?.removeAttribute('max');
            document.getElementById('aluguelQtd')?.removeAttribute('aria-invalid');
            const aviso = document.getElementById('avisoEstoque');
            if (aviso) aviso.textContent = '';
        }
        fecharSugestoesLocacao();
        return;
    }

    const normalizar = (t) => t ? t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
    const termo = normalizar(termoInput.value);

    lista.innerHTML = '';
    indiceSugestaoLocacaoAtiva = -1;
    termoInput.removeAttribute('aria-activedescendant');
    if (termo.length < 1) {
        const itemSelecionado = document.getElementById('aluguelItemSelect');
        if (itemSelecionado) itemSelecionado.value = '';
        document.getElementById('aluguelQtd')?.removeAttribute('max');
        document.getElementById('aluguelQtd')?.removeAttribute('aria-invalid');
        fecharSugestoesLocacao();
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

        score += (consultarDisponibilidadePecaFormularioLocacao(p).disponivel > 0 ? 5 : 0);
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
        abrirSugestoesLocacao();
        return;
    }

    filtrados.forEach((p, indice) => {
        const disponivelPeriodo = consultarDisponibilidadePecaFormularioLocacao(p).disponivel;
        const item = document.createElement('div');
        item.className = 'sugestao-item';
        item.id = `locacao-sugestao-${String(p.id || indice).replace(/[^a-zA-Z0-9_-]/g, '-')}-${indice}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        item.innerHTML = `<span>${p.nome} <small style="opacity:0.6">[${p.codigo}]</small></span>
                          <span class="sugestao-estoque">(Disp. no período: ${disponivelPeriodo})</span>`;
        item.addEventListener('click', () => selecionarSugestaoLocacao(p));
        lista.appendChild(item);
    });
    abrirSugestoesLocacao();
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
            informarErroCampoLocacao('aluguelCliente', 'Selecione um cliente para continuar.');
        }
        return false;
    }
    limparErroCampoLocacao('aluguelCliente');

    if (!obterClienteLocacaoAtual()) {
        if (exibirErro) {
            informarErroCampoLocacao('aluguelCliente', 'Selecione um cliente válido.');
        }
        return false;
    }

    if (!ini) {
        if (exibirErro) {
            informarErroCampoLocacao('aluguelIni', 'Informe a data inicial.');
        }
        return false;
    }
    limparErroCampoLocacao('aluguelIni');

    if (!fim) {
        if (exibirErro) {
            informarErroCampoLocacao('aluguelFim', 'Informe a previsão de término.');
        }
        return false;
    }
    limparErroCampoLocacao('aluguelFim');

    const dataInicio = parseDataIso(ini);
    const dataFim = parseDataIso(fim);
    if (!dataInicio || !dataFim) {
        if (exibirErro) {
            const campoInvalido = !dataInicio ? 'aluguelIni' : 'aluguelFim';
            informarErroCampoLocacao(campoInvalido, 'Informe uma data válida.');
        }
        return false;
    }

    if (dataFim < dataInicio) {
        if (exibirErro) {
            informarErroCampoLocacao('aluguelFim', 'A previsão de término não pode ser anterior à data inicial.');
        }
        return false;
    }
    limparErroCampoLocacao('aluguelFim');

    const divisor = obterDivisorFormularioLocacao();
    if (divisor === null) {
        if (exibirErro) {
            informarErroCampoLocacao(
                'aluguelDivisor',
                'Informe um divisor maior que zero e menor ou igual a 1.'
            );
        }
        return false;
    }
    limparErroCampoLocacao('aluguelDivisor');

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
        if (status === 'cancelado') return false;
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

    const divisor = obterDivisorFormularioLocacao();
    if (divisor === null) {
        boxResumo.innerHTML = criarEstadoLocacaoPainel({
            tipo: 'warning',
            titulo: 'Revisão indisponível',
            mensagem: 'Informe um divisor maior que zero e menor ou igual a 1.'
        });
        return;
    }
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
                <small>Período</small>
                <strong>${dataInicio.toLocaleDateString('pt-BR')} até ${dataFim.toLocaleDateString('pt-BR')}</strong>
            </div>
            <div class="locacao-review-meta">
                <small>Duração</small>
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
    if (btnEtapa2) btnEtapa2.disabled = false;

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
        mostrarToast('Adicione pelo menos 1 item para revisar a locação.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }
    if (destino === 3 && !validarDisponibilidadeCarrinhoLocacao({ exibirErro: true })) return;

    locacaoEtapaAtual = destino;
    atualizarFluxoLocacao();

    if (destino === 2) {
        const campoBusca = document.getElementById('inputBuscaPeca');
        if (campoBusca) campoBusca.focus();
    }
}

function atualizarDisponibilidadePeriodoFormularioLocacao() {
    const intervalo = obterIntervaloFormularioLocacao();
    const selectItem = document.getElementById('aluguelItemSelect');
    const campoQuantidade = document.getElementById('aluguelQtd');
    const aviso = document.getElementById('avisoEstoque');

    if (!intervalo?.completo) {
        if (selectItem) selectItem.value = '';
        if (campoQuantidade) {
            campoQuantidade.removeAttribute('max');
            campoQuantidade.removeAttribute('aria-invalid');
            campoQuantidade.value = '1';
        }
        if (aviso) aviso.innerText = 'Informe um período válido para consultar a disponibilidade.';
        return;
    }

    atualizarLimiteEstoque({ preservarQuantidade: true });
}

function inicializarFluxoLocacao() {
    if (!document.getElementById('locacaoFlow')) return;
    inicializarAutocompleteLocacao();

    if (!fluxoLocacaoInicializado) {
        const idsCampos = ['aluguelCliente', 'aluguelIni', 'aluguelFim', 'aluguelDivisor'];
        idsCampos.forEach((id) => {
            const campo = document.getElementById(id);
            if (!campo) return;
            const atualizarCampo = () => {
                limparErroCampoLocacao(id);
                if (id === 'aluguelIni' || id === 'aluguelFim') {
                    atualizarDisponibilidadePeriodoFormularioLocacao();
                }
                atualizarFluxoLocacao();
            };
            campo.addEventListener('change', atualizarCampo);
            if (id === 'aluguelIni' || id === 'aluguelFim') {
                campo.addEventListener('input', atualizarCampo);
            }
            if (id === 'aluguelDivisor') {
                campo.addEventListener('input', () => {
                    const valorInformado = String(campo.value || '').trim();
                    if (valorInformado && obterDivisorFormularioLocacao() === null) {
                        informarErroCampoLocacao(
                            'aluguelDivisor',
                            'Informe um divisor maior que zero e menor ou igual a 1.',
                            { focar: false, toast: false }
                        );
                    } else {
                        limparErroCampoLocacao('aluguelDivisor');
                    }
                    atualizarFluxoLocacao();
                });
            }
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

    var p = pecas.find(function (x) { return x.id == id; });
    if (!p) {
        mostrarToast('Item nao encontrado.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }
    const estadoQuantidade = validarQuantidadeItemFormularioLocacao({ exibirToast: true, focar: true });
    if (!estadoQuantidade.valido) return;

    var campoQtd = document.getElementById('aluguelQtd');
    var qtd = estadoQuantidade.quantidadeDigitada;
    var itemNoCarrinho = carrinhoLocacao.find((x) => x.pecaId == p.id);

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
    document.getElementById('aluguelQtd').removeAttribute('max');
    document.getElementById('aluguelQtd').removeAttribute('aria-invalid');
    document.getElementById('avisoEstoque').innerText = '';
    document.getElementById('inputBuscaPeca').focus();
}

function finalizarLocacao() {
    var cli = document.getElementById('aluguelCliente').value;
    var ini = document.getElementById('aluguelIni').value;
    var fim = document.getElementById('aluguelFim').value;
    if (!validarDadosBaseLocacao(true)) return;

    var divInput = obterDivisorFormularioLocacao();
    const cliente = obterClienteLocacaoAtual();

    if (carrinhoLocacao.length === 0) {
        mostrarToast('Adicione pelo menos 1 item à locação.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
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
    if (!validarDisponibilidadeCarrinhoLocacao({ exibirErro: true })) return;

    const itensParaSalvar = carrinhoLocacao.map((item) => ({ ...item }));
    const dadosNovaLocacao = {
        locadorId: parseInt(cli, 10),
        dataAluguel: ini,
        dataDevolucaoPrevisao: fim,
        items: itensParaSalvar,
        status: 'ativo',
        divisorFatura: divInput,
        estoqueReserva: {
            status: 'nao_reservado',
            origem: 'criacao_locacao',
            movimentacaoIds: []
        }
    };

    const concluirCriacaoLocacao = () => {
        const novaLocacaoId = Date.now();
        let novaLocacao = sincronizarFinanceiroLocacao({
            id: novaLocacaoId,
            ...dadosNovaLocacao
        });
        if (typeof atualizarSnapshotReservaLocacao === 'function') {
            atualizarSnapshotReservaLocacao(novaLocacao, {
                origem: 'criacao_locacao',
                capturadoEm: new Date().toISOString(),
                statusReserva: 'nao_reservado'
            });
        }
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
        Object.keys(ERROS_CAMPOS_LOCACAO).forEach(limparErroCampoLocacao);

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

        mostrarToast('Locação concluída!');
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
    if (typeof validarPermissao === 'function' && !validarPermissao('cancelar_locacao', 'Somente administrador pode cancelar locações.')) {
        return;
    }

    confirmarAcao('Cancelar locacao?', () => {
        const locacao = locacoes.find((l) => String(l.id) === String(id));
        if (!locacao) {
            mostrarToast('Locacao nao encontrada.');
            return;
        }

        const statusAtual = String(locacao.status || '').trim().toLowerCase();
        const fluxoAtual = String(locacao.statusFluxo || '').trim().toLowerCase();
        if (statusAtual === 'cancelado' || fluxoAtual === 'cancelado') {
            mostrarToast('Locacao ja esta cancelada.');
            return;
        }

        if (typeof atualizarStatusLocacaoDominio === 'function') {
            atualizarStatusLocacaoDominio(locacao, 'cancelado', {
                acao: 'cancelamento',
                descricao: 'Locacao cancelada.',
                origem: 'locacoes'
            });
        } else {
            locacao.status = 'cancelado';
            locacao.statusFluxo = 'cancelado';
            if (typeof registrarHistoricoLocacaoDominio === 'function') {
                registrarHistoricoLocacaoDominio(locacao, {
                    acao: 'cancelamento',
                    descricao: 'Locacao cancelada.',
                    origem: 'locacoes'
                });
            }
        }

        if (typeof registrarLog === 'function') {
            const clienteNome = locadores.find((x) => String(x.id) === String(locacao.locadorId))?.nome || 'Cliente';
            registrarLog('locacao', 'cancelar', `Locacao cancelada: ${clienteNome} #${String(locacao.id || '').slice(-4)}`);
        }

        if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        mostrarToast('Locacao cancelada e mantida no historico.');
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
        const {
            financeiroAtual,
            valorTotal,
            sinalAtual: sinal
        } = obterResumoPagamentoLocacao(l);
        l.financeiro = {
            ...financeiroAtual,
            sinal: l.pago ? valorTotal : sinal,
            valorRestante: l.pago ? 0 : Math.max(valorTotal - sinal, 0),
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
        if (typeof renderFinanceiroResumo === 'function') renderFinanceiroResumo();
        renderStats();
        sincronizar('salvar');
        mostrarToast('Pagamento atualizado!');
    }
}

function marcarPagamentoParcial(id) {
    if (typeof validarPermissao === 'function' && !validarPermissao('alterar_pagamento', 'Somente administrador pode alterar status de pagamento.')) {
        return;
    }

    const locacao = obterLocacaoPagamentoPorId(id);
    if (!locacao) return;

    const modal = document.getElementById('modalPagamentoLocacao');
    const inputValor = document.getElementById('pagamentoLocacaoValorRecebido');
    const inputId = document.getElementById('pagamentoLocacaoId');

    if (!modal || !inputValor || !inputId) {
        solicitarPagamentoPromptLocacao(locacao);
        return;
    }

    const resumo = obterResumoPagamentoLocacao(locacao);
    const cliente = locadores.find((x) => String(x.id) === String(locacao.locadorId));

    inputId.value = locacao.id;
    inputValor.value = formatarValorPromptFinanceiro(resumo.recebidoAtual);
    inputValor.dataset.valorMaximo = String(resumo.valorTotal);

    atualizarTextoElemento('pagamentoLocacaoCliente', cliente?.nome || 'Cliente removido');
    atualizarTextoElemento('pagamentoLocacaoCodigo', `#${String(locacao.id || '').slice(-4) || '----'}`);
    atualizarTextoElemento('pagamentoLocacaoTotal', formatarMoedaBR(resumo.valorTotal));
    atualizarTextoElemento('pagamentoLocacaoRecebidoAtual', formatarMoedaBR(resumo.recebidoAtual));
    atualizarTextoElemento('pagamentoLocacaoRestanteAtual', formatarMoedaBR(resumo.valorRestante));

    atualizarPreviewPagamentoLocacao();
    modal.classList.add('active');

    setTimeout(() => {
        try {
            inputValor.focus({ preventScroll: true });
            inputValor.select();
        } catch (_) {
            inputValor.focus();
        }
    }, 60);
}

function atualizarPreviewPagamentoLocacao() {
    const inputValor = document.getElementById('pagamentoLocacaoValorRecebido');
    const inputId = document.getElementById('pagamentoLocacaoId');
    if (!inputValor || !inputId) return;

    const locacao = obterLocacaoPagamentoPorId(inputId.value);
    if (!locacao) return;

    const resumo = obterResumoPagamentoLocacao(locacao);
    const textoInformado = String(inputValor.value || '').trim();
    const valorInformado = textoInformado ? parseValorFinanceiroLocacao(textoInformado) : 0;

    if (!Number.isFinite(valorInformado)) {
        atualizarTextoElemento('pagamentoLocacaoNovoRestante', '-');
        atualizarBadgePreviewPagamento('invalido', 'Valor inválido');
        return;
    }

    const calculo = calcularStatusPagamentoLocacao(
        resumo.valorTotal,
        Math.min(Math.max(valorInformado, 0), resumo.valorTotal)
    );

    atualizarTextoElemento('pagamentoLocacaoNovoRestante', formatarMoedaBR(calculo.novoRestante));
    atualizarBadgePreviewPagamento(calculo.statusPagamento);
}

function preencherPagamentoRapido(tipo) {
    const inputValor = document.getElementById('pagamentoLocacaoValorRecebido');
    const inputId = document.getElementById('pagamentoLocacaoId');
    if (!inputValor || !inputId) return;

    const locacao = obterLocacaoPagamentoPorId(inputId.value);
    if (!locacao) return;

    const resumo = obterResumoPagamentoLocacao(locacao);
    let valor = 0;

    if (tipo === 'total') {
        valor = resumo.valorTotal;
    } else if (String(tipo) === '50') {
        valor = resumo.valorTotal / 2;
    } else {
        valor = Number(tipo) || 0;
    }

    inputValor.value = formatarValorPromptFinanceiro(Math.min(Math.max(valor, 0), resumo.valorTotal));
    atualizarPreviewPagamentoLocacao();
    focarCampoLocacao('pagamentoLocacaoValorRecebido');
}

function salvarPagamentoLocacao() {
    const inputValor = document.getElementById('pagamentoLocacaoValorRecebido');
    const inputId = document.getElementById('pagamentoLocacaoId');
    if (!inputValor || !inputId) return;

    const locacao = obterLocacaoPagamentoPorId(inputId.value);
    if (!locacao) {
        mostrarToast('Locação não encontrada para atualizar pagamento.', 'erro');
        return;
    }

    const resumo = obterResumoPagamentoLocacao(locacao);
    const valorInformado = parseValorFinanceiroLocacao(inputValor.value);

    if (!Number.isFinite(valorInformado)) {
        mostrarToast('Valor recebido inválido.', 'erro');
        focarCampoLocacao('pagamentoLocacaoValorRecebido');
        return;
    }

    aplicarRecebimentoLocacao(
        locacao,
        Math.min(Math.max(valorInformado, 0), resumo.valorTotal),
        'financeiro'
    );

    const modal = document.getElementById('modalPagamentoLocacao');
    if (modal) modal.classList.remove('active');
}

function escaparHtmlHistoricoLocacao(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function formatarDataHistoricoLocacao(valor) {
    if (!valor) return '-';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
    return data.toLocaleString('pt-BR');
}

function rotuloStatusFluxoLocacao(statusFluxo) {
    const mapa = {
        orcamento: 'Orçamento',
        aprovado: 'Aprovado',
        separado: 'Separado',
        carregado: 'Carregado',
        montado: 'Montado',
        finalizado: 'Finalizado',
        devolvido: 'Devolvido',
        cancelado: 'Cancelado'
    };
    const chave = String(statusFluxo || '').trim().toLowerCase();
    return mapa[chave] || (chave ? chave.charAt(0).toUpperCase() + chave.slice(1) : 'Não informado');
}

function rotuloStatusPagamentoLocacao(statusPagamento, pago) {
    const mapa = {
        pendente: 'Pendente',
        parcial: 'Parcial',
        pago: 'Pago',
        atrasado: 'Atrasado',
        cancelado: 'Cancelado'
    };
    const chave = String(statusPagamento || '').trim().toLowerCase();
    if (chave && mapa[chave]) return mapa[chave];
    return pago ? 'Pago' : 'Pendente';
}

function abrirHistoricoLocacao(id) {
    const modal = document.getElementById('modalHistoricoLocacao');
    const corpo = document.getElementById('historicoLocacaoConteudo');
    if (!modal || !corpo) {
        mostrarToast('Painel de histórico da locação não encontrado.', 'erro');
        return;
    }

    const locacao = locacoes.find((x) => String(x.id) === String(id));
    if (!locacao) {
        mostrarToast('Locação não encontrada.', 'erro');
        return;
    }

    const locacaoNormalizada = typeof normalizarLocacaoDominio === 'function'
        ? normalizarLocacaoDominio(locacao)
        : locacao;

    const cliente = locadores.find((x) => String(x.id) === String(locacaoNormalizada.locadorId));
    const clienteNome = cliente?.nome || 'Cliente removido';
    const statusFluxo = rotuloStatusFluxoLocacao(locacaoNormalizada.statusFluxo);
    const statusPagamento = rotuloStatusPagamentoLocacao(
        locacaoNormalizada?.financeiro?.statusPagamento,
        locacaoNormalizada?.pago
    );
    const valorTotal = typeof calcularValorLocacaoDominio === 'function'
        ? calcularValorLocacaoDominio(locacaoNormalizada)
        : Math.max(0, parseValorFinanceiroLocacao(
            locacaoNormalizada?.financeiro?.valorTotal ?? locacaoNormalizada?.valorTotalCalculado ?? 0
        ) || 0);

    const historico = Array.isArray(locacaoNormalizada.historicoAlteracoes)
        ? locacaoNormalizada.historicoAlteracoes.slice().sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0))
        : [];
    const idsMovimentacoesReserva = new Set(
        Array.isArray(locacaoNormalizada?.estoqueReserva?.movimentacaoIds)
            ? locacaoNormalizada.estoqueReserva.movimentacaoIds.map((movimentacaoId) => String(movimentacaoId))
            : []
    );
    const ledgerEstoque = typeof movimentacoesEstoque !== 'undefined' && Array.isArray(movimentacoesEstoque)
        ? movimentacoesEstoque
        : (Array.isArray(window.movimentacoesEstoque) ? window.movimentacoesEstoque : []);
    const movimentacoesReserva = ledgerEstoque
        .filter((movimentacao) => {
            if (String(movimentacao?.locacaoId || '') !== String(locacaoNormalizada.id || '')) return false;
            if (String(movimentacao?.tipoMovimentacao || '').toLowerCase() !== 'reserva') return false;
            if (idsMovimentacoesReserva.size > 0 && !idsMovimentacoesReserva.has(String(movimentacao?.id || ''))) return false;
            return true;
        })
        .sort((a, b) => new Date(b.dataHora || 0) - new Date(a.dataHora || 0));
    const formatarQuantidadeMovimentacao = (valor) => {
        const numero = Number(valor);
        return Number.isFinite(numero)
            ? numero.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
            : '0';
    };
    const detalhesMovimentacoesReserva = movimentacoesReserva.length
        ? `
            <details class="locacao-history-movements">
                <summary aria-label="Consultar ${movimentacoesReserva.length} movimentações individuais da reserva">
                    Ver ${movimentacoesReserva.length} movimentação(ões) da reserva
                </summary>
                <div class="locacao-history-movement-list">
                    ${movimentacoesReserva.map((movimentacao) => `
                        <article class="locacao-history-movement-item">
                            <strong>${escaparHtmlHistoricoLocacao(movimentacao.pecaNome || 'Item não identificado')}</strong>
                            <dl>
                                <div>
                                    <dt>Quantidade reservada</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(formatarQuantidadeMovimentacao(movimentacao.quantidade))}</dd>
                                </div>
                                <div>
                                    <dt>Saldo anterior</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(formatarQuantidadeMovimentacao(movimentacao.saldoAntes))}</dd>
                                </div>
                                <div>
                                    <dt>Saldo posterior</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(formatarQuantidadeMovimentacao(movimentacao.saldoDepois))}</dd>
                                </div>
                                <div>
                                    <dt>Data e horário</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(formatarDataHistoricoLocacao(movimentacao.dataHora))}</dd>
                                </div>
                                <div>
                                    <dt>Responsável</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(movimentacao.usuario || 'sistema_local')}</dd>
                                </div>
                            </dl>
                        </article>
                    `).join('')}
                </div>
            </details>
        `
        : '';

    const linhasHistorico = historico.length
        ? historico.map((registro) => `
            <article class="locacao-history-item">
                <div class="locacao-history-dot" aria-hidden="true"></div>
                <div class="locacao-history-content">
                    <div class="locacao-history-head">
                        <strong>${escaparHtmlHistoricoLocacao(registro.descricao || 'Atualização registrada')}</strong>
                        <span>${escaparHtmlHistoricoLocacao(formatarDataHistoricoLocacao(registro.data))}</span>
                    </div>
                    <div class="locacao-history-meta">
                        <span><b>Ação:</b> ${escaparHtmlHistoricoLocacao(registro.acao || 'atualizacao')}</span>
                        <span><b>Origem:</b> ${escaparHtmlHistoricoLocacao(registro.origem || 'sistema')}</span>
                        <span><b>Usuário:</b> ${escaparHtmlHistoricoLocacao(registro.usuario || 'sistema_local')}</span>
                    </div>
                    ${registro.acao === 'reserva_estoque' ? detalhesMovimentacoesReserva : ''}
                </div>
            </article>
        `).join('')
        : `
            <div class="ui-state-panel">
                <div class="ui-state ui-state--info ui-state--compact">
                    <div class="ui-state-icon"><i class="bi bi-info-circle" aria-hidden="true"></i></div>
                    <div class="ui-state-content">
                        <strong>Sem histórico detalhado</strong>
                        <span>Esta locação ainda não possui eventos no histórico.</span>
                    </div>
                </div>
            </div>
        `;

    corpo.innerHTML = `
        <div class="locacao-history-summary">
            <div class="locacao-history-card">
                <small>Locação</small>
                <strong>#${String(locacaoNormalizada.id || '').slice(-4) || '----'}</strong>
            </div>
            <div class="locacao-history-card">
                <small>Cliente</small>
                <strong>${escaparHtmlHistoricoLocacao(clienteNome)}</strong>
            </div>
            <div class="locacao-history-card">
                <small>Status fluxo</small>
                <strong>${escaparHtmlHistoricoLocacao(statusFluxo)}</strong>
            </div>
            <div class="locacao-history-card">
                <small>Pagamento</small>
                <strong>${escaparHtmlHistoricoLocacao(statusPagamento)}</strong>
            </div>
            <div class="locacao-history-card">
                <small>Valor</small>
                <strong>${escaparHtmlHistoricoLocacao(valorTotal.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                }))}</strong>
            </div>
        </div>
        <div class="locacao-history-list">
            ${linhasHistorico}
        </div>
    `;

    modal.classList.add('active');
}

function reservarEstoqueDaLocacao(id) {
    const locacao = Array.isArray(locacoes)
        ? locacoes.find((item) => String(item?.id || '') === String(id || ''))
        : null;
    if (!locacao) {
        mostrarToast('Locação não encontrada para reserva.', 'erro');
        return;
    }
    if (typeof reservarEstoqueLocacao !== 'function') {
        mostrarToast('Serviço de reserva de estoque indisponível.', 'erro');
        return;
    }

    const executarReserva = () => {
        const resultado = reservarEstoqueLocacao(locacao);
        if (!resultado?.ok) {
            const detalhe = Array.isArray(resultado?.bloqueios) && resultado.bloqueios.length
                ? resultado.bloqueios[0]
                : 'Não foi possível reservar o estoque.';
            mostrarToast(detalhe, 'erro', 6500);
            return;
        }

        if (resultado.jaReservada) {
            mostrarToast('O estoque desta locação já está reservado. Nenhuma nova movimentação foi criada.', 'info', 5200);
            return;
        }

        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        mostrarToast(`Estoque reservado com sucesso: ${resultado.totalReservado || 0} unidade(s) própria(s).`);
    };

    const reservaAtual = typeof normalizarEstoqueReservaLocacao === 'function'
        ? normalizarEstoqueReservaLocacao(locacao)
        : (locacao.estoqueReserva || {});
    if (reservaAtual.status === 'reservado' || reservaAtual.status === 'reservado_legado') {
        executarReserva();
        return;
    }

    if (typeof confirmarAcao === 'function') {
        confirmarAcao(
            'Reservar agora somente as quantidades próprias desta locação?',
            executarReserva,
            {
                titulo: 'Reservar estoque',
                textoConfirmar: 'Reservar estoque',
                classeConfirmar: 'btn-warning'
            }
        );
        return;
    }

    if (confirm('Reservar agora somente as quantidades próprias desta locação?')) {
        executarReserva();
    }
}

function obterEstadoQuantidadeItemFormularioLocacao() {
    const campoItem = document.getElementById('aluguelItemSelect');
    const campoQuantidade = document.getElementById('aluguelQtd');
    const peca = pecas.find((item) => String(item?.id || '') === String(campoItem?.value || ''));
    const valorTexto = String(campoQuantidade?.value ?? '').trim();
    const quantidadeDigitada = Number(valorTexto);

    if (!peca) {
        return { valido: false, silencioso: true, quantidadeDigitada: 0, disponivelRestante: 0 };
    }

    const consulta = consultarDisponibilidadePecaFormularioLocacao(peca);
    const quantidadeNoCarrinho = carrinhoLocacao
        .filter((item) => String(item?.pecaId || '') === String(peca.id || ''))
        .reduce((total, item) => total + Math.max(parseInt(item?.quantidade, 10) || 0, 0), 0);
    const disponivelRestante = Math.max(consulta.disponivel - quantidadeNoCarrinho, 0);

    if (!valorTexto || !Number.isInteger(quantidadeDigitada) || quantidadeDigitada < 1) {
        return {
            valido: false,
            quantidadeDigitada,
            disponivelRestante,
            mensagem: 'Informe uma quantidade válida (mínimo 1).'
        };
    }

    const quantidadeTotalSolicitada = quantidadeNoCarrinho + quantidadeDigitada;
    if (!consulta.valido || quantidadeTotalSolicitada > consulta.disponivel) {
        return {
            valido: false,
            quantidadeDigitada,
            disponivelRestante,
            mensagem: consulta.valido
                ? formatarMensagemDisponibilidadeEstoque({
                    item: peca.nome || 'Item de estoque',
                    solicitado: quantidadeTotalSolicitada,
                    consulta
                })
                : formatarMensagemDisponibilidadeEstoque({ tipo: 'intervalo_invalido', consulta })
        };
    }

    return {
        valido: true,
        quantidadeDigitada,
        disponivelRestante,
        mensagem: `(Disponível no período: ${disponivelRestante})`
    };
}

function validarQuantidadeItemFormularioLocacao(opcoes = {}) {
    const campoQuantidade = document.getElementById('aluguelQtd');
    const aviso = document.getElementById('avisoEstoque');
    const estado = obterEstadoQuantidadeItemFormularioLocacao();

    if (estado.silencioso) {
        campoQuantidade?.removeAttribute('aria-invalid');
        return estado;
    }

    if (estado.valido) campoQuantidade?.removeAttribute('aria-invalid');
    else campoQuantidade?.setAttribute('aria-invalid', 'true');
    if (aviso) aviso.textContent = estado.mensagem || '';
    if (!estado.valido && opcoes.exibirToast) mostrarToast(estado.mensagem, 'erro', 6500);
    if (!estado.valido && opcoes.focar) focarCampoLocacao('aluguelQtd');
    return estado;
}

function atualizarLimiteEstoque(opcoes = {}) {
    var select = document.getElementById('aluguelItemSelect');
    var inputQtd = document.getElementById('aluguelQtd');
    var aviso = document.getElementById('avisoEstoque');

    var id = select.value;
    var p = pecas.find((x) => x.id == id);

    if (p) {
        const consulta = consultarDisponibilidadePecaFormularioLocacao(p);
        const quantidadeNoCarrinho = carrinhoLocacao
            .filter((item) => String(item?.pecaId || '') === String(p.id || ''))
            .reduce((total, item) => total + Math.max(parseInt(item?.quantidade, 10) || 0, 0), 0);
        const disponivel = Math.max(consulta.disponivel - quantidadeNoCarrinho, 0);
        inputQtd.max = disponivel;
        if (!opcoes.preservarQuantidade) inputQtd.value = '1';
        validarQuantidadeItemFormularioLocacao();
    } else {
        aviso.innerText = '';
        inputQtd.removeAttribute('max');
        inputQtd.removeAttribute('aria-invalid');
    }
}

function validarDigitacao(input) {
    validarQuantidadeItemFormularioLocacao();
}

window.renderCarrinhoLocacao = renderCarrinhoLocacao;
window.removerItemCarrinho = removerItemCarrinho;
window.limparCarrinhoLocacao = limparCarrinhoLocacao;
window.irEtapaLocacao = irEtapaLocacao;
window.inicializarFluxoLocacao = inicializarFluxoLocacao;
window.atualizarFluxoLocacao = atualizarFluxoLocacao;
window.fecharSugestoesLocacao = fecharSugestoesLocacao;
window.abrirHistoricoLocacao = abrirHistoricoLocacao;
window.reservarEstoqueDaLocacao = reservarEstoqueDaLocacao;
