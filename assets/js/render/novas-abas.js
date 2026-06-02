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

    function normalizarTextoBusca(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function formatarMoeda(valor) {
        return (Number(valor) || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
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
        return (Array.isArray(locadores) ? locadores : []).find((item) => String(item.id) === String(locadorId))?.nome || 'Removido';
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
            cancelado: 'Cancelado'
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

    function obterBaseLocacoes() {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        return (Array.isArray(locacoes) ? locacoes : []).map((locacao) => {
            const normalizada = typeof normalizarLocacaoDominio === 'function'
                ? normalizarLocacaoDominio(locacao, { hoje })
                : { ...locacao };

            const statusFluxo = inferirStatusFluxo(normalizada);
            const statusVisual = String(normalizada?.statusVisual || normalizada?.status || '').trim().toLowerCase() || 'ativo';
            const statusPagamento = inferirStatusPagamento(normalizada);
            const valorTotal = Number(normalizada?.financeiro?.valorTotal ?? normalizada?.valorTotalCalculado ?? 0) || 0;
            const valorRestante = statusPagamento === 'pago'
                ? 0
                : Math.max(0, Number(normalizada?.financeiro?.valorRestante ?? valorTotal) || 0);
            const valorRecebido = statusPagamento === 'pago'
                ? valorTotal
                : statusPagamento === 'parcial'
                    ? Math.max(0, valorTotal - valorRestante)
                    : 0;
            const vencimento = String(normalizada?.financeiro?.vencimento || normalizada?.dataDevolucaoPrevisao || '').trim();
            const vencimentoData = parseDataIsoLocal(vencimento);
            const diasParaVencer = vencimentoData ? calcularDiferencaDias(vencimentoData, hoje) : null;
            const dataMontagem = String(normalizada?.datasMontagem?.inicio || normalizada?.dataAluguel || '').trim();
            const dataDesmontagem = String(normalizada?.datasDesmontagem?.inicio || normalizada?.dataDevolucaoPrevisao || '').trim();

            return {
                ...normalizada,
                statusFluxo,
                statusVisual,
                statusPagamento,
                valorTotal,
                valorRecebido,
                valorRestante,
                vencimento,
                vencimentoData,
                diasParaVencer,
                dataMontagem,
                dataDesmontagem,
                clienteNome: obterNomeCliente(normalizada.locadorId)
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
                <td>${formatarMoeda(item.valorTotal)}</td>
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
        const aberto = lista.reduce((acc, item) => item.statusPagamento === 'pago' ? acc : acc + item.valorRestante, 0);
        const pago = lista.reduce((acc, item) => acc + item.valorRecebido, 0);
        const atrasado = lista.reduce((acc, item) => item.statusPagamento === 'atrasado' ? acc + item.valorRestante : acc, 0);

        const mapa = [
            ['finKpiTotal', String(total)],
            ['finKpiAberto', formatarMoeda(aberto)],
            ['finKpiPago', formatarMoeda(pago)],
            ['finKpiAtrasado', formatarMoeda(atrasado)]
        ];
        mapa.forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = valor;
        });
    }

    function renderFinanceiroResumo() {
        const tabela = document.getElementById('tblFinanceiro');
        if (!tabela) return;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const limiteSemana = new Date(hoje.getTime() + (7 * 86400000));
        const buscaRaw = String(document.getElementById('buscaFinanceiro')?.value || '').trim();
        const busca = normalizarTextoBusca(buscaRaw);
        const base = obterBaseLocacoes().map((item) => {
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
                item.id,
                item.vencimento,
                item.rotuloVencimento,
                item.statusPagamento
            ].join(' '));
            return alvo.includes(busca);
        });

        filtrados.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

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

        tabela.innerHTML = filtrados.map((item) => `
            <tr data-financeiro-id="${item.id}">
                <td>#${String(item.id || '').slice(-4)}</td>
                <td>${typeof sanitizarTexto === 'function' ? sanitizarTexto(item.clienteNome) : item.clienteNome}</td>
                <td>
                    <div>${formatarDataCurta(item.vencimento)}</div>
                    ${item.rotuloVencimento ? `<div class="table-cell-sub">${item.rotuloVencimento}</div>` : ''}
                </td>
                <td>${formatarMoeda(item.valorTotal)}</td>
                <td>${formatarMoeda(item.valorRecebido)}</td>
                <td>${formatarMoeda(item.valorRestante)}</td>
                <td><span class="badge ${classeBadgeStatus(item.statusPagamento)}">${rotuloStatusPagamento(item.statusPagamento)}</span></td>
                <td class="col-actions">
                    <div class="actions-cell">
                        <button class="btn btn-sm btn-info table-action-btn" data-action="irParaLocacaoPorId" data-arg="${item.id}" title="Abrir na locação"><i class="bi bi-box-arrow-up-right"></i></button>
                        <button class="btn btn-sm btn-warning table-action-btn" data-acesso="admin" data-action="marcarPagamentoParcial" data-arg="${item.id}" title="Marcar pagamento parcial"><i class="bi bi-pie-chart"></i></button>
                        <button class="btn btn-sm btn-success table-action-btn" data-acesso="admin" data-action="alternarPagamento" data-arg="${item.id}" title="Alternar pagamento"><i class="bi bi-currency-dollar"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
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
    window.renderAgendaOperacional = renderAgendaOperacional;
    window.aplicarFiltroOrcamentosRapido = aplicarFiltroOrcamentosRapido;
    window.aplicarFiltroFinanceiroRapido = aplicarFiltroFinanceiroRapido;
    window.aplicarFiltroAgendaRapido = aplicarFiltroAgendaRapido;
    window.irParaLocacaoPorId = irParaLocacaoPorId;
})();
