(() => {
    'use strict';

    const CAMPOS_OPERACIONAIS_AUTORIZADOS = Object.freeze([
        'items',
        'dataAluguel',
        'dataDevolucaoPrevisao',
        'datasMontagem',
        'datasDesmontagem'
    ]);
    const CAMPOS_TRANSACIONAIS_LOCACAO = Object.freeze([
        'controleEdicao',
        'historicoOperacional',
        'estoqueReserva',
        'itensHistoricosRemovidos'
    ]);
    const CAMPOS_FISICOS_PECA = Object.freeze([
        'quantidadeTotal',
        'disponivel',
        'reservado',
        'manutencao',
        'avariado',
        'perdido'
    ]);
    const COLECOES_SEM_ORDEM_SEMANTICA = new Set([
        'locadores',
        'pecas',
        'tipos',
        'usuarios',
        'locacoes',
        'devolucoes'
    ]);
    const CHAVES_METADADOS_PERSISTENCIA = new Set(['versao', 'data', 'ultimaEdicao']);
    const CAMPO_PROVAS_RECUPERACAO = 'provasRecuperacao';
    const travasPorLocacao = new Set();
    const conclusoesConfirmadasPorArmazenamento = new WeakMap();
    let prepararAutorizacaoPublicacaoConfiavel = null;
    let cancelarAutorizacaoPublicacaoConfiavel = null;
    let consultarConfirmacaoPublicacaoConfiavel = null;

    function registrarFronteiraPublicacaoConfiavel(api) {
        if (consultarConfirmacaoPublicacaoConfiavel
            || !api || typeof api !== 'object'
            || typeof api.prepararAutorizacaoPublicacao !== 'function'
            || typeof api.cancelarAutorizacaoPublicacao !== 'function'
            || typeof api.consultarConfirmacaoPublicacao !== 'function') return false;
        prepararAutorizacaoPublicacaoConfiavel = api.prepararAutorizacaoPublicacao;
        cancelarAutorizacaoPublicacaoConfiavel = api.cancelarAutorizacaoPublicacao;
        consultarConfirmacaoPublicacaoConfiavel = api.consultarConfirmacaoPublicacao;
        try {
            delete window.__registrarFronteiraPublicacaoTransacional;
        } catch (_erro) {
            // O registro e de uso unico mesmo quando o ambiente impede a remocao.
        }
        return true;
    }

    Object.defineProperty(window, '__registrarFronteiraPublicacaoTransacional', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: registrarFronteiraPublicacaoConfiavel
    });

    function clonarRetornoPublico(valor, referencias = new WeakMap()) {
        if (valor === null || typeof valor !== 'object') return valor;
        if (referencias.has(valor)) return referencias.get(valor);
        const copia = Array.isArray(valor) ? [] : {};
        referencias.set(valor, copia);
        Object.keys(valor).forEach((chave) => {
            copia[chave] = clonarRetornoPublico(valor[chave], referencias);
        });
        return copia;
    }

    function resultadoBase(codigo, opcoes = {}) {
        return {
            ok: opcoes.ok === true,
            codigo,
            aplicado: opcoes.aplicado === true,
            idempotente: opcoes.idempotente === true,
            requerRecuperacao: opcoes.requerRecuperacao === true,
            publicacaoRealizada: opcoes.publicacaoRealizada === true,
            bloqueios: clonarRetornoPublico(Array.isArray(opcoes.bloqueios) ? opcoes.bloqueios : []),
            avisos: clonarRetornoPublico(Array.isArray(opcoes.avisos) ? opcoes.avisos : []),
            operacao: clonarRetornoPublico(opcoes.operacao || null),
            efeitos: {
                renderizar: opcoes.renderizar === true,
                sincronizar: opcoes.sincronizar === true
            }
        };
    }

    function referenciaEstrita(valor) {
        if (typeof valor === 'string' && valor.length <= 200
            && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(valor)) {
            return `string:${valor}`;
        }
        if (typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0) {
            return `number:${valor}`;
        }
        return '';
    }

    function inteiroSeguroNaoNegativo(valor) {
        return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0
            ? valor
            : null;
    }

    function inteiroLegadoNaoNegativo(valor) {
        if (typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0) return valor;
        if (typeof valor === 'string' && /^\d+$/.test(valor.trim())) {
            const numero = Number(valor);
            return Number.isSafeInteger(numero) ? numero : null;
        }
        return null;
    }

    function textoObrigatorio(valor, limite = 500) {
        return typeof valor === 'string' && valor.trim() && valor.length <= limite
            ? valor.trim()
            : '';
    }

    function assinaturaValida(valor) {
        return typeof valor === 'string'
            && /^ajuste-reserva-v1:fnv1a64:[a-f0-9]{16}$/.test(valor);
    }

    function resultadoClonagem(clonar, valor) {
        if (typeof clonar !== 'function') {
            return { ok: false, codigo: 'DEPENDENCIA_CLONAGEM_AUSENTE', valor: null, json: '' };
        }
        const resultado = clonar(valor);
        return resultado && typeof resultado === 'object'
            ? resultado
            : { ok: false, codigo: 'FALHA_CLONAGEM', valor: null, json: '' };
    }

    function clonarJsonInterno(valor) {
        try {
            const json = JSON.stringify(valor);
            if (typeof json !== 'string') {
                return { ok: false, codigo: 'ESTADO_NAO_SERIALIZAVEL', valor: null, json: '' };
            }
            return { ok: true, codigo: 'SUCESSO', valor: JSON.parse(json), json };
        } catch (_erro) {
            return { ok: false, codigo: 'ESTADO_NAO_SERIALIZAVEL', valor: null, json: '' };
        }
    }

    function clonarDescartavel(valor) {
        const clonagem = clonarJsonInterno(valor);
        return clonagem.ok ? clonagem.valor : null;
    }

    function prepararEstadoOperacionalInterno(snapshot) {
        const clonagem = clonarJsonInterno(snapshot);
        if (!clonagem.ok || !clonagem.valor || typeof clonagem.valor !== 'object'
            || Array.isArray(clonagem.valor)) return clonagem;
        CHAVES_METADADOS_PERSISTENCIA.forEach((chave) => delete clonagem.valor[chave]);
        const jsonEstrutural = JSON.stringify(clonagem.valor);
        const canonico = ordenarChavesCanonicas(clonagem.valor);
        const json = JSON.stringify(canonico);
        return {
            ok: true,
            codigo: 'SUCESSO',
            valor: clonagem.valor,
            json,
            jsonEstrutural,
            fingerprint: fingerprintFnv1a64(json)
        };
    }

    function validarValorExternoPersistivel(valor, vistos = new WeakSet()) {
        if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return true;
        if (typeof valor === 'number') return Number.isFinite(valor);
        if (typeof valor !== 'object' || vistos.has(valor)) return false;
        const prototipo = Object.getPrototypeOf(valor);
        if (prototipo !== Object.prototype && prototipo !== Array.prototype) return false;
        vistos.add(valor);
        const chaves = Reflect.ownKeys(valor);
        if (chaves.some((chave) => typeof chave === 'symbol')) return false;
        const descritores = Object.getOwnPropertyDescriptors(valor);
        if (Array.isArray(valor)) {
            const descritorLength = descritores.length;
            if (!descritorLength || descritorLength.value !== valor.length
                || descritorLength.enumerable !== false || descritorLength.writable !== true) return false;
            for (let indice = 0; indice < valor.length; indice += 1) {
                if (!Object.prototype.hasOwnProperty.call(descritores, String(indice))) return false;
            }
        }
        return chaves.every((chave) => {
            const descritor = descritores[chave];
            if (Array.isArray(valor) && chave === 'length') return true;
            return descritor
                && Object.prototype.hasOwnProperty.call(descritor, 'value')
                && typeof descritor.get === 'undefined'
                && typeof descritor.set === 'undefined'
                && descritor.enumerable === true
                && validarValorExternoPersistivel(descritor.value, vistos);
        });
    }

    function validarSnapshotReservaExterno(snapshot) {
        const objetoSimples = (valor) => valor && typeof valor === 'object'
            && !Array.isArray(valor) && Object.getPrototypeOf(valor) === Object.prototype;
        const chavesExatas = (valor, esperadas) => {
            const atuais = Object.keys(valor).sort();
            const previstas = esperadas.slice().sort();
            return atuais.length === previstas.length
                && atuais.every((chave, indice) => chave === previstas[indice]);
        };
        const quantidadeValida = (valor) => typeof valor === 'number'
            && Number.isFinite(valor) && valor >= 0;
        if (!objetoSimples(snapshot)
            || !chavesExatas(snapshot, ['versao', 'origem', 'capturadoEm', 'statusReserva', 'periodo', 'itens'])
            || snapshot.versao !== 1
            || typeof snapshot.origem !== 'string'
            || typeof snapshot.capturadoEm !== 'string'
            || typeof snapshot.statusReserva !== 'string'
            || !objetoSimples(snapshot.periodo)
            || !chavesExatas(snapshot.periodo, ['inicio', 'fim', 'completo'])
            || ![null, 'string'].includes(snapshot.periodo.inicio === null ? null : typeof snapshot.periodo.inicio)
            || ![null, 'string'].includes(snapshot.periodo.fim === null ? null : typeof snapshot.periodo.fim)
            || typeof snapshot.periodo.completo !== 'boolean'
            || !Array.isArray(snapshot.itens)) return false;
        return snapshot.itens.every((item) => objetoSimples(item)
            && chavesExatas(item, ['pecaId', 'quantidadePropria', 'quantidadePendente', 'itemIds'])
            && typeof item.pecaId === 'string'
            && quantidadeValida(item.quantidadePropria)
            && quantidadeValida(item.quantidadePendente)
            && item.quantidadePendente <= item.quantidadePropria
            && Array.isArray(item.itemIds)
            && item.itemIds.every((itemId) => typeof itemId === 'string' && itemId.length > 0));
    }

    function normalizarDataSnapshotReserva(valor) {
        const texto = valor == null ? '' : String(valor).trim();
        if (!texto) return '';
        const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
        const brasileiro = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const partes = iso
            ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
            : brasileiro
                ? [Number(brasileiro[3]), Number(brasileiro[2]), Number(brasileiro[1])]
                : null;
        if (!partes) return '';
        const [ano, mes, dia] = partes;
        const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));
        if (dataUtc.getUTCFullYear() !== ano || dataUtc.getUTCMonth() !== mes - 1
            || dataUtc.getUTCDate() !== dia) return '';
        return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }

    function inteiroDominioNaoNegativo(valor) {
        const numero = Number(valor);
        return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
    }

    function quantidadePropriaSnapshot(item) {
        const quantidadeTotal = inteiroDominioNaoNegativo(item?.quantidade);
        const possuiOrigem = Object.prototype.hasOwnProperty.call(item || {}, 'origemCusto');
        const origem = item?.origemCusto == null ? '' : String(item.origemCusto).trim().toLowerCase();
        if (!possuiOrigem || !origem || origem === 'nao_informado') return quantidadeTotal;
        if (origem === 'terceirizado') return 0;
        if (origem === 'proprio') return quantidadeTotal;
        if (origem === 'misto') {
            return Math.min(inteiroDominioNaoNegativo(item?.quantidadePropria), quantidadeTotal);
        }
        return quantidadeTotal;
    }

    function normalizarItemIdSnapshot(valor) {
        const itemId = valor == null ? '' : String(valor).trim();
        return itemId.length <= 160 && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(itemId)
            ? itemId
            : '';
    }

    function atribuirItemIdsSnapshot(locacaoId, itens) {
        const lista = Array.isArray(itens) ? itens : [];
        const primeiraOcorrencia = new Map();
        lista.forEach((item, indice) => {
            const itemId = normalizarItemIdSnapshot(item?.itemId);
            if (itemId && !primeiraOcorrencia.has(itemId)) primeiraOcorrencia.set(itemId, indice);
        });
        const usados = new Set(primeiraOcorrencia.keys());
        const parteLocacao = String(locacaoId ?? 'nova').trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'nova';
        return lista.map((item, indice) => {
            const informado = normalizarItemIdSnapshot(item?.itemId);
            if (informado && primeiraOcorrencia.get(informado) === indice) return { item, itemId: informado };
            let numeroItem = indice + 1;
            let itemId = `loc-${parteLocacao}-item-${numeroItem}`;
            while (usados.has(itemId)) {
                numeroItem += 1;
                itemId = `loc-${parteLocacao}-item-${numeroItem}`;
            }
            usados.add(itemId);
            return { item, itemId };
        });
    }

    function criarSnapshotReservaInterno(locacao, opcoes) {
        const agrupados = new Map();
        atribuirItemIdsSnapshot(locacao?.id, locacao?.items).forEach(({ item, itemId }) => {
            const pecaId = item?.pecaId == null ? '' : String(item.pecaId).trim();
            const chave = pecaId ? `peca:${pecaId}` : `sem-vinculo:${itemId}`;
            const quantidadePropria = quantidadePropriaSnapshot(item);
            const quantidadePendente = Math.max(
                quantidadePropria
                - inteiroDominioNaoNegativo(item?.devolvidos)
                - inteiroDominioNaoNegativo(item?.avariadosEstoqueProprio),
                0
            );
            const atual = agrupados.get(chave) || {
                pecaId,
                quantidadePropria: 0,
                quantidadePendente: 0,
                itemIds: []
            };
            atual.quantidadePropria += quantidadePropria;
            atual.quantidadePendente += quantidadePendente;
            atual.itemIds.push(itemId);
            agrupados.set(chave, atual);
        });
        const inicio = normalizarDataSnapshotReserva(locacao?.datasMontagem?.inicio || locacao?.dataAluguel || '');
        const fim = normalizarDataSnapshotReserva(
            locacao?.datasDesmontagem?.fim || locacao?.datasDesmontagem?.inicio
            || locacao?.dataDevolucaoPrevisao || ''
        );
        const inicioMs = inicio ? Date.parse(`${inicio}T00:00:00Z`) : null;
        const fimMs = fim ? Date.parse(`${fim}T00:00:00Z`) : null;
        return {
            versao: 1,
            origem: String(opcoes.origem),
            capturadoEm: String(opcoes.capturadoEm),
            statusReserva: String(opcoes.statusReserva ?? ''),
            periodo: {
                inicio,
                fim,
                completo: Number.isFinite(inicioMs) && Number.isFinite(fimMs) && fimMs >= inicioMs
            },
            itens: Array.from(agrupados.values())
        };
    }

    function localizarLocacaoUnica(locacoes, locacaoId) {
        const referencia = referenciaEstrita(locacaoId);
        if (!referencia || !Array.isArray(locacoes)) return { locacao: null, indice: -1, quantidade: 0 };
        const indices = [];
        locacoes.forEach((locacao, indice) => {
            const id = locacao?.id ?? locacao?.locacaoId;
            if (referenciaEstrita(id) === referencia) indices.push(indice);
        });
        return {
            locacao: indices.length === 1 ? locacoes[indices[0]] : null,
            indice: indices.length === 1 ? indices[0] : -1,
            quantidade: indices.length
        };
    }

    function historicosGlobais(locacoes) {
        return (Array.isArray(locacoes) ? locacoes : []).flatMap((locacao) => (
            Array.isArray(locacao?.historicoOperacional) ? locacao.historicoOperacional : []
        ));
    }

    function auditoriasDaOperacao(estado, operacaoId) {
        return (Array.isArray(estado?.logsAuditoria) ? estado.logsAuditoria : [])
            .filter((registro) => registro?.operacaoId === operacaoId);
    }

    function obterIndiceConclusoes(armazenamento) {
        if (!armazenamento || (typeof armazenamento !== 'object'
            && typeof armazenamento !== 'function')) return null;
        let indice = conclusoesConfirmadasPorArmazenamento.get(armazenamento);
        if (!indice) {
            indice = new Map();
            conclusoesConfirmadasPorArmazenamento.set(armazenamento, indice);
        }
        return indice;
    }

    function registrarConclusaoConfirmada(armazenamento, dados) {
        const indice = obterIndiceConclusoes(armazenamento);
        if (!indice) return;
        indice.set(dados.operacaoId, {
            locacaoReferencia: referenciaEstrita(dados.locacaoId),
            assinaturaPlano: dados.assinaturaPlano,
            chaveArmazenamento: dados.chaveArmazenamento,
            revisaoConfirmada: dados.revisaoConfirmada
        });
    }

    function verificarConclusaoPersistidaObsoleta(entrada, dependencias) {
        const indice = obterIndiceConclusoes(dependencias.armazenamento);
        const conclusao = indice?.get(entrada.operacaoId);
        if (!conclusao) return null;
        const referencia = referenciaEstrita(entrada.locacaoId);
        if (conclusao.locacaoReferencia !== referencia
            || conclusao.assinaturaPlano !== entrada.assinaturaPlanoEsperada) {
            return {
                valido: false,
                estado: 'inconsistente',
                codigo: conclusao.locacaoReferencia !== referencia
                    ? 'OPERACAO_ID_ASSOCIADO_A_OUTRA_LOCACAO'
                    : 'ASSINATURA_DIVERGENTE'
            };
        }
        try {
            const json = dependencias.armazenamento.getItem(conclusao.chaveArmazenamento);
            if (typeof json !== 'string' || !json) {
                return { valido: false, estado: 'parcial', codigo: 'EVIDENCIA_PERSISTIDA_INDISPONIVEL' };
            }
            const estadoPersistido = JSON.parse(json);
            const localizacao = localizarLocacaoUnica(estadoPersistido.locacoes, entrada.locacaoId);
            if (localizacao.quantidade !== 1) {
                return { valido: false, estado: 'parcial', codigo: 'LOCACAO_PERSISTIDA_NAO_ENCONTRADA' };
            }
            const controlePersistido = dependencias.normalizarControleEdicaoLocacao(localizacao.locacao);
            if (!controlePersistido?.valido
                || controlePersistido.revisao !== conclusao.revisaoConfirmada) {
                return { valido: false, estado: 'parcial', codigo: 'REVISAO_PERSISTIDA_REVERTIDA' };
            }
            const estadoOperacao = verificarIdempotencia(
                entrada,
                estadoPersistido,
                localizacao.locacao,
                dependencias
            );
            if (estadoOperacao?.estado === 'concluida' && estadoOperacao?.valido === true) {
                return estadoOperacao;
            }
            return {
                valido: false,
                estado: 'parcial',
                codigo: estadoOperacao?.estado === 'nao_executada'
                    ? 'EVIDENCIA_PERSISTIDA_REVERTIDA'
                    : (estadoOperacao?.codigo || 'EVIDENCIA_PERSISTIDA_INCOERENTE'),
                evidencias: estadoOperacao?.evidencias
            };
        } catch (_erro) {
            return { valido: false, estado: 'parcial', codigo: 'EVIDENCIA_PERSISTIDA_INVALIDA' };
        }
    }

    function montarPlanoParaEvidencias(operacaoId, locacaoId, assinatura, estado) {
        const referencia = referenciaEstrita(locacaoId);
        const historicos = historicosGlobais(estado?.locacoes);
        const historico = historicos.find((registro) => (
            registro?.operacaoId === operacaoId
            && referenciaEstrita(registro?.locacaoId) === referencia
            && registro?.assinaturaPlano === assinatura
        ));
        const quantidadeReservar = inteiroSeguroNaoNegativo(historico?.resumoMovimentacoes?.reservar);
        const quantidadeEvidencias = inteiroSeguroNaoNegativo(historico?.resumoMovimentacoes?.evidencias);
        const quantidadeLiberar = inteiroSeguroNaoNegativo(historico?.resumoMovimentacoes?.liberar)
            ?? quantidadeEvidencias;
        const movimentos = (Array.isArray(estado?.movimentacoesEstoque) ? estado.movimentacoesEstoque : [])
            .filter((registro) => registro?.operacaoId === operacaoId
                && referenciaEstrita(registro?.locacaoId) === referencia);
        const inferir = (subtipo) => movimentos.filter((registro) => (
            registro?.subtipoMovimentacao === subtipo
        )).length;
        const reservar = quantidadeReservar ?? inferir('reserva_ajuste');
        const liberar = quantidadeLiberar ?? inferir('liberacao_ajuste');
        return {
            ajustes: {
                reservar: Array.from({ length: reservar }, () => ({})),
                liberar: Array.from({ length: liberar }, () => ({}))
            }
        };
    }

    function verificarIdempotencia(entrada, estado, locacao, dependencias) {
        const planoEvidencias = montarPlanoParaEvidencias(
            entrada.operacaoId,
            entrada.locacaoId,
            entrada.assinaturaPlanoEsperada,
            estado
        );
        const resultado = dependencias.verificarEstadoOperacaoLocacao({
            locacao,
            operacaoId: entrada.operacaoId,
            assinaturaPlano: entrada.assinaturaPlanoEsperada,
            plano: planoEvidencias,
            movimentacoes: Array.isArray(estado.movimentacoesEstoque) ? estado.movimentacoesEstoque : [],
            historicoOperacional: historicosGlobais(estado.locacoes)
        });
        const auditorias = auditoriasDaOperacao(estado, entrada.operacaoId);
        const referencia = referenciaEstrita(entrada.locacaoId);
        const auditoriasCoerentes = auditorias.filter((registro) => (
            referenciaEstrita(registro?.locacaoId) === referencia
            && registro?.assinaturaPlano === entrada.assinaturaPlanoEsperada
        ));
        if (auditorias.length > 0 && auditoriasCoerentes.length !== auditorias.length) {
            return {
                valido: false,
                estado: 'inconsistente',
                codigo: 'AUDITORIA_OPERACAO_INCONSISTENTE',
                evidencias: { ...resultado?.evidencias, auditorias: auditorias.length }
            };
        }
        if (resultado?.estado === 'concluida' && auditoriasCoerentes.length !== 1) {
            return {
                valido: false,
                estado: 'parcial',
                codigo: 'AUDITORIA_OPERACAO_AUSENTE_OU_DUPLICADA',
                evidencias: { ...resultado?.evidencias, auditorias: auditoriasCoerentes.length }
            };
        }
        if (resultado?.estado === 'nao_executada' && auditoriasCoerentes.length > 0) {
            return {
                valido: false,
                estado: 'parcial',
                codigo: 'OPERACAO_PARCIAL',
                evidencias: { ...resultado?.evidencias, auditorias: auditoriasCoerentes.length }
            };
        }
        return resultado;
    }

    function somarDeltasIndividuais(plano) {
        const reservar = new Map();
        const liberar = new Map();
        const itensReserva = [];
        const itensLiberacao = [];
        let invalido = false;

        (Array.isArray(plano?.itens) ? plano.itens : []).forEach((item) => {
            const itemId = textoObrigatorio(item?.itemId, 200);
            const quantidadeReservar = inteiroSeguroNaoNegativo(item?.delta?.reservar);
            const quantidadeLiberar = inteiroSeguroNaoNegativo(item?.delta?.liberar);
            if (!itemId || quantidadeReservar === null || quantidadeLiberar === null) {
                invalido = true;
                return;
            }
            if (quantidadeReservar > 0) {
                const pecaId = textoObrigatorio(item?.pecaIdPretendido, 200);
                if (!pecaId) invalido = true;
                else {
                    reservar.set(pecaId, (reservar.get(pecaId) || 0) + quantidadeReservar);
                    itensReserva.push({ item, itemId, pecaId, quantidade: quantidadeReservar });
                }
            }
            if (quantidadeLiberar > 0) {
                const pecaId = textoObrigatorio(item?.pecaIdAtual, 200);
                if (!pecaId) invalido = true;
                else {
                    liberar.set(pecaId, (liberar.get(pecaId) || 0) + quantidadeLiberar);
                    itensLiberacao.push({ item, itemId, pecaId, quantidade: quantidadeLiberar });
                }
            }
        });
        return { reservar, liberar, itensReserva, itensLiberacao, invalido };
    }

    function agruparAjustesPlano(lista) {
        const mapa = new Map();
        let invalido = false;
        (Array.isArray(lista) ? lista : []).forEach((ajuste) => {
            const pecaId = textoObrigatorio(ajuste?.pecaId, 200);
            const quantidade = inteiroSeguroNaoNegativo(ajuste?.quantidade);
            if (!pecaId || quantidade === null || quantidade <= 0 || mapa.has(pecaId)) {
                invalido = true;
                return;
            }
            mapa.set(pecaId, quantidade);
        });
        return { mapa, invalido };
    }

    function mapasIguais(a, b) {
        if (a.size !== b.size) return false;
        return Array.from(a.entries()).every(([chave, valor]) => b.get(chave) === valor);
    }

    function reconciliarDeltas(plano) {
        const individuais = somarDeltasIndividuais(plano);
        const agrupadoReserva = agruparAjustesPlano(plano?.ajustes?.reservar);
        const agrupadoLiberacao = agruparAjustesPlano(plano?.ajustes?.liberar);
        const valido = !individuais.invalido
            && !agrupadoReserva.invalido
            && !agrupadoLiberacao.invalido
            && mapasIguais(individuais.reservar, agrupadoReserva.mapa)
            && mapasIguais(individuais.liberar, agrupadoLiberacao.mapa);
        return { valido, ...individuais };
    }

    function chaveMovimentacao(operacaoId, locacaoId, subtipo, itemId, pecaId) {
        return [
            'ajuste-reserva-locacao-v1',
            operacaoId,
            referenciaEstrita(locacaoId),
            subtipo,
            itemId,
            pecaId
        ].join('|');
    }

    function criarMovimentacoes(reconciliacao, metadados) {
        const criar = (registro, subtipo) => {
            const chave = chaveMovimentacao(
                metadados.operacaoId,
                metadados.locacaoId,
                subtipo,
                registro.itemId,
                registro.pecaId
            );
            const pendenteAtual = inteiroSeguroNaoNegativo(registro.item?.quantidades?.pendenteAtual) ?? 0;
            const saldoPosterior = subtipo === 'reserva_ajuste'
                ? pendenteAtual + registro.quantidade
                : Math.max(pendenteAtual - registro.quantidade, 0);
            return {
                id: chave,
                movimentacaoId: chave,
                chaveIdempotencia: chave,
                tipoMovimentacao: 'ajuste',
                subtipoMovimentacao: subtipo,
                locacaoId: metadados.locacaoId,
                operacaoId: metadados.operacaoId,
                assinaturaPlano: metadados.assinaturaPlano,
                itemId: registro.itemId,
                pecaId: registro.pecaId,
                quantidade: registro.quantidade,
                dataHora: metadados.atualizadoEm,
                usuario: metadados.atualizadoPor,
                revisaoAnterior: metadados.revisaoEsperada,
                revisaoNova: metadados.revisaoNova,
                periodoAnterior: copiarPeriodo(metadados.periodoAnterior),
                periodoNovo: copiarPeriodo(metadados.periodoNovo),
                saldoAntes: pendenteAtual,
                saldoDepois: saldoPosterior,
                saldoInformativo: 'quantidade_propria_pendente_item',
                origemEvento: 'ajuste_transacional_reserva_locacao',
                statusProcessamento: 'confirmado'
            };
        };
        return [
            ...reconciliacao.itensReserva.map((item) => criar(item, 'reserva_ajuste')),
            ...reconciliacao.itensLiberacao.map((item) => criar(item, 'liberacao_ajuste'))
        ];
    }

    function camposNaoAutorizados(dadosEditados) {
        const permitidos = new Set(CAMPOS_OPERACIONAIS_AUTORIZADOS);
        return Object.keys(dadosEditados).filter((campo) => !permitidos.has(campo));
    }

    function validarItemIdsHistoricos(locacao, dadosEditados) {
        const bloqueios = [];
        const lerIds = (lista) => (Array.isArray(lista) ? lista : [])
            .map((item) => textoObrigatorio(item?.itemId, 200))
            .filter(Boolean);
        const ativosAtuais = lerIds(locacao?.items);
        const ativosPretendidos = lerIds(dadosEditados?.items);
        const historicos = lerIds(locacao?.itensHistoricosRemovidos);
        const duplicados = (ids) => ids.filter((id, indice) => ids.indexOf(id) !== indice);
        const idsHistoricos = new Set(historicos);
        const reutilizados = Array.from(new Set([
            ...ativosAtuais.filter((id) => idsHistoricos.has(id)),
            ...ativosPretendidos.filter((id) => idsHistoricos.has(id))
        ])).sort();
        if (duplicados(historicos).length) {
            bloqueios.push({
                codigo: 'ITEM_ID_HISTORICO_DUPLICADO',
                itemIds: Array.from(new Set(duplicados(historicos))).sort()
            });
        }
        if (duplicados(ativosAtuais).length || duplicados(ativosPretendidos).length) {
            bloqueios.push({
                codigo: 'ITEM_ID_ATIVO_DUPLICADO',
                itemIds: Array.from(new Set([
                    ...duplicados(ativosAtuais),
                    ...duplicados(ativosPretendidos)
                ])).sort()
            });
        }
        if (reutilizados.length) {
            bloqueios.push({ codigo: 'ITEM_ID_HISTORICO_REUTILIZADO', itemIds: reutilizados });
        }
        return bloqueios;
    }

    function ordenarChavesCanonicas(valor, caminho = []) {
        if (Array.isArray(valor)) {
            const itens = valor.map((item, indice) => ordenarChavesCanonicas(item, [...caminho, indice]));
            if (caminho.length === 1 && COLECOES_SEM_ORDEM_SEMANTICA.has(caminho[0])) {
                return itens.map((item, indice) => {
                    const idCanonico = item && typeof item === 'object'
                        ? referenciaEstrita(item.id)
                        : '';
                    return {
                        item,
                        indice,
                        chave: `${idCanonico ? `0:${idCanonico}` : '1:sem-id'}:${JSON.stringify(item)}`
                    };
                })
                    .sort((a, b) => {
                        if (a.chave < b.chave) return -1;
                        if (a.chave > b.chave) return 1;
                        return a.indice - b.indice;
                    })
                    .map((registro) => registro.item);
            }
            return itens;
        }
        if (!valor || typeof valor !== 'object') return valor;
        return Object.keys(valor).sort().reduce((resultado, chave) => {
            resultado[chave] = ordenarChavesCanonicas(valor[chave], [...caminho, chave]);
            return resultado;
        }, {});
    }

    function canonicalizarFingerprintRecuperacao(valor, caminho = []) {
        if (Array.isArray(valor)) {
            const itens = valor.map((item, indice) => (
                canonicalizarFingerprintRecuperacao(item, [...caminho, indice])
            ));
            if (caminho.length === 1 && COLECOES_SEM_ORDEM_SEMANTICA.has(caminho[0])) {
                return itens.map((item, indice) => {
                    const idCanonico = item && typeof item === 'object'
                        ? referenciaEstrita(item.id ?? item.locacaoId)
                        : '';
                    return {
                        item,
                        indice,
                        chave: `${idCanonico ? `0:${idCanonico}` : '1:sem-id'}:${JSON.stringify(item)}`
                    };
                }).sort((a, b) => {
                    if (a.chave < b.chave) return -1;
                    if (a.chave > b.chave) return 1;
                    return a.indice - b.indice;
                }).map((registro) => registro.item);
            }
            return itens;
        }
        if (!valor || typeof valor !== 'object') return valor;
        return Object.keys(valor).sort().reduce((resultado, chave) => {
            if (caminho.length === 0 && CHAVES_METADADOS_PERSISTENCIA.has(chave)) return resultado;
            resultado[chave] = canonicalizarFingerprintRecuperacao(valor[chave], [...caminho, chave]);
            return resultado;
        }, {});
    }

    function removerProvasTecnicasOperacao(valor, identidade, escopo) {
        const referenciaLocacao = referenciaEstrita(identidade.locacaoId);
        const registroAlvo = (registro) => registro?.operacaoId === identidade.operacaoId
            && registro?.assinaturaPlano === identidade.assinaturaPlano
            && referenciaEstrita(registro?.locacaoId) === referenciaLocacao;
        const limparLocacao = (locacao) => {
            if (referenciaEstrita(locacao?.id ?? locacao?.locacaoId) !== referenciaLocacao) return;
            (Array.isArray(locacao.historicoOperacional) ? locacao.historicoOperacional : [])
                .filter(registroAlvo)
                .forEach((registro) => delete registro[CAMPO_PROVAS_RECUPERACAO]);
        };
        if (escopo === 'locacao') {
            limparLocacao(valor);
            return;
        }
        (Array.isArray(valor?.locacoes) ? valor.locacoes : []).forEach(limparLocacao);
        (Array.isArray(valor?.logsAuditoria) ? valor.logsAuditoria : [])
            .filter(registroAlvo)
            .forEach((registro) => delete registro[CAMPO_PROVAS_RECUPERACAO]);
    }

    function fingerprintFnv1a64(texto) {
        let hash = 0xcbf29ce484222325n;
        const primo = 0x100000001b3n;
        for (let indice = 0; indice < texto.length; indice += 1) {
            hash ^= BigInt(texto.charCodeAt(indice));
            hash = BigInt.asUintN(64, hash * primo);
        }
        return hash.toString(16).padStart(16, '0');
    }

    function gerarFingerprintRecuperacao(valor, clonar, identidade, escopo) {
        const clonagem = resultadoClonagem(clonar, valor);
        if (!clonagem.ok) return clonagem;
        removerProvasTecnicasOperacao(clonagem.valor, identidade, escopo);
        const json = JSON.stringify(canonicalizarFingerprintRecuperacao(clonagem.valor));
        return {
            ok: true,
            codigo: 'SUCESSO',
            fingerprint: `recuperacao-estado-v1:fnv1a64:${fingerprintFnv1a64(json)}`
        };
    }

    function anexarProvasRecuperacao(construcao, estadoAnterior, locacaoAnterior,
        entrada, revisaoPosterior, clonar) {
        const identidade = {
            locacaoId: entrada.locacaoId,
            operacaoId: entrada.operacaoId,
            assinaturaPlano: entrada.assinaturaPlanoEsperada
        };
        const estadoDepois = gerarFingerprintRecuperacao(
            construcao.candidato, clonar, identidade, 'estado'
        );
        const estadoAntes = gerarFingerprintRecuperacao(
            estadoAnterior, clonar, identidade, 'estado'
        );
        const locacaoAntes = gerarFingerprintRecuperacao(
            locacaoAnterior, clonar, identidade, 'locacao'
        );
        const locacaoDepois = gerarFingerprintRecuperacao(
            construcao.locacaoCandidata, clonar, identidade, 'locacao'
        );
        const resultados = [estadoAntes, estadoDepois, locacaoAntes, locacaoDepois];
        const falha = resultados.find((resultado) => !resultado.ok);
        if (falha) return falha;
        const provas = {
            versao: 1,
            fingerprintEstadoAnterior: estadoAntes.fingerprint,
            fingerprintEstadoPosterior: estadoDepois.fingerprint,
            fingerprintLocacaoAnterior: locacaoAntes.fingerprint,
            fingerprintLocacaoPosterior: locacaoDepois.fingerprint,
            revisaoAnterior: entrada.revisaoEsperada,
            revisaoPosterior,
            operacaoId: entrada.operacaoId,
            assinaturaPlano: entrada.assinaturaPlanoEsperada
        };
        construcao.historico[CAMPO_PROVAS_RECUPERACAO] = { ...provas };
        const auditoria = construcao.candidato.logsAuditoria.find((registro) => (
            registro?.operacaoId === entrada.operacaoId
            && referenciaEstrita(registro?.locacaoId) === referenciaEstrita(entrada.locacaoId)
            && registro?.assinaturaPlano === entrada.assinaturaPlanoEsperada
        ));
        if (!auditoria) return { ok: false, codigo: 'AUDITORIA_OPERACAO_AUSENTE_OU_DUPLICADA' };
        auditoria[CAMPO_PROVAS_RECUPERACAO] = { ...provas };
        return { ok: true, codigo: 'SUCESSO' };
    }

    function copiarPeriodo(periodo) {
        return {
            inicio: typeof periodo?.inicio === 'string' ? periodo.inicio : '',
            fim: typeof periodo?.fim === 'string' ? periodo.fim : '',
            completo: periodo?.completo === true
        };
    }

    function mesclarObjetoPreservandoCampos(atual, editado) {
        if (!atual || typeof atual !== 'object' || Array.isArray(atual)
            || !editado || typeof editado !== 'object' || Array.isArray(editado)) {
            return editado;
        }
        const resultado = { ...atual };
        Object.keys(editado).forEach((campo) => {
            resultado[campo] = mesclarObjetoPreservandoCampos(atual[campo], editado[campo]);
        });
        return resultado;
    }

    function preservarCamposItensAtuais(locacao, dadosEditados) {
        const atuais = new Map((Array.isArray(locacao?.items) ? locacao.items : [])
            .map((item) => [textoObrigatorio(item?.itemId, 200), item])
            .filter(([itemId]) => itemId));
        return {
            ...dadosEditados,
            items: dadosEditados.items.map((item) => {
                const itemId = textoObrigatorio(item?.itemId, 200);
                const atual = itemId ? atuais.get(itemId) : null;
                return atual ? mesclarObjetoPreservandoCampos(atual, item) : item;
            })
        };
    }

    function removerCampos(objeto, campos) {
        const copia = { ...objeto };
        campos.forEach((campo) => delete copia[campo]);
        return copia;
    }

    function preservarTombstones(locacaoAtual, locacaoCandidata, plano, metadados, clonar) {
        const existentes = Array.isArray(locacaoCandidata.itensHistoricosRemovidos)
            ? locacaoCandidata.itensHistoricosRemovidos.slice()
            : [];
        const idsExistentes = new Set(existentes.map((item) => item?.itemId).filter(Boolean));
        const atuais = new Map((Array.isArray(locacaoAtual.items) ? locacaoAtual.items : [])
            .map((item) => [item?.itemId, item]));
        const removidos = (Array.isArray(plano?.itens) ? plano.itens : [])
            .filter((item) => item?.situacao === 'removido' && item?.preservarHistorico === true);
        for (const itemPlano of removidos) {
            if (idsExistentes.has(itemPlano.itemId)) continue;
            const itemAtual = atuais.get(itemPlano.itemId);
            const copia = resultadoClonagem(clonar, itemAtual);
            if (!copia.ok) return copia;
            existentes.push({
                ...copia.valor,
                itemId: itemPlano.itemId,
                pecaId: itemPlano.pecaIdAtual,
                quantidadePropriaDevolvida: itemPlano.quantidades.devolvida,
                quantidadePropriaAvariada: itemPlano.quantidades.avariada,
                removidoEm: metadados.atualizadoEm,
                removidoPor: metadados.atualizadoPor,
                locacaoId: metadados.locacaoId,
                operacaoId: metadados.operacaoId,
                assinaturaPlano: metadados.assinaturaPlano,
                revisaoRemocao: metadados.revisaoNova
            });
            idsExistentes.add(itemPlano.itemId);
        }
        locacaoCandidata.itensHistoricosRemovidos = existentes;
        return { ok: true, codigo: 'SUCESSO' };
    }

    function validarPecasIntactas(antes, depois, clonar) {
        const anterior = resultadoClonagem(clonar, antes);
        const posterior = resultadoClonagem(clonar, depois);
        if (!anterior.ok || !posterior.ok) return false;
        if (anterior.json !== posterior.json) return false;
        return (Array.isArray(antes) ? antes : []).every((peca, indice) => (
            CAMPOS_FISICOS_PECA.every((campo) => peca?.[campo] === depois?.[indice]?.[campo])
        ));
    }

    function validarLocacaoPreservada(atual, candidata, clonar) {
        const ignorar = [...CAMPOS_OPERACIONAIS_AUTORIZADOS, ...CAMPOS_TRANSACIONAIS_LOCACAO];
        const anterior = resultadoClonagem(clonar, removerCampos(atual, ignorar));
        const posterior = resultadoClonagem(clonar, removerCampos(candidata, ignorar));
        return anterior.ok && posterior.ok && anterior.json === posterior.json;
    }

    function construirCandidato(estado, locacaoAtual, indiceLocacao, dadosEditados, plano,
        reconciliacao, registroOperacao, checkpoint, entrada, dependencias) {
        const clonagem = resultadoClonagem(dependencias.clonarJsonPersistivelEstrito, estado);
        if (!clonagem.ok) return clonagem;
        const candidato = clonagem.valor;
        const locacaoCandidata = candidato.locacoes[indiceLocacao];
        CAMPOS_OPERACIONAIS_AUTORIZADOS.forEach((campo) => {
            if (Object.prototype.hasOwnProperty.call(dadosEditados, campo)) {
                locacaoCandidata[campo] = dadosEditados[campo];
            }
        });

        const revisaoNova = registroOperacao.controleEdicao.revisao;
        const metadados = {
            locacaoId: entrada.locacaoId,
            operacaoId: entrada.operacaoId,
            assinaturaPlano: entrada.assinaturaPlanoEsperada,
            atualizadoEm: entrada.atualizadoEm,
            atualizadoPor: entrada.atualizadoPor,
            revisaoEsperada: entrada.revisaoEsperada,
            revisaoNova,
            periodoAnterior: plano?.periodo?.atual,
            periodoNovo: plano?.periodo?.pretendido
        };
        const movimentacoes = criarMovimentacoes(reconciliacao, metadados);
        const chavesExistentes = new Set((Array.isArray(candidato.movimentacoesEstoque)
            ? candidato.movimentacoesEstoque : []).map((item) => item?.chaveIdempotencia).filter(Boolean));
        if (movimentacoes.some((item) => chavesExistentes.has(item.chaveIdempotencia))) {
            return { ok: false, codigo: 'CHAVE_MOVIMENTACAO_DUPLICADA' };
        }

        const tombstones = preservarTombstones(
            locacaoAtual,
            locacaoCandidata,
            plano,
            metadados,
            dependencias.clonarJsonPersistivelEstrito
        );
        if (!tombstones.ok) return tombstones;

        locacaoCandidata.controleEdicao = registroOperacao.controleEdicao;
        const movimentacaoIds = movimentacoes.map((item) => item.id);
        const historico = {
            ...registroOperacao.registroHistorico,
            descricao: 'Ajuste operacional de reserva da locação aplicado.',
            resumoMovimentacoes: {
                reservar: reconciliacao.itensReserva.length,
                liberar: reconciliacao.itensLiberacao.length
            },
            movimentacaoIds,
            possuiReprogramacaoPeriodo: Array.isArray(plano?.ajustes?.reprogramarPeriodo)
                && plano.ajustes.reprogramarPeriodo.length > 0,
            periodoAnterior: copiarPeriodo(plano?.periodo?.atual),
            periodoNovo: copiarPeriodo(plano?.periodo?.pretendido),
            checkpoint: {
                tipo: checkpoint.tipo,
                versao: checkpoint.versao,
                criadoEm: checkpoint.criadoEm
            }
        };
        locacaoCandidata.historicoOperacional = [
            ...(Array.isArray(locacaoCandidata.historicoOperacional)
                ? locacaoCandidata.historicoOperacional : []),
            historico
        ];
        candidato.movimentacoesEstoque = [
            ...(Array.isArray(candidato.movimentacoesEstoque) ? candidato.movimentacoesEstoque : []),
            ...movimentacoes
        ];

        const reservaAtual = locacaoCandidata.estoqueReserva && typeof locacaoCandidata.estoqueReserva === 'object'
            ? locacaoCandidata.estoqueReserva : {};
        const snapshot = dependencias.criarSnapshotReservaLocacao(locacaoCandidata, {
            origem: 'ajuste_transacional',
            capturadoEm: entrada.atualizadoEm,
            statusReserva: reservaAtual.status
        });
        locacaoCandidata.estoqueReserva = {
            ...reservaAtual,
            snapshot,
            movimentacaoIds: Array.from(new Set([
                ...(Array.isArray(reservaAtual.movimentacaoIds) ? reservaAtual.movimentacaoIds : []),
                ...movimentacaoIds
            ]))
        };

        const auditoriaId = [
            'auditoria-ajuste-reserva-locacao-v1',
            entrada.operacaoId,
            referenciaEstrita(entrada.locacaoId)
        ].join('|');
        const auditoria = {
            id: auditoriaId,
            entidade: 'locacao',
            entidadeId: entrada.locacaoId,
            locacaoId: entrada.locacaoId,
            acao: 'ajuste_reserva_locacao',
            operacaoId: entrada.operacaoId,
            assinaturaPlano: entrada.assinaturaPlanoEsperada,
            revisaoAnterior: entrada.revisaoEsperada,
            revisaoNova,
            data: entrada.atualizadoEm,
            usuario: entrada.atualizadoPor,
            quantidadeMovimentacoes: movimentacoes.length
        };
        candidato.logsAuditoria = [
            ...(Array.isArray(candidato.logsAuditoria) ? candidato.logsAuditoria : []),
            auditoria
        ];
        return { ok: true, codigo: 'SUCESSO', candidato, locacaoCandidata, movimentacoes, historico };
    }

    function validarCandidato(estadoOriginal, construcao, plano, entrada, dependencias) {
        const { candidato, locacaoCandidata, movimentacoes } = construcao;
        if (!validarPecasIntactas(estadoOriginal.pecas, candidato.pecas,
            dependencias.clonarJsonPersistivelEstrito)) {
            return { ok: false, codigo: 'SALDOS_FISICOS_ALTERADOS' };
        }
        const localizacaoOriginal = localizarLocacaoUnica(estadoOriginal.locacoes, entrada.locacaoId);
        if (!validarLocacaoPreservada(localizacaoOriginal.locacao, locacaoCandidata,
            dependencias.clonarJsonPersistivelEstrito)) {
            return { ok: false, codigo: 'CAMPO_NAO_AUTORIZADO_ALTERADO' };
        }
        const itens = Array.isArray(locacaoCandidata.items) ? locacaoCandidata.items : [];
        const ids = itens.map((item) => textoObrigatorio(item?.itemId, 200));
        if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
            return { ok: false, codigo: 'ITEM_ID_INVALIDO_OU_DUPLICADO' };
        }
        const tombstoneIds = (Array.isArray(locacaoCandidata.itensHistoricosRemovidos)
            ? locacaoCandidata.itensHistoricosRemovidos : [])
            .map((item) => textoObrigatorio(item?.itemId, 200));
        if (tombstoneIds.some((id) => !id)
            || new Set(tombstoneIds).size !== tombstoneIds.length
            || ids.some((id) => tombstoneIds.includes(id))) {
            return { ok: false, codigo: 'ITEM_ID_HISTORICO_REUTILIZADO' };
        }
        const chaves = movimentacoes.map((item) => item.chaveIdempotencia);
        if (new Set(chaves).size !== chaves.length) {
            return { ok: false, codigo: 'MOVIMENTACOES_NAO_IDEMPOTENTES' };
        }
        const estadoOperacao = dependencias.verificarEstadoOperacaoLocacao({
            locacao: locacaoCandidata,
            operacaoId: entrada.operacaoId,
            assinaturaPlano: entrada.assinaturaPlanoEsperada,
            plano: {
                ajustes: {
                    reservar: Array.from({ length: movimentacoes.filter((item) => (
                        item.subtipoMovimentacao === 'reserva_ajuste')).length }, () => ({})),
                    liberar: Array.from({ length: movimentacoes.filter((item) => (
                        item.subtipoMovimentacao === 'liberacao_ajuste')).length }, () => ({}))
                }
            },
            movimentacoes: candidato.movimentacoesEstoque,
            historicoOperacional: historicosGlobais(candidato.locacoes)
        });
        if (estadoOperacao?.estado !== 'concluida') {
            return { ok: false, codigo: 'EVIDENCIAS_OPERACAO_INCOMPLETAS', detalhe: estadoOperacao?.codigo };
        }
        const auditorias = auditoriasDaOperacao(candidato, entrada.operacaoId)
            .filter((registro) => referenciaEstrita(registro?.locacaoId) === referenciaEstrita(entrada.locacaoId)
                && registro?.assinaturaPlano === entrada.assinaturaPlanoEsperada);
        if (auditorias.length !== 1) {
            return { ok: false, codigo: 'AUDITORIA_OPERACAO_AUSENTE_OU_DUPLICADA' };
        }
        const clonagem = resultadoClonagem(dependencias.clonarJsonPersistivelEstrito, candidato);
        return clonagem.ok
            ? { ok: true, codigo: 'SUCESSO' }
            : { ok: false, codigo: clonagem.codigo };
    }

    function validarDependencias(dependencias) {
        const funcoes = [
            'planejarAjusteReservaLocacao',
            'gerarAssinaturaPlanoAjusteLocacao',
            'validarOperacaoIdLocacao',
            'normalizarControleEdicaoLocacao',
            'verificarEstadoOperacaoLocacao',
            'criarCheckpointOperacionalEdicaoLocacao',
            'prepararRegistroOperacaoConcluida',
            'clonarJsonPersistivelEstrito',
            'criarSnapshotReservaLocacao',
            'prepararSnapshotPersistivelCompleto',
            'persistirSnapshotLocalConfirmavel',
            'publicarEstadoConfirmado',
            'atualizarMetadadoSincronizacao'
        ];
        const ausentes = funcoes.filter((nome) => typeof dependencias?.[nome] !== 'function');
        if (!dependencias?.estadoAtual || typeof dependencias.estadoAtual !== 'object') {
            ausentes.push('estadoAtual');
        }
        if (!dependencias?.armazenamento) ausentes.push('armazenamento');
        return ausentes;
    }

    function executarAjusteReservaLocacao(entrada = {}, dependencias = {}) {
        const ausentes = validarDependencias(dependencias);
        if (ausentes.length) {
            return resultadoBase('DEPENDENCIAS_TRANSACIONAIS_INVALIDAS', {
                bloqueios: [{ codigo: 'DEPENDENCIAS_AUSENTES', campos: ausentes }]
            });
        }
        const locacaoIdRef = referenciaEstrita(entrada.locacaoId);
        const validacaoOperacao = dependencias.validarOperacaoIdLocacao(entrada.operacaoId);
        const revisaoEsperada = inteiroSeguroNaoNegativo(entrada.revisaoEsperada);
        const atualizadoEm = textoObrigatorio(entrada.atualizadoEm, 100);
        const atualizadoPor = textoObrigatorio(entrada.atualizadoPor, 300);
        if (!locacaoIdRef || !validacaoOperacao?.valido
            || !assinaturaValida(entrada.assinaturaPlanoEsperada)
            || revisaoEsperada === null || !atualizadoEm || !atualizadoPor
            || !entrada.dadosEditados || typeof entrada.dadosEditados !== 'object'
            || Array.isArray(entrada.dadosEditados)) {
            return resultadoBase('ENTRADA_TRANSACIONAL_INVALIDA');
        }
        const dadosClonados = resultadoClonagem(
            dependencias.clonarJsonPersistivelEstrito,
            entrada.dadosEditados
        );
        if (!dadosClonados.ok) return resultadoBase(dadosClonados.codigo);
        const dadosEditadosRecebidos = dadosClonados.valor;
        const naoAutorizados = camposNaoAutorizados(dadosEditadosRecebidos);
        if (naoAutorizados.length) {
            return resultadoBase('CAMPO_OPERACIONAL_NAO_AUTORIZADO', {
                bloqueios: naoAutorizados.map((campo) => ({ codigo: 'CAMPO_NAO_AUTORIZADO', campo }))
            });
        }
        if (!Array.isArray(dadosEditadosRecebidos.items)) {
            return resultadoBase('ITENS_EDITADOS_AUSENTES');
        }

        const estado = dependencias.estadoAtual;
        const localizacao = localizarLocacaoUnica(estado.locacoes, entrada.locacaoId);
        if (localizacao.quantidade !== 1) {
            return resultadoBase(localizacao.quantidade === 0
                ? 'LOCACAO_NAO_ENCONTRADA' : 'LOCACAO_ID_DUPLICADO');
        }
        const dadosEditados = preservarCamposItensAtuais(localizacao.locacao, dadosEditadosRecebidos);
        if (travasPorLocacao.has(locacaoIdRef)) {
            return resultadoBase('OPERACAO_EM_EXECUCAO', {
                bloqueios: [{ codigo: 'LOCACAO_BLOQUEADA_POR_OPERACAO', locacaoId: entrada.locacaoId }]
            });
        }

        travasPorLocacao.add(locacaoIdRef);
        try {
            const conclusaoPersistida = verificarConclusaoPersistidaObsoleta(entrada, dependencias);
            if (conclusaoPersistida?.estado === 'concluida' && conclusaoPersistida?.valido === true) {
                return resultadoBase('OPERACAO_JA_CONCLUIDA', {
                    ok: true,
                    aplicado: true,
                    idempotente: true,
                    operacao: {
                        locacaoId: entrada.locacaoId,
                        operacaoId: entrada.operacaoId,
                        assinaturaPlano: entrada.assinaturaPlanoEsperada
                    }
                });
            }
            if (conclusaoPersistida?.estado === 'parcial'
                || conclusaoPersistida?.estado === 'inconsistente') {
                return resultadoBase('OPERACAO_REQUER_RECUPERACAO', {
                    requerRecuperacao: true,
                    bloqueios: [{ codigo: conclusaoPersistida.codigo }]
                });
            }
            const idempotencia = verificarIdempotencia(entrada, estado, localizacao.locacao, dependencias);
            if (idempotencia?.estado === 'concluida' && idempotencia?.valido === true) {
                return resultadoBase('OPERACAO_JA_CONCLUIDA', {
                    ok: true,
                    aplicado: true,
                    idempotente: true,
                    operacao: {
                        locacaoId: entrada.locacaoId,
                        operacaoId: entrada.operacaoId,
                        assinaturaPlano: entrada.assinaturaPlanoEsperada
                    }
                });
            }
            if (idempotencia?.estado === 'parcial' || idempotencia?.estado === 'inconsistente') {
                return resultadoBase('OPERACAO_REQUER_RECUPERACAO', {
                    requerRecuperacao: true,
                    bloqueios: [{ codigo: idempotencia.codigo, evidencias: idempotencia.evidencias }]
                });
            }

            const bloqueiosItemId = validarItemIdsHistoricos(localizacao.locacao, dadosEditados);
            if (bloqueiosItemId.length) {
                return resultadoBase(bloqueiosItemId[0].codigo, { bloqueios: bloqueiosItemId });
            }

            const controle = dependencias.normalizarControleEdicaoLocacao(localizacao.locacao);
            if (!controle?.valido) {
                return resultadoBase('CONTROLE_EDICAO_INVALIDO', { bloqueios: controle?.bloqueios });
            }
            if (controle.revisao !== revisaoEsperada) {
                return resultadoBase('REVISAO_DIVERGENTE', {
                    bloqueios: [{
                        codigo: 'REVISAO_DIVERGENTE',
                        revisaoEsperada,
                        revisaoAtual: controle.revisao
                    }]
                });
            }

            const contexto = {
                pecas: estado.pecas,
                locacoes: estado.locacoes,
                devolucoes: estado.devolucoes
            };
            const plano = dependencias.planejarAjusteReservaLocacao(
                localizacao.locacao,
                dadosEditados,
                contexto
            );
            if (!plano?.valido || (Array.isArray(plano?.bloqueios) && plano.bloqueios.length)) {
                return resultadoBase('PLANO_AJUSTE_INVALIDO', {
                    bloqueios: Array.isArray(plano?.bloqueios) ? plano.bloqueios : []
                });
            }
            const assinatura = dependencias.gerarAssinaturaPlanoAjusteLocacao(plano, { revisaoEsperada });
            if (!assinatura?.ok || assinatura.assinatura !== entrada.assinaturaPlanoEsperada) {
                return resultadoBase('ASSINATURA_PLANO_DIVERGENTE');
            }

            const reconciliacao = reconciliarDeltas(plano);
            if (!reconciliacao.valido) {
                return resultadoBase('PLANO_DELTAS_NAO_RECONCILIADOS');
            }
            const checkpoint = dependencias.criarCheckpointOperacionalEdicaoLocacao(estado, {
                operacaoId: entrada.operacaoId,
                assinaturaPlano: entrada.assinaturaPlanoEsperada,
                criadoEm: atualizadoEm
            });
            if (!checkpoint?.ok) return resultadoBase(checkpoint?.codigo || 'FALHA_CHECKPOINT');

            const registroOperacao = dependencias.prepararRegistroOperacaoConcluida({
                locacao: localizacao.locacao,
                operacaoId: entrada.operacaoId,
                revisaoEsperada,
                assinaturaPlano: entrada.assinaturaPlanoEsperada,
                atualizadoEm,
                atualizadoPor
            });
            if (!registroOperacao?.valido) {
                return resultadoBase('REGISTRO_OPERACAO_INVALIDO', {
                    bloqueios: registroOperacao?.bloqueios
                });
            }

            const originalAntes = resultadoClonagem(dependencias.clonarJsonPersistivelEstrito, estado);
            if (!originalAntes.ok) return resultadoBase(originalAntes.codigo);
            const construcao = construirCandidato(
                estado,
                localizacao.locacao,
                localizacao.indice,
                dadosEditados,
                plano,
                reconciliacao,
                registroOperacao,
                checkpoint.checkpoint,
                {
                    ...entrada,
                    revisaoEsperada,
                    atualizadoEm,
                    atualizadoPor
                },
                dependencias
            );
            if (!construcao.ok) return resultadoBase(construcao.codigo);
            const provasRecuperacao = anexarProvasRecuperacao(
                construcao,
                estado,
                localizacao.locacao,
                { ...entrada, revisaoEsperada },
                registroOperacao.controleEdicao.revisao,
                dependencias.clonarJsonPersistivelEstrito
            );
            if (!provasRecuperacao.ok) {
                return resultadoBase(provasRecuperacao.codigo || 'FALHA_PROVAS_RECUPERACAO');
            }
            const originalDepoisCandidato = resultadoClonagem(dependencias.clonarJsonPersistivelEstrito, estado);
            if (!originalDepoisCandidato.ok || originalDepoisCandidato.json !== originalAntes.json) {
                return resultadoBase('ESTADO_ORIGINAL_MODIFICADO_ANTES_DA_PERSISTENCIA', {
                    requerRecuperacao: true
                });
            }
            const candidatoValido = validarCandidato(estado, construcao, plano, entrada, dependencias);
            if (!candidatoValido.ok) {
                return resultadoBase(candidatoValido.codigo, {
                    bloqueios: candidatoValido.detalhe ? [{ codigo: candidatoValido.detalhe }] : []
                });
            }

            const metadadosPersistencia = entrada.persistencia;
            if (!metadadosPersistencia || typeof metadadosPersistencia !== 'object') {
                return resultadoBase('METADADOS_PERSISTENCIA_INVALIDOS');
            }
            const candidatoCanonico = ordenarChavesCanonicas(construcao.candidato);
            const snapshotPreparado = dependencias.prepararSnapshotPersistivelCompleto(
                candidatoCanonico,
                metadadosPersistencia
            );
            if (!snapshotPreparado?.ok) {
                return resultadoBase(snapshotPreparado?.codigo || 'FALHA_PREPARACAO_SNAPSHOT');
            }
            const opcoesPersistencia = { armazenamento: dependencias.armazenamento };
            if (Object.prototype.hasOwnProperty.call(metadadosPersistencia, 'chave')) {
                opcoesPersistencia.chave = metadadosPersistencia.chave;
            }
            const persistencia = dependencias.persistirSnapshotLocalConfirmavel(
                snapshotPreparado.snapshot,
                opcoesPersistencia
            );
            if (!persistencia?.ok || persistencia.confirmado !== true) {
                return resultadoBase(persistencia?.codigo || 'FALHA_PERSISTENCIA', {
                    requerRecuperacao: persistencia?.requerRecuperacao === true,
                    avisos: persistencia?.aviso ? [{ codigo: persistencia.aviso }] : []
                });
            }

            const estadoConfirmado = resultadoClonagem(
                dependencias.clonarJsonPersistivelEstrito,
                snapshotPreparado.snapshot
            );
            if (!estadoConfirmado.ok) {
                return resultadoBase('ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', {
                    requerRecuperacao: true
                });
            }
            try {
                const publicado = dependencias.publicarEstadoConfirmado(estadoConfirmado.valor, estado);
                if (publicado === false) throw new Error('Publicação do estado recusada.');
            } catch (_erro) {
                return resultadoBase('ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', {
                    requerRecuperacao: true
                });
            }

            registrarConclusaoConfirmada(dependencias.armazenamento, {
                locacaoId: entrada.locacaoId,
                operacaoId: entrada.operacaoId,
                assinaturaPlano: entrada.assinaturaPlanoEsperada,
                chaveArmazenamento: persistencia.chave,
                revisaoConfirmada: registroOperacao.controleEdicao.revisao
            });

            const operacao = {
                locacaoId: entrada.locacaoId,
                operacaoId: entrada.operacaoId,
                assinaturaPlano: entrada.assinaturaPlanoEsperada,
                revisaoAnterior: revisaoEsperada,
                revisaoNova: registroOperacao.controleEdicao.revisao,
                movimentacoes: construcao.movimentacoes.length
            };
            try {
                const atualizado = dependencias.atualizarMetadadoSincronizacao({
                    locacaoId: entrada.locacaoId,
                    operacaoId: entrada.operacaoId,
                    assinaturaPlano: entrada.assinaturaPlanoEsperada,
                    ultimaEdicao: metadadosPersistencia.ultimaEdicao
                });
                if (atualizado === false) throw new Error('Atualização do marcador recusada.');
            } catch (_erro) {
                return resultadoBase('AJUSTE_APLICADO', {
                    ok: true,
                    aplicado: true,
                    avisos: [{ codigo: 'METADADO_SYNC_PENDENTE' }],
                    operacao,
                    renderizar: true,
                    sincronizar: false
                });
            }
            return resultadoBase('AJUSTE_APLICADO', {
                ok: true,
                aplicado: true,
                avisos: persistencia.aviso ? [{ codigo: persistencia.aviso }] : [],
                operacao,
                renderizar: true,
                sincronizar: true
            });
        } catch (erro) {
            return resultadoBase('FALHA_TRANSACIONAL_NAO_TRATADA', {
                bloqueios: [{ codigo: 'EXCECAO_CONTROLADA', mensagem: String(erro?.message || erro) }]
            });
        } finally {
            travasPorLocacao.delete(locacaoIdRef);
        }
    }

    function gerarAssinaturaDevolucaoLocacao(entrada = {}) {
        const locacaoRef = referenciaEstrita(entrada.locacaoId);
        const dataDevolucao = textoObrigatorio(entrada.dataDevolucao, 10);
        const itens = (Array.isArray(entrada.itens) ? entrada.itens : []).map((item) => ({
            itemIndex: inteiroSeguroNaoNegativo(item?.itemIndex),
            itemId: textoObrigatorio(item?.itemId, 200),
            quantidadeDevolvida: inteiroSeguroNaoNegativo(item?.quantidadeDevolvida),
            quantidadeAvaria: inteiroSeguroNaoNegativo(item?.quantidadeAvaria),
            observacao: typeof item?.observacao === 'string' ? item.observacao.trim().slice(0, 1000) : ''
        }));
        if (!locacaoRef || !/^\d{4}-\d{2}-\d{2}$/.test(dataDevolucao) || itens.length === 0
            || itens.some((item) => item.itemIndex === null || item.quantidadeDevolvida === null
                || item.quantidadeAvaria === null || (item.quantidadeDevolvida + item.quantidadeAvaria) <= 0)) {
            return { ok: false, codigo: 'DADOS_DEVOLUCAO_INVALIDOS', assinatura: '' };
        }
        const canonico = JSON.stringify({
            locacaoRef,
            dataDevolucao,
            itens: itens.slice().sort((a, b) => (
                a.itemIndex - b.itemIndex || a.itemId.localeCompare(b.itemId)
            ))
        });
        return {
            ok: true,
            codigo: 'SUCESSO',
            assinatura: `devolucao-locacao-v1:fnv1a64:${fingerprintFnv1a64(canonico)}`,
            itens,
            dataDevolucao
        };
    }

    function evidenciasDevolucaoLocacao(estado, entrada, assinatura) {
        const referencia = referenciaEstrita(entrada.locacaoId);
        const daOperacao = (registro) => registro?.operacaoId === entrada.operacaoId;
        const coerente = (registro) => daOperacao(registro)
            && referenciaEstrita(registro?.locacaoId) === referencia
            && registro?.assinaturaPlano === assinatura;
        const devolucoesOperacao = (Array.isArray(estado?.devolucoes) ? estado.devolucoes : []).filter(daOperacao);
        const movimentosOperacao = (Array.isArray(estado?.movimentacoesEstoque)
            ? estado.movimentacoesEstoque : []).filter(daOperacao);
        const historicosOperacao = historicosGlobais(estado?.locacoes).filter(daOperacao);
        const auditoriasOperacao = auditoriasDaOperacao(estado, entrada.operacaoId);
        const todos = [...devolucoesOperacao, ...movimentosOperacao, ...historicosOperacao, ...auditoriasOperacao];
        if (todos.length === 0) return { estado: 'nao_executada', completo: false, quantidadeMovimentos: 0 };
        if (todos.some((registro) => !coerente(registro))) {
            return { estado: 'inconsistente', completo: false, codigo: 'OPERACAO_ID_ASSOCIADO_A_EVIDENCIA_DIVERGENTE' };
        }
        const devolucoesCoerentes = devolucoesOperacao.filter(coerente);
        const movimentosCoerentes = movimentosOperacao.filter(coerente);
        const historicosCoerentes = historicosOperacao.filter(coerente);
        const auditoriasCoerentes = auditoriasOperacao.filter(coerente);
        const esperadoMovimentos = devolucoesCoerentes.length === 1
            ? (Array.isArray(devolucoesCoerentes[0].itens) ? devolucoesCoerentes[0].itens : [])
                .reduce((total, item) => total
                    + (inteiroSeguroNaoNegativo(item?.quantidadeDevolvida) > 0 ? 1 : 0)
                    + (inteiroSeguroNaoNegativo(item?.quantidadeAvaria) > 0 ? 1 : 0), 0)
            : -1;
        const localizacao = localizarLocacaoUnica(estado?.locacoes, entrada.locacaoId);
        const controle = localizacao.locacao ? localizacao.locacao.controleEdicao : null;
        const controleCoerente = controle?.ultimaOperacaoId === entrada.operacaoId;
        const completo = devolucoesCoerentes.length === 1
            && historicosCoerentes.length === 1
            && auditoriasCoerentes.length === 1
            && esperadoMovimentos >= 0
            && movimentosCoerentes.length === esperadoMovimentos
            && controleCoerente;
        return {
            estado: completo ? 'concluida' : 'parcial',
            completo,
            codigo: completo ? 'OPERACAO_CONCLUIDA' : 'OPERACAO_PARCIAL',
            quantidadeMovimentos: movimentosCoerentes.length
        };
    }

    function localizarPecaUnica(pecas, pecaId) {
        if (!Array.isArray(pecas)) return { peca: null, indice: -1, quantidade: 0 };
        const correspondencias = [];
        pecas.forEach((peca, indice) => {
            const mesmoTipo = typeof peca?.id === typeof pecaId;
            if (mesmoTipo && Object.is(peca?.id, pecaId)) correspondencias.push(indice);
        });
        return {
            peca: correspondencias.length === 1 ? pecas[correspondencias[0]] : null,
            indice: correspondencias.length === 1 ? correspondencias[0] : -1,
            quantidade: correspondencias.length
        };
    }

    function chaveMovimentacaoDevolucao(entrada, itemId, pecaId, tipo) {
        const pecaRef = `${typeof pecaId}:${JSON.stringify(pecaId)}`;
        return [
            'devolucao-locacao-v1',
            entrada.operacaoId,
            referenciaEstrita(entrada.locacaoId),
            itemId,
            pecaRef,
            tipo
        ].join('|');
    }

    function construirCandidatoDevolucao(estado, localizacao, entrada, assinatura, dadosAssinados,
        registroOperacao, checkpoint, dependencias) {
        const clonagem = clonarJsonInterno(estado);
        if (!clonagem.ok) return clonagem;
        const candidato = clonagem.valor;
        const locacao = candidato.locacoes[localizacao.indice];
        const indicesUsados = new Set();
        const itensDevolucao = [];
        const movimentacoes = [];
        const chavesExistentes = new Set((Array.isArray(candidato.movimentacoesEstoque)
            ? candidato.movimentacoesEstoque : []).map((item) => item?.chaveIdempotencia).filter(Boolean));

        for (const solicitado of dadosAssinados.itens) {
            if (indicesUsados.has(solicitado.itemIndex)) {
                return { ok: false, codigo: 'ITEM_DEVOLUCAO_DUPLICADO' };
            }
            indicesUsados.add(solicitado.itemIndex);
            const item = locacao.items?.[solicitado.itemIndex];
            const itemOriginal = localizacao.locacao.items?.[solicitado.itemIndex];
            if (!item || !itemOriginal) return { ok: false, codigo: 'ITEM_DEVOLUCAO_NAO_ENCONTRADO' };
            const itemIdAtual = textoObrigatorio(itemOriginal.itemId, 200);
            if (solicitado.itemId && solicitado.itemId !== itemIdAtual) {
                return { ok: false, codigo: 'ITEM_ID_DIVERGENTE' };
            }
            const itemParaCalculo = clonarDescartavel(itemOriginal);
            if (!itemParaCalculo) return { ok: false, codigo: 'ITEM_DEVOLUCAO_NAO_SERIALIZAVEL' };
            const pendente = dependencias.obterQuantidadePendenteDevolucaoItem(itemParaCalculo);
            if (!Number.isSafeInteger(pendente) || pendente < 0) {
                return { ok: false, codigo: 'QUANTIDADE_PENDENTE_INVALIDA' };
            }
            const totalInformado = solicitado.quantidadeDevolvida + solicitado.quantidadeAvaria;
            if (totalInformado > pendente) return { ok: false, codigo: 'QUANTIDADE_DEVOLUCAO_EXCEDENTE' };
            const identidadeItem = itemIdAtual || `indice-${solicitado.itemIndex}`;
            const pecaId = itemOriginal.pecaId;
            const criarMovimento = (tipo, quantidade) => {
                if (quantidade <= 0) return null;
                const chave = chaveMovimentacaoDevolucao(entrada, identidadeItem, pecaId, tipo);
                if (chavesExistentes.has(chave)) return { erro: 'CHAVE_MOVIMENTACAO_DUPLICADA' };
                chavesExistentes.add(chave);
                return {
                    id: chave,
                    movimentacaoId: chave,
                    chaveIdempotencia: chave,
                    tipoMovimentacao: tipo,
                    subtipoMovimentacao: tipo === 'avaria' ? 'avaria_devolucao' : 'entrada_devolucao',
                    quantidade,
                    pecaId,
                    pecaNome: itemOriginal.nome,
                    locacaoId: entrada.locacaoId,
                    operacaoId: entrada.operacaoId,
                    assinaturaPlano: assinatura,
                    itemId: itemIdAtual,
                    origemEvento: entrada.operacaoId,
                    observacao: solicitado.observacao
                        || `${tipo === 'avaria' ? 'Avaria' : 'Devolução'} registrada em ${dadosAssinados.dataDevolucao}.`,
                    dataHora: entrada.atualizadoEm,
                    usuario: entrada.atualizadoPor,
                    saldoAntes: pendente,
                    saldoDepois: Math.max(pendente - totalInformado, 0),
                    saldoInformativo: 'quantidade_propria_pendente_item',
                    statusProcessamento: 'confirmado'
                };
            };
            const movimentoDevolucao = criarMovimento('devolucao', solicitado.quantidadeDevolvida);
            const movimentoAvaria = criarMovimento('avaria', solicitado.quantidadeAvaria);
            if (movimentoDevolucao?.erro || movimentoAvaria?.erro) {
                return { ok: false, codigo: 'CHAVE_MOVIMENTACAO_DUPLICADA' };
            }
            if (movimentoDevolucao) movimentacoes.push(movimentoDevolucao);
            if (movimentoAvaria) movimentacoes.push(movimentoAvaria);

            item.devolvidos = (inteiroLegadoNaoNegativo(item.devolvidos) ?? 0) + solicitado.quantidadeDevolvida;
            item.avariadosEstoqueProprio = (inteiroLegadoNaoNegativo(item.avariadosEstoqueProprio) ?? 0)
                + solicitado.quantidadeAvaria;
            if (solicitado.quantidadeAvaria > 0) {
                const pecaLocalizada = localizarPecaUnica(candidato.pecas, pecaId);
                if (pecaLocalizada.quantidade !== 1) {
                    return { ok: false, codigo: pecaLocalizada.quantidade > 1 ? 'PECA_ID_DUPLICADO' : 'PECA_NAO_ENCONTRADA' };
                }
                const avariadoAtual = inteiroLegadoNaoNegativo(pecaLocalizada.peca.avariado) ?? 0;
                pecaLocalizada.peca.avariado = avariadoAtual + solicitado.quantidadeAvaria;
            }
            itensDevolucao.push({
                itemIndex: solicitado.itemIndex,
                itemId: itemIdAtual,
                pecaId,
                nome: itemOriginal.nome,
                quantidadeLocada: inteiroLegadoNaoNegativo(itemOriginal.quantidade) ?? 0,
                quantidadeDevolvida: solicitado.quantidadeDevolvida,
                quantidadeAvaria: solicitado.quantidadeAvaria,
                quantidadePendenteAntes: pendente,
                quantidadePendenteApos: Math.max(pendente - totalInformado, 0),
                valorUnitario: Number.isFinite(Number(itemOriginal.valor)) ? Number(itemOriginal.valor) : 0,
                observacao: solicitado.observacao
            });
        }

        const itensParaConferencia = clonarDescartavel(Array.isArray(locacao.items) ? locacao.items : []);
        if (!itensParaConferencia) return { ok: false, codigo: 'ITENS_DEVOLUCAO_NAO_SERIALIZAVEIS' };
        const devolucaoTotal = itensParaConferencia.every((item) => (
            dependencias.obterQuantidadePendenteDevolucaoItem(item) === 0
        ));
        locacao.status = devolucaoTotal ? 'devolvido' : 'ativo';
        if (devolucaoTotal) locacao.statusFluxo = 'devolvido';
        locacao.controleEdicao = registroOperacao.controleEdicao;
        const movimentacaoIds = movimentacoes.map((movimento) => movimento.id);
        const historicoAlteracao = {
            id: `historico-devolucao-${entrada.operacaoId}`,
            data: entrada.atualizadoEm,
            acao: devolucaoTotal ? 'devolucao_total' : 'devolucao_parcial',
            descricao: devolucaoTotal
                ? 'Locação encerrada com devolução total dos itens.'
                : 'Devolução parcial registrada para a locação.',
            origem: 'devolucoes',
            status: locacao.status,
            statusFluxo: locacao.statusFluxo || '',
            usuario: entrada.atualizadoPor,
            locacaoId: entrada.locacaoId,
            operacaoId: entrada.operacaoId,
            assinaturaPlano: assinatura
        };
        locacao.historicoAlteracoes = [
            ...(Array.isArray(locacao.historicoAlteracoes) ? locacao.historicoAlteracoes : []),
            historicoAlteracao
        ].slice(-240);
        const historico = {
            ...registroOperacao.registroHistorico,
            acao: 'devolucao_locacao',
            descricao: historicoAlteracao.descricao,
            assinaturaPlano: assinatura,
            resumoMovimentacoes: { reservar: 0, evidencias: movimentacoes.length },
            movimentacaoIds,
            devolucaoTotal,
            checkpoint: { tipo: checkpoint.tipo, versao: checkpoint.versao, criadoEm: checkpoint.criadoEm }
        };
        locacao.historicoOperacional = [
            ...(Array.isArray(locacao.historicoOperacional) ? locacao.historicoOperacional : []),
            historico
        ];
        if (devolucaoTotal) {
            const reservaAnterior = locacao.estoqueReserva && typeof locacao.estoqueReserva === 'object'
                ? locacao.estoqueReserva : {};
            locacao.estoqueReserva = {
                ...reservaAnterior,
                status: 'liberado',
                liberadoEm: entrada.atualizadoEm,
                liberadoPor: entrada.atualizadoPor,
                motivo: 'devolucao_total',
                movimentacaoIds: Array.from(new Set([
                    ...(Array.isArray(reservaAnterior.movimentacaoIds) ? reservaAnterior.movimentacaoIds : []),
                    ...movimentacaoIds
                ]))
            };
        }
        const locacaoDescartavel = clonarDescartavel(locacao);
        if (!locacaoDescartavel) return { ok: false, codigo: 'LOCACAO_CANDIDATA_NAO_SERIALIZAVEL' };
        const opcoesSnapshot = {
            origem: 'devolucao_transacional',
            capturadoEm: entrada.atualizadoEm,
            statusReserva: locacao.estoqueReserva?.status
        };
        const snapshotReservaInterno = criarSnapshotReservaInterno(locacao, opcoesSnapshot);
        let snapshotReservaExterno;
        try {
            snapshotReservaExterno = dependencias.criarSnapshotReservaLocacao(
                locacaoDescartavel,
                clonarDescartavel(opcoesSnapshot)
            );
            if (!validarValorExternoPersistivel(snapshotReservaExterno)) {
                return { ok: false, codigo: 'SNAPSHOT_RESERVA_EXTERNO_NAO_CONFIAVEL' };
            }
        } catch (_erro) {
            return { ok: false, codigo: 'SNAPSHOT_RESERVA_EXTERNO_NAO_CONFIAVEL' };
        }
        const snapshotReserva = clonarJsonInterno(snapshotReservaExterno);
        if (!snapshotReserva.ok || !validarSnapshotReservaExterno(snapshotReserva.valor)) {
            return { ok: false, codigo: 'SNAPSHOT_RESERVA_INVALIDO' };
        }
        const externoCanonico = JSON.stringify(ordenarChavesCanonicas(snapshotReserva.valor));
        const internoCanonico = JSON.stringify(ordenarChavesCanonicas(snapshotReservaInterno));
        if (externoCanonico !== internoCanonico) {
            return { ok: false, codigo: 'SNAPSHOT_RESERVA_DIVERGENTE' };
        }
        if (locacao.estoqueReserva && typeof locacao.estoqueReserva === 'object') {
            locacao.estoqueReserva.snapshot = snapshotReservaInterno;
        }
        candidato.movimentacoesEstoque = [
            ...(Array.isArray(candidato.movimentacoesEstoque) ? candidato.movimentacoesEstoque : []),
            ...movimentacoes
        ];
        const devolucao = {
            id: `devolucao-${entrada.operacaoId}`,
            operacaoId: entrada.operacaoId,
            assinaturaPlano: assinatura,
            locacaoId: entrada.locacaoId,
            criadoEm: entrada.atualizadoEm,
            criadoPor: entrada.atualizadoPor,
            dataDevolucao: dadosAssinados.dataDevolucao,
            tipo: devolucaoTotal ? 'total' : 'parcial',
            obs: devolucaoTotal ? 'Total' : 'Parcial',
            itens: itensDevolucao
        };
        candidato.devolucoes = [...(Array.isArray(candidato.devolucoes) ? candidato.devolucoes : []), devolucao];
        const auditoria = {
            id: `auditoria-devolucao-${entrada.operacaoId}`,
            timestamp: entrada.atualizadoEm,
            data: entrada.atualizadoEm,
            tipo: 'devolucao',
            acao: devolucaoTotal ? 'criar' : 'parcial',
            descricao: historicoAlteracao.descricao,
            usuario: entrada.atualizadoPor,
            entidade: 'locacao',
            entidadeId: entrada.locacaoId,
            locacaoId: entrada.locacaoId,
            operacaoId: entrada.operacaoId,
            assinaturaPlano: assinatura,
            quantidadeMovimentacoes: movimentacoes.length
        };
        candidato.logsAuditoria = [...(Array.isArray(candidato.logsAuditoria) ? candidato.logsAuditoria : []), auditoria];
        return { ok: true, codigo: 'SUCESSO', candidato, locacaoCandidata: locacao, historico, devolucao, movimentacoes };
    }

    function executarDevolucaoLocacaoTransacional(entrada = {}, dependencias = {}) {
        const locacaoRef = referenciaEstrita(entrada?.locacaoId);
        const operacao = dependencias?.validarOperacaoIdLocacao?.(entrada?.operacaoId);
        const atualizadoEm = textoObrigatorio(entrada?.atualizadoEm, 40);
        const atualizadoPor = textoObrigatorio(entrada?.atualizadoPor, 320);
        const assinatura = gerarAssinaturaDevolucaoLocacao(entrada);
        if (!locacaoRef || !operacao?.valido || !atualizadoEm || !atualizadoPor || !assinatura.ok) {
            return resultadoBase('ENTRADA_DEVOLUCAO_INVALIDA');
        }
        const funcoesObrigatorias = [
            'normalizarControleEdicaoLocacao', 'prepararRegistroOperacaoConcluida',
            'criarCheckpointOperacionalEdicaoLocacao', 'clonarJsonPersistivelEstrito',
            'criarSnapshotReservaLocacao', 'prepararSnapshotPersistivelCompleto',
            'persistirSnapshotLocalConfirmavel', 'lerSnapshotLocalConfirmavel',
            'publicarEstadoConfirmado', 'atualizarMetadadoSincronizacao',
            'obterQuantidadePendenteDevolucaoItem'
        ];
        if (!dependencias || !dependencias.armazenamento
            || funcoesObrigatorias.some((nome) => typeof dependencias[nome] !== 'function')) {
            return resultadoBase('DEPENDENCIAS_TRANSACIONAIS_INVALIDAS');
        }
        if (travasPorLocacao.has(locacaoRef)) {
            return resultadoBase('LOCACAO_BLOQUEADA_POR_OPERACAO');
        }
        travasPorLocacao.add(locacaoRef);
        try {
            const estadoAtivo = dependencias.estadoAtual || dependencias.obterEstadoMemoriaAtual?.();
            const snapshotAutoritativo = clonarJsonInterno(estadoAtivo);
            if (!snapshotAutoritativo.ok) return resultadoBase(snapshotAutoritativo.codigo);
            const estado = snapshotAutoritativo.valor;
            const localizacao = localizarLocacaoUnica(estado?.locacoes, entrada.locacaoId);
            if (localizacao.quantidade !== 1) {
                return resultadoBase(localizacao.quantidade > 1 ? 'LOCACAO_ID_DUPLICADO' : 'LOCACAO_NAO_ENCONTRADA');
            }
            const evidenciasMemoria = evidenciasDevolucaoLocacao(estado, entrada, assinatura.assinatura);
            if (evidenciasMemoria.completo) {
                return resultadoBase('OPERACAO_JA_CONCLUIDA', {
                    ok: true, aplicado: true, idempotente: true,
                    operacao: { locacaoId: entrada.locacaoId, operacaoId: entrada.operacaoId, assinaturaPlano: assinatura.assinatura }
                });
            }
            if (evidenciasMemoria.estado !== 'nao_executada') {
                return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
            }
            const leituraPersistidaExterna = dependencias.lerSnapshotLocalConfirmavel({
                armazenamento: dependencias.armazenamento,
                ...(entrada.persistencia?.chave ? { chave: entrada.persistencia.chave } : {})
            });
            const leituraPersistidaInterna = clonarJsonInterno(leituraPersistidaExterna);
            const leituraPersistida = leituraPersistidaInterna.ok ? leituraPersistidaInterna.valor : null;
            if (leituraPersistida?.ok) {
                const persistidoIsolado = clonarJsonInterno(leituraPersistida.snapshot);
                if (!persistidoIsolado.ok) {
                    return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
                }
                const evidenciasPersistidas = evidenciasDevolucaoLocacao(
                    persistidoIsolado.valor, entrada, assinatura.assinatura
                );
                if (evidenciasPersistidas.estado !== 'nao_executada') {
                    return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
                }
            } else if (leituraPersistida?.codigo !== 'SNAPSHOT_PERSISTIDO_AUSENTE') {
                return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
            }

            const locacaoControle = clonarDescartavel(localizacao.locacao);
            if (!locacaoControle) return resultadoBase('LOCACAO_NAO_SERIALIZAVEL');
            const controleExterno = dependencias.normalizarControleEdicaoLocacao(locacaoControle);
            const controleIsolado = clonarJsonInterno(controleExterno);
            const controle = controleIsolado.ok ? controleIsolado.valor : null;
            if (!controle?.valido) return resultadoBase('CONTROLE_EDICAO_INVALIDO');
            const estadoCheckpoint = clonarDescartavel(estado);
            if (!estadoCheckpoint) return resultadoBase('ESTADO_NAO_SERIALIZAVEL');
            const checkpointExterno = dependencias.criarCheckpointOperacionalEdicaoLocacao(estadoCheckpoint, {
                operacaoId: entrada.operacaoId,
                assinaturaPlano: assinatura.assinatura,
                criadoEm: atualizadoEm
            });
            const checkpointIsolado = clonarJsonInterno(checkpointExterno);
            const checkpoint = checkpointIsolado.ok ? checkpointIsolado.valor : null;
            if (!checkpoint?.ok) return resultadoBase(checkpoint?.codigo || 'FALHA_CHECKPOINT');
            const registroExterno = dependencias.prepararRegistroOperacaoConcluida({
                locacao: clonarDescartavel(localizacao.locacao),
                operacaoId: entrada.operacaoId,
                revisaoEsperada: controle.revisao,
                assinaturaPlano: assinatura.assinatura,
                atualizadoEm,
                atualizadoPor
            });
            const registroIsolado = clonarJsonInterno(registroExterno);
            const registroOperacao = registroIsolado.ok ? registroIsolado.valor : null;
            if (!registroOperacao?.valido) return resultadoBase('REGISTRO_OPERACAO_INVALIDO');
            const construcao = construirCandidatoDevolucao(
                estado, localizacao, entrada, assinatura.assinatura, assinatura,
                registroOperacao, checkpoint.checkpoint, dependencias
            );
            if (!construcao.ok) return resultadoBase(construcao.codigo);
            const provas = anexarProvasRecuperacao(
                construcao, estado, localizacao.locacao,
                { ...entrada, revisaoEsperada: controle.revisao, assinaturaPlanoEsperada: assinatura.assinatura },
                registroOperacao.controleEdicao.revisao,
                clonarJsonInterno
            );
            if (!provas.ok) return resultadoBase(provas.codigo || 'FALHA_PROVAS_RECUPERACAO');
            const raizAntesPersistencia = clonarJsonInterno(estadoAtivo);
            if (!raizAntesPersistencia.ok || raizAntesPersistencia.json !== snapshotAutoritativo.json) {
                return resultadoBase('ESTADO_ORIGINAL_MODIFICADO_ANTES_DA_PERSISTENCIA', { requerRecuperacao: true });
            }
            const evidenciasCandidato = evidenciasDevolucaoLocacao(
                construcao.candidato, entrada, assinatura.assinatura
            );
            if (!evidenciasCandidato.completo) return resultadoBase('EVIDENCIAS_OPERACAO_INCOMPLETAS');
            const candidatoValido = clonarJsonInterno(construcao.candidato);
            if (!candidatoValido.ok) return resultadoBase(candidatoValido.codigo);
            const candidatoOperacional = prepararEstadoOperacionalInterno(candidatoValido.valor);
            if (!candidatoOperacional.ok) return resultadoBase(candidatoOperacional.codigo);
            const candidatoParaPreparacao = clonarDescartavel(ordenarChavesCanonicas(candidatoValido.valor));
            const metadadosParaPreparacao = clonarDescartavel(entrada.persistencia || {});
            if (!candidatoParaPreparacao || !metadadosParaPreparacao) {
                return resultadoBase('FALHA_PREPARACAO_SNAPSHOT');
            }
            const snapshotPreparadoExterno = dependencias.prepararSnapshotPersistivelCompleto(
                candidatoParaPreparacao, metadadosParaPreparacao
            );
            const snapshotPreparadoRetorno = clonarJsonInterno(snapshotPreparadoExterno);
            const snapshotPreparado = snapshotPreparadoRetorno.ok ? snapshotPreparadoRetorno.valor : null;
            if (!snapshotPreparado?.ok) {
                return resultadoBase(snapshotPreparado?.codigo || 'FALHA_PREPARACAO_SNAPSHOT');
            }
            const snapshotEsperado = clonarJsonInterno(snapshotPreparado.snapshot);
            if (!snapshotEsperado.ok) return resultadoBase('SNAPSHOT_PREPARADO_INVALIDO');
            const operacionalPreparado = prepararEstadoOperacionalInterno(snapshotEsperado.valor);
            if (!operacionalPreparado.ok || operacionalPreparado.json !== candidatoOperacional.json) {
                return resultadoBase('SNAPSHOT_PREPARADO_DIVERGENTE');
            }
            const snapshotParaPersistencia = clonarDescartavel(snapshotEsperado.valor);
            if (!snapshotParaPersistencia) return resultadoBase('SNAPSHOT_PREPARADO_INVALIDO');
            const persistenciaExterna = dependencias.persistirSnapshotLocalConfirmavel(
                snapshotParaPersistencia,
                {
                    armazenamento: dependencias.armazenamento,
                    ...(entrada.persistencia?.chave ? { chave: entrada.persistencia.chave } : {})
                }
            );
            const persistenciaInterna = clonarJsonInterno(persistenciaExterna);
            const persistencia = persistenciaInterna.ok ? persistenciaInterna.valor : null;
            if (!persistencia?.ok || persistencia.confirmado !== true) {
                return resultadoBase(
                    persistencia?.requerRecuperacao ? 'PERSISTENCIA_INDETERMINADA' : (persistencia?.codigo || 'FALHA_PERSISTENCIA'),
                    { requerRecuperacao: persistencia?.requerRecuperacao === true }
                );
            }
            const releituraConfirmadaExterna = dependencias.lerSnapshotLocalConfirmavel({
                armazenamento: dependencias.armazenamento,
                ...(entrada.persistencia?.chave ? { chave: entrada.persistencia.chave } : {})
            });
            const releituraConfirmadaInterna = clonarJsonInterno(releituraConfirmadaExterna);
            const releituraConfirmada = releituraConfirmadaInterna.ok ? releituraConfirmadaInterna.valor : null;
            const releituraIsolada = releituraConfirmada?.ok
                ? clonarJsonInterno(releituraConfirmada.snapshot)
                : { ok: false };
            if (!releituraIsolada.ok || releituraIsolada.json !== snapshotEsperado.json) {
                return resultadoBase('PERSISTENCIA_CONFIRMADA_DIVERGENTE', { requerRecuperacao: true });
            }
            const raizAntesPublicacao = clonarJsonInterno(estadoAtivo);
            if (!raizAntesPublicacao.ok || raizAntesPublicacao.json !== snapshotAutoritativo.json) {
                return resultadoBase('ESTADO_MEMORIA_MODIFICADO_DURANTE_PERSISTENCIA', { requerRecuperacao: true });
            }
            const estadoConfirmado = clonarJsonInterno(releituraIsolada.valor);
            if (!estadoConfirmado.ok) {
                return resultadoBase('ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', { requerRecuperacao: true });
            }
            const publicacaoEsperada = prepararEstadoOperacionalInterno(estadoConfirmado.valor);
            if (!publicacaoEsperada.ok) {
                return resultadoBase('ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', { requerRecuperacao: true });
            }
            const estadoParaPublicador = clonarDescartavel(estadoConfirmado.valor);
            if (!estadoParaPublicador) {
                return resultadoBase('ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', { requerRecuperacao: true });
            }
            const fingerprintPublicacaoEsperado = fingerprintFnv1a64(publicacaoEsperada.jsonEstrutural);
            let autorizacaoPublicacao = null;
            try {
                autorizacaoPublicacao = prepararAutorizacaoPublicacaoConfiavel?.({
                    operacaoId: entrada.operacaoId,
                    fingerprintPublicacaoEsperado,
                    estadoAnterior: estadoAtivo
                }) || null;
            } catch (_erro) {
                autorizacaoPublicacao = null;
            }
            if (!autorizacaoPublicacao) {
                return resultadoBase('FRONTEIRA_PUBLICACAO_INDISPONIVEL', {
                    requerRecuperacao: true,
                    publicacaoRealizada: false
                });
            }
            let erroPublicacao = null;
            try {
                dependencias.publicarEstadoConfirmado(estadoParaPublicador, estadoAtivo, {
                    jsonOperacionalEsperado: publicacaoEsperada.jsonEstrutural,
                    autorizacaoPublicacao,
                    exigirConfirmacaoInterna: true
                });
            } catch (erro) {
                erroPublicacao = erro;
            }
            let confirmacaoPublicacao = null;
            try {
                confirmacaoPublicacao = consultarConfirmacaoPublicacaoConfiavel?.({
                    operacaoId: entrada.operacaoId,
                    fingerprintPublicacaoEsperado,
                    estadoAnterior: estadoAtivo,
                    autorizacaoPublicacao
                }) || null;
            } catch (_erro) {
                confirmacaoPublicacao = null;
            }
            if (confirmacaoPublicacao?.confirmada !== true
                || confirmacaoPublicacao.trocas !== 1) {
                try {
                    cancelarAutorizacaoPublicacaoConfiavel?.(autorizacaoPublicacao);
                } catch (_erro) {
                    // A falha continua sem publicacao; nao ha rollback a executar.
                }
                return resultadoBase('ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', {
                    requerRecuperacao: true,
                    publicacaoRealizada: false
                });
            }
            const publicacaoComExcecao = erroPublicacao !== null;
            registrarConclusaoConfirmada(dependencias.armazenamento, {
                locacaoId: entrada.locacaoId,
                operacaoId: entrada.operacaoId,
                assinaturaPlano: assinatura.assinatura,
                chaveArmazenamento: persistencia.chave,
                revisaoConfirmada: registroOperacao.controleEdicao.revisao
            });
            const operacaoPublica = {
                locacaoId: entrada.locacaoId,
                operacaoId: entrada.operacaoId,
                assinaturaPlano: assinatura.assinatura,
                devolucaoId: construcao.devolucao.id,
                tipo: construcao.devolucao.tipo,
                movimentacoes: construcao.movimentacoes.length
            };
            try {
                const atualizado = dependencias.atualizarMetadadoSincronizacao({
                    locacaoId: entrada.locacaoId,
                    operacaoId: entrada.operacaoId,
                    assinaturaPlano: assinatura.assinatura,
                    ultimaEdicao: entrada.persistencia?.ultimaEdicao
                });
                if (atualizado === false) throw new Error('Marcador recusado.');
            } catch (_erro) {
                return resultadoBase('DEVOLUCAO_APLICADA', {
                    ok: true, aplicado: true,
                    publicacaoRealizada: true,
                    avisos: [
                        ...(publicacaoComExcecao ? [{ codigo: 'PUBLICACAO_CONFIRMADA_APOS_EXCECAO' }] : []),
                        { codigo: 'METADADO_SYNC_PENDENTE' }
                    ],
                    operacao: operacaoPublica, renderizar: true, sincronizar: false
                });
            }
            return resultadoBase('DEVOLUCAO_APLICADA', {
                ok: true, aplicado: true,
                publicacaoRealizada: true,
                avisos: [
                    ...(publicacaoComExcecao ? [{ codigo: 'PUBLICACAO_CONFIRMADA_APOS_EXCECAO' }] : []),
                    ...(persistencia.aviso ? [{ codigo: persistencia.aviso }] : [])
                ],
                operacao: operacaoPublica, renderizar: true, sincronizar: true
            });
        } catch (erro) {
            return resultadoBase('FALHA_TRANSACIONAL_NAO_TRATADA', {
                bloqueios: [{ codigo: 'EXCECAO_CONTROLADA', mensagem: String(erro?.message || erro) }]
            });
        } finally {
            travasPorLocacao.delete(locacaoRef);
        }
    }

    // Pecas usam a mesma persistencia e a mesma prova privada; nao ha saldo paralelo.
    const camposPecaEditaveis = Object.freeze(['nome', 'codigo', 'medida', 'barras', 'tipoId', 'valor', 'quantidadeTotal']);
    const resolverIdentidadePeca = window.resolverRegistroPorIdExato;
    const validarIdentidadePeca = window.normalizarIdEntidadeExato;
    const prepararSnapshotPecaInterno = window.prepararSnapshotPersistivelCompleto;
    const lerSnapshotPecaInterno = window.lerSnapshotLocalConfirmavel;
    const validarSnapshotPecaInterno = window.validarEstruturaSnapshotPersistivelCompleto;
    const chaveSnapshotPeca = typeof STORAGE_KEY === 'string' ? STORAGE_KEY : 'mtzBackup';
    const resolverReferenciaPecaInterna = window.resolverReferenciaPecaEstoque;
    let transacaoPecaAtiva = false;

    function copiarDadosPeca(valor) {
        if (!validarValorExternoPersistivel(valor)) throw new Error('DADOS_NAO_PERSISTIVEIS');
        return JSON.parse(JSON.stringify(valor));
    }

    function canonicoPeca(valor) {
        if (Array.isArray(valor)) return valor.map(canonicoPeca);
        if (!valor || typeof valor !== 'object') return valor;
        const copia = {};
        Object.keys(valor).sort().forEach(chave => Object.defineProperty(copia, chave, {
            value: canonicoPeca(valor[chave]), enumerable: true, writable: true, configurable: true
        }));
        return copia;
    }

    function jsonCanonicoPeca(valor) { return JSON.stringify(canonicoPeca(valor)); }

    function operacionalPeca(snapshot) {
        const estado = copiarDadosPeca(snapshot);
        CHAVES_METADADOS_PERSISTENCIA.forEach(chave => delete estado[chave]);
        return estado;
    }

    function lerBasePersistidaPeca(opcoes) {
        const leitura = lerSnapshotPecaInterno(opcoes);
        if (leitura.ok || leitura.codigo === 'SNAPSHOT_PERSISTIDO_AUSENTE') return leitura;
        // salvarLocal legado nao inclui ultimaEdicao no JSON. Aceita somente a
        // estrutura completa, sem esse campo, e ainda exige igualdade com a raiz.
        try {
            const snapshot = copiarDadosPeca(JSON.parse(opcoes.armazenamento.getItem(chaveSnapshotPeca)));
            if (!snapshot || Object.hasOwn(snapshot, 'ultimaEdicao')) return leitura;
            if (!validarSnapshotPecaInterno({ ...snapshot, ultimaEdicao: 0 }).valido) return leitura;
            return { ok: true, snapshot, legado: true };
        } catch (_erro) { return leitura; }
    }

    function revisaoEstadoPeca(estado) {
        return `peca-estado-v1:${fingerprintFnv1a64(jsonCanonicoPeca(operacionalPeca(estado)))}`;
    }

    function capturarRevisaoEstoque(estado) {
        try { return { ok: true, revisao: revisaoEstadoPeca(estado) }; }
        catch (_erro) { return { ok: false, codigo: 'DADOS_NAO_PERSISTIVEIS' }; }
    }

    function planejarAlteracaoPeca(entrada, estadoRecebido) {
        try {
            const dados = copiarDadosPeca(entrada);
            const estado = operacionalPeca(estadoRecebido);
            const rejeitar = (codigo, campo, mensagem) => ({ ok: false, valido: false, codigo,
                bloqueios: [{ codigo, campo, mensagem }] });
            if (!['inclusao', 'edicao'].includes(dados.modo) || !validarIdentidadePeca(dados.pecaId).valido) {
                return rejeitar('PECA_ID_INVALIDO', 'nome', 'A identidade da peça é inválida.');
            }
            const resolucao = resolverIdentidadePeca(estado.pecas, dados.pecaId);
            if (resolucao.estado === 'duplicado' || (dados.modo === 'inclusao' && resolucao.encontrado)) {
                return rejeitar('PECA_ID_DUPLICADO', 'nome', 'A identidade da peça já existe ou está duplicada.');
            }
            if (dados.modo === 'edicao' && !resolucao.encontrado) {
                return rejeitar('PECA_AUSENTE', 'nome', 'A peça foi removida. Feche esta sessão.');
            }
            if (dados.revisaoEsperada !== revisaoEstadoPeca(estado)) {
                return rejeitar('REVISAO_DIVERGENTE', '', 'O estoque foi modificado. Feche e reabra a peça para revisar os dados atuais.');
            }
            const editados = dados.dadosEditados;
            if (!editados || typeof editados !== 'object' || Array.isArray(editados)
                || Object.keys(editados).some(chave => !camposPecaEditaveis.includes(chave))) {
                return rejeitar('CAMPO_NAO_AUTORIZADO', '', 'O rascunho contém campos não autorizados.');
            }
            const atual = resolucao.registro;
            const prevista = atual ? { ...atual, ...editados } : {
                id: dados.pecaId, reservado: 0, manutencao: 0, avariado: 0, perdido: 0,
                localizacao: '', status: 'ativo', historicoMovimentacoes: [], ...editados
            };
            if (typeof prevista.nome !== 'string' || !prevista.nome.trim()) {
                return rejeitar('NOME_OBRIGATORIO', 'nome', 'Informe o nome da peça.');
            }
            prevista.nome = prevista.nome.trim();
            for (const chave of ['codigo', 'medida', 'barras']) {
                if (typeof prevista[chave] !== 'string') return rejeitar('TEXTO_INVALIDO', chave, 'Informe um texto válido.');
                prevista[chave] = prevista[chave].trim();
            }
            if (!atual) { prevista.codigoInterno = prevista.codigo; prevista.qrCode = prevista.barras; }
            if (!resolverIdentidadePeca(estado.tipos, prevista.tipoId).encontrado) {
                return rejeitar('CATEGORIA_INVALIDA', 'tipoId', 'Selecione uma categoria existente e sem duplicidade.');
            }
            const total = prevista.quantidadeTotal;
            if (!Number.isSafeInteger(total) || total < 0) {
                return rejeitar('QUANTIDADE_INVALIDA', 'quantidadeTotal', 'Informe uma quantidade inteira, segura e não negativa.');
            }
            if (typeof prevista.valor !== 'number' || !Number.isFinite(prevista.valor) || prevista.valor < 0) {
                return rejeitar('PRECO_INVALIDO', 'valor', 'Informe um preço finito maior ou igual a zero.');
            }
            const totalAnterior = atual ? inteiroLegadoNaoNegativo(atual.quantidadeTotal ?? atual.quantidade) : 0;
            if (totalAnterior === null) return rejeitar('SALDOS_INVALIDOS', 'quantidadeTotal', 'A quantidade anterior precisa de conferência.');
            // Ausencia legada de reservado: conserva a diferenca que ja estava indisponivel.
            const saldoLegado = atual?.disponivel === undefined ? totalAnterior : inteiroLegadoNaoNegativo(atual.disponivel);
            if (saldoLegado === null || saldoLegado > totalAnterior) return rejeitar('SALDOS_INVALIDOS', 'quantidadeTotal', 'O saldo anterior precisa de conferência.');
            const saldos = ['reservado', 'manutencao', 'avariado', 'perdido'].map(chave => {
                if (prevista[chave] === undefined) return chave === 'reservado' ? totalAnterior - saldoLegado : 0;
                return inteiroLegadoNaoNegativo(prevista[chave]);
            });
            const comprometido = saldos.reduce((soma, valor) => soma + valor, 0);
            if (saldos.includes(null) || !Number.isSafeInteger(comprometido) || comprometido > totalAnterior && atual) {
                return rejeitar('SALDOS_INVALIDOS', 'quantidadeTotal', 'Os saldos comprometidos precisam de conferência.');
            }
            if (total < comprometido) return rejeitar('QUANTIDADE_COMPROMETIDA', 'quantidadeTotal',
                `A quantidade total não pode ser inferior às ${comprometido} unidades comprometidas.`);
            const identificador = valor => typeof valor === 'string' ? valor.trim().toLowerCase() : '';
            const texto = valor => identificador(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            for (const peca of estado.pecas) {
                if (peca === atual) continue;
                if (prevista.codigo && identificador(prevista.codigo) === identificador(peca.codigo)) {
                    return rejeitar('CODIGO_DUPLICADO', 'codigo', 'Já existe uma peça com esse código.');
                }
                if (prevista.barras && identificador(prevista.barras) === identificador(peca.barras || peca.codigoBarras)) {
                    return rejeitar('BARRAS_DUPLICADAS', 'barras', 'Já existe uma peça com esse código de barras.');
                }
                if (texto(prevista.nome) === texto(peca.nome) && ((prevista.medida && texto(prevista.medida) === texto(peca.medida))
                    || prevista.tipoId === peca.tipoId)) {
                    return rejeitar('PECA_POSSIVELMENTE_DUPLICADA', 'nome', 'Já existe uma peça com esse nome e categoria ou medida.');
                }
            }
            const alteracoes = camposPecaEditaveis.filter(chave => {
                if (!atual) return true;
                const anterior = chave === 'quantidadeTotal' ? totalAnterior
                    : ['codigo', 'medida', 'barras'].includes(chave) ? (atual[chave] ?? '') : atual[chave];
                return prevista[chave] !== anterior;
            });
            if (!alteracoes.length) return rejeitar('SEM_ALTERACOES', '', 'Não há alterações para confirmar.');
            const revisao = atual?.controleEdicaoEstoque === undefined ? 0 : atual.controleEdicaoEstoque?.revisao;
            if (!Number.isSafeInteger(revisao) || revisao < 0 || revisao === Number.MAX_SAFE_INTEGER) {
                return rejeitar('CONTROLE_EDICAO_INVALIDO', '', 'O controle de revisão precisa de conferência.');
            }
            for (const chave of ['historicoOperacional', 'historicoMovimentacoes']) {
                if (prevista[chave] !== undefined && !Array.isArray(prevista[chave])) return rejeitar('HISTORICO_INVALIDO', '', 'O histórico da peça precisa de conferência.');
            }
            const delta = total - totalAnterior;
            // Conserva indisponibilidades legadas adicionais, sem liberar saldo por editar nome/preco.
            const disponibilidadeAnterior = Math.min(saldoLegado, totalAnterior - comprometido);
            prevista.quantidade = total;
            prevista.disponivel = Math.min(total - comprometido, Math.max(0, disponibilidadeAnterior + delta));
            ['reservado', 'manutencao', 'avariado', 'perdido'].forEach((chave, indice) => { prevista[chave] = saldos[indice]; });
            const plano = { modo: dados.modo, pecaId: dados.pecaId, revisaoEsperada: dados.revisaoEsperada,
                revisaoPosterior: revisao + 1, alteracoes, delta, totalAnterior, disponibilidadeAnterior, peca: prevista };
            return { ok: true, valido: true, ...plano, assinatura: `peca-plano-v1:${fingerprintFnv1a64(jsonCanonicoPeca(plano))}`, bloqueios: [] };
        } catch (_erro) { return { ok: false, valido: false, codigo: 'DADOS_NAO_PERSISTIVEIS', bloqueios: [] }; }
    }

    function verificarOperacaoPeca(estadoRecebido, operacao) {
        try {
            const estado = copiarDadosPeca(estadoRecebido);
            const op = copiarDadosPeca(operacao);
            if (op.tipo === 'destinacao_pecas') return verificarDestinacaoPecas(estado, op);
            const auditorias = estado.logsAuditoria.filter(x => x.operacaoId === op.operacaoId);
            const historicos = estado.pecas.flatMap(p => (p.historicoOperacional || []).map(h => ({ p, h })))
                .filter(x => x.h.operacaoId === op.operacaoId);
            const movimentos = estado.movimentacoesEstoque.filter(x => x.operacaoId === op.operacaoId);
            if (!auditorias.length && !historicos.length && !movimentos.length) return { estado: 'nao_executada', completo: false };
            const registro = resolverIdentidadePeca(estado.pecas, op.pecaId);
            const corresponde = x => x.pecaId === op.pecaId && x.assinaturaPlano === op.assinaturaPlano;
            const h = historicos[0]?.h;
            const completo = registro.encontrado && auditorias.length === 1 && historicos.length === 1
                && historicos[0].p.id === op.pecaId && corresponde(h) && corresponde(auditorias[0])
                && Array.isArray(h.movimentacaoIds) && movimentos.length === h.movimentacaoIds.length
                && movimentos.every(m => corresponde(m) && h.movimentacaoIds.includes(m.id))
                && new Set(movimentos.map(m => m.id)).size === movimentos.length
                && registro.registro.controleEdicaoEstoque?.revisao >= h.revisaoPosterior;
            return { estado: completo ? 'concluida' : 'inconsistente', completo,
                ...(completo ? { ultimaEdicao: h.ultimaEdicao } : {}) };
        } catch (_erro) { return { estado: 'inconsistente', completo: false }; }
    }

    function analisarVinculosPecaInterno(peca, estado) {
        const vinculos = [];
        const adicionar = (classe, colecao, registroId, motivo) => vinculos.push({ classe, colecao, registroId: registroId ?? null, motivo });
        const referencia = (valor) => valor === peca.id;
        const contem = (valor, itemLegado = false) => {
            if (!valor || typeof valor !== 'object') return false;
            if (itemLegado && referencia(valor.id)) return true;
            return Object.entries(valor).some(([chave, filho]) => {
                if (['pecaId', 'idPeca', 'peca'].includes(chave) && referencia(filho)) return true;
                if (chave === 'pecaIds' && Array.isArray(filho) && filho.some(referencia)) return true;
                if (['items', 'itens'].includes(chave) && Array.isArray(filho) && filho.some(i => contem(i, true))) return true;
                return contem(filho);
            });
        };
        const encerrada = l => ['cancelado', 'devolvido'].includes(l.status)
            || ['cancelado', 'devolvido'].includes(l.statusFluxo) || l.estoqueReserva?.status === 'liberado'
            || estado.devolucoes.some(d => d.locacaoId === l.id && d.tipo === 'total');
        const saldos = ['reservado', 'manutencao', 'avariado', 'perdido'].map(k => inteiroLegadoNaoNegativo(peca[k] ?? 0));
        if (saldos.some(v => v === null) || saldos.slice(0, 3).some(v => v > 0)) {
            adicionar('operacional', 'pecas', peca.id, 'Saldos reservados, em manutenção ou avariados precisam de liberação/conferência.');
        }
        const total = inteiroLegadoNaoNegativo(peca.quantidadeTotal ?? peca.quantidade);
        const disponivel = inteiroLegadoNaoNegativo(peca.disponivel ?? total);
        if (total === null || disponivel === null || disponivel > total
            || total - disponivel > saldos.reduce((s, v) => s + (v || 0), 0)) {
            adicionar('operacional', 'pecas', peca.id, 'Existe saldo indisponível ou inconsistente sem origem confirmada.');
        }
        if (saldos[3] > 0 || (peca.historicoOperacional?.length || peca.historicoMovimentacoes?.length)) {
            adicionar('historico', 'pecas', peca.id, 'A peça possui histórico ou perda registrada.');
        }
        for (const [chave, valor] of Object.entries(peca)) {
            if (!['historicoOperacional', 'historicoMovimentacoes'].includes(chave) && contem({ [chave]: valor })) {
                adicionar('operacional', 'pecas', peca.id, 'Vínculo operacional adicional no cadastro da peça precisa de conferência.');
            }
        }
        for (const [colecao, dados] of Object.entries(estado)) {
            if (colecao === 'pecas') {
                for (const outra of dados) if (outra !== peca && contem(outra)) adicionar('operacional', colecao, outra.id, 'Outra peça ou estrutura utiliza este item.');
                continue;
            }
            const registros = Array.isArray(dados) ? dados : [dados];
            for (const registro of registros) {
                if (!contem(registro)) continue;
                let historico = ['movimentacoesEstoque', 'logsAuditoria', 'propostas'].includes(colecao);
                if (colecao === 'locacoes') historico = encerrada(registro)
                    && !(contem(registro.checklist) && registro.checklist.concluido !== true && registro.checklist.status !== 'concluido');
                if (colecao === 'devolucoes') {
                    const locacao = resolverIdentidadePeca(estado.locacoes, registro.locacaoId);
                    historico = registro.tipo === 'total' || (locacao.encontrado && encerrada(locacao.registro));
                }
                if (colecao === 'checklistsGerados') historico = registro.concluido === true;
                adicionar(historico ? 'historico' : 'operacional', colecao, registro.id,
                    historico ? 'Referência histórica preservada.' : 'Vínculo operacional precisa ser encerrado ou removido na origem.');
            }
        }
        // Movimentos antigos normalizaram IDs numericos para texto. Nao apaga a
        // peca quando essa origem nao permite distinguir a identidade com certeza.
        if (typeof peca.id === 'number' && estado.movimentacoesEstoque.some(m =>
            m.origemEvento !== 'edicao_transacional_estoque' && m.pecaId === JSON.stringify(peca.id))) {
            adicionar('historico', 'movimentacoesEstoque', null, 'Referência legada textual preservada conservadoramente.');
        }
        return vinculos;
    }

    function planejarDestinacaoPecas(entradaRecebida, estadoRecebido) {
        try {
            const entrada = copiarDadosPeca(entradaRecebida), estado = operacionalPeca(estadoRecebido);
            const bloqueios = [], itens = [], vistos = new Set();
            if (!Array.isArray(entrada.referencias) || !entrada.referencias.length) return { ok: false, codigo: 'REFERENCIA_INVALIDA', itens: [], bloqueios: [] };
            if (entrada.revisaoEsperada !== revisaoEstadoPeca(estado)) return { ok: false, codigo: 'REVISAO_DIVERGENTE', itens: [], bloqueios: [] };
            for (const ref of entrada.referencias) {
                const r = resolverReferenciaPecaInterna(ref, estado.pecas);
                const codigo = vistos.has(ref) ? 'REFERENCIA_REPETIDA' : r.estado === 'duplicado' ? 'PECA_ID_DUPLICADO'
                    : r.estado === 'ausente' ? 'PECA_AUSENTE' : !r.encontrado ? 'REFERENCIA_INVALIDA' : '';
                vistos.add(ref);
                if (codigo) { itens.push({ referencia: ref, acao: 'invalida', codigo }); bloqueios.push({ codigo, mensagem: 'Identidade ausente, inválida, duplicada ou repetida no lote.' }); continue; }
                const peca = r.registro, vinculos = analisarVinculosPecaInterno(peca, estado);
                const bloqueada = vinculos.some(v => v.classe === 'operacional');
                const acao = bloqueada ? 'bloqueada' : peca.status === 'inativo' ? 'manter'
                    : vinculos.length ? 'inativar' : 'excluir';
                const codigoItem = bloqueada ? 'PECA_COM_VINCULO_OPERACIONAL' : vinculos.length ? 'PECA_COM_VINCULO_HISTORICO' : '';
                itens.push({ referencia: ref, pecaId: peca.id, nome: peca.nome || 'Sem nome', acao, codigo: codigoItem, vinculos });
                if (bloqueada) bloqueios.push({ codigo: codigoItem, mensagem: `${peca.nome || 'Peça'}: vínculo operacional impede exclusão ou inativação.` });
            }
            const plano = { modo: 'destinacao', referencias: entrada.referencias, revisaoEsperada: entrada.revisaoEsperada, itens };
            return { ...plano, ok: !bloqueios.length, codigo: bloqueios[0]?.codigo || 'PLANO_ESTOQUE_VALIDO', bloqueios,
                assinatura: `peca-destinacao-v1:${fingerprintFnv1a64(jsonCanonicoPeca(plano))}` };
        } catch (_erro) { return { ok: false, codigo: 'DADOS_NAO_PERSISTIVEIS', itens: [], bloqueios: [] }; }
    }

    function verificarDestinacaoPecas(estado, op) {
        const auditorias = estado.logsAuditoria.filter(a => a.operacaoId === op.operacaoId);
        const movimentos = estado.movimentacoesEstoque.filter(m => m.operacaoId === op.operacaoId);
        const historicos = estado.pecas.flatMap(p => (p.historicoOperacional || []).filter(h => h.operacaoId === op.operacaoId).map(h => ({ p, h })));
        if (!auditorias.length && !movimentos.length && !historicos.length) return { completo: false, estado: 'nao_executada' };
        const a = auditorias[0];
        const completo = auditorias.length === 1 && !movimentos.length && a.tipoOperacao === 'destinacao_pecas'
            && a.assinaturaPlano === op.assinaturaPlano && Array.isArray(a.itens)
            && jsonCanonicoPeca(a.referencias) === jsonCanonicoPeca(op.referencias)
            && a.itens.length === op.referencias.length && new Set(a.itens.map(i => i.referencia)).size === a.itens.length
            && historicos.length === a.itens.filter(i => i.acao === 'inativar').length
            && a.itens.every(i => {
                if (!op.referencias.includes(i.referencia)) return false;
                const r = resolverIdentidadePeca(estado.pecas, i.pecaId);
                if (i.acao === 'excluir') return r.estado === 'ausente';
                if (!r.encontrado || r.registro.status !== 'inativo') return false;
                if (i.acao === 'manter') return true;
                const hs = historicos.filter(x => x.p.id === i.pecaId && x.h.assinaturaPlano === op.assinaturaPlano);
                return i.acao === 'inativar' && hs.length === 1;
            });
        return { completo, estado: completo ? 'concluida' : 'inconsistente', ...(completo ? { ultimaEdicao: a.ultimaEdicao } : {}) };
    }

    function aplicarDestinacaoNoCandidato(candidato, plano, entrada, operacao) {
        const itens = plano.itens.map(({ referencia, pecaId, nome, acao }) => ({ referencia, pecaId, nome, acao }));
        const auditoria = { ...operacao, id: `audit-peca-${entrada.operacaoId}`, tipoOperacao: 'destinacao_pecas', tipo: 'item', acao: 'destinacao',
            timestamp: entrada.atualizadoEm, data: entrada.atualizadoEm, usuario: entrada.atualizadoPor,
            ultimaEdicao: entrada.persistencia?.ultimaEdicao, descricao: 'Exclusão/inativação segura do estoque', itens };
        for (const item of itens) {
            const p = resolverIdentidadePeca(candidato.pecas, item.pecaId).registro;
            if (item.acao === 'excluir') candidato.pecas = candidato.pecas.filter(x => x !== p);
            if (item.acao === 'inativar') {
                p.status = 'inativo';
                p.historicoOperacional = [...(p.historicoOperacional || []), { operacaoId: entrada.operacaoId,
                    assinaturaPlano: operacao.assinaturaPlano, pecaId: p.id, acao: 'inativar', dataHora: entrada.atualizadoEm, usuario: entrada.atualizadoPor }];
            }
        }
        candidato.logsAuditoria.unshift(copiarDadosPeca(auditoria));
    }

    function executarAlteracaoPecaTransacional(entradaRecebida, dependencias = {}) {
        if (transacaoPecaAtiva) return resultadoBase('OPERACAO_ESTOQUE_EM_ANDAMENTO');
        transacaoPecaAtiva = true;
        let escritaTentada = false;
        let autorizacao = null;
        let commit = false;
        let operacao = null;
        try {
            const entrada = copiarDadosPeca(entradaRecebida);
            if (!/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(entrada.operacaoId || '')
                || typeof entrada.operacaoId !== 'string' || !textoObrigatorio(entrada.atualizadoEm, 40)
                || entrada.operacaoId.trim() !== entrada.operacaoId
                || !textoObrigatorio(entrada.atualizadoPor, 320)) return resultadoBase('ENTRADA_INVALIDA');
            for (const nome of ['obterEstadoMemoriaAtual', 'persistirSnapshotLocalConfirmavel', 'publicarSnapshotAutorizado']) {
                if (typeof dependencias[nome] !== 'function') return resultadoBase('DEPENDENCIAS_TRANSACIONAIS_INVALIDAS');
            }
            const raiz = dependencias.obterEstadoMemoriaAtual();
            const estado = operacionalPeca(raiz);
            const jsonInicial = jsonCanonicoPeca(estado);
            const destinacao = entrada.modo === 'destinacao';
            operacao = destinacao
                ? { tipo: 'destinacao_pecas', referencias: entrada.referencias, operacaoId: entrada.operacaoId, assinaturaPlano: entrada.assinaturaPlanoEsperada }
                : { pecaId: entrada.pecaId, operacaoId: entrada.operacaoId, assinaturaPlano: entrada.assinaturaPlanoEsperada };
            const evidencia = verificarOperacaoPeca(estado, operacao);
            const opcoesStorage = { armazenamento: dependencias.armazenamento };
            const leitura = lerBasePersistidaPeca(opcoesStorage);
            if (evidencia.completo) {
                if (!leitura.ok || !verificarOperacaoPeca(leitura.snapshot, operacao).completo
                    || jsonCanonicoPeca(operacionalPeca(leitura.snapshot)) !== jsonInicial) {
                    return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
                }
                return resultadoBase('OPERACAO_JA_CONCLUIDA', { ok: true, aplicado: true, idempotente: true, operacao });
            }
            if (evidencia.estado !== 'nao_executada') return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
            if (leitura.ok) {
                if (jsonCanonicoPeca(operacionalPeca(leitura.snapshot)) !== jsonInicial) {
                    return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
                }
            } else if (leitura.codigo !== 'SNAPSHOT_PERSISTIDO_AUSENTE') return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
            const plano = destinacao ? planejarDestinacaoPecas(entrada, estado) : planejarAlteracaoPeca(entrada, estado);
            if (!plano.ok) return resultadoBase(plano.codigo, { bloqueios: plano.bloqueios });
            if (plano.assinatura !== entrada.assinaturaPlanoEsperada) return resultadoBase('ASSINATURA_DIVERGENTE');
            if (destinacao && plano.itens.every(i => i.acao === 'manter')) {
                if (!leitura.ok) return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
                return resultadoBase('PECA_INATIVADA', { ok: true, idempotente: true });
            }
            const candidato = copiarDadosPeca(estado);
            if (destinacao) {
                if (candidato.logsAuditoria.some(a => a.id === `audit-peca-${entrada.operacaoId}`)) return resultadoBase('IDENTIDADE_OPERACAO_DUPLICADA');
                aplicarDestinacaoNoCandidato(candidato, plano, entrada, operacao);
            } else {
            const peca = copiarDadosPeca(plano.peca);
            const movimentoId = `mov-peca-${entrada.operacaoId}`;
            const registrarMovimento = entrada.modo === 'inclusao' || plano.delta !== 0;
            if (candidato.movimentacoesEstoque.some(m => m.id === movimentoId)
                || candidato.logsAuditoria.some(a => a.id === `audit-peca-${entrada.operacaoId}`)) return resultadoBase('IDENTIDADE_OPERACAO_DUPLICADA');
            const historico = { ...operacao, id: `hist-peca-${entrada.operacaoId}`, acao: entrada.modo,
                dataHora: entrada.atualizadoEm, usuario: entrada.atualizadoPor, ultimaEdicao: entrada.persistencia?.ultimaEdicao,
                revisaoPosterior: plano.revisaoPosterior, campos: plano.alteracoes,
                quantidadeAnterior: plano.totalAnterior, quantidadePosterior: peca.quantidadeTotal,
                movimentacaoIds: registrarMovimento ? [movimentoId] : [] };
            peca.historicoOperacional = [...(peca.historicoOperacional || []), copiarDadosPeca(historico)];
            peca.controleEdicaoEstoque = { ...(peca.controleEdicaoEstoque || {}), revisao: plano.revisaoPosterior,
                ultimaOperacaoId: entrada.operacaoId, assinaturaPlano: plano.assinatura, atualizadoEm: entrada.atualizadoEm };
            if (registrarMovimento) {
                candidato.movimentacoesEstoque.unshift({ ...operacao, id: movimentoId, chaveIdempotencia: movimentoId,
                    tipoMovimentacao: entrada.modo === 'inclusao' ? 'entrada' : 'ajuste',
                    quantidade: Math.abs(plano.delta), deltaQuantidade: plano.delta,
                    pecaNome: peca.nome, dataHora: entrada.atualizadoEm, usuario: entrada.atualizadoPor,
                    locacaoId: '', locacaoRef: '', valorEstimado: 0,
                    saldoAntes: plano.disponibilidadeAnterior, saldoDepois: peca.disponivel,
                    origemEvento: 'edicao_transacional_estoque', statusProcessamento: 'auditoria',
                    observacao: `Quantidade total: ${plano.totalAnterior} -> ${peca.quantidadeTotal}.` });
                peca.historicoMovimentacoes = [...(peca.historicoMovimentacoes || []), movimentoId];
            }
            if (entrada.modo === 'inclusao') candidato.pecas.push(peca);
            else candidato.pecas[candidato.pecas.findIndex(p => p.id === entrada.pecaId)] = peca;
            candidato.logsAuditoria.unshift({ ...copiarDadosPeca(historico), id: `audit-peca-${entrada.operacaoId}`,
                tipo: 'item', timestamp: entrada.atualizadoEm, data: entrada.atualizadoEm,
                acao: entrada.modo === 'inclusao' ? 'criar' : 'editar', descricao: `${entrada.modo === 'inclusao' ? 'Inclusão' : 'Edição'} da peça ${peca.nome}` });
            }
            if (!verificarOperacaoPeca(candidato, operacao).completo) return resultadoBase('EVIDENCIAS_OPERACAO_INCOMPLETAS');
            const preparado = prepararSnapshotPecaInterno(copiarDadosPeca(candidato), copiarDadosPeca(entrada.persistencia));
            if (!preparado.ok) return resultadoBase(preparado.codigo);
            const esperado = copiarDadosPeca(preparado.snapshot);
            const jsonEsperado = jsonCanonicoPeca(esperado);
            if (jsonCanonicoPeca(operacionalPeca(esperado)) !== jsonCanonicoPeca(candidato)) return resultadoBase('SNAPSHOT_PREPARADO_DIVERGENTE');
            if (dependencias.obterEstadoMemoriaAtual() !== raiz || jsonCanonicoPeca(operacionalPeca(raiz)) !== jsonInicial) return resultadoBase('REVISAO_DIVERGENTE');
            escritaTentada = true;
            let resposta;
            try { resposta = copiarDadosPeca(dependencias.persistirSnapshotLocalConfirmavel(copiarDadosPeca(esperado), { ...opcoesStorage })); }
            catch (_erro) { resposta = null; }
            // A resposta externa nao e prova: a releitura independente sempre decide.
            const releitura = lerBasePersistidaPeca(opcoesStorage);
            if (!releitura.ok || jsonCanonicoPeca(releitura.snapshot) !== jsonEsperado) {
                const naoGravado = releitura.ok && jsonCanonicoPeca(operacionalPeca(releitura.snapshot)) === jsonInicial
                    || !leitura.ok && releitura.codigo === 'SNAPSHOT_PERSISTIDO_AUSENTE';
                return resultadoBase(naoGravado ? 'FALHA_PERSISTENCIA' : 'PERSISTENCIA_CONFIRMADA_DIVERGENTE', { requerRecuperacao: !naoGravado });
            }
            const confirmado = operacionalPeca(releitura.snapshot);
            const ultimaRaiz = dependencias.obterEstadoMemoriaAtual();
            if (ultimaRaiz !== raiz || jsonCanonicoPeca(operacionalPeca(raiz)) !== jsonInicial) return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true });
            const jsonPublicacao = JSON.stringify(confirmado);
            const fingerprintPublicacaoEsperado = fingerprintFnv1a64(jsonPublicacao);
            autorizacao = prepararAutorizacaoPublicacaoConfiavel?.({ operacaoId: entrada.operacaoId,
                fingerprintPublicacaoEsperado, estadoAnterior: raiz });
            if (!autorizacao) return resultadoBase('ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', { requerRecuperacao: true });
            let falhouPublicacao = false;
            try { dependencias.publicarSnapshotAutorizado(copiarDadosPeca(confirmado), {
                jsonOperacionalEsperado: jsonPublicacao, autorizacaoPublicacao: autorizacao, exigirConfirmacaoInterna: true
            }); } catch (_erro) { falhouPublicacao = true; }
            // Daqui em diante, somente a fronteira privada e operacoes internas.
            const prova = consultarConfirmacaoPublicacaoConfiavel({ operacaoId: entrada.operacaoId,
                fingerprintPublicacaoEsperado, estadoAnterior: raiz, autorizacaoPublicacao: autorizacao });
            autorizacao = null;
            commit = prova?.confirmada === true && prova.trocas === 1;
            if (!commit) return resultadoBase('ESTADO_PERSISTIDO_MEMORIA_NAO_PUBLICADA', { requerRecuperacao: true });
            const codigoSucesso = destinacao ? (plano.itens.length > 1 ? 'LOTE_ESTOQUE_APLICADO'
                : plano.itens[0].acao === 'excluir' ? 'PECA_EXCLUIDA' : 'PECA_INATIVADA')
                : entrada.modo === 'inclusao' ? 'PECA_INCLUIDA' : 'PECA_ATUALIZADA';
            return resultadoBase(codigoSucesso, {
                ok: true, aplicado: true, publicacaoRealizada: true, operacao, renderizar: true,
                avisos: [{ codigo: 'METADADO_SYNC_PENDENTE' },
                    ...(falhouPublicacao ? [{ codigo: 'PUBLICACAO_CONFIRMADA_APOS_EXCECAO' }] : []),
                    ...(!resposta?.ok ? [{ codigo: 'PERSISTENCIA_CONFIRMADA_POR_RELEITURA' }] : [])]
            });
        } catch (_erro) {
            return resultadoBase(commit ? 'PECA_ATUALIZADA' : 'FALHA_TRANSACIONAL_ESTOQUE', {
                ok: commit, aplicado: commit, publicacaoRealizada: commit, operacao,
                requerRecuperacao: !commit && escritaTentada, renderizar: commit,
                avisos: commit ? [{ codigo: 'METADADO_SYNC_PENDENTE' }] : []
            });
        } finally {
            if (autorizacao) cancelarAutorizacaoPublicacaoConfiavel?.(autorizacao);
            transacaoPecaAtiva = false;
        }
    }

    // Pos-transacao explicita: nunca executada pelo nucleo, nem em falhas pre-commit.
    function concluirMetadadoOperacaoPeca(resultado, dependencias) {
        const retorno = copiarDadosPeca(resultado);
        if (!retorno.ok || !retorno.aplicado || retorno.idempotente) return retorno;
        try {
            const estado = operacionalPeca(dependencias.obterEstadoMemoriaAtual());
            const prova = verificarOperacaoPeca(estado, retorno.operacao);
            if (!prova.completo) return resultadoBase('OPERACAO_REQUER_RECUPERACAO', { requerRecuperacao: true, publicacaoRealizada: retorno.publicacaoRealizada });
            const atualizado = dependencias.atualizarMetadadoSincronizacao({ ultimaEdicao: prova.ultimaEdicao });
            const marcador = dependencias.obterMetadadoSincronizacaoAtual();
            if (atualizado !== true || marcador !== `${prova.ultimaEdicao}`) return retorno;
            retorno.avisos = retorno.avisos.filter(a => a.codigo !== 'METADADO_SYNC_PENDENTE');
            retorno.efeitos.sincronizar = true;
        } catch (_erro) { /* A publicacao confirmada nao e desfeita por falha do marcador. */ }
        return retorno;
    }

    window.capturarRevisaoEstoque = capturarRevisaoEstoque;
    window.planejarDestinacaoPecas = planejarDestinacaoPecas;
    window.planejarAlteracaoPeca = planejarAlteracaoPeca;
    window.verificarOperacaoPeca = verificarOperacaoPeca;
    window.executarAlteracaoPecaTransacional = executarAlteracaoPecaTransacional;
    window.concluirMetadadoOperacaoPeca = concluirMetadadoOperacaoPeca;
    window.gerarAssinaturaDevolucaoLocacao = gerarAssinaturaDevolucaoLocacao;
    window.executarDevolucaoLocacaoTransacional = executarDevolucaoLocacaoTransacional;
    window.executarAjusteReservaLocacao = executarAjusteReservaLocacao;
})();
