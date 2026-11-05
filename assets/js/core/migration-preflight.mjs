import { decodificarTextoEstrito, validarIdentidadeBaseTexto } from './legacy-state-codec.mjs';
import { validarEstruturaSnapshotIndexedDB } from './indexeddb-authority.mjs';
import { criarLedgerEstoqueV2Texto, provarRaizLedgerCatalogosTexto } from './operational-stock-ledger.mjs';
import { validarRaizOperacionalTransporteTexto } from './operational-transactions.mjs';
import { validarHistoricoCadastralTexto } from './catalog-command-kernels.mjs';

// Preparacao INATIVA: nao abre banco, le storage, acessa rede ou publica estado.
const MAX_BYTES = 10 * 1024 * 1024;
const FORMAT = 'mtz-preflight-backup-v1';
const COLLECTIONS = Object.freeze(['locadores', 'pecas', 'locacoes', 'propostas', 'devolucoes',
    'contasReceber', 'fornecedores', 'contasPagar', 'categoriasFinanceiras', 'centrosCusto',
    'conciliacoesFinanceiras', 'conciliacoesPagamentosPagar', 'movimentacoesEstoque', 'transportes',
    'tipos', 'usuarios', 'logsAuditoria', 'modelosChecklist', 'checklistsGerados',
    'checklistMontagem', 'checklistEtapasMontagem', 'encargosFinanceiros']);
const IDENTITIES = Object.freeze({ locadores: 'cliente', pecas: 'peca', locacoes: 'locacao',
    propostas: 'proposta', devolucoes: 'devolucao', contasReceber: 'conta-receber',
    fornecedores: 'fornecedor', contasPagar: 'conta-pagar', categoriasFinanceiras: 'categoria-financeira',
    centrosCusto: 'centro-custo', transportes: 'transporte', tipos: 'tipo' });
const SOURCES = new Set(['arquivo_json', 'localStorage:mtzBackup', 'localStorage:mtzBackupEmergencia',
    'localStorage:mtzBackupAutomatico', 'copia_nuvem']);
const artifacts = new WeakMap();
const canon = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, fields) => object(v) && Object.keys(v).sort().join('|') === fields.slice().sort().join('|');
const failure = codigo => Object.freeze({ ok: false, codigo, gravado: false, publicado: false,
    migracaoAutorizada: false });
const idKey = id => typeof id === 'string' && id.trim() && id.length <= 16384
    ? JSON.stringify(['string', id]) : typeof id === 'number' && Number.isSafeInteger(id) && !Object.is(id, -0)
        ? JSON.stringify(['number', id]) : null;
const schemaLabel = v => typeof v === 'string' && /^\d+(?:\.\d+){0,2}$/.test(v) ? v : null;
function sourceShape(v) {
    const envelope = object(v.dados), root = COLLECTIONS.some(k => Array.isArray(v[k]));
    return { formato: envelope ? root ? 'ambiguo' : 'envelope_dados' : 'raiz_json',
        estado: envelope && !root ? v.dados : v };
}
function bytes(text) {
    if (typeof text !== 'string') throw Error('TEXTO_PRIMITIVO_OBRIGATORIO');
    const data = new TextEncoder().encode(text);
    if (!data.length || data.length > MAX_BYTES || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data) !== text)
        throw Error('ORIGEM_UTF8_INVALIDA_OU_EXCESSIVA');
    return data;
}
async function sha(text) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes(text));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
function options(text) {
    const v = decodificarTextoEstrito(text).valor;
    if (!exact(v, ['fonte', 'dataReferencia', 'criadoEm']) || !SOURCES.has(v.fonte)
        || typeof v.criadoEm !== 'string' || new Date(v.criadoEm).toISOString() !== v.criadoEm
        || typeof v.dataReferencia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.dataReferencia)
        || new Date(v.dataReferencia + 'T12:00:00.000Z').toISOString().slice(0, 10) !== v.dataReferencia)
        throw Error('OPCOES_PREFLIGHT_INVALIDAS');
    return v;
}
function containsCredential(v) {
    if (!v || typeof v !== 'object') return false;
    return Object.keys(v).some(k => /^(?:token|gToken|googleToken|access_?token|refresh_?token|id_?token|password|senha|apiKey|client_?secret|privateKey|authorization)$/i.test(k)
        || containsCredential(v[k]));
}
function summary(s) {
    const contagens = Object.fromEntries(COLLECTIONS.filter(k => Array.isArray(s?.[k])).map(k => [k, s[k].length]));
    const totais = {};
    for (const [collection, fields] of [['contasReceber', ['valorTotalCentavos', 'valorRecebidoCentavos', 'saldoCentavos']],
        ['contasPagar', ['originalCentavos', 'previstoCentavos', 'pagoCentavos', 'saldoCentavos']]]) {
        if (!Array.isArray(s?.[collection])) continue;
        for (const field of fields) {
            if (s[collection].some(r => !Number.isSafeInteger(r?.[field]))) continue;
            totais[collection + '.' + field] = s[collection].reduce((a, r) => a + BigInt(r[field]), 0n).toString();
        }
    }
    return { contagens, totaisDocumentaisCentavos: totais };
}
function structural(s, diagnostics) {
    const indexes = new Map();
    const add = (codigo, colecao = null, indice = null) => diagnostics.push({ codigo, colecao, indice });
    for (const [collection, type] of Object.entries(IDENTITIES)) {
        const map = new Map(); indexes.set(type, map);
        if (!Array.isArray(s[collection])) { add('COLECAO_AUSENTE', collection); continue; }
        s[collection].forEach((r, i) => {
            const key = object(r) ? idKey(r.id) : null;
            if (!key) add('IDENTIDADE_INVALIDA', collection, i);
            else if (map.has(key)) add('IDENTIDADE_DUPLICADA', collection, i);
            else map.set(key, r);
        });
    }
    const checkId = (id, type, collection, i) => {
        if (id === undefined || id === null || id === '') return;
        if (!indexes.get(type)?.has(idKey(id))) add('VINCULO_AUSENTE_OU_TIPO_DIVERGENTE', collection, i);
    };
    const checkRef = (reference, type, collection, i) => {
        if (reference === undefined || reference === null || reference === '') return;
        try {
            if (typeof reference !== 'string' || !reference.startsWith(type + ':')) throw Error();
            const tuple = JSON.parse(decodeURIComponent(reference.slice(type.length + 1)));
            if (!Array.isArray(tuple) || tuple.length !== 2 || typeof tuple[1] !== tuple[0]
                || reference !== type + ':' + encodeURIComponent(JSON.stringify(tuple))) throw Error();
            checkId(tuple[1], type, collection, i);
        } catch (_) { add('REFERENCIA_TIPADA_INVALIDA', collection, i); }
    };
    for (const [i, l] of (s.locacoes || []).entries()) {
        if (!object(l)) continue;
        checkId(l.locadorId, 'cliente', 'locacoes', i); checkId(l.clienteId, 'cliente', 'locacoes', i);
        if (l.locadorId != null && l.clienteId != null && idKey(l.locadorId) !== idKey(l.clienteId))
            add('VINCULOS_CLIENTE_CONTRADITORIOS', 'locacoes', i);
        checkRef(l.propostaReferencia, 'proposta', 'locacoes', i);
        checkId(l.propostaOrigemId, 'proposta', 'locacoes', i);
        for (const item of Array.isArray(l.items) ? l.items : []) if (object(item))
            checkId(item.pecaId, 'peca', 'locacoes', i);
    }
    for (const [i, p] of (s.propostas || []).entries()) {
        if (!object(p)) continue;
        checkId(p.clienteId, 'cliente', 'propostas', i);
        checkId(p.locacaoId, 'locacao', 'propostas', i); checkId(p.locacaoVinculadaId, 'locacao', 'propostas', i);
        checkRef(p.locacaoVinculadaReferencia, 'locacao', 'propostas', i);
        for (const item of Array.isArray(p.itens) ? p.itens : []) if (object(item)) {
            checkId(item.tipoId, 'tipo', 'propostas', i); checkRef(item.tipoReferencia, 'tipo', 'propostas', i);
        }
    }
    for (const collection of ['contasReceber', 'contasPagar', 'transportes', 'devolucoes', 'movimentacoesEstoque'])
        for (const [i, r] of (s[collection] || []).entries()) {
            if (!object(r)) continue;
            checkId(r.locacaoId, 'locacao', collection, i); checkRef(r.locacaoReferencia, 'locacao', collection, i);
            checkId(r.fornecedorId, 'fornecedor', collection, i); checkRef(r.fornecedorReferencia, 'fornecedor', collection, i);
            checkRef(r.propostaReferencia, 'proposta', collection, i);
            checkRef(r.categoriaFinanceiraReferencia, 'categoria-financeira', collection, i);
            checkRef(r.centroCustoReferencia, 'centro-custo', collection, i);
        }
}

export async function inspecionarOrigemMigracaoTexto(textoOriginal, opcoesTexto) {
    try {
        const op = options(opcoesTexto), utf8 = bytes(textoOriginal), hash = await sha(textoOriginal);
        const raw = decodificarTextoEstrito(textoOriginal);
        if (!object(raw.valor)) return failure('RAIZ_JSON_INVALIDA');
        const diagnostics = [], { formato, estado: s } = sourceShape(raw.valor), wrapper = formato !== 'raiz_json';
        const version = schemaLabel(s.versao);
        const dados = { fonte: op.fonte, formato,
            versao: version, bytesOrigem: utf8.length, sha256Origem: hash, ...summary(s) };
        if (containsCredential(raw.valor)) diagnostics.push({ codigo: 'SEGREDOS_NA_ORIGEM_EXIGEM_EXPORTACAO_CONTROLADA' });
        if (wrapper) diagnostics.push({ codigo: formato === 'ambiguo'
            ? 'FORMATO_AMBIGUO_RAIZ_E_ENVELOPE' : 'ENVELOPE_REQUER_CONTRATO_DE_EXTRACAO' });
        if (!version || !/^12(?:\.[0-6])?$/.test(version))
            diagnostics.push({ codigo: 'VERSAO_NAO_CERTIFICADA' });
        if (object(s.config) && Object.hasOwn(s.config, 'schemaVersion') && s.config.schemaVersion !== version)
            diagnostics.push({ codigo: 'VERSAO_CONFIG_DIVERGENTE' });
        const normalized = JSON.parse(raw.texto);
        const transformacoes = [];
        if (!wrapper) for (const k of ['categoriasFinanceiras', 'centrosCusto', 'encargosFinanceiros'])
            if (!Object.hasOwn(normalized, k)) { normalized[k] = []; transformacoes.push({ codigo: 'COLECAO_OPCIONAL_VAZIA', colecao: k }); }
        if (!wrapper) {
            if (!validarEstruturaSnapshotIndexedDB(canon(normalized))) diagnostics.push({ codigo: 'ESTRUTURA_INCOMPLETA' });
            // Referencias sempre exatas, sem associar cadastros pelo nome.
            if (COLLECTIONS.every(k => !Object.hasOwn(normalized, k) || Array.isArray(normalized[k])))
                structural(normalized, diagnostics);
            if (Array.isArray(normalized.logsAuditoria) && normalized.logsAuditoria.some(a => ['proposta_transacional', 'cadastro_cliente_transacional',
                'cadastro_tipo_transacional', 'reserva_inicial_v2', 'cancelamento_locacao_v2'].includes(a?.origem))
                || Array.isArray(normalized.locacoes) && normalized.locacoes.some(l => Object.hasOwn(l || {}, 'conversaoProposta')))
                diagnostics.push({ codigo: 'JOURNAL_ORIGINAL_NECESSARIO' });
            for (const k of ['encargosFinanceiros', 'usuarios', 'modelosChecklist', 'checklistsGerados',
                'checklistMontagem', 'checklistEtapasMontagem'])
                if (Array.isArray(normalized[k]) && normalized[k].length)
                    diagnostics.push({ codigo: 'COLECAO_FORA_PERFIL_CERTIFICADO', colecao: k });
            if (object(normalized.checklistConferencia) && Object.keys(normalized.checklistConferencia).length)
                diagnostics.push({ codigo: 'COLECAO_FORA_PERFIL_CERTIFICADO', colecao: 'checklistConferencia' });
        }
        let ledgerTexto = null, snapshotTexto = null;
        if (!diagnostics.length) {
            snapshotTexto = canon(normalized);
            const l = criarLedgerEstoqueV2Texto(snapshotTexto, canon({ tipo: 'sem_reserva_v2' }));
            if (!l.ok) diagnostics.push({ codigo: 'PERFIL_OPERACIONAL_NAO_CERTIFICADO' });
            else {
                const p = provarRaizLedgerCatalogosTexto(l.ledgerTexto, snapshotTexto, op.dataReferencia + 'T12:00:00.000Z');
                if (!p.ok || !validarRaizOperacionalTransporteTexto(snapshotTexto, op.dataReferencia, p.comprovacao)
                    || !validarHistoricoCadastralTexto(snapshotTexto, snapshotTexto))
                    diagnostics.push({ codigo: 'INTEGRIDADE_GLOBAL_OU_PERFIL_NAO_CERTIFICADO' });
                else ledgerTexto = l.ledgerTexto;
            }
        }
        const report = Object.freeze({ ok: diagnostics.length === 0, codigo: diagnostics.length ? 'MIGRACAO_BLOQUEADA' : 'PREFLIGHT_COMPATIVEL_RESTRITO',
            relatorioTexto: canon({ ...dados, diagnosticos: diagnostics, transformacoes,
                elegivelSimulacao: diagnostics.length === 0, migracaoAutorizada: false }),
            gravado: false, publicado: false, migracaoAutorizada: false });
        artifacts.set(report, { op, textoOriginal, originalCanonico: raw.texto, snapshotTexto, ledgerTexto, dados, diagnostics, transformacoes });
        return report;
    } catch (_) { return failure('ORIGEM_OU_OPCOES_INVALIDAS'); }
}

export async function exportarBackupMigracaoTexto(textoOriginal, opcoesTexto) {
    try {
        const op = options(opcoesTexto), data = bytes(textoOriginal), parsed = decodificarTextoEstrito(textoOriginal);
        if (!object(parsed.valor)) return failure('RAIZ_JSON_INVALIDA');
        if (containsCredential(parsed.valor)) return failure('SEGREDOS_NA_ORIGEM_EXIGEM_EXPORTACAO_CONTROLADA');
        const { formato, estado: s } = sourceShape(parsed.valor);
        const manifest = { formato: FORMAT, codificacao: 'utf-8', fonte: op.fonte, criadoEm: op.criadoEm,
            formatoOrigem: formato, versaoOrigem: schemaLabel(s.versao), bytesOrigem: data.length,
            sha256Origem: await sha(textoOriginal), sha256Canonico: await sha(parsed.texto), ...summary(s),
            revisaoLegada: Number.isSafeInteger(s.ultimaEdicao) ? s.ultimaEdicao : null,
            escopoRestauracao: 'texto-origem-exato-nao-banco-ativo', journalIncluido: false,
            sensivel: true, autenticacaoCriptografica: false };
        const manifestoTexto = canon(manifest);
        // A string original permanece byte a byte recuperavel, inclusive espacos.
        return Object.freeze({ ok: true, codigo: 'BACKUP_PREPARADO_NAO_GRAVADO', backupTexto: canon({
            manifesto: manifest, sha256Manifesto: await sha(manifestoTexto), origemTexto: textoOriginal
        }), sha256Origem: manifest.sha256Origem, gravado: false, publicado: false });
    } catch (_) { return failure('BACKUP_NAO_PREPARADO'); }
}

export async function restaurarBackupMigracaoIsoladoTexto(backupTexto) {
    try {
        const b = decodificarTextoEstrito(backupTexto).valor;
        if (!exact(b, ['manifesto', 'sha256Manifesto', 'origemTexto']) || !object(b.manifesto)) return failure('BACKUP_INVALIDO');
        const m = b.manifesto;
        if (m.formato !== FORMAT || typeof b.origemTexto !== 'string'
            || await sha(canon(m)) !== b.sha256Manifesto) return failure('BACKUP_INTEGRIDADE_INVALIDA');
        const opcoes = canon({ fonte: m.fonte, criadoEm: m.criadoEm, dataReferencia: m.criadoEm.slice(0, 10) });
        const rebuilt = await exportarBackupMigracaoTexto(b.origemTexto, opcoes);
        if (!rebuilt.ok || rebuilt.backupTexto !== decodificarTextoEstrito(backupTexto).texto)
            return failure('BACKUP_INTEGRIDADE_INVALIDA');
        return Object.freeze({ ok: true, codigo: 'COPIA_ISOLADA_RESTAURADA', textoOriginal: b.origemTexto,
            sha256Origem: m.sha256Origem, gravado: false, publicado: false, migracaoAutorizada: false });
    } catch (_) { return failure('BACKUP_INVALIDO'); }
}

export async function simularMigracaoTexto(textoOriginal, opcoesTexto) {
    const preflight = await inspecionarOrigemMigracaoTexto(textoOriginal, opcoesTexto);
    if (!preflight.ok) return preflight;
    try {
        const a = artifacts.get(preflight), identity = validarIdentidadeBaseTexto(canon({
            baseId: 'ensaio-interdominios:preflight:' + a.dados.sha256Origem, epocaAutoridade: 'simulacao:1', protocolo: 1
        }));
        if (!identity.ok) return failure('IDENTIDADE_SIMULACAO_INVALIDA');
        const back = await exportarBackupMigracaoTexto(textoOriginal, opcoesTexto);
        const restore = back.ok ? await restaurarBackupMigracaoIsoladoTexto(back.backupTexto) : back;
        if (!restore.ok || restore.textoOriginal !== textoOriginal) return failure('BACKUP_VERIFICADO_OBRIGATORIO');
        const original = JSON.parse(a.originalCanonico), normalized = JSON.parse(a.snapshotTexto);
        for (const key of Object.keys(original))
            if (canon(original[key]) !== canon(normalized[key])) return failure('PERDA_DE_CAMPO_ORIGEM');
        const plano = { tipo: '@inicializar', operacaoId: 'preflight.' + a.dados.sha256Origem, atorReferencia: 'preflight-sintetico',
            revisaoEsperada: -1, dadosTexto: a.snapshotTexto, identidadeBaseTexto: identity.texto };
        const evento = { revisao: 0, revisaoAnterior: -1, operacaoId: plano.operacaoId, tipo: plano.tipo,
            atorReferencia: plano.atorReferencia, timestamp: a.op.criadoEm, assinaturaComando: canon(plano), snapshotTexto: a.snapshotTexto };
        const { revisaoAnterior, snapshotTexto, ...evidencia } = evento;
        const stores = { raiz: [{ chave: 'atual', revisao: 0, snapshotTexto }], historico: [evento],
            auditoria: [evidencia], recibos: [{ ...evidencia }], controle: [{ chave: 'base', identidadeBaseTexto: identity.texto }] };
        const r = Object.freeze({ ok: true, codigo: 'DRY_RUN_SEM_ESCRITA', relatorioTexto: canon({
            ...JSON.parse(preflight.relatorioTexto), camposOriginaisPreservados: true, backupVerificado: true,
            storesSimulados: Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, v.length])),
            hashDestino: await sha(a.snapshotTexto), resumoDestino: summary(normalized), importacaoDefinitivaPermitida: false
        }), gravado: false, publicado: false, migracaoAutorizada: false });
        artifacts.set(r, { ...a, stores, identidadeBaseTexto: identity.texto });
        return r;
    } catch (_) { return failure('FALHA_SIMULACAO_SEM_ESCRITA'); }
}

// Exportacao de artefato de simulacao, nao entrada de commit do aplicativo.
export function obterArtefatoSimulacaoTexto(resultado) {
    const a = artifacts.get(resultado);
    return a?.stores ? Object.freeze({ ok: true, storesTexto: canon(a.stores),
        snapshotTexto: a.snapshotTexto, ledgerTexto: a.ledgerTexto, identidadeBaseTexto: a.identidadeBaseTexto,
        gravado: false, publicado: false, migracaoAutorizada: false }) : failure('SIMULACAO_NAO_CONFIAVEL');
}
