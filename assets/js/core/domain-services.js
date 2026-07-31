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
    const STATUS_RESERVA_ESTOQUE_VALIDOS = new Set([
        'nao_reservado',
        'reservado',
        'reservado_legado',
        'liberado'
    ]);

    function normalizarValorMonetarioLegado(valor) {
        if (typeof valor === 'number') {
            return Number.isFinite(valor) ? valor : null;
        }
        if (valor == null) return null;

        let texto = String(valor)
            .replace(/\u00a0/g, ' ')
            .trim();
        if (!texto) return null;

        texto = texto
            .replace(/^R\$\s*/i, '')
            .replace(/\s+/g, '');

        let sinal = 1;
        if (texto.startsWith('-')) {
            sinal = -1;
            texto = texto.slice(1);
        } else if (texto.startsWith('+')) {
            texto = texto.slice(1);
        }

        if (!texto || !/^\d+(?:[.,]\d+)*$/.test(texto)) return null;

        const ultimaVirgula = texto.lastIndexOf(',');
        const ultimoPonto = texto.lastIndexOf('.');
        let separadorDecimal = '';

        if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
            separadorDecimal = ultimaVirgula > ultimoPonto ? ',' : '.';
        } else {
            const separador = ultimaVirgula >= 0 ? ',' : (ultimoPonto >= 0 ? '.' : '');
            if (separador) {
                const casasFinais = texto.length - texto.lastIndexOf(separador) - 1;
                if (casasFinais > 0 && casasFinais <= 2) separadorDecimal = separador;
            }
        }

        let textoNumerico;
        if (separadorDecimal) {
            const indiceDecimal = texto.lastIndexOf(separadorDecimal);
            const parteInteira = texto.slice(0, indiceDecimal).replace(/[.,]/g, '');
            const parteDecimal = texto.slice(indiceDecimal + 1);
            textoNumerico = `${parteInteira}.${parteDecimal}`;
        } else {
            textoNumerico = texto.replace(/[.,]/g, '');
        }

        const numero = Number(textoNumerico) * sinal;
        return Number.isFinite(numero) ? numero : null;
    }

    function valorMonetarioSeguro(valor, fallback = 0) {
        const normalizado = normalizarValorMonetarioLegado(valor);
        if (normalizado !== null) return normalizado;
        const fallbackNormalizado = normalizarValorMonetarioLegado(fallback);
        return fallbackNormalizado !== null ? fallbackNormalizado : 0;
    }

    function numeroSeguro(valor, fallback) {
        const n = Number(valor);
        if (!Number.isFinite(n)) return Number(fallback) || 0;
        return n;
    }

    function inteiroNaoNegativo(valor, fallback) {
        return Math.max(0, Math.trunc(numeroSeguro(valor, fallback)));
    }

    function inteiroLegadoNaoNegativo(valor, fallback = 0) {
        const normalizado = normalizarValorMonetarioLegado(valor);
        if (normalizado !== null) return Math.max(0, Math.trunc(normalizado));
        const fallbackNormalizado = normalizarValorMonetarioLegado(fallback);
        return fallbackNormalizado !== null ? Math.max(0, Math.trunc(fallbackNormalizado)) : 0;
    }

    function normalizarDataPeriodoEstoque(valor) {
        if (valor instanceof Date) {
            if (Number.isNaN(valor.getTime())) return '';
            const ano = valor.getFullYear();
            const mes = String(valor.getMonth() + 1).padStart(2, '0');
            const dia = String(valor.getDate()).padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
        }

        const texto = textoSeguro(valor, '').trim();
        if (!texto) return '';

        const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
        const brasileiro = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const partes = iso
            ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
            : brasileiro
                ? [Number(brasileiro[3]), Number(brasileiro[2]), Number(brasileiro[1])]
                : null;
        if (!partes) return '';

        const [ano, mes, dia] = partes;
        const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));
        if (dataUtc.getUTCFullYear() !== ano
            || dataUtc.getUTCMonth() !== mes - 1
            || dataUtc.getUTCDate() !== dia) {
            return '';
        }

        return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }

    function normalizarIntervaloPeriodoEstoque(inicio, fim) {
        const inicioNormalizado = normalizarDataPeriodoEstoque(inicio);
        const fimNormalizado = normalizarDataPeriodoEstoque(fim);
        const inicioMs = inicioNormalizado ? Date.parse(`${inicioNormalizado}T00:00:00Z`) : null;
        const fimMs = fimNormalizado ? Date.parse(`${fimNormalizado}T00:00:00Z`) : null;
        const completo = Number.isFinite(inicioMs) && Number.isFinite(fimMs) && fimMs >= inicioMs;

        return {
            inicio: inicioNormalizado,
            fim: fimNormalizado,
            inicioMs,
            fimMs,
            completo,
            invertido: Number.isFinite(inicioMs) && Number.isFinite(fimMs) && fimMs < inicioMs
        };
    }

    function formatarPeriodoEstoque(intervalo = {}) {
        const formatar = (valor) => {
            const data = normalizarDataPeriodoEstoque(valor);
            if (!data) return 'data não informada';
            const [ano, mes, dia] = data.split('-');
            return `${dia}/${mes}/${ano}`;
        };
        return `${formatar(intervalo.inicio)} e ${formatar(intervalo.fim)}`;
    }

    function formatarMensagemDisponibilidadeEstoque(contexto = {}) {
        const consulta = contexto.consulta || {};
        const item = textoSeguro(contexto.item || contexto.nomeItem, 'Item de estoque');
        const solicitado = inteiroLegadoNaoNegativo(contexto.solicitado, 0);
        const disponivel = inteiroLegadoNaoNegativo(consulta.disponivel, 0);
        const tipo = textoSeguro(contexto.tipo, '').trim().toLowerCase();

        if (tipo === 'intervalo_invalido' || consulta.motivo === 'intervalo_incompleto') {
            return 'Informe um período operacional válido para consultar a disponibilidade do estoque.';
        }

        const conflitoLegado = Array.isArray(consulta.conflitos)
            ? consulta.conflitos.find((conflito) => conflito?.motivo === 'intervalo_incompleto')
            : null;
        if (tipo === 'intervalo_legado_incompleto' || conflitoLegado) {
            const codigo = textoSeguro(
                contexto.codigoLocacao || conflitoLegado?.codigoLocacao || conflitoLegado?.locacaoId,
                'não identificada'
            );
            const cliente = textoSeguro(contexto.cliente || conflitoLegado?.cliente, '').trim();
            const complementoCliente = cliente ? ` (${cliente})` : '';
            return `A disponibilidade não pôde ser confirmada porque a locação ${codigo}${complementoCliente} está sem previsão de término. Revise esse registro antes de continuar.`;
        }

        const reservaResidual = inteiroLegadoNaoNegativo(
            contexto.reservaLegadaResidual,
            consulta.reservaLegadaResidual
        );
        if (tipo === 'reserva_residual' || reservaResidual > 0) {
            return `A disponibilidade de “${item}” está limitada por ${reservaResidual} unidade(s) em reserva legada sem locação identificada. `
                + `Solicitado: ${solicitado}. Disponível: ${disponivel}.`;
        }

        const intervalo = contexto.intervalo || consulta.intervalo || {};
        return `Estoque insuficiente para “${item}” entre ${formatarPeriodoEstoque(intervalo)}. `
            + `Solicitado: ${solicitado}. Disponível: ${disponivel}.`;
    }

    function obterIntervaloOperacionalLocacao(locacao = {}) {
        const inicio = locacao?.datasMontagem?.inicio || locacao?.dataAluguel || '';
        const fim = locacao?.datasDesmontagem?.fim
            || locacao?.datasDesmontagem?.inicio
            || locacao?.dataDevolucaoPrevisao
            || '';
        return normalizarIntervaloPeriodoEstoque(inicio, fim);
    }

    function intervalosEstoqueSobrepostos(intervaloA = {}, intervaloB = {}) {
        const a = intervaloA?.inicioMs !== undefined
            ? intervaloA
            : normalizarIntervaloPeriodoEstoque(intervaloA?.inicio, intervaloA?.fim);
        const b = intervaloB?.inicioMs !== undefined
            ? intervaloB
            : normalizarIntervaloPeriodoEstoque(intervaloB?.inicio, intervaloB?.fim);

        // Intervalos legados incompletos permanecem conservadores e conflitam.
        if (!a.completo || !b.completo) return true;
        return a.inicioMs <= b.fimMs && b.inicioMs <= a.fimMs;
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

    function obterQuantidadePropriaPendenteItem(item = {}) {
        const quantidadePropria = obterQuantidadePropriaOperacional(item);
        const devolvidos = inteiroNaoNegativo(item?.devolvidos, 0);
        const avariados = inteiroNaoNegativo(item?.avariadosEstoqueProprio, 0);
        return Math.max(quantidadePropria - devolvidos - avariados, 0);
    }

    function obterQuantidadePendenteDevolucaoItem(item = {}) {
        return obterQuantidadePropriaPendenteItem(item);
    }

    function locacaoTemPendenciaDevolucaoInterna(locacao = {}) {
        const statusFluxo = inferirStatusFluxoLocacao(locacao);
        const statusBase = textoSeguro(locacao?.status, '').trim().toLowerCase();
        if (statusFluxo === 'devolvido' || statusFluxo === 'cancelado'
            || statusBase === 'devolvido' || statusBase === 'cancelado') {
            return false;
        }

        return Array.isArray(locacao?.items)
            && locacao.items.some((item) => obterQuantidadePendenteDevolucaoItem(item) > 0);
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

    function possuiValorFinanceiroLocacao(locacao = {}) {
        return normalizarValorMonetarioLegado(locacao?.financeiro?.valorTotal) !== null;
    }

    function calcularValorItensLocacaoDominio(locacao = {}) {
        const subtotal = clonarArraySeguro(locacao.items).reduce((total, item) => {
            const valor = valorMonetarioSeguro(item?.valor, 0);
            const qtd = inteiroNaoNegativo(item?.quantidade, 0);
            return total + (valor * qtd);
        }, 0);

        let divisor = numeroSeguro(locacao?.divisorFatura, 1);
        if (divisor <= 0) divisor = 1;
        return subtotal / divisor;
    }

    function calcularValorLocacaoDominio(locacao = {}) {
        if (possuiValorFinanceiroLocacao(locacao)) {
            return Math.max(0, valorMonetarioSeguro(locacao.financeiro.valorTotal, 0));
        }
        return calcularValorItensLocacaoDominio(locacao);
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

    function possuiDevolucaoTotalComprovadaLocacao(locacao = {}, registrosDevolucao = []) {
        const locacaoId = textoSeguro(locacao?.id, '');
        if (!locacaoId || !Array.isArray(registrosDevolucao)) return false;

        return registrosDevolucao.some((registro) => (
            textoSeguro(registro?.locacaoId, '') === locacaoId
            && textoSeguro(registro?.tipo, '').trim().toLowerCase() === 'total'
        ));
    }

    function classificarStatusReservaLegadoLocacao(locacao = {}, registrosDevolucao = []) {
        const statusFluxo = inferirStatusFluxoLocacao(locacao);
        const statusBase = textoSeguro(locacao.status, '').trim().toLowerCase();
        const cancelamentoComprovado = statusFluxo === 'cancelado' || statusBase === 'cancelado';
        const devolucaoComprovada = statusFluxo === 'devolvido'
            || statusBase === 'devolvido'
            || possuiDevolucaoTotalComprovadaLocacao(locacao, registrosDevolucao);

        return cancelamentoComprovado || devolucaoComprovada
            ? 'liberado'
            : 'reservado_legado';
    }

    function normalizarEstoqueReservaLocacao(locacao = {}, registrosDevolucao = null) {
        const reservaAtual = clonarObjetoSeguro(locacao.estoqueReserva);
        const statusAtual = valorEmConjunto(
            reservaAtual.status,
            STATUS_RESERVA_ESTOQUE_VALIDOS,
            ''
        );
        const registrosDisponiveis = Array.isArray(registrosDevolucao)
            ? registrosDevolucao
            : (typeof devolucoes !== 'undefined' && Array.isArray(devolucoes) ? devolucoes : []);
        const statusLegadoComprovado = classificarStatusReservaLegadoLocacao(
            locacao,
            registrosDisponiveis
        );

        if (statusAtual) {
            const origemCompatibilidade = textoSeguro(reservaAtual.origem, '').trim().toLowerCase()
                === 'compatibilidade_legado';
            const reclassificarComoLiberado = statusAtual === 'reservado_legado'
                && origemCompatibilidade
                && statusLegadoComprovado === 'liberado';
            return {
                ...reservaAtual,
                status: reclassificarComoLiberado ? 'liberado' : statusAtual,
                movimentacaoIds: clonarArraySeguro(reservaAtual.movimentacaoIds)
            };
        }

        return {
            ...reservaAtual,
            status: statusLegadoComprovado,
            origem: 'compatibilidade_legado',
            movimentacaoIds: clonarArraySeguro(reservaAtual.movimentacaoIds)
        };
    }

    function locacaoComprometeEstoque(locacao = {}) {
        const reserva = normalizarEstoqueReservaLocacao(locacao);
        return reserva.status === 'reservado' || reserva.status === 'reservado_legado';
    }

    function locacaoComprometeDisponibilidadePrevista(locacao = {}, registrosDevolucao = null) {
        const statusFluxo = inferirStatusFluxoLocacao(locacao);
        const statusBase = textoSeguro(locacao?.status, '').trim().toLowerCase();
        if (statusFluxo === 'cancelado' || statusFluxo === 'devolvido'
            || statusBase === 'cancelado' || statusBase === 'devolvido') {
            return false;
        }

        const registros = Array.isArray(registrosDevolucao)
            ? registrosDevolucao
            : (typeof devolucoes !== 'undefined' && Array.isArray(devolucoes) ? devolucoes : []);
        if (possuiDevolucaoTotalComprovadaLocacao(locacao, registros)) return false;

        const reserva = normalizarEstoqueReservaLocacao(locacao, registros);
        return reserva.status !== 'liberado';
    }

    function obterEstoqueFisicoUtilizavelPeriodo(peca = {}) {
        const normalizada = normalizarPecaDominio(peca);
        return Math.max(
            inteiroLegadoNaoNegativo(peca?.quantidadeTotal, normalizada.quantidadeTotal)
            - inteiroLegadoNaoNegativo(peca?.manutencao, normalizada.manutencao)
            - inteiroLegadoNaoNegativo(peca?.avariado, normalizada.avariado)
            - inteiroLegadoNaoNegativo(peca?.perdido, normalizada.perdido),
            0
        );
    }

    function consultarDisponibilidadeItemPeriodo(pecaOuId, intervaloOuLocacao = {}, opcoes = {}) {
        const listaPecas = Array.isArray(opcoes.pecas)
            ? opcoes.pecas
            : (typeof pecas !== 'undefined' && Array.isArray(pecas) ? pecas : []);
        const peca = pecaOuId && typeof pecaOuId === 'object'
            ? pecaOuId
            : listaPecas.find((item) => String(item?.id || '') === String(pecaOuId || ''));
        const intervalo = intervaloOuLocacao?.inicioMs !== undefined
            ? intervaloOuLocacao
            : (Object.prototype.hasOwnProperty.call(intervaloOuLocacao || {}, 'inicio')
                || Object.prototype.hasOwnProperty.call(intervaloOuLocacao || {}, 'fim'))
                ? normalizarIntervaloPeriodoEstoque(intervaloOuLocacao?.inicio, intervaloOuLocacao?.fim)
                : obterIntervaloOperacionalLocacao(intervaloOuLocacao);
        const quantidadeFisicaUtilizavel = peca ? obterEstoqueFisicoUtilizavelPeriodo(peca) : 0;

        if (!peca || !intervalo.completo) {
            return {
                disponivel: 0,
                quantidadeFisicaUtilizavel,
                quantidadeComprometida: 0,
                quantidadeComprometidaPeriodo: 0,
                reservasExplicadas: 0,
                reservaLegadaResidual: 0,
                intervalo,
                conflitos: [],
                valido: false,
                motivo: peca ? 'intervalo_incompleto' : 'item_nao_encontrado'
            };
        }

        const pecaId = String(peca?.id || '');
        const ignorarLocacaoId = String(opcoes.ignorarLocacaoId || '');
        const listaLocacoes = Array.isArray(opcoes.locacoes)
            ? opcoes.locacoes
            : (typeof locacoes !== 'undefined' && Array.isArray(locacoes) ? locacoes : []);
        const registrosDevolucao = Array.isArray(opcoes.devolucoes)
            ? opcoes.devolucoes
            : (typeof devolucoes !== 'undefined' && Array.isArray(devolucoes) ? devolucoes : []);
        const conflitos = [];
        let quantidadeComprometidaPeriodo = 0;
        let reservasExplicadas = 0;

        listaLocacoes.forEach((locacao) => {
            if (!locacaoComprometeDisponibilidadePrevista(locacao, registrosDevolucao)) return;

            const itensComprometidos = (Array.isArray(locacao?.items) ? locacao.items : [])
                .filter((item) => String(item?.pecaId || '') === pecaId)
                .map((item, indice) => ({
                    item: textoSeguro(item?.nome || item?.descricao, `Item ${indice + 1}`),
                    quantidade: obterQuantidadePropriaPendenteItem(item)
                }))
                .filter((item) => item.quantidade > 0);
            const quantidadeLocacao = itensComprometidos.reduce((total, item) => total + item.quantidade, 0);
            if (quantidadeLocacao <= 0) return;

            if (locacaoComprometeEstoque(locacao)) {
                reservasExplicadas += quantidadeLocacao;
            }

            if (ignorarLocacaoId && String(locacao?.id || '') === ignorarLocacaoId) return;

            const intervaloLocacao = obterIntervaloOperacionalLocacao(locacao);
            if (!intervalosEstoqueSobrepostos(intervalo, intervaloLocacao)) return;

            quantidadeComprometidaPeriodo += quantidadeLocacao;
            conflitos.push({
                locacaoId: textoSeguro(locacao?.id, ''),
                codigoLocacao: textoSeguro(
                    locacao?.codigoLocacao || locacao?.codigo || locacao?.codigoExibicaoProposta,
                    locacao?.id ? `LOC-${locacao.id}` : 'Locação não identificada'
                ),
                cliente: textoSeguro(
                    locacao?.clienteSnapshot?.nome || locacao?.cliente?.nome || locacao?.clienteNome,
                    ''
                ),
                motivo: intervaloLocacao.completo ? 'sobreposicao_periodo' : 'intervalo_incompleto',
                itens: itensComprometidos,
                quantidade: quantidadeLocacao,
                intervalo: intervaloLocacao,
                statusReserva: normalizarEstoqueReservaLocacao(locacao, registrosDevolucao).status
            });
        });

        const pecaNormalizada = normalizarPecaDominio(peca);
        const reservadoInformado = inteiroLegadoNaoNegativo(peca?.reservado, pecaNormalizada.reservado);
        const reservaLegadaResidual = Math.max(reservadoInformado - reservasExplicadas, 0);
        const quantidadeComprometida = quantidadeComprometidaPeriodo + reservaLegadaResidual;

        return {
            disponivel: Math.max(quantidadeFisicaUtilizavel - quantidadeComprometida, 0),
            quantidadeFisicaUtilizavel,
            quantidadeComprometida,
            quantidadeComprometidaPeriodo,
            reservasExplicadas,
            reservaLegadaResidual,
            intervalo,
            conflitos,
            valido: true,
            motivo: ''
        };
    }

    function normalizarFinanceiroLocacao(locacao = {}) {
        const valorTotal = Math.max(0, valorMonetarioSeguro(
            locacao?.financeiro?.valorTotal,
            calcularValorLocacaoDominio(locacao)
        ));
        const sinal = Math.max(0, valorMonetarioSeguro(locacao?.financeiro?.sinal, locacao?.sinal));
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

        financeiro.valorTotal = Math.max(0, valorMonetarioSeguro(financeiro.valorTotal, valorTotal));
        financeiro.sinal = Math.max(0, valorMonetarioSeguro(financeiro.sinal, sinal));
        financeiro.valorRestante = Math.max(0, valorMonetarioSeguro(
            financeiro.valorRestante,
            valorRestantePadrao
        ));
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
            estoqueReserva: normalizarEstoqueReservaLocacao(locacao),
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

    function obterLocacaoParaReserva(locacaoOuId) {
        if (locacaoOuId && typeof locacaoOuId === 'object') return locacaoOuId;
        const lista = typeof locacoes !== 'undefined' && Array.isArray(locacoes)
            ? locacoes
            : [];
        return lista.find((item) => String(item?.id || '') === String(locacaoOuId || '')) || null;
    }

    function obterPecasParaReserva() {
        return typeof pecas !== 'undefined' && Array.isArray(pecas) ? pecas : [];
    }

    function obterChaveItemReservaEstoque(locacaoId, item, indice) {
        const itemId = textoSeguro(item?.id || item?.codigo || item?.pecaId || `item-${indice + 1}`, `item-${indice + 1}`);
        return `reserva|${textoSeguro(locacaoId)}|${itemId}|${indice + 1}|${textoSeguro(item?.pecaId)}`.toLowerCase();
    }

    function reservarEstoqueLocacao(locacaoOuId, opcoes = {}) {
        const locacao = obterLocacaoParaReserva(locacaoOuId);
        if (!locacao) {
            return { ok: false, bloqueios: ['Locação não encontrada para reserva.'], movimentacoes: [] };
        }

        const reservaAtual = normalizarEstoqueReservaLocacao(locacao);
        if (reservaAtual.status === 'reservado' || reservaAtual.status === 'reservado_legado') {
            return {
                ok: true,
                jaReservada: true,
                status: reservaAtual.status,
                bloqueios: [],
                movimentacoes: []
            };
        }

        const statusFluxo = inferirStatusFluxoLocacao(locacao);
        if (statusFluxo === 'cancelado' || statusFluxo === 'devolvido') {
            return {
                ok: false,
                bloqueios: ['Locações canceladas ou devolvidas não podem reservar estoque.'],
                movimentacoes: []
            };
        }

        if (typeof recalcularDisponibilidade === 'function') {
            recalcularDisponibilidade(true);
        }

        const itens = clonarArraySeguro(locacao.items);
        const pecasDisponiveis = obterPecasParaReserva();
        const bloqueios = [];
        const reservas = [];
        const totaisPorPeca = new Map();
        const consultasPorPeca = new Map();
        const intervaloOperacional = obterIntervaloOperacionalLocacao(locacao);

        if (!intervaloOperacional.completo) {
            return {
                ok: false,
                bloqueios: [formatarMensagemDisponibilidadeEstoque({
                    tipo: 'intervalo_invalido',
                    consulta: { motivo: 'intervalo_incompleto' }
                })],
                movimentacoes: [],
                totalReservado: 0
            };
        }

        itens.forEach((item, indice) => {
            const quantidade = obterQuantidadePropriaOperacional(item);
            if (quantidade <= 0) return;

            const pecaId = textoSeguro(item?.pecaId, '');
            const descricao = textoSeguro(item?.nome || item?.descricao, `Item ${indice + 1}`);
            if (!pecaId) {
                bloqueios.push(`${descricao}: vincule o item ao estoque antes de reservar.`);
                return;
            }

            const peca = pecasDisponiveis.find((registro) => String(registro?.id || '') === pecaId);
            if (!peca) {
                bloqueios.push(`${descricao}: item de estoque não encontrado.`);
                return;
            }

            const chaveIdempotencia = obterChaveItemReservaEstoque(locacao.id, item, indice);
            reservas.push({
                item,
                indice,
                peca,
                pecaId,
                descricao,
                quantidade,
                chaveIdempotencia
            });
            totaisPorPeca.set(pecaId, (totaisPorPeca.get(pecaId) || 0) + quantidade);
        });

        totaisPorPeca.forEach((quantidadeNecessaria, pecaId) => {
            const peca = pecasDisponiveis.find((registro) => String(registro?.id || '') === pecaId);
            const consulta = consultarDisponibilidadeItemPeriodo(peca, intervaloOperacional, {
                ignorarLocacaoId: locacao.id
            });
            consultasPorPeca.set(pecaId, consulta);
            if (quantidadeNecessaria > consulta.disponivel) {
                bloqueios.push(formatarMensagemDisponibilidadeEstoque({
                    item: textoSeguro(peca?.nome, 'Item de estoque'),
                    solicitado: quantidadeNecessaria,
                    consulta
                }));
            }
        });

        const movimentosExistentes = reservas.filter((reserva) => movimentacaoJaRegistrada(reserva.chaveIdempotencia));
        if (movimentosExistentes.length > 0 && movimentosExistentes.length !== reservas.length) {
            bloqueios.push('A reserva possui movimentações parciais anteriores. Confira o histórico antes de continuar.');
        }

        if (bloqueios.length) {
            return { ok: false, bloqueios, movimentacoes: [], totalReservado: 0 };
        }

        const dataHora = textoSeguro(opcoes.dataHora, new Date().toISOString());
        const usuario = textoSeguro(opcoes.usuario, obterIdentidadeOperacaoDominio());
        const saldosPorPeca = new Map(
            Array.from(totaisPorPeca.keys()).map((pecaId) => [
                pecaId,
                inteiroNaoNegativo(consultasPorPeca.get(pecaId)?.disponivel, 0)
            ])
        );

        const movimentacoes = reservas.map((reserva) => {
            const saldoAntes = saldosPorPeca.get(reserva.pecaId) || 0;
            const saldoDepois = Math.max(saldoAntes - reserva.quantidade, 0);
            saldosPorPeca.set(reserva.pecaId, saldoDepois);

            return registrarMovimentacaoEstoque({
                chaveIdempotencia: reserva.chaveIdempotencia,
                pecaId: reserva.pecaId,
                pecaNome: textoSeguro(reserva.peca?.nome, reserva.descricao),
                tipoMovimentacao: 'reserva',
                quantidade: reserva.quantidade,
                locacaoId: textoSeguro(locacao.id),
                locacaoRef: `#${textoSeguro(locacao.id).slice(-4)}`,
                usuario,
                dataHora,
                observacao: `Reserva explícita do item ${reserva.descricao}.`,
                saldoAntes,
                saldoDepois,
                origemEvento: 'reserva_explicita_locacao',
                statusProcessamento: 'confirmado'
            });
        }).filter(Boolean);

        locacao.estoqueReserva = {
            ...reservaAtual,
            status: 'reservado',
            origem: 'reserva_explicita',
            reservadoEm: dataHora,
            reservadoPor: usuario,
            movimentacaoIds: movimentacoes.map((movimento) => movimento.id)
        };

        registrarHistoricoLocacaoDominio(locacao, {
            acao: 'reserva_estoque',
            descricao: `Estoque reservado para ${reservas.length} item(ns) próprio(s).`,
            origem: 'locacoes',
            usuario
        });

        if (typeof recalcularDisponibilidade === 'function') {
            recalcularDisponibilidade(true);
        }

        return {
            ok: true,
            jaReservada: false,
            status: 'reservado',
            bloqueios: [],
            movimentacoes,
            totalReservado: reservas.reduce((total, reserva) => total + reserva.quantidade, 0)
        };
    }

    window.normalizarValorMonetarioLegado = normalizarValorMonetarioLegado;
    window.normalizarDataPeriodoEstoque = normalizarDataPeriodoEstoque;
    window.normalizarIntervaloPeriodoEstoque = normalizarIntervaloPeriodoEstoque;
    window.formatarPeriodoEstoque = formatarPeriodoEstoque;
    window.formatarMensagemDisponibilidadeEstoque = formatarMensagemDisponibilidadeEstoque;
    window.obterIntervaloOperacionalLocacao = obterIntervaloOperacionalLocacao;
    window.intervalosEstoqueSobrepostos = intervalosEstoqueSobrepostos;
    window.calcularValorLocacaoDominio = calcularValorLocacaoDominio;
    window.possuiValorFinanceiroLocacao = possuiValorFinanceiroLocacao;
    window.obterQuantidadePropriaOperacional = obterQuantidadePropriaOperacional;
    window.obterQuantidadePropriaPendenteItem = obterQuantidadePropriaPendenteItem;
    window.obterQuantidadePendenteDevolucaoItem = obterQuantidadePendenteDevolucaoItem;
    window.locacaoTemPendenciaDevolucaoInterna = locacaoTemPendenciaDevolucaoInterna;
    window.obterComposicaoOperacionalItem = obterComposicaoOperacionalItem;
    window.classificarStatusReservaLegadoLocacao = classificarStatusReservaLegadoLocacao;
    window.normalizarEstoqueReservaLocacao = normalizarEstoqueReservaLocacao;
    window.locacaoComprometeEstoque = locacaoComprometeEstoque;
    window.locacaoComprometeDisponibilidadePrevista = locacaoComprometeDisponibilidadePrevista;
    window.obterEstoqueFisicoUtilizavelPeriodo = obterEstoqueFisicoUtilizavelPeriodo;
    window.consultarDisponibilidadeItemPeriodo = consultarDisponibilidadeItemPeriodo;
    window.reservarEstoqueLocacao = reservarEstoqueLocacao;
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
