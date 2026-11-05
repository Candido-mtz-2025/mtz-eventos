(() => {
    'use strict';
    let dialogo, sessao, ocupado = false;
    const permitido = acao => typeof temPermissao === 'function' && temPermissao(acao);
    const escapar = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ref = (prefixo, id) => prefixo + ':' + encodeURIComponent(JSON.stringify([typeof id, id]));
    const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    function fechar() {
        if (ocupado || !dialogo?.open) return;
        const acionador = sessao?.acionador, referencia = sessao?.referencia, acao = sessao?.acao;
        dialogo.close(); sessao = null;
        if (acionador?.isConnected) acionador.focus();
        else ([...document.querySelectorAll('[data-encargo-referencia]')].find(b => b.dataset.encargoReferencia === referencia
            && b.dataset.encargoAcao === acao) || document.getElementById('encargosNovo'))?.focus();
    }
    function instalar() {
        if (dialogo) return;
        dialogo = document.createElement('dialog'); dialogo.id = 'dialogoEncargo';
        dialogo.setAttribute('role', 'dialog'); dialogo.setAttribute('aria-modal', 'true');
        dialogo.setAttribute('aria-labelledby', 'encargoTitulo'); dialogo.setAttribute('aria-describedby', 'encargoDescricao');
        dialogo.style.cssText = 'width:min(92vw,700px);max-height:90vh;overflow:auto;border:1px solid #aaa;border-radius:8px;padding:20px';
        document.body.append(dialogo);
        dialogo.addEventListener('cancel', e => { e.preventDefault(); fechar(); });
        dialogo.addEventListener('click', e => { if (e.target === dialogo) { const r = dialogo.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fechar(); } });
        dialogo.addEventListener('keydown', e => {
            if (e.key !== 'Tab') return;
            const campos = [...dialogo.querySelectorAll('input,select,textarea,button')].filter(c => !c.disabled && c.offsetParent !== null);
            if (!campos.length) { e.preventDefault(); return; }
            if (e.shiftKey && document.activeElement === campos[0]) { e.preventDefault(); campos.at(-1).focus(); }
            else if (!e.shiftKey && document.activeElement === campos.at(-1)) { e.preventDefault(); campos[0].focus(); }
        });
        dialogo.addEventListener('submit', e => { e.preventDefault(); salvar(); });
        dialogo.addEventListener('input', e => { if (e.target.hasAttribute('aria-invalid')) {
            e.target.removeAttribute('aria-invalid'); e.target.removeAttribute('aria-describedby');
            dialogo.querySelector('#encargoErro').textContent = ''; } });
        dialogo.addEventListener('click', e => { if (e.target.closest('[data-fechar-encargo]')) fechar(); });
        const painel = document.getElementById('tab-encargos');
        painel.addEventListener('click', e => { const b = e.target.closest('[data-encargo-acao]');
            if (b) abrir(b.dataset.encargoAcao, b.dataset.encargoReferencia || '', b); });
        painel.querySelectorAll('input,select').forEach(c => c.addEventListener('input', renderEncargosFinanceiros));
    }
    function renderEncargosFinanceiros() {
        const painel = document.getElementById('encargosConteudo'); if (!painel) return;
        instalar(); const acesso = permitido('visualizar_encargos_financeiros'); painel.hidden = !acesso;
        document.getElementById('encargosSemPermissao').hidden = acesso;
        const corpo = document.getElementById('encargosTabela');
        if (!acesso) { corpo.replaceChildren(); if (dialogo.open) { ocupado = false; fechar(); } dialogo.replaceChildren(); return; }
        let aviso = document.getElementById('encargosPoliticaSeguranca');
        if (!aviso) {
            aviso = document.createElement('p'); aviso.id = 'encargosPoliticaSeguranca'; aviso.setAttribute('role', 'status');
            painel.prepend(aviso);
        }
        aviso.textContent = 'Persistência de encargos indisponível: o armazenamento local não garante exclusão entre escritores. '
            + 'Aprovação e rejeição indisponíveis sem identidade e autorização verificáveis. Registros existentes permanecem somente para consulta. '
            + 'Aprovações históricas são registros documentais, não prova de autenticação.';
        const estado = obterEstadoMemoriaAtual();
        if (!EncargosFinanceiros.validarTexto(JSON.stringify(estado))) { corpo.innerHTML = '<tr><td colspan="6">Encargos exigem recuperação explícita.</td></tr>'; return; }
        const busca = document.getElementById('encargosBusca').value.toLowerCase(), situacao = document.getElementById('encargosSituacao').value;
        document.getElementById('encargosNovo').hidden = !permitido('cadastrar_encargo_financeiro');
        corpo.innerHTML = (estado.encargosFinanceiros || []).filter(r => (!situacao || r.situacao === situacao)
            && (r.dados.titulo + ' ' + r.dados.tipo + ' ' + r.encargoReferencia).toLowerCase().includes(busca))
            .sort((a, b) => a.encargoReferencia.localeCompare(b.encargoReferencia)).map(r => {
                const botoes = [['consultar', 'Detalhes']];
                if (r.situacao === 'rascunho') botoes.push(['editar', 'Editar'], ['encaminhar', 'Encaminhar']);
                if (r.situacao === 'aguardando_aprovacao' && EncargosFinanceiros.politicaSeguranca.aprovacaoVerificavel)
                    botoes.push(['aprovar', 'Aprovar'], ['rejeitar', 'Rejeitar']);
                if (['aprovado', 'rejeitado'].includes(r.situacao)) botoes.push(['revisar', 'Revisar']);
                if (r.situacao !== 'cancelado') botoes.push(['cancelar', 'Cancelar']);
                return `<tr><td>${escapar(r.dados.titulo)}<div class="table-cell-sub">${escapar(r.encargoReferencia)}</div></td>
                    <td>${escapar(r.dados.tipo)}</td><td>${escapar(r.situacao)}</td><td>${r.versao}</td>
                    <td>${formatarCentavosMonetarios(r.dados.valorCentavos)}</td>
                    <td>${botoes.filter(([a]) => a === 'consultar' || permitido(EncargosFinanceiros.permissao(a))).map(([a, nome]) =>
                        `<button type="button" class="btn btn-sm btn-secondary" data-encargo-acao="${a}" data-encargo-referencia="${escapar(r.encargoReferencia)}">${nome}</button>`).join(' ')}</td></tr>`;
            }).join('') || '<tr><td colspan="6">Nenhuma condição registrada.</td></tr>';
    }
    function abrir(acao, referencia, acionador) {
        if (ocupado || (['aprovar', 'rejeitar'].includes(acao) && !EncargosFinanceiros.politicaSeguranca.aprovacaoVerificavel)
            || !permitido(acao === 'consultar' ? 'visualizar_encargos_financeiros' : EncargosFinanceiros.permissao(acao))) return;
        const estado = obterEstadoMemoriaAtual(), encontrados = (estado.encargosFinanceiros || []).filter(r => r.encargoReferencia === referencia);
        if (acao !== 'cadastrar' && encontrados.length !== 1) return;
        const registro = encontrados[0], d = registro?.dados || {};
        sessao = { acao, referencia, id: registro?.id ?? crypto.randomUUID(), versao: registro?.versao || 0,
            op: 'encargo.' + crypto.randomUUID(), acionador };
        const campo = (id, rotulo, valor = '', tipo = 'text') => `<div class="form-group"><label for="encargo-${id}">${rotulo}</label><input id="encargo-${id}" name="${id}" type="${tipo}" value="${escapar(valor)}" required></div>`;
        const select = (id, rotulo, opcoes, valor = '') => `<div class="form-group"><label for="encargo-${id}">${rotulo}</label><select id="encargo-${id}" name="${id}">${opcoes.map(([v, n]) => `<option value="${escapar(v)}" ${v === valor ? 'selected' : ''}>${escapar(n)}</option>`).join('')}</select></div>`;
        const editar = ['cadastrar', 'editar'].includes(acao);
        let campos = '';
        if (editar) {
            campos = campo('titulo', 'Título', d.titulo) + select('tipo', 'Tipo', ['imposto', 'comissao', 'bv', 'bonificacao'].map(x => [x, x]), d.tipo || 'imposto');
            const specs = [['beneficiarioReferencia', 'Beneficiário (obrigatório exceto imposto)', 'fornecedores', 'fornecedor', 'ativa'],
                ['propostaReferencia', 'Proposta', 'propostas', 'proposta'], ['locacaoReferencia', 'Locação', 'locacoes', 'locacao'],
                ['categoriaFinanceiraReferencia', 'Categoria financeira', 'categoriasFinanceiras', 'categoria-financeira', 'ativa'],
                ['centroCustoReferencia', 'Centro de custo', 'centrosCusto', 'centro-custo', 'ativo']];
            for (const [id, nome, colecao, prefixo, situacao] of specs) campos += select(id, nome,
                [['', 'Não vinculado'], ...(estado[colecao] || []).filter(x => (!situacao || x.situacao === situacao)
                    && (colecao !== 'categoriasFinanceiras' || ['despesa', 'ambas'].includes(x.naturezaPermitida)))
                    .map(x => [ref(prefixo, x.id), `${x.codigo || x.nome || x.evento?.nome || 'Registro'} · ${ref(prefixo, x.id)}`])], d[id]);
            campos += select('modalidade', 'Modalidade', [['fixa', 'Valor fixo'], ['percentual', 'Percentual sobre base informada']], d.modalidade || 'fixa')
                + campo('baseDescricao', 'Descrição explícita da base', d.baseDescricao)
                + campo('valorCentavos', 'Valor informado/estimado (R$)', EncargosFinanceiros.formatarDecimal(d.valorCentavos ?? 0, 2))
                + campo('baseCentavos', 'Base informada (R$; zero no valor fixo)', EncargosFinanceiros.formatarDecimal(d.baseCentavos ?? 0, 2))
                + campo('percentualEscalado', 'Percentual (%; até quatro casas; zero no fixo)', EncargosFinanceiros.formatarDecimal(d.percentualEscalado ?? 0, 4))
                + campo('condicoes', 'Condições', d.condicoes) + campo('vigenciaInicio', 'Vigência inicial', d.vigenciaInicio || hoje(), 'date')
                + campo('vigenciaFim', 'Vigência final (opcional)', d.vigenciaFim, 'date').replace(' required', '');
        } else campos = `<p>${escapar(registro.dados.titulo)} · ${escapar(registro.situacao)} · versão ${registro.versao}</p>
            <pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapar(JSON.stringify({ dados: registro.dados, snapshotsAprovados: registro.snapshotsAprovados, historico: registro.historico }, null, 2))}</pre>`;
        dialogo.innerHTML = `<form><h3 id="encargoTitulo">${escapar(acao)} condição</h3><p id="encargoDescricao">Registro documental, sem Conta a Pagar ou pagamento. A persistência local está bloqueada por falta de exclusão entre escritores. Aprovação e rejeição exigem autoridade verificável indisponível nesta versão.</p>
            ${campos}${acao !== 'consultar' ? campo('motivo', 'Motivo obrigatório') : ''}
            <div id="encargoErro" class="validation-message" role="alert"></div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" data-fechar-encargo>Fechar sem salvar</button>
            ${acao !== 'consultar' ? '<button type="submit" class="btn btn-primary">Confirmar</button>' : ''}</div></form>`;
        dialogo.showModal(); (dialogo.querySelector('input,select,button'))?.focus();
    }
    function salvar() {
        if (ocupado || !sessao) return;
        const form = dialogo.querySelector('form'); if (!form.reportValidity()) return;
        const get = k => form.elements.namedItem(k)?.value || '';
        const falha = (mensagem, campo = 'motivo') => {
            const erro = document.getElementById('encargoErro'); erro.textContent = mensagem;
            const alvo = form.elements.namedItem(campo); alvo?.setAttribute('aria-invalid', 'true');
            alvo?.setAttribute('aria-describedby', 'encargoErro'); alvo?.focus();
        };
        const usuario = typeof obterEmailSessao === 'function' ? obterEmailSessao() : '';
        if (!usuario) return falha('Uma sessão identificada por e-mail é necessária. Não utilize identidade inventada.');
        let dados = null;
        if (['cadastrar', 'editar'].includes(sessao.acao)) {
            dados = {};
            for (const k of ['tipo', 'titulo', 'beneficiarioReferencia', 'propostaReferencia', 'locacaoReferencia', 'categoriaFinanceiraReferencia',
                'centroCustoReferencia', 'modalidade', 'baseDescricao', 'condicoes', 'vigenciaInicio', 'vigenciaFim']) dados[k] = get(k);
            for (const k of ['valorCentavos', 'baseCentavos', 'percentualEscalado']) {
                const v = EncargosFinanceiros.lerDecimal(get(k), k === 'percentualEscalado' ? 4 : 2);
                if (v === null) return falha('Informe um decimal não negativo, sem separador de milhar e dentro do limite seguro.', k);
                dados[k] = v;
            }
        }
        const agora = new Date().toISOString(), entrada = EncargosFinanceiros.criarEntrada(sessao.acao, sessao.id, sessao.referencia,
            sessao.versao, JSON.stringify(dados), get('motivo'), sessao.op, agora, hoje(), usuario, '12.6', Date.now());
        if (!entrada) return falha('Confira os campos, a vigência e o cálculo percentual informado.');
        ocupado = true;
        try {
            const resultado = executarEncargoFinanceiroTransacional(entrada, criarDependenciasExecutorEncargos({ armazenamento: localStorage }));
            if (!resultado.ok) return falha(resultado.codigo === 'APROVACAO_SEGURA_INDISPONIVEL'
                ? 'Aprovação e rejeição indisponíveis: não há identidade e autorização verificáveis.'
                : resultado.codigo === 'PERSISTENCIA_ENCARGOS_INDISPONIVEL'
                    ? 'Nada foi salvo. O armazenamento local não garante exclusão entre escritores; a persistência de encargos está indisponível.'
                    : resultado.requerRecuperacao ? 'Recuperação explícita necessária; não tente sobrescrever o armazenamento.'
                        : 'Operação bloqueada: confira permissão, vínculos e versão.');
            ocupado = false; renderEncargosFinanceiros(); fechar();
            if (resultado.efeitos.sincronizar && typeof sincronizar === 'function') sincronizar();
        } finally { ocupado = false; }
    }
    window.renderEncargosFinanceiros = renderEncargosFinanceiros;
})();
