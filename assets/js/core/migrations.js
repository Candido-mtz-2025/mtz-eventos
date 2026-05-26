// Migracoes de schema (v12)
const SCHEMA_VERSION_V12 = '12.0';

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
            horarioSaida: '',
            horarioChegada: '',
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
        devolucoes: clonarArraySeguro(dadosBase.devolucoes),
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
            adminEmails: ''
        }),
        versao: SCHEMA_VERSION_V12
    };

    if (!('usuarios' in dadosBase)) {
        contexto.houveMudanca = true;
    }

    if (versaoAnterior !== SCHEMA_VERSION_V12) {
        contexto.houveMudanca = true;
    }

    dadosMigrados.config.schemaVersion = SCHEMA_VERSION_V12;

    if (contexto.houveMudanca) {
        contexto.logs.push(
            `Schema migrado de ${versaoAnterior} para ${SCHEMA_VERSION_V12} (origem: ${contexto.origem}).`,
            `Registros normalizados: ${dadosMigrados.locadores.length} clientes, ${dadosMigrados.pecas.length} itens, ${dadosMigrados.locacoes.length} locacoes.`
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
