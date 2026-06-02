function formatarMoedaDashboard(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function formatarDataHoraDashboard(data) {
    return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function obterDataLocal(dataIso) {
    if (!dataIso) return null;
    const data = new Date(`${dataIso}T00:00:00`);
    if (Number.isNaN(data.getTime())) return null;
    data.setHours(0, 0, 0, 0);
    return data;
}

function calcularValorLocacao(locacao) {
    if (typeof calcularValorLocacaoDominio === 'function') {
        return calcularValorLocacaoDominio(locacao);
    }
    const subtotal = (locacao.items || []).reduce((total, item) => {
        return total + ((parseFloat(item.valor) || 0) * (parseInt(item.quantidade, 10) || 0));
    }, 0);

    let divisor = parseFloat(locacao.divisorFatura || 1);
    if (!Number.isFinite(divisor) || divisor <= 0) divisor = 1;
    return subtotal / divisor;
}

function obterFinanceiroDashboard(locacao, valorFallback) {
    const financeiro = locacao?.financeiro && typeof locacao.financeiro === 'object'
        ? locacao.financeiro
        : {};
    const valorTotal = Math.max(0, Number(financeiro.valorTotal ?? valorFallback ?? 0) || 0);
    const sinal = Math.max(0, Number(financeiro.sinal ?? locacao?.sinal ?? 0) || 0);
    const statusPagamento = String(financeiro.statusPagamento || (locacao?.pago ? 'pago' : 'pendente')).trim().toLowerCase();
    const valorRestante = statusPagamento === 'pago'
        ? 0
        : Math.max(0, Number(financeiro.valorRestante ?? Math.max(valorTotal - sinal, 0)) || 0);
    const valorRecebido = statusPagamento === 'pago'
        ? valorTotal
        : statusPagamento === 'parcial'
            ? Math.max(0, valorTotal - valorRestante)
            : 0;
    const vencimento = String(financeiro.vencimento || locacao?.dataDevolucaoPrevisao || '').trim();

    return {
        valorTotal,
        valorRecebido,
        valorRestante,
        statusPagamento,
        vencimento,
        vencimentoData: obterDataLocal(vencimento)
    };
}

function escaparTextoDashboard(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

function criarEstadoDashboard(opcoes = {}) {
    if (typeof criarEstadoPainel === 'function') {
        return criarEstadoPainel(opcoes.mensagem, {
            tipo: opcoes.tipo || 'info',
            titulo: opcoes.titulo || 'Informação',
            compacto: true
        });
    }
    return `<small class="muted-note">${escaparTextoDashboard(opcoes.mensagem || 'Sem dados para mostrar.')}</small>`;
}

function resumoClientesAlerta(lista, limite) {
    const nomes = [...new Set(lista.map((item) => item.cliente))].filter(Boolean);
    if (nomes.length === 0) return 'Sem clientes listados.';
    const base = nomes.slice(0, limite);
    const restante = nomes.length - base.length;
    return `${base.map((nome) => escaparTextoDashboard(nome)).join(', ')}${restante > 0 ? ` +${restante}` : ''}`;
}

function abreviarMoedaDashboard(valor) {
    const numero = Number(valor) || 0;
    const abs = Math.abs(numero);
    if (abs >= 1000000) return `R$ ${(numero / 1000000).toFixed(1).replace('.', ',')}M`;
    if (abs >= 1000) return `R$ ${(numero / 1000).toFixed(1).replace('.', ',')}K`;
    return formatarMoedaDashboard(numero);
}

function gerarSerieReceitaMensal(locacoesComValor, totalMeses = 6) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (totalMeses - 1), 1);

    const serie = [];
    const indicePorChave = new Map();

    for (let i = 0; i < totalMeses; i += 1) {
        const dataMes = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
        const chave = `${dataMes.getFullYear()}-${String(dataMes.getMonth() + 1).padStart(2, '0')}`;
        const mesTxt = dataMes.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
        const anoTxt = String(dataMes.getFullYear()).slice(-2);
        indicePorChave.set(chave, i);
        serie.push({
            chave,
            rotulo: `${mesTxt}/${anoTxt}`,
            valor: 0
        });
    }

    locacoesComValor.forEach((locacao) => {
        const dataAluguel = obterDataLocal(locacao.dataAluguel);
        if (!dataAluguel) return;
        const chave = `${dataAluguel.getFullYear()}-${String(dataAluguel.getMonth() + 1).padStart(2, '0')}`;
        const idx = indicePorChave.get(chave);
        if (typeof idx === 'number') {
            serie[idx].valor += Number(locacao.valorFinal) || 0;
        }
    });

    return serie;
}

function renderGraficoReceitaMensal(serie) {
    const box = document.getElementById('dashChartReceita');
    if (!box) return;

    if (!Array.isArray(serie) || serie.length === 0) {
        box.innerHTML = criarEstadoDashboard({
            tipo: 'empty',
            titulo: 'Sem dados de receita',
            mensagem: 'Cadastre locações para visualizar a evolução mensal.'
        });
        return;
    }

    const maximo = Math.max(...serie.map((item) => Number(item.valor) || 0), 0);
    const base = maximo > 0 ? maximo : 1;

    box.innerHTML = `
        <div class="dash-receita-chart">
            ${serie.map((item) => {
                const percentual = Math.max(4, Math.round(((Number(item.valor) || 0) / base) * 100));
                const dica = `Abrir locações do período ${item.rotulo}`;
                return `
                    <div class="dash-receita-col" data-action="irParaLocacoesComBusca" data-arg="${item.chave}" data-arg2="todos" title="${escaparTextoDashboard(dica)}">
                        <div class="dash-receita-bar-wrap">
                            <span class="dash-receita-bar" style="height:${percentual}%;" title="${escaparTextoDashboard(item.rotulo)}: ${escaparTextoDashboard(formatarMoedaDashboard(item.valor))}"></span>
                        </div>
                        <small>${item.rotulo}</small>
                        <strong>${abreviarMoedaDashboard(item.valor)}</strong>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderGraficoStatusLocacoes({ abertas, atrasadas, devolvidas }) {
    const box = document.getElementById('dashChartStatus');
    if (!box) return;

    const dados = [
        {
            nome: 'Em aberto',
            classe: 'dash-status-open',
            valor: Math.max(Number(abertas) || 0, 0),
            acao: 'irParaLocacoes',
            arg: 'ativo',
            dica: 'Abrir locações em aberto'
        },
        {
            nome: 'Atrasadas',
            classe: 'dash-status-delay',
            valor: Math.max(Number(atrasadas) || 0, 0),
            acao: 'irParaLocacoes',
            arg: 'atrasado',
            dica: 'Abrir locações atrasadas'
        },
        {
            nome: 'Devolvidas',
            classe: 'dash-status-done',
            valor: Math.max(Number(devolvidas) || 0, 0),
            acao: 'irParaLocacoes',
            arg: 'devolvido',
            dica: 'Abrir histórico de devolvidas'
        }
    ];
    const total = dados.reduce((acc, item) => acc + item.valor, 0);

    if (total === 0) {
        box.innerHTML = criarEstadoDashboard({
            tipo: 'empty',
            titulo: 'Sem status para comparar',
            mensagem: 'Assim que houver locações, este painel será preenchido.'
        });
        return;
    }

    box.innerHTML = `
        <div class="dash-status-list">
            ${dados.map((item) => {
                const percentual = Math.round((item.valor / total) * 100);
                return `
                    <div class="dash-status-item" data-action="${item.acao}" data-arg="${item.arg}" title="${item.dica}">
                        <div class="dash-status-head">
                            <span><i class="bi bi-circle-fill ${item.classe}"></i> ${item.nome}</span>
                            <strong>${item.valor}</strong>
                        </div>
                        <div class="dash-status-track">
                            <span class="${item.classe}" style="width:${percentual}%;"></span>
                        </div>
                        <small>${percentual}% do total</small>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderAcoesDiaDashboard({ atrasadas, vencemHoje, pendentesFinanceiros, iniciamHoje, financeiroVencido = 0, financeiroHoje = 0 }) {
    const box = document.getElementById('dashAcoesDia');
    const resumo = document.getElementById('dashResumoAcoesDia');
    if (!box) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeIso = new Date(hoje).toISOString().slice(0, 10);

    const acoes = [];
    if (atrasadas > 0) {
        acoes.push(`
            <div class="dash-action-item prioridade-alta" data-action="irParaLocacoes" data-arg="atrasado" title="Abrir locações atrasadas">
                <div>
                    <strong>${atrasadas} devolução(ões) atrasada(s)</strong>
                    <small>Priorize contato e retorno desses contratos.</small>
                </div>
                <button class="btn btn-sm btn-danger" data-action="irParaLocacoes" data-arg="atrasado">Ver atrasos</button>
            </div>
        `);
    }
    if (vencemHoje > 0) {
        acoes.push(`
            <div class="dash-action-item prioridade-media" data-action="irParaLocacoesComBusca" data-arg="${hojeIso}" data-arg2="todos" title="Abrir locações com previsão de hoje">
                <div>
                    <strong>${vencemHoje} devolução(ões) vencem hoje</strong>
                    <small>Organize equipe e logística para conferência.</small>
                </div>
                <button class="btn btn-sm btn-warning" data-action="irParaDevolucoesFormulario">Conferir</button>
            </div>
        `);
    }
    if (financeiroVencido > 0) {
        acoes.push(`
            <div class="dash-action-item prioridade-alta" data-action="irParaFinanceiroFiltro" data-arg="atrasado" title="Abrir cobranças atrasadas">
                <div>
                    <strong>${financeiroVencido} cobrança(s) atrasada(s)</strong>
                    <small>Priorize recebimento e atualização do status financeiro.</small>
                </div>
                <button class="btn btn-sm btn-danger" data-action="irParaFinanceiroFiltro" data-arg="atrasado">Cobrar</button>
            </div>
        `);
    } else if (financeiroHoje > 0) {
        acoes.push(`
            <div class="dash-action-item prioridade-media" data-action="irParaFinanceiroFiltro" data-arg="hoje" title="Abrir cobranças que vencem hoje">
                <div>
                    <strong>${financeiroHoje} cobrança(s) vencem hoje</strong>
                    <small>Confira pagamentos previstos para o dia.</small>
                </div>
                <button class="btn btn-sm btn-warning" data-action="irParaFinanceiroFiltro" data-arg="hoje">Ver hoje</button>
            </div>
        `);
    }
    if (pendentesFinanceiros > 0) {
        acoes.push(`
            <div class="dash-action-item prioridade-media" data-action="irParaFinanceiroFiltro" data-arg="pendente" title="Abrir cobranças pendentes">
                <div>
                    <strong>${pendentesFinanceiros} locação(ões) pendentes de pagamento</strong>
                    <small>Validar cobranças para reduzir saldo em aberto.</small>
                </div>
                <button class="btn btn-sm btn-info" data-action="irParaFinanceiroFiltro" data-arg="pendente">Cobranças</button>
            </div>
        `);
    }
    if (iniciamHoje > 0) {
        acoes.push(`
            <div class="dash-action-item prioridade-baixa" data-action="irParaChecklistOperacional" title="Abrir checklist operacional">
                <div>
                    <strong>${iniciamHoje} locação(ões) iniciam hoje</strong>
                    <small>Revisar checklist de saída e disponibilidade.</small>
                </div>
                <button class="btn btn-sm btn-secondary" data-action="irParaChecklistOperacional">Checklist</button>
            </div>
        `);
    }

    if (resumo) {
        resumo.innerText = acoes.length > 0
            ? `${acoes.length} frente(s) para acompanhar hoje`
            : 'Sem ações pendentes';
    }

    if (acoes.length === 0) {
        box.innerHTML = criarEstadoDashboard({
            tipo: 'success',
            titulo: 'Rotina em dia',
            mensagem: 'Nenhuma ação urgente no momento.'
        });
        return;
    }

    box.innerHTML = `<div class="dash-actions-list">${acoes.join('')}</div>`;
}

function renderStats() {
    const elClientes = document.getElementById('dashClientes');
    if (elClientes) elClientes.innerText = locadores.length;
    const elAtualizadoEm = document.getElementById('dashAtualizadoEm');
    if (elAtualizadoEm) elAtualizadoEm.innerText = formatarDataHoraDashboard(new Date());
    const elTagClientes = document.getElementById('dashTagClientes');
    if (elTagClientes) {
        elTagClientes.innerText = locadores.length === 1
            ? '1 cadastro ativo'
            : `${locadores.length} cadastros ativos`;
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioProximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

    const locacoesComValor = locacoes.map((locacao) => {
        const locacaoNormalizada = typeof normalizarLocacaoDominio === 'function'
            ? normalizarLocacaoDominio(locacao, { hoje })
            : locacao;
        const cliente = locadores.find((c) => c.id === locacao.locadorId)?.nome || 'Cliente removido';
        const previsao = obterDataLocal(locacao.dataDevolucaoPrevisao);
        const diffDias = previsao ? Math.round((previsao - hoje) / 86400000) : null;
        const statusVisual = String(locacaoNormalizada?.statusVisual || locacao.status || '').toLowerCase();
        const valorFinal = calcularValorLocacao(locacaoNormalizada);
        const financeiroResumo = obterFinanceiroDashboard(locacaoNormalizada, valorFinal);
        const diffFinanceiro = financeiroResumo.vencimentoData
            ? Math.round((financeiroResumo.vencimentoData - hoje) / 86400000)
            : null;
        const pago = typeof locacaoNormalizada?.pago === 'boolean'
            ? locacaoNormalizada.pago
            : Boolean(locacao.pago);
        return {
            ...locacaoNormalizada,
            cliente,
            valorFinal,
            valorFinanceiroTotal: financeiroResumo.valorTotal,
            valorFinanceiroRecebido: financeiroResumo.valorRecebido,
            valorFinanceiroRestante: financeiroResumo.valorRestante,
            statusPagamento: financeiroResumo.statusPagamento,
            vencimentoFinanceiro: financeiroResumo.vencimentoData,
            diffFinanceiro,
            previsao,
            diffDias,
            statusVisual,
            pago
        };
    });

    const ativas = locacoesComValor.filter((locacao) => locacao.statusVisual === 'ativo' || locacao.statusVisual === 'atrasado');
    const elLocacoes = document.getElementById('dashLocacoes');
    if (elLocacoes) elLocacoes.innerText = ativas.length;
    const elTagLocacoes = document.getElementById('dashTagLocacoes');
    if (elTagLocacoes) {
        elTagLocacoes.innerText = ativas.length === 0
            ? 'Sem operações abertas'
            : `${ativas.length} em andamento`;
    }

    const totalRecebidoAtivo = ativas
        .reduce((total, locacao) => total + locacao.valorFinanceiroRecebido, 0);
    const totalPendenteAtivo = ativas
        .reduce((total, locacao) => total + locacao.valorFinanceiroRestante, 0);

    const elFaturamento = document.getElementById('dashFaturamento');
    if (elFaturamento) {
        elFaturamento.innerHTML = `
            <span class="dash-receita-main">${formatarMoedaDashboard(totalRecebidoAtivo)}</span>
            <span class="dash-receita-sub">+ ${formatarMoedaDashboard(totalPendenteAtivo)} pendente</span>
        `;
    }
    const elTagReceita = document.getElementById('dashTagReceita');
    if (elTagReceita) {
        elTagReceita.innerText = totalPendenteAtivo > 0
            ? `A receber ${formatarMoedaDashboard(totalPendenteAtivo)}`
            : 'Sem pendências';
    }

    const locacoesDoMes = locacoesComValor.filter((locacao) => {
        const dataAluguel = obterDataLocal(locacao.dataAluguel);
        return dataAluguel && dataAluguel >= inicioMes && dataAluguel < inicioProximoMes;
    });

    const receitaMes = locacoesDoMes.reduce((total, locacao) => total + locacao.valorFinanceiroTotal, 0);
    const recebidoMes = locacoesDoMes
        .reduce((total, locacao) => total + locacao.valorFinanceiroRecebido, 0);
    const pendenteAtivo = totalPendenteAtivo;
    const ticketMedio = locacoesDoMes.length > 0 ? receitaMes / locacoesDoMes.length : 0;

    const elFinMes = document.getElementById('dashFinMes');
    const elFinRecebido = document.getElementById('dashFinRecebido');
    const elFinPendente = document.getElementById('dashFinPendente');
    const elFinTicket = document.getElementById('dashFinTicket');

    if (elFinMes) elFinMes.innerText = formatarMoedaDashboard(receitaMes);
    if (elFinRecebido) elFinRecebido.innerText = formatarMoedaDashboard(recebidoMes);
    if (elFinPendente) elFinPendente.innerText = formatarMoedaDashboard(pendenteAtivo);
    if (elFinTicket) elFinTicket.innerText = formatarMoedaDashboard(ticketMedio);

    const atrasadas = ativas.filter((locacao) => locacao.previsao && locacao.diffDias < 0);
    const vencemHoje = ativas.filter((locacao) => locacao.previsao && locacao.diffDias === 0);
    const vencemAmanha = ativas.filter((locacao) => locacao.previsao && locacao.diffDias === 1);
    const proximas72h = ativas.filter((locacao) => locacao.previsao && locacao.diffDias >= 2 && locacao.diffDias <= 3);
    const financeiroVencido = ativas.filter((locacao) => locacao.valorFinanceiroRestante > 0 && locacao.vencimentoFinanceiro && locacao.diffFinanceiro < 0);
    const financeiroHoje = ativas.filter((locacao) => locacao.valorFinanceiroRestante > 0 && locacao.vencimentoFinanceiro && locacao.diffFinanceiro === 0);
    const totalAlertas = atrasadas.length + vencemHoje.length + vencemAmanha.length + proximas72h.length + financeiroVencido.length + financeiroHoje.length;
    const devolvidas = locacoesComValor.filter((locacao) => locacao.statusVisual === 'devolvido').length;
    const abertasSemAtraso = Math.max(ativas.length - atrasadas.length, 0);
    const iniciamHoje = locacoesComValor.filter((locacao) => {
        const dataAluguel = obterDataLocal(locacao.dataAluguel);
        return (locacao.statusVisual === 'ativo' || locacao.statusVisual === 'atrasado') && dataAluguel && dataAluguel.getTime() === hoje.getTime();
    }).length;
    const pendentesFinanceiros = ativas.filter((locacao) => locacao.valorFinanceiroRestante > 0).length;
    const hojeIso = new Date(hoje).toISOString().slice(0, 10);
    const amanhaBase = new Date(hoje);
    amanhaBase.setDate(amanhaBase.getDate() + 1);
    const amanhaIso = amanhaBase.toISOString().slice(0, 10);

    const elAtrasos = document.getElementById('dashAtrasos');
    if (elAtrasos) {
        elAtrasos.innerText = atrasadas.length;
        elAtrasos.style.color = atrasadas.length > 0 ? '#ef4444' : 'var(--text)';
    }
    const elTagAtrasos = document.getElementById('dashTagAtrasos');
    if (elTagAtrasos) {
        if (atrasadas.length === 0) {
            elTagAtrasos.innerText = 'Operação estável';
        } else if (atrasadas.length <= 2) {
            elTagAtrasos.innerText = 'Atenção moderada';
        } else {
            elTagAtrasos.innerText = 'Prioridade alta';
        }
    }

    const elResumoAlertas = document.getElementById('dashResumoAlertas');
    if (elResumoAlertas) {
        if (totalAlertas === 0) {
            elResumoAlertas.innerText = 'Sem alertas no momento';
        } else if (atrasadas.length > 0) {
            elResumoAlertas.innerText = `${totalAlertas} alerta(s), com prioridade alta`;
        } else {
            elResumoAlertas.innerText = `${totalAlertas} alerta(s) de acompanhamento`;
        }
    }

    const listaAlertas = document.getElementById('listEstoqueBaixo');
    if (listaAlertas) {
        const cards = [];

        if (atrasadas.length > 0) {
            cards.push(`
                <div class="alert-item critical" data-action="irParaLocacoes" data-arg="atrasado" title="Abrir locações atrasadas">
                    <i class="bi bi-exclamation-octagon"></i>
                    <div class="alert-item-body">
                        <strong>${atrasadas.length} devolucao(oes) atrasada(s)</strong>
                        <small>${resumoClientesAlerta(atrasadas, 2)}</small>
                    </div>
                </div>
            `);
        }
        if (vencemHoje.length > 0) {
            cards.push(`
                <div class="alert-item warning" data-action="irParaLocacoesComBusca" data-arg="${hojeIso}" data-arg2="todos" title="Abrir locações com previsão de hoje">
                    <i class="bi bi-calendar2-day"></i>
                    <div class="alert-item-body">
                        <strong>${vencemHoje.length} devolucao(oes) vence(m) hoje</strong>
                        <small>${resumoClientesAlerta(vencemHoje, 2)}</small>
                    </div>
                </div>
            `);
        }
        if (vencemAmanha.length > 0) {
            cards.push(`
                <div class="alert-item info" data-action="irParaLocacoesComBusca" data-arg="${amanhaIso}" data-arg2="todos" title="Abrir locações com previsão de amanhã">
                    <i class="bi bi-calendar2-week"></i>
                    <div class="alert-item-body">
                        <strong>${vencemAmanha.length} devolucao(oes) para amanha</strong>
                        <small>${resumoClientesAlerta(vencemAmanha, 2)}</small>
                    </div>
                </div>
            `);
        }
        if (financeiroVencido.length > 0) {
            cards.push(`
                <div class="alert-item critical" data-action="irParaFinanceiroFiltro" data-arg="atrasado" title="Abrir cobranças atrasadas">
                    <i class="bi bi-cash-coin"></i>
                    <div class="alert-item-body">
                        <strong>${financeiroVencido.length} cobrança(s) atrasada(s)</strong>
                        <small>${resumoClientesAlerta(financeiroVencido, 2)}</small>
                    </div>
                </div>
            `);
        }
        if (financeiroHoje.length > 0) {
            cards.push(`
                <div class="alert-item warning" data-action="irParaFinanceiroFiltro" data-arg="hoje" title="Abrir cobranças que vencem hoje">
                    <i class="bi bi-wallet2"></i>
                    <div class="alert-item-body">
                        <strong>${financeiroHoje.length} cobrança(s) vence(m) hoje</strong>
                        <small>${resumoClientesAlerta(financeiroHoje, 2)}</small>
                    </div>
                </div>
            `);
        }
        if (proximas72h.length > 0) {
            cards.push(`
                <div class="alert-item neutral" data-action="irParaLocacoes" data-arg="todos" title="Abrir lista completa de locações">
                    <i class="bi bi-clock-history"></i>
                    <div class="alert-item-body">
                        <strong>${proximas72h.length} devolucao(oes) nos proximos 3 dias</strong>
                        <small>${resumoClientesAlerta(proximas72h, 2)}</small>
                    </div>
                </div>
            `);
        }

        if (cards.length === 0) {
            listaAlertas.innerHTML = criarEstadoDashboard({
                tipo: 'success',
                titulo: 'Operação estável',
                mensagem: 'Sistema operando normalmente.'
            });
        } else {
            listaAlertas.innerHTML = `<div class="alert-list">${cards.join('')}</div>`;
        }
    }

    const proximas = ativas
        .filter((locacao) => locacao.previsao && locacao.diffDias >= 0)
        .sort((a, b) => a.previsao - b.previsao);

    const statusPrazo = (diffDias) => {
        if (diffDias === 0) return { classe: 'badge-warning', texto: 'HOJE' };
        if (diffDias === 1) return { classe: 'badge-info', texto: 'AMANHA' };
        if (diffDias > 1 && diffDias <= 3) return { classe: 'badge-success', texto: `${diffDias} DIAS` };
        return { classe: 'badge-info', texto: 'AGENDADO' };
    };

    const tabelaDevolucoes = document.getElementById('tblDashDevolucoes');
    if (tabelaDevolucoes) {
        if (!proximas.length) {
            tabelaDevolucoes.innerHTML = typeof criarLinhaTabelaEstado === 'function'
                ? criarLinhaTabelaEstado(3, {
                    tipo: 'info',
                    titulo: 'Agenda livre',
                    mensagem: 'Nenhuma devolução prevista para os próximos dias.'
                })
                : '<tr class="table-empty-row"><td colspan="3">Nada previsto.</td></tr>';
        } else {
            tabelaDevolucoes.innerHTML = proximas.slice(0, 5).map((locacao) => {
                const status = statusPrazo(locacao.diffDias);
                const sufixo = String(locacao.id || '').slice(-4) || '----';
                return `
                    <tr class="dash-row-action" data-action="irParaLocacaoPorCodigo" data-arg="${locacao.id}" title="Abrir locação #${sufixo}">
                        <td>${locacao.previsao.toLocaleDateString('pt-BR')}</td>
                        <td>${escaparTextoDashboard(locacao.cliente)}</td>
                        <td class="table-head-center"><span class="badge ${status.classe}">${status.texto}</span></td>
                    </tr>
                `;
            }).join('');
        }
    }

    const serieReceitaMensal = gerarSerieReceitaMensal(locacoesComValor, 6);
    renderGraficoReceitaMensal(serieReceitaMensal);
    renderGraficoStatusLocacoes({
        abertas: abertasSemAtraso,
        atrasadas: atrasadas.length,
        devolvidas
    });
    renderAcoesDiaDashboard({
        atrasadas: atrasadas.length,
        vencemHoje: vencemHoje.length,
        pendentesFinanceiros,
        iniciamHoje,
        financeiroVencido: financeiroVencido.length,
        financeiroHoje: financeiroHoje.length
    });
}
