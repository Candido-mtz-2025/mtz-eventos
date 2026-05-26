// Regras de dominio compartilhadas (estoque, locacoes e financeiro)
(function () {
    const STATUS_ESTOQUE_VALIDOS = new Set(['ativo', 'inativo', 'manutencao', 'avariado', 'perdido']);
    const STATUS_FLUXO_VALIDOS = new Set([
        'orcamento',
        'aprovado',
        'separado',
        'carregado',
        'montado',
        'finalizado',
        'devolvido',
        'cancelado'
    ]);
    const STATUS_PAGAMENTO_VALIDOS = new Set(['pendente', 'parcial', 'pago', 'atrasado', 'cancelado']);
    const STATUS_LOGISTICA_VALIDOS = new Set(['pendente', 'agendado', 'em_rota', 'concluida', 'cancelada']);

    function numeroSeguro(valor, fallback) {
        const n = Number(valor);
        if (!Number.isFinite(n)) return Number(fallback) || 0;
        return n;
    }

    function inteiroNaoNegativo(valor, fallback) {
        return Math.max(0, Math.trunc(numeroSeguro(valor, fallback)));
    }

    function textoSeguro(valor, fallback = '') {
        if (valor == null) return fallback;
        return String(valor);
    }

    function valorEmConjunto(valor, conjunto, fallback) {
        const normalizado = String(valor || '').trim().toLowerCase();
        return conjunto.has(normalizado) ? normalizado : fallback;
    }

    function clonarObjetoSeguro(valor, fallback = {}) {
        if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...fallback };
        return { ...fallback, ...valor };
    }

    function clonarArraySeguro(valor) {
        return Array.isArray(valor) ? valor.slice() : [];
    }

    function calcularValorLocacaoDominio(locacao = {}) {
        const subtotal = clonarArraySeguro(locacao.items).reduce((total, item) => {
            const valor = numeroSeguro(item?.valor, 0);
            const qtd = inteiroNaoNegativo(item?.quantidade, 0);
            return total + (valor * qtd);
        }, 0);

        let divisor = numeroSeguro(locacao?.divisorFatura, 1);
        if (divisor <= 0) divisor = 1;
        return subtotal / divisor;
    }

    function inferirStatusFluxoLocacao(locacao = {}) {
        const statusFluxo = valorEmConjunto(locacao.statusFluxo, STATUS_FLUXO_VALIDOS, '');
        if (statusFluxo) return statusFluxo;

        const status = String(locacao.status || '').trim().toLowerCase();
        if (status === 'devolvido') return 'devolvido';
        if (status === 'cancelado') return 'cancelado';
        return 'aprovado';
    }

    function inferirStatusVisualLocacao(locacao = {}, referenciaHoje = null) {
        const statusFluxo = inferirStatusFluxoLocacao(locacao);
        if (statusFluxo === 'devolvido') return 'devolvido';
        if (statusFluxo === 'cancelado') return 'cancelado';

        const statusBase = String(locacao.status || '').trim().toLowerCase();
        if (statusBase === 'devolvido') return 'devolvido';
        if (statusBase === 'cancelado') return 'cancelado';

        const dataRaw = String(locacao.dataDevolucaoPrevisao || '').trim();
        if (!dataRaw) return 'ativo';

        const dataRef = referenciaHoje instanceof Date ? new Date(referenciaHoje) : new Date();
        dataRef.setHours(0, 0, 0, 0);

        const previsao = new Date(`${dataRaw}T00:00:00`);
        if (Number.isNaN(previsao.getTime())) return 'ativo';
        previsao.setHours(0, 0, 0, 0);

        if (previsao < dataRef) return 'atrasado';
        return 'ativo';
    }

    function normalizarFinanceiroLocacao(locacao = {}) {
        const valorTotal = Math.max(0, numeroSeguro(locacao?.financeiro?.valorTotal, calcularValorLocacaoDominio(locacao)));
        const sinal = Math.max(0, numeroSeguro(locacao?.financeiro?.sinal, locacao?.sinal));
        const valorRestantePadrao = Math.max(valorTotal - sinal, 0);
        const statusPagamentoPadrao = locacao?.pago ? 'pago' : 'pendente';

        const financeiro = clonarObjetoSeguro(locacao.financeiro, {
            valorTotal,
            sinal,
            valorRestante: valorRestantePadrao,
            vencimento: textoSeguro(locacao.dataDevolucaoPrevisao, ''),
            formaPagamento: '',
            statusPagamento: statusPagamentoPadrao,
            notaFiscal: '',
            comprovante: ''
        });

        financeiro.valorTotal = Math.max(0, numeroSeguro(financeiro.valorTotal, valorTotal));
        financeiro.sinal = Math.max(0, numeroSeguro(financeiro.sinal, sinal));
        financeiro.valorRestante = Math.max(0, numeroSeguro(financeiro.valorRestante, valorRestantePadrao));
        financeiro.statusPagamento = valorEmConjunto(financeiro.statusPagamento, STATUS_PAGAMENTO_VALIDOS, statusPagamentoPadrao);
        return financeiro;
    }

    function normalizarLocacaoDominio(locacaoOriginal = {}, opcoes = {}) {
        const referenciaHoje = opcoes.hoje instanceof Date ? opcoes.hoje : new Date();
        const incluirDerivados = opcoes.incluirDerivados !== false;
        const locacao = clonarObjetoSeguro(locacaoOriginal);
        const financeiro = normalizarFinanceiroLocacao(locacao);
        const statusFluxo = inferirStatusFluxoLocacao(locacao);
        const statusVisual = inferirStatusVisualLocacao({ ...locacao, statusFluxo }, referenciaHoje);
        const valorFinal = calcularValorLocacaoDominio(locacao);

        const normalizada = {
            ...locacao,
            statusFluxo,
            datasMontagem: clonarObjetoSeguro(locacao.datasMontagem, {
                inicio: '',
                fim: '',
                horarioInicio: '',
                horarioFim: ''
            }),
            datasDesmontagem: clonarObjetoSeguro(locacao.datasDesmontagem, {
                inicio: '',
                fim: '',
                horarioInicio: '',
                horarioFim: ''
            }),
            equipe: clonarObjetoSeguro(locacao.equipe, {
                responsavel: '',
                membros: [],
                observacoes: ''
            }),
            logistica: clonarObjetoSeguro(locacao.logistica, {
                veiculo: '',
                motorista: '',
                horarioSaida: '',
                horarioChegada: '',
                statusEntrega: 'pendente',
                statusRetirada: 'pendente',
                observacoes: ''
            }),
            financeiro,
            checklist: clonarObjetoSeguro(locacao.checklist, {
                idChecklist: null,
                status: 'nao_iniciado',
                ultimaAtualizacao: '',
                observacoes: ''
            }),
            historicoAlteracoes: clonarArraySeguro(locacao.historicoAlteracoes),
            pago: financeiro.statusPagamento === 'pago'
        };

        normalizada.logistica.statusEntrega = valorEmConjunto(
            normalizada.logistica.statusEntrega,
            STATUS_LOGISTICA_VALIDOS,
            'pendente'
        );
        normalizada.logistica.statusRetirada = valorEmConjunto(
            normalizada.logistica.statusRetirada,
            STATUS_LOGISTICA_VALIDOS,
            'pendente'
        );

        if (incluirDerivados) {
            normalizada.statusVisual = statusVisual;
            normalizada.valorTotalCalculado = valorFinal;
        }

        return normalizada;
    }

    function normalizarPecaDominio(pecaOriginal = {}) {
        const peca = clonarObjetoSeguro(pecaOriginal);
        const qtdTotal = inteiroNaoNegativo(peca.quantidadeTotal, peca.quantidade);
        const reservado = inteiroNaoNegativo(peca.reservado, Math.max(qtdTotal - inteiroNaoNegativo(peca.disponivel, qtdTotal), 0));
        const manutencao = inteiroNaoNegativo(peca.manutencao, 0);
        const avariado = inteiroNaoNegativo(peca.avariado, 0);
        const perdido = inteiroNaoNegativo(peca.perdido, 0);
        const indisponivelFixos = reservado + manutencao + avariado + perdido;
        const disponivelPadrao = Math.max(qtdTotal - indisponivelFixos, 0);
        let disponivel = inteiroNaoNegativo(peca.disponivel, disponivelPadrao);

        if ((disponivel + indisponivelFixos) > qtdTotal) {
            disponivel = disponivelPadrao;
        }

        return {
            ...peca,
            quantidadeTotal: qtdTotal,
            quantidade: qtdTotal, // compatibilidade legado
            disponivel,
            reservado,
            manutencao,
            avariado,
            perdido,
            localizacao: textoSeguro(peca.localizacao, ''),
            historicoMovimentacoes: clonarArraySeguro(peca.historicoMovimentacoes),
            codigoInterno: textoSeguro(peca.codigoInterno, peca.codigo || ''),
            qrCode: textoSeguro(peca.qrCode, peca.barras || peca.codigoBarras || ''),
            status: valorEmConjunto(peca.status, STATUS_ESTOQUE_VALIDOS, 'ativo')
        };
    }

    function calcularResumoEstoqueDominio(listaPecas = []) {
        const lista = clonarArraySeguro(listaPecas).map((peca) => normalizarPecaDominio(peca));

        const totalItens = lista.length;
        const totalDisponiveis = lista.reduce((acc, p) => acc + Math.max(Number(p.disponivel) || 0, 0), 0);
        const totalCriticos = lista.filter((p) => (Number(p.disponivel) || 0) <= 3).length;
        const valorEstoque = lista.reduce((acc, p) => {
            const valor = Number(p.valor) || 0;
            const disponivel = Math.max(Number(p.disponivel) || 0, 0);
            return acc + (valor * disponivel);
        }, 0);

        return {
            totalItens,
            totalDisponiveis,
            totalCriticos,
            valorEstoque
        };
    }

    window.calcularValorLocacaoDominio = calcularValorLocacaoDominio;
    window.normalizarLocacaoDominio = normalizarLocacaoDominio;
    window.normalizarPecaDominio = normalizarPecaDominio;
    window.calcularResumoEstoqueDominio = calcularResumoEstoqueDominio;
})();
