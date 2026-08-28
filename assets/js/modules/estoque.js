// Estoque: cadastro, edição, remoção e seleção em lote
    // === RECALCULAR DISPONIBILIDADE COM CACHE ===
function recalcularDisponibilidade(forcar = false) {
        const agora = Date.now();
        
        if (!forcar && cacheDisponibilidade && (agora - ultimaAtualizacaoCache) < 5000) {
            return;
        }
        
        const aluguelPorPeca = new Map();
        
        locacoes.forEach(l => {
            const locacaoNormalizada = typeof normalizarLocacaoDominio === 'function'
                ? normalizarLocacaoDominio(l, { hoje: new Date() })
                : l;
            const statusVisual = String(locacaoNormalizada?.statusVisual || locacaoNormalizada?.status || '').toLowerCase();
            const reservaStatus = String(l?.estoqueReserva?.status || '').trim().toLowerCase();
            const comprometeEstoque = typeof locacaoComprometeEstoque === 'function'
                ? locacaoComprometeEstoque(l)
                : (!reservaStatus || reservaStatus === 'reservado' || reservaStatus === 'reservado_legado');
            if (statusVisual !== 'devolvido' && statusVisual !== 'cancelado' && comprometeEstoque) {
                (l.items || []).forEach(i => {
                    const quantidadeEstoque = typeof obterQuantidadePropriaOperacional === 'function'
                        ? obterQuantidadePropriaOperacional(i)
                        : Math.max(parseInt(i.quantidade, 10) || 0, 0);
                    const qtdDevolvida = Math.max(parseInt(i.devolvidos, 10) || 0, 0);
                    const qtdAvariada = Math.max(parseInt(i.avariadosEstoqueProprio, 10) || 0, 0);
                    const qtdAlugada = Math.max(quantidadeEstoque - qtdDevolvida - qtdAvariada, 0);
                    const atual = aluguelPorPeca.get(i.pecaId) || 0;
                    aluguelPorPeca.set(i.pecaId, atual + qtdAlugada);
                });
            }
        });
        
        pecas.forEach(p => {
            if (typeof normalizarPecaDominio === 'function') {
                Object.assign(p, normalizarPecaDominio(p));
            }
            const alugado = aluguelPorPeca.get(p.id) || 0;
            p.reservado = Math.max(alugado, 0);
            p.disponivel = Math.max((p.quantidadeTotal || p.quantidade || 0) - p.reservado, 0);
            if (typeof normalizarPecaDominio === 'function') {
                Object.assign(p, normalizarPecaDominio(p));
            }
        });
        
        cacheDisponibilidade = true;
        ultimaAtualizacaoCache = agora;
    }

function obterOuCriarTipoGeral() {
    const nomePadrao = 'geral';
    let tipo = tipos.find((t) => String(t?.nome || '').trim().toLowerCase() === nomePadrao);

    if (!tipo) {
        tipo = {
            id: Date.now(),
            nome: 'Geral',
            desc: 'Itens sem categoria específica'
        };
        tipos.push(tipo);
    }

    return Number(tipo.id);
}

function resolverTipoSelecionado(valorSelecionado) {
    const tipoId = Number(valorSelecionado);
    if (Number.isFinite(tipoId) && tipoId > 0) {
        return tipoId;
    }
    return obterOuCriarTipoGeral();
}

function normalizarTextoEstoque(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function normalizarIdentificadorEstoque(valor) {
    return String(valor || '')
        .trim()
        .toLowerCase();
}

function encontrarPecaDuplicada(dados, idIgnorar = null) {
    const nome = normalizarTextoEstoque(dados?.nome);
    const codigo = normalizarIdentificadorEstoque(dados?.codigo);
    const barras = normalizarIdentificadorEstoque(dados?.barras);
    const medida = normalizarTextoEstoque(dados?.medida);
    const tipoId = Number(dados?.tipoId || 0);

    return pecas.find((peca) => {
        if (idIgnorar != null && String(peca.id) === String(idIgnorar)) return false;

        const codigoPeca = normalizarIdentificadorEstoque(peca.codigo);
        const barrasPeca = normalizarIdentificadorEstoque(peca.barras || peca.codigoBarras);
        const nomePeca = normalizarTextoEstoque(peca.nome);
        const medidaPeca = normalizarTextoEstoque(peca.medida);
        const tipoPeca = Number(peca.tipoId || 0);

        if (codigo && codigoPeca && codigo === codigoPeca) return true;
        if (barras && barrasPeca && barras === barrasPeca) return true;

        const mesmoNome = nome && nomePeca && nome === nomePeca;
        const mesmaMedida = medida && medidaPeca && medida === medidaPeca;
        const mesmoTipo = tipoId > 0 && tipoPeca > 0 && tipoId === tipoPeca;

        return Boolean(mesmoNome && (mesmaMedida || mesmoTipo));
    }) || null;
}

function limparFormularioCadastroPeca() {
    const defaults = {
        pecaCod: '',
        pecaNome: '',
        pecaMedida: '',
        pecaBar: '',
        pecaValor: '',
        pecaQtd: '1',
        pecaFamiliaEstrutural: '',
        pecaSubtipoEstrutural: '',
        pecaPodeCompor: 'sim'
    };

    Object.entries(defaults).forEach(([id, valor]) => {
        const campo = document.getElementById(id);
        if (!campo) return;
        campo.value = valor;
    });

    const foto = document.getElementById('pecaFoto');
    if (foto) foto.value = '';
}
    
// Somente o executor publica o rascunho; o formulario nunca altera as colecoes.
(() => {
    let sessao = null;
    let abrindo = false;
    let dialogoPreparado = null;
    const campos = Object.freeze({
        sessaoPecaNome: 'nome', sessaoPecaCodigo: 'codigo', sessaoPecaMedida: 'medida',
        sessaoPecaBarras: 'barras', sessaoPecaQuantidade: 'quantidadeTotal', sessaoPecaPreco: 'valor'
    });

    function referencia(tipo, id) {
        const identidade = normalizarIdEntidadeExato(id);
        return identidade.valido
            ? `${tipo}:${encodeURIComponent(JSON.stringify([identidade.tipo, identidade.valor]))}` : '';
    }

    function resolver(ref, tipo, colecao) {
        const invalido = { encontrado: false, estado: 'invalido', registro: null };
        if (typeof ref !== 'string' || !ref.startsWith(`${tipo}:`)) return invalido;
        try {
            const dados = JSON.parse(decodeURIComponent(ref.slice(tipo.length + 1)));
            if (!Array.isArray(dados) || dados.length !== 2) return invalido;
            const identidade = normalizarIdEntidadeExato(dados[1]);
            if (!identidade.valido || identidade.tipo !== dados[0] || referencia(tipo, dados[1]) !== ref) return invalido;
            return resolverRegistroPorIdExato(colecao, identidade.valor);
        } catch (_erro) {
            return invalido;
        }
    }

    function clonar(valor) {
        const resultado = clonarJsonPersistivelEstrito(valor);
        if (!resultado.ok) throw new Error('O item contém dados inválidos para uma edição segura.');
        return resultado.valor;
    }

    function numero(valor) {
        if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
        if (typeof valor !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(valor.trim())) return NaN;
        const convertido = Number(valor);
        return Number.isFinite(convertido) ? convertido : NaN;
    }

    function erroCampo(id, mensagem) {
        const campo = document.getElementById(id);
        const erro = document.getElementById(`${id}Erro`);
        if (!campo || !erro) return;
        const descricoes = new Set((campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        descricoes.delete(erro.id);
        if (mensagem) {
            campo.setAttribute('aria-invalid', 'true');
            descricoes.add(erro.id);
        } else campo.removeAttribute('aria-invalid');
        if (descricoes.size) campo.setAttribute('aria-describedby', [...descricoes].join(' '));
        else campo.removeAttribute('aria-describedby');
        if (erro.textContent !== mensagem) erro.textContent = mensagem;
        erro.hidden = !mensagem;
    }

    function validar(focar = false) {
        if (!sessao) return { valido: false, erros: [] };
        const erros = [];
        const adicionar = (campo, mensagem) => erros.push({ campo, mensagem });
        const nome = document.getElementById('sessaoPecaNome').value.trim();
        const quantidade = numero(document.getElementById('sessaoPecaQuantidade').value);
        const preco = numero(document.getElementById('sessaoPecaPreco').value);
        const categoria = resolver(document.getElementById('sessaoPecaCategoria').value, 'categoria', tipos);
        if (!nome) adicionar('sessaoPecaNome', 'Informe o nome da peça.');
        if (!categoria.encontrado) adicionar('sessaoPecaCategoria', categoria.estado === 'duplicado'
            ? 'A categoria está duplicada. Confira o cadastro.' : 'Selecione uma categoria válida e sem ambiguidade.');
        if (!Number.isSafeInteger(quantidade) || quantidade < 0) {
            adicionar('sessaoPecaQuantidade', 'Informe uma quantidade total inteira e não negativa.');
        } else if (!Number.isSafeInteger(sessao.comprometido) || sessao.comprometido < 0) {
            adicionar('sessaoPecaQuantidade', 'Os saldos comprometidos são inválidos. Confira o cadastro antes de continuar.');
        } else if (quantidade < sessao.comprometido) {
            adicionar('sessaoPecaQuantidade', `A quantidade total não pode ser inferior às ${sessao.comprometido} unidades comprometidas.`);
        }
        if (!Number.isFinite(preco) || preco < 0) adicionar('sessaoPecaPreco', 'Informe um preço numérico maior ou igual a zero.');
        let plano = null;
        if (!erros.length) {
            plano = planejarAlteracaoPeca(entradaPlanejamento(), obterEstadoMemoriaAtual());
            for (const bloqueio of plano.bloqueios || []) {
                const id = Object.keys(campos).find(id => campos[id] === bloqueio.campo)
                    || (bloqueio.campo === 'tipoId' ? 'sessaoPecaCategoria' : '');
                if (id) adicionar(id, bloqueio.mensagem);
            }
        }
        for (const id of [...Object.keys(campos), 'sessaoPecaCategoria']) {
            erroCampo(id, erros.find(e => e.campo === id)?.mensagem || '');
        }
        const valido = erros.length === 0 && plano?.ok === true && !sessao.bloqueada;
        const botao = document.getElementById('sessaoPecaConfirmar');
        botao.disabled = !valido || sessao.executando;
        botao.setAttribute('aria-disabled', botao.disabled ? 'true' : 'false');
        if (!sessao.executando && !sessao.bloqueada) {
            document.getElementById('sessaoPecaEstado').textContent = plano?.codigo === 'SEM_ALTERACOES'
                ? 'Não há alterações para confirmar.'
                : plano && !plano.ok ? (plano.bloqueios?.[0]?.mensagem || 'Revise os dados da peça.')
                : valido ? 'Alterações prontas para confirmação.' : 'Preencha os campos indicados.';
        }
        if (focar && erros.length) document.getElementById(erros[0].campo).focus();
        return { valido, erros, plano };
    }

    function entradaPlanejamento() {
        const r = sessao.rascunho;
        return { modo: sessao.modo, pecaId: sessao.pecaId, revisaoEsperada: sessao.revisao,
            dadosEditados: { nome: r.nome, codigo: r.codigo || '', medida: r.medida || '', barras: r.barras || '',
                tipoId: r.tipoId, quantidadeTotal: r.quantidadeTotal, valor: r.valor } };
    }

    function bloquearControles(processando) {
        const dialogo = document.getElementById('dialogSessaoPeca');
        dialogo.setAttribute('aria-busy', processando ? 'true' : 'false');
        dialogo.querySelectorAll('input, select, button').forEach(c => {
            c.disabled = processando || (sessao?.bloqueada && !c.hasAttribute('data-fechar-sessao-peca'));
        });
        document.getElementById('sessaoPecaConfirmar').textContent = processando ? 'Processando...' : 'Confirmar alterações';
    }

    async function confirmar() {
        if (!sessao || sessao.executando || sessao.bloqueada || !validar(true).valido) return false;
        const atual = sessao;
        atual.executando = true;
        bloquearControles(true);
        document.getElementById('sessaoPecaEstado').textContent = 'Processando. Aguarde a confirmação do armazenamento.';
        let resultado;
        try {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const entrada = entradaPlanejamento();
            const plano = planejarAlteracaoPeca(entrada, obterEstadoMemoriaAtual());
            if (!plano.ok) resultado = { ...plano, efeitos: {} };
            else {
                const instante = new Date();
                const dependencias = criarDependenciasExecutorPeca({ armazenamento: localStorage });
                resultado = executarAlteracaoPecaTransacional({ ...entrada, operacaoId: atual.operacaoId,
                    assinaturaPlanoEsperada: plano.assinatura, atualizadoEm: instante.toISOString(),
                    atualizadoPor: localStorage.getItem('usuarioEmail') || 'Offline',
                    persistencia: { versao: window.SCHEMA_VERSION_V12 || '12.6', data: instante.toISOString(), ultimaEdicao: instante.getTime() }
                }, dependencias);
                if (resultado.ok && resultado.aplicado) {
                    if (!verificarOperacaoPeca(obterEstadoMemoriaAtual(), resultado.operacao).completo) {
                        resultado = { ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', requerRecuperacao: true, efeitos: {} };
                    } else resultado = concluirMetadadoOperacaoPeca(resultado, dependencias);
                }
            }
        } catch (_erro) {
            resultado = { ok: false, codigo: 'FALHA_INTEGRACAO_ESTOQUE', requerRecuperacao: true, efeitos: {} };
        } finally {
            atual.executando = false;
            bloquearControles(false);
        }
        if (resultado.ok && resultado.aplicado) {
            descartar();
            if (resultado.efeitos?.renderizar) {
                try { renderEstoque(); } catch (_erro) { mostrarToast('Peça salva. Reabra a aba para atualizar a lista.', 'info'); }
                const acionador = [...document.querySelectorAll('[data-action="abrirEditarPeca"]')]
                    .find(botao => botao.getAttribute('data-arg') === referencia('peca', atual.pecaId));
                (acionador || document.getElementById('abrirInclusaoPeca'))?.focus({ preventScroll: true });
            }
            if (resultado.efeitos?.sincronizar) {
                try { Promise.resolve(sincronizar('salvar')).catch(() => mostrarToast('Peça salva localmente. Sincronização pendente.', 'info')); }
                catch (_erro) { mostrarToast('Peça salva localmente. Sincronização pendente.', 'info'); }
            }
            mostrarToast(resultado.avisos?.some(a => a.codigo === 'METADADO_SYNC_PENDENTE')
                ? 'Peça salva localmente. O marcador de sincronização ficou pendente.'
                : resultado.idempotente ? 'Esta operação já estava concluída.' : 'Peça salva com segurança.', 'info');
            return true;
        }
        const mensagens = {
            REVISAO_DIVERGENTE: 'O estoque foi modificado. Feche e reabra a peça para revisar os dados atuais.',
            PECA_AUSENTE: 'A peça foi removida. Feche esta sessão.',
            PECA_ID_DUPLICADO: 'A identidade da peça está duplicada. Confira o cadastro.',
            FALHA_PERSISTENCIA: 'Não foi possível salvar. O rascunho foi mantido; tente novamente.',
            OPERACAO_ESTOQUE_EM_ANDAMENTO: 'Outra operação está em andamento. Aguarde antes de confirmar.'
        };
        atual.bloqueada = resultado.requerRecuperacao || ['REVISAO_DIVERGENTE', 'PECA_AUSENTE', 'PECA_ID_DUPLICADO'].includes(resultado.codigo);
        bloquearControles(false);
        const validacao = validar(true);
        document.getElementById('sessaoPecaEstado').textContent = resultado.requerRecuperacao
            ? 'A operação exige recuperação explícita. Não tente registrar novamente. Feche a sessão e confira o estado persistido.'
            : resultado.bloqueios?.[0]?.mensagem || mensagens[resultado.codigo] || 'Não foi possível confirmar. Revise os dados.';
        if (atual.bloqueada || !validacao.erros.length) document.getElementById('sessaoPecaEstado').focus();
        return false;
    }

    function atualizar(evento) {
        if (!sessao || sessao.executando || sessao.bloqueada) return;
        const controle = evento.target;
        const chave = campos[controle.id];
        if (chave) {
            const valor = controle.value;
            const numerico = chave === 'quantidadeTotal' || chave === 'valor';
            const convertido = numero(valor);
            sessao.rascunho[chave] = numerico && Number.isFinite(convertido) ? convertido : valor;
        } else if (controle.id === 'sessaoPecaCategoria') {
            const categoria = resolver(controle.value, 'categoria', tipos);
            sessao.rascunho.tipoId = categoria.encontrado ? categoria.registro.id : null;
        }
        validar();
    }

    function descartar() {
        if (sessao?.executando) return false;
        const foco = sessao?.foco;
        sessao = null;
        const dialogo = document.getElementById('dialogSessaoPeca');
        document.getElementById('formSessaoPeca')?.reset();
        document.getElementById('sessaoPecaCategoria')?.replaceChildren();
        for (const id of [...Object.keys(campos), 'sessaoPecaCategoria']) erroCampo(id, '');
        if (dialogo?.open) dialogo.close();
        if (foco?.isConnected) foco.focus({ preventScroll: true });
        return true;
    }

    function prepararDialogo(dialogo) {
        if (dialogoPreparado === dialogo) return;
        dialogoPreparado = dialogo;
        dialogo.addEventListener('input', atualizar);
        dialogo.addEventListener('change', atualizar);
        dialogo.addEventListener('cancel', evento => { evento.preventDefault(); descartar(); });
        dialogo.addEventListener('close', () => { if (!dialogo.open && sessao) descartar(); });
        dialogo.addEventListener('click', evento => {
            const limite = dialogo.getBoundingClientRect();
            const backdrop = evento.target === dialogo && (evento.clientX < limite.left
                || evento.clientX > limite.right || evento.clientY < limite.top || evento.clientY > limite.bottom);
            if (backdrop || evento.target.closest('[data-fechar-sessao-peca]')) descartar();
            else if (evento.target.id === 'sessaoPecaConfirmar') confirmar();
        });
        dialogo.addEventListener('keydown', evento => {
            evento.stopPropagation();
            if (evento.key === 'Escape') { evento.preventDefault(); descartar(); }
            if (evento.key === 'Tab') {
                const controles = [...dialogo.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled])')];
                const primeiro = controles[0];
                const ultimo = controles[controles.length - 1];
                if (evento.shiftKey && document.activeElement === primeiro) {
                    evento.preventDefault();
                    ultimo?.focus();
                } else if (!evento.shiftKey && document.activeElement === ultimo) {
                    evento.preventDefault();
                    primeiro?.focus();
                }
            }
            if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 's') {
                evento.preventDefault();
                confirmar();
            }
        });
        document.getElementById('formSessaoPeca').addEventListener('submit', evento => {
            evento.preventDefault();
            confirmar();
        });
    }

    function abrir(ref, edicao = false) {
        if (sessao || abrindo) {
            mostrarToast('Já existe uma sessão de peça aberta. Cancele-a antes de iniciar outra.', 'info');
            return false;
        }
        abrindo = true;
        try {
            if (typeof validarPermissao === 'function' && !validarPermissao('editar_valor', 'Somente administrador pode incluir ou editar peças.')) return false;
            const dialogo = document.getElementById('dialogSessaoPeca');
            if (!dialogo || typeof dialogo.showModal !== 'function') throw new Error('O editor de peças não está disponível neste navegador.');
            let original;
            if (edicao) {
                const resultado = resolver(ref, 'peca', pecas);
                if (!resultado.encontrado) throw new Error(resultado.estado === 'duplicado'
                    ? 'O identificador da peça está duplicado. A edição foi bloqueada.' : 'A peça não foi encontrada ou sua referência é inválida.');
                original = clonar(resultado.registro);
            } else original = { nome: '', codigo: '', medida: '', barras: '', valor: 0, quantidadeTotal: 1,
                tipoId: null, reservado: 0, manutencao: 0, avariado: 0, perdido: 0 };
            const rascunho = clonar(original);
            const estado = obterEstadoMemoriaAtual();
            const revisao = capturarRevisaoEstoque(estado);
            if (!revisao.ok) throw new Error('O estado contém dados inválidos para uma transação segura.');
            const sufixo = crypto.randomUUID();
            const pecaId = edicao ? original.id : `peca-${sufixo}`;
            if (!edicao && resolverRegistroPorIdExato(estado.pecas, pecaId).estado !== 'ausente') throw new Error('Não foi possível criar uma identidade única. Reabra a sessão.');
            rascunho.quantidadeTotal = numero(original.quantidadeTotal ?? original.quantidade ?? '');
            rascunho.valor = numero(original.valor);
            const saldos = ['reservado', 'manutencao', 'avariado', 'perdido']
                .map(chave => original[chave] === undefined ? 0 : numero(original[chave]));
            const comprometido = saldos.every(n => Number.isSafeInteger(n) && n >= 0)
                ? saldos.reduce((soma, n) => soma + n, 0) : NaN;
            prepararDialogo(dialogo);
            sessao = { modo: edicao ? 'edicao' : 'inclusao', rascunho, comprometido, foco: document.activeElement,
                pecaId, operacaoId: `estoque-${sufixo}`, revisao: revisao.revisao, executando: false, bloqueada: false };
            bloquearControles(false);
            const categoria = document.getElementById('sessaoPecaCategoria');
            categoria.replaceChildren(new Option('Selecione uma categoria', ''));
            tipos.forEach(tipo => {
                if (resolverRegistroPorIdExato(tipos, tipo?.id).encontrado) {
                    categoria.add(new Option(tipo.nome || 'Sem nome', referencia('categoria', tipo.id)));
                }
            });
            categoria.value = referencia('categoria', original.tipoId);
            for (const [id, chave] of Object.entries(campos)) {
                document.getElementById(id).value = chave === 'quantidadeTotal'
                    ? (original.quantidadeTotal ?? original.quantidade ?? '') : (original[chave] ?? '');
            }
            document.getElementById('sessaoPecaTitulo').textContent = edicao ? 'Editar peça' : 'Incluir peça';
            document.getElementById('sessaoPecaIdentidade').textContent = !edicao ? 'Novo item'
                : `ID: ${original.id} (${typeof original.id === 'number' ? 'numérico' : 'textual'})`;
            document.getElementById('sessaoPecaSaldos').textContent = Number.isSafeInteger(comprometido)
                ? `Comprometido: ${comprometido} · Reservado: ${saldos[0]} · Manutenção: ${saldos[1]} · Avariado: ${saldos[2]} · Perdido: ${saldos[3]}`
                : 'Saldos comprometidos precisam de conferência.';
            document.getElementById('sessaoPecaConfirmar').disabled = true;
            dialogo.showModal();
            document.getElementById('sessaoPecaNome').focus();
            validar(true);
            return true;
        } catch (erro) {
            if (sessao) descartar();
            mostrarToast(erro.message || 'Não foi possível abrir a sessão de peça.', 'erro');
            return false;
        } finally {
            abrindo = false;
        }
    }

    window.criarReferenciaTipadaPeca = id => referencia('peca', id);
    window.criarReferenciaTipadaCategoriaPeca = id => referencia('categoria', id);
    window.abrirInclusaoPeca = () => abrir();
    window.abrirEditarPeca = ref => abrir(ref, true);
    window.cancelarSessaoPeca = descartar;
    window.validarSessaoPeca = () => validar(true);
    window.obterRascunhoSessaoPeca = () => sessao ? clonar(sessao.rascunho) : null;
    window.confirmarSessaoPeca = confirmar;
    window.salvarPeca = window.salvarEdicaoPeca = confirmar;
})();


window.estoqueSelecionados = new Set();

function onSelectEstoque(id, checked){
  id = Number(id);
  if (checked) window.estoqueSelecionados.add(id);
  else window.estoqueSelecionados.delete(id);
}

function toggleSelecionarTodosEstoque(marcar) {
  const checks = document.querySelectorAll('.chk-estoque');
  checks.forEach(chk => {
    chk.checked = marcar;
    onSelectEstoque(chk.dataset.id, marcar);
  });
}

function excluirSelecionadosEstoque(){
  if (typeof validarPermissao === 'function' && !validarPermissao('excluir_registro', 'Somente administrador pode excluir itens de estoque.')) {
    return;
  }

  if (window.estoqueSelecionados.size === 0) return mostrarToast('Selecione pelo menos 1 item.', 'erro');
  confirmarAcao(`Excluir ${window.estoqueSelecionados.size} item(ns) do estoque?`, () => {
    const ids = new Set([...window.estoqueSelecionados].map(Number));
    const removidos = pecas.filter(p => ids.has(p.id));
    pecas = pecas.filter(p => !ids.has(p.id));

    removidos.forEach(p => registrarLog('item', 'deletar', `Item removido (lote): ${p.nome} ID ${p.id}`));

    window.estoqueSelecionados.clear();
    salvarLocal();
    renderEstoque();
    sincronizar('salvar');
    mostrarToast('Itens excluidos!');
  }, {
    titulo: "Excluir itens",
    textoConfirmar: "Excluir",
    classeConfirmar: "btn-danger"
  });
}
window.onSelectEstoque = onSelectEstoque;
window.toggleSelecionarTodosEstoque = toggleSelecionarTodosEstoque;
window.excluirSelecionadosEstoque = excluirSelecionadosEstoque;
// ===== MODELOS DE CHECKLIST / ESTRUTURA =====

function salvarModeloChecklist(nome, familiaEstrutural, itens, origem = 'manual') {
    nome = (nome || '').trim();
    familiaEstrutural = (familiaEstrutural || '').trim();

    if (!nome) {
        mostrarToast("Informe o nome do modelo.", "erro");
        return null;
    }

    if (!Array.isArray(itens) || itens.length === 0) {
        mostrarToast("Adicione pelo menos 1 peça ao modelo.", "erro");
        return null;
    }

    const modelo = {
        id: Date.now(),
        nome,
        familiaEstrutural,
        origem,
        criadoEm: new Date().toISOString(),
        itens: itens.map(item => ({
            pecaId: item.pecaId,
            nome: item.nome || '',
            qtd: parseInt(item.qtd) || 0
        })).filter(item => item.pecaId && item.qtd > 0)
    };

    if (modelo.itens.length === 0) {
        mostrarToast("Nenhuma peça válida foi adicionada.", "erro");
        return null;
    }

    modelosChecklist.push(modelo);
    
    salvarLocal();
    sincronizar('salvar');
    registrarLog('checklist', 'criar-modelo', `Modelo criado: ${modelo.nome}`);
    mostrarToast("Modelo salvo com sucesso!");

    return modelo;
}

function buscarModeloChecklist(id) {
    return modelosChecklist.find(x => String(x.id) === String(id));
}

function listarModelosChecklist(familiaEstrutural = '') {
    if (!familiaEstrutural) return [...modelosChecklist];

    return modelosChecklist.filter(x =>
        (x.familiaEstrutural || '').toLowerCase() === familiaEstrutural.toLowerCase()
    );
}

function excluirModeloChecklist(id) {
    const antes = modelosChecklist.length;
    modelosChecklist = modelosChecklist.filter(x => String(x.id) !== String(id));

    if (modelosChecklist.length === antes) {
        mostrarToast("Modelo não encontrado.", "erro");
        return;
    }

    salvarLocal();
    sincronizar('salvar');
    registrarLog('checklist', 'excluir-modelo', `Modelo removido: ${id}`);
    mostrarToast("Modelo excluído!");
}
window.salvarModeloChecklist = salvarModeloChecklist;
window.buscarModeloChecklist = buscarModeloChecklist;
window.listarModelosChecklist = listarModelosChecklist;
window.excluirModeloChecklist = excluirModeloChecklist;

let itensModeloChecklistTemp = [];

function abrirModalModeloChecklist() {
    itensModeloChecklistTemp = [];

    const id = document.getElementById('modeloChecklistId');
    const nome = document.getElementById('modeloChecklistNome');
    const familia = document.getElementById('modeloChecklistFamilia');
    const qtd = document.getElementById('modeloChecklistQtd');

    if (id) id.value = '';
    if (nome) nome.value = '';
    if (familia) familia.value = '';
    if (qtd) qtd.value = 1;

    atualizarSelectModeloChecklist();
    renderItensModeloChecklistTemp();

    document.getElementById('modalModeloChecklist').classList.add('active');
}

function fecharModalModeloChecklist() {
    document.getElementById('modalModeloChecklist').classList.remove('active');
}

function atualizarSelectModeloChecklist() {
    const select = document.getElementById('modeloChecklistPeca');
    if (!select) return;

    const pecasEstruturais = pecas.filter(p => p.podeComporEstrutura);

    select.innerHTML = '<option value="">Selecione uma peça</option>';

    pecasEstruturais.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nome}${p.medida ? ' - ' + p.medida : ''}</option>`;
    });
}

function editarModeloChecklist(id) {
    const modelo = buscarModeloChecklist(id);

    if (!modelo) {
        mostrarToast("Modelo não encontrado.", "erro");
        return;
    }

    document.getElementById('modeloChecklistId').value = modelo.id;
    document.getElementById('modeloChecklistNome').value = modelo.nome || '';
    document.getElementById('modeloChecklistFamilia').value = modelo.familiaEstrutural || '';
    document.getElementById('modeloChecklistQtd').value = 1;

    itensModeloChecklistTemp = (modelo.itens || []).map(item => ({
        pecaId: item.pecaId,
        nome: item.nome,
        qtd: item.qtd
    }));

    atualizarSelectModeloChecklist();
    renderItensModeloChecklistTemp();

    document.getElementById('modalModeloChecklist').classList.add('active');
}

function adicionarItemModeloChecklist() {
    const select = document.getElementById('modeloChecklistPeca');
    const qtdInput = document.getElementById('modeloChecklistQtd');

    if (!select || !qtdInput) {
        mostrarToast("Campos do modelo não encontrados.", "erro");
        return;
    }

    const pecaId = select.value;
    const qtd = parseInt(qtdInput.value) || 0;

    if (!pecaId) {
        mostrarToast("Selecione uma peça.", "erro");
        return;
    }

    if (qtd <= 0) {
        mostrarToast("Informe uma quantidade válida.", "erro");
        return;
    }

    const peca = pecas.find(p => String(p.id) === String(pecaId));
    if (!peca) {
        mostrarToast("Peça não encontrada.", "erro");
        return;
    }

    const existente = itensModeloChecklistTemp.find(item => String(item.pecaId) === String(pecaId));

    if (existente) {
        existente.qtd += qtd;
    } else {
        itensModeloChecklistTemp.push({
            pecaId: peca.id,
            nome: peca.nome,
            qtd: qtd
        });
    }

    qtdInput.value = 1;
    select.value = '';

    renderItensModeloChecklistTemp();
    mostrarToast("Peça adicionada!");
}

function escaparHTMLEstoque(valor) {
    const div = document.createElement('div');
    div.textContent = valor ?? '';
    return div.innerHTML;
}

function criarEstadoEstoquePainel(opcoes = {}) {
    if (typeof criarEstadoPainel === 'function') {
        return criarEstadoPainel(opcoes.mensagem, {
            tipo: opcoes.tipo || 'info',
            titulo: opcoes.titulo || 'Informação'
        });
    }
    return `<p class="muted-note">${escaparHTMLEstoque(opcoes.mensagem || 'Sem dados para mostrar.')}</p>`;
}

function renderItensModeloChecklistTemp() {
    const lista = document.getElementById('listaItensModeloChecklist');
    if (!lista) return;

    if (itensModeloChecklistTemp.length === 0) {
        lista.innerHTML = criarEstadoEstoquePainel({
            tipo: 'empty',
            titulo: 'Lista vazia',
            mensagem: 'Nenhuma peça adicionada ao modelo.'
        });
        return;
    }

    lista.innerHTML = itensModeloChecklistTemp.map((item, index) => `
        <div class="modelo-checklist-temp-item">
            <span>${escaparHTMLEstoque(item.nome)} - Qtd: ${parseInt(item.qtd, 10) || 0}</span>
            <button class="btn btn-danger btn-sm" data-action="removerItemModeloChecklistTemp" data-arg="${index}">Remover</button>
        </div>
    `).join('');
}

function removerItemModeloChecklistTemp(index) {
    itensModeloChecklistTemp.splice(index, 1);
    renderItensModeloChecklistTemp();
}
function salvarModeloChecklistForm() {
    const id = document.getElementById('modeloChecklistId').value;
    const nome = document.getElementById('modeloChecklistNome').value.trim();
    const familia = document.getElementById('modeloChecklistFamilia').value.trim();

    if (!nome) {
        mostrarToast("Informe o nome do modelo.", "erro");
        return;
    }

    if (itensModeloChecklistTemp.length === 0) {
        mostrarToast("Adicione pelo menos uma peça.", "erro");
        return;
    }

    if (id) {
        const modelo = buscarModeloChecklist(id);

        if (!modelo) {
            mostrarToast("Modelo não encontrado para editar.", "erro");
            return;
        }

        modelo.nome = nome;
        modelo.familiaEstrutural = familia;
        modelo.itens = itensModeloChecklistTemp.map(item => ({
            pecaId: item.pecaId,
            nome: item.nome,
            qtd: item.qtd
        }));

        salvarLocal();
        sincronizar('salvar');
        registrarLog('checklist', 'editar-modelo', `Modelo editado: ${modelo.nome}`);
        mostrarToast("Modelo atualizado com sucesso!");
    } else {
        const novo = salvarModeloChecklist(nome, familia, itensModeloChecklistTemp, 'manual');
        if (!novo) return;
    }

    fecharModalModeloChecklist();
    itensModeloChecklistTemp = [];
    renderItensModeloChecklistTemp();
    renderModelosChecklist();
}
function renderModelosChecklist() {
    const lista = document.getElementById('listaModelosChecklist');
    if (!lista) return;

    if (!modelosChecklist || modelosChecklist.length === 0) {
        lista.innerHTML = criarEstadoEstoquePainel({
            tipo: 'empty',
            titulo: 'Sem modelos salvos',
            mensagem: 'Crie um modelo para reaproveitar estruturas no checklist.'
        });
        return;
    }

    lista.innerHTML = modelosChecklist.map(modelo => `
        <div class="modelo-checklist-card">
            <div class="modelo-checklist-card-info">
                <strong>${escaparHTMLEstoque(modelo.nome)}</strong><br>
                <small>Família: ${escaparHTMLEstoque(modelo.familiaEstrutural || 'Não informada')}</small><br>
                <small>Peças: ${modelo.itens ? modelo.itens.length : 0}</small>
            </div>
            <div class="modelo-checklist-card-actions">
                <button class="btn btn-secondary" data-action="editarModeloChecklist" data-arg="${modelo.id}">Editar</button>
                <button class="btn btn-primary" data-action="gerarChecklistModelo" data-arg="${modelo.id}">Gerar Checklist</button>
                <button class="btn btn-danger" data-action="excluirModeloChecklistUI" data-arg="${modelo.id}">Excluir</button>
            </div>
        </div>
    `).join('');
}

function excluirModeloChecklistUI(id) {
    confirmarAcao('Deseja excluir este modelo?', () => {
        excluirModeloChecklist(id);
        renderModelosChecklist();
    }, {
        titulo: 'Excluir modelo',
        textoConfirmar: 'Excluir',
        classeConfirmar: 'btn-danger'
    });
}

function gerarChecklistModelo(id) {
    const modelo = buscarModeloChecklist(id);

    if (!modelo) {
        mostrarToast("Modelo não encontrado.", "erro");
        return;
    }

    const grupos = {};

    modelo.itens.forEach(itemModelo => {
        const peca = pecas.find(p => String(p.id) === String(itemModelo.pecaId));
        if (!peca) return;

        const grupo = peca.grupoChecklist || 'outros';

        if (!grupos[grupo]) grupos[grupo] = [];

        grupos[grupo].push({
            nome: peca.nome + (peca.medida ? ` - ${peca.medida}` : ''),
            qtd: itemModelo.qtd || 0
        });
    });

    const escapar = (valor) => {
        const div = document.createElement('div');
        div.textContent = valor ?? '';
        return div.innerHTML;
    };

    const tituloGrupo = (grupo) => {
        const mapa = {
            estrutura: 'Estrutura',
            cobertura: 'Cobertura',
            eletrica: 'Elétrica',
            moveis: 'Móveis',
            acabamento: 'Acabamento',
            outros: 'Outros'
        };
        return mapa[grupo] || 'Outros';
    };

    const ordemGrupos = ['estrutura', 'cobertura', 'eletrica', 'moveis', 'acabamento', 'outros'];
    const gruposOrdenados = ordemGrupos.filter(grupo => grupos[grupo] && grupos[grupo].length > 0);
    const totalLinhas = gruposOrdenados.reduce((acc, grupo) => acc + grupos[grupo].length, 0);

    const secoes = gruposOrdenados.map((grupo, index) => {
        const linhas = grupos[grupo].map((item, linhaIndex) => `
            <tr style="background:${linhaIndex % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding:9px 10px; border-bottom:1px solid #e5e7eb;">${escapar(item.nome)}</td>
                <td style="padding:9px 10px; border-bottom:1px solid #e5e7eb; text-align:center; font-weight:700;">${item.qtd}</td>
                <td style="padding:9px 10px; border-bottom:1px solid #e5e7eb; text-align:center;">_______</td>
                <td style="padding:9px 10px; border-bottom:1px solid #e5e7eb;">&nbsp;</td>
            </tr>
        `).join('');

        return `
            <section style="margin-bottom:16px; border:1px solid #d7dde8; border-radius:12px; overflow:hidden; break-inside:avoid;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; background:#111827; color:#ffffff; padding:10px 12px;">
                    <div style="font-size:14px; font-weight:800;">${escapar(tituloGrupo(grupo))}</div>
                    <div style="font-size:11px; font-weight:800; background:#2563eb; border-radius:999px; padding:4px 8px;">Grupo ${String(index + 1).padStart(2, '0')}</div>
                </div>
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8fafc;">
                            <th style="padding:9px 10px; border-bottom:1px solid #d7dde8; text-align:left; color:#475569; font-size:11px;">Item</th>
                            <th style="padding:9px 10px; border-bottom:1px solid #d7dde8; text-align:center; color:#475569; width:90px; font-size:11px;">Qtd</th>
                            <th style="padding:9px 10px; border-bottom:1px solid #d7dde8; text-align:center; color:#475569; width:130px; font-size:11px;">Conferido</th>
                            <th style="padding:9px 10px; border-bottom:1px solid #d7dde8; text-align:left; color:#475569; font-size:11px;">Observação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhas}
                    </tbody>
                </table>
            </section>
        `;
    }).join('');

    const logoPdfSrc = (config && config.logo) ? config.logo : './logo.png';
    const layout = `
        <div style="font-family:Inter,Arial,sans-serif; background:#fff; color:#111827; padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:20px; border-bottom:3px solid #111827; padding-bottom:14px; margin-bottom:14px;">
                <div>
                    <div style="font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:#2563eb; font-weight:900;">MTZ Eventos</div>
                    <h2 style="margin:4px 0 0 0; font-size:24px;">Checklist de Separação</h2>
                    <div style="margin-top:4px; font-size:12px; color:#64748b; font-weight:700;">Conferência operacional por modelo</div>
                </div>
                <div style="text-align:right; font-size:11px;">
                    <img src="${logoPdfSrc}" alt="MTZ Eventos" style="height:54px; object-fit:contain; margin-bottom:4px;">
                    <div><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px;">
                <div style="border:1px solid #d7dde8; border-radius:8px; padding:8px 10px; background:#f8fafc;">
                    <div style="font-size:9px; text-transform:uppercase; color:#64748b; font-weight:800;">Modelo</div>
                    <div style="font-size:12px; font-weight:800; margin-top:3px;">${escapar(modelo.nome || '-')}</div>
                </div>
                <div style="border:1px solid #d7dde8; border-radius:8px; padding:8px 10px; background:#f8fafc;">
                    <div style="font-size:9px; text-transform:uppercase; color:#64748b; font-weight:800;">Família</div>
                    <div style="font-size:12px; font-weight:800; margin-top:3px;">${escapar(modelo.familiaEstrutural || 'Não informada')}</div>
                </div>
                <div style="border:1px solid #d7dde8; border-radius:8px; padding:8px 10px; background:#f8fafc;">
                    <div style="font-size:9px; text-transform:uppercase; color:#64748b; font-weight:800;">Grupos</div>
                    <div style="font-size:12px; font-weight:800; margin-top:3px;">${gruposOrdenados.length}</div>
                </div>
                <div style="border:1px solid #d7dde8; border-radius:8px; padding:8px 10px; background:#f8fafc;">
                    <div style="font-size:9px; text-transform:uppercase; color:#64748b; font-weight:800;">Itens</div>
                    <div style="font-size:12px; font-weight:800; margin-top:3px;">${totalLinhas}</div>
                </div>
            </div>

            ${secoes || '<p style="padding:12px; border:1px solid #d7dde8; border-radius:10px;">Nenhuma peça encontrada para este modelo.</p>'}

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:22px; margin-top:26px;">
                <div style="text-align:center;">
                    <div style="border-top:1.5px solid #111827; padding-top:8px; font-size:10px; font-weight:800; text-transform:uppercase;">Responsável pela Separação</div>
                </div>
                <div style="text-align:center;">
                    <div style="border-top:1.5px solid #111827; padding-top:8px; font-size:10px; font-weight:800; text-transform:uppercase;">Responsável pela Conferência</div>
                </div>
            </div>
        </div>
    `;

    const printArea = document.getElementById('printArea');
    if (!printArea) {
        mostrarToast("Área de impressão não encontrada.", "erro");
        return;
    }

    printArea.innerHTML = layout;
    document.getElementById('modalRelatorio').classList.add('active');
}

window.abrirModalModeloChecklist = abrirModalModeloChecklist;
window.fecharModalModeloChecklist = fecharModalModeloChecklist;
window.atualizarSelectModeloChecklist = atualizarSelectModeloChecklist;
window.adicionarItemModeloChecklist = adicionarItemModeloChecklist;
window.renderItensModeloChecklistTemp = renderItensModeloChecklistTemp;
window.removerItemModeloChecklistTemp = removerItemModeloChecklistTemp;
window.salvarModeloChecklistForm = salvarModeloChecklistForm;
window.renderModelosChecklist = renderModelosChecklist;
window.excluirModeloChecklistUI = excluirModeloChecklistUI;
window.gerarChecklistModelo = gerarChecklistModelo;
window.editarModeloChecklist = editarModeloChecklist;
window.checklistMontagem = checklistMontagem;
window.checklistEtapasMontagem = checklistEtapasMontagem;
