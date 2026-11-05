// GERADO por AST, somente declaracoes compartilhadas. Nao carregado pelo index.
export const manifesto = Object.freeze({
  "CAMPOS_OPERACIONAIS_AUTORIZADOS": "2d34cab1e63e45daf9715037ee4969862e0bfb71cc5cee14381bf3cdbd040ca9",
  "COLECOES_SEM_ORDEM_SEMANTICA": "d0f1f4ba5a43119ff4d80dabd54e10031d231936b88eb5541a183031722cea88",
  "CHAVES_METADADOS_PERSISTENCIA": "9f12f1a6c74a704f6e0106b10713ffa3c0fb2e59b61a388cdbcd0e170794c428",
  "CAMPO_PROVAS_RECUPERACAO": "fd8d53e9887c32ad82e1e19f997fa5fc09e172765f38e32fe7415841dfbf059b",
  "referenciaEstrita": "b867d647be2eb39d787d60acc5bc05058912599cd0cbe17580300c8de93c9913",
  "inteiroSeguroNaoNegativo": "c42ced863d65d1d72e1b1abaf3aabc953c0cbb332cf4222a6bc83187eb97ecd7",
  "textoObrigatorio": "f5d904858b386473e779c6f6c15ccdbaa3f6298b405222d2bb63fde079fbe35c",
  "resultadoClonagem": "11a82cd89baaafa6ecc9fed54ee595e42ec576dada714f451805f4a0ab9eee71",
  "clonarJsonInterno": "5cfbfb0a03bf5e8822d76c5f476e57cea8fa6cf14f2e3ed454db4bb7d42e2010",
  "clonarDescartavel": "65d48d22621a8cf5becd89340a5c11ebfe7caaa02fc3549efe144f52d0a48c47",
  "normalizarDataSnapshotReserva": "47672ec2f562d0615dcc9ee8eca33dd7456d77899e3d8699fee73fc6b013e30c",
  "inteiroDominioNaoNegativo": "90028413ad451e710419770f4fd298730b517a0b8833fed4e4ff7f95e9ca224e",
  "quantidadePropriaSnapshot": "2bb3518f5c8932b523b98298fd6794676f8425496cc98e0348f8f3c6116c5f47",
  "criarPeriodoSnapshotReservaInterno": "e4d4930395a1164dcd8862388f04a4b774c611108581e738838aae25255356eb",
  "criarReferenciaOperacionalV2Interna": "c0c3f42b16ae25d68716037824351f38a598ef2e8d8117af00c416cdf750ac82",
  "criarSnapshotReservaTipadoV2Interno": "60d6038e0f0d34f5a8437be54b751827694be76108273d18ec10fda3f76c2fe9",
  "somarDeltasIndividuais": "b753fd1a20faaaca11fa925e0de326110303238f1190e19d8cd011a8e8737dc5",
  "agruparAjustesPlano": "6ae4cb20ef4a1e13745d6cf65c95f98b9f3ef90d1686e273d111a54f109001d9",
  "mapasIguais": "051ffb0bd11c5f7b41d6f091ce1fcc9a992e3912cb76bc29a6ae4846a3fecef2",
  "reconciliarDeltas": "85c13cf513ba9b244d0ed4f1aff254d832dedab7cc2792360c7555164224776e",
  "chaveMovimentacao": "d40259a02b57b017c7bdcaf3094fc39c5bc2464b45520feae29ba0e2aa0101b8",
  "criarMovimentacoes": "867e2732a5c706efcc73601faae464752cdddfcde6187b192ec68b0908fb263d",
  "validarItemIdsHistoricos": "13053f086df8991c1fbe7119f3d9a04062f61822b1cb83f420a40f5a58181da0",
  "ordenarChavesCanonicas": "11470c28ca0e2b39e398ef7d1d37f6f08aba0718d74839a04376d537b5b13c49",
  "canonicalizarFingerprintRecuperacao": "a5fac8d35cf3bd9c4442d33c901de56cc156a9ad9bc28c9369c9c937ebd38c89",
  "removerProvasTecnicasOperacao": "ef8354478d2eb54d0fd5865256300141b37fa434bfeb0ec74b7348f776ee9de2",
  "fingerprintFnv1a64": "f3678e74502f53b44dd5652e8a37e47c8b7879715e1813e09189c52e8d6725aa",
  "gerarFingerprintRecuperacao": "bb69e011f6912fa19795cd43c636e77612579825efa0ecef1fdb0141c7692f71",
  "anexarProvasRecuperacao": "2637153ce4a7ce42ea169a27634a82325864e9be60f65b5e9346132aa1270986",
  "copiarPeriodo": "e64693e56139914d2e39e2f9da737ec756d7e870dcedcd9e576f26dfd923ef01",
  "mesclarObjetoPreservandoCampos": "a3bc0f1ad0e0b95f8ccfc5eb2635b4257b16a3615a87f50310d0abe87a280ee2",
  "preservarCamposItensAtuais": "9747fd182d9daba56b1861e3a45048e18a29ede0171f32a106fd23c69342b559",
  "preservarTombstones": "b1409cad04b6e16285a921a4626383954322423073d3e396c3a3c1994d9aa8b0",
  "construirCandidato": "2c588fa10d204ef49b62e9d06a97d40b29782d5985543a06aa417519626631fb",
  "construirCandidatoReservaInicialInterno": "5c9c7ea4f817a978802583b42d9d951bd168db379d820ed39b665dc0fe17a6a5",
  "construirCandidatoCancelamentoLocacaoInterno": "781f8b0b0e0ed18a68f40372c12c6e1b56320fbc86505cfb716544c10b095773"
});
export function criarNucleoConfiavel(contexto = {}) {

const CAMPOS_OPERACIONAIS_AUTORIZADOS = Object.freeze([
        'items',
        'dataAluguel',
        'dataDevolucaoPrevisao',
        'datasMontagem',
        'datasDesmontagem'
    ]);

const COLECOES_SEM_ORDEM_SEMANTICA = new Set([
        'locadores',
        'pecas',
        'tipos',
        'usuarios',
        'locacoes',
        'devolucoes',
        'transportes',
        'contasReceber',
        'categoriasFinanceiras',
        'centrosCusto',
        'conciliacoesFinanceiras',
        'conciliacoesPagamentosPagar'
    ]);

const CHAVES_METADADOS_PERSISTENCIA = new Set(['versao', 'data', 'ultimaEdicao']);

const CAMPO_PROVAS_RECUPERACAO = 'provasRecuperacao';

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

function criarPeriodoSnapshotReservaInterno(locacao) {
        const inicio = normalizarDataSnapshotReserva(locacao?.datasMontagem?.inicio || locacao?.dataAluguel || '');
        const fim = normalizarDataSnapshotReserva(
            locacao?.datasDesmontagem?.fim || locacao?.datasDesmontagem?.inicio
            || locacao?.dataDevolucaoPrevisao || ''
        );
        const inicioMs = inicio ? Date.parse(`${inicio}T00:00:00Z`) : null;
        const fimMs = fim ? Date.parse(`${fim}T00:00:00Z`) : null;
        return { inicio, fim, completo: Number.isFinite(inicioMs) && Number.isFinite(fimMs) && fimMs >= inicioMs };
    }

function criarReferenciaOperacionalV2Interna(tipo, id) {
        const valido = (typeof id === 'number' && Number.isSafeInteger(id) && !Object.is(id, -0))
            || (typeof id === 'string' && id.length > 0 && id.length <= 16384 && id.trim() === id
                && !/[\u0000-\u001f]/.test(id));
        if (!valido) throw new Error('IDENTIDADE_OPERACIONAL_INVALIDA');
        return `${tipo}:${encodeURIComponent(JSON.stringify([typeof id, id]))}`;
    }

function criarSnapshotReservaTipadoV2Interno(estado, locacao) {
        const referencia = criarReferenciaOperacionalV2Interna;
        const locacaoReferencia = referencia('locacao', locacao.id);
        const anterior = locacao.estoqueReserva?.snapshot?.versao === 2 ? locacao.estoqueReserva.snapshot : {};
        const grupos = new Map(), itensUsados = new Set(), itensTerceirizadosSemPeca = [];
        if (!Array.isArray(locacao.items) || !Array.isArray(estado.pecas) || !Array.isArray(estado.propostas)) {
            throw new Error('BASE_OPERACIONAL_INVALIDA');
        }
        const somar = (a, b) => {
            if (!Number.isSafeInteger(a) || a < 0 || !Number.isSafeInteger(b) || b < 0
                || !Number.isSafeInteger(a + b)) throw new Error('QUANTIDADE_OPERACIONAL_INVALIDA');
            return a + b;
        };
        for (const item of locacao.items) {
            if (typeof item.itemId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(item.itemId)
                || itensUsados.has(item.itemId)) throw new Error('ITEM_OPERACIONAL_INVALIDO');
            itensUsados.add(item.itemId);
            for (const campo of ['quantidade', 'quantidadePropria', 'quantidadeTerceirizada', 'devolvidos', 'avariadosEstoqueProprio']) {
                if (campo === 'quantidade' || Object.hasOwn(item, campo)) somar(0, item[campo]);
            }
            const propria = quantidadePropriaSnapshot(item);
            const retornados = somar(item.devolvidos ?? 0, item.avariadosEstoqueProprio ?? 0);
            if (propria > item.quantidade || retornados > propria) throw new Error('COMPOSICAO_OPERACIONAL_INVALIDA');
            if (Object.hasOwn(item, 'quantidadeTerceirizada') && somar(propria, item.quantidadeTerceirizada) !== item.quantidade) {
                throw new Error('COMPOSICAO_OPERACIONAL_INVALIDA');
            }
            const itemReferencia = `item-estoque-v2:${encodeURIComponent(JSON.stringify([[typeof locacao.id, locacao.id], item.itemId]))}`;
            if ((item.pecaId === '' || item.pecaId == null) && item.origemCusto === 'terceirizado'
                && item.quantidade > 0 && item.quantidadePropria === 0 && item.quantidadeTerceirizada === item.quantidade) {
                const linha = clonarJsonInterno(item);
                if (!linha.ok) throw new Error('ITEM_OPERACIONAL_INVALIDO');
                itensTerceirizadosSemPeca.push({ itemId: item.itemId, itemReferencia, linha: linha.valor });
                continue;
            }
            const pecaReferencia = referencia('peca', item.pecaId);
            if (estado.pecas.filter(p => referencia('peca', p.id) === pecaReferencia).length !== 1) {
                throw new Error('PECA_OPERACIONAL_AUSENTE_OU_DUPLICADA');
            }
            const grupoAnterior = Array.isArray(anterior.itens)
                ? anterior.itens.find(g => g.pecaReferencia === pecaReferencia) : null;
            const grupo = grupos.get(pecaReferencia) || { ...(grupoAnterior || {}), pecaId: item.pecaId,
                pecaReferencia, quantidadePropria: 0, quantidadePendente: 0, itens: [] };
            grupo.quantidadePropria = somar(grupo.quantidadePropria, propria);
            grupo.quantidadePendente = somar(grupo.quantidadePendente, propria - retornados);
            const itemAnterior = Array.isArray(grupoAnterior?.itens)
                ? grupoAnterior.itens.find(i => i.itemId === item.itemId && i.itemReferencia === itemReferencia) : null;
            grupo.itens.push({ ...(itemAnterior || {}), itemId: item.itemId, itemReferencia });
            grupos.set(pecaReferencia, grupo);
        }
        const temId = Object.hasOwn(locacao, 'propostaId') && locacao.propostaId !== null && locacao.propostaId !== '';
        const temReferencia = Object.hasOwn(locacao, 'propostaReferencia') && locacao.propostaReferencia !== null && locacao.propostaReferencia !== '';
        let propostaReferencia = null;
        if (temId || temReferencia) {
            propostaReferencia = temReferencia ? locacao.propostaReferencia : referencia('proposta', locacao.propostaId);
            const propostas = estado.propostas.filter(p => referencia('proposta', p.id) === propostaReferencia);
            if (propostas.length !== 1 || temId && referencia('proposta', locacao.propostaId) !== propostaReferencia) {
                throw new Error('VINCULO_PROPOSTA_OPERACIONAL_INVALIDO');
            }
        }
        const periodo = criarPeriodoSnapshotReservaInterno(locacao);
        if (!periodo.completo) throw new Error('PERIODO_OPERACIONAL_INCOMPLETO');
        const snapshot = { ...anterior, versao: 2, locacaoId: locacao.id, locacaoReferencia,
            reservaReferencia: referencia('reserva', locacaoReferencia), propostaReferencia,
            periodo: { ...(anterior.periodo || {}), ...periodo }, itens: Array.from(grupos.values()) };
        if (itensTerceirizadosSemPeca.length) snapshot.itensTerceirizadosSemPeca = itensTerceirizadosSemPeca;
        else delete snapshot.itensTerceirizadosSemPeca;
        return snapshot;
    }

function somarDeltasIndividuais(plano, versao = 1) {
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
                const pecaId = versao === 2 ? item?.pecaIdPretendido : textoObrigatorio(item?.pecaIdPretendido, 200);
                const chave = versao === 2 ? referenciaEstrita(pecaId) : pecaId;
                if (!chave) invalido = true;
                else {
                    reservar.set(chave, (reservar.get(chave) || 0) + quantidadeReservar);
                    itensReserva.push({ item, itemId, pecaId, quantidade: quantidadeReservar });
                }
            }
            if (quantidadeLiberar > 0) {
                const pecaId = versao === 2 ? item?.pecaIdAtual : textoObrigatorio(item?.pecaIdAtual, 200);
                const chave = versao === 2 ? referenciaEstrita(pecaId) : pecaId;
                if (!chave) invalido = true;
                else {
                    liberar.set(chave, (liberar.get(chave) || 0) + quantidadeLiberar);
                    itensLiberacao.push({ item, itemId, pecaId, quantidade: quantidadeLiberar });
                }
            }
        });
        return { reservar, liberar, itensReserva, itensLiberacao, invalido };
    }

function agruparAjustesPlano(lista, versao = 1) {
        const mapa = new Map();
        let invalido = false;
        (Array.isArray(lista) ? lista : []).forEach((ajuste) => {
            const pecaId = versao === 2 ? referenciaEstrita(ajuste?.pecaId) : textoObrigatorio(ajuste?.pecaId, 200);
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

function reconciliarDeltas(plano, versao = 1) {
        const individuais = somarDeltasIndividuais(plano, versao);
        const agrupadoReserva = agruparAjustesPlano(plano?.ajustes?.reservar, versao);
        const agrupadoLiberacao = agruparAjustesPlano(plano?.ajustes?.liberar, versao);
        const valido = !individuais.invalido
            && !agrupadoReserva.invalido
            && !agrupadoLiberacao.invalido
            && mapasIguais(individuais.reservar, agrupadoReserva.mapa)
            && mapasIguais(individuais.liberar, agrupadoLiberacao.mapa);
        return { valido, ...individuais };
    }

function chaveMovimentacao(operacaoId, locacaoId, subtipo, itemId, pecaId, versao = 1) {
        if (versao === 2) return `ajuste-reserva-v2:${encodeURIComponent(JSON.stringify([
            operacaoId, [typeof locacaoId, locacaoId], subtipo, itemId, [typeof pecaId, pecaId]
        ]))}`;
        return [
            'ajuste-reserva-locacao-v1',
            operacaoId,
            referenciaEstrita(locacaoId),
            subtipo,
            itemId,
            pecaId
        ].join('|');
    }

function criarMovimentacoes(reconciliacao, metadados, versao = 1) {
        const criar = (registro, subtipo) => {
            const chave = chaveMovimentacao(
                metadados.operacaoId,
                metadados.locacaoId,
                subtipo,
                registro.itemId,
                registro.pecaId,
                versao
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
            Object.defineProperty(resultado, chave, {
                value: ordenarChavesCanonicas(valor[chave], [...caminho, chave]),
                enumerable: true, writable: true, configurable: true
            });
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
            Object.defineProperty(resultado, chave, {
                value: canonicalizarFingerprintRecuperacao(valor[chave], [...caminho, chave]),
                enumerable: true, writable: true, configurable: true
            });
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

function construirCandidato(estado, locacaoAtual, indiceLocacao, dadosEditados, plano,
        reconciliacao, registroOperacao, checkpoint, entrada, dependencias, versao = 1) {
        if (versao !== 1 && versao !== 2) return { ok: false, codigo: 'VERSAO_AJUSTE_INVALIDA' };
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
        const movimentacoes = criarMovimentacoes(reconciliacao, metadados, versao);
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
        const snapshot = versao === 2 ? criarSnapshotReservaTipadoV2Interno(candidato, locacaoCandidata)
            : dependencias.criarSnapshotReservaLocacao(locacaoCandidata, {
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
        if (versao === 2 && locacaoAtual.estoqueReserva?.snapshot?.versao === 1) {
            locacaoCandidata.estoqueReserva.snapshotLegadoPreservado = clonarDescartavel(locacaoAtual.estoqueReserva.snapshot);
        }

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
        if (versao === 2) {
            const alvos = Array.from(new Set([...locacaoAtual.items, ...locacaoCandidata.items].map(i => i.pecaId)));
            candidato.pecas = dependencias.recalcularDisponibilidadeEstado(candidato, entrada.atualizadoEm, alvos);
        }
        return { ok: true, codigo: 'SUCESSO', candidato, locacaoCandidata, movimentacoes, historico };
    }

function construirCandidatoReservaInicialInterno(estado, indice, plano, metadados, dependencias) {
        const copia = clonarJsonInterno(estado);
        if (!copia.ok) return copia;
        const candidato = copia.valor, locacao = candidato.locacoes[indice];
        const referencia = criarReferenciaOperacionalV2Interna('locacao', locacao.id);
        const comando = { tipo: 'reserva_inicial', locacaoReferencia: referencia };
        const assinaturaPlano = `reserva-estoque-v2:fnv1a64:${fingerprintFnv1a64(JSON.stringify(
            ordenarChavesCanonicas({ locacaoAnterior: locacao, comando, metadados })
        ))}`;
        const timestamp = metadados.timestamp, usuario = metadados.atorReferencia;
        const saldos = new Map(Array.from(plano.consultasPorPeca, ([id, consulta]) => [id, consulta.disponivel]));
        const movimentos = plano.reservas.map(reserva => {
            const saldoAntes = saldos.get(reserva.pecaId), saldoDepois = saldoAntes - reserva.quantidade;
            if (!Number.isSafeInteger(saldoDepois) || saldoDepois < 0) throw new Error('DISPONIBILIDADE_INSUFICIENTE');
            saldos.set(reserva.pecaId, saldoDepois);
            return dependencias.construirRegistroMovimentacaoEstoque({
                id: reserva.chaveIdempotencia, movimentacaoId: reserva.chaveIdempotencia,
                chaveIdempotencia: reserva.chaveIdempotencia, pecaId: reserva.pecaId,
                pecaNome: reserva.peca.nome, tipoMovimentacao: 'reserva', quantidade: reserva.quantidade,
                locacaoId: locacao.id, locacaoReferencia: referencia, itemId: reserva.item.itemId,
                locacaoRef: `#${String(locacao.id).slice(-4)}`, usuario, dataHora: timestamp,
                observacao: `Reserva expl\u00edcita do item ${reserva.descricao}.`, saldoAntes, saldoDepois,
                origemEvento: 'reserva_explicita_locacao', statusProcessamento: 'confirmado',
                operacaoId: metadados.operacaoId, assinaturaPlano
            }, { tipado: true, id: reserva.chaveIdempotencia, usuario, dataHora: timestamp });
        });
        const existentes = new Set(candidato.movimentacoesEstoque.map(m => m.chaveIdempotencia));
        if (movimentos.some(m => existentes.has(m.chaveIdempotencia))) return { ok: false, codigo: 'MOVIMENTO_RESERVA_DUPLICADO' };
        // A ordem unshift do legado e preservada, sem truncar provas antigas.
        candidato.movimentacoesEstoque = [...movimentos.slice().reverse(), ...candidato.movimentacoesEstoque];
        locacao.estoqueReserva = {
            ...dependencias.normalizarEstoqueReservaComRegistrosLocacao(locacao, candidato.devolucoes),
            status: 'reservado', origem: 'reserva_explicita', reservadoEm: timestamp, reservadoPor: usuario,
            movimentacaoIds: movimentos.map(m => m.id)
        };
        locacao.estoqueReserva.snapshot = criarSnapshotReservaTipadoV2Interno(candidato, locacao);
        const historico = dependencias.criarRegistroHistoricoLocacaoDominio(locacao, {
            acao: 'reserva_estoque', descricao: `Estoque reservado para ${plano.reservas.length} item(ns) pr\u00f3prio(s).`,
            origem: 'locacoes', usuario
        }, { id: Date.parse(timestamp), timestamp, usuario });
        Object.assign(historico, { locacaoId: locacao.id, locacaoReferencia: referencia,
            operacaoId: metadados.operacaoId, assinaturaPlano, comandoOperacionalV2: comando });
        locacao.historicoAlteracoes = [...(locacao.historicoAlteracoes || []), historico];
        candidato.logsAuditoria = [...candidato.logsAuditoria, {
            id: `auditoria-reserva-${metadados.operacaoId}`, data: timestamp, timestamp,
            origem: 'reserva_inicial_v2', acao: 'reserva_estoque', tipo: 'reserva', usuario,
            locacaoId: locacao.id, locacaoReferencia: referencia, operacaoId: metadados.operacaoId,
            assinaturaPlano, movimentacaoIds: movimentos.map(m => m.id)
        }];
        candidato.pecas = dependencias.recalcularDisponibilidadeEstado(candidato, timestamp);
        return { ok: true, codigo: 'CANDIDATO_RESERVA_INICIAL', candidato };
    }

function construirCandidatoCancelamentoLocacaoInterno(estado, indice, metadados, dependencias) {
        const clonagem = clonarJsonInterno(estado);
        if (!clonagem.ok) return clonagem;
        const candidato = clonagem.valor, locacao = candidato.locacoes[indice];
        const calculo = dependencias.calcularAtualizacaoStatusLocacaoDominio(locacao, 'cancelado');
        if (!calculo.houveMudanca) return { ok: false, codigo: 'LOCACAO_JA_CANCELADA_SEM_OPERACAO_COMPROVADA' };
        const referencia = criarReferenciaOperacionalV2Interna('locacao', locacao.id);
        const comando = { tipo: 'cancelamento_locacao', locacaoReferencia: referencia };
        const assinaturaPlano = `cancelamento-locacao-v2:fnv1a64:${fingerprintFnv1a64(JSON.stringify(
            ordenarChavesCanonicas({ locacaoAnterior: locacao, comando, metadados })
        ))}`;
        const timestamp = metadados.timestamp, usuario = metadados.atorReferencia;
        const clientes = candidato.locadores.filter(c => typeof c.id === typeof locacao.locadorId && Object.is(c.id, locacao.locadorId));
        if (clientes.length > 1) return { ok: false, codigo: 'CLIENTE_LOCACAO_DUPLICADO' };
        const nome = typeof clientes[0]?.nome === 'string' ? clientes[0].nome : 'Cliente';
        locacao.status = calculo.status;
        locacao.statusFluxo = calculo.statusFluxo;
        locacao.historicoAlteracoes = [...(locacao.historicoAlteracoes || []), {
            id: Date.parse(timestamp), data: timestamp, acao: 'cancelamento', descricao: 'Locacao cancelada.',
            origem: 'locacoes', status: locacao.status, statusFluxo: locacao.statusFluxo, usuario,
            locacaoId: locacao.id, locacaoReferencia: referencia, operacaoId: metadados.operacaoId,
            assinaturaPlano, comandoOperacionalV2: comando
        }];
        candidato.logsAuditoria = [{
            id: Date.parse(timestamp), timestamp, data: timestamp, tipo: 'locacao', acao: 'cancelar',
            descricao: `Loca\u00e7\u00e3o cancelada: ${nome}.`, usuario,
            dados: { locacaoId: locacao.id, locacaoReferencia: referencia },
            locacaoId: locacao.id, operacaoId: metadados.operacaoId, assinaturaPlano,
            origem: 'cancelamento_locacao_v2'
        }, ...candidato.logsAuditoria];
        candidato.pecas = dependencias.recalcularDisponibilidadeEstado(candidato, timestamp);
        return { ok: true, codigo: 'CANDIDATO_CANCELAMENTO_LOCACAO', candidato };
    }
return Object.freeze({construirCandidato,construirCandidatoReservaInicialInterno,construirCandidatoCancelamentoLocacaoInterno,reconciliarDeltas,preservarCamposItensAtuais,validarItemIdsHistoricos,anexarProvasRecuperacao});
}
