// === SISTEMA DE SINCRONIZAÇÃO SEGURA V2 ===

// Backup de emergência antes de sobrescrever dados
function criarBackupEmergencia() {
    const timestamp = new Date().toISOString();
    const backup = {
        data: timestamp,
        locadores, pecas, locacoes, devolucoes, tipos, config
    };
    localStorage.setItem('mtzBackupEmergencia', JSON.stringify(backup));
    console.log('✅ Backup de emergência criado:', timestamp);
    return backup;
}

// Sincronização com proteção contra perda de dados
async function sincronizar(modo) {
    if (!navigator.onLine) {
        updStatus('offline');
        return;
    }

    updStatus('saving');

    try {
        if (modo === 'carregar') {
            // Carregar dados da nuvem
            const response = await fetch(`${API_URL}?action=carregar`);
            const texto = await response.text();

            // Validação de resposta
            if (texto.startsWith('<')) {
                console.warn('⚠️ Resposta inválida do servidor');
                updStatus('offline');
                return;
            }

            const dadosNuvem = JSON.parse(texto);

            // Verificar se há dados locais
            const temDadosLocais = locadores.length > 0 || pecas.length > 0 || locacoes.length > 0;

            if (temDadosLocais) {
                // Detectar conflito de timestamps
                const timestampLocal = localStorage.getItem('mtzUltimaEdicao') || 0;
                const timestampNuvem = dadosNuvem.ultimaEdicao || 0;

                console.log('📅 Local:', new Date(Number(timestampLocal)).toLocaleString());
                console.log('☁️ Nuvem:', new Date(Number(timestampNuvem)).toLocaleString());

                // Se nuvem for mais recente, perguntar
                if (timestampNuvem > timestampLocal) {
                    const confirmar = confirm(
                        '⚠️ ATENÇÃO: Dados na nuvem são mais recentes!\n\n' +
                        `📅 Seus dados locais: ${new Date(Number(timestampLocal)).toLocaleString()}\n` +
                        `☁️ Dados na nuvem: ${new Date(Number(timestampNuvem)).toLocaleString()}\n\n` +
                        '✅ Clique OK para CARREGAR da nuvem (backup automático será criado)\n' +
                        '❌ Clique CANCELAR para manter seus dados locais'
                    );

                    if (!confirmar) {
                        console.log('🚫 Usuário cancelou sincronização');
                        updStatus('offline');
                        mostrarToast('Sincronização cancelada. Dados locais mantidos.');
                        return;
                    }

                    // Criar backup antes de sobrescrever
                    criarBackupEmergencia();
                }
            }

            // Carregar dados
            if (dadosNuvem.locadores) {
                locadores = dadosNuvem.locadores || [];
                pecas = dadosNuvem.pecas || [];
                locacoes = dadosNuvem.locacoes || [];
                devolucoes = dadosNuvem.devolucoes || [];
                tipos = dadosNuvem.tipos || [];
                config = dadosNuvem.config || config;

                salvarLocal();
                renderTudo();
                mostrarToast('✅ Dados carregados da nuvem!');
            }

        } else {
            // Enviar dados para nuvem
            const timestamp = Date.now();
            const dadosParaEnviar = {
                locadores, pecas, locacoes, devolucoes, tipos, config,
                ultimaEdicao: timestamp
            };

            localStorage.setItem('mtzUltimaEdicao', timestamp.toString());

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    dados: JSON.stringify(dadosParaEnviar)
                })
            });

            if (response.ok) {
                mostrarToast('☁️ Dados salvos na nuvem!');
                console.log('✅ Sincronização concluída:', new Date(timestamp).toLocaleString());
            }
        }

        updStatus('online');

    } catch (erro) {
        console.error('❌ Erro na sincronização:', erro);
        updStatus('offline');
        mostrarToast('⚠️ Erro ao sincronizar. Dados salvos localmente.');
    }
}

// Backup automático diário
function iniciarBackupAutomatico() {
    const ultimoBackup = localStorage.getItem('mtzUltimoBackupAuto');
    const agora = Date.now();
    const umDia = 24 * 60 * 60 * 1000;

    if (!ultimoBackup || (agora - Number(ultimoBackup)) > umDia) {
        const backup = {
            data: new Date().toISOString(),
            versao: 'V11',
            locadores, pecas, locacoes, devolucoes, tipos, config
        };

        localStorage.setItem('mtzBackupAutomatico', JSON.stringify(backup));
        localStorage.setItem('mtzUltimoBackupAuto', agora.toString());
        
        console.log('💾 Backup automático criado:', new Date().toLocaleString());
    }
}

// Restaurar backup de emergência
function restaurarBackupEmergencia() {
    const backup = localStorage.getItem('mtzBackupEmergencia');
    if (!backup) {
        alert('❌ Nenhum backup de emergência encontrado.');
        return;
    }

    const confirmar = confirm(
        '⚠️ Deseja restaurar o BACKUP DE EMERGÊNCIA?\n\n' +
        'Isso irá substituir todos os dados atuais.'
    );

    if (confirmar) {
        const dados = JSON.parse(backup);
        locadores = dados.locadores || [];
        pecas = dados.pecas || [];
        locacoes = dados.locacoes || [];
        devolucoes = dados.devolucoes || [];
        tipos = dados.tipos || [];
        config = dados.config || config;

        salvarLocal();
        renderTudo();
        mostrarToast('✅ Backup de emergência restaurado!');
        console.log('✅ Dados restaurados de:', dados.data);
    }
}

// Ver informações de backup
function verInfoBackup() {
    const backup = localStorage.getItem('mtzBackupEmergencia');
    const backupAuto = localStorage.getItem('mtzBackupAutomatico');
    
    let msg = '📊 INFORMAÇÕES DE BACKUP\n\n';
    
    if (backup) {
        const dados = JSON.parse(backup);
        msg += `🆘 Backup de Emergência:\n`;
        msg += `   Data: ${new Date(dados.data).toLocaleString()}\n`;
        msg += `   Registros: ${dados.locadores?.length || 0} clientes, ${dados.locacoes?.length || 0} locações\n\n`;
    } else {
        msg += '❌ Nenhum backup de emergência\n\n';
    }
    
    if (backupAuto) {
        const dados = JSON.parse(backupAuto);
        msg += `💾 Backup Automático:\n`;
        msg += `   Data: ${new Date(dados.data).toLocaleString()}\n`;
    } else {
        msg += '❌ Nenhum backup automático';
    }
    
    alert(msg);
}

    
    // === SALVAR COM PROTEÇÃO CONTRA ESTOURO ===
function salvarLocal() {
    cacheDisponibilidade = null;
    try {
       const dados = {
    versao: '11.0',
    data: new Date().toISOString(),
    locadores,
    pecas,
    locacoes,
    devolucoes,
    tipos,
    config,
    logsAuditoria,
    modelosChecklist,
    checklistsGerados
};

        const json = JSON.stringify(dados);
        const tamanhoKB = (new Blob([json]).size / 1024).toFixed(2);
        const tamanhoMB = (tamanhoKB / 1024).toFixed(2);

        console.log(`💾 Salvando ${tamanhoKB} KB no localStorage...`);

        // Verificar se está próximo do limite (5MB = 5120 KB)
        if (parseFloat(tamanhoKB) > 4500) {
            console.warn(`⚠️ ALERTA: LocalStorage usando ${tamanhoMB} MB de 5 MB!`);
            mostrarToast(`⚠️ Armazenamento em ${Math.round((tamanhoKB/5120)*100)}%! Faça backup e arquive dados antigos.`, 'erro');
        }

        localStorage.setItem('mtzBackup', json);
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

        // Outros erros
        alert('❌ Erro ao salvar dados: ' + erro.message);
        return false;
    }
}

    // === CARREGAR COM VALIDAÇÃO E RECUPERAÇÃO ===
function carregarLocal() {
    try {
        const json = localStorage.getItem('mtzBackup');
        
        if (!json) {
            console.log('📭 Nenhum dado local encontrado (primeira vez)');
            return;
        }

        const dados = JSON.parse(json);

        // Validação de integridade
        if (!dados.locadores || !Array.isArray(dados.locadores)) {
            throw new Error('Dados corrompidos: estrutura inválida');
        }

        // Carregar dados
        locadores = dados.locadores || [];
        pecas = dados.pecas || [];
        locacoes = dados.locacoes || [];
        devolucoes = dados.devolucoes || [];
        tipos = dados.tipos || [];
        config = dados.config || config;
        logsAuditoria = dados.logsAuditoria || [];
        modelosChecklist = dados.modelosChecklist || [];
        checklistsGerados = dados.checklistsGerados || [];


        const tamanhoKB = (new Blob([json]).size / 1024).toFixed(2);
        
        console.log('✅ Dados locais carregados:', {
            tamanho: `${tamanhoKB} KB`,
            clientes: locadores.length,
            itens: pecas.length,
            locacoes: locacoes.length,
            versao: dados.versao || 'antiga'
        });

        // Alerta se estiver usando mais de 80% do storage
        if (parseFloat(tamanhoKB) > 4000) {
            console.warn('⚠️ LocalStorage usando mais de 80%');
        }

    } catch (erro) {
        console.error('❌ Erro ao carregar dados:', erro);
        
        // Tentar recuperar backup automático
        const backupAuto = localStorage.getItem('mtzBackupAutomatico');
        const backupEmergencia = localStorage.getItem('mtzBackupEmergencia');
        
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
            
            // Resetar para dados vazios
            locadores = [];
            pecas = [];
            locacoes = [];
            devolucoes = [];
            tipos = [];
        }
    }
}

// === RECUPERAÇÃO AUTOMÁTICA ===
function tentarRecuperacaoAutomatica() {
    try {
        // Tentar backup de emergência primeiro
        let backup = localStorage.getItem('mtzBackupEmergencia');
        let fonte = 'Emergência';
        
        // Se não tiver, tentar backup automático
        if (!backup) {
            backup = localStorage.getItem('mtzBackupAutomatico');
            fonte = 'Automático';
        }
        
        if (!backup) {
            throw new Error('Nenhum backup disponível');
        }

        const dados = JSON.parse(backup);
        
        locadores = dados.locadores || [];
        pecas = dados.pecas || [];
        locacoes = dados.locacoes || [];
        devolucoes = dados.devolucoes || [];
        tipos = dados.tipos || [];
        config = dados.config || config;

        salvarLocal();
        renderTudo();
        
        alert(
            `✅ RECUPERAÇÃO BEM-SUCEDIDA!\n\n` +
            `Fonte: Backup ${fonte}\n` +
            `Data: ${new Date(dados.data).toLocaleString()}\n\n` +
            `Registros recuperados:\n` +
            `- ${locadores.length} clientes\n` +
            `- ${pecas.length} itens\n` +
            `- ${locacoes.length} locações\n\n` +
            `💡 Recomendação: Faça um backup JSON agora!`
        );
        
        console.log('✅ Dados recuperados de:', dados.data);
        
    } catch (erro) {
        alert('❌ Falha na recuperação automática: ' + erro.message);
    }
}
