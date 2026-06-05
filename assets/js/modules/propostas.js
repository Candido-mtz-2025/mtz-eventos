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
    const CATEGORIA_ITEM_PROPOSTA_PADRAO = 'outros';
    const CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME = 'Outros';
    const CATEGORIA_MAO_OBRA_PROPOSTA = 'mao-de-obra';
    const CATEGORIAS_ORCAMENTO_PADRAO = Object.freeze([
        { id: 'estrutura', nome: 'Estrutura', cor: '#3b82f6', icone: 'bi-columns-gap' },
        { id: 'mobiliario', nome: 'Mobiliário', cor: '#10b981', icone: 'bi-lamp' },
        { id: 'eletrica', nome: 'Elétrica', cor: '#f59e0b', icone: 'bi-lightning-charge' },
        { id: 'comunicacao-impressao', nome: 'Comunicação / Impressão', cor: '#8b5cf6', icone: 'bi-printer' },
        { id: 'alimentacao', nome: 'Alimentação', cor: '#ef4444', icone: 'bi-cup-straw' },
        { id: CATEGORIA_MAO_OBRA_PROPOSTA, nome: 'Mão de Obra', cor: '#06b6d4', icone: 'bi-person-workspace' },
        { id: 'logistica', nome: 'Logística', cor: '#0ea5e9', icone: 'bi-truck' },
        { id: CATEGORIA_ITEM_PROPOSTA_PADRAO, nome: CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME, cor: '#64748b', icone: 'bi-box-seam' }
    ]);
    const CATEGORIAS_ITEM_PROPOSTA = Object.freeze(CATEGORIAS_ORCAMENTO_PADRAO.map((categoria) => categoria.nome));
    const TIPOS_CALCULO_TRIBUTO_PROPOSTA = new Set(['simples', 'por_dentro']);
    const SECOES_FORMULARIO_PROPOSTA = new Set([
        'dados',
        'itens',
        'fechamento',
        'pdf'
    ]);

    let filtroPropostasAtual = 'todos';
    let subAbaPropostasAtual = 'formulario';
    let secaoFormularioPropostaAtual = 'dados';
    let listenersRegistrados = false;
    let bloqueioSincronizacaoValidade = false;
    let categoriasOrcamentoTemporarias = null;

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

    function normalizarTipoCalculoTributo(tipo, fallback = 'simples') {
        const valor = normalizarTextoBusca(tipo || fallback).replace(/[\s-]+/g, '_');
        return TIPOS_CALCULO_TRIBUTO_PROPOSTA.has(valor) ? valor : 'simples';
    }

    function normalizarBooleanoProposta(valor, fallback = false) {
        if (typeof valor === 'boolean') return valor;
        if (valor == null || valor === '') return !!fallback;
        const texto = normalizarTextoBusca(valor);
        if (['true', '1', 'sim', 's', 'yes'].includes(texto)) return true;
        if (['false', '0', 'nao', 'não', 'n', 'no'].includes(texto)) return false;
        return !!fallback;
    }

    function normalizarIdCategoriaOrcamento(valor, fallback = '') {
        const base = textoSeguro(valor, fallback)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return base || fallback || '';
    }

    function criarGlobaisPadraoOrcamento() {
        return {
            percentualHonorariosPadrao: 0,
            percentualEncargosPadrao: 0,
            percentualINSSPadrao: 0,
            percentualEntradaPadrao: 50,
            percentualDescontoPadrao: 0,
            tipoCalculoEncargosPadrao: 'simples',
            tipoCalculoINSSPadrao: 'simples',
            aplicarHonorariosAutomaticamente: true,
            aplicarEncargosAutomaticamente: true,
            aplicarINSSAutomaticamente: true
        };
    }

    function obterDefinicaoCategoriaPadrao(valor) {
        const alvoTexto = normalizarTextoBusca(valor);
        const alvoId = normalizarIdCategoriaOrcamento(valor);
        return CATEGORIAS_ORCAMENTO_PADRAO.find((categoria) => (
            categoria.id === alvoId ||
            normalizarTextoBusca(categoria.nome) === alvoTexto ||
            normalizarIdCategoriaOrcamento(categoria.nome) === alvoId
        ));
    }

    function criarCorCategoriaOrcamento(indice = 0) {
        const cores = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#0ea5e9', '#64748b'];
        return cores[Math.abs(indice) % cores.length];
    }

    function normalizarCategoriaConfigOrcamento(origem = {}, indice = 0, globais = criarGlobaisPadraoOrcamento(), regrasLegadas = {}) {
        const entrada = typeof origem === 'string' ? { nome: origem } : (origem && typeof origem === 'object' ? origem : {});
        const def = obterDefinicaoCategoriaPadrao(entrada.id || entrada.nome || entrada.categoria || entrada.label);
        const nomeBase = textoSeguro(entrada.nome ?? entrada.label ?? entrada.categoria ?? def?.nome ?? entrada.id, CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME);
        const ehOutros = normalizarTextoBusca(nomeBase) === normalizarTextoBusca(CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME)
            || normalizarIdCategoriaOrcamento(entrada.id || nomeBase) === CATEGORIA_ITEM_PROPOSTA_PADRAO;
        const idBase = ehOutros
            ? CATEGORIA_ITEM_PROPOSTA_PADRAO
            : normalizarIdCategoriaOrcamento(entrada.id || def?.id || nomeBase, `categoria-${indice + 1}`);
        const nome = ehOutros ? CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME : nomeBase;
        const regraLegada = regrasLegadas[idBase] || regrasLegadas[nome] || regrasLegadas[def?.nome] || {};
        const regra = { ...regraLegada, ...entrada };
        const ehMaoObra = idBase === CATEGORIA_MAO_OBRA_PROPOSTA || normalizarTextoBusca(nome) === normalizarTextoBusca('Mão de Obra');

        return {
            id: idBase,
            nome,
            ativa: ehOutros ? true : normalizarBooleanoProposta(regra.ativa, true),
            ordem: inteiroNaoNegativo(regra.ordem, def ? CATEGORIAS_ORCAMENTO_PADRAO.findIndex((categoria) => categoria.id === def.id) + 1 : indice + 1),
            cor: textoSeguro(regra.cor ?? def?.cor, criarCorCategoriaOrcamento(indice)),
            icone: textoSeguro(regra.icone ?? def?.icone, 'bi-tag'),
            fixa: ehOutros,
            arquivada: normalizarBooleanoProposta(regra.arquivada, false),
            aplicarHonorarios: normalizarBooleanoProposta(regra.aplicarHonorarios, true),
            percentualHonorarios: numeroNaoNegativo(regra.percentualHonorarios, globais.percentualHonorariosPadrao || 0),
            aplicarEncargos: normalizarBooleanoProposta(regra.aplicarEncargos, true),
            percentualEncargos: numeroNaoNegativo(regra.percentualEncargos, globais.percentualEncargosPadrao || 0),
            tipoCalculoEncargos: normalizarTipoCalculoTributo(regra.tipoCalculoEncargos, globais.tipoCalculoEncargosPadrao || 'simples'),
            aplicarINSS: normalizarBooleanoProposta(regra.aplicarINSS, ehMaoObra),
            percentualINSS: numeroNaoNegativo(regra.percentualINSS, globais.percentualINSSPadrao || 0),
            tipoCalculoINSS: normalizarTipoCalculoTributo(regra.tipoCalculoINSS, globais.tipoCalculoINSSPadrao || 'simples')
        };
    }

    function normalizarCategoriasOrcamentoConfig(valor = null, regrasLegadas = {}, globais = criarGlobaisPadraoOrcamento()) {
        const mapa = new Map();
        const adicionar = (origem, indice = mapa.size) => {
            const categoria = normalizarCategoriaConfigOrcamento(origem, indice, globais, regrasLegadas);
            const existente = mapa.get(categoria.id);
            mapa.set(categoria.id, existente ? { ...existente, ...categoria, fixa: existente.fixa || categoria.fixa } : categoria);
        };

        CATEGORIAS_ORCAMENTO_PADRAO.forEach((categoria, indice) => {
            adicionar({ ...categoria, ...(regrasLegadas[categoria.id] || regrasLegadas[categoria.nome] || {}), ordem: indice + 1 }, indice);
        });

        if (Array.isArray(valor)) {
            valor.forEach((categoria, indice) => adicionar(categoria, indice));
        }

        Object.entries(regrasLegadas || {}).forEach(([chave, regra], indice) => {
            if (!chave) return;
            const def = obterDefinicaoCategoriaPadrao(chave);
            const id = def?.id || normalizarIdCategoriaOrcamento(chave);
            if (mapa.has(id)) return;
            adicionar({
                id,
                nome: def?.nome || chave,
                ordem: 100 + indice,
                ...(regra && typeof regra === 'object' ? regra : {})
            }, 100 + indice);
        });

        if (!mapa.has(CATEGORIA_ITEM_PROPOSTA_PADRAO)) {
            adicionar(CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME, 999);
        }

        const outros = mapa.get(CATEGORIA_ITEM_PROPOSTA_PADRAO);
        mapa.set(CATEGORIA_ITEM_PROPOSTA_PADRAO, {
            ...outros,
            id: CATEGORIA_ITEM_PROPOSTA_PADRAO,
            nome: CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME,
            ativa: true,
            fixa: true,
            arquivada: false
        });

        return Array.from(mapa.values())
            .sort((a, b) => (numeroNaoNegativo(a.ordem, 999) - numeroNaoNegativo(b.ordem, 999)) || a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    function obterCategoriasOrcamento(opcoes = {}) {
        const incluirInativas = opcoes.incluirInativas !== false;
        const origemPadroes = config?.padroesOrcamento && typeof config.padroesOrcamento === 'object' ? config.padroesOrcamento : {};
        const origemGlobais = origemPadroes.globais && typeof origemPadroes.globais === 'object' ? origemPadroes.globais : origemPadroes;
        const globais = { ...criarGlobaisPadraoOrcamento(), ...origemGlobais };
        const regras = origemPadroes.categorias && typeof origemPadroes.categorias === 'object' ? origemPadroes.categorias : {};
        const origemCategorias = Array.isArray(categoriasOrcamentoTemporarias)
            ? categoriasOrcamentoTemporarias
            : config?.categoriasOrcamento;
        const categorias = normalizarCategoriasOrcamentoConfig(origemCategorias, regras, globais);
        return incluirInativas ? categorias : categorias.filter((categoria) => categoria.ativa !== false);
    }

    function obterCategoriaOrcamentoPorValor(valor, opcoes = {}) {
        const texto = textoSeguro(valor, '');
        if (!texto) {
            return obterCategoriasOrcamento({ incluirInativas: true }).find((categoria) => categoria.id === CATEGORIA_ITEM_PROPOSTA_PADRAO);
        }
        const alvoTexto = normalizarTextoBusca(texto);
        const alvoId = normalizarIdCategoriaOrcamento(texto);
        return obterCategoriasOrcamento({ incluirInativas: true }).find((categoria) => (
            categoria.id === texto ||
            categoria.id === alvoId ||
            normalizarTextoBusca(categoria.nome) === alvoTexto ||
            normalizarIdCategoriaOrcamento(categoria.nome) === alvoId
        )) || (opcoes.criarArquivada === false ? null : criarCategoriaArquivadaOrcamento(texto));
    }

    function criarCategoriaArquivadaOrcamento(valor) {
        const nome = textoSeguro(valor, CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME);
        const id = nome ? nome : CATEGORIA_ITEM_PROPOSTA_PADRAO;
        return {
            ...normalizarCategoriaConfigOrcamento({
                id,
                nome,
                ativa: false,
                arquivada: true,
                ordem: 999
            }, 999),
            id,
            nome,
            ativa: false,
            arquivada: true,
            fixa: false
        };
    }

    function normalizarCategoriaItemProposta(categoria) {
        const encontrada = obterCategoriaOrcamentoPorValor(categoria);
        return encontrada?.id || CATEGORIA_ITEM_PROPOSTA_PADRAO;
    }

    function rotuloCategoriaOrcamento(categoria) {
        const encontrada = obterCategoriaOrcamentoPorValor(categoria);
        if (!encontrada) return CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME;
        if (encontrada.arquivada || encontrada.ativa === false) return `${encontrada.nome} (inativa)`;
        return encontrada.nome;
    }

    function criarPadroesOrcamentoDefault() {
        const globais = criarGlobaisPadraoOrcamento();

        const categorias = {};
        const categoriasOrcamento = normalizarCategoriasOrcamentoConfig(null, {}, globais);
        categoriasOrcamento.forEach((categoria) => {
            categorias[categoria.id] = normalizarRegraCategoriaOrcamento(categoria.id, categoria, globais);
        });

        return { globais, categorias, categoriasOrcamento };
    }

    function normalizarRegraCategoriaOrcamento(categoria, regra = {}, globais = criarGlobaisPadraoOrcamento()) {
        const categoriaInfo = obterCategoriaOrcamentoPorValor(categoria, { criarArquivada: true });
        const categoriaNormalizada = categoriaInfo?.id || CATEGORIA_ITEM_PROPOSTA_PADRAO;
        const ehMaoObra = categoriaNormalizada === CATEGORIA_MAO_OBRA_PROPOSTA || normalizarTextoBusca(categoriaInfo?.nome) === normalizarTextoBusca('Mão de Obra');
        const origem = regra && typeof regra === 'object' ? regra : {};
        const nomeCategoria = textoSeguro(origem.nome ?? categoriaInfo?.nome ?? CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME, CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME);

        return {
            id: categoriaNormalizada,
            nome: nomeCategoria,
            ativa: categoriaNormalizada === CATEGORIA_ITEM_PROPOSTA_PADRAO ? true : normalizarBooleanoProposta(origem.ativa, categoriaInfo?.ativa !== false),
            ordem: inteiroNaoNegativo(origem.ordem, categoriaInfo?.ordem || 999),
            cor: textoSeguro(origem.cor ?? categoriaInfo?.cor, '#64748b'),
            icone: textoSeguro(origem.icone ?? categoriaInfo?.icone, 'bi-tag'),
            aplicarHonorarios: normalizarBooleanoProposta(origem.aplicarHonorarios ?? categoriaInfo?.aplicarHonorarios, true),
            percentualHonorarios: numeroNaoNegativo(origem.percentualHonorarios ?? categoriaInfo?.percentualHonorarios, globais.percentualHonorariosPadrao || 0),
            aplicarEncargos: normalizarBooleanoProposta(origem.aplicarEncargos ?? categoriaInfo?.aplicarEncargos, true),
            percentualEncargos: numeroNaoNegativo(origem.percentualEncargos ?? categoriaInfo?.percentualEncargos, globais.percentualEncargosPadrao || 0),
            tipoCalculoEncargos: normalizarTipoCalculoTributo(origem.tipoCalculoEncargos ?? categoriaInfo?.tipoCalculoEncargos, globais.tipoCalculoEncargosPadrao || 'simples'),
            aplicarINSS: normalizarBooleanoProposta(origem.aplicarINSS ?? categoriaInfo?.aplicarINSS, ehMaoObra),
            percentualINSS: numeroNaoNegativo(origem.percentualINSS ?? categoriaInfo?.percentualINSS, globais.percentualINSSPadrao || 0),
            tipoCalculoINSS: normalizarTipoCalculoTributo(origem.tipoCalculoINSS ?? categoriaInfo?.tipoCalculoINSS, globais.tipoCalculoINSSPadrao || 'simples')
        };
    }

    function normalizarPadroesOrcamento(valor = {}) {
        const padrao = criarPadroesOrcamentoDefault();
        const origem = valor && typeof valor === 'object' ? valor : {};
        const origemGlobais = origem.globais && typeof origem.globais === 'object' ? origem.globais : origem;

        const globais = {
            percentualHonorariosPadrao: numeroNaoNegativo(origemGlobais.percentualHonorariosPadrao ?? origemGlobais.honorariosPadrao, padrao.globais.percentualHonorariosPadrao),
            percentualEncargosPadrao: numeroNaoNegativo(origemGlobais.percentualEncargosPadrao ?? origemGlobais.encargosPadrao, padrao.globais.percentualEncargosPadrao),
            percentualINSSPadrao: numeroNaoNegativo(origemGlobais.percentualINSSPadrao ?? origemGlobais.inssPadrao, padrao.globais.percentualINSSPadrao),
            percentualEntradaPadrao: clampPercentual(origemGlobais.percentualEntradaPadrao ?? origemGlobais.entradaPadrao ?? padrao.globais.percentualEntradaPadrao),
            percentualDescontoPadrao: clampPercentual(origemGlobais.percentualDescontoPadrao ?? origemGlobais.descontoPadrao ?? padrao.globais.percentualDescontoPadrao),
            tipoCalculoEncargosPadrao: normalizarTipoCalculoTributo(origemGlobais.tipoCalculoEncargosPadrao, padrao.globais.tipoCalculoEncargosPadrao),
            tipoCalculoINSSPadrao: normalizarTipoCalculoTributo(origemGlobais.tipoCalculoINSSPadrao, padrao.globais.tipoCalculoINSSPadrao),
            aplicarHonorariosAutomaticamente: normalizarBooleanoProposta(origemGlobais.aplicarHonorariosAutomaticamente, padrao.globais.aplicarHonorariosAutomaticamente),
            aplicarEncargosAutomaticamente: normalizarBooleanoProposta(origemGlobais.aplicarEncargosAutomaticamente, padrao.globais.aplicarEncargosAutomaticamente),
            aplicarINSSAutomaticamente: normalizarBooleanoProposta(origemGlobais.aplicarINSSAutomaticamente, padrao.globais.aplicarINSSAutomaticamente)
        };

        const origemCategorias = origem.categorias && typeof origem.categorias === 'object' ? origem.categorias : {};
        const categorias = {};
        const categoriasOrcamento = normalizarCategoriasOrcamentoConfig(origem.categoriasOrcamento || config?.categoriasOrcamento, origemCategorias, globais);
        categoriasOrcamento.forEach((categoria) => {
            categorias[categoria.id] = normalizarRegraCategoriaOrcamento(categoria.id, {
                ...categoria,
                ...(origemCategorias[categoria.id] || {}),
                ...(origemCategorias[categoria.nome] || {})
            }, globais);
        });

        return { globais, categorias, categoriasOrcamento };
    }

    function obterPadroesOrcamento() {
        const normalizado = normalizarPadroesOrcamento(config?.padroesOrcamento);
        if (config && typeof config === 'object') {
            config.padroesOrcamento = normalizado;
        }
        return normalizado;
    }

    function obterRegraCategoriaParaItem(categoria) {
        const categoriaNormalizada = normalizarCategoriaItemProposta(categoria);
        const padroes = obterPadroesOrcamento();
        const regra = padroes.categorias[categoriaNormalizada] || normalizarRegraCategoriaOrcamento(categoriaNormalizada, {}, padroes.globais);

        return {
            ...regra,
            aplicarHonorarios: padroes.globais.aplicarHonorariosAutomaticamente && regra.aplicarHonorarios,
            aplicarEncargos: padroes.globais.aplicarEncargosAutomaticamente && regra.aplicarEncargos,
            aplicarINSS: padroes.globais.aplicarINSSAutomaticamente && regra.aplicarINSS
        };
    }

    function calcularValorPercentualTributo(base, percentual, tipoCalculo = 'simples') {
        const baseNormalizada = numeroNaoNegativo(base, 0);
        const percentualNormalizado = Math.min(99.99, numeroNaoNegativo(percentual, 0));
        if (baseNormalizada <= 0 || percentualNormalizado <= 0) return 0;
        if (normalizarTipoCalculoTributo(tipoCalculo) === 'por_dentro') {
            return arredondarMoeda((baseNormalizada / (1 - (percentualNormalizado / 100))) - baseNormalizada);
        }
        return arredondarMoeda((baseNormalizada * percentualNormalizado) / 100);
    }

    function calcularItemProposta(item = {}) {
        const categoria = normalizarCategoriaItemProposta(item.categoria);
        const regra = obterRegraCategoriaParaItem(categoria);
        const usarPadrao = item.usarPadraoCalculo === true;
        const temCalculoSalvo = !usarPadrao && [
            'aplicarHonorarios',
            'percentualHonorarios',
            'aplicarEncargos',
            'percentualEncargos',
            'tipoCalculoEncargos',
            'aplicarINSS',
            'percentualINSS',
            'tipoCalculoINSS'
        ].some((campo) => Object.prototype.hasOwnProperty.call(item, campo));

        const periodoDias = numeroNaoNegativo(item.periodoDias ?? item.periodo, 1) || 1;
        const quantidade = numeroNaoNegativo(item.quantidade, 0);
        const custoUnitario = numeroNaoNegativo(item.custoUnitario ?? item.valorUnitario, 0);
        const custoTotal = arredondarMoeda(periodoDias * quantidade * custoUnitario);

        const aplicarHonorarios = temCalculoSalvo
            ? normalizarBooleanoProposta(item.aplicarHonorarios, regra.aplicarHonorarios)
            : regra.aplicarHonorarios;
        const percentualHonorarios = temCalculoSalvo
            ? numeroNaoNegativo(item.percentualHonorarios, regra.percentualHonorarios)
            : regra.percentualHonorarios;
        const valorHonorarios = aplicarHonorarios
            ? calcularValorPercentualTributo(custoTotal, percentualHonorarios, 'simples')
            : 0;

        const aplicarEncargos = temCalculoSalvo
            ? normalizarBooleanoProposta(item.aplicarEncargos, regra.aplicarEncargos)
            : regra.aplicarEncargos;
        const percentualEncargos = temCalculoSalvo
            ? numeroNaoNegativo(item.percentualEncargos, regra.percentualEncargos)
            : regra.percentualEncargos;
        const tipoCalculoEncargos = temCalculoSalvo
            ? normalizarTipoCalculoTributo(item.tipoCalculoEncargos, regra.tipoCalculoEncargos)
            : regra.tipoCalculoEncargos;
        const valorEncargos = aplicarEncargos
            ? calcularValorPercentualTributo(custoTotal + valorHonorarios, percentualEncargos, tipoCalculoEncargos)
            : 0;

        const aplicarINSS = temCalculoSalvo
            ? normalizarBooleanoProposta(item.aplicarINSS, regra.aplicarINSS)
            : regra.aplicarINSS;
        const percentualINSS = temCalculoSalvo
            ? numeroNaoNegativo(item.percentualINSS, regra.percentualINSS)
            : regra.percentualINSS;
        const tipoCalculoINSS = temCalculoSalvo
            ? normalizarTipoCalculoTributo(item.tipoCalculoINSS, regra.tipoCalculoINSS)
            : regra.tipoCalculoINSS;
        const valorINSS = aplicarINSS
            ? calcularValorPercentualTributo(custoTotal + valorHonorarios, percentualINSS, tipoCalculoINSS)
            : 0;

        const valorTotal = arredondarMoeda(custoTotal + valorHonorarios + valorEncargos + valorINSS);

        return {
            categoria,
            descricao: textoSeguro(item.descricao, ''),
            medida: textoSeguro(item.medida, ''),
            periodoDias,
            quantidade,
            custoUnitario,
            valorUnitario: custoUnitario,
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
            observacoes: textoSeguro(item.observacoes, ''),
            usarPadraoCalculo: false
        };
    }

    function montarOptionsCategoriaItemProposta(categoriaAtual) {
        const atual = normalizarCategoriaItemProposta(categoriaAtual);
        const categorias = obterCategoriasOrcamento({ incluirInativas: false });
        const atualInfo = obterCategoriaOrcamentoPorValor(atual);
        const lista = [...categorias];
        if (atualInfo && !lista.some((categoria) => categoria.id === atualInfo.id)) {
            lista.push(atualInfo);
        }
        return lista.map((categoria) => {
            const selected = categoria.id === atual ? ' selected' : '';
            const sufixo = categoria.ativa === false || categoria.arquivada ? ' (inativa)' : '';
            return `<option value="${sanitizar(categoria.id)}"${selected}>${sanitizar(categoria.nome)}${sufixo}</option>`;
        }).join('');
    }

    function agruparItensPropostaPorCategoria(itens = []) {
        const grupos = obterCategoriasOrcamento({ incluirInativas: true }).map((categoria) => ({
            categoria: categoria.id,
            nome: categoria.nome,
            cor: categoria.cor,
            icone: categoria.icone,
            ativa: categoria.ativa,
            itens: [],
            subtotal: 0,
            custoTotal: 0,
            honorarios: 0,
            encargos: 0,
            inss: 0,
            totalFinal: 0
        }));
        const porCategoria = new Map(grupos.map((grupo) => [grupo.categoria, grupo]));

        (Array.isArray(itens) ? itens : []).forEach((item) => {
            const itemCalculado = calcularItemProposta(item || {});
            const categoria = itemCalculado.categoria;
            let grupo = porCategoria.get(categoria);
            if (!grupo) {
                const categoriaArquivada = obterCategoriaOrcamentoPorValor(categoria);
                grupo = {
                    categoria,
                    nome: categoriaArquivada?.nome || categoria,
                    cor: categoriaArquivada?.cor || '#64748b',
                    icone: categoriaArquivada?.icone || 'bi-archive',
                    ativa: false,
                    itens: [],
                    subtotal: 0,
                    custoTotal: 0,
                    honorarios: 0,
                    encargos: 0,
                    inss: 0,
                    totalFinal: 0
                };
                porCategoria.set(categoria, grupo);
                grupos.push(grupo);
            }
            grupo.itens.push(itemCalculado);
            grupo.custoTotal += numeroNaoNegativo(itemCalculado.custoTotal, 0);
            grupo.honorarios += numeroNaoNegativo(itemCalculado.valorHonorarios, 0);
            grupo.encargos += numeroNaoNegativo(itemCalculado.valorEncargos, 0);
            grupo.inss += numeroNaoNegativo(itemCalculado.valorINSS, 0);
            grupo.totalFinal += numeroNaoNegativo(itemCalculado.valorTotal, 0);
            grupo.subtotal = grupo.totalFinal;
        });

        return grupos.filter((grupo) => grupo.itens.length > 0);
    }

    function montarResumoCategoriasProposta(itens = []) {
        const grupos = obterCategoriasOrcamento({ incluirInativas: true }).map((categoria) => ({
            categoria: categoria.id,
            nome: categoria.nome,
            cor: categoria.cor,
            icone: categoria.icone,
            ativa: categoria.ativa,
            quantidade: 0,
            custoTotal: 0,
            honorarios: 0,
            encargos: 0,
            inss: 0,
            subtotal: 0
        }));
        const porCategoria = new Map(grupos.map((grupo) => [grupo.categoria, grupo]));

        (Array.isArray(itens) ? itens : []).forEach((item) => {
            const itemCalculado = calcularItemProposta(item || {});
            const categoria = itemCalculado.categoria;
            let grupo = porCategoria.get(categoria);
            if (!grupo) {
                const categoriaArquivada = obterCategoriaOrcamentoPorValor(categoria);
                grupo = {
                    categoria,
                    nome: categoriaArquivada?.nome || categoria,
                    cor: categoriaArquivada?.cor || '#64748b',
                    icone: categoriaArquivada?.icone || 'bi-archive',
                    ativa: false,
                    quantidade: 0,
                    custoTotal: 0,
                    honorarios: 0,
                    encargos: 0,
                    inss: 0,
                    subtotal: 0
                };
                porCategoria.set(categoria, grupo);
                grupos.push(grupo);
            }
            grupo.quantidade += 1;
            grupo.custoTotal += numeroNaoNegativo(itemCalculado.custoTotal, 0);
            grupo.honorarios += numeroNaoNegativo(itemCalculado.valorHonorarios, 0);
            grupo.encargos += numeroNaoNegativo(itemCalculado.valorEncargos, 0);
            grupo.inss += numeroNaoNegativo(itemCalculado.valorINSS, 0);
            grupo.subtotal += numeroNaoNegativo(itemCalculado.valorTotal, 0);
        });

        return grupos;
    }

    function renderizarResumoCategoriasProposta(itens = []) {
        const container = document.getElementById('propostaResumoCategorias');
        if (!container) return;

        const grupos = montarResumoCategoriasProposta(itens);
        const total = grupos.reduce((acc, grupo) => acc + grupo.subtotal, 0);

        container.innerHTML = `
            <div class="proposta-category-summary-head">
                <strong>Resumo por categoria</strong>
                <span>${formatarMoeda(total)}</span>
            </div>
            <div class="proposta-category-summary-grid">
                ${grupos.filter((grupo) => grupo.quantidade > 0 || grupo.categoria === CATEGORIA_ITEM_PROPOSTA_PADRAO).map((grupo) => `
                    <div class="proposta-category-chip${grupo.quantidade > 0 ? ' has-value' : ''}" style="--category-color: ${sanitizar(grupo.cor || '#64748b')}">
                        <span><i class="bi ${sanitizar(grupo.icone || 'bi-tag')}"></i> ${sanitizar(grupo.nome || rotuloCategoriaOrcamento(grupo.categoria))}${grupo.ativa === false ? ' <em>inativa</em>' : ''}</span>
                        <strong>${formatarMoeda(grupo.subtotal)}</strong>
                        <small>${grupo.quantidade} ${grupo.quantidade === 1 ? 'item' : 'itens'}</small>
                        <small>Custo ${formatarMoeda(grupo.custoTotal)}</small>
                        <small>Hon. ${formatarMoeda(grupo.honorarios)} • Enc. ${formatarMoeda(grupo.encargos)} • INSS ${formatarMoeda(grupo.inss)}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function valorNumeroConfigOrcamento(id, fallback = 0, max = Infinity) {
        const valor = numeroNaoNegativo(document.getElementById(id)?.value, fallback);
        return Math.min(max, valor);
    }

    function preencherValorConfigOrcamento(id, valor) {
        const el = document.getElementById(id);
        if (el) el.value = Number(valor || 0);
    }

    function montarLinhaConfigCategoriaOrcamento(categoria, globais = criarGlobaisPadraoOrcamento()) {
        const normalizada = normalizarCategoriaConfigOrcamento(categoria, numeroNaoNegativo(categoria?.ordem, 1), globais);
        const tipoEncargos = normalizarTipoCalculoTributo(normalizada.tipoCalculoEncargos);
        const tipoINSS = normalizarTipoCalculoTributo(normalizada.tipoCalculoINSS);
        const fixa = normalizada.id === CATEGORIA_ITEM_PROPOSTA_PADRAO || normalizada.fixa;
        const ativa = fixa || normalizada.ativa !== false;
        return `
            <div class="proposta-config-matrix-row" data-prop-orc-categoria="${sanitizar(normalizada.id)}">
                <div class="proposta-config-matrix-category">
                    <div class="proposta-config-category-editor">
                        <div class="proposta-config-category-main">
                            <input type="number" class="prop-orc-cat-ordem" min="1" step="1" value="${Number(normalizada.ordem || 1)}" title="Ordem">
                            <input type="color" class="prop-orc-cat-cor" value="${sanitizar(normalizada.cor || criarCorCategoriaOrcamento(normalizada.ordem))}" title="Cor da categoria">
                            <input type="text" class="prop-orc-cat-icone" value="${sanitizar(normalizada.icone || 'bi-tag')}" title="Ícone Bootstrap" placeholder="bi-tag">
                        </div>
                        <input type="text" class="prop-orc-cat-nome" value="${sanitizar(normalizada.nome)}" ${fixa ? 'readonly' : ''} placeholder="Nome da categoria">
                        <div class="proposta-config-category-actions">
                            <label class="proposta-config-active-toggle">
                                <input type="checkbox" class="prop-orc-cat-ativa" ${ativa ? 'checked' : ''} ${fixa ? 'disabled' : ''}>
                                ${ativa ? 'Ativa' : 'Inativa'}
                            </label>
                            <button type="button" class="btn btn-sm btn-secondary table-action-btn" data-action="moverCategoriaConfigOrcamento" data-arg="${sanitizar(normalizada.id)}:up" title="Subir categoria">
                                <i class="bi bi-arrow-up"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary table-action-btn" data-action="moverCategoriaConfigOrcamento" data-arg="${sanitizar(normalizada.id)}:down" title="Descer categoria">
                                <i class="bi bi-arrow-down"></i>
                            </button>
                        </div>
                        ${fixa ? '<small>Categoria obrigatória de segurança.</small>' : ''}
                    </div>
                </div>
                <div class="proposta-config-tax-cell">
                    <label class="proposta-config-tax-toggle">
                        <input type="checkbox" class="prop-orc-cat-honorarios-check" ${normalizada.aplicarHonorarios !== false ? 'checked' : ''}> Honorários
                    </label>
                    <div class="proposta-config-percent-field">
                        <input type="number" class="prop-orc-cat-honorarios-percent" min="0" step="0.01" value="${Number(normalizada.percentualHonorarios || globais.percentualHonorariosPadrao || 0)}" aria-label="Percentual de honorários em ${sanitizar(normalizada.nome)}">
                        <span>%</span>
                    </div>
                </div>
                <div class="proposta-config-tax-cell">
                    <label class="proposta-config-tax-toggle">
                        <input type="checkbox" class="prop-orc-cat-encargos-check" ${normalizada.aplicarEncargos !== false ? 'checked' : ''}> Encargos
                    </label>
                    <div class="proposta-config-percent-field">
                        <input type="number" class="prop-orc-cat-encargos-percent" min="0" step="0.01" value="${Number(normalizada.percentualEncargos || globais.percentualEncargosPadrao || 0)}" aria-label="Percentual de encargos em ${sanitizar(normalizada.nome)}">
                        <span>%</span>
                    </div>
                    <select class="prop-orc-cat-encargos-tipo proposta-config-type-select" aria-label="Tipo de cálculo dos encargos em ${sanitizar(normalizada.nome)}">
                        <option value="simples"${tipoEncargos === 'simples' ? ' selected' : ''}>Simples</option>
                        <option value="por_dentro"${tipoEncargos === 'por_dentro' ? ' selected' : ''}>Por dentro</option>
                    </select>
                </div>
                <div class="proposta-config-tax-cell">
                    <label class="proposta-config-tax-toggle">
                        <input type="checkbox" class="prop-orc-cat-inss-check" ${normalizada.aplicarINSS === true ? 'checked' : ''}> INSS
                    </label>
                    <div class="proposta-config-percent-field">
                        <input type="number" class="prop-orc-cat-inss-percent" min="0" step="0.01" value="${Number(normalizada.percentualINSS || globais.percentualINSSPadrao || 0)}" aria-label="Percentual de INSS em ${sanitizar(normalizada.nome)}">
                        <span>%</span>
                    </div>
                    <select class="prop-orc-cat-inss-tipo proposta-config-type-select" aria-label="Tipo de cálculo do INSS em ${sanitizar(normalizada.nome)}">
                        <option value="simples"${tipoINSS === 'simples' ? ' selected' : ''}>Simples</option>
                        <option value="por_dentro"${tipoINSS === 'por_dentro' ? ' selected' : ''}>Por dentro</option>
                    </select>
                </div>
            </div>
        `;
    }

    function atualizarMetaTopoPropostas(total = 0, filtradas = 0, termoRaw = '') {
        const el = document.getElementById('propHeaderMeta');
        if (!el) return;
        const filtroAtivo = filtroPropostasAtual !== 'todos';
        const temBusca = !!textoSeguro(termoRaw);
        const status = filtroAtivo || temBusca ? 'Lista filtrada' : 'Lista completa';
        el.textContent = `${filtradas} de ${total} propostas • ${status}`;
    }

    function renderConfigOrcamentoProposta(padroesOrigem = null, valorKmOrigem = null) {
        const padroes = normalizarPadroesOrcamento(padroesOrigem || config?.padroesOrcamento);
        const globais = padroes.globais || {};

        preencherValorConfigOrcamento('propOrcConfigEntradaPadrao', globais.percentualEntradaPadrao ?? 50);
        preencherValorConfigOrcamento('propOrcConfigHonorariosPadrao', globais.percentualHonorariosPadrao || 0);
        preencherValorConfigOrcamento('propOrcConfigEncargosPadrao', globais.percentualEncargosPadrao || 0);
        preencherValorConfigOrcamento('propOrcConfigINSSPadrao', globais.percentualINSSPadrao || 0);
        preencherValorConfigOrcamento('propOrcConfigValorKmPadrao', valorKmOrigem ?? obterValorKmFretePadrao());

        const tipoEncargos = document.getElementById('propOrcConfigTipoEncargosPadrao');
        if (tipoEncargos) tipoEncargos.value = globais.tipoCalculoEncargosPadrao || 'simples';
        const tipoINSS = document.getElementById('propOrcConfigTipoINSSPadrao');
        if (tipoINSS) tipoINSS.value = globais.tipoCalculoINSSPadrao || 'simples';

        const container = document.getElementById('propOrcConfigCategorias');
        if (!container) return;
        const categorias = normalizarCategoriasOrcamentoConfig(
            categoriasOrcamentoTemporarias || padroes.categoriasOrcamento || config?.categoriasOrcamento,
            padroes.categorias,
            globais
        );

        container.innerHTML = `
            <div class="proposta-config-categories-toolbar">
                <div>
                    <strong>Categorias da composição</strong>
                    <small>Edite nomes, ordem e regras. Categorias inativas não aparecem para novos itens.</small>
                </div>
                <button type="button" class="btn btn-sm btn-primary" data-action="adicionarCategoriaConfigOrcamento">
                    <i class="bi bi-plus-lg"></i> Nova categoria
                </button>
            </div>
            <div class="proposta-config-matrix-head" aria-hidden="true">
                <span>Categoria</span>
                <span>Honorários</span>
                <span>Encargos</span>
                <span>INSS</span>
            </div>
            ${categorias.map((categoria) => montarLinhaConfigCategoriaOrcamento(categoria, globais)).join('')}
        `;
    }

    function coletarConfigOrcamentoProposta() {
        const atuais = obterPadroesOrcamento();
        const globaisAtuais = atuais.globais || {};
        const globais = {
            percentualHonorariosPadrao: valorNumeroConfigOrcamento('propOrcConfigHonorariosPadrao'),
            percentualEncargosPadrao: valorNumeroConfigOrcamento('propOrcConfigEncargosPadrao'),
            percentualINSSPadrao: valorNumeroConfigOrcamento('propOrcConfigINSSPadrao'),
            percentualEntradaPadrao: valorNumeroConfigOrcamento('propOrcConfigEntradaPadrao', 50, 100),
            percentualDescontoPadrao: globaisAtuais.percentualDescontoPadrao || 0,
            tipoCalculoEncargosPadrao: normalizarTipoCalculoTributo(document.getElementById('propOrcConfigTipoEncargosPadrao')?.value),
            tipoCalculoINSSPadrao: normalizarTipoCalculoTributo(document.getElementById('propOrcConfigTipoINSSPadrao')?.value),
            aplicarHonorariosAutomaticamente: globaisAtuais.aplicarHonorariosAutomaticamente !== false,
            aplicarEncargosAutomaticamente: globaisAtuais.aplicarEncargosAutomaticamente !== false,
            aplicarINSSAutomaticamente: globaisAtuais.aplicarINSSAutomaticamente !== false
        };

        const categorias = {};
        const categoriasOrcamento = [];
        const idsUsados = new Set();
        document.querySelectorAll('#propOrcConfigCategorias [data-prop-orc-categoria]').forEach((linha, indice) => {
            const idOriginal = linha.getAttribute('data-prop-orc-categoria') || '';
            const nome = textoSeguro(linha.querySelector('.prop-orc-cat-nome')?.value, CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME);
            let id = idOriginal || normalizarIdCategoriaOrcamento(nome, `categoria-${indice + 1}`);
            if (id !== CATEGORIA_ITEM_PROPOSTA_PADRAO && idsUsados.has(id)) {
                id = `${id}-${indice + 1}`;
            }
            idsUsados.add(id);
            const fixa = id === CATEGORIA_ITEM_PROPOSTA_PADRAO;
            const regraAtual = atuais.categorias?.[id] || atuais.categorias?.[nome] || {};
            const categoriaConfig = normalizarCategoriaConfigOrcamento({
                id,
                nome,
                ativa: fixa ? true : linha.querySelector('.prop-orc-cat-ativa')?.checked === true,
                ordem: inteiroNaoNegativo(linha.querySelector('.prop-orc-cat-ordem')?.value, indice + 1),
                cor: textoSeguro(linha.querySelector('.prop-orc-cat-cor')?.value, regraAtual.cor || criarCorCategoriaOrcamento(indice)),
                icone: textoSeguro(linha.querySelector('.prop-orc-cat-icone')?.value, regraAtual.icone || 'bi-tag'),
                aplicarHonorarios: linha.querySelector('.prop-orc-cat-honorarios-check')?.checked === true,
                percentualHonorarios: numeroNaoNegativo(linha.querySelector('.prop-orc-cat-honorarios-percent')?.value, globais.percentualHonorariosPadrao),
                aplicarEncargos: linha.querySelector('.prop-orc-cat-encargos-check')?.checked === true,
                percentualEncargos: numeroNaoNegativo(linha.querySelector('.prop-orc-cat-encargos-percent')?.value, globais.percentualEncargosPadrao),
                tipoCalculoEncargos: normalizarTipoCalculoTributo(linha.querySelector('.prop-orc-cat-encargos-tipo')?.value),
                aplicarINSS: linha.querySelector('.prop-orc-cat-inss-check')?.checked === true,
                percentualINSS: numeroNaoNegativo(linha.querySelector('.prop-orc-cat-inss-percent')?.value, globais.percentualINSSPadrao),
                tipoCalculoINSS: normalizarTipoCalculoTributo(linha.querySelector('.prop-orc-cat-inss-tipo')?.value)
            }, indice, globais, atuais.categorias);
            categoriasOrcamento.push(categoriaConfig);
            categorias[categoriaConfig.id] = {
                id: categoriaConfig.id,
                nome: categoriaConfig.nome,
                ativa: categoriaConfig.ativa,
                ordem: categoriaConfig.ordem,
                cor: categoriaConfig.cor,
                icone: categoriaConfig.icone,
                aplicarHonorarios: categoriaConfig.aplicarHonorarios,
                percentualHonorarios: categoriaConfig.percentualHonorarios,
                aplicarEncargos: categoriaConfig.aplicarEncargos,
                percentualEncargos: categoriaConfig.percentualEncargos,
                tipoCalculoEncargos: categoriaConfig.tipoCalculoEncargos,
                aplicarINSS: categoriaConfig.aplicarINSS,
                percentualINSS: categoriaConfig.percentualINSS,
                tipoCalculoINSS: categoriaConfig.tipoCalculoINSS
            };
        });

        return {
            padroes: normalizarPadroesOrcamento({ globais, categorias, categoriasOrcamento }),
            categoriasOrcamento: normalizarCategoriasOrcamentoConfig(categoriasOrcamento, categorias, globais),
            valorKmFretePadrao: numeroNaoNegativo(document.getElementById('propOrcConfigValorKmPadrao')?.value, 0)
        };
    }

    function abrirConfigOrcamentoProposta() {
        renderConfigOrcamentoProposta();
        const drawer = document.getElementById('propostaConfigDrawer');
        if (!drawer) return;
        drawer.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
        document.querySelectorAll('[data-action="abrirConfigOrcamentoProposta"]').forEach((btn) => {
            btn.setAttribute('aria-expanded', 'true');
        });
        setTimeout(() => document.getElementById('propOrcConfigEntradaPadrao')?.focus(), 80);
    }

    function fecharConfigOrcamentoProposta() {
        const drawer = document.getElementById('propostaConfigDrawer');
        if (!drawer) return;
        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        document.querySelectorAll('[data-action="abrirConfigOrcamentoProposta"]').forEach((btn) => {
            btn.setAttribute('aria-expanded', 'false');
        });
    }

    function aplicarPadroesOrcamentoNaPropostaAtual(padroesOverride = null, valorKmOverride = null, categoriasOverride = null) {
        if (Array.isArray(categoriasOverride)) {
            categoriasOrcamentoTemporarias = normalizarCategoriasOrcamentoConfig(categoriasOverride, padroesOverride?.categorias || {}, padroesOverride?.globais || criarGlobaisPadraoOrcamento());
        }
        const padroes = normalizarPadroesOrcamento(padroesOverride || obterPadroesOrcamento());
        const entradaEl = document.getElementById('propPercentualEntrada');
        if (entradaEl) entradaEl.value = String(padroes.globais.percentualEntradaPadrao ?? 50);

        const valorKm = valorKmOverride == null
            ? obterValorKmFretePadrao()
            : numeroNaoNegativo(valorKmOverride, 0);
        const valorKmEl = document.getElementById('propFreteValorKm');
        if (valorKmEl && valorKm > 0) valorKmEl.value = String(valorKm);

        document.querySelectorAll('#propostaItensBody .proposta-item-row').forEach((linha) => {
            const categoria = normalizarCategoriaItemProposta(linha.querySelector('.prop-item-categoria')?.value);
            const select = linha.querySelector('.prop-item-categoria');
            if (select) {
                select.innerHTML = montarOptionsCategoriaItemProposta(categoria);
                select.value = categoria;
            }
            const regra = padroes.categorias[categoria] || normalizarRegraCategoriaOrcamento(categoria, {}, padroes.globais);
            preencherLinhaComRegraCategoria(linha, categoria, regra, padroes.globais);
            linha.dataset.categoriaAtual = categoria;
        });
        recalcularResumoProposta();
    }

    function aplicarConfigOrcamentoProposta() {
        const { padroes, categoriasOrcamento, valorKmFretePadrao } = coletarConfigOrcamentoProposta();
        const modoAplicacao = document.querySelector('input[name="propOrcConfigModoAplicacao"]:checked')?.value || 'atual';

        if (modoAplicacao === 'padrao' && typeof validarPermissao === 'function' && !validarPermissao('configuracao', 'Somente administrador pode salvar padrões de orçamento.')) {
            return;
        }

        aplicarPadroesOrcamentoNaPropostaAtual(padroes, valorKmFretePadrao, categoriasOrcamento);

        if (modoAplicacao !== 'padrao') {
            fecharConfigOrcamentoProposta();
            mostrarToast('Configurações aplicadas somente nesta proposta.', 'info');
            return;
        }

        if (config && typeof config === 'object') {
            config.padroesOrcamento = padroes;
            config.categoriasOrcamento = categoriasOrcamento;
            config.valorKmFretePadrao = valorKmFretePadrao;
        }
        categoriasOrcamentoTemporarias = null;

        salvarLocal();
        sincronizar('salvar');
        if (typeof renderConfigPadroesOrcamento === 'function') renderConfigPadroesOrcamento();
        if (typeof registrarLog === 'function') registrarLog('config', 'Atualizar', 'Padrões de orçamento atualizados pela aba Orçamentos.');
        fecharConfigOrcamentoProposta();
        mostrarToast('Configurações salvas como padrão e aplicadas ao orçamento.');
    }

    function restaurarPadroesConfigOrcamentoProposta() {
        categoriasOrcamentoTemporarias = null;
        renderConfigOrcamentoProposta(criarPadroesOrcamentoDefault(), 0);
        mostrarToast('Padrões originais carregados. Clique em aplicar para salvar.', 'info');
    }

    function gerarIdCategoriaLivreConfig(nomeBase = 'Nova categoria') {
        const ids = new Set(Array.from(document.querySelectorAll('#propOrcConfigCategorias [data-prop-orc-categoria]'))
            .map((linha) => linha.getAttribute('data-prop-orc-categoria'))
            .filter(Boolean));
        const base = normalizarIdCategoriaOrcamento(nomeBase, 'nova-categoria');
        let candidato = base;
        let contador = 2;
        while (ids.has(candidato)) {
            candidato = `${base}-${contador}`;
            contador += 1;
        }
        return candidato;
    }

    function renumerarOrdemCategoriasConfig() {
        document.querySelectorAll('#propOrcConfigCategorias .proposta-config-matrix-row').forEach((linha, indice) => {
            const ordem = linha.querySelector('.prop-orc-cat-ordem');
            if (ordem) ordem.value = String(indice + 1);
        });
    }

    function adicionarCategoriaConfigOrcamento() {
        const container = document.getElementById('propOrcConfigCategorias');
        if (!container) return;
        const linhas = container.querySelectorAll('.proposta-config-matrix-row');
        const ordem = linhas.length + 1;
        const id = gerarIdCategoriaLivreConfig('Nova categoria');
        const categoria = normalizarCategoriaConfigOrcamento({
            id,
            nome: 'Nova categoria',
            ativa: true,
            ordem,
            cor: criarCorCategoriaOrcamento(ordem),
            icone: 'bi-tag'
        }, ordem);
        container.insertAdjacentHTML('beforeend', montarLinhaConfigCategoriaOrcamento(categoria));
        renumerarOrdemCategoriasConfig();
        const novaLinha = container.querySelector(`[data-prop-orc-categoria="${id}"]`);
        setTimeout(() => {
            const nome = novaLinha?.querySelector('.prop-orc-cat-nome');
            nome?.focus();
            nome?.select?.();
        }, 50);
    }

    function moverCategoriaConfigOrcamento(arg) {
        const [id, direcao] = String(arg || '').split(':');
        const container = document.getElementById('propOrcConfigCategorias');
        const linha = Array.from(container?.querySelectorAll('.proposta-config-matrix-row') || [])
            .find((row) => row.getAttribute('data-prop-orc-categoria') === id);
        if (!container || !linha) return;
        const linhas = Array.from(container.querySelectorAll('.proposta-config-matrix-row'));
        const indice = linhas.indexOf(linha);
        if (direcao === 'up' && indice > 0) {
            container.insertBefore(linha, linhas[indice - 1]);
        } else if (direcao === 'down' && indice >= 0 && indice < linhas.length - 1) {
            container.insertBefore(linhas[indice + 1], linha);
        }
        renumerarOrdemCategoriasConfig();
    }

    function mostrarSubAbaPropostas(alvo = 'formulario', opcoes = {}) {
        const subAba = alvo === 'lista' ? 'lista' : 'formulario';
        subAbaPropostasAtual = subAba;

        document.querySelectorAll('[data-propostas-subtab]').forEach((botao) => {
            const ativo = botao.getAttribute('data-propostas-subtab') === subAba;
            botao.classList.toggle('is-active', ativo);
            botao.setAttribute('aria-selected', ativo ? 'true' : 'false');
        });

        const paineis = {
            formulario: document.getElementById('propostasPainelFormulario'),
            lista: document.getElementById('propostasPainelLista')
        };

        Object.entries(paineis).forEach(([chave, painel]) => {
            if (!painel) return;
            const ativo = chave === subAba;
            painel.hidden = !ativo;
            painel.classList.toggle('is-active', ativo);
        });

        if (subAba === 'lista') {
            renderPropostas();
        }

        if (opcoes.semRolagem) return;

        setTimeout(() => {
            const alvoScroll = subAba === 'lista'
                ? document.getElementById('propostasListaCard')
                : document.getElementById('propostasFormularioCard');
            if (typeof window.rolarParaElementoAtalho === 'function') {
                window.rolarParaElementoAtalho(alvoScroll, 'start', { forcar: true });
            } else {
                alvoScroll?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            if (subAba === 'lista') {
                document.getElementById('buscaPropostas')?.focus();
                return;
            }

            mostrarSecaoFormularioProposta(secaoFormularioPropostaAtual, { semRolagem: true, foco: false });
            if (opcoes.foco !== false) {
                document.getElementById('propClienteNome')?.focus();
            }
        }, 80);
    }

    function mostrarSecaoFormularioProposta(alvo = 'dados', opcoes = {}) {
        const secao = SECOES_FORMULARIO_PROPOSTA.has(String(alvo)) ? String(alvo) : 'dados';
        secaoFormularioPropostaAtual = secao;

        document.querySelectorAll('[data-proposta-form-tab]').forEach((botao) => {
            const ativo = botao.getAttribute('data-proposta-form-tab') === secao;
            botao.classList.toggle('is-active', ativo);
            botao.setAttribute('aria-selected', ativo ? 'true' : 'false');
        });

        document.querySelectorAll('[data-proposta-form-section]').forEach((painel) => {
            const ativo = painel.getAttribute('data-proposta-form-section') === secao;
            painel.hidden = !ativo;
            painel.classList.toggle('is-active', ativo);
        });

        if (opcoes.semRolagem) return;

        setTimeout(() => {
            const painel = document.querySelector(`[data-proposta-form-section="${secao}"]`);
            if (typeof window.rolarParaElementoAtalho === 'function') {
                window.rolarParaElementoAtalho(painel, 'start', { forcar: true });
            } else {
                painel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            if (opcoes.foco === false) return;

            const focoPorSecao = {
                dados: 'propClienteNome',
                itens: null,
                fechamento: 'propFreteDistanciaKm',
                pdf: 'propIncluso'
            };

            const campoId = focoPorSecao[secao];
            if (campoId) {
                document.getElementById(campoId)?.focus();
                return;
            }

            document.querySelector('#propostaItensBody .prop-item-descricao')?.focus();
        }, 80);
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

    function preencherResponsavelPropostaSeVazio() {
        const campo = document.getElementById('propResponsavel');
        if (campo && !textoSeguro(campo.value)) {
            campo.value = obterUsuarioAtualNomeOuEmail();
        }
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

    function montarOptionsTipoCalculoTributo(tipoAtual) {
        const atual = normalizarTipoCalculoTributo(tipoAtual);
        return [
            ['simples', 'Simples'],
            ['por_dentro', 'Por dentro']
        ].map(([valor, rotulo]) => {
            const selected = valor === atual ? ' selected' : '';
            return `<option value="${valor}"${selected}>${rotulo}</option>`;
        }).join('');
    }

    function criarLinhaItemProposta(item = {}) {
        const itemCalculado = calcularItemProposta(item);
        const descricao = sanitizar(itemCalculado.descricao);
        const medida = sanitizar(itemCalculado.medida);
        const observacoes = sanitizar(itemCalculado.observacoes);
        const checkedHonorarios = itemCalculado.aplicarHonorarios ? ' checked' : '';
        const checkedEncargos = itemCalculado.aplicarEncargos ? ' checked' : '';
        const checkedINSS = itemCalculado.aplicarINSS ? ' checked' : '';

        return `
            <tr class="proposta-item-row" data-categoria-atual="${sanitizar(itemCalculado.categoria)}">
                <td>
                    <select class="prop-item-categoria" data-change="recalcularResumoProposta">
                        ${montarOptionsCategoriaItemProposta(itemCalculado.categoria)}
                    </select>
                </td>
                <td><input type="text" class="prop-item-descricao" value="${descricao}" placeholder="Descricao do item" data-input="recalcularResumoProposta"></td>
                <td><input type="text" class="prop-item-medida" value="${medida}" placeholder="Medida" data-input="recalcularResumoProposta"></td>
                <td><input type="number" class="prop-item-periodo" value="${itemCalculado.periodoDias}" min="0" step="0.5" data-input="recalcularResumoProposta"></td>
                <td><input type="number" class="prop-item-quantidade" value="${itemCalculado.quantidade}" min="0" step="1" data-input="recalcularResumoProposta"></td>
                <td><input type="number" class="prop-item-unitario" value="${itemCalculado.custoUnitario}" min="0" step="0.01" data-input="recalcularResumoProposta"></td>
                <td><input type="text" class="prop-item-custo-total" value="${formatarMoeda(itemCalculado.custoTotal)}" readonly></td>
                <td><input type="text" class="prop-item-total" value="${formatarMoeda(itemCalculado.valorTotal)}" readonly></td>
                <td class="col-actions">
                    <div class="actions-cell">
                        <button type="button" class="btn btn-sm btn-secondary table-action-btn prop-details-toggle-btn" data-action="alternarDetalhesCalculoItemProposta" data-arg="__this__" aria-expanded="false" title="Detalhes de calculo">
                            <i class="bi bi-chevron-down"></i>
                            <span>Ajustes</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-info table-action-btn" data-action="duplicarLinhaItemProposta" data-arg="__this__" title="Duplicar item">
                            <i class="bi bi-files"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-danger table-action-btn" data-action="removerLinhaItemProposta" data-arg="__this__" title="Remover item">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
            <tr class="proposta-item-details-row" hidden>
                <td colspan="9">
                    <div class="prop-item-details-panel">
                        <div class="prop-item-details-title">
                            <strong>Detalhes de calculo</strong>
                            <span>Use estes campos apenas para excecoes do item.</span>
                        </div>
                        <div class="prop-item-details-grid">
                            <label class="prop-calc-toggle">
                                <input type="checkbox" class="prop-item-aplicar-honorarios" data-change="recalcularResumoProposta"${checkedHonorarios}>
                                Aplicar honorarios
                            </label>
                            <div class="form-group">
                                <label>% Honorarios</label>
                                <input type="number" class="prop-item-percentual-honorarios" value="${itemCalculado.percentualHonorarios}" min="0" step="0.01" data-input="recalcularResumoProposta">
                            </div>
                            <div class="form-group">
                                <label>Valor honorarios</label>
                                <input type="text" class="prop-item-valor-honorarios" value="${formatarMoeda(itemCalculado.valorHonorarios)}" readonly>
                            </div>
                            <label class="prop-calc-toggle">
                                <input type="checkbox" class="prop-item-aplicar-encargos" data-change="recalcularResumoProposta"${checkedEncargos}>
                                Aplicar encargos
                            </label>
                            <div class="form-group">
                                <label>% Encargos</label>
                                <input type="number" class="prop-item-percentual-encargos" value="${itemCalculado.percentualEncargos}" min="0" step="0.01" data-input="recalcularResumoProposta">
                            </div>
                            <div class="form-group">
                                <label>Tipo encargos</label>
                                <select class="prop-item-tipo-encargos" data-change="recalcularResumoProposta">
                                    ${montarOptionsTipoCalculoTributo(itemCalculado.tipoCalculoEncargos)}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Valor encargos</label>
                                <input type="text" class="prop-item-valor-encargos" value="${formatarMoeda(itemCalculado.valorEncargos)}" readonly>
                            </div>
                            <label class="prop-calc-toggle">
                                <input type="checkbox" class="prop-item-aplicar-inss" data-change="recalcularResumoProposta"${checkedINSS}>
                                Aplicar INSS
                            </label>
                            <div class="form-group">
                                <label>% INSS</label>
                                <input type="number" class="prop-item-percentual-inss" value="${itemCalculado.percentualINSS}" min="0" step="0.01" data-input="recalcularResumoProposta">
                            </div>
                            <div class="form-group">
                                <label>Tipo INSS</label>
                                <select class="prop-item-tipo-inss" data-change="recalcularResumoProposta">
                                    ${montarOptionsTipoCalculoTributo(itemCalculado.tipoCalculoINSS)}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Valor INSS</label>
                                <input type="text" class="prop-item-valor-inss" value="${formatarMoeda(itemCalculado.valorINSS)}" readonly>
                            </div>
                            <div class="form-group prop-item-obs-group">
                                <label>Observacoes</label>
                                <input type="text" class="prop-item-obs" value="${observacoes}" placeholder="Observacoes internas ou comerciais" data-input="recalcularResumoProposta">
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }

    function preencherLinhaComRegraCategoria(linha, categoria, regraOverride = null, globaisOverride = null) {
        const regraBase = regraOverride || obterRegraCategoriaParaItem(categoria);
        const globais = globaisOverride || obterPadroesOrcamento().globais || {};
        const regra = regraOverride
            ? {
                ...regraBase,
                aplicarHonorarios: globais.aplicarHonorariosAutomaticamente !== false && regraBase.aplicarHonorarios,
                aplicarEncargos: globais.aplicarEncargosAutomaticamente !== false && regraBase.aplicarEncargos,
                aplicarINSS: globais.aplicarINSSAutomaticamente !== false && regraBase.aplicarINSS
            }
            : regraBase;
        const detalhes = linha?.nextElementSibling?.classList?.contains('proposta-item-details-row')
            ? linha.nextElementSibling
            : null;
        if (!detalhes) return;

        const mapa = [
            ['.prop-item-aplicar-honorarios', 'checked', regra.aplicarHonorarios],
            ['.prop-item-percentual-honorarios', 'value', regra.percentualHonorarios],
            ['.prop-item-aplicar-encargos', 'checked', regra.aplicarEncargos],
            ['.prop-item-percentual-encargos', 'value', regra.percentualEncargos],
            ['.prop-item-tipo-encargos', 'value', regra.tipoCalculoEncargos],
            ['.prop-item-aplicar-inss', 'checked', regra.aplicarINSS],
            ['.prop-item-percentual-inss', 'value', regra.percentualINSS],
            ['.prop-item-tipo-inss', 'value', regra.tipoCalculoINSS]
        ];

        mapa.forEach(([seletor, prop, valor]) => {
            const campo = detalhes.querySelector(seletor);
            if (campo) campo[prop] = valor;
        });
    }

    function coletarItemDaLinhaProposta(linha) {
        const detalhes = linha?.nextElementSibling?.classList?.contains('proposta-item-details-row')
            ? linha.nextElementSibling
            : null;
        const item = {
            categoria: normalizarCategoriaItemProposta(linha.querySelector('.prop-item-categoria')?.value),
            descricao: textoSeguro(linha.querySelector('.prop-item-descricao')?.value),
            medida: textoSeguro(linha.querySelector('.prop-item-medida')?.value),
            periodoDias: numeroNaoNegativo(linha.querySelector('.prop-item-periodo')?.value, 1) || 1,
            quantidade: numeroNaoNegativo(linha.querySelector('.prop-item-quantidade')?.value, 0),
            custoUnitario: numeroNaoNegativo(linha.querySelector('.prop-item-unitario')?.value, 0),
            observacoes: textoSeguro(detalhes?.querySelector('.prop-item-obs')?.value),
            aplicarHonorarios: detalhes?.querySelector('.prop-item-aplicar-honorarios')?.checked === true,
            percentualHonorarios: numeroNaoNegativo(detalhes?.querySelector('.prop-item-percentual-honorarios')?.value, 0),
            aplicarEncargos: detalhes?.querySelector('.prop-item-aplicar-encargos')?.checked === true,
            percentualEncargos: numeroNaoNegativo(detalhes?.querySelector('.prop-item-percentual-encargos')?.value, 0),
            tipoCalculoEncargos: normalizarTipoCalculoTributo(detalhes?.querySelector('.prop-item-tipo-encargos')?.value),
            aplicarINSS: detalhes?.querySelector('.prop-item-aplicar-inss')?.checked === true,
            percentualINSS: numeroNaoNegativo(detalhes?.querySelector('.prop-item-percentual-inss')?.value, 0),
            tipoCalculoINSS: normalizarTipoCalculoTributo(detalhes?.querySelector('.prop-item-tipo-inss')?.value)
        };
        return calcularItemProposta(item);
    }

    function atualizarLinhaItemProposta(linha) {
        const categoria = normalizarCategoriaItemProposta(linha.querySelector('.prop-item-categoria')?.value);
        if (linha.dataset.categoriaAtual !== categoria) {
            preencherLinhaComRegraCategoria(linha, categoria);
            linha.dataset.categoriaAtual = categoria;
        }

        const item = coletarItemDaLinhaProposta(linha);
        const detalhes = linha.nextElementSibling?.classList?.contains('proposta-item-details-row')
            ? linha.nextElementSibling
            : null;

        const campos = [
            [linha.querySelector('.prop-item-custo-total'), formatarMoeda(item.custoTotal)],
            [linha.querySelector('.prop-item-total'), formatarMoeda(item.valorTotal)],
            [detalhes?.querySelector('.prop-item-valor-honorarios'), formatarMoeda(item.valorHonorarios)],
            [detalhes?.querySelector('.prop-item-valor-encargos'), formatarMoeda(item.valorEncargos)],
            [detalhes?.querySelector('.prop-item-valor-inss'), formatarMoeda(item.valorINSS)]
        ];
        campos.forEach(([campo, valor]) => {
            if (campo) campo.value = valor;
        });

        return item;
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
        const linhas = Array.from(tbody.querySelectorAll('.proposta-item-row'));
        const ultimaDescricao = linhas[linhas.length - 1]?.querySelector('.prop-item-descricao');
        if (ultimaDescricao) ultimaDescricao.focus();
    }

    function removerLinhaItemProposta(botao) {
        const tbody = document.getElementById('propostaItensBody');
        const linha = botao?.closest('.proposta-item-row');
        if (!tbody || !linha) return;

        if (tbody.querySelectorAll('.proposta-item-row').length <= 1) {
            renderLinhasItensProposta([{}]);
            return;
        }

        const detalhes = linha.nextElementSibling?.classList?.contains('proposta-item-details-row')
            ? linha.nextElementSibling
            : null;
        detalhes?.remove();
        linha.remove();
        recalcularResumoProposta();
    }

    function duplicarLinhaItemProposta(botao) {
        const linha = botao?.closest('.proposta-item-row');
        if (!linha) return;
        const detalhes = linha.nextElementSibling?.classList?.contains('proposta-item-details-row')
            ? linha.nextElementSibling
            : linha;
        const item = coletarItemDaLinhaProposta(linha);
        detalhes.insertAdjacentHTML('afterend', criarLinhaItemProposta(item));
        recalcularResumoProposta();
        const novaLinha = detalhes.nextElementSibling;
        setTimeout(() => novaLinha?.querySelector('.prop-item-descricao')?.focus(), 60);
    }

    function alternarDetalhesCalculoItemProposta(botao) {
        const linha = botao?.closest('.proposta-item-row');
        const detalhes = linha?.nextElementSibling?.classList?.contains('proposta-item-details-row')
            ? linha.nextElementSibling
            : null;
        if (!detalhes) return;
        const aberto = detalhes.hidden;
        detalhes.hidden = !aberto;
        botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
        const icon = botao.querySelector('i');
        if (icon) {
            icon.classList.toggle('bi-chevron-down', !aberto);
            icon.classList.toggle('bi-chevron-up', aberto);
        }
    }

    function coletarItensFormulario() {
        const linhas = Array.from(document.querySelectorAll('#propostaItensBody .proposta-item-row'));
        return linhas.map((linha) => atualizarLinhaItemProposta(linha))
            .filter((item) => item.descricao && item.periodoDias > 0 && item.quantidade > 0);
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
        const itensCalculados = (Array.isArray(itens) ? itens : []).map((item) => calcularItemProposta(item || {}));
        const subtotalItens = itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.valorTotal, 0), 0);
        const subtotalCustoItens = itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.custoTotal, 0), 0);
        const subtotalHonorariosItens = itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.valorHonorarios, 0), 0);
        const subtotalEncargosItens = itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.valorEncargos, 0), 0);
        const subtotalINSSItens = itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.valorINSS, 0), 0);

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
            subtotalCustoItens,
            subtotalHonorariosItens,
            subtotalEncargosItens,
            subtotalINSSItens,
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

    function atualizarResumoCompactoProposta(resumo) {
        const statusAtual = document.getElementById('propStatus')?.value || 'rascunho';
        const mapa = [
            ['propStickySubtotal', formatarMoeda(resumo.subtotalItens)],
            ['propStickyCustos', formatarMoeda(resumo.totalCustosAdicionais)],
            ['propStickyDesconto', formatarMoeda(resumo.desconto)],
            ['propStickyFinal', formatarMoeda(resumo.valorFinalComercial)],
            ['propStickyLucro', formatarMoeda(resumo.lucroPrevisto)],
            ['propStickyMargem', formatarPercentual(resumo.margemPrevista)],
            ['propStickyStatus', statusRotulo(statusAtual)]
        ];

        mapa.forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = valor;
        });

        const statusEl = document.getElementById('propStickyStatus');
        if (statusEl) {
            statusEl.className = `badge ${statusBadge(statusAtual)}`;
        }
    }

    function recalcularResumoProposta() {
        const linhas = Array.from(document.querySelectorAll('#propostaItensBody .proposta-item-row'));
        const itensTodos = linhas.map((linha) => atualizarLinhaItemProposta(linha));
        const itens = itensTodos.filter((item) => item.descricao && item.periodoDias > 0 && item.quantidade > 0);
        renderizarResumoCategoriasProposta(itens);
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
        atualizarResumoCompactoProposta(resumo);
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

        const itens = itensOrig.map((item) => calcularItemProposta(item));

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
                mostrarSecaoFormularioProposta('dados');
                setTimeout(() => document.getElementById('propClienteNome')?.focus(), 120);
                return null;
            }
            if (!proposta.evento.nome) {
                mostrarToast('Informe o nome do evento.', 'erro');
                mostrarSecaoFormularioProposta('dados');
                setTimeout(() => document.getElementById('propEventoNome')?.focus(), 120);
                return null;
            }
            if (proposta.itens.length === 0) {
                mostrarToast('Adicione pelo menos 1 item na proposta.', 'erro');
                mostrarSecaoFormularioProposta('itens');
                setTimeout(() => document.querySelector('#propostaItensBody .prop-item-descricao')?.focus(), 120);
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
        mostrarSecaoFormularioProposta('dados', { semRolagem: true, foco: false });
    }

    function limparFormularioProposta() {
        categoriasOrcamentoTemporarias = null;
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
        if (percentualEntradaEl) percentualEntradaEl.value = String(obterPadroesOrcamento().globais.percentualEntradaPadrao || 50);
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
        mostrarSecaoFormularioProposta('dados', { semRolagem: true, foco: false });
        mostrarSubAbaPropostas('formulario', { semRolagem: true, foco: false });
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
        mostrarSubAbaPropostas('lista', { semRolagem: true });
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
        mostrarSubAbaPropostas('formulario', { semRolagem: true, foco: false });
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
        mostrarSubAbaPropostas('lista', { semRolagem: true });
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
            const valorUnitario = numeroNaoNegativo(item.custoUnitario ?? item.valorUnitario, 0);
            return {
                pecaId: peca?.id || '',
                nome: item.descricao,
                quantidade,
                valor: valorUnitario,
                periodoDias,
                valorTotalProposta: numeroNaoNegativo(item.valorTotal, arredondarMoeda(periodoDias * quantidade * valorUnitario))
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

    function montarLinhasItensPdfPorCategoria(itens = [], exibirInterno = false) {
        const grupos = agruparItensPropostaPorCategoria(itens);
        const totalColunas = exibirInterno ? 9 : 7;
        if (!grupos.length) {
            return `<tr><td colspan="${totalColunas}" style="padding:10px;">Sem itens</td></tr>`;
        }

        return grupos.map((grupo, indiceGrupo) => {
            const numeroGrupo = indiceGrupo + 1;
            const nomeCategoria = grupo.nome || rotuloCategoriaOrcamento(grupo.categoria);
            const linhas = grupo.itens.map((item, indiceItem) => {
                if (exibirInterno) {
                    return `
                        <tr style="border-bottom:1px solid #e5e7eb;">
                            <td style="padding:8px; font-size:10.5px;">${numeroGrupo}.${indiceItem + 1} ${sanitizar(item.descricao)}</td>
                            <td style="padding:8px; text-align:center; font-size:10.5px;">${sanitizar(item.medida || '-')}</td>
                            <td style="padding:8px; text-align:center; font-size:10.5px;">${numeroNaoNegativo(item.periodoDias, 1)}</td>
                            <td style="padding:8px; text-align:center; font-size:10.5px;">${item.quantidade}</td>
                            <td style="padding:8px; text-align:right; font-size:10.5px;">${formatarMoeda(item.custoTotal)}</td>
                            <td style="padding:8px; text-align:right; font-size:10.5px;">${formatarMoeda(item.valorHonorarios)}</td>
                            <td style="padding:8px; text-align:right; font-size:10.5px;">${formatarMoeda(item.valorEncargos)}</td>
                            <td style="padding:8px; text-align:right; font-size:10.5px;">${formatarMoeda(item.valorINSS)}</td>
                            <td style="padding:8px; text-align:right; font-size:10.5px; font-weight:800;">${formatarMoeda(item.valorTotal)}</td>
                        </tr>
                    `;
                }

                const baseComercial = numeroNaoNegativo(item.periodoDias, 1) * numeroNaoNegativo(item.quantidade, 0);
                const valorUnitarioComercial = baseComercial > 0
                    ? item.valorTotal / baseComercial
                    : item.valorTotal;

                return `
                    <tr style="border-bottom:1px solid #e5e7eb;">
                        <td style="padding:8px; font-size:11px;">${numeroGrupo}.${indiceItem + 1} ${sanitizar(item.descricao)}</td>
                        <td style="padding:8px; text-align:center; font-size:11px;">${sanitizar(item.medida || '-')}</td>
                        <td style="padding:8px; text-align:center; font-size:11px;">${numeroNaoNegativo(item.periodoDias, 1)}</td>
                        <td style="padding:8px; text-align:center; font-size:11px;">${item.quantidade}</td>
                        <td style="padding:8px; text-align:right; font-size:11px;">${formatarMoeda(valorUnitarioComercial)}</td>
                        <td style="padding:8px; text-align:right; font-size:11px;">${formatarMoeda(item.valorTotal)}</td>
                        <td style="padding:8px; font-size:11px;">${sanitizar(item.observacoes || '-')}</td>
                    </tr>
                `;
            }).join('');

            const subtotalGrupo = exibirInterno
                ? `
                    <tr>
                        <td colspan="4" style="padding:8px; text-align:right; font-size:10.5px; font-weight:800; border-bottom:1px solid #cbd5e1;">Subtotal ${sanitizar(nomeCategoria)}</td>
                        <td style="padding:8px; text-align:right; font-size:10.5px; font-weight:800; border-bottom:1px solid #cbd5e1;">${formatarMoeda(grupo.custoTotal)}</td>
                        <td style="padding:8px; text-align:right; font-size:10.5px; font-weight:800; border-bottom:1px solid #cbd5e1;">${formatarMoeda(grupo.honorarios)}</td>
                        <td style="padding:8px; text-align:right; font-size:10.5px; font-weight:800; border-bottom:1px solid #cbd5e1;">${formatarMoeda(grupo.encargos)}</td>
                        <td style="padding:8px; text-align:right; font-size:10.5px; font-weight:800; border-bottom:1px solid #cbd5e1;">${formatarMoeda(grupo.inss)}</td>
                        <td style="padding:8px; text-align:right; font-size:10.5px; font-weight:800; border-bottom:1px solid #cbd5e1;">${formatarMoeda(grupo.totalFinal)}</td>
                    </tr>
                `
                : `
                    <tr>
                        <td colspan="5" style="padding:8px; text-align:right; font-size:11px; font-weight:800; border-bottom:1px solid #cbd5e1;">Subtotal ${sanitizar(nomeCategoria)}</td>
                        <td style="padding:8px; text-align:right; font-size:11px; font-weight:800; border-bottom:1px solid #cbd5e1;">${formatarMoeda(grupo.totalFinal)}</td>
                        <td style="padding:8px; border-bottom:1px solid #cbd5e1;"></td>
                    </tr>
                `;

            return `
                <tr>
                    <td colspan="${totalColunas}" style="padding:9px 8px; background:#eaf2ff; border-top:1px solid #bfdbfe; border-bottom:1px solid #bfdbfe; color:#0f172a; font-weight:800; font-size:11px;">
                        ${numeroGrupo}. ${sanitizar(nomeCategoria)}
                    </td>
                </tr>
                ${linhas}
                ${subtotalGrupo}
            `;
        }).join('');
    }

    function montarHtmlPdfProposta(proposta) {
        const p = normalizarProposta(proposta);
        const exibirInterno = p.financeiro.exibirInformacoesInternasPDF === true;
        const tipoNF = normalizarTipoCalculoNF(p.financeiro.tipoCalculoNF, 'descontar');
        const valorFinalComercial = obterValorFinalComercial(p);
        const linhasItens = montarLinhasItensPdfPorCategoria(p.itens, exibirInterno);
        const cabecalhoItens = exibirInterno
            ? `
                <tr>
                    <th style="padding:8px; text-align:left; font-size:10px; color:#fff;">ITEM</th>
                    <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">MEDIDA</th>
                    <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">DIAS</th>
                    <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">QTD</th>
                    <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">CUSTO</th>
                    <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">HON.</th>
                    <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">ENC.</th>
                    <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">INSS</th>
                    <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">TOTAL</th>
                </tr>
            `
            : `
                <tr>
                    <th style="padding:8px; text-align:left; font-size:10px; color:#fff;">ITEM</th>
                    <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">MEDIDA</th>
                    <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">DIAS</th>
                    <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">QTD</th>
                    <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">UNIT.</th>
                    <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">TOTAL</th>
                    <th style="padding:8px; text-align:left; font-size:10px; color:#fff;">OBS.</th>
                </tr>
            `;

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
                            ${cabecalhoItens}
                        </thead>
                        <tbody>${linhasItens}</tbody>
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

    function abrirPreviewPDFProposta(proposta, exibirInterno = false) {
        const printArea = document.getElementById('printArea');
        const modal = document.getElementById('modalRelatorio');
        if (!printArea || !modal) {
            mostrarToast('Area de impressao nao encontrada.', 'erro');
            return;
        }

        const propostaPdf = normalizarProposta({
            ...proposta,
            financeiro: {
                ...(proposta?.financeiro || {}),
                exibirInformacoesInternasPDF: exibirInterno === true
            }
        });

        printArea.innerHTML = montarHtmlPdfProposta(propostaPdf);
        modal.classList.add('active');
        mostrarToast(exibirInterno
            ? 'PDF interno pronto. Clique em "Salvar PDF".'
            : 'PDF do cliente pronto. Clique em "Salvar PDF".');
    }

    function gerarPDFPropostaAtualComTipo(exibirInterno = false) {
        const propostaTemp = coletarDadosFormulario(false);
        if (!propostaTemp || propostaTemp.itens.length === 0) {
            mostrarToast('Preencha os itens da proposta antes de gerar PDF.', 'info');
            return;
        }
        abrirPreviewPDFProposta(propostaTemp, exibirInterno);
    }

    function gerarPDFPropostaAtualCliente() {
        gerarPDFPropostaAtualComTipo(false);
    }

    function gerarPDFPropostaAtualInterno() {
        gerarPDFPropostaAtualComTipo(true);
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
        atualizarMetaTopoPropostas(base.length, filtradas.length, termoRaw);

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
        mostrarSubAbaPropostas('formulario', { semRolagem: true, foco: false });
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

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') fecharConfigOrcamentoProposta();
        });
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
        preencherResponsavelPropostaSeVazio();
        renderConfigOrcamentoProposta();
        mostrarSecaoFormularioProposta(secaoFormularioPropostaAtual, { semRolagem: true, foco: false });
        mostrarSubAbaPropostas(subAbaPropostasAtual, { semRolagem: true, foco: false });
        renderPropostas();
    }

    inicializarPropostas();

    window.calcularResumoProposta = calcularResumoProposta;
    window.normalizarPadroesOrcamento = normalizarPadroesOrcamento;
    window.CATEGORIAS_ITEM_PROPOSTA = CATEGORIAS_ITEM_PROPOSTA;
    window.renderPropostas = renderPropostas;
    window.recalcularResumoProposta = recalcularResumoProposta;
    window.adicionarLinhaItemProposta = adicionarLinhaItemProposta;
    window.removerLinhaItemProposta = removerLinhaItemProposta;
    window.duplicarLinhaItemProposta = duplicarLinhaItemProposta;
    window.alternarDetalhesCalculoItemProposta = alternarDetalhesCalculoItemProposta;
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
    window.gerarPDFPropostaAtualCliente = gerarPDFPropostaAtualCliente;
    window.gerarPDFPropostaAtualInterno = gerarPDFPropostaAtualInterno;
    window.converterPropostaEmLocacaoFechada = converterPropostaEmLocacaoFechada;
    window.converterPropostaAtual = converterPropostaAtual;
    window.aplicarFiltroPropostas = aplicarFiltroPropostas;
    window.irParaPropostasFormulario = irParaPropostasFormulario;
    window.aplicarValorKmFretePadraoProposta = aplicarValorKmFretePadraoProposta;
    window.mostrarSubAbaPropostas = mostrarSubAbaPropostas;
    window.mostrarSecaoFormularioProposta = mostrarSecaoFormularioProposta;
    window.abrirConfigOrcamentoProposta = abrirConfigOrcamentoProposta;
    window.fecharConfigOrcamentoProposta = fecharConfigOrcamentoProposta;
    window.aplicarConfigOrcamentoProposta = aplicarConfigOrcamentoProposta;
    window.restaurarPadroesConfigOrcamentoProposta = restaurarPadroesConfigOrcamentoProposta;
    window.adicionarCategoriaConfigOrcamento = adicionarCategoriaConfigOrcamento;
    window.moverCategoriaConfigOrcamento = moverCategoriaConfigOrcamento;
    window.renderConfigOrcamentoProposta = renderConfigOrcamentoProposta;
    window.obterCategoriasOrcamento = obterCategoriasOrcamento;
    window.normalizarCategoriasOrcamentoConfig = normalizarCategoriasOrcamentoConfig;
})();
