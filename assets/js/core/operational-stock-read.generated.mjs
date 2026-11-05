// GERADO por AST, somente declaracoes compartilhadas. Nao carregado pelo index.
export const manifesto = Object.freeze({
  "STATUS_ESTOQUE_VALIDOS": "26ffd11c1656d6be837754743db5f4d6ebd17223aa5921a446d28dfd52486ff0",
  "STATUS_FLUXO_VALIDOS": "57fb218d78d44fe9297d577dc504ef43c618973b1c827ca6e9061f8b7b86bed3",
  "STATUS_RESERVA_ESTOQUE_VALIDOS": "3ffe1dc25989a968e5f74adfc5482093653b9326d054c5a670fc93d5ee90bf8e",
  "normalizarValorMonetarioLegado": "5b270eea00f04d4d55a0e64cc36ebdce0904d673b7fb50bff455bc2815fe7fb4",
  "numeroSeguro": "72697e3890c8c70ab587a516cf8c76e5dc2610dfb584ca39a6cbf914291112e7",
  "inteiroNaoNegativo": "696ea6831b7c16b52e61fe115fb51ef047693e785e3bfe44129b92e17ad7a8d1",
  "inteiroLegadoNaoNegativo": "2832c5fbaa0fbc562b24c5f7ac2995536409d8cd2b82b00a65e87c53a4110bf8",
  "normalizarDataPeriodoEstoque": "5aa8583a5f3d582f96a368044f263c360612714cc5ff7d91778d71fd6ceb3699",
  "normalizarIntervaloPeriodoEstoque": "cd66575c1493c38d764ee8d980057b67af1aefdb71641e858ff764d19919c5ec",
  "obterIntervaloOperacionalLocacao": "70d1a67835a4f631d3a0ff6b4e295609e7e7f9bc841d43cef9a890c35c602678",
  "intervalosEstoqueSobrepostos": "8f4b9ca4e0fb50ed0c020ec0393f614b0833ee53cb28f5c26737d032788c20ff",
  "obterQuantidadePropriaOperacional": "80ee07cd8f1c9d0cf35942fca1926fc849544e5ebfea6e6f7fb4d08e44924750",
  "obterQuantidadePropriaPendenteItem": "862d8e4557ee7778a70fbc93a451366b28308f58e43738080a4a02b32ce558c7",
  "normalizarItemIdLocacaoValido": "641f7b8a2f8d44b8ac90b32762ee88070088ef5a57f1c6049a6741d23c21b05f",
  "criarItemIdLocacao": "bfb3166e7d0ab6788ac50af53ada6116971d92ea26e19c464c2e458edc80afe2",
  "atribuirItemIdsLocacao": "e2ce92060babb20f84cd736338d8b8df9cf13793f61e364c9eb89cc061c065f6",
  "criarSnapshotReservaLocacao": "614a87f915a997fa31526bc1a04f072260dd1942a796c3df99ada51a725f9586",
  "textoSeguro": "4b6694a7a78195f7f2d8f90711ad74f230f641373a99fd67daa24b2b4bfcb491",
  "valorEmConjunto": "611d28cbac2c5150c58c6ffbc7fc554095b004188c3b9b8940b02370415094f5",
  "clonarObjetoSeguro": "11b507e3214f27e5ecc271c889c4d27ebeba89b1e4491abfe0cae4fcbc45c07c",
  "clonarArraySeguro": "d0fc349edb05c95bc4f350ebf0eec51a91be6b7a37721fe29f3dae63eae15894",
  "inferirStatusFluxoLocacao": "e2089aaf1e21491049d2ff4aa71beb53406b4c2dc720548b8e4c17a71c7fd9c8",
  "possuiDevolucaoTotalComprovadaLocacao": "69eefd4f1a92f1361f061047a4d3f3d0110a9101a1b5ba11d51264a261ad9a8f",
  "classificarStatusReservaLegadoLocacao": "1d9160846a630c2cd2daafccd864678f463a6b74729eef8d50547ef4b96fd90e",
  "normalizarEstoqueReservaLocacao": "770dcbbbd640248db4de0f41d34f4725d720a3521bde25f1234a116cf222cbf1",
  "normalizarEstoqueReservaComRegistrosLocacao": "bbebc112bf948bcd8f0c4d564e0ebea15ce5171c1f22b14b3aab68ed0fbb06cc",
  "locacaoComprometeEstoque": "50e8871ff0e43d4a28659ffa440ed2b481a5141d02bc4596bbd99d5344e79831",
  "locacaoComprometeDisponibilidadePrevista": "36770297973f5f1912800d3166658dd25e362b9f55a9c8e60dd88f2b6a0c9eb5",
  "obterEstoqueFisicoUtilizavelPeriodo": "883617a1a6772fcad82ae424e75c65c14c1621395571e66bc2d3cd1d2817e1b0",
  "consultarDisponibilidadeItemPeriodo": "670fe08868b85e0cb3a2947d97bdb93bbcfcd3eaa18207abc1b08020e4dbe734",
  "normalizarPecaDominio": "062554f821b62ba733ec1b6d30f65a387f2c057458588fdcb6b3dc89b7019941",
  "pecaAceitaNovoUso": "35c9c1136a85b607b214303ce8c8324b176a49c89e634c7107a7bc4cbac3728f"
});
export function criarNucleoConfiavel(contexto = {}) {
const pecas = contexto.pecas;
const locacoes = contexto.locacoes;
const devolucoes = contexto.devolucoes;
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

function inferirStatusFluxoLocacao(locacao = {}) {
        const statusFluxo = valorEmConjunto(locacao.statusFluxo, STATUS_FLUXO_VALIDOS, '');
        if (statusFluxo) return statusFluxo;

        const status = String(locacao.status || '').trim().toLowerCase();
        if (status === 'devolvido') return 'devolvido';
        if (status === 'cancelado') return 'cancelado';
        return 'aprovado';
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
        const registros = Array.isArray(registrosDevolucao)
            ? registrosDevolucao
            : (typeof devolucoes !== 'undefined' && Array.isArray(devolucoes) ? devolucoes : []);
        return normalizarEstoqueReservaComRegistrosLocacao(locacao, registros);
    }

function normalizarEstoqueReservaComRegistrosLocacao(locacao = {}, registrosDisponiveis = []) {
        const reservaAtual = clonarObjetoSeguro(locacao.estoqueReserva);
        const statusAtual = valorEmConjunto(
            reservaAtual.status,
            STATUS_RESERVA_ESTOQUE_VALIDOS,
            ''
        );
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

        if (!peca || !pecaAceitaNovoUso(peca) || !intervalo.completo) {
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
                motivo: !peca ? 'item_nao_encontrado' : !pecaAceitaNovoUso(peca) ? 'peca_inativa' : 'intervalo_incompleto'
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

function pecaAceitaNovoUso(peca) {
        return !!peca && textoSeguro(peca.status, '').trim().toLowerCase() !== 'inativo';
    }
return Object.freeze({consultarDisponibilidadeItemPeriodo,criarSnapshotReservaLocacao,obterQuantidadePropriaOperacional,obterQuantidadePropriaPendenteItem});
}
