// Busca inteligente e operacoes de locacao
let locacaoEtapaAtual = 1;
let fluxoLocacaoInicializado = false;
let indiceSugestaoLocacaoAtiva = -1;
let sessaoEdicaoLocacao = null;
let eventosSessaoEdicaoLocacaoRegistrados = false;
let execucaoSessaoEdicaoLocacaoEmAndamento = false;
let sequenciaOperacaoEdicaoLocacao = 0;
const CHAVE_FILTRO_LOCACOES = 'mtz:locacoesFiltro';
const FILTROS_LOCACOES_VALIDOS = new Set(['todos', 'ativo', 'atrasado', 'devolvido', 'cancelado']);

function gerarOperacaoIdSessaoEdicaoLocacao(locacaoId, revisao) {
    let sufixo = '';
    if (globalThis.crypto?.randomUUID) {
        sufixo = globalThis.crypto.randomUUID().replace(/[^a-z0-9]/gi, '').toLowerCase();
    } else if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint32Array(4);
        globalThis.crypto.getRandomValues(bytes);
        sufixo = Array.from(bytes, (valor) => valor.toString(16).padStart(8, '0')).join('');
    } else {
        sequenciaOperacaoEdicaoLocacao += 1;
        sufixo = `${Date.now().toString(36)}${sequenciaOperacaoEdicaoLocacao.toString(36)}`;
    }
    const referencia = String(locacaoId || 'locacao').toLowerCase().replace(/[^a-z0-9._:-]+/g, '-');
    const operacaoId = `edicao-${referencia}-${revisao}-${sufixo}`.slice(0, 180);
    const validacao = typeof validarOperacaoIdLocacao === 'function'
        ? validarOperacaoIdLocacao(operacaoId)
        : { valido: /^[a-z0-9][a-z0-9._:-]*$/.test(operacaoId) };
    return validacao?.valido ? operacaoId : '';
}

function obterLocacaoAtualSessaoEdicaoLocacao() {
    if (!sessaoEdicaoLocacao) return null;
    const estado = typeof obterEstadoMemoriaAtual === 'function' ? obterEstadoMemoriaAtual() : { locacoes };
    const correspondencias = (Array.isArray(estado?.locacoes) ? estado.locacoes : [])
        .filter((item) => String(item?.id ?? '') === sessaoEdicaoLocacao.locacaoId);
    return correspondencias.length === 1 ? correspondencias[0] : null;
}

function obterContextoAtualSessaoEdicaoLocacao() {
    const estado = typeof obterEstadoMemoriaAtual === 'function'
        ? obterEstadoMemoriaAtual()
        : { pecas, locacoes, devolucoes };
    return {
        estado,
        contexto: {
            pecas: Array.isArray(estado?.pecas) ? estado.pecas : [],
            locacoes: Array.isArray(estado?.locacoes) ? estado.locacoes : [],
            devolucoes: Array.isArray(estado?.devolucoes) ? estado.devolucoes : []
        }
    };
}

function obterElegibilidadeEdicaoLocacao(locacao, opcoes = {}) {
    if (!locacao || typeof locacao !== 'object' || Array.isArray(locacao)) {
        return { permitida: false, codigo: 'LOCACAO_INVALIDA', mensagem: 'A locação não está disponível para edição.' };
    }

    const statusFluxo = typeof inferirStatusFluxoLocacao === 'function'
        ? inferirStatusFluxoLocacao(locacao)
        : String(locacao.statusFluxo || locacao.status || '').trim().toLowerCase();
    const statusBase = String(locacao.status || '').trim().toLowerCase();
    if (['cancelado', 'devolvido', 'finalizado'].includes(statusFluxo)
        || ['cancelado', 'devolvido', 'finalizado', 'historico'].includes(statusBase)) {
        return {
            permitida: false,
            codigo: 'STATUS_NAO_EDITAVEL',
            mensagem: 'Locações canceladas, devolvidas ou encerradas não podem ser editadas.'
        };
    }

    if (opcoes.validarOperacional === false) return { permitida: true, codigo: 'ELEGIVEL', mensagem: '' };
    if (typeof clonarJsonPersistivelEstrito !== 'function' || typeof planejarAjusteReservaLocacao !== 'function') {
        return {
            permitida: false,
            codigo: 'SERVICO_EDICAO_INDISPONIVEL',
            mensagem: 'A edição segura não está disponível nesta sessão. Atualize a página e tente novamente.'
        };
    }

    const copia = clonarJsonPersistivelEstrito({
        items: Array.isArray(locacao.items) ? locacao.items : [],
        dataAluguel: locacao.dataAluguel || '',
        dataDevolucaoPrevisao: locacao.dataDevolucaoPrevisao || '',
        datasMontagem: locacao.datasMontagem || {},
        datasDesmontagem: locacao.datasDesmontagem || {}
    });
    if (!copia.ok) {
        return {
            permitida: false,
            codigo: copia.codigo || 'RASCUNHO_INVALIDO',
            mensagem: 'A locação contém dados que precisam ser conferidos antes da edição.'
        };
    }

    const plano = planejarAjusteReservaLocacao(locacao, copia.valor, {
        pecas: Array.isArray(pecas) ? pecas : [],
        locacoes: Array.isArray(locacoes) ? locacoes : [],
        devolucoes: Array.isArray(devolucoes) ? devolucoes : []
    });
    if (!plano?.valido) {
        return {
            permitida: false,
            codigo: plano?.bloqueios?.[0]?.codigo || 'INCONSISTENCIA_OPERACIONAL',
            mensagem: plano?.bloqueios?.[0]?.mensagem
                || 'A locação possui uma inconsistência operacional que impede a edição.'
        };
    }

    return { permitida: true, codigo: 'ELEGIVEL', mensagem: '' };
}

function obterClienteSessaoEdicaoLocacao(locacao) {
    const locadorId = locacao?.locadorId ?? locacao?.clienteId;
    return resolverClienteLocacaoPorIdPersistido(locadorId)
        || locacao?.cliente
        || locacao?.dadosCliente
        || {};
}

function obterTextoOrigemItemEdicaoLocacao(item) {
    const origem = String(item?.origemCusto || item?.origem || 'nao_informado').trim().toLowerCase();
    return {
        proprio: 'Próprio',
        terceirizado: 'Terceirizado',
        misto: 'Misto',
        nao_informado: 'Não informado'
    }[origem] || origem || 'Não informado';
}

function escaparAtributoEdicaoLocacao(valor) {
    return escaparHTML(valor).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function obterNomeItemPlanoEdicaoLocacao(itemPlano) {
    const itemId = String(itemPlano?.itemId || '');
    const itens = [
        ...(Array.isArray(sessaoEdicaoLocacao?.rascunho?.items) ? sessaoEdicaoLocacao.rascunho.items : []),
        ...(Array.isArray(sessaoEdicaoLocacao?.originalIsolado?.items) ? sessaoEdicaoLocacao.originalIsolado.items : [])
    ];
    const item = itens.find((registro) => String(registro?.itemId || '') === itemId);
    return String(item?.nome || item?.descricao || itemId || 'Item sem descrição');
}

function formatarDataRevisaoEdicaoLocacao(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return 'Não informada';
    const partes = texto.slice(0, 10).split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : texto;
}

function limparErrosSessaoEdicaoLocacao() {
    const modal = document.getElementById('modalEditarLocacaoOperacional');
    modal?.querySelectorAll('[aria-invalid="true"]').forEach((campo) => campo.removeAttribute('aria-invalid'));
    modal?.querySelectorAll('[aria-describedby~="editLocacaoValidacao"]').forEach((campo) => {
        const ids = String(campo.getAttribute('aria-describedby') || '')
            .split(/\s+/).filter((id) => id && id !== 'editLocacaoValidacao');
        if (ids.length) campo.setAttribute('aria-describedby', ids.join(' '));
        else campo.removeAttribute('aria-describedby');
    });
}

function obterCamposBloqueioSessaoEdicaoLocacao(bloqueio = {}) {
    const itemPorPeca = bloqueio.pecaId
        ? sessaoEdicaoLocacao?.rascunho?.items?.find((item) => String(item?.pecaId ?? '') === String(bloqueio.pecaId))
        : null;
    const itemId = String(bloqueio.itemId || itemPorPeca?.itemId || '');
    if (itemId) {
        const campo = bloqueio.campo || 'quantidade';
        const controles = Array.from(document.querySelectorAll('[data-edit-item-id][data-edit-item-campo]'));
        const controle = controles.find((item) => item.dataset.editItemId === itemId
            && item.dataset.editItemCampo === campo)
            || controles.find((item) => item.dataset.editItemId === itemId);
        return controle ? [controle] : [];
    }
    const mapa = {
        dataAluguel: 'editLocacaoDataAluguel',
        dataDevolucaoPrevisao: 'editLocacaoDataDevolucao',
        'datasMontagem.inicio': 'editLocacaoMontagemInicio',
        'datasMontagem.fim': 'editLocacaoMontagemFim',
        'datasDesmontagem.inicio': 'editLocacaoDesmontagemInicio',
        'datasDesmontagem.fim': 'editLocacaoDesmontagemFim',
        periodo: 'editLocacaoDataAluguel',
        items: 'editLocacaoNovoItem'
    };
    let campos = Array.isArray(bloqueio.campos) ? bloqueio.campos : [bloqueio.campo];
    if (bloqueio.codigo === 'PERIODO_PRETENDIDO_INVALIDO') {
        const rascunho = sessaoEdicaoLocacao?.rascunho || {};
        const inicio = rascunho.datasMontagem?.inicio ? 'datasMontagem.inicio' : 'dataAluguel';
        const fim = rascunho.datasDesmontagem?.fim
            ? 'datasDesmontagem.fim'
            : (rascunho.datasDesmontagem?.inicio ? 'datasDesmontagem.inicio' : 'dataDevolucaoPrevisao');
        campos = bloqueio.campo === 'dataDevolucaoPrevisao' ? [fim, inicio] : [inicio, fim];
    }
    return campos
        .map((campo) => document.getElementById(mapa[campo] || ''))
        .filter((campo, indice, lista) => campo && lista.indexOf(campo) === indice);
}

function marcarCampoInvalidoSessaoEdicaoLocacao(bloqueio, focar = false) {
    const campos = obterCamposBloqueioSessaoEdicaoLocacao(bloqueio);
    campos.forEach((campo) => {
        campo.setAttribute('aria-invalid', 'true');
        const descricoes = new Set(String(campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        descricoes.add('editLocacaoValidacao');
        campo.setAttribute('aria-describedby', Array.from(descricoes).join(' '));
    });
    const primeiroCampo = campos[0];
    if (focar && primeiroCampo) {
        primeiroCampo.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        setTimeout(() => primeiroCampo.focus({ preventScroll: true }), 180);
    }
}

function obterBloqueioDatasSessaoEdicaoLocacao() {
    const rascunho = sessaoEdicaoLocacao?.rascunho || {};
    const pares = [
        {
            inicio: rascunho.datasMontagem?.inicio,
            fim: rascunho.datasMontagem?.fim,
            campos: ['datasMontagem.fim', 'datasMontagem.inicio'],
            mensagem: 'A data final da montagem não pode ser anterior à data inicial.'
        },
        {
            inicio: rascunho.datasDesmontagem?.inicio,
            fim: rascunho.datasDesmontagem?.fim,
            campos: ['datasDesmontagem.fim', 'datasDesmontagem.inicio'],
            mensagem: 'A data final da desmontagem não pode ser anterior à data inicial.'
        }
    ];
    const invalido = pares.find((par) => par.inicio && par.fim && par.fim < par.inicio);
    return invalido ? {
        codigo: 'PERIODO_INTERNO_INVALIDO',
        campo: invalido.campos[0],
        campos: invalido.campos,
        mensagem: invalido.mensagem
    } : null;
}

function definirEstadoControlesSessaoEdicaoLocacao(processando, bloqueada = false) {
    const modal = document.getElementById('modalEditarLocacaoOperacional');
    modal?.querySelectorAll('input, select, button').forEach((controle) => {
        if (controle.id === 'editLocacaoFechar' || controle.dataset.action === 'cancelarSessaoEdicaoLocacao') {
            controle.disabled = processando;
            return;
        }
        if (controle.id === 'editLocacaoConfirmar') return;
        controle.disabled = processando || bloqueada;
    });
    modal?.setAttribute('aria-busy', processando ? 'true' : 'false');
}

function atualizarEstadoConfirmacaoSessaoEdicaoLocacao(validacao = null) {
    const botao = document.getElementById('editLocacaoConfirmar');
    if (!botao || !sessaoEdicaoLocacao) return;
    const estado = validacao || validarSessaoEdicaoLocacao({ exibir: true, focar: false });
    const mensagem = document.getElementById('editLocacaoValidacao');
    if (mensagem && sessaoEdicaoLocacao.etapa === 'edicao') {
        mensagem.textContent = !estado.valido && estado.possuiAlteracoes ? estado.mensagem : '';
    }
    const habilitado = estado.valido && estado.possuiAlteracoes
        && sessaoEdicaoLocacao.etapa === 'edicao' && !sessaoEdicaoLocacao.executando;
    botao.disabled = !habilitado;
    botao.setAttribute('aria-disabled', habilitado ? 'false' : 'true');
    botao.title = habilitado
        ? 'Revisar as alterações antes de aplicar'
        : (estado.mensagem || 'Faça uma alteração operacional válida para continuar.');
}

function validarSessaoEdicaoLocacao(opcoes = {}) {
    const exibir = opcoes.exibir === true;
    const focar = opcoes.focar === true;
    limparErrosSessaoEdicaoLocacao();
    if (!sessaoEdicaoLocacao) {
        return { valido: false, possuiAlteracoes: false, mensagem: 'A sessão de edição não está disponível.' };
    }
    const locacaoAtual = obterLocacaoAtualSessaoEdicaoLocacao();
    if (!locacaoAtual) {
        return { valido: false, possuiAlteracoes: false, mensagem: 'A locação não está mais disponível.' };
    }
    const elegibilidade = obterElegibilidadeEdicaoLocacao(locacaoAtual);
    if (!elegibilidade.permitida) {
        return { valido: false, possuiAlteracoes: false, mensagem: elegibilidade.mensagem };
    }
    const bloqueioDatas = obterBloqueioDatasSessaoEdicaoLocacao();
    if (bloqueioDatas) {
        if (exibir) marcarCampoInvalidoSessaoEdicaoLocacao(bloqueioDatas, focar);
        return {
            valido: false,
            possuiAlteracoes: true,
            bloqueios: [bloqueioDatas],
            mensagem: bloqueioDatas.mensagem
        };
    }
    const itens = Array.isArray(sessaoEdicaoLocacao.rascunho.items) ? sessaoEdicaoLocacao.rascunho.items : [];
    if (!itens.length) {
        const bloqueio = { codigo: 'ITENS_EDITADOS_AUSENTES', campo: 'items', mensagem: 'Mantenha ao menos um item na locação.' };
        if (exibir) marcarCampoInvalidoSessaoEdicaoLocacao(bloqueio, focar);
        return { valido: false, possuiAlteracoes: true, bloqueios: [bloqueio], mensagem: bloqueio.mensagem };
    }
    const itemQuantidadeZero = itens.find((item) => !(Number.isSafeInteger(item?.quantidade) && item.quantidade > 0));
    if (itemQuantidadeZero) {
        const bloqueio = {
            codigo: 'QUANTIDADE_INVALIDA', itemId: itemQuantidadeZero.itemId, campo: 'quantidade',
            mensagem: `Informe uma quantidade total maior que zero para “${itemQuantidadeZero.nome || itemQuantidadeZero.descricao || itemQuantidadeZero.itemId}”.`
        };
        if (exibir) marcarCampoInvalidoSessaoEdicaoLocacao(bloqueio, focar);
        return { valido: false, possuiAlteracoes: true, bloqueios: [bloqueio], mensagem: bloqueio.mensagem };
    }
    const { contexto } = obterContextoAtualSessaoEdicaoLocacao();
    const plano = planejarAjusteReservaLocacao(locacaoAtual, sessaoEdicaoLocacao.rascunho, contexto);
    const bloqueios = Array.isArray(plano?.bloqueios) ? plano.bloqueios : [];
    const primeiro = bloqueios[0];
    if (primeiro && exibir) marcarCampoInvalidoSessaoEdicaoLocacao(primeiro, focar);
    return {
        valido: plano?.valido === true && bloqueios.length === 0,
        possuiAlteracoes: plano?.resumo?.possuiAlteracoes === true,
        plano,
        bloqueios,
        avisos: Array.isArray(plano?.avisos) ? plano.avisos : [],
        mensagem: primeiro?.mensagem || (!plano?.resumo?.possuiAlteracoes
            ? 'Nenhuma alteração operacional foi identificada.' : '')
    };
}

function renderizarItensSessaoEdicaoLocacao() {
    const corpo = document.getElementById('editLocacaoItens');
    if (!corpo) return;
    const itens = Array.isArray(sessaoEdicaoLocacao?.rascunho?.items)
        ? sessaoEdicaoLocacao.rascunho.items
        : [];
    if (!itens.length) {
        corpo.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum item no rascunho.</td></tr>';
        atualizarEstadoConfirmacaoSessaoEdicaoLocacao();
        return;
    }

    corpo.innerHTML = itens.map((item) => {
        const itemId = String(item?.itemId || '');
        const nome = escaparHTML(item?.nome || item?.descricao || 'Item sem descrição');
        const idSeguro = escaparAtributoEdicaoLocacao(itemId);
        const nomeAtributo = escaparAtributoEdicaoLocacao(item?.nome || item?.descricao || 'Item sem descrição');
        const origem = String(item?.origemCusto || item?.origem || 'nao_informado').trim().toLowerCase();
        const valor = Number(item?.valor ?? item?.valorUnitario ?? 0);
        return `
            <tr data-edit-locacao-item="${idSeguro}">
                <td>
                    <strong>${nome}</strong>
                    <small class="muted-note">${idSeguro || 'Item sem ID'}</small>
                </td>
                <td><input type="number" min="0" step="1" value="${Math.max(Number(item?.quantidade) || 0, 0)}" data-edit-item-id="${idSeguro}" data-edit-item-campo="quantidade" aria-label="Quantidade total de ${nomeAtributo}"></td>
                <td>
                    <select data-edit-item-id="${idSeguro}" data-edit-item-campo="origemCusto" aria-label="Origem de ${nomeAtributo}">
                        ${['proprio', 'terceirizado', 'misto', 'nao_informado'].map((opcao) => `<option value="${opcao}" ${origem === opcao ? 'selected' : ''}>${obterTextoOrigemItemEdicaoLocacao({ origemCusto: opcao })}</option>`).join('')}
                    </select>
                </td>
                <td><input type="number" min="0" step="1" value="${Math.max(Number(item?.quantidadePropria) || 0, 0)}" data-edit-item-id="${idSeguro}" data-edit-item-campo="quantidadePropria" aria-label="Quantidade própria de ${nomeAtributo}"></td>
                <td><input type="number" min="0" step="1" value="${Math.max(Number(item?.quantidadeTerceirizada) || 0, 0)}" data-edit-item-id="${idSeguro}" data-edit-item-campo="quantidadeTerceirizada" aria-label="Quantidade terceirizada de ${nomeAtributo}"></td>
                <td><span>${Number.isFinite(valor) ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}</span></td>
                <td><button type="button" class="btn btn-sm btn-danger table-action-btn" data-action="removerItemSessaoEdicaoLocacao" data-arg="${idSeguro}" aria-label="Remover ${nomeAtributo} do rascunho" title="Remover do rascunho"><i class="bi bi-trash"></i></button></td>
            </tr>`;
    }).join('');
    atualizarEstadoConfirmacaoSessaoEdicaoLocacao();
}

function preencherInterfaceSessaoEdicaoLocacao(locacao) {
    const rascunho = sessaoEdicaoLocacao.rascunho;
    const cliente = obterClienteSessaoEdicaoLocacao(locacao);
    const preencher = (id, valor) => {
        const campo = document.getElementById(id);
        if (campo) campo.value = valor ?? '';
    };
    const texto = (id, valor) => {
        const campo = document.getElementById(id);
        if (campo) campo.textContent = valor ?? '-';
    };

    texto('editLocacaoCodigo', String(locacao.codigo || locacao.id || '-'));
    texto('editLocacaoCliente', cliente.nome || cliente.razaoSocial || locacao.clienteNome || '-');
    texto('editLocacaoStatus', String(locacao.statusVisual || locacao.status || '-'));
    texto('editLocacaoDivisor', String(locacao.divisorFatura ?? locacao.divisor ?? '-'));
    const valorTotal = typeof calcularValorLocacaoDominio === 'function' ? calcularValorLocacaoDominio(locacao) : Number(locacao.valorTotal || 0);
    texto('editLocacaoValorTotal', Number(valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
    texto('editLocacaoPagamento', locacao.pago ? 'Pago' : 'Pendente');

    preencher('editLocacaoDataAluguel', rascunho.dataAluguel);
    preencher('editLocacaoDataDevolucao', rascunho.dataDevolucaoPrevisao);
    preencher('editLocacaoMontagemInicio', rascunho.datasMontagem?.inicio);
    preencher('editLocacaoMontagemFim', rascunho.datasMontagem?.fim);
    preencher('editLocacaoMontagemHoraInicio', rascunho.datasMontagem?.horarioInicio || rascunho.datasMontagem?.horaInicio);
    preencher('editLocacaoMontagemHoraFim', rascunho.datasMontagem?.horarioFim || rascunho.datasMontagem?.horaFim);
    preencher('editLocacaoDesmontagemInicio', rascunho.datasDesmontagem?.inicio);
    preencher('editLocacaoDesmontagemFim', rascunho.datasDesmontagem?.fim);
    preencher('editLocacaoDesmontagemHoraInicio', rascunho.datasDesmontagem?.horarioInicio || rascunho.datasDesmontagem?.horaInicio);
    preencher('editLocacaoDesmontagemHoraFim', rascunho.datasDesmontagem?.horarioFim || rascunho.datasDesmontagem?.horaFim);
    const seletorNovoItem = document.getElementById('editLocacaoNovoItem');
    if (seletorNovoItem) {
        seletorNovoItem.innerHTML = '<option value="">Selecione...</option>'
            + (Array.isArray(pecas) ? pecas : []).map((peca) => (
                `<option value="${escaparAtributoEdicaoLocacao(String(peca?.id ?? ''))}">${escaparHTML(peca?.nome || 'Item sem nome')}</option>`
            )).join('');
    }
    renderizarItensSessaoEdicaoLocacao();
    atualizarEstadoConfirmacaoSessaoEdicaoLocacao();
}

function atualizarRascunhoSessaoEdicaoLocacao(event) {
    if (!sessaoEdicaoLocacao || sessaoEdicaoLocacao.executando || sessaoEdicaoLocacao.etapa !== 'edicao') return;
    const campo = event.target;
    const caminho = campo?.dataset?.editLocacaoCampo;
    if (caminho) {
        const partes = caminho.split('.');
        let alvo = sessaoEdicaoLocacao.rascunho;
        partes.slice(0, -1).forEach((parte) => {
            if (!alvo[parte] || typeof alvo[parte] !== 'object') alvo[parte] = {};
            alvo = alvo[parte];
        });
        alvo[partes[partes.length - 1]] = campo.value;
        sessaoEdicaoLocacao.revisaoPreparada = null;
        atualizarEstadoConfirmacaoSessaoEdicaoLocacao();
        return;
    }

    const itemId = campo?.dataset?.editItemId;
    const itemCampo = campo?.dataset?.editItemCampo;
    if (!itemId || !itemCampo) return;
    const item = sessaoEdicaoLocacao.rascunho.items.find((registro) => String(registro?.itemId || '') === itemId);
    if (!item) return;
    item[itemCampo] = campo.type === 'number' ? Number(campo.value) : campo.value;
    sessaoEdicaoLocacao.revisaoPreparada = null;
    atualizarEstadoConfirmacaoSessaoEdicaoLocacao();
}

function registrarEventosSessaoEdicaoLocacao() {
    if (eventosSessaoEdicaoLocacaoRegistrados) return;
    const modal = document.getElementById('modalEditarLocacaoOperacional');
    if (!modal) return;
    modal.addEventListener('input', atualizarRascunhoSessaoEdicaoLocacao);
    modal.addEventListener('change', atualizarRascunhoSessaoEdicaoLocacao);
    modal.addEventListener('click', (event) => {
        if (event.target === modal && modal.classList.contains('active')) {
            event.stopImmediatePropagation();
            cancelarSessaoEdicaoLocacao();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (!sessaoEdicaoLocacao || !modal.classList.contains('active')) return;
        if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's') {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!sessaoEdicaoLocacao.executando && sessaoEdicaoLocacao.etapa === 'edicao') {
                revisarAlteracoesSessaoEdicaoLocacao();
            }
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (sessaoEdicaoLocacao.executando) {
                mostrarToast('Aguarde a conclusão segura da operação.', 'info');
            } else if (sessaoEdicaoLocacao.etapa === 'revisao') {
                voltarEdicaoSessaoEdicaoLocacao();
            } else {
                cancelarSessaoEdicaoLocacao();
            }
            return;
        }
        if (event.key !== 'Tab') return;
        const focaveis = Array.from(modal.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter((elemento) => elemento.offsetParent !== null);
        if (!focaveis.length) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (event.shiftKey && document.activeElement === primeiro) {
            event.preventDefault();
            ultimo.focus();
        } else if (!event.shiftKey && document.activeElement === ultimo) {
            event.preventDefault();
            primeiro.focus();
        }
    }, true);
    eventosSessaoEdicaoLocacaoRegistrados = true;
}

function alternarEtapaSessaoEdicaoLocacao(etapa) {
    if (!sessaoEdicaoLocacao) return;
    sessaoEdicaoLocacao.etapa = etapa;
    const editor = document.getElementById('editLocacaoEditor');
    const revisao = document.getElementById('editLocacaoRevisao');
    const rodapeEdicao = document.getElementById('editLocacaoFooterEdicao');
    const rodapeRevisao = document.getElementById('editLocacaoFooterRevisao');
    const emRevisao = etapa === 'revisao' || etapa === 'executando';
    if (editor) editor.hidden = emRevisao;
    if (revisao) revisao.hidden = !emRevisao;
    if (rodapeEdicao) rodapeEdicao.hidden = emRevisao;
    if (rodapeRevisao) rodapeRevisao.hidden = !emRevisao;
}

function formatarPeriodoDetalhadoEdicaoLocacao(datas = {}) {
    const inicio = formatarDataRevisaoEdicaoLocacao(datas?.inicio);
    const fim = formatarDataRevisaoEdicaoLocacao(datas?.fim);
    const horaInicio = String(datas?.horarioInicio || datas?.horaInicio || '').trim();
    const horaFim = String(datas?.horarioFim || datas?.horaFim || '').trim();
    return `${inicio}${horaInicio ? ` às ${horaInicio}` : ''} → ${fim}${horaFim ? ` às ${horaFim}` : ''}`;
}

function renderizarRevisaoSessaoEdicaoLocacao(plano) {
    const listaItens = document.getElementById('editLocacaoRevisaoItens');
    const listaDatas = document.getElementById('editLocacaoRevisaoDatas');
    const alertas = document.getElementById('editLocacaoRevisaoAlertas');
    const itensAlterados = (Array.isArray(plano?.itens) ? plano.itens : [])
        .filter((item) => item.situacao !== 'mantido');
    if (listaItens) {
        listaItens.innerHTML = itensAlterados.length
            ? itensAlterados.map((item) => {
                const nome = escaparHTML(obterNomeItemPlanoEdicaoLocacao(item));
                const q = item.quantidades || {};
                const descricao = item.situacao === 'incluido'
                    ? `Incluído: total ${q.comercialPretendida}, próprio ${q.propriaPretendida}, terceirizado ${q.terceirizadaPretendida}`
                    : item.situacao === 'removido'
                        ? `Removido: total ${q.comercialAtual}, próprio pendente ${q.pendenteAtual}`
                        : `Total ${q.comercialAtual} → ${q.comercialPretendida}; próprio ${q.propriaReservada} → ${q.propriaPretendida}; terceirizado ${q.terceirizadaAtual} → ${q.terceirizadaPretendida}`;
                return `<li><strong>${nome}</strong><span>${escaparHTML(descricao)}</span></li>`;
            }).join('')
            : '<li class="muted-note">Nenhuma alteração nos itens.</li>';
    }
    if (listaDatas) {
        const original = sessaoEdicaoLocacao.originalIsolado;
        const rascunho = sessaoEdicaoLocacao.rascunho;
        const linhas = [];
        const adicionar = (rotulo, anterior, novo) => {
            if (anterior !== novo) linhas.push(`<li><strong>${rotulo}</strong><span>${escaparHTML(anterior)} → ${escaparHTML(novo)}</span></li>`);
        };
        adicionar('Data da locação', formatarDataRevisaoEdicaoLocacao(original.dataAluguel), formatarDataRevisaoEdicaoLocacao(rascunho.dataAluguel));
        adicionar('Previsão de devolução', formatarDataRevisaoEdicaoLocacao(original.dataDevolucaoPrevisao), formatarDataRevisaoEdicaoLocacao(rascunho.dataDevolucaoPrevisao));
        adicionar('Montagem', formatarPeriodoDetalhadoEdicaoLocacao(original.datasMontagem), formatarPeriodoDetalhadoEdicaoLocacao(rascunho.datasMontagem));
        adicionar('Desmontagem', formatarPeriodoDetalhadoEdicaoLocacao(original.datasDesmontagem), formatarPeriodoDetalhadoEdicaoLocacao(rascunho.datasDesmontagem));
        listaDatas.innerHTML = linhas.length ? linhas.join('') : '<li class="muted-note">Nenhuma alteração nas datas.</li>';
    }
    const avisos = [...(plano?.avisos || []), ...(plano?.conflitos || [])];
    if (alertas) {
        alertas.innerHTML = avisos.length
            ? avisos.map((aviso) => `<li>${escaparHTML(aviso.mensagem || aviso.codigo || 'Conferência operacional necessária.')}</li>`).join('')
            : '<li>Nenhum alerta operacional identificado.</li>';
        alertas.classList.toggle('has-warnings', avisos.length > 0);
    }
    const resumo = document.getElementById('editLocacaoRevisaoResumo');
    if (resumo) {
        resumo.textContent = `Reservar: ${plano?.resumo?.quantidadeReservar || 0}. Liberar: ${plano?.resumo?.quantidadeLiberar || 0}. Reprogramações de período: ${plano?.ajustes?.reprogramarPeriodo?.length || 0}.`;
    }
}

function revisarAlteracoesSessaoEdicaoLocacao() {
    if (!sessaoEdicaoLocacao || sessaoEdicaoLocacao.executando) return false;
    const validacao = validarSessaoEdicaoLocacao({ exibir: true, focar: true });
    const mensagem = document.getElementById('editLocacaoValidacao');
    if (!validacao.valido || !validacao.possuiAlteracoes) {
        if (mensagem) mensagem.textContent = validacao.mensagem || 'Revise os campos antes de continuar.';
        mostrarToast(validacao.mensagem || 'Revise os campos antes de continuar.', 'erro', 6200);
        atualizarEstadoConfirmacaoSessaoEdicaoLocacao(validacao);
        return false;
    }
    const assinatura = gerarAssinaturaPlanoAjusteLocacao(validacao.plano, {
        revisaoEsperada: sessaoEdicaoLocacao.revisaoEsperada
    });
    if (!assinatura?.ok) {
        mostrarToast('Não foi possível preparar uma revisão segura das alterações.', 'erro');
        return false;
    }
    sessaoEdicaoLocacao.revisaoPreparada = {
        plano: validacao.plano,
        assinatura: assinatura.assinatura
    };
    if (mensagem) mensagem.textContent = '';
    renderizarRevisaoSessaoEdicaoLocacao(validacao.plano);
    alternarEtapaSessaoEdicaoLocacao('revisao');
    setTimeout(() => document.getElementById('editLocacaoAplicar')?.focus({ preventScroll: true }), 0);
    return true;
}

function voltarEdicaoSessaoEdicaoLocacao() {
    if (!sessaoEdicaoLocacao || sessaoEdicaoLocacao.executando) return false;
    alternarEtapaSessaoEdicaoLocacao('edicao');
    atualizarEstadoConfirmacaoSessaoEdicaoLocacao();
    setTimeout(() => document.getElementById('editLocacaoConfirmar')?.focus({ preventScroll: true }), 0);
    return true;
}

function obterHistoricosOperacionaisEstadoEdicaoLocacao(estado) {
    return (Array.isArray(estado?.locacoes) ? estado.locacoes : []).flatMap((locacao) => (
        Array.isArray(locacao?.historicoOperacional) ? locacao.historicoOperacional : []
    ));
}

function confirmarEvidenciasOperacaoSessaoEdicaoLocacao(estado, locacao, revisaoPreparada) {
    if (!revisaoPreparada || typeof verificarEstadoOperacaoLocacao !== 'function') return false;
    const verificacao = verificarEstadoOperacaoLocacao({
        locacao,
        operacaoId: sessaoEdicaoLocacao.operacaoId,
        assinaturaPlano: revisaoPreparada.assinatura,
        plano: revisaoPreparada.plano,
        movimentacoes: Array.isArray(estado?.movimentacoesEstoque) ? estado.movimentacoesEstoque : [],
        historicoOperacional: obterHistoricosOperacionaisEstadoEdicaoLocacao(estado)
    });
    return verificacao?.valido === true && verificacao?.estado === 'concluida';
}

function obterResponsavelSessaoEdicaoLocacao() {
    try {
        return String(localStorage.getItem('usuarioEmail') || 'Offline').trim() || 'Offline';
    } catch (_erro) {
        return 'Offline';
    }
}

function recarregarSessaoEdicaoLocacaoAposDivergencia(locacaoAtual) {
    const copiaCompleta = clonarJsonPersistivelEstrito(locacaoAtual);
    const rascunho = copiaCompleta.ok ? clonarJsonPersistivelEstrito({
        items: copiaCompleta.valor.items,
        dataAluguel: copiaCompleta.valor.dataAluguel,
        dataDevolucaoPrevisao: copiaCompleta.valor.dataDevolucaoPrevisao,
        datasMontagem: copiaCompleta.valor.datasMontagem || {},
        datasDesmontagem: copiaCompleta.valor.datasDesmontagem || {}
    }) : null;
    const controle = normalizarControleEdicaoLocacao(locacaoAtual);
    if (!copiaCompleta.ok || !rascunho?.ok || !controle?.valido) return false;
    sessaoEdicaoLocacao.originalIsolado = copiaCompleta.valor;
    sessaoEdicaoLocacao.rascunho = rascunho.valor;
    sessaoEdicaoLocacao.revisaoEsperada = controle.revisao;
    sessaoEdicaoLocacao.revisaoPreparada = null;
    sessaoEdicaoLocacao.bloqueada = false;
    preencherInterfaceSessaoEdicaoLocacao(locacaoAtual);
    alternarEtapaSessaoEdicaoLocacao('edicao');
    definirEstadoControlesSessaoEdicaoLocacao(false, false);
    atualizarEstadoConfirmacaoSessaoEdicaoLocacao();
    return true;
}

function finalizarSessaoEdicaoLocacaoConfirmada(resultado, opcoes = {}) {
    const deveRenderizar = resultado?.efeitos?.renderizar === true;
    const deveSincronizar = resultado?.efeitos?.sincronizar === true;
    const syncPendente = (resultado?.avisos || []).some((aviso) => aviso?.codigo === 'METADADO_SYNC_PENDENTE');
    cancelarSessaoEdicaoLocacao({ forcar: true, restaurarFoco: false });
    if (deveRenderizar && typeof renderTudo === 'function') {
        try {
            renderTudo();
        } catch (erro) {
            console.error('Alteração confirmada, mas a atualização visual falhou:', erro);
            mostrarToast('Alterações aplicadas. Atualize a tela para recarregar a visualização.', 'info', 7200);
        }
    }
    if (deveSincronizar && typeof sincronizar === 'function') {
        try {
            const sincronizacao = sincronizar('salvar');
            if (sincronizacao && typeof sincronizacao.catch === 'function') {
                sincronizacao.catch((erro) => {
                    console.error('Alteração confirmada, mas a sincronização falhou:', erro);
                    mostrarToast('Alterações aplicadas localmente. A sincronização ficou pendente.', 'info', 7200);
                });
            }
        } catch (erro) {
            console.error('Alteração confirmada, mas a sincronização não iniciou:', erro);
            mostrarToast('Alterações aplicadas localmente. A sincronização ficou pendente.', 'info', 7200);
        }
    }
    if (syncPendente) {
        mostrarToast('Alterações aplicadas. A atualização do marcador de sincronização ficou pendente.', 'info', 7200);
    } else {
        mostrarToast(opcoes.idempotente ? 'As alterações já estavam aplicadas.' : 'Locação atualizada com segurança.', 'sucesso');
    }
}

function executarAlteracoesSessaoEdicaoLocacao() {
    if (!sessaoEdicaoLocacao || sessaoEdicaoLocacao.executando || execucaoSessaoEdicaoLocacaoEmAndamento) return false;
    const revisaoPreparada = sessaoEdicaoLocacao.revisaoPreparada;
    if (sessaoEdicaoLocacao.etapa !== 'revisao' || !revisaoPreparada) {
        mostrarToast('Revise as alterações antes de aplicá-las.', 'erro');
        return false;
    }

    const { estado, contexto } = obterContextoAtualSessaoEdicaoLocacao();
    const locacoesAtuais = (Array.isArray(estado?.locacoes) ? estado.locacoes : [])
        .filter((item) => String(item?.id ?? '') === sessaoEdicaoLocacao.locacaoId);
    if (locacoesAtuais.length !== 1) {
        mostrarToast('A locação não pôde ser identificada com segurança.', 'erro');
        return false;
    }
    const locacaoAtual = locacoesAtuais[0];
    const controleAtual = normalizarControleEdicaoLocacao(locacaoAtual);
    if (!controleAtual?.valido) {
        mostrarToast('O controle de revisão da locação precisa ser conferido.', 'erro');
        return false;
    }

    let assinaturaExecucao = revisaoPreparada.assinatura;
    let planoExecucao = revisaoPreparada.plano;
    const mesmaOperacaoJaRegistrada = controleAtual.ultimaOperacaoId === sessaoEdicaoLocacao.operacaoId;
    if (!mesmaOperacaoJaRegistrada) {
        if (controleAtual.revisao !== sessaoEdicaoLocacao.revisaoEsperada) {
            recarregarSessaoEdicaoLocacaoAposDivergencia(locacaoAtual);
            mostrarToast('Esta locação foi modificada. Os dados atuais foram carregados; faça uma nova revisão.', 'erro', 7600);
            return false;
        }
        const elegibilidade = obterElegibilidadeEdicaoLocacao(locacaoAtual);
        if (!elegibilidade.permitida) {
            mostrarToast(elegibilidade.mensagem, 'erro', 6800);
            return false;
        }
        planoExecucao = planejarAjusteReservaLocacao(locacaoAtual, sessaoEdicaoLocacao.rascunho, contexto);
        if (!planoExecucao?.valido || planoExecucao?.bloqueios?.length) {
            alternarEtapaSessaoEdicaoLocacao('edicao');
            const bloqueio = planoExecucao?.bloqueios?.[0] || {};
            marcarCampoInvalidoSessaoEdicaoLocacao(bloqueio, true);
            mostrarToast(bloqueio.mensagem || 'As alterações deixaram de ser válidas. Revise o rascunho.', 'erro', 7200);
            return false;
        }
        const assinaturaAtual = gerarAssinaturaPlanoAjusteLocacao(planoExecucao, {
            revisaoEsperada: sessaoEdicaoLocacao.revisaoEsperada
        });
        if (!assinaturaAtual?.ok) {
            mostrarToast('Não foi possível confirmar a assinatura das alterações.', 'erro');
            return false;
        }
        assinaturaExecucao = assinaturaAtual.assinatura;
        if (assinaturaExecucao !== revisaoPreparada.assinatura) {
            sessaoEdicaoLocacao.revisaoPreparada = { plano: planoExecucao, assinatura: assinaturaExecucao };
            renderizarRevisaoSessaoEdicaoLocacao(planoExecucao);
            mostrarToast('O contexto operacional mudou. Revise novamente antes de aplicar.', 'info', 6500);
            return false;
        }
    }

    const instante = new Date();
    const atualizadoEm = instante.toISOString();
    const ultimaEdicao = instante.getTime();
    const entrada = {
        locacaoId: locacaoAtual.id,
        dadosEditados: sessaoEdicaoLocacao.rascunho,
        operacaoId: sessaoEdicaoLocacao.operacaoId,
        revisaoEsperada: sessaoEdicaoLocacao.revisaoEsperada,
        assinaturaPlanoEsperada: assinaturaExecucao,
        atualizadoEm,
        atualizadoPor: obterResponsavelSessaoEdicaoLocacao(),
        persistencia: {
            versao: window.SCHEMA_VERSION_V12 || '12.6',
            data: atualizadoEm,
            ultimaEdicao
        }
    };

    sessaoEdicaoLocacao.executando = true;
    execucaoSessaoEdicaoLocacaoEmAndamento = true;
    alternarEtapaSessaoEdicaoLocacao('executando');
    definirEstadoControlesSessaoEdicaoLocacao(true, false);
    const botao = document.getElementById('editLocacaoAplicar');
    const htmlOriginal = botao?.innerHTML || '';
    if (botao) {
        botao.innerHTML = '<span class="inline-loader" aria-hidden="true"></span> Aplicando...';
        botao.setAttribute('aria-busy', 'true');
    }

    let resultado;
    try {
        const dependencias = criarDependenciasExecutorAjusteLocacao({ armazenamento: localStorage });
        resultado = executarAjusteReservaLocacao(entrada, dependencias);
    } catch (erro) {
        resultado = { ok: false, codigo: 'FALHA_INTEGRACAO_EXECUTOR', bloqueios: [{ mensagem: String(erro?.message || erro) }], efeitos: {} };
    } finally {
        execucaoSessaoEdicaoLocacaoEmAndamento = false;
        if (sessaoEdicaoLocacao) sessaoEdicaoLocacao.executando = false;
        if (botao) {
            botao.innerHTML = htmlOriginal;
            botao.setAttribute('aria-busy', 'false');
        }
    }

    if (resultado?.codigo === 'AJUSTE_APLICADO' && resultado.ok) {
        finalizarSessaoEdicaoLocacaoConfirmada(resultado);
        return true;
    }
    if (resultado?.codigo === 'OPERACAO_JA_CONCLUIDA' && resultado.ok) {
        const estadoAtual = typeof obterEstadoMemoriaAtual === 'function' ? obterEstadoMemoriaAtual() : estado;
        const locacaoConfirmada = (estadoAtual.locacoes || []).find((item) => String(item?.id ?? '') === sessaoEdicaoLocacao.locacaoId);
        if (confirmarEvidenciasOperacaoSessaoEdicaoLocacao(estadoAtual, locacaoConfirmada, revisaoPreparada)) {
            finalizarSessaoEdicaoLocacaoConfirmada(resultado, { idempotente: true });
            return true;
        }
        resultado = { ...resultado, ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', requerRecuperacao: true };
    }
    if (resultado?.codigo === 'REVISAO_DIVERGENTE') {
        const atual = obterLocacaoAtualSessaoEdicaoLocacao();
        if (atual) recarregarSessaoEdicaoLocacaoAposDivergencia(atual);
        mostrarToast('Esta locação foi modificada. Revise novamente os dados atuais.', 'erro', 7200);
        return false;
    }
    if (resultado?.requerRecuperacao
        || ['OPERACAO_REQUER_RECUPERACAO', 'ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', 'PERSISTENCIA_INDETERMINADA'].includes(resultado?.codigo)) {
        sessaoEdicaoLocacao.bloqueada = true;
        alternarEtapaSessaoEdicaoLocacao('revisao');
        definirEstadoControlesSessaoEdicaoLocacao(false, true);
        mostrarToast('A operação exige recuperação explícita. Nenhuma nova tentativa automática foi feita.', 'erro', 8500);
        return false;
    }

    alternarEtapaSessaoEdicaoLocacao('revisao');
    definirEstadoControlesSessaoEdicaoLocacao(false, false);
    const mensagem = resultado?.bloqueios?.[0]?.mensagem || 'Não foi possível aplicar as alterações com segurança.';
    mostrarToast(mensagem, 'erro', 7200);
    return false;
}

function abrirEdicaoLocacao(locacaoId, elementoAcionador = null) {
    if (sessaoEdicaoLocacao) {
        mostrarToast('Já existe uma edição de locação aberta. Cancele-a antes de iniciar outra.', 'info', 5200);
        return false;
    }
    const correspondencias = (Array.isArray(locacoes) ? locacoes : [])
        .filter((item) => String(item?.id ?? '') === String(locacaoId ?? ''));
    if (correspondencias.length !== 1) {
        mostrarToast('Não foi possível identificar uma única locação para edição.', 'erro');
        return false;
    }

    const locacao = correspondencias[0];
    const elegibilidade = obterElegibilidadeEdicaoLocacao(locacao);
    if (!elegibilidade.permitida) {
        mostrarToast(elegibilidade.mensagem, 'erro', 6500);
        return false;
    }

    const copiaCompleta = clonarJsonPersistivelEstrito(locacao);
    if (!copiaCompleta.ok) {
        mostrarToast('Não foi possível criar um rascunho isolado desta locação.', 'erro');
        return false;
    }
    const rascunho = clonarJsonPersistivelEstrito({
        items: copiaCompleta.valor.items,
        dataAluguel: copiaCompleta.valor.dataAluguel,
        dataDevolucaoPrevisao: copiaCompleta.valor.dataDevolucaoPrevisao,
        datasMontagem: copiaCompleta.valor.datasMontagem || {},
        datasDesmontagem: copiaCompleta.valor.datasDesmontagem || {}
    });
    if (!rascunho.ok) {
        mostrarToast('Não foi possível preparar os campos editáveis da locação.', 'erro');
        return false;
    }
    const controle = normalizarControleEdicaoLocacao(locacao);
    if (!controle?.valido) {
        mostrarToast('O controle de revisão desta locação precisa ser conferido antes da edição.', 'erro');
        return false;
    }
    const operacaoId = gerarOperacaoIdSessaoEdicaoLocacao(locacao.id, controle.revisao);
    if (!operacaoId) {
        mostrarToast('Não foi possível criar um identificador seguro para esta edição.', 'erro');
        return false;
    }

    sessaoEdicaoLocacao = {
        locacaoId: String(locacao.id),
        rascunho: rascunho.valor,
        originalIsolado: copiaCompleta.valor,
        acionador: elementoAcionador instanceof HTMLElement ? elementoAcionador : document.activeElement,
        operacaoId,
        revisaoEsperada: controle.revisao,
        revisaoPreparada: null,
        etapa: 'edicao',
        executando: false,
        bloqueada: false
    };
    registrarEventosSessaoEdicaoLocacao();
    preencherInterfaceSessaoEdicaoLocacao(locacao);
    alternarEtapaSessaoEdicaoLocacao('edicao');
    definirEstadoControlesSessaoEdicaoLocacao(false, false);
    const validacao = document.getElementById('editLocacaoValidacao');
    if (validacao) validacao.textContent = '';
    const modal = document.getElementById('modalEditarLocacaoOperacional');
    modal?.classList.add('active');
    modal?.setAttribute('aria-hidden', 'false');
    setTimeout(() => document.getElementById('editLocacaoDataAluguel')?.focus({ preventScroll: true }), 0);
    return true;
}

function removerItemSessaoEdicaoLocacao(itemId) {
    if (!sessaoEdicaoLocacao || sessaoEdicaoLocacao.executando || sessaoEdicaoLocacao.etapa !== 'edicao') return false;
    sessaoEdicaoLocacao.rascunho.items = sessaoEdicaoLocacao.rascunho.items
        .filter((item) => String(item?.itemId || '') !== String(itemId || ''));
    sessaoEdicaoLocacao.revisaoPreparada = null;
    renderizarItensSessaoEdicaoLocacao();
    return true;
}

function adicionarItemSessaoEdicaoLocacao() {
    if (!sessaoEdicaoLocacao || sessaoEdicaoLocacao.executando || sessaoEdicaoLocacao.etapa !== 'edicao') return false;
    const seletor = document.getElementById('editLocacaoNovoItem');
    const peca = (Array.isArray(pecas) ? pecas : []).find((item) => String(item?.id ?? '') === String(seletor?.value ?? ''));
    if (!peca) {
        mostrarToast('Selecione um item para adicionar ao rascunho.', 'erro');
        seletor?.focus();
        return false;
    }
    const usados = new Set(sessaoEdicaoLocacao.rascunho.items.map((item) => String(item?.itemId || '')).filter(Boolean));
    const itemId = typeof criarItemIdLocacao === 'function'
        ? criarItemIdLocacao(sessaoEdicaoLocacao.locacaoId, sessaoEdicaoLocacao.rascunho.items.length, usados)
        : `loc-${sessaoEdicaoLocacao.locacaoId}-item-${sessaoEdicaoLocacao.rascunho.items.length + 1}`;
    sessaoEdicaoLocacao.rascunho.items.push({
        itemId,
        pecaId: peca.id,
        nome: peca.nome,
        valor: Number(peca.valor) || 0,
        quantidade: 1,
        origemCusto: 'proprio',
        quantidadePropria: 1,
        quantidadeTerceirizada: 0
    });
    sessaoEdicaoLocacao.revisaoPreparada = null;
    seletor.value = '';
    renderizarItensSessaoEdicaoLocacao();
    return true;
}

function cancelarSessaoEdicaoLocacao(opcoes = {}) {
    if (!sessaoEdicaoLocacao) return false;
    if (sessaoEdicaoLocacao.executando && opcoes.forcar !== true) {
        mostrarToast('Aguarde a conclusão segura da operação.', 'info');
        return false;
    }
    const acionador = sessaoEdicaoLocacao.acionador;
    sessaoEdicaoLocacao = null;
    const modal = document.getElementById('modalEditarLocacaoOperacional');
    modal?.classList.remove('active');
    modal?.setAttribute('aria-hidden', 'true');
    const corpo = document.getElementById('editLocacaoItens');
    if (corpo) corpo.textContent = '';
    limparErrosSessaoEdicaoLocacao();
    setTimeout(() => {
        if (opcoes.restaurarFoco !== false && acionador instanceof HTMLElement && document.contains(acionador)) {
            acionador.focus({ preventScroll: true });
        }
    }, 0);
    return true;
}

function obterDisponivelPecaLocacao(peca) {
    if (!peca) return 0;
    const normalizada = typeof normalizarPecaDominio === 'function' ? normalizarPecaDominio(peca) : peca;
    return Math.max(parseInt(normalizada?.disponivel, 10) || 0, 0);
}

function obterIntervaloFormularioLocacao() {
    if (typeof normalizarIntervaloPeriodoEstoque !== 'function') return null;
    return normalizarIntervaloPeriodoEstoque(
        document.getElementById('aluguelIni')?.value,
        document.getElementById('aluguelFim')?.value
    );
}

function consultarDisponibilidadePecaFormularioLocacao(peca, opcoes = {}) {
    const intervalo = obterIntervaloFormularioLocacao();
    if (!intervalo?.completo || typeof consultarDisponibilidadeItemPeriodo !== 'function') {
        return {
            disponivel: obterDisponivelPecaLocacao(peca),
            intervalo,
            valido: Boolean(intervalo?.completo)
        };
    }
    return consultarDisponibilidadeItemPeriodo(peca, intervalo, opcoes);
}

function validarDisponibilidadeCarrinhoLocacao(opcoes = {}) {
    const exibirErro = opcoes.exibirErro !== false;
    const intervalo = obterIntervaloFormularioLocacao();
    if (!intervalo?.completo || typeof consultarDisponibilidadeItemPeriodo !== 'function') {
        return false;
    }

    if (document.getElementById('aluguelItemSelect')?.value) {
        const estadoQuantidade = validarQuantidadeItemFormularioLocacao({
            exibirToast: exibirErro,
            focar: exibirErro
        });
        if (!estadoQuantidade.valido) return false;
    }

    const totaisPorPeca = new Map();
    carrinhoLocacao.forEach((item) => {
        const pecaId = String(item?.pecaId || '');
        if (!pecaId) return;
        const quantidade = typeof obterQuantidadePropriaOperacional === 'function'
            ? obterQuantidadePropriaOperacional(item)
            : Math.max(parseInt(item?.quantidade, 10) || 0, 0);
        totaisPorPeca.set(pecaId, (totaisPorPeca.get(pecaId) || 0) + quantidade);
    });

    for (const [pecaId, solicitado] of totaisPorPeca.entries()) {
        const peca = pecas.find((item) => String(item?.id || '') === pecaId);
        const consulta = consultarDisponibilidadeItemPeriodo(peca, intervalo, {
            ignorarLocacaoId: opcoes.ignorarLocacaoId
        });
        if (!consulta.valido || solicitado > consulta.disponivel) {
            if (exibirErro) {
                const mensagem = consulta.valido
                    ? formatarMensagemDisponibilidadeEstoque({
                        item: peca?.nome || 'Item de estoque',
                        solicitado,
                        consulta
                    })
                    : formatarMensagemDisponibilidadeEstoque({
                        tipo: 'intervalo_invalido',
                        consulta
                    });
                mostrarToast(mensagem, 'erro', 6500);
                focarCampoLocacao(consulta.valido ? 'inputBuscaPeca' : 'aluguelFim');
            }
            return false;
        }
    }

    return true;
}

function sincronizarFinanceiroLocacao(localLocacao) {
    if (!localLocacao || typeof localLocacao !== 'object') return localLocacao;
    if (typeof normalizarLocacaoDominio === 'function') {
        return normalizarLocacaoDominio(localLocacao, { incluirDerivados: false });
    }
    return localLocacao;
}

function abrirPropostaOriginalDaLocacao(locacaoId) {
    const locacao = Array.isArray(locacoes)
        ? locacoes.find((item) => String(item?.id || '') === String(locacaoId || ''))
        : null;
    if (!locacao) {
        mostrarToast('Locação não encontrada para abrir a proposta original.', 'erro');
        return false;
    }

    const propostaId = String(
        locacao.propostaOrigemId
        || locacao.origemPropostaId
        || locacao.origem?.propostaId
        || ''
    );
    if (!propostaId) {
        mostrarToast('Esta locação não possui uma proposta de origem vinculada.', 'info', 5200);
        return false;
    }

    const propostaExiste = Array.isArray(propostas)
        && propostas.some((item) => String(item?.id || '') === propostaId);
    if (!propostaExiste || typeof window.editarProposta !== 'function') {
        mostrarToast('A proposta original não está disponível nesta base.', 'erro', 5200);
        return false;
    }

    if (typeof window.irParaPropostasFormulario === 'function') {
        window.irParaPropostasFormulario();
    }
    window.editarProposta(propostaId);
    return true;
}

function parseValorFinanceiroLocacao(valor) {
    const limpo = String(valor ?? '')
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(',', '.');
    if (!/\d/.test(limpo)) return NaN;
    const numero = Number(limpo);
    return Number.isFinite(numero) ? numero : NaN;
}

function formatarValorPromptFinanceiro(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function obterLocacaoPagamentoPorId(id) {
    return locacoes.find((x) => String(x.id) === String(id));
}

function obterResumoPagamentoLocacao(locacao) {
    const financeiroAtual = locacao?.financeiro || {};
    const valorTotal = typeof calcularValorLocacaoDominio === 'function'
        ? calcularValorLocacaoDominio(locacao)
        : Math.max(0, parseValorFinanceiroLocacao(
            financeiroAtual.valorTotal ?? locacao?.valorTotalCalculado ?? 0
        ) || 0);
    const sinalNormalizado = typeof normalizarValorMonetarioLegado === 'function'
        ? normalizarValorMonetarioLegado(financeiroAtual.sinal ?? locacao?.sinal)
        : parseValorFinanceiroLocacao(financeiroAtual.sinal ?? locacao?.sinal);
    const sinalAtual = Math.max(0, sinalNormalizado ?? 0);
    const restanteNormalizado = typeof normalizarValorMonetarioLegado === 'function'
        ? normalizarValorMonetarioLegado(financeiroAtual.valorRestante)
        : parseValorFinanceiroLocacao(financeiroAtual.valorRestante);
    const valorRestante = Math.max(
        0,
        restanteNormalizado ?? Math.max(valorTotal - sinalAtual, 0)
    );
    const recebidoAtual = Math.min(Math.max(sinalAtual, valorTotal - valorRestante, 0), valorTotal);

    return {
        financeiroAtual,
        valorTotal,
        sinalAtual,
        valorRestante,
        recebidoAtual
    };
}

function calcularStatusPagamentoLocacao(valorTotal, valorRecebido) {
    const total = Math.max(0, Number(valorTotal) || 0);
    const recebido = Math.max(0, Number(valorRecebido) || 0);
    const novoRestante = Math.max(total - recebido, 0);

    return {
        valorRecebido: Math.min(recebido, total),
        novoRestante,
        statusPagamento: recebido <= 0
            ? 'pendente'
            : novoRestante <= 0
                ? 'pago'
                : 'parcial'
    };
}

function classeBadgePagamentoLocacao(statusPagamento) {
    const chave = String(statusPagamento || '').toLowerCase();
    if (chave === 'pago') return 'badge-success';
    if (chave === 'atrasado' || chave === 'invalido') return 'badge-danger';
    if (chave === 'parcial') return 'badge-info';
    return 'badge-warning';
}

function atualizarBadgePreviewPagamento(statusPagamento, rotuloCustomizado) {
    const badge = document.getElementById('pagamentoLocacaoNovoStatus');
    if (!badge) return;

    const rotulo = rotuloCustomizado || rotuloStatusPagamentoLocacao(statusPagamento, statusPagamento === 'pago');
    badge.textContent = String(rotulo || 'Pendente').toUpperCase();
    badge.className = `badge ${classeBadgePagamentoLocacao(statusPagamento)}`;
}

function atualizarTextoElemento(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
}

function aplicarRecebimentoLocacao(locacao, valorRecebido, origem = 'financeiro') {
    if (!locacao) return false;

    const resumo = obterResumoPagamentoLocacao(locacao);
    const calculo = calcularStatusPagamentoLocacao(resumo.valorTotal, valorRecebido);

    locacao.pago = calculo.statusPagamento === 'pago';
    locacao.financeiro = {
        ...resumo.financeiroAtual,
        sinal: calculo.valorRecebido,
        valorRestante: calculo.novoRestante,
        statusPagamento: calculo.statusPagamento
    };

    const normalizada = sincronizarFinanceiroLocacao(locacao);
    if (normalizada) Object.assign(locacao, normalizada);

    if (typeof registrarHistoricoLocacaoDominio === 'function') {
        registrarHistoricoLocacaoDominio(locacao, {
            acao: 'financeiro_status',
            descricao: `Pagamento atualizado para ${rotuloStatusPagamentoLocacao(calculo.statusPagamento, locacao.pago)}.`,
            origem
        });
    }

    salvarLocal();
    renderLocacoes();
    if (typeof renderFinanceiroResumo === 'function') renderFinanceiroResumo();
    renderStats();
    sincronizar('salvar');
    mostrarToast(`Pagamento ${rotuloStatusPagamentoLocacao(calculo.statusPagamento, locacao.pago).toLowerCase()} atualizado.`);

    return true;
}

function solicitarPagamentoPromptLocacao(locacao) {
    const resumo = obterResumoPagamentoLocacao(locacao);
    const informado = prompt(
        'Informe o valor ja recebido desta locacao:',
        formatarValorPromptFinanceiro(resumo.recebidoAtual)
    );
    if (informado === null) return;

    const valorRecebido = parseValorFinanceiroLocacao(informado);
    if (!Number.isFinite(valorRecebido)) {
        mostrarToast('Valor recebido invalido.', 'erro');
        return;
    }

    aplicarRecebimentoLocacao(locacao, Math.min(Math.max(valorRecebido, 0), resumo.valorTotal), 'financeiro');
}

function focarCampoLocacao(idCampo) {
    const campo = document.getElementById(idCampo);
    if (!campo) return;
    setTimeout(() => {
        try {
            campo.focus({ preventScroll: false });
        } catch (_) {
            campo.focus();
        }
    }, 40);
}

const ERROS_CAMPOS_LOCACAO = Object.freeze({
    aluguelCliente: 'aluguelClienteErro',
    aluguelDivisor: 'aluguelDivisorErro',
    aluguelIni: 'aluguelIniErro',
    aluguelFim: 'aluguelFimErro'
});

function limparErroCampoLocacao(idCampo) {
    const campo = document.getElementById(idCampo);
    const erro = document.getElementById(ERROS_CAMPOS_LOCACAO[idCampo]);
    campo?.removeAttribute('aria-invalid');
    if (erro) {
        erro.textContent = '';
        erro.hidden = true;
    }
}

function informarErroCampoLocacao(idCampo, mensagem, opcoes = {}) {
    const campo = document.getElementById(idCampo);
    const erro = document.getElementById(ERROS_CAMPOS_LOCACAO[idCampo]);
    if (campo) campo.setAttribute('aria-invalid', 'true');
    if (erro) {
        erro.textContent = mensagem;
        erro.hidden = false;
    }
    if (opcoes.toast !== false) mostrarToast(mensagem, 'erro');
    if (opcoes.focar !== false) focarCampoLocacao(idCampo);
}

function obterDivisorFormularioLocacao() {
    const valor = String(document.getElementById('aluguelDivisor')?.value ?? '').trim();
    if (!valor) return null;
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0 || numero > 1) return null;
    return numero;
}

function normalizarFiltroLocacoes(valor) {
    const filtro = String(valor || '').trim().toLowerCase();
    return FILTROS_LOCACOES_VALIDOS.has(filtro) ? filtro : 'todos';
}

function restaurarFiltroLocacoesPersistido() {
    try {
        const salvo = localStorage.getItem(CHAVE_FILTRO_LOCACOES);
        filtroAtual = normalizarFiltroLocacoes(salvo || filtroAtual);
    } catch (_) {
        filtroAtual = normalizarFiltroLocacoes(filtroAtual);
    }
}

function persistirFiltroLocacoesAtual() {
    try {
        localStorage.setItem(CHAVE_FILTRO_LOCACOES, normalizarFiltroLocacoes(filtroAtual));
    } catch (_) {
        // Ignore falhas de storage e mantém experiência padrão.
    }
}

restaurarFiltroLocacoesPersistido();

function obterOpcoesSugestoesLocacao() {
    const lista = document.getElementById('listaSugestoes');
    return lista ? Array.from(lista.querySelectorAll('[role="option"]')) : [];
}

function fecharSugestoesLocacao() {
    const campo = document.getElementById('inputBuscaPeca');
    const lista = document.getElementById('listaSugestoes');
    if (lista) {
        lista.classList.remove('ativo');
        obterOpcoesSugestoesLocacao().forEach((opcao) => {
            opcao.classList.remove('is-active');
            opcao.setAttribute('aria-selected', 'false');
        });
    }
    if (campo) {
        campo.setAttribute('aria-expanded', 'false');
        campo.removeAttribute('aria-activedescendant');
    }
    indiceSugestaoLocacaoAtiva = -1;
}

function abrirSugestoesLocacao() {
    const campo = document.getElementById('inputBuscaPeca');
    const lista = document.getElementById('listaSugestoes');
    if (!campo || !lista) return;
    lista.classList.add('ativo');
    campo.setAttribute('aria-expanded', 'true');
}

function ativarSugestaoLocacao(indice) {
    const campo = document.getElementById('inputBuscaPeca');
    const opcoes = obterOpcoesSugestoesLocacao();
    if (!campo || opcoes.length === 0) return;

    indiceSugestaoLocacaoAtiva = (indice + opcoes.length) % opcoes.length;
    opcoes.forEach((opcao, opcaoIndice) => {
        const ativa = opcaoIndice === indiceSugestaoLocacaoAtiva;
        opcao.classList.toggle('is-active', ativa);
        opcao.setAttribute('aria-selected', ativa ? 'true' : 'false');
    });
    const ativa = opcoes[indiceSugestaoLocacaoAtiva];
    campo.setAttribute('aria-activedescendant', ativa.id);
    ativa.scrollIntoView({ block: 'nearest' });
}

function selecionarSugestaoLocacao(peca) {
    const campoBusca = document.getElementById('inputBuscaPeca');
    const campoItem = document.getElementById('aluguelItemSelect');
    const campoQuantidade = document.getElementById('aluguelQtd');
    if (!peca || !campoBusca || !campoItem || !campoQuantidade) return;

    campoBusca.value = peca.nome;
    campoItem.value = peca.id;
    fecharSugestoesLocacao();
    atualizarLimiteEstoque({ preservarQuantidade: false });
    campoQuantidade.focus();
}

function navegarSugestoesLocacao(evento) {
    const lista = document.getElementById('listaSugestoes');
    const opcoes = obterOpcoesSugestoesLocacao();
    if (!lista || !lista.classList.contains('ativo')) {
        if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') filtrarItensLocacao();
    }

    const opcoesAtuais = obterOpcoesSugestoesLocacao();
    if (evento.key === 'ArrowDown' && opcoesAtuais.length) {
        evento.preventDefault();
        ativarSugestaoLocacao(indiceSugestaoLocacaoAtiva + 1);
        return;
    }
    if (evento.key === 'ArrowUp' && opcoesAtuais.length) {
        evento.preventDefault();
        ativarSugestaoLocacao(indiceSugestaoLocacaoAtiva <= 0
            ? opcoesAtuais.length - 1
            : indiceSugestaoLocacaoAtiva - 1);
        return;
    }
    if (evento.key === 'Enter' && indiceSugestaoLocacaoAtiva >= 0) {
        evento.preventDefault();
        opcoesAtuais[indiceSugestaoLocacaoAtiva]?.click();
        return;
    }
    if (evento.key === 'Escape') {
        evento.preventDefault();
        fecharSugestoesLocacao();
    }
}

function inicializarAutocompleteLocacao() {
    const campo = document.getElementById('inputBuscaPeca');
    if (!campo || campo.dataset.autocompleteLocacaoBound === '1') return;

    campo.addEventListener('keydown', navegarSugestoesLocacao);
    campo.addEventListener('input', () => {
        const itemSelecionado = document.getElementById('aluguelItemSelect');
        const pecaSelecionada = pecas.find((peca) => String(peca?.id || '') === String(itemSelecionado?.value || ''));
        if (pecaSelecionada && String(campo.value || '') !== String(pecaSelecionada.nome || '')) {
            itemSelecionado.value = '';
            const quantidade = document.getElementById('aluguelQtd');
            quantidade?.removeAttribute('max');
            quantidade?.removeAttribute('aria-invalid');
            const aviso = document.getElementById('avisoEstoque');
            if (aviso) aviso.textContent = '';
        }
    });
    campo.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement?.closest('#listaSugestoes')) fecharSugestoesLocacao();
        }, 100);
    });
    campo.dataset.autocompleteLocacaoBound = '1';
}

function filtrarItensLocacao(evento) {
    const termoInput = document.getElementById('inputBuscaPeca');
    const lista = document.getElementById('listaSugestoes');
    if (!termoInput || !lista) return;

    if (evento && ['ArrowDown', 'ArrowUp', 'Enter'].includes(evento.key)) return;
    if (evento?.key === 'Escape') {
        if (!termoInput.value) {
            const itemSelecionado = document.getElementById('aluguelItemSelect');
            if (itemSelecionado) itemSelecionado.value = '';
            document.getElementById('aluguelQtd')?.removeAttribute('max');
            document.getElementById('aluguelQtd')?.removeAttribute('aria-invalid');
            const aviso = document.getElementById('avisoEstoque');
            if (aviso) aviso.textContent = '';
        }
        fecharSugestoesLocacao();
        return;
    }

    const normalizar = (t) => t ? t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
    const termo = normalizar(termoInput.value);

    lista.innerHTML = '';
    indiceSugestaoLocacaoAtiva = -1;
    termoInput.removeAttribute('aria-activedescendant');
    if (termo.length < 1) {
        const itemSelecionado = document.getElementById('aluguelItemSelect');
        if (itemSelecionado) itemSelecionado.value = '';
        document.getElementById('aluguelQtd')?.removeAttribute('max');
        document.getElementById('aluguelQtd')?.removeAttribute('aria-invalid');
        fecharSugestoesLocacao();
        return;
    }

    const termos = termo.split(/\s+/).filter(Boolean);

    const scorePeca = (p) => {
        const nome = normalizar(p.nome);
        const codigo = normalizar(p.codigo);
        const medida = normalizar(p.medida);
        const tipo = tipos.find((t) => t.id === p.tipoId);
        const categoria = tipo ? normalizar(tipo.nome) : '';
        const alvo = `${nome} ${codigo} ${categoria} ${medida}`.trim();

        const ok = termos.every((t) => alvo.includes(t));
        if (!ok) return -1;

        let score = 0;
        if (nome.startsWith(termo)) score += 100;
        if (codigo.startsWith(termo)) score += 90;
        if (nome.includes(termo)) score += 60;
        if (codigo.includes(termo)) score += 50;

        termos.forEach((t) => {
            if (nome.startsWith(t)) score += 15;
            if (codigo.startsWith(t)) score += 10;
        });

        score += (consultarDisponibilidadePecaFormularioLocacao(p).disponivel > 0 ? 5 : 0);
        return score;
    };

    const filtrados = pecas
        .map((p) => ({ p, s: scorePeca(p) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 20)
        .map((x) => x.p);

    if (filtrados.length === 0) {
        lista.innerHTML = '<div class="sugestao-item"><span>Nenhum item encontrado</span></div>';
        abrirSugestoesLocacao();
        return;
    }

    filtrados.forEach((p, indice) => {
        const disponivelPeriodo = consultarDisponibilidadePecaFormularioLocacao(p).disponivel;
        const item = document.createElement('div');
        item.className = 'sugestao-item';
        item.id = `locacao-sugestao-${String(p.id || indice).replace(/[^a-zA-Z0-9_-]/g, '-')}-${indice}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        item.innerHTML = `<span>${p.nome} <small style="opacity:0.6">[${p.codigo}]</small></span>
                          <span class="sugestao-estoque">(Disp. no período: ${disponivelPeriodo})</span>`;
        item.addEventListener('click', () => selecionarSugestaoLocacao(p));
        lista.appendChild(item);
    });
    abrirSugestoesLocacao();
}

function formatarMoedaBR(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function escaparHTML(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function criarEstadoLocacaoPainel(opcoes = {}) {
    if (typeof criarEstadoPainel === 'function') {
        return criarEstadoPainel(opcoes.mensagem, {
            tipo: opcoes.tipo || 'info',
            titulo: opcoes.titulo || 'Informação',
            compacto: opcoes.compacto === true
        });
    }
    return `<small class="muted-note">${escaparHTML(opcoes.mensagem || 'Sem dados para mostrar.')}</small>`;
}

function parseDataIso(dataIso) {
    if (!dataIso) return null;
    const data = new Date(`${dataIso}T00:00:00`);
    return Number.isNaN(data.getTime()) ? null : data;
}

function validarIdClienteLocacao(id) {
    return normalizarIdEntidadeExato(id).valido === true;
}

function idsClienteLocacaoIguais(idA, idB) {
    return idsEntidadeExatos(idA, idB);
}

function resolverClienteLocacaoPorIdPersistido(id, clientes = locadores) {
    const resultado = resolverClientePorIdExato(clientes, id);
    return resultado.encontrado ? resultado.cliente : null;
}

function criarReferenciaTipadaClienteLocacao(id) {
    return criarReferenciaTipadaCliente(id);
}

function resolverClienteLocacaoPorReferencia(referencia, clientes = locadores) {
    const resultado = resolverClientePorReferenciaTipada(clientes, referencia);
    return {
        valido: resultado.encontrado,
        codigo: resultado.encontrado
            ? 'CLIENTE_ENCONTRADO'
            : (resultado.estado === 'duplicado' ? 'ID_CLIENTE_AMBIGUO'
                : (resultado.estado === 'ausente' ? 'CLIENTE_NAO_ENCONTRADO' : 'REFERENCIA_CLIENTE_INVALIDA')),
        cliente: resultado.cliente
    };
}

function obterClienteLocacaoAtual() {
    const referencia = document.getElementById('aluguelCliente')?.value;
    if (!referencia) return null;
    return resolverClienteLocacaoPorReferencia(referencia).cliente;
}

function validarDadosBaseLocacao(exibirErro) {
    const cli = document.getElementById('aluguelCliente')?.value;
    const ini = document.getElementById('aluguelIni')?.value;
    const fim = document.getElementById('aluguelFim')?.value;

    if (!cli) {
        if (exibirErro) {
            informarErroCampoLocacao('aluguelCliente', 'Selecione um cliente para continuar.');
        }
        return false;
    }
    limparErroCampoLocacao('aluguelCliente');

    const resolucaoCliente = resolverClienteLocacaoPorReferencia(cli);
    if (!resolucaoCliente.valido) {
        if (exibirErro) {
            const mensagem = resolucaoCliente.codigo === 'ID_CLIENTE_AMBIGUO'
                ? 'O cliente selecionado possui um identificador duplicado. Revise o cadastro antes de continuar.'
                : 'O cliente selecionado não está mais disponível. Selecione outro cliente.';
            informarErroCampoLocacao('aluguelCliente', mensagem);
        }
        return false;
    }

    if (!ini) {
        if (exibirErro) {
            informarErroCampoLocacao('aluguelIni', 'Informe a data inicial.');
        }
        return false;
    }
    limparErroCampoLocacao('aluguelIni');

    if (!fim) {
        if (exibirErro) {
            informarErroCampoLocacao('aluguelFim', 'Informe a previsão de término.');
        }
        return false;
    }
    limparErroCampoLocacao('aluguelFim');

    const dataInicio = parseDataIso(ini);
    const dataFim = parseDataIso(fim);
    if (!dataInicio || !dataFim) {
        if (exibirErro) {
            const campoInvalido = !dataInicio ? 'aluguelIni' : 'aluguelFim';
            informarErroCampoLocacao(campoInvalido, 'Informe uma data válida.');
        }
        return false;
    }

    if (dataFim < dataInicio) {
        if (exibirErro) {
            informarErroCampoLocacao('aluguelFim', 'A previsão de término não pode ser anterior à data inicial.');
        }
        return false;
    }
    limparErroCampoLocacao('aluguelFim');

    const divisor = obterDivisorFormularioLocacao();
    if (divisor === null) {
        if (exibirErro) {
            informarErroCampoLocacao(
                'aluguelDivisor',
                'Informe um divisor maior que zero e menor ou igual a 1.'
            );
        }
        return false;
    }
    limparErroCampoLocacao('aluguelDivisor');

    return true;
}

function calcularTotalCarrinhoLocacao() {
    return carrinhoLocacao.reduce((total, item) => {
        return total + ((parseFloat(item.valor) || 0) * (parseInt(item.quantidade, 10) || 0));
    }, 0);
}

function normalizarAssinaturaItensLocacao(itens = []) {
    return itens
        .map((item) => ({
            pecaId: String(item?.pecaId ?? item?.id ?? '').trim(),
            quantidade: parseInt(item?.quantidade, 10) || 0
        }))
        .filter((item) => item.pecaId && item.quantidade > 0)
        .sort((a, b) => a.pecaId.localeCompare(b.pecaId))
        .map((item) => `${item.pecaId}:${item.quantidade}`)
        .join('|');
}

function normalizarDivisorLocacao(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0) return 1;
    return Number(numero.toFixed(4));
}

function encontrarLocacaoPossivelmenteDuplicada(dadosLocacao) {
    const clienteId = dadosLocacao?.locadorId;
    const dataInicio = String(dadosLocacao?.dataAluguel || '').trim();
    const dataFim = String(dadosLocacao?.dataDevolucaoPrevisao || '').trim();
    const assinaturaItens = normalizarAssinaturaItensLocacao(dadosLocacao?.items || []);
    const divisor = normalizarDivisorLocacao(dadosLocacao?.divisorFatura);

    if (!validarIdClienteLocacao(clienteId) || !dataInicio || !dataFim || !assinaturaItens) return null;

    return locacoes.find((locacao) => {
        const status = String(locacao?.status || '').toLowerCase();
        if (status === 'devolvido') return false;
        if (status === 'cancelado') return false;
        if (!idsClienteLocacaoIguais(locacao?.locadorId, clienteId)) return false;
        if (String(locacao?.dataAluguel || '').trim() !== dataInicio) return false;
        if (String(locacao?.dataDevolucaoPrevisao || '').trim() !== dataFim) return false;
        if (normalizarDivisorLocacao(locacao?.divisorFatura) !== divisor) return false;

        const assinaturaExistente = normalizarAssinaturaItensLocacao(locacao?.items || []);
        return assinaturaExistente === assinaturaItens;
    }) || null;
}

function montarResumoFinalLocacao() {
    const boxResumo = document.getElementById('locacaoResumoFinal');
    if (!boxResumo) return;

    const cliente = obterClienteLocacaoAtual();
    const ini = document.getElementById('aluguelIni')?.value;
    const fim = document.getElementById('aluguelFim')?.value;
    const dataInicio = parseDataIso(ini);
    const dataFim = parseDataIso(fim);

    if (!cliente || !dataInicio || !dataFim || carrinhoLocacao.length === 0) {
        boxResumo.innerHTML = criarEstadoLocacaoPainel({
            tipo: 'info',
            titulo: 'Revisão indisponível',
            mensagem: 'Preencha cliente, período e itens para revisar a locação.'
        });
        return;
    }

    const divisor = obterDivisorFormularioLocacao();
    if (divisor === null) {
        boxResumo.innerHTML = criarEstadoLocacaoPainel({
            tipo: 'warning',
            titulo: 'Revisão indisponível',
            mensagem: 'Informe um divisor maior que zero e menor ou igual a 1.'
        });
        return;
    }
    const totalBruto = calcularTotalCarrinhoLocacao();
    const totalFaturado = totalBruto / divisor;
    const totalItens = carrinhoLocacao.reduce((acc, item) => acc + (parseInt(item.quantidade, 10) || 0), 0);
    const duracaoDias = Math.max(1, Math.round((dataFim - dataInicio) / 86400000) + 1);

    const linhas = carrinhoLocacao.map((item) => {
        const qtd = parseInt(item.quantidade, 10) || 0;
        const valor = parseFloat(item.valor) || 0;
        const totalItem = qtd * valor;
        return `
            <tr>
                <td>${escaparHTML(item.nome)}</td>
                <td class="align-center">${qtd}</td>
                <td class="align-center">${formatarMoedaBR(valor)}</td>
                <td class="align-center">${formatarMoedaBR(totalItem)}</td>
            </tr>
        `;
    }).join('');

    boxResumo.innerHTML = `
        <div class="locacao-review-head">
            <div class="locacao-review-meta">
                <small>Cliente</small>
                <strong>${escaparHTML(cliente.nome)}</strong>
            </div>
            <div class="locacao-review-meta">
                <small>Período</small>
                <strong>${dataInicio.toLocaleDateString('pt-BR')} até ${dataFim.toLocaleDateString('pt-BR')}</strong>
            </div>
            <div class="locacao-review-meta">
                <small>Duração</small>
                <strong>${duracaoDias} dia(s)</strong>
            </div>
            <div class="locacao-review-meta">
                <small>Divisor</small>
                <strong>${divisor.toFixed(4)}</strong>
            </div>
        </div>
        <div class="table-responsive locacao-review-table-wrap">
            <table class="table locacao-review-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th class="table-head-center">Qtd</th>
                        <th class="table-head-center">Valor</th>
                        <th class="table-head-center">Total</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
        <div class="locacao-review-footer">
            <span>${totalItens} item(ns) no pedido</span>
            <div>
                <small>Total faturado</small>
                <strong>${formatarMoedaBR(totalFaturado)}</strong>
            </div>
        </div>
    `;
}

function atualizarFluxoLocacao() {
    const flow = document.getElementById('locacaoFlow');
    if (!flow) return;

    const dadosBaseOk = validarDadosBaseLocacao(false);
    const possuiItens = carrinhoLocacao.length > 0;

    if (locacaoEtapaAtual > 1 && !dadosBaseOk) locacaoEtapaAtual = 1;
    if (locacaoEtapaAtual > 2 && !possuiItens) locacaoEtapaAtual = 2;

    const etapas = [
        document.getElementById('locacaoStep1'),
        document.getElementById('locacaoStep2'),
        document.getElementById('locacaoStep3')
    ];

    const paineis = [
        document.getElementById('locacaoEtapa1'),
        document.getElementById('locacaoEtapa2'),
        document.getElementById('locacaoEtapa3')
    ];

    etapas.forEach((el, idx) => {
        if (!el) return;
        const numeroEtapa = idx + 1;
        el.classList.toggle('is-active', numeroEtapa === locacaoEtapaAtual);
        el.classList.toggle('is-done', numeroEtapa < locacaoEtapaAtual);

        let bloqueada = false;
        if (numeroEtapa === 2 && !dadosBaseOk) bloqueada = true;
        if (numeroEtapa === 3 && (!dadosBaseOk || !possuiItens)) bloqueada = true;
        el.classList.toggle('is-disabled', bloqueada);
    });

    paineis.forEach((painel, idx) => {
        if (!painel) return;
        painel.classList.toggle('is-active', idx + 1 === locacaoEtapaAtual);
    });

    const btnEtapa2 = document.getElementById('btnIrEtapa2');
    if (btnEtapa2) btnEtapa2.disabled = false;

    const btnEtapa3 = document.getElementById('btnIrEtapa3');
    if (btnEtapa3) btnEtapa3.disabled = !(dadosBaseOk && possuiItens);

    const btnFinalizar = document.getElementById('btnFinalizarLocacao');
    if (btnFinalizar) btnFinalizar.disabled = !(dadosBaseOk && possuiItens && locacaoEtapaAtual === 3);

    montarResumoFinalLocacao();
}

function irEtapaLocacao(etapa) {
    const destino = parseInt(etapa, 10);
    if (![1, 2, 3].includes(destino)) return;

    if (destino >= 2 && !validarDadosBaseLocacao(true)) return;
    if (destino === 3 && carrinhoLocacao.length === 0) {
        mostrarToast('Adicione pelo menos 1 item para revisar a locação.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }
    if (destino === 3 && !validarDisponibilidadeCarrinhoLocacao({ exibirErro: true })) return;

    locacaoEtapaAtual = destino;
    atualizarFluxoLocacao();

    if (destino === 2) {
        const campoBusca = document.getElementById('inputBuscaPeca');
        if (campoBusca) campoBusca.focus();
    }
}

function atualizarDisponibilidadePeriodoFormularioLocacao() {
    const intervalo = obterIntervaloFormularioLocacao();
    const selectItem = document.getElementById('aluguelItemSelect');
    const campoQuantidade = document.getElementById('aluguelQtd');
    const aviso = document.getElementById('avisoEstoque');

    if (!intervalo?.completo) {
        if (selectItem) selectItem.value = '';
        if (campoQuantidade) {
            campoQuantidade.removeAttribute('max');
            campoQuantidade.removeAttribute('aria-invalid');
            campoQuantidade.value = '1';
        }
        if (aviso) aviso.innerText = 'Informe um período válido para consultar a disponibilidade.';
        return;
    }

    atualizarLimiteEstoque({ preservarQuantidade: true });
}

function inicializarFluxoLocacao() {
    if (!document.getElementById('locacaoFlow')) return;
    inicializarAutocompleteLocacao();

    if (!fluxoLocacaoInicializado) {
        const idsCampos = ['aluguelCliente', 'aluguelIni', 'aluguelFim', 'aluguelDivisor'];
        idsCampos.forEach((id) => {
            const campo = document.getElementById(id);
            if (!campo) return;
            const atualizarCampo = () => {
                limparErroCampoLocacao(id);
                if (id === 'aluguelIni' || id === 'aluguelFim') {
                    atualizarDisponibilidadePeriodoFormularioLocacao();
                }
                atualizarFluxoLocacao();
            };
            campo.addEventListener('change', atualizarCampo);
            if (id === 'aluguelIni' || id === 'aluguelFim') {
                campo.addEventListener('input', atualizarCampo);
            }
            if (id === 'aluguelDivisor') {
                campo.addEventListener('input', () => {
                    const valorInformado = String(campo.value || '').trim();
                    if (valorInformado && obterDivisorFormularioLocacao() === null) {
                        informarErroCampoLocacao(
                            'aluguelDivisor',
                            'Informe um divisor maior que zero e menor ou igual a 1.',
                            { focar: false, toast: false }
                        );
                    } else {
                        limparErroCampoLocacao('aluguelDivisor');
                    }
                    atualizarFluxoLocacao();
                });
            }
        });
        fluxoLocacaoInicializado = true;
    }

    atualizarFluxoLocacao();
}

function renderCarrinhoLocacao() {
    const lista = document.getElementById('carrinhoList');
    const total = document.getElementById('checkoutTotalLocacao');
    const btnLimpar = document.getElementById('btnLimparCarrinho');
    if (!lista) return;

    if (carrinhoLocacao.length === 0) {
        lista.innerHTML = criarEstadoLocacaoPainel({
            tipo: 'empty',
            titulo: 'Pedido vazio',
            mensagem: 'Nenhum item adicionado à lista.',
            compacto: true
        });
    } else {
        lista.innerHTML = carrinhoLocacao.map((item, index) => {
            const valor = parseFloat(item.valor) || 0;
            const quantidade = parseInt(item.quantidade, 10) || 0;
            const totalItem = valor * quantidade;

            return `
                <div class="item-carrinho">
                    <div class="item-carrinho-main">
                        <span><b>${quantidade}x</b> ${escaparHTML(item.nome)}</span>
                        <span class="item-carrinho-meta">${formatarMoedaBR(valor)} por item</span>
                    </div>
                    <div class="item-carrinho-side">
                        <strong>${formatarMoedaBR(totalItem)}</strong>
                        <button class="btn btn-sm btn-danger btn-icon" data-action="removerItemCarrinho" data-arg="${index}" title="Remover item">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (total) total.innerText = formatarMoedaBR(calcularTotalCarrinhoLocacao());
    if (btnLimpar) btnLimpar.disabled = carrinhoLocacao.length === 0;
    atualizarFluxoLocacao();
}

function removerItemCarrinho(index) {
    carrinhoLocacao.splice(index, 1);
    renderCarrinhoLocacao();
}

function limparCarrinhoLocacao() {
    if (carrinhoLocacao.length === 0) return;
    confirmarAcao('Limpar todos os itens do pedido?', () => {
        carrinhoLocacao = [];
        renderCarrinhoLocacao();
        mostrarToast('Pedido limpo.');
    }, {
        titulo: 'Limpar pedido',
        textoConfirmar: 'Limpar',
        classeConfirmar: 'btn-danger'
    });
}

function addItemCarrinho() {
    var id = document.getElementById('aluguelItemSelect').value;
    if (!id) {
        mostrarToast('Busque e selecione um item!', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }

    var p = pecas.find(function (x) { return x.id == id; });
    if (!p) {
        mostrarToast('Item nao encontrado.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }
    const estadoQuantidade = validarQuantidadeItemFormularioLocacao({ exibirToast: true, focar: true });
    if (!estadoQuantidade.valido) return;

    var campoQtd = document.getElementById('aluguelQtd');
    var qtd = estadoQuantidade.quantidadeDigitada;
    var itemNoCarrinho = carrinhoLocacao.find((x) => x.pecaId == p.id);

    if (itemNoCarrinho) {
        itemNoCarrinho.quantidade += qtd;
    } else {
        carrinhoLocacao.push({
            pecaId: p.id,
            nome: p.nome,
            valor: parseFloat(p.valor) || 0,
            quantidade: qtd
        });
    }

    renderCarrinhoLocacao();
    mostrarToast('Item adicionado!');

    document.getElementById('inputBuscaPeca').value = '';
    document.getElementById('aluguelItemSelect').value = '';
    document.getElementById('aluguelQtd').value = '1';
    document.getElementById('aluguelQtd').removeAttribute('max');
    document.getElementById('aluguelQtd').removeAttribute('aria-invalid');
    document.getElementById('avisoEstoque').innerText = '';
    document.getElementById('inputBuscaPeca').focus();
}

function finalizarLocacao() {
    var cli = document.getElementById('aluguelCliente').value;
    var ini = document.getElementById('aluguelIni').value;
    var fim = document.getElementById('aluguelFim').value;
    if (!validarDadosBaseLocacao(true)) return;

    var divInput = obterDivisorFormularioLocacao();
    const cliente = obterClienteLocacaoAtual();
    if (!cliente || !Object.prototype.hasOwnProperty.call(cliente, 'id')) {
        informarErroCampoLocacao('aluguelCliente', 'O cliente selecionado não está mais disponível. Selecione outro cliente.');
        return;
    }

    if (carrinhoLocacao.length === 0) {
        mostrarToast('Adicione pelo menos 1 item à locação.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }

    const itensInvalidos = carrinhoLocacao.filter((item) => {
        const qtd = parseInt(item.quantidade, 10);
        const valor = parseFloat(item.valor);
        return !Number.isInteger(qtd) || qtd < 1 || !Number.isFinite(valor) || valor < 0;
    });

    if (itensInvalidos.length > 0) {
        mostrarToast('Existem itens com quantidade/valor invalido no pedido.', 'erro');
        focarCampoLocacao('inputBuscaPeca');
        return;
    }
    if (!validarDisponibilidadeCarrinhoLocacao({ exibirErro: true })) return;

    const itensParaSalvar = carrinhoLocacao.map((item) => ({ ...item }));
    const dadosNovaLocacao = {
        locadorId: cliente.id,
        dataAluguel: ini,
        dataDevolucaoPrevisao: fim,
        items: itensParaSalvar,
        status: 'ativo',
        divisorFatura: divInput,
        estoqueReserva: {
            status: 'nao_reservado',
            origem: 'criacao_locacao',
            movimentacaoIds: []
        }
    };

    const concluirCriacaoLocacao = () => {
        const novaLocacaoId = Date.now();
        let novaLocacao = sincronizarFinanceiroLocacao({
            id: novaLocacaoId,
            ...dadosNovaLocacao
        });
        if (typeof atualizarSnapshotReservaLocacao === 'function') {
            atualizarSnapshotReservaLocacao(novaLocacao, {
                origem: 'criacao_locacao',
                capturadoEm: new Date().toISOString(),
                statusReserva: 'nao_reservado'
            });
        }
        if (typeof atualizarStatusLocacaoDominio === 'function') {
            atualizarStatusLocacaoDominio(novaLocacao, 'aprovado', {
                acao: 'criacao',
                descricao: 'Locação criada no fluxo de locações.',
                origem: 'locacoes',
                forcarHistorico: true
            });
        } else if (typeof registrarHistoricoLocacaoDominio === 'function') {
            registrarHistoricoLocacaoDominio(novaLocacao, {
                acao: 'criacao',
                descricao: 'Locação criada no fluxo de locações.',
                origem: 'locacoes'
            });
        }
        locacoes.push(novaLocacao);

        carrinhoLocacao = [];
        document.getElementById('aluguelCliente').value = '';
        document.getElementById('aluguelItemSelect').value = '';
        document.getElementById('aluguelQtd').value = '1';
        document.getElementById('inputBuscaPeca').value = '';
        document.getElementById('avisoEstoque').innerText = '';
        Object.keys(ERROS_CAMPOS_LOCACAO).forEach(limparErroCampoLocacao);

        renderCarrinhoLocacao();

        if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
        salvarLocal();
        renderTudo();
        if (typeof focarRegistroRecemSalvo === 'function') {
            focarRegistroRecemSalvo({ tipo: 'locacao', id: novaLocacaoId, limparBusca: true });
        }

        registrarLog('locacao', 'criar', `Locacao criada: ${cliente?.nome || 'Cliente'} - ${itensParaSalvar.length} itens`);

        locacaoEtapaAtual = 1;
        inicializarFluxoLocacao();

        mostrarToast('Locação concluída!');
        sincronizar('salvar');
    };

    const locacaoDuplicada = encontrarLocacaoPossivelmenteDuplicada(dadosNovaLocacao);
    if (locacaoDuplicada) {
        const sufixo = String(locacaoDuplicada.id || '').slice(-4) || '----';
        confirmarAcao(
            `Já existe uma locação parecida em aberto (#${sufixo}). Deseja criar mesmo assim?`,
            () => {
                concluirCriacaoLocacao();
            },
            {
                titulo: 'Possível duplicidade',
                textoConfirmar: 'Criar assim mesmo',
                classeConfirmar: 'btn-warning'
            }
        );
        return;
    }

    concluirCriacaoLocacao();
}

function cancelarLocacao(id) {
    if (typeof validarPermissao === 'function' && !validarPermissao('cancelar_locacao', 'Somente administrador pode cancelar locações.')) {
        return;
    }

    confirmarAcao('Cancelar locacao?', () => {
        const locacao = locacoes.find((l) => String(l.id) === String(id));
        if (!locacao) {
            mostrarToast('Locacao nao encontrada.');
            return;
        }

        const statusAtual = String(locacao.status || '').trim().toLowerCase();
        const fluxoAtual = String(locacao.statusFluxo || '').trim().toLowerCase();
        if (statusAtual === 'cancelado' || fluxoAtual === 'cancelado') {
            mostrarToast('Locacao ja esta cancelada.');
            return;
        }

        if (typeof atualizarStatusLocacaoDominio === 'function') {
            atualizarStatusLocacaoDominio(locacao, 'cancelado', {
                acao: 'cancelamento',
                descricao: 'Locacao cancelada.',
                origem: 'locacoes'
            });
        } else {
            locacao.status = 'cancelado';
            locacao.statusFluxo = 'cancelado';
            if (typeof registrarHistoricoLocacaoDominio === 'function') {
                registrarHistoricoLocacaoDominio(locacao, {
                    acao: 'cancelamento',
                    descricao: 'Locacao cancelada.',
                    origem: 'locacoes'
                });
            }
        }

        if (typeof registrarLog === 'function') {
            const clienteNome = resolverClienteLocacaoPorIdPersistido(locacao.locadorId)?.nome || 'Cliente';
            registrarLog('locacao', 'cancelar', `Locacao cancelada: ${clienteNome} #${String(locacao.id || '').slice(-4)}`);
        }

        if (typeof recalcularDisponibilidade === 'function') recalcularDisponibilidade(true);
        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        mostrarToast('Locacao cancelada e mantida no historico.');
    }, {
        titulo: 'Cancelar locacao',
        textoConfirmar: 'Cancelar locacao',
        classeConfirmar: 'btn-danger'
    });
}

function mudarFiltro(n) {
    filtroAtual = normalizarFiltroLocacoes(n);
    persistirFiltroLocacoesAtual();
    renderLocacoes();
}

function irParaLocacoes(f) {
    const filtroDestino = f || 'todos';

    if (typeof executarAtalhoFiltroLocacoes === 'function') {
        executarAtalhoFiltroLocacoes(filtroDestino);
        return;
    }

    abrirTab('locacoes', { semRolagem: true });

    setTimeout(() => {
        mudarFiltro(filtroDestino);

        if (typeof atualizarFiltroVisualLocacoes === 'function') {
            atualizarFiltroVisualLocacoes();
        }

        const alvoLista = document.getElementById('locacoesLista')
            || document.querySelector('#tab-locacoes #tblLocacoes')?.closest('.panel-block');

        if (alvoLista && typeof rolarParaElementoAtalho === 'function') {
            rolarParaElementoAtalho(alvoLista, 'start');
        } else if (alvoLista && typeof alvoLista.scrollIntoView === 'function') {
            alvoLista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 150);
}

function alternarPagamento(id) {
    if (typeof validarPermissao === 'function' && !validarPermissao('alterar_pagamento', 'Somente administrador pode alterar status de pagamento.')) {
        return;
    }
    const l = locacoes.find((x) => x.id == id);
    if (l) {
        const pagoAnterior = !!l.pago;
        l.pago = !l.pago;
        const statusPagamento = l.pago ? 'pago' : 'pendente';
        const {
            financeiroAtual,
            valorTotal,
            sinalAtual: sinal
        } = obterResumoPagamentoLocacao(l);
        l.financeiro = {
            ...financeiroAtual,
            sinal: l.pago ? valorTotal : sinal,
            valorRestante: l.pago ? 0 : Math.max(valorTotal - sinal, 0),
            statusPagamento
        };
        const normalizada = sincronizarFinanceiroLocacao(l);
        if (normalizada) Object.assign(l, normalizada);
        if (pagoAnterior !== l.pago && typeof registrarHistoricoLocacaoDominio === 'function') {
            registrarHistoricoLocacaoDominio(l, {
                acao: 'financeiro_status',
                descricao: l.pago
                    ? 'Pagamento marcado como pago.'
                    : 'Pagamento marcado como pendente.',
                origem: 'locacoes'
            });
        }
        salvarLocal();
        renderLocacoes();
        if (typeof renderFinanceiroResumo === 'function') renderFinanceiroResumo();
        renderStats();
        sincronizar('salvar');
        mostrarToast('Pagamento atualizado!');
    }
}

function marcarPagamentoParcial(id) {
    if (typeof validarPermissao === 'function' && !validarPermissao('alterar_pagamento', 'Somente administrador pode alterar status de pagamento.')) {
        return;
    }

    const locacao = obterLocacaoPagamentoPorId(id);
    if (!locacao) return;

    const modal = document.getElementById('modalPagamentoLocacao');
    const inputValor = document.getElementById('pagamentoLocacaoValorRecebido');
    const inputId = document.getElementById('pagamentoLocacaoId');

    if (!modal || !inputValor || !inputId) {
        solicitarPagamentoPromptLocacao(locacao);
        return;
    }

    const resumo = obterResumoPagamentoLocacao(locacao);
    const cliente = resolverClienteLocacaoPorIdPersistido(locacao.locadorId);

    inputId.value = locacao.id;
    inputValor.value = formatarValorPromptFinanceiro(resumo.recebidoAtual);
    inputValor.dataset.valorMaximo = String(resumo.valorTotal);

    atualizarTextoElemento('pagamentoLocacaoCliente', cliente?.nome || 'Cliente removido');
    atualizarTextoElemento('pagamentoLocacaoCodigo', `#${String(locacao.id || '').slice(-4) || '----'}`);
    atualizarTextoElemento('pagamentoLocacaoTotal', formatarMoedaBR(resumo.valorTotal));
    atualizarTextoElemento('pagamentoLocacaoRecebidoAtual', formatarMoedaBR(resumo.recebidoAtual));
    atualizarTextoElemento('pagamentoLocacaoRestanteAtual', formatarMoedaBR(resumo.valorRestante));

    atualizarPreviewPagamentoLocacao();
    modal.classList.add('active');

    setTimeout(() => {
        try {
            inputValor.focus({ preventScroll: true });
            inputValor.select();
        } catch (_) {
            inputValor.focus();
        }
    }, 60);
}

function atualizarPreviewPagamentoLocacao() {
    const inputValor = document.getElementById('pagamentoLocacaoValorRecebido');
    const inputId = document.getElementById('pagamentoLocacaoId');
    if (!inputValor || !inputId) return;

    const locacao = obterLocacaoPagamentoPorId(inputId.value);
    if (!locacao) return;

    const resumo = obterResumoPagamentoLocacao(locacao);
    const textoInformado = String(inputValor.value || '').trim();
    const valorInformado = textoInformado ? parseValorFinanceiroLocacao(textoInformado) : 0;

    if (!Number.isFinite(valorInformado)) {
        atualizarTextoElemento('pagamentoLocacaoNovoRestante', '-');
        atualizarBadgePreviewPagamento('invalido', 'Valor inválido');
        return;
    }

    const calculo = calcularStatusPagamentoLocacao(
        resumo.valorTotal,
        Math.min(Math.max(valorInformado, 0), resumo.valorTotal)
    );

    atualizarTextoElemento('pagamentoLocacaoNovoRestante', formatarMoedaBR(calculo.novoRestante));
    atualizarBadgePreviewPagamento(calculo.statusPagamento);
}

function preencherPagamentoRapido(tipo) {
    const inputValor = document.getElementById('pagamentoLocacaoValorRecebido');
    const inputId = document.getElementById('pagamentoLocacaoId');
    if (!inputValor || !inputId) return;

    const locacao = obterLocacaoPagamentoPorId(inputId.value);
    if (!locacao) return;

    const resumo = obterResumoPagamentoLocacao(locacao);
    let valor = 0;

    if (tipo === 'total') {
        valor = resumo.valorTotal;
    } else if (String(tipo) === '50') {
        valor = resumo.valorTotal / 2;
    } else {
        valor = Number(tipo) || 0;
    }

    inputValor.value = formatarValorPromptFinanceiro(Math.min(Math.max(valor, 0), resumo.valorTotal));
    atualizarPreviewPagamentoLocacao();
    focarCampoLocacao('pagamentoLocacaoValorRecebido');
}

function salvarPagamentoLocacao() {
    const inputValor = document.getElementById('pagamentoLocacaoValorRecebido');
    const inputId = document.getElementById('pagamentoLocacaoId');
    if (!inputValor || !inputId) return;

    const locacao = obterLocacaoPagamentoPorId(inputId.value);
    if (!locacao) {
        mostrarToast('Locação não encontrada para atualizar pagamento.', 'erro');
        return;
    }

    const resumo = obterResumoPagamentoLocacao(locacao);
    const valorInformado = parseValorFinanceiroLocacao(inputValor.value);

    if (!Number.isFinite(valorInformado)) {
        mostrarToast('Valor recebido inválido.', 'erro');
        focarCampoLocacao('pagamentoLocacaoValorRecebido');
        return;
    }

    aplicarRecebimentoLocacao(
        locacao,
        Math.min(Math.max(valorInformado, 0), resumo.valorTotal),
        'financeiro'
    );

    const modal = document.getElementById('modalPagamentoLocacao');
    if (modal) modal.classList.remove('active');
}

function escaparHtmlHistoricoLocacao(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function formatarDataHistoricoLocacao(valor) {
    if (!valor) return '-';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
    return data.toLocaleString('pt-BR');
}

function rotuloStatusFluxoLocacao(statusFluxo) {
    const mapa = {
        orcamento: 'Orçamento',
        aprovado: 'Aprovado',
        separado: 'Separado',
        carregado: 'Carregado',
        montado: 'Montado',
        finalizado: 'Finalizado',
        devolvido: 'Devolvido',
        cancelado: 'Cancelado'
    };
    const chave = String(statusFluxo || '').trim().toLowerCase();
    return mapa[chave] || (chave ? chave.charAt(0).toUpperCase() + chave.slice(1) : 'Não informado');
}

function rotuloStatusPagamentoLocacao(statusPagamento, pago) {
    const mapa = {
        pendente: 'Pendente',
        parcial: 'Parcial',
        pago: 'Pago',
        atrasado: 'Atrasado',
        cancelado: 'Cancelado'
    };
    const chave = String(statusPagamento || '').trim().toLowerCase();
    if (chave && mapa[chave]) return mapa[chave];
    return pago ? 'Pago' : 'Pendente';
}

function abrirHistoricoLocacao(id) {
    const modal = document.getElementById('modalHistoricoLocacao');
    const corpo = document.getElementById('historicoLocacaoConteudo');
    if (!modal || !corpo) {
        mostrarToast('Painel de histórico da locação não encontrado.', 'erro');
        return;
    }

    const locacao = locacoes.find((x) => String(x.id) === String(id));
    if (!locacao) {
        mostrarToast('Locação não encontrada.', 'erro');
        return;
    }

    const locacaoNormalizada = typeof normalizarLocacaoDominio === 'function'
        ? normalizarLocacaoDominio(locacao)
        : locacao;

    const cliente = resolverClienteLocacaoPorIdPersistido(locacaoNormalizada.locadorId);
    const clienteNome = cliente?.nome || 'Cliente removido';
    const statusFluxo = rotuloStatusFluxoLocacao(locacaoNormalizada.statusFluxo);
    const statusPagamento = rotuloStatusPagamentoLocacao(
        locacaoNormalizada?.financeiro?.statusPagamento,
        locacaoNormalizada?.pago
    );
    const valorTotal = typeof calcularValorLocacaoDominio === 'function'
        ? calcularValorLocacaoDominio(locacaoNormalizada)
        : Math.max(0, parseValorFinanceiroLocacao(
            locacaoNormalizada?.financeiro?.valorTotal ?? locacaoNormalizada?.valorTotalCalculado ?? 0
        ) || 0);

    const historico = Array.isArray(locacaoNormalizada.historicoAlteracoes)
        ? locacaoNormalizada.historicoAlteracoes.slice().sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0))
        : [];
    const idsMovimentacoesReserva = new Set(
        Array.isArray(locacaoNormalizada?.estoqueReserva?.movimentacaoIds)
            ? locacaoNormalizada.estoqueReserva.movimentacaoIds.map((movimentacaoId) => String(movimentacaoId))
            : []
    );
    const ledgerEstoque = typeof movimentacoesEstoque !== 'undefined' && Array.isArray(movimentacoesEstoque)
        ? movimentacoesEstoque
        : (Array.isArray(window.movimentacoesEstoque) ? window.movimentacoesEstoque : []);
    const movimentacoesReserva = ledgerEstoque
        .filter((movimentacao) => {
            if (String(movimentacao?.locacaoId || '') !== String(locacaoNormalizada.id || '')) return false;
            if (String(movimentacao?.tipoMovimentacao || '').toLowerCase() !== 'reserva') return false;
            if (idsMovimentacoesReserva.size > 0 && !idsMovimentacoesReserva.has(String(movimentacao?.id || ''))) return false;
            return true;
        })
        .sort((a, b) => new Date(b.dataHora || 0) - new Date(a.dataHora || 0));
    const formatarQuantidadeMovimentacao = (valor) => {
        const numero = Number(valor);
        return Number.isFinite(numero)
            ? numero.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
            : '0';
    };
    const detalhesMovimentacoesReserva = movimentacoesReserva.length
        ? `
            <details class="locacao-history-movements">
                <summary aria-label="Consultar ${movimentacoesReserva.length} movimentações individuais da reserva">
                    Ver ${movimentacoesReserva.length} movimentação(ões) da reserva
                </summary>
                <div class="locacao-history-movement-list">
                    ${movimentacoesReserva.map((movimentacao) => `
                        <article class="locacao-history-movement-item">
                            <strong>${escaparHtmlHistoricoLocacao(movimentacao.pecaNome || 'Item não identificado')}</strong>
                            <dl>
                                <div>
                                    <dt>Quantidade reservada</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(formatarQuantidadeMovimentacao(movimentacao.quantidade))}</dd>
                                </div>
                                <div>
                                    <dt>Saldo anterior</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(formatarQuantidadeMovimentacao(movimentacao.saldoAntes))}</dd>
                                </div>
                                <div>
                                    <dt>Saldo posterior</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(formatarQuantidadeMovimentacao(movimentacao.saldoDepois))}</dd>
                                </div>
                                <div>
                                    <dt>Data e horário</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(formatarDataHistoricoLocacao(movimentacao.dataHora))}</dd>
                                </div>
                                <div>
                                    <dt>Responsável</dt>
                                    <dd>${escaparHtmlHistoricoLocacao(movimentacao.usuario || 'sistema_local')}</dd>
                                </div>
                            </dl>
                        </article>
                    `).join('')}
                </div>
            </details>
        `
        : '';

    const linhasHistorico = historico.length
        ? historico.map((registro) => `
            <article class="locacao-history-item">
                <div class="locacao-history-dot" aria-hidden="true"></div>
                <div class="locacao-history-content">
                    <div class="locacao-history-head">
                        <strong>${escaparHtmlHistoricoLocacao(registro.descricao || 'Atualização registrada')}</strong>
                        <span>${escaparHtmlHistoricoLocacao(formatarDataHistoricoLocacao(registro.data))}</span>
                    </div>
                    <div class="locacao-history-meta">
                        <span><b>Ação:</b> ${escaparHtmlHistoricoLocacao(registro.acao || 'atualizacao')}</span>
                        <span><b>Origem:</b> ${escaparHtmlHistoricoLocacao(registro.origem || 'sistema')}</span>
                        <span><b>Usuário:</b> ${escaparHtmlHistoricoLocacao(registro.usuario || 'sistema_local')}</span>
                    </div>
                    ${registro.acao === 'reserva_estoque' ? detalhesMovimentacoesReserva : ''}
                </div>
            </article>
        `).join('')
        : `
            <div class="ui-state-panel">
                <div class="ui-state ui-state--info ui-state--compact">
                    <div class="ui-state-icon"><i class="bi bi-info-circle" aria-hidden="true"></i></div>
                    <div class="ui-state-content">
                        <strong>Sem histórico detalhado</strong>
                        <span>Esta locação ainda não possui eventos no histórico.</span>
                    </div>
                </div>
            </div>
        `;

    corpo.innerHTML = `
        <div class="locacao-history-summary">
            <div class="locacao-history-card">
                <small>Locação</small>
                <strong>#${String(locacaoNormalizada.id || '').slice(-4) || '----'}</strong>
            </div>
            <div class="locacao-history-card">
                <small>Cliente</small>
                <strong>${escaparHtmlHistoricoLocacao(clienteNome)}</strong>
            </div>
            <div class="locacao-history-card">
                <small>Status fluxo</small>
                <strong>${escaparHtmlHistoricoLocacao(statusFluxo)}</strong>
            </div>
            <div class="locacao-history-card">
                <small>Pagamento</small>
                <strong>${escaparHtmlHistoricoLocacao(statusPagamento)}</strong>
            </div>
            <div class="locacao-history-card">
                <small>Valor</small>
                <strong>${escaparHtmlHistoricoLocacao(valorTotal.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                }))}</strong>
            </div>
        </div>
        <div class="locacao-history-list">
            ${linhasHistorico}
        </div>
    `;

    modal.classList.add('active');
}

function reservarEstoqueDaLocacao(id) {
    const locacao = Array.isArray(locacoes)
        ? locacoes.find((item) => String(item?.id || '') === String(id || ''))
        : null;
    if (!locacao) {
        mostrarToast('Locação não encontrada para reserva.', 'erro');
        return;
    }
    if (typeof reservarEstoqueLocacao !== 'function') {
        mostrarToast('Serviço de reserva de estoque indisponível.', 'erro');
        return;
    }

    const executarReserva = () => {
        const resultado = reservarEstoqueLocacao(locacao);
        if (!resultado?.ok) {
            const detalhe = Array.isArray(resultado?.bloqueios) && resultado.bloqueios.length
                ? resultado.bloqueios[0]
                : 'Não foi possível reservar o estoque.';
            mostrarToast(detalhe, 'erro', 6500);
            return;
        }

        if (resultado.jaReservada) {
            mostrarToast('O estoque desta locação já está reservado. Nenhuma nova movimentação foi criada.', 'info', 5200);
            return;
        }

        salvarLocal();
        renderTudo();
        sincronizar('salvar');
        mostrarToast(`Estoque reservado com sucesso: ${resultado.totalReservado || 0} unidade(s) própria(s).`);
    };

    const reservaAtual = typeof normalizarEstoqueReservaLocacao === 'function'
        ? normalizarEstoqueReservaLocacao(locacao)
        : (locacao.estoqueReserva || {});
    if (reservaAtual.status === 'reservado' || reservaAtual.status === 'reservado_legado') {
        executarReserva();
        return;
    }

    if (typeof confirmarAcao === 'function') {
        confirmarAcao(
            'Reservar agora somente as quantidades próprias desta locação?',
            executarReserva,
            {
                titulo: 'Reservar estoque',
                textoConfirmar: 'Reservar estoque',
                classeConfirmar: 'btn-warning'
            }
        );
        return;
    }

    if (confirm('Reservar agora somente as quantidades próprias desta locação?')) {
        executarReserva();
    }
}

function obterEstadoQuantidadeItemFormularioLocacao() {
    const campoItem = document.getElementById('aluguelItemSelect');
    const campoQuantidade = document.getElementById('aluguelQtd');
    const peca = pecas.find((item) => String(item?.id || '') === String(campoItem?.value || ''));
    const valorTexto = String(campoQuantidade?.value ?? '').trim();
    const quantidadeDigitada = Number(valorTexto);

    if (!peca) {
        return { valido: false, silencioso: true, quantidadeDigitada: 0, disponivelRestante: 0 };
    }

    const consulta = consultarDisponibilidadePecaFormularioLocacao(peca);
    const quantidadeNoCarrinho = carrinhoLocacao
        .filter((item) => String(item?.pecaId || '') === String(peca.id || ''))
        .reduce((total, item) => total + Math.max(parseInt(item?.quantidade, 10) || 0, 0), 0);
    const disponivelRestante = Math.max(consulta.disponivel - quantidadeNoCarrinho, 0);

    if (!valorTexto || !Number.isInteger(quantidadeDigitada) || quantidadeDigitada < 1) {
        return {
            valido: false,
            quantidadeDigitada,
            disponivelRestante,
            mensagem: 'Informe uma quantidade válida (mínimo 1).'
        };
    }

    const quantidadeTotalSolicitada = quantidadeNoCarrinho + quantidadeDigitada;
    if (!consulta.valido || quantidadeTotalSolicitada > consulta.disponivel) {
        return {
            valido: false,
            quantidadeDigitada,
            disponivelRestante,
            mensagem: consulta.valido
                ? formatarMensagemDisponibilidadeEstoque({
                    item: peca.nome || 'Item de estoque',
                    solicitado: quantidadeTotalSolicitada,
                    consulta
                })
                : formatarMensagemDisponibilidadeEstoque({ tipo: 'intervalo_invalido', consulta })
        };
    }

    return {
        valido: true,
        quantidadeDigitada,
        disponivelRestante,
        mensagem: `(Disponível no período: ${disponivelRestante})`
    };
}

function validarQuantidadeItemFormularioLocacao(opcoes = {}) {
    const campoQuantidade = document.getElementById('aluguelQtd');
    const aviso = document.getElementById('avisoEstoque');
    const estado = obterEstadoQuantidadeItemFormularioLocacao();

    if (estado.silencioso) {
        campoQuantidade?.removeAttribute('aria-invalid');
        return estado;
    }

    if (estado.valido) campoQuantidade?.removeAttribute('aria-invalid');
    else campoQuantidade?.setAttribute('aria-invalid', 'true');
    if (aviso) aviso.textContent = estado.mensagem || '';
    if (!estado.valido && opcoes.exibirToast) mostrarToast(estado.mensagem, 'erro', 6500);
    if (!estado.valido && opcoes.focar) focarCampoLocacao('aluguelQtd');
    return estado;
}

function atualizarLimiteEstoque(opcoes = {}) {
    var select = document.getElementById('aluguelItemSelect');
    var inputQtd = document.getElementById('aluguelQtd');
    var aviso = document.getElementById('avisoEstoque');

    var id = select.value;
    var p = pecas.find((x) => x.id == id);

    if (p) {
        const consulta = consultarDisponibilidadePecaFormularioLocacao(p);
        const quantidadeNoCarrinho = carrinhoLocacao
            .filter((item) => String(item?.pecaId || '') === String(p.id || ''))
            .reduce((total, item) => total + Math.max(parseInt(item?.quantidade, 10) || 0, 0), 0);
        const disponivel = Math.max(consulta.disponivel - quantidadeNoCarrinho, 0);
        inputQtd.max = disponivel;
        if (!opcoes.preservarQuantidade) inputQtd.value = '1';
        validarQuantidadeItemFormularioLocacao();
    } else {
        aviso.innerText = '';
        inputQtd.removeAttribute('max');
        inputQtd.removeAttribute('aria-invalid');
    }
}

function validarDigitacao(input) {
    validarQuantidadeItemFormularioLocacao();
}

window.renderCarrinhoLocacao = renderCarrinhoLocacao;
window.removerItemCarrinho = removerItemCarrinho;
window.limparCarrinhoLocacao = limparCarrinhoLocacao;
window.irEtapaLocacao = irEtapaLocacao;
window.inicializarFluxoLocacao = inicializarFluxoLocacao;
window.atualizarFluxoLocacao = atualizarFluxoLocacao;
window.fecharSugestoesLocacao = fecharSugestoesLocacao;
window.abrirHistoricoLocacao = abrirHistoricoLocacao;
window.reservarEstoqueDaLocacao = reservarEstoqueDaLocacao;
window.obterElegibilidadeEdicaoLocacao = obterElegibilidadeEdicaoLocacao;
window.criarReferenciaTipadaClienteLocacao = criarReferenciaTipadaClienteLocacao;
window.abrirEdicaoLocacao = abrirEdicaoLocacao;
window.cancelarSessaoEdicaoLocacao = cancelarSessaoEdicaoLocacao;
window.adicionarItemSessaoEdicaoLocacao = adicionarItemSessaoEdicaoLocacao;
window.removerItemSessaoEdicaoLocacao = removerItemSessaoEdicaoLocacao;
window.revisarAlteracoesSessaoEdicaoLocacao = revisarAlteracoesSessaoEdicaoLocacao;
window.voltarEdicaoSessaoEdicaoLocacao = voltarEdicaoSessaoEdicaoLocacao;
window.executarAlteracoesSessaoEdicaoLocacao = executarAlteracoesSessaoEdicaoLocacao;
