import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { startCluster } from './cluster.mjs';
import { applySchema } from './admin.mjs';
const tables = ['companies', 'users', 'members', 'state', 'journal', 'receipts', 'audit'];
test('Schema privado com administrador local nao superusuario, sem registros de negocio', { timeout: 90000 }, async t => {
    const cluster = await startCluster(), root = new pg.Pool({ connectionString: cluster.adminUrl, max: 1 });
    const results = [], adminPassword = randomBytes(32).toString('hex'), appPassword = randomBytes(32).toString('hex');
    let admin, app;
    t.after(async () => { await app?.end(); await admin?.end(); await root.end(); await cluster.stop();
        const out = new URL('./reports/schema/', import.meta.url); await mkdir(out, { recursive: true });
        await writeFile(new URL('resultado.json', out), JSON.stringify({ externalSupabase: false, businessRecordsInserted: 0,
            passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }, null, 2)); });
    const check = (name, fn) => t.test(name, async () => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); throw e; } });
    await root.query("CREATE ROLE installer LOGIN CREATEROLE NOSUPERUSER NOCREATEDB NOBYPASSRLS NOINHERIT PASSWORD '" + adminPassword + "'");
    await root.query('GRANT CREATE ON DATABASE postgres TO installer');
    for (const role of ['anon', 'authenticated', 'authenticator', 'service_role']) await root.query('CREATE ROLE ' + role + ' NOLOGIN' + (role === 'service_role' ? ' BYPASSRLS' : ''));
    const url = new URL(cluster.adminUrl); url.username = 'installer'; url.password = adminPassword;
    admin = new pg.Pool({ connectionString: url.href, max: 1 });
    const absent = async () => {
        assert.equal((await root.query("SELECT to_regnamespace('orc') IS NULL AS ok")).rows[0].ok, true);
        assert.equal((await root.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('orc_owner','orc_app')")).rows[0].n, 0);
    };
    await check('Exige confirmacao externa de privacidade e senha forte antes de modificar', async () => {
        await assert.rejects(applySchema(admin, { password: appPassword }), /CONFIRMAR_ORC/);
        await assert.rejects(applySchema(admin, { password: 'curta', privateSchemaConfirmed: true }), /SENHA_OPERACIONAL/);
        await absent();
    });
    await check('Config pgrst expondo orc bloqueia o DDL antes de criar roles', async () => {
        await admin.query("SET pgrst.db_schemas='public, \"orc\"'");
        try { await assert.rejects(applySchema(admin, { password: appPassword, privateSchemaConfirmed: true }), /ORC_EXPOSTO/); }
        finally { await admin.query('RESET pgrst.db_schemas'); }
        await root.query("ALTER ROLE authenticator SET pgrst.db_schemas='public,orc'");
        try { await assert.rejects(applySchema(admin, { password: appPassword, privateSchemaConfirmed: true }), /ORC_EXPOSTO/); }
        finally { await root.query('ALTER ROLE authenticator RESET pgrst.db_schemas'); }
        await absent();
    });
    await check('Falha apos DDL e grants causa rollback integral inclusive roles temporarias', async () => {
        const failPassword = { connect: async () => {
            const db = await admin.connect();
            return { query: (sql, ...args) => typeof sql === 'string' && sql.startsWith('ALTER ROLE orc_app LOGIN PASSWORD') ? Promise.reject(Error('FALHA_SINTETICA')) : db.query(sql, ...args), release: () => db.release() };
        } };
        await assert.rejects(applySchema(failPassword, { password: appPassword, privateSchemaConfirmed: true }), /FALHA_SINTETICA/);
        await absent();
    });
    await check('Administrador sem SUPERUSER e NOINHERIT aplica; SET temporario e revogado', async () => {
        await admin.query("SET createrole_self_grant='set,inherit'");
        await applySchema(admin, { password: appPassword, privateSchemaConfirmed: true });
        assert.match((await admin.query('SHOW createrole_self_grant')).rows[0].createrole_self_grant, /set/);
        const grants = (await root.query("SELECT grantor::regrole::text AS grantor,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='orc_owner'::regrole AND member='installer'::regrole")).rows;
        assert.ok(grants.every(g => !g.inherit_option && !g.set_option && g.grantor !== 'installer'));
        assert.equal((await root.query("SELECT pg_has_role('orc_app','orc_owner','MEMBER') AS member")).rows[0].member, false);
        await assert.rejects(admin.query('SET ROLE orc_owner'), e => e.code === '42501');
        for (const name of tables) assert.equal((await root.query('SELECT count(*)::int AS n FROM orc.' + name)).rows[0].n, 0);
    });
    await check('Roles da Data API nao possuem acesso ao schema, tabelas ou funcoes', async () => {
        for (const role of ['anon', 'authenticated', 'authenticator', 'service_role']) {
            assert.equal((await root.query("SELECT has_schema_privilege($1,'orc','USAGE') AS allowed", [role])).rows[0].allowed, false);
            for (const table of tables) for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
                assert.equal((await root.query('SELECT has_table_privilege($1,$2,$3) AS allowed', [role, 'orc.' + table, privilege])).rows[0].allowed, false);
            assert.equal((await root.query("SELECT has_function_privilege($1,'orc.resolve_actor(text,text)','EXECUTE') AS allowed", [role])).rows[0].allowed, false);
        }
        await root.query('BEGIN');
        try { await root.query('SET LOCAL ROLE service_role'); await assert.rejects(root.query('SELECT * FROM orc.state'), e => e.code === '42501'); }
        finally { await root.query('ROLLBACK'); }
    });
    await check('Privilegios minimos de orc_app e seis FORCE RLS preservados', async () => {
        const role = (await root.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,rolcanlogin FROM pg_roles WHERE rolname='orc_app'")).rows[0];
        assert.deepEqual(role, { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolinherit: false, rolcanlogin: true });
        assert.equal((await root.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='orc' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity")).rows[0].n, 6);
        assert.equal((await root.query("SELECT has_table_privilege('orc_app','orc.users','SELECT') AS allowed")).rows[0].allowed, false);
        for (const table of ['journal', 'receipts', 'audit']) {
            assert.equal((await root.query("SELECT has_table_privilege('orc_app',$1,'INSERT') AS allowed", ['orc.' + table])).rows[0].allowed, true);
            for (const privilege of ['UPDATE', 'DELETE']) assert.equal((await root.query("SELECT has_table_privilege('orc_app',$1,$2) AS allowed", ['orc.' + table, privilege])).rows[0].allowed, false);
        }
        assert.equal((await root.query("SELECT has_column_privilege('orc_app','orc.state','snapshot_text','UPDATE') AS allowed")).rows[0].allowed, true);
        const target = new URL(cluster.adminUrl); target.username = 'orc_app'; target.password = appPassword;
        app = new pg.Pool({ connectionString: target.href, max: 1 });
        assert.equal((await app.query('SELECT * FROM orc.state')).rowCount, 0);
        await assert.rejects(app.query('SELECT * FROM orc.users'), e => e.code === '42501');
    });
    await check('Defaults nao publicam futuras funcoes e reaplicacao nao sobrescreve schema', async () => {
        await root.query('BEGIN');
        try {
            await root.query('SET LOCAL ROLE orc_owner');
            await root.query("CREATE FUNCTION orc.permission_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'");
            for (const role of ['anon', 'authenticated', 'authenticator', 'service_role', 'orc_app'])
                assert.equal((await root.query("SELECT has_function_privilege($1,'orc.permission_probe()','EXECUTE') AS allowed", [role])).rows[0].allowed, false);
        } finally { await root.query('ROLLBACK'); }
        await assert.rejects(applySchema(admin, { password: appPassword, privateSchemaConfirmed: true }), /SCHEMA_JA_EXISTE/);
        assert.equal((await root.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='orc'")).rows[0].n, 7);
    });
});
