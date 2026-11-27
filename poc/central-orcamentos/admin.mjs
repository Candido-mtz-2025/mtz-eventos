import pg from 'pg';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { postgresConfig } from './online-config.mjs';
import { exportLogicalBackup, restoreLogicalBackup } from './backup.mjs';
import { canonical, genesis, ids } from './fixture.mjs';
export async function applySchema(pool, { password, privateSchemaConfirmed } = {}) {
    if (privateSchemaConfirmed !== true) throw Error('CONFIRMAR_ORC_FORA_DA_DATA_API');
    if (typeof password !== 'string' || password.length < 24) throw Error('SENHA_OPERACIONAL_FORTE_NECESSARIA');
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        if ((await db.query("SELECT to_regnamespace('orc') AS schema")).rows[0].schema) throw Error('SCHEMA_JA_EXISTE_NAO_SOBRESCREVER');
        if ((await db.query("SELECT 1 FROM pg_roles WHERE rolname IN ('orc_owner','orc_app')")).rowCount) throw Error('ROLES_JA_EXISTEM_NAO_REUTILIZAR');
        await db.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
        const sql = (await db.query("SELECT format('ALTER ROLE orc_app LOGIN PASSWORD %L',$1::text) AS sql", [password])).rows[0].sql;
        await db.query(sql); await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; }
    finally { db.release(); }
}
export async function seedHostedDemo(pool, issuer, members) {
    if (new URL(issuer).protocol !== 'https:' || !Array.isArray(members) || members.length !== 3
        || new Set(members.map(m => m.subject)).size !== 3 || members.some(m => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.subject)
            || Object.keys(m).join('|') !== 'subject')) throw Error('TRES_SUBS_AUTH_CONFIRMADOS_NECESSARIOS');
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        await db.query('LOCK TABLE orc.companies,orc.users IN ACCESS EXCLUSIVE MODE');
        if ((await db.query('SELECT 1 FROM orc.companies UNION ALL SELECT 1 FROM orc.users LIMIT 1')).rowCount) throw Error('DEMO_EXIGE_BASE_VAZIA');
        for (const company of ['A', 'B']) {
            const initial = canonical(genesis(company));
            await db.query('INSERT INTO orc.companies VALUES($1,$2,$3,$4)', [ids[company], 'Empresa ficticia ' + company, company === 'A' ? 'mtz-gerencial-v2-20:1' : null, initial]);
            await db.query('INSERT INTO orc.state VALUES($1,0,$2)', [ids[company], initial]);
        }
        for (const member of members) {
            const id = randomUUID(); await db.query('INSERT INTO orc.users(id,issuer,subject) VALUES($1,$2,$3)', [id, issuer, member.subject]);
            await db.query('INSERT INTO orc.members VALUES($1,$2,true,$3)', [ids.A, id, ['ler_propostas', 'ler_aplicativo', 'criar_proposta', 'editar_proposta']]);
        }
        await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
async function run() {
    const [command, file] = process.argv.slice(2), env = process.env;
    if (env.APP_ENV !== 'homologation' || env.CONFIRM_SYNTHETIC_ADMIN !== 'yes') throw Error('AUTORIZACAO_ADMINISTRATIVA_EXPLICITA_NECESSARIA');
    const restoring = command === 'restore-isolated', url = new URL(restoring ? env.RESTORE_DATABASE_URL : env.ADMIN_DATABASE_URL);
    if (restoring && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('RESTAURACAO_SOMENTE_EM_DESTINO_LOCAL_ISOLADO');
    if (!restoring && url.hostname !== env.ADMIN_EXPECTED_HOST) throw Error('HOST_ADMINISTRATIVO_NAO_CONFIRMADO');
    const connection = restoring ? { connectionString: url.href, max: 1 } : postgresConfig(url.href, env.PG_CA_FILE ? await readFile(env.PG_CA_FILE, 'utf8') : undefined);
    const pool = new pg.Pool(connection);
    try {
        if (command === 'apply-schema') {
            await applySchema(pool, { password: env.ORC_APP_PASSWORD, privateSchemaConfirmed: env.CONFIRM_ORC_NOT_EXPOSED === 'yes' });
        } else if (command === 'seed-demo') {
            const marker = (await pool.query("SELECT obj_description('orc'::regnamespace,'pg_namespace') AS marker")).rows[0].marker;
            if (marker !== 'mtz-homologation-synthetic-only-v1') throw Error('DESTINO_NAO_HOMOLOGACAO');
            await seedHostedDemo(pool, new URL(env.SUPABASE_URL).origin + '/auth/v1', JSON.parse(await readFile(file, 'utf8')));
        } else if (command === 'backup') {
            const result = await exportLogicalBackup(pool, env.BACKUP_KEY_BASE64);
            await writeFile(file, result.archive, { flag: 'wx', mode: 0o600 });
            console.log(JSON.stringify({ codigo: 'BACKUP_LOGICO_ENCRIPTADO', sha256: result.sha256, counts: result.counts }));
        } else if (restoring) {
            console.log(JSON.stringify(await restoreLogicalBackup(pool, await readFile(file, 'utf8'), env.BACKUP_KEY_BASE64)));
        } else throw Error('COMANDO_ADMIN_INVALIDO');
    } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run().catch(() => { console.error('ADMINISTRACAO_NAO_CONFIRMADA: confira ambiente, permissoes e destino.'); process.exitCode = 1; });
