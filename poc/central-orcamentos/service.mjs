import { createHash } from 'node:crypto';
import { decodificarTextoEstrito } from '../../assets/js/core/legacy-state-codec.mjs';
import { prepararComandoPropostaTexto, validarComandoPropostaTexto, validarPropostasTexto } from '../../assets/js/core/proposal-command-kernels.mjs';
export const canonical = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
export const hash = text => createHash('sha256').update(text).digest('hex');
export function fail(status, code) { throw Object.assign(Error(code), { status, code }); }
const permission = Object.freeze({ 'proposta.criar.v1': 'criar_proposta', 'proposta.editar.v1': 'editar_proposta' });
export function validateRequest(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).sort().join('|') !== 'dadosTexto|operacaoId|revisaoEsperada|tipo'
        || !Object.hasOwn(permission, body.tipo) || !Number.isSafeInteger(body.revisaoEsperada) || body.revisaoEsperada < 0
        || typeof body.operacaoId !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(body.operacaoId)
        || typeof body.dadosTexto !== 'string' || !validarComandoPropostaTexto(body.tipo, body.dadosTexto)) fail(400, 'COMANDO_INVALIDO');
    return { ...body, dadosTexto: decodificarTextoEstrito(body.dadosTexto).texto };
}
function reduce(before, request, user, timestamp) {
    const result = prepararComandoPropostaTexto(request.tipo, before, request.dadosTexto,
        canonical({ operacaoId: request.operacaoId, atorReferencia: 'usuario:' + user, timestamp }));
    if (!result.ok) fail(422, result.codigo || 'REDUTOR_RECUSOU');
    if (!validarPropostasTexto(result.snapshotTexto)) fail(409, 'CANDIDATO_INVALIDO');
    return result.snapshotTexto;
}
export function createService(pool, { hooks = {} } = {}) {
    async function tx(identity, tenant, required, work, operationId) {
        if (tenant !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tenant)) fail(400, 'EMPRESA_INVALIDA');
        const db = await pool.connect();
        try {
            await db.query('BEGIN'); await db.query("SET LOCAL lock_timeout='5s'"); await db.query("SET LOCAL statement_timeout='15s'");
            const actor = (await db.query('SELECT orc.resolve_actor($1,$2) AS id', [identity.issuer, identity.subject])).rows[0].id;
            if (!actor) fail(401, 'NAO_AUTENTICADO');
            await db.query("SELECT set_config('orc.actor',$1,true)", [actor]);
            if (tenant !== null) {
                await db.query("SELECT set_config('orc.tenant',$1,true)", [tenant]);
                const permissions = (await db.query('SELECT orc.lock_member($1,$2) AS permissions', [tenant, actor])).rows[0].permissions;
                if (!permissions || !permissions.includes('ler_propostas') || !permissions.includes(required)) fail(403, 'PERMISSAO_NEGADA');
            }
            await hooks.afterAuthorization?.({ operationId, actor, tenant });
            const result = await work(db, actor);
            await hooks.beforeCommit?.({ operationId, actor, tenant });
            await db.query('COMMIT'); return result;
        } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; }
        finally { db.release(); }
    }
    async function authoritative(db, tenant, lock) {
        const result = await db.query(`SELECT s.*,c.genesis_text,c.policy FROM orc.state s JOIN orc.companies c ON c.id=s.tenant_id WHERE s.tenant_id=$1 FOR ${lock} OF s`, [tenant]);
        if (result.rowCount !== 1) fail(403, 'PERMISSAO_NEGADA');
        const row = result.rows[0]; let current = row.genesis_text;
        if (!validarPropostasTexto(current)) fail(409, 'GENESIS_INVALIDO');
        const events = (await db.query('SELECT j.*,r.fingerprint,r.actor_id AS receipt_actor,r.revision AS receipt_revision,r.result,a.evidence,a.actor_id AS audit_actor,a.revision AS audit_revision FROM orc.journal j LEFT JOIN orc.receipts r USING(tenant_id,operation_id) LEFT JOIN orc.audit a USING(tenant_id,operation_id) WHERE j.tenant_id=$1 ORDER BY j.revision', [tenant])).rows;
        let revision = 0;
        for (const event of events) {
            const command = { tipo: event.command, operacaoId: event.operation_id, revisaoEsperada: revision, dadosTexto: event.data_text };
            if (event.revision !== ++revision || event.policy !== row.policy || event.before_hash !== hash(current)
                || event.receipt_actor !== event.actor_id || event.audit_actor !== event.actor_id
                || event.receipt_revision !== revision || event.audit_revision !== revision
                || event.fingerprint !== hash(canonical(command))) fail(409, 'PREFIXO_INVALIDO');
            current = reduce(current, command, event.actor_id, event.timestamp_text);
            const receipt = { operacaoId: event.operation_id, revisao: revision, ator: event.actor_id, politica: event.policy, hash: hash(current) };
            if (current !== event.snapshot_text || hash(current) !== event.after_hash
                || canonical(event.result?.recibo) !== canonical(receipt) || event.result?.snapshotTexto !== current
                || canonical(event.evidence) !== canonical(receipt)) fail(409, 'PREFIXO_INVALIDO');
        }
        if (revision !== row.revision || current !== row.snapshot_text) fail(409, 'RAIZ_DIVERGENTE');
        return row;
    }
    const readResult = row => ({ ok: true, revisao: row.revision, snapshotTexto: row.snapshot_text, politica: row.policy });
    return Object.freeze({
        me: identity => tx(identity, null, null, async (db, actor) => ({ usuario: actor,
            empresas: (await db.query("SELECT c.id,c.name,c.policy,m.permissions FROM orc.companies c JOIN orc.members m ON m.tenant_id=c.id WHERE m.user_id=$1 AND m.active AND 'ler_propostas'=ANY(m.permissions)", [actor])).rows })),
        read: (identity, tenant) => tx(identity, tenant, 'ler_propostas', async db => readResult(await authoritative(db, tenant, 'SHARE'))),
        execute(identity, tenant, body) {
            const request = validateRequest(body), fingerprint = hash(canonical(request));
            return tx(identity, tenant, permission[request.tipo], async (db, actor) => {
                const row = await authoritative(db, tenant, 'UPDATE');
                const previous = (await db.query('SELECT * FROM orc.receipts WHERE tenant_id=$1 AND operation_id=$2', [tenant, request.operacaoId])).rows[0];
                if (previous) {
                    if (previous.actor_id !== actor || previous.fingerprint !== fingerprint) fail(409, 'IDEMPOTENCIA_CONFLITANTE');
                    return { ...previous.result, codigo: 'OPERACAO_JA_CONCLUIDA' };
                }
                // Nao presumir que outra empresa adotou a politica MTZ ainda fixa no nucleo.
                if (row.policy !== 'mtz-gerencial-v2-20:1') fail(409, 'POLITICA_EMPRESA_NAO_SUPORTADA');
                if (row.revision !== request.revisaoEsperada) fail(409, 'CONFLITO_REVISAO');
                const timestamp = new Date().toISOString(), next = reduce(row.snapshot_text, request, actor, timestamp), revision = row.revision + 1;
                const receipt = { operacaoId: request.operacaoId, revisao: revision, ator: actor, politica: row.policy, hash: hash(next) };
                const result = { ok: true, codigo: 'COMMIT_CONFIRMADO', recibo: receipt, snapshotTexto: next };
                await db.query('UPDATE orc.state SET revision=$2,snapshot_text=$3 WHERE tenant_id=$1', [tenant, revision, next]);
                await hooks.afterState?.({ operationId: request.operacaoId });
                await db.query('INSERT INTO orc.journal VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [tenant, revision, request.operacaoId, actor, request.tipo, request.dadosTexto, timestamp, row.policy, hash(row.snapshot_text), hash(next), next]);
                await hooks.afterJournal?.({ operationId: request.operacaoId });
                await db.query('INSERT INTO orc.audit VALUES($1,$2,$3,$4,$5)', [tenant, request.operacaoId, revision, actor, receipt]);
                await hooks.afterAudit?.({ operationId: request.operacaoId });
                await db.query('INSERT INTO orc.receipts VALUES($1,$2,$3,$4,$5,$6)', [tenant, request.operacaoId, actor, fingerprint, revision, result]);
                return result;
            }, request.operacaoId);
        },
        recover: (identity, tenant, operationId) => tx(identity, tenant, 'ler_propostas', async (db, actor) => {
            await authoritative(db, tenant, 'SHARE');
            const found = (await db.query('SELECT result FROM orc.receipts WHERE tenant_id=$1 AND operation_id=$2 AND actor_id=$3', [tenant, operationId, actor])).rows[0];
            if (!found) fail(404, 'OPERACAO_NAO_ENCONTRADA'); return found.result;
        })
    });
}
