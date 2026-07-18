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

    function obterQuantidadePropriaOperacional(item = {}) {
        const quantidadeTotal = inteiroNaoNegativo(item?.quantidade, 0);
        const possuiOrigemCusto = Object.prototype.hasOwnProperty.call(item || {}, 'origemCusto');
        const origemCusto = textoSeguro(item?.origemCusto, '').trim().toLowerCase();

        // Dados legados e itens sem classificacao preservam o comportamento anterior.
        if (!possuiOrigemCusto || !origemCusto || origemCusto === 'nao_informado') {
            return quantidadeTotal;
        }

        if (origemCusto === 'terceirizado') return 0;
        if (origemCusto === 'proprio') return quantidadeTotal;

        if (origemCusto === 'misto') {
            // Nao deduz a parcela ausente: a divisao mista deve ser validada na proposta.
            const quantidadePropria = inteiroNaoNegativo(item?.quantidadePropria, 0);
            return Math.min(quantidadePropria, quantidadeTotal);
        }

        return quantidadeTotal;
    }

    function obterComposicaoOperacionalItem(item = {}) {
        const quantidadeTotal = inteiroNaoNegativo(item?.quantidade, 0);
        const possuiOrigemCusto = Object.prototype.hasOwnProperty.call(item || {}, 'origemCusto');
        const origemCusto = textoSeguro(item?.origemCusto, '').trim().toLowerCase();
        const origensClassificadas = new Set(['proprio', 'terceirizado', 'misto']);
        const possuiClassificacao = possuiOrigemCusto && origensClassificadas.has(origemCusto);

        if (!possuiClassificacao) {
            return {
                quantidadeTotal,
                quantidadePropria: quantidadeTotal,
                quantidadeTerceirizada: 0,
                origemCusto: origemCusto || 'nao_informado',
                possuiClassificacao: false,
                necessitaFornecedor: false
            };
        }

        const quantidadePropria = obterQuantidadePropriaOperacional(item);
        const quantidadeTerceirizada = origemCusto === 'terceirizado'
            ? quantidadeTotal
            : (origemCusto === 'misto'
                ? Math.min(inteiroNaoNegativo(item?.quantidadeTerceirizada, 0), quantidadeTotal)
                : 0);

        return {
            quantidadeTotal,
            quantidadePropria,
            quantidadeTerceirizada,
            origemCusto,
            possuiClassificacao: true,
            necessitaFornecedor: quantidadeTerceirizada > 0
        };
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

    function obterIdentidadeOperacaoDominio() {
        const email = textoSeguro(localStorage.getItem('usuarioEmail'), '').trim();
        if (email) return email;
        return 'sistema_local';
    }

    function registrarHistoricoLocacaoDominio(locacaoOriginal = {}, evento = {}) {
        if (!locacaoOriginal || typeof locacaoOriginal !== 'object') return locacaoOriginal;

        if (!Array.isArray(locacaoOriginal.historicoAlteracoes)) {
            locacaoOriginal.historicoAlteracoes = [];
        }

        const registro = {
            id: Date.now(),
            data: new Date().toISOString(),
            acao: textoSeguro(evento.acao, 'atualizacao'),
            descricao: textoSeguro(evento.descricao, 'Atualização de locação'),
            origem: textoSeguro(evento.origem, 'sistema'),
            status: textoSeguro(locacaoOriginal.status, ''),
            statusFluxo: textoSeguro(locacaoOriginal.statusFluxo, ''),
            usuario: textoSeguro(evento.usuario, obterIdentidadeOperacaoDominio())
        };

        locacaoOriginal.historicoAlteracoes.push(registro);
        if (locacaoOriginal.historicoAlteracoes.length > 240) {
            locacaoOriginal.historicoAlteracoes = locacaoOriginal.historicoAlteracoes.slice(-240);
        }

        return locacaoOriginal;
    }

    function atualizarStatusLocacaoDominio(locacaoOriginal = {}, proximoStatusFluxo = '', opcoes = {}) {
        if (!locacaoOriginal || typeof locacaoOriginal !== 'object') return locacaoOriginal;

        const locacao = locacaoOriginal;
        const statusAnterior = textoSeguro(locacao.status, '').trim().toLowerCase();
        const fluxoAnterior = valorEmConjunto(locacao.statusFluxo, STATUS_FLUXO_VALIDOS, '');
        const fluxoAtualizado = valorEmConjunto(
            proximoStatusFluxo,
            STATUS_FLUXO_VALIDOS,
            fluxoAnterior || inferirStatusFluxoLocacao(locacao)
        );

        locacao.statusFluxo = fluxoAtualizado;

        if (fluxoAtualizado === 'devolvido') {
            locacao.status = 'devolvido';
        } else if (fluxoAtualizado === 'cancelado') {
            locacao.status = 'cancelado';
        } else if (statusAnterior === 'devolvido' || statusAnterior === 'cancelado' || !statusAnterior) {
            locacao.status = 'ativo';
        }

        const statusNovo = textoSeguro(locacao.status, '').trim().toLowerCase();
        const fluxoNovo = valorEmConjunto(locacao.statusFluxo, STATUS_FLUXO_VALIDOS, fluxoAtualizado);
        const houveMudanca = fluxoAnterior !== fluxoNovo || statusAnterior !== statusNovo;

        if (opcoes.registrarHistorico !== false && (houveMudanca || opcoes.forcarHistorico)) {
            const nomeFluxo = fluxoNovo || 'aprovado';
            const descricaoPadrao = `Fluxo alterado para ${nomeFluxo}.`;
            registrarHistoricoLocacaoDominio(locacao, {
                acao: textoSeguro(opcoes.acao, 'status_fluxo'),
                descricao: textoSeguro(opcoes.descricao, descricaoPadrao),
                origem: textoSeguro(opcoes.origem, 'dominio'),
                usuario: textoSeguro(opcoes.usuario, '')
            });
        }

        return locacao;
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

    function normalizarMovimentacaoEstoque(movimentacaoOriginal = {}, indice = 0) {
        const movimentacao = clonarObjetoSeguro(movimentacaoOriginal);
        const tiposPermitidos = new Set(['reserva', 'separacao', 'saida', 'devolucao', 'avaria', 'perda', 'ajuste', 'entrada']);
        const tipoMovimentacao = valorEmConjunto(movimentacao.tipoMovimentacao, tiposPermitidos, 'ajuste');
        const quantidade = Math.max(0, numeroSeguro(movimentacao.quantidade, 0));
        const valorEstimado = Math.max(0, numeroSeguro(movimentacao.valorEstimado, 0));

        return {
            ...movimentacao,
            id: textoSeguro(movimentacao.id, `mov-${Date.now()}-${indice + 1}`),
            chaveIdempotencia: textoSeguro(movimentacao.chaveIdempotencia, ''),
            pecaId: textoSeguro(movimentacao.pecaId, ''),
            pecaNome: textoSeguro(movimentacao.pecaNome, ''),
            tipoMovimentacao,
            quantidade,
            locacaoId: textoSeguro(movimentacao.locacaoId, ''),
            locacaoRef: textoSeguro(movimentacao.locacaoRef, ''),
            usuario: textoSeguro(movimentacao.usuario, obterIdentidadeOperacaoDominio()),
            dataHora: textoSeguro(movimentacao.dataHora, new Date().toISOString()),
            observacao: textoSeguro(movimentacao.observacao, ''),
            valorEstimado,
            saldoAntes: Number.isFinite(Number(movimentacao.saldoAntes)) ? Number(movimentacao.saldoAntes) : null,
            saldoDepois: Number.isFinite(Number(movimentacao.saldoDepois)) ? Number(movimentacao.saldoDepois) : null,
            origemEvento: textoSeguro(movimentacao.origemEvento, ''),
            statusProcessamento: textoSeguro(movimentacao.statusProcessamento, 'auditoria')
        };
    }

    function gerarChaveMovimentacao(dados = {}) {
        const partes = [
            textoSeguro(dados.tipoMovimentacao, 'ajuste'),
            textoSeguro(dados.pecaId, ''),
            textoSeguro(dados.locacaoId, ''),
            String(Math.max(0, Math.trunc(numeroSeguro(dados.quantidade, 0))))
        ];

        if (dados.origemEvento) partes.push(textoSeguro(dados.origemEvento, ''));
        if (dados.observacao) partes.push(textoSeguro(dados.observacao, ''));

        return partes.join('|').toLowerCase();
    }

    function movimentacaoJaRegistrada(chaveIdempotencia) {
        const ledger = typeof movimentacoesEstoque !== 'undefined'
            ? movimentacoesEstoque
            : (window.movimentacoesEstoque = Array.isArray(window.movimentacoesEstoque) ? window.movimentacoesEstoque : []);

        if (!chaveIdempotencia || !Array.isArray(ledger)) return false;
        return ledger.some((movimentacao) => String(movimentacao?.chaveIdempotencia || '') === String(chaveIdempotencia));
    }

    function registrarMovimentacaoEstoque(dados = {}) {
        const ledger = typeof movimentacoesEstoque !== 'undefined'
            ? movimentacoesEstoque
            : (window.movimentacoesEstoque = Array.isArray(window.movimentacoesEstoque) ? window.movimentacoesEstoque : []);

        const base = {
            ...dados,
            tipoMovimentacao: textoSeguro(dados.tipoMovimentacao, 'ajuste').trim().toLowerCase(),
            dataHora: dados.dataHora || new Date().toISOString(),
            usuario: textoSeguro(dados.usuario, obterIdentidadeOperacaoDominio())
        };

        const normalizada = normalizarMovimentacaoEstoque(base, ledger.length);
        normalizada.chaveIdempotencia = normalizada.chaveIdempotencia || gerarChaveMovimentacao(normalizada);

        if (movimentacaoJaRegistrada(normalizada.chaveIdempotencia)) {
            return ledger.find((movimentacao) => String(movimentacao?.chaveIdempotencia || '') === normalizada.chaveIdempotencia) || null;
        }

        ledger.unshift(normalizada);
        if (ledger.length > 5000) {
            ledger.length = 5000;
        }

        window.movimentacoesEstoque = ledger;

        return normalizada;
    }

    window.calcularValorLocacaoDominio = calcularValorLocacaoDominio;
    window.obterQuantidadePropriaOperacional = obterQuantidadePropriaOperacional;
    window.obterComposicaoOperacionalItem = obterComposicaoOperacionalItem;
    window.normalizarLocacaoDominio = normalizarLocacaoDominio;
    window.normalizarPecaDominio = normalizarPecaDominio;
    window.calcularResumoEstoqueDominio = calcularResumoEstoqueDominio;
    window.normalizarMovimentacaoEstoque = normalizarMovimentacaoEstoque;
    window.gerarChaveMovimentacao = gerarChaveMovimentacao;
    window.movimentacaoJaRegistrada = movimentacaoJaRegistrada;
    window.registrarMovimentacaoEstoque = registrarMovimentacaoEstoque;
    window.registrarHistoricoLocacaoDominio = registrarHistoricoLocacaoDominio;
    window.atualizarStatusLocacaoDominio = atualizarStatusLocacaoDominio;
})();
