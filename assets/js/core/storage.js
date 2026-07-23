// === ARMAZENAMENTO LOCAL E SINCRONIZACAO ===
const STORAGE_KEY = 'mtzBackup';
const STORAGE_EDIT_KEY = 'mtzUltimaEdicao';
const STORAGE_BACKUP_EMERGENCIA = 'mtzBackupEmergencia';
const STORAGE_BACKUP_AUTO = 'mtzBackupAutomatico';
const STORAGE_BACKUP_AUTO_TS = 'mtzUltimoBackupAuto';
const STORAGE_VERSION = window.SCHEMA_VERSION_V12 || '12.0';
const SYNC_TIMEOUT_MS = 15000;

let sincronizacaoEmAndamento = false;
let sincronizacaoPendente = null;

function gerarSnapshotDadosSistema() {
    return {
        locadores: Array.isArray(locadores) ? locadores : [],
        pecas: Array.isArray(pecas) ? pecas : [],
        locacoes: Array.isArray(locacoes) ? locacoes : [],
        propostas: Array.isArray(propostas) ? propostas : [],
        devolucoes: Array.isArray(devolucoes) ? devolucoes : [],
        movimentacoesEstoque: Array.isArray(movimentacoesEstoque) ? movimentacoesEstoque : [],
        transportes: Array.isArray(transportes) ? transportes : [],
        tipos: Array.isArray(tipos) ? tipos : [],
        usuarios: Array.isArray(usuarios) ? usuarios : [],
        config: config && typeof config === 'object' ? config : {},
        logsAuditoria: Array.isArray(logsAuditoria) ? logsAuditoria : [],
        modelosChecklist: Array.isArray(modelosChecklist) ? modelosChecklist : [],
        checklistsGerados: Array.isArray(checklistsGerados) ? checklistsGerados : [],
        checklistMontagem: Array.isArray(checklistMontagem) ? checklistMontagem : [],
        checklistConferencia: checklistConferencia && typeof checklistConferencia === 'object' ? checklistConferencia : {},
        checklistEtapasMontagem: Array.isArray(checklistEtapasMontagem) ? checklistEtapasMontagem : []
    };
}

function registrarLogsMigracaoV12(logs = [], metadados = {}) {
    if (!Array.isArray(logs) || logs.length === 0) return;

    const timestampIso = new Date().toISOString();
    logs.forEach((descricao) => {
        logsAuditoria.unshift({
            id: Date.now() + Math.floor(Math.random() * 1000),
            timestamp: timestampIso,
            data: new Date(timestampIso).toLocaleString('pt-BR'),
            tipo: 'sistema',
            acao: 'migracao',
            descricao,
            usuario: localStorage.getItem('usuarioEmail') || 'Offline',
            dados: {
                origem: metadados.origem || 'desconhecida',
                versaoOrigem: metadados.versaoOrigem || 'sem-versao',
                versaoDestino: metadados.versaoDestino || STORAGE_VERSION
            }
        });
    });

    if (logsAuditoria.length > 1000) {
        logsAuditoria = logsAuditoria.slice(0, 1000);
    }
}

function aplicarDadosSistema(dados = {}, opcoes = {}) {
    const manterConfigAtual = !!opcoes.manterConfigAtual;
    const origemCarga = opcoes.origem || 'desconhecida';
    const baseConfig = manterConfigAtual
        ? (config || {})
        : {
            rodape: 'MTZ Eventos',
            tel: '',
            email: '',
            logo: '',
            emailsPermitidos: '',
            adminEmails: '',
            valorKmFretePadrao: 0,
            padroesOrcamento: null,
            categoriasOrcamento: null,
            perfilFiscalEmpresa: {
                regimeTributario: '',
                cnpj: '',
                inscricaoMunicipal: '',
                municipioEstabelecimento: '',
                ufEstabelecimento: '',
                cnaes: [],
                validadoPorContador: false,
                responsavelValidacao: '',
                dataValidacao: '',
                vigenciaInicio: '',
                observacoes: ''
            }
        };

    const resultadoMigracao = typeof migrarDadosParaV12 === 'function'
        ? migrarDadosParaV12(dados, { origem: origemCarga })
        : {
            dadosMigrados: dados,
            houveMudanca: false,
            logs: [],
            versaoOrigem: String(dados?.versao || 'sem-versao'),
            versaoDestino: STORAGE_VERSION
        };

    const dadosNormalizados = resultadoMigracao?.dadosMigrados || dados || {};
    const configEntrada = dadosNormalizados.config && typeof dadosNormalizados.config === 'object'
        ? dadosNormalizados.config
        : {};

    locadores = Array.isArray(dadosNormalizados.locadores) ? dadosNormalizados.locadores : [];
    pecas = Array.isArray(dadosNormalizados.pecas) ? dadosNormalizados.pecas : [];
    locacoes = Array.isArray(dadosNormalizados.locacoes) ? dadosNormalizados.locacoes : [];
    propostas = Array.isArray(dadosNormalizados.propostas) ? dadosNormalizados.propostas : [];
    devolucoes = Array.isArray(dadosNormalizados.devolucoes) ? dadosNormalizados.devolucoes : [];
    movimentacoesEstoque = Array.isArray(dadosNormalizados.movimentacoesEstoque) ? dadosNormalizados.movimentacoesEstoque : [];
    transportes = Array.isArray(dadosNormalizados.transportes) ? dadosNormalizados.transportes : [];
    tipos = Array.isArray(dadosNormalizados.tipos) ? dadosNormalizados.tipos : [];
    usuarios = Array.isArray(dadosNormalizados.usuarios) ? dadosNormalizados.usuarios : [];
    config = { ...baseConfig, ...configEntrada };
    config.schemaVersion = STORAGE_VERSION;
    logsAuditoria = Array.isArray(dadosNormalizados.logsAuditoria) ? dadosNormalizados.logsAuditoria : [];
    modelosChecklist = Array.isArray(dadosNormalizados.modelosChecklist) ? dadosNormalizados.modelosChecklist : [];
    checklistsGerados = Array.isArray(dadosNormalizados.checklistsGerados) ? dadosNormalizados.checklistsGerados : [];
    checklistMontagem = Array.isArray(dadosNormalizados.checklistMontagem) ? dadosNormalizados.checklistMontagem : [];
    checklistConferencia = dadosNormalizados.checklistConferencia && typeof dadosNormalizados.checklistConferencia === 'object'
        ? dadosNormalizados.checklistConferencia
        : {};
    checklistEtapasMontagem = Array.isArray(dadosNormalizados.checklistEtapasMontagem)
        ? dadosNormalizados.checklistEtapasMontagem
        : [];
    window.movimentacoesEstoque = movimentacoesEstoque;

    if (resultadoMigracao?.houveMudanca) {
        registrarLogsMigracaoV12(resultadoMigracao.logs || [], {
            origem: origemCarga,
            versaoOrigem: resultadoMigracao.versaoOrigem,
            versaoDestino: resultadoMigracao.versaoDestino
        });
    }

    window.__mtzUltimaMigracaoV12 = {
        houveMudanca: !!resultadoMigracao?.houveMudanca,
        logs: Array.isArray(resultadoMigracao?.logs) ? resultadoMigracao.logs : [],
        origem: origemCarga,
        versaoOrigem: resultadoMigracao?.versaoOrigem || String(dados?.versao || 'sem-versao'),
        versaoDestino: resultadoMigracao?.versaoDestino || STORAGE_VERSION,
        data: resultadoMigracao?.dataMigracao || new Date().toISOString()
    };

    window.checklistMontagem = checklistMontagem;
    window.checklistConferencia = checklistConferencia;
    window.checklistEtapasMontagem = checklistEtapasMontagem;
    window.transportes = transportes;
}

function obterContextoSyncSeguro() {
    const modo = String(localStorage.getItem(AUTH_MODE_KEY) || 'offline');
    const token = String(localStorage.getItem('gToken') || '');
    const tokenExpirado = typeof sessaoGoogleExpirada === 'function' ? sessaoGoogleExpirada() : false;
    const tokenValido = modo === 'google' && !!token && !tokenExpirado;

    return {
        modo,
        token,
        tokenExpirado,
        tokenValido,
        modoGoogle: modo === 'google'
    };
}

function montarUrlSyncComToken(urlBase, token) {
    if (!token) return urlBase;
    const separador = urlBase.includes('?') ? '&' : '?';
    return `${urlBase}${separador}token=${encodeURIComponent(token)}`;
}

async function fetchComTimeout(url, options = {}, timeoutMs = SYNC_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

function tratarSessaoInvalidaSincronizacao() {
    if (typeof limparSessaoGoogle === 'function') limparSessaoGoogle();
    updStatus('offline');

    if (typeof continuarComSessaoLocalGoogle === 'function') {
        continuarComSessaoLocalGoogle(
            'Sessão Google expirada. O app continua em modo local; reconecte ao Google para sincronizar.',
            { renderizar: false, toast: true }
        );
        return;
    }

    localStorage.setItem(AUTH_MODE_KEY, 'offline');
    if (typeof ocultarTelaSessaoExpirada === 'function') {
        ocultarTelaSessaoExpirada(false);
    }
    if (typeof renderUsuarioCabecalho === 'function') {
        renderUsuarioCabecalho();
    }
    if (typeof mostrarToast === 'function') {
        mostrarToast('Sessão Google expirada. App mantido em modo local.', 'info');
    }
}

function criarBackupEmergencia() {
    const timestamp = new Date().toISOString();
    const backup = {
        data: timestamp,
        versao: STORAGE_VERSION,
        ...gerarSnapshotDadosSistema()
    };

    localStorage.setItem(STORAGE_BACKUP_EMERGENCIA, JSON.stringify(backup));
    console.log('✅ Backup de emergência criado:', timestamp);
    return backup;
}

async function sincronizar(modo) {
    if (sincronizacaoEmAndamento) {
        sincronizacaoPendente = modo;
        return;
    }

    if (!navigator.onLine) {
        updStatus(typeof statusSessaoLocalAtual === 'function' ? statusSessaoLocalAtual() : 'offline');
        return;
    }

    const contexto = obterContextoSyncSeguro();
    if (!contexto.tokenValido) {
        updStatus(typeof statusSessaoLocalAtual === 'function' ? statusSessaoLocalAtual() : 'offline');
        if (contexto.modoGoogle && contexto.tokenExpirado) {
            tratarSessaoInvalidaSincronizacao();
        }
        return;
    }

    sincronizacaoEmAndamento = true;
    const urlSync = montarUrlSyncComToken(API_URL, contexto.token);
    updStatus('saving');

    try {
        if (modo === 'carregar') {
            const response = await fetchComTimeout(urlSync, { cache: 'no-store' });
            if (response.status === 401 || response.status === 403) {
                tratarSessaoInvalidaSincronizacao();
                return;
            }

            const texto = await response.text();
            if (!texto || texto.trim().startsWith('<')) {
                console.warn('⚠️ Resposta inválida da nuvem');
                updStatus('offline');
                return;
            }

            let dadosNuvem = JSON.parse(texto);
            if (dadosNuvem?.dados && typeof dadosNuvem.dados === 'object') {
                dadosNuvem = dadosNuvem.dados;
            }

            if (!dadosNuvem || typeof dadosNuvem !== 'object') {
                console.warn('⚠️ Nuvem vazia ou inválida');
                updStatus('offline');
                return;
            }

            const snapshotLocal = gerarSnapshotDadosSistema();
            const temDadosLocais =
                snapshotLocal.locadores.length > 0 ||
                snapshotLocal.pecas.length > 0 ||
                snapshotLocal.locacoes.length > 0 ||
                snapshotLocal.modelosChecklist.length > 0;

            if (temDadosLocais) {
                const timestampLocal = Number(localStorage.getItem(STORAGE_EDIT_KEY) || 0);
                const timestampNuvem = Number(dadosNuvem.ultimaEdicao || 0);

                console.log('📅 Local:', timestampLocal ? new Date(timestampLocal).toLocaleString() : 'sem data');
                console.log('☁️ Nuvem:', timestampNuvem ? new Date(timestampNuvem).toLocaleString() : 'sem data');

                if (timestampNuvem > timestampLocal) {
                    const confirmar = confirm(
                        '⚠️ Dados na nuvem são mais recentes.\n\n' +
                        `Local: ${timestampLocal ? new Date(timestampLocal).toLocaleString() : 'sem data'}\n` +
                        `Nuvem: ${new Date(timestampNuvem).toLocaleString()}\n\n` +
                        'OK = carregar da nuvem\n' +
                        'Cancelar = manter dados locais'
                    );

                    if (!confirmar) {
                        updStatus('offline');
                        mostrarToast('Dados locais mantidos.');
                        return;
                    }

                    criarBackupEmergencia();
                }
            }

            aplicarDadosSistema(dadosNuvem, { manterConfigAtual: true, origem: 'nuvem' });
            salvarLocal();
            renderTudo();
            mostrarToast('✅ Dados carregados da nuvem!');
        } else {
            const timestamp = Date.now();
            const dadosParaEnviar = {
                ...gerarSnapshotDadosSistema(),
                versao: STORAGE_VERSION,
                ultimaEdicao: timestamp
            };

            localStorage.setItem(STORAGE_EDIT_KEY, String(timestamp));

            const response = await fetchComTimeout(urlSync, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(dadosParaEnviar)
            });

            if (response.status === 401 || response.status === 403) {
                tratarSessaoInvalidaSincronizacao();
                return;
            }

            const resultado = await response.json();
            if (resultado.result === 'sucesso' || resultado.success === true) {
                mostrarToast('☁️ Dados salvos na nuvem!');
                console.log('✅ Sincronização concluída:', new Date(timestamp).toLocaleString());
            } else {
                console.warn('⚠️ Falha ao salvar na nuvem:', resultado.error || resultado.result);
                mostrarToast('⚠️ Erro ao salvar na nuvem.');
            }
        }

        updStatus('online');
    } catch (erro) {
        const mensagemErro = String(erro?.message || '').toLowerCase();
        const erroAbortado =
            erro?.name === 'AbortError' ||
            mensagemErro.includes('aborted') ||
            mensagemErro.includes('abort');

        updStatus('offline');

        if (erroAbortado) {
            console.warn('⚠️ Sincronização abortada por timeout/cancelamento. Mantendo modo local.');
            if (navigator.onLine) {
                mostrarToast('⚠️ Nuvem demorou para responder. Seguimos no modo local.', 'erro');
            }
            return;
        }

        console.error('❌ Erro na sincronização:', erro);
        mostrarToast('⚠️ Erro ao sincronizar. Dados salvos localmente.', 'erro');
    } finally {
        sincronizacaoEmAndamento = false;

        if (sincronizacaoPendente) {
            const proximoModo = sincronizacaoPendente;
            sincronizacaoPendente = null;
            setTimeout(() => sincronizar(proximoModo), 0);
        }
    }
}

function iniciarBackupAutomatico() {
    const ultimoBackup = localStorage.getItem(STORAGE_BACKUP_AUTO_TS);
    const agora = Date.now();
    const umDia = 24 * 60 * 60 * 1000;

    if (!ultimoBackup || (agora - Number(ultimoBackup)) > umDia) {
        const backup = {
            data: new Date().toISOString(),
            versao: STORAGE_VERSION,
            ...gerarSnapshotDadosSistema()
        };

        localStorage.setItem(STORAGE_BACKUP_AUTO, JSON.stringify(backup));
        localStorage.setItem(STORAGE_BACKUP_AUTO_TS, String(agora));
        console.log('💾 Backup automático criado:', new Date().toLocaleString());
    }
}

function restaurarBackupEmergencia() {
    const backup = localStorage.getItem(STORAGE_BACKUP_EMERGENCIA);
    if (!backup) {
        alert('❌ Nenhum backup de emergência encontrado.');
        return;
    }

    const confirmar = confirm(
        '⚠️ Deseja restaurar o BACKUP DE EMERGÊNCIA?\n\n' +
        'Isso irá substituir todos os dados atuais.'
    );

    if (!confirmar) return;

    const dados = JSON.parse(backup);
    aplicarDadosSistema(dados, { manterConfigAtual: true, origem: 'backup_emergencia' });
    salvarLocal();
    renderTudo();
    mostrarToast('✅ Backup de emergência restaurado!');
    console.log('✅ Dados restaurados de:', dados.data);
}

function verInfoBackup() {
    const backup = localStorage.getItem(STORAGE_BACKUP_EMERGENCIA);
    const backupAuto = localStorage.getItem(STORAGE_BACKUP_AUTO);

    let msg = '📊 INFORMAÇÕES DE BACKUP\n\n';

    if (backup) {
        const dados = JSON.parse(backup);
        msg += '🆘 Backup de Emergência:\n';
        msg += `   Data: ${new Date(dados.data).toLocaleString()}\n`;
        msg += `   Registros: ${dados.locadores?.length || 0} clientes, ${dados.locacoes?.length || 0} locações, ${dados.modelosChecklist?.length || 0} modelos\n\n`;
    } else {
        msg += '❌ Nenhum backup de emergência\n\n';
    }

    if (backupAuto) {
        const dados = JSON.parse(backupAuto);
        msg += '💾 Backup Automático:\n';
        msg += `   Data: ${new Date(dados.data).toLocaleString()}\n`;
        msg += `   Modelos: ${dados.modelosChecklist?.length || 0}\n`;
    } else {
        msg += '❌ Nenhum backup automático';
    }

    alert(msg);
}

function tentarRecuperacaoAutomatica() {
    try {
        let backup = localStorage.getItem(STORAGE_BACKUP_EMERGENCIA);
        let fonte = 'Emergência';

        if (!backup) {
            backup = localStorage.getItem(STORAGE_BACKUP_AUTO);
            fonte = 'Automático';
        }

        if (!backup) {
            throw new Error('Nenhum backup disponível');
        }

        const dados = JSON.parse(backup);
        aplicarDadosSistema(dados, {
            manterConfigAtual: true,
            origem: fonte === 'Emergência' ? 'backup_emergencia' : 'backup_automatico'
        });
        salvarLocal();
        renderTudo();

        alert(
            '✅ RECUPERAÇÃO BEM-SUCEDIDA!\n\n' +
            `Fonte: Backup ${fonte}\n` +
            `Data: ${new Date(dados.data).toLocaleString()}\n\n` +
            'Registros recuperados:\n' +
            `- ${locadores.length} clientes\n` +
            `- ${pecas.length} itens\n` +
            `- ${locacoes.length} locações\n` +
            `- ${modelosChecklist.length} modelos\n\n` +
            '💡 Recomendação: Faça um backup JSON agora!'
        );

        console.log('✅ Dados recuperados de:', dados.data);
    } catch (erro) {
        alert(`❌ Falha na recuperação automática: ${erro.message}`);
    }
}

function salvarLocal() {
    cacheDisponibilidade = null;
    try {
        const dados = {
            versao: STORAGE_VERSION,
            data: new Date().toISOString(),
            ...gerarSnapshotDadosSistema()
        };

        const json = JSON.stringify(dados);
        const tamanhoKB = (new Blob([json]).size / 1024).toFixed(2);
        const tamanhoMB = (Number(tamanhoKB) / 1024).toFixed(2);

        console.log(`💾 Salvando ${tamanhoKB} KB no localStorage...`);

        if (Number(tamanhoKB) > 4500) {
            console.warn(`⚠️ ALERTA: LocalStorage usando ${tamanhoMB} MB de 5 MB!`);
            mostrarToast(`⚠️ Armazenamento em ${Math.round((Number(tamanhoKB) / 5120) * 100)}%! Faça backup e arquive dados antigos.`, 'erro');
        }

        localStorage.setItem(STORAGE_KEY, json);
        localStorage.setItem(STORAGE_EDIT_KEY, String(Date.now()));
        return true;
    } catch (erro) {
        console.error('❌ Erro ao salvar:', erro);

        if (erro.name === 'QuotaExceededError') {
            alert(
                '🔴 ERRO CRÍTICO: LocalStorage cheio!\n\n' +
                'O sistema não pode salvar mais dados.\n\n' +
                'SOLUÇÕES:\n' +
                '1. Vá em Config → Baixar JSON (fazer backup)\n' +
                '2. Depois vá em Config → Arquivar (Limpeza)\n' +
                '3. Ou delete locações antigas manualmente\n\n' +
                '⚠️ Novos dados NÃO serão salvos até liberar espaço!'
            );
            return false;
        }

        alert(`❌ Erro ao salvar dados: ${erro.message}`);
        return false;
    }
}

function carregarLocal() {
    try {
        const json = localStorage.getItem(STORAGE_KEY);
        if (!json) {
            aplicarDadosSistema({}, { manterConfigAtual: false, origem: 'primeira_instalacao' });
            salvarLocal();
            console.log('📭 Estado inicial criado e persistido (primeira vez)');
            return;
        }

        const dados = JSON.parse(json);
        if (!dados || typeof dados !== 'object') {
            throw new Error('Estrutura inválida de dados.');
        }

        aplicarDadosSistema(dados, { manterConfigAtual: true, origem: 'localStorage' });

        if (window.__mtzUltimaMigracaoV12?.houveMudanca) {
            salvarLocal();
            console.log('🧱 Schema v12 aplicado e persistido no armazenamento local.');
        }

        const tamanhoKB = (new Blob([json]).size / 1024).toFixed(2);
        console.log('✅ Dados locais carregados:', {
            tamanho: `${tamanhoKB} KB`,
            clientes: locadores.length,
            itens: pecas.length,
            locacoes: locacoes.length,
            propostas: propostas.length,
            transportes: transportes.length,
            versao: dados.versao || 'antiga'
        });

        if (Number(tamanhoKB) > 4000) {
            console.warn('⚠️ LocalStorage usando mais de 80%');
        }
    } catch (erro) {
        console.error('❌ Erro ao carregar dados:', erro);

        const backupAuto = localStorage.getItem(STORAGE_BACKUP_AUTO);
        const backupEmergencia = localStorage.getItem(STORAGE_BACKUP_EMERGENCIA);

        if (backupEmergencia || backupAuto) {
            const restaurar = confirm(
                '⚠️ ERRO ao carregar dados locais!\n\n' +
                'Possível corrupção detectada.\n\n' +
                '✅ Backups disponíveis encontrados!\n\n' +
                'Deseja tentar restaurar automaticamente?'
            );

            if (restaurar) {
                tentarRecuperacaoAutomatica();
            }
        } else {
            alert(
                '🔴 ERRO CRÍTICO: Dados corrompidos e sem backup!\n\n' +
                'Causas possíveis:\n' +
                '- Fechamento abrupto do navegador\n' +
                '- Falta de espaço no disco\n' +
                '- Extensão do navegador interferindo\n\n' +
                'O sistema será reiniciado vazio.'
            );

            aplicarDadosSistema({}, { manterConfigAtual: false, origem: 'reset_erro_local' });
        }
    }
}

window.gerarSnapshotDadosSistema = gerarSnapshotDadosSistema;
window.aplicarDadosSistema = aplicarDadosSistema;
