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
    const subtotal = (locacao.items || []).reduce((total, item) => {
        return total + ((parseFloat(item.valor) || 0) * (parseInt(item.quantidade, 10) || 0));
    }, 0);

    let divisor = parseFloat(locacao.divisorFatura || 1);
    if (!Number.isFinite(divisor) || divisor <= 0) divisor = 1;
    return subtotal / divisor;
}

function escaparTextoDashboard(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

function resumoClientesAlerta(lista, limite) {
    const nomes = [...new Set(lista.map((item) => item.cliente))].filter(Boolean);
    if (nomes.length === 0) return 'Sem clientes listados.';
    const base = nomes.slice(0, limite);
    const restante = nomes.length - base.length;
    return `${base.map((nome) => escaparTextoDashboard(nome)).join(', ')}${restante > 0 ? ` +${restante}` : ''}`;
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
        const cliente = locadores.find((c) => c.id === locacao.locadorId)?.nome || 'Cliente removido';
        const previsao = obterDataLocal(locacao.dataDevolucaoPrevisao);
        const diffDias = previsao ? Math.round((previsao - hoje) / 86400000) : null;
        return {
            ...locacao,
            cliente,
            valorFinal: calcularValorLocacao(locacao),
            previsao,
            diffDias
        };
    });

    const ativas = locacoesComValor.filter((locacao) => locacao.status === 'ativo');
    const elLocacoes = document.getElementById('dashLocacoes');
    if (elLocacoes) elLocacoes.innerText = ativas.length;
    const elTagLocacoes = document.getElementById('dashTagLocacoes');
    if (elTagLocacoes) {
        elTagLocacoes.innerText = ativas.length === 0
            ? 'Sem operações abertas'
            : `${ativas.length} em andamento`;
    }

    const totalRecebidoAtivo = ativas
        .filter((locacao) => locacao.pago)
        .reduce((total, locacao) => total + locacao.valorFinal, 0);
    const totalPendenteAtivo = ativas
        .filter((locacao) => !locacao.pago)
        .reduce((total, locacao) => total + locacao.valorFinal, 0);

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

    const receitaMes = locacoesDoMes.reduce((total, locacao) => total + locacao.valorFinal, 0);
    const recebidoMes = locacoesDoMes
        .filter((locacao) => locacao.pago)
        .reduce((total, locacao) => total + locacao.valorFinal, 0);
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
    const totalAlertas = atrasadas.length + vencemHoje.length + vencemAmanha.length + proximas72h.length;

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
                <div class="alert-item critical">
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
                <div class="alert-item warning">
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
                <div class="alert-item info">
                    <i class="bi bi-calendar2-week"></i>
                    <div class="alert-item-body">
                        <strong>${vencemAmanha.length} devolucao(oes) para amanha</strong>
                        <small>${resumoClientesAlerta(vencemAmanha, 2)}</small>
                    </div>
                </div>
            `);
        }
        if (proximas72h.length > 0) {
            cards.push(`
                <div class="alert-item neutral">
                    <i class="bi bi-clock-history"></i>
                    <div class="alert-item-body">
                        <strong>${proximas72h.length} devolucao(oes) nos proximos 3 dias</strong>
                        <small>${resumoClientesAlerta(proximas72h, 2)}</small>
                    </div>
                </div>
            `);
        }

        if (cards.length === 0) {
            listaAlertas.innerHTML = '<small class="muted-note">Sistema operando normalmente.</small>';
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
            tabelaDevolucoes.innerHTML = '<tr class="table-empty-row"><td colspan="3">Nada previsto.</td></tr>';
        } else {
            tabelaDevolucoes.innerHTML = proximas.slice(0, 5).map((locacao) => {
                const status = statusPrazo(locacao.diffDias);
                return `
                    <tr>
                        <td>${locacao.previsao.toLocaleDateString('pt-BR')}</td>
                        <td>${escaparTextoDashboard(locacao.cliente)}</td>
                        <td class="table-head-center"><span class="badge ${status.classe}">${status.texto}</span></td>
                    </tr>
                `;
            }).join('');
        }
    }
}
