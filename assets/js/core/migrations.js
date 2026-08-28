// Migracoes de schema (v12)
const SCHEMA_VERSION_V12 = '12.6';
const VERSAO_MIGRACAO_POLITICA_CUSTOS_PROPRIOS = 1;
const VERSAO_MIGRACAO_PERFIL_FISCAL_EMPRESA = 1;
const VERSAO_MIGRACAO_BASE_EDICAO_LOCACOES = 1;
const MODOS_CUSTO_PROPRIO_V12 = new Set(['percentual', 'manual', 'nao_calcular']);

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
const CATEGORIAS_ORCAMENTO_PADRAO_V12 = [
    { id: 'estrutura', nome: 'Estrutura', cor: '#3b82f6', icone: 'bi-columns-gap' },
    { id: 'mobiliario', nome: 'Mobiliário', cor: '#10b981', icone: 'bi-lamp' },
    { id: 'eletrica', nome: 'Elétrica', cor: '#f59e0b', icone: 'bi-lightning-charge' },
    { id: 'comunicacao-impressao', nome: 'Comunicação / Impressão', cor: '#8b5cf6', icone: 'bi-printer' },
    { id: 'alimentacao', nome: 'Alimentação', cor: '#ef4444', icone: 'bi-cup-straw' },
    { id: 'mao-de-obra', nome: 'Mão de Obra', cor: '#06b6d4', icone: 'bi-person-workspace' },
    { id: 'logistica', nome: 'Logística', cor: '#0ea5e9', icone: 'bi-truck' },
    { id: 'outros', nome: 'Outros', cor: '#64748b', icone: 'bi-box-seam' }
];
const CATEGORIAS_PROPOSTA_V12 = CATEGORIAS_ORCAMENTO_PADRAO_V12.map((categoria) => categoria.nome);

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

function normalizarItemIdLocacaoValidoV12(valor) {
    const itemId = textoSeguro(valor, '').trim();
    return itemId.length <= 160 && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(itemId)
        ? itemId
        : '';
}

function criarItemIdLocacaoV12(locacaoId, indice, usados = new Set()) {
    const parteLocacao = textoSeguro(locacaoId, 'legado')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-') || 'legado';
    let numeroItem = indice + 1;
    let itemId = `loc-${parteLocacao}-item-${numeroItem}`;
    while (usados.has(itemId)) {
        numeroItem += 1;
        itemId = `loc-${parteLocacao}-item-${numeroItem}`;
    }
    return itemId;
}

function migrarItensLocacaoComItemIdV12(locacao = {}, contexto = {}) {
    const lista = clonarArraySeguro(locacao.items).map((item) => clonarObjetoSeguro(item));
    const primeiraOcorrencia = new Map();
    lista.forEach((item, indice) => {
        const itemId = normalizarItemIdLocacaoValidoV12(item.itemId);
        if (itemId && !primeiraOcorrencia.has(itemId)) primeiraOcorrencia.set(itemId, indice);
    });
    const usados = new Set(primeiraOcorrencia.keys());

    return lista.map((item, indice) => {
        const informado = normalizarItemIdLocacaoValidoV12(item.itemId);
        const preservar = informado && primeiraOcorrencia.get(informado) === indice;
        const itemId = preservar ? informado : criarItemIdLocacaoV12(locacao.id, indice, usados);
        if (!preservar) contexto.houveMudanca = true;
        usados.add(itemId);
        return { ...item, itemId };
    });
}

function obterQuantidadePropriaOperacionalV12(item = {}) {
    const total = inteiroNaoNegativo(item.quantidade, 0);
    const possuiOrigem = Object.prototype.hasOwnProperty.call(item, 'origemCusto');
    const origem = textoSeguro(item.origemCusto, '').trim().toLowerCase();
    if (!possuiOrigem || !origem || origem === 'nao_informado') return total;
    if (origem === 'terceirizado') return 0;
    if (origem === 'misto') return Math.min(inteiroNaoNegativo(item.quantidadePropria, 0), total);
    return total;
}

function criarSnapshotReservaLocacaoV12(locacao = {}, opcoes = {}) {
    // Snapshot passivo: documenta a reserva sem recalcular ou movimentar o estoque.
    const agrupados = new Map();
    clonarArraySeguro(locacao.items).forEach((itemOriginal, indice) => {
        const item = clonarObjetoSeguro(itemOriginal);
        const itemId = textoSeguro(item.itemId, criarItemIdLocacaoV12(locacao.id, indice)).trim();
        const pecaId = textoSeguro(item.pecaId, '').trim();
        const chave = pecaId ? `peca:${pecaId}` : `sem-vinculo:${itemId}`;
        const quantidadePropria = obterQuantidadePropriaOperacionalV12(item);
        const quantidadePendente = Math.max(
            quantidadePropria
                - inteiroNaoNegativo(item.devolvidos, 0)
                - inteiroNaoNegativo(item.avariadosEstoqueProprio, 0),
            0
        );
        const atual = agrupados.get(chave) || {
            pecaId,
            quantidadePropria: 0,
            quantidadePendente: 0,
            itemIds: []
        };
        atual.quantidadePropria += quantidadePropria;
        atual.quantidadePendente += quantidadePendente;
        atual.itemIds.push(itemId);
        agrupados.set(chave, atual);
    });

    const inicio = textoSeguro(locacao?.datasMontagem?.inicio || locacao.dataAluguel, '').trim();
    const fim = textoSeguro(
        locacao?.datasDesmontagem?.fim
            || locacao?.datasDesmontagem?.inicio
            || locacao.dataDevolucaoPrevisao,
        ''
    ).trim();

    return {
        versao: 1,
        origem: textoSeguro(opcoes.origem, 'migracao_legado'),
        capturadoEm: textoSeguro(opcoes.capturadoEm, ''),
        statusReserva: textoSeguro(opcoes.statusReserva, ''),
        periodo: {
            inicio,
            fim,
            completo: Boolean(inicio && fim)
        },
        itens: Array.from(agrupados.values())
    };
}

function normalizarValorMonetarioV12(valor) {
    if (typeof window !== 'undefined' && typeof window.normalizarValorMonetarioLegado === 'function') {
        return window.normalizarValorMonetarioLegado(valor);
    }

    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
}

function numeroMonetarioNaoNegativoV12(valor, fallback = 0) {
    const normalizado = normalizarValorMonetarioV12(valor);
    if (normalizado !== null && normalizado >= 0) return normalizado;
    const fallbackNormalizado = normalizarValorMonetarioV12(fallback);
    return fallbackNormalizado !== null && fallbackNormalizado >= 0 ? fallbackNormalizado : 0;
}

function valorEmConjunto(valor, conjunto, fallback) {
    const normalizado = String(valor || '').trim().toLowerCase();
    return conjunto.has(normalizado) ? normalizado : fallback;
}

function normalizarTextoBuscaMigracao(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizarIdCategoriaOrcamentoV12(valor, fallback = '') {
    const base = textoSeguro(valor, fallback)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || fallback || '';
}

function obterCategoriaPadraoOrcamentoV12(valor) {
    const alvoTexto = normalizarTextoBuscaMigracao(valor);
    const alvoId = normalizarIdCategoriaOrcamentoV12(valor);
    return CATEGORIAS_ORCAMENTO_PADRAO_V12.find((categoria) => (
        categoria.id === alvoId ||
        normalizarTextoBuscaMigracao(categoria.nome) === alvoTexto ||
        normalizarIdCategoriaOrcamentoV12(categoria.nome) === alvoId
    ));
}

function normalizarCategoriaPropostaV12(valor) {
    const texto = textoSeguro(valor, '').trim();
    if (!texto) return 'outros';
    return obterCategoriaPadraoOrcamentoV12(texto)?.id || texto;
}

function normalizarTipoTributoPropostaV12(valor, fallback = 'simples') {
    const normalizado = normalizarTextoBuscaMigracao(valor || fallback).replace(/[\s-]+/g, '_');
    return normalizado === 'por_dentro' ? 'por_dentro' : 'simples';
}

function normalizarBooleanoPropostaV12(valor, fallback = false) {
    if (typeof valor === 'boolean') return valor;
    if (valor == null || valor === '') return !!fallback;
    const texto = normalizarTextoBuscaMigracao(valor);
    if (['true', '1', 'sim', 's', 'yes'].includes(texto)) return true;
    if (['false', '0', 'nao', 'não', 'n', 'no'].includes(texto)) return false;
    return !!fallback;
}

function criarCategoriaOrcamentoV12(origem = {}, indice = 0, globais = {}, regrasLegadas = {}) {
    const entrada = typeof origem === 'string' ? { nome: origem } : (origem && typeof origem === 'object' ? origem : {});
    const def = obterCategoriaPadraoOrcamentoV12(entrada.id || entrada.nome || entrada.categoria || entrada.label);
    const nomeBase = textoSeguro(entrada.nome ?? entrada.label ?? entrada.categoria ?? def?.nome ?? entrada.id, 'Outros');
    const ehOutros = normalizarTextoBuscaMigracao(nomeBase) === normalizarTextoBuscaMigracao('Outros')
        || normalizarIdCategoriaOrcamentoV12(entrada.id || nomeBase) === 'outros';
    const id = ehOutros ? 'outros' : normalizarIdCategoriaOrcamentoV12(entrada.id || def?.id || nomeBase, `categoria-${indice + 1}`);
    const nome = ehOutros ? 'Outros' : nomeBase;
    const regraLegada = regrasLegadas[id] || regrasLegadas[nome] || regrasLegadas[def?.nome] || {};
    const regra = { ...regraLegada, ...entrada };
    const ehMaoObra = id === 'mao-de-obra' || normalizarTextoBuscaMigracao(nome) === normalizarTextoBuscaMigracao('Mão de Obra');

    return {
        id,
        nome,
        ativa: ehOutros ? true : normalizarBooleanoPropostaV12(regra.ativa, true),
        ordem: inteiroNaoNegativo(regra.ordem, def ? CATEGORIAS_ORCAMENTO_PADRAO_V12.findIndex((categoria) => categoria.id === def.id) + 1 : indice + 1),
        cor: textoSeguro(regra.cor ?? def?.cor, '#64748b'),
        icone: textoSeguro(regra.icone ?? def?.icone, 'bi-tag'),
        fixa: ehOutros,
        aplicarHonorarios: normalizarBooleanoPropostaV12(regra.aplicarHonorarios, true),
        percentualHonorarios: numeroNaoNegativo(regra.percentualHonorarios, globais.percentualHonorariosPadrao || 0),
        aplicarEncargos: normalizarBooleanoPropostaV12(regra.aplicarEncargos, true),
        percentualEncargos: numeroNaoNegativo(regra.percentualEncargos, globais.percentualEncargosPadrao || 0),
        tipoCalculoEncargos: normalizarTipoTributoPropostaV12(regra.tipoCalculoEncargos, globais.tipoCalculoEncargosPadrao || 'simples'),
        aplicarINSS: normalizarBooleanoPropostaV12(regra.aplicarINSS, ehMaoObra),
        percentualINSS: numeroNaoNegativo(regra.percentualINSS, globais.percentualINSSPadrao || 0),
        tipoCalculoINSS: normalizarTipoTributoPropostaV12(regra.tipoCalculoINSS, globais.tipoCalculoINSSPadrao || 'simples')
    };
}

function criarCategoriasOrcamentoV12(valor = null, regrasLegadas = {}, globais = {}) {
    const mapa = new Map();
    const adicionar = (origem, indice = mapa.size) => {
        const categoria = criarCategoriaOrcamentoV12(origem, indice, globais, regrasLegadas);
        const atual = mapa.get(categoria.id);
        mapa.set(categoria.id, atual ? { ...atual, ...categoria, fixa: atual.fixa || categoria.fixa } : categoria);
    };

    CATEGORIAS_ORCAMENTO_PADRAO_V12.forEach((categoria, indice) => adicionar({ ...categoria, ordem: indice + 1 }, indice));

    if (Array.isArray(valor)) {
        valor.forEach((categoria, indice) => adicionar(categoria, indice));
    }

    Object.entries(regrasLegadas || {}).forEach(([chave, regra], indice) => {
        if (!chave) return;
        const def = obterCategoriaPadraoOrcamentoV12(chave);
        const id = def?.id || normalizarIdCategoriaOrcamentoV12(chave);
        if (mapa.has(id)) return;
        adicionar({
            id,
            nome: def?.nome || chave,
            ordem: 100 + indice,
            ...(regra && typeof regra === 'object' ? regra : {})
        }, 100 + indice);
    });

    if (!mapa.has('outros')) adicionar({ id: 'outros', nome: 'Outros', ordem: 999 }, 999);
    mapa.set('outros', { ...mapa.get('outros'), id: 'outros', nome: 'Outros', ativa: true, fixa: true });

    return Array.from(mapa.values())
        .sort((a, b) => (numeroNaoNegativo(a.ordem, 999) - numeroNaoNegativo(b.ordem, 999)) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function criarPadroesOrcamentoV12(valor = {}) {
    const origem = valor && typeof valor === 'object' ? valor : {};
    const origemGlobais = origem.globais && typeof origem.globais === 'object' ? origem.globais : origem;
    const politicaOrigem = origemGlobais.politicaCustosProprios && typeof origemGlobais.politicaCustosProprios === 'object'
        ? origemGlobais.politicaCustosProprios
        : {};
    const modoPolitica = MODOS_CUSTO_PROPRIO_V12.has(String(politicaOrigem.modo || '').trim())
        ? String(politicaOrigem.modo).trim()
        : 'nao_calcular';
    const globais = {
        ...origemGlobais,
        percentualHonorariosPadrao: numeroNaoNegativo(origemGlobais.percentualHonorariosPadrao ?? origemGlobais.honorariosPadrao, 0),
        percentualEncargosPadrao: numeroNaoNegativo(origemGlobais.percentualEncargosPadrao ?? origemGlobais.encargosPadrao, 0),
        percentualINSSPadrao: numeroNaoNegativo(origemGlobais.percentualINSSPadrao ?? origemGlobais.inssPadrao, 0),
        percentualEntradaPadrao: Math.min(100, numeroNaoNegativo(origemGlobais.percentualEntradaPadrao ?? origemGlobais.entradaPadrao, 50)),
        percentualDescontoPadrao: Math.min(100, numeroNaoNegativo(origemGlobais.percentualDescontoPadrao ?? origemGlobais.descontoPadrao, 0)),
        tipoCalculoEncargosPadrao: normalizarTipoTributoPropostaV12(origemGlobais.tipoCalculoEncargosPadrao, 'simples'),
        tipoCalculoINSSPadrao: normalizarTipoTributoPropostaV12(origemGlobais.tipoCalculoINSSPadrao, 'simples'),
        aplicarHonorariosAutomaticamente: normalizarBooleanoPropostaV12(origemGlobais.aplicarHonorariosAutomaticamente, true),
        aplicarEncargosAutomaticamente: normalizarBooleanoPropostaV12(origemGlobais.aplicarEncargosAutomaticamente, true),
        aplicarINSSAutomaticamente: normalizarBooleanoPropostaV12(origemGlobais.aplicarINSSAutomaticamente, true),
        politicaCustosProprios: {
            modo: modoPolitica,
            percentual: Math.min(100, numeroNaoNegativo(politicaOrigem.percentual, 0)),
            configurada: normalizarBooleanoPropostaV12(politicaOrigem.configurada, false),
            origem: textoSeguro(politicaOrigem.origem, 'instalacao_nova'),
            versao: inteiroNaoNegativo(politicaOrigem.versao, VERSAO_MIGRACAO_POLITICA_CUSTOS_PROPRIOS)
        }
    };
    const origemCategorias = origem.categorias && typeof origem.categorias === 'object' ? origem.categorias : {};
    const categoriasOrcamento = criarCategoriasOrcamentoV12(origem.categoriasOrcamento, origemCategorias, globais);
    const categorias = {};
    categoriasOrcamento.forEach((categoria) => {
        categorias[categoria.id] = {
            id: categoria.id,
            nome: categoria.nome,
            ativa: categoria.ativa,
            ordem: categoria.ordem,
            cor: categoria.cor,
            icone: categoria.icone,
            aplicarHonorarios: categoria.aplicarHonorarios,
            percentualHonorarios: categoria.percentualHonorarios,
            aplicarEncargos: categoria.aplicarEncargos,
            percentualEncargos: categoria.percentualEncargos,
            tipoCalculoEncargos: categoria.tipoCalculoEncargos,
            aplicarINSS: categoria.aplicarINSS,
            percentualINSS: categoria.percentualINSS,
            tipoCalculoINSS: categoria.tipoCalculoINSS
        };
    });
    return { ...origem, globais, categorias, categoriasOrcamento };
}

function normalizarPerfilFiscalEmpresaV12(valor = {}) {
    const origem = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
    const cnaesOrigem = Array.isArray(origem.cnaes)
        ? origem.cnaes
        : String(origem.cnaes || '').split(/[\n,;]+/);
    return {
        ...origem,
        regimeTributario: String(origem.regimeTributario || '').trim(),
        cnpj: String(origem.cnpj || '').trim(),
        inscricaoMunicipal: String(origem.inscricaoMunicipal || '').trim(),
        municipioEstabelecimento: String(origem.municipioEstabelecimento || '').trim(),
        ufEstabelecimento: String(origem.ufEstabelecimento || '').trim().toUpperCase().slice(0, 2),
        cnaes: [...new Set(cnaesOrigem.map((cnae) => String(cnae || '').trim()).filter(Boolean))],
        validadoPorContador: origem.validadoPorContador === true,
        responsavelValidacao: String(origem.responsavelValidacao || '').trim(),
        dataValidacao: String(origem.dataValidacao || '').trim(),
        vigenciaInicio: String(origem.vigenciaInicio || '').trim(),
        observacoes: String(origem.observacoes || '').trim()
    };
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
        const valor = numeroMonetarioNaoNegativoV12(item?.valor, 0);
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
    const itensMigrados = migrarItensLocacaoComItemIdV12(locacao, contexto);
    const valorTotal = numeroMonetarioNaoNegativoV12(
        locacao?.financeiro?.valorTotal,
        calcularValorTotalLocacaoV12(locacao)
    );
    const sinal = numeroMonetarioNaoNegativoV12(locacao?.financeiro?.sinal, locacao?.sinal);
    const valorRestantePadrao = Math.max(valorTotal - sinal, 0);
    const statusPagamentoPadrao = locacao?.pago ? 'pago' : 'pendente';
    const estoqueReservaOriginal = clonarObjetoSeguro(locacao.estoqueReserva);
    const statusReservaInformado = textoSeguro(estoqueReservaOriginal.status, '').trim().toLowerCase();
    const statusReservaValido = new Set(['nao_reservado', 'reservado', 'reservado_legado', 'liberado']);
    const statusReservaLegado = typeof window !== 'undefined'
        && typeof window.classificarStatusReservaLegadoLocacao === 'function'
        ? window.classificarStatusReservaLegadoLocacao(locacao, contexto.devolucoes)
        : 'reservado_legado';
    const reservaGeradaPorCompatibilidade = textoSeguro(
        estoqueReservaOriginal.origem,
        ''
    ).trim().toLowerCase() === 'compatibilidade_legado';
    const reclassificarReservaLegada = statusReservaInformado === 'reservado_legado'
        && reservaGeradaPorCompatibilidade
        && statusReservaLegado === 'liberado';
    const statusReserva = statusReservaValido.has(statusReservaInformado)
        ? (reclassificarReservaLegada ? 'liberado' : statusReservaInformado)
        : statusReservaLegado;
    const snapshotReservaOriginal = estoqueReservaOriginal.snapshot
        && typeof estoqueReservaOriginal.snapshot === 'object'
        && !Array.isArray(estoqueReservaOriginal.snapshot)
        ? estoqueReservaOriginal.snapshot
        : null;
    const locacaoParaSnapshot = { ...locacao, items: itensMigrados };
    const snapshotReserva = snapshotReservaOriginal || criarSnapshotReservaLocacaoV12(
        locacaoParaSnapshot,
        {
            origem: 'migracao_legado',
            capturadoEm: contexto.dataMigracaoIso,
            statusReserva
        }
    );
    if (!snapshotReservaOriginal) contexto.houveMudanca = true;

    const locacaoMigrada = {
        ...locacao,
        items: itensMigrados,
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
        estoqueReserva: {
            ...estoqueReservaOriginal,
            status: statusReserva,
            origem: textoSeguro(
                estoqueReservaOriginal.origem,
                statusReservaInformado ? '' : 'compatibilidade_legado'
            ),
            movimentacaoIds: clonarArraySeguro(estoqueReservaOriginal.movimentacaoIds),
            snapshot: snapshotReserva
        },
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

    locacaoMigrada.financeiro.valorTotal = numeroMonetarioNaoNegativoV12(
        locacaoMigrada.financeiro.valorTotal,
        valorTotal
    );
    locacaoMigrada.financeiro.sinal = numeroMonetarioNaoNegativoV12(locacaoMigrada.financeiro.sinal, sinal);
    locacaoMigrada.financeiro.valorRestante = numeroMonetarioNaoNegativoV12(
        locacaoMigrada.financeiro.valorRestante,
        valorRestantePadrao
    );
    locacaoMigrada.financeiro.statusPagamento = valorEmConjunto(
        locacaoMigrada.financeiro.statusPagamento,
        STATUS_PAGAMENTO_V12,
        statusPagamentoPadrao
    );
    locacaoMigrada.pago = locacaoMigrada.financeiro.statusPagamento === 'pago';

    if (
        !Object.is(locacao?.financeiro?.valorTotal, locacaoMigrada.financeiro.valorTotal)
        || !Object.is(locacao?.financeiro?.sinal, locacaoMigrada.financeiro.sinal)
        || !Object.is(locacao?.financeiro?.valorRestante, locacaoMigrada.financeiro.valorRestante)
        || reclassificarReservaLegada
    ) {
        contexto.houveMudanca = true;
    }

    const camposNovos = [
        'statusFluxo',
        'datasMontagem',
        'datasDesmontagem',
        'equipe',
        'logistica',
        'financeiro',
        'estoqueReserva',
        'checklist',
        'historicoAlteracoes'
    ];
    if (camposNovos.some((campo) => !(campo in locacao))) {
        contexto.houveMudanca = true;
    }

    return locacaoMigrada;
}

function normalizarMovimentacaoEstoqueV12(movimentacaoOriginal, indice = 0) {
    const movimentacao = clonarObjetoSeguro(movimentacaoOriginal);
    const tipoPermitido = new Set(['reserva', 'separacao', 'saida', 'devolucao', 'avaria', 'perda', 'ajuste', 'entrada']);
    const tipoMovimentacao = valorEmConjunto(movimentacao.tipoMovimentacao, tipoPermitido, 'ajuste');

    return {
        ...movimentacao,
        id: movimentacao.id || `mov-${Date.now()}-${indice + 1}`,
        chaveIdempotencia: textoSeguro(movimentacao.chaveIdempotencia, ''),
        pecaId: movimentacao.origemEvento === 'edicao_transacional_estoque'
            ? movimentacao.pecaId : textoSeguro(movimentacao.pecaId, ''),
        pecaNome: textoSeguro(movimentacao.pecaNome, ''),
        tipoMovimentacao,
        quantidade: numeroNaoNegativo(movimentacao.quantidade, 0),
        locacaoId: textoSeguro(movimentacao.locacaoId, ''),
        locacaoRef: textoSeguro(movimentacao.locacaoRef, ''),
        usuario: textoSeguro(movimentacao.usuario, ''),
        dataHora: textoSeguro(movimentacao.dataHora, ''),
        observacao: textoSeguro(movimentacao.observacao, ''),
        valorEstimado: numeroNaoNegativo(movimentacao.valorEstimado, 0),
        saldoAntes: Number.isFinite(Number(movimentacao.saldoAntes)) ? Number(movimentacao.saldoAntes) : null,
        saldoDepois: Number.isFinite(Number(movimentacao.saldoDepois)) ? Number(movimentacao.saldoDepois) : null,
        origemEvento: textoSeguro(movimentacao.origemEvento, ''),
        statusProcessamento: textoSeguro(movimentacao.statusProcessamento, 'auditoria')
    };
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

function migrarItemPropostaParaV12(itemOriginal, contexto = {}) {
    const item = clonarObjetoSeguro(itemOriginal);
    const periodoDias = numeroNaoNegativo(item.periodoDias ?? item.periodo, 1) || 1;
    const quantidade = numeroNaoNegativo(item.quantidade, 0);
    const valorUnitario = numeroNaoNegativo(item.custoUnitario ?? item.valorUnitario, 0);
    const custoTotal = Math.round(((periodoDias * quantidade * valorUnitario) + Number.EPSILON) * 100) / 100;
    const categoria = normalizarCategoriaPropostaV12(item.categoria);
    const temCalculoSalvo = [
        'aplicarHonorarios',
        'percentualHonorarios',
        'aplicarEncargos',
        'percentualEncargos',
        'tipoCalculoEncargos',
        'aplicarINSS',
        'percentualINSS',
        'tipoCalculoINSS'
    ].some((campo) => Object.prototype.hasOwnProperty.call(item, campo));

    const aplicarHonorarios = temCalculoSalvo ? normalizarBooleanoPropostaV12(item.aplicarHonorarios, false) : false;
    const percentualHonorarios = temCalculoSalvo ? numeroNaoNegativo(item.percentualHonorarios, 0) : 0;
    const valorHonorarios = temCalculoSalvo ? numeroNaoNegativo(item.valorHonorarios, 0) : 0;
    const aplicarEncargos = temCalculoSalvo ? normalizarBooleanoPropostaV12(item.aplicarEncargos, false) : false;
    const percentualEncargos = temCalculoSalvo ? numeroNaoNegativo(item.percentualEncargos, 0) : 0;
    const tipoCalculoEncargos = normalizarTipoTributoPropostaV12(item.tipoCalculoEncargos, 'simples');
    const valorEncargos = temCalculoSalvo ? numeroNaoNegativo(item.valorEncargos, 0) : 0;
    const aplicarINSS = temCalculoSalvo ? normalizarBooleanoPropostaV12(item.aplicarINSS, false) : false;
    const percentualINSS = temCalculoSalvo ? numeroNaoNegativo(item.percentualINSS, 0) : 0;
    const tipoCalculoINSS = normalizarTipoTributoPropostaV12(item.tipoCalculoINSS, 'simples');
    const valorINSS = temCalculoSalvo ? numeroNaoNegativo(item.valorINSS, 0) : 0;
    const valorTotal = temCalculoSalvo
        ? Math.round((custoTotal + valorHonorarios + valorEncargos + valorINSS + Number.EPSILON) * 100) / 100
        : custoTotal;

    const politicaOriginal = item.politicaCustoProprioAplicada && typeof item.politicaCustoProprioAplicada === 'object'
        ? item.politicaCustoProprioAplicada
        : {};
    const modoPoliticaOriginal = String(politicaOriginal.modo || '').trim();
    const modoPolitica = MODOS_CUSTO_PROPRIO_V12.has(modoPoliticaOriginal)
        ? modoPoliticaOriginal
        : (numeroNaoNegativo(item.custoProprioManualTotal, 0) > 0 ? 'manual' : 'percentual');
    const percentualLegado = Math.min(100, numeroNaoNegativo(
        politicaOriginal.percentual ?? item.percentualCustoProprio,
        20
    ));

    return {
        ...item,
        categoria,
        descricao: textoSeguro(item.descricao, ''),
        medida: textoSeguro(item.medida, ''),
        periodoDias,
        quantidade,
        custoUnitario: valorUnitario,
        valorUnitario,
        custoTotal,
        aplicarHonorarios,
        percentualHonorarios,
        valorHonorarios,
        aplicarEncargos,
        percentualEncargos,
        tipoCalculoEncargos,
        valorEncargos,
        aplicarINSS,
        percentualINSS,
        tipoCalculoINSS,
        valorINSS,
        valorTotal,
        totalFinal: valorTotal,
        percentualCustoProprio: Math.min(100, numeroNaoNegativo(item.percentualCustoProprio, percentualLegado)),
        custoProprioManualTotal: numeroNaoNegativo(item.custoProprioManualTotal, 0),
        politicaCustoProprioAplicada: {
            modo: modoPolitica,
            percentual: percentualLegado,
            origem: textoSeguro(politicaOriginal.origem, 'migracao_legado'),
            aplicadaEm: textoSeguro(
                politicaOriginal.aplicadaEm ?? item.dataCriacao,
                textoSeguro(contexto.dataMigracaoIso, '')
            )
        },
        usarPadraoCalculo: typeof item.usarPadraoCalculo === 'boolean'
            ? item.usarPadraoCalculo
            : !temCalculoSalvo,
        observacoes: textoSeguro(item.observacoes, '')
    };
}

function migrarPropostaParaV12(propostaOriginal, contexto) {
    const proposta = clonarObjetoSeguro(propostaOriginal);
    const itens = clonarArraySeguro(proposta.itens).map((item) => migrarItemPropostaParaV12(item, contexto));
    const custosOriginal = clonarObjetoSeguro(proposta.custos, {});

    const custos = clonarObjetoSeguro(custosOriginal, {
        frete: 0,
        freteTrechos: 0,
        freteDistanciaKm: 0,
        freteValorKm: 0,
        maoObra: 0,
        hospedagem: 0,
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
    const hospedagemCobradaOriginal = custos.hospedagemCobrada && typeof custos.hospedagemCobrada === 'object'
        ? custos.hospedagemCobrada
        : {};
    custos.hospedagemCobrada = {
        ...hospedagemCobradaOriginal,
        pessoas: inteiroNaoNegativo(hospedagemCobradaOriginal.pessoas, 0),
        diarias: numeroNaoNegativo(hospedagemCobradaOriginal.diarias, 0),
        valorDiariaPessoa: numeroNaoNegativo(hospedagemCobradaOriginal.valorDiariaPessoa, 0),
        total: numeroNaoNegativo(hospedagemCobradaOriginal.total ?? custos.hospedagem, 0)
    };
    custos.hospedagem = custos.hospedagemCobrada.total;
    custos.operador = numeroNaoNegativo(custos.operador, 0);
    custos.eletrica = numeroNaoNegativo(custos.eletrica, 0);
    custos.gerador = numeroNaoNegativo(custos.gerador, 0);
    custos.terceirizados = numeroNaoNegativo(custos.terceirizados, 0);
    custos.outros = numeroNaoNegativo(custos.outros, 0);

    const totalItens = itens.reduce((acc, item) => acc + numeroNaoNegativo(item.valorTotal, 0), 0);
    const totalCustos = [
        custos.frete,
        custos.maoObra,
        custos.hospedagem,
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
        ...financeiroOriginal,
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
        ...eventoOriginal,
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
        ...escopoOriginal,
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
    const codigoOriginal = textoSeguro(proposta.codigo, '');
    const codigoComRevisao = textoSeguro(proposta.codigoExibicao || proposta.codigo, '');
    const codigoBaseRaw = textoSeguro(proposta.codigoBase || codigoOriginal, '');
    const codigoBase = codigoBaseRaw.replace(/\s+rev\.?\s*\d+$/i, '').trim() || codigoOriginal;
    const revisaoEncontrada = codigoComRevisao.match(/\brev\.?\s*(\d+)$/i);
    const revisaoOriginal = proposta.revisao
        ?? proposta.numeroRevisao
        ?? (revisaoEncontrada ? revisaoEncontrada[1] : 1);
    const revisao = revisaoOriginal !== ''
        && revisaoOriginal != null
        && Number.isFinite(Number(revisaoOriginal))
        ? inteiroNaoNegativo(revisaoOriginal, 0)
        : 1;
    const codigoExibicao = codigoBase ? `${codigoBase} Rev. ${revisao}` : codigoOriginal;

    const propostaMigrada = {
        ...proposta,
        id: proposta.id || Date.now(),
        codigo: codigoOriginal,
        codigoBase,
        revisao,
        numeroRevisao: revisao,
        codigoExibicao,
        propostaOrigemId: textoSeguro(proposta.propostaOrigemId, ''),
        historicoRevisoes: clonarArraySeguro(proposta.historicoRevisoes),
        motivoRevisao: textoSeguro(proposta.motivoRevisao, ''),
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
            ...controleInternoOriginal,
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
        dataRecusa: textoSeguro(proposta.dataRecusa, ''),
        dataCancelamento: textoSeguro(proposta.dataCancelamento, ''),
        dataConversaoLocacao: textoSeguro(proposta.dataConversaoLocacao, ''),
        motivoStatus: textoSeguro(proposta.motivoStatus, ''),
        motivoRecusa: textoSeguro(proposta.motivoRecusa, ''),
        motivoCancelamento: textoSeguro(proposta.motivoCancelamento, ''),
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
        || !('codigoBase' in proposta)
        || !('revisao' in proposta)
        || !('codigoExibicao' in proposta)
        || !('historicoRevisoes' in proposta)
        || !('dataRecusa' in proposta)
        || !('motivoStatus' in proposta)
        || !('motivoRecusa' in proposta)
        || !('motivoCancelamento' in proposta)
        || !('validadePropostaDias' in financeiroOriginal)
        || !('percentualEntrada' in financeiroOriginal)
        || !('tipoCalculoNF' in financeiroOriginal)
        || !('exibirInformacoesInternasPDF' in financeiroOriginal)
        || itens.some((item, indice) => !('periodoDias' in clonarObjetoSeguro(proposta.itens?.[indice], {})))
        || itens.some((item, indice) => !('categoria' in clonarObjetoSeguro(proposta.itens?.[indice], {})))
        || itens.some((item, indice) => !('custoTotal' in clonarObjetoSeguro(proposta.itens?.[indice], {})))
        || itens.some((item, indice) => !('percentualHonorarios' in clonarObjetoSeguro(proposta.itens?.[indice], {})))
        || itens.some((item, indice) => !('percentualEncargos' in clonarObjetoSeguro(proposta.itens?.[indice], {})))
        || itens.some((item, indice) => !('percentualINSS' in clonarObjetoSeguro(proposta.itens?.[indice], {})))
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
        logs: [],
        devolucoes: clonarArraySeguro(dadosBase.devolucoes)
    };

    const versaoAnterior = String(dadosBase.versao || 'sem-versao');

    const dadosMigrados = {
        ...dadosBase,
        locadores: clonarArraySeguro(dadosBase.locadores).map((locador) => migrarLocadorParaV12(locador, contexto)),
        pecas: clonarArraySeguro(dadosBase.pecas).map((peca) => migrarPecaParaV12(peca, contexto)),
        locacoes: clonarArraySeguro(dadosBase.locacoes).map((locacao) => migrarLocacaoParaV12(locacao, contexto)),
        propostas: clonarArraySeguro(dadosBase.propostas).map((proposta) => migrarPropostaParaV12(proposta, contexto)),
        devolucoes: clonarArraySeguro(dadosBase.devolucoes),
        movimentacoesEstoque: clonarArraySeguro(dadosBase.movimentacoesEstoque).map((movimentacao, indice) => normalizarMovimentacaoEstoqueV12(movimentacao, indice)),
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
            valorKmFretePadrao: 0,
            padroesOrcamento: null,
            categoriasOrcamento: null,
            perfilFiscalEmpresa: null
        }),
        versao: SCHEMA_VERSION_V12
    };

    if (!('usuarios' in dadosBase)) {
        contexto.houveMudanca = true;
    }

    if (!('transportes' in dadosBase)) {
        contexto.houveMudanca = true;
    }

    if (!('movimentacoesEstoque' in dadosBase)) {
        contexto.houveMudanca = true;
    }

    if (!dadosBase.config || !('valorKmFretePadrao' in dadosBase.config)) {
        contexto.houveMudanca = true;
    }

    if (!dadosBase.config || !('padroesOrcamento' in dadosBase.config)) {
        contexto.houveMudanca = true;
    }

    if (!dadosBase.config || !('categoriasOrcamento' in dadosBase.config)) {
        contexto.houveMudanca = true;
    }

    if (versaoAnterior !== SCHEMA_VERSION_V12) {
        contexto.houveMudanca = true;
    }

    const migracoesConfig = clonarObjetoSeguro(dadosMigrados.config.migracoes, {});
    const politicaJaMigrada = inteiroNaoNegativo(
        migracoesConfig.politicaCustosProprios,
        0
    ) >= VERSAO_MIGRACAO_POLITICA_CUSTOS_PROPRIOS;
    const possuiRegistros = [
        dadosBase.propostas,
        dadosBase.locacoes,
        dadosBase.pecas,
        dadosBase.locadores,
        dadosBase.tipos,
        dadosBase.devolucoes
    ].some((colecao) => Array.isArray(colecao) && colecao.length > 0);
    const possuiConfigAnterior = !!dadosBase.config
        && typeof dadosBase.config === 'object'
        && Object.keys(dadosBase.config).length > 0;
    const baseJaInicializada = possuiRegistros
        || possuiConfigAnterior
        || Object.prototype.hasOwnProperty.call(dadosBase, 'versao');

    if (!politicaJaMigrada) {
        const padroesExistentes = dadosMigrados.config.padroesOrcamento && typeof dadosMigrados.config.padroesOrcamento === 'object'
            ? dadosMigrados.config.padroesOrcamento
            : {};
        const globaisExistentes = padroesExistentes.globais && typeof padroesExistentes.globais === 'object'
            ? padroesExistentes.globais
            : padroesExistentes;
        dadosMigrados.config.padroesOrcamento = {
            ...padroesExistentes,
            globais: {
                ...globaisExistentes,
                politicaCustosProprios: baseJaInicializada
                    ? {
                        modo: 'percentual',
                        percentual: 20,
                        configurada: true,
                        origem: 'migracao_legado',
                        versao: VERSAO_MIGRACAO_POLITICA_CUSTOS_PROPRIOS
                    }
                    : {
                        modo: 'nao_calcular',
                        percentual: 0,
                        configurada: false,
                        origem: 'instalacao_nova',
                        versao: VERSAO_MIGRACAO_POLITICA_CUSTOS_PROPRIOS
                    }
            }
        };
        migracoesConfig.politicaCustosProprios = VERSAO_MIGRACAO_POLITICA_CUSTOS_PROPRIOS;
        contexto.houveMudanca = true;
        contexto.logs.push(baseJaInicializada
            ? 'Política de custos próprios preservada em 20% para a base existente.'
            : 'Política de custos próprios criada sem cálculo automático para a instalação vazia.');
    }

    const perfilFiscalJaMigrado = inteiroNaoNegativo(
        migracoesConfig.perfilFiscalEmpresa,
        0
    ) >= VERSAO_MIGRACAO_PERFIL_FISCAL_EMPRESA;
    if (!perfilFiscalJaMigrado) {
        dadosMigrados.config.perfilFiscalEmpresa = normalizarPerfilFiscalEmpresaV12(
            dadosMigrados.config.perfilFiscalEmpresa
        );
        migracoesConfig.perfilFiscalEmpresa = VERSAO_MIGRACAO_PERFIL_FISCAL_EMPRESA;
        contexto.houveMudanca = true;
        contexto.logs.push('Perfil fiscal da empresa preparado sem assumir regime, CNAE, código de serviço ou alíquota.');
    } else {
        dadosMigrados.config.perfilFiscalEmpresa = normalizarPerfilFiscalEmpresaV12(
            dadosMigrados.config.perfilFiscalEmpresa
        );
    }

    if (inteiroNaoNegativo(migracoesConfig.baseEdicaoLocacoes, 0) < VERSAO_MIGRACAO_BASE_EDICAO_LOCACOES) {
        migracoesConfig.baseEdicaoLocacoes = VERSAO_MIGRACAO_BASE_EDICAO_LOCACOES;
        contexto.houveMudanca = true;
        contexto.logs.push('Itens de locação receberam identificadores estáveis e snapshot passivo da reserva.');
    }

    dadosMigrados.config.migracoes = migracoesConfig;
    dadosMigrados.config.schemaVersion = SCHEMA_VERSION_V12;
    dadosMigrados.config.valorKmFretePadrao = numeroNaoNegativo(dadosMigrados.config.valorKmFretePadrao, 0);
    dadosMigrados.config.padroesOrcamento = criarPadroesOrcamentoV12({
        ...(dadosMigrados.config.padroesOrcamento && typeof dadosMigrados.config.padroesOrcamento === 'object' ? dadosMigrados.config.padroesOrcamento : {}),
        categoriasOrcamento: dadosMigrados.config.categoriasOrcamento || dadosMigrados.config.padroesOrcamento?.categoriasOrcamento
    });
    dadosMigrados.config.categoriasOrcamento = criarCategoriasOrcamentoV12(
        dadosMigrados.config.categoriasOrcamento || dadosMigrados.config.padroesOrcamento.categoriasOrcamento,
        dadosMigrados.config.padroesOrcamento.categorias,
        dadosMigrados.config.padroesOrcamento.globais
    );
    dadosMigrados.config.padroesOrcamento.categoriasOrcamento = dadosMigrados.config.categoriasOrcamento;

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
