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
    const CATEGORIAS_SEM_RESERVA_ESTOQUE_PROPOSTA = new Set([
        'alimentacao',
        'comunicacao-impressao',
        CATEGORIA_MAO_OBRA_PROPOSTA,
        'logistica',
        CATEGORIA_ITEM_PROPOSTA_PADRAO
    ]);
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
    let mostrarCategoriasVaziasProposta = false;
    let ultimoAvisoPercentualInvalido = 0;
    const MENSAGEM_PERCENTUAL_REAL_PROPOSTA = 'Digite o percentual real, exemplo: 18,5. O sistema calcula por dentro automaticamente.';

    function textoSeguro(valor, fallback = '') {
        if (valor == null) return fallback;
        return String(valor).trim();
    }

    function converterTextoMoedaParaNumero(valor, fallback = 0) {
        if (typeof valor === 'number') {
            return Number.isFinite(valor) ? valor : (Number(fallback) || 0);
        }
        if (valor == null) return Number(fallback) || 0;

        let texto = String(valor)
            .trim()
            .replace(/\s+/g, '')
            .replace(/[^\d,.\-]/g, '');

        if (!texto || texto === '-' || texto === ',' || texto === '.') return Number(fallback) || 0;

        const negativo = texto.startsWith('-');
        texto = texto.replace(/-/g, '');

        const temVirgula = texto.includes(',');
        const temPonto = texto.includes('.');

        if (temVirgula && temPonto) {
            const ultimaVirgula = texto.lastIndexOf(',');
            const ultimoPonto = texto.lastIndexOf('.');
            if (ultimaVirgula > ultimoPonto) {
                texto = texto.replace(/\./g, '').replace(',', '.');
            } else {
                texto = texto.replace(/,/g, '');
            }
        } else if (temVirgula) {
            texto = texto.replace(/\./g, '').replace(',', '.');
        } else if (temPonto) {
            const partes = texto.split('.');
            const ultimaParte = partes[partes.length - 1] || '';
            const primeiraParte = partes[0] || '';
            const pareceMilhar = partes.length > 1 && ultimaParte.length === 3 && primeiraParte.length <= 3;
            if (partes.length > 2 || pareceMilhar) {
                texto = partes.join('');
            }
        }

        const numero = Number(`${negativo ? '-' : ''}${texto}`);
        if (!Number.isFinite(numero)) return Number(fallback) || 0;
        return numero;
    }

    function numeroSeguro(valor, fallback = 0) {
        return converterTextoMoedaParaNumero(valor, fallback);
    }

    function numeroNaoNegativo(valor, fallback = 0) {
        return Math.max(0, numeroSeguro(valor, fallback));
    }

    function textoPercentualBruto(valor) {
        if (valor == null) return '';
        return String(valor).trim().replace(/\s+/g, '');
    }

    function converterTextoPercentualBrutoParaNumero(valor, fallback = 0) {
        if (typeof valor === 'number') {
            return Number.isFinite(valor) ? valor : (Number(fallback) || 0);
        }

        let texto = textoPercentualBruto(valor).replace(/[^\d,.\-]/g, '');
        if (!texto || texto === '-' || texto === ',' || texto === '.') return Number(fallback) || 0;

        const negativo = texto.startsWith('-');
        texto = texto.replace(/-/g, '');
        if (texto.includes(',') && texto.includes('.')) {
            texto = texto.lastIndexOf(',') > texto.lastIndexOf('.')
                ? texto.replace(/\./g, '').replace(',', '.')
                : texto.replace(/,/g, '');
        } else {
            texto = texto.replace(',', '.');
        }

        const numero = Number(`${negativo ? '-' : ''}${texto}`);
        return Number.isFinite(numero) ? numero : (Number(fallback) || 0);
    }

    function percentualPareceDivisorInvalido(valor) {
        const bruto = textoPercentualBruto(valor);
        if (!bruto) return false;
        const numero = converterTextoPercentualBrutoParaNumero(bruto, 0);
        const temDecimal = /[,.]/.test(bruto);
        return Number.isFinite(numero) && numero > 0 && numero < 1 && temDecimal;
    }

    function avisarPercentualRealProposta() {
        const agora = Date.now();
        if (agora - ultimoAvisoPercentualInvalido < 5000) return;
        ultimoAvisoPercentualInvalido = agora;
        if (typeof mostrarToast === 'function') {
            mostrarToast(MENSAGEM_PERCENTUAL_REAL_PROPOSTA, 'erro');
        }
    }

    function converterTextoPercentualParaNumero(valor, fallback = 0, opcoes = {}) {
        const maximo = Number.isFinite(opcoes.maximo) ? opcoes.maximo : 99.99;
        const avisar = opcoes.avisar !== false;
        if (percentualPareceDivisorInvalido(valor)) {
            if (avisar) avisarPercentualRealProposta();
            return Math.min(maximo, numeroNaoNegativo(fallback, 0));
        }
        return Math.min(maximo, Math.max(0, converterTextoPercentualBrutoParaNumero(valor, fallback)));
    }

    function lerPercentualCampo(campo, fallback = 0, maximo = 99.99) {
        const invalido = percentualPareceDivisorInvalido(campo?.value);
        campo?.classList?.toggle('input-percent-invalid', invalido);
        return converterTextoPercentualParaNumero(campo?.value, fallback, {
            maximo,
            avisar: true
        });
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
        return converterTextoMoedaParaNumero(valor, 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }

    function formatarPercentual(valor) {
        const numero = converterTextoPercentualParaNumero(valor, 0, { maximo: 100, avisar: false });
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

    function normalizarNumeroRevisaoProposta(valor, fallback = 1) {
        const numero = Math.trunc(numeroNaoNegativo(valor, fallback));
        return Math.max(1, numero || Math.trunc(numeroNaoNegativo(fallback, 1)) || 1);
    }

    function extrairRevisaoDoCodigo(codigo) {
        const match = textoSeguro(codigo).match(/\brev\.?\s*(\d+)$/i);
        return match ? normalizarNumeroRevisaoProposta(match[1], 1) : 1;
    }

    function obterCodigoBaseProposta(propostaOuCodigo) {
        const codigo = typeof propostaOuCodigo === 'object'
            ? textoSeguro(propostaOuCodigo?.codigoBase || propostaOuCodigo?.codigo)
            : textoSeguro(propostaOuCodigo);
        return codigo.replace(/\s+rev\.?\s*\d+$/i, '').trim();
    }

    function formatarCodigoRevisaoProposta(proposta) {
        const codigoBase = obterCodigoBaseProposta(proposta) || textoSeguro(proposta?.codigo, '');
        const revisao = normalizarNumeroRevisaoProposta(proposta?.revisao ?? proposta?.numeroRevisao ?? extrairRevisaoDoCodigo(proposta?.codigo), 1);
        return `${codigoBase || 'PROP'} Rev. ${revisao}`;
    }

    function obterProximaRevisaoProposta(codigoBase) {
        const base = obterCodigoBaseProposta(codigoBase);
        const maior = obterPropostasBase().reduce((acc, proposta) => {
            if (obterCodigoBaseProposta(proposta) !== base) return acc;
            return Math.max(acc, normalizarNumeroRevisaoProposta(proposta.revisao, 1));
        }, 0);
        return Math.max(2, maior + 1);
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
            percentualHonorarios: converterTextoPercentualParaNumero(regra.percentualHonorarios, globais.percentualHonorariosPadrao || 0),
            aplicarEncargos: normalizarBooleanoProposta(regra.aplicarEncargos, true),
            percentualEncargos: converterTextoPercentualParaNumero(regra.percentualEncargos, globais.percentualEncargosPadrao || 0),
            tipoCalculoEncargos: normalizarTipoCalculoTributo(regra.tipoCalculoEncargos, globais.tipoCalculoEncargosPadrao || 'simples'),
            aplicarINSS: normalizarBooleanoProposta(regra.aplicarINSS, ehMaoObra),
            percentualINSS: converterTextoPercentualParaNumero(regra.percentualINSS, globais.percentualINSSPadrao || 0),
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
            percentualHonorarios: converterTextoPercentualParaNumero(origem.percentualHonorarios ?? categoriaInfo?.percentualHonorarios, globais.percentualHonorariosPadrao || 0),
            aplicarEncargos: normalizarBooleanoProposta(origem.aplicarEncargos ?? categoriaInfo?.aplicarEncargos, true),
            percentualEncargos: converterTextoPercentualParaNumero(origem.percentualEncargos ?? categoriaInfo?.percentualEncargos, globais.percentualEncargosPadrao || 0),
            tipoCalculoEncargos: normalizarTipoCalculoTributo(origem.tipoCalculoEncargos ?? categoriaInfo?.tipoCalculoEncargos, globais.tipoCalculoEncargosPadrao || 'simples'),
            aplicarINSS: normalizarBooleanoProposta(origem.aplicarINSS ?? categoriaInfo?.aplicarINSS, ehMaoObra),
            percentualINSS: converterTextoPercentualParaNumero(origem.percentualINSS ?? categoriaInfo?.percentualINSS, globais.percentualINSSPadrao || 0),
            tipoCalculoINSS: normalizarTipoCalculoTributo(origem.tipoCalculoINSS ?? categoriaInfo?.tipoCalculoINSS, globais.tipoCalculoINSSPadrao || 'simples')
        };
    }

    function normalizarPadroesOrcamento(valor = {}) {
        const padrao = criarPadroesOrcamentoDefault();
        const origem = valor && typeof valor === 'object' ? valor : {};
        const origemGlobais = origem.globais && typeof origem.globais === 'object' ? origem.globais : origem;

        const globais = {
            percentualHonorariosPadrao: converterTextoPercentualParaNumero(origemGlobais.percentualHonorariosPadrao ?? origemGlobais.honorariosPadrao, padrao.globais.percentualHonorariosPadrao),
            percentualEncargosPadrao: converterTextoPercentualParaNumero(origemGlobais.percentualEncargosPadrao ?? origemGlobais.encargosPadrao, padrao.globais.percentualEncargosPadrao),
            percentualINSSPadrao: converterTextoPercentualParaNumero(origemGlobais.percentualINSSPadrao ?? origemGlobais.inssPadrao, padrao.globais.percentualINSSPadrao),
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
        const percentualNormalizado = converterTextoPercentualParaNumero(percentual, 0, { maximo: 99.99 });
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
            ? converterTextoPercentualParaNumero(item.percentualHonorarios, regra.percentualHonorarios)
            : regra.percentualHonorarios;
        const valorHonorarios = aplicarHonorarios
            ? calcularValorPercentualTributo(custoTotal, percentualHonorarios, 'simples')
            : 0;

        const aplicarEncargos = temCalculoSalvo
            ? normalizarBooleanoProposta(item.aplicarEncargos, regra.aplicarEncargos)
            : regra.aplicarEncargos;
        const percentualEncargos = temCalculoSalvo
            ? converterTextoPercentualParaNumero(item.percentualEncargos, regra.percentualEncargos)
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
            ? converterTextoPercentualParaNumero(item.percentualINSS, regra.percentualINSS)
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
        const gruposVisiveis = mostrarCategoriasVaziasProposta
            ? grupos
            : grupos.filter((grupo) => grupo.quantidade > 0 || grupo.subtotal > 0);

        container.innerHTML = `
            <div class="proposta-category-summary-head">
                <div>
                    <strong>Resumo por categoria</strong>
                    <small>${gruposVisiveis.length} de ${grupos.length} categorias visiveis</small>
                </div>
                <div class="proposta-category-summary-actions">
                    <span>${formatarMoeda(total)}</span>
                    <button type="button" class="btn btn-sm btn-secondary proposta-summary-toggle-btn" data-action="alternarCategoriasVaziasResumoProposta">
                        ${mostrarCategoriasVaziasProposta ? 'Ocultar vazias' : 'Mostrar vazias'}
                    </button>
                </div>
            </div>
            ${gruposVisiveis.length ? `
                <div class="proposta-category-summary-grid">
                    ${gruposVisiveis.map((grupo) => `
                        <div class="proposta-category-chip${grupo.quantidade > 0 || grupo.subtotal > 0 ? ' has-value' : ''}" style="--category-color: ${sanitizar(grupo.cor || '#64748b')}">
                            <span><i class="bi ${sanitizar(grupo.icone || 'bi-tag')}"></i> ${sanitizar(grupo.nome || rotuloCategoriaOrcamento(grupo.categoria))}${grupo.ativa === false ? ' <em>inativa</em>' : ''}</span>
                            <strong>${formatarMoeda(grupo.subtotal)}</strong>
                            <small>${grupo.quantidade} ${grupo.quantidade === 1 ? 'item' : 'itens'}</small>
                            <small>Custo ${formatarMoeda(grupo.custoTotal)}</small>
                            <small>Hon. ${formatarMoeda(grupo.honorarios)} • Enc. ${formatarMoeda(grupo.encargos)} • INSS ${formatarMoeda(grupo.inss)}</small>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="proposta-category-summary-empty">
                    Adicione itens para montar o resumo por categoria.
                </div>
            `}
        `;
    }

    function valorNumeroConfigOrcamento(id, fallback = 0, max = Infinity) {
        const valor = converterTextoPercentualParaNumero(document.getElementById(id)?.value, fallback, {
            maximo: max,
            avisar: true
        });
        return Math.min(max, valor);
    }

    function preencherValorConfigOrcamento(id, valor) {
        const el = document.getElementById(id);
        if (el) el.value = Number(valor || 0);
    }

    function formatarRegraResumoCategoriaConfig(aplicar, percentual) {
        if (!aplicar) return '<span class="proposta-config-rule-badge is-muted">Não aplicado</span>';
        return `<span class="proposta-config-rule-badge">${formatarPercentual(percentual)}</span>`;
    }

    function rotuloTipoCalculoConfig(tipo) {
        return normalizarTipoCalculoTributo(tipo) === 'por_dentro' ? 'Por dentro' : 'Simples';
    }

    function obterListaCategoriasConfigOrcamento() {
        return document.querySelector('#propOrcConfigCategorias .proposta-config-category-list')
            || document.getElementById('propOrcConfigCategorias');
    }

    function obterLinhasCategoriasConfigOrcamento() {
        return Array.from(document.querySelectorAll('#propOrcConfigCategorias .proposta-config-matrix-row'));
    }

    function lerCategoriaConfigDaLinha(linha, indice = 0, globais = criarGlobaisPadraoOrcamento()) {
        if (!linha) return null;
        const idOriginal = linha.getAttribute('data-prop-orc-categoria') || '';
        const nome = textoSeguro(linha.querySelector('.prop-orc-cat-nome')?.value, CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME);
        const id = idOriginal || normalizarIdCategoriaOrcamento(nome, `categoria-${indice + 1}`);
        const fixa = id === CATEGORIA_ITEM_PROPOSTA_PADRAO || linha.dataset.fixed === '1';
        return normalizarCategoriaConfigOrcamento({
            id,
            nome,
            ativa: fixa ? true : linha.querySelector('.prop-orc-cat-ativa')?.checked === true,
            ordem: inteiroNaoNegativo(linha.querySelector('.prop-orc-cat-ordem')?.value, indice + 1),
            cor: textoSeguro(linha.querySelector('.prop-orc-cat-cor')?.value, criarCorCategoriaOrcamento(indice)),
            icone: textoSeguro(linha.querySelector('.prop-orc-cat-icone')?.value, 'bi-tag'),
            aplicarHonorarios: linha.querySelector('.prop-orc-cat-honorarios-check')?.checked === true,
            percentualHonorarios: converterTextoPercentualParaNumero(linha.querySelector('.prop-orc-cat-honorarios-percent')?.value, globais.percentualHonorariosPadrao),
            aplicarEncargos: linha.querySelector('.prop-orc-cat-encargos-check')?.checked === true,
            percentualEncargos: converterTextoPercentualParaNumero(linha.querySelector('.prop-orc-cat-encargos-percent')?.value, globais.percentualEncargosPadrao),
            tipoCalculoEncargos: normalizarTipoCalculoTributo(linha.querySelector('.prop-orc-cat-encargos-tipo')?.value, globais.tipoCalculoEncargosPadrao),
            aplicarINSS: linha.querySelector('.prop-orc-cat-inss-check')?.checked === true,
            percentualINSS: converterTextoPercentualParaNumero(linha.querySelector('.prop-orc-cat-inss-percent')?.value, globais.percentualINSSPadrao),
            tipoCalculoINSS: normalizarTipoCalculoTributo(linha.querySelector('.prop-orc-cat-inss-tipo')?.value, globais.tipoCalculoINSSPadrao),
            fixa
        }, indice, globais);
    }

    function montarLinhaConfigCategoriaOrcamento(categoria, globais = criarGlobaisPadraoOrcamento()) {
        const normalizada = normalizarCategoriaConfigOrcamento(categoria, numeroNaoNegativo(categoria?.ordem, 1), globais);
        const tipoEncargos = normalizarTipoCalculoTributo(normalizada.tipoCalculoEncargos);
        const tipoINSS = normalizarTipoCalculoTributo(normalizada.tipoCalculoINSS);
        const fixa = normalizada.id === CATEGORIA_ITEM_PROPOSTA_PADRAO || normalizada.fixa;
        const ativa = fixa || normalizada.ativa !== false;
        const idSeguro = sanitizar(normalizada.id);
        const nomeSeguro = sanitizar(normalizada.nome);
        const cor = sanitizar(normalizada.cor || criarCorCategoriaOrcamento(normalizada.ordem));
        const icone = sanitizar(normalizada.icone || 'bi-tag');
        const statusClasse = ativa ? 'badge-success' : 'badge-secondary';
        const statusTexto = ativa ? 'Ativa' : 'Inativa';
        return `
            <div class="proposta-config-matrix-row${ativa ? '' : ' is-inactive'}" data-prop-orc-categoria="${idSeguro}" data-fixed="${fixa ? '1' : '0'}" style="--category-color: ${cor}">
                <input type="hidden" class="prop-orc-cat-ordem" value="${Number(normalizada.ordem || 1)}">
                <input type="hidden" class="prop-orc-cat-cor" value="${cor}">
                <input type="hidden" class="prop-orc-cat-icone" value="${icone}">
                <input type="hidden" class="prop-orc-cat-nome" value="${nomeSeguro}">
                <input type="checkbox" class="prop-orc-cat-ativa proposta-config-hidden-field" ${ativa ? 'checked' : ''} hidden>
                <input type="checkbox" class="prop-orc-cat-honorarios-check proposta-config-hidden-field" ${normalizada.aplicarHonorarios !== false ? 'checked' : ''} hidden>
                <input type="hidden" class="prop-orc-cat-honorarios-percent" value="${Number(normalizada.percentualHonorarios || globais.percentualHonorariosPadrao || 0)}">
                <input type="checkbox" class="prop-orc-cat-encargos-check proposta-config-hidden-field" ${normalizada.aplicarEncargos !== false ? 'checked' : ''} hidden>
                <input type="hidden" class="prop-orc-cat-encargos-percent" value="${Number(normalizada.percentualEncargos || globais.percentualEncargosPadrao || 0)}">
                <select class="prop-orc-cat-encargos-tipo proposta-config-hidden-field" hidden>
                    <option value="simples"${tipoEncargos === 'simples' ? ' selected' : ''}>Simples</option>
                    <option value="por_dentro"${tipoEncargos === 'por_dentro' ? ' selected' : ''}>Por dentro</option>
                </select>
                <input type="checkbox" class="prop-orc-cat-inss-check proposta-config-hidden-field" ${normalizada.aplicarINSS === true ? 'checked' : ''} hidden>
                <input type="hidden" class="prop-orc-cat-inss-percent" value="${Number(normalizada.percentualINSS || globais.percentualINSSPadrao || 0)}">
                <select class="prop-orc-cat-inss-tipo proposta-config-hidden-field" hidden>
                    <option value="simples"${tipoINSS === 'simples' ? ' selected' : ''}>Simples</option>
                    <option value="por_dentro"${tipoINSS === 'por_dentro' ? ' selected' : ''}>Por dentro</option>
                </select>

                <div class="proposta-config-order-badge" data-label="Ordem">${Number(normalizada.ordem || 1)}</div>
                <div class="proposta-config-matrix-category" data-label="Categoria">
                    <span class="proposta-config-color-dot" aria-hidden="true"></span>
                    <span class="proposta-config-category-icon"><i class="bi ${icone}"></i></span>
                    <span class="proposta-config-category-title">
                        <strong>${nomeSeguro}</strong>
                        <small>${fixa ? 'Categoria de segurança' : (ativa ? 'Disponível nos itens' : 'Oculta para novos itens')}</small>
                    </span>
                </div>
                <div class="proposta-config-status-cell" data-label="Status">
                    <span class="badge ${statusClasse}">${statusTexto}</span>
                </div>
                <div class="proposta-config-rule-summary" data-label="Honorários">
                    ${formatarRegraResumoCategoriaConfig(normalizada.aplicarHonorarios !== false, normalizada.percentualHonorarios || globais.percentualHonorariosPadrao || 0)}
                </div>
                <div class="proposta-config-rule-summary" data-label="Encargos">
                    ${formatarRegraResumoCategoriaConfig(normalizada.aplicarEncargos !== false, normalizada.percentualEncargos || globais.percentualEncargosPadrao || 0)}
                    ${normalizada.aplicarEncargos !== false ? `<small>${rotuloTipoCalculoConfig(tipoEncargos)}</small>` : ''}
                </div>
                <div class="proposta-config-rule-summary" data-label="INSS">
                    ${formatarRegraResumoCategoriaConfig(normalizada.aplicarINSS === true, normalizada.percentualINSS || globais.percentualINSSPadrao || 0)}
                    ${normalizada.aplicarINSS === true ? `<small>${rotuloTipoCalculoConfig(tipoINSS)}</small>` : ''}
                </div>
                <div class="proposta-config-row-actions" data-label="Ações">
                    <button type="button" class="btn btn-sm btn-secondary table-action-btn" data-action="abrirEditorCategoriaConfigOrcamento" data-arg="${idSeguro}" title="Editar categoria">
                        <i class="bi bi-pencil"></i><span>Editar</span>
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary table-action-btn" data-action="moverCategoriaConfigOrcamento" data-arg="${idSeguro}:up" title="Subir categoria">
                        <i class="bi bi-arrow-up"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary table-action-btn" data-action="moverCategoriaConfigOrcamento" data-arg="${idSeguro}:down" title="Descer categoria">
                        <i class="bi bi-arrow-down"></i>
                    </button>
                    <button type="button" class="btn btn-sm ${ativa ? 'btn-warning' : 'btn-success'} table-action-btn" data-action="alternarCategoriaConfigOrcamento" data-arg="${idSeguro}" title="${ativa ? 'Desativar categoria' : 'Reativar categoria'}" ${fixa ? 'disabled' : ''}>
                        <i class="bi ${ativa ? 'bi-eye-slash' : 'bi-eye'}"></i><span>${ativa ? 'Desativar' : 'Ativar'}</span>
                    </button>
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
                    <small>Organize a lista usada nos itens do orçamento.</small>
                </div>
                <button type="button" class="btn btn-sm btn-primary" data-action="adicionarCategoriaConfigOrcamento">
                    <i class="bi bi-plus-lg"></i> Nova categoria
                </button>
            </div>
            <div id="propOrcCategoriaEditor" class="proposta-config-category-editor-host" hidden></div>
            <div class="proposta-config-rules-note">
                <strong>Regras de cálculo por categoria</strong>
                <span>Resumo rápido. Use Editar para alterar percentuais, tipos de cálculo e status.</span>
            </div>
            <div class="proposta-config-matrix-head" aria-hidden="true">
                <span>Ordem</span>
                <span>Categoria</span>
                <span>Status</span>
                <span>Honorários</span>
                <span>Encargos</span>
                <span>INSS</span>
                <span>Ações</span>
            </div>
            <div class="proposta-config-category-list">
                ${categorias.map((categoria) => montarLinhaConfigCategoriaOrcamento(categoria, globais)).join('')}
            </div>
        `;
    }

    function montarEditorCategoriaConfigOrcamento(categoria, opcoes = {}) {
        const globais = opcoes.globais || obterPadroesOrcamento().globais || criarGlobaisPadraoOrcamento();
        const normalizada = normalizarCategoriaConfigOrcamento(categoria, numeroNaoNegativo(categoria?.ordem, 1), globais);
        const fixa = normalizada.id === CATEGORIA_ITEM_PROPOSTA_PADRAO || normalizada.fixa;
        const ativa = fixa || normalizada.ativa !== false;
        const nova = opcoes.nova === true;
        const tipoEncargos = normalizarTipoCalculoTributo(normalizada.tipoCalculoEncargos, globais.tipoCalculoEncargosPadrao);
        const tipoINSS = normalizarTipoCalculoTributo(normalizada.tipoCalculoINSS, globais.tipoCalculoINSSPadrao);
        const aplicarHonorarios = normalizada.aplicarHonorarios !== false;
        const aplicarEncargos = normalizada.aplicarEncargos !== false;
        const aplicarINSS = normalizada.aplicarINSS === true;

        return `
            <div class="proposta-config-category-editor-panel" data-editor-categoria-id="${sanitizar(normalizada.id)}" data-editor-nova="${nova ? '1' : '0'}">
                <div class="proposta-config-category-editor-head">
                    <div>
                        <strong>${nova ? 'Nova categoria' : 'Editar categoria'}</strong>
                        <small>${nova ? 'Crie uma categoria com as regras padrão do orçamento.' : 'Ajuste nome, status e regras desta categoria.'}</small>
                    </div>
                    <button type="button" class="btn btn-sm btn-secondary table-action-btn" data-action="fecharEditorCategoriaConfigOrcamento" title="Fechar editor">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
                <div class="proposta-config-category-editor-grid">
                    <div class="form-group">
                        <label>Nome da categoria</label>
                        <input type="text" class="prop-orc-editor-nome" value="${sanitizar(normalizada.nome)}" ${fixa ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label>Cor</label>
                        <input type="color" class="prop-orc-editor-cor" value="${sanitizar(normalizada.cor || criarCorCategoriaOrcamento(normalizada.ordem))}">
                    </div>
                    <div class="form-group">
                        <label>Ícone</label>
                        <input type="text" class="prop-orc-editor-icone" value="${sanitizar(normalizada.icone || 'bi-tag')}" placeholder="bi-tag">
                    </div>
                    <label class="proposta-config-editor-switch">
                        <input type="checkbox" class="prop-orc-editor-ativa" ${ativa ? 'checked' : ''} ${fixa ? 'disabled' : ''}>
                        <span>${fixa ? 'Categoria de segurança sempre ativa' : 'Categoria ativa'}</span>
                    </label>
                </div>
                <div class="proposta-config-editor-rules">
                    <div class="proposta-config-editor-rule${aplicarHonorarios ? '' : ' is-disabled'}" data-editor-rule="honorarios">
                        <label class="proposta-config-tax-toggle">
                            <input type="checkbox" class="prop-orc-editor-honorarios-check" data-change="atualizarCamposEditorCategoriaConfig" ${aplicarHonorarios ? 'checked' : ''}>
                            Honorários
                        </label>
                        <div class="proposta-config-percent-field">
                            <input type="text" class="prop-orc-editor-honorarios-percent" inputmode="decimal" value="${Number(normalizada.percentualHonorarios || globais.percentualHonorariosPadrao || 0)}" ${aplicarHonorarios ? '' : 'disabled'}>
                            <span>%</span>
                        </div>
                    </div>
                    <div class="proposta-config-editor-rule${aplicarEncargos ? '' : ' is-disabled'}" data-editor-rule="encargos">
                        <label class="proposta-config-tax-toggle">
                            <input type="checkbox" class="prop-orc-editor-encargos-check" data-change="atualizarCamposEditorCategoriaConfig" ${aplicarEncargos ? 'checked' : ''}>
                            Encargos
                        </label>
                        <div class="proposta-config-percent-field">
                            <input type="text" class="prop-orc-editor-encargos-percent" inputmode="decimal" value="${Number(normalizada.percentualEncargos || globais.percentualEncargosPadrao || 0)}" ${aplicarEncargos ? '' : 'disabled'}>
                            <span>%</span>
                        </div>
                        <select class="prop-orc-editor-encargos-tipo proposta-config-type-select" ${aplicarEncargos ? '' : 'disabled'}>
                            <option value="simples"${tipoEncargos === 'simples' ? ' selected' : ''}>Simples</option>
                            <option value="por_dentro"${tipoEncargos === 'por_dentro' ? ' selected' : ''}>Por dentro</option>
                        </select>
                    </div>
                    <div class="proposta-config-editor-rule${aplicarINSS ? '' : ' is-disabled'}" data-editor-rule="inss">
                        <label class="proposta-config-tax-toggle">
                            <input type="checkbox" class="prop-orc-editor-inss-check" data-change="atualizarCamposEditorCategoriaConfig" ${aplicarINSS ? 'checked' : ''}>
                            INSS
                        </label>
                        <div class="proposta-config-percent-field">
                            <input type="text" class="prop-orc-editor-inss-percent" inputmode="decimal" value="${Number(normalizada.percentualINSS || globais.percentualINSSPadrao || 0)}" ${aplicarINSS ? '' : 'disabled'}>
                            <span>%</span>
                        </div>
                        <select class="prop-orc-editor-inss-tipo proposta-config-type-select" ${aplicarINSS ? '' : 'disabled'}>
                            <option value="simples"${tipoINSS === 'simples' ? ' selected' : ''}>Simples</option>
                            <option value="por_dentro"${tipoINSS === 'por_dentro' ? ' selected' : ''}>Por dentro</option>
                        </select>
                    </div>
                </div>
                <div class="proposta-config-category-editor-actions">
                    <button type="button" class="btn btn-secondary" data-action="fecharEditorCategoriaConfigOrcamento">Cancelar</button>
                    <button type="button" class="btn btn-primary" data-action="salvarEditorCategoriaConfigOrcamento">
                        <i class="bi bi-check2"></i> Salvar categoria
                    </button>
                </div>
            </div>
        `;
    }

    function renderizarEditorCategoriaConfigOrcamento(categoria, opcoes = {}) {
        const host = document.getElementById('propOrcCategoriaEditor');
        if (!host) return;
        host.hidden = false;
        host.innerHTML = montarEditorCategoriaConfigOrcamento(categoria, opcoes);
        atualizarCamposEditorCategoriaConfig();
        setTimeout(() => {
            const primeiroCampo = host.querySelector('.prop-orc-editor-nome:not([readonly]), .prop-orc-editor-cor, button');
            primeiroCampo?.focus?.();
            if (primeiroCampo?.select) primeiroCampo.select();
        }, 50);
    }

    function fecharEditorCategoriaConfigOrcamento() {
        const host = document.getElementById('propOrcCategoriaEditor');
        if (!host) return;
        host.innerHTML = '';
        host.hidden = true;
    }

    function atualizarCamposEditorCategoriaConfig() {
        const painel = document.querySelector('#propOrcCategoriaEditor .proposta-config-category-editor-panel');
        if (!painel) return;

        [
            ['honorarios', '.prop-orc-editor-honorarios-check', ['.prop-orc-editor-honorarios-percent']],
            ['encargos', '.prop-orc-editor-encargos-check', ['.prop-orc-editor-encargos-percent', '.prop-orc-editor-encargos-tipo']],
            ['inss', '.prop-orc-editor-inss-check', ['.prop-orc-editor-inss-percent', '.prop-orc-editor-inss-tipo']]
        ].forEach(([nome, seletorCheck, seletoresCampos]) => {
            const ativo = painel.querySelector(seletorCheck)?.checked === true;
            const regra = painel.querySelector(`[data-editor-rule="${nome}"]`);
            regra?.classList.toggle('is-disabled', !ativo);
            seletoresCampos.forEach((seletor) => {
                const campo = painel.querySelector(seletor);
                if (campo) campo.disabled = !ativo;
            });
        });
    }

    function obterCategoriaConfigDoEditor(globais = criarGlobaisPadraoOrcamento()) {
        const painel = document.querySelector('#propOrcCategoriaEditor .proposta-config-category-editor-panel');
        if (!painel) return null;
        const idOriginal = painel.getAttribute('data-editor-categoria-id') || '';
        const nova = painel.getAttribute('data-editor-nova') === '1';
        const nome = textoSeguro(painel.querySelector('.prop-orc-editor-nome')?.value, CATEGORIA_ITEM_PROPOSTA_PADRAO_NOME);
        const id = nova ? (idOriginal || gerarIdCategoriaLivreConfig(nome)) : idOriginal;
        const fixa = id === CATEGORIA_ITEM_PROPOSTA_PADRAO;
        const linhaAtual = obterLinhasCategoriasConfigOrcamento()
            .find((row) => row.getAttribute('data-prop-orc-categoria') === id);

        return normalizarCategoriaConfigOrcamento({
            id,
            nome,
            ativa: fixa ? true : painel.querySelector('.prop-orc-editor-ativa')?.checked === true,
            ordem: nova
                ? obterLinhasCategoriasConfigOrcamento().length + 1
                : inteiroNaoNegativo(linhaAtual?.querySelector('.prop-orc-cat-ordem')?.value, 1),
            cor: textoSeguro(painel.querySelector('.prop-orc-editor-cor')?.value, criarCorCategoriaOrcamento(1)),
            icone: textoSeguro(painel.querySelector('.prop-orc-editor-icone')?.value, 'bi-tag'),
            aplicarHonorarios: painel.querySelector('.prop-orc-editor-honorarios-check')?.checked === true,
            percentualHonorarios: lerPercentualCampo(painel.querySelector('.prop-orc-editor-honorarios-percent'), globais.percentualHonorariosPadrao),
            aplicarEncargos: painel.querySelector('.prop-orc-editor-encargos-check')?.checked === true,
            percentualEncargos: lerPercentualCampo(painel.querySelector('.prop-orc-editor-encargos-percent'), globais.percentualEncargosPadrao),
            tipoCalculoEncargos: normalizarTipoCalculoTributo(painel.querySelector('.prop-orc-editor-encargos-tipo')?.value, globais.tipoCalculoEncargosPadrao),
            aplicarINSS: painel.querySelector('.prop-orc-editor-inss-check')?.checked === true,
            percentualINSS: lerPercentualCampo(painel.querySelector('.prop-orc-editor-inss-percent'), globais.percentualINSSPadrao),
            tipoCalculoINSS: normalizarTipoCalculoTributo(painel.querySelector('.prop-orc-editor-inss-tipo')?.value, globais.tipoCalculoINSSPadrao),
            fixa
        }, 0, globais);
    }

    function abrirEditorCategoriaConfigOrcamento(idCategoria) {
        const globais = obterPadroesOrcamento().globais || criarGlobaisPadraoOrcamento();
        const linha = obterLinhasCategoriasConfigOrcamento()
            .find((row) => row.getAttribute('data-prop-orc-categoria') === String(idCategoria || ''));
        const indice = obterLinhasCategoriasConfigOrcamento().indexOf(linha);
        const categoria = lerCategoriaConfigDaLinha(linha, indice >= 0 ? indice : 0, globais);
        if (!categoria) return;
        renderizarEditorCategoriaConfigOrcamento(categoria, { globais, nova: false });
    }

    function salvarEditorCategoriaConfigOrcamento() {
        const globais = obterPadroesOrcamento().globais || criarGlobaisPadraoOrcamento();
        const painel = document.querySelector('#propOrcCategoriaEditor .proposta-config-category-editor-panel');
        if (!painel) return;
        const nova = painel.getAttribute('data-editor-nova') === '1';
        const categoria = obterCategoriaConfigDoEditor(globais);
        if (!categoria) return;
        if (!textoSeguro(categoria.nome)) {
            mostrarToast('Informe o nome da categoria.', 'erro');
            painel.querySelector('.prop-orc-editor-nome')?.focus();
            return;
        }

        const lista = obterListaCategoriasConfigOrcamento();
        const existente = obterLinhasCategoriasConfigOrcamento()
            .find((row) => row.getAttribute('data-prop-orc-categoria') === categoria.id);
        const html = montarLinhaConfigCategoriaOrcamento(categoria, globais);
        if (existente && !nova) {
            existente.outerHTML = html;
        } else {
            lista?.insertAdjacentHTML('beforeend', html);
        }
        renumerarOrdemCategoriasConfig();
        fecharEditorCategoriaConfigOrcamento();
        mostrarToast(nova ? 'Categoria criada.' : 'Categoria atualizada.', 'info');
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
                percentualHonorarios: converterTextoPercentualParaNumero(linha.querySelector('.prop-orc-cat-honorarios-percent')?.value, globais.percentualHonorariosPadrao),
                aplicarEncargos: linha.querySelector('.prop-orc-cat-encargos-check')?.checked === true,
                percentualEncargos: converterTextoPercentualParaNumero(linha.querySelector('.prop-orc-cat-encargos-percent')?.value, globais.percentualEncargosPadrao),
                tipoCalculoEncargos: normalizarTipoCalculoTributo(linha.querySelector('.prop-orc-cat-encargos-tipo')?.value),
                aplicarINSS: linha.querySelector('.prop-orc-cat-inss-check')?.checked === true,
                percentualINSS: converterTextoPercentualParaNumero(linha.querySelector('.prop-orc-cat-inss-percent')?.value, globais.percentualINSSPadrao),
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

    function aplicarPadroesItensProposta() {
        aplicarPadroesOrcamentoNaPropostaAtual();
        mostrarToast('Padrões aplicados aos itens da proposta.', 'info');
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
        const ids = new Set(obterLinhasCategoriasConfigOrcamento()
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
        obterLinhasCategoriasConfigOrcamento().forEach((linha, indice) => {
            const ordem = linha.querySelector('.prop-orc-cat-ordem');
            if (ordem) ordem.value = String(indice + 1);
            const badge = linha.querySelector('.proposta-config-order-badge');
            if (badge) badge.textContent = String(indice + 1);
        });
    }

    function adicionarCategoriaConfigOrcamento() {
        const globais = obterPadroesOrcamento().globais || criarGlobaisPadraoOrcamento();
        const ordem = obterLinhasCategoriasConfigOrcamento().length + 1;
        const id = gerarIdCategoriaLivreConfig('Nova categoria');
        const categoria = normalizarCategoriaConfigOrcamento({
            id,
            nome: 'Nova categoria',
            ativa: true,
            ordem,
            cor: criarCorCategoriaOrcamento(ordem),
            icone: 'bi-tag',
            aplicarHonorarios: true,
            percentualHonorarios: globais.percentualHonorariosPadrao || 0,
            aplicarEncargos: true,
            percentualEncargos: globais.percentualEncargosPadrao || 0,
            tipoCalculoEncargos: globais.tipoCalculoEncargosPadrao || 'simples',
            aplicarINSS: false,
            percentualINSS: globais.percentualINSSPadrao || 0,
            tipoCalculoINSS: globais.tipoCalculoINSSPadrao || 'simples'
        }, ordem, globais);
        renderizarEditorCategoriaConfigOrcamento(categoria, { globais, nova: true });
    }

    function moverCategoriaConfigOrcamento(arg) {
        const [id, direcao] = String(arg || '').split(':');
        const lista = obterListaCategoriasConfigOrcamento();
        const linha = obterLinhasCategoriasConfigOrcamento()
            .find((row) => row.getAttribute('data-prop-orc-categoria') === id);
        if (!lista || !linha) return;
        const linhas = obterLinhasCategoriasConfigOrcamento();
        const indice = linhas.indexOf(linha);
        if (direcao === 'up' && indice > 0) {
            lista.insertBefore(linha, linhas[indice - 1]);
        } else if (direcao === 'down' && indice >= 0 && indice < linhas.length - 1) {
            lista.insertBefore(linhas[indice + 1], linha);
        }
        renumerarOrdemCategoriasConfig();
    }

    function alternarCategoriaConfigOrcamento(idCategoria) {
        const globais = obterPadroesOrcamento().globais || criarGlobaisPadraoOrcamento();
        const linhas = obterLinhasCategoriasConfigOrcamento();
        const linha = linhas.find((row) => row.getAttribute('data-prop-orc-categoria') === String(idCategoria || ''));
        if (!linha) return;
        const categoria = lerCategoriaConfigDaLinha(linha, linhas.indexOf(linha), globais);
        if (!categoria) return;
        if (categoria.id === CATEGORIA_ITEM_PROPOSTA_PADRAO || categoria.fixa) {
            mostrarToast('A categoria Outros precisa ficar ativa como segurança.', 'info');
            return;
        }
        categoria.ativa = categoria.ativa === false;
        linha.outerHTML = montarLinhaConfigCategoriaOrcamento(categoria, globais);
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

    function parsePercentualInput(id, fallback = 0, maximo = 99.99) {
        return lerPercentualCampo(document.getElementById(id), fallback, maximo);
    }

    function formatarValorMonetarioEditavel(campo) {
        if (!campo || campo.readOnly || campo.disabled) return;
        const valorBruto = textoSeguro(campo.value);
        if (!valorBruto) {
            campo.value = formatarMoeda(0);
            return;
        }
        campo.value = formatarMoeda(valorBruto);
    }

    function formatarMoedaParaEdicao(valor) {
        const numero = converterTextoMoedaParaNumero(valor, 0);
        if (numero <= 0) return '';
        const temCentavos = Math.abs(numero % 1) > 0;
        return numero.toLocaleString('pt-BR', {
            useGrouping: false,
            minimumFractionDigits: temCentavos ? 2 : 0,
            maximumFractionDigits: 2
        });
    }

    function limparTextoCampoMoedaProposta(valor) {
        let texto = String(valor || '').replace(/[^\d,.-]/g, '');
        const negativo = texto.trim().startsWith('-');
        texto = texto.replace(/-/g, '');
        texto = texto.replace(/^0+(?=\d)/, '');
        return `${negativo ? '-' : ''}${texto}`;
    }

    function valorInputMonetario(valor) {
        return formatarMoeda(valor);
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
        campoValorKm.value = valorInputMonetario(valorPadrao);
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
                freteEl.value = valorInputMonetario(resultado.freteCalculado);
                freteEl.title = 'Frete calculado automaticamente por distância x valor por km.';
            } else {
                freteEl.removeAttribute('title');
            }
        }

        return resultado;
    }

    function clampPercentual(valor) {
        const numero = converterTextoPercentualParaNumero(valor, 0, { maximo: 100 });
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

    function obterDataStatusProposta(proposta) {
        const status = normalizarStatusProposta(proposta?.status || 'rascunho');
        if (status === 'enviada' || status === 'em_negociacao') return textoSeguro(proposta?.dataEnvio, '');
        if (status === 'aprovada') return textoSeguro(proposta?.dataAprovacao, '');
        if (status === 'recusada') return textoSeguro(proposta?.dataRecusa || proposta?.dataCancelamento, '');
        if (status === 'cancelada') return textoSeguro(proposta?.dataCancelamento, '');
        if (status === 'convertida') return textoSeguro(proposta?.dataConversaoLocacao || proposta?.dataAprovacao, '');
        return '';
    }

    function obterMotivoStatusProposta(proposta) {
        const status = normalizarStatusProposta(proposta?.status || 'rascunho');
        if (status === 'recusada') return textoSeguro(proposta?.motivoRecusa || proposta?.motivoStatus, '');
        if (status === 'cancelada') return textoSeguro(proposta?.motivoCancelamento || proposta?.motivoStatus, '');
        return textoSeguro(proposta?.motivoStatus, '');
    }

    function obterStatusSelecionado() {
        return normalizarStatusProposta(document.getElementById('propStatus')?.value || 'rascunho');
    }

    function atualizarModoFormulario(texto) {
        const badge = document.getElementById('propostaModoLabel');
        if (!badge) return;
        badge.textContent = texto || 'Nova proposta';
    }

    function montarDiferencasRevisaoProposta(atual, origem) {
        if (!atual || !origem) return [];
        const diferencas = [];
        const valorAtual = obterValorFinalComercial(atual);
        const valorOrigem = obterValorFinalComercial(origem);
        const deltaValor = valorAtual - valorOrigem;
        if (Math.abs(deltaValor) >= 0.01) {
            diferencas.push(`${deltaValor > 0 ? '+' : ''}${formatarMoeda(deltaValor)} no valor final`);
        }
        const qtdAtual = Array.isArray(atual.itens) ? atual.itens.length : 0;
        const qtdOrigem = Array.isArray(origem.itens) ? origem.itens.length : 0;
        const deltaItens = qtdAtual - qtdOrigem;
        if (deltaItens !== 0) {
            diferencas.push(`${deltaItens > 0 ? '+' : ''}${deltaItens} item(ns)`);
        }
        if (textoSeguro(atual.evento?.dataEvento) !== textoSeguro(origem.evento?.dataEvento)) {
            diferencas.push('data do evento alterada');
        }
        if (normalizarStatusProposta(atual.status) !== normalizarStatusProposta(origem.status)) {
            diferencas.push(`status ${statusRotulo(origem.status)} -> ${statusRotulo(atual.status)}`);
        }
        return diferencas;
    }

    function localizarOrigemRevisaoProposta(proposta) {
        const atual = normalizarProposta(proposta);
        const lista = obterPropostasBase();
        const origemId = textoSeguro(atual.propostaOrigemId);
        if (origemId) {
            const direta = lista.find((item) => String(item.id) === origemId);
            if (direta) return normalizarProposta(direta);
        }
        const codigoBase = obterCodigoBaseProposta(atual);
        const revisaoAtual = normalizarNumeroRevisaoProposta(atual.revisao, 1);
        const anterior = lista
            .map((item) => normalizarProposta(item))
            .filter((item) => String(item.id) !== String(atual.id))
            .filter((item) => obterCodigoBaseProposta(item) === codigoBase)
            .filter((item) => normalizarNumeroRevisaoProposta(item.revisao, 1) < revisaoAtual)
            .sort((a, b) => normalizarNumeroRevisaoProposta(b.revisao, 1) - normalizarNumeroRevisaoProposta(a.revisao, 1))[0];
        return anterior || null;
    }

    function obterLinhaTempoRevisoesProposta(proposta) {
        const atual = normalizarProposta(proposta);
        const codigoBase = obterCodigoBaseProposta(atual);
        const porCodigo = obterPropostasBase()
            .map((item) => normalizarProposta(item))
            .filter((item) => obterCodigoBaseProposta(item) === codigoBase)
            .map((item) => ({
                id: item.id,
                codigo: formatarCodigoRevisaoProposta(item),
                revisao: normalizarNumeroRevisaoProposta(item.revisao, 1),
                status: item.status,
                data: item.dataCriacao || item.criadoEm || '',
                atual: String(item.id) === String(atual.id)
            }));
        const historico = (Array.isArray(atual.historicoRevisoes) ? atual.historicoRevisoes : [])
            .map((item) => ({
                id: item.id,
                codigo: textoSeguro(item.codigo, `Rev. ${normalizarNumeroRevisaoProposta(item.revisao, 1)}`),
                revisao: normalizarNumeroRevisaoProposta(item.revisao, 1),
                status: normalizarStatusProposta(item.status),
                data: item.data || '',
                atual: false
            }));
        const mapa = new Map();
        [...historico, ...porCodigo].forEach((item) => {
            const chave = `${item.id || ''}-${item.revisao}`;
            if (!mapa.has(chave)) mapa.set(chave, item);
        });
        return Array.from(mapa.values()).sort((a, b) => a.revisao - b.revisao);
    }

    function atualizarPainelRevisaoProposta(proposta = null) {
        const painel = document.getElementById('propRevisionPanel');
        if (!painel) return;
        const idAtual = proposta?.id || obterIdPropostaEmEdicao();
        if (!idAtual && !proposta) {
            painel.innerHTML = `
                <div class="proposta-revision-empty">
                    <i class="bi bi-layers"></i>
                    <span>Revisões aparecerão aqui depois que a proposta for salva.</span>
                </div>
            `;
            return;
        }
        const atual = normalizarProposta(proposta || localizarProposta(idAtual));
        const origem = localizarOrigemRevisaoProposta(atual);
        const diferencas = montarDiferencasRevisaoProposta(atual, origem);
        const linhaTempo = obterLinhaTempoRevisoesProposta(atual);
        const revisaoAtual = normalizarNumeroRevisaoProposta(atual.revisao, 1);
        painel.innerHTML = `
            <div class="proposta-revision-card">
                <div class="proposta-revision-main">
                    <span class="proposta-revision-badge">Rev. ${revisaoAtual}</span>
                    <div>
                        <strong>${sanitizar(formatarCodigoRevisaoProposta(atual))}</strong>
                        <small>Base ${sanitizar(obterCodigoBaseProposta(atual) || atual.codigo || '-')}</small>
                    </div>
                </div>
                <div class="proposta-revision-meta">
                    <span><i class="bi bi-clock-history"></i> ${linhaTempo.length} revisão(ões)</span>
                    <span><i class="bi bi-diagram-2"></i> ${origem ? `Origem: ${sanitizar(formatarCodigoRevisaoProposta(origem))}` : 'Primeira versão'}</span>
                </div>
                <div class="proposta-revision-diff">
                    ${diferencas.length ? diferencas.map((item) => `<span>${sanitizar(item)}</span>`).join('') : '<span>Sem diferenças relevantes contra a revisão anterior.</span>'}
                </div>
                <div class="proposta-revision-timeline">
                    ${linhaTempo.map((item) => `
                        <button type="button" class="proposta-revision-step ${item.atual ? 'is-current' : ''}" data-action="editarProposta" data-arg="${item.id || atual.id}" title="Abrir ${sanitizar(item.codigo)}">
                            <strong>Rev. ${item.revisao}</strong>
                            <small>${item.atual ? 'Atual' : statusRotulo(item.status)}</small>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
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
                <td data-label="Categoria">
                    <select class="prop-item-categoria" data-change="recalcularResumoProposta">
                        ${montarOptionsCategoriaItemProposta(itemCalculado.categoria)}
                    </select>
                </td>
                <td data-label="Descrição"><input type="text" class="prop-item-descricao" value="${descricao}" placeholder="Descricao do item" data-input="recalcularResumoProposta"></td>
                <td data-label="Medida"><input type="text" class="prop-item-medida" value="${medida}" placeholder="Medida" data-input="recalcularResumoProposta"></td>
                <td data-label="Período (dias)"><input type="number" class="prop-item-periodo" value="${itemCalculado.periodoDias}" min="0" step="0.5" data-input="recalcularResumoProposta"></td>
                <td data-label="Quantidade"><input type="number" class="prop-item-quantidade" value="${itemCalculado.quantidade}" min="0" step="1" data-input="recalcularResumoProposta"></td>
                <td data-label="Custo unitário"><input type="text" class="prop-item-unitario input-money-br" value="${valorInputMonetario(itemCalculado.custoUnitario)}" inputmode="decimal" placeholder="0,00" data-input="recalcularResumoProposta"></td>
                <td data-label="Custo total"><input type="text" class="prop-item-custo-total" value="${formatarMoeda(itemCalculado.custoTotal)}" readonly></td>
                <td data-label="Valor final"><input type="text" class="prop-item-total" value="${formatarMoeda(itemCalculado.valorTotal)}" readonly></td>
                <td class="col-actions" data-label="Ações">
                    <div class="actions-cell">
                        <button type="button" class="btn btn-sm btn-secondary table-action-btn prop-details-toggle-btn" data-action="alternarDetalhesCalculoItemProposta" data-arg="__this__" aria-expanded="false" title="Detalhes de calculo">
                            <i class="bi bi-chevron-down"></i>
                            <span>Mostrar cálculos avançados</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary table-action-btn" data-action="aplicarPadraoLinhaItemProposta" data-arg="__this__" title="Aplicar padrão do item">
                            <i class="bi bi-arrow-repeat"></i>
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
                                <input type="text" class="prop-item-percentual-honorarios" inputmode="decimal" value="${itemCalculado.percentualHonorarios}" data-input="recalcularResumoProposta">
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
                                <input type="text" class="prop-item-percentual-encargos" inputmode="decimal" value="${itemCalculado.percentualEncargos}" data-input="recalcularResumoProposta">
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
                                <input type="text" class="prop-item-percentual-inss" inputmode="decimal" value="${itemCalculado.percentualINSS}" data-input="recalcularResumoProposta">
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
            percentualHonorarios: lerPercentualCampo(detalhes?.querySelector('.prop-item-percentual-honorarios'), 0),
            aplicarEncargos: detalhes?.querySelector('.prop-item-aplicar-encargos')?.checked === true,
            percentualEncargos: lerPercentualCampo(detalhes?.querySelector('.prop-item-percentual-encargos'), 0),
            tipoCalculoEncargos: normalizarTipoCalculoTributo(detalhes?.querySelector('.prop-item-tipo-encargos')?.value),
            aplicarINSS: detalhes?.querySelector('.prop-item-aplicar-inss')?.checked === true,
            percentualINSS: lerPercentualCampo(detalhes?.querySelector('.prop-item-percentual-inss'), 0),
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
        atualizarBotaoExpandirTodosItensProposta(false);
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

    function aplicarPadraoLinhaItemProposta(botao) {
        const linha = botao?.closest('.proposta-item-row');
        if (!linha) return;
        const categoria = normalizarCategoriaItemProposta(linha.querySelector('.prop-item-categoria')?.value);
        preencherLinhaComRegraCategoria(linha, categoria);
        linha.dataset.categoriaAtual = categoria;
        recalcularResumoProposta();
        mostrarToast('Padrão aplicado ao item.', 'info');
    }

    function atualizarBotaoDetalhesItemProposta(botao, aberto) {
        if (!botao) return;
        botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
        const icon = botao.querySelector('i');
        if (icon) {
            icon.classList.toggle('bi-chevron-down', !aberto);
            icon.classList.toggle('bi-chevron-up', aberto);
        }
        const texto = botao.querySelector('span');
        if (texto) texto.textContent = aberto ? 'Ocultar cálculos avançados' : 'Mostrar cálculos avançados';
    }

    function atualizarBotaoExpandirTodosItensProposta(aberto) {
        const botao = document.getElementById('propBtnExpandirCalculosItens');
        const texto = document.getElementById('propBtnExpandirCalculosTexto');
        if (!botao) return;
        botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
        const icon = botao.querySelector('i');
        if (icon) {
            icon.classList.toggle('bi-chevron-down', !aberto);
            icon.classList.toggle('bi-chevron-up', aberto);
        }
        if (texto) texto.textContent = aberto ? 'Recolher cálculos' : 'Expandir cálculos';
    }

    function alternarDetalhesCalculoItemProposta(botao) {
        const linha = botao?.closest('.proposta-item-row');
        const detalhes = linha?.nextElementSibling?.classList?.contains('proposta-item-details-row')
            ? linha.nextElementSibling
            : null;
        if (!detalhes) return;
        const aberto = detalhes.hidden;
        detalhes.hidden = !aberto;
        atualizarBotaoDetalhesItemProposta(botao, aberto);
        const todosAbertos = Array.from(document.querySelectorAll('#propostaItensBody .proposta-item-details-row')).every((detalhe) => !detalhe.hidden);
        atualizarBotaoExpandirTodosItensProposta(todosAbertos);
    }

    function alternarTodosDetalhesItensProposta() {
        const linhas = Array.from(document.querySelectorAll('#propostaItensBody .proposta-item-row'));
        if (!linhas.length) return;
        const deveAbrir = linhas.some((linha) => {
            const detalhes = linha.nextElementSibling?.classList?.contains('proposta-item-details-row') ? linha.nextElementSibling : null;
            return detalhes?.hidden;
        });

        linhas.forEach((linha) => {
            const detalhes = linha.nextElementSibling?.classList?.contains('proposta-item-details-row') ? linha.nextElementSibling : null;
            if (!detalhes) return;
            detalhes.hidden = !deveAbrir;
            atualizarBotaoDetalhesItemProposta(linha.querySelector('.prop-details-toggle-btn'), deveAbrir);
        });
        atualizarBotaoExpandirTodosItensProposta(deveAbrir);
    }

    function alternarCategoriasVaziasResumoProposta() {
        mostrarCategoriasVaziasProposta = !mostrarCategoriasVaziasProposta;
        recalcularResumoProposta();
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
        const subtotalItens = arredondarMoeda(itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.valorTotal, 0), 0));
        const subtotalCustoItens = arredondarMoeda(itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.custoTotal, 0), 0));
        const subtotalHonorariosItens = arredondarMoeda(itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.valorHonorarios, 0), 0));
        const subtotalEncargosItens = arredondarMoeda(itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.valorEncargos, 0), 0));
        const subtotalINSSItens = arredondarMoeda(itensCalculados.reduce((acc, item) => acc + numeroNaoNegativo(item.valorINSS, 0), 0));

        const totalCustosAdicionais = arredondarMoeda(CHAVES_CUSTOS_ADICIONAIS.reduce((acc, chave) => {
            return acc + numeroNaoNegativo(custos?.[chave], 0);
        }, 0));

        const descontoNormalizado = arredondarMoeda(numeroNaoNegativo(desconto, 0));
        const acrescimoNormalizado = arredondarMoeda(numeroNaoNegativo(acrescimo, 0));
        const valorBase = arredondarMoeda(Math.max(subtotalItens + totalCustosAdicionais + acrescimoNormalizado - descontoNormalizado, 0));
        const percentualNFNormalizado = converterTextoPercentualParaNumero(percentualNF, 0, { maximo: 99.99 });
        const tipoNF = normalizarTipoCalculoNF(tipoCalculoNF, 'descontar');
        const valorNF = arredondarMoeda((valorBase * percentualNFNormalizado) / 100);
        const valorFinal = valorBase;
        const valorFinalComNF = arredondarMoeda(tipoNF === 'acrescentar' ? valorBase + valorNF : valorBase);
        const valorLiquidoPrevisto = arredondarMoeda(tipoNF === 'descontar' ? (valorBase - valorNF) : valorBase);
        const valorFinalComercial = tipoNF === 'acrescentar' ? valorFinalComNF : valorFinal;

        const percentualEntradaNormalizado = clampPercentual(percentualEntrada);
        const valorEntrada = arredondarMoeda((valorFinalComercial * percentualEntradaNormalizado) / 100);
        const percentualSaldo = Math.max(0, 100 - percentualEntradaNormalizado);
        const valorSaldo = arredondarMoeda(Math.max(valorFinalComercial - valorEntrada, 0));

        const custoInternoTotal = arredondarMoeda(numeroNaoNegativo(controleInterno?.custoInternoTotal, 0));
        const custoTerceirizadoTotal = arredondarMoeda(numeroNaoNegativo(controleInterno?.custoTerceirizadoTotal, 0));
        const outrosCustosInternos = arredondarMoeda(numeroNaoNegativo(controleInterno?.outrosCustosInternos, 0));
        const custoTotalProposta = arredondarMoeda(custoInternoTotal + custoTerceirizadoTotal + outrosCustosInternos);
        const lucroPrevisto = arredondarMoeda(valorLiquidoPrevisto - custoTotalProposta);
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
        const percentualNF = parsePercentualInput('propPercentualNF', 0, 99.99);
        const tipoCalculoNF = document.getElementById('propTipoCalculoNF')?.value || 'descontar';
        const percentualEntrada = parsePercentualInput('propPercentualEntrada', 50, 100);

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
            percentualNF: converterTextoPercentualParaNumero(financeiroOrig.percentualNF, resumoBase.percentualNF || 0),
            tipoCalculoNF: normalizarTipoCalculoNF(financeiroOrig.tipoCalculoNF, resumoBase.tipoCalculoNF || 'descontar'),
            valorNF: numeroNaoNegativo(financeiroOrig.valorNF, resumoBase.valorNF || 0),
            valorFinal: numeroNaoNegativo(financeiroOrig.valorFinal, resumoBase.valorFinal || 0),
            valorFinalComNF: numeroNaoNegativo(financeiroOrig.valorFinalComNF, resumoBase.valorFinalComNF || 0),
            valorLiquidoPrevisto: numeroSeguro(financeiroOrig.valorLiquidoPrevisto, resumoBase.valorLiquidoPrevisto || 0),
            percentualEntrada,
            valorEntrada: numeroNaoNegativo(financeiroOrig.valorEntrada, resumoBase.valorEntrada || 0),
            percentualSaldo: converterTextoPercentualParaNumero(financeiroOrig.percentualSaldo, resumoBase.percentualSaldo || (100 - percentualEntrada), { maximo: 100 }),
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
            percentualNF: converterTextoPercentualParaNumero(financeiroOrig.percentualNF, 0),
            tipoCalculoNF: normalizarTipoCalculoNF(financeiroOrig.tipoCalculoNF, 'descontar'),
            percentualEntrada: converterTextoPercentualParaNumero(financeiroOrig.percentualEntrada, 50, { maximo: 100 }),
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
        const codigoBase = obterCodigoBaseProposta(proposta.codigoBase || codigo) || codigo;
        const revisao = normalizarNumeroRevisaoProposta(proposta.revisao ?? proposta.numeroRevisao ?? extrairRevisaoDoCodigo(codigo), 1);
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
            codigoBase,
            revisao,
            numeroRevisao: revisao,
            codigoExibicao: formatarCodigoRevisaoProposta({ codigoBase, revisao }),
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
            dataRecusa: textoSeguro(proposta.dataRecusa, ''),
            dataCancelamento: textoSeguro(proposta.dataCancelamento, ''),
            dataConversaoLocacao,
            motivoStatus: textoSeguro(proposta.motivoStatus, ''),
            motivoRecusa: textoSeguro(proposta.motivoRecusa, ''),
            motivoCancelamento: textoSeguro(proposta.motivoCancelamento, ''),
            propostaOrigemId: textoSeguro(proposta.propostaOrigemId, ''),
            historicoRevisoes: Array.isArray(proposta.historicoRevisoes) ? proposta.historicoRevisoes.slice() : [],
            motivoRevisao: textoSeguro(proposta.motivoRevisao, ''),
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

    function focarPendenciaProposta(pendencia) {
        if (!pendencia?.secao) return;
        mostrarSubAbaPropostas('formulario', { semRolagem: true, foco: false });
        mostrarSecaoFormularioProposta(pendencia.secao, { semRolagem: true, foco: false });

        setTimeout(() => {
            const campo = pendencia.campo ? document.getElementById(pendencia.campo) : null;
            const alvo = campo || document.getElementById(`propostaSecao${pendencia.secao[0]?.toUpperCase() || ''}${pendencia.secao.slice(1)}`);
            alvo?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
            campo?.focus?.();
            campo?.select?.();
        }, 120);
    }

    function obterPendenciasPropostaPronta(proposta, opcoes = {}) {
        const p = normalizarProposta(proposta);
        const pendencias = [];
        const modo = opcoes.modo || 'pdf';
        const itensValidos = (Array.isArray(p.itens) ? p.itens : []).filter((item) => {
            const calculado = calcularItemProposta(item || {});
            return textoSeguro(calculado.descricao)
                && numeroNaoNegativo(calculado.quantidade, 0) > 0
                && numeroNaoNegativo(calculado.valorTotal, 0) > 0;
        });
        const valorFinalComercial = obterValorFinalComercial(p);

        if (!textoSeguro(p.cliente?.nome)) {
            pendencias.push({ secao: 'dados', campo: 'propClienteNome', mensagem: 'Informe o nome/empresa do cliente antes de gerar a proposta.' });
        }
        if (!textoSeguro(p.cliente?.telefone) && !textoSeguro(p.cliente?.email)) {
            pendencias.push({ secao: 'dados', campo: 'propClienteTelefone', mensagem: 'Informe telefone ou e-mail do cliente para contato comercial.' });
        }
        if (!textoSeguro(p.evento?.nome)) {
            pendencias.push({ secao: 'dados', campo: 'propEventoNome', mensagem: 'Informe o nome do evento antes de finalizar a proposta.' });
        }
        if (!textoSeguro(p.evento?.dataEvento)) {
            pendencias.push({ secao: 'dados', campo: 'propDataEvento', mensagem: 'Informe a data do evento antes de gerar PDF ou converter.' });
        }
        if (modo === 'conversao' && !textoSeguro(p.evento?.dataMontagem)) {
            pendencias.push({ secao: 'dados', campo: 'propDataMontagem', mensagem: 'Informe a data de montagem antes de converter em locação.' });
        }
        if (modo === 'conversao' && !textoSeguro(p.evento?.dataDesmontagem)) {
            pendencias.push({ secao: 'dados', campo: 'propDataDesmontagem', mensagem: 'Informe a data de desmontagem antes de converter em locação.' });
        }
        if (!parseDataIso(p.financeiro?.validadePropostaData)) {
            pendencias.push({ secao: 'dados', campo: 'propValidadeData', mensagem: 'Informe uma validade para a proposta.' });
        }
        if (!itensValidos.length) {
            pendencias.push({ secao: 'itens', campo: null, mensagem: 'Adicione pelo menos um item com descrição, quantidade e valor maior que zero.' });
        }
        if (valorFinalComercial <= 0) {
            pendencias.push({ secao: 'itens', campo: null, mensagem: 'O valor final da proposta precisa ser maior que zero.' });
        }
        if (!textoSeguro(p.financeiro?.condicaoPagamento)) {
            pendencias.push({ secao: 'fechamento', campo: 'propCondicaoPagamento', mensagem: 'Informe a condição de pagamento antes de enviar a proposta.' });
        }

        return pendencias;
    }

    function validarPropostaProntaParaUso(proposta, opcoes = {}) {
        const pendencias = obterPendenciasPropostaPronta(proposta, opcoes);
        if (!pendencias.length) return true;

        const primeira = pendencias[0];
        mostrarToast(primeira.mensagem, 'erro');
        if (opcoes.focar !== false) {
            focarPendenciaProposta(primeira);
        }
        return false;
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
        const percentualNF = parsePercentualInput('propPercentualNF', 0, 99.99);
        const tipoCalculoNF = normalizarTipoCalculoNF(document.getElementById('propTipoCalculoNF')?.value, 'descontar');
        const percentualEntrada = parsePercentualInput('propPercentualEntrada', 50, 100);

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
            codigoBase: textoSeguro(propostaAtual?.codigoBase || propostaAtual?.codigo, ''),
            revisao: normalizarNumeroRevisaoProposta(propostaAtual?.revisao ?? propostaAtual?.numeroRevisao, 1),
            numeroRevisao: normalizarNumeroRevisaoProposta(propostaAtual?.revisao ?? propostaAtual?.numeroRevisao, 1),
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
            dataRecusa: textoSeguro(propostaAtual?.dataRecusa, ''),
            dataCancelamento: textoSeguro(propostaAtual?.dataCancelamento, ''),
            dataConversaoLocacao: textoSeguro(propostaAtual?.dataConversaoLocacao, ''),
            motivoStatus: textoSeguro(propostaAtual?.motivoStatus, ''),
            motivoRecusa: textoSeguro(propostaAtual?.motivoRecusa, ''),
            motivoCancelamento: textoSeguro(propostaAtual?.motivoCancelamento, ''),
            propostaOrigemId: textoSeguro(propostaAtual?.propostaOrigemId, ''),
            historicoRevisoes: Array.isArray(propostaAtual?.historicoRevisoes) ? propostaAtual.historicoRevisoes.slice() : [],
            motivoRevisao: textoSeguro(propostaAtual?.motivoRevisao, '')
        };

        if (!proposta.codigo) proposta.codigo = gerarCodigoProposta();
        proposta.codigoBase = obterCodigoBaseProposta(proposta.codigoBase || proposta.codigo);

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
            propFreteValorKm: valorInputMonetario(p.custos.freteValorKm),
            propCustoFrete: valorInputMonetario(p.custos.frete),
            propCustoMaoObra: valorInputMonetario(p.custos.maoObra),
            propCustoOperador: valorInputMonetario(p.custos.operador),
            propCustoEletrica: valorInputMonetario(p.custos.eletrica),
            propCustoGerador: valorInputMonetario(p.custos.gerador),
            propCustoTerceirizados: valorInputMonetario(p.custos.terceirizados),
            propCustoOutros: valorInputMonetario(p.custos.outros),
            propDesconto: valorInputMonetario(p.financeiro.desconto),
            propAcrescimo: valorInputMonetario(p.financeiro.acrescimo),
            propPercentualNF: p.financeiro.percentualNF,
            propTipoCalculoNF: p.financeiro.tipoCalculoNF,
            propPercentualEntrada: p.financeiro.percentualEntrada,
            propVencEntrada: p.financeiro.vencimentoEntrada,
            propVencSaldo: p.financeiro.vencimentoSaldo,
            propFormaPagamento: p.financeiro.formaPagamento,
            propCondicaoPagamento: p.financeiro.condicaoPagamento,
            propObsPagamento: p.financeiro.observacaoPagamento,
            propCustoInternoTotal: valorInputMonetario(p.controleInterno.custoInternoTotal),
            propCustoTerceirizadoTotal: valorInputMonetario(p.controleInterno.custoTerceirizadoTotal),
            propOutrosCustosInternos: valorInputMonetario(p.controleInterno.outrosCustosInternos),
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
        atualizarModoFormulario(`Editando ${formatarCodigoRevisaoProposta(p)}`);
        atualizarPainelRevisaoProposta(p);
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
        if (freteValorKmEl && valorKmPadrao > 0) freteValorKmEl.value = valorInputMonetario(valorKmPadrao);
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
        atualizarPainelRevisaoProposta(null);
        mostrarSecaoFormularioProposta('dados', { semRolagem: true, foco: false });
        mostrarSubAbaPropostas('formulario', { semRolagem: true, foco: false });
        document.getElementById('propClienteNome')?.focus();
    }

    function aplicarDatasAutomaticasStatus(propostaNova, propostaAnterior, agoraIso) {
        const anterior = normalizarStatusProposta(propostaAnterior?.status || 'rascunho');
        const atual = normalizarStatusProposta(propostaNova.status);

        propostaNova.dataEnvio = textoSeguro(propostaAnterior?.dataEnvio, propostaNova.dataEnvio || '');
        propostaNova.dataAprovacao = textoSeguro(propostaAnterior?.dataAprovacao, propostaNova.dataAprovacao || '');
        propostaNova.dataRecusa = textoSeguro(propostaAnterior?.dataRecusa, propostaNova.dataRecusa || '');
        propostaNova.dataCancelamento = textoSeguro(propostaAnterior?.dataCancelamento, propostaNova.dataCancelamento || '');
        propostaNova.dataConversaoLocacao = textoSeguro(propostaAnterior?.dataConversaoLocacao, propostaNova.dataConversaoLocacao || '');
        propostaNova.motivoStatus = textoSeguro(propostaNova.motivoStatus || propostaAnterior?.motivoStatus, '');
        propostaNova.motivoRecusa = textoSeguro(propostaNova.motivoRecusa || propostaAnterior?.motivoRecusa, '');
        propostaNova.motivoCancelamento = textoSeguro(propostaNova.motivoCancelamento || propostaAnterior?.motivoCancelamento, '');

        if (atual === 'enviada' && !propostaNova.dataEnvio) propostaNova.dataEnvio = agoraIso;
        if (atual === 'aprovada' && !propostaNova.dataAprovacao) propostaNova.dataAprovacao = agoraIso;
        if (atual === 'recusada' && !propostaNova.dataRecusa) propostaNova.dataRecusa = agoraIso;
        if (atual === 'cancelada' && !propostaNova.dataCancelamento) propostaNova.dataCancelamento = agoraIso;
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

    function solicitarMotivoStatusProposta(proposta, novoStatus) {
        if (novoStatus !== 'recusada' && novoStatus !== 'cancelada') return '';
        const rotulo = novoStatus === 'recusada' ? 'recusa' : 'cancelamento';
        const motivoAtual = obterMotivoStatusProposta(proposta);
        const motivo = prompt(`Informe o motivo da ${rotulo} da proposta:`, motivoAtual);
        if (motivo === null) return null;
        return textoSeguro(motivo, motivoAtual);
    }

    function atualizarStatusProposta(id, novoStatus, opcoes = {}) {
        const status = normalizarStatusProposta(novoStatus);
        if (status === 'convertida') {
            converterPropostaEmLocacaoFechada(id);
            return;
        }
        const lista = obterPropostasBase();
        const indice = lista.findIndex((item) => String(item.id) === String(id));
        if (indice < 0) {
            mostrarToast('Proposta nao encontrada para atualizar status.', 'erro');
            return;
        }

        const anterior = lista[indice];
        if ((status === 'enviada' || status === 'aprovada') && !validarPropostaProntaParaUso(anterior, {
            modo: 'status',
            focar: String(obterIdPropostaEmEdicao()) === String(id)
        })) {
            return;
        }
        const motivo = solicitarMotivoStatusProposta(anterior, status);
        if (motivo === null) return;

        const agoraIso = obterAgoraIso();
        const atualizada = {
            ...anterior,
            status,
            dataUltimaAlteracao: agoraIso,
            alteradoPor: obterUsuarioAtualNomeOuEmail()
        };

        if (status === 'recusada') {
            atualizada.motivoRecusa = motivo;
            atualizada.motivoStatus = motivo;
        }
        if (status === 'cancelada') {
            atualizada.motivoCancelamento = motivo;
            atualizada.motivoStatus = motivo;
        }

        aplicarDatasAutomaticasStatus(atualizada, anterior, agoraIso);
        atualizada.atualizadoEm = atualizada.dataUltimaAlteracao;
        lista[indice] = normalizarProposta(atualizada);
        propostas = lista;
        salvarLocal();
        renderTudo();
        sincronizar('salvar');

        if (typeof registrarLog === 'function') {
            registrarLog('proposta', 'status', `Proposta ${anterior.codigo} marcada como ${statusRotulo(status)}.`);
        }
        mostrarToast(`Proposta marcada como ${statusRotulo(status)}.`);

        const idEmEdicao = obterIdPropostaEmEdicao();
        if (String(idEmEdicao) === String(id)) {
            preencherFormularioComProposta(lista[indice]);
        }

        if (opcoes.voltarLista !== false) {
            mostrarSubAbaPropostas('lista', { semRolagem: true, foco: false });
        }
    }

    function alterarStatusPropostaRapido(arg) {
        const [id, status] = textoSeguro(arg).split(':');
        if (!id || !status) {
            mostrarToast('Acao de status invalida.', 'erro');
            return;
        }
        atualizarStatusProposta(id, status);
    }

    function alterarStatusPropostaAtual(status) {
        const id = obterIdPropostaEmEdicao();
        if (!id) {
            mostrarToast('Abra uma proposta para alterar o status.', 'info');
            return;
        }
        atualizarStatusProposta(id, status, { voltarLista: false });
    }

    function duplicarProposta(id) {
        const base = localizarProposta(id);
        if (!base) {
            mostrarToast('Proposta nao encontrada para duplicar.', 'erro');
            return;
        }

        const agoraIso = obterAgoraIso();
        const novaId = Date.now() + Math.floor(Math.random() * 500);
        const novoCodigo = gerarCodigoProposta();
        const copia = normalizarProposta({
            ...base,
            id: novaId,
            codigo: novoCodigo,
            codigoBase: novoCodigo,
            revisao: 1,
            numeroRevisao: 1,
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
            propostaOrigemId: '',
            historicoRevisoes: [],
            motivoRevisao: '',
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

    function criarNovaRevisaoProposta(id) {
        const base = localizarProposta(id);
        if (!base) {
            mostrarToast('Proposta nao encontrada para revisar.', 'erro');
            return;
        }

        const agoraIso = obterAgoraIso();
        const codigoBase = obterCodigoBaseProposta(base) || base.codigo || gerarCodigoProposta();
        const novaRevisao = obterProximaRevisaoProposta(codigoBase);
        const novaId = Date.now() + Math.floor(Math.random() * 500);
        const historicoBase = Array.isArray(base.historicoRevisoes) ? base.historicoRevisoes.slice() : [];
        const registroBase = {
            id: base.id,
            codigo: formatarCodigoRevisaoProposta(base),
            revisao: normalizarNumeroRevisaoProposta(base.revisao, 1),
            status: base.status,
            data: agoraIso,
            usuario: obterUsuarioAtualNomeOuEmail()
        };
        const historicoRevisoes = historicoBase.some((item) => String(item.id) === String(base.id))
            ? historicoBase
            : [...historicoBase, registroBase];

        const revisao = normalizarProposta({
            ...base,
            id: novaId,
            codigo: codigoBase,
            codigoBase,
            revisao: novaRevisao,
            numeroRevisao: novaRevisao,
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
            propostaOrigemId: String(base.id),
            historicoRevisoes,
            motivoRevisao: `Revisao criada a partir de ${formatarCodigoRevisaoProposta(base)}`
        });

        propostas = [...obterPropostasBase(), revisao];
        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        if (typeof registrarLog === 'function') {
            registrarLog('proposta', 'revisao', `Nova revisao criada: ${formatarCodigoRevisaoProposta(revisao)} a partir de ${formatarCodigoRevisaoProposta(base)}.`);
        }
        mostrarToast(`${formatarCodigoRevisaoProposta(revisao)} criada para revisão.`);
        preencherFormularioComProposta(revisao);
        mostrarSubAbaPropostas('formulario', { semRolagem: true, foco: false });
        mostrarSecaoFormularioProposta('itens', { semRolagem: false, foco: false });
    }

    function duplicarPropostaAtual() {
        const id = obterIdPropostaEmEdicao();
        if (!id) {
            mostrarToast('Abra uma proposta para duplicar.', 'info');
            return;
        }
        duplicarProposta(id);
    }

    function criarNovaRevisaoPropostaAtual() {
        const id = obterIdPropostaEmEdicao();
        if (!id) {
            mostrarToast('Abra uma proposta para criar uma nova revisão.', 'info');
            return;
        }
        criarNovaRevisaoProposta(id);
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

    function obterDisponivelPecaProposta(peca) {
        if (!peca) return 0;
        if (typeof obterDisponivelPecaLocacao === 'function') {
            return obterDisponivelPecaLocacao(peca);
        }
        const normalizada = typeof normalizarPecaDominio === 'function' ? normalizarPecaDominio(peca) : peca;
        return Math.max(parseInt(normalizada?.disponivel, 10) || 0, 0);
    }

    function itemPropostaDispensaReservaEstoque(item) {
        const idCategoria = normalizarIdCategoriaOrcamento(
            item?.categoriaId || item?.categoria || item?.categoriaNome || CATEGORIA_ITEM_PROPOSTA_PADRAO
        );
        return CATEGORIAS_SEM_RESERVA_ESTOQUE_PROPOSTA.has(idCategoria);
    }

    function avaliarConversaoEstoqueProposta(proposta) {
        if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);

        const bloqueios = [];
        const avisos = [];

        (Array.isArray(proposta?.itens) ? proposta.itens : []).forEach((item) => {
            const calculado = calcularItemProposta(item || {});
            const quantidade = Math.max(1, Math.trunc(numeroNaoNegativo(calculado.quantidade, 1)));
            const descricao = textoSeguro(calculado.descricao || item?.descricao, 'Item sem descrição');
            const peca = encontrarPecaPorDescricao(calculado);

            if (!peca) {
                if (!itemPropostaDispensaReservaEstoque(item)) {
                    avisos.push(`${descricao}: sem vínculo claro com item do estoque.`);
                }
                return;
            }

            const disponivel = obterDisponivelPecaProposta(peca);
            if (quantidade > disponivel) {
                bloqueios.push(`${descricao}: pedido ${quantidade}, disponível ${disponivel}.`);
            }
        });

        return { bloqueios, avisos };
    }

    function confirmarConversaoComAvisosEstoque(proposta, callback) {
        const analise = avaliarConversaoEstoqueProposta(proposta);

        if (analise.bloqueios.length) {
            mostrarToast(`Estoque insuficiente: ${analise.bloqueios[0]}`, 'erro');
            return;
        }

        if (!analise.avisos.length) {
            callback();
            return;
        }

        const mensagem = [
            'Alguns itens não foram vinculados automaticamente ao estoque:',
            ...analise.avisos.slice(0, 5),
            analise.avisos.length > 5 ? `+ ${analise.avisos.length - 5} item(ns)` : '',
            'Deseja converter mesmo assim?'
        ].filter(Boolean).join('\n');

        if (typeof confirmarAcao === 'function') {
            confirmarAcao(mensagem, callback, {
                titulo: 'Itens sem vínculo de estoque',
                textoConfirmar: 'Converter mesmo assim',
                classeConfirmar: 'btn-warning'
            });
            return;
        }

        if (confirm(mensagem)) callback();
    }

    function executarConversaoPropostaLocacao(proposta) {
        const cliente = encontrarOuCriarClienteDaProposta(proposta);
        const hojeIso = obterHojeIso();
        const dataMontagem = proposta.evento.dataMontagem || proposta.evento.dataEvento || hojeIso;
        const dataDesmontagem = proposta.evento.dataDesmontagem || proposta.evento.dataEvento || dataMontagem;
        const valorFinalComercial = obterValorFinalComercial(proposta);
        const financeiroProposta = proposta.financeiro && typeof proposta.financeiro === 'object'
            ? proposta.financeiro
            : {};
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
        const valorEntradaLocacao = numeroNaoNegativo(financeiroProposta.valorEntrada, 0);
        const valorRestanteLocacao = numeroNaoNegativo(
            financeiroProposta.valorSaldo,
            Math.max(valorFinalComercial - valorEntradaLocacao, 0)
        );
        const statusPagamentoLocacao = valorFinalComercial > 0 && valorRestanteLocacao <= 0
            ? 'pago'
            : valorEntradaLocacao > 0
                ? 'parcial'
                : 'pendente';
        const tipoCalculoNFLocacao = normalizarTipoCalculoNF(financeiroProposta.tipoCalculoNF, 'descontar');
        const percentualNFLocacao = converterTextoPercentualParaNumero(financeiroProposta.percentualNF, 0, { maximo: 99.99 });
        const valorNFLocacao = numeroNaoNegativo(financeiroProposta.valorNF, 0);
        const valorFinalComNFLocacao = numeroNaoNegativo(financeiroProposta.valorFinalComNF, valorFinalComercial);
        const valorLiquidoPrevistoLocacao = numeroNaoNegativo(financeiroProposta.valorLiquidoPrevisto, valorFinalComercial);

        const itensLocacao = proposta.itens.map((item) => {
            const itemCalculado = calcularItemProposta(item || {});
            const peca = encontrarPecaPorDescricao(itemCalculado);
            const periodoDias = numeroNaoNegativo(itemCalculado.periodoDias ?? itemCalculado.periodo, 1) || 1;
            const quantidade = Math.max(1, Math.trunc(numeroNaoNegativo(itemCalculado.quantidade, 1)));
            const custoUnitario = numeroNaoNegativo(itemCalculado.custoUnitario ?? itemCalculado.valorUnitario, 0);
            const valorTotalComercial = numeroNaoNegativo(
                itemCalculado.valorTotal,
                arredondarMoeda(periodoDias * quantidade * custoUnitario)
            );
            const valorUnitarioComercial = quantidade > 0 && periodoDias > 0
                ? arredondarMoeda(valorTotalComercial / quantidade / periodoDias)
                : custoUnitario;
            return {
                pecaId: peca?.id || '',
                nome: itemCalculado.descricao || item.descricao,
                quantidade,
                valor: valorUnitarioComercial,
                periodoDias,
                categoria: itemCalculado.categoria || item.categoria || '',
                categoriaId: itemCalculado.categoriaId || item.categoriaId || '',
                observacoes: itemCalculado.observacoes || item.observacoes || item.obs || '',
                custoUnitarioProposta: custoUnitario,
                valorTotalProposta: valorTotalComercial
            };
        });
        const resumoChecklistPendente = itensLocacao.reduce((acc, item) => {
            acc.totalItens += Math.max(1, Number(item.quantidade) || 1);
            acc.totalLinhas += 1;
            return acc;
        }, {
            totalItens: 0,
            totalLinhas: 0,
            conferidos: 0,
            pendentes: 0,
            faltando: 0,
            avarias: 0,
            percentual: 0
        });
        resumoChecklistPendente.pendentes = resumoChecklistPendente.totalLinhas;

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
                vencimento: financeiroProposta.vencimentoSaldo || proposta.evento.dataEvento || dataMontagem,
                formaPagamento: rotuloFormaPagamento(financeiroProposta.formaPagamento),
                statusPagamento: statusPagamentoLocacao,
                notaFiscal: textoSeguro(financeiroProposta.notaFiscal, ''),
                statusNotaFiscal: textoSeguro(financeiroProposta.statusNotaFiscal || financeiroProposta.notaFiscal, 'pendente'),
                comprovante: '',
                condicaoPagamento: financeiroProposta.condicaoPagamento || '',
                observacaoPagamento: financeiroProposta.observacaoPagamento || '',
                percentualEntrada: converterTextoPercentualParaNumero(financeiroProposta.percentualEntrada, 50, { maximo: 100 }),
                percentualSaldo: converterTextoPercentualParaNumero(financeiroProposta.percentualSaldo, 50, { maximo: 100 }),
                percentualNF: percentualNFLocacao,
                tipoCalculoNF: tipoCalculoNFLocacao,
                valorNF: valorNFLocacao,
                valorFinalComNF: valorFinalComNFLocacao,
                valorLiquidoPrevisto: valorLiquidoPrevistoLocacao,
                origemPropostaId: String(proposta.id || ''),
                codigoProposta: proposta.codigo || ''
            },
            checklist: {
                idChecklist: null,
                locacaoId: String(novaLocacaoId),
                status: resumoChecklistPendente.totalLinhas > 0 ? 'pendente' : 'nao_iniciado',
                origem: 'proposta_convertida',
                resumo: resumoChecklistPendente,
                ultimaAtualizacao: typeof obterAgoraIso === 'function' ? obterAgoraIso() : new Date().toISOString(),
                observacoes: 'Checklist pendente gerado a partir da conversao da proposta.'
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
        if (typeof sincronizarFinanceiroLocacao === 'function') {
            novaLocacao = sincronizarFinanceiroLocacao(novaLocacao) || novaLocacao;
        }

        if (!Array.isArray(locacoes)) locacoes = [];
        locacoes.push(novaLocacao);
        if (typeof registrarMovimentacaoEstoque === 'function') {
            const propostaIdMov = String(proposta.id || proposta.codigo || '');
            itensLocacao.forEach((item) => {
                const quantidadeMov = Math.max(0, Math.trunc(numeroNaoNegativo(item.quantidade, 0)));
                const pecaIdMov = String(item.pecaId || '');
                if (!pecaIdMov || quantidadeMov <= 0) return;

                registrarMovimentacaoEstoque({
                    id: `mov-${novaLocacaoId}-${propostaIdMov}-${pecaIdMov}-reserva`,
                    chaveIdempotencia: `reserva|proposta:${propostaIdMov}|locacao:${novaLocacaoId}|peca:${pecaIdMov}|q:${quantidadeMov}`,
                    tipoMovimentacao: 'reserva',
                    quantidade: quantidadeMov,
                    pecaId: pecaIdMov,
                    pecaNome: item.nome,
                    locacaoId: String(novaLocacaoId),
                    locacaoRef: String(proposta.codigo || ''),
                    origemEvento: `proposta:${propostaIdMov}`,
                    observacao: `Reserva gerada na conversao da proposta ${proposta.codigo || propostaIdMov}.`
                });
            });
        }
        const deveCriarTransporte = typeof criarTransporteDaLocacao === 'function' && (custoFrete > 0 || enderecoEvento || cidadeEvento);
        if (deveCriarTransporte) {
            const criarRetiradaAutomatica = Boolean(dataDesmontagem && dataDesmontagem !== dataMontagem);
            const dividirFreteEntreRotas = criarRetiradaAutomatica && freteKm.calculoAtivo && freteKm.trechos > 1;
            const trechosEntrega = dividirFreteEntreRotas ? Math.max(freteKm.trechos - 1, 1) : freteKm.trechos;
            const custoEntrega = dividirFreteEntreRotas
                ? arredondarMoeda(freteKm.distanciaKm * freteKm.valorKm * trechosEntrega)
                : custoFrete;
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
                trechos: trechosEntrega,
                custoEstimado: custoEntrega,
                observacoes: observacoesLogistica,
                evitarDuplicado: true
            });
            if (criarRetiradaAutomatica) {
                const custoRetirada = dividirFreteEntreRotas
                    ? arredondarMoeda(freteKm.distanciaKm * freteKm.valorKm)
                    : 0;
                const observacoesRetirada = [
                    'Retirada criada automaticamente pela conversao da proposta.',
                    observacoesLogistica,
                    custoRetirada <= 0 && custoFrete > 0 ? 'Custo de frete consolidado na entrega.' : ''
                ].filter(Boolean).join(' ');
                criarTransporteDaLocacao(novaLocacao, {
                    tipoOperacao: 'retirada',
                    dataSaida: dataDesmontagem,
                    horaSaida: proposta.evento.horaDesmontagem || proposta.evento.horaFimEvento || '',
                    dataChegada: dataDesmontagem,
                    horaChegada: proposta.evento.horaDesmontagem || '',
                    endereco: enderecoEvento,
                    cidade: cidadeEvento,
                    distanciaKm: freteKm.distanciaKm,
                    valorKm: freteKm.valorKm,
                    trechos: custoRetirada > 0 ? 1 : freteKm.trechos,
                    custoEstimado: custoRetirada,
                    observacoes: observacoesRetirada,
                    evitarDuplicado: true
                });
            }
        }
        if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);

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
        if (!validarPropostaProntaParaUso(proposta, {
            modo: 'conversao',
            focar: String(obterIdPropostaEmEdicao()) === String(id)
        })) {
            return;
        }

        const jaConvertida = textoSeguro(proposta.locacaoVinculadaId || proposta.locacaoId, '');
        if (jaConvertida) {
            const confirmarNovaConversao = () => confirmarConversaoComAvisosEstoque(proposta, () => executarConversaoPropostaLocacao(proposta));
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

        confirmarConversaoComAvisosEstoque(proposta, () => executarConversaoPropostaLocacao(proposta));
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
            <tr class="pdf-summary-row${destaque ? ' pdf-summary-row-highlight' : ''}">
                <td style="padding:6px 0; border-bottom:1px solid #e5e7eb; color:#475569; ${destaque ? 'font-weight:800; color:#0f172a;' : ''}">${rotulo}</td>
                <td style="padding:6px 0 6px 10px; border-bottom:1px solid #e5e7eb; text-align:right; white-space:nowrap; color:#0f172a; ${destaque ? 'font-weight:900; font-size:15px;' : 'font-weight:700;'}">${valor}</td>
            </tr>
        `;
    }

    function montarDadoCompactoPdf(rotulo, valor) {
        const texto = textoSeguro(valor, '');
        if (!texto) return '';
        return `
            <div class="proposal-info-line">
                <span>${sanitizar(rotulo)}</span>
                <strong>${sanitizar(texto)}</strong>
            </div>
        `;
    }

    function montarObservacaoPdf(rotulo, valor) {
        const texto = textoSeguro(valor, '');
        if (!texto) return '';
        return `
            <div class="proposal-note-box">
                <strong>${sanitizar(rotulo)}</strong>
                <p>${sanitizar(texto)}</p>
            </div>
        `;
    }

    function montarCabecalhoPropostaPdf(p) {
        const logoPdfSrc = (config && config.logo) ? config.logo : './logo.png';
        const rodape = textoSeguro(config?.rodape, 'MTZ Eventos e Marketing Promocional');
        const telefone = textoSeguro(config?.tel, '');
        const email = textoSeguro(config?.email, '');
        const dadosContato = [telefone, email].filter(Boolean).join(' | ');
        const validadeData = formatarData(p.financeiro.validadePropostaData);
        const validadeLabel = validadeData !== '-'
            ? validadeData
            : `${numeroNaoNegativo(p.financeiro.validadeDias, 7)} dias`;

        return `
            <header class="proposal-pdf-header">
                <div class="proposal-brand">
                    <img src="${logoPdfSrc}" alt="MTZ Eventos">
                    <div>
                        <h1>ORCAMENTO</h1>
                        <strong>${sanitizar(rodape)}</strong>
                        <span>${sanitizar(dadosContato || 'Gestao e locacao para eventos')}</span>
                    </div>
                </div>
                <div class="proposal-meta">
                    <div><span>Nº</span><strong>${sanitizar(p.codigo || formatarCodigoRevisaoProposta(p))}</strong></div>
                    <div><span>Data</span><strong>${formatarData(p.dataCriacao || new Date())}</strong></div>
                    <div><span>Validade</span><strong>${validadeLabel}</strong></div>
                </div>
            </header>
        `;
    }

    function montarRodapePropostaPdf() {
        const rodape = textoSeguro(config?.rodape, 'MTZ Eventos');
        const telefone = textoSeguro(config?.tel, '');
        const email = textoSeguro(config?.email, '');
        const contato = [telefone, email].filter(Boolean).join(' | ');

        return `
            <footer class="proposal-pdf-footer">
                <span>${sanitizar([rodape, contato].filter(Boolean).join(' | '))}</span>
                <span>Proposta sujeita a disponibilidade dos itens na data de aprovacao.</span>
            </footer>
        `;
    }

    function montarLinhasItensPdfPorCategoria(itens = [], exibirInterno = false) {
        const grupos = agruparItensPropostaPorCategoria(itens);
        const totalColunas = exibirInterno ? 8 : 5;
        if (!grupos.length) {
            return `<tr><td colspan="${totalColunas}" style="padding:10px;">Sem itens</td></tr>`;
        }

        return grupos.map((grupo, indiceGrupo) => {
            const numeroGrupo = indiceGrupo + 1;
            const nomeCategoria = grupo.nome || rotuloCategoriaOrcamento(grupo.categoria);
            const linhas = grupo.itens.map((item, indiceItem) => {
                const descricao = [
                    `<strong>${numeroGrupo}.${indiceItem + 1} ${sanitizar(item.descricao || '-')}</strong>`,
                    item.medida ? `<small>Medida: ${sanitizar(item.medida)}</small>` : '',
                    item.observacoes ? `<small>Obs.: ${sanitizar(item.observacoes)}</small>` : ''
                ].filter(Boolean).join('');

                if (exibirInterno) {
                    return `
                        <tr class="pdf-item-row">
                            <td class="desc">${descricao}</td>
                            <td class="center">${numeroNaoNegativo(item.periodoDias, 1)}</td>
                            <td class="center">${item.quantidade}</td>
                            <td class="money">${formatarMoeda(item.custoUnitario)}</td>
                            <td class="money">${formatarMoeda(item.custoTotal)}</td>
                            <td class="money">${formatarMoeda(item.valorHonorarios + item.valorEncargos + item.valorINSS)}</td>
                            <td class="money total">${formatarMoeda(item.valorTotal)}</td>
                            <td class="center">${sanitizar(item.aplicarINSS || item.aplicarEncargos ? 'Sim' : '-')}</td>
                        </tr>
                    `;
                }

                const baseComercial = numeroNaoNegativo(item.periodoDias, 1) * numeroNaoNegativo(item.quantidade, 0);
                const valorUnitarioComercial = baseComercial > 0
                    ? item.valorTotal / baseComercial
                    : item.valorTotal;

                return `
                    <tr class="pdf-item-row">
                        <td class="center">${item.quantidade}</td>
                        <td class="desc">${descricao}</td>
                        <td class="center">${numeroNaoNegativo(item.periodoDias, 1)}</td>
                        <td class="money">${formatarMoeda(valorUnitarioComercial)}</td>
                        <td class="money total">${formatarMoeda(item.valorTotal)}</td>
                    </tr>
                `;
            }).join('');

            const subtotalGrupo = exibirInterno
                ? `
                    <tr class="pdf-category-subtotal">
                        <td colspan="6">Subtotal ${sanitizar(nomeCategoria)}</td>
                        <td class="money">${formatarMoeda(grupo.totalFinal)}</td>
                        <td></td>
                    </tr>
                `
                : `
                    <tr class="pdf-category-subtotal">
                        <td colspan="4">Subtotal ${sanitizar(nomeCategoria)}</td>
                        <td class="money">${formatarMoeda(grupo.totalFinal)}</td>
                    </tr>
                `;

            return `
                <tr class="pdf-category-head">
                    <td colspan="${totalColunas}">
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
                    <th class="desc">Descricao</th>
                    <th>Diarias</th>
                    <th>Qtd.</th>
                    <th class="money">Unitario</th>
                    <th class="money">Custo</th>
                    <th class="money">Encargos</th>
                    <th class="money">Total</th>
                    <th>Fiscal</th>
                </tr>
            `
            : `
                <tr>
                    <th>Qtd.</th>
                    <th class="desc">Descricao</th>
                    <th>Diarias</th>
                    <th class="money">Unitario</th>
                    <th class="money">Total</th>
                </tr>
            `;

        const freteResumo = numeroNaoNegativo(p.custos.frete, 0);
        const custosAdicionaisResumo = numeroNaoNegativo(p.financeiro.totalCustosAdicionais, 0);
        const custosAdicionaisSemFrete = arredondarMoeda(Math.max(custosAdicionaisResumo - freteResumo, 0));
        const custoTotalInterno = numeroNaoNegativo(p.controleInterno.custoTotalProposta, 0);

        const blocoResumoFinanceiro = `
            <table class="pdf-summary-table" style="width:100%; border-collapse:collapse; font-size:11px;">
                <tbody>
                    ${linhaResumoPdf('Subtotal', formatarMoeda(p.financeiro.subtotal))}
                    ${freteResumo > 0 && (numeroNaoNegativo(p.custos.freteDistanciaKm, 0) > 0 && numeroNaoNegativo(p.custos.freteValorKm, 0) > 0)
                        ? linhaResumoPdf(
                            `Frete (${numeroNaoNegativo(p.custos.freteTrechos, 1)} x ${numeroNaoNegativo(p.custos.freteDistanciaKm, 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km x ${formatarMoeda(p.custos.freteValorKm)}/km)`,
                            formatarMoeda(p.custos.frete)
                        )
                        : (freteResumo > 0 ? linhaResumoPdf('Frete', formatarMoeda(freteResumo)) : '')}
                    ${(custosAdicionaisSemFrete > 0 || exibirInterno) ? linhaResumoPdf('Custos adicionais (sem frete)', formatarMoeda(custosAdicionaisSemFrete)) : ''}
                    ${linhaResumoPdf('Desconto', formatarMoeda(p.financeiro.desconto))}
                    ${linhaResumoPdf('Acrescimo', formatarMoeda(p.financeiro.acrescimo))}
                    ${(tipoNF === 'acrescentar' || exibirInterno) ? linhaResumoPdf(`Percentual NF (${formatarPercentual(p.financeiro.percentualNF)})`, formatarMoeda(p.financeiro.valorNF)) : ''}
                    ${(tipoNF === 'acrescentar' || exibirInterno) ? linhaResumoPdf('Tipo calculo NF', sanitizar(rotuloTipoCalculoNF(tipoNF))) : ''}
                    ${linhaResumoPdf('Valor final da proposta', formatarMoeda(valorFinalComercial), true)}
                </tbody>
            </table>
        `;

        const blocoResumoInterno = exibirInterno ? `
            <div class="proposal-internal-summary">
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

        const nfCliente = tipoNF === 'acrescentar'
            ? `${formatarPercentual(p.financeiro.percentualNF)} (${formatarMoeda(p.financeiro.valorNF)})`
            : 'Nao cobrada por fora';
        const situacaoFiscal = textoSeguro(p.financeiro.statusNotaFiscal || p.financeiro.notaFiscal || '', 'Pendente / conforme solicitacao do cliente');
        const observacoesLocal = textoSeguro(p.evento.observacoesLocal || p.evento.observacoes || p.observacoesGerais, '');
        const condicoesComerciais = [
            montarDadoCompactoPdf('Forma de pagamento', rotuloFormaPagamento(p.financeiro.formaPagamento)),
            montarDadoCompactoPdf('Condicao', p.financeiro.condicaoPagamento),
            montarDadoCompactoPdf('Entrada', `${formatarPercentual(p.financeiro.percentualEntrada)} (${formatarMoeda(p.financeiro.valorEntrada)})`),
            montarDadoCompactoPdf('Saldo', `${formatarPercentual(p.financeiro.percentualSaldo)} (${formatarMoeda(p.financeiro.valorSaldo)})`),
            montarDadoCompactoPdf('Prazo de aprovacao', `${numeroNaoNegativo(p.financeiro.validadeDias, 7)} dias`),
            montarDadoCompactoPdf('Validade da proposta', formatarData(p.financeiro.validadePropostaData)),
            montarDadoCompactoPdf('Observacao de pagamento', p.financeiro.observacaoPagamento)
        ].filter(Boolean).join('');
        const controleFiscal = [
            montarDadoCompactoPdf('Situacao NF', situacaoFiscal),
            montarDadoCompactoPdf('Imposto/encargo', nfCliente),
            exibirInterno ? montarDadoCompactoPdf('Calculo NF', rotuloTipoCalculoNF(tipoNF)) : '',
            exibirInterno ? montarDadoCompactoPdf('Liquido previsto', formatarMoeda(p.financeiro.valorLiquidoPrevisto)) : ''
        ].filter(Boolean).join('');
        const observacoesEscopo = [
            montarObservacaoPdf('Incluso na proposta', p.escopo.inclusoProposta),
            montarObservacaoPdf('Nao incluso na proposta', p.escopo.naoInclusoProposta),
            montarObservacaoPdf('Observacoes comerciais', p.escopo.observacoesComerciais)
        ].filter(Boolean).join('');

        return `
            <style>
                @page { size: A4; margin: 10mm; }
                .proposal-pdf-document {
                    background:#ffffff;
                    color:#0f172a;
                    width:100%;
                    min-height:100%;
                    font-family: Arial, Helvetica, sans-serif;
                    line-height:1.32;
                }
                .proposal-pdf-sheet {
                    max-width: 794px;
                    margin:0 auto;
                    padding:18px 20px 16px;
                    background:#ffffff;
                }
                .proposal-pdf-header {
                    display:grid;
                    grid-template-columns:1fr 170px;
                    gap:14px;
                    align-items:start;
                    padding-bottom:12px;
                    border-bottom:2px solid #1f2937;
                    margin-bottom:12px;
                }
                .proposal-brand { display:flex; gap:12px; align-items:center; min-width:0; }
                .proposal-brand img {
                    width:96px;
                    max-height:58px;
                    object-fit:contain;
                    padding:4px;
                    border:1px solid #e5e7eb;
                    border-radius:8px;
                    background:#ffffff;
                }
                .proposal-brand h1 {
                    margin:0 0 2px;
                    font-size:21px;
                    letter-spacing:.06em;
                    color:#111827;
                }
                .proposal-brand strong { display:block; font-size:12px; color:#111827; }
                .proposal-brand span { display:block; margin-top:2px; font-size:10px; color:#64748b; }
                .proposal-meta {
                    border:1px solid #e2e8f0;
                    border-radius:9px;
                    overflow:hidden;
                    font-size:10px;
                }
                .proposal-meta div {
                    display:flex;
                    justify-content:space-between;
                    gap:8px;
                    padding:6px 8px;
                    border-bottom:1px solid #e2e8f0;
                }
                .proposal-meta div:last-child { border-bottom:0; }
                .proposal-meta span { color:#64748b; text-transform:uppercase; font-weight:700; }
                .proposal-meta strong { color:#111827; text-align:right; }
                .proposal-highlight {
                    display:grid;
                    grid-template-columns:1fr 1fr 160px;
                    gap:8px;
                    margin:10px 0 12px;
                }
                .proposal-highlight-card {
                    border:1px solid #dbe3ef;
                    border-radius:10px;
                    padding:9px 10px;
                    background:#f8fafc;
                    min-height:52px;
                }
                .proposal-highlight-card span {
                    display:block;
                    font-size:9px;
                    font-weight:800;
                    color:#64748b;
                    text-transform:uppercase;
                    letter-spacing:.04em;
                }
                .proposal-highlight-card strong {
                    display:block;
                    margin-top:3px;
                    font-size:13px;
                    color:#0f172a;
                }
                .proposal-highlight-card.total {
                    background:#111827;
                    border-color:#111827;
                    color:#ffffff;
                    text-align:right;
                }
                .proposal-highlight-card.total span,
                .proposal-highlight-card.total strong { color:#ffffff; }
                .proposal-highlight-card.total strong { font-size:17px; }
                .proposal-section-title {
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    margin:12px 0 7px;
                    padding-bottom:5px;
                    border-bottom:1px solid #e2e8f0;
                    font-size:12px;
                    font-weight:900;
                    color:#111827;
                    text-transform:uppercase;
                    letter-spacing:.03em;
                }
                .proposal-info-grid {
                    display:grid;
                    grid-template-columns:1fr 1fr;
                    gap:10px;
                }
                .proposal-info-box {
                    border:1px solid #dbe3ef;
                    border-radius:10px;
                    padding:10px;
                    background:#ffffff;
                }
                .proposal-info-box h3 {
                    margin:0 0 7px;
                    font-size:12px;
                    color:#111827;
                }
                .proposal-info-line {
                    display:grid;
                    grid-template-columns:112px 1fr;
                    gap:8px;
                    padding:4px 0;
                    font-size:10.5px;
                    border-bottom:1px solid #f1f5f9;
                }
                .proposal-info-line:last-child { border-bottom:0; }
                .proposal-info-line span { color:#64748b; font-weight:700; }
                .proposal-info-line strong { color:#111827; font-weight:700; overflow-wrap:anywhere; }
                .pdf-items-table {
                    width:100%;
                    border-collapse:collapse;
                    border:1px solid #dbe3ef;
                    font-size:10px;
                    table-layout:fixed;
                }
                .pdf-items-table thead { background:#111827; color:#ffffff; }
                .pdf-items-table th {
                    padding:7px 8px;
                    text-align:center;
                    color:#ffffff;
                    font-size:9px;
                    text-transform:uppercase;
                    letter-spacing:.04em;
                }
                .pdf-items-table th.desc { text-align:left; width:46%; }
                .pdf-items-table th.money { text-align:right; }
                .pdf-item-row td {
                    padding:7px 8px;
                    border-bottom:1px solid #e5e7eb;
                    vertical-align:top;
                    color:#0f172a;
                    overflow-wrap:anywhere;
                }
                .pdf-item-row td.center { text-align:center; width:56px; }
                .pdf-item-row td.money { text-align:right; white-space:nowrap; }
                .pdf-item-row td.total { font-weight:900; }
                .pdf-item-row td.desc strong { display:block; font-size:10.5px; color:#0f172a; }
                .pdf-item-row td.desc small { display:block; margin-top:2px; font-size:9px; color:#64748b; }
                .pdf-category-head td {
                    padding:6px 8px;
                    background:#eff6ff;
                    color:#1d4ed8;
                    border-top:1px solid #bfdbfe;
                    border-bottom:1px solid #bfdbfe;
                    font-weight:900;
                    font-size:10px;
                    text-transform:uppercase;
                }
                .pdf-category-subtotal td {
                    padding:6px 8px;
                    text-align:right;
                    background:#f8fafc;
                    border-bottom:1px solid #cbd5e1;
                    font-size:10px;
                    font-weight:900;
                    color:#0f172a;
                }
                .proposal-bottom-grid {
                    display:grid;
                    grid-template-columns:1.05fr .95fr;
                    gap:12px;
                    margin-top:12px;
                }
                .proposal-summary-box,
                .proposal-terms-box,
                .proposal-note-box,
                .proposal-internal-summary {
                    border:1px solid #dbe3ef;
                    border-radius:10px;
                    padding:10px;
                    background:#ffffff;
                }
                .proposal-summary-box h3,
                .proposal-terms-box h3 {
                    margin:0 0 6px;
                    font-size:12px;
                    color:#111827;
                }
                .proposal-note-box { margin-top:8px; font-size:10.5px; }
                .proposal-note-box strong { display:block; margin-bottom:4px; color:#111827; }
                .proposal-note-box p { margin:0; color:#475569; white-space:pre-wrap; }
                .proposal-signatures {
                    display:flex;
                    justify-content:space-between;
                    gap:30px;
                    margin-top:34px;
                    page-break-inside:avoid;
                }
                .proposal-signatures div {
                    width:44%;
                    text-align:center;
                    border-top:1px solid #111827;
                    padding-top:7px;
                    font-size:9.5px;
                    color:#334155;
                    font-weight:700;
                }
                .proposal-pdf-footer {
                    display:flex;
                    justify-content:space-between;
                    gap:12px;
                    margin-top:14px;
                    padding-top:8px;
                    border-top:1px solid #e2e8f0;
                    font-size:8.8px;
                    color:#64748b;
                }
                @media print {
                    .proposal-pdf-sheet { padding:0; max-width:none; }
                    .proposal-info-box,
                    .proposal-summary-box,
                    .proposal-terms-box,
                    .proposal-note-box { page-break-inside:avoid; }
                }
                @media (max-width: 720px) {
                    .proposal-pdf-header,
                    .proposal-highlight,
                    .proposal-info-grid,
                    .proposal-bottom-grid { grid-template-columns:1fr; }
                    .proposal-meta { max-width:none; }
                }
            </style>
            <div class="orcamento-pdf pdf-page proposal-pdf-document">
                <div class="proposal-pdf-sheet">
                    ${montarCabecalhoPropostaPdf(p)}

                    <div class="proposal-highlight">
                        <div class="proposal-highlight-card">
                            <span>Cliente</span>
                            <strong>${sanitizar(p.cliente.nome || '-')}</strong>
                        </div>
                        <div class="proposal-highlight-card">
                            <span>Evento</span>
                            <strong>${sanitizar(p.evento.nome || p.evento.local || '-')}</strong>
                        </div>
                        <div class="proposal-highlight-card total">
                            <span>Total geral</span>
                            <strong>${formatarMoeda(valorFinalComercial)}</strong>
                        </div>
                    </div>

                    <div class="proposal-info-grid">
                        <section class="proposal-info-box">
                            <h3>Dados do cliente</h3>
                            ${montarDadoCompactoPdf('Nome / empresa', p.cliente.nome || '-')}
                            ${montarDadoCompactoPdf('CPF / CNPJ', p.cliente.documento || '-')}
                            ${montarDadoCompactoPdf('Telefone', p.cliente.telefone || '-')}
                            ${montarDadoCompactoPdf('E-mail', p.cliente.email || '-')}
                            ${montarDadoCompactoPdf('Endereco', p.cliente.endereco || '-')}
                        </section>
                        <section class="proposal-info-box">
                            <h3>Dados do evento</h3>
                            ${montarDadoCompactoPdf('Nome do evento', p.evento.nome || '-')}
                            ${montarDadoCompactoPdf('Local', p.evento.local || '-')}
                            ${montarDadoCompactoPdf('Cidade / UF', [p.evento.cidadeEvento, p.evento.ufEvento].filter(Boolean).join('/') || '-')}
                            ${montarDadoCompactoPdf('Data do evento', `${formatarData(p.evento.dataEvento)} ${textoSeguro(p.evento.horaInicioEvento, '')}`)}
                            ${montarDadoCompactoPdf('Montagem', `${formatarData(p.evento.dataMontagem)} ${textoSeguro(p.evento.horaMontagem, '')}`)}
                            ${montarDadoCompactoPdf('Desmontagem', `${formatarData(p.evento.dataDesmontagem)} ${textoSeguro(p.evento.horaDesmontagem, '')}`)}
                            ${montarDadoCompactoPdf('Observacoes local', observacoesLocal)}
                        </section>
                    </div>

                    <div class="proposal-section-title">
                        <span>Itens do orcamento</span>
                    </div>
                    <table class="pdf-items-table">
                        <thead>${cabecalhoItens}</thead>
                        <tbody>${linhasItens}</tbody>
                    </table>

                    <div class="proposal-bottom-grid">
                        <section class="proposal-terms-box">
                            <h3>Condicoes comerciais</h3>
                            ${condicoesComerciais || '<div class="proposal-info-line"><span>Condicoes</span><strong>-</strong></div>'}
                            <h3 style="margin-top:12px;">Controle fiscal</h3>
                            ${controleFiscal || '<div class="proposal-info-line"><span>NF</span><strong>-</strong></div>'}
                        </section>
                        <section class="proposal-summary-box">
                            <h3>Resumo financeiro</h3>
                            ${blocoResumoFinanceiro}
                            ${blocoResumoInterno}
                        </section>
                    </div>

                    ${observacoesEscopo ? `
                        <div class="proposal-section-title">
                            <span>Observacoes importantes</span>
                        </div>
                        ${observacoesEscopo}
                    ` : ''}

                    <div style="margin-top:10px; font-size:10px; color:#475569;">
                        <b>Responsavel pela proposta:</b> ${sanitizar(p.responsavelProposta || '-')}
                    </div>

                    <div class="proposal-signatures">
                        <div>MTZ EVENTOS</div>
                        <div>CLIENTE</div>
                    </div>

                    ${montarRodapePropostaPdf()}
                </div>
            </div>
        `;
    }

    function gerarPDFProposta(id) {
        const proposta = localizarProposta(id);
        if (!proposta) {
            mostrarToast('Proposta nao encontrada para PDF.', 'erro');
            return;
        }
        if (!validarPropostaProntaParaUso(proposta, {
            modo: 'pdf',
            focar: String(obterIdPropostaEmEdicao()) === String(id)
        })) {
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
        if (!propostaTemp || !validarPropostaProntaParaUso(propostaTemp, { modo: 'pdf', focar: true })) {
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
            const propostaTemp = coletarDadosFormulario(false);
            if (!propostaTemp || !validarPropostaProntaParaUso(propostaTemp, { modo: 'pdf', focar: true })) {
                return;
            }
            abrirPreviewPDFProposta(propostaTemp, propostaTemp.financeiro.exibirInformacoesInternasPDF === true);
            return;
        }
        const propostaTemp = coletarDadosFormulario(false);
        if (!propostaTemp || !validarPropostaProntaParaUso(propostaTemp, { modo: 'pdf', focar: true })) {
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
                proposta.codigoExibicao,
                formatarCodigoRevisaoProposta(proposta),
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
            const revisao = normalizarNumeroRevisaoProposta(proposta.revisao, 1);
            const origem = localizarOrigemRevisaoProposta(proposta);
            const dataStatus = obterDataStatusProposta(proposta);
            const motivoStatus = obterMotivoStatusProposta(proposta);
            const statusAtual = normalizarStatusProposta(proposta.status);
            const podeEnviar = statusAtual === 'rascunho' || statusAtual === 'em_negociacao';
            const podeAprovar = !['aprovada', 'convertida', 'cancelada', 'recusada'].includes(statusAtual);
            const podeRecusar = !['convertida', 'cancelada', 'recusada'].includes(statusAtual);
            return `
                <tr data-proposta-id="${proposta.id}">
                    <td>
                        <div class="proposta-list-code">
                            <strong>${sanitizar(formatarCodigoRevisaoProposta(proposta))}</strong>
                            <span class="proposta-revision-mini-badge">Rev. ${revisao}</span>
                            ${origem ? `<small>Origem ${sanitizar(formatarCodigoRevisaoProposta(origem))}</small>` : ''}
                        </div>
                    </td>
                    <td>${sanitizar(proposta.cliente.nome || '-')}</td>
                    <td>${sanitizar(proposta.evento.nome || '-')}</td>
                    <td>${formatarData(proposta.evento.dataEvento)}</td>
                    <td>${formatarMoeda(obterValorFinalComercial(proposta))}</td>
                    <td>
                        <div class="proposta-status-cell">
                            <span class="badge ${statusBadge(proposta.status)}">${statusRotulo(proposta.status)}</span>
                            ${dataStatus ? `<small>${formatarData(dataStatus)}</small>` : ''}
                            ${motivoStatus ? `<em title="${sanitizar(motivoStatus)}">${sanitizar(motivoStatus)}</em>` : ''}
                            <div class="proposta-status-actions">
                                <button class="btn btn-sm btn-info table-action-btn" data-action="alterarStatusPropostaRapido" data-arg="${proposta.id}:enviada" title="Marcar como enviada" ${podeEnviar ? '' : 'disabled'}>
                                    <i class="bi bi-send"></i>
                                </button>
                                <button class="btn btn-sm btn-success table-action-btn" data-action="alterarStatusPropostaRapido" data-arg="${proposta.id}:aprovada" title="Marcar como aprovada" ${podeAprovar ? '' : 'disabled'}>
                                    <i class="bi bi-hand-thumbs-up"></i>
                                </button>
                                <button class="btn btn-sm btn-warning table-action-btn" data-action="alterarStatusPropostaRapido" data-arg="${proposta.id}:recusada" title="Marcar como recusada" ${podeRecusar ? '' : 'disabled'}>
                                    <i class="bi bi-hand-thumbs-down"></i>
                                </button>
                            </div>
                        </div>
                    </td>
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
                            <button class="btn btn-sm btn-secondary table-action-btn" data-action="criarNovaRevisaoProposta" data-arg="${proposta.id}" title="Nova revisao">
                                <i class="bi bi-layers"></i>
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
                const acao = () => {
                    sincronizarValidadePorDias();
                    recalcularResumoProposta();
                };
                if (typeof executarMantendoScroll === 'function') {
                    executarMantendoScroll(acao, campoDias);
                } else {
                    acao();
                }
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

        document.addEventListener('focusin', (event) => {
            const campoMoeda = event.target?.closest?.('#tab-propostas .input-money-br');
            if (!campoMoeda || campoMoeda !== event.target) return;
            campoMoeda.value = formatarMoedaParaEdicao(campoMoeda.value);
            if (campoMoeda.value && typeof campoMoeda.select === 'function') campoMoeda.select();
        });

        document.addEventListener('input', (event) => {
            const campoMoeda = event.target?.closest?.('#tab-propostas .input-money-br');
            if (!campoMoeda || campoMoeda !== event.target) return;
            const acao = () => {
                campoMoeda.value = limparTextoCampoMoedaProposta(campoMoeda.value);
                recalcularResumoProposta();
            };
            if (typeof executarMantendoScroll === 'function') {
                executarMantendoScroll(acao, campoMoeda);
            } else {
                acao();
            }
        });

        document.addEventListener('focusout', (event) => {
            const campoMoeda = event.target?.closest?.('#tab-propostas .input-money-br');
            if (!campoMoeda || campoMoeda !== event.target) return;
            formatarValorMonetarioEditavel(campoMoeda);
            recalcularResumoProposta();
        });

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

    window.converterTextoMoedaParaNumero = converterTextoMoedaParaNumero;
    window.formatarMoedaProposta = formatarMoeda;
    window.calcularResumoProposta = calcularResumoProposta;
    window.normalizarPadroesOrcamento = normalizarPadroesOrcamento;
    window.CATEGORIAS_ITEM_PROPOSTA = CATEGORIAS_ITEM_PROPOSTA;
    window.renderPropostas = renderPropostas;
    window.recalcularResumoProposta = recalcularResumoProposta;
    window.adicionarLinhaItemProposta = adicionarLinhaItemProposta;
    window.removerLinhaItemProposta = removerLinhaItemProposta;
    window.duplicarLinhaItemProposta = duplicarLinhaItemProposta;
    window.aplicarPadroesItensProposta = aplicarPadroesItensProposta;
    window.aplicarPadraoLinhaItemProposta = aplicarPadraoLinhaItemProposta;
    window.alternarDetalhesCalculoItemProposta = alternarDetalhesCalculoItemProposta;
    window.alternarTodosDetalhesItensProposta = alternarTodosDetalhesItensProposta;
    window.alternarCategoriasVaziasResumoProposta = alternarCategoriasVaziasResumoProposta;
    window.salvarProposta = salvarProposta;
    window.limparFormularioProposta = limparFormularioProposta;
    window.editarProposta = editarProposta;
    window.editarPropostaAtual = editarPropostaAtual;
    window.alterarStatusPropostaRapido = alterarStatusPropostaRapido;
    window.alterarStatusPropostaAtual = alterarStatusPropostaAtual;
    window.duplicarProposta = duplicarProposta;
    window.duplicarPropostaAtual = duplicarPropostaAtual;
    window.criarNovaRevisaoProposta = criarNovaRevisaoProposta;
    window.criarNovaRevisaoPropostaAtual = criarNovaRevisaoPropostaAtual;
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
    window.abrirEditorCategoriaConfigOrcamento = abrirEditorCategoriaConfigOrcamento;
    window.salvarEditorCategoriaConfigOrcamento = salvarEditorCategoriaConfigOrcamento;
    window.fecharEditorCategoriaConfigOrcamento = fecharEditorCategoriaConfigOrcamento;
    window.atualizarCamposEditorCategoriaConfig = atualizarCamposEditorCategoriaConfig;
    window.alternarCategoriaConfigOrcamento = alternarCategoriaConfigOrcamento;
    window.moverCategoriaConfigOrcamento = moverCategoriaConfigOrcamento;
    window.renderConfigOrcamentoProposta = renderConfigOrcamentoProposta;
    window.obterCategoriasOrcamento = obterCategoriasOrcamento;
    window.normalizarCategoriasOrcamentoConfig = normalizarCategoriasOrcamentoConfig;
})();
