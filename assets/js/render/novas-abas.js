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
        const filtradas = contas.filter((item) => {
            const ativa = ['pendente', 'parcial', 'vencida'].includes(item.situacao);
            if (filtro !== 'todos' && (filtro === 'ativa' ? !ativa : item.situacao !== filtro)) return false;
            if (clienteFiltro?.value && item.clienteReferencia !== clienteFiltro.value) return false;
            const dataEmissao = item.conta?.dataEmissao || item.locacao?.dataAluguel || '';
            if (inicio && dataEmissao < inicio) return false;
            if (fim && dataEmissao > fim) return false;
            return !busca || normalizarTextoBusca([item.conta?.id, item.clienteNome,
                item.locacao?.eventoNome, item.locacao?.id, item.conta?.descricao].join(' ')).includes(busca);
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
        const historico = [...(conta.historico || []), ...(conta.parcelas || []).flatMap((p) => p.lancamentosFinanceiros || [])];
        document.getElementById('detalhesContaHistorico').innerHTML = historico.map((h) => `<p><strong>${sanitizarTexto(h.acao || 'recebimento')}</strong> · ${sanitizarTexto(h.data || '')} · ${sanitizarTexto(h.usuario || h.responsavel || '')}</p>`).join('') || '<p>Sem movimentações.</p>';
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
    window.renderAgendaOperacional = renderAgendaOperacional;
    window.aplicarFiltroOrcamentosRapido = aplicarFiltroOrcamentosRapido;
    window.aplicarFiltroFinanceiroRapido = aplicarFiltroFinanceiroRapido;
    window.aplicarFiltroAgendaRapido = aplicarFiltroAgendaRapido;
    window.irParaLocacaoPorId = irParaLocacaoPorId;
})();
