import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
import { consultarNucleoFinanceiro, planejarFinanceiroTexto } from './financial-kernel-contracts.mjs';

const decisao = estado => JSON.stringify({ estado });
const MODALIDADES = Object.freeze(['receber', 'pagar', 'estornar_recebimento', 'estornar_pagamento',
    'conciliar_recebimento', 'desconciliar_recebimento', 'conciliar_pagamento', 'desconciliar_pagamento']);
const lista = v => Array.isArray(v) ? v : [];

// Capacidade de bootstrap INATIVA. Nao registra comandos e nao aceita provas da UI.
export function criarReconhecedorHistoricoFinanceiro(operacao) {
    if (typeof operacao !== 'string' || !MODALIDADES.includes(operacao)) throw new TypeError('OPERACAO_INVALIDA');
    return (snapshotTexto, dadosTexto, contexto) => {
        try {
            const snapshot = decodificarTextoEstrito(snapshotTexto);
            const s = snapshot.valor;
            let primarios;
            if (operacao === 'pagar') primarios = lista(s.contasPagar).flatMap(c => lista(c.parcelas).flatMap(p => lista(p.pagamentos)));
            else if (operacao === 'estornar_pagamento') primarios = lista(s.contasPagar).flatMap(c => lista(c.parcelas).flatMap(p => lista(p.estornos)));
            else if (operacao === 'receber') primarios = lista(s.locacoes).flatMap(l => lista(l.financeiro?.lancamentosRecebimentos)).filter(r => r.tipo !== 'estorno');
            else if (operacao === 'estornar_recebimento') primarios = lista(s.contasReceber).flatMap(c => lista(c.parcelas)
                .flatMap(p => lista(p.lancamentosFinanceiros))).filter(r => r.tipo === 'estorno');
            else {
                const pagar = operacao.endsWith('pagamento');
                const tipo = operacao.startsWith('desconciliar') ? 'desconsideracao' : 'conciliacao';
                primarios = lista(pagar ? s.conciliacoesPagamentosPagar : s.conciliacoesFinanceiras).filter(r => r.tipo === tipo);
            }
            const encontrados = primarios.filter(r => r?.operacaoId === contexto.operacaoId);
            const sinais = [...lista(s.logsAuditoria), ...lista(s.locacoes).flatMap(l => [
                ...lista(l.historicoAlteracoes), ...lista(l.financeiro?.lancamentosRecebimentos)]),
            ...lista(s.contasReceber).flatMap(c => [...lista(c.historico), ...lista(c.parcelas).flatMap(p => lista(p.lancamentosFinanceiros))]),
            ...lista(s.contasPagar).flatMap(c => [...lista(c.historico), ...lista(c.parcelas).flatMap(p => [
                ...lista(p.historico), ...lista(p.pagamentos), ...lista(p.estornos)])]),
            ...lista(s.conciliacoesFinanceiras), ...lista(s.conciliacoesPagamentosPagar)]
                .filter(r => r?.operacaoId === contexto.operacaoId);
            if (!encontrados.length) return decisao(sinais.length ? 'invalida' : 'nao_encontrada');
            if (encontrados.length !== 1) return decisao('invalida');
            const registro = encontrados[0];
            const timestamp = registro.criadoEm || registro.registradoEm || registro.data;
            const ator = registro.responsavel || registro.usuario;
            const dataReferencia = registro.dataReferencia || (typeof timestamp === 'string' ? timestamp.slice(0, 10) : '');
            // Revalida ambos os dominios, classificacoes e conciliacoes. A prova nao
            // e a presenca de um registro: o planejador reconcilia toda a operacao.
            for (const dominio of ['receber', 'pagar', 'classificacoes', 'conciliacoes']) {
                const r = consultarNucleoFinanceiro(dominio, snapshot.texto, dataReferencia);
                if (!r.ok || r.resultadoTexto !== 'true') return decisao('invalida');
            }
            if (ator !== contexto.atorReferencia) return decisao('conflito');
            const plano = planejarFinanceiroTexto(operacao, snapshot.texto, dadosTexto,
                JSON.stringify({ operacaoId: contexto.operacaoId, atorReferencia: contexto.atorReferencia, timestamp }));
            if (!plano.ok || !plano.idempotente || plano.snapshotTexto !== snapshot.texto) return decisao('invalida');
            const id = registro.id;
            if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id)))) return decisao('invalida');
            const referencia = registro.pagamentoReferencia || registro.estornoPagamentoReferencia
                || registro.conciliacaoPagamentoPagarReferencia || registro.conciliacaoReferencia
                || registro.lancamentoReferencia || `lancamento:${encodeURIComponent(JSON.stringify([typeof id, id]))}`;
            return JSON.stringify({ estado: 'comprovada', operacaoId: contexto.operacaoId, tipo: contexto.tipo,
                atorReferencia: contexto.atorReferencia, assinaturaRequisicao: contexto.assinaturaRequisicao,
                assinaturaHistorica: registro.assinaturaPlano, operacaoReferencia: referencia, snapshotTexto: snapshot.texto });
        } catch (_erro) { return decisao('invalida'); }
    };
}
