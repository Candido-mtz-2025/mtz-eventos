import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createLab } from './lab.mjs';
import { ids, dto, canonical, genesis } from './fixture.mjs';
import { prepararComandoPropostaTexto } from '../../assets/js/core/proposal-command-kernels.mjs';

test('POC central: PostgreSQL real, nucleo original, identidades sinteticas assinadas', { timeout: 180000 }, async t => {
    const results = [], faults = new Map(), drops = new Set(), holds = new Map();
    const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
    const lab = await createLab({ hooks: {
        afterAuthorization: async c => { const hold = holds.get(c.operationId); if (hold) { hold.entered.resolve(); await hold.release.promise; } },
        afterState: async c => { if (faults.get(c.operationId) === 'state') throw Error('synthetic'); },
        afterJournal: async c => { if (faults.get(c.operationId) === 'journal') throw Error('synthetic'); },
        afterAudit: async c => { if (faults.get(c.operationId) === 'audit') throw Error('synthetic'); },
        beforeCommit: async c => { if (faults.get(c.operationId) === 'commit') throw Error('synthetic'); }
    }, httpHooks: { dropResponse: op => { if (drops.has(op)) { drops.delete(op); return true; } return false; } } });
    t.after(async () => { for (const hold of holds.values()) hold.release.resolve(); await lab.stop(); await mkdir(new URL('./reports/', import.meta.url), { recursive: true });
        await writeFile(new URL('./reports/backend.json', import.meta.url), JSON.stringify({ passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results }, null, 2)); });
    const tokens = {}; for (const name of ['alice', 'bob', 'carol', 'bea', 'viewer', 'denied', 'revoked']) tokens[name] = await lab.tokenFor(name);
    const call = async (method, suffix, name = 'alice', body, tenant = ids.A, extra = {}) => {
        const response = await fetch(lab.base + (suffix === '/api/me' ? suffix : '/api/companies/' + tenant + suffix), {
            method, headers: { Authorization: 'Bearer ' + (tokens[name] || name), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        return { status: response.status, body: await response.json() };
    };
    const read = async (name = 'alice', tenant = ids.A) => call('GET', '/state', name, undefined, tenant);
    let serial = 0;
    const create = async (id = 'p-' + serial, name = 'alice', data = dto(id), revision) => {
        const rev = revision ?? (await read(name)).body.revisao;
        const command = { operacaoId: 'poc:' + (++serial), tipo: 'proposta.criar.v1', revisaoEsperada: rev, dadosTexto: canonical(data) };
        return { command, response: await call('POST', '/commands', name, command) };
    };
    const counts = async op => (await lab.db.owner.query('SELECT (SELECT count(*)::int FROM orc.journal WHERE operation_id=$1) AS journal,(SELECT count(*)::int FROM orc.audit WHERE operation_id=$1) AS audit,(SELECT count(*)::int FROM orc.receipts WHERE operation_id=$1) AS receipts', [op])).rows[0];
    const check = async (name, fn) => t.test(name, async () => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); throw e; } });
    await check('PostgreSQL real, fsync ativo e role operacional sem superusuario/BYPASSRLS', async () => {
        const v = (await lab.db.owner.query("SELECT version() AS v,current_setting('fsync') AS fsync")).rows[0];
        assert.match(v.v, /PostgreSQL 18\.4/); assert.equal(v.fsync, 'on');
        assert.deepEqual((await lab.db.pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0], { rolsuper: false, rolbypassrls: false });
    });
    await check('Tres usuarios A compartilham criacao, leitura e edicao', async () => {
        const { response } = await create('compartilhada'); assert.equal(response.status, 200, JSON.stringify(response));
        const a = await read(), b = await read('bob'), c = await read('carol'); assert.deepEqual(a.body, b.body); assert.deepEqual(a.body, c.body);
        const command = { operacaoId: 'editar:compartilhada', tipo: 'proposta.editar.v1', revisaoEsperada: c.body.revisao,
            dadosTexto: canonical({ propostaReferencia: 'proposta:' + encodeURIComponent(JSON.stringify(['string', 'compartilhada'])), campos: { evento: { nome: 'Editado por Carol' } }, itens: [{ indiceOrigem: 0 }], gerencial: dto().gerencial }) };
        assert.equal((await call('POST', '/commands', 'carol', command)).status, 200);
        const after = JSON.parse((await read('bob')).body.snapshotTexto), before = JSON.parse(a.body.snapshotTexto);
        assert.equal(after.propostas[0].evento.nome, 'Editado por Carol');
        assert.deepEqual(after.propostas[0].controleInterno.fechamentoGerencial, before.propostas[0].controleInterno.fechamentoGerencial);
        assert.deepEqual(after.futuro, genesis('A').futuro);
    });
    await check('Equivalencia integral de raiz com redutor original e valores financeiros', async () => {
        const event = (await lab.db.owner.query('SELECT * FROM orc.journal WHERE revision=1 AND tenant_id=$1', [ids.A])).rows[0];
        const expected = prepararComandoPropostaTexto(event.command, canonical(genesis('A')), event.data_text,
            canonical({ operacaoId: event.operation_id, atorReferencia: 'usuario:' + event.actor_id, timestamp: event.timestamp_text }));
        assert.ok(expected.ok); assert.equal(event.snapshot_text, expected.snapshotTexto);
        const f = JSON.parse(event.snapshot_text).propostas[0].controleInterno.fechamentoGerencial;
        assert.deepEqual([f.valorFinal, f.custoTotalProposta, f.tributosTotal, f.encargosTotal, f.retencoesTotal, f.depreciacaoGerencial, f.lucroPrevisto], [6800, 1700, 60, 20, 102, 1004, 4016]);
    });
    await check('Isolamento HTTP A/B e politica nao herdada pela empresa B', async () => {
        assert.equal((await read('alice', ids.B)).status, 403); assert.equal((await read('bea', ids.A)).status, 403);
        const b = await read('bea', ids.B); assert.equal(b.status, 200); assert.equal(b.body.politica, null); assert.equal(JSON.parse(b.body.snapshotTexto).propostas.length, 0);
        const c = { operacaoId: 'b:sem-politica', tipo: 'proposta.criar.v1', revisaoEsperada: 0, dadosTexto: canonical(dto()) };
        assert.equal((await call('POST', '/commands', 'bea', c, ids.B)).body.codigo, 'POLITICA_EMPRESA_NAO_SUPORTADA');
        assert.deepEqual((await read('bea', ids.B)).body, b.body);
    });
    await check('IDs numerico 1 e textual 1 coexistem sem colisao', async () => {
        assert.equal((await create(1)).response.status, 200); assert.equal((await create('1')).response.status, 200);
        const root = JSON.parse((await read()).body.snapshotTexto);
        assert.equal(root.propostas.filter(p => p.id === 1).length, 1); assert.equal(root.propostas.filter(p => p.id === '1').length, 1);
    });
    await check('JWT adulterado, issuer/audience/expiracao e claims de papel nao autorizam', async () => {
        const parts = tokens.alice.split('.'); const payload = JSON.parse(Buffer.from(parts[1], 'base64url')); payload.sub = 'synthetic-bea'; parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
        assert.equal((await read(parts.join('.'))).status, 401);
        for (const options of [{ issuer: 'http://127.0.0.1:1' }, { audience: 'outro' }, { iat: 1, exp: 2 }]) assert.equal((await read(await lab.tokenFor('alice', {}, options))).status, 401);
        const token = await lab.tokenFor('denied', { role: 'admin', tenant_id: ids.A, permissions: ['ler_propostas'] }); assert.equal((await read(token)).status, 403);
    });
    await check('Revogados e sem leitura sao recusados; leitor nao grava', async () => {
        assert.equal((await read('revoked')).status, 403); assert.equal((await read('denied')).status, 403); assert.equal((await read('viewer')).status, 200);
        const { command } = await create('leitor-teste'); assert.equal((await call('POST', '/commands', 'viewer', command)).status, 403);
    });
    await check('Campos finais, usuario, empresa e metadados arbitrarios sao recusados', async () => {
        const revision = (await read()).body.revisao;
        const command = { operacaoId: 'adulterada', tipo: 'proposta.criar.v1', revisaoEsperada: revision, dadosTexto: canonical(dto()) };
        for (const extra of [{ usuario: ids.bob }, { empresa: ids.B }, { timestamp: '2000-01-01' }, { snapshotTexto: '{}' }]) assert.equal((await call('POST', '/commands', 'alice', { ...command, ...extra })).status, 400);
        const data = dto(); data.campos.financeiro.valorFinal = 1;
        assert.equal((await call('POST', '/commands', 'alice', { ...command, dadosTexto: canonical(data) })).status, 400);
    });
    await check('Concorrencia de duas sessoes: um commit e um conflito sem escrita parcial', async () => {
        const rev = (await read()).body.revisao;
        const [a, b] = await Promise.all([create('concorrente-1', 'alice', dto('concorrente-1'), rev), create('concorrente-2', 'bob', dto('concorrente-2'), rev)]);
        assert.deepEqual([a.response.status, b.response.status].sort(), [200, 409]);
        const loser = a.response.status === 409 ? a : b;
        assert.equal(loser.response.body.codigo, 'CONFLITO_REVISAO'); assert.deepEqual(await counts(loser.command.operacaoId), { journal: 0, audit: 0, receipts: 0 });
    });
    await check('Idempotencia simultanea e conflito de payload/ator', async () => {
        const rev = (await read()).body.revisao, command = { operacaoId: 'idempotente:1', tipo: 'proposta.criar.v1', revisaoEsperada: rev, dadosTexto: canonical(dto('idempotente')) };
        const [a, b] = await Promise.all([call('POST', '/commands', 'alice', command), call('POST', '/commands', 'alice', command)]);
        assert.equal(a.status, 200); assert.equal(b.status, 200); assert.deepEqual(await counts(command.operacaoId), { journal: 1, audit: 1, receipts: 1 });
        assert.equal((await call('POST', '/commands', 'bob', command)).body.codigo, 'IDEMPOTENCIA_CONFLITANTE');
        assert.equal((await call('POST', '/commands', 'alice', { ...command, dadosTexto: canonical(dto('outro')) })).body.codigo, 'IDEMPOTENCIA_CONFLITANTE');
    });
    for (const stage of ['state', 'journal', 'audit', 'commit']) await check('Rollback integral em ' + stage, async () => {
        const before = (await read()).body, op = 'falha:' + stage; faults.set(op, stage);
        const command = { operacaoId: op, tipo: 'proposta.criar.v1', revisaoEsperada: before.revisao, dadosTexto: canonical(dto(op)) };
        assert.equal((await call('POST', '/commands', 'alice', command)).status, 503);
        assert.deepEqual((await read()).body, before); assert.deepEqual(await counts(op), { journal: 0, audit: 0, receipts: 0 });
    });
    await check('Resposta perdida recuperada por recibo apos reiniciar HTTP', async () => {
        const op = 'perda:resposta', command = { operacaoId: op, tipo: 'proposta.criar.v1', revisaoEsperada: (await read()).body.revisao, dadosTexto: canonical(dto('perdida')) };
        drops.add(op); await assert.rejects(call('POST', '/commands', 'alice', command)); await lab.restartHttp();
        const recovered = await call('GET', '/receipts/' + op); assert.equal(recovered.status, 200); assert.equal(recovered.body.recibo.operacaoId, op);
        assert.deepEqual(await counts(op), { journal: 1, audit: 1, receipts: 1 }); assert.equal((await call('GET', '/receipts/' + op, 'bob')).status, 404);
    });
    await check('Revogacao posterior impede leitura, recuperacao e repeticao de commit anterior', async () => {
        const { command, response } = await create('revogar-bob', 'bob'); assert.equal(response.status, 200);
        await lab.db.owner.query('UPDATE orc.members SET active=false WHERE user_id=$1', [ids.bob]);
        assert.equal((await read('bob')).status, 403); assert.equal((await call('POST', '/commands', 'bob', command)).status, 403);
        assert.equal((await call('GET', '/receipts/' + command.operacaoId, 'bob')).status, 403);
    });
    await check('Revogacao concorrente aguarda comando autorizado; requisicoes posteriores sao negadas', async () => {
        const operationId = 'revogacao:concorrente', hold = { entered: deferred(), release: deferred() }; holds.set(operationId, hold);
        const command = { operacaoId: operationId, tipo: 'proposta.criar.v1', revisaoEsperada: (await read()).body.revisao, dadosTexto: canonical(dto('antes-da-revogacao')) };
        const executing = call('POST', '/commands', 'carol', command); await hold.entered.promise;
        const revoking = lab.db.owner.query('UPDATE orc.members SET active=false WHERE user_id=$1', [ids.carol]);
        try {
            let observed = false;
            for (let i = 0; i < 50; i++) {
                const n = (await lab.db.owner.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname='orc_synthetic' AND wait_event_type='Lock' AND query LIKE 'UPDATE orc.members%'" )).rows[0].n;
                if (n) { observed = true; break; } await new Promise(r => setTimeout(r, 10));
            }
            assert.ok(observed, 'Revogacao deve aguardar lock do vinculo');
        } finally { hold.release.resolve(); }
        assert.equal((await executing).status, 200); await revoking;
        assert.equal((await read('carol')).status, 403);
    });
    await check('RLS impede cruzamento e role nao pode alterar evidencias/permissoes', async () => {
        const db = await lab.db.pool.connect();
        try {
            await db.query('BEGIN'); await db.query("SELECT set_config('orc.actor',$1,true),set_config('orc.tenant',$2,true)", [ids.alice, ids.B]);
            for (const table of ['state', 'journal', 'audit', 'receipts']) assert.equal((await db.query('SELECT * FROM orc.' + table)).rowCount, 0);
            await db.query('ROLLBACK');
            for (const table of ['journal', 'audit', 'receipts', 'members', 'users', 'companies']) await assert.rejects(db.query('UPDATE orc.' + table + ' SET ' + (table === 'users' || table === 'members' ? 'active=active' : table === 'companies' ? 'name=name' : 'operation_id=operation_id')));
        } finally { await db.query('ROLLBACK'); db.release(); }
    });
    await check('Predecessor adulterado bloqueia leitura e novas escritas', async () => {
        const original = (await lab.db.owner.query('SELECT before_hash FROM orc.journal WHERE tenant_id=$1 AND revision=1', [ids.A])).rows[0].before_hash;
        await lab.db.owner.query("UPDATE orc.journal SET before_hash='falso' WHERE tenant_id=$1 AND revision=1", [ids.A]);
        try { assert.equal((await read()).body.codigo, 'PREFIXO_INVALIDO'); } finally { await lab.db.owner.query('UPDATE orc.journal SET before_hash=$2 WHERE tenant_id=$1 AND revision=1', [ids.A, original]); }
        assert.equal((await read()).status, 200);
    });
});
