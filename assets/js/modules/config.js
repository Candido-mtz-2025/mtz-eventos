// Configurações gerais
function normalizarEmailsPermitidos(texto) {
    return String(texto || '')
        .split(/[\n,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
        .join('\n');
}

function normalizarNumeroConfig(valor, fallback = 0) {
    const texto = String(valor ?? '').replace(',', '.').trim();
    const numero = Number(texto);
    return Number.isFinite(numero) && numero >= 0 ? numero : fallback;
}

function sanitizarConfigTexto(valor) {
    if (typeof sanitizarTexto === 'function') return sanitizarTexto(valor);
    const div = document.createElement('div');
    div.textContent = valor == null ? '' : String(valor);
    return div.innerHTML;
}

function obterPadroesOrcamentoConfig() {
    if (typeof normalizarPadroesOrcamento === 'function') {
        return normalizarPadroesOrcamento(config?.padroesOrcamento);
    }

    return {
        globais: {
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
        },
        categorias: {},
        categoriasOrcamento: []
    };
}

function preencherCampoConfig(id, valor, prop = 'value') {
    const el = document.getElementById(id);
    if (el) el[prop] = valor;
}

function obterCategoriasOrcamentoConfig(padroes) {
    if (typeof normalizarCategoriasOrcamentoConfig === 'function') {
        return normalizarCategoriasOrcamentoConfig(
            config?.categoriasOrcamento || padroes?.categoriasOrcamento,
            padroes?.categorias || {},
            padroes?.globais || {}
        );
    }

    const nomes = ['Estrutura', 'Mobiliário', 'Elétrica', 'Comunicação / Impressão', 'Alimentação', 'Mão de Obra', 'Logística', 'Outros'];
    return nomes.map((nome, indice) => ({
        id: nome,
        nome,
        ativa: true,
        ordem: indice + 1,
        cor: '',
        icone: '',
        ...(padroes?.categorias?.[nome] || {})
    }));
}

function renderConfigPadroesOrcamento() {
    const container = document.getElementById('confOrcCategorias');
    if (!container) return;

    const padroes = obterPadroesOrcamentoConfig();
    if (config && typeof config === 'object') {
        config.padroesOrcamento = padroes;
        if (Array.isArray(padroes.categoriasOrcamento)) {
            config.categoriasOrcamento = padroes.categoriasOrcamento;
        }
    }

    const globais = padroes.globais || {};
    preencherCampoConfig('confOrcHonorariosPadrao', globais.percentualHonorariosPadrao || '');
    preencherCampoConfig('confOrcEncargosPadrao', globais.percentualEncargosPadrao || '');
    preencherCampoConfig('confOrcINSSPadrao', globais.percentualINSSPadrao || '');
    preencherCampoConfig('confOrcEntradaPadrao', globais.percentualEntradaPadrao ?? 50);
    preencherCampoConfig('confOrcDescontoPadrao', globais.percentualDescontoPadrao || '');
    preencherCampoConfig('confOrcTipoEncargosPadrao', globais.tipoCalculoEncargosPadrao || 'simples');
    preencherCampoConfig('confOrcTipoINSSPadrao', globais.tipoCalculoINSSPadrao || 'simples');
    preencherCampoConfig('confOrcAplicarHonorarios', globais.aplicarHonorariosAutomaticamente !== false, 'checked');
    preencherCampoConfig('confOrcAplicarEncargos', globais.aplicarEncargosAutomaticamente !== false, 'checked');
    preencherCampoConfig('confOrcAplicarINSS', globais.aplicarINSSAutomaticamente !== false, 'checked');

    const categorias = obterCategoriasOrcamentoConfig(padroes);

    container.innerHTML = `
        <div class="config-budget-category-head">
            <span>Categoria</span>
            <span>Honorários</span>
            <span>Encargos</span>
            <span>INSS</span>
        </div>
        ${categorias.map((categoria) => {
            const id = categoria.id || categoria.nome || '';
            const regra = padroes.categorias?.[id] || padroes.categorias?.[categoria.nome] || categoria || {};
            const tipoEncargos = regra.tipoCalculoEncargos === 'por_dentro' ? 'por_dentro' : 'simples';
            const tipoINSS = regra.tipoCalculoINSS === 'por_dentro' ? 'por_dentro' : 'simples';
            const fixa = id === 'outros' || categoria.nome === 'Outros';
            return `
                <div class="config-budget-category-row" data-orc-categoria="${sanitizarConfigTexto(id)}" data-orc-categoria-nome="${sanitizarConfigTexto(categoria.nome || id)}">
                    <label class="config-budget-category-name">
                        <input type="checkbox" class="conf-orc-cat-ativa" ${regra.ativa !== false ? 'checked' : ''} ${fixa ? 'disabled' : ''}>
                        ${sanitizarConfigTexto(categoria.nome || id)}
                        ${regra.ativa === false ? '<small>inativa</small>' : ''}
                    </label>
                    <div class="config-budget-rule">
                        <label><input type="checkbox" class="conf-orc-cat-honorarios-check" ${regra.aplicarHonorarios !== false ? 'checked' : ''}> aplicar</label>
                        <input type="number" class="conf-orc-cat-honorarios-percent" min="0" step="0.01" value="${Number(regra.percentualHonorarios || 0)}">
                    </div>
                    <div class="config-budget-rule">
                        <label><input type="checkbox" class="conf-orc-cat-encargos-check" ${regra.aplicarEncargos !== false ? 'checked' : ''}> aplicar</label>
                        <input type="number" class="conf-orc-cat-encargos-percent" min="0" step="0.01" value="${Number(regra.percentualEncargos || 0)}">
                        <select class="conf-orc-cat-encargos-tipo">
                            <option value="simples"${tipoEncargos === 'simples' ? ' selected' : ''}>Simples</option>
                            <option value="por_dentro"${tipoEncargos === 'por_dentro' ? ' selected' : ''}>Por dentro</option>
                        </select>
                    </div>
                    <div class="config-budget-rule">
                        <label><input type="checkbox" class="conf-orc-cat-inss-check" ${regra.aplicarINSS === true ? 'checked' : ''}> aplicar</label>
                        <input type="number" class="conf-orc-cat-inss-percent" min="0" step="0.01" value="${Number(regra.percentualINSS || 0)}">
                        <select class="conf-orc-cat-inss-tipo">
                            <option value="simples"${tipoINSS === 'simples' ? ' selected' : ''}>Simples</option>
                            <option value="por_dentro"${tipoINSS === 'por_dentro' ? ' selected' : ''}>Por dentro</option>
                        </select>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

function coletarConfigPadroesOrcamento() {
    const globais = {
        percentualHonorariosPadrao: normalizarNumeroConfig(document.getElementById('confOrcHonorariosPadrao')?.value, 0),
        percentualEncargosPadrao: normalizarNumeroConfig(document.getElementById('confOrcEncargosPadrao')?.value, 0),
        percentualINSSPadrao: normalizarNumeroConfig(document.getElementById('confOrcINSSPadrao')?.value, 0),
        percentualEntradaPadrao: Math.min(100, normalizarNumeroConfig(document.getElementById('confOrcEntradaPadrao')?.value, 50)),
        percentualDescontoPadrao: Math.min(100, normalizarNumeroConfig(document.getElementById('confOrcDescontoPadrao')?.value, 0)),
        tipoCalculoEncargosPadrao: document.getElementById('confOrcTipoEncargosPadrao')?.value === 'por_dentro' ? 'por_dentro' : 'simples',
        tipoCalculoINSSPadrao: document.getElementById('confOrcTipoINSSPadrao')?.value === 'por_dentro' ? 'por_dentro' : 'simples',
        aplicarHonorariosAutomaticamente: document.getElementById('confOrcAplicarHonorarios')?.checked !== false,
        aplicarEncargosAutomaticamente: document.getElementById('confOrcAplicarEncargos')?.checked !== false,
        aplicarINSSAutomaticamente: document.getElementById('confOrcAplicarINSS')?.checked !== false
    };

    const categorias = {};
    const categoriasOrcamento = [];
    document.querySelectorAll('#confOrcCategorias [data-orc-categoria]').forEach((linha, indice) => {
        const categoria = linha.getAttribute('data-orc-categoria') || '';
        const nome = linha.getAttribute('data-orc-categoria-nome') || categoria;
        const fixa = categoria === 'outros' || nome === 'Outros';
        const regra = {
            id: categoria,
            nome,
            ativa: fixa ? true : linha.querySelector('.conf-orc-cat-ativa')?.checked !== false,
            ordem: indice + 1,
            aplicarHonorarios: linha.querySelector('.conf-orc-cat-honorarios-check')?.checked === true,
            percentualHonorarios: normalizarNumeroConfig(linha.querySelector('.conf-orc-cat-honorarios-percent')?.value, globais.percentualHonorariosPadrao),
            aplicarEncargos: linha.querySelector('.conf-orc-cat-encargos-check')?.checked === true,
            percentualEncargos: normalizarNumeroConfig(linha.querySelector('.conf-orc-cat-encargos-percent')?.value, globais.percentualEncargosPadrao),
            tipoCalculoEncargos: linha.querySelector('.conf-orc-cat-encargos-tipo')?.value === 'por_dentro' ? 'por_dentro' : 'simples',
            aplicarINSS: linha.querySelector('.conf-orc-cat-inss-check')?.checked === true,
            percentualINSS: normalizarNumeroConfig(linha.querySelector('.conf-orc-cat-inss-percent')?.value, globais.percentualINSSPadrao),
            tipoCalculoINSS: linha.querySelector('.conf-orc-cat-inss-tipo')?.value === 'por_dentro' ? 'por_dentro' : 'simples'
        };
        categorias[categoria] = regra;
        categoriasOrcamento.push(regra);
    });

    const padroes = { globais, categorias, categoriasOrcamento };
    return typeof normalizarPadroesOrcamento === 'function' ? normalizarPadroesOrcamento(padroes) : padroes;
}

function salvarConfig() {
    if (typeof validarPermissao === 'function' && !validarPermissao('configuracao', 'Somente administrador pode salvar configurações.')) {
        return;
    }

    const elRodape = document.getElementById('confRodape');
    const elTel = document.getElementById('confTel');
    const elEmail = document.getElementById('confEmail');
    const elEmailsPermitidos = document.getElementById('confEmailsPermitidos');
    const elAdminEmails = document.getElementById('confAdminEmails');

    if (elRodape) config.rodape = elRodape.value;
    if (elTel) config.tel = elTel.value;
    if (elEmail) config.email = elEmail.value;
    if (elEmailsPermitidos) {
        config.emailsPermitidos = normalizarEmailsPermitidos(elEmailsPermitidos.value);
        elEmailsPermitidos.value = config.emailsPermitidos;
    }
    if (elAdminEmails) {
        config.adminEmails = normalizarEmailsPermitidos(elAdminEmails.value);
        elAdminEmails.value = config.adminEmails;
    }

    salvarLocal();
    sincronizar('salvar');
    if (typeof aplicarValorKmFretePadraoProposta === 'function') aplicarValorKmFretePadraoProposta();
    if (typeof atualizarPerfilAcesso === 'function') atualizarPerfilAcesso();
    mostrarToast('Config salva!');
}

function converterLogo() {
    const input = document.getElementById('confLogo');
    if (!input?.files?.[0]) return;

    const reader = new FileReader();
    reader.onloadend = function() {
        config.logo = reader.result;
        const preview = document.getElementById('previewLogo');
        if (preview) preview.innerHTML = `<img src="${config.logo}" style="height:50px">`;
    };
    reader.readAsDataURL(input.files[0]);
}
