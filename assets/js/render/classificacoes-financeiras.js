// Catálogos administrativos de categorias financeiras e centros de custo.
(() => {
    'use strict';

    let sessao = null;
    let emProcessamento = false;
    let modalRegistrado = false;

    function estadoAtual() {
        return typeof obterEstadoMemoriaAtual === 'function'
            ? obterEstadoMemoriaAtual() : null;
    }

    function escapar(valor) {
        if (!['string', 'number'].includes(typeof valor)) return '';
        return String(valor).replace(/[&<>'"]/g, (caractere) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[caractere]);
    }

    function normalizarBusca(valor) {
        return typeof valor === 'string'
            ? valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            : '';
    }

    function agoraIso() {
        return new Date().toISOString();
    }

    function hojeLocal() {
        const data = new Date();
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${
            String(data.getDate()).padStart(2, '0')}`;
    }

    function operacaoId(prefixo) {
        const parte = typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID().toLowerCase()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return `${prefixo}.${parte}`;
    }

    function usuarioAtual() {
        return typeof obterUsuarioAtualNomeOuEmail === 'function'
            ? obterUsuarioAtualNomeOuEmail() : 'Sistema';
    }

    function metadados(agora) {
        return {
            versao: typeof STORAGE_VERSION === 'string' ? STORAGE_VERSION : '12.0',
            data: agora,
            ultimaEdicao: Date.now()
        };
    }

    function campo(id) {
        return document.getElementById(id);
    }

    function definirErro(mensagem, alvo = null) {
        const modal = campo('modalClassificacaoFinanceira');
        const erro = campo('classificacaoFinanceiraErro');
        modal?.querySelectorAll('[aria-invalid="true"]').forEach((elemento) => {
            elemento.removeAttribute('aria-invalid');
            const descricoes = (elemento.getAttribute('aria-describedby') || '')
                .split(/\s+/).filter((id) => id && id !== erro?.id);
            if (descricoes.length) elemento.setAttribute('aria-describedby', descricoes.join(' '));
            else elemento.removeAttribute('aria-describedby');
        });
        if (erro) {
            erro.textContent = mensagem || '';
            erro.hidden = !mensagem;
        }
        if (mensagem && alvo) {
            alvo.setAttribute('aria-invalid', 'true');
            const descricoes = new Set((alvo.getAttribute('aria-describedby') || '')
                .split(/\s+/).filter(Boolean));
            descricoes.add(erro.id);
            alvo.setAttribute('aria-describedby', [...descricoes].join(' '));
            alvo.focus({ preventScroll: true });
        }
    }

    function limparErroCampo(alvo) {
        if (!(alvo instanceof HTMLElement) || alvo.getAttribute('aria-invalid') !== 'true') return;
        const erro = campo('classificacaoFinanceiraErro');
        alvo.removeAttribute('aria-invalid');
        const descricoes = (alvo.getAttribute('aria-describedby') || '')
            .split(/\s+/).filter((id) => id && id !== erro?.id);
        if (descricoes.length) alvo.setAttribute('aria-describedby', descricoes.join(' '));
        else alvo.removeAttribute('aria-describedby');
        if (!campo('modalClassificacaoFinanceira')?.querySelector('[aria-invalid="true"]')) {
            erro.textContent = '';
            erro.hidden = true;
        }
    }

    function registrarModal() {
        if (modalRegistrado) return;
        const modal = campo('modalClassificacaoFinanceira');
        const form = campo('formClassificacaoFinanceira');
        if (!modal || !form) return;
        modalRegistrado = true;
        modal.addEventListener('click', (evento) => {
            if (evento.target === modal && !emProcessamento) fecharClassificacaoFinanceira();
        });
        modal.addEventListener('keydown', (evento) => {
            if (!modal.classList.contains('active')) return;
            if (evento.key === 'Escape' && !emProcessamento) {
                evento.preventDefault();
                fecharClassificacaoFinanceira();
                return;
            }
            if (evento.key !== 'Tab') return;
            const focaveis = [...modal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )].filter((elemento) => !elemento.hidden && elemento.getClientRects().length);
            if (!focaveis.length) {
                evento.preventDefault();
                modal.focus();
                return;
            }
            const primeiro = focaveis[0];
            const ultimo = focaveis[focaveis.length - 1];
            if (evento.shiftKey && document.activeElement === primeiro) {
                evento.preventDefault();
                ultimo.focus();
            } else if (!evento.shiftKey && document.activeElement === ultimo) {
                evento.preventDefault();
                primeiro.focus();
            }
        });
        modal.addEventListener('input', (evento) => limparErroCampo(evento.target));
        modal.addEventListener('change', (evento) => limparErroCampo(evento.target));
        form.addEventListener('submit', (evento) => {
            evento.preventDefault();
            salvarClassificacaoFinanceira();
        });
    }

    function localizarExato(tipoEntidade, referencia) {
        if (typeof referencia !== 'string' || !referencia) return null;
        const estado = estadoAtual();
        const colecao = tipoEntidade === 'categoria'
            ? estado?.categoriasFinanceiras : estado?.centrosCusto;
        const chave = tipoEntidade === 'categoria'
            ? 'categoriaFinanceiraReferencia' : 'centroCustoReferencia';
        const encontrados = (Array.isArray(colecao) ? colecao : [])
            .filter((registro) => registro?.[chave] === referencia);
        return encontrados.length === 1 ? encontrados[0] : null;
    }

    function preencherOpcoesVinculos(tipoEntidade, registro = null) {
        const estado = estadoAtual();
        if (tipoEntidade === 'categoria') {
            const select = campo('classificacaoFinanceiraVinculoPrimario');
            select.replaceChildren(new Option('Sem categoria superior', ''));
            (Array.isArray(estado?.categoriasFinanceiras) ? estado.categoriasFinanceiras : [])
                .filter((item) => item.situacao === 'ativa'
                    && item.categoriaFinanceiraReferencia !== registro?.categoriaFinanceiraReferencia)
                .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
                    || a.categoriaFinanceiraReferencia.localeCompare(b.categoriaFinanceiraReferencia))
                .forEach((item) => select.append(new Option(
                    `${item.codigo} · ${item.nome}`, item.categoriaFinanceiraReferencia)));
            if (registro?.categoriaPaiReferencia
                && ![...select.options].some((opcao) => opcao.value === registro.categoriaPaiReferencia)) {
                select.append(new Option('Categoria histórica inativa', registro.categoriaPaiReferencia));
            }
            select.value = registro?.categoriaPaiReferencia || '';
            return;
        }
        const proposta = campo('classificacaoFinanceiraVinculoPrimario');
        const locacao = campo('classificacaoFinanceiraVinculoSecundario');
        proposta.replaceChildren(new Option('Sem proposta', ''));
        locacao.replaceChildren(new Option('Sem locação', ''));
        (Array.isArray(estado?.propostas) ? estado.propostas : []).forEach((item) => {
            const referencia = typeof criarReferenciaTipadaPagar === 'function'
                ? criarReferenciaTipadaPagar('proposta', item?.id) : '';
            if (referencia) proposta.append(new Option(
                item.codigo || item.numero || referencia, referencia));
        });
        (Array.isArray(estado?.locacoes) ? estado.locacoes : []).forEach((item) => {
            const referencia = typeof criarReferenciaTipadaPagar === 'function'
                ? criarReferenciaTipadaPagar('locacao', item?.id) : '';
            if (referencia) locacao.append(new Option(
                item.evento || item.nomeEvento || referencia, referencia));
        });
        proposta.value = registro?.propostaReferencia || '';
        locacao.value = registro?.locacaoReferencia || '';
    }

    function abrirEditorClassificacaoFinanceira(tipoEntidade, referencia = '') {
        if (!['categoria', 'centro'].includes(tipoEntidade) || emProcessamento || sessao) return false;
        const acao = referencia ? 'editar' : 'cadastrar';
        const permissao = `${acao}_${tipoEntidade === 'categoria'
            ? 'categoria_financeira' : 'centro_custo'}`;
        if (typeof validarPermissao === 'function'
            && !validarPermissao(permissao, 'Você não possui permissão para esta operação.')) return false;
        const registro = referencia ? localizarExato(tipoEntidade, referencia) : null;
        if (referencia && !registro) return false;
        const acionador = document.activeElement instanceof HTMLElement
            ? document.activeElement : null;
        sessao = {
            tipoEntidade,
            acao,
            registro,
            acionador,
            operacaoId: operacaoId(`${tipoEntidade}-financeiro`)
        };
        campo('formClassificacaoFinanceira')?.reset();
        campo('classificacaoFinanceiraTitulo').textContent = `${
            acao === 'cadastrar' ? 'Cadastrar' : 'Editar'} ${
            tipoEntidade === 'categoria' ? 'categoria financeira' : 'centro de custo'}`;
        campo('classificacaoFinanceiraCodigo').value = registro?.codigo || '';
        campo('classificacaoFinanceiraNome').value = registro?.nome || '';
        const rotuloClassificacao = campo('classificacaoFinanceiraClassificacaoLabel');
        const selectClassificacao = campo('classificacaoFinanceiraClassificacao');
        selectClassificacao.replaceChildren();
        if (tipoEntidade === 'categoria') {
            rotuloClassificacao.textContent = 'Natureza permitida';
            [['receita', 'Receita'], ['despesa', 'Despesa'], ['ambas', 'Ambas']]
                .forEach(([valor, rotulo]) => selectClassificacao.append(new Option(rotulo, valor)));
            campo('classificacaoFinanceiraVinculoPrimarioLabel').textContent = 'Categoria superior';
            campo('classificacaoFinanceiraVinculoSecundarioGrupo').hidden = true;
            selectClassificacao.value = registro?.naturezaPermitida || 'despesa';
        } else {
            rotuloClassificacao.textContent = 'Tipo';
            [['administrativo', 'Administrativo'], ['operacional', 'Operacional'], ['evento', 'Evento']]
                .forEach(([valor, rotulo]) => selectClassificacao.append(new Option(rotulo, valor)));
            campo('classificacaoFinanceiraVinculoPrimarioLabel').textContent = 'Proposta opcional';
            campo('classificacaoFinanceiraVinculoSecundarioGrupo').hidden = false;
            selectClassificacao.value = registro?.tipo || 'administrativo';
        }
        preencherOpcoesVinculos(tipoEntidade, registro);
        definirErro('');
        registrarModal();
        const modal = campo('modalClassificacaoFinanceira');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        const focarPrimeiroCampo = (tentativa = 0) => {
            if (!modal.classList.contains('active')) return;
            const primeiroCampo = campo('classificacaoFinanceiraCodigo');
            primeiroCampo?.focus({ preventScroll: true });
            if (document.activeElement !== primeiroCampo && tentativa < 2) {
                setTimeout(() => focarPrimeiroCampo(tentativa + 1), 0);
            }
        };
        setTimeout(() => focarPrimeiroCampo(), 0);
        return true;
    }

    function fecharClassificacaoFinanceira() {
        if (!sessao || emProcessamento) return false;
        const acionador = sessao.acionador;
        sessao = null;
        const modal = campo('modalClassificacaoFinanceira');
        modal?.classList.remove('active');
        modal?.setAttribute('aria-hidden', 'true');
        definirErro('');
        const fallback = campo('btnNovaCategoriaFinanceira');
        (acionador?.isConnected ? acionador : fallback)?.focus({ preventScroll: true });
        return true;
    }

    function criarEntradaSessao(acao, registro, operacao) {
        const agora = agoraIso();
        const meta = metadados(agora);
        const usarFormulario = Boolean(sessao && ['cadastrar', 'editar'].includes(acao));
        const codigo = usarFormulario
            ? campo('classificacaoFinanceiraCodigo')?.value.trim() || '' : registro?.codigo || '';
        const nome = usarFormulario
            ? campo('classificacaoFinanceiraNome')?.value.trim() || '' : registro?.nome || '';
        const classificacao = (usarFormulario
            ? campo('classificacaoFinanceiraClassificacao')?.value : '')
            || (operacao.tipoEntidade === 'categoria'
                ? registro?.naturezaPermitida : registro?.tipo) || '';
        const vinculoPrimario = (usarFormulario
            ? campo('classificacaoFinanceiraVinculoPrimario')?.value : undefined)
            ?? (operacao.tipoEntidade === 'categoria'
                ? registro?.categoriaPaiReferencia : registro?.propostaReferencia) ?? '';
        const vinculoSecundario = operacao.tipoEntidade === 'centro'
            ? ((usarFormulario
                ? campo('classificacaoFinanceiraVinculoSecundario')?.value : undefined)
                ?? registro?.locacaoReferencia ?? '') : '';
        const situacao = operacao.situacao;
        if (operacao.tipoEntidade === 'categoria') {
            return criarEntradaCategoriaFinanceira(
                acao, operacao.id, operacao.referencia, codigo, nome, classificacao,
                vinculoPrimario, situacao, operacao.operacaoId, agora, hojeLocal(),
                usuarioAtual(), meta.versao, meta.data, meta.ultimaEdicao);
        }
        return criarEntradaCentroCusto(
            acao, operacao.id, operacao.referencia, codigo, nome, classificacao,
            vinculoPrimario, vinculoSecundario, situacao, operacao.operacaoId, agora,
            hojeLocal(), usuarioAtual(), meta.versao, meta.data, meta.ultimaEdicao);
    }

    function executarEntrada(entrada) {
        if (!entrada || typeof executarOperacaoClassificacaoFinanceiraTransacional !== 'function'
            || typeof criarDependenciasExecutorClassificacoesFinanceiras !== 'function') return null;
        return executarOperacaoClassificacaoFinanceiraTransacional(
            entrada,
            criarDependenciasExecutorClassificacoesFinanceiras({ armazenamento: localStorage })
        );
    }

    function aplicarEfeitos(resultado) {
        if (resultado?.efeitos?.renderizar) renderClassificacoesFinanceiras();
        if (resultado?.efeitos?.sincronizar && typeof sincronizar === 'function') {
            sincronizar('salvar');
        }
    }

    function salvarClassificacaoFinanceira() {
        if (!sessao || emProcessamento) return false;
        const codigo = campo('classificacaoFinanceiraCodigo');
        const nome = campo('classificacaoFinanceiraNome');
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(codigo?.value.trim() || '')) {
            definirErro('Informe um código com letras, números, ponto, hífen ou sublinhado.', codigo);
            return false;
        }
        if (!nome?.value.trim()) {
            definirErro('Informe o nome.', nome);
            return false;
        }
        const id = sessao.registro?.id
            ?? `${sessao.tipoEntidade === 'categoria' ? 'categoria-financeira' : 'centro-custo'}-${
                sessao.operacaoId.split('.').slice(1).join('.')}`;
        const referencia = sessao.registro
            ? (sessao.tipoEntidade === 'categoria'
                ? sessao.registro.categoriaFinanceiraReferencia
                : sessao.registro.centroCustoReferencia)
            : '';
        const situacao = sessao.registro?.situacao
            || (sessao.tipoEntidade === 'categoria' ? 'ativa' : 'ativo');
        const entrada = criarEntradaSessao(sessao.acao, sessao.registro, {
            tipoEntidade: sessao.tipoEntidade,
            id,
            referencia,
            situacao,
            operacaoId: sessao.operacaoId
        });
        if (!entrada) return false;
        emProcessamento = true;
        try {
            const resultado = executarEntrada(entrada);
            aplicarEfeitos(resultado);
            if (resultado?.ok) {
                emProcessamento = false;
                fecharClassificacaoFinanceira();
                if (typeof mostrarToast === 'function') {
                    mostrarToast('Classificação financeira confirmada.');
                }
                return true;
            }
            definirErro(resultado?.requerRecuperacao
                ? 'A operação exige recuperação explícita.'
                : 'Não foi possível confirmar a classificação.', codigo);
            return false;
        } finally {
            emProcessamento = false;
        }
    }

    function alterarSituacaoClassificacaoFinanceira(tipoEntidade, referencia) {
        if (emProcessamento || sessao) return false;
        const registro = localizarExato(tipoEntidade, referencia);
        if (!registro) return false;
        const ativo = tipoEntidade === 'categoria'
            ? registro.situacao === 'ativa' : registro.situacao === 'ativo';
        const acao = ativo ? 'inativar' : 'reativar';
        const permissao = `inativar_${tipoEntidade === 'categoria'
            ? 'categoria_financeira' : 'centro_custo'}`;
        if (typeof validarPermissao === 'function'
            && !validarPermissao(permissao, 'Você não possui permissão para alterar a situação.')) {
            return false;
        }
        const executar = () => {
            if (emProcessamento) return false;
            const operacao = {
                tipoEntidade,
                id: registro.id,
                referencia,
                situacao: tipoEntidade === 'categoria'
                    ? (ativo ? 'inativa' : 'ativa') : (ativo ? 'inativo' : 'ativo'),
                operacaoId: operacaoId(`${tipoEntidade}-${acao}`)
            };
            const entrada = criarEntradaSessao(acao, registro, operacao);
            if (!entrada) return false;
            emProcessamento = true;
            try {
                const resultado = executarEntrada(entrada);
                aplicarEfeitos(resultado);
                if (resultado?.ok && typeof mostrarToast === 'function') {
                    mostrarToast(`Registro ${ativo ? 'inativado' : 'reativado'}.`);
                }
                if (!resultado?.ok && typeof mostrarToast === 'function') {
                    mostrarToast(resultado?.requerRecuperacao
                        ? 'A operação exige recuperação explícita.'
                        : 'Não foi possível alterar a situação.', 'erro');
                }
                return resultado?.ok === true;
            } finally {
                emProcessamento = false;
            }
        };
        if (typeof confirmarAcao === 'function') {
            confirmarAcao(
                `${ativo ? 'Inativar' : 'Reativar'} “${registro.nome}”?`,
                executar,
                { titulo: `${ativo ? 'Inativar' : 'Reativar'} registro` }
            );
            return true;
        }
        return executar();
    }

    function filtrarColecao(colecao, busca, situacao) {
        return colecao.filter((registro) => {
            const ativo = ['ativa', 'ativo'].includes(registro.situacao);
            if (situacao === 'ativos' && !ativo) return false;
            if (situacao === 'inativos' && ativo) return false;
            return !busca || normalizarBusca(`${registro.codigo} ${registro.nome}`)
                .includes(busca);
        }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
            || a.codigo.localeCompare(b.codigo, 'pt-BR')
            || (a.categoriaFinanceiraReferencia || a.centroCustoReferencia)
                .localeCompare(b.categoriaFinanceiraReferencia || b.centroCustoReferencia));
    }

    function renderClassificacoesFinanceiras() {
        const conteudo = campo('classificacoesFinanceirasConteudo');
        const bloqueio = campo('classificacoesFinanceirasPermissao');
        if (!conteudo || !bloqueio) return false;
        const permitido = typeof temPermissao !== 'function'
            || temPermissao('visualizar_classificacoes_financeiras');
        conteudo.hidden = !permitido;
        bloqueio.hidden = permitido;
        if (!permitido) return false;
        const estado = estadoAtual();
        const buscaCategoria = normalizarBusca(campo('buscaCategoriasFinanceiras')?.value || '');
        const filtroCategoria = campo('filtroCategoriasFinanceiras')?.value || 'todos';
        const buscaCentro = normalizarBusca(campo('buscaCentrosCusto')?.value || '');
        const filtroCentro = campo('filtroCentrosCusto')?.value || 'todos';
        const categorias = filtrarColecao(
            Array.isArray(estado?.categoriasFinanceiras) ? estado.categoriasFinanceiras : [],
            buscaCategoria,
            filtroCategoria
        );
        const centros = filtrarColecao(
            Array.isArray(estado?.centrosCusto) ? estado.centrosCusto : [],
            buscaCentro,
            filtroCentro
        );
        campo('tblCategoriasFinanceiras').innerHTML = categorias.length
            ? categorias.map((item) => {
                const ativa = item.situacao === 'ativa';
                return `<tr><td>${escapar(item.codigo)}</td><td>${escapar(item.nome)}</td>
                    <td>${escapar(item.naturezaPermitida)}</td>
                    <td><span class="badge ${ativa ? 'badge-success' : 'badge-secondary'}">${
                        escapar(item.situacao)}</span></td><td class="table-actions">
                    <button type="button" class="btn btn-sm btn-info" data-action="abrirEditorClassificacaoFinanceira"
                        data-arg="${escapar(encodeURIComponent(JSON.stringify(['categoria', item.categoriaFinanceiraReferencia])))}"
                        aria-label="Editar categoria ${escapar(item.nome)}"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-sm ${ativa ? 'btn-warning' : 'btn-success'}"
                        data-action="alterarSituacaoClassificacaoFinanceira"
                        data-arg="${escapar(encodeURIComponent(JSON.stringify(['categoria', item.categoriaFinanceiraReferencia])))}"
                        aria-label="${ativa ? 'Inativar' : 'Reativar'} categoria ${escapar(item.nome)}">
                        <i class="bi ${ativa ? 'bi-pause-circle' : 'bi-play-circle'}"></i></button></td></tr>`;
            }).join('')
            : '<tr><td colspan="5">Nenhuma categoria financeira encontrada.</td></tr>';
        campo('tblCentrosCusto').innerHTML = centros.length
            ? centros.map((item) => {
                const ativo = item.situacao === 'ativo';
                return `<tr><td>${escapar(item.codigo)}</td><td>${escapar(item.nome)}</td>
                    <td>${escapar(item.tipo)}</td>
                    <td><span class="badge ${ativo ? 'badge-success' : 'badge-secondary'}">${
                        escapar(item.situacao)}</span></td><td class="table-actions">
                    <button type="button" class="btn btn-sm btn-info" data-action="abrirEditorClassificacaoFinanceira"
                        data-arg="${escapar(encodeURIComponent(JSON.stringify(['centro', item.centroCustoReferencia])))}"
                        aria-label="Editar centro de custo ${escapar(item.nome)}"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-sm ${ativo ? 'btn-warning' : 'btn-success'}"
                        data-action="alterarSituacaoClassificacaoFinanceira"
                        data-arg="${escapar(encodeURIComponent(JSON.stringify(['centro', item.centroCustoReferencia])))}"
                        aria-label="${ativo ? 'Inativar' : 'Reativar'} centro ${escapar(item.nome)}">
                        <i class="bi ${ativo ? 'bi-pause-circle' : 'bi-play-circle'}"></i></button></td></tr>`;
            }).join('')
            : '<tr><td colspan="5">Nenhum centro de custo encontrado.</td></tr>';
        return true;
    }

    function decodificarAcaoClassificacao(argumento) {
        if (typeof argumento !== 'string') return null;
        try {
            const dados = JSON.parse(decodeURIComponent(argumento));
            return Array.isArray(dados) && dados.length === 2
                && dados.every((item) => typeof item === 'string') ? dados : null;
        } catch (_erro) {
            return null;
        }
    }

    function abrirEditorClassificacaoFinanceiraAcao(argumento) {
        const dados = decodificarAcaoClassificacao(argumento);
        return dados ? abrirEditorClassificacaoFinanceira(dados[0], dados[1]) : false;
    }

    function alterarSituacaoClassificacaoFinanceiraAcao(argumento) {
        const dados = decodificarAcaoClassificacao(argumento);
        return dados ? alterarSituacaoClassificacaoFinanceira(dados[0], dados[1]) : false;
    }

    window.renderClassificacoesFinanceiras = renderClassificacoesFinanceiras;
    window.abrirNovaCategoriaFinanceira = () => abrirEditorClassificacaoFinanceira('categoria');
    window.abrirNovoCentroCusto = () => abrirEditorClassificacaoFinanceira('centro');
    window.abrirEditorClassificacaoFinanceira = abrirEditorClassificacaoFinanceiraAcao;
    window.alterarSituacaoClassificacaoFinanceira
        = alterarSituacaoClassificacaoFinanceiraAcao;
    window.fecharClassificacaoFinanceira = fecharClassificacaoFinanceira;
    window.salvarClassificacaoFinanceira = salvarClassificacaoFinanceira;
})();
