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
        const quantidadeLiberar = inteiroSeguroNaoNegativo(historico?.resumoMovimentacoes?.liberar);
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

    window.executarAjusteReservaLocacao = executarAjusteReservaLocacao;
})();
