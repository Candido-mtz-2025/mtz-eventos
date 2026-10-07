// Fundação visual de fornecedores e contas a pagar.
(() => {
    'use strict';

    let sessaoFornecedor = null;
    let sessaoConta = null;
    let sessaoPagamento = null;
    let sessaoEstorno = null;
    let sessaoOperacaoAdministrativa = null;
    let sessaoConciliacao = null;
    let acionadorOperacaoAdministrativa = null;
    let acionadorModal = null;
    let emProcessamento = false;
    const modaisRegistrados = new Set();

    function hojeLocalPagar() {
        const data = new Date();
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    }

    function agoraIsoPagar() {
        return new Date().toISOString();
    }

    function usuarioPagar() {
        if (typeof obterUsuarioAtualNomeOuEmail === 'function') return obterUsuarioAtualNomeOuEmail();
        return 'Sistema';
    }

    function operacaoIdPagar(prefixo) {
        const aleatorio = typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID().toLowerCase()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return `${prefixo}.${aleatorio}`;
    }

    function escaparPagar(valor) {
        if (typeof valor !== 'string' && typeof valor !== 'number') return '';
        return String(valor).replace(/[&<>'"]/g, (caractere) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[caractere]);
    }

    function normalizarBuscaPagar(valor) {
        return typeof valor === 'string'
            ? valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            : '';
    }

    function formatarCentavosPagar(valor) {
        return typeof formatarCentavosMonetarios === 'function'
            ? (formatarCentavosMonetarios(valor) || 'Valor indisponível')
            : 'Valor indisponível';
    }

    function parseCentavosPagar(texto, permitirVazio = false) {
        if (typeof texto !== 'string') return null;
        if (permitirVazio && texto === '') return 0;
        const partes = texto.match(/^(0|[1-9]\d*)(?:([.,])(\d{1,2}))?$/);
        if (!partes) return null;
        const centavos = (BigInt(partes[1]) * 100n) + BigInt((partes[3] || '').padEnd(2, '0'));
        return centavos <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(centavos) : null;
    }

    function metadadosPagar(agora) {
        return {
            versao: typeof STORAGE_VERSION === 'string' ? STORAGE_VERSION : '12.0',
            data: agora,
            ultimaEdicao: Date.now()
        };
    }

    function estadoPagar() {
        return typeof obterEstadoMemoriaAtual === 'function' ? obterEstadoMemoriaAtual() : null;
    }

    function fornecedoresValidos() {
        const estado = estadoPagar();
        const contagens = new Map();
        (Array.isArray(estado?.fornecedores) ? estado.fornecedores : []).forEach((item) => {
            const referencia = typeof criarReferenciaTipadaPagar === 'function'
                ? criarReferenciaTipadaPagar('fornecedor', item?.id) : '';
            if (referencia && item?.fornecedorReferencia === referencia) {
                contagens.set(referencia, (contagens.get(referencia) || 0) + 1);
            }
        });
        return (Array.isArray(estado?.fornecedores) ? estado.fornecedores : [])
            .filter((item) => item?.situacao === 'ativa' && contagens.get(item.fornecedorReferencia) === 1)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
                || a.fornecedorReferencia.localeCompare(b.fornecedorReferencia));
    }

    function definirErroPagar(modalId, mensagem, campo) {
        const modal = document.getElementById(modalId);
        const erro = modal?.querySelector('[data-pagar-erro]');
        modal?.querySelectorAll('[aria-invalid="true"]').forEach((elemento) => {
            elemento.removeAttribute('aria-invalid');
            const ids = (elemento.getAttribute('aria-describedby') || '').split(/\s+/)
                .filter((id) => id && id !== erro?.id);
            if (ids.length) elemento.setAttribute('aria-describedby', ids.join(' '));
            else elemento.removeAttribute('aria-describedby');
        });
        if (erro) {
            erro.textContent = mensagem || '';
            erro.hidden = !mensagem;
        }
        if (campo && mensagem) {
            campo.setAttribute('aria-invalid', 'true');
            const ids = new Set((campo.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
            ids.add(erro.id);
            campo.setAttribute('aria-describedby', [...ids].join(' '));
            campo.focus({ preventScroll: true });
        }
    }

    function registrarModalPagar(modalId, fechar, confirmar = null) {
        if (modaisRegistrados.has(modalId)) return;
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modaisRegistrados.add(modalId);
        modal.addEventListener('click', (evento) => {
            if (evento.target === modal && !emProcessamento) fechar();
        });
        modal.addEventListener('keydown', (evento) => {
            if (!modal.classList.contains('active')) return;
            if (evento.key === 'Escape' && !emProcessamento) {
                evento.preventDefault();
                evento.stopPropagation();
                fechar();
                return;
            }
            if (evento.key !== 'Tab') return;
            const focaveis = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
                .filter((elemento) => !elemento.hidden && elemento.getClientRects().length > 0);
            if (!focaveis.length) { evento.preventDefault(); modal.focus(); return; }
            const primeiro = focaveis[0];
            const ultimo = focaveis[focaveis.length - 1];
            if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
            else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
        });
        const formulario = modal.querySelector('form');
        if (formulario && typeof confirmar === 'function') {
            formulario.addEventListener('submit', (evento) => {
                evento.preventDefault();
                confirmar();
            });
        }
    }

    function abrirModalPagar(id, focoId) {
        const modal = document.getElementById(id);
        if (!modal) return false;
        acionadorModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => setTimeout(() => {
            document.getElementById(focoId)?.focus({ preventScroll: true });
        }, 0));
        return true;
    }

    function fecharModalPagar(id) {
        const modal = document.getElementById(id);
        if (!modal || emProcessamento) return false;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        definirErroPagar(id, '');
        const retorno = acionadorModal;
        acionadorModal = null;
        if (retorno?.isConnected) retorno.focus({ preventScroll: true });
        return true;
    }

    function abrirCadastroFornecedor() {
        if (sessaoFornecedor || sessaoConta || sessaoOperacaoAdministrativa
            || sessaoConciliacao || emProcessamento) return false;
        if (typeof validarPermissao === 'function'
            && !validarPermissao('cadastrar_fornecedor', 'Você não possui permissão para cadastrar fornecedores.')) return false;
        sessaoFornecedor = { operacaoId: operacaoIdPagar('fornecedor') };
        document.getElementById('formFornecedorPagar')?.reset();
        registrarModalPagar('modalFornecedorPagar', fecharCadastroFornecedor, salvarFornecedorPagar);
        return abrirModalPagar('modalFornecedorPagar', 'fornecedorPagarNome');
    }

    function fecharCadastroFornecedor() {
        if (!fecharModalPagar('modalFornecedorPagar')) return false;
        sessaoFornecedor = null;
        return true;
    }

    function executarEfeitosPagar(resultado) {
        if (resultado?.efeitos?.renderizar) {
            renderContasPagar();
            if (typeof renderFluxoCaixa === 'function') renderFluxoCaixa();
        }
        if (resultado?.efeitos?.sincronizar && typeof sincronizar === 'function') sincronizar('salvar');
        if (resultado?.avisos?.some((aviso) => aviso.codigo === 'METADADO_SYNC_PENDENTE')
            && typeof mostrarToast === 'function') mostrarToast('Registro confirmado; sincronização pendente.', 'info');
    }

    function salvarFornecedorPagar() {
        if (!sessaoFornecedor || emProcessamento) return false;
        if (typeof validarPermissao === 'function'
            && !validarPermissao('cadastrar_fornecedor', 'Você não possui permissão para cadastrar fornecedores.')) return false;
        const nome = document.getElementById('fornecedorPagarNome');
        if (!nome?.value.trim()) { definirErroPagar('modalFornecedorPagar', 'Informe o nome do fornecedor.', nome); return false; }
        const agora = agoraIsoPagar();
        const id = `fornecedor-${sessaoFornecedor.operacaoId.slice('fornecedor.'.length)}`;
        const metadados = metadadosPagar(agora);
        if (typeof criarEntradaCadastroFornecedorPagar !== 'function'
            || typeof executarCadastroFornecedorTransacional !== 'function'
            || typeof criarDependenciasExecutorContasPagar !== 'function') return false;
        const entrada = criarEntradaCadastroFornecedorPagar(
            id,
            document.getElementById('fornecedorPagarTipo')?.value,
            nome.value,
            document.getElementById('fornecedorPagarFantasia')?.value || '',
            document.getElementById('fornecedorPagarDocumento')?.value || '',
            document.getElementById('fornecedorPagarTelefone')?.value || '',
            document.getElementById('fornecedorPagarEmail')?.value || '',
            document.getElementById('fornecedorPagarEndereco')?.value || '',
            document.getElementById('fornecedorPagarObservacoes')?.value || '',
            document.getElementById('fornecedorPagarSituacao')?.value,
            sessaoFornecedor.operacaoId,
            agora,
            agora,
            hojeLocalPagar(),
            usuarioPagar(),
            metadados.versao,
            metadados.data,
            metadados.ultimaEdicao
        );
        if (!entrada) return false;
        emProcessamento = true;
        try {
            const resultado = executarCadastroFornecedorTransacional(
                entrada, criarDependenciasExecutorContasPagar({ armazenamento: localStorage }));
            executarEfeitosPagar(resultado);
            if (resultado.ok && ['FORNECEDOR_CRIADO', 'OPERACAO_JA_CONCLUIDA'].includes(resultado.codigo)) {
                emProcessamento = false;
                fecharCadastroFornecedor();
                if (typeof mostrarToast === 'function') mostrarToast('Fornecedor cadastrado.');
                return true;
            }
            definirErroPagar('modalFornecedorPagar', resultado.requerRecuperacao
                ? 'A operação exige recuperação explícita antes de continuar.'
                : 'Não foi possível cadastrar o fornecedor.', nome);
            return false;
        } finally { emProcessamento = false; }
    }

    function popularVinculosContaPagar() {
        const popular = (id, itens, prefixo, rotulo) => {
            const select = document.getElementById(id);
            if (!select) return;
            select.replaceChildren(new Option(`Sem ${rotulo}`, ''));
            const candidatos = (Array.isArray(itens) ? itens : []).map((item) => ({
                item,
                referencia: criarReferenciaTipadaPagar(prefixo, item?.id)
            }));
            const contagens = new Map();
            candidatos.forEach(({ referencia }) => {
                if (referencia) contagens.set(referencia, (contagens.get(referencia) || 0) + 1);
            });
            candidatos.forEach(({ item, referencia }) => {
                if (referencia && contagens.get(referencia) === 1) {
                    select.append(new Option(item.nome || item.eventoNome || item.codigo || String(item.id), referencia));
                }
            });
        };
        const estado = estadoPagar();
        popular('contaPagarLocacao', estado?.locacoes, 'locacao', 'locação');
        popular('contaPagarProposta', estado?.propostas, 'proposta', 'proposta');
    }

    function abrirCriacaoContaPagar() {
        if (sessaoFornecedor || sessaoConta || sessaoOperacaoAdministrativa
            || sessaoConciliacao || emProcessamento) return false;
        if (typeof validarPermissao === 'function'
            && !validarPermissao('criar_conta_pagar', 'Você não possui permissão para criar contas a pagar.')) return false;
        const fornecedores = fornecedoresValidos();
        if (!fornecedores.length) {
            if (typeof mostrarToast === 'function') mostrarToast('Cadastre um fornecedor ativo antes de criar a conta.', 'erro');
            return false;
        }
        sessaoConta = { operacaoId: operacaoIdPagar('conta-pagar') };
        document.getElementById('formContaPagar')?.reset();
        const select = document.getElementById('contaPagarFornecedor');
        select.replaceChildren(new Option('Selecione...', ''));
        fornecedores.forEach((item) => select.append(new Option(item.nome, item.fornecedorReferencia)));
        popularVinculosContaPagar();
        document.getElementById('contaPagarEmissao').value = hojeLocalPagar();
        document.getElementById('contaPagarVencimento').value = hojeLocalPagar();
        document.getElementById('contaPagarParcelas').value = '1';
        registrarModalPagar('modalContaPagar', fecharCriacaoContaPagar, salvarContaPagar);
        return abrirModalPagar('modalContaPagar', 'contaPagarFornecedor');
    }

    function fecharCriacaoContaPagar() {
        if (!fecharModalPagar('modalContaPagar')) return false;
        sessaoConta = null;
        return true;
    }

    function salvarContaPagar() {
        if (!sessaoConta || emProcessamento) return false;
        if (typeof validarPermissao === 'function'
            && !validarPermissao('criar_conta_pagar', 'Você não possui permissão para criar contas a pagar.')) return false;
        const fornecedor = document.getElementById('contaPagarFornecedor');
        const descricao = document.getElementById('contaPagarDescricao');
        const valor = document.getElementById('contaPagarValor');
        const originalCentavos = parseCentavosPagar(valor?.value || '');
        const previstoTexto = document.getElementById('contaPagarPrevisto')?.value || '';
        const previstoCentavos = previstoTexto === '' ? originalCentavos : parseCentavosPagar(previstoTexto);
        const quantidadeTexto = document.getElementById('contaPagarParcelas')?.value || '';
        const quantidadeParcelas = /^\d+$/.test(quantidadeTexto) ? Number(quantidadeTexto) : NaN;
        let campoErro = !fornecedor?.value ? fornecedor : !descricao?.value.trim() ? descricao
            : originalCentavos === null || originalCentavos <= 0 ? valor
                : previstoCentavos === null ? document.getElementById('contaPagarPrevisto')
                    : !Number.isSafeInteger(quantidadeParcelas) || quantidadeParcelas <= 0
                        || quantidadeParcelas > originalCentavos ? document.getElementById('contaPagarParcelas')
                        : null;
        if (campoErro) { definirErroPagar('modalContaPagar', 'Confira os campos obrigatórios e os valores informados.', campoErro); return false; }
        const agora = agoraIsoPagar();
        const metadados = metadadosPagar(agora);
        if (typeof criarEntradaCriacaoContaPagar !== 'function') return false;
        const entrada = criarEntradaCriacaoContaPagar(
            undefined,
            fornecedor.value,
            document.getElementById('contaPagarProposta')?.value || '',
            document.getElementById('contaPagarLocacao')?.value || '',
            '',
            document.getElementById('contaPagarCategoria')?.value || '',
            document.getElementById('contaPagarCentroCusto')?.value || '',
            descricao.value,
            document.getElementById('contaPagarOrigem')?.value || '',
            originalCentavos,
            previstoCentavos,
            quantidadeParcelas,
            document.getElementById('contaPagarEmissao')?.value || '',
            document.getElementById('contaPagarVencimento')?.value || '',
            sessaoConta.operacaoId,
            agora,
            agora,
            hojeLocalPagar(),
            usuarioPagar(),
            metadados.versao,
            metadados.data,
            metadados.ultimaEdicao
        );
        if (!entrada) return false;
        emProcessamento = true;
        try {
            const resultado = executarCriacaoContaPagarTransacional(
                entrada, criarDependenciasExecutorContasPagar({ armazenamento: localStorage }));
            executarEfeitosPagar(resultado);
            if (resultado.ok && ['CONTA_PAGAR_CRIADA', 'OPERACAO_JA_CONCLUIDA'].includes(resultado.codigo)) {
                emProcessamento = false;
                fecharCriacaoContaPagar();
                if (typeof mostrarToast === 'function') mostrarToast('Conta a pagar criada.');
                return true;
            }
            definirErroPagar('modalContaPagar', resultado.requerRecuperacao
                ? 'A operação exige recuperação explícita antes de continuar.'
                : 'Não foi possível criar a conta.', fornecedor);
            return false;
        } finally { emProcessamento = false; }
    }

    function renderContasPagar() {
        const corpo = document.getElementById('tblContasPagar');
        if (!corpo || typeof obterProjecaoContasPagar !== 'function') return;
        const permitido = typeof temPermissao !== 'function' || temPermissao('visualizar_contas_pagar');
        document.getElementById('contasPagarConteudo').hidden = !permitido;
        document.getElementById('contasPagarPermissao').hidden = permitido;
        if (!permitido) return;
        const projecao = obterProjecaoContasPagar(estadoPagar(), hojeLocalPagar());
        const contas = projecao.contas || [];
        const busca = normalizarBuscaPagar(document.getElementById('buscaContasPagar')?.value || '');
        const situacao = document.getElementById('filtroContaPagarSituacao')?.value || 'todos';
        const fornecedor = document.getElementById('filtroContaPagarFornecedor');
        const atual = fornecedor?.value || '';
        if (fornecedor) {
            fornecedor.replaceChildren(new Option('Todos os fornecedores', ''));
            fornecedoresValidos().forEach((item) => fornecedor.append(new Option(item.nome, item.fornecedorReferencia)));
            fornecedor.value = [...fornecedor.options].some((opcao) => opcao.value === atual) ? atual : '';
        }
        const filtradas = contas.filter((item) => {
            if (situacao !== 'todos' && item.situacao !== situacao) return false;
            if (fornecedor?.value && item.conta?.fornecedorReferencia !== fornecedor.value) return false;
            return !busca || normalizarBuscaPagar(`${item.fornecedor?.nome || ''} ${item.conta?.descricao || ''} ${item.conta?.categoria || ''} ${item.referencia}`).includes(busca);
        }).sort((a, b) => (a.proximoVencimento || '9999-99-99').localeCompare(b.proximoVencimento || '9999-99-99')
            || a.referencia.localeCompare(b.referencia));
        const totais = projecao.totais;
        [['capKpiTotal','totalCentavos'],['capKpiPago','pagoCentavos'],['capKpiAberto','abertoCentavos'],
            ['capKpiVencido','vencidoCentavos'],['capKpiProximo','proximoCentavos']].forEach(([id, chave]) => {
            const elemento = document.getElementById(id);
            if (elemento) elemento.textContent = totais ? formatarCentavosPagar(totais[chave]) : 'Valor indisponível';
        });
        corpo.innerHTML = filtradas.length ? filtradas.map((item) => item.bloqueada
            ? `<tr><td colspan="8"><span class="badge badge-danger">${escaparPagar(item.estado)}</span> Conta bloqueada por identidade ou estrutura inválida.</td></tr>`
            : `<tr><td>${escaparPagar(item.fornecedor?.nome || 'Fornecedor indisponível')}</td>
                <td>${escaparPagar(item.conta.descricao)}</td><td>${escaparPagar(item.conta.categoria)}</td>
                <td>${escaparPagar(item.proximoVencimento || '-')}</td><td>${formatarCentavosPagar(item.totalCentavos)}</td>
                <td>${formatarCentavosPagar(item.saldoCentavos)}</td><td><span class="badge badge-info">${escaparPagar(item.situacaoAdministrativa)}</span> <span class="badge">${escaparPagar(item.situacaoFinanceira)}</span></td>
                <td><button type="button" class="btn btn-sm btn-info" data-action="abrirDetalhesContaPagar" data-arg="${escaparPagar(item.referencia)}" aria-label="Ver detalhes da conta"><i class="bi bi-list-check"></i></button></td></tr>`).join('')
            : '<tr><td colspan="8">Nenhuma conta a pagar encontrada.</td></tr>';
    }

    function abrirDetalhesContaPagar(referencia) {
        if (typeof referencia !== 'string') return false;
        const projecao = obterProjecaoContasPagar(estadoPagar(), hojeLocalPagar());
        const encontrados = (projecao.contas || []).filter((item) => !item.bloqueada && item.referencia === referencia);
        if (encontrados.length !== 1) return false;
        const item = encontrados[0];
        const modal = document.getElementById('modalDetalhesContaPagar');
        document.getElementById('detalhesContaPagarResumo').textContent = `${item.fornecedor.nome} · ${item.conta.descricao} · ${formatarCentavosPagar(item.totalCentavos)}`;
        document.getElementById('detalhesContaPagarSituacoes').innerHTML
            = `<span><small>Administrativa</small><strong>${escaparPagar(item.situacaoAdministrativa)}</strong></span>
                <span><small>Financeira</small><strong>${escaparPagar(item.situacaoFinanceira)}</strong></span>`;
        const contaAtiva = item.conta.situacaoAdministrativa === 'ativa';
        const podeCancelar = typeof temPermissao !== 'function' || temPermissao('cancelar_conta_pagar');
        const podeEncerrar = typeof temPermissao !== 'function' || temPermissao('encerrar_conta_pagar');
        const argumentoConta = (acao) => escaparPagar(encodeURIComponent(JSON.stringify([
            acao, item.referencia, ''
        ])));
        document.getElementById('detalhesContaPagarAcoes').innerHTML = contaAtiva
            ? `${podeCancelar && item.conta.saldoCentavos > 0
                ? `<button type="button" class="btn btn-warning" data-action="abrirOperacaoAdministrativaContaPagar" data-arg="${argumentoConta('cancelar_conta_pagar')}">Cancelar conta</button>` : ''}
                ${podeEncerrar
                ? `<button type="button" class="btn btn-secondary" data-action="abrirOperacaoAdministrativaContaPagar" data-arg="${argumentoConta('encerrar_conta_pagar')}">Encerrar conta</button>` : ''}` : '';
        const podePagar = typeof temPermissao !== 'function' || temPermissao('pagar_conta');
        const podeAlterarVencimento = typeof temPermissao !== 'function'
            || temPermissao('alterar_vencimento_conta_pagar');
        document.getElementById('detalhesContaPagarParcelas').innerHTML = item.conta.parcelas.map((parcela) => {
            const situacao = parcela.saldoCentavos === 0 ? 'paga'
                : parcela.pagoCentavos > 0 ? 'parcial'
                    : parcela.vencimento < hojeLocalPagar() ? 'vencida' : 'pendente';
            const situacaoAdministrativa = parcela.situacaoAdministrativa || 'ativa';
            const argumento = encodeURIComponent(JSON.stringify([item.referencia, parcela.parcelaReferencia]));
            const argumentoAdministrativo = (acao) => escaparPagar(encodeURIComponent(JSON.stringify([
                acao, item.referencia, parcela.parcelaReferencia
            ])));
            const acoes = [];
            if (podePagar && contaAtiva && situacaoAdministrativa === 'ativa' && parcela.saldoCentavos > 0) {
                acoes.push(`<button type="button" class="btn btn-sm btn-primary" data-action="abrirPagamentoContaPagar" data-arg="${escaparPagar(argumento)}">Registrar pagamento</button>`);
            }
            if (podeAlterarVencimento && contaAtiva && situacaoAdministrativa === 'ativa'
                && parcela.saldoCentavos > 0) {
                acoes.push(`<button type="button" class="btn btn-sm btn-secondary" data-action="abrirOperacaoAdministrativaContaPagar" data-arg="${argumentoAdministrativo('alterar_vencimento_conta_pagar')}">Alterar vencimento</button>`);
            }
            if (podeCancelar && contaAtiva && situacaoAdministrativa === 'ativa'
                && parcela.saldoCentavos > 0) {
                acoes.push(`<button type="button" class="btn btn-sm btn-warning" data-action="abrirOperacaoAdministrativaContaPagar" data-arg="${argumentoAdministrativo('cancelar_parcela_conta_pagar')}">Cancelar parcela</button>`);
            }
            return (
            `<tr><td>${parcela.numero}/${parcela.totalParcelas}</td><td>${escaparPagar(parcela.vencimento)}</td>
            <td>${formatarCentavosPagar(parcela.originalCentavos)}</td><td>${formatarCentavosPagar(parcela.pagoCentavos)}</td>
            <td>${formatarCentavosPagar(parcela.saldoCentavos)}</td><td><span class="badge badge-info">${escaparPagar(situacaoAdministrativa)}</span> ${escaparPagar(situacao)}</td><td><div class="contas-pagar-acoes-parcela">${acoes.join('')}</div></td></tr>`);
        }).join('');
        const podeEstornar = typeof temPermissao !== 'function'
            || temPermissao('estornar_pagamento_conta');
        const podeConciliar = typeof temPermissao !== 'function'
            || temPermissao('conciliar_pagamento_conta_pagar');
        const podeDesconsiderar = typeof temPermissao !== 'function'
            || temPermissao('desconsiderar_conciliacao_conta_pagar');
        const estadoAtual = estadoPagar();
        document.getElementById('detalhesContaPagarPagamentos').innerHTML = item.conta.parcelas
            .flatMap((parcela) => parcela.pagamentos.map((pagamento) => {
                const estornos = (Array.isArray(parcela.estornos) ? parcela.estornos : [])
                    .filter((estorno) => estorno.pagamentoOriginalReferencia === pagamento.pagamentoReferencia);
                const estornado = estornos.reduce((total, estorno) => total + estorno.valorEstornoCentavos, 0);
                const disponivel = pagamento.valorPagoCentavos - estornado;
                const argumento = encodeURIComponent(JSON.stringify([
                    item.referencia, parcela.parcelaReferencia, pagamento.pagamentoReferencia
                ]));
                const acao = podeEstornar && item.conta.situacaoAdministrativa === 'ativa'
                    && (parcela.situacaoAdministrativa || 'ativa') === 'ativa' && disponivel > 0
                    ? `<button type="button" class="btn btn-sm btn-warning" data-action="abrirEstornoPagamentoContaPagar" data-arg="${escaparPagar(argumento)}">Estornar</button>` : '';
                const conciliacao = typeof obterSituacaoConciliacaoPagamentoPagar === 'function'
                    ? obterSituacaoConciliacaoPagamentoPagar(estadoAtual, item.referencia,
                        parcela.parcelaReferencia, pagamento.pagamentoReferencia)
                    : { estado: 'invalida', conciliacao: null };
                const situacaoConciliacao = disponivel === 0
                    ? 'desconsiderada' : conciliacao.estado;
                const acaoConciliar = podeConciliar && item.conta.situacaoAdministrativa === 'ativa'
                    && (parcela.situacaoAdministrativa || 'ativa') === 'ativa'
                    && disponivel > 0 && ['pendente', 'desconsiderada'].includes(situacaoConciliacao)
                    ? `<button type="button" class="btn btn-sm btn-secondary" data-action="abrirConciliacaoPagamentoPagar" data-arg="${escaparPagar(argumento)}">Conciliar</button>` : '';
                const acaoDesconsiderar = podeDesconsiderar && conciliacao.conciliacao
                    ? `<button type="button" class="btn btn-sm btn-secondary" data-action="abrirDesconsideracaoConciliacaoPagamentoPagar" data-arg="${escaparPagar(argumento)}">Desconsiderar conciliação</button>` : '';
                const detalhesConciliacao = conciliacao.conciliacao
                    ? `<dl class="contas-pagar-conciliacao-resumo"><div><dt>Conciliação</dt><dd>${escaparPagar(situacaoConciliacao)}</dd></div><div><dt>Valor bancário</dt><dd>${formatarCentavosPagar(conciliacao.conciliacao.valorBancarioCentavos)}</dd></div><div><dt>Diferença</dt><dd>${formatarCentavosPagar(Math.abs(conciliacao.conciliacao.diferencaCentavos))}</dd></div><div><dt>Data bancária</dt><dd>${escaparPagar(conciliacao.conciliacao.dataBancaria)}</dd></div><div><dt>Responsável</dt><dd>${escaparPagar(conciliacao.conciliacao.responsavel)}</dd></div></dl>`
                    : `<p class="muted-note">Conciliação: ${escaparPagar(situacaoConciliacao)}</p>`;
                const historicoConciliacao = conciliacao.estado === 'invalida' ? '' : (Array.isArray(
                    estadoAtual?.conciliacoesPagamentosPagar)
                    ? estadoAtual.conciliacoesPagamentosPagar : []).filter((registro) => (
                    registro?.contaPagarReferencia === item.referencia
                    && registro.parcelaReferencia === parcela.parcelaReferencia
                    && registro.pagamentoReferencia === pagamento.pagamentoReferencia))
                    .sort((a, b) => a.registradoEm.localeCompare(b.registradoEm))
                    .map((registro) => registro.tipo === 'conciliacao'
                        ? `<li>${escaparPagar(registro.registradoEm)} · ${escaparPagar(registro.situacao)} · ${formatarCentavosPagar(registro.valorBancarioCentavos)} · ${escaparPagar(registro.responsavel)}</li>`
                        : `<li>${escaparPagar(registro.registradoEm)} · desconsiderada · ${escaparPagar(registro.motivo)} · ${escaparPagar(registro.responsavel)}</li>`).join('');
                const listaEstornos = estornos.length
                    ? `<ul>${estornos.map((estorno) => `<li>${escaparPagar(estorno.dataEstorno)} · ${formatarCentavosPagar(estorno.valorEstornoCentavos)} · ${escaparPagar(estorno.motivo)}</li>`).join('')}</ul>`
                    : '<span class="muted-note">Sem estornos.</span>';
                return `<article class="contas-pagar-pagamento-item">
                    <div><strong>${escaparPagar(pagamento.dataPagamento)} · ${formatarCentavosPagar(pagamento.valorPagoCentavos)}</strong>
                    <span>${escaparPagar(pagamento.formaPagamento)} · ${escaparPagar(pagamento.responsavel)}</span></div>
                    <dl><div><dt>Pago</dt><dd>${formatarCentavosPagar(pagamento.valorPagoCentavos)}</dd></div>
                    <div><dt>Estornado</dt><dd>${formatarCentavosPagar(estornado)}</dd></div>
                    <div><dt>Disponível</dt><dd>${formatarCentavosPagar(disponivel)}</dd></div></dl>
                    <div class="inline-chip-row">${acao}${acaoConciliar}${acaoDesconsiderar}</div>
                    ${detalhesConciliacao}${historicoConciliacao
                        ? `<ul aria-label="Histórico da conciliação">${historicoConciliacao}</ul>` : ''}
                    ${listaEstornos}</article>`;
            })).join('') || '<p>Sem pagamentos.</p>';
        document.getElementById('detalhesContaPagarHistorico').textContent = (item.conta.historico || [])
            .map((registro) => {
                const vencimento = registro.acao === 'alterar_vencimento_conta_pagar'
                    ? ` · ${registro.vencimentoAnterior} → ${registro.vencimentoNovo}` : '';
                const motivo = registro.motivo ? ` · ${registro.motivo}` : '';
                return `${registro.data} · ${registro.acao}${vencimento}${motivo} · ${registro.usuario || registro.responsavel}`;
            }).join('\n') || 'Sem histórico.';
        registrarModalPagar('modalDetalhesContaPagar', fecharDetalhesContaPagar);
        return abrirModalPagar('modalDetalhesContaPagar', 'fecharDetalhesContaPagarBotao');
    }

    function fecharDetalhesContaPagar() {
        return fecharModalPagar('modalDetalhesContaPagar');
    }

    function resolverArgumentoPagamentoPagar(argumento) {
        if (typeof argumento !== 'string') return null;
        try {
            const dados = JSON.parse(decodeURIComponent(argumento));
            if (!Array.isArray(dados) || dados.length !== 2
                || dados.some((item) => typeof item !== 'string' || !item)) return null;
            return { contaReferencia: dados[0], parcelaReferencia: dados[1] };
        } catch (_erro) { return null; }
    }

    function abrirPagamentoContaPagar(argumento) {
        if (sessaoPagamento || sessaoOperacaoAdministrativa || sessaoConciliacao
            || emProcessamento) return false;
        if (typeof validarPermissao === 'function'
            && !validarPermissao('pagar_conta', 'Você não possui permissão para pagar contas.')) return false;
        const alvo = resolverArgumentoPagamentoPagar(argumento);
        if (!alvo || typeof obterProjecaoContaPagarPorReferencia !== 'function') return false;
        const resolvida = obterProjecaoContaPagarPorReferencia(
            alvo.contaReferencia, estadoPagar(), hojeLocalPagar());
        const conta = resolvida?.conta?.conta;
        if (!resolvida?.ok || !conta || conta.situacaoAdministrativa !== 'ativa') return false;
        const parcelas = conta.parcelas.filter((item) => item?.parcelaReferencia === alvo.parcelaReferencia);
        if (parcelas.length !== 1 || parcelas[0].saldoCentavos <= 0
            || (parcelas[0].situacaoAdministrativa || 'ativa') !== 'ativa') return false;
        const parcela = parcelas[0];
        sessaoPagamento = { ...alvo, operacaoId: operacaoIdPagar('pagamento-conta-pagar') };
        document.getElementById('formPagamentoContaPagar')?.reset();
        document.getElementById('pagamentoContaPagarResumo').textContent = `${conta.descricao} · Parcela ${parcela.numero}/${parcela.totalParcelas}`;
        document.getElementById('pagamentoContaPagarSaldo').textContent = formatarCentavosPagar(parcela.saldoCentavos);
        document.getElementById('pagamentoContaPagarData').value = hojeLocalPagar();
        registrarModalPagar('modalPagamentoContaPagar', fecharPagamentoContaPagar, confirmarPagamentoContaPagar);
        fecharModalPagar('modalDetalhesContaPagar');
        return abrirModalPagar('modalPagamentoContaPagar', 'pagamentoContaPagarValor');
    }

    function fecharPagamentoContaPagar() {
        if (!fecharModalPagar('modalPagamentoContaPagar')) return false;
        sessaoPagamento = null;
        return true;
    }

    function comprovantePagamentoPagar(prefixo = 'pagamentoContaPagar') {
        const nome = document.getElementById(`${prefixo}ComprovanteNome`)?.value || '';
        const mime = document.getElementById(`${prefixo}ComprovanteMime`)?.value || '';
        const tamanhoTexto = document.getElementById(`${prefixo}ComprovanteTamanho`)?.value || '';
        const hash = document.getElementById(`${prefixo}ComprovanteHash`)?.value || '';
        const referencia = document.getElementById(`${prefixo}ComprovanteReferencia`)?.value || '';
        if (![nome, mime, tamanhoTexto, hash, referencia].some((item) => item !== '')) return null;
        if (!/^\d+$/.test(tamanhoTexto)) return false;
        const tamanhoBig = BigInt(tamanhoTexto);
        if (tamanhoBig > BigInt(Number.MAX_SAFE_INTEGER)) return false;
        if (typeof criarComprovantePagamentoContaPagar !== 'function') return false;
        return criarComprovantePagamentoContaPagar(nome, mime, Number(tamanhoBig), hash, referencia) || false;
    }

    function confirmarPagamentoContaPagar() {
        if (!sessaoPagamento || emProcessamento) return false;
        if (typeof validarPermissao === 'function'
            && !validarPermissao('pagar_conta', 'Você não possui permissão para pagar contas.')) return false;
        const valor = document.getElementById('pagamentoContaPagarValor');
        const forma = document.getElementById('pagamentoContaPagarForma');
        const comprovante = comprovantePagamentoPagar();
        if (comprovante === false) {
            definirErroPagar('modalPagamentoContaPagar', 'Confira os metadados do comprovante.',
                document.getElementById('pagamentoContaPagarComprovanteTamanho'));
            return false;
        }
        const agora = agoraIsoPagar();
        const metadados = metadadosPagar(agora);
        const entrada = typeof criarEntradaPagamentoContaPagar === 'function'
            ? criarEntradaPagamentoContaPagar(sessaoPagamento.contaReferencia,
                sessaoPagamento.parcelaReferencia, valor?.value, document.getElementById('pagamentoContaPagarData')?.value,
                forma?.value, document.getElementById('pagamentoContaPagarDescricao')?.value || '',
                comprovante, sessaoPagamento.operacaoId, agora, usuarioPagar(), hojeLocalPagar(),
                metadados.versao, metadados.data, metadados.ultimaEdicao) : null;
        if (!entrada || typeof executarPagamentoContaPagarTransacional !== 'function'
            || typeof criarDependenciasExecutorContasPagar !== 'function') {
            definirErroPagar('modalPagamentoContaPagar', 'Confira os dados do pagamento.', valor);
            return false;
        }
        emProcessamento = true;
        document.getElementById('pagamentoContaPagarConfirmar').disabled = true;
        try {
            const resultado = executarPagamentoContaPagarTransacional(entrada,
                criarDependenciasExecutorContasPagar({ armazenamento: localStorage }));
            executarEfeitosPagar(resultado);
            if (resultado.ok && ['PAGAMENTO_CONTA_PAGAR_APLICADO', 'OPERACAO_JA_CONCLUIDA'].includes(resultado.codigo)) {
                emProcessamento = false;
                fecharPagamentoContaPagar();
                if (typeof mostrarToast === 'function') mostrarToast('Pagamento registrado.');
                return true;
            }
            definirErroPagar('modalPagamentoContaPagar', resultado.requerRecuperacao
                ? 'A operação exige recuperação explícita antes de continuar.'
                : resultado.codigo === 'PAGAMENTO_ACIMA_DO_SALDO'
                    ? 'O valor informado supera o saldo da parcela.'
                    : 'Não foi possível registrar o pagamento.', valor);
            return false;
        } finally {
            emProcessamento = false;
            document.getElementById('pagamentoContaPagarConfirmar').disabled = false;
        }
    }

    function resolverArgumentoEstornoPagar(argumento) {
        if (typeof argumento !== 'string') return null;
        try {
            const dados = JSON.parse(decodeURIComponent(argumento));
            if (!Array.isArray(dados) || dados.length !== 3
                || dados.some((item) => typeof item !== 'string' || !item)) return null;
            return { contaReferencia: dados[0], parcelaReferencia: dados[1],
                pagamentoOriginalReferencia: dados[2] };
        } catch (_erro) { return null; }
    }

    function abrirEstornoPagamentoContaPagar(argumento) {
        if (sessaoEstorno || sessaoOperacaoAdministrativa || sessaoConciliacao
            || emProcessamento) return false;
        if (typeof validarPermissao === 'function'
            && !validarPermissao('estornar_pagamento_conta',
                'Você não possui permissão para estornar pagamentos.')) return false;
        const alvo = resolverArgumentoEstornoPagar(argumento);
        if (!alvo || typeof obterProjecaoContaPagarPorReferencia !== 'function') return false;
        const resolvida = obterProjecaoContaPagarPorReferencia(
            alvo.contaReferencia, estadoPagar(), hojeLocalPagar());
        const conta = resolvida?.conta?.conta;
        if (!resolvida?.ok || !conta || conta.situacaoAdministrativa !== 'ativa') return false;
        const parcelas = conta.parcelas.filter((item) => item?.parcelaReferencia === alvo.parcelaReferencia);
        if (parcelas.length !== 1
            || (parcelas[0].situacaoAdministrativa || 'ativa') !== 'ativa') return false;
        const parcela = parcelas[0];
        const pagamentos = parcela.pagamentos.filter((item) => (
            item?.pagamentoReferencia === alvo.pagamentoOriginalReferencia));
        if (pagamentos.length !== 1) return false;
        const pagamento = pagamentos[0];
        const estornado = (Array.isArray(parcela.estornos) ? parcela.estornos : [])
            .filter((item) => item?.pagamentoOriginalReferencia === pagamento.pagamentoReferencia)
            .reduce((total, item) => total + item.valorEstornoCentavos, 0);
        const disponivel = pagamento.valorPagoCentavos - estornado;
        if (!Number.isSafeInteger(disponivel) || disponivel <= 0) return false;
        sessaoEstorno = { ...alvo, operacaoId: operacaoIdPagar('estorno-pagamento-conta-pagar') };
        document.getElementById('formEstornoPagamentoContaPagar')?.reset();
        document.getElementById('estornoPagamentoContaPagarResumo').textContent
            = `${conta.descricao} · Parcela ${parcela.numero}/${parcela.totalParcelas}`;
        document.getElementById('estornoPagamentoContaPagarOriginal').textContent
            = formatarCentavosPagar(pagamento.valorPagoCentavos);
        document.getElementById('estornoPagamentoContaPagarJaEstornado').textContent
            = formatarCentavosPagar(estornado);
        document.getElementById('estornoPagamentoContaPagarDisponivel').textContent
            = formatarCentavosPagar(disponivel);
        document.getElementById('estornoPagamentoContaPagarData').value = hojeLocalPagar();
        document.getElementById('estornoPagamentoContaPagarResponsavel').value = usuarioPagar();
        registrarModalPagar('modalEstornoPagamentoContaPagar',
            fecharEstornoPagamentoContaPagar, confirmarEstornoPagamentoContaPagar);
        fecharModalPagar('modalDetalhesContaPagar');
        return abrirModalPagar('modalEstornoPagamentoContaPagar', 'estornoPagamentoContaPagarValor');
    }

    function fecharEstornoPagamentoContaPagar() {
        if (!fecharModalPagar('modalEstornoPagamentoContaPagar')) return false;
        sessaoEstorno = null;
        return true;
    }

    function confirmarEstornoPagamentoContaPagar() {
        if (!sessaoEstorno || emProcessamento) return false;
        if (typeof validarPermissao === 'function'
            && !validarPermissao('estornar_pagamento_conta',
                'Você não possui permissão para estornar pagamentos.')) return false;
        const valor = document.getElementById('estornoPagamentoContaPagarValor');
        const motivo = document.getElementById('estornoPagamentoContaPagarMotivo');
        if (typeof motivo?.value !== 'string' || motivo.value.trim() === '') {
            definirErroPagar('modalEstornoPagamentoContaPagar',
                'Informe o motivo do estorno.', motivo);
            return false;
        }
        const comprovante = comprovantePagamentoPagar('estornoPagamentoContaPagar');
        if (comprovante === false) {
            definirErroPagar('modalEstornoPagamentoContaPagar',
                'Confira os metadados do comprovante.',
                document.getElementById('estornoPagamentoContaPagarComprovanteTamanho'));
            return false;
        }
        const agora = agoraIsoPagar();
        const metadados = metadadosPagar(agora);
        const entrada = typeof criarEntradaEstornoPagamentoContaPagar === 'function'
            ? criarEntradaEstornoPagamentoContaPagar(sessaoEstorno.contaReferencia,
                sessaoEstorno.parcelaReferencia, sessaoEstorno.pagamentoOriginalReferencia,
                valor?.value, document.getElementById('estornoPagamentoContaPagarData')?.value,
                motivo?.value, comprovante, sessaoEstorno.operacaoId, agora, usuarioPagar(),
                hojeLocalPagar(), metadados.versao, metadados.data, metadados.ultimaEdicao) : null;
        if (!entrada || typeof executarEstornoPagamentoContaPagarTransacional !== 'function'
            || typeof criarDependenciasExecutorContasPagar !== 'function') {
            definirErroPagar('modalEstornoPagamentoContaPagar',
                'Confira os dados do estorno.', valor);
            return false;
        }
        emProcessamento = true;
        document.getElementById('estornoPagamentoContaPagarConfirmar').disabled = true;
        try {
            const resultado = executarEstornoPagamentoContaPagarTransacional(entrada,
                criarDependenciasExecutorContasPagar({ armazenamento: localStorage }));
            executarEfeitosPagar(resultado);
            if (resultado.ok && ['ESTORNO_PAGAMENTO_CONTA_PAGAR_APLICADO',
                'OPERACAO_JA_CONCLUIDA'].includes(resultado.codigo)) {
                emProcessamento = false;
                fecharEstornoPagamentoContaPagar();
                if (typeof mostrarToast === 'function') mostrarToast('Estorno registrado.');
                return true;
            }
            definirErroPagar('modalEstornoPagamentoContaPagar', resultado.requerRecuperacao
                ? 'A operação exige recuperação explícita antes de continuar.'
                : resultado.codigo === 'ESTORNO_ACIMA_DO_DISPONIVEL'
                    ? 'O valor supera o total disponível para estorno.'
                    : 'Não foi possível registrar o estorno.', valor);
            return false;
        } finally {
            emProcessamento = false;
            document.getElementById('estornoPagamentoContaPagarConfirmar').disabled = false;
        }
    }

    function textoCentavosPagar(valor) {
        if (!Number.isSafeInteger(valor) || valor < 0) return '';
        return `${Math.floor(valor / 100)},${String(valor % 100).padStart(2, '0')}`;
    }

    function abrirModalConciliacaoPagamentoPagar(argumento, tipo) {
        if (sessaoConciliacao || sessaoPagamento || sessaoEstorno
            || sessaoOperacaoAdministrativa || emProcessamento) return false;
        const permissao = tipo === 'conciliacao'
            ? 'conciliar_pagamento_conta_pagar' : 'desconsiderar_conciliacao_conta_pagar';
        if (typeof validarPermissao === 'function'
            && !validarPermissao(permissao, 'Você não possui permissão para esta conciliação.')) {
            return false;
        }
        const alvoArgumento = resolverArgumentoEstornoPagar(argumento);
        if (!alvoArgumento || typeof obterProjecaoContaPagarPorReferencia !== 'function') return false;
        const resolvida = obterProjecaoContaPagarPorReferencia(
            alvoArgumento.contaReferencia, estadoPagar(), hojeLocalPagar());
        const conta = resolvida?.conta?.conta;
        if (!resolvida?.ok || !conta) return false;
        const parcelas = conta.parcelas.filter((item) => (
            item?.parcelaReferencia === alvoArgumento.parcelaReferencia));
        const pagamentos = parcelas.length === 1 ? parcelas[0].pagamentos.filter((item) => (
            item?.pagamentoReferencia === alvoArgumento.pagamentoOriginalReferencia)) : [];
        if (pagamentos.length !== 1) return false;
        const pagamento = pagamentos[0];
        const estornado = (Array.isArray(parcelas[0].estornos) ? parcelas[0].estornos : [])
            .filter((item) => item.pagamentoOriginalReferencia === pagamento.pagamentoReferencia)
            .reduce((total, item) => total + item.valorEstornoCentavos, 0);
        const situacao = typeof obterSituacaoConciliacaoPagamentoPagar === 'function'
            ? obterSituacaoConciliacaoPagamentoPagar(estadoPagar(), conta.contaPagarReferencia,
                parcelas[0].parcelaReferencia, pagamento.pagamentoReferencia)
            : { estado: 'invalida', conciliacao: null };
        if ((tipo === 'conciliacao' && (conta.situacaoAdministrativa !== 'ativa'
                || pagamento.valorPagoCentavos - estornado <= 0
                || !['pendente', 'desconsiderada'].includes(situacao.estado)))
            || (tipo === 'desconsideracao' && !situacao.conciliacao)) return false;
        sessaoConciliacao = {
            tipo,
            contaReferencia: conta.contaPagarReferencia,
            parcelaReferencia: parcelas[0].parcelaReferencia,
            pagamentoReferencia: pagamento.pagamentoReferencia,
            conciliacaoOriginalReferencia:
                situacao.conciliacao?.conciliacaoPagamentoPagarReferencia || '',
            operacaoId: operacaoIdPagar(tipo === 'conciliacao'
                ? 'conciliacao-pagamento-pagar' : 'desconsideracao-conciliacao-pagamento-pagar')
        };
        document.getElementById('formConciliacaoPagamentoPagar')?.reset();
        document.getElementById('conciliacaoPagamentoPagarTitulo').textContent = tipo === 'conciliacao'
            ? 'Conciliar pagamento' : 'Desconsiderar conciliação';
        document.getElementById('conciliacaoPagamentoPagarDescricaoAjuda').textContent
            = tipo === 'conciliacao'
                ? 'Qualifique a saída existente sem criar um novo movimento financeiro.'
                : 'A conciliação original será preservada e marcada como desconsiderada.';
        document.getElementById('conciliacaoPagamentoPagarResumo').textContent
            = `${conta.descricao} · ${pagamento.dataPagamento} · ${formatarCentavosPagar(
                pagamento.valorPagoCentavos)}`;
        const camposConciliacao = document.getElementById('conciliacaoPagamentoPagarCampos');
        const camposDesconsideracao = document.getElementById('desconsideracaoPagamentoPagarCampos');
        camposConciliacao.hidden = tipo !== 'conciliacao';
        camposDesconsideracao.hidden = tipo !== 'desconsideracao';
        document.getElementById('conciliacaoPagamentoPagarValor').value
            = textoCentavosPagar(pagamento.valorPagoCentavos);
        document.getElementById('conciliacaoPagamentoPagarData').value = hojeLocalPagar();
        document.getElementById('conciliacaoPagamentoPagarConfirmar').textContent
            = tipo === 'conciliacao' ? 'Registrar conciliação' : 'Desconsiderar conciliação';
        registrarModalPagar('modalConciliacaoPagamentoPagar',
            fecharConciliacaoPagamentoPagar, confirmarConciliacaoPagamentoPagar);
        fecharModalPagar('modalDetalhesContaPagar');
        return abrirModalPagar('modalConciliacaoPagamentoPagar',
            tipo === 'conciliacao'
                ? 'conciliacaoPagamentoPagarValor' : 'desconsideracaoPagamentoPagarMotivo');
    }

    function abrirConciliacaoPagamentoPagar(argumento) {
        return abrirModalConciliacaoPagamentoPagar(argumento, 'conciliacao');
    }

    function abrirDesconsideracaoConciliacaoPagamentoPagar(argumento) {
        return abrirModalConciliacaoPagamentoPagar(argumento, 'desconsideracao');
    }

    function fecharConciliacaoPagamentoPagar() {
        if (!fecharModalPagar('modalConciliacaoPagamentoPagar')) return false;
        sessaoConciliacao = null;
        return true;
    }

    function confirmarConciliacaoPagamentoPagar() {
        if (!sessaoConciliacao || emProcessamento) return false;
        const sessao = sessaoConciliacao;
        const permissao = sessao.tipo === 'conciliacao'
            ? 'conciliar_pagamento_conta_pagar' : 'desconsiderar_conciliacao_conta_pagar';
        if (typeof validarPermissao === 'function'
            && !validarPermissao(permissao, 'Você não possui permissão para esta conciliação.')) {
            return false;
        }
        const agora = agoraIsoPagar();
        const metadados = metadadosPagar(agora);
        let entrada = null;
        let campoErro = null;
        if (sessao.tipo === 'conciliacao') {
            const valor = document.getElementById('conciliacaoPagamentoPagarValor');
            const situacao = document.getElementById('conciliacaoPagamentoPagarSituacao');
            const data = document.getElementById('conciliacaoPagamentoPagarData');
            const comprovante = comprovantePagamentoPagar('conciliacaoPagamentoPagar');
            campoErro = valor;
            if (comprovante === false) {
                definirErroPagar('modalConciliacaoPagamentoPagar',
                    'Confira os metadados do comprovante.',
                    document.getElementById('conciliacaoPagamentoPagarComprovanteNome'));
                return false;
            }
            entrada = typeof criarEntradaConciliacaoPagamentoPagar === 'function'
                ? criarEntradaConciliacaoPagamentoPagar(
                    sessao.contaReferencia, sessao.parcelaReferencia,
                    sessao.pagamentoReferencia, situacao?.value, valor?.value, data?.value,
                    document.getElementById('conciliacaoPagamentoPagarMeio')?.value,
                    document.getElementById('conciliacaoPagamentoPagarConta')?.value,
                    document.getElementById('conciliacaoPagamentoPagarIdentificador')?.value,
                    document.getElementById('conciliacaoPagamentoPagarMotivoDivergencia')?.value,
                    document.getElementById('conciliacaoPagamentoPagarObservacao')?.value,
                    comprovante, sessao.operacaoId, agora, usuarioPagar(), hojeLocalPagar(),
                    metadados.versao, metadados.data, metadados.ultimaEdicao) : null;
        } else {
            const motivo = document.getElementById('desconsideracaoPagamentoPagarMotivo');
            campoErro = motivo;
            entrada = typeof criarEntradaDesconsideracaoConciliacaoPagamentoPagar === 'function'
                ? criarEntradaDesconsideracaoConciliacaoPagamentoPagar(
                    sessao.contaReferencia, sessao.parcelaReferencia,
                    sessao.pagamentoReferencia, sessao.conciliacaoOriginalReferencia,
                    motivo?.value, sessao.operacaoId, agora, usuarioPagar(), hojeLocalPagar(),
                    metadados.versao, metadados.data, metadados.ultimaEdicao) : null;
        }
        const executor = sessao.tipo === 'conciliacao'
            ? window.executarConciliacaoPagamentoPagarTransacional
            : window.executarDesconsideracaoConciliacaoPagamentoPagarTransacional;
        if (!entrada || typeof executor !== 'function'
            || typeof criarDependenciasExecutorContasPagar !== 'function') {
            definirErroPagar('modalConciliacaoPagamentoPagar',
                'Confira os dados da conciliação.', campoErro);
            return false;
        }
        emProcessamento = true;
        const confirmar = document.getElementById('conciliacaoPagamentoPagarConfirmar');
        confirmar.disabled = true;
        try {
            const resultado = executor(entrada,
                criarDependenciasExecutorContasPagar({ armazenamento: localStorage }));
            executarEfeitosPagar(resultado);
            if (resultado.ok && ['CONCILIACAO_PAGAMENTO_PAGAR_APLICADA',
                'CONCILIACAO_PAGAMENTO_PAGAR_DESCONSIDERADA',
                'OPERACAO_JA_CONCLUIDA'].includes(resultado.codigo)) {
                emProcessamento = false;
                fecharConciliacaoPagamentoPagar();
                if (typeof mostrarToast === 'function') {
                    mostrarToast(sessao.tipo === 'conciliacao'
                        ? 'Pagamento conciliado.' : 'Conciliação desconsiderada.');
                }
                return true;
            }
            definirErroPagar('modalConciliacaoPagamentoPagar', resultado.requerRecuperacao
                ? 'A conciliação exige recuperação explícita antes de continuar.'
                : 'Não foi possível confirmar a conciliação.', campoErro);
            return false;
        } finally {
            emProcessamento = false;
            confirmar.disabled = false;
        }
    }

    function resolverArgumentoOperacaoAdministrativaPagar(argumento) {
        if (typeof argumento !== 'string') return null;
        try {
            const dados = JSON.parse(decodeURIComponent(argumento));
            if (!Array.isArray(dados) || dados.length !== 3
                || dados.some((item) => typeof item !== 'string')
                || !dados[0] || !dados[1]) return null;
            const contratos = {
                alterar_vencimento_conta_pagar: { escopo: 'parcela', permissao: 'alterar_vencimento_conta_pagar' },
                cancelar_parcela_conta_pagar: { escopo: 'parcela', permissao: 'cancelar_conta_pagar' },
                cancelar_conta_pagar: { escopo: 'conta', permissao: 'cancelar_conta_pagar' },
                encerrar_conta_pagar: { escopo: 'conta', permissao: 'encerrar_conta_pagar' }
            };
            const contrato = contratos[dados[0]];
            if (!contrato || (contrato.escopo === 'parcela' && !dados[2])
                || (contrato.escopo === 'conta' && dados[2] !== '')) return null;
            return { acao: dados[0], contaReferencia: dados[1],
                parcelaReferencia: dados[2], ...contrato };
        } catch (_erro) { return null; }
    }

    function abrirOperacaoAdministrativaContaPagar(argumento) {
        if (sessaoOperacaoAdministrativa || sessaoPagamento || sessaoEstorno
            || sessaoConciliacao || sessaoFornecedor || sessaoConta || emProcessamento) return false;
        const alvo = resolverArgumentoOperacaoAdministrativaPagar(argumento);
        if (!alvo) return false;
        const mensagensPermissao = {
            alterar_vencimento_conta_pagar: 'Você não possui permissão para alterar vencimentos.',
            cancelar_conta_pagar: 'Você não possui permissão para cancelar contas ou parcelas.',
            encerrar_conta_pagar: 'Você não possui permissão para encerrar contas.'
        };
        if (typeof validarPermissao === 'function'
            && !validarPermissao(alvo.permissao, mensagensPermissao[alvo.permissao])) return false;
        const resolvida = obterProjecaoContaPagarPorReferencia(
            alvo.contaReferencia, estadoPagar(), hojeLocalPagar());
        const conta = resolvida?.conta?.conta;
        if (!resolvida?.ok || !conta || conta.situacaoAdministrativa !== 'ativa') return false;
        const parcelas = alvo.escopo === 'parcela'
            ? conta.parcelas.filter((item) => item?.parcelaReferencia === alvo.parcelaReferencia) : [];
        if (alvo.escopo === 'parcela' && (parcelas.length !== 1
            || (parcelas[0].situacaoAdministrativa || 'ativa') !== 'ativa')) return false;
        const parcela = parcelas[0] || null;
        if (alvo.acao === 'alterar_vencimento_conta_pagar' && parcela.saldoCentavos === 0) return false;
        const textos = {
            alterar_vencimento_conta_pagar: {
                titulo: 'Alterar vencimento',
                descricao: 'Confirme o novo vencimento. Valores, pagamentos e estornos não serão alterados.',
                resumo: `${conta.descricao} · Parcela ${parcela?.numero}/${parcela?.totalParcelas} · vencimento atual ${parcela?.vencimento}`,
                botao: 'Alterar vencimento'
            },
            cancelar_parcela_conta_pagar: {
                titulo: 'Cancelar parcela',
                descricao: 'O saldo aberto desta parcela sairá da projeção. O histórico financeiro será preservado.',
                resumo: `${conta.descricao} · Parcela ${parcela?.numero}/${parcela?.totalParcelas}`,
                botao: 'Cancelar parcela'
            },
            cancelar_conta_pagar: {
                titulo: 'Cancelar conta',
                descricao: 'Somente o saldo aberto será retirado da projeção. Pagamentos e estornos permanecem históricos.',
                resumo: `${conta.descricao} · saldo ${formatarCentavosPagar(conta.saldoCentavos)}`,
                botao: 'Cancelar conta'
            },
            encerrar_conta_pagar: {
                titulo: 'Encerrar conta',
                descricao: 'O encerramento é administrativo: não cria pagamento e retira o saldo aberto da projeção.',
                resumo: `${conta.descricao} · saldo documental ${formatarCentavosPagar(conta.saldoCentavos)}`,
                botao: 'Encerrar conta'
            }
        }[alvo.acao];
        const acionadorOperacao = [...document.querySelectorAll(
            '[data-action="abrirOperacaoAdministrativaContaPagar"]')]
            .find((elemento) => elemento instanceof HTMLElement
                && elemento.dataset.arg === argumento) || null;
        acionadorOperacaoAdministrativa = acionadorOperacao;
        sessaoOperacaoAdministrativa = {
            ...alvo,
            operacaoId: operacaoIdPagar(alvo.acao.replaceAll('_', '-'))
        };
        document.getElementById('formOperacaoAdministrativaContaPagar')?.reset();
        document.getElementById('operacaoAdministrativaContaPagarTitulo').textContent = textos.titulo;
        document.getElementById('operacaoAdministrativaContaPagarDescricao').textContent = textos.descricao;
        document.getElementById('operacaoAdministrativaContaPagarResumo').textContent = textos.resumo;
        document.getElementById('operacaoAdministrativaContaPagarConfirmar').textContent = textos.botao;
        const grupoVencimento = document.getElementById('operacaoAdministrativaContaPagarVencimentoGrupo');
        grupoVencimento.hidden = alvo.acao !== 'alterar_vencimento_conta_pagar';
        const vencimento = document.getElementById('operacaoAdministrativaContaPagarVencimento');
        vencimento.required = alvo.acao === 'alterar_vencimento_conta_pagar';
        if (parcela) vencimento.value = parcela.vencimento;
        registrarModalPagar('modalOperacaoAdministrativaContaPagar',
            fecharOperacaoAdministrativaContaPagar, confirmarOperacaoAdministrativaContaPagar);
        const detalhes = document.getElementById('modalDetalhesContaPagar');
        if (acionadorOperacao) acionadorOperacao.focus({ preventScroll: true });
        detalhes?.setAttribute('aria-hidden', 'true');
        return abrirModalPagar('modalOperacaoAdministrativaContaPagar',
            alvo.acao === 'alterar_vencimento_conta_pagar'
                ? 'operacaoAdministrativaContaPagarVencimento'
                : 'operacaoAdministrativaContaPagarMotivo');
    }

    function fecharOperacaoAdministrativaContaPagar(retornarDetalhes = true) {
        const acionadorOperacao = acionadorOperacaoAdministrativa;
        const contaReferencia = sessaoOperacaoAdministrativa?.contaReferencia || '';
        if (!fecharModalPagar('modalOperacaoAdministrativaContaPagar')) return false;
        sessaoOperacaoAdministrativa = null;
        acionadorOperacaoAdministrativa = null;
        const detalhes = document.getElementById('modalDetalhesContaPagar');
        if (retornarDetalhes) {
            detalhes?.setAttribute('aria-hidden', 'false');
            if (acionadorOperacao?.isConnected) {
                requestAnimationFrame(() => setTimeout(() => {
                    acionadorOperacao.focus({ preventScroll: true });
                }, 0));
            }
        } else {
            detalhes?.classList.remove('active');
            detalhes?.setAttribute('aria-hidden', 'true');
            const acionadorDetalhes = [...document.querySelectorAll(
                '[data-action="abrirDetalhesContaPagar"]')]
                .find((elemento) => elemento instanceof HTMLElement
                    && elemento.dataset.arg === contaReferencia);
            if (acionadorDetalhes?.isConnected) {
                requestAnimationFrame(() => setTimeout(() => {
                    acionadorDetalhes.focus({ preventScroll: true });
                }, 0));
            }
        }
        return true;
    }

    function confirmarOperacaoAdministrativaContaPagar() {
        if (!sessaoOperacaoAdministrativa || emProcessamento) return false;
        const sessao = sessaoOperacaoAdministrativa;
        if (typeof validarPermissao === 'function'
            && !validarPermissao(sessao.permissao,
                'Você não possui permissão para esta operação administrativa.')) return false;
        const motivo = document.getElementById('operacaoAdministrativaContaPagarMotivo');
        const vencimento = document.getElementById('operacaoAdministrativaContaPagarVencimento');
        if (typeof motivo?.value !== 'string' || motivo.value.trim() === '') {
            definirErroPagar('modalOperacaoAdministrativaContaPagar',
                'Informe o motivo da operação.', motivo);
            return false;
        }
        const agora = agoraIsoPagar();
        const metadados = metadadosPagar(agora);
        const entrada = typeof criarEntradaOperacaoAdministrativaContaPagar === 'function'
            ? criarEntradaOperacaoAdministrativaContaPagar(
                sessao.acao, sessao.escopo, sessao.contaReferencia,
                sessao.parcelaReferencia,
                sessao.acao === 'alterar_vencimento_conta_pagar' ? vencimento?.value : '',
                motivo.value, sessao.operacaoId, agora, usuarioPagar(), hojeLocalPagar(),
                metadados.versao, metadados.data, metadados.ultimaEdicao) : null;
        if (!entrada || typeof executarOperacaoAdministrativaContaPagarTransacional !== 'function'
            || typeof criarDependenciasExecutorContasPagar !== 'function') {
            definirErroPagar('modalOperacaoAdministrativaContaPagar',
                'Confira os dados da operação.',
                sessao.acao === 'alterar_vencimento_conta_pagar' ? vencimento : motivo);
            return false;
        }
        emProcessamento = true;
        const confirmar = document.getElementById('operacaoAdministrativaContaPagarConfirmar');
        confirmar.disabled = true;
        try {
            const resultado = executarOperacaoAdministrativaContaPagarTransacional(
                entrada, criarDependenciasExecutorContasPagar({ armazenamento: localStorage }));
            executarEfeitosPagar(resultado);
            if (resultado.ok && ['OPERACAO_ADMINISTRATIVA_CONTA_PAGAR_APLICADA',
                'OPERACAO_JA_CONCLUIDA'].includes(resultado.codigo)) {
                emProcessamento = false;
                fecharOperacaoAdministrativaContaPagar(false);
                if (typeof mostrarToast === 'function') mostrarToast('Operação administrativa confirmada.');
                return true;
            }
            const mensagens = {
                VENCIMENTO_SEM_ALTERACAO: 'Informe uma data diferente do vencimento atual.',
                PARCELA_PAGA_NAO_ALTERAVEL: 'Parcelas pagas não podem ter o vencimento alterado.',
                CANCELAMENTO_PARCIAL_CONTRADITORIO: 'Cancele a conta inteira para retirar o último saldo aberto.',
                CONTA_SEM_SALDO_PARA_CANCELAR: 'Contas sem saldo devem ser encerradas, não canceladas.',
                CRONOLOGIA_OPERACAO_ADMINISTRATIVA_PAGAR_INVALIDA: 'A data/hora da operação não é posterior ao histórico.'
            };
            definirErroPagar('modalOperacaoAdministrativaContaPagar', resultado.requerRecuperacao
                ? 'A operação exige recuperação explícita antes de continuar.'
                : (mensagens[resultado.codigo] || 'Não foi possível confirmar a operação.'),
            sessao.acao === 'alterar_vencimento_conta_pagar' ? vencimento : motivo);
            return false;
        } finally {
            emProcessamento = false;
            confirmar.disabled = false;
        }
    }

    window.renderContasPagar = renderContasPagar;
    window.abrirCadastroFornecedor = abrirCadastroFornecedor;
    window.fecharCadastroFornecedor = fecharCadastroFornecedor;
    window.salvarFornecedorPagar = salvarFornecedorPagar;
    window.abrirCriacaoContaPagar = abrirCriacaoContaPagar;
    window.fecharCriacaoContaPagar = fecharCriacaoContaPagar;
    window.salvarContaPagar = salvarContaPagar;
    window.abrirDetalhesContaPagar = abrirDetalhesContaPagar;
    window.fecharDetalhesContaPagar = fecharDetalhesContaPagar;
    window.abrirPagamentoContaPagar = abrirPagamentoContaPagar;
    window.fecharPagamentoContaPagar = fecharPagamentoContaPagar;
    window.confirmarPagamentoContaPagar = confirmarPagamentoContaPagar;
    window.abrirEstornoPagamentoContaPagar = abrirEstornoPagamentoContaPagar;
    window.fecharEstornoPagamentoContaPagar = fecharEstornoPagamentoContaPagar;
    window.confirmarEstornoPagamentoContaPagar = confirmarEstornoPagamentoContaPagar;
    window.abrirConciliacaoPagamentoPagar = abrirConciliacaoPagamentoPagar;
    window.abrirDesconsideracaoConciliacaoPagamentoPagar
        = abrirDesconsideracaoConciliacaoPagamentoPagar;
    window.fecharConciliacaoPagamentoPagar = fecharConciliacaoPagamentoPagar;
    window.confirmarConciliacaoPagamentoPagar = confirmarConciliacaoPagamentoPagar;
    window.abrirOperacaoAdministrativaContaPagar = abrirOperacaoAdministrativaContaPagar;
    window.fecharOperacaoAdministrativaContaPagar = fecharOperacaoAdministrativaContaPagar;
    window.confirmarOperacaoAdministrativaContaPagar = confirmarOperacaoAdministrativaContaPagar;
})();
