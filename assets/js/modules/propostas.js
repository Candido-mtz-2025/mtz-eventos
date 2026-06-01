// Propostas: cadastro, edicao, duplicacao, PDF e conversao em locacao
(function () {
    const CHAVE_FILTRO_PROPOSTAS = 'mtz:propostasFiltro';
    const FILTROS_PROPOSTA = new Set(['todos', 'rascunho', 'enviada', 'aprovada', 'cancelada', 'convertida']);

    let filtroPropostasAtual = 'todos';

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

    function normalizarTextoBusca(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function formatarMoeda(valor) {
        return (Number(valor) || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
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

    function gerarCodigoProposta(id) {
        const final = String(id || '').replace(/\D/g, '').slice(-6) || String(Date.now()).slice(-6);
        return `PRP-${final}`;
    }

    function parseNumeroInput(id) {
        return numeroNaoNegativo(document.getElementById(id)?.value, 0);
    }

    function obterStatusSelecionado() {
        const status = String(document.getElementById('propStatus')?.value || 'rascunho').trim().toLowerCase();
        return FILTROS_PROPOSTA.has(status) && status !== 'todos' ? status : 'rascunho';
    }

    function atualizarModoFormulario(texto) {
        const badge = document.getElementById('propostaModoLabel');
        if (!badge) return;
        badge.textContent = texto || 'Nova proposta';
    }

    function criarLinhaItemProposta(item = {}) {
        const descricao = sanitizar(item.descricao || '');
        const medida = sanitizar(item.medida || '');
        const quantidade = numeroNaoNegativo(item.quantidade, 1) || 1;
        const valorUnitario = numeroNaoNegativo(item.valorUnitario, 0);
        const observacoes = sanitizar(item.observacoes || '');

        return `
            <tr class="proposta-item-row">
                <td><input type="text" class="prop-item-descricao" value="${descricao}" placeholder="Descricao do item" data-input="recalcularResumoProposta"></td>
                <td><input type="text" class="prop-item-medida" value="${medida}" placeholder="Medida" data-input="recalcularResumoProposta"></td>
                <td><input type="number" class="prop-item-quantidade" value="${quantidade}" min="0" step="1" data-input="recalcularResumoProposta"></td>
                <td><input type="number" class="prop-item-unitario" value="${valorUnitario}" min="0" step="0.01" data-input="recalcularResumoProposta"></td>
                <td><input type="text" class="prop-item-total" value="${formatarMoeda(quantidade * valorUnitario)}" readonly></td>
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
            const quantidade = numeroNaoNegativo(linha.querySelector('.prop-item-quantidade')?.value, 0);
            const valorUnitario = numeroNaoNegativo(linha.querySelector('.prop-item-unitario')?.value, 0);
            const observacoes = textoSeguro(linha.querySelector('.prop-item-obs')?.value);
            const valorTotal = quantidade * valorUnitario;
            return { descricao, medida, quantidade, valorUnitario, valorTotal, observacoes };
        }).filter((item) => item.descricao && item.quantidade > 0);
    }

    function obterCustosFormulario() {
        return {
            frete: parseNumeroInput('propCustoFrete'),
            maoObra: parseNumeroInput('propCustoMaoObra'),
            operador: parseNumeroInput('propCustoOperador'),
            eletrica: parseNumeroInput('propCustoEletrica'),
            gerador: parseNumeroInput('propCustoGerador'),
            terceirizados: parseNumeroInput('propCustoTerceirizados'),
            outros: parseNumeroInput('propCustoOutros')
        };
    }

    function normalizarTipoCalculoNF(tipo, fallback = 'descontar') {
        const valor = String(tipo || fallback).trim().toLowerCase();
        return valor === 'acrescentar' ? 'acrescentar' : 'descontar';
    }

    function calcularResumoProposta({
        itens = [],
        custos = {},
        desconto = 0,
        acrescimo = 0,
        percentualNF = 0,
        tipoCalculoNF = 'descontar'
    } = {}) {
        const subtotalItens = (Array.isArray(itens) ? itens : []).reduce((acc, item) => {
            return acc + numeroNaoNegativo(item.valorTotal, 0);
        }, 0);
        const totalCustosAdicionais = Object.values(custos || {}).reduce((acc, valor) => acc + numeroNaoNegativo(valor, 0), 0);
        const descontoNormalizado = numeroNaoNegativo(desconto, 0);
        const acrescimoNormalizado = numeroNaoNegativo(acrescimo, 0);
        const valorBase = Math.max(
            subtotalItens + totalCustosAdicionais + acrescimoNormalizado - descontoNormalizado,
            0
        );
        const percentualNFNormalizado = numeroNaoNegativo(percentualNF, 0);
        const tipoNF = normalizarTipoCalculoNF(tipoCalculoNF, 'descontar');
        const valorNF = (valorBase * percentualNFNormalizado) / 100;
        const valorFinal = valorBase;
        const valorFinalComNF = tipoNF === 'acrescentar' ? valorBase + valorNF : valorBase;
        const valorLiquidoPrevisto = tipoNF === 'descontar' ? (valorBase - valorNF) : valorBase;

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
            valorLiquidoPrevisto
        };
    }

    function recalcularResumoProposta() {
        const linhas = Array.from(document.querySelectorAll('#propostaItensBody tr'));
        linhas.forEach((linha) => {
            const qtd = numeroNaoNegativo(linha.querySelector('.prop-item-quantidade')?.value, 0);
            const unit = numeroNaoNegativo(linha.querySelector('.prop-item-unitario')?.value, 0);
            const total = qtd * unit;
            const campoTotal = linha.querySelector('.prop-item-total');
            if (campoTotal) campoTotal.value = formatarMoeda(total);
        });

        const itens = coletarItensFormulario();
        const custos = obterCustosFormulario();
        const desconto = parseNumeroInput('propDesconto');
        const acrescimo = parseNumeroInput('propAcrescimo');
        const percentualNF = parseNumeroInput('propPercentualNF');
        const tipoCalculoNF = document.getElementById('propTipoCalculoNF')?.value || 'descontar';
        const resumo = calcularResumoProposta({
            itens,
            custos,
            desconto,
            acrescimo,
            percentualNF,
            tipoCalculoNF
        });

        const subtotalEl = document.getElementById('propSubtotal');
        const valorFinalEl = document.getElementById('propValorFinal');
        const valorNFEl = document.getElementById('propValorNF');
        const valorFinalComNFEl = document.getElementById('propValorFinalComNF');
        const valorLiquidoPrevistoEl = document.getElementById('propValorLiquidoPrevisto');
        if (subtotalEl) subtotalEl.value = formatarMoeda(resumo.subtotalItens);
        if (valorFinalEl) valorFinalEl.value = formatarMoeda(resumo.valorFinal);
        if (valorNFEl) valorNFEl.value = formatarMoeda(resumo.valorNF);
        if (valorFinalComNFEl) valorFinalComNFEl.value = formatarMoeda(resumo.valorFinalComNF);
        if (valorLiquidoPrevistoEl) valorLiquidoPrevistoEl.value = formatarMoeda(resumo.valorLiquidoPrevisto);
    }

    function normalizarProposta(propostaOriginal = {}) {
        const proposta = propostaOriginal && typeof propostaOriginal === 'object' ? propostaOriginal : {};
        const itens = Array.isArray(proposta.itens) ? proposta.itens : [];
        const custos = proposta.custos && typeof proposta.custos === 'object' ? proposta.custos : {};
        const financeiro = proposta.financeiro && typeof proposta.financeiro === 'object' ? proposta.financeiro : {};

        const itensNormalizados = itens.map((item) => {
            const quantidade = numeroNaoNegativo(item.quantidade, 0);
            const valorUnitario = numeroNaoNegativo(item.valorUnitario, 0);
            return {
                descricao: textoSeguro(item.descricao),
                medida: textoSeguro(item.medida),
                quantidade,
                valorUnitario,
                valorTotal: numeroNaoNegativo(item.valorTotal, quantidade * valorUnitario),
                observacoes: textoSeguro(item.observacoes)
            };
        });

        const custosNormalizados = {
            frete: numeroNaoNegativo(custos.frete, 0),
            maoObra: numeroNaoNegativo(custos.maoObra, 0),
            operador: numeroNaoNegativo(custos.operador, 0),
            eletrica: numeroNaoNegativo(custos.eletrica, 0),
            gerador: numeroNaoNegativo(custos.gerador, 0),
            terceirizados: numeroNaoNegativo(custos.terceirizados, 0),
            outros: numeroNaoNegativo(custos.outros, 0)
        };

        const resumo = calcularResumoProposta({
            itens: itensNormalizados,
            custos: custosNormalizados,
            desconto: numeroNaoNegativo(financeiro.desconto, 0),
            acrescimo: numeroNaoNegativo(financeiro.acrescimo, 0),
            percentualNF: numeroNaoNegativo(financeiro.percentualNF, 0),
            tipoCalculoNF: normalizarTipoCalculoNF(financeiro.tipoCalculoNF, 'descontar')
        });

        const id = proposta.id || Date.now();
        const status = String(proposta.status || 'rascunho').trim().toLowerCase();
        const statusNormalizado = FILTROS_PROPOSTA.has(status) && status !== 'todos' ? status : 'rascunho';

        return {
            id,
            codigo: textoSeguro(proposta.codigo, gerarCodigoProposta(id)),
            cliente: {
                nome: textoSeguro(proposta?.cliente?.nome),
                documento: textoSeguro(proposta?.cliente?.documento),
                telefone: textoSeguro(proposta?.cliente?.telefone),
                email: textoSeguro(proposta?.cliente?.email),
                endereco: textoSeguro(proposta?.cliente?.endereco)
            },
            evento: {
                nome: textoSeguro(proposta?.evento?.nome),
                local: textoSeguro(proposta?.evento?.local),
                cidade: textoSeguro(proposta?.evento?.cidade),
                dataMontagem: textoSeguro(proposta?.evento?.dataMontagem),
                dataEvento: textoSeguro(proposta?.evento?.dataEvento),
                dataDesmontagem: textoSeguro(proposta?.evento?.dataDesmontagem),
                observacoesGerais: textoSeguro(proposta?.evento?.observacoesGerais)
            },
            itens: itensNormalizados,
            custos: custosNormalizados,
            financeiro: {
                subtotal: resumo.subtotalItens,
                totalCustosAdicionais: resumo.totalCustosAdicionais,
                desconto: resumo.desconto,
                acrescimo: resumo.acrescimo,
                percentualNF: resumo.percentualNF,
                tipoCalculoNF: resumo.tipoCalculoNF,
                valorNF: resumo.valorNF,
                valorFinal: resumo.valorFinal,
                valorFinalComNF: resumo.valorFinalComNF,
                valorLiquidoPrevisto: resumo.valorLiquidoPrevisto,
                exibirCustosInternosPdf: financeiro.exibirCustosInternosPdf === true,
                condicaoPagamento: textoSeguro(financeiro.condicaoPagamento)
            },
            status: statusNormalizado,
            locacaoId: proposta.locacaoId ? String(proposta.locacaoId) : '',
            criadoEm: textoSeguro(proposta.criadoEm, new Date().toISOString()),
            atualizadoEm: textoSeguro(proposta.atualizadoEm, new Date().toISOString())
        };
    }

    function obterPropostasBase() {
        if (!Array.isArray(propostas)) propostas = [];
        return propostas.map((proposta) => normalizarProposta(proposta));
    }

    function obterIdPropostaEmEdicao() {
        return String(document.getElementById('propostaIdAtual')?.value || '').trim();
    }

    function coletarDadosFormulario(validar = true) {
        const idAtual = obterIdPropostaEmEdicao();
        const itens = coletarItensFormulario();
        const custos = obterCustosFormulario();
        const desconto = parseNumeroInput('propDesconto');
        const acrescimo = parseNumeroInput('propAcrescimo');
        const percentualNF = parseNumeroInput('propPercentualNF');
        const tipoCalculoNF = normalizarTipoCalculoNF(document.getElementById('propTipoCalculoNF')?.value, 'descontar');
        const exibirCustosInternosPdf = document.getElementById('propExibirCustosInternosPdf')?.checked === true;
        const resumo = calcularResumoProposta({
            itens,
            custos,
            desconto,
            acrescimo,
            percentualNF,
            tipoCalculoNF
        });

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
                cidade: textoSeguro(document.getElementById('propEventoCidade')?.value),
                dataMontagem: textoSeguro(document.getElementById('propDataMontagem')?.value),
                dataEvento: textoSeguro(document.getElementById('propDataEvento')?.value),
                dataDesmontagem: textoSeguro(document.getElementById('propDataDesmontagem')?.value),
                observacoesGerais: textoSeguro(document.getElementById('propEventoObs')?.value)
            },
            itens,
            custos,
            financeiro: {
                subtotal: resumo.subtotalItens,
                totalCustosAdicionais: resumo.totalCustosAdicionais,
                desconto: resumo.desconto,
                acrescimo: resumo.acrescimo,
                percentualNF: resumo.percentualNF,
                tipoCalculoNF: resumo.tipoCalculoNF,
                valorNF: resumo.valorNF,
                valorFinal: resumo.valorFinal,
                valorFinalComNF: resumo.valorFinalComNF,
                valorLiquidoPrevisto: resumo.valorLiquidoPrevisto,
                exibirCustosInternosPdf,
                condicaoPagamento: textoSeguro(document.getElementById('propCondicaoPagamento')?.value)
            },
            status: obterStatusSelecionado(),
            locacaoId: '',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
        };

        if (!proposta.codigo) proposta.codigo = gerarCodigoProposta(proposta.id);

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
        const mapaCampos = {
            propostaIdAtual: p.id,
            propCodigo: p.codigo,
            propClienteNome: p.cliente.nome,
            propClienteDocumento: p.cliente.documento,
            propClienteTelefone: p.cliente.telefone,
            propClienteEmail: p.cliente.email,
            propClienteEndereco: p.cliente.endereco,
            propEventoNome: p.evento.nome,
            propEventoLocal: p.evento.local,
            propEventoCidade: p.evento.cidade,
            propDataMontagem: p.evento.dataMontagem,
            propDataEvento: p.evento.dataEvento,
            propDataDesmontagem: p.evento.dataDesmontagem,
            propEventoObs: p.evento.observacoesGerais,
            propStatus: p.status,
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
            propCondicaoPagamento: p.financeiro.condicaoPagamento
        };

        Object.entries(mapaCampos).forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.value = valor ?? '';
        });

        const exibirCustosInternosPdfEl = document.getElementById('propExibirCustosInternosPdf');
        if (exibirCustosInternosPdfEl) exibirCustosInternosPdfEl.checked = p.financeiro.exibirCustosInternosPdf === true;

        renderLinhasItensProposta(p.itens);
        atualizarModoFormulario(`Editando ${p.codigo}`);
    }

    function limparFormularioProposta() {
        const campos = [
            'propostaIdAtual', 'propCodigo',
            'propClienteNome', 'propClienteDocumento', 'propClienteTelefone', 'propClienteEmail', 'propClienteEndereco',
            'propEventoNome', 'propEventoLocal', 'propEventoCidade', 'propDataMontagem', 'propDataEvento', 'propDataDesmontagem', 'propEventoObs',
            'propCustoFrete', 'propCustoMaoObra', 'propCustoOperador', 'propCustoEletrica', 'propCustoGerador', 'propCustoTerceirizados', 'propCustoOutros',
            'propDesconto', 'propAcrescimo', 'propPercentualNF', 'propCondicaoPagamento'
        ];
        campos.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const status = document.getElementById('propStatus');
        if (status) status.value = 'rascunho';
        const percentualNF = document.getElementById('propPercentualNF');
        if (percentualNF) percentualNF.value = 0;
        const tipoCalculoNF = document.getElementById('propTipoCalculoNF');
        if (tipoCalculoNF) tipoCalculoNF.value = 'descontar';
        const exibirCustosInternosPdfEl = document.getElementById('propExibirCustosInternosPdf');
        if (exibirCustosInternosPdfEl) exibirCustosInternosPdfEl.checked = false;
        renderLinhasItensProposta([{}]);
        atualizarModoFormulario('Nova proposta');
        const primeiroCampo = document.getElementById('propClienteNome');
        if (primeiroCampo) primeiroCampo.focus();
    }

    function salvarProposta() {
        const proposta = coletarDadosFormulario(true);
        if (!proposta) return;

        const lista = Array.isArray(propostas) ? propostas : [];
        const indice = lista.findIndex((item) => String(item.id) === String(proposta.id));
        const agoraIso = new Date().toISOString();

        if (indice >= 0) {
            proposta.criadoEm = lista[indice].criadoEm || proposta.criadoEm || agoraIso;
            proposta.locacaoId = lista[indice].locacaoId || proposta.locacaoId || '';
            proposta.atualizadoEm = agoraIso;
            lista[indice] = proposta;
        } else {
            proposta.criadoEm = agoraIso;
            proposta.atualizadoEm = agoraIso;
            lista.push(proposta);
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

    function localizarProposta(id) {
        return obterPropostasBase().find((item) => String(item.id) === String(id)) || null;
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

        const novaId = Date.now();
        const copia = normalizarProposta({
            ...base,
            id: novaId,
            codigo: gerarCodigoProposta(novaId),
            status: 'rascunho',
            locacaoId: '',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
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
            if (String(obterIdPropostaEmEdicao()) === String(id)) {
                limparFormularioProposta();
            }
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

    function statusBadge(status) {
        const chave = String(status || '').toLowerCase();
        if (chave === 'aprovada' || chave === 'convertida') return 'badge-success';
        if (chave === 'cancelada') return 'badge-danger';
        if (chave === 'enviada') return 'badge-info';
        return 'badge-warning';
    }

    function statusRotulo(status) {
        const mapa = {
            rascunho: 'Rascunho',
            enviada: 'Enviada',
            aprovada: 'Aprovada',
            cancelada: 'Cancelada',
            convertida: 'Convertida'
        };
        return mapa[String(status || '').toLowerCase()] || 'Rascunho';
    }

    function obterValorFinalComercial(proposta) {
        const tipoCalculoNF = normalizarTipoCalculoNF(proposta?.financeiro?.tipoCalculoNF, 'descontar');
        if (tipoCalculoNF === 'acrescentar') {
            return numeroNaoNegativo(proposta?.financeiro?.valorFinalComNF, proposta?.financeiro?.valorFinal);
        }
        return numeroNaoNegativo(proposta?.financeiro?.valorFinal, 0);
    }

    function rotuloTipoCalculoNF(tipoCalculoNF) {
        return normalizarTipoCalculoNF(tipoCalculoNF, 'descontar') === 'acrescentar'
            ? 'Acrescentar ao valor final'
            : 'Descontar do valor final';
    }

    function encontrarOuCriarClienteDaProposta(proposta) {
        const documento = String(proposta?.cliente?.documento || '').replace(/\D+/g, '');
        const email = String(proposta?.cliente?.email || '').trim().toLowerCase();
        const nome = String(proposta?.cliente?.nome || '').trim().toLowerCase();

        let cliente = (Array.isArray(locadores) ? locadores : []).find((item) => {
            const itemDocumento = String(item?.documento || '').replace(/\D+/g, '');
            const itemEmail = String(item?.email || '').trim().toLowerCase();
            const itemNome = String(item?.nome || '').trim().toLowerCase();
            if (documento && itemDocumento === documento) return true;
            if (email && itemEmail && itemEmail === email) return true;
            return nome && itemNome && itemNome === nome;
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
        locadores.push(cliente);
        return cliente;
    }

    function encontrarPecaPorDescricao(itemProposta) {
        const alvo = normalizarTextoBusca(itemProposta?.descricao || '');
        if (!alvo) return null;

        const lista = Array.isArray(pecas) ? pecas : [];
        const exata = lista.find((peca) => normalizarTextoBusca(peca?.nome || '') === alvo);
        if (exata) return exata;

        return lista.find((peca) => normalizarTextoBusca(peca?.nome || '').includes(alvo) || alvo.includes(normalizarTextoBusca(peca?.nome || ''))) || null;
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

        const cliente = encontrarOuCriarClienteDaProposta(proposta);
        const hojeIso = new Date().toISOString().split('T')[0];
        const dataMontagem = proposta.evento.dataMontagem || proposta.evento.dataEvento || hojeIso;
        const dataDesmontagem = proposta.evento.dataDesmontagem || proposta.evento.dataEvento || dataMontagem;
        const valorFinal = obterValorFinalComercial(proposta);

        const itensLocacao = proposta.itens.map((item) => {
            const peca = encontrarPecaPorDescricao(item);
            return {
                pecaId: peca?.id || '',
                nome: item.descricao,
                quantidade: Math.max(1, Math.trunc(numeroNaoNegativo(item.quantidade, 1))),
                valor: numeroNaoNegativo(item.valorUnitario, 0)
            };
        });

        const novaLocacaoId = Date.now() + Math.floor(Math.random() * 600);
        let novaLocacao = {
            id: novaLocacaoId,
            locadorId: cliente.id,
            dataAluguel: dataMontagem,
            dataDevolucaoPrevisao: dataDesmontagem,
            items: itensLocacao,
            status: 'ativo',
            statusFluxo: 'aprovado',
            divisorFatura: 1,
            datasMontagem: {
                inicio: dataMontagem,
                fim: proposta.evento.dataEvento || dataMontagem,
                horarioInicio: '',
                horarioFim: ''
            },
            datasDesmontagem: {
                inicio: dataDesmontagem,
                fim: dataDesmontagem,
                horarioInicio: '',
                horarioFim: ''
            },
            equipe: {
                responsavel: '',
                membros: [],
                observacoes: proposta.evento.observacoesGerais || ''
            },
            logistica: {
                veiculo: '',
                motorista: '',
                horarioSaida: '',
                horarioChegada: '',
                statusEntrega: 'pendente',
                statusRetirada: 'pendente',
                observacoes: ''
            },
            financeiro: {
                valorTotal: valorFinal,
                sinal: 0,
                valorRestante: valorFinal,
                vencimento: proposta.evento.dataEvento || dataMontagem,
                formaPagamento: proposta.financeiro.condicaoPagamento || '',
                statusPagamento: 'pendente',
                notaFiscal: '',
                comprovante: ''
            },
            checklist: {
                idChecklist: null,
                status: 'nao_iniciado',
                ultimaAtualizacao: '',
                observacoes: ''
            },
            historicoAlteracoes: []
        };

        if (typeof normalizarLocacaoDominio === 'function') {
            novaLocacao = normalizarLocacaoDominio(novaLocacao, { incluirDerivados: false });
        }

        if (typeof atualizarStatusLocacaoDominio === 'function') {
            atualizarStatusLocacaoDominio(novaLocacao, 'aprovado', {
                acao: 'conversao_proposta',
                descricao: `Locacao criada a partir da proposta ${proposta.codigo}.`,
                origem: 'propostas',
                forcarHistorico: true
            });
        }

        locacoes.push(novaLocacao);

        const atualizadas = obterPropostasBase().map((item) => {
            if (String(item.id) !== String(proposta.id)) return item;
            return {
                ...item,
                status: 'convertida',
                locacaoId: String(novaLocacaoId),
                atualizadoEm: new Date().toISOString()
            };
        });
        propostas = atualizadas;

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

    function converterPropostaAtual() {
        const id = obterIdPropostaEmEdicao();
        if (!id) {
            mostrarToast('Abra uma proposta para converter.', 'info');
            return;
        }
        converterPropostaEmLocacaoFechada(id);
    }

    function montarHtmlPdfProposta(proposta) {
        const p = normalizarProposta(proposta);
        const linhasItens = p.itens.map((item) => `
            <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:8px; font-size:11px;">${sanitizar(item.descricao)}</td>
                <td style="padding:8px; text-align:center; font-size:11px;">${sanitizar(item.medida || '-')}</td>
                <td style="padding:8px; text-align:center; font-size:11px;">${item.quantidade}</td>
                <td style="padding:8px; text-align:right; font-size:11px;">${formatarMoeda(item.valorUnitario)}</td>
                <td style="padding:8px; text-align:right; font-size:11px;">${formatarMoeda(item.valorTotal)}</td>
                <td style="padding:8px; font-size:11px;">${sanitizar(item.observacoes || '-')}</td>
            </tr>
        `).join('');

        const linhaCusto = (rotulo, valor) => `
            <tr>
                <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">${rotulo}</td>
                <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${formatarMoeda(valor)}</td>
            </tr>
        `;

        const percentualNF = numeroNaoNegativo(p.financeiro?.percentualNF, 0);
        const tipoCalculoNF = normalizarTipoCalculoNF(p.financeiro?.tipoCalculoNF, 'descontar');
        const exibirCustosInternosPdf = p.financeiro?.exibirCustosInternosPdf === true;
        const valorNF = numeroNaoNegativo(p.financeiro?.valorNF, 0);
        const valorFinal = numeroNaoNegativo(p.financeiro?.valorFinal, 0);
        const valorFinalComNF = numeroNaoNegativo(p.financeiro?.valorFinalComNF, valorFinal);
        const valorLiquidoPrevisto = numeroSeguro(p.financeiro?.valorLiquidoPrevisto, valorFinal);
        const totalCustosAdicionais = numeroNaoNegativo(
            p.financeiro?.totalCustosAdicionais,
            Object.values(p.custos || {}).reduce((acc, valor) => acc + numeroNaoNegativo(valor, 0), 0)
        );
        const margemEstimada = valorLiquidoPrevisto - totalCustosAdicionais;
        const valorFinalComercial = obterValorFinalComercial(p);
        const percentualNFTxt = `${percentualNF.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;

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
                        <div><strong>Emissao:</strong> ${formatarData(p.atualizadoEm || p.criadoEm)}</div>
                        <div><strong>Validade:</strong> ${formatarData(p.evento.dataEvento || p.evento.dataMontagem)}</div>
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
                            <div><b>Cidade:</b> ${sanitizar(p.evento.cidade || '-')}</div>
                            <div><b>Montagem:</b> ${formatarData(p.evento.dataMontagem)}</div>
                            <div><b>Data do evento:</b> ${formatarData(p.evento.dataEvento)}</div>
                            <div><b>Desmontagem:</b> ${formatarData(p.evento.dataDesmontagem)}</div>
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
                                <th style="padding:8px; text-align:center; font-size:10px; color:#fff;">QTD</th>
                                <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">UNIT.</th>
                                <th style="padding:8px; text-align:right; font-size:10px; color:#fff;">TOTAL</th>
                                <th style="padding:8px; text-align:left; font-size:10px; color:#fff;">OBS.</th>
                            </tr>
                        </thead>
                        <tbody>${linhasItens || '<tr><td colspan="6" style="padding:10px;">Sem itens</td></tr>'}</tbody>
                    </table>
                </div>

                <div style="display:grid; grid-template-columns:${exibirCustosInternosPdf ? '1.2fr 0.8fr' : '1fr'}; gap:16px;">
                    ${exibirCustosInternosPdf ? `
                    <div style="border:1px solid #cbd5e1; border-radius:10px; padding:10px;">
                        <strong style="display:block; margin-bottom:6px; font-size:12px;">Custos internos</strong>
                        <table style="width:100%; border-collapse:collapse; font-size:11px;">
                            <tbody>
                                ${linhaCusto('Frete', p.custos.frete)}
                                ${linhaCusto('Mao de obra', p.custos.maoObra)}
                                ${linhaCusto('Operador', p.custos.operador)}
                                ${linhaCusto('Eletrica', p.custos.eletrica)}
                                ${linhaCusto('Gerador', p.custos.gerador)}
                                ${linhaCusto('Terceirizados', p.custos.terceirizados)}
                                ${linhaCusto('Outros', p.custos.outros)}
                                ${linhaCusto('Total custos internos', totalCustosAdicionais)}
                            </tbody>
                        </table>
                    </div>
                    ` : ''}
                    <div style="border:1px solid #111827; border-radius:10px; padding:10px;">
                        <strong style="display:block; margin-bottom:6px; font-size:12px;">Resumo financeiro</strong>
                        <div style="font-size:11px; line-height:1.8;">
                            <div><b>Subtotal:</b> ${formatarMoeda(p.financeiro.subtotal)}</div>
                            <div><b>Desconto:</b> ${formatarMoeda(p.financeiro.desconto)}</div>
                            <div><b>Acrescimo:</b> ${formatarMoeda(p.financeiro.acrescimo)}</div>
                            ${(tipoCalculoNF === 'acrescentar' || exibirCustosInternosPdf) ? `<div><b>Percentual NF:</b> ${percentualNFTxt}</div>` : ''}
                            ${(tipoCalculoNF === 'acrescentar' || exibirCustosInternosPdf) ? `<div><b>Valor da NF:</b> ${formatarMoeda(valorNF)}</div>` : ''}
                            ${(tipoCalculoNF === 'acrescentar' || exibirCustosInternosPdf) ? `<div><b>Tipo cálculo NF:</b> ${rotuloTipoCalculoNF(tipoCalculoNF)}</div>` : ''}
                            <div style="font-size:13px; margin-top:4px;"><b>Valor final da proposta:</b> ${formatarMoeda(valorFinalComercial)}</div>
                            ${exibirCustosInternosPdf ? `<div><b>Valor final com NF:</b> ${formatarMoeda(valorFinalComNF)}</div>` : ''}
                            ${exibirCustosInternosPdf ? `<div><b>Valor líquido previsto:</b> ${formatarMoeda(valorLiquidoPrevisto)}</div>` : ''}
                            ${exibirCustosInternosPdf ? `<div><b>Margem estimada:</b> ${formatarMoeda(margemEstimada)}</div>` : ''}
                            <div><b>Condicao:</b> ${sanitizar(p.financeiro.condicaoPagamento || '-')}</div>
                            ${exibirCustosInternosPdf ? `<div style="margin-top:6px; color:#64748b;"><i>Uso interno habilitado neste PDF.</i></div>` : ''}
                        </div>
                    </div>
                </div>

                <div style="margin-top:14px; font-size:10px; border:1px solid #cbd5e1; border-radius:8px; padding:10px;">
                    <b>Observacoes gerais:</b> ${sanitizar(p.evento.observacoesGerais || '-')}
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
        const aprovadas = lista.filter((item) => item.status === 'aprovada' || item.status === 'convertida').length;
        const enviadas = lista.filter((item) => item.status === 'enviada').length;
        const valorPipeline = lista.reduce((acc, item) => {
            if (item.status === 'cancelada') return acc;
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
        const normalizado = String(filtro || 'todos').trim().toLowerCase();
        filtroPropostasAtual = FILTROS_PROPOSTA.has(normalizado) ? normalizado : 'todos';
        try {
            localStorage.setItem(CHAVE_FILTRO_PROPOSTAS, filtroPropostasAtual);
        } catch (_) {
            // Ignora falha de persistencia do filtro.
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
        const termoRaw = String(document.getElementById('buscaPropostas')?.value || '').trim();
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
                proposta.cliente?.email,
                proposta.evento?.nome,
                proposta.evento?.cidade,
                proposta.status
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
                ? criarLinhaTabelaEstado(8, {
                    tipo: 'empty',
                    titulo: 'Nenhuma proposta encontrada',
                    mensagem: termoRaw
                        ? `Sem resultados para "${termoRaw}".`
                        : 'Cadastre a primeira proposta para iniciar o pipeline.'
                })
                : '<tr><td colspan="8">Nenhuma proposta encontrada.</td></tr>';
            return;
        }

        tbody.innerHTML = filtradas.map((proposta) => `
            <tr data-proposta-id="${proposta.id}">
                <td>${sanitizar(proposta.codigo)}</td>
                <td>${sanitizar(proposta.cliente.nome || '-')}</td>
                <td>${sanitizar(proposta.evento.nome || '-')}</td>
                <td>${formatarData(proposta.evento.dataEvento)}</td>
                <td>${formatarMoeda(obterValorFinalComercial(proposta))}</td>
                <td><span class="badge ${statusBadge(proposta.status)}">${statusRotulo(proposta.status)}</span></td>
                <td>${proposta.locacaoId ? `#${sanitizar(String(proposta.locacaoId).slice(-4))}` : '-'}</td>
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
                        <button class="btn btn-sm btn-success table-action-btn" data-action="converterPropostaEmLocacaoFechada" data-arg="${proposta.id}" title="Converter para locacao" ${proposta.locacaoId ? 'disabled' : ''}>
                            <i class="bi bi-check2-circle"></i>
                        </button>
                        <button class="btn btn-sm btn-danger table-action-btn" data-action="excluirProposta" data-arg="${proposta.id}" title="Excluir">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
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

    function inicializarPropostas() {
        if (!Array.isArray(propostas)) propostas = [];
        try {
            const salvo = String(localStorage.getItem(CHAVE_FILTRO_PROPOSTAS) || '').trim().toLowerCase();
            filtroPropostasAtual = FILTROS_PROPOSTA.has(salvo) ? salvo : 'todos';
        } catch (_) {
            filtroPropostasAtual = 'todos';
        }
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
})();
