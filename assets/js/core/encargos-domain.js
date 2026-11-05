(() => {
    'use strict';
    const entradas = new WeakSet();
    // localStorage nao oferece CAS e os demais escritores nao compartilham uma trava.
    // Estas capacidades nao podem ser habilitadas por campos de sessao ou dependencias da UI.
    const politicaSeguranca = Object.freeze({ persistenciaExclusiva: false, aprovacaoVerificavel: false });
    const acoes = ['cadastrar', 'editar', 'encaminhar', 'aprovar', 'rejeitar', 'revisar', 'cancelar'];
    const campos = ['tipo', 'titulo', 'beneficiarioReferencia', 'propostaReferencia', 'locacaoReferencia',
        'categoriaFinanceiraReferencia', 'centroCustoReferencia', 'modalidade', 'baseDescricao',
        'baseCentavos', 'percentualEscalado', 'valorCentavos', 'condicoes', 'vigenciaInicio', 'vigenciaFim'];
    const congelar = v => { if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); } return v; };
    const canonico = v => Array.isArray(v) ? v.map(canonico) : v && typeof v === 'object'
        ? Object.keys(v).sort().reduce((r, k) => { Object.defineProperty(r, k, { value: canonico(v[k]), enumerable: true }); return r; }, Object.create(null)) : v;
    const json = v => JSON.stringify(canonico(v));
    const texto = (v, n = 1000) => typeof v === 'string' && v.length <= n && !/[\u0000-\u001f]/.test(v);
    const email = v => texto(v, 300) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v === v.toLowerCase();
    const inteiro = v => Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
    function lerDecimal(valor, casas) {
        if (typeof valor !== 'string' || ![2, 4].includes(casas)
            || !new RegExp('^\\d+(?:[.,]\\d{1,' + casas + '})?$').test(valor)) return null;
        const partes = valor.split(/[.,]/), numero = BigInt(partes[0]) * (10n ** BigInt(casas))
            + BigInt((partes[1] || '').padEnd(casas, '0'));
        return numero <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(numero) : null;
    }
    function formatarDecimal(valor, casas) {
        if (!inteiro(valor) || ![2, 4].includes(casas)) return '';
        const s = String(valor).padStart(casas + 1, '0'); return s.slice(0, -casas) + ',' + s.slice(-casas);
    }
    const data = v => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v)
        && v.slice(0, 4) !== '0000' && !isNaN(Date.parse(v + 'T00:00:00Z'))
        && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
    const instante = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
        && !isNaN(Date.parse(v)) && new Date(v).toISOString() === v;
    function referencia(prefixo, id) {
        if (!(typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(id))
            && !(typeof id === 'number' && inteiro(id))) return '';
        return prefixo + ':' + encodeURIComponent(JSON.stringify([typeof id, id]));
    }
    function resolver(estado, colecao, prefixo, ref) {
        const encontrados = (estado[colecao] || []).filter(r => referencia(prefixo, r.id) === ref);
        return encontrados.length === 1 ? encontrados[0] : null;
    }
    function seguro(v) {
        if (v === null || typeof v === 'boolean' || typeof v === 'string') return true;
        if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER && !Object.is(v, -0);
        if (!v || typeof v !== 'object') return false;
        return Object.keys(v).every(k => !['__proto__', 'prototype', 'constructor'].includes(k) && seguro(v[k]));
    }
    function dadosValidos(d) {
        if (!d || Array.isArray(d) || Object.keys(d).length !== campos.length || !campos.every(k => Object.hasOwn(d, k))) return false;
        if (!['imposto', 'comissao', 'bv', 'bonificacao'].includes(d.tipo) || !texto(d.titulo, 200) || !d.titulo.trim()
            || !['fixa', 'percentual'].includes(d.modalidade) || !texto(d.baseDescricao) || !d.baseDescricao.trim()
            || !texto(d.condicoes, 2000) || !d.condicoes.trim() || !data(d.vigenciaInicio)
            || (d.vigenciaFim !== '' && (!data(d.vigenciaFim) || d.vigenciaFim < d.vigenciaInicio))
            || !['beneficiarioReferencia', 'propostaReferencia', 'locacaoReferencia', 'categoriaFinanceiraReferencia', 'centroCustoReferencia'].every(k => texto(d[k], 1500))
            || !inteiro(d.valorCentavos) || !inteiro(d.baseCentavos) || !inteiro(d.percentualEscalado)) return false;
        if (d.modalidade === 'fixa') return d.valorCentavos > 0 && d.baseCentavos === 0 && d.percentualEscalado === 0;
        const valor = (BigInt(d.baseCentavos) * BigInt(d.percentualEscalado) + 500000n) / 1000000n;
        return d.baseCentavos > 0 && d.percentualEscalado > 0 && d.percentualEscalado <= 1000000
            && valor <= BigInt(Number.MAX_SAFE_INTEGER) && BigInt(d.valorCentavos) === valor;
    }
    function vinculos(estado, d, ativos) {
        const specs = [['beneficiarioReferencia', 'fornecedores', 'fornecedor', 'fornecedorReferencia', 'ativa'],
            ['propostaReferencia', 'propostas', 'proposta'], ['locacaoReferencia', 'locacoes', 'locacao'],
            ['categoriaFinanceiraReferencia', 'categoriasFinanceiras', 'categoria-financeira', 'categoriaFinanceiraReferencia', 'ativa'],
            ['centroCustoReferencia', 'centrosCusto', 'centro-custo', 'centroCustoReferencia', 'ativo']];
        const resultado = {};
        for (const [campo, colecao, prefixo, chave, situacao] of specs) {
            if (!d[campo]) { if (campo === 'beneficiarioReferencia' && d.tipo !== 'imposto') return null; continue; }
            const r = resolver(estado, colecao, prefixo, d[campo]);
            if (!r || (chave && r[chave] !== d[campo]) || (ativos && situacao && r.situacao !== situacao)
                || (ativos && campo === 'categoriaFinanceiraReferencia' && !['despesa', 'ambas'].includes(r.naturezaPermitida))) return null;
            resultado[campo] = { referencia: d[campo], id: r.id, nome: r.nome || r.codigo || '', codigo: r.codigo || '' };
            if (ativos && campo === 'centroCustoReferencia' && ((r.propostaReferencia && r.propostaReferencia !== d.propostaReferencia)
                || (r.locacaoReferencia && r.locacaoReferencia !== d.locacaoReferencia))) return null;
        }
        if (ativos && d.propostaReferencia && d.locacaoReferencia) {
            const l = resolver(estado, 'locacoes', 'locacao', d.locacaoReferencia);
            if (l?.propostaReferencia !== d.propostaReferencia && l?.conversaoProposta?.propostaReferencia !== d.propostaReferencia) return null;
        }
        return resultado;
    }
    function criarEntrada(acao, id, ref, versaoEsperada, dadosJson, motivo, operacaoId, atualizadoEm,
        dataReferencia, responsavel, persistenciaVersao, ultimaEdicao) {
        if (![acao, ref, dadosJson, motivo, operacaoId, atualizadoEm, dataReferencia, responsavel, persistenciaVersao].every(v => typeof v === 'string')
            || !referencia('encargo', id) || !acoes.includes(acao) || !inteiro(versaoEsperada) || !inteiro(ultimaEdicao)
            || !email(responsavel) || !texto(motivo) || !motivo.trim() || !instante(atualizadoEm) || !data(dataReferencia)
            || !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(operacaoId) || !texto(persistenciaVersao, 40)) return null;
        let dados; try { dados = JSON.parse(dadosJson); } catch (_) { return null; }
        if (!seguro(dados) || (['cadastrar', 'editar'].includes(acao) ? !dadosValidos(dados) : dados !== null)) return null;
        const entrada = congelar({ acao, id, referencia: ref, versaoEsperada, dados, motivo, operacaoId, atualizadoEm,
            dataReferencia, responsavel, persistencia: { versao: persistenciaVersao, data: atualizadoEm, ultimaEdicao } });
        entradas.add(entrada); return entrada;
    }
    function plano(e) {
        return { acao: e.acao, id: e.id, referencia: referencia('encargo', e.id), versaoEsperada: e.versaoEsperada,
            dados: e.dados, motivo: e.motivo, operacaoId: e.operacaoId, atualizadoEm: e.atualizadoEm, responsavel: e.responsavel };
    }
    function transicao(atual, p, estado, validarAtivos, snapshotHistorico) {
        if (validarAtivos && ['aprovar', 'rejeitar'].includes(p.acao) && !politicaSeguranca.aprovacaoVerificavel) return null;
        const criar = p.acao === 'cadastrar';
        if (Object.keys(p).sort().join('|') !== ['acao', 'id', 'referencia', 'versaoEsperada', 'dados', 'motivo', 'operacaoId', 'atualizadoEm', 'responsavel'].sort().join('|')
            || !/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(p.operacaoId)
            || !acoes.includes(p.acao) || !email(p.responsavel) || !instante(p.atualizadoEm) || !texto(p.motivo) || !p.motivo.trim()
            || p.referencia !== referencia('encargo', p.id) || (!criar && (!atual || atual.id !== p.id || atual.versao !== p.versaoEsperada
                || p.atualizadoEm <= atual.atualizadoEm)) || (criar && (atual || p.versaoEsperada !== 0))) return null;
        const r = atual ? JSON.parse(JSON.stringify(atual)) : { id: p.id, encargoReferencia: p.referencia, versao: 0,
            criadoEm: p.atualizadoEm, solicitante: p.responsavel, snapshotsAprovados: [] };
        if (['cadastrar', 'editar'].includes(p.acao)) {
            if ((!criar && r.situacao !== 'rascunho') || !dadosValidos(p.dados)) return null;
            const s = vinculos(estado, p.dados, validarAtivos); if (!s) return null;
            if (!validarAtivos) {
                if (!snapshotHistorico || Object.keys(s).sort().join('|') !== Object.keys(snapshotHistorico).sort().join('|')) return null;
                for (const k of Object.keys(s)) {
                    const h = snapshotHistorico[k];
                    if (!h || h.id !== s[k].id || h.referencia !== s[k].referencia || !texto(h.nome, 500)
                        || !texto(h.codigo, 500) || Object.keys(h).sort().join('|') !== 'codigo|id|nome|referencia') return null;
                }
            }
            r.dados = JSON.parse(JSON.stringify(p.dados)); r.vinculosSnapshot = validarAtivos ? s : snapshotHistorico; r.situacao = 'rascunho';
            r.solicitante = p.responsavel;
        } else {
            if (p.dados !== null) return null;
            if (p.acao === 'encaminhar') {
                if (r.situacao !== 'rascunho' || (validarAtivos && !vinculos(estado, r.dados, true))) return null;
                r.situacao = 'aguardando_aprovacao'; r.solicitante = p.responsavel;
            } else if (p.acao === 'aprovar' || p.acao === 'rejeitar') {
                if (r.situacao !== 'aguardando_aprovacao' || r.solicitante === p.responsavel
                    || (validarAtivos && !vinculos(estado, r.dados, true))) return null;
                r.situacao = p.acao === 'aprovar' ? 'aprovado' : 'rejeitado';
                if (p.acao === 'aprovar') r.snapshotsAprovados.push({ versao: r.versao + 1, dados: r.dados,
                    vinculosSnapshot: r.vinculosSnapshot, solicitante: r.solicitante, aprovador: p.responsavel,
                    data: p.atualizadoEm, operacaoId: p.operacaoId });
            } else if (p.acao === 'revisar') {
                if (!['aprovado', 'rejeitado'].includes(r.situacao)) return null;
                r.situacao = 'rascunho'; r.solicitante = p.responsavel;
            } else if (p.acao === 'cancelar') {
                if (r.situacao === 'cancelado') return null;
                r.situacao = 'cancelado';
            }
        }
        r.versao++; r.atualizadoEm = p.atualizadoEm; r.responsavel = p.responsavel; r.operacaoId = p.operacaoId;
        return r;
    }
    function validarTexto(textoJson) {
        if (typeof textoJson !== 'string') return false;
        try {
            const estado = JSON.parse(textoJson);
            if (!estado || typeof estado !== 'object' || Array.isArray(estado)) return false;
            const registros = estado.encargosFinanceiros === undefined ? [] : estado.encargosFinanceiros;
            if (!Array.isArray(registros) || !seguro(registros) || !Array.isArray(estado.logsAuditoria)
                || !estado.logsAuditoria.filter(a => a?.origem === 'encargos_financeiros').every(seguro)) return false;
            const ids = new Set(), ops = new Set();
            for (const r of registros) {
                if (!r || !referencia('encargo', r.id) || r.encargoReferencia !== referencia('encargo', r.id)
                    || ids.has(r.encargoReferencia) || !Array.isArray(r.historico) || !r.historico.length) return false;
                ids.add(r.encargoReferencia); let anterior = null;
                for (const evento of r.historico) {
                    const p = evento.plano;
                    if (!p || p.id !== r.id || p.referencia !== r.encargoReferencia || ops.has(p.operacaoId)
                        || evento.assinaturaPlano !== 'encargo-v1:' + json(p)
                        || evento.assinaturaEvidencia !== 'encargo-evidencias-v1:' + json({ plano: p, vinculosSnapshot: evento.vinculosSnapshot })) return false;
                    ops.add(p.operacaoId);
                    const auditorias = estado.logsAuditoria.filter(a => a.operacaoId === p.operacaoId);
                    if (auditorias.length !== 1 || json(auditorias[0]) !== json({ ...evento, origem: 'encargos_financeiros',
                        id: 'auditoria-' + p.operacaoId, timestamp: p.atualizadoEm, usuario: p.responsavel })) return false;
                    const proximo = transicao(anterior, p, estado, false, evento.vinculosSnapshot); if (!proximo) return false;
                    if (json(proximo.vinculosSnapshot) !== json(evento.vinculosSnapshot)) return false;
                    // Nomes sao snapshots historicos: referencias permanecem reconciliadas, sem atualizar rotulos.
                    anterior = { ...proximo, vinculosSnapshot: evento.vinculosSnapshot };
                    for (const snap of anterior.snapshotsAprovados) {
                        const correspondente = r.snapshotsAprovados?.find(s => s.operacaoId === snap.operacaoId);
                        if (!correspondente || json(correspondente) !== json(snap)) return false;
                    }
                }
                for (const k of Object.keys(anterior)) if (json(r[k]) !== json(anterior[k])) return false;
            }
            return estado.logsAuditoria.filter(a => a.origem === 'encargos_financeiros').every(a => ops.has(a.operacaoId));
        } catch (_) { return false; }
    }
    function aplicar(estado, e, p, assinaturaPlano) {
        const atuais = (estado.encargosFinanceiros || []).filter(r => r.encargoReferencia === p.referencia);
        if (atuais.length > 1 || (e.acao === 'cadastrar' && atuais.length)) return null;
        const atual = atuais[0] || null, r = transicao(atual, p, estado, true); if (!r) return null;
        const evento = { operacaoId: e.operacaoId, plano: p, assinaturaPlano, vinculosSnapshot: r.vinculosSnapshot,
            assinaturaEvidencia: 'encargo-evidencias-v1:' + json({ plano: p, vinculosSnapshot: r.vinculosSnapshot }) };
        r.historico = [...(atual?.historico || []), evento];
        estado.encargosFinanceiros = [...(estado.encargosFinanceiros || []).filter(x => x !== atual), r];
        estado.logsAuditoria.push({ ...evento, origem: 'encargos_financeiros', id: 'auditoria-' + e.operacaoId,
            timestamp: e.atualizadoEm, usuario: e.responsavel });
        return { registro: r, assinaturaPlano, referencia: p.referencia };
    }
    function evidencia(estado, op) {
        const eventos = (estado.encargosFinanceiros || []).flatMap(r => r.historico.filter(h => h.operacaoId === op));
        return { completo: eventos.length === 1, estado: eventos.length ? 'encontrada' : 'nao_executada', evento: eventos[0] };
    }
    const apiInterna = Object.freeze({ criarEntrada, politicaSeguranca,
        aceita: e => entradas.has(e), referencia: id => referencia('encargo', id), plano,
        assinatura: p => 'encargo-v1:' + json(p), aplicar, evidencia, validarTexto,
        corresponde: (ev, p, e, assinatura) => ev.completo && ev.evento.assinaturaPlano === assinatura && json(ev.evento.plano) === json(p),
        resolver: (ref, estado) => { const r = (estado.encargosFinanceiros || []).filter(x => x.encargoReferencia === ref);
            return r.length === 1 ? { estado: 'encontrada', registro: r[0] } : { estado: 'ausente' }; },
        permissao: acao => ['aprovar', 'rejeitar'].includes(acao) ? 'aprovar_encargo_financeiro'
            : acao === 'cadastrar' ? 'cadastrar_encargo_financeiro' : 'editar_encargo_financeiro'
    });
    let entregue = false;
    Object.defineProperty(window, '__obterDominioEncargosTransacional', { configurable: true,
        value: () => { if (entregue) return null; entregue = true; return apiInterna; } });
    Object.defineProperty(window, 'EncargosFinanceiros', { value: Object.freeze({ criarEntrada, validarTexto, lerDecimal, formatarDecimal, politicaSeguranca,
        referencia: apiInterna.referencia, permissao: apiInterna.permissao }), configurable: false, writable: false });
})();
