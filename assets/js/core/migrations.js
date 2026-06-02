// Migracoes de schema (v12)
const SCHEMA_VERSION_V12 = '12.1';

const STATUS_ESTOQUE_V12 = new Set(['ativo', 'inativo', 'manutencao', 'avariado', 'perdido']);
const STATUS_FLUXO_LOCACAO_V12 = new Set([
    'orcamento',
    'aprovado',
    'separado',
    'carregado',
    'montado',
    'finalizado',
    'devolvido',
    'cancelado'
]);
const STATUS_PAGAMENTO_V12 = new Set(['pendente', 'parcial', 'pago', 'atrasado', 'cancelado']);
const STATUS_LOGISTICA_V12 = new Set(['pendente', 'agendado', 'em_rota', 'concluida', 'cancelada']);
const PERFIS_USUARIO_V12 = new Set(['administrador', 'comercial', 'financeiro', 'logistica', 'montagem', 'operacao']);
const STATUS_PROPOSTA_V12 = new Set([
    'rascunho',
    'enviada',
    'em_negociacao',
    'aprovada',
    'cancelada',
    'recusada',
    'convertida'
]);

function clonarObjetoSeguro(valor, fallback = {}) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...fallback };
    return { ...fallback, ...valor };
}

function clonarArraySeguro(valor) {
    return Array.isArray(valor) ? valor.slice() : [];
}

function textoSeguro(valor, fallback = '') {
    if (valor == null) return fallback;
    return String(valor);
}

function numeroNaoNegativo(valor, fallback = 0) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) return Math.max(0, Number(fallback) || 0);
    return numero;
}

function numeroSeguro(valor, fallback = 0) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return Number(fallback) || 0;
    return numero;
}

function inteiroNaoNegativo(valor, fallback = 0) {
    return Math.max(0, Math.trunc(numeroNaoNegativo(valor, fallback)));
}

function valorEmConjunto(valor, conjunto, fallback) {
    const normalizado = String(valor || '').trim().toLowerCase();
    return conjunto.has(normalizado) ? normalizado : fallback;
}

function criarPermissoesPadraoV12(perfil) {
    const base = {
        dashboard: true,
        clientes: true,
        propostas: true,
        tipos: true,
        estoque: true,
        locacoes: true,
        devolucoes: true,
        checklist: true,
        auditoria: true,
        config: true,
        backup: true
    };

    if (perfil === 'administrador') return base;

    if (perfil === 'comercial') {
        return { ...base, estoque: false, config: false, backup: false, auditoria: false };
    }
    if (perfil === 'financeiro') {
        return { ...base, checklist: false, estoque: false, config: false, backup: false };
    }
    if (perfil === 'logistica') {
        return { ...base, tipos: false, config: false, backup: false };
    }
    if (perfil === 'montagem') {
        return { ...base, dashboard: false, tipos: false, config: false, backup: false, auditoria: false };
    }

    // operacao
    return { ...base, config: false, backup: false, auditoria: false };
}

function normalizarPerfilUsuarioV12(perfil) {
    const valor = String(perfil || '').trim().toLowerCase();
    if (PERFIS_USUARIO_V12.has(valor)) return valor;
    if (valor === 'admin') return 'administrador';
    return 'operacao';
}

function normalizarPermissoesUsuarioV12(permissoes, perfil) {
    const padrao = criarPermissoesPadraoV12(perfil);
    if (!permissoes || typeof permissoes !== 'object' || Array.isArray(permissoes)) return padrao;
    return { ...padrao, ...permissoes };
}

function calcularValorTotalLocacaoV12(locacao) {
    const itens = Array.isArray(locacao?.items) ? locacao.items : [];
    const subtotal = itens.reduce((acumulado, item) => {
        const valor = Number(item?.valor) || 0;
        const quantidade = Number(item?.quantidade) || 0;
        return acumulado + (valor * quantidade);
    }, 0);

    const divisor = Number(locacao?.divisorFatura);
    const divisorValido = Number.isFinite(divisor) && divisor > 0 ? divisor : 1;
    return subtotal / divisorValido;
}

function inferirStatusFluxoLocacaoV12(locacao) {
    const statusFluxoAtual = valorEmConjunto(locacao?.statusFluxo, STATUS_FLUXO_LOCACAO_V12, '');
    if (statusFluxoAtual) return statusFluxoAtual;

    const statusAtual = String(locacao?.status || '').toLowerCase();
    if (statusAtual === 'devolvido') return 'devolvido';
    if (statusAtual === 'cancelado') return 'cancelado';
    return 'aprovado';
}

function criarHistoricoInicialEstoqueV12(peca, dataMigracaoIso) {
    return [{
        id: `mig-${peca.id || Date.now()}`,
        data: dataMigracaoIso,
        tipo: 'ajuste',
        origem: 'migracao_v12',
        quantidade: inteiroNaoNegativo(peca.quantidadeTotal, peca.quantidade),
        saldo: inteiroNaoNegativo(peca.disponivel, peca.quantidade),
        observacao: 'Registro inicializado para schema v12.'
    }];
}

function migrarPecaParaV12(pecaOriginal, contexto) {
    const peca = clonarObjetoSeguro(pecaOriginal);
    const qtdTotal = inteiroNaoNegativo(peca.quantidadeTotal, peca.quantidade);
    const disponivel = inteiroNaoNegativo(peca.disponivel, qtdTotal);
    const reservadoPadrao = Math.max(qtdTotal - disponivel, 0);

    const historico = Array.isArray(peca.historicoMovimentacoes)
        ? peca.historicoMovimentacoes.slice()
        : [];

    const migrada = {
        ...peca,
        quantidadeTotal: qtdTotal,
        quantidade: qtdTotal, // compatibilidade legado
        disponivel,
        reservado: inteiroNaoNegativo(peca.reservado, reservadoPadrao),
        manutencao: inteiroNaoNegativo(peca.manutencao, 0),
        avariado: inteiroNaoNegativo(peca.avariado, 0),
        perdido: inteiroNaoNegativo(peca.perdido, 0),
        localizacao: textoSeguro(peca.localizacao, ''),
        historicoMovimentacoes: historico,
        codigoInterno: textoSeguro(peca.codigoInterno, peca.codigo || ''),
        qrCode: textoSeguro(peca.qrCode, peca.barras || peca.codigoBarras || ''),
        status: valorEmConjunto(peca.status, STATUS_ESTOQUE_V12, 'ativo')
    };

    if (!Array.isArray(peca.historicoMovimentacoes)) {
        migrada.historicoMovimentacoes = criarHistoricoInicialEstoqueV12(migrada, contexto.dataMigracaoIso);
        contexto.houveMudanca = true;
    }

    const camposNovos = [
        'quantidadeTotal', 'reservado', 'manutencao', 'avariado', 'perdido',
        'localizacao', 'codigoInterno', 'qrCode', 'status'
    ];
    if (camposNovos.some((campo) => !(campo in peca))) {
        contexto.houveMudanca = true;
    }

    return migrada;
}

function migrarLocacaoParaV12(locacaoOriginal, contexto) {
    const locacao = clonarObjetoSeguro(locacaoOriginal);
    const valorTotal = numeroNaoNegativo(
        locacao?.financeiro?.valorTotal,
        calcularValorTotalLocacaoV12(locacao)
    );
    const sinal = numeroNaoNegativo(locacao?.financeiro?.sinal, locacao?.sinal);
    const valorRestantePadrao = Math.max(valorTotal - sinal, 0);
    const statusPagamentoPadrao = locacao?.pago ? 'pago' : 'pendente';

    const locacaoMigrada = {
        ...locacao,
        statusFluxo: inferirStatusFluxoLocacaoV12(locacao),
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
            placa: '',
            dataSaida: '',
            dataChegada: '',
            horarioSaida: '',
            horarioChegada: '',
            endereco: '',
            cidade: '',
            distanciaKm: 0,
            valorKm: 0,
            trechos: 1,
            custoFrete: 0,
            statusEntrega: 'pendente',
            statusRetirada: 'pendente',
            observacoes: ''
        }),
        financeiro: clonarObjetoSeguro(locacao.financeiro, {
            valorTotal,
            sinal,
            valorRestante: valorRestantePadrao,
            vencimento: textoSeguro(locacao.dataDevolucaoPrevisao, ''),
            formaPagamento: '',
            statusPagamento: statusPagamentoPadrao,
            notaFiscal: '',
            comprovante: ''
        }),
        checklist: clonarObjetoSeguro(locacao.checklist, {
            idChecklist: null,
            status: 'nao_iniciado',
            ultimaAtualizacao: '',
            observacoes: ''
        }),
        historicoAlteracoes: clonarArraySeguro(locacao.historicoAlteracoes)
    };

    locacaoMigrada.logistica.statusEntrega = valorEmConjunto(
        locacaoMigrada.logistica.statusEntrega,
        STATUS_LOGISTICA_V12,
        'pendente'
    );
    locacaoMigrada.logistica.statusRetirada = valorEmConjunto(
        locacaoMigrada.logistica.statusRetirada,
        STATUS_LOGISTICA_V12,
        'pendente'
    );

    locacaoMigrada.financeiro.valorTotal = numeroNaoNegativo(locacaoMigrada.financeiro.valorTotal, valorTotal);
    locacaoMigrada.financeiro.sinal = numeroNaoNegativo(locacaoMigrada.financeiro.sinal, sinal);
    locacaoMigrada.financeiro.valorRestante = numeroNaoNegativo(
        locacaoMigrada.financeiro.valorRestante,
        valorRestantePadrao
    );
    locacaoMigrada.financeiro.statusPagamento = valorEmConjunto(
        locacaoMigrada.financeiro.statusPagamento,
        STATUS_PAGAMENTO_V12,
        statusPagamentoPadrao
    );
    locacaoMigrada.pago = locacaoMigrada.financeiro.statusPagamento === 'pago';

    const camposNovos = [
        'statusFluxo',
        'datasMontagem',
        'datasDesmontagem',
        'equipe',
        'logistica',
        'financeiro',
        'checklist',
        'historicoAlteracoes'
    ];
    if (camposNovos.some((campo) => !(campo in locacao))) {
        contexto.houveMudanca = true;
    }

    return locacaoMigrada;
}

function migrarLocadorParaV12(locadorOriginal, contexto) {
    const locador = clonarObjetoSeguro(locadorOriginal);
    const migrado = {
        ...locador,
        documento: textoSeguro(locador.documento, ''),
        endereco: textoSeguro(locador.endereco, '')
    };

    if (!('documento' in locador) || !('endereco' in locador)) {
        contexto.houveMudanca = true;
    }
    return migrado;
}

function migrarItemPropostaParaV12(itemOriginal) {
    const item = clonarObjetoSeguro(itemOriginal);
    const periodoDias = numeroNaoNegativo(item.periodoDias ?? item.periodo, 1) || 1;
    const quantidade = numeroNaoNegativo(item.quantidade, 0);
    const valorUnitario = numeroNaoNegativo(item.valorUnitario, 0);
    const valorTotal = periodoDias * quantidade * valorUnitario;

    return {
        descricao: textoSeguro(item.descricao, ''),
        medida: textoSeguro(item.medida, ''),
        periodoDias,
        quantidade,
        valorUnitario,
        valorTotal,
        observacoes: textoSeguro(item.observacoes, '')
    };
}

function migrarPropostaParaV12(propostaOriginal, contexto) {
    const proposta = clonarObjetoSeguro(propostaOriginal);
    const itens = clonarArraySeguro(proposta.itens).map((item) => migrarItemPropostaParaV12(item));
    const custosOriginal = clonarObjetoSeguro(proposta.custos, {});

    const custos = clonarObjetoSeguro(custosOriginal, {
        frete: 0,
        freteTrechos: 0,
        freteDistanciaKm: 0,
        freteValorKm: 0,
        maoObra: 0,
        operador: 0,
        eletrica: 0,
        gerador: 0,
        terceirizados: 0,
        outros: 0
    });

    custos.frete = numeroNaoNegativo(custos.frete, 0);
    custos.freteDistanciaKm = numeroNaoNegativo(custos.freteDistanciaKm ?? custos.distanciaKm, 0);
    custos.freteValorKm = numeroNaoNegativo(custos.freteValorKm ?? custos.valorKm, 0);
    custos.freteTrechos = numeroNaoNegativo(custos.freteTrechos ?? custos.trechos, (custos.freteDistanciaKm > 0 && custos.freteValorKm > 0) ? 1 : 0);
    if (custos.freteDistanciaKm > 0 && custos.freteValorKm > 0) {
        const trechos = Math.max(1, Math.trunc(custos.freteTrechos || 1));
        custos.freteTrechos = trechos;
        custos.frete = Math.round((trechos * custos.freteDistanciaKm * custos.freteValorKm + Number.EPSILON) * 100) / 100;
    }
    custos.maoObra = numeroNaoNegativo(custos.maoObra, 0);
    custos.operador = numeroNaoNegativo(custos.operador, 0);
    custos.eletrica = numeroNaoNegativo(custos.eletrica, 0);
    custos.gerador = numeroNaoNegativo(custos.gerador, 0);
    custos.terceirizados = numeroNaoNegativo(custos.terceirizados, 0);
    custos.outros = numeroNaoNegativo(custos.outros, 0);

    const totalItens = itens.reduce((acc, item) => acc + numeroNaoNegativo(item.valorTotal, 0), 0);
    const totalCustos = [
        custos.frete,
        custos.maoObra,
        custos.operador,
        custos.eletrica,
        custos.gerador,
        custos.terceirizados,
        custos.outros
    ].reduce((acc, valor) => acc + numeroNaoNegativo(valor, 0), 0);

    const financeiroOriginal = clonarObjetoSeguro(proposta.financeiro, {});
    const controleInternoOriginal = clonarObjetoSeguro(proposta.controleInterno, {});
    const escopoOriginal = clonarObjetoSeguro(proposta.escopo, {});
    const eventoOriginal = clonarObjetoSeguro(proposta.evento, {});

    const desconto = numeroNaoNegativo(financeiroOriginal.desconto, 0);
    const acrescimo = numeroNaoNegativo(financeiroOriginal.acrescimo, 0);
    const percentualNF = numeroNaoNegativo(financeiroOriginal.percentualNF, 0);
    const tipoCalculoNF = String(financeiroOriginal.tipoCalculoNF || 'descontar').trim().toLowerCase() === 'acrescentar'
        ? 'acrescentar'
        : 'descontar';
    const valorBase = Math.max(totalItens + totalCustos + acrescimo - desconto, 0);
    const valorNF = (valorBase * percentualNF) / 100;
    const valorFinal = valorBase;
    const valorFinalComNF = tipoCalculoNF === 'acrescentar' ? valorBase + valorNF : valorBase;
    const valorLiquidoPrevisto = tipoCalculoNF === 'descontar' ? (valorBase - valorNF) : valorBase;
    const valorFinalComercial = tipoCalculoNF === 'acrescentar' ? valorFinalComNF : valorFinal;
    const percentualEntrada = Math.min(100, numeroNaoNegativo(financeiroOriginal.percentualEntrada, 50));
    const valorEntrada = (valorFinalComercial * percentualEntrada) / 100;
    const percentualSaldo = Math.max(0, 100 - percentualEntrada);
    const valorSaldo = Math.max(valorFinalComercial - valorEntrada, 0);

    const custoInternoTotal = numeroNaoNegativo(controleInternoOriginal.custoInternoTotal, 0);
    const custoTerceirizadoTotal = numeroNaoNegativo(controleInternoOriginal.custoTerceirizadoTotal, 0);
    const outrosCustosInternos = numeroNaoNegativo(controleInternoOriginal.outrosCustosInternos, 0);
    const custoTotalProposta = custoInternoTotal + custoTerceirizadoTotal + outrosCustosInternos;
    const lucroPrevisto = valorLiquidoPrevisto - custoTotalProposta;
    const margemPrevista = valorLiquidoPrevisto > 0 ? (lucroPrevisto / valorLiquidoPrevisto) * 100 : 0;

    const dataCriacao = textoSeguro(proposta.dataCriacao || proposta.criadoEm, new Date().toISOString());
    const dataCriacaoBase = textoSeguro(dataCriacao).slice(0, 10);
    const validadeDias = inteiroNaoNegativo(financeiroOriginal.validadePropostaDias, 7);
    let validadeData = textoSeguro(financeiroOriginal.validadePropostaData, '');
    if (!validadeData && /^\d{4}-\d{2}-\d{2}$/.test(dataCriacaoBase)) {
        const dataBase = new Date(`${dataCriacaoBase}T00:00:00`);
        dataBase.setDate(dataBase.getDate() + validadeDias);
        const ano = dataBase.getFullYear();
        const mes = String(dataBase.getMonth() + 1).padStart(2, '0');
        const dia = String(dataBase.getDate()).padStart(2, '0');
        validadeData = `${ano}-${mes}-${dia}`;
    }

    const exibirInterno = financeiroOriginal.exibirInformacoesInternasPDF === true || financeiroOriginal.exibirCustosInternosPdf === true;
    const formaPagamentoRaw = String(financeiroOriginal.formaPagamento || '').trim().toLowerCase();
    const formasValidas = new Set(['pix', 'boleto', 'transferencia', 'cartao', 'dinheiro', 'outro']);
    const formaPagamento = formasValidas.has(formaPagamentoRaw) ? formaPagamentoRaw : '';

    const financeiro = {
        subtotal: numeroNaoNegativo(financeiroOriginal.subtotal, totalItens),
        totalCustosAdicionais: numeroNaoNegativo(financeiroOriginal.totalCustosAdicionais, totalCustos),
        desconto,
        acrescimo,
        valorBase: numeroNaoNegativo(financeiroOriginal.valorBase, valorBase),
        percentualNF,
        tipoCalculoNF,
        valorNF: numeroNaoNegativo(financeiroOriginal.valorNF, valorNF),
        valorFinal: numeroNaoNegativo(financeiroOriginal.valorFinal, valorFinal),
        valorFinalComNF: numeroNaoNegativo(financeiroOriginal.valorFinalComNF, valorFinalComNF),
        valorLiquidoPrevisto: numeroSeguro(financeiroOriginal.valorLiquidoPrevisto, valorLiquidoPrevisto),
        percentualEntrada,
        valorEntrada: numeroNaoNegativo(financeiroOriginal.valorEntrada, valorEntrada),
        percentualSaldo: numeroNaoNegativo(financeiroOriginal.percentualSaldo, percentualSaldo),
        valorSaldo: numeroNaoNegativo(financeiroOriginal.valorSaldo, valorSaldo),
        vencimentoEntrada: textoSeguro(financeiroOriginal.vencimentoEntrada, ''),
        vencimentoSaldo: textoSeguro(financeiroOriginal.vencimentoSaldo, ''),
        formaPagamento,
        condicaoPagamento: textoSeguro(financeiroOriginal.condicaoPagamento, ''),
        observacaoPagamento: textoSeguro(financeiroOriginal.observacaoPagamento, '50% na aprovacao e 50% na montagem/desmontagem, conforme alinhamento comercial.'),
        validadePropostaDias: validadeDias,
        validadePropostaData: validadeData,
        exibirInformacoesInternasPDF: exibirInterno,
        exibirCustosInternosPdf: exibirInterno
    };

    const evento = {
        nome: textoSeguro(eventoOriginal.nome, ''),
        local: textoSeguro(eventoOriginal.local, ''),
        enderecoEvento: textoSeguro(eventoOriginal.enderecoEvento || eventoOriginal.enderecoCompleto, ''),
        cidadeEvento: textoSeguro(eventoOriginal.cidadeEvento || eventoOriginal.cidade, ''),
        ufEvento: textoSeguro(eventoOriginal.ufEvento || eventoOriginal.uf, '').toUpperCase().slice(0, 2),
        referenciaAcesso: textoSeguro(eventoOriginal.referenciaAcesso, ''),
        dataMontagem: textoSeguro(eventoOriginal.dataMontagem, ''),
        horaMontagem: textoSeguro(eventoOriginal.horaMontagem, ''),
        dataEvento: textoSeguro(eventoOriginal.dataEvento, ''),
        horaInicioEvento: textoSeguro(eventoOriginal.horaInicioEvento, ''),
        horaFimEvento: textoSeguro(eventoOriginal.horaFimEvento, ''),
        dataDesmontagem: textoSeguro(eventoOriginal.dataDesmontagem, ''),
        horaDesmontagem: textoSeguro(eventoOriginal.horaDesmontagem, ''),
        observacoesGerais: textoSeguro(eventoOriginal.observacoesGerais || eventoOriginal.observacoes, '')
    };

    const escopo = {
        inclusoProposta: textoSeguro(escopoOriginal.inclusoProposta, 'Montagem, desmontagem e estrutura conforme descrito nos itens da proposta.'),
        naoInclusoProposta: textoSeguro(escopoOriginal.naoInclusoProposta, 'Nao estao inclusos itens nao descritos na proposta, ART/laudo tecnico, gerador, eletrica, seguranca, taxas publicas, alimentacao, hospedagem, custos de estacionamento, liberacoes junto ao local e alteracoes apos aprovacao, salvo quando especificado.'),
        observacoesComerciais: textoSeguro(escopoOriginal.observacoesComerciais, '')
    };

    const statusRaw = String(proposta.status || '').trim().toLowerCase();
    const aliasesStatus = {
        'em negociacao': 'em_negociacao',
        'convertida em locacao': 'convertida',
        convertida_em_locacao: 'convertida'
    };
    const statusNormalizado = aliasesStatus[statusRaw] || statusRaw;

    const locacaoVinculadaId = textoSeguro(proposta.locacaoVinculadaId || proposta.locacaoId, '');

    const propostaMigrada = {
        id: proposta.id || Date.now(),
        codigo: textoSeguro(proposta.codigo, ''),
        cliente: clonarObjetoSeguro(proposta.cliente, {
            nome: '',
            documento: '',
            telefone: '',
            email: '',
            endereco: ''
        }),
        evento,
        itens,
        custos,
        financeiro,
        controleInterno: {
            custoInternoTotal,
            custoTerceirizadoTotal,
            outrosCustosInternos,
            custoTotalProposta: numeroNaoNegativo(controleInternoOriginal.custoTotalProposta, custoTotalProposta),
            lucroPrevisto: numeroSeguro(controleInternoOriginal.lucroPrevisto, lucroPrevisto),
            margemPrevista: numeroSeguro(controleInternoOriginal.margemPrevista, margemPrevista)
        },
        escopo,
        responsavelProposta: textoSeguro(proposta.responsavelProposta, ''),
        status: valorEmConjunto(statusNormalizado, STATUS_PROPOSTA_V12, 'rascunho'),
        locacaoVinculadaId,
        locacaoId: locacaoVinculadaId,
        dataCriacao,
        dataUltimaAlteracao: textoSeguro(proposta.dataUltimaAlteracao || proposta.atualizadoEm, dataCriacao),
        criadoPor: textoSeguro(proposta.criadoPor, ''),
        alteradoPor: textoSeguro(proposta.alteradoPor, ''),
        dataEnvio: textoSeguro(proposta.dataEnvio, ''),
        dataAprovacao: textoSeguro(proposta.dataAprovacao, ''),
        dataCancelamento: textoSeguro(proposta.dataCancelamento, ''),
        dataConversaoLocacao: textoSeguro(proposta.dataConversaoLocacao, ''),
        criadoEm: dataCriacao,
        atualizadoEm: textoSeguro(proposta.dataUltimaAlteracao || proposta.atualizadoEm, dataCriacao)
    };

    if (
        !Array.isArray(proposta.itens)
        || !('status' in proposta)
        || !('financeiro' in proposta)
        || !('controleInterno' in proposta)
        || !('escopo' in proposta)
        || !('responsavelProposta' in proposta)
        || !('validadePropostaDias' in financeiroOriginal)
        || !('percentualEntrada' in financeiroOriginal)
        || !('tipoCalculoNF' in financeiroOriginal)
        || !('exibirInformacoesInternasPDF' in financeiroOriginal)
        || itens.some((item, indice) => !('periodoDias' in clonarObjetoSeguro(proposta.itens?.[indice], {})))
        || !('freteTrechos' in custosOriginal)
        || !('freteDistanciaKm' in custosOriginal)
        || !('freteValorKm' in custosOriginal)
    ) {
        contexto.houveMudanca = true;
    }

    return propostaMigrada;
}

function migrarUsuarioParaV12(usuarioOriginal, contexto, indice) {
    const usuario = clonarObjetoSeguro(usuarioOriginal);
    const perfil = normalizarPerfilUsuarioV12(usuario.perfil);
    const migrado = {
        ...usuario,
        id: usuario.id || `usr-${indice + 1}`,
        nome: textoSeguro(usuario.nome, ''),
        email: textoSeguro(usuario.email, ''),
        perfil,
        permissoes: normalizarPermissoesUsuarioV12(usuario.permissoes, perfil),
        ativo: usuario.ativo !== false
    };

    if (!('perfil' in usuario) || !('permissoes' in usuario) || !('ativo' in usuario)) {
        contexto.houveMudanca = true;
    }
    return migrado;
}

function migrarDadosParaV12(dadosEntrada = {}, opcoes = {}) {
    const dadosBase = clonarObjetoSeguro(dadosEntrada);
    const contexto = {
        origem: opcoes.origem || 'desconhecida',
        houveMudanca: false,
        dataMigracaoIso: new Date().toISOString(),
        logs: []
    };

    const versaoAnterior = String(dadosBase.versao || 'sem-versao');

    const dadosMigrados = {
        ...dadosBase,
        locadores: clonarArraySeguro(dadosBase.locadores).map((locador) => migrarLocadorParaV12(locador, contexto)),
        pecas: clonarArraySeguro(dadosBase.pecas).map((peca) => migrarPecaParaV12(peca, contexto)),
        locacoes: clonarArraySeguro(dadosBase.locacoes).map((locacao) => migrarLocacaoParaV12(locacao, contexto)),
        propostas: clonarArraySeguro(dadosBase.propostas).map((proposta) => migrarPropostaParaV12(proposta, contexto)),
        devolucoes: clonarArraySeguro(dadosBase.devolucoes),
        transportes: clonarArraySeguro(dadosBase.transportes),
        tipos: clonarArraySeguro(dadosBase.tipos),
        modelosChecklist: clonarArraySeguro(dadosBase.modelosChecklist),
        checklistsGerados: clonarArraySeguro(dadosBase.checklistsGerados),
        checklistMontagem: clonarArraySeguro(dadosBase.checklistMontagem),
        checklistConferencia: clonarObjetoSeguro(dadosBase.checklistConferencia, {}),
        checklistEtapasMontagem: clonarArraySeguro(dadosBase.checklistEtapasMontagem),
        logsAuditoria: clonarArraySeguro(dadosBase.logsAuditoria),
        usuarios: clonarArraySeguro(dadosBase.usuarios).map((usuario, indice) => migrarUsuarioParaV12(usuario, contexto, indice)),
        config: clonarObjetoSeguro(dadosBase.config, {
            rodape: 'MTZ Eventos',
            tel: '',
            email: '',
            logo: '',
            emailsPermitidos: '',
            adminEmails: '',
            valorKmFretePadrao: 0
        }),
        versao: SCHEMA_VERSION_V12
    };

    if (!('usuarios' in dadosBase)) {
        contexto.houveMudanca = true;
    }

    if (!('transportes' in dadosBase)) {
        contexto.houveMudanca = true;
    }

    if (!dadosBase.config || !('valorKmFretePadrao' in dadosBase.config)) {
        contexto.houveMudanca = true;
    }

    if (versaoAnterior !== SCHEMA_VERSION_V12) {
        contexto.houveMudanca = true;
    }

    dadosMigrados.config.schemaVersion = SCHEMA_VERSION_V12;
    dadosMigrados.config.valorKmFretePadrao = numeroNaoNegativo(dadosMigrados.config.valorKmFretePadrao, 0);

    if (contexto.houveMudanca) {
        contexto.logs.push(
            `Schema migrado de ${versaoAnterior} para ${SCHEMA_VERSION_V12} (origem: ${contexto.origem}).`,
            `Registros normalizados: ${dadosMigrados.locadores.length} clientes, ${dadosMigrados.pecas.length} itens, ${dadosMigrados.locacoes.length} locacoes, ${dadosMigrados.propostas.length} propostas e ${dadosMigrados.transportes.length} transportes.`
        );
    }

    return {
        dadosMigrados,
        houveMudanca: contexto.houveMudanca,
        logs: contexto.logs,
        versaoOrigem: versaoAnterior,
        versaoDestino: SCHEMA_VERSION_V12,
        dataMigracao: contexto.dataMigracaoIso
    };
}

window.SCHEMA_VERSION_V12 = SCHEMA_VERSION_V12;
window.migrarDadosParaV12 = migrarDadosParaV12;
