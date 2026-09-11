// Renderizacoes das abas Orcamentos, Financeiro e Agenda
(function () {
    const FILTROS_ORCAMENTOS = new Set(['todos', 'orcamento', 'aprovado', 'finalizado', 'cancelado']);
    const FILTROS_FINANCEIRO = new Set(['todos', 'pendente', 'parcial', 'hoje', 'semana', 'atrasado', 'pago']);
    const FILTROS_AGENDA = new Set(['todos', 'hoje', 'semana', 'atrasado']);

    const CHAVE_FILTRO_ORCAMENTOS = 'mtz:orcamentosFiltro';
    const CHAVE_FILTRO_FINANCEIRO = 'mtz:financeiroFiltro';
    const CHAVE_FILTRO_AGENDA = 'mtz:agendaFiltro';

    let filtroOrcamentosAtual = 'todos';
    let filtroFinanceiroAtual = 'todos';
    let filtroAgendaAtual = 'todos';
    let acionadorDetalhesContaReceber = null;
    let eventosDetalhesContaReceberRegistrados = false;
    let sessaoEstornoRecebimento = null;
    let acionadorEstornoRecebimento = null;
    let eventosEstornoRecebimentoRegistrados = false;
    let estornoRecebimentoEmProcessamento = false;
    let sessaoConciliacaoFinanceira = null;
    let acionadorConciliacaoFinanceira = null;
    let eventosConciliacaoFinanceiraRegistrados = false;
    let conciliacaoFinanceiraEmProcessamento = false;

    function normalizarTextoBusca(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function parseDataIsoLocal(valor) {
        const base = String(valor || '').trim();
        if (!base) return null;
        const data = new Date(`${base}T00:00:00`);
        if (Number.isNaN(data.getTime())) return null;
        data.setHours(0, 0, 0, 0);
        return data;
    }

    function formatarDataCurta(valor) {
        if (!valor) return '-';
        if (typeof formatarData === 'function') return formatarData(valor);
        const data = parseDataIsoLocal(valor);
        if (!data) return '-';
        return data.toLocaleDateString('pt-BR');
    }

    function calcularDiferencaDias(data, referencia) {
        if (!(data instanceof Date) || Number.isNaN(data.getTime())) return null;
        const dataBase = new Date(data);
        const referenciaBase = new Date(referencia);
        dataBase.setHours(0, 0, 0, 0);
        referenciaBase.setHours(0, 0, 0, 0);
        return Math.round((dataBase.getTime() - referenciaBase.getTime()) / 86400000);
    }

    function rotuloPrazoFinanceiro(item) {
        if (!item?.vencimento) return 'Sem vencimento';
        if (item.statusPagamento === 'pago') return 'Quitado';

        const dias = Number(item.diasParaVencer);
        if (!Number.isFinite(dias)) return '';
        if (dias < 0) return `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`;
        if (dias === 0) return 'Vence hoje';
        if (dias === 1) return 'Vence amanhã';
        if (dias <= 7) return `Vence em ${dias} dias`;
        return '';
    }

    function prioridadeOrdenacaoFinanceira(item) {
        if (item?.statusPagamento === 'pago') return 5;
        if (!item?.vencimentoData) return 4;

        const dias = Number(item.diasParaVencer);
        if (!Number.isFinite(dias)) return 4;
        if (dias < 0) return 0;
        if (dias === 0) return 1;
        if (dias <= 7) return 2;
        return 3;
    }

    function compararTextoDeterministico(valorA, valorB) {
        const a = String(valorA ?? '');
        const b = String(valorB ?? '');
        if (a === b) return 0;
        return a < b ? -1 : 1;
    }

    function chaveIdFinanceiroTipado(id) {
        if (typeof id === 'number' && Number.isFinite(id)) {
            const normalizado = Object.is(id, -0) ? 0 : id;
            return `numero:${normalizado}`;
        }
        if (typeof id === 'string' && id.length > 0) return `texto:${id}`;
        return `invalido:${typeof id}`;
    }

    function chaveCanonicaFinanceira(valor, vistos = new WeakSet()) {
        if (valor === null) return 'null';
        const tipo = typeof valor;
        if (tipo === 'string') return `s:${JSON.stringify(valor)}`;
        if (tipo === 'number') {
            if (!Number.isFinite(valor)) return `n:${String(valor)}`;
            return `n:${Object.is(valor, -0) ? '0' : String(valor)}`;
        }
        if (tipo === 'boolean') return valor ? 'b:1' : 'b:0';
        if (valor instanceof Date) return `d:${Number.isNaN(valor.getTime()) ? '' : valor.toISOString()}`;
        if (tipo !== 'object') return `${tipo}:`;
        if (vistos.has(valor)) return 'ciclo';
        vistos.add(valor);
        const resultado = Array.isArray(valor)
            ? `a:[${valor.map((item) => chaveCanonicaFinanceira(item, vistos)).join(',')}]`
            : `o:{${Object.keys(valor).sort().map((chave) => (
                `${JSON.stringify(chave)}:${chaveCanonicaFinanceira(valor[chave], vistos)}`
            )).join(',')}}`;
        vistos.delete(valor);
        return resultado;
    }

    function obterDataOrdenacaoFinanceira(item) {
        const lancamentos = Array.isArray(item?.financeiro?.lancamentosRecebimentos)
            ? item.financeiro.lancamentosRecebimentos
            : [];
        const datasLancamentos = lancamentos
            .map((lancamento) => Date.parse(lancamento?.atualizadoEm || lancamento?.registradoEm || lancamento?.data || ''))
            .filter(Number.isFinite);
        if (item?.statusPagamento === 'pago' && datasLancamentos.length) {
            return datasLancamentos.reduce((maisRecente, atual) => Math.max(maisRecente, atual), 0);
        }
        return item?.vencimentoData instanceof Date && !Number.isNaN(item.vencimentoData.getTime())
            ? item.vencimentoData.getTime()
            : Number.MAX_SAFE_INTEGER;
    }

    function compararLancamentosFinanceiros(a, b) {
        const prioridadeA = prioridadeOrdenacaoFinanceira(a);
        const prioridadeB = prioridadeOrdenacaoFinanceira(b);
        if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;

        const dataA = obterDataOrdenacaoFinanceira(a);
        const dataB = obterDataOrdenacaoFinanceira(b);
        if (dataA !== dataB) {
            return a?.statusPagamento === 'pago' && b?.statusPagamento === 'pago'
                ? dataB - dataA
                : dataA - dataB;
        }

        const porId = compararTextoDeterministico(chaveIdFinanceiroTipado(a?.id), chaveIdFinanceiroTipado(b?.id));
        if (porId !== 0) return porId;
        return compararTextoDeterministico(chaveCanonicaFinanceira(a), chaveCanonicaFinanceira(b));
    }

    function lerFiltroPersistido(chave, fallback, conjuntoValido) {
        try {
            const salvo = String(localStorage.getItem(chave) || '').trim().toLowerCase();
            return conjuntoValido.has(salvo) ? salvo : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function salvarFiltroPersistido(chave, valor) {
        try {
            localStorage.setItem(chave, valor);
        } catch (_) {
            // Falha de storage nao deve bloquear filtro.
        }
    }

    function obterNomeCliente(locadorId) {
        const resultado = resolverClientePorIdExato(locadores, locadorId);
        if (resultado.encontrado) return resultado.cliente.nome || 'Removido';
        return resultado.estado === 'duplicado' ? 'Cadastro ambíguo' : 'Removido';
    }

    function inferirStatusFluxo(locacaoNormalizada) {
        const statusFluxo = String(locacaoNormalizada?.statusFluxo || '').trim().toLowerCase();
        if (statusFluxo) return statusFluxo;
        const status = String(locacaoNormalizada?.status || '').trim().toLowerCase();
        if (status === 'cancelado') return 'cancelado';
        if (status === 'devolvido') return 'finalizado';
        return 'aprovado';
    }

    function inferirStatusPagamento(locacaoNormalizada) {
        const statusPagamento = String(locacaoNormalizada?.financeiro?.statusPagamento || '').trim().toLowerCase();
        if (statusPagamento) return statusPagamento;
        return locacaoNormalizada?.pago ? 'pago' : 'pendente';
    }

    function rotuloStatusFluxo(statusFluxo) {
        const mapa = {
            orcamento: 'Orçamento',
            aprovado: 'Aprovado',
            separado: 'Separado',
            carregado: 'Carregado',
            montado: 'Montado',
            finalizado: 'Finalizado',
            devolvido: 'Devolvido',
            cancelado: 'Cancelado',
            invalido: 'Inconsistente'
        };
        return mapa[String(statusFluxo || '').trim().toLowerCase()] || 'Aprovado';
    }

    function rotuloStatusPagamento(statusPagamento) {
        const mapa = {
            todos: 'Todos',
            pendente: 'Pendente',
            parcial: 'Parcial',
            pago: 'Pago',
            hoje: 'Vence hoje',
            semana: 'Próximos 7 dias',
            atrasado: 'Atrasado',
            cancelado: 'Cancelado'
        };
        return mapa[String(statusPagamento || '').trim().toLowerCase()] || 'Pendente';
    }

    function classeBadgeStatus(status) {
        const chave = String(status || '').trim().toLowerCase();
        if (chave === 'pago' || chave === 'aprovado' || chave === 'finalizado' || chave === 'devolvido') return 'badge-success';
        if (chave === 'atrasado' || chave === 'cancelado') return 'badge-danger';
        if (chave === 'parcial') return 'badge-warning';
        if (chave === 'orcamento') return 'badge-info';
        return 'badge-warning';
    }

    function obterBaseLocacoes(opcoes = {}) {
        const incluirValoresReaisCompatibilidade = opcoes.incluirValoresReaisCompatibilidade !== false;
        const converterCentavosParaReaisCompatibilidade = (centavos) => {
            if (!Number.isSafeInteger(centavos) || centavos < 0
                || typeof normalizarValorMonetarioLegadoCentavos !== 'function') return null;
            const valor = centavos / 100;
            const reconvertido = normalizarValorMonetarioLegadoCentavos(valor);
            return reconvertido.ok && reconvertido.centavos === centavos ? valor : null;
        };
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const dataReferencia = `${String(hoje.getFullYear()).padStart(4, '0')}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

        return (Array.isArray(locacoes) ? locacoes : []).map((locacao) => {
            const normalizada = typeof normalizarLocacaoDominio === 'function'
                ? normalizarLocacaoDominio(locacao, { hoje })
                : { ...locacao };

            const statusFluxo = inferirStatusFluxo(normalizada);
            const statusVisual = String(normalizada?.statusVisual || normalizada?.status || '').trim().toLowerCase() || 'ativo';
            const projecaoConta = typeof obterProjecaoFinanceiraContaReceber === 'function'
                ? obterProjecaoFinanceiraContaReceber(normalizada.id, contasReceber, dataReferencia)
                : { estado: 'ausente', encontrada: false };
            const contaEncontrada = projecaoConta.estado === 'encontrado' && projecaoConta.encontrada === true;
            const contaAusente = projecaoConta.estado === 'ausente' && projecaoConta.encontrada === false;
            const possuiContaInconsistente = !contaEncontrada && !contaAusente;
            const statusPagamentoLegado = inferirStatusPagamento(normalizada);
            const projecaoLegada = contaAusente
                && typeof obterProjecaoFinanceiraLegadaLocacao === 'function'
                ? obterProjecaoFinanceiraLegadaLocacao(normalizada) : { encontrada: false };
            const possuiLegadoInconsistente = !contaEncontrada
                && !possuiContaInconsistente && !projecaoLegada.encontrada;
            const statusPagamento = contaEncontrada
                ? (projecaoConta.situacao === 'vencida' ? 'atrasado' : projecaoConta.situacao)
                : possuiContaInconsistente || possuiLegadoInconsistente ? 'invalido' : statusPagamentoLegado;
            const vencimento = contaEncontrada
                ? projecaoConta.vencimento
                : possuiContaInconsistente ? ''
                    : String(normalizada?.financeiro?.vencimento || normalizada?.dataDevolucaoPrevisao || '').trim();
            const vencimentoData = parseDataIsoLocal(vencimento);
            const diasParaVencer = vencimentoData ? calcularDiferencaDias(vencimentoData, hoje) : null;
            const dataMontagem = String(normalizada?.datasMontagem?.inicio || normalizada?.dataAluguel || '').trim();
            const dataDesmontagem = String(normalizada?.datasDesmontagem?.inicio || normalizada?.dataDevolucaoPrevisao || '').trim();

            return {
                ...normalizada,
                statusFluxo,
                statusVisual,
                statusPagamento,
                valorTotalCentavos: contaEncontrada ? projecaoConta.valorTotalCentavos
                    : projecaoLegada.encontrada ? projecaoLegada.valorTotalCentavos : 0,
                valorRecebidoCentavos: contaEncontrada ? projecaoConta.valorRecebidoCentavos
                    : projecaoLegada.encontrada ? projecaoLegada.valorRecebidoCentavos : 0,
                valorRestanteCentavos: contaEncontrada ? projecaoConta.saldoCentavos
                    : projecaoLegada.encontrada ? projecaoLegada.saldoCentavos : 0,
                ...(incluirValoresReaisCompatibilidade ? {
                    valorTotal: converterCentavosParaReaisCompatibilidade(contaEncontrada
                        ? projecaoConta.valorTotalCentavos : projecaoLegada.encontrada
                            ? projecaoLegada.valorTotalCentavos : 0),
                    valorRecebido: converterCentavosParaReaisCompatibilidade(contaEncontrada
                        ? projecaoConta.valorRecebidoCentavos : projecaoLegada.encontrada
                            ? projecaoLegada.valorRecebidoCentavos : 0),
                    valorRestante: converterCentavosParaReaisCompatibilidade(contaEncontrada
                        ? projecaoConta.saldoCentavos : projecaoLegada.encontrada
                            ? projecaoLegada.saldoCentavos : 0)
                } : {}),
                vencimento,
                vencimentoData,
                diasParaVencer,
                dataMontagem,
                dataDesmontagem,
                clienteNome: possuiContaInconsistente ? 'Cadastro ambíguo' : obterNomeCliente(normalizada.locadorId)
            };
        });
    }

    function atualizarFiltroVisual(selector, atributo, valorAtual) {
        document.querySelectorAll(selector).forEach((btn) => {
            const ativo = String(btn.getAttribute(atributo) || '') === String(valorAtual);
            btn.classList.toggle('is-active', ativo);
            btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });
    }

    function aplicarFiltroOrcamentosRapido(filtro = 'todos') {
        const normalizado = String(filtro || '').trim().toLowerCase();
        filtroOrcamentosAtual = FILTROS_ORCAMENTOS.has(normalizado) ? normalizado : 'todos';
        salvarFiltroPersistido(CHAVE_FILTRO_ORCAMENTOS, filtroOrcamentosAtual);
        renderOrcamentos();
    }

    function aplicarFiltroFinanceiroRapido(filtro = 'todos') {
        const normalizado = String(filtro || '').trim().toLowerCase();
        filtroFinanceiroAtual = FILTROS_FINANCEIRO.has(normalizado) ? normalizado : 'todos';
        salvarFiltroPersistido(CHAVE_FILTRO_FINANCEIRO, filtroFinanceiroAtual);
        renderFinanceiroResumo();
    }

    function aplicarFiltroAgendaRapido(filtro = 'todos') {
        const normalizado = String(filtro || '').trim().toLowerCase();
        filtroAgendaAtual = FILTROS_AGENDA.has(normalizado) ? normalizado : 'todos';
        salvarFiltroPersistido(CHAVE_FILTRO_AGENDA, filtroAgendaAtual);
        renderAgendaOperacional();
    }

    function atualizarKpisOrcamentos(lista) {
        const total = lista.length;
        const qtdOrcamento = lista.filter((item) => item.statusFluxo === 'orcamento').length;
        const qtdAprovado = lista.filter((item) => item.statusFluxo === 'aprovado').length;
        const qtdCancelado = lista.filter((item) => item.statusFluxo === 'cancelado').length;

        const mapa = [
            ['orcKpiTotal', total],
            ['orcKpiOrcamento', qtdOrcamento],
            ['orcKpiAprovado', qtdAprovado],
            ['orcKpiCancelado', qtdCancelado]
        ];

        mapa.forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(valor);
        });
    }

    function renderOrcamentos() {
        const tabela = document.getElementById('tblOrcamentos');
        if (!tabela) return;

        const buscaRaw = String(document.getElementById('buscaOrcamentos')?.value || '').trim();
        const busca = normalizarTextoBusca(buscaRaw);
        const base = obterBaseLocacoes();

        atualizarKpisOrcamentos(base);
        atualizarFiltroVisual('#orcamentosFiltros [data-filtro-orc]', 'data-filtro-orc', filtroOrcamentosAtual);

        const filtrados = base.filter((item) => {
            if (filtroOrcamentosAtual !== 'todos') {
                if (filtroOrcamentosAtual === 'finalizado') {
                    if (item.statusFluxo !== 'finalizado' && item.statusFluxo !== 'devolvido') return false;
                } else if (item.statusFluxo !== filtroOrcamentosAtual) {
                    return false;
                }
            }

            if (!busca) return true;
            const alvo = normalizarTextoBusca([
                item.clienteNome,
                item.id,
                `#${String(item.id || '').slice(-4)}`,
                item.dataAluguel,
                item.dataDevolucaoPrevisao,
                item.statusFluxo
            ].join(' '));
            return alvo.includes(busca);
        });

        filtrados.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

        if (typeof atualizarMetaBusca === 'function') {
            atualizarMetaBusca('metaBuscaOrcamentos', {
                total: base.length,
                filtrados: filtrados.length,
                rotulo: 'propostas',
                termo: buscaRaw,
                filtro: filtroOrcamentosAtual,
                filtroLabel: rotuloStatusFluxo(filtroOrcamentosAtual)
            });
        }

        if (!filtrados.length) {
            tabela.innerHTML = typeof criarLinhaTabelaEstado === 'function'
                ? criarLinhaTabelaEstado(6, {
                    tipo: 'empty',
                    titulo: 'Nenhum orçamento encontrado',
                    mensagem: buscaRaw
                        ? `Nenhuma proposta combina com "${buscaRaw}".`
                        : 'Crie uma locação com status "Orçamento" para abrir o pipeline comercial.'
                })
                : '<tr class="table-empty-row"><td colspan="6">Nenhum orçamento encontrado.</td></tr>';
            return;
        }

        tabela.innerHTML = filtrados.map((item) => `
            <tr data-orcamento-id="${item.id}">
                <td>#${String(item.id || '').slice(-4)}</td>
                <td>${typeof sanitizarTexto === 'function' ? sanitizarTexto(item.clienteNome) : item.clienteNome}</td>
                <td>${formatarDataCurta(item.dataAluguel)} até ${formatarDataCurta(item.dataDevolucaoPrevisao)}</td>
                <td>${formatarCentavosMonetarios(item.valorTotalCentavos) || 'Valor indisponível'}</td>
                <td><span class="badge ${classeBadgeStatus(item.statusFluxo)}">${rotuloStatusFluxo(item.statusFluxo)}</span></td>
                <td class="col-actions">
                    <div class="actions-cell">
                        <button class="btn btn-sm btn-info table-action-btn" data-action="irParaLocacaoPorId" data-arg="${item.id}" title="Abrir na locação"><i class="bi bi-box-arrow-up-right"></i></button>
                        <button class="btn btn-sm btn-primary table-action-btn" data-action="abrirHistoricoLocacao" data-arg="${item.id}" title="Ver histórico"><i class="bi bi-clock-history"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function atualizarKpisFinanceiro(lista) {
        const total = lista.length;
        const aberto = somarCentavosMonetarios(lista
            .filter((item) => item.statusPagamento !== 'pago')
            .map((item) => item.valorRestanteCentavos));
        const pago = somarCentavosMonetarios(lista.map((item) => item.valorRecebidoCentavos));
        const atrasado = somarCentavosMonetarios(lista
            .filter((item) => item.statusPagamento === 'atrasado')
            .map((item) => item.valorRestanteCentavos));

        const mapa = [
            ['finKpiTotal', String(total)],
            ['finKpiAberto', aberto.ok ? formatarCentavosMonetarios(aberto.centavos) : 'Valor indisponível'],
            ['finKpiPago', pago.ok ? formatarCentavosMonetarios(pago.centavos) : 'Valor indisponível'],
            ['finKpiAtrasado', atrasado.ok ? formatarCentavosMonetarios(atrasado.centavos) : 'Valor indisponível']
        ];
        mapa.forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = valor;
        });
    }

    function dataLocalFinanceiro() {
        const hoje = new Date();
        return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    }

    function situacaoEfetivaConta(conta, referencia) {
        if (conta?.situacao === 'cancelada' || conta?.situacao === 'encerrada') return conta.situacao;
        const situacoes = (Array.isArray(conta?.parcelas) ? conta.parcelas : []).map((parcela) => (
            typeof calcularSituacaoEfetivaParcelaContaReceber === 'function'
                ? calcularSituacaoEfetivaParcelaContaReceber(parcela, referencia) : parcela.situacao
        ));
        if (situacoes.includes('invalida')) return 'invalida';
        if (situacoes.every((situacao) => situacao === 'paga')) return 'paga';
        if (situacoes.includes('parcial')) return 'parcial';
        if (situacoes.includes('vencida')) return 'vencida';
        return 'pendente';
    }

    function obterContaPorReferenciaUnica(referencia) {
        const encontradas = (Array.isArray(contasReceber) ? contasReceber : []).filter((conta) => (
            conta?.contaReferencia === referencia
        ));
        return encontradas.length === 1 ? encontradas[0] : null;
    }

    function codificarAlvoEstorno(contaReferencia, parcelaReferencia, lancamentoReferencia) {
        return encodeURIComponent(JSON.stringify([contaReferencia, parcelaReferencia, lancamentoReferencia]));
    }

    function decodificarAlvoEstorno(argumento) {
        if (typeof argumento !== 'string') return null;
        try {
            const dados = JSON.parse(decodeURIComponent(argumento));
            return Array.isArray(dados) && dados.length === 3 && dados.every((item) => typeof item === 'string' && item)
                ? dados : null;
        } catch (_erro) {
            return null;
        }
    }

    function gerarOperacaoIdConciliacaoFinanceira(prefixo) {
        const sufixo = typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        return `${prefixo}-${sufixo}`.toLowerCase();
    }

    function obterLancamentosContaComConciliacao(conta, estadoAtual) {
        if (!conta || !Array.isArray(conta.parcelas)) return [];
        return conta.parcelas.flatMap((parcela) => {
            if (!parcela || !Array.isArray(parcela.lancamentosFinanceiros)) return [];
            return parcela.lancamentosFinanceiros.map((lancamento) => {
            const lancamentoReferencia = typeof criarReferenciaLancamentoFinanceiro === 'function'
                ? criarReferenciaLancamentoFinanceiro(lancamento.id) : '';
            const conciliacao = lancamentoReferencia && typeof obterSituacaoConciliacaoLancamento === 'function'
                ? obterSituacaoConciliacaoLancamento(estadoAtual, conta.contaReferencia,
                    parcela.parcelaReferencia, lancamentoReferencia)
                : { estado: 'invalido', conciliacao: null };
            return { conta, parcela, lancamento, lancamentoReferencia,
                situacaoConciliacao: conciliacao.estado, conciliacao: conciliacao.conciliacao || null };
            });
        });
    }

    function obterResumoConciliacaoFinanceira() {
        const estadoAtual = typeof obterEstadoMemoriaAtual === 'function' ? obterEstadoMemoriaAtual() : null;
        const itens = (Array.isArray(contasReceber) ? contasReceber : [])
            .flatMap((conta) => obterLancamentosContaComConciliacao(conta, estadoAtual));
        return {
            itens,
            pendentes: itens.filter((item) => item.situacaoConciliacao === 'pendente').length,
            conciliados: itens.filter((item) => item.situacaoConciliacao === 'conciliado').length,
            divergentes: itens.filter((item) => item.situacaoConciliacao === 'divergente').length
        };
    }

    function contaAtendeFiltrosConciliacao(conta) {
        const estadoAtual = typeof obterEstadoMemoriaAtual === 'function' ? obterEstadoMemoriaAtual() : null;
        const itens = obterLancamentosContaComConciliacao(conta, estadoAtual);
        const situacao = document.getElementById('filtroConciliacaoSituacao')?.value || 'todos';
        const meio = document.getElementById('filtroConciliacaoMeio')?.value || '';
        const contaFinanceira = normalizarTextoBusca(document.getElementById('filtroConciliacaoConta')?.value || '');
        const inicio = document.getElementById('filtroConciliacaoInicio')?.value || '';
        const fim = document.getElementById('filtroConciliacaoFim')?.value || '';
        if (situacao !== 'todos' && !itens.some((item) => item.situacaoConciliacao === situacao)) return false;
        const conciliacoes = itens.map((item) => item.conciliacao).filter(Boolean);
        if (meio && !conciliacoes.some((item) => item.meioPagamento === meio)) return false;
        if (contaFinanceira && !conciliacoes.some((item) => normalizarTextoBusca(item.contaFinanceira).includes(contaFinanceira))) return false;
        if (inicio && !conciliacoes.some((item) => item.dataBancaria >= inicio && (!fim || item.dataBancaria <= fim))) return false;
        if (fim && !inicio && !conciliacoes.some((item) => item.dataBancaria <= fim)) return false;
        return true;
    }

    function renderLancamentosEstornaveisConta(conta, hoje) {
        const destino = document.getElementById('detalhesContaLancamentos');
        if (!destino) return;
        const estadoAtual = typeof obterEstadoMemoriaAtual === 'function'
            ? obterEstadoMemoriaAtual() : null;
        const linhas = [];
        conta.parcelas.forEach((parcela) => {
            parcela.lancamentosFinanceiros.forEach((registro) => {
                    const referencia = typeof criarReferenciaLancamentoFinanceiro === 'function'
                        ? criarReferenciaLancamentoFinanceiro(registro.id) : '';
                    const ehEstorno = registro?.tipo === 'estorno';
                    const resumo = !ehEstorno && referencia && typeof obterResumoEstornoRecebimento === 'function'
                        ? obterResumoEstornoRecebimento(conta.contaReferencia, parcela.parcelaReferencia,
                            referencia, estadoAtual, hoje) : null;
                    const argumento = codificarAlvoEstorno(conta.contaReferencia,
                        parcela.parcelaReferencia, referencia);
                    const situacao = referencia && typeof obterSituacaoConciliacaoLancamento === 'function'
                        ? obterSituacaoConciliacaoLancamento(estadoAtual, conta.contaReferencia,
                            parcela.parcelaReferencia, referencia) : { estado: 'invalido' };
                    const acaoEstorno = resumo?.valorDisponivelCentavos > 0
                        ? `<button type="button" class="btn btn-sm btn-danger" data-acesso="admin" data-action="abrirEstornoRecebimentoConta" data-arg="${sanitizarTexto(argumento)}" aria-label="Estornar recebimento da parcela ${parcela.numero}">Estornar</button>`
                        : (!ehEstorno && resumo ? '<span class="muted-note">Integralmente estornado</span>' : '');
                    const acaoConciliacao = situacao.estado === 'pendente'
                        ? `<button type="button" class="btn btn-sm btn-primary" data-action="abrirConciliacaoFinanceira" data-arg="${sanitizarTexto(argumento)}">Conciliar</button>`
                        : situacao.conciliacao
                            ? `<button type="button" class="btn btn-sm btn-info" data-action="verConciliacaoFinanceira" data-arg="${sanitizarTexto(situacao.conciliacao.conciliacaoReferencia)}">Ver conciliação</button>`
                            : '<span class="badge badge-danger">Inválida</span>';
                    const valor = ehEstorno ? registro.valorEstornoCentavos : registro.valorAplicadoCentavos;
                    linhas.push(`<tr><td>${parcela.numero}/${parcela.totalParcelas}</td><td>${sanitizarTexto(registro.data || '-')}</td>
                        <td>${ehEstorno ? 'Saída' : 'Entrada'}</td><td>${formatarCentavosMonetarios(valor) || 'Valor indisponível'}</td>
                        <td><span class="badge ${situacao.estado === 'conciliado' ? 'badge-success' : situacao.estado === 'divergente' ? 'badge-danger' : 'badge-warning'}">${sanitizarTexto(situacao.estado)}</span></td>
                        <td><div class="actions-cell">${acaoConciliacao}${acaoEstorno}</div></td></tr>`);
                });
        });
        destino.innerHTML = linhas.length
            ? `<h4>Lançamentos e conciliação</h4><div class="table-responsive"><table class="table"><thead><tr><th>Parcela</th><th>Data</th><th>Natureza</th><th>Valor</th><th>Conciliação</th><th>Ações</th></tr></thead><tbody>${linhas.join('')}</tbody></table></div>`
            : '<p class="muted-note">Nenhum lançamento financeiro disponível.</p>';
        if (typeof aplicarPermissoesInterface === 'function') aplicarPermissoesInterface();
    }

    function renderContasReceberDetalhadas() {
        const tabela = document.getElementById('tblContasReceber');
        if (!tabela) return;
        const hoje = dataLocalFinanceiro();
        const busca = normalizarTextoBusca(document.getElementById('buscaContasReceber')?.value || '');
        const filtro = document.getElementById('filtroContaSituacao')?.value || 'todos';
        const clienteFiltro = document.getElementById('filtroContaCliente');
        const inicio = document.getElementById('filtroContaInicio')?.value || '';
        const fim = document.getElementById('filtroContaFim')?.value || '';
        const contas = obterBaseLocacoes({ incluirValoresReaisCompatibilidade: false }).map((locacao) => {
            const projecao = typeof obterProjecaoFinanceiraContaReceber === 'function'
                ? obterProjecaoFinanceiraContaReceber(locacao.id, contasReceber, hoje)
                : { estado: 'ausente', encontrada: false };
            if (projecao.estado === 'encontrado' && projecao.encontrada === true) {
                const conta = projecao.conta;
                const cliente = typeof resolverClientePorIdExato === 'function'
                    ? resolverClientePorIdExato(locadores, conta.clienteId) : { encontrado: false };
                return { conta, clienteNome: cliente.encontrado ? cliente.cliente.nome : 'Removido',
                    clienteReferencia: conta.clienteReferencia, locacao, situacao: projecao.situacao,
                    vencimento: projecao.vencimento, recebido: projecao.valorRecebidoCentavos,
                    saldo: projecao.saldoCentavos, total: projecao.valorTotalCentavos,
                    bloqueada: false, legado: false };
            }
            if (projecao.estado !== 'ausente' || projecao.encontrada !== false) {
                return { conta: null, clienteNome: 'Cadastro ambíguo', clienteReferencia: '', locacao,
                    situacao: 'invalida', vencimento: '', recebido: 0, saldo: 0, total: 0,
                    bloqueada: true, legado: false };
            }
            const referenciaCliente = typeof criarReferenciaTipadaCliente === 'function'
                ? criarReferenciaTipadaCliente(locacao.locadorId) : '';
            if (locacao.statusPagamento === 'invalido') {
                return { conta: null, clienteNome: 'Cadastro ambíguo', clienteReferencia: '', locacao,
                    situacao: 'invalida', vencimento: '', recebido: 0, saldo: 0, total: 0,
                    bloqueada: true, legado: true };
            }
            return { conta: null, clienteNome: locacao.clienteNome || 'Removido',
                clienteReferencia: referenciaCliente, locacao, situacao: locacao.statusPagamento,
                vencimento: locacao.vencimento || '', recebido: locacao.valorRecebidoCentavos,
                saldo: locacao.valorRestanteCentavos, total: locacao.valorTotalCentavos,
                bloqueada: false, legado: true };
        });
        if (clienteFiltro) {
            const atual = clienteFiltro.value;
            const opcoes = [...new Map(contas.filter((item) => item.clienteReferencia)
                .map((item) => [item.clienteReferencia, item.clienteNome])).entries()]
                .sort((a, b) => compararTextoDeterministico(a[1], b[1]));
            clienteFiltro.innerHTML = '<option value="">Todos os clientes</option>' + opcoes.map(([ref, nome]) => (
                `<option value="${sanitizarTexto(ref)}">${sanitizarTexto(nome)}</option>`)).join('');
            clienteFiltro.value = opcoes.some(([ref]) => ref === atual) ? atual : '';
        }
        const resumoConciliacao = typeof obterResumoConciliacaoFinanceira === 'function'
            ? obterResumoConciliacaoFinanceira() : { pendentes: 0, conciliados: 0, divergentes: 0 };
        [['concKpiPendente', resumoConciliacao.pendentes], ['concKpiConciliado', resumoConciliacao.conciliados],
            ['concKpiDivergente', resumoConciliacao.divergentes]].forEach(([id, valor]) => {
            const elemento = document.getElementById(id); if (elemento) elemento.textContent = String(valor);
        });
        const filtradas = contas.filter((item) => {
            const ativa = ['pendente', 'parcial', 'vencida'].includes(item.situacao);
            if (filtro !== 'todos' && (filtro === 'ativa' ? !ativa : item.situacao !== filtro)) return false;
            if (clienteFiltro?.value && item.clienteReferencia !== clienteFiltro.value) return false;
            const dataEmissao = item.conta?.dataEmissao || item.locacao?.dataAluguel || '';
            if (inicio && dataEmissao < inicio) return false;
            if (fim && dataEmissao > fim) return false;
            if (item.conta && typeof contaAtendeFiltrosConciliacao === 'function'
                && !contaAtendeFiltrosConciliacao(item.conta)) return false;
            return !busca || normalizarTextoBusca([item.conta?.id, item.clienteNome,
                item.locacao?.eventoNome, item.locacao?.id, item.conta?.descricao,
                ...(item.conta && typeof obterLancamentosContaComConciliacao === 'function'
                    ? obterLancamentosContaComConciliacao(item.conta,
                    typeof obterEstadoMemoriaAtual === 'function' ? obterEstadoMemoriaAtual() : null)
                    .flatMap((registro) => [registro.lancamento?.operacaoId,
                        registro.conciliacao?.operacaoId, registro.conciliacao?.identificadorBancario]) : [])
            ].join(' ')).includes(busca);
        }).sort((a, b) => compararTextoDeterministico(a.vencimento || '9999-99-99', b.vencimento || '9999-99-99')
            || compararTextoDeterministico(a.conta?.contaReferencia || chaveIdFinanceiroTipado(a.locacao?.id),
                b.conta?.contaReferencia || chaveIdFinanceiroTipado(b.locacao?.id)));
        const validas = contas.filter((item) => !item.bloqueada && item.situacao !== 'invalida');
        const ativas = validas.filter((item) => !['cancelada', 'encerrada'].includes(item.situacao));
        const totais = {
            total: somarCentavosMonetarios(ativas.map((item) => item.total)),
            recebido: somarCentavosMonetarios(validas.map((item) => item.recebido)),
            aberto: somarCentavosMonetarios(ativas.map((item) => item.saldo)),
            vencido: somarCentavosMonetarios(ativas.filter((item) => item.situacao === 'vencida').map((item) => item.saldo)),
            previsto: somarCentavosMonetarios(ativas.filter((item) => ['pendente', 'parcial'].includes(item.situacao)).map((item) => item.saldo))
        };
        [['carKpiTotal',totais.total],['carKpiRecebido',totais.recebido],['carKpiAberto',totais.aberto],
            ['carKpiVencido',totais.vencido],['carKpiPrevisto',totais.previsto]].forEach(([id, soma]) => {
            const el=document.getElementById(id);
            if(el) el.textContent=soma.ok ? formatarCentavosMonetarios(soma.centavos) : 'Valor indisponível';
        });
        tabela.innerHTML = filtradas.length ? filtradas.map((item) => {
            const progresso = item.total ? Math.round((item.recebido / item.total) * 100) : 0;
            const contaRotulo = item.bloqueada ? 'Bloqueada' : item.legado ? 'Legado' : String(item.conta.id);
            return `<tr><td>${sanitizarTexto(contaRotulo)}</td><td>${sanitizarTexto(item.clienteNome)}</td>
                <td>${sanitizarTexto(item.locacao?.eventoNome || item.conta?.descricao || '-') }<div class="table-cell-sub">${sanitizarTexto(String(item.locacao?.id || ''))}</div></td>
                <td>${formatarDataCurta(item.vencimento)}</td><td>${formatarCentavosMonetarios(item.total) || 'Valor indisponível'}</td>
                <td><progress max="100" value="${progresso}">${progresso}%</progress><div class="table-cell-sub">${progresso}%</div></td>
                <td><span class="badge ${classeBadgeStatus(item.situacao === 'vencida' ? 'atrasado' : item.situacao)}">${sanitizarTexto(item.situacao)}</span></td>
                <td>${item.conta && !item.bloqueada ? `<button class="btn btn-sm btn-info" data-action="abrirDetalhesContaReceber" data-arg="${sanitizarTexto(item.conta.contaReferencia)}" aria-label="Ver parcelas da conta ${sanitizarTexto(String(item.conta.id))}"><i class="bi bi-list-check"></i></button>` : '-'}</td></tr>`;
        }).join('') : '<tr><td colspan="8">Nenhuma conta encontrada.</td></tr>';
    }

    function abrirDetalhesContaReceber(referencia) {
        const conta = obterContaPorReferenciaUnica(referencia);
        const modal = document.getElementById('modalDetalhesContaReceber');
        if (!conta || !modal) return false;
        const hoje = dataLocalFinanceiro();
        document.getElementById('detalhesContaTitulo').textContent = `Conta ${String(conta.id)}`;
        document.getElementById('detalhesContaResumo').textContent = `${conta.descricao} · ${formatarCentavosMonetarios(conta.valorTotalCentavos) || 'Valor indisponível'} · ${situacaoEfetivaConta(conta, hoje)}`;
        document.getElementById('detalhesContaParcelas').innerHTML = `<table class="table"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Original</th><th>Recebido</th><th>Saldo</th><th>Situação</th><th>Ação</th></tr></thead><tbody>${conta.parcelas.map((p) => {
            const situacao = calcularSituacaoEfetivaParcelaContaReceber(p, hoje);
            return `<tr><td>${p.numero}/${p.totalParcelas}</td><td>${formatarDataCurta(p.vencimento)}</td><td>${formatarCentavosMonetarios(p.valorOriginalCentavos) || 'Valor indisponível'}</td><td>${formatarCentavosMonetarios(p.valorRecebidoCentavos) || 'Valor indisponível'}</td><td>${formatarCentavosMonetarios(p.saldoCentavos) || 'Valor indisponível'}</td><td>${situacao}</td><td>${p.saldoCentavos>0&&!['cancelada'].includes(situacao)?`<button class="btn btn-sm btn-success" data-action="registrarRecebimentoParcelaConta" data-arg="${sanitizarTexto(conta.contaReferencia)}|${sanitizarTexto(p.parcelaReferencia)}">Receber</button>`:'-'}</td></tr>`;
        }).join('')}</tbody></table>`;
        renderLancamentosEstornaveisConta(conta, hoje);
        const historico = [...(conta.historico || []), ...(conta.parcelas || []).flatMap((p) => p.lancamentosFinanceiros || [])];
        document.getElementById('detalhesContaHistorico').innerHTML = historico.map((h) => {
            const vinculo = h.tipo === 'estorno' && h.lancamentoOriginalReferencia
                ? ` · vinculado a ${sanitizarTexto(h.lancamentoOriginalReferencia)}` : '';
            const motivo = h.tipo === 'estorno' && h.motivo ? ` · ${sanitizarTexto(h.motivo)}` : '';
            return `<p><strong>${sanitizarTexto(h.acao || h.tipo || 'recebimento')}</strong> · ${sanitizarTexto(h.data || '')} · ${sanitizarTexto(h.usuario || h.responsavel || '')}${vinculo}${motivo}</p>`;
        }).join('') || '<p>Sem movimentações.</p>';
        acionadorDetalhesContaReceber = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        cancelarRecebimentoParcelaConta();
        registrarEventosDetalhesContaReceber();
        modal.classList.add('active'); modal.setAttribute('aria-hidden','false'); modal.querySelector('button')?.focus();
        return true;
    }

    function fecharDetalhesContaReceber() {
        const modal=document.getElementById('modalDetalhesContaReceber');
        if (!modal) return false;
        cancelarRecebimentoParcelaConta();
        modal.classList.remove('active'); modal.setAttribute('aria-hidden','true');
        const acionador = acionadorDetalhesContaReceber;
        acionadorDetalhesContaReceber = null;
        if (acionador?.isConnected) acionador.focus({ preventScroll: true });
        return true;
    }

    function registrarRecebimentoParcelaConta(argumento) {
        if (typeof argumento !== 'string') return false;
        const separador = argumento.indexOf('|');
        if (separador < 1) return false;
        const conta = obterContaPorReferenciaUnica(argumento.slice(0,separador));
        const parcelaReferencia = argumento.slice(separador+1);
        if (!conta || conta.parcelas.filter((p)=>p.parcelaReferencia===parcelaReferencia).length!==1) return false;
        const form = document.getElementById('formRecebimentoParcela');
        const contaCampo = document.getElementById('recebimentoParcelaContaReferencia');
        const parcelaCampo = document.getElementById('recebimentoParcelaReferencia');
        const valorCampo = document.getElementById('recebimentoParcelaValor');
        if (!form || !contaCampo || !parcelaCampo || !valorCampo) return false;
        contaCampo.value = conta.contaReferencia;
        parcelaCampo.value = parcelaReferencia;
        valorCampo.value = '';
        definirErroRecebimentoParcela('');
        form.hidden = false;
        valorCampo.focus({ preventScroll: true });
        return true;
    }

    function definirErroRecebimentoParcela(mensagem) {
        const campo = document.getElementById('recebimentoParcelaValor');
        const erro = document.getElementById('recebimentoParcelaErro');
        if (!campo || !erro) return;
        erro.textContent = mensagem || '';
        erro.hidden = !mensagem;
        campo.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
    }

    function cancelarRecebimentoParcelaConta() {
        const form = document.getElementById('formRecebimentoParcela');
        if (form) form.hidden = true;
        ['recebimentoParcelaContaReferencia','recebimentoParcelaReferencia','recebimentoParcelaValor'].forEach((id) => {
            const campo=document.getElementById(id); if(campo) campo.value='';
        });
        definirErroRecebimentoParcela('');
        return true;
    }

    function confirmarRecebimentoParcelaConta() {
        const contaReferencia = document.getElementById('recebimentoParcelaContaReferencia')?.value;
        const parcelaReferencia = document.getElementById('recebimentoParcelaReferencia')?.value;
        const campo = document.getElementById('recebimentoParcelaValor');
        const conta = obterContaPorReferenciaUnica(contaReferencia);
        if (!conta || !campo || conta.parcelas.filter((p)=>p.parcelaReferencia===parcelaReferencia).length!==1) {
            definirErroRecebimentoParcela('A conta ou parcela não pôde ser confirmada.');
            return false;
        }
        const texto = campo.value;
        const operacaoId = typeof gerarOperacaoIdRecebimentoLocacao === 'function' ? gerarOperacaoIdRecebimentoLocacao() : '';
        const ok = aplicarRecebimentoLocacao(conta.locacaoReferencia, '', operacaoId, { parcelaReferencia, valorLancamentoTexto:texto });
        if (ok) { cancelarRecebimentoParcelaConta(); renderFinanceiroResumo(); abrirDetalhesContaReceber(conta.contaReferencia); }
        else { definirErroRecebimentoParcela('Não foi possível registrar este recebimento. Confira o valor e tente novamente.'); campo.focus(); }
        return ok;
    }

    function definirErroEstornoRecebimento(mensagem) {
        const valor = document.getElementById('estornoRecebimentoValor');
        const motivo = document.getElementById('estornoRecebimentoMotivo');
        const erro = document.getElementById('estornoRecebimentoErro');
        if (!valor || !motivo || !erro) return;
        erro.textContent = mensagem || '';
        erro.hidden = !mensagem;
        [valor, motivo].forEach((campo) => campo.setAttribute('aria-invalid', mensagem ? 'true' : 'false'));
    }

    function fecharEstornoRecebimentoConta() {
        if (estornoRecebimentoEmProcessamento) return false;
        const modal = document.getElementById('modalEstornoRecebimento');
        if (!modal) return false;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        definirErroEstornoRecebimento('');
        sessaoEstornoRecebimento = null;
        const acionador = acionadorEstornoRecebimento;
        acionadorEstornoRecebimento = null;
        if (acionador?.isConnected) acionador.focus({ preventScroll: true });
        return true;
    }

    function registrarEventosEstornoRecebimento() {
        if (eventosEstornoRecebimentoRegistrados) return;
        const modal = document.getElementById('modalEstornoRecebimento');
        if (!modal) return;
        eventosEstornoRecebimentoRegistrados = true;
        modal.addEventListener('click', (evento) => {
            if (evento.target === modal) fecharEstornoRecebimentoConta();
        });
        modal.addEventListener('keydown', (evento) => {
            if (!modal.classList.contains('active')) return;
            if (evento.key === 'Escape') {
                evento.preventDefault();
                fecharEstornoRecebimentoConta();
                return;
            }
            if (evento.key !== 'Tab') return;
            const focaveis = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
                .filter((elemento) => !elemento.hidden && elemento.getClientRects().length > 0);
            if (!focaveis.length) { evento.preventDefault(); modal.focus(); return; }
            const primeiro = focaveis[0];
            const ultimo = focaveis[focaveis.length - 1];
            if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
            else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
        });
    }

    function abrirEstornoRecebimentoConta(argumento) {
        if (typeof validarPermissao === 'function'
            && !validarPermissao('alterar_pagamento', 'Somente usuários com permissão financeira podem estornar recebimentos.')) return false;
        const alvo = decodificarAlvoEstorno(argumento);
        const modal = document.getElementById('modalEstornoRecebimento');
        if (!alvo || !modal) return false;
        const estadoAtual = typeof obterEstadoMemoriaAtual === 'function'
            ? obterEstadoMemoriaAtual() : null;
        const resumo = obterResumoEstornoRecebimento(
            alvo[0], alvo[1], alvo[2], estadoAtual, dataLocalFinanceiro());
        if (!resumo || resumo.valorDisponivelCentavos <= 0) return false;
        acionadorEstornoRecebimento = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        sessaoEstornoRecebimento = { ...resumo,
            operacaoId: typeof gerarOperacaoIdEstornoRecebimento === 'function'
                ? gerarOperacaoIdEstornoRecebimento() : '' };
        document.getElementById('estornoRecebimentoRecebido').textContent = formatarCentavosMonetarios(resumo.valorRecebidoCentavos);
        document.getElementById('estornoRecebimentoEstornado').textContent = formatarCentavosMonetarios(resumo.valorEstornadoCentavos);
        document.getElementById('estornoRecebimentoDisponivel').textContent = formatarCentavosMonetarios(resumo.valorDisponivelCentavos);
        document.getElementById('estornoRecebimentoValor').value = '';
        document.getElementById('estornoRecebimentoMotivo').value = '';
        definirErroEstornoRecebimento('');
        registrarEventosEstornoRecebimento();
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.getElementById('estornoRecebimentoValor').focus({ preventScroll: true });
        return true;
    }

    function confirmarEstornoRecebimentoConta() {
        if (estornoRecebimentoEmProcessamento || !sessaoEstornoRecebimento) return false;
        const valor = document.getElementById('estornoRecebimentoValor');
        const motivo = document.getElementById('estornoRecebimentoMotivo');
        const botao = document.getElementById('estornoRecebimentoConfirmar');
        if (!valor || !motivo || !botao) return false;
        estornoRecebimentoEmProcessamento = true;
        botao.disabled = true;
        const contaReferencia = sessaoEstornoRecebimento.contaReferencia;
        let resultado;
        try {
            resultado = aplicarEstornoRecebimentoConta({
                contaReferencia,
                parcelaReferencia: sessaoEstornoRecebimento.parcelaReferencia,
                lancamentoOriginalReferencia: sessaoEstornoRecebimento.lancamentoOriginalReferencia,
                valorEstornoTexto: valor.value,
                motivo: motivo.value,
                operacaoId: sessaoEstornoRecebimento.operacaoId
            });
        } finally {
            estornoRecebimentoEmProcessamento = false;
            botao.disabled = false;
        }
        if (resultado?.ok) {
            fecharEstornoRecebimentoConta();
            abrirDetalhesContaReceber(contaReferencia);
            return true;
        }
        definirErroEstornoRecebimento(resultado?.requerRecuperacao
            ? 'A operação exige recuperação explícita antes de uma nova tentativa.'
            : 'Confira o valor disponível e o motivo informado.');
        valor.focus({ preventScroll: true });
        return false;
    }

    function definirErroConciliacaoFinanceira(mensagem, ids = []) {
        const erro = document.getElementById('conciliacaoFinanceiraErro');
        if (!erro) return;
        erro.textContent = mensagem || '';
        erro.hidden = !mensagem;
        ['conciliacaoSituacao', 'conciliacaoValor', 'conciliacaoData', 'conciliacaoMeio',
            'conciliacaoConta', 'conciliacaoIdentificador', 'conciliacaoMotivo'].forEach((id) => {
            const campo = document.getElementById(id);
            if (!campo) return;
            const invalido = mensagem && ids.includes(id);
            campo.setAttribute('aria-invalid', invalido ? 'true' : 'false');
        });
    }

    function fecharConciliacaoFinanceira() {
        if (conciliacaoFinanceiraEmProcessamento) return false;
        const modal = document.getElementById('modalConciliacaoFinanceira');
        if (!modal) return false;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        definirErroConciliacaoFinanceira('');
        sessaoConciliacaoFinanceira = null;
        const acionador = acionadorConciliacaoFinanceira;
        acionadorConciliacaoFinanceira = null;
        if (acionador?.isConnected) acionador.focus({ preventScroll: true });
        return true;
    }

    function registrarEventosConciliacaoFinanceira() {
        if (eventosConciliacaoFinanceiraRegistrados) return;
        const modal = document.getElementById('modalConciliacaoFinanceira');
        if (!modal) return;
        eventosConciliacaoFinanceiraRegistrados = true;
        modal.addEventListener('click', (evento) => {
            if (evento.target === modal) fecharConciliacaoFinanceira();
        });
        modal.addEventListener('keydown', (evento) => {
            if (!modal.classList.contains('active')) return;
            if (evento.key === 'Escape') { evento.preventDefault(); fecharConciliacaoFinanceira(); return; }
            if (evento.key !== 'Tab') return;
            const focaveis = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
                .filter((elemento) => !elemento.hidden && elemento.getClientRects().length > 0);
            if (!focaveis.length) { evento.preventDefault(); modal.focus(); return; }
            const primeiro = focaveis[0]; const ultimo = focaveis[focaveis.length - 1];
            if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
            else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
        });
        document.getElementById('conciliacaoSituacao')?.addEventListener('change', (evento) => {
            const grupo = document.getElementById('conciliacaoMotivoGrupo');
            if (grupo) grupo.hidden = evento.target.value !== 'divergente';
        });
    }

    function localizarAlvoConciliacaoInterface(argumento) {
        const alvo = decodificarAlvoEstorno(argumento);
        if (!alvo) return null;
        const conta = obterContaPorReferenciaUnica(alvo[0]);
        if (!conta) return null;
        const parcelas = conta.parcelas.filter((parcela) => parcela.parcelaReferencia === alvo[1]);
        if (parcelas.length !== 1) return null;
        const lancamentos = parcelas[0].lancamentosFinanceiros.filter((registro) => (
            typeof criarReferenciaLancamentoFinanceiro === 'function'
            && criarReferenciaLancamentoFinanceiro(registro.id) === alvo[2]));
        return lancamentos.length === 1 ? { conta, parcela: parcelas[0], lancamento: lancamentos[0], alvo } : null;
    }

    function abrirConciliacaoFinanceira(argumento) {
        if (typeof validarPermissao === 'function'
            && !validarPermissao('conciliar_pagamento', 'Você não possui permissão para conciliar lançamentos.')) return false;
        const resolvido = localizarAlvoConciliacaoInterface(argumento);
        const modal = document.getElementById('modalConciliacaoFinanceira');
        if (!resolvido || !modal) return false;
        const estadoAtual = typeof obterEstadoMemoriaAtual === 'function' ? obterEstadoMemoriaAtual() : null;
        const efetiva = obterSituacaoConciliacaoLancamento(estadoAtual, ...resolvido.alvo);
        if (efetiva.estado !== 'pendente') return false;
        acionadorConciliacaoFinanceira = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        sessaoConciliacaoFinanceira = { modo: 'criar', contaReferencia: resolvido.alvo[0],
            parcelaReferencia: resolvido.alvo[1], lancamentoReferencia: resolvido.alvo[2],
            operacaoId: gerarOperacaoIdConciliacaoFinanceira('conciliar') };
        document.getElementById('conciliacaoFinanceiraTitulo').textContent = 'Conciliar lançamento';
        document.getElementById('conciliacaoSituacao').value = 'conciliado';
        document.getElementById('conciliacaoValor').value = '';
        document.getElementById('conciliacaoData').value = dataLocalFinanceiro();
        ['conciliacaoConta', 'conciliacaoIdentificador', 'conciliacaoMotivo', 'conciliacaoObservacao']
            .forEach((id) => { const campo = document.getElementById(id); if (campo) campo.value = ''; });
        document.getElementById('conciliacaoMeio').value = 'pix';
        document.getElementById('conciliacaoMotivoGrupo').hidden = true;
        document.getElementById('conciliacaoCamposEdicao').hidden = false;
        document.getElementById('conciliacaoDetalhes').hidden = true;
        document.getElementById('conciliacaoConfirmar').hidden = false;
        document.getElementById('conciliacaoDesconsiderarGrupo').hidden = true;
        definirErroConciliacaoFinanceira('');
        registrarEventosConciliacaoFinanceira();
        modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false');
        document.getElementById('conciliacaoSituacao').focus({ preventScroll: true });
        return true;
    }

    function verConciliacaoFinanceira(referencia) {
        const registros = (Array.isArray(conciliacoesFinanceiras) ? conciliacoesFinanceiras : [])
            .filter((registro) => registro?.tipo === 'conciliacao' && registro.conciliacaoReferencia === referencia);
        const modal = document.getElementById('modalConciliacaoFinanceira');
        if (registros.length !== 1 || !modal) return false;
        const registro = registros[0];
        acionadorConciliacaoFinanceira = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        sessaoConciliacaoFinanceira = { modo: 'ver', contaReferencia: registro.contaReferencia,
            parcelaReferencia: registro.parcelaReferencia, lancamentoReferencia: registro.lancamentoReferencia,
            conciliacaoOriginalReferencia: registro.conciliacaoReferencia,
            operacaoId: gerarOperacaoIdConciliacaoFinanceira('desconsiderar') };
        document.getElementById('conciliacaoFinanceiraTitulo').textContent = 'Conciliação financeira';
        document.getElementById('conciliacaoDetalhes').textContent = `${registro.situacao} · ${registro.natureza} · ${formatarCentavosMonetarios(registro.valorBancarioCentavos)} · ${registro.dataBancaria} · ${registro.meioPagamento} · ${registro.contaFinanceira} · ${registro.identificadorBancario}`;
        document.getElementById('conciliacaoCamposEdicao').hidden = true;
        document.getElementById('conciliacaoDetalhes').hidden = false;
        document.getElementById('conciliacaoConfirmar').hidden = true;
        const grupo = document.getElementById('conciliacaoDesconsiderarGrupo');
        grupo.hidden = !(typeof temPermissao === 'function' && temPermissao('desconsiderar_conciliacao'));
        document.getElementById('conciliacaoDesconsideracaoMotivo').value = '';
        registrarEventosConciliacaoFinanceira();
        modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false');
        (grupo.hidden ? modal.querySelector('.btn-close-modal') : document.getElementById('conciliacaoDesconsideracaoMotivo'))?.focus({ preventScroll: true });
        return true;
    }

    function executarConciliacaoInterface(tipo) {
        if (conciliacaoFinanceiraEmProcessamento || !sessaoConciliacaoFinanceira) return false;
        const permissao = tipo === 'conciliacao' ? 'conciliar_pagamento' : 'desconsiderar_conciliacao';
        const instante = new Date(); const registradoEm = instante.toISOString();
        const entrada = { contaReferencia: sessaoConciliacaoFinanceira.contaReferencia,
            parcelaReferencia: sessaoConciliacaoFinanceira.parcelaReferencia,
            lancamentoReferencia: sessaoConciliacaoFinanceira.lancamentoReferencia,
            operacaoId: sessaoConciliacaoFinanceira.operacaoId, registradoEm,
            responsavel: typeof obterResponsavelRecebimentoLocacao === 'function'
                ? obterResponsavelRecebimentoLocacao() : 'Usuário',
            persistencia: { versao: window.SCHEMA_VERSION_V12 || '12.6', data: registradoEm,
                ultimaEdicao: instante.getTime() } };
        if (tipo === 'conciliacao') Object.assign(entrada, {
            situacao: document.getElementById('conciliacaoSituacao')?.value,
            valorBancarioTexto: document.getElementById('conciliacaoValor')?.value,
            dataBancaria: document.getElementById('conciliacaoData')?.value,
            meioPagamento: document.getElementById('conciliacaoMeio')?.value,
            contaFinanceira: document.getElementById('conciliacaoConta')?.value.trim(),
            identificadorBancario: document.getElementById('conciliacaoIdentificador')?.value.trim(),
            motivoDivergencia: document.getElementById('conciliacaoMotivo')?.value.trim() || '',
            observacao: document.getElementById('conciliacaoObservacao')?.value.trim() || '', comprovante: null
        }); else Object.assign(entrada, { conciliacaoOriginalReferencia: sessaoConciliacaoFinanceira.conciliacaoOriginalReferencia,
            motivo: document.getElementById('conciliacaoDesconsideracaoMotivo')?.value.trim() || '' });
        conciliacaoFinanceiraEmProcessamento = true;
        const botao = document.getElementById(tipo === 'conciliacao' ? 'conciliacaoConfirmar' : 'conciliacaoDesconsiderar');
        if (botao) botao.disabled = true;
        let resultado;
        try {
            const dependencias = criarDependenciasExecutorConciliacaoFinanceira({ armazenamento: localStorage,
                validarPermissaoFinanceira: (acao) => typeof temPermissao === 'function' && acao === permissao && temPermissao(acao) });
            resultado = tipo === 'conciliacao'
                ? executarConciliacaoFinanceiraTransacional(entrada, dependencias)
                : executarDesconsideracaoConciliacaoTransacional(entrada, dependencias);
        } catch (erro) { resultado = { ok: false, codigo: 'FALHA_INTEGRACAO_CONCILIACAO', bloqueios: [{ mensagem: String(erro?.message || erro) }] }; }
        finally { conciliacaoFinanceiraEmProcessamento = false; if (botao) botao.disabled = false; }
        if (!resultado?.ok) {
            definirErroConciliacaoFinanceira(resultado?.requerRecuperacao
                ? 'A operação exige recuperação explícita.'
                : (resultado?.bloqueios?.[0]?.mensagem || 'Confira os dados da conciliação.'),
            ['conciliacaoValor', 'conciliacaoData', 'conciliacaoConta', 'conciliacaoIdentificador', 'conciliacaoMotivo']);
            return false;
        }
        const contaReferencia = sessaoConciliacaoFinanceira.contaReferencia;
        fecharConciliacaoFinanceira();
        if (resultado.efeitos?.renderizar) { renderFinanceiroResumo(); abrirDetalhesContaReceber(contaReferencia); }
        if (resultado.efeitos?.sincronizar && typeof sincronizar === 'function') sincronizar('salvar');
        mostrarToast(tipo === 'conciliacao' ? 'Conciliação registrada.' : 'Conciliação desconsiderada.', 'sucesso');
        return true;
    }

    function confirmarConciliacaoFinanceira() { return executarConciliacaoInterface('conciliacao'); }
    function desconsiderarConciliacaoFinanceira() {
        if (typeof validarPermissao === 'function'
            && !validarPermissao('desconsiderar_conciliacao', 'Você não possui permissão para desconsiderar conciliações.')) return false;
        return executarConciliacaoInterface('desconsideracao');
    }

    function registrarEventosDetalhesContaReceber() {
        if (eventosDetalhesContaReceberRegistrados) return;
        const modal = document.getElementById('modalDetalhesContaReceber');
        if (!modal) return;
        eventosDetalhesContaReceberRegistrados = true;
        modal.addEventListener('click', (evento) => { if (evento.target === modal) fecharDetalhesContaReceber(); });
        modal.addEventListener('keydown', (evento) => {
            if (!modal.classList.contains('active')) return;
            if (evento.key === 'Escape') { evento.preventDefault(); fecharDetalhesContaReceber(); return; }
            if (evento.key !== 'Tab') return;
            const focaveis = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
                .filter((elemento) => !elemento.hidden && elemento.getClientRects().length > 0);
            if (!focaveis.length) { evento.preventDefault(); modal.focus(); return; }
            const primeiro=focaveis[0], ultimo=focaveis[focaveis.length-1];
            if (evento.shiftKey && document.activeElement===primeiro) { evento.preventDefault(); ultimo.focus(); }
            else if (!evento.shiftKey && document.activeElement===ultimo) { evento.preventDefault(); primeiro.focus(); }
        });
    }

    function renderFinanceiroResumo() {
        const tabela = document.getElementById('tblFinanceiro');
        if (!tabela) return;
        renderContasReceberDetalhadas();

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const limiteSemana = new Date(hoje.getTime() + (7 * 86400000));
        const buscaRaw = String(document.getElementById('buscaFinanceiro')?.value || '').trim();
        const busca = normalizarTextoBusca(buscaRaw);
        const base = obterBaseLocacoes({ incluirValoresReaisCompatibilidade: false }).map((item) => {
            let statusPagamento = item.statusPagamento;
            const vencimentoData = item.vencimentoData || parseDataIsoLocal(item.vencimento);
            if (statusPagamento !== 'pago' && vencimentoData && vencimentoData < hoje) {
                statusPagamento = 'atrasado';
            }
            return {
                ...item,
                statusPagamento,
                vencimentoData,
                diasParaVencer: vencimentoData ? calcularDiferencaDias(vencimentoData, hoje) : null,
                rotuloVencimento: rotuloPrazoFinanceiro({
                    ...item,
                    statusPagamento,
                    vencimentoData,
                    diasParaVencer: vencimentoData ? calcularDiferencaDias(vencimentoData, hoje) : null
                })
            };
        });

        atualizarKpisFinanceiro(base);
        atualizarFiltroVisual('#financeiroFiltros [data-filtro-fin]', 'data-filtro-fin', filtroFinanceiroAtual);

        const filtrados = base.filter((item) => {
            if (filtroFinanceiroAtual !== 'todos') {
                if (filtroFinanceiroAtual === 'pendente') {
                    if (!['pendente', 'parcial'].includes(item.statusPagamento)) return false;
                } else if (filtroFinanceiroAtual === 'hoje') {
                    if (item.statusPagamento === 'pago' || !item.vencimentoData || item.vencimentoData.getTime() !== hoje.getTime()) return false;
                } else if (filtroFinanceiroAtual === 'semana') {
                    if (item.statusPagamento === 'pago' || !item.vencimentoData || item.vencimentoData < hoje || item.vencimentoData > limiteSemana) return false;
                } else if (item.statusPagamento !== filtroFinanceiroAtual) {
                    return false;
                }
            }

            if (!busca) return true;
            const alvo = normalizarTextoBusca([
                item.clienteNome,
                item.codigoProposta,
                item.id,
                item.vencimento,
                item.rotuloVencimento,
                item.statusPagamento
            ].join(' '));
            return alvo.includes(busca);
        });

        filtrados.sort(compararLancamentosFinanceiros);

        if (typeof atualizarMetaBusca === 'function') {
            atualizarMetaBusca('metaBuscaFinanceiro', {
                total: base.length,
                filtrados: filtrados.length,
                rotulo: 'contratos',
                termo: buscaRaw,
                filtro: filtroFinanceiroAtual,
                filtroLabel: rotuloStatusPagamento(filtroFinanceiroAtual)
            });
        }

        if (!filtrados.length) {
            tabela.innerHTML = typeof criarLinhaTabelaEstado === 'function'
                ? criarLinhaTabelaEstado(8, {
                    tipo: 'empty',
                    titulo: 'Sem dados financeiros no filtro',
                    mensagem: buscaRaw
                        ? `Nenhum registro financeiro combina com "${buscaRaw}".`
                        : 'Sem contratos para este filtro no momento.'
                })
                : '<tr class="table-empty-row"><td colspan="8">Sem dados financeiros.</td></tr>';
            return;
        }

        tabela.innerHTML = filtrados.map((item) => {
            const referenciaLocacao = typeof criarReferenciaTipadaLocacao === 'function'
                ? criarReferenciaTipadaLocacao(item.id)
                : '';
            const referenciaSegura = typeof sanitizarTexto === 'function' ? sanitizarTexto(referenciaLocacao) : referenciaLocacao;
            return `
            <tr data-financeiro-id="${item.id}">
                <td>#${String(item.id || '').slice(-4)}</td>
                <td>
                    <div>${typeof sanitizarTexto === 'function' ? sanitizarTexto(item.clienteNome) : item.clienteNome}</div>
                    ${item.codigoProposta ? `<div class="table-cell-sub">Proposta ${typeof sanitizarTexto === 'function' ? sanitizarTexto(item.codigoProposta) : item.codigoProposta}</div>` : ''}
                </td>
                <td>
                    <div>${formatarDataCurta(item.vencimento)}</div>
                    ${item.rotuloVencimento ? `<div class="table-cell-sub">${item.rotuloVencimento}</div>` : ''}
                </td>
                <td>${formatarCentavosMonetarios(item.valorTotalCentavos) || 'Valor indisponível'}</td>
                <td>${formatarCentavosMonetarios(item.valorRecebidoCentavos) || 'Valor indisponível'}</td>
                <td>${formatarCentavosMonetarios(item.valorRestanteCentavos) || 'Valor indisponível'}</td>
                <td><span class="badge ${classeBadgeStatus(item.statusPagamento)}">${rotuloStatusPagamento(item.statusPagamento)}</span></td>
                <td class="col-actions">
                    <div class="actions-cell">
                        <button class="btn btn-sm btn-info table-action-btn" data-action="irParaLocacaoPorCodigo" data-arg="${referenciaSegura}" title="Abrir na locação"><i class="bi bi-box-arrow-up-right"></i></button>
                        <button class="btn btn-sm btn-primary table-action-btn" data-acesso="admin" data-action="abrirContaReceberLocacao" data-arg="${referenciaSegura}" title="Criar conta a receber"><i class="bi bi-calendar2-plus"></i></button>
                        <button class="btn btn-sm btn-warning table-action-btn" data-acesso="admin" data-action="marcarPagamentoParcial" data-arg="${referenciaSegura}" title="Marcar pagamento parcial"><i class="bi bi-pie-chart"></i></button>
                        <button class="btn btn-sm btn-success table-action-btn" data-acesso="admin" data-action="alternarPagamento" data-arg="${referenciaSegura}" title="Quitar saldo da locação"><i class="bi bi-currency-dollar"></i></button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');
    }

    function calcularKpisAgenda(lista) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const limiteSemana = new Date(hoje.getTime() + (7 * 86400000));

        const atividadesHoje = lista.filter((item) => {
            const montagem = parseDataIsoLocal(item.dataMontagem);
            const desmontagem = parseDataIsoLocal(item.dataDesmontagem);
            return (
                (montagem && montagem.getTime() === hoje.getTime()) ||
                (desmontagem && desmontagem.getTime() === hoje.getTime())
            );
        }).length;

        const atividadesSemana = lista.filter((item) => {
            const montagem = parseDataIsoLocal(item.dataMontagem);
            if (!montagem) return false;
            return montagem >= hoje && montagem <= limiteSemana;
        }).length;

        const atrasadas = lista.filter((item) => item.statusVisual === 'atrasado').length;
        return {
            total: lista.length,
            hoje: atividadesHoje,
            semana: atividadesSemana,
            atrasadas
        };
    }

    function renderAgendaOperacional() {
        const tabela = document.getElementById('tblAgenda');
        if (!tabela) return;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const limiteSemana = new Date(hoje.getTime() + (7 * 86400000));
        const buscaRaw = String(document.getElementById('buscaAgenda')?.value || '').trim();
        const busca = normalizarTextoBusca(buscaRaw);
        const base = obterBaseLocacoes().filter((item) => item.statusVisual !== 'cancelado');

        const kpis = calcularKpisAgenda(base);
        const mapaKpi = [
            ['agendaKpiTotal', kpis.total],
            ['agendaKpiHoje', kpis.hoje],
            ['agendaKpiSemana', kpis.semana],
            ['agendaKpiAtrasadas', kpis.atrasadas]
        ];
        mapaKpi.forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(valor);
        });

        atualizarFiltroVisual('#agendaFiltros [data-filtro-agenda]', 'data-filtro-agenda', filtroAgendaAtual);

        const filtrados = base.filter((item) => {
            const montagem = parseDataIsoLocal(item.dataMontagem);
            const desmontagem = parseDataIsoLocal(item.dataDesmontagem);

            if (filtroAgendaAtual === 'hoje') {
                const ehHoje = (
                    (montagem && montagem.getTime() === hoje.getTime()) ||
                    (desmontagem && desmontagem.getTime() === hoje.getTime())
                );
                if (!ehHoje) return false;
            } else if (filtroAgendaAtual === 'semana') {
                if (!montagem || montagem < hoje || montagem > limiteSemana) return false;
            } else if (filtroAgendaAtual === 'atrasado') {
                if (item.statusVisual !== 'atrasado') return false;
            }

            if (!busca) return true;
            const alvo = normalizarTextoBusca([
                item.clienteNome,
                item.id,
                item.dataMontagem,
                item.dataDesmontagem,
                item.equipe?.responsavel || '',
                item.logistica?.motorista || ''
            ].join(' '));
            return alvo.includes(busca);
        });

        filtrados.sort((a, b) => {
            const dataA = parseDataIsoLocal(a.dataMontagem)?.getTime() || 0;
            const dataB = parseDataIsoLocal(b.dataMontagem)?.getTime() || 0;
            if (dataA === dataB) return Number(b.id || 0) - Number(a.id || 0);
            return dataA - dataB;
        });

        if (typeof atualizarMetaBusca === 'function') {
            const rotulos = {
                todos: 'Todos',
                hoje: 'Hoje',
                semana: 'Próximos 7 dias',
                atrasado: 'Atrasadas'
            };
            atualizarMetaBusca('metaBuscaAgenda', {
                total: base.length,
                filtrados: filtrados.length,
                rotulo: 'atividades',
                termo: buscaRaw,
                filtro: filtroAgendaAtual,
                filtroLabel: rotulos[filtroAgendaAtual] || filtroAgendaAtual
            });
        }

        if (!filtrados.length) {
            tabela.innerHTML = typeof criarLinhaTabelaEstado === 'function'
                ? criarLinhaTabelaEstado(6, {
                    tipo: 'empty',
                    titulo: 'Sem atividades no filtro',
                    mensagem: buscaRaw
                        ? `Nenhuma atividade combina com "${buscaRaw}".`
                        : 'Nenhuma atividade operacional encontrada para este recorte.'
                })
                : '<tr class="table-empty-row"><td colspan="6">Sem atividades para mostrar.</td></tr>';
            return;
        }

        tabela.innerHTML = filtrados.map((item) => `
            <tr data-agenda-id="${item.id}">
                <td>${formatarDataCurta(item.dataMontagem)}</td>
                <td>${typeof sanitizarTexto === 'function' ? sanitizarTexto(item.clienteNome) : item.clienteNome}</td>
                <td>${formatarDataCurta(item.dataMontagem)}</td>
                <td>${formatarDataCurta(item.dataDesmontagem)}</td>
                <td><span class="badge ${classeBadgeStatus(item.statusVisual)}">${rotuloStatusFluxo(item.statusFluxo)}</span></td>
                <td class="col-actions">
                    <div class="actions-cell">
                        <button class="btn btn-sm btn-info table-action-btn" data-action="irParaLocacaoPorId" data-arg="${item.id}" title="Abrir na locação"><i class="bi bi-box-arrow-up-right"></i></button>
                        <button class="btn btn-sm btn-primary table-action-btn" data-action="abrirHistoricoLocacao" data-arg="${item.id}" title="Ver histórico"><i class="bi bi-clock-history"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function irParaLocacaoPorId(id) {
        const locacaoId = String(id || '').trim();
        if (!locacaoId) return;

        if (typeof abrirTab === 'function') {
            abrirTab('locacoes', { semRolagem: true });
        }

        setTimeout(() => {
            if (typeof mudarFiltro === 'function') mudarFiltro('todos');

            const campoBusca = document.getElementById('buscaLocacoes');
            if (campoBusca) {
                campoBusca.value = locacaoId;
                if (typeof atualizarPersistenciaBuscaRapida === 'function') {
                    atualizarPersistenciaBuscaRapida('buscaLocacoes', locacaoId);
                }
            }

            if (typeof renderLocacoes === 'function') renderLocacoes();

            setTimeout(() => {
                const linha = document.querySelector(`#tblLocacoes tr[data-locacao-id="${locacaoId}"]`);
                if (!linha) return;
                if (typeof rolarParaElementoAtalho === 'function') {
                    rolarParaElementoAtalho(linha, 'center');
                } else {
                    linha.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                if (typeof destacarAlvoAtalho === 'function') destacarAlvoAtalho(linha, 1400);
            }, 120);
        }, 120);
    }

    filtroOrcamentosAtual = lerFiltroPersistido(CHAVE_FILTRO_ORCAMENTOS, 'todos', FILTROS_ORCAMENTOS);
    filtroFinanceiroAtual = lerFiltroPersistido(CHAVE_FILTRO_FINANCEIRO, 'todos', FILTROS_FINANCEIRO);
    filtroAgendaAtual = lerFiltroPersistido(CHAVE_FILTRO_AGENDA, 'todos', FILTROS_AGENDA);

    window.renderOrcamentos = renderOrcamentos;
    window.renderFinanceiroResumo = renderFinanceiroResumo;
    window.renderContasReceberDetalhadas = renderContasReceberDetalhadas;
    window.abrirDetalhesContaReceber = abrirDetalhesContaReceber;
    window.fecharDetalhesContaReceber = fecharDetalhesContaReceber;
    window.registrarRecebimentoParcelaConta = registrarRecebimentoParcelaConta;
    window.confirmarRecebimentoParcelaConta = confirmarRecebimentoParcelaConta;
    window.cancelarRecebimentoParcelaConta = cancelarRecebimentoParcelaConta;
    window.abrirEstornoRecebimentoConta = abrirEstornoRecebimentoConta;
    window.fecharEstornoRecebimentoConta = fecharEstornoRecebimentoConta;
    window.confirmarEstornoRecebimentoConta = confirmarEstornoRecebimentoConta;
    window.abrirConciliacaoFinanceira = abrirConciliacaoFinanceira;
    window.verConciliacaoFinanceira = verConciliacaoFinanceira;
    window.fecharConciliacaoFinanceira = fecharConciliacaoFinanceira;
    window.confirmarConciliacaoFinanceira = confirmarConciliacaoFinanceira;
    window.desconsiderarConciliacaoFinanceira = desconsiderarConciliacaoFinanceira;
    window.renderAgendaOperacional = renderAgendaOperacional;
    window.aplicarFiltroOrcamentosRapido = aplicarFiltroOrcamentosRapido;
    window.aplicarFiltroFinanceiroRapido = aplicarFiltroFinanceiroRapido;
    window.aplicarFiltroAgendaRapido = aplicarFiltroAgendaRapido;
    window.irParaLocacaoPorId = irParaLocacaoPorId;
})();
