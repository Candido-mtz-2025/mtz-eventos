// GERADO de migrations.js. Somente validacao pura; sem migracao ou I/O.
import { decodificarTextoEstrito } from './legacy-state-codec.mjs';
export const manifestoCatalogos = Object.freeze({
  "referenciaTipadaClassificacaoV12": "366a1731ddbee8b2c5fda13ee2ab4f8984068f725820b1067704ce3bb4900ed5",
  "referenciaTipadaVinculoClassificacaoV12": "89fecb840b86c6dbf6edd60239036ec1272209afa3a0fb57316083a5a5f89528",
  "instanteClassificacaoV12": "efcb87c8507166054c9502670f25a2808f2053bcfa7da4c252d39d418f236c05",
  "textoClassificacaoV12": "e6d94e06d900444106cc80765d290b94b86f185a3e090f04e3f4936c776bda18",
  "canonicalizarClassificacaoV12": "f54cc51ebc4e99b1b55ee401f3903a4dbcf24d996dd6d7e564f82b91d9f13452",
  "validarHistoricoClassificacaoV12": "9ba62a0f337f2ebc3f2aa1093d423687d04a75a1bfaf1b2083d3a379f1299ce3",
  "validarClassificacoesFinanceirasInternasV12": "f6e11c9ea3bb98efe8530754f73fa061d44a8effe0efac645723751fabfc73f0"
});
function referenciaTipadaClassificacaoV12(tipoEntidade, id) {
    const prefixo = tipoEntidade === 'categoria' ? 'categoria-financeira'
        : tipoEntidade === 'centro' ? 'centro-custo' : '';
    const tipo = typeof id;
    if (!prefixo
        || (tipo === 'string' && (!id || id !== id.trim() || id.length > 200))
        || (tipo === 'number' && (!Number.isSafeInteger(id) || Object.is(id, -0)))
        || !['string', 'number'].includes(tipo)) return '';
    return `${prefixo}:${encodeURIComponent(JSON.stringify([tipo, id]))}`;
}

function referenciaTipadaVinculoClassificacaoV12(prefixo, id) {
    const tipo = typeof id;
    if (!['proposta', 'locacao'].includes(prefixo)
        || (tipo === 'string' && (!id.trim() || id.length > 200))
        || (tipo === 'number' && (!Number.isFinite(id) || Object.is(id, -0)))
        || !['string', 'number'].includes(tipo)) return '';
    return `${prefixo}:${encodeURIComponent(JSON.stringify([tipo, id]))}`;
}

function instanteClassificacaoV12(valor) {
    if (typeof valor !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valor)) return false;
    const milissegundos = Date.parse(valor);
    return Number.isFinite(milissegundos) && new Date(milissegundos).toISOString() === valor;
}

function textoClassificacaoV12(valor, limite, obrigatorio = false) {
    if (typeof valor !== 'string' || valor !== valor.trim() || valor.length > limite
        || /[\u0000-\u001f\u007f]/.test(valor)) return false;
    return !obrigatorio || valor.length > 0;
}

function canonicalizarClassificacaoV12(valor) {
    if (Array.isArray(valor)) return valor.map(canonicalizarClassificacaoV12);
    if (!valor || typeof valor !== 'object') return valor;
    return Object.keys(valor).sort().reduce((resultado, chave) => {
        resultado[chave] = canonicalizarClassificacaoV12(valor[chave]);
        return resultado;
    }, {});
}

function validarHistoricoClassificacaoV12(registro, tipoEntidade, logsAuditoria) {
    if (!Array.isArray(registro.historico) || registro.historico.length < 1) return false;
    const referenciaChave = tipoEntidade === 'categoria'
        ? 'categoriaFinanceiraReferencia' : 'centroCustoReferencia';
    const referencia = registro[referenciaChave];
    const acoes = new Set(['cadastrar', 'editar', 'inativar', 'reativar']);
    const prefixoAcao = tipoEntidade === 'categoria'
        ? 'categoria_financeira_' : 'centro_financeiro_';
    const operacoes = new Set();
    let evidenciaFinal = null;
    for (const historico of registro.historico) {
        if (!historico || typeof historico !== 'object' || Array.isArray(historico)
            || typeof historico.id !== 'string' || !historico.id
            || typeof historico.operacaoId !== 'string'
            || !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(historico.operacaoId)
            || operacoes.has(historico.operacaoId)
            || typeof historico.acao !== 'string' || !historico.acao.startsWith(prefixoAcao)
            || !acoes.has(historico.acao.slice(prefixoAcao.length))
            || !instanteClassificacaoV12(historico.data)
            || !textoClassificacaoV12(historico.usuario, 300, true)
            || typeof historico.assinaturaPlano !== 'string'
            || !/^classificacao-financeira-v1:fnv1a64:[a-f0-9]{16}$/.test(
                historico.assinaturaPlano)
            || !historico.evidenciaOperacao
            || typeof historico.evidenciaOperacao !== 'object'
            || Array.isArray(historico.evidenciaOperacao)) return false;
        operacoes.add(historico.operacaoId);
        const evidencia = historico.evidenciaOperacao;
        if (evidencia.operacaoId !== historico.operacaoId
            || evidencia.assinaturaPlano !== historico.assinaturaPlano
            || evidencia.tipoEntidade !== tipoEntidade
            || !acoes.has(evidencia.acao)
            || historico.acao !== `${prefixoAcao}${evidencia.acao}`
            || !Object.is(evidencia.id, registro.id)
            || evidencia.referencia !== referencia
            || evidencia.criadoEm !== registro.criadoEm
            || evidencia.operacaoCriacaoId !== registro.operacaoId
            || evidencia.atualizadoEm !== historico.data
            || !instanteClassificacaoV12(evidencia.atualizadoEm)
            || !textoClassificacaoV12(evidencia.codigo, 50, true)
            || !textoClassificacaoV12(evidencia.nome, 200, true)
            || !textoClassificacaoV12(evidencia.responsavel, 300, true)) return false;
        if (tipoEntidade === 'categoria') {
            if (!['receita', 'despesa', 'ambas'].includes(evidencia.naturezaPermitida)
                || typeof evidencia.categoriaPaiReferencia !== 'string'
                || !['ativa', 'inativa'].includes(evidencia.situacao)) return false;
        } else if (!['administrativo', 'operacional', 'evento'].includes(evidencia.tipo)
            || typeof evidencia.propostaReferencia !== 'string'
            || typeof evidencia.locacaoReferencia !== 'string'
            || !['ativo', 'inativo'].includes(evidencia.situacao)) return false;
        const auditorias = logsAuditoria.filter((item) => item?.operacaoId === historico.operacaoId
            && item?.origem === 'classificacoes_financeiras');
        if (auditorias.length !== 1) return false;
        const auditoria = auditorias[0];
        if (auditoria.acao !== historico.acao
            || auditoria.timestamp !== historico.data
            || auditoria.data !== historico.data
            || auditoria.usuario !== historico.usuario
            || auditoria.assinaturaPlano !== historico.assinaturaPlano
            || JSON.stringify(canonicalizarClassificacaoV12(auditoria.evidenciaOperacao))
                !== JSON.stringify(canonicalizarClassificacaoV12(evidencia))) return false;
        evidenciaFinal = evidencia;
    }
    const historicoCriacao = registro.historico.filter((item) => (
        item.operacaoId === registro.operacaoId
        && item.acao === `${prefixoAcao}cadastrar`
    ));
    if (historicoCriacao.length !== 1 || !evidenciaFinal
        || evidenciaFinal.codigo !== registro.codigo
        || evidenciaFinal.nome !== registro.nome
        || evidenciaFinal.situacao !== registro.situacao
        || evidenciaFinal.atualizadoEm !== registro.atualizadoEm
        || evidenciaFinal.responsavel !== registro.responsavel) return false;
    if (tipoEntidade === 'categoria') {
        return evidenciaFinal.naturezaPermitida === registro.naturezaPermitida
            && evidenciaFinal.categoriaPaiReferencia === registro.categoriaPaiReferencia;
    }
    return evidenciaFinal.tipo === registro.tipo
        && evidenciaFinal.propostaReferencia === registro.propostaReferencia
        && evidenciaFinal.locacaoReferencia === registro.locacaoReferencia;
}

function validarClassificacoesFinanceirasInternasV12(estado) {
    if (!estado || typeof estado !== 'object' || Array.isArray(estado)
        || !Array.isArray(estado.categoriasFinanceiras)
        || !Array.isArray(estado.centrosCusto)
        || !Array.isArray(estado.propostas) || !Array.isArray(estado.locacoes)
        || !Array.isArray(estado.logsAuditoria)) {
        return { ok: false, codigo: 'CLASSIFICACOES_FINANCEIRAS_ESTRUTURA_INVALIDA' };
    }
    const registrosPorTipo = [
        ['categoria', estado.categoriasFinanceiras],
        ['centro', estado.centrosCusto]
    ];
    for (const [tipoEntidade, colecao] of registrosPorTipo) {
        const ids = new Set();
        const referencias = new Set();
        const codigos = new Set();
        for (const registro of colecao) {
            if (!registro || typeof registro !== 'object' || Array.isArray(registro)) {
                return { ok: false, codigo: 'CLASSIFICACAO_FINANCEIRA_REGISTRO_INVALIDO' };
            }
            const referenciaChave = tipoEntidade === 'categoria'
                ? 'categoriaFinanceiraReferencia' : 'centroCustoReferencia';
            const referencia = referenciaTipadaClassificacaoV12(tipoEntidade, registro.id);
            const idTipado = `${typeof registro.id}:${JSON.stringify(registro.id)}`;
            const codigo = typeof registro.codigo === 'string'
                ? registro.codigo.toLocaleLowerCase('pt-BR') : '';
            if (!referencia || registro[referenciaChave] !== referencia
                || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(registro.codigo || '')
                || !textoClassificacaoV12(registro.nome, 200, true)
                || !instanteClassificacaoV12(registro.criadoEm)
                || !instanteClassificacaoV12(registro.atualizadoEm)
                || Date.parse(registro.atualizadoEm) < Date.parse(registro.criadoEm)
                || !textoClassificacaoV12(registro.responsavel, 300, true)
                || typeof registro.operacaoId !== 'string'
                || !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(registro.operacaoId)
                || ids.has(idTipado) || referencias.has(referencia) || codigos.has(codigo)) {
                return { ok: false, codigo: 'CLASSIFICACAO_FINANCEIRA_IDENTIDADE_INVALIDA' };
            }
            if (tipoEntidade === 'categoria') {
                if (!['receita', 'despesa', 'ambas'].includes(registro.naturezaPermitida)
                    || !['ativa', 'inativa'].includes(registro.situacao)
                    || typeof registro.categoriaPaiReferencia !== 'string') {
                    return { ok: false, codigo: 'CATEGORIA_FINANCEIRA_INVALIDA' };
                }
            } else if (!['administrativo', 'operacional', 'evento'].includes(registro.tipo)
                || !['ativo', 'inativo'].includes(registro.situacao)
                || typeof registro.propostaReferencia !== 'string'
                || typeof registro.locacaoReferencia !== 'string') {
                return { ok: false, codigo: 'CENTRO_CUSTO_INVALIDO' };
            }
            if (!validarHistoricoClassificacaoV12(registro, tipoEntidade,
                estado.logsAuditoria)) {
                return { ok: false, codigo: 'CLASSIFICACAO_FINANCEIRA_HISTORICO_INVALIDO' };
            }
            ids.add(idTipado);
            referencias.add(referencia);
            codigos.add(codigo);
        }
    }
    const resolverCategoria = (referencia) => estado.categoriasFinanceiras.filter((item) => (
        item.categoriaFinanceiraReferencia === referencia
    ));
    for (const categoria of estado.categoriasFinanceiras) {
        if (!categoria.categoriaPaiReferencia) continue;
        const visitadas = new Set([categoria.categoriaFinanceiraReferencia]);
        let referenciaAtual = categoria.categoriaPaiReferencia;
        while (referenciaAtual) {
            const encontradas = resolverCategoria(referenciaAtual);
            if (encontradas.length !== 1 || visitadas.has(referenciaAtual)) {
                return { ok: false, codigo: 'CATEGORIA_FINANCEIRA_HIERARQUIA_INVALIDA' };
            }
            visitadas.add(referenciaAtual);
            referenciaAtual = encontradas[0].categoriaPaiReferencia;
        }
    }
    const vinculoUnico = (referencia, prefixo, colecao) => {
        if (referencia === '') return true;
        if (typeof referencia !== 'string') return false;
        return colecao.filter((registro) => (
            referenciaTipadaVinculoClassificacaoV12(prefixo, registro?.id) === referencia
        )).length === 1;
    };
    if (!estado.centrosCusto.every((centro) => (
        vinculoUnico(centro.propostaReferencia, 'proposta', estado.propostas)
        && vinculoUnico(centro.locacaoReferencia, 'locacao', estado.locacoes)
    ))) return { ok: false, codigo: 'CENTRO_CUSTO_VINCULO_INVALIDO' };
    const operacoesHistorico = new Set(estado.categoriasFinanceiras.concat(estado.centrosCusto)
        .flatMap((registro) => registro.historico.map((item) => item.operacaoId)));
    if (estado.logsAuditoria.some((item) => item?.origem === 'classificacoes_financeiras'
        && !operacoesHistorico.has(item.operacaoId))) {
        return { ok: false, codigo: 'CLASSIFICACAO_FINANCEIRA_AUDITORIA_ORFA' };
    }
    return { ok: true, codigo: 'SUCESSO' };
}
export function validarCatalogosRestauraveisTexto(texto) {
 try { return validarClassificacoesFinanceirasInternasV12(decodificarTextoEstrito(texto).valor).ok === true; } catch (_) { return false; }
}
