# Adocao futura: procedimento fechado, nao executado

Esta entrega autoriza somente a homologacao sintetica na interface principal.
Nao existe importador de bases reais neste bootstrap. O Salvar publico permanece
bloqueado. Nenhuma acao abaixo constitui autorizacao para migrar dados reais.

## Fronteira comprovada nesta origem

| Caminho | Protecao |
| --- | --- |
| Criar/editar proposta e atalho de Salvar | Dois comandos existentes, revisao esperada, journal e recibos |
| salvarLocal, persistirSnapshotLocalConfirmavel | Recusa antes de gravar; sem fallback |
| carregarLocal | Recusa antes de ler JSON legado |
| aplicarDadosSistema (destino de importacao/restauracao) | Recusa antes de substituir a raiz |
| sincronizar | Recusa antes de acesso a rede |
| onload legado | Nao hidrata, nao renderiza candidatos nem agenda autosave/backup |
| Mutacao direta e troca das colecoes | Raiz congelada, setters protegidos, fronteira unica |
| Outra aba escrevendo localStorage | Evento avisado; nao e consumido pelo leitor IndexedDB |
| Clientes/Tipos e outros dominios | Sem modulos de escrita carregados nem capacidades no bootstrap |
| Service worker anterior | Inicializacao bloqueada, sem limpeza automatica |

O host conserva o mesmo nome de banco e identidade da homologacao anterior.
Somente / e /index.html recebem o bootstrap local, sem scripts de login, sync,
importacao, PWA ou executores legados. O CLI utiliza exclusivamente
http://127.0.0.1:54145/ e falha se a porta estiver ocupada. O alias localhost e
redirecionado para essa origem. Testes usam portas/perfis efemeros sinteticos.

## Preparacao nao destrutiva

1. Inventariar origem, versao, revisao, empresa, escritor e sincronizador reais,
   sem abri-los neste host. Definir uma janela explicita de corte e responsavel.
2. Exportar o JSON original sem normalizar ou recalcular propostas. Conservar o
   arquivo original e uma copia independente protegida, fora do diretorio servido.
   Registrar SHA-256, tamanho, data, revisao e contagens. Dados e credenciais nao
   devem entrar em commits ou hospedagem. Exportacao controlada e necessaria
   se o preflight identificar segredos; nao mascarar silenciosamente o original.
3. Reutilizar inspecionarOrigemMigracaoTexto, exportarBackupMigracaoTexto e
   restaurarBackupMigracaoIsoladoTexto de migration-preflight.mjs em copia.
   Comprovar recuperacao byte a byte antes de qualquer ativacao. Esses contratos
   retornam gravado:false e migracaoAutorizada:false. Preflight nao e permissao.
4. Exigir todos os validadores aplicaveis: IDs tipados, referencias, historicos,
   fiscal preservado, ledger, classificacoes e campos futuros. Perfis ambiguos,
   nao certificados ou incompletos continuam bloqueados; nenhum ajuste automatico.
5. Para uma origem ja transacional, preservar os CINCO stores, a identidade e a
   selecao de autoridade em copia consistente. O backup JSON legado declara
   journalIncluido:false: sozinho NAO restaura historico, auditoria e recibos IDB.
6. Simular a adocao em base nova isolada e comparar registros, valores, anexos,
   snapshots historicos e referencias completas. Nao sobrescrever a base de origem.

## Condicoes ainda necessarias para liberar publicamente

- Aprovar o perfil real e testar uma migracao explicita, recuperavel e autorizada.
- Migrar ou impedir TODOS os consumidores/escritores da raiz compartilhada.
  Apenas esconder um botao ou instalar uma trava cooperativa nao basta.
- Demonstrar o bloqueio de ingressos de abas/codigo antigo e da sincronizacao
  remota na origem de destino. BroadcastChannel, releitura e marcadores em
  localStorage nao revogam clientes antigos. Esta entrega nao faz essa afirmacao.
- Quando nao houver revogacao confiavel na origem antiga, usar corte controlado
  para origem protegida distinta, sem importar/sincronizar automaticamente as
  alteracoes posteriores do legado. A origem antiga deve ficar claramente fora
  da operacao, com o procedimento e a autoridade unica aprovados pelos usuarios.
- Nao autorizar importacao, restauracao completa ou outros dominios por esta UI.
- Preservar backup independente e testar recuperacao com historicos/recibos.

## Interrupcao e retorno

Antes da ativacao, o JSON original e a base atual permanecem intactos; uma falha
na simulacao nao modifica a origem. Depois de qualquer commit na nova autoridade,
NAO retornar automaticamente ao JSON antigo: isso descartaria operacoes recentes.
Bloquear novas escritas e recuperar pela mesma identidade e journal/recibos.
Resposta perdida e recuperada pelo identificador e assinatura do comando; nunca
repetir com outra chave para tentar adivinhar o resultado.

Sem autenticacao forte neste ensaio. O ator e sintetico/documental. O P2 legado
de restauracao temporizada de foco/rolagem nao foi refatorado nesta integracao.
