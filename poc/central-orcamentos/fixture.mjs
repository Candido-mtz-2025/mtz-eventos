import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { decodificarTextoEstrito } from '../../assets/js/core/legacy-state-codec.mjs';
export const canonical = v => decodificarTextoEstrito(JSON.stringify(v)).texto;
export const ids = Object.freeze({
    A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222',
    alice: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bob: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    carol: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', bea: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    viewer: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', denied: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    revoked: '99999999-9999-4999-8999-999999999999'
});
export function genesis(company) {
    const s = { versao: '12', data: '2026-11-24T12:00:00.000Z', ultimaEdicao: 0,
        config: { rodape: `Empresa ficticia ${company}` }, checklistConferencia: {}, futuro: { empresaSintetica: company, preservar: [1, '1'] } };
    for (const key of 'locadores pecas locacoes propostas devolucoes contasReceber contasPagar fornecedores categoriasFinanceiras centrosCusto conciliacoesFinanceiras conciliacoesPagamentosPagar movimentacoesEstoque transportes tipos usuarios logsAuditoria modelosChecklist checklistsGerados checklistMontagem checklistEtapasMontagem encargosFinanceiros'.split(' ')) s[key] = [];
    return s;
}
export function dto(id = 'proposta-sintetica') {
    return { id, campos: { clienteManual: { nome: 'Cliente ficticio', telefone: '00000000' },
        evento: { nome: 'Evento ficticio', dataEvento: '2026-12-15' },
        financeiro: { desconto: 200, acrescimo: 0, percentualNF: 0 },
        custos: { frete: 400, maoObra: 600 }, controleInterno: { custoInternoTotal: 500 } },
        itens: [{ descricao: 'Estrutura sintetica', tipoFiscal: 'cessao_estrutura_temporaria_3_05', origemCusto: 'misto',
            quantidade: 3, quantidadePropria: 2, quantidadeTerceirizada: 1, custoUnitario: 2000,
            custoTerceirizadoReal: 1200, periodoDias: 1, aplicarHonorarios: false, aplicarEncargos: false, aplicarINSS: false }],
        gerencial: { incluirMaoObra: true, dataFiscal: '2026-11-24', tipoDescontoFiscal: 'incondicional',
            coberturaFiscalConfirmada: false, justificativaFiscalSemTributos: '', tributos: [
                { nome: 'ISS ilustrativo', codigo: 'ISS', natureza: 'tributo', baseCalculo: 'manual', baseManual: 2000, percentual: 3, incidencia: 'aplica', tipoFiscalAlvo: 'cessao_estrutura_temporaria_3_05' },
                { nome: 'Encargo ilustrativo', codigo: 'OUTRO', natureza: 'encargo', baseCalculo: 'manual', baseManual: 1000, percentual: 2, incidencia: 'aplica' },
                { nome: 'IRRF ilustrativo', codigo: 'IRRF', natureza: 'retencao', baseCalculo: 'comercial', percentual: 1.5, incidencia: 'aplica' }
            ] } };
}
export async function bootstrap(adminUrl, issuer) {
    const admin = new pg.Client({ connectionString: adminUrl }); await admin.connect();
    try { await admin.query('CREATE DATABASE orc_synthetic'); } finally { await admin.end(); }
    const target = new URL(adminUrl); target.pathname = '/orc_synthetic';
    const owner = new pg.Pool({ connectionString: target.href, max: 4 });
    try {
        await owner.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
        for (const company of ['A', 'B']) {
            const initial = canonical(genesis(company));
            await owner.query('INSERT INTO orc.companies VALUES($1,$2,$3,$4)',
                [ids[company], `Empresa ficticia ${company}`, company === 'A' ? 'mtz-gerencial-v2-20:1' : null, initial]);
            await owner.query('INSERT INTO orc.state VALUES($1,0,$2)', [ids[company], initial]);
        }
        for (const name of ['alice', 'bob', 'carol', 'bea', 'viewer', 'denied', 'revoked']) {
            await owner.query('INSERT INTO orc.users(id,issuer,subject) VALUES($1,$2,$3)', [ids[name], issuer, 'synthetic-' + name]);
            const permissions = name === 'denied' ? [] : name === 'viewer' ? ['ler_propostas'] : ['ler_propostas', 'criar_proposta', 'editar_proposta'];
            await owner.query('INSERT INTO orc.members VALUES($1,$2,$3,$4)', [name === 'bea' ? ids.B : ids.A, ids[name], name !== 'revoked', permissions]);
        }
        const password = randomBytes(32).toString('hex');
        await owner.query(`ALTER ROLE orc_app LOGIN PASSWORD '${password}'`);
        const app = new URL(target); app.username = 'orc_app'; app.password = password;
        const pool = new pg.Pool({ connectionString: app.href, max: 10, connectionTimeoutMillis: 3000 });
        return { owner, pool };
    } catch (e) { await owner.end(); throw e; }
}
