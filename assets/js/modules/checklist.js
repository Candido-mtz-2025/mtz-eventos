let reaberturaChecklistEmProcessamento = false;
let conclusaoChecklistEmProcessamento = false;

function criarReferenciaTipadaLocacaoChecklist(id) {
    const identidade = typeof normalizarIdEntidadeExato === 'function'
        ? normalizarIdEntidadeExato(id)
        : { valido: false };
    if (!identidade.valido) return '';
    return `locacao:${encodeURIComponent(JSON.stringify([identidade.tipo, identidade.valor]))}`;
}

function resolverLocacaoChecklistPorReferencia(referencia, colecao = locacoes) {
    if (typeof referencia !== 'string' || !referencia.startsWith('locacao:')) {
        return { encontrado: false, estado: 'invalido', registro: null };
    }
    try {
        const dados = JSON.parse(decodeURIComponent(referencia.slice('locacao:'.length)));
        if (!Array.isArray(dados) || dados.length !== 2) {
            return { encontrado: false, estado: 'invalido', registro: null };
        }
        const [tipo, valor] = dados;
        const identidade = normalizarIdEntidadeExato(valor);
        if (!identidade.valido || identidade.tipo !== tipo
            || criarReferenciaTipadaLocacaoChecklist(valor) !== referencia) {
            return { encontrado: false, estado: 'invalido', registro: null };
        }
        return resolverRegistroPorIdExato(colecao, identidade.valor);
    } catch (_erro) {
        return { encontrado: false, estado: 'invalido', registro: null };
    }
}

function definirLocacaoChecklistAtual(locacao) {
    const referencia = criarReferenciaTipadaLocacaoChecklist(locacao?.id);
    window.checklistLocacaoAtualReferencia = referencia;
    window.checklistLocacaoAtualId = referencia ? locacao.id : '';
    return Boolean(referencia);
}

function checklistAtualEstaConcluido() {
    return obterLocacaoChecklistAtual()?.checklist?.concluido === true;
}

function bloquearMutacaoChecklistConcluido() {
    if (!checklistAtualEstaConcluido()) return false;
    mostrarToast('Este checklist está concluído. Use “Reabrir Checklist” para fazer alterações.', 'erro');
    const botao = document.getElementById('checklistReabrir');
    if (botao && !botao.hidden) botao.focus();
    return true;
}

function popularChecklistModeloSelect() {
    const select = document.getElementById('checklistModeloSelect');
    if (!select) return;

    const modelos = typeof listarModelosChecklist === 'function'
        ? listarModelosChecklist()
        : modelosChecklist;

    select.innerHTML = '<option value="">Selecione um modelo</option>';

    modelos.forEach(modelo => {
        if (encontrarPecaInativaVinculada(modelo.itens, pecas)) return;
        const option = document.createElement('option');
        option.value = modelo.id;
        option.textContent = `${modelo.nome}${modelo.familiaEstrutural ? ' - ' + modelo.familiaEstrutural : ''}`;
        select.appendChild(option);
    });
}

function focarCampoChecklist(idCampo, selecionar = false) {
    const campo = document.getElementById(idCampo);
    if (!campo) return;

    const alvoRolagem = campo.closest('.form-group') || campo;
    const limites = typeof alvoRolagem.getBoundingClientRect === 'function'
        ? alvoRolagem.getBoundingClientRect()
        : null;
    const margemVisivel = 24;
    const foraDaAreaVisivel = limites && (
        limites.top < margemVisivel
        || limites.bottom > (window.innerHeight || document.documentElement.clientHeight) - margemVisivel
    );

    if (foraDaAreaVisivel && typeof alvoRolagem.scrollIntoView === 'function') {
        alvoRolagem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTimeout(() => {
        try {
            campo.focus({ preventScroll: true });
        } catch (_) {
            campo.focus();
        }
        if (selecionar && typeof campo.select === 'function') {
            campo.select();
        }
    }, foraDaAreaVisivel ? 180 : 0);
}

function adicionarModeloAoChecklist() {
    if (bloquearMutacaoChecklistConcluido()) return;
    const select = document.getElementById('checklistModeloSelect');
    if (!select || !select.value) {
        mostrarToast('Selecione um modelo.', 'erro');
        focarCampoChecklist('checklistModeloSelect');
        return;
    }

    const modeloId = select.value;

    const modelo = typeof buscarModeloChecklist === 'function'
        ? buscarModeloChecklist(modeloId)
        : modelosChecklist.find(m => String(m.id) === String(modeloId));

    if (!modelo) {
        mostrarToast('Modelo nao encontrado.', 'erro');
        return;
    }

    if (!modelo.itens || !modelo.itens.length) {
        mostrarToast('Esse modelo nao possui itens.', 'erro');
        return;
    }

    const inativa = encontrarPecaInativaVinculada(modelo.itens, pecas);
    if (inativa) { mostrarToast(`${inativa.nome}: peça inativa; inclusão no checklist bloqueada.`, 'erro'); return; }
    modelo.itens.forEach(itemModelo => {
        const pecaId = itemModelo.pecaId ?? itemModelo.idPeca ?? itemModelo.peca ?? itemModelo.id;
        const quantidadeModelo = Number(itemModelo.quantidade || itemModelo.qtd || 0);
        if (!Number.isFinite(quantidadeModelo) || quantidadeModelo <= 0) return;

        const peca = resolverRegistroPorIdExato(pecas, pecaId).registro;
        if (!peca) {
            console.warn('Peça não encontrada para o item do modelo:', itemModelo);
            return;
        }

        const existente = checklistMontagem.find(item => item.pecaId === pecaId);

        if (existente) {
            existente.quantidade += quantidadeModelo;
        } else {
            checklistMontagem.push({
            modeloId: modelo.id,
            modeloNome: modelo.nome,
            pecaId: peca.id,
            nome: peca.nome || 'Peça sem nome',
            medida: peca.medida || '',
            grupoChecklist: peca.grupoChecklist || 'outros',
            familiaEstrutural: peca.familiaEstrutural || '',
            subtipoEstrutural: peca.subtipoEstrutural || '',
            quantidade: quantidadeModelo
           });
        }
    });

    window.checklistMontagem = checklistMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistMontagem();
    mostrarToast('Modelo adicionado ao checklist.');
}

function removerItemChecklistMontagem(index) {
    if (bloquearMutacaoChecklistConcluido()) return;
    if (index < 0 || index >= checklistMontagem.length) return;

    checklistMontagem.splice(index, 1);
    window.checklistMontagem = checklistMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistMontagem();
}

function limparChecklistMontagem() {
    if (bloquearMutacaoChecklistConcluido()) return;
    confirmarAcao('Deseja limpar o checklist?', () => {
        checklistMontagem = [];
        checklistConferencia = {};
        window.checklistMontagem = checklistMontagem;
        window.checklistConferencia = checklistConferencia;

        [
            'checklistCliente',
            'checklistLocal',
            'checklistMontagemData',
            'checklistHorario',
            'checklistEvento',
            'checklistDesmontagemData',
            'checklistRespSaida',
            'checklistRespRetorno'
        ].forEach(id => {
            const campo = document.getElementById(id);
            if (campo) campo.value = '';
        });
        window.checklistLocacaoAtualId = '';
        window.checklistLocacaoAtualReferencia = '';
        atualizarOrigemChecklistLocacao(null);

        if (typeof salvarLocal === 'function') salvarLocal();
        renderChecklistMontagem();
        mostrarToast('Checklist limpo.');
    }, {
        titulo: 'Limpar checklist',
        textoConfirmar: 'Limpar',
        classeConfirmar: 'btn-danger'
    });
}

function preencherCampoChecklist(idCampo, valor) {
    const campo = document.getElementById(idCampo);
    if (campo) campo.value = valor ?? '';
}

function clonarDadoChecklist(valor, fallback = {}) {
    if (Array.isArray(valor)) {
        return valor.map((item) => clonarDadoChecklist(item, {}));
    }
    if (!valor || typeof valor !== 'object') return valor;
    if (typeof clonarObjetoSeguro === 'function') {
        return clonarObjetoSeguro(valor, fallback);
    }
    try {
        return JSON.parse(JSON.stringify(valor));
    } catch (_) {
        return { ...fallback, ...valor };
    }
}

function obterUsuarioChecklistAtual() {
    return String(localStorage.getItem('usuarioEmail') || 'sistema_local').trim() || 'sistema_local';
}

function obterIdLocacaoChecklistAtual() {
    const referencia = String(window.checklistLocacaoAtualReferencia || '');
    if (referencia) {
        const resultado = resolverLocacaoChecklistPorReferencia(referencia);
        if (resultado.encontrado) return resultado.registro.id;
        return null;
    }

    const idDireto = window.checklistLocacaoAtualId;
    const resultadoDireto = resolverRegistroPorIdExato(locacoes, idDireto);
    if (resultadoDireto.encontrado) {
        definirLocacaoChecklistAtual(resultadoDireto.registro);
        return resultadoDireto.registro.id;
    }

    const itemComLocacao = Array.isArray(checklistMontagem)
        ? checklistMontagem.find((item) => Object.prototype.hasOwnProperty.call(item || {}, 'locacaoId'))
        : null;
    const resultadoItem = resolverRegistroPorIdExato(locacoes, itemComLocacao?.locacaoId);
    if (resultadoItem.encontrado) {
        definirLocacaoChecklistAtual(resultadoItem.registro);
        return resultadoItem.registro.id;
    }
    return null;
}

function obterLocacaoChecklistAtual() {
    const locacaoId = obterIdLocacaoChecklistAtual();
    if (locacaoId === null || !Array.isArray(locacoes)) return null;
    const resultado = resolverRegistroPorIdExato(locacoes, locacaoId);
    return resultado.encontrado ? resultado.registro : null;
}

function aplicarEstadoOperacionalChecklist() {
    const concluido = checklistAtualEstaConcluido();
    const processando = reaberturaChecklistEmProcessamento || conclusaoChecklistEmProcessamento;
    const idsCampos = [
        'checklistCliente',
        'checklistLocal',
        'checklistMontagemData',
        'checklistHorario',
        'checklistEvento',
        'checklistDesmontagemData',
        'checklistRespSaida',
        'checklistRespRetorno',
        'checklistModeloSelect'
    ];
    idsCampos.forEach((id) => {
        const campo = document.getElementById(id);
        if (campo) campo.disabled = concluido || processando;
    });

    document.querySelectorAll('#listaChecklistMontagem [data-change="atualizarConferenciaChecklist"]')
        .forEach((campo) => { campo.disabled = concluido || processando; });

    const adicionar = document.getElementById('checklistAdicionarModelo');
    const concluir = document.getElementById('checklistConcluir');
    const limpar = document.getElementById('checklistLimpar');
    const reabrir = document.getElementById('checklistReabrir');
    if (adicionar) adicionar.disabled = concluido || processando;
    if (concluir) {
        concluir.disabled = concluido || processando;
        concluir.setAttribute('aria-busy', conclusaoChecklistEmProcessamento ? 'true' : 'false');
        concluir.textContent = conclusaoChecklistEmProcessamento ? 'Concluindo...' : 'Concluir checklist';
    }
    if (limpar) limpar.disabled = concluido || processando;
    if (reabrir) {
        reabrir.hidden = !concluido;
        reabrir.disabled = reaberturaChecklistEmProcessamento;
        reabrir.setAttribute('aria-busy', reaberturaChecklistEmProcessamento ? 'true' : 'false');
        reabrir.innerHTML = reaberturaChecklistEmProcessamento
            ? '<i class="bi bi-arrow-repeat" aria-hidden="true"></i> Reabrindo...'
            : '<i class="bi bi-unlock" aria-hidden="true"></i> Reabrir Checklist';
    }

    const painel = document.getElementById('tab-checklist');
    if (painel) painel.dataset.checklistConcluido = concluido ? 'true' : 'false';
}

function fingerprintOperacaoChecklist(texto) {
    let hash = 0xcbf29ce484222325n;
    const valor = String(texto);
    for (let indice = 0; indice < valor.length; indice += 1) {
        hash ^= BigInt(valor.charCodeAt(indice));
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
}

function criarOperacaoIdReaberturaChecklist(locacao) {
    const referencia = criarReferenciaTipadaLocacaoChecklist(locacao?.id);
    const checklist = locacao?.checklist || {};
    const origem = JSON.stringify([
        referencia,
        checklist.idChecklist || '',
        checklist.concluidoEm || '',
        checklist.concluidoPor || ''
    ]);
    return `checklist-reabrir-${fingerprintOperacaoChecklist(origem)}`;
}

function criarOperacaoIdConclusaoChecklist(locacao, checklist) {
    const referencia = criarReferenciaTipadaLocacaoChecklist(locacao?.id);
    const origem = JSON.stringify([
        referencia,
        checklist?.idChecklist || '',
        checklist?.ultimaReaberturaOperacaoId || checklist?.criadoEm || '',
        checklist?.dados || {},
        checklist?.itens || [],
        checklist?.conferencia || {}
    ]);
    return `checklist-concluir-${fingerprintOperacaoChecklist(origem)}`;
}

function obterMensagemFalhaReaberturaChecklist(codigo) {
    if (codigo === 'CHECKLIST_JA_REABERTO') return 'Este checklist já foi reaberto.';
    if (codigo === 'OPERACAO_EM_EXECUCAO' || codigo === 'PUBLICACAO_TRANSACIONAL_OCUPADA') {
        return 'Outra operação segura está em andamento. Aguarde a conclusão antes de reabrir o checklist.';
    }
    if (codigo === 'OPERACAO_REQUER_RECUPERACAO'
        || codigo === 'PERSISTENCIA_INDETERMINADA'
        || codigo === 'PERSISTENCIA_CONFIRMADA_DIVERGENTE') {
        return 'A reabertura exige recuperação explícita. Recarregue os dados antes de tentar novamente.';
    }
    return 'Não foi possível reabrir o checklist com segurança. Nenhuma alteração foi liberada.';
}

function executarReaberturaChecklistConfirmada() {
    if (reaberturaChecklistEmProcessamento) return;
    const locacaoAtual = obterLocacaoChecklistAtual();
    if (!locacaoAtual || locacaoAtual.checklist?.concluido !== true) {
        mostrarToast('Este checklist não está concluído ou não foi encontrado.', 'erro');
        return;
    }

    reaberturaChecklistEmProcessamento = true;
    aplicarEstadoOperacionalChecklist();
    let resultado = { ok: false, codigo: 'FALHA_REABERTURA' };
    try {
        if (typeof executarReaberturaChecklistTransacional !== 'function'
            || typeof criarDependenciasExecutorReaberturaChecklist !== 'function') {
            throw new Error('Infraestrutura transacional indisponível.');
        }
        const agora = typeof obterAgoraIso === 'function' ? obterAgoraIso() : new Date().toISOString();
        const instante = new Date(agora);
        if (!Number.isFinite(instante.getTime())) throw new Error('Data da operação inválida.');
        resultado = executarReaberturaChecklistTransacional({
            locacaoId: clonarDadoChecklist(locacaoAtual.id, ''),
            operacaoId: criarOperacaoIdReaberturaChecklist(locacaoAtual),
            atualizadoEm: agora,
            atualizadoPor: obterUsuarioChecklistAtual(),
            persistencia: {
                versao: window.SCHEMA_VERSION_V12 || '12.6',
                data: agora,
                ultimaEdicao: instante.getTime()
            }
        }, criarDependenciasExecutorReaberturaChecklist({ armazenamento: localStorage }));
    } catch (erro) {
        resultado = { ok: false, codigo: 'FALHA_REABERTURA', erro: String(erro?.message || erro) };
    } finally {
        reaberturaChecklistEmProcessamento = false;
    }

    if (!resultado.ok) {
        aplicarEstadoOperacionalChecklist();
        mostrarToast(obterMensagemFalhaReaberturaChecklist(resultado.codigo), 'erro', 8000);
        return;
    }

    const locacaoPublicada = obterLocacaoChecklistAtual();
    if (!locacaoPublicada || locacaoPublicada.checklist?.concluido !== false
        || locacaoPublicada.checklist?.ultimaReaberturaOperacaoId !== resultado.operacao?.operacaoId) {
        aplicarEstadoOperacionalChecklist();
        mostrarToast('A reabertura exige recuperação explícita antes de liberar os controles.', 'erro', 8000);
        return;
    }
    if (resultado.efeitos?.renderizar) {
        restaurarChecklistPersistidoDaLocacao(locacaoPublicada);
        renderChecklistMontagem();
        atualizarOrigemChecklistLocacao(locacaoPublicada);
        focarPrimeiraPendenciaChecklist();
    }
    const sincronizacaoPendente = resultado.avisos?.some((aviso) => aviso?.codigo === 'METADADO_SYNC_PENDENTE');
    mostrarToast(sincronizacaoPendente
        ? 'Checklist reaberto. A atualização de sincronização ficou pendente.'
        : 'Checklist reaberto com sucesso. Os campos operacionais estão liberados.',
    sincronizacaoPendente ? 'info' : undefined);
    if (resultado.efeitos?.sincronizar && typeof sincronizar === 'function') {
        try {
            const sincronizacao = sincronizar('salvar');
            if (sincronizacao && typeof sincronizacao.catch === 'function') {
                sincronizacao.catch((erro) => console.error('Sincronização da reabertura ficou pendente:', erro));
            }
        } catch (erro) {
            console.error('A reabertura foi confirmada, mas a sincronização não iniciou:', erro);
        }
    }
}

function reabrirChecklistDaLocacao() {
    if (reaberturaChecklistEmProcessamento) return;
    const locacao = obterLocacaoChecklistAtual();
    if (!locacao || locacao.checklist?.concluido !== true) {
        mostrarToast('Este checklist não está concluído.', 'erro');
        return;
    }
    confirmarAcao(
        'Reabrir este checklist permitirá novas alterações operacionais. Deseja continuar?',
        executarReaberturaChecklistConfirmada,
        {
            titulo: 'Reabrir Checklist',
            textoConfirmar: 'Reabrir Checklist',
            classeConfirmar: 'btn-warning'
        }
    );
}

function registrarHistoricoChecklistLocacao(locacao, acao, descricao) {
    if (!locacao) return;
    if (typeof registrarHistoricoLocacaoDominio === 'function') {
        registrarHistoricoLocacaoDominio(locacao, {
            acao,
            descricao,
            origem: 'checklist',
            usuario: obterUsuarioChecklistAtual()
        });
    }
}

function criarEstadoChecklistDaLocacao(locacao) {
    if (!locacao || !Array.isArray(checklistMontagem)) return false;

    const agora = typeof obterAgoraIso === 'function' ? obterAgoraIso() : new Date().toISOString();
    const checklistAnterior = locacao.checklist && typeof locacao.checklist === 'object'
        ? locacao.checklist
        : {};
    if (checklistAnterior.concluido === true) return false;
    const resumo = calcularResumoChecklistAtual();
    const dados = obterDadosCabecalhoChecklist();
    const itensPersistidos = checklistMontagem.map((item) => clonarDadoChecklist(item, {}));
    const conferenciaPersistida = clonarDadoChecklist(checklistConferencia, {});

    return {
        ...checklistAnterior,
        idChecklist: checklistAnterior.idChecklist || `checklist-${String(locacao.id || '')}`,
        locacaoId: clonarDadoChecklist(locacao.id, ''),
        status: 'gerado',
        origem: 'locacao',
        versaoSnapshot: 1,
        dados,
        itens: itensPersistidos,
        conferencia: conferenciaPersistida,
        origemSnapshot: checklistAnterior.origemSnapshot || {
            clienteId: locacao.clienteId ?? locacao.locadorId ?? '',
            cliente: clonarDadoChecklist(locacao.clienteSnapshot || locacao.cliente || {}, {}),
            dadosFiscais: clonarDadoChecklist(locacao.dadosFiscaisCliente || {}, {}),
            evento: clonarDadoChecklist(locacao.evento || {
                nome: locacao.eventoNome || '',
                local: locacao.eventoLocal || '',
                enderecoEvento: locacao.eventoEndereco || '',
                cidadeEvento: locacao.cidadeEvento || '',
                ufEvento: locacao.ufEvento || '',
                referenciaAcesso: locacao.referenciaAcesso || '',
                observacoesGerais: locacao.observacoesGerais || ''
            }, {}),
            datasMontagem: clonarDadoChecklist(locacao.datasMontagem || {}, {}),
            datasDesmontagem: clonarDadoChecklist(locacao.datasDesmontagem || {}, {}),
            equipe: clonarDadoChecklist(locacao.equipe || {}, {}),
            logistica: clonarDadoChecklist(locacao.logistica || {}, {})
        },
        resumo,
        criadoEm: checklistAnterior.criadoEm || agora,
        criadoPor: checklistAnterior.criadoPor || obterUsuarioChecklistAtual(),
        ultimaAtualizacao: agora,
        atualizadoPor: obterUsuarioChecklistAtual()
    };
}

function persistirEstadoChecklistNaLocacao(locacao, opcoes = {}) {
    const checklist = criarEstadoChecklistDaLocacao(locacao, opcoes);
    if (!checklist) return false;
    locacao.checklist = checklist;
    return true;
}

function preencherCabecalhoChecklistDaLocacao(locacao, dadosPersistidos = null) {
    const clienteResolvido = resolverClientePorIdExato(locadores, locacao.locadorId);
    const cliente = clienteResolvido.encontrado ? clienteResolvido.cliente : null;
    const dados = dadosPersistidos && typeof dadosPersistidos === 'object' ? dadosPersistidos : {};
    const cidadeUf = [locacao.cidadeEvento || locacao.evento?.cidadeEvento, locacao.ufEvento || locacao.evento?.ufEvento]
        .filter(Boolean)
        .join('/');
    const localCompleto = [
        locacao.eventoLocal || locacao.evento?.local,
        locacao.eventoEndereco || locacao.evento?.enderecoEvento || locacao.logistica?.endereco,
        cidadeUf
    ].filter((valor, indice, lista) => valor && lista.indexOf(valor) === indice).join(' • ');

    preencherCampoChecklist(
        'checklistCliente',
        dados.cliente ?? cliente?.nome ?? locacao.clienteSnapshot?.nome ?? locacao.cliente?.nome ?? locacao.clienteNome ?? ''
    );
    preencherCampoChecklist(
        'checklistLocal',
        dados.local ?? localCompleto
    );
    preencherCampoChecklist('checklistMontagemData', dados.montagem ?? locacao.dataAluguel ?? locacao.datasMontagem?.inicio ?? '');
    preencherCampoChecklist(
        'checklistHorario',
        dados.horario ?? locacao.datasMontagem?.horarioInicio ?? locacao.logistica?.horarioSaida ?? ''
    );
    preencherCampoChecklist(
        'checklistEvento',
        dados.evento ?? locacao.eventoNome ?? locacao.codigoProposta ?? `Locação #${String(locacao.id).slice(-4)}`
    );
    preencherCampoChecklist(
        'checklistDesmontagemData',
        dados.desmontagem ?? locacao.dataDevolucaoPrevisao ?? locacao.datasDesmontagem?.inicio ?? ''
    );
    preencherCampoChecklist('checklistRespSaida', dados.respSaida ?? locacao.equipe?.responsavel ?? '');
    preencherCampoChecklist('checklistRespRetorno', dados.respRetorno ?? locacao.equipe?.responsavel ?? '');
    atualizarOrigemChecklistLocacao(locacao, cliente?.nome || locacao.clienteNome || '');
}

function atualizarOrigemChecklistLocacao(locacao, clienteNome = '') {
    const banner = document.getElementById('checklistOrigemLocacao');
    if (!banner) return;

    if (!locacao) {
        banner.hidden = true;
        banner.innerHTML = '';
        return;
    }

    const codigoLocacao = `#${String(locacao.id || '').slice(-4) || '----'}`;
    const proposta = locacao.codigoProposta ? ` • Proposta ${locacao.codigoProposta}` : '';
    const concluido = locacao.checklist?.concluido === true;
    banner.hidden = false;
    banner.innerHTML = `
        <i class="bi bi-link-45deg" aria-hidden="true"></i>
        <div>
            <strong>Checklist originado da locação ${codigoLocacao}</strong>
            <span>${escaparHTMLChecklist(clienteNome || locacao.clienteSnapshot?.nome || locacao.cliente?.nome || locacao.clienteNome || 'Cliente')}${escaparHTMLChecklist(proposta)}${concluido ? ' • Concluído' : ''}</span>
        </div>
        <button
            type="button"
            class="btn btn-sm btn-secondary checklist-origin-back"
            data-action="voltarParaLocacaoDoChecklist"
            aria-label="Voltar para a locação de origem">
            <i class="bi bi-arrow-left" aria-hidden="true"></i>
            <span>Voltar para a locação</span>
        </button>
    `;
}

function obterOrigemChecklistAtual() {
    const locacaoId = obterIdLocacaoChecklistAtual();
    if (locacaoId === null || !Array.isArray(locacoes)) return null;

    const resultado = resolverRegistroPorIdExato(locacoes, locacaoId);
    if (!resultado.encontrado) return null;
    const locacao = resultado.registro;

    const codigoLocacao = `#${String(locacao.id || '').slice(-4) || '----'}`;
    const codigoProposta = locacao.codigoProposta ? ` • Proposta ${locacao.codigoProposta}` : '';
    return {
        locacao,
        texto: `Locação ${codigoLocacao}${codigoProposta}`
    };
}

function obterDetalhesQuantidadeOperacionalChecklist(itemChecklist, locacao = null) {
    const quantidadeTotal = Math.max(parseInt(itemChecklist?.quantidade, 10) || 0, 0);
    const itensLocacao = Array.isArray(locacao?.items) ? locacao.items : [];
    const pecaId = String(itemChecklist?.pecaId || '');
    const nomeItem = String(itemChecklist?.nome || '').trim().toLowerCase();
    const itemLocalizado = itensLocacao.find((item) => (
        (pecaId && String(item?.pecaId || '') === pecaId)
        || (!pecaId && nomeItem && String(item?.nome || '').trim().toLowerCase() === nomeItem)
    ));
    const itemLocacao = Object.prototype.hasOwnProperty.call(itemChecklist || {}, 'origemCusto')
        ? itemChecklist
        : itemLocalizado;

    const possuiOrigem = itemLocacao
        && Object.prototype.hasOwnProperty.call(itemLocacao, 'origemCusto');
    const origemCusto = String(itemLocacao?.origemCusto || '').trim().toLowerCase();
    const possuiClassificacao = possuiOrigem
        && origemCusto
        && origemCusto !== 'nao_informado';

    if (!possuiClassificacao) {
        return {
            quantidadeTotal,
            quantidadePropria: quantidadeTotal,
            quantidadeTerceirizada: 0,
            possuiClassificacao: false,
            divisaoValida: true,
            mensagemDivisao: ''
        };
    }

    let quantidadePropria = quantidadeTotal;
    let quantidadeTerceirizada = 0;
    let divisaoValida = true;
    let mensagemDivisao = '';

    if (origemCusto === 'terceirizado') {
        quantidadePropria = 0;
        quantidadeTerceirizada = quantidadeTotal;
    } else if (origemCusto === 'misto') {
        const propriaInformada = Number(itemLocacao?.quantidadePropria);
        const terceirizadaInformada = Number(itemLocacao?.quantidadeTerceirizada);
        quantidadePropria = Number.isFinite(propriaInformada) ? propriaInformada : 0;
        quantidadeTerceirizada = Number.isFinite(terceirizadaInformada) ? terceirizadaInformada : 0;
        divisaoValida = quantidadePropria >= 0
            && quantidadeTerceirizada >= 0
            && quantidadePropria + quantidadeTerceirizada === quantidadeTotal;

        if (!divisaoValida) {
            mensagemDivisao = 'A soma das quantidades própria e terceirizada deve ser igual à quantidade total do item.';
        }
    }

    return {
        quantidadeTotal,
        quantidadePropria,
        quantidadeTerceirizada,
        possuiClassificacao: true,
        divisaoValida,
        mensagemDivisao
    };
}

function montarResumoQuantidadeOperacionalChecklist(item, opcoes = {}) {
    if (!item?.possuiClassificacaoOperacional) return '';

    const compacto = opcoes.compacto === true;
    const separador = compacto ? ' • ' : '<br>';
    const partes = [`Total necessário: <strong>${item.quantidade}</strong>`];

    if (item.quantidadePropriaOperacional > 0 && item.quantidadeTerceirizada > 0) {
        partes.push(`Separar no estoque próprio: <strong>${item.quantidadePropriaOperacional}</strong>`);
        partes.push(`Material terceirizado: <strong>${item.quantidadeTerceirizada}</strong>`);
    } else if (item.quantidadeTerceirizada > 0) {
        partes.push(`Material terceirizado: <strong>${item.quantidadeTerceirizada}</strong>`);
        partes.push('Separar no estoque: <strong>0</strong>');
    } else {
        partes.push(`Separar no estoque: <strong>${item.quantidadePropriaOperacional}</strong>`);
    }

    return partes.join(separador);
}

function obterPecaChecklistPorId(id) {
    if (!id || !Array.isArray(pecas)) return null;
    return pecas.find((peca) => String(peca.id) === String(id)) || null;
}

function criarItemChecklistDaLocacao(itemLocacao, locacao) {
    const peca = obterPecaChecklistPorId(itemLocacao?.pecaId);
    const quantidade = Math.max(0, parseInt(itemLocacao?.quantidade, 10) || 0);
    const itemPreservado = clonarDadoChecklist(itemLocacao, {});

    return {
        ...itemPreservado,
        locacaoId: clonarDadoChecklist(locacao?.id, ''),
        modeloId: locacao?.origemPropostaId || '',
        modeloNome: locacao?.codigoProposta ? `Proposta ${locacao.codigoProposta}` : `Locação #${String(locacao?.id || '').slice(-4)}`,
        pecaId: peca?.id || itemLocacao?.pecaId || '',
        nome: peca?.nome || itemLocacao?.nome || 'Item da locação',
        medida: peca?.medida || itemLocacao?.medida || '',
        grupoChecklist: peca?.grupoChecklist || itemLocacao?.grupoChecklist || itemLocacao?.categoria || 'outros',
        familiaEstrutural: peca?.familiaEstrutural || itemLocacao?.familiaEstrutural || '',
        subtipoEstrutural: peca?.subtipoEstrutural || itemLocacao?.subtipoEstrutural || '',
        quantidade,
        quantidadePropria: itemLocacao?.quantidadePropria,
        quantidadeTerceirizada: itemLocacao?.quantidadeTerceirizada,
        origemCusto: itemLocacao?.origemCusto
    };
}

function restaurarChecklistPersistidoDaLocacao(locacao) {
    if (!locacao) return false;
    const checklistSalvo = locacao.checklist && typeof locacao.checklist === 'object'
        ? locacao.checklist
        : {};
    const itensLocacao = Array.isArray(locacao.items) ? locacao.items : [];
    const itensSalvos = Array.isArray(checklistSalvo.itens) && checklistSalvo.itens.length
        ? checklistSalvo.itens
        : itensLocacao.map((item) => criarItemChecklistDaLocacao(item, locacao));

    checklistMontagem = itensSalvos.map((item) => ({
        ...clonarDadoChecklist(item, {}),
        locacaoId: clonarDadoChecklist(locacao.id, '')
    }));
    checklistConferencia = checklistSalvo.conferencia && typeof checklistSalvo.conferencia === 'object'
        ? clonarDadoChecklist(checklistSalvo.conferencia, {})
        : {};
    window.checklistMontagem = checklistMontagem;
    window.checklistConferencia = checklistConferencia;
    definirLocacaoChecklistAtual(locacao);

    preencherCabecalhoChecklistDaLocacao(locacao, checklistSalvo.dados);
    return checklistMontagem.length > 0;
}

function mostrarChecklistDaLocacao(locacao, mensagem) {
    if (typeof abrirTab === 'function') {
        abrirTab('checklist', { semRolagem: true });
    } else if (typeof irParaChecklistOperacional === 'function') {
        irParaChecklistOperacional();
    }

    setTimeout(() => {
        renderChecklistMontagem();
        if (locacao?.checklist?.concluido === true) {
            document.getElementById('checklistReabrir')?.focus();
        } else {
            focarPrimeiraPendenciaChecklist();
        }
        mostrarToast(mensagem);
    }, 120);
}

function preencherChecklistComLocacao(locacao, itens) {
    const inativa = encontrarPecaInativaVinculada(itens, pecas);
    if (inativa && !locacao.checklist?.idChecklist && !locacao.checklist?.criadoEm) {
        mostrarToast(`${inativa.nome}: peça inativa; novo checklist bloqueado.`, 'erro');
        return false;
    }
    const clienteResolvido = resolverClientePorIdExato(locadores, locacao.locadorId);
    const cliente = clienteResolvido.encontrado ? clienteResolvido.cliente : null;
    const jaExistia = Boolean(locacao.checklist?.idChecklist || locacao.checklist?.criadoEm);

    checklistMontagem = itens.map((item) => criarItemChecklistDaLocacao(item, locacao));
    checklistConferencia = {};
    window.checklistMontagem = checklistMontagem;
    window.checklistConferencia = checklistConferencia;
    definirLocacaoChecklistAtual(locacao);
    preencherCabecalhoChecklistDaLocacao(locacao);
    persistirEstadoChecklistNaLocacao(locacao);

    if (!jaExistia) {
        const clienteNome = cliente?.nome || locacao.clienteNome || 'Cliente';
        registrarHistoricoChecklistLocacao(
            locacao,
            'checklist_criado',
            `Checklist criado para a locação de ${clienteNome}.`
        );
        if (typeof registrarLog === 'function') {
            registrarLog(
                'checklist',
                'gerar',
                `Checklist gerado a partir da locação de ${clienteNome} #${String(locacao.id || '').slice(-4)}.`,
                { locacaoId: String(locacao.id || ''), checklistId: locacao.checklist?.idChecklist || '' }
            );
        }
    }

    if (typeof salvarLocal === 'function') salvarLocal();
    mostrarChecklistDaLocacao(locacao, jaExistia
        ? 'Checklist existente da locação aberto.'
        : 'Checklist gerado a partir da locação.');
}

function abrirChecklistAtualDaLocacao(locacao) {
    if (!restaurarChecklistPersistidoDaLocacao(locacao)) {
        mostrarToast('Essa locação não possui itens para checklist.', 'erro');
        return;
    }
    mostrarChecklistDaLocacao(locacao, 'Checklist da locação aberto.');
}

function gerarChecklistDaLocacao(id) {
    const resultadoLocacao = typeof id === 'string' && id.startsWith('locacao:')
        ? resolverLocacaoChecklistPorReferencia(id)
        : resolverRegistroPorIdExato(locacoes, id);
    const locacao = resultadoLocacao.encontrado ? resultadoLocacao.registro : null;

    if (!locacao) {
        const mensagem = resultadoLocacao.estado === 'duplicado'
            ? 'Existem locações com o mesmo identificador. Corrija o cadastro antes de abrir o checklist.'
            : 'Locação não encontrada para gerar checklist.';
        mostrarToast(mensagem, 'erro');
        return;
    }

    const itens = Array.isArray(locacao.items) ? locacao.items : [];
    if (!itens.length) {
        mostrarToast('Essa locação não possui itens para checklist.', 'erro');
        return;
    }

    const checklistPersistido = locacao.checklist && typeof locacao.checklist === 'object'
        && (
            locacao.checklist.idChecklist
            || locacao.checklist.status === 'gerado'
            || (Array.isArray(locacao.checklist.itens) && locacao.checklist.itens.length > 0)
        );
    if (checklistPersistido) {
        abrirChecklistAtualDaLocacao(locacao);
        return;
    }

    const checklistAtualReferencia = String(window.checklistLocacaoAtualReferencia || '');
    const referenciaLocacao = criarReferenciaTipadaLocacaoChecklist(locacao.id);
    const checklistAtualDaLocacao = checklistAtualReferencia === referenciaLocacao
        && Array.isArray(checklistMontagem)
        && checklistMontagem.length > 0;

    if (checklistAtualDaLocacao) {
        abrirChecklistAtualDaLocacao(locacao);
        return;
    }

    const temChecklistEmAndamento = Array.isArray(checklistMontagem)
        && checklistMontagem.length > 0
        && checklistAtualReferencia !== referenciaLocacao;

    if (temChecklistEmAndamento && typeof confirmarAcao === 'function') {
        confirmarAcao('Já existe um checklist montado na tela. Deseja substituir pelos itens desta locação?', () => {
            preencherChecklistComLocacao(locacao, itens);
        }, {
            titulo: 'Substituir checklist atual',
            textoConfirmar: 'Substituir',
            classeConfirmar: 'btn-warning'
        });
        return;
    }

    if (temChecklistEmAndamento && !confirm('Já existe um checklist montado na tela. Deseja substituir pelos itens desta locação?')) {
        return;
    }

    preencherChecklistComLocacao(locacao, itens);
}

function normalizarGrupoChecklist(grupo) {
    const valor = String(grupo || '').trim().toLowerCase();
    const mapa = {
        'elétrica': 'eletrica',
        eletrica: 'eletrica',
        'móveis': 'moveis',
        moveis: 'moveis',
        'estrutura q15': 'estrutura_q15',
        'estrutura q30': 'estrutura_q30'
    };

    return mapa[valor] || valor || 'outros';
}

function formatarNomeGrupoChecklist(grupo) {
    const mapa = {
        estrutura: 'Estrutura',
        estrutura_q15: 'Estrutura Q15',
        estrutura_q30: 'Estrutura Q30',
        cobertura: 'Cobertura',
        elétrica: 'Elétrica',
        eletrica: 'Elétrica',
        moveis: 'Móveis',
        móveis: 'Móveis',
        comunicacao: 'Comunicação Visual',
        escritorio: 'Escritório',
        acabamento: 'Acabamento',
        outros: 'Outros'
    };

    return mapa[grupo] || grupo || 'Outros';
}

function escaparHTMLChecklist(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function escaparAtributoChecklist(valor) {
    return escaparHTMLChecklist(valor).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function criarEstadoChecklistPainel(opcoes = {}) {
    if (typeof criarEstadoPainel === 'function') {
        return criarEstadoPainel(opcoes.mensagem, {
            tipo: opcoes.tipo || 'info',
            titulo: opcoes.titulo || 'Informação'
        });
    }
    return `<p class="muted-note">${escaparHTMLChecklist(opcoes.mensagem || 'Sem dados para mostrar.')}</p>`;
}

function formatarDataChecklist(valor) {
    if (!valor) return '-';
    const data = new Date(`${valor}T00:00:00`);
    if (isNaN(data.getTime())) return '-';
    return data.toLocaleDateString('pt-BR');
}

function obterDadosCabecalhoChecklist() {
    return {
        cliente: document.getElementById('checklistCliente')?.value || '',
        local: document.getElementById('checklistLocal')?.value || '',
        montagem: document.getElementById('checklistMontagemData')?.value || '',
        horario: document.getElementById('checklistHorario')?.value || '',
        evento: document.getElementById('checklistEvento')?.value || '',
        desmontagem: document.getElementById('checklistDesmontagemData')?.value || '',
        respSaida: document.getElementById('checklistRespSaida')?.value || '',
        respRetorno: document.getElementById('checklistRespRetorno')?.value || ''
    };
}

function obterNomeItemChecklist(item) {
    const nome = String(item.nome || '').trim();
    const medida = String(item.medida || '').trim();
    const subtipo = String(item.subtipoEstrutural || '').trim();

    if (nome && medida && !nome.toLowerCase().includes(medida.toLowerCase())) {
        return `${nome} - ${medida}`;
    }

    return nome || medida || subtipo || 'Item';
}

function chaveConferenciaChecklist(grupo, nomeItem) {
    const base = `${grupo || 'outros'}::${nomeItem || 'item'}`.toLowerCase();
    return base.replace(/\s+/g, '_').replace(/[^a-z0-9:_-]/g, '');
}

function obterConferenciaItemChecklist(chave, quantidadeSaida) {
    if (!checklistConferencia || typeof checklistConferencia !== 'object') {
        checklistConferencia = {};
    }

    if (!checklistConferencia[chave]) {
        checklistConferencia[chave] = {
            retorno: '',
            status: 'pendente',
            observacao: ''
        };
    }

    const registro = checklistConferencia[chave];
    const maximo = Math.max(parseInt(quantidadeSaida, 10) || 0, 0);
    const retornoNumero = parseInt(registro.retorno, 10);

    registro.retorno = Number.isInteger(retornoNumero)
        ? Math.max(0, Math.min(retornoNumero, maximo))
        : '';

    const statusPermitido = ['pendente', 'ok', 'faltando', 'avaria'];
    if (!statusPermitido.includes(registro.status)) {
        registro.status = 'pendente';
    }
    if (registro.status !== 'avaria') {
        if (registro.retorno === '') registro.status = 'pendente';
        else if (registro.retorno === maximo) registro.status = 'ok';
        else registro.status = 'faltando';
    }

    registro.observacao = String(registro.observacao || '').trim().slice(0, 160);
    return registro;
}

function atualizarConferenciaChecklist(chave, campo, valor, quantidadeSaida) {
    if (bloquearMutacaoChecklistConcluido()) {
        renderChecklistMontagem();
        return;
    }
    const registro = obterConferenciaItemChecklist(chave, quantidadeSaida);

    if (campo === 'retorno') {
        const maximo = Math.max(parseInt(quantidadeSaida, 10) || 0, 0);
        const numero = parseInt(valor, 10);
        registro.retorno = Number.isInteger(numero)
            ? Math.max(0, Math.min(numero, maximo))
            : '';

        if (registro.status !== 'avaria') {
            if (registro.retorno === '') registro.status = 'pendente';
            else if (registro.retorno >= maximo) registro.status = 'ok';
            else registro.status = 'faltando';
        }
    }

    if (campo === 'status') {
        const statusPermitido = ['pendente', 'ok', 'faltando', 'avaria'];
        const statusSolicitado = statusPermitido.includes(valor) ? valor : 'pendente';
        const maximo = Math.max(parseInt(quantidadeSaida, 10) || 0, 0);

        if (statusSolicitado === 'avaria') {
            registro.status = 'avaria';
        } else {
            if (statusSolicitado === 'ok') registro.retorno = maximo;
            if (registro.retorno === '') registro.status = 'pendente';
            else if (registro.retorno === maximo) registro.status = 'ok';
            else registro.status = 'faltando';
        }
    }

    if (campo === 'observacao') {
        registro.observacao = String(valor || '').trim().slice(0, 160);
    }

    checklistConferencia[chave] = registro;
    window.checklistConferencia = checklistConferencia;
    atualizarResumoChecklistLocacaoAtual({ marcarComoEmAndamento: true });
    if (typeof salvarLocal === 'function') salvarLocal();

    if (campo !== 'observacao') {
        renderChecklistMontagem();
    }
}

function sincronizarConferenciaChecklist(grupos) {
    if (!checklistConferencia || typeof checklistConferencia !== 'object') {
        checklistConferencia = {};
    }

    const chavesValidas = new Set();
    (grupos || []).forEach(grupo => {
        (grupo.itens || []).forEach(item => {
            if (item.chaveConferencia) chavesValidas.add(item.chaveConferencia);
        });
    });

    Object.keys(checklistConferencia).forEach(chave => {
        if (!chavesValidas.has(chave)) delete checklistConferencia[chave];
    });

    window.checklistConferencia = checklistConferencia;
}

function obterGruposChecklist() {
    const gruposMap = {};
    const locacaoOrigem = obterOrigemChecklistAtual()?.locacao || null;

    (checklistMontagem || []).forEach(item => {
        const grupo = normalizarGrupoChecklist(item.grupoChecklist || item.grupo || item.categoriaChecklist || item.categoria);

        if (!gruposMap[grupo]) {
            gruposMap[grupo] = {
                chave: grupo,
                titulo: formatarNomeGrupoChecklist(grupo),
                total: 0,
                modelos: new Set(),
                itens: new Map()
            };
        }

        const referencia = obterNomeItemChecklist(item);
        const chaveConferencia = chaveConferenciaChecklist(grupo, referencia);

        const qtd = Number(item.quantidade) || 0;
        const detalhesQuantidade = obterDetalhesQuantidadeOperacionalChecklist(item, locacaoOrigem);
        const linhaAtual = gruposMap[grupo].itens.get(referencia) || {
            nome: referencia,
            quantidade: 0,
            quantidadePropriaOperacional: 0,
            quantidadeTerceirizada: 0,
            possuiClassificacaoOperacional: false,
            divisaoOperacionalValida: true,
            mensagemDivisaoOperacional: '',
            chaveConferencia
        };

        linhaAtual.quantidade += qtd;
        linhaAtual.quantidadePropriaOperacional += detalhesQuantidade.quantidadePropria;
        linhaAtual.quantidadeTerceirizada += detalhesQuantidade.quantidadeTerceirizada;
        linhaAtual.possuiClassificacaoOperacional = linhaAtual.possuiClassificacaoOperacional
            || detalhesQuantidade.possuiClassificacao;
        if (!detalhesQuantidade.divisaoValida) {
            linhaAtual.divisaoOperacionalValida = false;
            linhaAtual.mensagemDivisaoOperacional = detalhesQuantidade.mensagemDivisao;
        }
        gruposMap[grupo].itens.set(referencia, linhaAtual);
        gruposMap[grupo].total += qtd;

        if (item.modeloNome) gruposMap[grupo].modelos.add(item.modeloNome);
    });

    const ordem = [
        'estrutura',
        'estrutura_q15',
        'estrutura_q30',
        'cobertura',
        'eletrica',
        'moveis',
        'acabamento',
        'comunicacao',
        'escritorio',
        'outros'
    ];

    return Object.keys(gruposMap)
        .sort((a, b) => {
            const posA = ordem.includes(a) ? ordem.indexOf(a) : 999;
            const posB = ordem.includes(b) ? ordem.indexOf(b) : 999;
            if (posA !== posB) return posA - posB;
            return formatarNomeGrupoChecklist(a).localeCompare(formatarNomeGrupoChecklist(b));
        })
        .map(chave => ({
            ...gruposMap[chave],
            modelos: Array.from(gruposMap[chave].modelos),
            itens: Array.from(gruposMap[chave].itens.values()).map(item => {
                const quantidadeConferencia = item.possuiClassificacaoOperacional
                    ? item.quantidadePropriaOperacional
                    : item.quantidade;
                const conferencia = obterConferenciaItemChecklist(item.chaveConferencia, quantidadeConferencia);

                // Item totalmente terceirizado não é pendência do estoque próprio.
                if (item.possuiClassificacaoOperacional && quantidadeConferencia === 0) {
                    conferencia.retorno = 0;
                    conferencia.status = 'ok';
                }

                return {
                    ...item,
                    quantidadeConferencia,
                    conferencia
                };
            })
        }));
}

function calcularResumoChecklistAtual() {
    const grupos = obterGruposChecklist();
    sincronizarConferenciaChecklist(grupos);

    const resumo = grupos.reduce((acc, grupo) => {
        acc.totalItens += Number(grupo.total) || 0;
        acc.totalLinhas += grupo.itens.length;

        grupo.itens.forEach((item) => {
            const status = item.conferencia?.status || 'pendente';
            if (status === 'ok') acc.conferidos += 1;
            else if (status === 'faltando') acc.faltando += 1;
            else if (status === 'avaria') acc.avarias += 1;
            else acc.pendentes += 1;
        });

        return acc;
    }, {
        totalItens: 0,
        totalLinhas: 0,
        conferidos: 0,
        pendentes: 0,
        faltando: 0,
        avarias: 0
    });

    resumo.percentual = resumo.totalLinhas
        ? Math.round((resumo.conferidos / resumo.totalLinhas) * 100)
        : 0;
    return resumo;
}

function atualizarResumoChecklistLocacaoAtual(opcoes = {}) {
    const locacao = obterLocacaoChecklistAtual();
    if (!locacao || !Array.isArray(checklistMontagem) || !checklistMontagem.length) return false;

    return persistirEstadoChecklistNaLocacao(locacao, opcoes);
}

function atualizarCabecalhoChecklistDaLocacao() {
    if (bloquearMutacaoChecklistConcluido()) {
        const locacaoBloqueada = obterLocacaoChecklistAtual();
        if (locacaoBloqueada) preencherCabecalhoChecklistDaLocacao(locacaoBloqueada, locacaoBloqueada.checklist?.dados);
        aplicarEstadoOperacionalChecklist();
        return;
    }
    const locacao = obterLocacaoChecklistAtual();
    if (!locacao) return;
    persistirEstadoChecklistNaLocacao(locacao, { marcarComoEmAndamento: true });
    if (typeof salvarLocal === 'function') salvarLocal();
}

function voltarParaLocacaoDoChecklist() {
    const locacaoId = obterIdLocacaoChecklistAtual();
    if (locacaoId === null) {
        mostrarToast('A locação de origem deste checklist não foi encontrada.', 'erro');
        return;
    }

    atualizarResumoChecklistLocacaoAtual();
    if (typeof salvarLocal === 'function') salvarLocal();

    if (typeof irParaLocacaoPorCodigo === 'function') {
        irParaLocacaoPorCodigo(window.checklistLocacaoAtualReferencia || locacaoId);
        return;
    }
    if (typeof abrirTab === 'function') abrirTab('locacoes', { semRolagem: true });
}

function idCampoConferenciaChecklist(prefixo, chave) {
    const sufixo = String(chave || 'item').replace(/[^a-z0-9_-]/gi, '-');
    return `${prefixo}-${sufixo}`;
}

function focarPrimeiraPendenciaChecklist() {
    if (checklistAtualEstaConcluido()) {
        document.getElementById('checklistReabrir')?.focus();
        return;
    }
    const primeiroPendente = obterGruposChecklist()
        .flatMap((grupo) => grupo.itens)
        .find((item) => (
            !item.divisaoOperacionalValida
            || (
                item.quantidadeConferencia > 0
                && (
                    item.conferencia?.status !== 'ok'
                    || Number(item.conferencia?.retorno) !== item.quantidadeConferencia
                )
            )
        ));

    if (!primeiroPendente) {
        focarCampoChecklist('checklistCliente');
        return;
    }

    const prefixo = primeiroPendente.divisaoOperacionalValida
        ? 'checklist-retorno'
        : 'checklist-item';
    focarCampoChecklist(idCampoConferenciaChecklist(prefixo, primeiroPendente.chaveConferencia));
}

function concluirChecklistDaLocacao() {
    if (conclusaoChecklistEmProcessamento) return;
    const locacao = obterLocacaoChecklistAtual();
    if (!locacao) {
        mostrarToast('Abra um checklist originado de uma locação antes de concluir.', 'erro');
        focarCampoChecklist('checklistCliente');
        return;
    }
    if (locacao.checklist?.concluido === true) {
        mostrarToast('Este checklist já está concluído. Use “Reabrir Checklist” para fazer alterações.', 'info');
        aplicarEstadoOperacionalChecklist();
        document.getElementById('checklistReabrir')?.focus();
        return;
    }

    const dados = obterDadosCabecalhoChecklist();
    if (!dados.cliente || !dados.evento) {
        const campoId = !dados.cliente ? 'checklistCliente' : 'checklistEvento';
        mostrarToast(`Preencha ${!dados.cliente ? 'o cliente' : 'o evento'} antes de concluir o checklist.`, 'erro');
        focarCampoChecklist(campoId, !dados.cliente);
        return;
    }

    const grupos = obterGruposChecklist();
    const primeiraDivisaoInvalida = grupos
        .flatMap((grupo) => grupo.itens)
        .find((item) => !item.divisaoOperacionalValida);

    if (primeiraDivisaoInvalida) {
        mostrarToast(
            `${primeiraDivisaoInvalida.mensagemDivisaoOperacional} Item: "${primeiraDivisaoInvalida.nome}".`,
            'erro'
        );
        focarCampoChecklist(
            idCampoConferenciaChecklist('checklist-item', primeiraDivisaoInvalida.chaveConferencia)
        );
        return;
    }

    const primeiroPendente = grupos
        .flatMap((grupo) => grupo.itens)
        .find((item) => (
            item.quantidadeConferencia > 0
            && (
                item.conferencia?.status !== 'ok'
                || Number(item.conferencia?.retorno) !== item.quantidadeConferencia
            )
        ));

    if (primeiroPendente) {
        const idControle = idCampoConferenciaChecklist(
            primeiroPendente.conferencia?.status === 'avaria' ? 'checklist-status' : 'checklist-retorno',
            primeiroPendente.chaveConferencia
        );
        const detalhe = primeiroPendente.conferencia?.status === 'avaria'
            ? 'O item está marcado com avaria e precisa ser tratado.'
            : `Informe ${primeiroPendente.quantidadeConferencia} unidade(s) conferida(s).`;
        mostrarToast(
            `Não foi possível concluir "${primeiroPendente.nome}". ${detalhe}`,
            'erro'
        );
        focarCampoChecklist(idControle);
        return;
    }

    const agora = typeof obterAgoraIso === 'function' ? obterAgoraIso() : new Date().toISOString();
    const instante = new Date(agora);
    const atualizadoPor = obterUsuarioChecklistAtual();
    const checklistPreparado = criarEstadoChecklistDaLocacao(locacao);
    if (!checklistPreparado || !Number.isFinite(instante.getTime())) {
        mostrarToast('Não foi possível preparar o checklist para conclusão.', 'erro');
        return;
    }
    checklistPreparado.concluido = true;
    checklistPreparado.status = 'concluido';
    checklistPreparado.concluidoEm = agora;
    checklistPreparado.concluidoPor = atualizadoPor;
    const operacaoId = criarOperacaoIdConclusaoChecklist(locacao, checklistPreparado);

    if (typeof executarConclusaoChecklistTransacional !== 'function'
        || typeof criarDependenciasExecutorConclusaoChecklist !== 'function') {
        mostrarToast('Infraestrutura transacional indisponível para concluir o checklist.', 'erro');
        return;
    }

    conclusaoChecklistEmProcessamento = true;
    aplicarEstadoOperacionalChecklist();
    let resultado;
    try {
        resultado = executarConclusaoChecklistTransacional({
            locacaoId: clonarDadoChecklist(locacao.id, ''),
            operacaoId,
            atualizadoEm: agora,
            atualizadoPor,
            checklistConcluido: checklistPreparado,
            persistencia: {
                versao: window.SCHEMA_VERSION_V12 || '12.6',
                data: agora,
                ultimaEdicao: instante.getTime()
            }
        }, criarDependenciasExecutorConclusaoChecklist({ armazenamento: localStorage }));
    } catch (erro) {
        resultado = { ok: false, codigo: 'FALHA_CONCLUSAO_CHECKLIST', erro: String(erro?.message || erro) };
    } finally {
        conclusaoChecklistEmProcessamento = false;
    }

    if (!resultado?.ok) {
        aplicarEstadoOperacionalChecklist();
        const recuperacao = resultado?.requerRecuperacao === true
            || resultado?.codigo === 'OPERACAO_REQUER_RECUPERACAO';
        mostrarToast(recuperacao
            ? 'A conclusão exige recuperação explícita. Nenhuma nova tentativa automática foi feita.'
            : 'Não foi possível concluir o checklist com segurança.', 'erro', 8000);
        return;
    }

    const locacaoPublicada = obterLocacaoChecklistAtual();
    if (!locacaoPublicada || locacaoPublicada.checklist?.concluido !== true
        || locacaoPublicada.checklist?.ultimaConclusaoOperacaoId !== resultado.operacao?.operacaoId) {
        aplicarEstadoOperacionalChecklist();
        mostrarToast('A conclusão exige recuperação explícita antes de atualizar a tela.', 'erro', 8000);
        return;
    }
    if (resultado.efeitos?.renderizar) {
        renderChecklistMontagem();
        document.getElementById('checklistReabrir')?.focus();
    }
    const sincronizacaoPendente = resultado.avisos?.some((aviso) => aviso?.codigo === 'METADADO_SYNC_PENDENTE');
    mostrarToast(sincronizacaoPendente
        ? 'Checklist concluído. A atualização de sincronização ficou pendente.'
        : 'Checklist concluído com sucesso.', sincronizacaoPendente ? 'info' : undefined);
    if (resultado.efeitos?.sincronizar && typeof sincronizar === 'function') {
        try {
            const sincronizacao = sincronizar('salvar');
            if (sincronizacao && typeof sincronizacao.catch === 'function') {
                sincronizacao.catch((erro) => console.error('Sincronização da conclusão ficou pendente:', erro));
            }
        } catch (erro) {
            console.error('A conclusão foi confirmada, mas a sincronização não iniciou:', erro);
        }
    }
}

function renderChecklistMontagem() {
    const container = document.getElementById('listaChecklistMontagem');
    if (!container) return;
    const locacaoAtual = obterLocacaoChecklistAtual();
    if (locacaoAtual) {
        preencherCabecalhoChecklistDaLocacao(locacaoAtual, locacaoAtual.checklist?.dados);
    }

    if (!checklistMontagem || !checklistMontagem.length) {
        container.innerHTML = criarEstadoChecklistPainel({
            tipo: 'empty',
            titulo: 'Checklist vazio',
            mensagem: 'Adicione itens ou modelos para iniciar a separação.'
        });
        aplicarEstadoOperacionalChecklist();
        return;
    }

    const grupos = obterGruposChecklist();
    sincronizarConferenciaChecklist(grupos);
    const resumo = calcularResumoChecklistAtual();

    container.innerHTML = `
        <div class="checklist-summary-strip">
            <div class="checklist-summary-main">
                <strong>${resumo.percentual}% conferido</strong>
                <span>${resumo.conferidos}/${resumo.totalLinhas} linhas conferidas • ${resumo.totalItens} peça(s)</span>
            </div>
            <div class="checklist-summary-badges">
                <span class="badge badge-info">${resumo.pendentes} pendente(s)</span>
                <span class="badge badge-warning">${resumo.faltando} faltando</span>
                <span class="badge badge-danger">${resumo.avarias} avaria(s)</span>
            </div>
        </div>
        <div class="checklist-preview-grid">
            ${grupos.map(grupo => `
                <div class="checklist-preview-card">
                    <div class="checklist-preview-head">
                        <div>
                            <strong>${escaparHTMLChecklist(grupo.titulo)}</strong>
                            ${grupo.modelos.length ? `<div style="font-size:0.8rem;color:var(--text-light);margin-top:3px;">${grupo.modelos.map(escaparHTMLChecklist).join(' • ')}</div>` : ''}
                        </div>
                        <span>${grupo.total} item(ns) • ${grupo.itens.filter(item => item.conferencia.status === 'ok').length}/${grupo.itens.length} conferidos</span>
                    </div>
                    <table class="checklist-preview-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Saída</th>
                                <th>Retorno</th>
                                <th>Status</th>
                                <th>Observação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${grupo.itens.map(item => {
                                const idRetorno = idCampoConferenciaChecklist('checklist-retorno', item.chaveConferencia);
                                const idStatus = idCampoConferenciaChecklist('checklist-status', item.chaveConferencia);
                                const idObservacao = idCampoConferenciaChecklist('checklist-observacao', item.chaveConferencia);
                                const idItem = idCampoConferenciaChecklist('checklist-item', item.chaveConferencia);
                                return `
                                <tr id="${idItem}" tabindex="-1" ${item.divisaoOperacionalValida ? '' : 'aria-invalid="true"'}>
                                    <td data-label="Item">
                                        <strong>${escaparHTMLChecklist(item.nome)}</strong>
                                        ${item.possuiClassificacaoOperacional ? `
                                            <div style="margin-top:5px;font-size:0.76rem;line-height:1.45;color:var(--text-light);">
                                                ${montarResumoQuantidadeOperacionalChecklist(item)}
                                            </div>
                                        ` : ''}
                                        ${item.divisaoOperacionalValida ? '' : `
                                            <div role="alert" style="margin-top:6px;color:var(--danger);font-size:0.76rem;font-weight:700;line-height:1.4;">
                                                ${escaparHTMLChecklist(item.mensagemDivisaoOperacional)}
                                            </div>
                                        `}
                                    </td>
                                    <td data-label="Total necessário">${item.quantidade}</td>
                                    <td data-label="Conferência interna">
                                        ${item.quantidadeConferencia > 0 ? `
                                            <input
                                                id="${idRetorno}"
                                                type="number"
                                                min="0"
                                                max="${item.quantidadeConferencia}"
                                                 class="checklist-input-retorno"
                                                 aria-label="Quantidade conferida internamente de ${escaparAtributoChecklist(item.nome)}"
                                                 ${item.divisaoOperacionalValida ? '' : 'aria-invalid="true"'}
                                                 value="${item.conferencia.retorno === '' ? '' : item.conferencia.retorno}"
                                                data-change="atualizarConferenciaChecklist"
                                                data-arg="${item.chaveConferencia}"
                                                data-arg2="retorno"
                                                 data-arg3="__value__"
                                                 data-arg4="${item.quantidadeConferencia}"
                                                 ${locacaoAtual?.checklist?.concluido === true ? 'disabled' : ''}>
                                        ` : '<span class="badge badge-info">Sem separação interna</span>'}
                                    </td>
                                    <td data-label="Status">
                                        ${item.quantidadeConferencia > 0 ? `
                                            <select
                                                id="${idStatus}"
                                                class="checklist-select-status"
                                                aria-label="Status da conferência interna de ${escaparAtributoChecklist(item.nome)}"
                                                data-change="atualizarConferenciaChecklist"
                                                data-arg="${item.chaveConferencia}"
                                                data-arg2="status"
                                             data-arg3="__value__"
                                             data-arg4="${item.quantidadeConferencia}"
                                             ${locacaoAtual?.checklist?.concluido === true ? 'disabled' : ''}>
                                                <option value="pendente" ${item.conferencia.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                                                <option value="ok" ${item.conferencia.status === 'ok' ? 'selected' : ''}>Conferido</option>
                                                <option value="faltando" ${item.conferencia.status === 'faltando' ? 'selected' : ''}>Faltando</option>
                                                <option value="avaria" ${item.conferencia.status === 'avaria' ? 'selected' : ''}>Avaria</option>
                                            </select>
                                        ` : '<span class="badge badge-success">Estoque próprio OK</span>'}
                                    </td>
                                    <td data-label="Observação">
                                        <input
                                            id="${idObservacao}"
                                            type="text"
                                            maxlength="160"
                                            class="checklist-input-obs"
                                            aria-label="Observação da conferência de ${escaparAtributoChecklist(item.nome)}"
                                            value="${escaparHTMLChecklist(item.conferencia.observacao || '')}"
                                            placeholder="Observação rápida"
                                            data-change="atualizarConferenciaChecklist"
                                            data-arg="${item.chaveConferencia}"
                                            data-arg2="observacao"
                                            data-arg3="__value__"
                                            data-arg4="${item.quantidadeConferencia}">
                                    </td>
                                </tr>
                            `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `).join('')}
        </div>
    `;
    aplicarEstadoOperacionalChecklist();
}

function gerarPDFChecklistMontagem(opcoes = {}) {
    if (!checklistMontagem || !checklistMontagem.length) {
        mostrarToast('Nenhum item no checklist para gerar PDF.', 'erro');
        focarCampoChecklist('checklistModeloSelect');
        return;
    }

    const printArea = document.getElementById('printArea');
    const modalRelatorio = document.getElementById('modalRelatorio');

    if (!printArea) {
        mostrarToast('Area de impressao nao encontrada.', 'erro');
        return;
    }

    const dados = obterDadosCabecalhoChecklist();
    if (!dados.cliente || !dados.evento) {
        mostrarToast('Preencha pelo menos cliente e evento antes de gerar o PDF.', 'erro');
        focarCampoChecklist(!dados.cliente ? 'checklistCliente' : 'checklistEvento', !dados.cliente);
        return;
    }

    const logoPdfSrc = (config && config.logo) ? config.logo : './logo.png';

    const grupos = obterGruposChecklist();
    const primeiroItemComDivisaoInvalida = grupos
        .flatMap((grupo) => grupo.itens)
        .find((item) => !item.divisaoOperacionalValida);

    if (primeiroItemComDivisaoInvalida) {
        mostrarToast(
            `Não foi possível gerar o PDF. A soma das quantidades própria e terceirizada deve ser igual à quantidade total do item "${primeiroItemComDivisaoInvalida.nome}".`,
            'erro'
        );
        focarCampoChecklist(
            idCampoConferenciaChecklist('checklist-item', primeiroItemComDivisaoInvalida.chaveConferencia)
        );
        return;
    }

    sincronizarConferenciaChecklist(grupos);
    const origemChecklist = obterOrigemChecklistAtual();
    const resumoChecklist = calcularResumoChecklistAtual();

    const temPendenciaChecklist = resumoChecklist.pendentes > 0
        || resumoChecklist.faltando > 0
        || resumoChecklist.avarias > 0;

    if (!opcoes.ignorarPendencias && temPendenciaChecklist) {
        const mensagem = `Este checklist ainda tem ${resumoChecklist.pendentes} pendente(s), ${resumoChecklist.faltando} faltando e ${resumoChecklist.avarias} avaria(s). Deseja gerar o PDF mesmo assim?`;

        if (typeof confirmarAcao === 'function') {
            confirmarAcao(mensagem, () => gerarPDFChecklistMontagem({ ignorarPendencias: true }), {
                titulo: 'Gerar PDF com pendências',
                textoConfirmar: 'Gerar PDF',
                classeConfirmar: 'btn-warning'
            });
            return;
        }

        if (!confirm(mensagem)) return;
    }

    const totalItens = grupos.reduce((total, grupo) => total + grupo.total, 0);
    const totalLinhas = grupos.reduce((total, grupo) => total + grupo.itens.length, 0);
    const totalConferidos = grupos.reduce((total, grupo) => (
        total + grupo.itens.filter(item => item.conferencia.status === 'ok').length
    ), 0);

    const infoCard = (label, value) => `
        <div style="border:1px solid #d7dde8;border-radius:10px;padding:10px 12px;background:#f8fafc;">
            <div style="font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700;">${label}</div>
            <div style="margin-top:4px;font-size:12px;color:#111827;font-weight:700;line-height:1.3;">${escaparHTMLChecklist(value || '-')}</div>
        </div>
    `;

    const htmlSeparacao = grupos.map((grupo, index) => `
        <section style="margin-top:16px;border:1px solid #d7dde8;border-radius:14px;overflow:hidden;break-inside:avoid;background:#ffffff;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:#111827;color:#ffffff;padding:12px 14px;">
                <div>
                    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#bfdbfe;font-weight:800;">Grupo ${String(index + 1).padStart(2, '0')}</div>
                    <div style="font-size:15px;font-weight:800;margin-top:2px;">${escaparHTMLChecklist(grupo.titulo)}</div>
                </div>
                <div style="font-size:11px;font-weight:800;background:#2563eb;color:#ffffff;border-radius:999px;padding:6px 10px;white-space:nowrap;">${grupo.total} item(ns)</div>
            </div>

            ${grupo.modelos.length ? `
                <div style="padding:10px 14px;background:#eff6ff;border-bottom:1px solid #d7dde8;color:#1e3a8a;font-size:11px;">
                    <strong>Modelo:</strong> ${grupo.modelos.map(escaparHTMLChecklist).join(' • ')}
                </div>
            ` : ''}

            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                    <tr style="background:#f8fafc;color:#475569;">
                        <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #d7dde8;width:46%;">Item</th>
                        <th style="padding:10px 12px;text-align:center;border-bottom:1px solid #d7dde8;width:16%;">Saída</th>
                        <th style="padding:10px 12px;text-align:center;border-bottom:1px solid #d7dde8;width:20%;">Retorno</th>
                        <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #d7dde8;width:18%;">Observação</th>
                    </tr>
                </thead>
                <tbody>
                    ${grupo.itens.map((item, linhaIndex) => {
                        const retorno = item.conferencia.retorno === '' ? '' : String(item.conferencia.retorno);
                        const mapaStatus = {
                            pendente: 'Pendente',
                            ok: 'Conferido',
                            faltando: 'Faltando',
                            avaria: 'Avaria'
                        };
                        const statusTexto = mapaStatus[item.conferencia.status] || 'Pendente';
                        const observacoes = [statusTexto !== 'Pendente' ? statusTexto : '', item.conferencia.observacao || '']
                            .filter(Boolean)
                            .join(' • ');

                        return `
                            <tr style="background:${linhaIndex % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:700;">
                                    ${escaparHTMLChecklist(item.nome)}
                                    ${item.possuiClassificacaoOperacional ? `
                                        <div style="margin-top:4px;font-size:8.5px;line-height:1.45;color:#475569;font-weight:600;">
                                            ${montarResumoQuantidadeOperacionalChecklist(item)}
                                        </div>
                                    ` : ''}
                                </td>
                                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#111827;font-weight:800;">${item.quantidade}</td>
                                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#0f172a;font-weight:800;">
                                    ${item.quantidadeConferencia > 0
                                        ? (retorno || '<span style="display:inline-block;width:82px;border-bottom:1.8px solid #111827;height:14px;"></span>')
                                        : '<span style="color:#64748b;font-size:9px;">N/A estoque próprio</span>'}
                                </td>
                                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#475569;">
                                    ${observacoes ? escaparHTMLChecklist(observacoes) : '<span style="display:block;border-bottom:1px solid #cbd5e1;height:14px;"></span>'}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </section>
    `).join('');

    const html = `
        <div style="font-family:Inter,Arial,sans-serif;background:#ffffff;color:#111827;width:100%;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:16px;border-bottom:3px solid #111827;">
                <div>
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#2563eb;font-weight:900;">MTZ Eventos</div>
                    <h1 style="margin:5px 0 4px 0;font-size:28px;line-height:1;color:#111827;">Checklist Operacional</h1>
                    <div style="font-size:12px;color:#64748b;font-weight:700;">Separação, saída e retorno de materiais</div>
                </div>
                <div style="text-align:right;">
                    <img src="${logoPdfSrc}" alt="MTZ Eventos" style="height:64px;object-fit:contain;margin-bottom:6px;">
                    <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:800;">Gerado em</div>
                    <div style="font-size:11px;color:#111827;font-weight:800;">${new Date().toLocaleString('pt-BR')}</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px;">
                ${infoCard('Cliente', dados.cliente)}
                ${infoCard('Evento', dados.evento)}
                ${infoCard('Local', dados.local)}
                ${infoCard('Montagem', `${formatarDataChecklist(dados.montagem)}${dados.horario ? ' às ' + dados.horario : ''}`)}
                ${infoCard('Desmontagem', formatarDataChecklist(dados.desmontagem))}
                ${infoCard('Resp. saída', dados.respSaida)}
                ${infoCard('Resp. retorno', dados.respRetorno)}
                ${infoCard('Itens', `${totalItens} peças • ${totalLinhas} linhas`)}
                ${infoCard('Conferidos', `${totalConferidos}/${totalLinhas} • ${resumoChecklist.percentual}%`)}
                ${infoCard('Pendentes', resumoChecklist.pendentes)}
                ${infoCard('Faltando', resumoChecklist.faltando)}
                ${infoCard('Avarias', resumoChecklist.avarias)}
                ${origemChecklist ? infoCard('Origem', origemChecklist.texto) : ''}
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
                <div>
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#1d4ed8;font-weight:900;">Checklist de separação</div>
                    <div style="font-size:12px;color:#1e3a8a;margin-top:3px;">Conferir saída, registrar retorno e anotar divergências.</div>
                </div>
                <div style="font-size:20px;font-weight:900;color:#1d4ed8;">${String(grupos.length).padStart(2, '0')}</div>
            </div>

            <div>
                ${htmlSeparacao || '<p>Nenhum item adicionado.</p>'}
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:38px;break-inside:avoid;">
                <div style="text-align:center;">
                    <div style="border-top:1.5px solid #111827;padding-top:9px;font-size:10px;font-weight:800;color:#111827;text-transform:uppercase;">Responsável pela saída</div>
                </div>
                <div style="text-align:center;">
                    <div style="border-top:1.5px solid #111827;padding-top:9px;font-size:10px;font-weight:800;color:#111827;text-transform:uppercase;">Responsável pelo retorno</div>
                </div>
            </div>
        </div>
    `;

    printArea.innerHTML = html;

    if (modalRelatorio) {
        modalRelatorio.classList.add('active');
    }
}

function montarEtapasMontagemAPartirDaSeparacao() {
    checklistEtapasMontagem = checklistMontagem.map(item => ({
        etapa: item.grupoChecklist || 'montagem',
        modelo: item.modeloNome || '',
        descricao: item.modeloNome || '',
        peca: item.medida || item.subtipoEstrutural || item.nome || '',
        quantidade: item.quantidade || 0,
        observacao: '',
        conferido: false
    }));

    window.checklistEtapasMontagem = checklistEtapasMontagem;
}

function adicionarLinhaManualMontagem() {
    checklistEtapasMontagem.push({
    etapa: 'montagem',
    descricao: '',
    peca: '',
    quantidade: 1,
    observacao: '',
    conferido: false
});

    window.checklistEtapasMontagem = checklistEtapasMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistEtapasMontagem();
}

function atualizarLinhaMontagem(index, campo, valor) {
    if (!checklistEtapasMontagem[index]) return;

    checklistEtapasMontagem[index][campo] = valor;

    if (campo === 'quantidade') {
        checklistEtapasMontagem[index][campo] = Number(valor) || 0;
    }

    if (campo === 'conferido') {
        checklistEtapasMontagem[index][campo] = !!valor;
    }

    window.checklistEtapasMontagem = checklistEtapasMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
}

function removerLinhaMontagem(index) {
    if (index < 0 || index >= checklistEtapasMontagem.length) return;

    checklistEtapasMontagem.splice(index, 1);
    window.checklistEtapasMontagem = checklistEtapasMontagem;

    if (typeof salvarLocal === 'function') salvarLocal();
    renderChecklistEtapasMontagem();
}

function renderChecklistEtapasMontagem() {
    const container = document.getElementById('listaChecklistEtapasMontagem');
    if (!container) return;

    if (!checklistEtapasMontagem || !checklistEtapasMontagem.length) {
        container.innerHTML = criarEstadoChecklistPainel({
            tipo: 'empty',
            titulo: 'Nenhuma etapa cadastrada',
            mensagem: 'Adicione uma etapa manual ou gere a partir da separação.'
        });
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Etapa</th>
                        <th>Estrutura / Item selecionado</th>
                        <th>Peça da composição</th>
                        <th>Qtd</th>
                        <th>Observação de Montagem</th>
                        <th>Conferido</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>
    `;

    checklistEtapasMontagem.forEach((linha, index) => {
        const itemChecklistOrigem = checklistMontagem[index];
        const referenciaOrigem = String(
            itemChecklistOrigem?.medida
            || itemChecklistOrigem?.subtipoEstrutural
            || itemChecklistOrigem?.nome
            || ''
        );
        const correspondeAoItemOrigem = itemChecklistOrigem
            && referenciaOrigem === String(linha.peca || '')
            && Number(itemChecklistOrigem.quantidade || 0) === Number(linha.quantidade || 0);
        const detalhesMontagem = correspondeAoItemOrigem
            ? obterDetalhesQuantidadeOperacionalChecklist(
                itemChecklistOrigem,
                obterOrigemChecklistAtual()?.locacao || null
            )
            : null;
        const resumoMontagem = detalhesMontagem?.possuiClassificacao
            ? montarResumoQuantidadeOperacionalChecklist({
                quantidade: detalhesMontagem.quantidadeTotal,
                quantidadePropriaOperacional: detalhesMontagem.quantidadePropria,
                quantidadeTerceirizada: detalhesMontagem.quantidadeTerceirizada,
                possuiClassificacaoOperacional: true
            }, { compacto: true })
            : '';

        html += `
            <tr>
    <td>
        <input type="text"
               value="${linha.etapa || ''}"
               data-change="atualizarLinhaMontagem"
               data-arg="${index}"
               data-arg2="etapa"
               data-arg3="__value__">
    </td>
    <td>
        <input type="text"
               value="${linha.descricao || ''}"
               data-change="atualizarLinhaMontagem"
               data-arg="${index}"
               data-arg2="descricao"
               data-arg3="__value__">
    </td>
    <td>
        <input type="text"
               value="${linha.peca || ''}"
               data-change="atualizarLinhaMontagem"
               data-arg="${index}"
               data-arg2="peca"
               data-arg3="__value__">
    </td>
    <td>
        <input type="number"
               min="0"
               value="${linha.quantidade || 0}"
               data-change="atualizarLinhaMontagem"
               data-arg="${index}"
               data-arg2="quantidade"
               data-arg3="__value__">
        ${resumoMontagem ? `<div style="margin-top:5px;font-size:0.72rem;line-height:1.35;color:var(--text-light);">${resumoMontagem}</div>` : ''}
    </td>
    <td>
        <textarea
            rows="2"
            data-change="atualizarLinhaMontagem"
            data-arg="${index}"
            data-arg2="observacao"
            data-arg3="__value__">${linha.observacao || ''}</textarea>
    </td>
    <td style="text-align:center;">
        <input type="checkbox"
               ${linha.conferido ? 'checked' : ''}
               data-change="atualizarLinhaMontagem"
               data-arg="${index}"
               data-arg2="conferido"
               data-arg3="__checked__">
    </td>
    <td>
        <button class="btn btn-danger btn-sm" data-action="removerLinhaMontagem" data-arg="${index}">
            Remover
        </button>
    </td>
</tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

window.popularChecklistModeloSelect = popularChecklistModeloSelect;
window.adicionarModeloAoChecklist = adicionarModeloAoChecklist;
window.removerItemChecklistMontagem = removerItemChecklistMontagem;
window.limparChecklistMontagem = limparChecklistMontagem;
window.gerarChecklistDaLocacao = gerarChecklistDaLocacao;
window.atualizarConferenciaChecklist = atualizarConferenciaChecklist;
window.atualizarCabecalhoChecklistDaLocacao = atualizarCabecalhoChecklistDaLocacao;
window.concluirChecklistDaLocacao = concluirChecklistDaLocacao;
window.reabrirChecklistDaLocacao = reabrirChecklistDaLocacao;
window.voltarParaLocacaoDoChecklist = voltarParaLocacaoDoChecklist;
window.renderChecklistMontagem = renderChecklistMontagem;
window.gerarPDFChecklistMontagem = gerarPDFChecklistMontagem;
