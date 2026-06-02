// Propostas: modulo comercial com CRUD, PDF e conversao para locacao.
(function () {
    const CHAVE_FILTRO_PROPOSTAS = 'mtz:propostasFiltro';
    const FILTROS_PROPOSTA = new Set([
        'todos',
        'rascunho',
        'enviada',
        'em_negociacao',
        'aprovada',
        'cancelada',
        'recusada',
        'convertida'
    ]);

    const STATUS_LABELS = {
        rascunho: 'Rascunho',
        enviada: 'Enviada',
        em_negociacao: 'Em negociacao',
        aprovada: 'Aprovada',
        cancelada: 'Cancelada',
        recusada: 'Recusada',
        convertida: 'Convertida'
    };

    const FORMA_PAGAMENTO_LABELS = {
        pix: 'PIX',
        boleto: 'Boleto',
        transferencia: 'Transferencia',
        cartao: 'Cartao',
        dinheiro: 'Dinheiro',
        outro: 'Outro'
    };

    const TEXTO_PADRAO_OBS_PAGAMENTO = '50% na aprovacao e 50% na montagem/desmontagem, conforme alinhamento comercial.';
    const TEXTO_PADRAO_INCLUSO = 'Montagem, desmontagem e estrutura conforme descrito nos itens da proposta.';
    const TEXTO_PADRAO_NAO_INCLUSO = 'Nao estao inclusos itens nao descritos na proposta, ART/laudo tecnico, gerador, eletrica, seguranca, taxas publicas, alimentacao, hospedagem, custos de estacionamento, liberacoes junto ao local e alteracoes apos aprovacao, salvo quando especificado.';

    let filtroPropostasAtual = 'todos';
    let listenersRegistrados = false;
    let bloqueioSincronizacaoValidade = false;

    function textoSeguro(valor, fallback = '') {
        if (valor == null) return fallback;
        return String(valor).trim();
    }

    function numeroSeguro(valor, fallback = 0) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return Number(fallback) || 0;
        return numero;
    }

    function numeroNaoNegativo(valor, fallback = 0) {
        return Math.max(0, numeroSeguro(valor, fallback));
    }

    function inteiroNaoNegativo(valor, fallback = 0) {
        return Math.max(0, Math.trunc(numeroNaoNegativo(valor, fallback)));
    }

    function normalizarTextoBusca(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function formatarMoeda(valor) {
        return (Number(valor) || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }

    function formatarPercentual(valor) {
        const numero = Number(valor) || 0;
        return `${numero.toLocaleString('pt-BR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}%`;
    }

    function formatarData(valor) {
        if (!valor) return '-';
        const texto = String(valor).trim();
        const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) return `${match[3]}/${match[2]}/${match[1]}`;
        const data = new Date(texto);
        if (Number.isNaN(data.getTime())) return texto;
        return data.toLocaleDateString('pt-BR');
    }

    function sanitizar(valor) {
        if (typeof sanitizarTexto === 'function') return sanitizarTexto(valor);
        const div = document.createElement('div');
        div.textContent = valor == null ? '' : String(valor);
        return div.innerHTML;
    }

    function normalizarStatusProposta(status) {
        const bruto = normalizarTextoBusca(status);
        const aliases = {
            'em negociacao': 'em_negociacao',
            'convertida em locacao': 'convertida',
            convertida_em_locacao: 'convertida'
        };
        const normalizado = aliases[bruto] || bruto;
        return FILTROS_PROPOSTA.has(normalizado) && normalizado !== 'todos'
            ? normalizado
            : 'rascunho';
    }

    function normalizarTipoCalculoNF(tipo, fallback = 'descontar') {
        const valor = normalizarTextoBusca(tipo || fallback);
        return valor === 'acrescentar' ? 'acrescentar' : 'descontar';
    }

    function normalizarFormaPagamento(forma) {
        const valor = normalizarTextoBusca(forma);
        return FORMA_PAGAMENTO_LABELS[valor] ? valor : '';
    }

    function rotuloFormaPagamento(forma) {
        return FORMA_PAGAMENTO_LABELS[normalizarFormaPagamento(forma)] || '-';
    }

    function parseNumeroInput(id) {
        return numeroNaoNegativo(document.getElementById(id)?.value, 0);
    }

    function obterValorKmFretePadrao() {
        return numeroNaoNegativo(window.config?.valorKmFretePadrao ?? config?.valorKmFretePadrao, 0);
    }

    function aplicarValorKmFretePadraoProposta() {
        const campoValorKm = document.getElementById('propFreteValorKm');
        if (!campoValorKm) return;
        if (textoSeguro(document.getElementById('propostaIdAtual')?.value)) return;
        if (textoSeguro(campoValorKm.value)) return;

        const valorPadrao = obterValorKmFretePadrao();
        if (valorPadrao <= 0) return;
        campoValorKm.value = String(valorPadrao);
        recalcularResumoProposta();
    }

    const CHAVES_CUSTOS_ADICIONAIS = [
        'frete',
        'maoObra',
        'operador',
        'eletrica',
        'gerador',
        'terceirizados',
        'outros'
    ];

    function arredondarMoeda(valor) {
        return Math.round((numeroSeguro(valor, 0) + Number.EPSILON) * 100) / 100;
    }

    function calcularFretePorKm(distanciaKm = 0, valorKm = 0, trechos = 1) {
        const distancia = numeroNaoNegativo(distanciaKm, 0);
        const valorPorKm = numeroNaoNegativo(valorKm, 0);
        const qtdTrechos = Math.max(1, Math.trunc(numeroNaoNegativo(trechos, 1)));
        if (distancia <= 0 || valorPorKm <= 0) {
            return {
                trechos: qtdTrechos,
                distanciaKm: distancia,
                valorKm: valorPorKm,
                freteCalculado: 0,
                calculoAtivo: false
            };
        }

        return {
            trechos: qtdTrechos,
            distanciaKm: distancia,
            valorKm: valorPorKm,
            freteCalculado: arredondarMoeda(qtdTrechos * distancia * valorPorKm),
            calculoAtivo: true
        };
    }

    function sincronizarFretePorKmFormulario() {
        const freteEl = document.getElementById('propCustoFrete');
        const trechosEl = document.getElementById('propFreteTrechos');
        const distanciaEl = document.getElementById('propFreteDistanciaKm');
        const valorKmEl = document.getElementById('propFreteValorKm');
        const resultado = calcularFretePorKm(
            distanciaEl?.value,
            valorKmEl?.value,
            trechosEl?.value || 1
        );

        if (freteEl) {
            freteEl.readOnly = resultado.calculoAtivo;
            if (resultado.calculoAtivo) {
                freteEl.value = resultado.freteCalculado.toFixed(2);
                freteEl.title = 'Frete calculado automaticamente por distância x valor por km.';
            } else {
                freteEl.removeAttribute('title');
            }
        }

        return resultado;
    }

    function clampPercentual(valor) {
        const numero = numeroNaoNegativo(valor, 0);
        return Math.min(100, numero);
    }

    function obterHojeIso() {
        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function obterAgoraIso() {
        return new Date().toISOString();
    }

    function parseDataIso(dataIso) {
        const texto = textoSeguro(dataIso);
        const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const ano = Number(match[1]);
        const mes = Number(match[2]);
        const dia = Number(match[3]);
        const data = new Date(ano, mes - 1, dia);
        if (Number.isNaN(data.getTime())) return null;
        return data;
    }

    function formatarDataIso(data) {
        if (!(data instanceof Date) || Number.isNaN(data.getTime())) return '';
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function adicionarDiasDataIso(dataIsoBase, dias) {
        const base = parseDataIso(dataIsoBase) || parseDataIso(obterHojeIso());
        const qtd = inteiroNaoNegativo(dias, 0);
        base.setDate(base.getDate() + qtd);
        return formatarDataIso(base);
    }

    function diferencaDiasDataIso(inicioIso, fimIso) {
        const inicio = parseDataIso(inicioIso);
        const fim = parseDataIso(fimIso);
        if (!inicio || !fim) return 0;
        const msDia = 24 * 60 * 60 * 1000;
        const diff = Math.round((fim.getTime() - inicio.getTime()) / msDia);
        return Math.max(0, diff);
    }

    function obterDataCriacaoBaseFormulario() {
        const hidden = document.getElementById('propostaIdAtual');
        const emEdicao = textoSeguro(hidden?.dataset?.dataCriacao, '');
        const dataIso = textoSeguro(emEdicao).slice(0, 10);
        return parseDataIso(dataIso) ? dataIso : obterHojeIso();
    }

    function obterUsuarioAtualNomeOuEmail() {
        let nome = '';
        if (typeof obterUltimoUsuarioGoogle === 'function') {
            const ultimo = obterUltimoUsuarioGoogle();
            nome = textoSeguro(ultimo?.nome);
        }
        if (nome) return nome;
        const email = textoSeguro(localStorage.getItem('usuarioEmail'), '');
        if (email) return email;
        return 'Sistema';
    }

    function obterUsuarioAtualEmail() {
        const email = textoSeguro(localStorage.getItem('usuarioEmail'), '');
        if (email) return email;
        if (typeof obterUltimoUsuarioGoogle === 'function') {
            const ultimo = obterUltimoUsuarioGoogle();
            const emailGoogle = textoSeguro(ultimo?.email, '');
            if (emailGoogle) return emailGoogle;
        }
        return 'offline@local';
    }

    function gerarCodigoProposta() {
        const anoAtual = String(new Date().getFullYear());
        const lista = Array.isArray(propostas) ? propostas : [];
        let maiorNumero = 0;

        lista.forEach((propostaAtual) => {
            const codigo = textoSeguro(propostaAtual?.codigo).toUpperCase();
            const match = codigo.match(/^PROP-(\d{4})-(\d{4,})$/);
            if (!match) return;
            if (match[1] !== anoAtual) return;
            const numero = Number(match[2]);
            if (Number.isFinite(numero) && numero > maiorNumero) maiorNumero = numero;
        });

        const proximoNumero = maiorNumero + 1;
        return `PROP-${anoAtual}-${String(proximoNumero).padStart(4, '0')}`;
    }

    function gerarCodigoPropostaLegadoPorId(id) {
        const anoAtual = String(new Date().getFullYear());
        const sufixo = String(id || Date.now()).replace(/\D/g, '').slice(-4).padStart(4, '0');
        return `PROP-${anoAtual}-${sufixo}`;
    }

    function statusBadge(status) {
        const chave = normalizarStatusProposta(status);
        if (chave === 'aprovada' || chave === 'convertida') return 'badge-success';
        if (chave === 'cancelada' || chave === 'recusada') return 'badge-danger';
        if (chave === 'enviada' || chave === 'em_negociacao') return 'badge-info';
        return 'badge-warning';
    }

    function statusRotulo(status) {
        return STATUS_LABELS[normalizarStatusProposta(status)] || STATUS_LABELS.rascunho;
    }

    function obterStatusSelecionado() {
        return normalizarStatusProposta(document.getElementById('propStatus')?.value || 'rascunho');
    }

    function atualizarModoFormulario(texto) {
        const badge = document.getElementById('propostaModoLabel');
        if (!badge) return;
        badge.textContent = texto || 'Nova proposta';
    }

    function sincronizarValidadePorDias() {
        if (bloqueioSincronizacaoValidade) return;
        const campoDias = document.getElementById('propValidadeDias');
        const campoData = document.getElementById('propValidadeData');
        if (!campoDias || !campoData) return;
        const dias = inteiroNaoNegativo(campoDias.value, 0);
        const dataBase = obterDataCriacaoBaseFormulario();
        bloqueioSincronizacaoValidade = true;
        campoData.value = adicionarDiasDataIso(dataBase, dias);
        bloqueioSincronizacaoValidade = false;
    }

    function sincronizarValidadePorData() {
        if (bloqueioSincronizacaoValidade) return;
        const campoDias = document.getElementById('propValidadeDias');
        const campoData = document.getElementById('propValidadeData');
        if (!campoDias || !campoData) return;
        const dataEscolhida = textoSeguro(campoData.value);
        const dataBase = obterDataCriacaoBaseFormulario();
        const dias = dataEscolhida ? diferencaDiasDataIso(dataBase, dataEscolhida) : 0;
        bloqueioSincronizacaoValidade = true;
        campoDias.value = String(dias);
        bloqueioSincronizacaoValidade = false;
    }

    function criarLinhaItemProposta(item = {}) {
        const descricao = sanitizar(item.descricao || '');
        const medida = sanitizar(item.medida || '');
        const periodoDias = numeroNaoNegativo(item.periodoDias ?? item.periodo ?? 1, 1) || 1;
        const quantidade = numeroNaoNegativo(item.quantidade, 1) || 1;
        const valorUnitario = numeroNaoNegativo(item.valorUnitario, 0);
        const observacoes = sanitizar(item.observacoes || '');
        const valorTotal = periodoDias * quantidade * valorUnitario;

        return `
            <tr class="proposta-item-row">
                <td><input type="text" class="prop-item-descricao" value="${descricao}" placeholder="Descricao do item" data-input="recalcularResumoProposta"></td>
                <td><input type="text" class="prop-item-medida" value="${medida}" placeholder="Medida" data-input="recalcularResumoProposta"></td>
                <td><input type="number" class="prop-item-periodo" value="${periodoDias}" min="0" step="0.5" data-input="recalcularResumoProposta"></td>
                <td><input type="number" class="prop-item-quantidade" value="${quantidade}" min="0" step="1" data-input="recalcularResumoProposta"></td>
                <td><input type="number" class="prop-item-unitario" value="${valorUnitario}" min="0" step="0.01" data-input="recalcularResumoProposta"></td>
                <td><input type="text" class="prop-item-total" value="${formatarMoeda(valorTotal)}" readonly></td>
                <td><input type="text" class="prop-item-obs" value="${observacoes}" placeholder="Observacoes"></td>
                <td class="col-actions">
                    <button type="button" class="btn btn-sm btn-danger table-action-btn" data-action="removerLinhaItemProposta" data-arg="__this__" title="Remover item">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    function renderLinhasItensProposta(itens = []) {
        const tbody = document.getElementById('propostaItensBody');
        if (!tbody) return;
        const lista = Array.isArray(itens) && itens.length ? itens : [{}];
        tbody.innerHTML = lista.map((item) => criarLinhaItemProposta(item)).join('');
        recalcularResumoProposta();
    }

    function adicionarLinhaItemProposta() {
        const tbody = document.getElementById('propostaItensBody');
        if (!tbody) return;
        tbody.insertAdjacentHTML('beforeend', criarLinhaItemProposta({}));
        recalcularResumoProposta();
        const ultimaDescricao = tbody.querySelector('tr:last-child .prop-item-descricao');
        if (ultimaDescricao) ultimaDescricao.focus();
    }

    function removerLinhaItemProposta(botao) {
        const tbody = document.getElementById('propostaItensBody');
        const linha = botao?.closest('tr');
        if (!tbody || !linha) return;

        if (tbody.querySelectorAll('tr').length <= 1) {
            linha.querySelectorAll('input').forEach((input) => {
                if (!input.classList.contains('prop-item-total')) input.value = '';
            });
            recalcularResumoProposta();
            return;
        }

        linha.remove();
        recalcularResumoProposta();
    }

    function coletarItensFormulario() {
        const linhas = Array.from(document.querySelectorAll('#propostaItensBody tr'));
        return linhas.map((linha) => {
            const descricao = textoSeguro(linha.querySelector('.prop-item-descricao')?.value);
            const medida = textoSeguro(linha.querySelector('.prop-item-medida')?.value);
            const periodoDias = numeroNaoNegativo(linha.querySelector('.prop-item-periodo')?.value, 1) || 1;
            const quantidade = numeroNaoNegativo(linha.querySelector('.prop-item-quantidade')?.value, 0);
            const valorUnitario = numeroNaoNegativo(linha.querySelector('.prop-item-unitario')?.value, 0);
            const observacoes = textoSeguro(linha.querySelector('.prop-item-obs')?.value);
            const valorTotal = periodoDias * quantidade * valorUnitario;
            return { descricao, medida, periodoDias, quantidade, valorUnitario, valorTotal, observacoes };
        }).filter((item) => item.descricao && item.periodoDias > 0 && item.quantidade > 0);
    }

    function obterCustosFormulario() {
        const freteKm = sincronizarFretePorKmFormulario();
        const freteInformado = parseNumeroInput('propCustoFrete');
        const freteFinal = freteKm.calculoAtivo ? freteKm.freteCalculado : freteInformado;

        return {
            frete: freteFinal,
            freteTrechos: freteKm.trechos,
            freteDistanciaKm: freteKm.distanciaKm,
            freteValorKm: freteKm.valorKm,
            maoObra: parseNumeroInput('propCustoMaoObra'),
            operador: parseNumeroInput('propCustoOperador'),
            eletrica: parseNumeroInput('propCustoEletrica'),
            gerador: parseNumeroInput('propCustoGerador'),
            terceirizados: parseNumeroInput('propCustoTerceirizados'),
            outros: parseNumeroInput('propCustoOutros')
        };
    }

    function obterControleInternoFormulario() {
        return {
            custoInternoTotal: parseNumeroInput('propCustoInternoTotal'),
            custoTerceirizadoTotal: parseNumeroInput('propCustoTerceirizadoTotal'),
            outrosCustosInternos: parseNumeroInput('propOutrosCustosInternos')
        };
    }

    function calcularResumoProposta({
        itens = [],
        custos = {},
        desconto = 0,
        acrescimo = 0,
        percentualNF = 0,
        tipoCalculoNF = 'descontar',
        percentualEntrada = 50,
        controleInterno = {}
    } = {}) {
        const subtotalItens = (Array.isArray(itens) ? itens : []).reduce((acc, item) => {
            return acc + numeroNaoNegativo(item.valorTotal, 0);
        }, 0);

        const totalCustosAdicionais = CHAVES_CUSTOS_ADICIONAIS.reduce((acc, chave) => {
            return acc + numeroNaoNegativo(custos?.[chave], 0);
        }, 0);

        const descontoNormalizado = numeroNaoNegativo(desconto, 0);
        const acrescimoNormalizado = numeroNaoNegativo(acrescimo, 0);
        const valorBase = Math.max(subtotalItens + totalCustosAdicionais + acrescimoNormalizado - descontoNormalizado, 0);
        const percentualNFNormalizado = numeroNaoNegativo(percentualNF, 0);
        const tipoNF = normalizarTipoCalculoNF(tipoCalculoNF, 'descontar');
        const valorNF = (valorBase * percentualNFNormalizado) / 100;
        const valorFinal = valorBase;
        const valorFinalComNF = tipoNF === 'acrescentar' ? valorBase + valorNF : valorBase;
        const valorLiquidoPrevisto = tipoNF === 'descontar' ? (valorBase - valorNF) : valorBase;
        const valorFinalComercial = tipoNF === 'acrescentar' ? valorFinalComNF : valorFinal;

        const percentualEntradaNormalizado = clampPercentual(percentualEntrada);
        const valorEntrada = (valorFinalComercial * percentualEntradaNormalizado) / 100;
        const percentualSaldo = Math.max(0, 100 - percentualEntradaNormalizado);
        const valorSaldo = Math.max(valorFinalComercial - valorEntrada, 0);

        const custoInternoTotal = numeroNaoNegativo(controleInterno?.custoInternoTotal, 0);
        const custoTerceirizadoTotal = numeroNaoNegativo(controleInterno?.custoTerceirizadoTotal, 0);
        const outrosCustosInternos = numeroNaoNegativo(controleInterno?.outrosCustosInternos, 0);
        const custoTotalProposta = custoInternoTotal + custoTerceirizadoTotal + outrosCustosInternos;
        const lucroPrevisto = valorLiquidoPrevisto - custoTotalProposta;
        const margemPrevista = valorLiquidoPrevisto > 0 ? (lucroPrevisto / valorLiquidoPrevisto) * 100 : 0;

        return {
            subtotalItens,
            totalCustosAdicionais,
            desconto: descontoNormalizado,
            acrescimo: acrescimoNormalizado,
            valorBase,
            percentualNF: percentualNFNormalizado,
            tipoCalculoNF: tipoNF,
            valorNF,
            valorFinal,
            valorFinalComNF,
            valorLiquidoPrevisto,
            valorFinalComercial,
            percentualEntrada: percentualEntradaNormalizado,
            valorEntrada,
            percentualSaldo,
            valorSaldo,
            custoInternoTotal,
            custoTerceirizadoTotal,
            outrosCustosInternos,
            custoTotalProposta,
            lucroPrevisto,
            margemPrevista
        };
    }

    function recalcularResumoProposta() {
        const linhas = Array.from(document.querySelectorAll('#propostaItensBody tr'));
        linhas.forEach((linha) => {
            const periodo = numeroNaoNegativo(linha.querySelector('.prop-item-periodo')?.value, 1) || 1;
            const qtd = numeroNaoNegativo(linha.querySelector('.prop-item-quantidade')?.value, 0);
            const unit = numeroNaoNegativo(linha.querySelector('.prop-item-unitario')?.value, 0);
            const total = periodo * qtd * unit;
            const campoTotal = linha.querySelector('.prop-item-total');
            if (campoTotal) campoTotal.value = formatarMoeda(total);
        });

        const itens = coletarItensFormulario();
        const custos = obterCustosFormulario();
        const controleInterno = obterControleInternoFormulario();
        const desconto = parseNumeroInput('propDesconto');
        const acrescimo = parseNumeroInput('propAcrescimo');
        const percentualNF = parseNumeroInput('propPercentualNF');
        const tipoCalculoNF = document.getElementById('propTipoCalculoNF')?.value || 'descontar';
        const percentualEntrada = parseNumeroInput('propPercentualEntrada');

        const resumo = calcularResumoProposta({
            itens,
            custos,
            desconto,
            acrescimo,
            percentualNF,
            tipoCalculoNF,
            percentualEntrada,
            controleInterno
        });

        const mapaTexto = [
            ['propSubtotal', formatarMoeda(resumo.subtotalItens)],
            ['propValorFinal', formatarMoeda(resumo.valorFinal)],
            ['propValorNF', formatarMoeda(resumo.valorNF)],
            ['propValorFinalComNF', formatarMoeda(resumo.valorFinalComNF)],
            ['propValorLiquidoPrevisto', formatarMoeda(resumo.valorLiquidoPrevisto)],
            ['propValorEntrada', formatarMoeda(resumo.valorEntrada)],
            ['propPercentualSaldo', formatarPercentual(resumo.percentualSaldo)],
            ['propValorSaldo', formatarMoeda(resumo.valorSaldo)],
            ['propCustoTotalProposta', formatarMoeda(resumo.custoTotalProposta)],
            ['propLucroPrevisto', formatarMoeda(resumo.lucroPrevisto)],
            ['propMargemPrevista', formatarPercentual(resumo.margemPrevista)]
        ];
        mapaTexto.forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.value = valor;
        });
    }

    function obterCamposPadraoEscopo() {
        return {
            inclusoProposta: TEXTO_PADRAO_INCLUSO,
            naoInclusoProposta: TEXTO_PADRAO_NAO_INCLUSO,
            observacoesComerciais: ''
        };
    }

    function montarEventoNormalizado(evento = {}) {
        return {
            nome: textoSeguro(evento.nome, ''),
            local: textoSeguro(evento.local, ''),
            enderecoEvento: textoSeguro(evento.enderecoEvento ?? evento.enderecoCompleto ?? '', ''),
            cidadeEvento: textoSeguro(evento.cidadeEvento ?? evento.cidade ?? '', ''),
            ufEvento: textoSeguro(evento.ufEvento ?? evento.uf ?? '', '').toUpperCase().slice(0, 2),
            referenciaAcesso: textoSeguro(evento.referenciaAcesso ?? '', ''),
            dataMontagem: textoSeguro(evento.dataMontagem, ''),
            horaMontagem: textoSeguro(evento.horaMontagem, ''),
            dataEvento: textoSeguro(evento.dataEvento, ''),
            horaInicioEvento: textoSeguro(evento.horaInicioEvento, ''),
            horaFimEvento: textoSeguro(evento.horaFimEvento, ''),
            dataDesmontagem: textoSeguro(evento.dataDesmontagem, ''),
            horaDesmontagem: textoSeguro(evento.horaDesmontagem, ''),
            observacoesGerais: textoSeguro(evento.observacoesGerais ?? evento.observacoes ?? '', '')
        };
    }

    function montarFinanceiroNormalizado(financeiroOrig = {}, resumoBase = {}) {
        const exibirInfoInterna = financeiroOrig.exibirInformacoesInternasPDF === true || financeiroOrig.exibirCustosInternosPdf === true;
        const percentualEntrada = clampPercentual(financeiroOrig.percentualEntrada ?? resumoBase.percentualEntrada ?? 50);
        return {
            subtotal: numeroNaoNegativo(financeiroOrig.subtotal, resumoBase.subtotalItens || 0),
            totalCustosAdicionais: numeroNaoNegativo(financeiroOrig.totalCustosAdicionais, resumoBase.totalCustosAdicionais || 0),
            desconto: numeroNaoNegativo(financeiroOrig.desconto, resumoBase.desconto || 0),
            acrescimo: numeroNaoNegativo(financeiroOrig.acrescimo, resumoBase.acrescimo || 0),
            valorBase: numeroNaoNegativo(financeiroOrig.valorBase, resumoBase.valorBase || 0),
            percentualNF: numeroNaoNegativo(financeiroOrig.percentualNF, resumoBase.percentualNF || 0),
            tipoCalculoNF: normalizarTipoCalculoNF(financeiroOrig.tipoCalculoNF, resumoBase.tipoCalculoNF || 'descontar'),
            valorNF: numeroNaoNegativo(financeiroOrig.valorNF, resumoBase.valorNF || 0),
            valorFinal: numeroNaoNegativo(financeiroOrig.valorFinal, resumoBase.valorFinal || 0),
            valorFinalComNF: numeroNaoNegativo(financeiroOrig.valorFinalComNF, resumoBase.valorFinalComNF || 0),
            valorLiquidoPrevisto: numeroSeguro(financeiroOrig.valorLiquidoPrevisto, resumoBase.valorLiquidoPrevisto || 0),
            percentualEntrada,
            valorEntrada: numeroNaoNegativo(financeiroOrig.valorEntrada, resumoBase.valorEntrada || 0),
            percentualSaldo: numeroNaoNegativo(financeiroOrig.percentualSaldo, resumoBase.percentualSaldo || (100 - percentualEntrada)),
            valorSaldo: numeroNaoNegativo(financeiroOrig.valorSaldo, resumoBase.valorSaldo || 0),
            vencimentoEntrada: textoSeguro(financeiroOrig.vencimentoEntrada, ''),
            vencimentoSaldo: textoSeguro(financeiroOrig.vencimentoSaldo, ''),
            formaPagamento: normalizarFormaPagamento(financeiroOrig.formaPagamento),
            condicaoPagamento: textoSeguro(financeiroOrig.condicaoPagamento, ''),
            observacaoPagamento: textoSeguro(financeiroOrig.observacaoPagamento, TEXTO_PADRAO_OBS_PAGAMENTO),
            validadePropostaDias: inteiroNaoNegativo(financeiroOrig.validadePropostaDias, 7),
            validadePropostaData: textoSeguro(financeiroOrig.validadePropostaData, ''),
            exibirInformacoesInternasPDF: exibirInfoInterna,
            // compatibilidade com estrutura anterior
            exibirCustosInternosPdf: exibirInfoInterna
        };
    }

    function normalizarProposta(propostaOriginal = {}) {
        const proposta = propostaOriginal && typeof propostaOriginal === 'object' ? propostaOriginal : {};
        const itensOrig = Array.isArray(proposta.itens) ? proposta.itens : [];
        const custosOrig = proposta.custos && typeof proposta.custos === 'object' ? proposta.custos : {};
        const controleOrig = proposta.controleInterno && typeof proposta.controleInterno === 'object'
            ? proposta.controleInterno
            : {};
        const escopoOrig = proposta.escopo && typeof proposta.escopo === 'object'
            ? proposta.escopo
            : {};
        const financeiroOrig = proposta.financeiro && typeof proposta.financeiro === 'object'
            ? proposta.financeiro
            : {};

        const itens = itensOrig.map((item) => {
            const periodoDias = numeroNaoNegativo(item.periodoDias ?? item.periodo, 1) || 1;
            const quantidade = numeroNaoNegativo(item.quantidade, 0);
            const valorUnitario = numeroNaoNegativo(item.valorUnitario, 0);
            return {
                descricao: textoSeguro(item.descricao, ''),
                medida: textoSeguro(item.medida, ''),
                periodoDias,
                quantidade,
                valorUnitario,
                valorTotal: periodoDias * quantidade * valorUnitario,
                observacoes: textoSeguro(item.observacoes, '')
            };
        });

        const freteDistanciaKm = numeroNaoNegativo(custosOrig.freteDistanciaKm ?? custosOrig.distanciaKm, 0);
        const freteValorKm = numeroNaoNegativo(custosOrig.freteValorKm ?? custosOrig.valorKm, 0);
        const freteTrechos = numeroNaoNegativo(custosOrig.freteTrechos ?? custosOrig.trechos, (freteDistanciaKm > 0 && freteValorKm > 0) ? 1 : 0);
        const freteKmNormalizado = calcularFretePorKm(freteDistanciaKm, freteValorKm, freteTrechos || 1);
        const freteManual = numeroNaoNegativo(custosOrig.frete, 0);

        const custos = {
            frete: freteKmNormalizado.calculoAtivo ? freteKmNormalizado.freteCalculado : freteManual,
            freteTrechos: freteKmNormalizado.trechos,
            freteDistanciaKm,
            freteValorKm,
            maoObra: numeroNaoNegativo(custosOrig.maoObra, 0),
            operador: numeroNaoNegativo(custosOrig.operador, 0),
            eletrica: numeroNaoNegativo(custosOrig.eletrica, 0),
            gerador: numeroNaoNegativo(custosOrig.gerador, 0),
            terceirizados: numeroNaoNegativo(custosOrig.terceirizados, 0),
            outros: numeroNaoNegativo(custosOrig.outros, 0)
        };

        const controleInterno = {
            custoInternoTotal: numeroNaoNegativo(controleOrig.custoInternoTotal, 0),
            custoTerceirizadoTotal: numeroNaoNegativo(controleOrig.custoTerceirizadoTotal, 0),
            outrosCustosInternos: numeroNaoNegativo(controleOrig.outrosCustosInternos, 0)
        };

        const resumo = calcularResumoProposta({
            itens,
            custos,
            desconto: numeroNaoNegativo(financeiroOrig.desconto, 0),
            acrescimo: numeroNaoNegativo(financeiroOrig.acrescimo, 0),
            percentualNF: numeroNaoNegativo(financeiroOrig.percentualNF, 0),
            tipoCalculoNF: normalizarTipoCalculoNF(financeiroOrig.tipoCalculoNF, 'descontar'),
            percentualEntrada: numeroNaoNegativo(financeiroOrig.percentualEntrada, 50),
            controleInterno
        });

        const financeiro = montarFinanceiroNormalizado(financeiroOrig, resumo);
        financeiro.valorBase = resumo.valorBase;
        financeiro.valorNF = resumo.valorNF;
        financeiro.valorFinal = resumo.valorFinal;
        financeiro.valorFinalComNF = resumo.valorFinalComNF;
        financeiro.valorLiquidoPrevisto = resumo.valorLiquidoPrevisto;
        financeiro.valorEntrada = resumo.valorEntrada;
        financeiro.percentualSaldo = resumo.percentualSaldo;
        financeiro.valorSaldo = resumo.valorSaldo;
        if (!financeiro.validadePropostaData) {
            const criacaoBase = textoSeguro(proposta.dataCriacao ?? proposta.criadoEm, '').slice(0, 10) || obterHojeIso();
            financeiro.validadePropostaData = adicionarDiasDataIso(criacaoBase, financeiro.validadePropostaDias);
        }

        const escopoPadrao = obterCamposPadraoEscopo();
        const escopo = {
            inclusoProposta: textoSeguro(escopoOrig.inclusoProposta, escopoPadrao.inclusoProposta),
            naoInclusoProposta: textoSeguro(escopoOrig.naoInclusoProposta, escopoPadrao.naoInclusoProposta),
            observacoesComerciais: textoSeguro(escopoOrig.observacoesComerciais, escopoPadrao.observacoesComerciais)
        };

        const evento = montarEventoNormalizado(proposta.evento || {});
        const id = proposta.id || Date.now();
        const codigo = textoSeguro(proposta.codigo, '') || gerarCodigoPropostaLegadoPorId(id);
        const status = normalizarStatusProposta(proposta.status || 'rascunho');
        const usuarioAtual = obterUsuarioAtualNomeOuEmail();
        const agoraIso = obterAgoraIso();
        const dataCriacao = textoSeguro(proposta.dataCriacao ?? proposta.criadoEm, agoraIso);
        const dataUltimaAlteracao = textoSeguro(proposta.dataUltimaAlteracao ?? proposta.atualizadoEm, dataCriacao);
        const criadoPor = textoSeguro(proposta.criadoPor, usuarioAtual);
        const alteradoPor = textoSeguro(proposta.alteradoPor, criadoPor);
        const locacaoVinculadaId = textoSeguro(proposta.locacaoVinculadaId ?? proposta.locacaoId, '');
        const dataConversaoLocacao = textoSeguro(proposta.dataConversaoLocacao, '');

        return {
            id,
            codigo,
            cliente: {
                nome: textoSeguro(proposta?.cliente?.nome, ''),
                documento: textoSeguro(proposta?.cliente?.documento, ''),
                telefone: textoSeguro(proposta?.cliente?.telefone, ''),
                email: textoSeguro(proposta?.cliente?.email, ''),
                endereco: textoSeguro(proposta?.cliente?.endereco, '')
            },
            evento,
            itens,
            custos,
            financeiro,
            controleInterno: {
                ...controleInterno,
                custoTotalProposta: resumo.custoTotalProposta,
                lucroPrevisto: resumo.lucroPrevisto,
                margemPrevista: resumo.margemPrevista
            },
            escopo,
            responsavelProposta: textoSeguro(proposta.responsavelProposta, usuarioAtual),
            status,
            locacaoVinculadaId,
            locacaoId: locacaoVinculadaId,
            dataCriacao,
            dataUltimaAlteracao,
            criadoPor,
            alteradoPor,
            dataEnvio: textoSeguro(proposta.dataEnvio, ''),
            dataAprovacao: textoSeguro(proposta.dataAprovacao, ''),
            dataCancelamento: textoSeguro(proposta.dataCancelamento, ''),
            dataConversaoLocacao,
            // compatibilidade legado
            criadoEm: dataCriacao,
            atualizadoEm: dataUltimaAlteracao
        };
    }

    function obterPropostasBase() {
        if (!Array.isArray(propostas)) propostas = [];
        return propostas.map((item) => normalizarProposta(item));
    }

    function localizarProposta(id) {
        return obterPropostasBase().find((item) => String(item.id) === String(id)) || null;
    }

    function obterIdPropostaEmEdicao() {
        return textoSeguro(document.getElementById('propostaIdAtual')?.value);
    }

    function coletarDadosFormulario(validar = true) {
        const idAtual = obterIdPropostaEmEdicao();
        const propostaAtual = idAtual ? localizarProposta(idAtual) : null;
        const usuarioAtual = obterUsuarioAtualNomeOuEmail();
        const agoraIso = obterAgoraIso();

        const itens = coletarItensFormulario();
        const custos = obterCustosFormulario();
        const controleInterno = obterControleInternoFormulario();
        const desconto = parseNumeroInput('propDesconto');
        const acrescimo = parseNumeroInput('propAcrescimo');
        const percentualNF = parseNumeroInput('propPercentualNF');
        const tipoCalculoNF = normalizarTipoCalculoNF(document.getElementById('propTipoCalculoNF')?.value, 'descontar');
        const percentualEntrada = parseNumeroInput('propPercentualEntrada');

        const resumo = calcularResumoProposta({
            itens,
            custos,
            desconto,
            acrescimo,
            percentualNF,
            tipoCalculoNF,
            percentualEntrada,
            controleInterno
        });

        const dataCriacao = textoSeguro(propostaAtual?.dataCriacao, agoraIso);
        const validadeDias = inteiroNaoNegativo(document.getElementById('propValidadeDias')?.value, 7);
        const validadeDataDigitada = textoSeguro(document.getElementById('propValidadeData')?.value);
        const validadeData = parseDataIso(validadeDataDigitada)
            ? validadeDataDigitada
            : adicionarDiasDataIso(dataCriacao.slice(0, 10), validadeDias);

        const proposta = {
            id: idAtual || Date.now(),
            codigo: textoSeguro(document.getElementById('propCodigo')?.value, ''),
            cliente: {
                nome: textoSeguro(document.getElementById('propClienteNome')?.value),
                documento: textoSeguro(document.getElementById('propClienteDocumento')?.value),
                telefone: textoSeguro(document.getElementById('propClienteTelefone')?.value),
                email: textoSeguro(document.getElementById('propClienteEmail')?.value),
                endereco: textoSeguro(document.getElementById('propClienteEndereco')?.value)
            },
            evento: {
                nome: textoSeguro(document.getElementById('propEventoNome')?.value),
                local: textoSeguro(document.getElementById('propEventoLocal')?.value),
                enderecoEvento: textoSeguro(document.getElementById('propEventoEnderecoCompleto')?.value),
                cidadeEvento: textoSeguro(document.getElementById('propEventoCidade')?.value),
                ufEvento: textoSeguro(document.getElementById('propEventoUF')?.value).toUpperCase().slice(0, 2),
                referenciaAcesso: textoSeguro(document.getElementById('propEventoReferenciaAcesso')?.value),
                dataMontagem: textoSeguro(document.getElementById('propDataMontagem')?.value),
                horaMontagem: textoSeguro(document.getElementById('propHoraMontagem')?.value),
                dataEvento: textoSeguro(document.getElementById('propDataEvento')?.value),
                horaInicioEvento: textoSeguro(document.getElementById('propHoraInicioEvento')?.value),
                horaFimEvento: textoSeguro(document.getElementById('propHoraFimEvento')?.value),
                dataDesmontagem: textoSeguro(document.getElementById('propDataDesmontagem')?.value),
                horaDesmontagem: textoSeguro(document.getElementById('propHoraDesmontagem')?.value),
                observacoesGerais: textoSeguro(document.getElementById('propEventoObs')?.value)
            },
            itens,
            custos,
            financeiro: {
                subtotal: resumo.subtotalItens,
                totalCustosAdicionais: resumo.totalCustosAdicionais,
                desconto: resumo.desconto,
                acrescimo: resumo.acrescimo,
                valorBase: resumo.valorBase,
                percentualNF: resumo.percentualNF,
                tipoCalculoNF: resumo.tipoCalculoNF,
                valorNF: resumo.valorNF,
                valorFinal: resumo.valorFinal,
                valorFinalComNF: resumo.valorFinalComNF,
                valorLiquidoPrevisto: resumo.valorLiquidoPrevisto,
                percentualEntrada: resumo.percentualEntrada,
                valorEntrada: resumo.valorEntrada,
                percentualSaldo: resumo.percentualSaldo,
                valorSaldo: resumo.valorSaldo,
                vencimentoEntrada: textoSeguro(document.getElementById('propVencEntrada')?.value),
                vencimentoSaldo: textoSeguro(document.getElementById('propVencSaldo')?.value),
                formaPagamento: normalizarFormaPagamento(document.getElementById('propFormaPagamento')?.value),
                condicaoPagamento: textoSeguro(document.getElementById('propCondicaoPagamento')?.value),
                observacaoPagamento: textoSeguro(document.getElementById('propObsPagamento')?.value, TEXTO_PADRAO_OBS_PAGAMENTO),
                validadePropostaDias: validadeDias,
                validadePropostaData: validadeData,
                exibirInformacoesInternasPDF: document.getElementById('propExibirInformacoesInternasPDF')?.checked === true,
                // compatibilidade legado
                exibirCustosInternosPdf: document.getElementById('propExibirInformacoesInternasPDF')?.checked === true
            },
            controleInterno: {
                custoInternoTotal: resumo.custoInternoTotal,
                custoTerceirizadoTotal: resumo.custoTerceirizadoTotal,
                outrosCustosInternos: resumo.outrosCustosInternos,
                custoTotalProposta: resumo.custoTotalProposta,
                lucroPrevisto: resumo.lucroPrevisto,
                margemPrevista: resumo.margemPrevista
            },
            escopo: {
                inclusoProposta: textoSeguro(document.getElementById('propIncluso')?.value, TEXTO_PADRAO_INCLUSO),
                naoInclusoProposta: textoSeguro(document.getElementById('propNaoIncluso')?.value, TEXTO_PADRAO_NAO_INCLUSO),
                observacoesComerciais: textoSeguro(document.getElementById('propObsComerciais')?.value)
            },
            responsavelProposta: textoSeguro(document.getElementById('propResponsavel')?.value, usuarioAtual),
            status: obterStatusSelecionado(),
            locacaoVinculadaId: textoSeguro(propostaAtual?.locacaoVinculadaId ?? propostaAtual?.locacaoId, ''),
            dataCriacao,
            dataUltimaAlteracao: agoraIso,
            criadoPor: textoSeguro(propostaAtual?.criadoPor, usuarioAtual),
            alteradoPor: usuarioAtual,
            dataEnvio: textoSeguro(propostaAtual?.dataEnvio, ''),
            dataAprovacao: textoSeguro(propostaAtual?.dataAprovacao, ''),
            dataCancelamento: textoSeguro(propostaAtual?.dataCancelamento, ''),
            dataConversaoLocacao: textoSeguro(propostaAtual?.dataConversaoLocacao, '')
        };

        if (!proposta.codigo) proposta.codigo = gerarCodigoProposta();

        if (validar) {
            if (!proposta.cliente.nome) {
                mostrarToast('Informe o nome/empresa do cliente.', 'erro');
                document.getElementById('propClienteNome')?.focus();
                return null;
            }
            if (!proposta.evento.nome) {
                mostrarToast('Informe o nome do evento.', 'erro');
                document.getElementById('propEventoNome')?.focus();
                return null;
            }
            if (proposta.itens.length === 0) {
                mostrarToast('Adicione pelo menos 1 item na proposta.', 'erro');
                document.querySelector('#propostaItensBody .prop-item-descricao')?.focus();
                return null;
            }
        }

        return normalizarProposta(proposta);
    }

    function preencherFormularioComProposta(proposta) {
        const p = normalizarProposta(proposta);
        const mapa = {
            propostaIdAtual: p.id,
            propCodigo: p.codigo,
            propStatus: p.status,
            propResponsavel: p.responsavelProposta,
            propValidadeDias: p.financeiro.validadePropostaDias,
            propValidadeData: p.financeiro.validadePropostaData,
            propClienteNome: p.cliente.nome,
            propClienteDocumento: p.cliente.documento,
            propClienteTelefone: p.cliente.telefone,
            propClienteEmail: p.cliente.email,
            propClienteEndereco: p.cliente.endereco,
            propEventoNome: p.evento.nome,
            propEventoLocal: p.evento.local,
            propEventoEnderecoCompleto: p.evento.enderecoEvento,
            propEventoCidade: p.evento.cidadeEvento,
            propEventoUF: p.evento.ufEvento,
            propEventoReferenciaAcesso: p.evento.referenciaAcesso,
            propDataMontagem: p.evento.dataMontagem,
            propHoraMontagem: p.evento.horaMontagem,
            propDataEvento: p.evento.dataEvento,
            propHoraInicioEvento: p.evento.horaInicioEvento,
            propHoraFimEvento: p.evento.horaFimEvento,
            propDataDesmontagem: p.evento.dataDesmontagem,
            propHoraDesmontagem: p.evento.horaDesmontagem,
            propEventoObs: p.evento.observacoesGerais,
            propFreteTrechos: p.custos.freteTrechos,
            propFreteDistanciaKm: p.custos.freteDistanciaKm,
            propFreteValorKm: p.custos.freteValorKm,
            propCustoFrete: p.custos.frete,
            propCustoMaoObra: p.custos.maoObra,
            propCustoOperador: p.custos.operador,
            propCustoEletrica: p.custos.eletrica,
            propCustoGerador: p.custos.gerador,
            propCustoTerceirizados: p.custos.terceirizados,
            propCustoOutros: p.custos.outros,
            propDesconto: p.financeiro.desconto,
            propAcrescimo: p.financeiro.acrescimo,
            propPercentualNF: p.financeiro.percentualNF,
            propTipoCalculoNF: p.financeiro.tipoCalculoNF,
            propPercentualEntrada: p.financeiro.percentualEntrada,
            propVencEntrada: p.financeiro.vencimentoEntrada,
            propVencSaldo: p.financeiro.vencimentoSaldo,
            propFormaPagamento: p.financeiro.formaPagamento,
            propCondicaoPagamento: p.financeiro.condicaoPagamento,
            propObsPagamento: p.financeiro.observacaoPagamento,
            propCustoInternoTotal: p.controleInterno.custoInternoTotal,
            propCustoTerceirizadoTotal: p.controleInterno.custoTerceirizadoTotal,
            propOutrosCustosInternos: p.controleInterno.outrosCustosInternos,
            propIncluso: p.escopo.inclusoProposta,
            propNaoIncluso: p.escopo.naoInclusoProposta,
            propObsComerciais: p.escopo.observacoesComerciais,
            propLocacaoVinculada: p.locacaoVinculadaId ? `#${String(p.locacaoVinculadaId).slice(-6)}` : ''
        };
        Object.entries(mapa).forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.value = valor ?? '';
        });

        const hidden = document.getElementById('propostaIdAtual');
        if (hidden) hidden.dataset.dataCriacao = String(p.dataCriacao || '').slice(0, 10);

        const chkInterno = document.getElementById('propExibirInformacoesInternasPDF');
        if (chkInterno) chkInterno.checked = p.financeiro.exibirInformacoesInternasPDF === true;

        renderLinhasItensProposta(p.itens);
        sincronizarValidadePorData();
        atualizarModoFormulario(`Editando ${p.codigo}`);
    }

    function limparFormularioProposta() {
        const campos = [
            'propostaIdAtual', 'propCodigo', 'propClienteNome', 'propClienteDocumento', 'propClienteTelefone', 'propClienteEmail',
            'propClienteEndereco', 'propEventoNome', 'propEventoLocal', 'propEventoEnderecoCompleto', 'propEventoCidade', 'propEventoUF',
            'propEventoReferenciaAcesso', 'propDataMontagem', 'propHoraMontagem', 'propDataEvento', 'propHoraInicioEvento',
            'propHoraFimEvento', 'propDataDesmontagem', 'propHoraDesmontagem', 'propEventoObs',
            'propFreteTrechos', 'propFreteDistanciaKm', 'propFreteValorKm', 'propCustoFrete', 'propCustoMaoObra', 'propCustoOperador', 'propCustoEletrica', 'propCustoGerador', 'propCustoTerceirizados',
            'propCustoOutros', 'propDesconto', 'propAcrescimo', 'propPercentualNF', 'propVencEntrada', 'propVencSaldo',
            'propCondicaoPagamento', 'propObsPagamento', 'propCustoInternoTotal', 'propCustoTerceirizadoTotal',
            'propOutrosCustosInternos', 'propIncluso', 'propNaoIncluso', 'propObsComerciais', 'propLocacaoVinculada'
        ];
        campos.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const hidden = document.getElementById('propostaIdAtual');
        if (hidden) {
            hidden.value = '';
            hidden.dataset.dataCriacao = obterHojeIso();
        }

        const statusEl = document.getElementById('propStatus');
        if (statusEl) statusEl.value = 'rascunho';
        const tipoNFEl = document.getElementById('propTipoCalculoNF');
        if (tipoNFEl) tipoNFEl.value = 'descontar';
        const percentualNFEl = document.getElementById('propPercentualNF');
        if (percentualNFEl) percentualNFEl.value = '0';
        const percentualEntradaEl = document.getElementById('propPercentualEntrada');
        if (percentualEntradaEl) percentualEntradaEl.value = '50';
        const validadeDiasEl = document.getElementById('propValidadeDias');
        if (validadeDiasEl) validadeDiasEl.value = '7';
        const formaPagamentoEl = document.getElementById('propFormaPagamento');
        if (formaPagamentoEl) formaPagamentoEl.value = '';
        const freteTrechosEl = document.getElementById('propFreteTrechos');
        if (freteTrechosEl) freteTrechosEl.value = '1';
        const freteValorKmEl = document.getElementById('propFreteValorKm');
        const valorKmPadrao = obterValorKmFretePadrao();
        if (freteValorKmEl && valorKmPadrao > 0) freteValorKmEl.value = String(valorKmPadrao);
        const freteEl = document.getElementById('propCustoFrete');
        if (freteEl) {
            freteEl.readOnly = false;
            freteEl.removeAttribute('title');
        }
        const chkInterno = document.getElementById('propExibirInformacoesInternasPDF');
        if (chkInterno) chkInterno.checked = false;

        const obsPagEl = document.getElementById('propObsPagamento');
        if (obsPagEl) obsPagEl.value = TEXTO_PADRAO_OBS_PAGAMENTO;
        const condicaoEl = document.getElementById('propCondicaoPagamento');
        if (condicaoEl) condicaoEl.value = '50% entrada + 50% na montagem/desmontagem';
        const inclusoEl = document.getElementById('propIncluso');
        if (inclusoEl) inclusoEl.value = TEXTO_PADRAO_INCLUSO;
        const naoInclusoEl = document.getElementById('propNaoIncluso');
        if (naoInclusoEl) naoInclusoEl.value = TEXTO_PADRAO_NAO_INCLUSO;
        const responsavelEl = document.getElementById('propResponsavel');
        if (responsavelEl) responsavelEl.value = obterUsuarioAtualNomeOuEmail();

        renderLinhasItensProposta([{}]);
        sincronizarValidadePorDias();
        atualizarModoFormulario('Nova proposta');
        document.getElementById('propClienteNome')?.focus();
    }

    function aplicarDatasAutomaticasStatus(propostaNova, propostaAnterior, agoraIso) {
        const anterior = normalizarStatusProposta(propostaAnterior?.status || 'rascunho');
        const atual = normalizarStatusProposta(propostaNova.status);

        propostaNova.dataEnvio = textoSeguro(propostaAnterior?.dataEnvio, propostaNova.dataEnvio || '');
        propostaNova.dataAprovacao = textoSeguro(propostaAnterior?.dataAprovacao, propostaNova.dataAprovacao || '');
        propostaNova.dataCancelamento = textoSeguro(propostaAnterior?.dataCancelamento, propostaNova.dataCancelamento || '');
        propostaNova.dataConversaoLocacao = textoSeguro(propostaAnterior?.dataConversaoLocacao, propostaNova.dataConversaoLocacao || '');

        if (atual === 'enviada' && !propostaNova.dataEnvio) propostaNova.dataEnvio = agoraIso;
        if (atual === 'aprovada' && !propostaNova.dataAprovacao) propostaNova.dataAprovacao = agoraIso;
        if ((atual === 'cancelada' || atual === 'recusada') && !propostaNova.dataCancelamento) propostaNova.dataCancelamento = agoraIso;
        if (atual === 'convertida' && !propostaNova.dataConversaoLocacao) propostaNova.dataConversaoLocacao = agoraIso;

        if (anterior !== atual && typeof registrarLog === 'function') {
            registrarLog('proposta', 'status', `Status da proposta ${propostaNova.codigo} alterado: ${statusRotulo(anterior)} -> ${statusRotulo(atual)}.`);
        }
    }

    function salvarProposta() {
        const proposta = coletarDadosFormulario(true);
        if (!proposta) return;

        const lista = obterPropostasBase();
        const indice = lista.findIndex((item) => String(item.id) === String(proposta.id));
        const agoraIso = obterAgoraIso();

        if (indice >= 0) {
            const anterior = lista[indice];
            proposta.dataCriacao = anterior.dataCriacao || proposta.dataCriacao || agoraIso;
            proposta.criadoPor = anterior.criadoPor || proposta.criadoPor || obterUsuarioAtualNomeOuEmail();
            proposta.locacaoVinculadaId = anterior.locacaoVinculadaId || proposta.locacaoVinculadaId || '';
            proposta.locacaoId = proposta.locacaoVinculadaId;
            proposta.dataUltimaAlteracao = agoraIso;
            proposta.alteradoPor = obterUsuarioAtualNomeOuEmail();
            aplicarDatasAutomaticasStatus(proposta, anterior, agoraIso);
            proposta.criadoEm = proposta.dataCriacao;
            proposta.atualizadoEm = proposta.dataUltimaAlteracao;
            lista[indice] = normalizarProposta(proposta);
        } else {
            proposta.dataCriacao = proposta.dataCriacao || agoraIso;
            proposta.dataUltimaAlteracao = agoraIso;
            proposta.criadoPor = proposta.criadoPor || obterUsuarioAtualNomeOuEmail();
            proposta.alteradoPor = proposta.alteradoPor || proposta.criadoPor;
            aplicarDatasAutomaticasStatus(proposta, null, agoraIso);
            proposta.criadoEm = proposta.dataCriacao;
            proposta.atualizadoEm = proposta.dataUltimaAlteracao;
            lista.push(normalizarProposta(proposta));
        }

        propostas = lista;
        salvarLocal();
        renderTudo();
        sincronizar('salvar');

        if (typeof registrarLog === 'function') {
            registrarLog('proposta', indice >= 0 ? 'editar' : 'criar', `Proposta ${proposta.codigo} salva para ${proposta.cliente.nome}.`);
        }
        mostrarToast(indice >= 0 ? 'Proposta atualizada!' : 'Proposta salva!');
        preencherFormularioComProposta(proposta);
        if (typeof focarRegistroRecemSalvo === 'function') {
            focarRegistroRecemSalvo({ tabId: 'propostas', tabelaId: 'tblPropostas', attr: 'data-proposta-id', id: proposta.id });
        }
    }

    function editarProposta(id) {
        const proposta = localizarProposta(id);
        if (!proposta) {
            mostrarToast('Proposta nao encontrada.', 'erro');
            return;
        }
        preencherFormularioComProposta(proposta);
        if (typeof abrirTab === 'function') abrirTab('propostas', { semRolagem: true });
        setTimeout(() => {
            const card = document.getElementById('propostasFormularioCard');
            if (card && typeof rolarParaElementoAtalho === 'function') {
                rolarParaElementoAtalho(card, 'start');
                destacarAlvoAtalho(card, 1200);
            }
            document.getElementById('propClienteNome')?.focus();
        }, 90);
    }

    function editarPropostaAtual() {
        const id = obterIdPropostaEmEdicao();
        if (!id) {
            mostrarToast('Selecione uma proposta da lista para editar.', 'info');
            return;
        }
        editarProposta(id);
    }

    function duplicarProposta(id) {
        const base = localizarProposta(id);
        if (!base) {
            mostrarToast('Proposta nao encontrada para duplicar.', 'erro');
            return;
        }

        const agoraIso = obterAgoraIso();
        const novaId = Date.now() + Math.floor(Math.random() * 500);
        const copia = normalizarProposta({
            ...base,
            id: novaId,
            codigo: gerarCodigoProposta(),
            status: 'rascunho',
            locacaoVinculadaId: '',
            locacaoId: '',
            dataCriacao: agoraIso,
            dataUltimaAlteracao: agoraIso,
            criadoPor: obterUsuarioAtualNomeOuEmail(),
            alteradoPor: obterUsuarioAtualNomeOuEmail(),
            dataEnvio: '',
            dataAprovacao: '',
            dataCancelamento: '',
            dataConversaoLocacao: '',
            evento: {
                ...base.evento,
                nome: `${base.evento.nome || 'Evento'} (copia)`
            }
        });

        propostas = [...obterPropostasBase(), copia];
        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        if (typeof registrarLog === 'function') {
            registrarLog('proposta', 'duplicar', `Proposta ${base.codigo} duplicada para ${copia.codigo}.`);
        }
        mostrarToast('Proposta duplicada com sucesso.');
        preencherFormularioComProposta(copia);
        if (typeof focarRegistroRecemSalvo === 'function') {
            focarRegistroRecemSalvo({ tabId: 'propostas', tabelaId: 'tblPropostas', attr: 'data-proposta-id', id: copia.id });
        }
    }

    function duplicarPropostaAtual() {
        const id = obterIdPropostaEmEdicao();
        if (!id) {
            mostrarToast('Abra uma proposta para duplicar.', 'info');
            return;
        }
        duplicarProposta(id);
    }

    function excluirProposta(id) {
        const proposta = localizarProposta(id);
        if (!proposta) {
            mostrarToast('Proposta nao encontrada para exclusao.', 'erro');
            return;
        }

        const executar = () => {
            propostas = obterPropostasBase().filter((item) => String(item.id) !== String(id));
            salvarLocal();
            renderTudo();
            sincronizar('salvar');
            if (typeof registrarLog === 'function') {
                registrarLog('proposta', 'excluir', `Proposta ${proposta.codigo} excluida.`);
            }
            mostrarToast('Proposta excluida.');
            if (String(obterIdPropostaEmEdicao()) === String(id)) limparFormularioProposta();
        };

        if (typeof confirmarAcao === 'function') {
            confirmarAcao(`Excluir a proposta ${proposta.codigo}?`, executar, {
                titulo: 'Excluir proposta',
                textoConfirmar: 'Excluir',
                classeConfirmar: 'btn-danger'
            });
            return;
        }

        if (confirm(`Excluir a proposta ${proposta.codigo}?`)) executar();
    }

    function excluirPropostaAtual() {
        const id = obterIdPropostaEmEdicao();
        if (!id) {
            mostrarToast('Abra uma proposta para excluir.', 'info');
            return;
        }
        excluirProposta(id);
    }

    function obterValorFinalComercial(proposta) {
        const tipo = normalizarTipoCalculoNF(proposta?.financeiro?.tipoCalculoNF, 'descontar');
        const valorFinal = numeroNaoNegativo(proposta?.financeiro?.valorFinal, 0);
        const valorFinalComNF = numeroNaoNegativo(proposta?.financeiro?.valorFinalComNF, valorFinal);
        return tipo === 'acrescentar' ? valorFinalComNF : valorFinal;
    }

    function rotuloTipoCalculoNF(tipo) {
        return normalizarTipoCalculoNF(tipo, 'descontar') === 'acrescentar'
            ? 'Acrescentar ao valor final'
            : 'Descontar do valor final';
    }

    function encontrarOuCriarClienteDaProposta(proposta) {
        const documento = String(proposta?.cliente?.documento || '').replace(/\D+/g, '');
        const email = normalizarTextoBusca(proposta?.cliente?.email || '');
        const nome = normalizarTextoBusca(proposta?.cliente?.nome || '');

        let cliente = (Array.isArray(locadores) ? locadores : []).find((item) => {
            const docItem = String(item?.documento || '').replace(/\D+/g, '');
            const emailItem = normalizarTextoBusca(item?.email || '');
            const nomeItem = normalizarTextoBusca(item?.nome || '');
            if (documento && docItem === documento) return true;
            if (email && emailItem && emailItem === email) return true;
            return nome && nomeItem && nomeItem === nome;
        });

        if (cliente) return cliente;

        const novoId = Date.now() + Math.floor(Math.random() * 500);
        cliente = {
            id: novoId,
            nome: proposta.cliente.nome || 'Cliente da proposta',
            documento: proposta.cliente.documento || '',
            telefone: proposta.cliente.telefone || '',
            email: proposta.cliente.email || '',
            endereco: proposta.cliente.endereco || ''
        };
        if (!Array.isArray(locadores)) locadores = [];
        locadores.push(cliente);
        return cliente;
    }

    function encontrarPecaPorDescricao(itemProposta) {
        const alvo = normalizarTextoBusca(itemProposta?.descricao || '');
        if (!alvo) return null;
        const lista = Array.isArray(pecas) ? pecas : [];
        const exata = lista.find((peca) => normalizarTextoBusca(peca?.nome || '') === alvo);
        if (exata) return exata;
        return lista.find((peca) => {
            const nomePeca = normalizarTextoBusca(peca?.nome || '');
            return nomePeca.includes(alvo) || alvo.includes(nomePeca);
        }) || null;
    }

    function executarConversaoPropostaLocacao(proposta) {
        const cliente = encontrarOuCriarClienteDaProposta(proposta);
        const hojeIso = obterHojeIso();
        const dataMontagem = proposta.evento.dataMontagem || proposta.evento.dataEvento || hojeIso;
        const dataDesmontagem = proposta.evento.dataDesmontagem || proposta.evento.dataEvento || dataMontagem;
        const valorFinalComercial = obterValorFinalComercial(proposta);
        const custosProposta = proposta.custos && typeof proposta.custos === 'object' ? proposta.custos : {};
        const freteKm = calcularFretePorKm(
            custosProposta.freteDistanciaKm ?? custosProposta.distanciaKm,
            custosProposta.freteValorKm ?? custosProposta.valorKm,
            custosProposta.freteTrechos ?? custosProposta.trechos ?? 1
        );
        const custoFrete = freteKm.calculoAtivo
            ? freteKm.freteCalculado
            : numeroNaoNegativo(custosProposta.frete, 0);
        const enderecoEvento = textoSeguro(proposta.evento.enderecoEvento || proposta.evento.local || '');
        const cidadeEvento = textoSeguro(proposta.evento.cidadeEvento || '');
        const observacoesLogistica = [
            textoSeguro(proposta.evento.referenciaAcesso || ''),
            textoSeguro(proposta.evento.observacoesGerais || '')
        ].filter(Boolean).join(' | ');
        const valorEntradaLocacao = numeroNaoNegativo(proposta.financeiro.valorEntrada, 0);
        const valorRestanteLocacao = numeroNaoNegativo(
            proposta.financeiro.valorSaldo,
            Math.max(valorFinalComercial - valorEntradaLocacao, 0)
        );
        const statusPagamentoLocacao = valorFinalComercial > 0 && valorRestanteLocacao <= 0
            ? 'pago'
            : valorEntradaLocacao > 0
                ? 'parcial'
                : 'pendente';

        const itensLocacao = proposta.itens.map((item) => {
            const peca = encontrarPecaPorDescricao(item);
            const periodoDias = numeroNaoNegativo(item.periodoDias ?? item.periodo, 1) || 1;
            const quantidade = Math.max(1, Math.trunc(numeroNaoNegativo(item.quantidade, 1)));
            const valorUnitario = numeroNaoNegativo(item.valorUnitario, 0);
            return {
                pecaId: peca?.id || '',
                nome: item.descricao,
                quantidade,
                valor: valorUnitario,
                periodoDias,
                valorTotalProposta: arredondarMoeda(periodoDias * quantidade * valorUnitario)
            };
        });

        const novaLocacaoId = Date.now() + Math.floor(Math.random() * 700);
        const novaLocacaoBase = {
            id: novaLocacaoId,
            origemPropostaId: proposta.id,
            codigoProposta: proposta.codigo,
            locadorId: cliente.id,
            dataAluguel: dataMontagem,
            dataDevolucaoPrevisao: dataDesmontagem,
            eventoNome: proposta.evento.nome || '',
            eventoLocal: proposta.evento.local || '',
            eventoEndereco: proposta.evento.enderecoEvento || '',
            cidadeEvento: proposta.evento.cidadeEvento || '',
            ufEvento: proposta.evento.ufEvento || '',
            referenciaAcesso: proposta.evento.referenciaAcesso || '',
            observacoesGerais: proposta.evento.observacoesGerais || '',
            items: itensLocacao,
            status: 'ativo',
            statusFluxo: 'aprovado',
            divisorFatura: 1,
            datasMontagem: {
                inicio: dataMontagem,
                fim: proposta.evento.dataEvento || dataMontagem,
                horarioInicio: proposta.evento.horaMontagem || '',
                horarioFim: proposta.evento.horaInicioEvento || ''
            },
            datasDesmontagem: {
                inicio: dataDesmontagem,
                fim: dataDesmontagem,
                horarioInicio: proposta.evento.horaFimEvento || '',
                horarioFim: proposta.evento.horaDesmontagem || ''
            },
            equipe: {
                responsavel: proposta.responsavelProposta || '',
                membros: [],
                observacoes: proposta.evento.observacoesGerais || ''
            },
            logistica: {
                veiculo: '',
                motorista: '',
                horarioSaida: proposta.evento.horaMontagem || '',
                horarioChegada: proposta.evento.horaInicioEvento || '',
                dataSaida: dataMontagem,
                dataChegada: dataMontagem,
                endereco: enderecoEvento,
                cidade: cidadeEvento,
                distanciaKm: freteKm.distanciaKm,
                valorKm: freteKm.valorKm,
                trechos: freteKm.trechos,
                custoFrete,
                statusEntrega: 'pendente',
                statusRetirada: 'pendente',
                observacoes: observacoesLogistica
            },
            financeiro: {
                valorTotal: valorFinalComercial,
                sinal: valorEntradaLocacao,
                valorRestante: valorRestanteLocacao,
                vencimento: proposta.financeiro.vencimentoSaldo || proposta.evento.dataEvento || dataMontagem,
                formaPagamento: rotuloFormaPagamento(proposta.financeiro.formaPagamento),
                statusPagamento: statusPagamentoLocacao,
                notaFiscal: '',
                comprovante: '',
                condicaoPagamento: proposta.financeiro.condicaoPagamento || '',
                observacaoPagamento: proposta.financeiro.observacaoPagamento || '',
                percentualEntrada: numeroNaoNegativo(proposta.financeiro.percentualEntrada, 50),
                percentualSaldo: numeroNaoNegativo(proposta.financeiro.percentualSaldo, 50)
            },
            checklist: {
                idChecklist: null,
                status: 'nao_iniciado',
                ultimaAtualizacao: '',
                observacoes: ''
            },
            historicoAlteracoes: []
        };

        let novaLocacao = novaLocacaoBase;
        if (typeof normalizarLocacaoDominio === 'function') {
            novaLocacao = normalizarLocacaoDominio(novaLocacaoBase, { incluirDerivados: false });
        }
        if (typeof atualizarStatusLocacaoDominio === 'function') {
            atualizarStatusLocacaoDominio(novaLocacao, 'aprovado', {
                acao: 'conversao_proposta',
                descricao: `Locacao criada a partir da proposta ${proposta.codigo}.`,
                origem: 'propostas',
                forcarHistorico: true
            });
        }

        if (!Array.isArray(locacoes)) locacoes = [];
        locacoes.push(novaLocacao);
        if (typeof criarTransporteDaLocacao === 'function' && (custoFrete > 0 || enderecoEvento || cidadeEvento)) {
            criarTransporteDaLocacao(novaLocacao, {
                tipoOperacao: 'entrega',
                dataSaida: dataMontagem,
                horaSaida: proposta.evento.horaMontagem || '',
                dataChegada: dataMontagem,
                horaChegada: proposta.evento.horaInicioEvento || '',
                endereco: enderecoEvento,
                cidade: cidadeEvento,
                distanciaKm: freteKm.distanciaKm,
                valorKm: freteKm.valorKm,
                trechos: freteKm.trechos,
                custoEstimado: custoFrete,
                observacoes: observacoesLogistica,
                evitarDuplicado: true
            });
        }

        const agoraIso = obterAgoraIso();
        propostas = obterPropostasBase().map((item) => {
            if (String(item.id) !== String(proposta.id)) return item;
            const atualizada = {
                ...item,
                status: 'convertida',
                locacaoVinculadaId: String(novaLocacaoId),
                locacaoId: String(novaLocacaoId),
                dataConversaoLocacao: agoraIso,
                dataUltimaAlteracao: agoraIso,
                alteradoPor: obterUsuarioAtualNomeOuEmail()
            };
            atualizada.atualizadoEm = atualizada.dataUltimaAlteracao;
            return normalizarProposta(atualizada);
        });

        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        if (typeof registrarLog === 'function') {
            registrarLog('proposta', 'converter', `Proposta ${proposta.codigo} convertida na locacao #${String(novaLocacaoId).slice(-4)}.`);
        }
        mostrarToast('Proposta convertida em locacao fechada!');
        if (typeof irParaLocacaoPorCodigo === 'function') {
            setTimeout(() => irParaLocacaoPorCodigo(String(novaLocacaoId)), 120);
        }
    }

    function converterPropostaEmLocacaoFechada(id) {
        const proposta = localizarProposta(id);
        if (!proposta) {
            mostrarToast('Proposta nao encontrada para conversao.', 'erro');
            return;
        }
        if (!Array.isArray(proposta.itens) || proposta.itens.length === 0) {
            mostrarToast('A proposta nao possui itens para converter.', 'erro');
            return;
        }

        const jaConvertida = textoSeguro(proposta.locacaoVinculadaId || proposta.locacaoId, '');
        if (jaConvertida) {
            const confirmarNovaConversao = () => executarConversaoPropostaLocacao(proposta);
            if (typeof confirmarAcao === 'function') {
                confirmarAcao(
                    `A proposta ${proposta.codigo} ja esta vinculada a locacao #${String(jaConvertida).slice(-4)}. Deseja criar uma nova locacao mesmo assim?`,
                    confirmarNovaConversao,
                    {
                        titulo: 'Proposta ja convertida',
                        textoConfirmar: 'Converter novamente',
                        classeConfirmar: 'btn-warning'
                    }
                );
                return;
            }
            if (!confirm(`A proposta ${proposta.codigo} ja esta vinculada a uma locacao. Deseja converter novamente?`)) return;
            confirmarNovaConversao();
            return;
        }

        executarConversaoPropostaLocacao(proposta);
    }

    function converterPropostaAtual() {
        const id = obterIdPropostaEmEdicao();
        if (!id) {
            mostrarToast('Abra uma proposta para converter.', 'info');
            return;
        }
        converterPropostaEmLocacaoFechada(id);
    }

    function linhaResumoPdf(rotulo, valor, destaque = false) {
        return `
            <tr>
                <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; ${destaque ? 'font-weight:700;' : ''}">${rotulo}</td>
                <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right; ${destaque ? 'font-weight:700;' : ''}">${valor}</td>
            </tr>
        `;
    }

    function montarHtmlPdfProposta(proposta) {
        const p = normalizarProposta(proposta);
        const exibirInterno = p.financeiro.exibirInformacoesInternasPDF === true;
        const tipoNF = normalizarTipoCalculoNF(p.financeiro.tipoCalculoNF, 'descontar');
        const valorFinalComercial = obterValorFinalComercial(p);

        const linhasItens = p.itens.map((item) => `
            <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:8px; font-size:11px;">${sanitizar(item.descricao)}</td>
                <td style="padding:8px; text-align:center; font-size:11px;">${sanitizar(item.medida || '-')}</td>
                <td style="padding:8px; text-align:center; font-size:11px;">${numeroNaoNegativo(item.periodoDias, 1)}</td>
                <td style="padding:8px; text-align:center; font-size:11px;">${item.quantidade}</td>
                <td style="padding:8px; text-align:right; font-size:11px;">${formatarMoeda(item.valorUnitario)}</td>
                <td style="padding:8px; text-align:right; font-size:11px;">${formatarMoeda(item.valorTotal)}</td>
                <td style="padding:8px; font-size:11px;">${sanitizar(item.observacoes || '-')}</td>
            </tr>
        `).join('');

        const custosAdicionaisResumo = numeroNaoNegativo(p.financeiro.totalCustosAdicionais, 0);
        const custoTotalInterno = numeroNaoNegativo(p.controleInterno.custoTotalProposta, 0);

        const blocoResumoFinanceiro = `
            <table style="width:100%; border-collapse:collapse; font-size:11px;">
                <tbody>
                    ${linhaResumoPdf('Subtotal', formatarMoeda(p.financeiro.subtotal))}
                    ${(numeroNaoNegativo(p.custos.freteDistanciaKm, 0) > 0 && numeroNaoNegativo(p.custos.freteValorKm, 0) > 0)
                        ? linhaResumoPdf(
                            `Frete (${numeroNaoNegativo(p.custos.freteTrechos, 1)} x ${numeroNaoNegativo(p.custos.freteDistanciaKm, 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km x ${formatarMoeda(p.custos.freteValorKm)}/km)`,
                            formatarMoeda(p.custos.frete)
                        )
                        : ''}
                    ${(custosAdicionaisResumo > 0 || exibirInterno) ? linhaResumoPdf('Custos adicionais', formatarMoeda(custosAdicionaisResumo)) : ''}
                    ${linhaResumoPdf('Desconto', formatarMoeda(p.financeiro.desconto))}
                    ${linhaResumoPdf('Acrescimo', formatarMoeda(p.financeiro.acrescimo))}
                    ${(tipoNF === 'acrescentar' || exibirInterno) ? linhaResumoPdf(`Percentual NF (${formatarPercentual(p.financeiro.percentualNF)})`, formatarMoeda(p.financeiro.valorNF)) : ''}
                    ${(tipoNF === 'acrescentar' || exibirInterno) ? linhaResumoPdf('Tipo calculo NF', sanitizar(rotuloTipoCalculoNF(tipoNF))) : ''}
                    ${linhaResumoPdf('Valor final da proposta', formatarMoeda(valorFinalComercial), true)}
                </tbody>
            </table>
        `;

        const blocoResumoInterno = exibirInterno ? `
            <div style="border:1px solid #cbd5e1; border-radius:10px; padding:10px; margin-top:10px;">
                <strong style="display:block; margin-bottom:6px; font-size:12px;">Resumo interno</strong>
                <table style="width:100%; border-collapse:collapse; font-size:11px;">
                    <tbody>
                        ${linhaResumoPdf('Valor final base', formatarMoeda(p.financeiro.valorFinal))}
                        ${linhaResumoPdf('Valor final com NF', formatarMoeda(p.financeiro.valorFinalComNF))}
                        ${linhaResumoPdf('Valor liquido previsto', formatarMoeda(p.financeiro.valorLiquidoPrevisto))}
                        ${linhaResumoPdf('Custo total interno', formatarMoeda(custoTotalInterno))}
                        ${linhaResumoPdf('Lucro previsto', formatarMoeda(p.controleInterno.lucroPrevisto))}
                        ${linhaResumoPdf('Margem prevista', formatarPercentual(p.controleInterno.margemPrevista))}
                    </tbody>
                </table>
            </div>
        ` : '';

        const header = typeof getHeaderMTZ === 'function' ? getHeaderMTZ() : '';
        const footer = typeof getFooterMTZ === 'function' ? getFooterMTZ() : '';

        return `
            <div style="background:#fff; min-height:100%; width:100%; color:#000;">
                ${header}
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:18px; border-bottom:2px solid #111827; padding-bottom:10px;">
                    <div>
                        <h2 style="margin:0; font-size:22px;">PROPOSTA COMERCIAL</h2>
                        <div style="margin-top:6px; font-size:12px;">${sanitizar(p.codigo)} • ${statusRotulo(p.status)}</div>
                    </div>
                    <div style="text-align:right; font-size:11px;">
                        <div><strong>Criacao:</strong> ${formatarData(p.dataCriacao)}</div>
                        <div><strong>Validade:</strong> ${formatarData(p.financeiro.validadePropostaData)}</div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
                    <div style="border:1px solid #cbd5e1; border-radius:10px; padding:10px;">
                        <strong style="display:block; margin-bottom:8px; font-size:12px;">Dados do cliente</strong>
                        <div style="font-size:11px; line-height:1.45;">
                            <div><b>Nome/empresa:</b> ${sanitizar(p.cliente.nome || '-')}</div>
                            <div><b>CPF/CNPJ:</b> ${sanitizar(p.cliente.documento || '-')}</div>
                            <div><b>Telefone:</b> ${sanitizar(p.cliente.telefone || '-')}</div>
                            <div><b>E-mail:</b> ${sanitizar(p.cliente.email || '-')}</div>
                            <div><b>Endereco:</b> ${sanitizar(p.cliente.endereco || '-')}</div>
                        </div>
                    </div>
                    <div style="border:1px solid #cbd5e1; border-radius:10px; padding:10px;">
                        <strong style="display:block; margin-bottom:8px; font-size:12px;">Dados do evento</strong>
                        <div style="font-size:11px; line-height:1.45;">
                            <div><b>Evento:</b> ${sanitizar(p.evento.nome || '-')}</div>
                            <div><b>Local:</b> ${sanitizar(p.evento.local || '-')}</div>
                            <div><b>Endereco:</b> ${sanitizar(p.evento.enderecoEvento || '-')}</div>
                            <div><b>Cidade/UF:</b> ${sanitizar([p.evento.cidadeEvento, p.evento.ufEvento].filter(Boolean).join('/')) || '-'}</div>
                            <div><b>Montagem:</b> ${formatarData(p.evento.dataMontagem)} ${sanitizar(p.evento.horaMontagem || '')}</div>
                            <div><b>Evento:</b> ${formatarData(p.evento.dataEvento)} ${sanitizar(p.evento.horaInicioEvento || '')} ${p.evento.horaFimEvento ? `- ${sanitizar(p.evento.horaFimEvento)}` : ''}</div>
                            <div><b>Desmontagem:</b> ${formatarData(p.evento.dataDesmontagem)} ${sanitizar(p.evento.horaDesmontagem || '')}</div>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom:14px;">
                    <strong style="display:block; margin-bottom:6px; font-size:12px;">Itens da proposta</strong>
                    <table style="width:100%; border-collapse:collapse;">
                        <thead style="background:#0f172a; color:#fff;">
                            <tr>
                                <th style="padding:8px; text-align:left; font-size:10px; color:#fff;">ITEM</th>
                                <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">MEDIDA</th>
                                <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">DIAS</th>
                                <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">QTD</th>
                                <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">UNIT.</th>
                                <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">TOTAL</th>
                                <th style="padding:8px; text-align:left; font-size:10px; color:#fff;">OBS.</th>
                            </tr>
                        </thead>
                        <tbody>${linhasItens || '<tr><td colspan="7" style="padding:10px;">Sem itens</td></tr>'}</tbody>
                    </table>
                </div>

                <div style="display:grid; grid-template-columns:1fr; gap:16px;">
                    <div style="border:1px solid #111827; border-radius:10px; padding:10px;">
                        <strong style="display:block; margin-bottom:6px; font-size:12px;">Resumo financeiro</strong>
                        ${blocoResumoFinanceiro}
                        <div style="margin-top:8px; font-size:11px; line-height:1.5;">
                            <div><b>Pagamento:</b> ${sanitizar(p.financeiro.condicaoPagamento || '-')}</div>
                            <div><b>Forma:</b> ${sanitizar(rotuloFormaPagamento(p.financeiro.formaPagamento))}</div>
                            <div><b>Entrada:</b> ${formatarPercentual(p.financeiro.percentualEntrada)} (${formatarMoeda(p.financeiro.valorEntrada)})</div>
                            <div><b>Saldo:</b> ${formatarPercentual(p.financeiro.percentualSaldo)} (${formatarMoeda(p.financeiro.valorSaldo)})</div>
                            <div><b>Venc. entrada:</b> ${formatarData(p.financeiro.vencimentoEntrada)}</div>
                            <div><b>Venc. saldo:</b> ${formatarData(p.financeiro.vencimentoSaldo)}</div>
                            <div><b>Obs. pagamento:</b> ${sanitizar(p.financeiro.observacaoPagamento || '-')}</div>
                        </div>
                        ${blocoResumoInterno}
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr; gap:10px; margin-top:14px; font-size:11px;">
                    <div style="border:1px solid #cbd5e1; border-radius:8px; padding:10px;">
                        <b>Incluso na proposta</b><br>${sanitizar(p.escopo.inclusoProposta || '-')}
                    </div>
                    <div style="border:1px solid #cbd5e1; border-radius:8px; padding:10px;">
                        <b>Nao incluso na proposta</b><br>${sanitizar(p.escopo.naoInclusoProposta || '-')}
                    </div>
                    <div style="border:1px solid #cbd5e1; border-radius:8px; padding:10px;">
                        <b>Observacoes comerciais</b><br>${sanitizar(p.escopo.observacoesComerciais || '-')}
                    </div>
                </div>

                <div style="margin-top:10px; font-size:11px;">
                    <b>Responsavel:</b> ${sanitizar(p.responsavelProposta || '-')}
                </div>

                <div style="display:flex; justify-content:space-between; margin-top:42px;">
                    <div style="width:42%; text-align:center; border-top:1px solid #111827; padding-top:8px; font-size:10px;">MTZ EVENTOS</div>
                    <div style="width:42%; text-align:center; border-top:1px solid #111827; padding-top:8px; font-size:10px;">CLIENTE</div>
                </div>
                ${footer}
            </div>
        `;
    }

    function gerarPDFProposta(id) {
        const proposta = localizarProposta(id);
        if (!proposta) {
            mostrarToast('Proposta nao encontrada para PDF.', 'erro');
            return;
        }

        const printArea = document.getElementById('printArea');
        const modal = document.getElementById('modalRelatorio');
        if (!printArea || !modal) {
            mostrarToast('Area de impressao nao encontrada.', 'erro');
            return;
        }

        printArea.innerHTML = montarHtmlPdfProposta(proposta);
        modal.classList.add('active');
        mostrarToast('Pre-visualizacao pronta. Clique em "Salvar PDF".');
    }

    function gerarPDFPropostaAtual() {
        const id = obterIdPropostaEmEdicao();
        if (id) {
            gerarPDFProposta(id);
            return;
        }
        const propostaTemp = coletarDadosFormulario(false);
        if (!propostaTemp || propostaTemp.itens.length === 0) {
            mostrarToast('Preencha e salve a proposta antes de gerar PDF.', 'info');
            return;
        }
        const printArea = document.getElementById('printArea');
        const modal = document.getElementById('modalRelatorio');
        if (!printArea || !modal) {
            mostrarToast('Area de impressao nao encontrada.', 'erro');
            return;
        }
        printArea.innerHTML = montarHtmlPdfProposta(propostaTemp);
        modal.classList.add('active');
        mostrarToast('Pre-visualizacao pronta. Clique em "Salvar PDF".');
    }

    function atualizarKpisPropostas(lista) {
        const total = lista.length;
        const enviadas = lista.filter((item) => item.status === 'enviada' || item.status === 'em_negociacao').length;
        const aprovadas = lista.filter((item) => item.status === 'aprovada' || item.status === 'convertida').length;
        const valorPipeline = lista.reduce((acc, item) => {
            if (item.status === 'cancelada' || item.status === 'recusada') return acc;
            return acc + obterValorFinalComercial(item);
        }, 0);

        const mapa = [
            ['propKpiTotal', String(total)],
            ['propKpiEnviadas', String(enviadas)],
            ['propKpiAprovadas', String(aprovadas)],
            ['propKpiValor', formatarMoeda(valorPipeline)]
        ];
        mapa.forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = valor;
        });
    }

    function aplicarFiltroPropostas(filtro = 'todos') {
        const normalizado = normalizarTextoBusca(filtro || 'todos');
        filtroPropostasAtual = FILTROS_PROPOSTA.has(normalizado) ? normalizado : 'todos';
        try {
            localStorage.setItem(CHAVE_FILTRO_PROPOSTAS, filtroPropostasAtual);
        } catch (_) {
            // Ignora falha.
        }
        renderPropostas();
    }

    function atualizarFiltroVisualPropostas() {
        document.querySelectorAll('#propostasFiltros [data-filtro-proposta]').forEach((btn) => {
            const ativo = String(btn.getAttribute('data-filtro-proposta') || '') === String(filtroPropostasAtual);
            btn.classList.toggle('is-active', ativo);
            btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });
    }

    function renderPropostas() {
        const tbody = document.getElementById('tblPropostas');
        if (!tbody) return;

        const base = obterPropostasBase();
        const termoRaw = textoSeguro(document.getElementById('buscaPropostas')?.value);
        const termo = normalizarTextoBusca(termoRaw);
        atualizarKpisPropostas(base);
        atualizarFiltroVisualPropostas();

        const filtradas = base.filter((proposta) => {
            if (filtroPropostasAtual !== 'todos' && proposta.status !== filtroPropostasAtual) return false;
            if (!termo) return true;
            const alvo = normalizarTextoBusca([
                proposta.codigo,
                proposta.cliente?.nome,
                proposta.cliente?.documento,
                proposta.evento?.nome,
                proposta.evento?.cidadeEvento,
                proposta.responsavelProposta,
                statusRotulo(proposta.status),
                formatarData(proposta.evento?.dataEvento)
            ].join(' '));
            return alvo.includes(termo);
        });

        filtradas.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

        if (typeof atualizarMetaBusca === 'function') {
            atualizarMetaBusca('metaBuscaPropostas', {
                total: base.length,
                filtrados: filtradas.length,
                rotulo: 'propostas',
                termo: termoRaw,
                filtro: filtroPropostasAtual,
                filtroLabel: statusRotulo(filtroPropostasAtual)
            });
        }

        if (!filtradas.length) {
            tbody.innerHTML = typeof criarLinhaTabelaEstado === 'function'
                ? criarLinhaTabelaEstado(9, {
                    tipo: 'empty',
                    titulo: 'Nenhuma proposta encontrada',
                    mensagem: termoRaw
                        ? `Sem resultados para "${termoRaw}".`
                        : 'Cadastre a primeira proposta para iniciar o pipeline.'
                })
                : '<tr><td colspan="9">Nenhuma proposta encontrada.</td></tr>';
            return;
        }

        tbody.innerHTML = filtradas.map((proposta) => {
            const locacaoId = textoSeguro(proposta.locacaoVinculadaId || proposta.locacaoId);
            return `
                <tr data-proposta-id="${proposta.id}">
                    <td>${sanitizar(proposta.codigo)}</td>
                    <td>${sanitizar(proposta.cliente.nome || '-')}</td>
                    <td>${sanitizar(proposta.evento.nome || '-')}</td>
                    <td>${formatarData(proposta.evento.dataEvento)}</td>
                    <td>${formatarMoeda(obterValorFinalComercial(proposta))}</td>
                    <td><span class="badge ${statusBadge(proposta.status)}">${statusRotulo(proposta.status)}</span></td>
                    <td>${sanitizar(proposta.responsavelProposta || '-')}</td>
                    <td>${locacaoId ? `#${sanitizar(String(locacaoId).slice(-6))}` : '-'}</td>
                    <td class="col-actions">
                        <div class="actions-cell">
                            <button class="btn btn-sm btn-info table-action-btn" data-action="editarProposta" data-arg="${proposta.id}" title="Editar">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-secondary table-action-btn" data-action="duplicarProposta" data-arg="${proposta.id}" title="Duplicar">
                                <i class="bi bi-files"></i>
                            </button>
                            <button class="btn btn-sm btn-primary table-action-btn" data-action="gerarPDFProposta" data-arg="${proposta.id}" title="Gerar PDF">
                                <i class="bi bi-printer"></i>
                            </button>
                            <button class="btn btn-sm btn-success table-action-btn" data-action="converterPropostaEmLocacaoFechada" data-arg="${proposta.id}" title="Converter para locacao" ${locacaoId ? 'disabled' : ''}>
                                <i class="bi bi-check2-circle"></i>
                            </button>
                            <button class="btn btn-sm btn-danger table-action-btn" data-action="excluirProposta" data-arg="${proposta.id}" title="Excluir">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function irParaPropostasFormulario() {
        if (typeof abrirTab === 'function') abrirTab('propostas', { semRolagem: true });
        setTimeout(() => {
            const card = document.getElementById('propostasFormularioCard');
            if (card && typeof rolarParaElementoAtalho === 'function') {
                rolarParaElementoAtalho(card, 'start');
                destacarAlvoAtalho(card, 1200);
            }
            document.getElementById('propClienteNome')?.focus();
        }, 90);
    }

    function registrarListenersPropostas() {
        if (listenersRegistrados) return;
        listenersRegistrados = true;

        const campoDias = document.getElementById('propValidadeDias');
        const campoData = document.getElementById('propValidadeData');
        const campoStatus = document.getElementById('propStatus');

        if (campoDias) {
            campoDias.addEventListener('input', () => {
                sincronizarValidadePorDias();
                recalcularResumoProposta();
            });
        }
        if (campoData) {
            campoData.addEventListener('change', () => {
                sincronizarValidadePorData();
            });
        }
        if (campoStatus) {
            campoStatus.addEventListener('change', () => recalcularResumoProposta());
        }
    }

    function inicializarPropostas() {
        if (!Array.isArray(propostas)) propostas = [];
        try {
            const salvo = normalizarTextoBusca(localStorage.getItem(CHAVE_FILTRO_PROPOSTAS) || '');
            filtroPropostasAtual = FILTROS_PROPOSTA.has(salvo) ? salvo : 'todos';
        } catch (_) {
            filtroPropostasAtual = 'todos';
        }
        registrarListenersPropostas();
        aplicarValorKmFretePadraoProposta();
    }

    inicializarPropostas();

    window.calcularResumoProposta = calcularResumoProposta;
    window.renderPropostas = renderPropostas;
    window.recalcularResumoProposta = recalcularResumoProposta;
    window.adicionarLinhaItemProposta = adicionarLinhaItemProposta;
    window.removerLinhaItemProposta = removerLinhaItemProposta;
    window.salvarProposta = salvarProposta;
    window.limparFormularioProposta = limparFormularioProposta;
    window.editarProposta = editarProposta;
    window.editarPropostaAtual = editarPropostaAtual;
    window.duplicarProposta = duplicarProposta;
    window.duplicarPropostaAtual = duplicarPropostaAtual;
    window.excluirProposta = excluirProposta;
    window.excluirPropostaAtual = excluirPropostaAtual;
    window.gerarPDFProposta = gerarPDFProposta;
    window.gerarPDFPropostaAtual = gerarPDFPropostaAtual;
    window.converterPropostaEmLocacaoFechada = converterPropostaEmLocacaoFechada;
    window.converterPropostaAtual = converterPropostaAtual;
    window.aplicarFiltroPropostas = aplicarFiltroPropostas;
    window.irParaPropostasFormulario = irParaPropostasFormulario;
    window.aplicarValorKmFretePadraoProposta = aplicarValorKmFretePadraoProposta;
})();
