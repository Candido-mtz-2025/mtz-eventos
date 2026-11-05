// GERADO por AST, somente declaracoes compartilhadas. Nao carregado pelo index.
export const manifesto = Object.freeze({
  "COLECOES_SEM_ORDEM_SEMANTICA": "d0f1f4ba5a43119ff4d80dabd54e10031d231936b88eb5541a183031722cea88",
  "CHAVES_METADADOS_PERSISTENCIA": "9f12f1a6c74a704f6e0106b10713ffa3c0fb2e59b61a388cdbcd0e170794c428",
  "CAMPO_PROVAS_RECUPERACAO": "fd8d53e9887c32ad82e1e19f997fa5fc09e172765f38e32fe7415841dfbf059b",
  "referenciaEstrita": "b867d647be2eb39d787d60acc5bc05058912599cd0cbe17580300c8de93c9913",
  "inteiroSeguroNaoNegativo": "c42ced863d65d1d72e1b1abaf3aabc953c0cbb332cf4222a6bc83187eb97ecd7",
  "inteiroLegadoNaoNegativo": "2ee7d517c4e3cd51ee5f143aab9df175bf67f5cc69b1c3b8c62bcc27895eac92",
  "textoObrigatorio": "f5d904858b386473e779c6f6c15ccdbaa3f6298b405222d2bb63fde079fbe35c",
  "resultadoClonagem": "11a82cd89baaafa6ecc9fed54ee595e42ec576dada714f451805f4a0ab9eee71",
  "clonarJsonInterno": "5cfbfb0a03bf5e8822d76c5f476e57cea8fa6cf14f2e3ed454db4bb7d42e2010",
  "clonarDescartavel": "65d48d22621a8cf5becd89340a5c11ebfe7caaa02fc3549efe144f52d0a48c47",
  "prototipoNativoPersistivel": "8980a28d16f78af4f763bfa0de0a378906544c114396efe9078a58cacea709a3",
  "validarValorExternoPersistivel": "10d2b725afaad21f55b84b8c8ff330e5a461b3e99e787d2788663111e9743b9e",
  "validarSnapshotReservaExterno": "435f15a899dff3a93a05801e370a9d1aa90b09e716dfecf8ca079d3ca6dc3be9",
  "normalizarDataSnapshotReserva": "47672ec2f562d0615dcc9ee8eca33dd7456d77899e3d8699fee73fc6b013e30c",
  "inteiroDominioNaoNegativo": "90028413ad451e710419770f4fd298730b517a0b8833fed4e4ff7f95e9ca224e",
  "quantidadePropriaSnapshot": "2bb3518f5c8932b523b98298fd6794676f8425496cc98e0348f8f3c6116c5f47",
  "normalizarItemIdSnapshot": "de667165cdebf1c9ecbbfd96ccef42b638fba59eb2f633791adf8ebe99d193d2",
  "atribuirItemIdsSnapshot": "96d83885edadd6452d44143ccd5072dcbc35269a5ff951a8cff1f306d96bb5d3",
  "criarPeriodoSnapshotReservaInterno": "e4d4930395a1164dcd8862388f04a4b774c611108581e738838aae25255356eb",
  "criarSnapshotReservaInterno": "1aa28defd3705c82e0d10b9416b86802978017eee2541364e7d76c34cb9e2a41",
  "criarReferenciaOperacionalV2Interna": "c0c3f42b16ae25d68716037824351f38a598ef2e8d8117af00c416cdf750ac82",
  "criarSnapshotReservaTipadoV2Interno": "60d6038e0f0d34f5a8437be54b751827694be76108273d18ec10fda3f76c2fe9",
  "ordenarChavesCanonicas": "11470c28ca0e2b39e398ef7d1d37f6f08aba0718d74839a04376d537b5b13c49",
  "canonicalizarFingerprintRecuperacao": "a5fac8d35cf3bd9c4442d33c901de56cc156a9ad9bc28c9369c9c937ebd38c89",
  "removerProvasTecnicasOperacao": "ef8354478d2eb54d0fd5865256300141b37fa434bfeb0ec74b7348f776ee9de2",
  "fingerprintFnv1a64": "f3678e74502f53b44dd5652e8a37e47c8b7879715e1813e09189c52e8d6725aa",
  "gerarFingerprintRecuperacao": "bb69e011f6912fa19795cd43c636e77612579825efa0ecef1fdb0141c7692f71",
  "anexarProvasRecuperacao": "2637153ce4a7ce42ea169a27634a82325864e9be60f65b5e9346132aa1270986",
  "gerarAssinaturaDevolucaoLocacao": "5d72d8e4541c7760bfe2b28d1ad5a7d2f3f92e8c6838797dda4ca15157c80430",
  "localizarPecaUnica": "187b61ce9e80f2fe4918ed0cb158f131dc8ab65adc15ff42aead07d455870549",
  "chaveMovimentacaoDevolucao": "34890b35231d3c2c61c64b2cc42d7c0b658ff218b579f6e4eeac17f90effab6b",
  "construirCandidatoDevolucao": "4d31fa7cd5c62556daedd523e527ff4391e42bcacc9f9df71ac56cac3ee48a94"
});
export function criarNucleoConfiavel(contexto = {}) {

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

function prototipoNativoPersistivel(prototipo, nomeEsperado) {
        if (!prototipo || typeof prototipo !== 'object') return false;
        const descritorConstrutor = Object.getOwnPropertyDescriptor(prototipo, 'constructor');
        if (!descritorConstrutor || !Object.prototype.hasOwnProperty.call(descritorConstrutor, 'value')
            || typeof descritorConstrutor.value !== 'function') return false;
        let fonte;
        try { fonte = Function.prototype.toString.call(descritorConstrutor.value); }
        catch (_erro) { return false; }
        if (fonte !== `function ${nomeEsperado}() { [native code] }`) return false;
        if (nomeEsperado === 'Object') return Object.getPrototypeOf(prototipo) === null;
        const prototipoObjeto = Object.getPrototypeOf(prototipo);
        return prototipoNativoPersistivel(prototipoObjeto, 'Object');
    }

function validarValorExternoPersistivel(valor, vistos = new WeakSet()) {
        if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return true;
        if (typeof valor === 'number') return Number.isFinite(valor);
        if (typeof valor !== 'object' || vistos.has(valor)) return false;
        const prototipo = Object.getPrototypeOf(valor);
        const array = Array.isArray(valor);
        if (prototipo !== (array ? Array.prototype : Object.prototype)
            && !prototipoNativoPersistivel(prototipo, array ? 'Array' : 'Object')) return false;
        vistos.add(valor);
        const chaves = Reflect.ownKeys(valor);
        if (chaves.some((chave) => typeof chave === 'symbol')) return false;
        const descritores = Object.getOwnPropertyDescriptors(valor);
        if (array) {
            const descritorLength = descritores.length;
            if (!descritorLength || descritorLength.value !== valor.length
                || descritorLength.enumerable !== false
                || !Object.prototype.hasOwnProperty.call(descritorLength, 'value')) return false;
            for (let indice = 0; indice < valor.length; indice += 1) {
                if (!Object.prototype.hasOwnProperty.call(descritores, String(indice))) return false;
            }
        }
        return chaves.every((chave) => {
            const descritor = descritores[chave];
            if (array && chave === 'length') return true;
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
        return {
            versao: 1,
            origem: String(opcoes.origem),
            capturadoEm: String(opcoes.capturadoEm),
            statusReserva: String(opcoes.statusReserva ?? ''),
            periodo: criarPeriodoSnapshotReservaInterno(locacao),
            itens: Array.from(agrupados.values())
        };
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
        registroOperacao, checkpoint, dependencias, versaoSnapshot = 1) {
        if (versaoSnapshot !== 1 && versaoSnapshot !== 2) return { ok: false, codigo: 'VERSAO_SNAPSHOT_RESERVA_INVALIDA' };
        if (versaoSnapshot === 1 && localizacao.locacao.estoqueReserva?.snapshot?.versao === 2) {
            return { ok: false, codigo: 'SNAPSHOT_V2_EXIGE_CONSTRUTOR_COMPATIVEL' };
        }
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
        ];
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
        let snapshotReservaInterno;
        if (versaoSnapshot === 2) {
            try {
                snapshotReservaInterno = criarSnapshotReservaTipadoV2Interno(candidato, locacao);
                const snapshotOriginal = localizacao.locacao.estoqueReserva?.snapshot;
                if (snapshotOriginal?.versao === 1) {
                    locacao.estoqueReserva.snapshotLegadoPreservado = clonarDescartavel(snapshotOriginal);
                }
            } catch (_erro) {
                return { ok: false, codigo: 'SNAPSHOT_RESERVA_V2_INVALIDO' };
            }
        } else {
            snapshotReservaInterno = criarSnapshotReservaInterno(locacao, opcoesSnapshot);
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
        if (versaoSnapshot === 2) {
            try {
                const alvos = Array.from(new Set(itensDevolucao.map(item => item.pecaId)));
                const recalculadas = dependencias.recalcularDisponibilidadeEstado(candidato, entrada.atualizadoEm, alvos);
                const clonadas = clonarJsonInterno(recalculadas);
                if (!clonadas.ok || !Array.isArray(clonadas.valor) || clonadas.valor.length !== candidato.pecas.length
                    || clonadas.valor.some((peca, indice) => referenciaEstrita(peca.id) !== referenciaEstrita(candidato.pecas[indice].id))) {
                    return { ok: false, codigo: 'RECALCULO_ESTOQUE_V2_INVALIDO' };
                }
                candidato.pecas = clonadas.valor;
            } catch (_erro) {
                return { ok: false, codigo: 'RECALCULO_ESTOQUE_V2_INVALIDO' };
            }
        }
        return { ok: true, codigo: 'SUCESSO', candidato, locacaoCandidata: locacao, historico, devolucao, movimentacoes };
    }
return Object.freeze({construirCandidatoDevolucao,gerarAssinaturaDevolucaoLocacao,anexarProvasRecuperacao});
}
