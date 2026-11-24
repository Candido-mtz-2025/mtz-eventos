import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const format = 'mtz-orc-logical-encrypted-v1';
const columns = Object.freeze({
    companies: ['id', 'name', 'policy', 'genesis_text'], users: ['id', 'issuer', 'subject', 'active'],
    members: ['tenant_id', 'user_id', 'active', 'permissions'], state: ['tenant_id', 'revision', 'snapshot_text'],
    journal: ['tenant_id', 'revision', 'operation_id', 'actor_id', 'command', 'data_text', 'timestamp_text', 'policy', 'before_hash', 'after_hash', 'snapshot_text'],
    receipts: ['tenant_id', 'operation_id', 'actor_id', 'fingerprint', 'revision', 'result'],
    audit: ['tenant_id', 'operation_id', 'revision', 'actor_id', 'evidence']
});
const sha = value => createHash('sha256').update(value).digest('hex');
const keyBytes = text => {
    if (typeof text !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(text)) throw Error('CHAVE_BACKUP_INVALIDA');
    const bytes = Buffer.from(text, 'base64'); if (bytes.length !== 32) throw Error('CHAVE_BACKUP_INVALIDA'); return bytes;
};
const schemaHash = async () => sha((await readFile(new URL('./schema.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
async function verifyTarget(db) {
    const m = (await db.query("SELECT obj_description('orc'::regnamespace,'pg_namespace') AS marker")).rows[0].marker;
    if (m !== 'mtz-homologation-synthetic-only-v1') throw Error('BANCO_NAO_IDENTIFICADO_COMO_HOMOLOGACAO');
    const r = (await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    if (!r.rolsuper && !r.rolbypassrls) throw Error('ROLE_BACKUP_INDEPENDENTE_NECESSARIA');
}
export async function exportLogicalBackup(pool, key) {
    keyBytes(key); const db = await pool.connect();
    try {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await verifyTarget(db);
        const tables = {};
        for (const [table, fields] of Object.entries(columns)) tables[table] = (await db.query(`SELECT ${fields.join(',')} FROM orc.${table} ORDER BY ${fields[0]}${fields.includes('revision') ? ',revision' : fields.includes('user_id') ? ',user_id' : ''}`)).rows;
        await db.query('COMMIT');
        const plain = Buffer.from(JSON.stringify({ format, schemaHash: await schemaHash(), createdAt: new Date().toISOString(), tables }));
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv); cipher.setAAD(Buffer.from(format));
        const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
        const archive = JSON.stringify({ format, sha256: sha(plain), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
        return { archive, sha256: sha(archive), counts: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])) };
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
}
export async function restoreLogicalBackup(pool, archive, key) {
    const envelope = JSON.parse(archive);
    if (envelope.format !== format || archive.length > 128 * 1024 * 1024) throw Error('BACKUP_INVALIDO');
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(format)); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const bytes = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
    if (sha(bytes) !== envelope.sha256) throw Error('HASH_BACKUP_DIVERGENTE');
    const data = JSON.parse(bytes.toString('utf8'));
    if (data.format !== format || data.schemaHash !== await schemaHash() || !data.tables
        || Object.keys(data.tables).sort().join('|') !== Object.keys(columns).sort().join('|')) throw Error('SCHEMA_BACKUP_INCOMPATIVEL');
    const db = await pool.connect();
    try {
        await db.query('BEGIN'); await verifyTarget(db);
        await db.query('LOCK TABLE ' + Object.keys(columns).map(t => 'orc.' + t).join(',') + ' IN ACCESS EXCLUSIVE MODE');
        for (const table of Object.keys(columns)) if ((await db.query('SELECT 1 FROM orc.' + table + ' LIMIT 1')).rowCount) throw Error('DESTINO_DEVE_ESTAR_VAZIO');
        for (const [table, fields] of Object.entries(columns)) {
            if (!Array.isArray(data.tables[table])) throw Error('BACKUP_INVALIDO');
            for (const row of data.tables[table]) {
                if (Object.keys(row).sort().join('|') !== [...fields].sort().join('|')) throw Error('COLUNAS_BACKUP_INVALIDAS');
                await db.query(`INSERT INTO orc.${table}(${fields.join(',')}) VALUES(${fields.map((_, i) => '$' + (i + 1)).join(',')})`, fields.map(f => row[f]));
            }
        }
        await db.query('COMMIT'); return { ok: true, counts: Object.fromEntries(Object.entries(data.tables).map(([t, rows]) => [t, rows.length])) };
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
}
