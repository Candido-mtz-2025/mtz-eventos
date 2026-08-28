// Revisao isolada de exclusao/inativacao. Somente o executor publica dados.
(() => {
    let sessao = null, preparado = null, abrindo = false;
    const el = id => document.getElementById(id);
    const dialogo = () => el('dialogDestinacaoPecas');
    function mensagem(texto) { el('destinacaoPecasEstado').textContent = texto; }
    function descartar() {
        if (sessao?.executando) return false;
        const foco = sessao?.foco;
        sessao = null;
        el('destinacaoPecasResumo').replaceChildren();
        if (dialogo().open) dialogo().close();
        if (foco?.isConnected) foco.focus({ preventScroll: true });
        return true;
    }
    function entrada() { return { modo: 'destinacao', referencias: [...sessao.referencias], revisaoEsperada: sessao.revisao }; }
    function revisar() {
        sessao.plano = planejarDestinacaoPecas(entrada(), obterEstadoMemoriaAtual());
        const resumo = el('destinacaoPecasResumo');
        resumo.replaceChildren();
        for (const [acoes, titulo] of [[['excluir'], 'Excluir'], [['inativar'], 'Inativar e preservar histórico'], [['bloqueada'], 'Bloqueadas'], [['invalida'], 'Inválidas ou ambíguas'], [['manter'], 'Já inativas']]) {
            const itens = sessao.plano.itens.filter(i => acoes.includes(i.acao));
            if (!itens.length) continue;
            const h = document.createElement('h4'), lista = document.createElement('ul');
            h.textContent = `${titulo} (${itens.length})`;
            for (const item of itens) {
                const li = document.createElement('li');
                li.textContent = `${item.nome || 'Referência inválida'}${item.pecaId !== undefined ? ` · ${typeof item.pecaId}: ${item.pecaId}` : ''}`;
                if (item.vinculos?.length) {
                    const detalhe = document.createElement('p');
                    detalhe.textContent = item.vinculos.map(v => `${v.colecao}${v.registroId != null ? ` #${v.registroId}` : ''}: ${v.motivo}`).join(' ');
                    li.append(detalhe);
                }
                lista.append(li);
            }
            resumo.append(h, lista);
        }
        el('destinacaoPecasConfirmar').disabled = !sessao.plano.ok;
        el('destinacaoPecasConfirmar').setAttribute('aria-disabled', !sessao.plano.ok ? 'true' : 'false');
        el('destinacaoPecasParcial').hidden = sessao.plano.ok || !sessao.plano.itens.some(i => ['excluir', 'inativar', 'manter'].includes(i.acao));
        mensagem(sessao.plano.ok ? 'Revise as ações antes de confirmar.' : sessao.plano.bloqueios[0]?.mensagem || 'Não foi possível preparar o lote. Feche e revise o cadastro.');
    }
    function processar(ativo) {
        dialogo().setAttribute('aria-busy', ativo ? 'true' : 'false');
        dialogo().querySelectorAll('button').forEach(b => { b.disabled = ativo; });
        el('destinacaoPecasConfirmar').textContent = ativo ? 'Processando...' : 'Confirmar ações';
    }
    async function confirmar() {
        if (!sessao || sessao.executando || sessao.bloqueada || !sessao.plano.ok) return false;
        if (typeof validarPermissao === 'function' && !validarPermissao('excluir_registro')) return false;
        const atual = sessao;
        atual.executando = true; processar(true); mensagem('Processando. Aguarde a confirmação do armazenamento.');
        let r;
        try {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const dados = entrada(), plano = planejarDestinacaoPecas(dados, obterEstadoMemoriaAtual());
            if (!plano.ok || plano.assinatura !== atual.plano.assinatura) r = { ok: false, codigo: plano.codigo, bloqueios: plano.bloqueios };
            else {
                const agora = new Date(), deps = criarDependenciasExecutorPeca({ armazenamento: localStorage });
                r = executarAlteracaoPecaTransacional({ ...dados, operacaoId: atual.operacaoId, assinaturaPlanoEsperada: plano.assinatura,
                    atualizadoEm: agora.toISOString(), atualizadoPor: localStorage.getItem('usuarioEmail') || 'Offline',
                    persistencia: { versao: window.SCHEMA_VERSION_V12 || '12.6', data: agora.toISOString(), ultimaEdicao: agora.getTime() } }, deps);
                if (r.ok && r.aplicado) {
                    if (!verificarOperacaoPeca(obterEstadoMemoriaAtual(), r.operacao).completo) r = { ok: false, requerRecuperacao: true };
                    else r = concluirMetadadoOperacaoPeca(r, deps);
                }
            }
        } catch (_erro) { r = { ok: false, requerRecuperacao: true }; }
        finally { atual.executando = false; processar(false); }
        if (r.ok) {
            atual.referencias.forEach(ref => window.estoqueSelecionados.delete(ref));
            descartar();
            if (r.efeitos?.renderizar) {
                try { renderEstoque(); } catch (_erro) { mostrarToast('Alteração confirmada. Reabra a aba para atualizar a lista.', 'info'); }
            }
            atualizarContadorSelecaoEstoque();
            el('abrirInclusaoPeca')?.focus({ preventScroll: true });
            if (r.efeitos?.sincronizar) {
                try { Promise.resolve(sincronizar('salvar')).catch(() => mostrarToast('Alteração local confirmada. Sincronização pendente.', 'info')); }
                catch (_erro) { mostrarToast('Alteração local confirmada. Sincronização pendente.', 'info'); }
            }
            mostrarToast(r.avisos?.some(a => a.codigo === 'METADADO_SYNC_PENDENTE') ? 'Alteração confirmada. Marcador de sincronização pendente.' : 'Ações de estoque confirmadas.', 'info');
            return true;
        }
        atual.bloqueada = r.requerRecuperacao || r.codigo !== 'FALHA_PERSISTENCIA';
        el('destinacaoPecasConfirmar').disabled = !!atual.bloqueada;
        el('destinacaoPecasConfirmar').setAttribute('aria-disabled', atual.bloqueada ? 'true' : 'false');
        el('destinacaoPecasParcial').hidden = true;
        mensagem(r.requerRecuperacao ? 'Recuperação explícita necessária. Não repita a operação. Feche e confira o estado persistido.'
            : r.codigo === 'FALHA_PERSISTENCIA' ? 'Não foi possível salvar. Nenhuma alteração foi publicada. Tente novamente.'
            : r.bloqueios?.[0]?.mensagem || 'O estoque foi modificado. Feche e abra uma nova revisão.');
        el('destinacaoPecasEstado').focus();
        return false;
    }
    function prosseguirLiberadas() {
        if (!sessao || sessao.executando || sessao.bloqueada || sessao.plano.ok) return false;
        const liberadas = sessao.plano.itens.filter(i => ['excluir','inativar','manter'].includes(i.acao)).map(i => i.referencia);
        if (!liberadas.length) return false;
        sessao.referencias = liberadas;
        sessao.operacaoId = `estoque-${crypto.randomUUID()}`;
        sessao.revisao = capturarRevisaoEstoque(obterEstadoMemoriaAtual()).revisao;
        revisar();
        mensagem('Novo plano somente com as peças liberadas. Revise e confirme novamente.');
        el('destinacaoPecasEstado').focus();
        return true;
    }
    window.abrirDestinacaoPecas = referencias => {
        if (sessao || abrindo || window.sessaoPecaAtiva?.()) { mostrarToast('Já existe uma sessão de estoque aberta.', 'info'); return false; }
        abrindo = true;
        try {
        if (typeof validarPermissao === 'function' && !validarPermissao('excluir_registro')) return false;
        const copia = clonarJsonPersistivelEstrito(referencias), revisao = capturarRevisaoEstoque(obterEstadoMemoriaAtual());
        if (!copia.ok || !revisao.ok) { mostrarToast('Dados inválidos para uma revisão segura.', 'erro'); return false; }
        const d = dialogo();
        if (!d || typeof d.showModal !== 'function') return false;
        if (preparado !== d) {
            preparado = d;
            d.addEventListener('cancel', e => { e.preventDefault(); descartar(); });
            d.addEventListener('close', () => { if (sessao && !d.open) descartar(); });
            d.addEventListener('click', e => {
                const r = d.getBoundingClientRect();
                if (e.target.closest('[data-fechar-destinacao]') || e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) descartar();
            });
            el('destinacaoPecasConfirmar').addEventListener('click', confirmar);
            el('destinacaoPecasParcial').addEventListener('click', prosseguirLiberadas);
            d.addEventListener('keydown', e => {
                e.stopPropagation();
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') e.preventDefault();
                if (e.key === 'Escape') { e.preventDefault(); descartar(); }
                if (e.key === 'Tab') {
                    const botoes = [...d.querySelectorAll('button:not(:disabled):not([hidden])')], primeiro = botoes[0], ultimo = botoes[botoes.length - 1];
                    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo?.focus(); }
                    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
                }
            });
        }
        sessao = { referencias: copia.valor, revisao: revisao.revisao, operacaoId: `estoque-${crypto.randomUUID()}`, foco: document.activeElement, executando: false, bloqueada: false };
        processar(false); revisar(); d.showModal(); el('destinacaoPecasEstado').focus();
        return true;
        } catch (_erro) {
            sessao = null;
            mostrarToast('Não foi possível preparar uma revisão segura. Nenhum dado foi alterado.', 'erro');
            return false;
        } finally { abrindo = false; }
    };
    window.atualizarContadorSelecaoEstoque = () => {
        const contador = el('estoqueSelecionadosContador');
        if (contador) contador.textContent = `${window.estoqueSelecionados.size} selecionado(s)`;
        const checks = [...document.querySelectorAll('.chk-estoque:not(:disabled)')], todos = el('chkAllEstoque');
        if (todos) {
            todos.checked = checks.length > 0 && checks.every(c => c.checked);
            todos.indeterminate = checks.some(c => c.checked) && !todos.checked;
        }
    };
    window.abrirExclusaoPeca = ref => window.abrirDestinacaoPecas([ref]);
    window.sessaoDestinacaoPecasAtiva = () => !!sessao || abrindo;
    window.confirmarDestinacaoPecas = confirmar;
    window.cancelarDestinacaoPecas = descartar;
    window.revisarPecasLiberadas = prosseguirLiberadas;
})();
