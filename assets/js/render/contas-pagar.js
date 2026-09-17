// Fundação visual de fornecedores e contas a pagar.
(() => {
    'use strict';

    let sessaoFornecedor = null;
    let sessaoConta = null;
    let sessaoPagamento = null;
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
        if (sessaoFornecedor || sessaoConta || emProcessamento) return false;
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
        if (sessaoFornecedor || sessaoConta || emProcessamento) return false;
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
                <td>${formatarCentavosPagar(item.saldoCentavos)}</td><td><span class="badge badge-info">${escaparPagar(item.situacao)}</span></td>
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
        const podePagar = typeof temPermissao !== 'function' || temPermissao('pagar_conta');
        document.getElementById('detalhesContaPagarParcelas').innerHTML = item.conta.parcelas.map((parcela) => {
            const situacao = parcela.saldoCentavos === 0 ? 'paga'
                : parcela.pagoCentavos > 0 ? 'parcial'
                    : parcela.vencimento < hojeLocalPagar() ? 'vencida' : 'pendente';
            const argumento = encodeURIComponent(JSON.stringify([item.referencia, parcela.parcelaReferencia]));
            const acao = podePagar && item.conta.situacaoAdministrativa === 'ativa' && parcela.saldoCentavos > 0
                ? `<button type="button" class="btn btn-sm btn-primary" data-action="abrirPagamentoContaPagar" data-arg="${escaparPagar(argumento)}">Registrar pagamento</button>` : '';
            return (
            `<tr><td>${parcela.numero}/${parcela.totalParcelas}</td><td>${escaparPagar(parcela.vencimento)}</td>
            <td>${formatarCentavosPagar(parcela.originalCentavos)}</td><td>${formatarCentavosPagar(parcela.pagoCentavos)}</td>
            <td>${formatarCentavosPagar(parcela.saldoCentavos)}</td><td>${escaparPagar(situacao)}</td><td>${acao}</td></tr>`);
        }).join('');
        document.getElementById('detalhesContaPagarPagamentos').textContent = item.conta.parcelas
            .flatMap((parcela) => parcela.pagamentos.map((pagamento) => (
                `${pagamento.dataPagamento} · ${formatarCentavosPagar(pagamento.valorPagoCentavos)} · ${pagamento.formaPagamento} · ${pagamento.responsavel}`)))
            .join('\n') || 'Sem pagamentos.';
        document.getElementById('detalhesContaPagarHistorico').textContent = (item.conta.historico || [])
            .map((registro) => `${registro.data} · ${registro.acao} · ${registro.usuario}`).join('\n') || 'Sem histórico.';
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
        if (sessaoPagamento || emProcessamento) return false;
        if (typeof validarPermissao === 'function'
            && !validarPermissao('pagar_conta', 'Você não possui permissão para pagar contas.')) return false;
        const alvo = resolverArgumentoPagamentoPagar(argumento);
        if (!alvo || typeof obterProjecaoContaPagarPorReferencia !== 'function') return false;
        const resolvida = obterProjecaoContaPagarPorReferencia(
            alvo.contaReferencia, estadoPagar(), hojeLocalPagar());
        const conta = resolvida?.conta?.conta;
        if (!resolvida?.ok || !conta || conta.situacaoAdministrativa !== 'ativa') return false;
        const parcelas = conta.parcelas.filter((item) => item?.parcelaReferencia === alvo.parcelaReferencia);
        if (parcelas.length !== 1 || parcelas[0].saldoCentavos <= 0) return false;
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

    function comprovantePagamentoPagar() {
        const nome = document.getElementById('pagamentoContaPagarComprovanteNome')?.value || '';
        const mime = document.getElementById('pagamentoContaPagarComprovanteMime')?.value || '';
        const tamanhoTexto = document.getElementById('pagamentoContaPagarComprovanteTamanho')?.value || '';
        const hash = document.getElementById('pagamentoContaPagarComprovanteHash')?.value || '';
        const referencia = document.getElementById('pagamentoContaPagarComprovanteReferencia')?.value || '';
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
})();
