import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
import { criarNucleoCadastroCliente } from './customer-kernel.generated.mjs';
import { normalizarNomeTipo } from './type-kernel.generated.mjs';
import { comprovarConversoesJournalTexto } from './proposal-conversion-replay.mjs';

const clientes = criarNucleoCadastroCliente();
const canon = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
const ler = t => decodificarTextoEstrito(t).valor;
const exigir = (v, m) => { if (!v) throw Error(m); };
const idValido = id => typeof id === 'string' && id.trim().length > 0 && id.length <= 160
    || typeof id === 'number' && Number.isSafeInteger(id) && !Object.is(id, -0);
const ref = (tipo, id) => `${tipo}:${encodeURIComponent(JSON.stringify([typeof id, id]))}`;
const origem = tipo => tipo === 'cliente' ? 'cadastro_cliente_transacional' : 'cadastro_tipo_transacional';
const colecao = tipo => tipo === 'cliente' ? 'locadores' : 'tipos';
const campoRef = tipo => tipo === 'cliente' ? 'clienteReferencia' : 'tipoReferencia';
const CAMPOS_CLIENTE = new Set(['nome','documento','telefone','email','cep','ruaEndereco','numero','complemento',
    'bairro','cidade','uf','responsavelPedido','fiscalRazaoSocial','fiscalCpfCnpj','fiscalIE','fiscalIM',
    'fiscalEmail','fiscalEndereco','usarMesmoEnderecoCliente']);
export const COMANDOS_CADASTRAIS = Object.freeze({
    'cliente.editar.v1': Object.freeze({ tipo: 'cliente', acao: 'editar', permissao: 'editar_cliente' }),
    'cliente.excluir.v1': Object.freeze({ tipo: 'cliente', acao: 'excluir', permissao: 'excluir_registro' }),
    'tipo.cadastrar.v1': Object.freeze({ tipo: 'tipo', acao: 'criar', permissao: 'cadastrar_tipo' }),
    'tipo.editar.v1': Object.freeze({ tipo: 'tipo', acao: 'editar', permissao: 'editar_tipo' }),
    'tipo.excluir.v1': Object.freeze({ tipo: 'tipo', acao: 'excluir', permissao: 'excluir_registro' }),
    'tipo.garantir_geral.v1': Object.freeze({ tipo: 'tipo', acao: 'criar', permissao: 'cadastrar_tipo' })
});
const chaves = (v, ks) => v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).sort().join('|') === ks.slice().sort().join('|');
export function validarCamposCliente(v) {
    return v && !Array.isArray(v) && typeof v === 'object' && typeof v.nome === 'string' && v.nome.trim()
        && Object.keys(v).every(k => CAMPOS_CLIENTE.has(k) && (k === 'usarMesmoEnderecoCliente'
            ? typeof v[k] === 'boolean' : typeof v[k] === 'string' && v[k].length <= 2000))
        && clientes.emailClienteValido(v.email);
}
export function validarComandoCadastralTexto(comando, texto) {
    try {
        if (typeof comando !== 'string' || !Object.hasOwn(COMANDOS_CADASTRAIS, comando)) return false;
        const spec = COMANDOS_CADASTRAIS[comando], d = ler(texto);
        if (!spec) return false;
        if (comando === 'tipo.garantir_geral.v1') return chaves(d, ['id']) && idValido(d.id);
        const identidade = spec.acao === 'criar' ? 'id' : campoRef(spec.tipo);
        return chaves(d, [identidade, ...(spec.acao === 'excluir' ? [] : ['campos'])])
            && (identidade === 'id' ? idValido(d.id) : typeof d[identidade] === 'string')
            && (spec.acao === 'excluir' || (spec.tipo === 'cliente' ? validarCamposCliente(d.campos)
                : chaves(d.campos, ['nome','desc']) && typeof d.campos.nome === 'string'
                    && d.campos.nome.trim().length > 0 && d.campos.nome.length <= 2000
                    && typeof d.campos.desc === 'string' && d.campos.desc.length <= 2000));
    } catch (_) { return false; }
}

// Apenas chaves de vinculo conhecidas; nunca comparar nomes ou valores avulsos.
function referencias(v, tipo, visitar, pai = '') {
    if (Array.isArray(v)) { v.forEach(x => referencias(x, tipo, visitar, pai)); return; }
    if (!v || typeof v !== 'object') return;
    const ids = tipo === 'cliente' ? ['clienteId', 'locadorId'] : ['tipoId'];
    const refs = tipo === 'cliente' ? ['clienteReferencia', 'locadorReferencia'] : ['tipoReferencia'];
    for (const [k, x] of Object.entries(v)) {
        if (x !== '' && x !== null && x !== undefined) {
            if (ids.includes(k)) { exigir(idValido(x), 'VINCULO_CADASTRAL_INVALIDO'); visitar(ref(tipo, x)); }
            if (refs.includes(k)) {
                exigir(typeof x === 'string' && x.startsWith(`${tipo}:`), 'VINCULO_CADASTRAL_INVALIDO');
                const raw = JSON.parse(decodeURIComponent(x.slice(tipo.length + 1)));
                exigir(Array.isArray(raw) && raw.length === 2 && typeof raw[1] === raw[0]
                    && idValido(raw[1]) && ref(tipo, raw[1]) === x, 'VINCULO_CADASTRAL_INVALIDO'); visitar(x);
            }
            if (k === 'id' && (tipo === 'cliente' ? ['cliente','clienteSnapshot','locador','locadorSnapshot'].includes(pai)
                : ['tipo','tipoSnapshot'].includes(pai))) { exigir(idValido(x), 'VINCULO_CADASTRAL_INVALIDO'); visitar(ref(tipo,x)); }
            if (k === 'entidadeId' && (v.entidade === tipo || v.tipo === tipo)) {
                exigir(idValido(x), 'VINCULO_CADASTRAL_INVALIDO'); visitar(ref(tipo, x));
            }
        }
        referencias(x, tipo, visitar, k);
    }
}
function verificarExclusao(s, tipo, alvo) {
    const r = ref(tipo, alvo.id);
    for (const [k, v] of Object.entries(s)) {
        const dados = k === 'logsAuditoria' ? v.filter(a => a.origem !== origem(tipo))
            : k === colecao(tipo) ? v.filter(a => a !== alvo) : v;
        referencias(dados, tipo, encontrada => exigir(encontrada !== r, 'CADASTRO_REFERENCIADO'));
    }
}
export function validarCatalogoTiposTexto(texto) {
    try {
        const s = ler(texto), ids = new Set(), nomes = new Set();
        exigir(Array.isArray(s.tipos), 'CATALOGO_TIPOS_INVALIDO');
        for (const t of s.tipos) {
            exigir(t && !Array.isArray(t) && idValido(t.id) && typeof t.nome === 'string'
                && t.nome.trim() && (!Object.hasOwn(t, 'desc') || typeof t.desc === 'string'), 'TIPO_INVALIDO');
            const r = ref('tipo', t.id), nome = normalizarNomeTipo(t.nome);
            exigir(!ids.has(r) && !nomes.has(nome), 'TIPO_DUPLICADO'); ids.add(r); nomes.add(nome);
        }
        for (const [k,v] of Object.entries(s)) {
            const dados = k === 'logsAuditoria' ? v.filter(a => a.origem !== origem('tipo')) : v;
            referencias(dados, 'tipo', r => exigir(ids.has(r), 'TIPO_VINCULO_ORFAO'));
        }
        return true;
    } catch (_) { return false; }
}

/** Puro: o estado e os campos editaveis sao reconstruidos dentro do journal. */
export function prepararComandoCadastralTexto(comando, snapshotTexto, dadosTexto, metadadosTexto) {
    try {
        exigir(validarComandoCadastralTexto(comando, dadosTexto), 'COMANDO_CADASTRAL_INVALIDO');
        const spec = COMANDOS_CADASTRAIS[comando], s = JSON.parse(decodificarTextoEstrito(snapshotTexto).texto);
        const d = ler(dadosTexto), m = ler(metadadosTexto), key = colecao(spec.tipo), fr = campoRef(spec.tipo);
        exigir(chaves(m, ['operacaoId','atorReferencia','timestamp']) && typeof m.operacaoId === 'string'
            && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(m.operacaoId) && typeof m.atorReferencia === 'string'
            && m.atorReferencia.trim() && typeof m.timestamp === 'string'
            && new Date(m.timestamp).toISOString() === m.timestamp, 'METADADOS_INVALIDOS');
        exigir(!s.logsAuditoria.some(a => a.operacaoId === m.operacaoId), 'OPERACAO_REQUER_RECUPERACAO');
        const matches = spec.acao === 'criar' ? [] : s[key].filter(c => ref(spec.tipo,c.id) === d[fr]);
        exigir(spec.acao === 'criar' || matches.length === 1, 'REFERENCIA_AUSENTE_OU_AMBIGUA');
        const anterior = matches[0] || null, id = anterior ? anterior.id : d.id;
        if (spec.acao === 'criar') exigir(!s[key].some(c => ref(spec.tipo,c.id) === ref(spec.tipo,id))
            && !s.logsAuditoria.some(a => a.origem === origem(spec.tipo) && a[fr] === ref(spec.tipo,id)), 'IDENTIDADE_JA_UTILIZADA');
        let posterior = null;
        if (spec.acao === 'excluir') {
            verificarExclusao(s, spec.tipo, anterior);
            s[key] = s[key].filter(c => c !== anterior);
        } else if (spec.tipo === 'cliente') {
            const dados = clientes.montarDadosClienteCampos(d.campos);
            exigir(!clientes.encontrarLocadorDuplicado(dados, anterior.id, s.locadores), 'CLIENTE_DUPLICADO');
            posterior = { ...anterior, ...dados, dadosFiscais: { ...anterior.dadosFiscais, ...dados.dadosFiscais } };
        } else {
            if (comando === 'tipo.garantir_geral.v1') exigir(!s.tipos.some(t => normalizarNomeTipo(t.nome) === 'geral'), 'TIPO_GERAL_JA_EXISTENTE');
            const dados = comando === 'tipo.garantir_geral.v1' ? { nome: 'Geral', desc: 'Itens sem categoria espec\u00edfica' }
                : { nome: d.campos.nome.trim(), desc: d.campos.desc.trim() };
            exigir(!s.tipos.some(t => t !== anterior && normalizarNomeTipo(t.nome) === normalizarNomeTipo(dados.nome)), 'TIPO_NOME_DUPLICADO');
            posterior = { ...(anterior || { id }), ...dados };
        }
        if (posterior) { if (anterior) s[key][s[key].indexOf(anterior)] = posterior; else s[key].push(posterior); }
        s.logsAuditoria.push({ id: `audit-${spec.tipo}-${m.operacaoId}`, tipo: spec.tipo, acao: spec.acao,
            origem: origem(spec.tipo), operacaoId: m.operacaoId, usuario: m.atorReferencia,
            data: m.timestamp, timestamp: m.timestamp, [fr]: ref(spec.tipo,id),
            assinaturaPlano: canon({ comando, dados: d, metadados: m }),
            registroAnteriorSnapshot: anterior, registroSnapshot: posterior });
        exigir(Number.isSafeInteger(s.ultimaEdicao) && s.ultimaEdicao >= 0
            && s.ultimaEdicao < Number.MAX_SAFE_INTEGER, 'REVISAO_LEGADA_INVALIDA');
        s.ultimaEdicao++; s.data = m.timestamp;
        exigir(validarCatalogoTiposTexto(canon(s)), 'CATALOGO_TIPOS_INCONSISTENTE');
        return Object.freeze({ ok: true, snapshotTexto: canon(s), publicado: false });
    } catch (e) { return Object.freeze({ ok: false, codigo: 'OPERACAO_REQUER_RECUPERACAO', motivo: e.message,
        requerRecuperacao: true, publicado: false }); }
}

/** Projecao da cadeia cadastral, sem equiparar criacao antiga ao cadastro atual. */
export function validarHistoricoCadastralTexto(texto, origemTexto, contexto = null) {
    try {
        const s = ler(texto), inicial = ler(origemTexto), baseOps = new Set(inicial.logsAuditoria.map(a => a.operacaoId));
        const clientesConversao = comprovarConversoesJournalTexto(texto, contexto)
            .filter(p => p.clienteTexto !== null).map(p => ler(p.clienteTexto));
        for (const tipo of ['cliente','tipo']) {
            const mapa = new Map(inicial[colecao(tipo)].map(c => [ref(tipo,c.id), c]));
            if (tipo === 'cliente') for (const cliente of clientesConversao) {
                const r = ref(tipo, cliente.id);
                exigir(!mapa.has(r), 'IDENTIDADE_CADASTRAL_DIVERGENTE');
                mapa.set(r, cliente);
            }
            for (const a of s.logsAuditoria.filter(a => a.origem === origem(tipo) && !baseOps.has(a.operacaoId))) {
                const assinatura = ler(a.assinaturaPlano), spec = assinatura.comando === 'cliente.cadastrar.v1'
                    ? { tipo: 'cliente', acao: 'criar' } : COMANDOS_CADASTRAIS[assinatura.comando];
                exigir(canon(assinatura) === a.assinaturaPlano && spec?.tipo === tipo && spec.acao === a.acao
                    && assinatura.metadados.operacaoId === a.operacaoId && assinatura.metadados.atorReferencia === a.usuario
                    && assinatura.metadados.timestamp === a.timestamp && a.data === a.timestamp, 'EVIDENCIA_CADASTRAL_DIVERGENTE');
                const r = a[campoRef(tipo)], anterior = mapa.get(r);
                if (a.acao === 'criar') exigir(!anterior && a.registroSnapshot && ref(tipo,a.registroSnapshot.id) === r, 'CRIACAO_CADASTRAL_DIVERGENTE');
                else exigir(anterior && canon(anterior) === canon(a.registroAnteriorSnapshot), 'PREDECESSOR_CADASTRAL_DIVERGENTE');
                if (a.acao === 'excluir') { exigir(a.registroSnapshot === null, 'EXCLUSAO_DIVERGENTE'); mapa.delete(r); }
                else { exigir(ref(tipo,a.registroSnapshot.id) === r, 'IDENTIDADE_CADASTRAL_DIVERGENTE'); mapa.set(r,a.registroSnapshot); }
            }
            const ordenar = (a,b) => ref(tipo,a.id) < ref(tipo,b.id) ? -1 : ref(tipo,a.id) > ref(tipo,b.id) ? 1 : 0;
            exigir(canon(Array.from(mapa.values()).sort(ordenar))
                === canon(s[colecao(tipo)].slice().sort(ordenar)), 'ESTADO_CADASTRAL_DIVERGENTE');
        }
        return validarCatalogoTiposTexto(texto);
    } catch (_) { return false; }
}
