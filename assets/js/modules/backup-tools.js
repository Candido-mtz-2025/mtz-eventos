// Ferramentas de backup e limpeza
    function normalizarListaBackup(valor) {
        return Array.isArray(valor) ? valor : [];
    }

    function backupTemEstruturaMinima(dados) {
        if (!dados || typeof dados !== 'object') return false;
        const chaves = [
            'locadores', 'pecas', 'locacoes', 'devolucoes', 'tipos',
            'modelosChecklist', 'logsAuditoria', 'config'
        ];
        return chaves.some((chave) => Object.prototype.hasOwnProperty.call(dados, chave));
    }

    function montarResumoBackupParaConfirmacao(dados, nomeArquivo) {
        const dataRaw = String(dados?.data || '').trim();
        const dataFmt = dataRaw ? new Date(dataRaw).toLocaleString('pt-BR') : 'sem data';
        const versao = String(dados?.versao || 'desconhecida');
        const totalLocadores = normalizarListaBackup(dados?.locadores).length;
        const totalPecas = normalizarListaBackup(dados?.pecas).length;
        const totalLocacoes = normalizarListaBackup(dados?.locacoes).length;
        const totalDevolucoes = normalizarListaBackup(dados?.devolucoes).length;

        return (
            `Arquivo: ${nomeArquivo || 'backup.json'}\n` +
            `Versao: ${versao}\n` +
            `Data: ${dataFmt}\n\n` +
            `Clientes: ${totalLocadores}\n` +
            `Itens: ${totalPecas}\n` +
            `Locacoes: ${totalLocacoes}\n` +
            `Devolucoes: ${totalDevolucoes}\n\n` +
            'Isso vai substituir os dados atuais. Deseja continuar?'
        );
    }

    function limparInputBackup(input) {
        if (input && typeof input.value === 'string') {
            input.value = '';
        }
    }

    function pad2(valor) {
        return String(valor).padStart(2, '0');
    }

    function gerarNomeArquivoData(prefixo, extensao = 'json') {
        const agora = new Date();
        const yyyy = agora.getFullYear();
        const mm = pad2(agora.getMonth() + 1);
        const dd = pad2(agora.getDate());
        const hh = pad2(agora.getHours());
        const mi = pad2(agora.getMinutes());
        return `${prefixo}_${yyyy}-${mm}-${dd}_${hh}${mi}.${extensao}`;
    }

    function montarResumoArquivamentoHistorico(contratosParaArquivar = []) {
        const totalContratos = normalizarListaBackup(contratosParaArquivar).length;
        const totalItens = normalizarListaBackup(contratosParaArquivar)
            .reduce((acc, loc) => acc + normalizarListaBackup(loc?.items).length, 0);

        return (
            `Serão arquivados ${totalContratos} contrato(s) finalizado(s).\n` +
            `Itens nesses contratos: ${totalItens}\n\n` +
            'Um arquivo será baixado e os registros sairão da base ativa.\n' +
            'Deseja continuar?'
        );
    }

    // --- FUNÇÕES DE BACKUP ---
    function baixarBackup() {
        try {
            const snapshot = typeof gerarSnapshotDadosSistema === 'function'
                ? gerarSnapshotDadosSistema()
                : {
                    locadores, pecas, locacoes, devolucoes, tipos, config,
                    logsAuditoria, modelosChecklist, checklistsGerados,
                    checklistMontagem, checklistConferencia, checklistEtapasMontagem
                };
            const dados = JSON.stringify({
                versao: '11.1',
                data: new Date().toISOString(),
                ...snapshot
            });

            const blob = new Blob([dados], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = gerarNomeArquivoData('MTZ_Backup');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (typeof registrarLog === 'function') {
                registrarLog(
                    'sistema',
                    'backup_download',
                    `Backup JSON exportado (${normalizarListaBackup(snapshot.locadores).length} clientes, ${normalizarListaBackup(snapshot.pecas).length} itens).`
                );
            }

            mostrarToast("Backup baixado!");
        } catch (erro) {
            console.error('Erro ao gerar backup JSON:', erro);
            mostrarToast("Não foi possível gerar o backup agora.", "erro");
        }
    }

    function restaurarBackup(input) {
        if (typeof validarPermissao === 'function' && !validarPermissao('restaurar_backup', 'Somente administrador pode restaurar backup.')) {
            return;
        }

        if (!input?.files || !input.files[0]) return;
        const arquivo = input.files[0];
        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                const j = JSON.parse(e.target?.result || '{}');
                if (!backupTemEstruturaMinima(j)) {
                    mostrarToast("Arquivo de backup inválido ou incompleto.", "erro");
                    limparInputBackup(input);
                    return;
                }

                const confirmarRestauro = () => {
                    // Cria snapshot de segurança antes da substituição.
                    if (typeof criarBackupEmergencia === 'function') {
                        try {
                            criarBackupEmergencia();
                        } catch (_) {
                            // Falha nesse backup de segurança não bloqueia o restauro.
                        }
                    }

                    if (typeof aplicarDadosSistema === 'function') {
                        aplicarDadosSistema(j, { manterConfigAtual: true });
                    } else {
                        locadores = normalizarListaBackup(j.locadores);
                        pecas = normalizarListaBackup(j.pecas);
                        locacoes = normalizarListaBackup(j.locacoes);
                        devolucoes = normalizarListaBackup(j.devolucoes);
                        tipos = normalizarListaBackup(j.tipos);
                        config = j.config || config;
                    }
                    salvarLocal();
                    renderTudo();
                    sincronizar('salvar');
                    if (typeof registrarLog === 'function') {
                        registrarLog(
                            'sistema',
                            'restaurar_backup',
                            `Backup restaurado: ${arquivo.name || 'arquivo.json'} (${normalizarListaBackup(j.locadores).length} clientes, ${normalizarListaBackup(j.pecas).length} itens)`
                        );
                    }
                    mostrarToast("Backup restaurado com sucesso!");

                    limparInputBackup(input);
                };

                const mensagem = montarResumoBackupParaConfirmacao(j, arquivo?.name);
                if (typeof confirmarAcao === 'function') {
                    confirmarAcao(mensagem, confirmarRestauro, {
                        titulo: 'Restaurar backup',
                        textoConfirmar: 'Restaurar agora',
                        classeConfirmar: 'btn-warning'
                    });
                } else if (confirm(mensagem)) {
                    confirmarRestauro();
                } else {
                    limparInputBackup(input);
                }
            } catch (erro) {
                mostrarToast("Erro ao ler arquivo de backup.", "erro");
                console.error('Erro ao restaurar backup:', erro);
                limparInputBackup(input);
            }
        };
        reader.onerror = function() {
            mostrarToast("Não foi possível ler o arquivo selecionado.", "erro");
            limparInputBackup(input);
        };

        reader.readAsText(input.files[0]);
    }

    // --- FUNÇÃO DE LIMPEZA E ARQUIVAMENTO (VERSÃO MATA-FANTASMAS) ---
    function arquivarHistorico() {
        if (typeof validarPermissao === 'function' && !validarPermissao('arquivar_historico', 'Somente administrador pode arquivar histórico.')) {
            return;
        }

        // PASSO 1: FAXINA IMEDIATA (Remove os traços "-" da tela)
        const historicoAntes = devolucoes.length;
        devolucoes = devolucoes.filter(d => locacoes.some(l => l.id === d.locacaoId));
        
        const historicoDepois = devolucoes.length;
        const fantasmasRemovidos = historicoAntes - historicoDepois;

        // Se encontrou "fantasmas", limpa eles e avisa
        if (fantasmasRemovidos > 0) {
            salvarLocal();
            renderTudo();
            sincronizar('salvar');
            return mostrarToast(`Faxina completa! ${fantasmasRemovidos} registros vazios removidos.`);
        }

        // PASSO 2: ARQUIVAMENTO NORMAL
        const contratosParaArquivar = locacoes.filter(l => l.status === 'devolvido');
        const contratosParaManter = locacoes.filter(l => l.status !== 'devolvido');

        if (contratosParaArquivar.length === 0) return mostrarToast("Nada novo para arquivar!", "erro");

        const executarArquivamento = () => {
            if (typeof criarBackupEmergencia === 'function') {
                try {
                    criarBackupEmergencia();
                } catch (_) {
                    // Falha no backup emergencial não bloqueia o arquivamento.
                }
            }

            const dadosMortos = JSON.stringify({
                data: new Date().toISOString(),
                contratos: contratosParaArquivar
            });

            const blob = new Blob([dadosMortos], {type: "application/json"});
            const urlArquivo = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = urlArquivo;
            link.download = gerarNomeArquivoData('MTZ_Arquivo_Morto');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(urlArquivo);

            locacoes = contratosParaManter;
            devolucoes = devolucoes.filter(d => locacoes.some(l => l.id === d.locacaoId));

            salvarLocal();
            renderTudo();
            sincronizar('salvar');
            if (typeof registrarLog === 'function') {
                registrarLog('sistema', 'arquivar_historico', `Arquivados ${contratosParaArquivar.length} contrato(s) finalizado(s).`);
            }
            mostrarToast("Sistema limpo e otimizado!");
        };

        const mensagem = montarResumoArquivamentoHistorico(contratosParaArquivar);
        if (typeof confirmarAcao === 'function') {
            confirmarAcao(mensagem, executarArquivamento, {
                titulo: 'Arquivar histórico',
                textoConfirmar: 'Arquivar agora',
                classeConfirmar: 'btn-warning'
            });
            return;
        }

        if (confirm(mensagem)) {
            executarArquivamento();
        }
    }

// === MONITOR DE ARMAZENAMENTO ===
function verificarEspacoStorage() {
    try {
        const backup = localStorage.getItem('mtzBackup');
        if (!backup) return;
        
        const tamanhoKB = (new Blob([backup]).size / 1024).toFixed(2);
        const percentual = Math.round((tamanhoKB / 5120) * 100);
        
        console.log(`📊 Storage: ${tamanhoKB} KB (${percentual}% de 5 MB)`);
        
        if (percentual >= 90) {
            mostrarToast('🔴 CRÍTICO: Storage em ' + percentual + '%! FAÇA BACKUP AGORA!', 'erro');
        } else if (percentual >= 75) {
            mostrarToast('⚠️ ALERTA: Storage em ' + percentual + '%!', 'erro');
        }
    } catch (erro) {
        console.error('Erro ao verificar storage:', erro);
    }
}

// Executar verificação ao carregar
window.addEventListener('load', function() {
    setTimeout(verificarEspacoStorage, 2000);
});
