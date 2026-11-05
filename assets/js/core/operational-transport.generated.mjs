// GERADO por AST, somente declaracoes compartilhadas. Nao carregado pelo index.
export const manifesto = Object.freeze({
  "COLECOES_SEM_ORDEM_SEMANTICA": "d0f1f4ba5a43119ff4d80dabd54e10031d231936b88eb5541a183031722cea88",
  "clonarRetornoPublico": "f2f8c2da4b178507aeb95a092e173d11626f406cc6538790d9bd613be287a494",
  "resultadoBase": "827680bdbf0010216dddedec5f81459584b836e9b3651e6d7bcd8bb668f66575",
  "referenciaEstrita": "b867d647be2eb39d787d60acc5bc05058912599cd0cbe17580300c8de93c9913",
  "clonarJsonInterno": "5cfbfb0a03bf5e8822d76c5f476e57cea8fa6cf14f2e3ed454db4bb7d42e2010",
  "ordenarChavesCanonicas": "11470c28ca0e2b39e398ef7d1d37f6f08aba0718d74839a04376d537b5b13c49",
  "fingerprintFnv1a64": "f3678e74502f53b44dd5652e8a37e47c8b7879715e1813e09189c52e8d6725aa",
  "criarReferenciaEntidadeInterna": "eb4157acd17d1142b6284a6596df4853112d65a49850dad1316f90be7c1f6660",
  "resolverReferenciaEntidadeInterna": "6bfb091bd063de5eb0e91d70951f7dc0e5ef8fdbbc98bf1ce3f2647752de79ee",
  "criarReferenciaTransporteInterna": "0f75cad311c194617324b5a116b77a76dc3d14c3939ea66591cc814032496ce4",
  "resolverReferenciaTransporteInterna": "7ad1df95a475f6b48a9f62c6273cdcdca5dc98c82df866f7d7d6b8a81d27f902",
  "resolverLocacaoTransporteInterna": "9e66f929d9e2f6f5a03587d543a58ab582bce2d9fd560b22125bafdd827afd82",
  "assinaturaOperacaoTransporte": "490a76593d9d3ec729638a7ede37570bc3735452623cf6402d0b1f64dd957689",
  "construirCandidatoOperacaoTransporteInterno": "e959c6c3e25d99c713011ae238d9e07c2f5baab362a55b8b8db7965743fadd77"
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

function fingerprintFnv1a64(texto) {
        let hash = 0xcbf29ce484222325n;
        const primo = 0x100000001b3n;
        for (let indice = 0; indice < texto.length; indice += 1) {
            hash ^= BigInt(texto.charCodeAt(indice));
            hash = BigInt.asUintN(64, hash * primo);
        }
        return hash.toString(16).padStart(16, '0');
    }

function criarReferenciaEntidadeInterna(prefixo, id) {
        if (typeof prefixo !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(prefixo)) return '';
        const identidade = referenciaEstrita(id);
        if (!identidade) return '';
        const tipo = typeof id;
        const valor = Object.is(id, -0) ? 0 : id;
        return `${prefixo}:${encodeURIComponent(JSON.stringify([tipo, valor]))}`;
    }

function resolverReferenciaEntidadeInterna(colecao, prefixo, referencia) {
        const vazio = (estado = 'invalido', quantidade = 0) => ({
            encontrado: false, estado, registro: null, indice: -1, quantidade, id: null
        });
        if (typeof prefixo !== 'string' || typeof referencia !== 'string'
            || !referencia.startsWith(`${prefixo}:`)) return vazio();
        let dados;
        try { dados = JSON.parse(decodeURIComponent(referencia.slice(prefixo.length + 1))); }
        catch (_erro) { return vazio(); }
        if (!Array.isArray(dados) || dados.length !== 2) return vazio();
        const [tipo, id] = dados;
        if ((tipo !== 'string' && tipo !== 'number') || typeof id !== tipo
            || !referenciaEstrita(id) || criarReferenciaEntidadeInterna(prefixo, id) !== referencia) return vazio();
        const indices = [];
        (Array.isArray(colecao) ? colecao : []).forEach((registro, indice) => {
            if (registro && typeof registro === 'object' && !Array.isArray(registro)
                && typeof registro.id === tipo && Object.is(registro.id, id)) indices.push(indice);
        });
        return indices.length === 1
            ? { encontrado: true, estado: 'encontrado', registro: colecao[indices[0]], indice: indices[0],
                quantidade: 1, id }
            : vazio(indices.length > 1 ? 'duplicado' : 'ausente', indices.length);
    }

function criarReferenciaTransporteInterna(id) {
        return criarReferenciaEntidadeInterna('transporte', id);
    }

function resolverReferenciaTransporteInterna(colecao, referencia) {
        if (typeof referencia !== 'string' || !referencia.startsWith('transporte:')) {
            return { encontrado: false, estado: 'invalido', registro: null, indice: -1, quantidade: 0 };
        }
        let dados;
        try { dados = JSON.parse(decodeURIComponent(referencia.slice('transporte:'.length))); }
        catch (_erro) { return { encontrado: false, estado: 'invalido', registro: null, indice: -1, quantidade: 0 }; }
        if (!Array.isArray(dados) || dados.length !== 2) {
            return { encontrado: false, estado: 'invalido', registro: null, indice: -1, quantidade: 0 };
        }
        const [tipo, id] = dados;
        if ((tipo !== 'string' && tipo !== 'number') || typeof id !== tipo
            || !referenciaEstrita(id) || criarReferenciaTransporteInterna(id) !== referencia) {
            return { encontrado: false, estado: 'invalido', registro: null, indice: -1, quantidade: 0 };
        }
        const indices = [];
        (Array.isArray(colecao) ? colecao : []).forEach((registro, indice) => {
            if (registro && typeof registro === 'object' && !Array.isArray(registro)
                && typeof registro.id === tipo && Object.is(registro.id, id)) indices.push(indice);
        });
        return indices.length === 1
            ? { encontrado: true, estado: 'encontrado', registro: colecao[indices[0]], indice: indices[0], quantidade: 1 }
            : { encontrado: false, estado: indices.length > 1 ? 'duplicado' : 'ausente', registro: null,
                indice: -1, quantidade: indices.length };
    }

function resolverLocacaoTransporteInterna(colecao, id) {
        if (id === '') return { encontrado: false, estado: 'sem_vinculo', registro: null, quantidade: 0 };
        const identidade = referenciaEstrita(id);
        if (!identidade) return { encontrado: false, estado: 'invalido', registro: null, quantidade: 0 };
        const correspondencias = (Array.isArray(colecao) ? colecao : []).filter((registro) => (
            registro && typeof registro === 'object' && !Array.isArray(registro)
            && referenciaEstrita(registro.id) === identidade
        ));
        return correspondencias.length === 1
            ? { encontrado: true, estado: 'encontrado', registro: correspondencias[0], quantidade: 1 }
            : { encontrado: false, estado: correspondencias.length > 1 ? 'duplicado' : 'ausente',
                registro: null, quantidade: correspondencias.length };
    }

function assinaturaOperacaoTransporte(entrada, referencia) {
        const base = ordenarChavesCanonicas({
            tipo: 'operacao_transporte_v1',
            acao: entrada.acao,
            operacaoId: entrada.operacaoId,
            transporteReferencia: referencia,
            registro: entrada.acao === 'criar' || entrada.acao === 'editar' ? entrada.registro : null,
            status: entrada.status || '',
            dataConclusao: entrada.dataConclusao || '',
            atualizadoEm: entrada.atualizadoEm,
            atualizadoPor: entrada.atualizadoPor,
            descricao: entrada.descricao || '',
            persistencia: {
                versao: entrada.persistencia?.versao,
                data: entrada.persistencia?.data,
                ultimaEdicao: entrada.persistencia?.ultimaEdicao
            }
        });
        return `transporte-v1:fnv1a64:${fingerprintFnv1a64(JSON.stringify(base))}`;
    }

function construirCandidatoOperacaoTransporteInterno(estado, entrada, referencia, assinaturaPlano) {
        const memoria = { valor: estado };
        const candidatoClone = clonarJsonInterno(memoria.valor);
            if (!candidatoClone.ok) return resultadoBase(candidatoClone.codigo);
            const candidato = candidatoClone.valor;
            if (!Array.isArray(candidato.transportes) || !Array.isArray(candidato.logsAuditoria)) {
                return resultadoBase('ESTADO_TRANSPORTE_INVALIDO');
            }
            const resolucao = resolverReferenciaTransporteInterna(candidato.transportes, referencia);
            if (entrada.acao === 'criar') {
                if (resolucao.estado === 'duplicado' || resolucao.encontrado) return resultadoBase('TRANSPORTE_ID_DUPLICADO');
                if (!entrada.registro || typeof entrada.registro !== 'object' || Array.isArray(entrada.registro)
                    || criarReferenciaTransporteInterna(entrada.registro.id) !== referencia) {
                    return resultadoBase('REGISTRO_TRANSPORTE_INVALIDO');
                }
                const locacao = resolverLocacaoTransporteInterna(candidato.locacoes, entrada.registro.locacaoId);
                if (locacao.estado !== 'sem_vinculo' && !locacao.encontrado) {
                    return resultadoBase(locacao.estado === 'duplicado'
                        ? 'LOCACAO_ID_DUPLICADO' : 'LOCACAO_TRANSPORTE_INVALIDA');
                }
                candidato.transportes.unshift(clonarJsonInterno(entrada.registro).valor);
            } else {
                if (!resolucao.encontrado) return resultadoBase(resolucao.estado === 'duplicado'
                    ? 'TRANSPORTE_ID_DUPLICADO' : 'TRANSPORTE_NAO_ENCONTRADO');
                if (entrada.acao === 'editar') {
                    if (!entrada.registro || typeof entrada.registro !== 'object' || Array.isArray(entrada.registro)
                        || criarReferenciaTransporteInterna(entrada.registro.id) !== referencia) {
                        return resultadoBase('REGISTRO_TRANSPORTE_INVALIDO');
                    }
                    const locacao = resolverLocacaoTransporteInterna(candidato.locacoes, entrada.registro.locacaoId);
                    if (locacao.estado !== 'sem_vinculo' && !locacao.encontrado) {
                        return resultadoBase(locacao.estado === 'duplicado'
                            ? 'LOCACAO_ID_DUPLICADO' : 'LOCACAO_TRANSPORTE_INVALIDA');
                    }
                    candidato.transportes[resolucao.indice] = {
                        ...resolucao.registro,
                        ...clonarJsonInterno(entrada.registro).valor,
                        id: resolucao.registro.id
                    };
                } else if (entrada.acao === 'excluir') {
                    candidato.transportes.splice(resolucao.indice, 1);
                } else {
                    if (typeof entrada.status !== 'string'
                        || !['pendente', 'em_rota', 'entregue', 'retirado', 'concluido', 'cancelado'].includes(entrada.status)) {
                        return resultadoBase('STATUS_TRANSPORTE_INVALIDO');
                    }
                    if (resolucao.registro.status === entrada.status) {
                        return resultadoBase('OPERACAO_JA_CONCLUIDA', { ok: true, idempotente: true });
                    }
                    candidato.transportes[resolucao.indice] = {
                        ...resolucao.registro,
                        status: entrada.status,
                        atualizadoEm: entrada.atualizadoEm,
                        ...(entrada.status === 'concluido' && !resolucao.registro.dataChegada
                            ? { dataChegada: entrada.dataConclusao || '' } : {})
                    };
                }
            }
            candidato.logsAuditoria.unshift({
                id: `audit-transporte-${entrada.operacaoId}`,
                operacaoId: entrada.operacaoId,
                assinaturaPlano,
                tipo: 'sistema',
                acao: `transporte_${entrada.acao}`,
                acaoTransporte: entrada.acao,
                origem: 'transporte_transacional',
                transporteReferencia: referencia,
                timestamp: entrada.atualizadoEm,
                data: entrada.atualizadoEm,
                usuario: entrada.atualizadoPor,
                descricao: entrada.descricao || `Operação ${entrada.acao} de transporte confirmada.`
            });


        return { ok: true, candidato };
    }
return Object.freeze({construirCandidatoOperacaoTransporteInterno,assinaturaOperacaoTransporte,criarReferenciaTransporteInterna,resolverReferenciaEntidadeInterna,ordenarChavesCanonicas});
}
