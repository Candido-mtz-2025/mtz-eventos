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

    function normalizarItemIdLocacaoValido(valor) {
        const itemId = textoSeguro(valor, '').trim();
        return itemId.length <= 160 && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(itemId)
            ? itemId
            : '';
    }

    function criarItemIdLocacao(locacaoId, indice, usados = new Set()) {
        const parteLocacao = textoSeguro(locacaoId, 'nova')
            .trim()
            .replace(/[^a-zA-Z0-9_-]+/g, '-') || 'nova';
        let numeroItem = indice + 1;
        let itemId = `loc-${parteLocacao}-item-${numeroItem}`;
        while (usados.has(itemId)) {
            numeroItem += 1;
            itemId = `loc-${parteLocacao}-item-${numeroItem}`;
        }
        return itemId;
    }

    function atribuirItemIdsLocacao(locacaoId, itens = []) {
        const lista = clonarArraySeguro(itens).map((item) => clonarObjetoSeguro(item));
        const primeiraOcorrencia = new Map();
        lista.forEach((item, indice) => {
            const itemId = normalizarItemIdLocacaoValido(item.itemId);
            if (itemId && !primeiraOcorrencia.has(itemId)) primeiraOcorrencia.set(itemId, indice);
        });
        const usados = new Set(primeiraOcorrencia.keys());

        return lista.map((item, indice) => {
            const informado = normalizarItemIdLocacaoValido(item.itemId);
            const preservar = informado && primeiraOcorrencia.get(informado) === indice;
            const itemId = preservar ? informado : criarItemIdLocacao(locacaoId, indice, usados);
            usados.add(itemId);
            return { ...item, itemId };
        });
    }

    function criarSnapshotReservaLocacao(locacao = {}, opcoes = {}) {
        // Snapshot passivo: a movimentação continua exclusiva dos serviços de estoque.
        const itens = atribuirItemIdsLocacao(locacao.id, locacao.items);
        const agrupados = new Map();
        itens.forEach((item) => {
            const pecaId = textoSeguro(item.pecaId, '').trim();
            const chave = pecaId ? `peca:${pecaId}` : `sem-vinculo:${item.itemId}`;
            const quantidadePropria = obterQuantidadePropriaOperacional(item);
            const quantidadePendente = obterQuantidadePropriaPendenteItem(item);
            const atual = agrupados.get(chave) || {
                pecaId,
                quantidadePropria: 0,
                quantidadePendente: 0,
                itemIds: []
            };
            atual.quantidadePropria += quantidadePropria;
            atual.quantidadePendente += quantidadePendente;
            atual.itemIds.push(item.itemId);
            agrupados.set(chave, atual);
        });
        const intervalo = obterIntervaloOperacionalLocacao(locacao);
        const reserva = normalizarEstoqueReservaLocacao(locacao);

        return {
            versao: 1,
            origem: textoSeguro(opcoes.origem, reserva.origem || 'estado_atual'),
            capturadoEm: textoSeguro(opcoes.capturadoEm, ''),
            statusReserva: textoSeguro(opcoes.statusReserva, reserva.status),
            periodo: {
                inicio: intervalo.inicio,
                fim: intervalo.fim,
                completo: intervalo.completo
            },
            itens: Array.from(agrupados.values())
        };
    }

    function atualizarSnapshotReservaLocacao(locacao = {}, opcoes = {}) {
        if (!locacao || typeof locacao !== 'object') return locacao;
        locacao.items = atribuirItemIdsLocacao(locacao.id, locacao.items);
        const reservaAtual = clonarObjetoSeguro(locacao.estoqueReserva);
        locacao.estoqueReserva = {
            ...reservaAtual,
            snapshot: criarSnapshotReservaLocacao(locacao, opcoes)
        };
        return locacao;
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
            : listaPecas.find((item) => textoSeguro(item?.id, '').trim() === textoSeguro(pecaOuId, '').trim());
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

        const pecaId = textoSeguro(peca?.id, '').trim();
        const ignorarLocacaoId = textoSeguro(opcoes.ignorarLocacaoId, '').trim();
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
                .filter((item) => textoSeguro(item?.pecaId, '').trim() === pecaId)
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

            if (ignorarLocacaoId && textoSeguro(locacao?.id, '').trim() === ignorarLocacaoId) return;

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

    function planejarAjusteReservaLocacao(locacaoAtual = {}, dadosEditados = {}, contexto = {}) {
        const bloqueios = [];
        const avisos = [];
        const conflitos = [];
        const pecasContexto = Array.isArray(contexto.pecas) ? contexto.pecas : null;
        const locacoesContexto = Array.isArray(contexto.locacoes) ? contexto.locacoes : null;
        const devolucoesContexto = Array.isArray(contexto.devolucoes) ? contexto.devolucoes : null;
        const locacaoId = textoSeguro(locacaoAtual?.id, '').trim();
        const itensAtuais = Array.isArray(locacaoAtual?.items) ? locacaoAtual.items.slice() : null;
        const itensEditados = Array.isArray(dadosEditados?.items) ? dadosEditados.items.slice() : null;
        const reservaAtual = normalizarEstoqueReservaLocacao(
            locacaoAtual,
            devolucoesContexto || []
        );
        const snapshot = reservaAtual?.snapshot && typeof reservaAtual.snapshot === 'object'
            && !Array.isArray(reservaAtual.snapshot)
            ? reservaAtual.snapshot
            : null;

        const adicionarBloqueio = (codigo, mensagem, dados = {}) => {
            bloqueios.push({ codigo, mensagem, ...dados });
        };
        const adicionarAviso = (codigo, mensagem, dados = {}) => {
            avisos.push({ codigo, mensagem, ...dados });
        };
        const serializarEstavel = (valor) => {
            if (valor === undefined) return 'undefined';
            if (typeof valor === 'number' && !Number.isFinite(valor)) return String(valor);
            if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
            if (Array.isArray(valor)) return `[${valor.map(serializarEstavel).join(',')}]`;
            return `{${Object.keys(valor).sort().map((chave) => (
                `${JSON.stringify(chave)}:${serializarEstavel(valor[chave])}`
            )).join(',')}}`;
        };
        const normalizarIdDominio = (valor) => {
            if (typeof valor !== 'string' && typeof valor !== 'number') return '';
            const id = String(valor).trim();
            return id.length <= 160 && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id) ? id : '';
        };
        const lerInteiroNaoNegativoEstrito = (valor, obrigatorio = true) => {
            if (valor === null || valor === undefined || typeof valor === 'boolean') {
                return { valido: !obrigatorio && valor == null, presente: valor != null, valor: 0 };
            }
            if (typeof valor === 'number') {
                return {
                    valido: Number.isFinite(valor) && Number.isInteger(valor) && valor >= 0,
                    presente: true,
                    valor
                };
            }
            if (typeof valor !== 'string') return { valido: false, presente: true, valor: 0 };
            const texto = valor.trim();
            if (!texto || !/^\d+$/.test(texto)) return { valido: false, presente: true, valor: 0 };
            const numero = Number(texto);
            return {
                valido: Number.isSafeInteger(numero) && numero >= 0,
                presente: true,
                valor: numero
            };
        };
        const numeroHistorico = (valor) => inteiroLegadoNaoNegativo(valor, 0);
        const periodoAtual = obterIntervaloOperacionalLocacao(locacaoAtual);
        const locacaoPretendidaPeriodo = {
            ...locacaoAtual,
            dataAluguel: Object.prototype.hasOwnProperty.call(dadosEditados || {}, 'dataAluguel')
                ? dadosEditados.dataAluguel
                : locacaoAtual.dataAluguel,
            dataDevolucaoPrevisao: Object.prototype.hasOwnProperty.call(dadosEditados || {}, 'dataDevolucaoPrevisao')
                ? dadosEditados.dataDevolucaoPrevisao
                : locacaoAtual.dataDevolucaoPrevisao,
            datasMontagem: Object.prototype.hasOwnProperty.call(dadosEditados || {}, 'datasMontagem')
                ? clonarObjetoSeguro(dadosEditados.datasMontagem)
                : clonarObjetoSeguro(locacaoAtual.datasMontagem),
            datasDesmontagem: Object.prototype.hasOwnProperty.call(dadosEditados || {}, 'datasDesmontagem')
                ? clonarObjetoSeguro(dadosEditados.datasDesmontagem)
                : clonarObjetoSeguro(locacaoAtual.datasDesmontagem)
        };
        const periodoPretendido = obterIntervaloOperacionalLocacao(locacaoPretendidaPeriodo);
        const periodoAlterado = periodoAtual.inicio !== periodoPretendido.inicio
            || periodoAtual.fim !== periodoPretendido.fim;
        const chavesPeriodoEItens = new Set([
            'items',
            'dataAluguel',
            'dataDevolucaoPrevisao',
            'datasMontagem',
            'datasDesmontagem'
        ]);
        const itensAlteradosNoRascunho = serializarEstavel(itensAtuais) !== serializarEstavel(itensEditados);
        const outrosDadosAlterados = Object.keys(dadosEditados || {})
            .filter((chave) => !chavesPeriodoEItens.has(chave))
            .some((chave) => serializarEstavel(dadosEditados[chave]) !== serializarEstavel(locacaoAtual?.[chave]));
        const rascunhoPossuiAlteracoes = periodoAlterado || itensAlteradosNoRascunho || outrosDadosAlterados;
        const retornoBase = {
            valido: false,
            bloqueios,
            avisos,
            referencia: {
                locacaoId,
                statusReserva: textoSeguro(reservaAtual?.status, ''),
                snapshotVersao: inteiroNaoNegativo(snapshot?.versao, 0),
                snapshotOrigem: textoSeguro(snapshot?.origem, '')
            },
            periodo: {
                atual: {
                    inicio: periodoAtual.inicio,
                    fim: periodoAtual.fim,
                    completo: periodoAtual.completo
                },
                pretendido: {
                    inicio: periodoPretendido.inicio,
                    fim: periodoPretendido.fim,
                    completo: periodoPretendido.completo
                },
                alterado: periodoAlterado
            },
            ajustes: {
                reservar: [],
                liberar: [],
                manter: [],
                reprogramarPeriodo: []
            },
            itens: [],
            conflitos,
            resumo: {
                quantidadeReservar: 0,
                quantidadeLiberar: 0,
                quantidadeManter: 0,
                itensMantidos: 0,
                itensAlterados: 0,
                itensIncluidos: 0,
                itensRemovidos: 0,
                // Indica diferenca no rascunho, independentemente de o plano ser valido.
                possuiAlteracoes: rascunhoPossuiAlteracoes,
                periodoAlterado
            }
        };

        const finalizarRetorno = () => {
            retornoBase.resumo.quantidadeReservar = retornoBase.ajustes.reservar
                .reduce((total, ajuste) => total + inteiroLegadoNaoNegativo(ajuste?.quantidade, 0), 0);
            retornoBase.resumo.quantidadeLiberar = retornoBase.ajustes.liberar
                .reduce((total, ajuste) => total + inteiroLegadoNaoNegativo(ajuste?.quantidade, 0), 0);
            retornoBase.resumo.quantidadeManter = retornoBase.ajustes.manter
                .reduce((total, ajuste) => total + inteiroLegadoNaoNegativo(ajuste?.quantidadePendente, 0), 0);
            retornoBase.resumo.itensMantidos = retornoBase.itens.filter((item) => item.situacao === 'mantido').length;
            retornoBase.resumo.itensAlterados = retornoBase.itens.filter((item) => item.situacao === 'alterado').length;
            retornoBase.resumo.itensIncluidos = retornoBase.itens.filter((item) => item.situacao === 'incluido').length;
            retornoBase.resumo.itensRemovidos = retornoBase.itens.filter((item) => item.situacao === 'removido').length;
            retornoBase.resumo.periodoAlterado = periodoAlterado;
            retornoBase.resumo.possuiAlteracoes = rascunhoPossuiAlteracoes;
            retornoBase.periodo.alterado = periodoAlterado;
            retornoBase.valido = bloqueios.length === 0;
            return retornoBase;
        };

        if (!locacaoId) adicionarBloqueio('LOCACAO_INVALIDA', 'Informe uma locação válida para planejar o ajuste.');
        if (!itensAtuais) adicionarBloqueio('ITENS_ATUAIS_INVALIDOS', 'A locação atual não possui uma lista de itens válida.');
        if (!itensEditados) adicionarBloqueio('ITENS_EDITADOS_AUSENTES', 'Informe a lista completa de itens pretendidos.');
        if (!pecasContexto || !locacoesContexto || !devolucoesContexto) {
            adicionarBloqueio(
                'CONTEXTO_INCOMPLETO',
                'Informe explicitamente peças, locações e devoluções para planejar o ajuste.'
            );
        }

        const locacaoIdNormalizado = normalizarIdDominio(locacaoId);
        if (locacaoId && !locacaoIdNormalizado) {
            adicionarBloqueio('LOCACAO_INVALIDA', 'A locação atual possui um identificador inválido.');
        }
        if (locacoesContexto && locacaoIdNormalizado) {
            const ocorrenciasLocacaoAtual = locacoesContexto.filter((locacao) => (
                normalizarIdDominio(locacao?.id) === locacaoIdNormalizado
            ));
            if (ocorrenciasLocacaoAtual.length === 0) {
                adicionarBloqueio(
                    'CONTEXTO_LOCACAO_ATUAL_AUSENTE',
                    'A locação atual não foi encontrada no contexto operacional informado.',
                    { locacaoId: locacaoIdNormalizado }
                );
            } else if (ocorrenciasLocacaoAtual.length > 1) {
                adicionarBloqueio(
                    'LOCACAO_ID_DUPLICADO_CONTEXTO',
                    'A locação atual aparece mais de uma vez no contexto operacional informado.',
                    { locacaoId: locacaoIdNormalizado }
                );
            }
        }
        const pecasPorId = new Map();
        if (pecasContexto) {
            pecasContexto.forEach((peca, indice) => {
                const pecaId = normalizarIdDominio(peca?.id);
                if (!pecaId) {
                    adicionarBloqueio(
                        'PECA_ID_INVALIDO_CONTEXTO',
                        `A peça ${indice + 1} do contexto possui identificador ausente ou inválido.`,
                        { campo: 'pecaId' }
                    );
                    return;
                }
                if (pecasPorId.has(pecaId)) {
                    adicionarBloqueio(
                        'PECA_ID_DUPLICADO',
                        `A peça “${pecaId}” aparece mais de uma vez no contexto de estoque.`,
                        { pecaId }
                    );
                    return;
                }
                pecasPorId.set(pecaId, peca);
            });
        }
        if (!periodoPretendido.completo) {
            adicionarBloqueio(
                'PERIODO_PRETENDIDO_INVALIDO',
                'Informe um período operacional pretendido completo e válido.',
                { campo: periodoPretendido.invertido ? 'dataDevolucaoPrevisao' : 'periodo' }
            );
        }
        if (!snapshot || inteiroNaoNegativo(snapshot?.versao, 0) < 1 || !Array.isArray(snapshot?.itens)) {
            adicionarBloqueio(
                'SNAPSHOT_INCOMPLETO',
                'A reserva atual não possui um snapshot consolidado válido para reconciliação.'
            );
        } else {
            const periodoSnapshot = snapshot.periodo && typeof snapshot.periodo === 'object'
                ? snapshot.periodo
                : {};
            const snapshotCompleto = periodoSnapshot.completo === true
                && textoSeguro(periodoSnapshot.inicio, '')
                && textoSeguro(periodoSnapshot.fim, '');
            if (!snapshotCompleto) {
                adicionarBloqueio(
                    'SNAPSHOT_INCOMPLETO',
                    'O snapshot da reserva não possui um período operacional completo.'
                );
            } else if (periodoSnapshot.inicio !== periodoAtual.inicio
                || periodoSnapshot.fim !== periodoAtual.fim) {
                adicionarBloqueio(
                    'SNAPSHOT_NAO_RECONCILIADO',
                    'O período atual da locação não corresponde ao período registrado no snapshot.'
                );
            }
        }

        const fluxo = inferirStatusFluxoLocacao(locacaoAtual);
        const statusBase = textoSeguro(locacaoAtual?.status, '').trim().toLowerCase();
        if (['cancelado', 'devolvido', 'finalizado'].includes(fluxo)
            || ['cancelado', 'devolvido', 'finalizado', 'historico'].includes(statusBase)) {
            adicionarBloqueio(
                'STATUS_NAO_EDITAVEL',
                'Locações canceladas, devolvidas ou encerradas não podem ter a reserva planejada para edição.'
            );
        }

        const validarQuantidadeItem = (item, indice, origem) => {
            const itemId = normalizarItemIdLocacaoValido(item?.itemId);
            const dadosBloqueio = { itemId: itemId || textoSeguro(item?.itemId, ''), origem };
            const quantidade = lerInteiroNaoNegativoEstrito(item?.quantidade, true);
            if (!quantidade.valido) {
                adicionarBloqueio(
                    'QUANTIDADE_INVALIDA',
                    `A quantidade do item ${itemId || indice + 1} da ${origem} deve ser um inteiro maior ou igual a zero.`,
                    { ...dadosBloqueio, campo: 'quantidade' }
                );
            }

            const possuiPropria = Object.prototype.hasOwnProperty.call(item || {}, 'quantidadePropria');
            const possuiTerceirizada = Object.prototype.hasOwnProperty.call(item || {}, 'quantidadeTerceirizada');
            const propria = lerInteiroNaoNegativoEstrito(item?.quantidadePropria, !possuiPropria ? false : true);
            const terceirizada = lerInteiroNaoNegativoEstrito(
                item?.quantidadeTerceirizada,
                !possuiTerceirizada ? false : true
            );
            if (possuiPropria && !propria.valido) {
                adicionarBloqueio(
                    'QUANTIDADE_PROPRIA_INVALIDA',
                    `A quantidade própria do item ${itemId || indice + 1} da ${origem} deve ser um inteiro maior ou igual a zero.`,
                    { ...dadosBloqueio, campo: 'quantidadePropria' }
                );
            }
            if (possuiTerceirizada && !terceirizada.valido) {
                adicionarBloqueio(
                    'QUANTIDADE_TERCEIRIZADA_INVALIDA',
                    `A quantidade terceirizada do item ${itemId || indice + 1} da ${origem} deve ser um inteiro maior ou igual a zero.`,
                    { ...dadosBloqueio, campo: 'quantidadeTerceirizada' }
                );
            }

            const origemCusto = textoSeguro(item?.origemCusto, '').trim().toLowerCase();
            if (!quantidade.valido || (possuiPropria && !propria.valido)
                || (possuiTerceirizada && !terceirizada.valido)) return;

            if (possuiPropria && propria.valor > quantidade.valor) {
                adicionarBloqueio(
                    'QUANTIDADE_PROPRIA_INVALIDA',
                    `A quantidade própria do item ${itemId || indice + 1} não pode superar a quantidade total.`,
                    { ...dadosBloqueio, campo: 'quantidadePropria' }
                );
            }
            if (possuiTerceirizada && terceirizada.valor > quantidade.valor) {
                adicionarBloqueio(
                    'QUANTIDADE_TERCEIRIZADA_INVALIDA',
                    `A quantidade terceirizada do item ${itemId || indice + 1} não pode superar a quantidade total.`,
                    { ...dadosBloqueio, campo: 'quantidadeTerceirizada' }
                );
            }
            if (origemCusto === 'misto') {
                if (!possuiPropria || !possuiTerceirizada) {
                    adicionarBloqueio(
                        'COMPOSICAO_MISTA_INCONSISTENTE',
                        `Informe as quantidades própria e terceirizada do item misto ${itemId || indice + 1}.`,
                        { ...dadosBloqueio, campo: !possuiPropria ? 'quantidadePropria' : 'quantidadeTerceirizada' }
                    );
                } else if (propria.valor + terceirizada.valor !== quantidade.valor) {
                    adicionarBloqueio(
                        'COMPOSICAO_MISTA_INCONSISTENTE',
                        `A soma das quantidades própria e terceirizada do item ${itemId || indice + 1} deve ser igual à quantidade total.`,
                        { ...dadosBloqueio, campo: 'quantidadePropria' }
                    );
                }
            } else if (origemCusto === 'proprio') {
                if (possuiPropria && propria.valor !== quantidade.valor) {
                    adicionarBloqueio(
                        'QUANTIDADE_PROPRIA_INVALIDA',
                        `A quantidade própria do item ${itemId || indice + 1} deve ser igual à quantidade total.`,
                        { ...dadosBloqueio, campo: 'quantidadePropria' }
                    );
                }
                if (possuiTerceirizada && terceirizada.valor !== 0) {
                    adicionarBloqueio(
                        'QUANTIDADE_TERCEIRIZADA_INVALIDA',
                        `Um item próprio não pode possuir quantidade terceirizada.`,
                        { ...dadosBloqueio, campo: 'quantidadeTerceirizada' }
                    );
                }
            } else if (origemCusto === 'terceirizado') {
                if (possuiPropria && propria.valor !== 0) {
                    adicionarBloqueio(
                        'QUANTIDADE_PROPRIA_INVALIDA',
                        `Um item terceirizado não pode possuir quantidade própria.`,
                        { ...dadosBloqueio, campo: 'quantidadePropria' }
                    );
                }
                if (possuiTerceirizada && terceirizada.valor !== quantidade.valor) {
                    adicionarBloqueio(
                        'QUANTIDADE_TERCEIRIZADA_INVALIDA',
                        `A quantidade terceirizada do item ${itemId || indice + 1} deve ser igual à quantidade total.`,
                        { ...dadosBloqueio, campo: 'quantidadeTerceirizada' }
                    );
                }
            }

            ['devolvidos', 'avariadosEstoqueProprio'].forEach((campo) => {
                if (!Object.prototype.hasOwnProperty.call(item || {}, campo)) return;
                const historico = lerInteiroNaoNegativoEstrito(item[campo], true);
                if (!historico.valido) {
                    adicionarBloqueio(
                        'HISTORICO_OPERACIONAL_INVALIDO',
                        `O campo histórico “${campo}” do item ${itemId || indice + 1} é inválido.`,
                        { ...dadosBloqueio, campo }
                    );
                }
            });
        };
        const validarIds = (lista, origem) => {
            const mapa = new Map();
            (lista || []).forEach((item, indice) => {
                validarQuantidadeItem(item, indice, origem);
                const itemId = normalizarItemIdLocacaoValido(item?.itemId);
                if (!itemId) {
                    adicionarBloqueio(
                        'ITEM_ID_INVALIDO',
                        `O item ${indice + 1} da ${origem} não possui itemId válido.`,
                        { itemId: textoSeguro(item?.itemId, ''), campo: 'itemId' }
                    );
                    return;
                }
                if (mapa.has(itemId)) {
                    adicionarBloqueio(
                        'ITEM_ID_DUPLICADO',
                        `O itemId “${itemId}” está duplicado na ${origem}.`,
                        { itemId, campo: 'itemId' }
                    );
                    return;
                }
                mapa.set(itemId, { item, indice });
            });
            return mapa;
        };
        const mapaAtual = validarIds(itensAtuais, 'locação atual');
        const mapaEditado = validarIds(itensEditados, 'edição pretendida');

        if (bloqueios.length) return finalizarRetorno();

        const snapshotPorPeca = new Map();
        const itemIdsSnapshot = new Set();
        snapshot.itens.forEach((entrada, indice) => {
            const pecaId = textoSeguro(entrada?.pecaId, '').trim();
            const itemIds = Array.isArray(entrada?.itemIds)
                ? entrada.itemIds.map((itemId) => textoSeguro(itemId, '').trim()).filter(Boolean)
                : [];
            const quantidadePropria = inteiroLegadoNaoNegativo(entrada?.quantidadePropria, 0);
            const quantidadePropriaBruta = lerInteiroNaoNegativoEstrito(entrada?.quantidadePropria, true);
            const quantidadePendenteBruta = lerInteiroNaoNegativoEstrito(entrada?.quantidadePendente, true);
            if (!quantidadePropriaBruta.valido || !quantidadePendenteBruta.valido) {
                adicionarBloqueio(
                    'SNAPSHOT_NAO_RECONCILIADO',
                    `A entrada ${indice + 1} do snapshot possui quantidades inválidas.`,
                    { pecaId }
                );
            }
            if (quantidadePropria > 0 && !pecaId) {
                adicionarBloqueio(
                    'SNAPSHOT_NAO_RECONCILIADO',
                    `A entrada ${indice + 1} do snapshot possui quantidade própria sem peça vinculada.`
                );
            }
            if (!itemIds.length) {
                adicionarBloqueio(
                    'SNAPSHOT_NAO_RECONCILIADO',
                    `A entrada ${indice + 1} do snapshot não identifica seus itens participantes.`
                );
            }
            itemIds.forEach((itemId) => {
                if (itemIdsSnapshot.has(itemId)) {
                    adicionarBloqueio(
                        'SNAPSHOT_NAO_RECONCILIADO',
                        `O itemId “${itemId}” aparece mais de uma vez no snapshot.`,
                        { itemId, pecaId }
                    );
                }
                itemIdsSnapshot.add(itemId);
                const atual = mapaAtual.get(itemId)?.item;
                if (!atual || textoSeguro(atual?.pecaId, '').trim() !== pecaId) {
                    adicionarBloqueio(
                        'SNAPSHOT_NAO_RECONCILIADO',
                        `O item “${itemId}” não pôde ser reconciliado com a peça registrada no snapshot.`,
                        { itemId, pecaId }
                    );
                }
            });
            const agrupado = snapshotPorPeca.get(pecaId) || {
                pecaId,
                quantidadePropria: 0,
                itemIds: []
            };
            agrupado.quantidadePropria += quantidadePropria;
            agrupado.itemIds.push(...itemIds);
            snapshotPorPeca.set(pecaId, agrupado);
        });

        mapaAtual.forEach(({ item }, itemId) => {
            if (!itemIdsSnapshot.has(itemId)) {
                adicionarBloqueio(
                    'SNAPSHOT_NAO_RECONCILIADO',
                    `O item “${itemId}” não está representado no snapshot da reserva.`,
                    { itemId, pecaId: textoSeguro(item?.pecaId, '') }
                );
            }
        });

        const atualPorPeca = new Map();
        mapaAtual.forEach(({ item }, itemId) => {
            const pecaId = textoSeguro(item?.pecaId, '').trim();
            const quantidadePropria = obterQuantidadePropriaOperacional(item);
            const devolvida = numeroHistorico(item?.devolvidos);
            const avariada = numeroHistorico(item?.avariadosEstoqueProprio);
            const agrupado = atualPorPeca.get(pecaId) || {
                pecaId,
                quantidadePropria: 0,
                devolvida: 0,
                avariada: 0,
                pendente: 0,
                itemIds: []
            };
            agrupado.quantidadePropria += quantidadePropria;
            agrupado.devolvida += devolvida;
            agrupado.avariada += avariada;
            agrupado.pendente += Math.max(quantidadePropria - devolvida - avariada, 0);
            agrupado.itemIds.push(itemId);
            atualPorPeca.set(pecaId, agrupado);
        });

        snapshotPorPeca.forEach((referencia, pecaId) => {
            const atual = atualPorPeca.get(pecaId);
            if (!atual || atual.quantidadePropria !== referencia.quantidadePropria) {
                adicionarBloqueio(
                    'SNAPSHOT_NAO_RECONCILIADO',
                    `A quantidade própria consolidada da peça “${pecaId || 'sem vínculo'}” não corresponde ao snapshot.`,
                    { pecaId }
                );
            }
        });
        atualPorPeca.forEach((atual, pecaId) => {
            if (!snapshotPorPeca.has(pecaId) && atual.quantidadePropria > 0) {
                adicionarBloqueio(
                    'SNAPSHOT_NAO_RECONCILIADO',
                    `A peça “${pecaId || 'sem vínculo'}” possui quantidade própria fora do snapshot.`,
                    { pecaId }
                );
            }
        });

        const historicoContextoPorItem = new Map();
        const historicoContextoPorPeca = new Map();
        devolucoesContexto
            .filter((registro) => textoSeguro(registro?.locacaoId, '') === locacaoId)
            .forEach((registro) => {
                (Array.isArray(registro?.itens) ? registro.itens : []).forEach((itemHistorico) => {
                    const itemId = normalizarItemIdLocacaoValido(itemHistorico?.itemId);
                    const pecaId = textoSeguro(itemHistorico?.pecaId, '').trim();
                    const campoDevolvida = Object.prototype.hasOwnProperty.call(itemHistorico || {}, 'quantidadeDevolvida')
                        ? 'quantidadeDevolvida'
                        : (Object.prototype.hasOwnProperty.call(itemHistorico || {}, 'qtd') ? 'qtd' : '');
                    const campoAvaria = Object.prototype.hasOwnProperty.call(itemHistorico || {}, 'quantidadeAvaria')
                        ? 'quantidadeAvaria'
                        : (Object.prototype.hasOwnProperty.call(itemHistorico || {}, 'avaria') ? 'avaria' : '');
                    const devolvidaBruta = campoDevolvida
                        ? lerInteiroNaoNegativoEstrito(itemHistorico[campoDevolvida], true)
                        : { valido: true, valor: 0 };
                    const avariadaBruta = campoAvaria
                        ? lerInteiroNaoNegativoEstrito(itemHistorico[campoAvaria], true)
                        : { valido: true, valor: 0 };
                    if (!devolvidaBruta.valido || !avariadaBruta.valido) {
                        adicionarBloqueio(
                            'HISTORICO_OPERACIONAL_INVALIDO',
                            `O histórico operacional do item “${itemId || pecaId || 'não identificado'}” possui quantidade inválida.`,
                            {
                                itemId,
                                pecaId,
                                campo: !devolvidaBruta.valido ? campoDevolvida : campoAvaria
                            }
                        );
                        return;
                    }
                    const devolvida = devolvidaBruta.valor;
                    const avariada = avariadaBruta.valor;
                    if (itemId) {
                        const atual = historicoContextoPorItem.get(itemId) || { devolvida: 0, avariada: 0 };
                        atual.devolvida += devolvida;
                        atual.avariada += avariada;
                        historicoContextoPorItem.set(itemId, atual);
                    }
                    if (pecaId) {
                        const atualPeca = historicoContextoPorPeca.get(pecaId) || { devolvida: 0, avariada: 0 };
                        atualPeca.devolvida += devolvida;
                        atualPeca.avariada += avariada;
                        historicoContextoPorPeca.set(pecaId, atualPeca);
                    }
                });
            });

        historicoContextoPorPeca.forEach((historico, pecaId) => {
            const persistido = atualPorPeca.get(pecaId) || { devolvida: 0, avariada: 0 };
            if (historico.devolvida > persistido.devolvida || historico.avariada > persistido.avariada) {
                adicionarBloqueio(
                    'HISTORICO_OPERACIONAL_NAO_RECONCILIADO',
                    `O histórico de devoluções da peça “${pecaId}” supera os contadores persistidos na locação.`,
                    { pecaId }
                );
            }
        });
        mapaEditado.forEach((_, itemId) => {
            if (!mapaAtual.has(itemId) && historicoContextoPorItem.has(itemId)) {
                adicionarAviso(
                    'ITEM_ID_HISTORICO_REUTILIZADO_NAO_CONFIRMADO',
                    `O itemId “${itemId}” aparece no histórico, mas não na locação atual. Confira sua origem antes de executar o plano.`,
                    { itemId }
                );
            }
        });

        if (bloqueios.length) return finalizarRetorno();

        const itensResultado = [];
        const todosItemIds = Array.from(new Set([...mapaAtual.keys(), ...mapaEditado.keys()]));

        todosItemIds.forEach((itemId) => {
            const itemAtual = mapaAtual.get(itemId)?.item || null;
            const itemEditado = mapaEditado.get(itemId)?.item || null;
            const pecaIdAtual = textoSeguro(itemAtual?.pecaId, '').trim();
            const pecaIdPretendido = textoSeguro(itemEditado?.pecaId, '').trim();
            const propriaAtual = itemAtual ? obterQuantidadePropriaOperacional(itemAtual) : 0;
            const propriaPretendida = itemEditado ? obterQuantidadePropriaOperacional(itemEditado) : 0;
            const historicoItemContexto = historicoContextoPorItem.get(itemId) || { devolvida: 0, avariada: 0 };
            const devolvida = itemAtual
                ? Math.max(numeroHistorico(itemAtual.devolvidos), historicoItemContexto.devolvida)
                : 0;
            const avariada = itemAtual
                ? Math.max(numeroHistorico(itemAtual.avariadosEstoqueProprio), historicoItemContexto.avariada)
                : 0;
            const realizado = devolvida + avariada;

            if (itemEditado) {
                const valoresHistoricosEsperados = {
                    devolvidos: numeroHistorico(itemAtual?.devolvidos),
                    avariadosEstoqueProprio: numeroHistorico(itemAtual?.avariadosEstoqueProprio),
                    quantidadePendente: Math.max(propriaAtual - realizado, 0),
                    quantidadePropriaPendente: Math.max(propriaAtual - realizado, 0),
                    quantidadeReservada: propriaAtual,
                    quantidadePropriaReservada: propriaAtual
                };
                Object.entries(valoresHistoricosEsperados).forEach(([campo, esperado]) => {
                    if (!Object.prototype.hasOwnProperty.call(itemEditado, campo)) return;
                    const informado = numeroHistorico(itemEditado[campo]);
                    if (informado !== esperado) {
                        adicionarBloqueio(
                            'HISTORICO_OPERACIONAL_IMUTAVEL',
                            `O campo histórico “${campo}” do item “${itemId}” não pode ser alterado pela edição.`,
                            { itemId, pecaId: pecaIdAtual || pecaIdPretendido, campo }
                        );
                    }
                });
            }

            const removido = Boolean(itemAtual && !itemEditado);
            const incluido = Boolean(!itemAtual && itemEditado);
            const trocouPeca = Boolean(itemAtual && itemEditado && pecaIdAtual !== pecaIdPretendido);
            if (itemEditado && propriaPretendida > 0 && !pecaIdPretendido) {
                adicionarBloqueio(
                    'PECA_NAO_INFORMADA',
                    `O item próprio “${itemId}” precisa estar vinculado a uma peça do estoque.`,
                    { itemId, campo: 'pecaId' }
                );
            }
            if (trocouPeca && realizado > 0) {
                adicionarBloqueio(
                    'HISTORICO_OPERACIONAL_IMUTAVEL',
                    `O item “${itemId}” possui devolução ou avaria e não pode trocar de peça.`,
                    { itemId, pecaId: pecaIdAtual, campo: 'pecaId' }
                );
            }
            if (!removido && itemAtual && propriaPretendida < realizado) {
                adicionarBloqueio(
                    'QUANTIDADE_ABAIXO_DO_HISTORICO',
                    `A quantidade própria do item “${itemId}” não pode ser menor que ${realizado}, já devolvida ou avariada.`,
                    { itemId, pecaId: pecaIdAtual, campo: 'quantidadePropria' }
                );
            }

            const composicaoAtual = itemAtual ? obterComposicaoOperacionalItem(itemAtual) : {
                quantidadeTotal: 0,
                quantidadeTerceirizada: 0,
                origemCusto: ''
            };
            const composicaoPretendida = itemEditado ? obterComposicaoOperacionalItem(itemEditado) : {
                quantidadeTotal: 0,
                quantidadeTerceirizada: 0,
                origemCusto: ''
            };
            const pendenteAtual = Math.max(propriaAtual - realizado, 0);
            const pendentePretendida = removido
                ? 0
                : Math.max(propriaPretendida - (trocouPeca ? 0 : realizado), 0);
            const alterado = Boolean(
                incluido || removido || trocouPeca
                || propriaAtual !== propriaPretendida
                || composicaoAtual.quantidadeTotal !== composicaoPretendida.quantidadeTotal
                || composicaoAtual.quantidadeTerceirizada !== composicaoPretendida.quantidadeTerceirizada
                || composicaoAtual.origemCusto !== composicaoPretendida.origemCusto
            );
            const situacao = incluido ? 'incluido' : removido ? 'removido' : alterado ? 'alterado' : 'mantido';

            itensResultado.push({
                itemId,
                situacao,
                pecaIdAtual,
                pecaIdPretendido,
                origemAtual: composicaoAtual.origemCusto,
                origemPretendida: composicaoPretendida.origemCusto,
                quantidades: {
                    comercialAtual: composicaoAtual.quantidadeTotal,
                    comercialPretendida: composicaoPretendida.quantidadeTotal,
                    propriaReservada: propriaAtual,
                    propriaPretendida,
                    terceirizadaAtual: composicaoAtual.quantidadeTerceirizada,
                    terceirizadaPretendida: composicaoPretendida.quantidadeTerceirizada,
                    devolvida,
                    avariada,
                    pendenteAtual,
                    pendentePretendida
                },
                delta: {
                    propria: propriaPretendida - propriaAtual,
                    pendente: pendentePretendida - pendenteAtual,
                    reservar: Math.max(pendentePretendida - pendenteAtual, 0),
                    liberar: Math.max(pendenteAtual - pendentePretendida, 0)
                },
                preservarHistorico: removido && realizado > 0
            });
        });

        retornoBase.itens = itensResultado;
        if (bloqueios.length) return finalizarRetorno();

        const statusReserva = textoSeguro(reservaAtual.status, '');
        const possuiAlteracaoItem = itensResultado.some((item) => item.situacao !== 'mantido');
        if (statusReserva === 'reservado_legado' && (periodoAlterado || possuiAlteracaoItem)) {
            adicionarBloqueio(
                'RESERVA_LEGADA_REQUER_CONFERENCIA',
                'A reserva legada precisa ser reconciliada antes de alterar período ou itens.'
            );
        } else if (statusReserva === 'reservado_legado') {
            adicionarAviso(
                'RESERVA_LEGADA_SEM_ALTERACAO',
                'A locação utiliza reserva legada e não recebeu alterações operacionais.'
            );
        }
        if (statusReserva === 'liberado') {
            adicionarBloqueio(
                'RESERVA_LIBERADA',
                'Uma reserva já liberada não pode receber planejamento de ajuste.'
            );
        }
        if (bloqueios.length) return finalizarRetorno();

        const pendenteAtualPorPeca = new Map();
        const pendentePretendidoPorPeca = new Map();
        const itemIdsAtuaisPorPeca = new Map();
        const itemIdsPretendidosPorPeca = new Map();
        itensResultado.forEach((item) => {
            if (item.pecaIdAtual && item.quantidades.pendenteAtual > 0) {
                pendenteAtualPorPeca.set(
                    item.pecaIdAtual,
                    (pendenteAtualPorPeca.get(item.pecaIdAtual) || 0) + item.quantidades.pendenteAtual
                );
                const ids = itemIdsAtuaisPorPeca.get(item.pecaIdAtual) || [];
                ids.push(item.itemId);
                itemIdsAtuaisPorPeca.set(item.pecaIdAtual, ids);
            }
            if (item.pecaIdPretendido && item.quantidades.pendentePretendida > 0) {
                pendentePretendidoPorPeca.set(
                    item.pecaIdPretendido,
                    (pendentePretendidoPorPeca.get(item.pecaIdPretendido) || 0) + item.quantidades.pendentePretendida
                );
                const ids = itemIdsPretendidosPorPeca.get(item.pecaIdPretendido) || [];
                ids.push(item.itemId);
                itemIdsPretendidosPorPeca.set(item.pecaIdPretendido, ids);
            }
        });

        const pecasIds = Array.from(new Set([
            ...pendenteAtualPorPeca.keys(),
            ...pendentePretendidoPorPeca.keys()
        ])).sort();
        pecasIds.forEach((pecaId) => {
            const atual = pendenteAtualPorPeca.get(pecaId) || 0;
            const pretendido = pendentePretendidoPorPeca.get(pecaId) || 0;
            const itemIds = Array.from(new Set([
                ...(itemIdsAtuaisPorPeca.get(pecaId) || []),
                ...(itemIdsPretendidosPorPeca.get(pecaId) || [])
            ])).sort();
            const delta = pretendido - atual;
            if (delta > 0) {
                retornoBase.ajustes.reservar.push({
                    pecaId,
                    itemIds,
                    quantidade: delta,
                    motivo: atual > 0 ? 'aumento' : 'inclusao',
                    periodo: { ...retornoBase.periodo.pretendido }
                });
            } else if (delta < 0) {
                retornoBase.ajustes.liberar.push({
                    pecaId,
                    itemIds,
                    quantidade: Math.abs(delta),
                    motivo: pretendido > 0 ? 'reducao' : 'remocao'
                });
            }
            if (Math.min(atual, pretendido) > 0) {
                retornoBase.ajustes.manter.push({
                    pecaId,
                    itemIds,
                    quantidadePendente: Math.min(atual, pretendido)
                });
            }
            if (periodoAlterado && pretendido > 0) {
                retornoBase.ajustes.reprogramarPeriodo.push({
                    pecaId,
                    itemIds: (itemIdsPretendidosPorPeca.get(pecaId) || []).slice().sort(),
                    quantidadePendente: pretendido,
                    periodoAtual: { ...retornoBase.periodo.atual },
                    periodoPretendido: { ...retornoBase.periodo.pretendido },
                    motivo: 'mudanca_periodo'
                });
            }
        });

        const precisaValidarDisponibilidade = periodoAlterado
            || retornoBase.ajustes.reservar.length > 0;
        if (precisaValidarDisponibilidade) {
            Array.from(pendentePretendidoPorPeca.keys()).sort().forEach((pecaId) => {
                const solicitado = pendentePretendidoPorPeca.get(pecaId) || 0;
                if (solicitado <= 0) return;
                const peca = pecasPorId.get(pecaId);
                if (!peca) {
                    adicionarBloqueio(
                        'PECA_NAO_ENCONTRADA',
                        `A peça “${pecaId}” não foi encontrada no contexto de estoque.`,
                        { pecaId }
                    );
                    return;
                }
                const consulta = consultarDisponibilidadeItemPeriodo(peca, periodoPretendido, {
                    pecas: pecasContexto,
                    locacoes: locacoesContexto,
                    devolucoes: devolucoesContexto,
                    ignorarLocacaoId: locacaoId
                });
                if (!consulta.valido || solicitado > consulta.disponivel) {
                    const mensagem = consulta.valido
                        ? formatarMensagemDisponibilidadeEstoque({
                            item: textoSeguro(peca?.nome, pecaId),
                            solicitado,
                            consulta
                        })
                        : formatarMensagemDisponibilidadeEstoque({
                            tipo: 'intervalo_invalido',
                            item: textoSeguro(peca?.nome, pecaId),
                            solicitado,
                            consulta
                        });
                    const detalhesOrdenados = (Array.isArray(consulta.conflitos) ? consulta.conflitos : [])
                        .map((conflito) => ({
                            ...conflito,
                            intervalo: conflito?.intervalo ? { ...conflito.intervalo } : conflito?.intervalo,
                            itens: (Array.isArray(conflito?.itens) ? conflito.itens : [])
                                .map((item) => ({ ...item }))
                                .sort((a, b) => (
                                    textoSeguro(a?.item, '').localeCompare(textoSeguro(b?.item, ''), 'pt-BR')
                                    || inteiroLegadoNaoNegativo(a?.quantidade, 0)
                                        - inteiroLegadoNaoNegativo(b?.quantidade, 0)
                                ))
                        }))
                        .sort((a, b) => {
                            const idA = normalizarIdDominio(a?.locacaoId);
                            const idB = normalizarIdDominio(b?.locacaoId);
                            return idA.localeCompare(idB, 'pt-BR')
                                || textoSeguro(a?.intervalo?.inicio, '').localeCompare(textoSeguro(b?.intervalo?.inicio, ''))
                                || textoSeguro(a?.intervalo?.fim, '').localeCompare(textoSeguro(b?.intervalo?.fim, ''))
                                || serializarEstavel(a?.itens).localeCompare(serializarEstavel(b?.itens));
                        });
                    conflitos.push({
                        pecaId,
                        item: textoSeguro(peca?.nome, pecaId),
                        solicitado,
                        disponivel: inteiroLegadoNaoNegativo(consulta.disponivel, 0),
                        periodo: { ...retornoBase.periodo.pretendido },
                        detalhes: detalhesOrdenados
                    });
                    adicionarBloqueio(
                        'ESTOQUE_INSUFICIENTE_PERIODO',
                        mensagem,
                        { pecaId }
                    );
                }
            });
        }

        return finalizarRetorno();
    }

    function normalizarOperacaoIdLocacao(valor) {
        if (typeof valor !== 'string') return '';
        return valor.length <= 160 && /^[a-z0-9][a-z0-9._:-]*$/.test(valor) ? valor : '';
    }

    function normalizarIdentificadorDominio(valor) {
        if (typeof valor !== 'string' && typeof valor !== 'number') return '';
        const identificador = String(valor).trim();
        return identificador.length <= 200 && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(identificador)
            ? identificador
            : '';
    }

    function normalizarReferenciaLocacaoEstrita(valor) {
        if (typeof valor === 'string' && valor.length <= 200
            && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(valor)) {
            return `string:${valor}`;
        }
        if (typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0) {
            return `number:${valor}`;
        }
        return '';
    }

    function validarAssinaturaPlanoLocacao(assinatura) {
        return typeof assinatura === 'string'
            && /^ajuste-reserva-v1:fnv1a64:[a-f0-9]{16}$/.test(assinatura);
    }

    function validarOperacaoIdLocacao(operacaoId) {
        const normalizado = normalizarOperacaoIdLocacao(operacaoId);
        return normalizado
            ? { valido: true, operacaoId: normalizado, motivo: '' }
            : {
                valido: false,
                operacaoId: '',
                motivo: 'O identificador da operação está ausente ou possui formato inválido.'
            };
    }

    function normalizarControleEdicaoLocacao(locacao = {}) {
        const possuiControle = Object.prototype.hasOwnProperty.call(locacao || {}, 'controleEdicao');
        if (!possuiControle) {
            return {
                valido: true,
                estado: 'legado',
                bloqueios: [],
                revisao: 0,
                ultimaOperacaoId: '',
                atualizadoEm: '',
                atualizadoPor: ''
            };
        }

        const controle = locacao?.controleEdicao;
        const controleObjetoValido = controle && typeof controle === 'object' && !Array.isArray(controle);
        const possuiRevisao = controleObjetoValido
            && Object.prototype.hasOwnProperty.call(controle, 'revisao');
        const revisaoValida = possuiRevisao && typeof controle.revisao === 'number'
            && Number.isSafeInteger(controle.revisao) && controle.revisao >= 0;
        const possuiOperacao = controleObjetoValido
            && Object.prototype.hasOwnProperty.call(controle, 'ultimaOperacaoId')
            && controle.ultimaOperacaoId !== '';
        const ultimaOperacaoId = possuiOperacao
            ? normalizarOperacaoIdLocacao(controle.ultimaOperacaoId)
            : '';
        const bloqueios = [];
        if (!controleObjetoValido) bloqueios.push('CONTROLE_EDICAO_INVALIDO');
        else if (!revisaoValida) bloqueios.push('REVISAO_ATUAL_INVALIDA');
        if (possuiOperacao && !ultimaOperacaoId) bloqueios.push('ULTIMA_OPERACAO_ID_INVALIDO');

        return {
            valido: bloqueios.length === 0,
            estado: bloqueios.length === 0 ? 'valido' : 'invalido',
            bloqueios,
            revisao: revisaoValida ? controle.revisao : null,
            ultimaOperacaoId,
            atualizadoEm: controleObjetoValido ? textoSeguro(controle.atualizadoEm, '').trim() : '',
            atualizadoPor: controleObjetoValido ? textoSeguro(controle.atualizadoPor, '').trim() : ''
        };
    }

    function prepararProximaRevisaoLocacao(locacao = {}, metadados = {}) {
        const controleAtual = normalizarControleEdicaoLocacao(locacao);
        const validacaoOperacao = validarOperacaoIdLocacao(metadados.operacaoId);
        const atualizadoEm = textoSeguro(metadados.atualizadoEm, '').trim();
        const atualizadoPor = textoSeguro(metadados.atualizadoPor, '').trim();
        const revisaoEsperadaInformada = Object.prototype.hasOwnProperty.call(metadados, 'revisaoEsperada')
            ? metadados.revisaoEsperada
            : controleAtual.revisao;
        const bloqueios = controleAtual.valido ? [] : [...controleAtual.bloqueios];

        if (!validacaoOperacao.valido) bloqueios.push('OPERACAO_ID_INVALIDO');
        if (!atualizadoEm) bloqueios.push('DATA_ATUALIZACAO_AUSENTE');
        if (!atualizadoPor) bloqueios.push('RESPONSAVEL_ATUALIZACAO_AUSENTE');
        if (!Number.isSafeInteger(revisaoEsperadaInformada) || revisaoEsperadaInformada < 0) {
            bloqueios.push('REVISAO_ESPERADA_INVALIDA');
        } else if (controleAtual.valido && revisaoEsperadaInformada !== controleAtual.revisao) {
            bloqueios.push('REVISAO_DIVERGENTE');
        }
        if (controleAtual.valido && controleAtual.revisao === Number.MAX_SAFE_INTEGER) {
            bloqueios.push('REVISAO_LIMITE_ATINGIDO');
        }

        const revisaoPretendida = controleAtual.valido
            && controleAtual.revisao < Number.MAX_SAFE_INTEGER
            ? controleAtual.revisao + 1
            : null;
        return {
            valido: bloqueios.length === 0,
            bloqueios,
            estadoControle: controleAtual.estado,
            revisaoAtual: controleAtual.revisao,
            revisaoPretendida,
            controleEdicao: revisaoPretendida === null ? null : {
                revisao: revisaoPretendida,
                ultimaOperacaoId: validacaoOperacao.operacaoId,
                atualizadoEm,
                atualizadoPor
            }
        };
    }

    function normalizarJsonPersistivelEstrito(valor, caminho = '$', ancestrais = new WeakSet()) {
        if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return valor;
        if (typeof valor === 'number') {
            if (!Number.isFinite(valor) || Object.is(valor, -0)) {
                throw Object.assign(new TypeError(`Valor numérico não persistível em ${caminho}.`), {
                    codigo: 'VALOR_NAO_PERSISTIVEL',
                    caminho
                });
            }
            return valor;
        }
        if (typeof valor === 'undefined' || typeof valor === 'bigint'
            || typeof valor === 'function' || typeof valor === 'symbol') {
            throw Object.assign(new TypeError(`Valor não persistível em ${caminho}.`), {
                codigo: 'VALOR_NAO_PERSISTIVEL',
                caminho
            });
        }
        if (typeof valor !== 'object') {
            throw Object.assign(new TypeError(`Tipo não persistível em ${caminho}.`), {
                codigo: 'VALOR_NAO_PERSISTIVEL',
                caminho
            });
        }
        if (ancestrais.has(valor)) {
            throw Object.assign(new TypeError(`Referência cíclica detectada em ${caminho}.`), {
                codigo: 'REFERENCIA_CICLICA',
                caminho
            });
        }

        const prototipo = Object.getPrototypeOf(valor);
        if (!Array.isArray(valor) && prototipo !== Object.prototype && prototipo !== null) {
            throw Object.assign(new TypeError(`Objeto não compatível com JSON em ${caminho}.`), {
                codigo: 'OBJETO_NAO_PERSISTIVEL',
                caminho
            });
        }
        if (Object.getOwnPropertySymbols(valor).length > 0) {
            throw Object.assign(new TypeError(`Propriedade Symbol não persistível em ${caminho}.`), {
                codigo: 'VALOR_NAO_PERSISTIVEL',
                caminho
            });
        }

        ancestrais.add(valor);
        try {
            if (Array.isArray(valor)) {
                const chavesExtras = Object.keys(valor).filter((chave) => !/^\d+$/.test(chave));
                if (chavesExtras.length > 0) {
                    throw Object.assign(new TypeError(`Array com propriedades extras em ${caminho}.`), {
                        codigo: 'VALOR_NAO_PERSISTIVEL',
                        caminho
                    });
                }
                for (let indice = 0; indice < valor.length; indice += 1) {
                    if (!Object.prototype.hasOwnProperty.call(valor, indice)) {
                        throw Object.assign(new TypeError(`Posição vazia não persistível em ${caminho}[${indice}].`), {
                            codigo: 'VALOR_NAO_PERSISTIVEL',
                            caminho: `${caminho}[${indice}]`
                        });
                    }
                }
                return valor.map((item, indice) => {
                    return normalizarJsonPersistivelEstrito(item, `${caminho}[${indice}]`, ancestrais);
                });
            }

            const copia = Object.create(null);
            Reflect.ownKeys(valor).forEach((chave) => {
                if (typeof chave === 'symbol') return;
                const descritor = Object.getOwnPropertyDescriptor(valor, chave);
                if (!descritor?.enumerable || descritor.get || descritor.set) {
                    throw Object.assign(new TypeError(`Propriedade não serializável em ${caminho}.${chave}.`), {
                        codigo: 'VALOR_NAO_PERSISTIVEL',
                        caminho: `${caminho}.${chave}`
                    });
                }
                copia[chave] = normalizarJsonPersistivelEstrito(valor[chave], `${caminho}.${chave}`, ancestrais);
            });
            return copia;
        } finally {
            ancestrais.delete(valor);
        }
    }

    function clonarJsonPersistivelEstrito(valor) {
        try {
            const normalizado = normalizarJsonPersistivelEstrito(valor);
            const json = JSON.stringify(normalizado);
            return {
                ok: true,
                codigo: 'SUCESSO',
                valor: JSON.parse(json),
                json,
                erro: null
            };
        } catch (erro) {
            return {
                ok: false,
                codigo: textoSeguro(erro?.codigo, 'FALHA_SERIALIZACAO'),
                valor: null,
                json: '',
                erro: {
                    mensagem: textoSeguro(erro?.message, 'Falha ao preparar dados persistíveis.'),
                    caminho: textoSeguro(erro?.caminho, '$')
                }
            };
        }
    }

    function serializarCanonicoAssinatura(valor) {
        if (valor === null || typeof valor === 'boolean' || typeof valor === 'string') return JSON.stringify(valor);
        if (typeof valor === 'number') {
            if (!Number.isFinite(valor)) throw new TypeError('Número inválido no payload da assinatura.');
            return JSON.stringify(valor);
        }
        if (Array.isArray(valor)) return `[${valor.map(serializarCanonicoAssinatura).join(',')}]`;
        if (!valor || typeof valor !== 'object') throw new TypeError('Valor inválido no payload da assinatura.');
        return `{${Object.keys(valor).sort().map((chave) => (
            `${JSON.stringify(chave)}:${serializarCanonicoAssinatura(valor[chave])}`
        )).join(',')}}`;
    }

    function ordenarColecaoCanonica(lista = []) {
        return lista.map((item) => ({ item, chave: serializarCanonicoAssinatura(item) }))
            .sort((a, b) => a.chave.localeCompare(b.chave))
            .map((registro) => registro.item);
    }

    function normalizarInteiroAssinatura(valor, campo) {
        const numero = Number(valor);
        if (!Number.isSafeInteger(numero) || numero < 0) {
            throw new TypeError(`Quantidade inválida para assinatura em ${campo}.`);
        }
        return numero;
    }

    function normalizarItemIdsAssinatura(itemIds = []) {
        if (!Array.isArray(itemIds)) throw new TypeError('Lista de itemIds inválida para assinatura.');
        return itemIds.map((itemId) => {
            const normalizado = normalizarIdentificadorDominio(itemId);
            if (!normalizado) throw new TypeError('itemId inválido para assinatura.');
            return normalizado;
        }).sort((a, b) => a.localeCompare(b));
    }

    function gerarFingerprintFnv1a64(texto) {
        let hash = 0xcbf29ce484222325n;
        const primo = 0x100000001b3n;
        const mascara = 0xffffffffffffffffn;
        const bytes = typeof TextEncoder === 'function'
            ? new TextEncoder().encode(texto)
            : Array.from(unescape(encodeURIComponent(texto)), (caractere) => caractere.charCodeAt(0));
        bytes.forEach((byte) => {
            hash ^= BigInt(byte);
            hash = (hash * primo) & mascara;
        });
        return hash.toString(16).padStart(16, '0');
    }

    function gerarAssinaturaPlanoAjusteLocacao(plano = {}, opcoes = {}) {
        if (plano?.valido !== true || (Array.isArray(plano?.bloqueios) && plano.bloqueios.length > 0)) {
            return {
                ok: false,
                executavel: false,
                codigo: 'PLANO_INVALIDO',
                assinatura: '',
                algoritmo: 'fnv1a64',
                payloadCanonico: null
            };
        }
        const locacaoId = normalizarIdentificadorDominio(plano?.referencia?.locacaoId);
        const revisaoEsperada = Number(opcoes.revisaoEsperada);
        if (!locacaoId || !Number.isSafeInteger(revisaoEsperada) || revisaoEsperada < 0) {
            return {
                ok: false,
                executavel: false,
                codigo: !locacaoId ? 'LOCACAO_ID_INVALIDO' : 'REVISAO_ESPERADA_INVALIDA',
                assinatura: '',
                algoritmo: 'fnv1a64',
                payloadCanonico: null
            };
        }

        try {
            const normalizarPeriodo = (periodo = {}) => ({
                inicio: textoSeguro(periodo?.inicio, '').trim(),
                fim: textoSeguro(periodo?.fim, '').trim()
            });
            const normalizarAjuste = (ajuste = {}, tipo = '') => ({
                tipo,
                pecaId: normalizarIdentificadorDominio(ajuste?.pecaId),
                itemIds: normalizarItemIdsAssinatura(ajuste?.itemIds),
                quantidade: normalizarInteiroAssinatura(
                    ajuste?.quantidade ?? ajuste?.quantidadePendente ?? 0,
                    `ajustes.${tipo}.quantidade`
                ),
                periodo: tipo === 'reprogramarPeriodo'
                    ? {
                        atual: normalizarPeriodo(ajuste?.periodoAtual),
                        pretendido: normalizarPeriodo(ajuste?.periodoPretendido)
                    }
                    : (ajuste?.periodo ? normalizarPeriodo(ajuste.periodo) : null)
            });
            const itens = (Array.isArray(plano?.itens) ? plano.itens : []).map((item) => ({
                itemId: normalizarIdentificadorDominio(item?.itemId),
                pecaIdAtual: normalizarIdentificadorDominio(item?.pecaIdAtual),
                pecaIdPretendido: normalizarIdentificadorDominio(item?.pecaIdPretendido),
                origemAtual: textoSeguro(item?.origemAtual, '').trim().toLowerCase(),
                origemPretendida: textoSeguro(item?.origemPretendida, '').trim().toLowerCase(),
                quantidades: {
                    propriaReservada: normalizarInteiroAssinatura(item?.quantidades?.propriaReservada, 'item.propriaReservada'),
                    propriaPretendida: normalizarInteiroAssinatura(item?.quantidades?.propriaPretendida, 'item.propriaPretendida'),
                    terceirizadaAtual: normalizarInteiroAssinatura(item?.quantidades?.terceirizadaAtual, 'item.terceirizadaAtual'),
                    terceirizadaPretendida: normalizarInteiroAssinatura(item?.quantidades?.terceirizadaPretendida, 'item.terceirizadaPretendida'),
                    pendenteAtual: normalizarInteiroAssinatura(item?.quantidades?.pendenteAtual, 'item.pendenteAtual'),
                    pendentePretendida: normalizarInteiroAssinatura(item?.quantidades?.pendentePretendida, 'item.pendentePretendida')
                }
            }));
            if (itens.some((item) => !item.itemId)) throw new TypeError('itemId inválido para assinatura.');

            const ajustes = {};
            ['reservar', 'liberar', 'manter', 'reprogramarPeriodo'].forEach((tipo) => {
                const lista = Array.isArray(plano?.ajustes?.[tipo]) ? plano.ajustes[tipo] : [];
                ajustes[tipo] = ordenarColecaoCanonica(lista.map((ajuste) => normalizarAjuste(ajuste, tipo)));
                if (ajustes[tipo].some((ajuste) => !ajuste.pecaId)) {
                    throw new TypeError(`pecaId inválido em ajustes.${tipo}.`);
                }
            });
            const payloadCanonico = {
                versao: 1,
                locacaoId,
                revisaoEsperada,
                referencia: {
                    statusReserva: textoSeguro(plano?.referencia?.statusReserva, '').trim().toLowerCase(),
                    snapshotVersao: normalizarInteiroAssinatura(
                        plano?.referencia?.snapshotVersao,
                        'referencia.snapshotVersao'
                    )
                },
                periodo: {
                    atual: normalizarPeriodo(plano?.periodo?.atual),
                    pretendido: normalizarPeriodo(plano?.periodo?.pretendido)
                },
                itens: ordenarColecaoCanonica(itens),
                ajustes
            };
            const canonico = serializarCanonicoAssinatura(payloadCanonico);
            return {
                ok: true,
                executavel: true,
                codigo: 'SUCESSO',
                assinatura: `ajuste-reserva-v1:fnv1a64:${gerarFingerprintFnv1a64(canonico)}`,
                algoritmo: 'fnv1a64',
                payloadCanonico
            };
        } catch (erro) {
            return {
                ok: false,
                executavel: false,
                codigo: 'PLANO_NAO_ASSINAVEL',
                assinatura: '',
                algoritmo: 'fnv1a64',
                payloadCanonico: null,
                erro: textoSeguro(erro?.message, 'Falha ao gerar assinatura do plano.')
            };
        }
    }

    function verificarEstadoOperacaoLocacao(entrada = {}) {
        const validacaoOperacao = validarOperacaoIdLocacao(entrada.operacaoId);
        const assinaturaPlano = textoSeguro(entrada.assinaturaPlano, '').trim();
        const locacaoIdOriginal = entrada?.locacao?.id ?? entrada?.locacao?.locacaoId;
        const locacaoIdEsperado = normalizarReferenciaLocacaoEstrita(locacaoIdOriginal);
        if (!validacaoOperacao.valido || !assinaturaPlano || !locacaoIdEsperado) {
            return {
                valido: false,
                estado: 'inconsistente',
                codigo: !validacaoOperacao.valido
                    ? 'OPERACAO_ID_INVALIDO'
                    : (!assinaturaPlano ? 'ASSINATURA_AUSENTE' : 'LOCACAO_ID_INVALIDO'),
                evidencias: { controle: 0, movimentacoes: 0, historicos: 0 }
            };
        }

        const operacaoId = validacaoOperacao.operacaoId;
        const controle = normalizarControleEdicaoLocacao(entrada.locacao);
        if (!controle.valido) {
            return {
                valido: false,
                estado: 'inconsistente',
                codigo: 'CONTROLE_EDICAO_INVALIDO',
                evidencias: { controle: 0, movimentacoes: 0, historicos: 0 }
            };
        }
        const movimentosOperacao = (Array.isArray(entrada.movimentacoes) ? entrada.movimentacoes : [])
            .filter((registro) => normalizarOperacaoIdLocacao(registro?.operacaoId) === operacaoId);
        const historicosOperacao = (Array.isArray(entrada.historicoOperacional) ? entrada.historicoOperacional : [])
            .filter((registro) => normalizarOperacaoIdLocacao(registro?.operacaoId) === operacaoId);
        const evidenciasOperacao = [...movimentosOperacao, ...historicosOperacao];
        const evidenciaSemLocacao = evidenciasOperacao.some((registro) => (
            !normalizarReferenciaLocacaoEstrita(registro?.locacaoId)
        ));
        const evidenciaOutraLocacao = evidenciasOperacao.some((registro) => {
            const referencia = normalizarReferenciaLocacaoEstrita(registro?.locacaoId);
            return referencia && referencia !== locacaoIdEsperado;
        });
        if (evidenciaOutraLocacao || evidenciaSemLocacao) {
            return {
                valido: false,
                estado: 'inconsistente',
                codigo: evidenciaOutraLocacao
                    ? 'OPERACAO_ID_ASSOCIADO_A_OUTRA_LOCACAO'
                    : 'EVIDENCIA_SEM_LOCACAO_ID',
                evidencias: {
                    controle: controle.ultimaOperacaoId === operacaoId ? 1 : 0,
                    movimentacoes: movimentosOperacao.length,
                    historicos: historicosOperacao.length
                }
            };
        }
        const movimentos = movimentosOperacao.filter((registro) => (
            normalizarReferenciaLocacaoEstrita(registro.locacaoId) === locacaoIdEsperado
        ));
        const historicos = historicosOperacao.filter((registro) => (
            normalizarReferenciaLocacaoEstrita(registro.locacaoId) === locacaoIdEsperado
        ));
        const controlePresente = controle.ultimaOperacaoId === operacaoId;
        const esperadoMovimentacoes = (Array.isArray(entrada?.plano?.ajustes?.reservar)
            ? entrada.plano.ajustes.reservar.length : 0)
            + (Array.isArray(entrada?.plano?.ajustes?.liberar) ? entrada.plano.ajustes.liberar.length : 0);
        const esperadoHistoricos = 1;
        const assinaturasEncontradas = [
            ...movimentos.map((registro) => textoSeguro(registro?.assinaturaPlano, '').trim()),
            ...historicos.map((registro) => textoSeguro(registro?.assinaturaPlano, '').trim())
        ].filter(Boolean);
        const assinaturaDivergente = assinaturasEncontradas.some((assinatura) => assinatura !== assinaturaPlano);
        const chavesMovimento = movimentos.map((registro) => textoSeguro(
            registro?.chaveIdempotencia || registro?.id || registro?.movimentacaoId,
            ''
        ).trim()).filter(Boolean);
        const movimentoSemChave = movimentos.length > chavesMovimento.length;
        const movimentosDuplicados = new Set(chavesMovimento).size !== chavesMovimento.length;
        const excessoRegistros = movimentos.length > esperadoMovimentacoes || historicos.length > esperadoHistoricos;
        const possuiVestigio = controlePresente || movimentos.length > 0 || historicos.length > 0;

        if (!possuiVestigio) {
            return {
                valido: true,
                estado: 'nao_executada',
                codigo: 'OPERACAO_NAO_EXECUTADA',
                evidencias: { controle: 0, movimentacoes: 0, historicos: 0 },
                esperado: { movimentacoes: esperadoMovimentacoes, historicos: esperadoHistoricos }
            };
        }
        if (assinaturaDivergente || movimentoSemChave || movimentosDuplicados || excessoRegistros) {
            return {
                valido: false,
                estado: 'inconsistente',
                codigo: assinaturaDivergente
                    ? 'ASSINATURA_DIVERGENTE'
                    : (movimentoSemChave
                        ? 'MOVIMENTACAO_SEM_CHAVE_IDEMPOTENTE'
                        : (movimentosDuplicados ? 'REGISTRO_DUPLICADO_INCOMPATIVEL' : 'REGISTROS_EXCEDENTES')),
                evidencias: {
                    controle: controlePresente ? 1 : 0,
                    movimentacoes: movimentos.length,
                    historicos: historicos.length
                },
                esperado: { movimentacoes: esperadoMovimentacoes, historicos: esperadoHistoricos }
            };
        }

        const completa = controlePresente
            && movimentos.length === esperadoMovimentacoes
            && historicos.length === esperadoHistoricos
            && assinaturasEncontradas.length === movimentos.length + historicos.length;
        return {
            valido: completa,
            estado: completa ? 'concluida' : 'parcial',
            codigo: completa ? 'OPERACAO_CONCLUIDA' : 'OPERACAO_PARCIAL',
            evidencias: {
                controle: controlePresente ? 1 : 0,
                movimentacoes: movimentos.length,
                historicos: historicos.length
            },
            esperado: { movimentacoes: esperadoMovimentacoes, historicos: esperadoHistoricos }
        };
    }

    function prepararRegistroOperacaoConcluida(entrada = {}) {
        const revisao = prepararProximaRevisaoLocacao(entrada.locacao, {
            operacaoId: entrada.operacaoId,
            revisaoEsperada: entrada.revisaoEsperada,
            atualizadoEm: entrada.atualizadoEm,
            atualizadoPor: entrada.atualizadoPor
        });
        const assinaturaPlano = textoSeguro(entrada.assinaturaPlano, '').trim();
        const locacaoId = entrada?.locacao?.id ?? entrada?.locacao?.locacaoId;
        const locacaoIdValido = normalizarReferenciaLocacaoEstrita(locacaoId);
        if (!revisao.valido || !assinaturaPlano || !locacaoIdValido) {
            return {
                valido: false,
                bloqueios: [
                    ...revisao.bloqueios,
                    ...(!assinaturaPlano ? ['ASSINATURA_AUSENTE'] : []),
                    ...(!locacaoIdValido ? ['LOCACAO_ID_INVALIDO'] : [])
                ],
                controleEdicao: null,
                registroHistorico: null
            };
        }
        return {
            valido: true,
            bloqueios: [],
            controleEdicao: revisao.controleEdicao,
            registroHistorico: {
                locacaoId,
                operacaoId: revisao.controleEdicao.ultimaOperacaoId,
                assinaturaPlano,
                revisaoAnterior: revisao.revisaoAtual,
                revisaoNova: revisao.revisaoPretendida,
                data: revisao.controleEdicao.atualizadoEm,
                usuario: revisao.controleEdicao.atualizadoPor,
                acao: 'ajuste_reserva_locacao'
            }
        };
    }

    const CHAVES_CHECKPOINT_OPERACIONAL_LOCACAO = [
        'locacoes',
        'pecas',
        'movimentacoesEstoque',
        'devolucoes',
        'logsAuditoria'
    ];

    function criarCheckpointOperacionalEdicaoLocacao(estado = {}, metadados = {}) {
        const validacaoOperacao = validarOperacaoIdLocacao(metadados.operacaoId);
        const assinaturaPlano = textoSeguro(metadados.assinaturaPlano, '').trim();
        const criadoEm = textoSeguro(metadados.criadoEm, '').trim();
        const criadoEmValido = criadoEm && Number.isFinite(Date.parse(criadoEm));
        if (!validacaoOperacao.valido || !validarAssinaturaPlanoLocacao(assinaturaPlano)
            || !criadoEmValido) {
            return {
                ok: false,
                codigo: 'METADADOS_CHECKPOINT_INVALIDOS',
                checkpoint: null
            };
        }
        const conteudo = {};
        CHAVES_CHECKPOINT_OPERACIONAL_LOCACAO.forEach((chave) => {
            conteudo[chave] = estado?.[chave];
        });
        const clonagem = clonarJsonPersistivelEstrito(conteudo);
        if (!clonagem.ok) {
            return { ok: false, codigo: clonagem.codigo, checkpoint: null, erro: clonagem.erro };
        }
        return {
            ok: true,
            codigo: 'SUCESSO',
            checkpoint: {
                tipo: 'checkpoint_operacional_edicao_locacao',
                versao: 1,
                completoParaPersistencia: false,
                operacaoId: validacaoOperacao.operacaoId,
                assinaturaPlano,
                criadoEm,
                estado: clonagem.valor
            }
        };
    }

    function restaurarCheckpointOperacionalEdicaoLocacao(checkpoint = {}) {
        const clonagemCheckpoint = clonarJsonPersistivelEstrito(checkpoint);
        if (!clonagemCheckpoint.ok) {
            return {
                ok: false,
                codigo: clonagemCheckpoint.codigo,
                estado: null,
                erro: clonagemCheckpoint.erro
            };
        }
        const checkpointPersistivel = clonagemCheckpoint.valor;
        if (checkpointPersistivel?.tipo !== 'checkpoint_operacional_edicao_locacao'
            || checkpointPersistivel?.versao !== 1
            || checkpointPersistivel?.completoParaPersistencia !== false
            || !validarOperacaoIdLocacao(checkpointPersistivel?.operacaoId).valido
            || !validarAssinaturaPlanoLocacao(checkpointPersistivel?.assinaturaPlano)
            || typeof checkpointPersistivel?.criadoEm !== 'string'
            || !checkpointPersistivel.criadoEm
            || !Number.isFinite(Date.parse(checkpointPersistivel.criadoEm))
            || !checkpointPersistivel?.estado
            || typeof checkpointPersistivel.estado !== 'object'
            || Array.isArray(checkpointPersistivel.estado)
            || CHAVES_CHECKPOINT_OPERACIONAL_LOCACAO.some((chave) => (
                !Object.prototype.hasOwnProperty.call(checkpointPersistivel.estado, chave)
                || !Array.isArray(checkpointPersistivel.estado[chave])
            ))) {
            return {
                ok: false,
                codigo: 'CHECKPOINT_OPERACIONAL_INVALIDO',
                estado: null
            };
        }
        return { ok: true, codigo: 'SUCESSO', estado: checkpointPersistivel.estado };
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
            items: atribuirItemIdsLocacao(locacao.id, locacao.items),
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
        const itemId = textoSeguro(
            item?.itemId || item?.id || item?.codigo || item?.pecaId || `item-${indice + 1}`,
            `item-${indice + 1}`
        );
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
        atualizarSnapshotReservaLocacao(locacao, {
            origem: 'reserva_explicita',
            capturadoEm: dataHora,
            statusReserva: 'reservado'
        });

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
    window.criarItemIdLocacao = criarItemIdLocacao;
    window.atribuirItemIdsLocacao = atribuirItemIdsLocacao;
    window.criarSnapshotReservaLocacao = criarSnapshotReservaLocacao;
    window.atualizarSnapshotReservaLocacao = atualizarSnapshotReservaLocacao;
    window.obterQuantidadePendenteDevolucaoItem = obterQuantidadePendenteDevolucaoItem;
    window.locacaoTemPendenciaDevolucaoInterna = locacaoTemPendenciaDevolucaoInterna;
    window.obterComposicaoOperacionalItem = obterComposicaoOperacionalItem;
    window.classificarStatusReservaLegadoLocacao = classificarStatusReservaLegadoLocacao;
    window.normalizarEstoqueReservaLocacao = normalizarEstoqueReservaLocacao;
    window.locacaoComprometeEstoque = locacaoComprometeEstoque;
    window.locacaoComprometeDisponibilidadePrevista = locacaoComprometeDisponibilidadePrevista;
    window.obterEstoqueFisicoUtilizavelPeriodo = obterEstoqueFisicoUtilizavelPeriodo;
    window.consultarDisponibilidadeItemPeriodo = consultarDisponibilidadeItemPeriodo;
    window.planejarAjusteReservaLocacao = planejarAjusteReservaLocacao;
    window.validarOperacaoIdLocacao = validarOperacaoIdLocacao;
    window.normalizarControleEdicaoLocacao = normalizarControleEdicaoLocacao;
    window.prepararProximaRevisaoLocacao = prepararProximaRevisaoLocacao;
    window.clonarJsonPersistivelEstrito = clonarJsonPersistivelEstrito;
    window.gerarAssinaturaPlanoAjusteLocacao = gerarAssinaturaPlanoAjusteLocacao;
    window.verificarEstadoOperacaoLocacao = verificarEstadoOperacaoLocacao;
    window.prepararRegistroOperacaoConcluida = prepararRegistroOperacaoConcluida;
    window.criarCheckpointOperacionalEdicaoLocacao = criarCheckpointOperacionalEdicaoLocacao;
    window.restaurarCheckpointOperacionalEdicaoLocacao = restaurarCheckpointOperacionalEdicaoLocacao;
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
