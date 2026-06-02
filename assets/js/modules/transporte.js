// Modulo de transporte operacional
(function () {
    const FILTROS_TRANSPORTE = new Set(['todos', 'pendente', 'em_rota', 'concluido']);
    const CHAVE_FILTRO_TRANSPORTE = 'mtz:transporteFiltro';
    let filtroTransporteAtual = lerFiltroTransportePersistido();

    function textoSeguro(valor, fallback = '') {
        const texto = valor == null ? '' : String(valor);
        return texto.trim() || fallback;
    }

    function html(valor) {
        if (typeof sanitizarTexto === 'function') return sanitizarTexto(valor);
        const div = document.createElement('div');
        div.textContent = valor == null ? '' : String(valor);
        return div.innerHTML;
    }

    function numero(valor, fallback = 0) {
        if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
        const normalizado = String(valor ?? '')
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^\d.-]/g, '');
        const convertido = Number(normalizado);
        return Number.isFinite(convertido) ? convertido : fallback;
    }

    function moeda(valor) {
        return Number(valor || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }

    function hojeIso() {
        const data = new Date();
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function formatarDataCurtaTransporte(valor) {
        if (!valor) return '-';
        const partes = String(valor).split('-');
        if (partes.length !== 3) return String(valor);
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    function normalizarBusca(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function obterLocacaoPorId(id) {
        const alvo = String(id || '');
        if (!alvo || !Array.isArray(locacoes)) return null;
        return locacoes.find((locacao) => String(locacao.id) === alvo) || null;
    }

    function obterClientePorLocacao(locacao) {
        if (!locacao) return null;
        const idCliente = locacao.locadorId ?? locacao.clienteId;
        if (!Array.isArray(locadores)) return null;
        return locadores.find((cliente) => String(cliente.id) === String(idCliente)) || null;
    }

    function obterNomeClienteLocacao(locacao) {
        const cliente = obterClientePorLocacao(locacao);
        return textoSeguro(
            cliente?.nome || cliente?.nomeCompleto || cliente?.empresa || locacao?.clienteNome,
            locacao ? `Cliente #${String(locacao.id || '').slice(-4)}` : ''
        );
    }

    function obterEnderecoLocacao(locacao, cliente) {
        return textoSeguro(
            locacao?.logistica?.endereco ||
            locacao?.enderecoEvento ||
            locacao?.eventoEndereco ||
            locacao?.localEvento ||
            locacao?.local ||
            locacao?.endereco ||
            cliente?.endereco,
            ''
        );
    }

    function obterCidadeLocacao(locacao, cliente) {
        return textoSeguro(
            locacao?.logistica?.cidade ||
            locacao?.cidadeEvento ||
            locacao?.eventoCidade ||
            locacao?.cidade ||
            cliente?.cidade,
            ''
        );
    }

    function obterDataSaidaLocacao(locacao) {
        return textoSeguro(
            locacao?.datasMontagem?.inicio ||
            locacao?.dataMontagem ||
            locacao?.dataAluguel,
            hojeIso()
        );
    }

    function obterValorKmPadrao() {
        return numero(config?.valorKmFretePadrao, 0);
    }

    function obterTrechosTransporte(valor, fallback = 1) {
        const trechos = Math.trunc(numero(valor, fallback));
        return trechos > 0 ? trechos : 1;
    }

    function lerFiltroTransportePersistido() {
        try {
            const salvo = localStorage.getItem(CHAVE_FILTRO_TRANSPORTE) || 'todos';
            return FILTROS_TRANSPORTE.has(salvo) ? salvo : 'todos';
        } catch (_) {
            return 'todos';
        }
    }

    function salvarFiltroTransportePersistido(valor) {
        try {
            localStorage.setItem(CHAVE_FILTRO_TRANSPORTE, valor);
        } catch (_) {
            // Falha de persistencia nao bloqueia o filtro da tela.
        }
    }

    function normalizarTransporte(registro = {}) {
        const distanciaKm = numero(registro.distanciaKm, 0);
        const valorKm = numero(registro.valorKm, obterValorKmPadrao());
        const trechos = obterTrechosTransporte(registro.trechos, 1);
        const custoEstimado = numero(registro.custoEstimado, distanciaKm * valorKm * trechos);

        return {
            id: registro.id || Date.now(),
            locacaoId: textoSeguro(registro.locacaoId),
            clienteNome: textoSeguro(registro.clienteNome, 'Cliente nao informado'),
            endereco: textoSeguro(registro.endereco),
            cidade: textoSeguro(registro.cidade),
            tipoOperacao: textoSeguro(registro.tipoOperacao, 'entrega'),
            veiculo: textoSeguro(registro.veiculo),
            placa: textoSeguro(registro.placa),
            motorista: textoSeguro(registro.motorista),
            equipe: textoSeguro(registro.equipe),
            dataSaida: textoSeguro(registro.dataSaida),
            horaSaida: textoSeguro(registro.horaSaida),
            dataChegada: textoSeguro(registro.dataChegada),
            horaChegada: textoSeguro(registro.horaChegada),
            distanciaKm,
            valorKm,
            trechos,
            custoEstimado,
            status: textoSeguro(registro.status, 'pendente'),
            observacoes: textoSeguro(registro.observacoes),
            criadoEm: registro.criadoEm || new Date().toISOString(),
            atualizadoEm: registro.atualizadoEm || registro.criadoEm || new Date().toISOString()
        };
    }

    function rotuloStatusTransporte(status) {
        const mapa = {
            pendente: 'Pendente',
            em_rota: 'Em rota',
            entregue: 'Entregue',
            retirado: 'Retirado',
            concluido: 'Concluido',
            cancelado: 'Cancelado'
        };
        return mapa[status] || 'Pendente';
    }

    function badgeStatusTransporte(status) {
        const mapa = {
            pendente: 'badge-warning',
            em_rota: 'badge-info',
            entregue: 'badge-success',
            retirado: 'badge-success',
            concluido: 'badge-success',
            cancelado: 'badge-danger'
        };
        return mapa[status] || 'badge-warning';
    }

    function preencherCampo(id, valor) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = valor ?? '';
    }

    function lerCampo(id) {
        return document.getElementById(id)?.value ?? '';
    }

    function calcularCustoTransporte() {
        const distancia = numero(lerCampo('transporteDistanciaKm'), 0);
        const valorKm = numero(lerCampo('transporteValorKm'), obterValorKmPadrao());
        const trechos = obterTrechosTransporte(lerCampo('transporteTrechos'), 1);
        preencherCampo('transporteTrechos', trechos);
        const custo = distancia * valorKm * trechos;
        preencherCampo('transporteCustoEstimado', moeda(custo));
        return { distancia, valorKm, trechos, custo };
    }

    function popularSelectLocacaoTransporte() {
        const select = document.getElementById('transporteLocacao');
        if (!select) return;

        const valorAtual = String(select.value || '');
        const lista = Array.isArray(locacoes) ? locacoes : [];
        const opcoes = lista
            .slice()
            .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
            .map((locacao) => {
                const nome = obterNomeClienteLocacao(locacao);
                const codigo = `#${String(locacao.id || '').slice(-4)}`;
                return `<option value="${html(locacao.id)}">${html(`${codigo} - ${nome}`)}</option>`;
            })
            .join('');

        select.innerHTML = `<option value="">Sem vinculo com locacao</option>${opcoes}`;
        if (valorAtual && Array.from(select.options).some((opt) => opt.value === valorAtual)) {
            select.value = valorAtual;
        }
    }

    function preencherTransporteDaLocacao() {
        const locacaoId = lerCampo('transporteLocacao');
        const locacao = obterLocacaoPorId(locacaoId);
        if (!locacao) return;

        const cliente = obterClientePorLocacao(locacao);
        preencherCampo('transporteClienteNome', obterNomeClienteLocacao(locacao));
        preencherCampo('transporteEndereco', obterEnderecoLocacao(locacao, cliente));
        preencherCampo('transporteCidade', obterCidadeLocacao(locacao, cliente));

        if (!lerCampo('transporteDataSaida')) {
            preencherCampo('transporteDataSaida', obterDataSaidaLocacao(locacao));
        }

        const logistica = locacao?.logistica || {};
        const distanciaKm = numero(logistica.distanciaKm, 0);
        if (distanciaKm && !lerCampo('transporteDistanciaKm')) {
            preencherCampo('transporteDistanciaKm', distanciaKm);
        }

        const valorKm = numero(logistica.valorKm, obterValorKmPadrao());
        if (valorKm && !lerCampo('transporteValorKm')) {
            preencherCampo('transporteValorKm', valorKm);
        }

        const trechos = obterTrechosTransporte(logistica.trechos, 1);
        if (trechos && !lerCampo('transporteTrechos')) {
            preencherCampo('transporteTrechos', trechos);
        }

        if (logistica.horarioSaida && !lerCampo('transporteHoraSaida')) {
            preencherCampo('transporteHoraSaida', logistica.horarioSaida);
        }

        if (logistica.horarioChegada && !lerCampo('transporteHoraChegada')) {
            preencherCampo('transporteHoraChegada', logistica.horarioChegada);
        }

        const motorista = textoSeguro(locacao?.logistica?.motorista);
        if (motorista && !lerCampo('transporteMotorista')) {
            preencherCampo('transporteMotorista', motorista);
        }

        const veiculo = textoSeguro(locacao?.logistica?.veiculo);
        if (veiculo && !lerCampo('transporteVeiculo')) {
            preencherCampo('transporteVeiculo', veiculo);
        }

        calcularCustoTransporte();
    }

    function obterPayloadFormularioTransporte() {
        const calculo = calcularCustoTransporte();
        return normalizarTransporte({
            id: lerCampo('transporteId') || Date.now(),
            locacaoId: lerCampo('transporteLocacao'),
            clienteNome: lerCampo('transporteClienteNome'),
            endereco: lerCampo('transporteEndereco'),
            cidade: lerCampo('transporteCidade'),
            tipoOperacao: lerCampo('transporteTipoOperacao'),
            veiculo: lerCampo('transporteVeiculo'),
            placa: lerCampo('transportePlaca'),
            motorista: lerCampo('transporteMotorista'),
            equipe: lerCampo('transporteEquipe'),
            dataSaida: lerCampo('transporteDataSaida'),
            horaSaida: lerCampo('transporteHoraSaida'),
            dataChegada: lerCampo('transporteDataChegada'),
            horaChegada: lerCampo('transporteHoraChegada'),
            distanciaKm: calculo.distancia,
            valorKm: calculo.valorKm,
            trechos: calculo.trechos,
            custoEstimado: calculo.custo,
            status: lerCampo('transporteStatus'),
            observacoes: lerCampo('transporteObservacoes')
        });
    }

    function salvarTransporte() {
        const payload = obterPayloadFormularioTransporte();
        if (!payload.clienteNome || payload.clienteNome === 'Cliente nao informado') {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Informe o cliente ou selecione uma locacao para o transporte.', 'erro');
            }
            return;
        }

        const idAtual = String(lerCampo('transporteId') || '');
        const existe = idAtual && Array.isArray(transportes) && transportes.some((item) => String(item.id) === idAtual);
        payload.atualizadoEm = new Date().toISOString();

        if (!Array.isArray(transportes)) transportes = [];
        if (existe) {
            transportes = transportes.map((item) => String(item.id) === idAtual ? { ...item, ...payload } : item);
        } else {
            payload.criadoEm = new Date().toISOString();
            transportes.unshift(payload);
        }

        if (typeof registrarLog === 'function') {
            registrarLog('sistema', existe ? 'transporte_editar' : 'transporte_criar', `Transporte ${existe ? 'atualizado' : 'criado'} para ${payload.clienteNome}.`);
        }

        limparFormularioTransporte({ semRender: true });
        if (typeof salvarLocal === 'function') salvarLocal();
        if (typeof renderTudo === 'function') renderTudo();
        if (typeof sincronizar === 'function') sincronizar('salvar');
        if (typeof mostrarToast === 'function') mostrarToast('Transporte salvo com sucesso!');

        setTimeout(() => irParaTransporteLista(), 120);
    }

    function criarTransporteDaLocacao(locacao, opcoes = {}) {
        if (!locacao || !locacao.id) return null;
        if (!Array.isArray(transportes)) transportes = [];

        const tipoOperacao = textoSeguro(opcoes.tipoOperacao, 'entrega');
        const evitarDuplicado = opcoes.evitarDuplicado !== false;
        const jaExiste = transportes.some((item) => (
            String(item.locacaoId) === String(locacao.id) &&
            textoSeguro(item.tipoOperacao, 'entrega') === tipoOperacao
        ));
        if (evitarDuplicado && jaExiste) return null;

        const cliente = obterClientePorLocacao(locacao);
        const logistica = locacao.logistica || {};
        const distanciaKm = numero(opcoes.distanciaKm ?? logistica.distanciaKm, 0);
        const valorKm = numero(opcoes.valorKm ?? logistica.valorKm, obterValorKmPadrao());
        const trechos = obterTrechosTransporte(opcoes.trechos ?? logistica.trechos, 1);
        const custoEstimado = numero(opcoes.custoEstimado ?? logistica.custoFrete, distanciaKm * valorKm * trechos);

        const registro = normalizarTransporte({
            id: opcoes.id || Date.now() + Math.floor(Math.random() * 900),
            locacaoId: String(locacao.id),
            clienteNome: textoSeguro(opcoes.clienteNome, obterNomeClienteLocacao(locacao)),
            endereco: textoSeguro(opcoes.endereco, obterEnderecoLocacao(locacao, cliente)),
            cidade: textoSeguro(opcoes.cidade, obterCidadeLocacao(locacao, cliente)),
            tipoOperacao,
            veiculo: textoSeguro(opcoes.veiculo, logistica.veiculo || ''),
            placa: textoSeguro(opcoes.placa, logistica.placa || ''),
            motorista: textoSeguro(opcoes.motorista, logistica.motorista || ''),
            equipe: textoSeguro(opcoes.equipe, locacao.equipe?.responsavel || ''),
            dataSaida: textoSeguro(opcoes.dataSaida, logistica.dataSaida || obterDataSaidaLocacao(locacao)),
            horaSaida: textoSeguro(opcoes.horaSaida, logistica.horarioSaida || ''),
            dataChegada: textoSeguro(opcoes.dataChegada, logistica.dataChegada || ''),
            horaChegada: textoSeguro(opcoes.horaChegada, logistica.horarioChegada || ''),
            distanciaKm,
            valorKm,
            trechos,
            custoEstimado,
            status: textoSeguro(opcoes.status, 'pendente'),
            observacoes: textoSeguro(opcoes.observacoes, logistica.observacoes || '')
        });

        transportes.unshift(registro);

        if (opcoes.persistir) {
            if (typeof salvarLocal === 'function') salvarLocal();
            if (typeof renderTudo === 'function') renderTudo();
            if (typeof sincronizar === 'function') sincronizar('salvar');
        }

        return registro;
    }

    function limparFormularioTransporte(opcoes = {}) {
        const campos = [
            'transporteId',
            'transporteLocacao',
            'transporteClienteNome',
            'transporteEndereco',
            'transporteCidade',
            'transporteVeiculo',
            'transportePlaca',
            'transporteMotorista',
            'transporteEquipe',
            'transporteDataSaida',
            'transporteHoraSaida',
            'transporteDataChegada',
            'transporteHoraChegada',
            'transporteDistanciaKm',
            'transporteTrechos',
            'transporteObservacoes'
        ];
        campos.forEach((id) => preencherCampo(id, ''));
        preencherCampo('transporteTipoOperacao', 'entrega');
        preencherCampo('transporteStatus', 'pendente');
        preencherCampo('transporteTrechos', 1);
        preencherCampo('transporteValorKm', obterValorKmPadrao() || '');
        calcularCustoTransporte();

        if (!opcoes.semRender && typeof renderTransporteOperacional === 'function') {
            renderTransporteOperacional();
        }
    }

    function editarTransporte(id) {
        const registro = (Array.isArray(transportes) ? transportes : []).find((item) => String(item.id) === String(id));
        if (!registro) {
            if (typeof mostrarToast === 'function') mostrarToast('Transporte nao encontrado.', 'erro');
            return;
        }

        const item = normalizarTransporte(registro);
        if (typeof abrirTab === 'function') abrirTab('transporte', { semRolagem: true });
        setTimeout(() => {
            popularSelectLocacaoTransporte();
            preencherCampo('transporteId', item.id);
            preencherCampo('transporteLocacao', item.locacaoId);
            preencherCampo('transporteClienteNome', item.clienteNome);
            preencherCampo('transporteEndereco', item.endereco);
            preencherCampo('transporteCidade', item.cidade);
            preencherCampo('transporteTipoOperacao', item.tipoOperacao);
            preencherCampo('transporteVeiculo', item.veiculo);
            preencherCampo('transportePlaca', item.placa);
            preencherCampo('transporteMotorista', item.motorista);
            preencherCampo('transporteEquipe', item.equipe);
            preencherCampo('transporteDataSaida', item.dataSaida);
            preencherCampo('transporteHoraSaida', item.horaSaida);
            preencherCampo('transporteDataChegada', item.dataChegada);
            preencherCampo('transporteHoraChegada', item.horaChegada);
            preencherCampo('transporteDistanciaKm', item.distanciaKm || '');
            preencherCampo('transporteValorKm', item.valorKm || '');
            preencherCampo('transporteTrechos', item.trechos || 1);
            preencherCampo('transporteStatus', item.status);
            preencherCampo('transporteObservacoes', item.observacoes);
            calcularCustoTransporte();
            const card = document.getElementById('transporteFormularioCard');
            if (card && typeof rolarParaElementoAtalho === 'function') {
                rolarParaElementoAtalho(card, 'start', { forcar: true });
            }
            if (typeof destacarAlvoAtalho === 'function') destacarAlvoAtalho(card, 1200);
            const cliente = document.getElementById('transporteClienteNome');
            if (cliente instanceof HTMLElement) cliente.focus({ preventScroll: true });
        }, 120);
    }

    function duplicarTransporte(id) {
        const registro = (Array.isArray(transportes) ? transportes : []).find((item) => String(item.id) === String(id));
        if (!registro) return;
        const copia = normalizarTransporte({
            ...registro,
            id: Date.now(),
            status: 'pendente',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
        });
        transportes.unshift(copia);
        if (typeof salvarLocal === 'function') salvarLocal();
        if (typeof renderTudo === 'function') renderTudo();
        if (typeof sincronizar === 'function') sincronizar('salvar');
        if (typeof mostrarToast === 'function') mostrarToast('Transporte duplicado.');
    }

    function excluirTransporte(id) {
        const remover = () => {
            transportes = (Array.isArray(transportes) ? transportes : []).filter((item) => String(item.id) !== String(id));
            if (typeof salvarLocal === 'function') salvarLocal();
            if (typeof renderTudo === 'function') renderTudo();
            if (typeof sincronizar === 'function') sincronizar('salvar');
            if (typeof mostrarToast === 'function') mostrarToast('Transporte excluido.');
        };

        if (typeof confirmarAcao === 'function') {
            confirmarAcao('Excluir este transporte?', remover, { titulo: 'Excluir transporte' });
        } else if (confirm('Excluir este transporte?')) {
            remover();
        }
    }

    function alterarStatusTransporte(id, status) {
        const statusNormalizado = textoSeguro(status, 'pendente');
        transportes = (Array.isArray(transportes) ? transportes : []).map((item) => {
            if (String(item.id) !== String(id)) return item;
            const atualizado = normalizarTransporte({ ...item, status: statusNormalizado, atualizadoEm: new Date().toISOString() });
            if (statusNormalizado === 'concluido' && !atualizado.dataChegada) {
                atualizado.dataChegada = hojeIso();
            }
            return atualizado;
        });
        if (typeof salvarLocal === 'function') salvarLocal();
        if (typeof renderTudo === 'function') renderTudo();
        if (typeof sincronizar === 'function') sincronizar('salvar');
    }

    function aplicarFiltroTransporteRapido(filtro = 'todos') {
        const normalizado = String(filtro || '').trim().toLowerCase();
        filtroTransporteAtual = FILTROS_TRANSPORTE.has(normalizado) ? normalizado : 'todos';
        salvarFiltroTransportePersistido(filtroTransporteAtual);
        renderTransporteOperacional();
    }

    function atualizarFiltroVisualTransporte() {
        document.querySelectorAll('#transporteFiltros [data-filtro-transporte]').forEach((btn) => {
            const ativo = String(btn.getAttribute('data-filtro-transporte') || '') === filtroTransporteAtual;
            btn.classList.toggle('is-active', ativo);
            btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });
    }

    function calcularKpisTransporte(lista) {
        const hoje = hojeIso();
        return {
            total: lista.length,
            rota: lista.filter((item) => item.status === 'em_rota').length,
            hoje: lista.filter((item) => item.dataSaida === hoje || item.dataChegada === hoje).length,
            concluidos: lista.filter((item) => ['entregue', 'retirado', 'concluido'].includes(item.status)).length
        };
    }

    function atualizarKpisTransporte(lista) {
        const kpis = calcularKpisTransporte(lista);
        [
            ['transporteKpiTotal', kpis.total],
            ['transporteKpiRota', kpis.rota],
            ['transporteKpiHoje', kpis.hoje],
            ['transporteKpiConcluidos', kpis.concluidos]
        ].forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(valor);
        });
    }

    function filtrarTransportes(base, buscaRaw) {
        const busca = normalizarBusca(buscaRaw);
        return base.filter((item) => {
            if (filtroTransporteAtual === 'pendente' && item.status !== 'pendente') return false;
            if (filtroTransporteAtual === 'em_rota' && item.status !== 'em_rota') return false;
            if (filtroTransporteAtual === 'concluido' && !['entregue', 'retirado', 'concluido'].includes(item.status)) return false;

            if (!busca) return true;
            const alvo = normalizarBusca([
                item.clienteNome,
                item.endereco,
                item.cidade,
                item.motorista,
                item.veiculo,
                item.placa,
                item.status,
                item.tipoOperacao,
                item.locacaoId
            ].join(' '));
            return alvo.includes(busca);
        });
    }

    function renderTransporteOperacional() {
        const tabela = document.getElementById('tblTransporte');
        if (!tabela) return;

        popularSelectLocacaoTransporte();
        calcularCustoTransporte();

        const buscaRaw = String(document.getElementById('buscaTransporte')?.value || '').trim();
        const base = (Array.isArray(transportes) ? transportes : []).map(normalizarTransporte);
        const filtrados = filtrarTransportes(base, buscaRaw).sort((a, b) => {
            const dataA = a.dataSaida || '9999-12-31';
            const dataB = b.dataSaida || '9999-12-31';
            if (dataA === dataB) return Number(b.id || 0) - Number(a.id || 0);
            return dataA.localeCompare(dataB);
        });

        atualizarKpisTransporte(base);
        atualizarFiltroVisualTransporte();

        if (typeof atualizarMetaBusca === 'function') {
            const rotulos = {
                todos: 'Todos',
                pendente: 'Pendentes',
                em_rota: 'Em rota',
                concluido: 'Concluidos'
            };
            atualizarMetaBusca('metaBuscaTransporte', {
                total: base.length,
                filtrados: filtrados.length,
                rotulo: 'transportes',
                termo: buscaRaw,
                filtro: filtroTransporteAtual,
                filtroLabel: rotulos[filtroTransporteAtual] || filtroTransporteAtual
            });
        }

        if (!filtrados.length) {
            tabela.innerHTML = typeof criarLinhaTabelaEstado === 'function'
                ? criarLinhaTabelaEstado(7, {
                    tipo: 'empty',
                    titulo: 'Nenhum transporte encontrado',
                    mensagem: buscaRaw
                        ? `Nenhum transporte combina com "${buscaRaw}".`
                        : 'Cadastre entregas, retiradas ou rotas vinculadas as locacoes.'
                })
                : '<tr class="table-empty-row"><td colspan="7">Nenhum transporte encontrado.</td></tr>';
            return;
        }

        tabela.innerHTML = filtrados.map((item) => `
            <tr data-transporte-id="${html(item.id)}">
                <td>
                    <strong>${formatarDataCurtaTransporte(item.dataSaida)}</strong>
                    <small>${html(item.horaSaida || item.tipoOperacao)}</small>
                </td>
                <td>
                    <strong>${html(item.clienteNome)}</strong>
                    <small>${item.locacaoId ? `Locacao #${html(String(item.locacaoId).slice(-4))}` : 'Sem locacao vinculada'}</small>
                </td>
                <td>
                    <strong>${html(item.cidade || '-')}</strong>
                    <small>${html(item.endereco || 'Endereco nao informado')}</small>
                </td>
                <td>
                    <strong>${html(item.motorista || '-')}</strong>
                    <small>${html([item.veiculo, item.placa].filter(Boolean).join(' - ') || 'Veiculo nao definido')}</small>
                </td>
                <td><span class="badge ${badgeStatusTransporte(item.status)}">${rotuloStatusTransporte(item.status)}</span></td>
                <td>
                    <strong>${moeda(item.custoEstimado)}</strong>
                    <small>${item.distanciaKm ? `${item.distanciaKm} km x ${item.trechos || 1} trecho(s)` : 'Sem distancia'}</small>
                </td>
                <td class="col-actions">
                    <div class="actions-cell">
                        <button class="btn btn-sm btn-info table-action-btn" data-action="editarTransporte" data-arg="${html(item.id)}" title="Editar transporte"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-warning table-action-btn" data-action="alterarStatusTransporte" data-arg="${html(item.id)}" data-arg2="em_rota" title="Marcar em rota"><i class="bi bi-truck"></i></button>
                        <button class="btn btn-sm btn-success table-action-btn" data-action="alterarStatusTransporte" data-arg="${html(item.id)}" data-arg2="concluido" title="Concluir transporte"><i class="bi bi-check2"></i></button>
                        <button class="btn btn-sm btn-secondary table-action-btn" data-action="duplicarTransporte" data-arg="${html(item.id)}" title="Duplicar transporte"><i class="bi bi-copy"></i></button>
                        <button class="btn btn-sm btn-danger table-action-btn" data-action="excluirTransporte" data-arg="${html(item.id)}" title="Excluir transporte"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function irParaTransporteFormulario() {
        if (typeof abrirTab === 'function') abrirTab('transporte', { semRolagem: true });
        setTimeout(() => {
            const card = document.getElementById('transporteFormularioCard');
            if (card && typeof rolarParaElementoAtalho === 'function') {
                rolarParaElementoAtalho(card, 'start', { forcar: true });
            }
            const campo = document.getElementById('transporteClienteNome');
            if (campo instanceof HTMLElement) campo.focus({ preventScroll: true });
        }, 120);
    }

    function irParaTransporteBusca() {
        if (typeof abrirTab === 'function') abrirTab('transporte', { semRolagem: true });
        setTimeout(() => {
            const campo = document.getElementById('buscaTransporte');
            if (!campo) return;
            const alvo = campo.closest('.cadastros-search-toolbar') || campo;
            if (typeof rolarParaElementoAtalho === 'function') {
                rolarParaElementoAtalho(alvo, 'start', { forcar: true });
            }
            if (typeof destacarAlvoAtalho === 'function') destacarAlvoAtalho(alvo, 1200);
            campo.focus({ preventScroll: true });
            if (typeof campo.select === 'function') campo.select();
        }, 140);
    }

    function irParaTransporteLista() {
        const alvo = document.getElementById('transporteListaCard') || document.getElementById('tblTransporte');
        if (alvo && typeof rolarParaElementoAtalho === 'function') {
            rolarParaElementoAtalho(alvo, 'start', { forcar: true });
        } else if (alvo) {
            alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    window.calcularCustoTransporte = calcularCustoTransporte;
    window.preencherTransporteDaLocacao = preencherTransporteDaLocacao;
    window.salvarTransporte = salvarTransporte;
    window.criarTransporteDaLocacao = criarTransporteDaLocacao;
    window.limparFormularioTransporte = limparFormularioTransporte;
    window.editarTransporte = editarTransporte;
    window.duplicarTransporte = duplicarTransporte;
    window.excluirTransporte = excluirTransporte;
    window.alterarStatusTransporte = alterarStatusTransporte;
    window.aplicarFiltroTransporteRapido = aplicarFiltroTransporteRapido;
    window.renderTransporteOperacional = renderTransporteOperacional;
    window.irParaTransporteFormulario = irParaTransporteFormulario;
    window.irParaTransporteBusca = irParaTransporteBusca;
    window.irParaTransporteLista = irParaTransporteLista;
})();
