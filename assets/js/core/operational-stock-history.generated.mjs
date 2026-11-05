// GERADO por AST, somente declaracoes compartilhadas. Nao carregado pelo index.
export const manifesto = Object.freeze({
  "COLECOES_SEM_ORDEM_SEMANTICA": "d0f1f4ba5a43119ff4d80dabd54e10031d231936b88eb5541a183031722cea88",
  "CHAVES_METADADOS_PERSISTENCIA": "9f12f1a6c74a704f6e0106b10713ffa3c0fb2e59b61a388cdbcd0e170794c428",
  "CAMPO_PROVAS_RECUPERACAO": "fd8d53e9887c32ad82e1e19f997fa5fc09e172765f38e32fe7415841dfbf059b",
  "referenciaEstrita": "b867d647be2eb39d787d60acc5bc05058912599cd0cbe17580300c8de93c9913",
  "resultadoClonagem": "11a82cd89baaafa6ecc9fed54ee595e42ec576dada714f451805f4a0ab9eee71",
  "clonarJsonInterno": "5cfbfb0a03bf5e8822d76c5f476e57cea8fa6cf14f2e3ed454db4bb7d42e2010",
  "normalizarDataSnapshotReserva": "47672ec2f562d0615dcc9ee8eca33dd7456d77899e3d8699fee73fc6b013e30c",
  "inteiroDominioNaoNegativo": "90028413ad451e710419770f4fd298730b517a0b8833fed4e4ff7f95e9ca224e",
  "quantidadePropriaSnapshot": "2bb3518f5c8932b523b98298fd6794676f8425496cc98e0348f8f3c6116c5f47",
  "normalizarItemIdSnapshot": "de667165cdebf1c9ecbbfd96ccef42b638fba59eb2f633791adf8ebe99d193d2",
  "atribuirItemIdsSnapshot": "96d83885edadd6452d44143ccd5072dcbc35269a5ff951a8cff1f306d96bb5d3",
  "criarPeriodoSnapshotReservaInterno": "e4d4930395a1164dcd8862388f04a4b774c611108581e738838aae25255356eb",
  "criarSnapshotReservaInterno": "1aa28defd3705c82e0d10b9416b86802978017eee2541364e7d76c34cb9e2a41",
  "criarReferenciaOperacionalV2Interna": "c0c3f42b16ae25d68716037824351f38a598ef2e8d8117af00c416cdf750ac82",
  "criarSnapshotReservaTipadoV2Interno": "60d6038e0f0d34f5a8437be54b751827694be76108273d18ec10fda3f76c2fe9",
  "chaveMovimentacao": "d40259a02b57b017c7bdcaf3094fc39c5bc2464b45520feae29ba0e2aa0101b8",
  "canonicalizarFingerprintRecuperacao": "a5fac8d35cf3bd9c4442d33c901de56cc156a9ad9bc28c9369c9c937ebd38c89",
  "removerProvasTecnicasOperacao": "ef8354478d2eb54d0fd5865256300141b37fa434bfeb0ec74b7348f776ee9de2",
  "fingerprintFnv1a64": "f3678e74502f53b44dd5652e8a37e47c8b7879715e1813e09189c52e8d6725aa",
  "gerarFingerprintRecuperacao": "bb69e011f6912fa19795cd43c636e77612579825efa0ecef1fdb0141c7692f71"
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
return Object.freeze({gerarFingerprintRecuperacao,criarSnapshotReservaInterno,chaveMovimentacao,criarSnapshotReservaTipadoV2Interno});
}
