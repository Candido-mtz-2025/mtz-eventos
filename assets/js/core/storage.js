// === ARMAZENAMENTO LOCAL E SINCRONIZACAO ===
const STORAGE_KEY = 'mtzBackup';
const STORAGE_EDIT_KEY = 'mtzUltimaEdicao';
const STORAGE_BACKUP_EMERGENCIA = 'mtzBackupEmergencia';
const STORAGE_BACKUP_AUTO = 'mtzBackupAutomatico';
const STORAGE_BACKUP_AUTO_TS = 'mtzUltimoBackupAuto';
const STORAGE_VERSION = '11.1';
const SYNC_TIMEOUT_MS = 15000;

let sincronizacaoEmAndamento = false;
let sincronizacaoPendente = null;

function gerarSnapshotDadosSistema() {
    return {
        locadores: Array.isArray(locadores) ? locadores : [],
        pecas: Array.isArray(pecas) ? pecas : [],
        locacoes: Array.isArray(locacoes) ? locacoes : [],
        devolucoes: Array.isArray(devolucoes) ? devolucoes : [],
        tipos: Array.isArray(tipos) ? tipos : [],
        config: config && typeof config === 'object' ? config : {},
        logsAuditoria: Array.isArray(logsAuditoria) ? logsAuditoria : [],
        modelosChecklist: Array.isArray(modelosChecklist) ? modelosChecklist : [],
        checklistsGerados: Array.isArray(checklistsGerados) ? checklistsGerados : [],
        checklistMontagem: Array.isArray(checklistMontagem) ? checklistMontagem : [],
        checklistConferencia: checklistConferencia && typeof checklistConferencia === 'object' ? checklistConferencia : {},
        checklistEtapasMontagem: Array.isArray(checklistEtapasMontagem) ? checklistEtapasMontagem : []
    };
}

function aplicarDadosSistema(dados = {}, opcoes = {}) {
    const manterConfigAtual = !!opcoes.manterConfigAtual;
    const baseConfig = manterConfigAtual ? (config || {}) : { rodape: 'MTZ Eventos', tel: '', email: '', logo: '', emailsPermitidos: '', adminEmails: '' };
    const configEntrada = dados.config && typeof dados.config === 'object' ? dados.config : {};

    locadores = Array.isArray(dados.locadores) ? dados.locadores : [];
    pecas = Array.isArray(dados.pecas) ? dados.pecas : [];
    locacoes = Array.isArray(dados.locacoes) ? dados.locacoes : [];
    devolucoes = Array.isArray(dados.devolucoes) ? dados.devolucoes : [];
    tipos = Array.isArray(dados.tipos) ? dados.tipos : [];
    config = { ...baseConfig, ...configEntrada };
    logsAuditoria = Array.isArray(dados.logsAuditoria) ? dados.logsAuditoria : [];
    modelosChecklist = Array.isArray(dados.modelosChecklist) ? dados.modelosChecklist : [];
    checklistsGerados = Array.isArray(dados.checklistsGerados) ? dados.checklistsGerados : [];
    checklistMontagem = Array.isArray(dados.checklistMontagem) ? dados.checklistMontagem : [];
    checklistConferencia = dados.checklistConferencia && typeof dados.checklistConferencia === 'object'
        ? dados.checklistConferencia
        : {};
    checklistEtapasMontagem = Array.isArray(dados.checklistEtapasMontagem)
        ? dados.checklistEtapasMontagem
        : [];

    window.checklistMontagem = checklistMontagem;
    window.checklistConferencia = checklistConferencia;
    window.checklistEtapasMontagem = checklistEtapasMontagem;
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
    localStorage.removeItem(AUTH_MODE_KEY);
    updStatus('offline');

    if (typeof mostrarTelaSessaoExpirada === 'function') {
        mostrarTelaSessaoExpirada();
    }
    if (typeof atualizarStatusLogin === 'function') {
        atualizarStatusLogin('Sessão expirada. Entre novamente com Google.', 'warn');
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
        updStatus('offline');
        return;
    }

    const contexto = obterContextoSyncSeguro();
    if (!contexto.tokenValido) {
        updStatus('offline');
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

            aplicarDadosSistema(dadosNuvem, { manterConfigAtual: true });
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
    aplicarDadosSistema(dados, { manterConfigAtual: true });
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
        aplicarDadosSistema(dados, { manterConfigAtual: true });
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
            console.log('📭 Nenhum dado local encontrado (primeira vez)');
            return;
        }

        const dados = JSON.parse(json);
        if (!dados || typeof dados !== 'object') {
            throw new Error('Estrutura inválida de dados.');
        }

        aplicarDadosSistema(dados, { manterConfigAtual: true });

        const tamanhoKB = (new Blob([json]).size / 1024).toFixed(2);
        console.log('✅ Dados locais carregados:', {
            tamanho: `${tamanhoKB} KB`,
            clientes: locadores.length,
            itens: pecas.length,
            locacoes: locacoes.length,
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

            aplicarDadosSistema({}, { manterConfigAtual: false });
        }
    }
}

window.gerarSnapshotDadosSistema = gerarSnapshotDadosSistema;
window.aplicarDadosSistema = aplicarDadosSistema;
