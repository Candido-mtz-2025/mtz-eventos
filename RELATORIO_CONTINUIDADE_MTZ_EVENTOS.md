# Relatorio de continuidade - MTZ Eventos

Data do relatorio: 23/06/2026  
Projeto: MTZ Eventos / LocaFlow ERP  
Repositorio: https://github.com/Candido-mtz-2025/mtz-eventos.git  
Branch atual: main  
Ultimo commit conhecido: 0740207 - Prepara checklist pendente ao converter proposta

## Objetivo deste documento

Este relatorio foi criado para permitir que outra conta continue o projeto sem repetir etapas, sem gastar credito reabrindo o mesmo caminho e sem quebrar o que ja esta funcionando.

O foco do projeto e transformar o MTZ Eventos em um sistema comercial completo para empresas de locacao/eventos, com fluxo parecido com ERP/SaaS:

- cliente;
- proposta/orcamento;
- aprovacao;
- locacao;
- estoque;
- transporte;
- checklist;
- devolucao;
- financeiro;
- PDFs;
- relatorios;
- backup e sincronizacao.

## Estado atual do repositorio

Status atual observado:

- Branch: main
- Codigo principal sem alteracoes pendentes.
- Existe a pasta `Projetos/` como arquivo/pasta nao versionada.
- Nao incluir `Projetos/` no commit sem pedido explicito.

Comando seguro para conferir:

```powershell
cd "C:\Users\Alan\Documents\Codex\2026-05-19\quero-melhorar-um-app-que-est\mtz-eventos"
git status
git log -5 --oneline
```

## Ultimos commits importantes

- `0740207` - Prepara checklist pendente ao converter proposta
- `1391b1f` - Cria retirada automatica ao converter proposta
- `9a7faef` - Melhora conversao de proposta em locacao
- `9cd5425` - Corrige sidebar mobile como gaveta responsiva
- `49dea03` - Corrige menu flutuante de temas
- `719e33f` - Corrige abertura do seletor de temas
- `7fe89df` - Padroniza menu do usuario no header
- `2df4055` - Corrige abertura do submenu recolhido
- `629be4d` - Refina submenu da sidebar recolhida
- `2c87e46` - Ajusta submenu recolhido e menu do usuario
- `3ba1b68` - Corrige menus recolhidos e menu da conta
- `2e70aa7` - Ajusta sidebar recolhivel e menu da conta

## O que ja foi feito

### Layout e navegacao

- O sistema saiu do menu horizontal antigo e passou por evolucao para layout com sidebar.
- Foi criada organizacao visual por grupos:
  - Dashboard
  - Comercial
  - Operacao
  - Logistica
  - Financeiro
  - Admin
- A sidebar foi ajustada para desktop e mobile.
- O menu recolhido teve varias correcoes para evitar corte de submenu.
- O menu do usuario foi padronizado.
- O seletor de temas foi corrigido para abrir corretamente.

### Temas

Existem variacoes de tema no sistema:

- Claro
- Escuro
- MTZ Premium
- MTZ Gold
- Automatico

O tema Premium e o tema Gold receberam ajustes, mas ainda precisam de revisao visual final em todas as abas. O principal risco desses temas e contraste: algumas areas podem ficar com fundo claro e texto claro, ou fundo escuro e texto pouco legivel.

### Aba Propostas / Orcamentos

A aba Propostas foi criada e evoluiu bastante. Hoje ela cobre:

- cadastro de proposta;
- dados do cliente;
- dados do evento;
- itens da proposta;
- categorias nos itens;
- resumo por categoria;
- custos adicionais;
- calculo financeiro;
- percentual de NF;
- tipo de calculo da NF;
- valor final com NF;
- valor liquido previsto;
- controle interno opcional no PDF;
- CRUD de propostas;
- duplicacao;
- exclusao;
- geracao de PDF;
- conversao para locacao.

Tambem foi adicionada configuracao de categorias de composicao, com categorias personalizadas e compatibilidade com propostas antigas.

### Conversao de proposta para locacao

A conversao de proposta em locacao foi melhorada recentemente.

O que a conversao ja prepara:

- cria locacao a partir da proposta;
- carrega dados financeiros da proposta;
- carrega origem da proposta;
- recalcula disponibilidade de estoque;
- cria transporte de entrega;
- cria transporte de retirada quando a data de desmontagem for diferente;
- prepara checklist pendente;
- mostra status de checklist na lista de locacoes.

Ultima melhoria concluida:

- Ao converter uma proposta, a locacao recebe um checklist pendente inicial.
- A lista de locacoes mostra badge do tipo `CHECKLIST 0/N` quando ha itens para conferir.

### Estoque

O estoque ja possui:

- cadastro de itens;
- importacao Excel;
- busca;
- indicadores;
- modelos de estrutura;
- geracao de checklist de estrutura;
- campos estruturais;
- suporte visual aos temas.

Ainda precisa evoluir para controle profissional completo:

- total;
- disponivel;
- reservado;
- locado;
- manutencao;
- avariado;
- perdido;
- localizacao fisica;
- historico por item;
- QR Code/codigo de barras;
- kits.

### Transporte / Logistica

Existe modulo `transporte.js`. A conversao de proposta ja gera entrega e retirada automaticamente.

Ainda precisa:

- tela operacional mais clara;
- status de saida, entrega, retirada e retorno;
- motorista;
- veiculo;
- rota;
- equipe;
- uso mobile em campo.

### PDFs

Ja houve ajustes em PDFs, principalmente em proposta/orcamento e checklist. Mesmo assim, os PDFs ainda precisam de uma revisao final comparando com os modelos enviados pelo usuario.

Pontos a revisar:

- cabecalho compacto;
- logo pequeno;
- dados da empresa;
- dados do cliente;
- dados do evento;
- tabela de itens;
- resumo financeiro;
- condicoes comerciais;
- rodape;
- quebra de pagina;
- impressao A4;
- visual profissional no celular e desktop.

### Backup, sincronizacao e login

O sistema tem:

- backup JSON;
- restauracao JSON;
- sincronizacao;
- login Google;
- modo local/offline;
- badge de online/local/offline.

Ponto sensivel:

- O usuario reclamou que precisa logar muitas vezes. Isso precisa entrar como prioridade tecnica futura.

## Arquivos principais do projeto

### Estrutura central

- `index.html`
- `assets/css/style.css`
- `assets/js/core/app.js`
- `assets/js/core/state.js`
- `assets/js/core/storage.js`
- `assets/js/core/migrations.js`
- `assets/js/core/utils.js`

### Modulos principais

- `assets/js/modules/propostas.js`
- `assets/js/modules/locacoes.js`
- `assets/js/modules/estoque.js`
- `assets/js/modules/checklist.js`
- `assets/js/modules/devolucoes.js`
- `assets/js/modules/clientes.js`
- `assets/js/modules/tipos.js`
- `assets/js/modules/config.js`
- `assets/js/modules/transporte.js`
- `assets/js/modules/backup-tools.js`
- `assets/js/modules/relatorios.js`
- `assets/js/modules/shared-actions.js`

### Renderizacao

Verificar tambem arquivos dentro de:

- `assets/js/render/`
- `assets/js/ui/`

## Regras importantes para continuar

1. Nao quebrar `renderTudo()`.
2. Nao apagar dados do usuario.
3. Nao alterar localStorage sem migracao segura.
4. Nao remover funcoes existentes sem mapear onde sao usadas.
5. Nao renomear IDs importantes sem necessidade.
6. Nao criar IDs duplicados.
7. Nao mexer na pasta `Projetos/` sem pedido explicito.
8. Fazer commits pequenos.
9. Testar cada etapa antes de seguir.
10. Sempre enviar o comando de commit no final quando alterar arquivo.

## Problemas e riscos ainda abertos

### Visual

- Alguns temas ainda podem ter contraste ruim.
- MTZ Premium e MTZ Gold precisam de revisao aba por aba.
- Alguns cards podem herdar fundo branco em tema escuro.
- Alguns textos ainda podem ficar claros demais ou apagados.
- Mobile precisa de revisao visual final.

### Navegacao

- Sidebar e menu recolhido ja melhoraram, mas devem ser testados em:
  - desktop grande;
  - notebook;
  - tablet;
  - celular.
- Menus expansivos devem abrir e fechar sem sobrepor conteudo.
- Menu do usuario precisa continuar abrindo Perfil, Temas e Sair sem corte.

### Propostas / Orcamentos

- A aba esta poderosa, mas precisa de QA final de fluxo real:
  - criar proposta;
  - adicionar item;
  - alterar categoria;
  - aplicar padroes;
  - aplicar NF;
  - gerar PDF;
  - duplicar;
  - editar;
  - converter em locacao.

### Conversao proposta -> locacao

- Ja cria entrega, retirada e checklist pendente.
- Falta testar com proposta real com varios itens e datas diferentes.
- Falta validar se os itens da proposta batem 100% com o checklist gerado.
- Falta conferir se a locacao convertida aparece corretamente em filtros.

### Login e sessao

- Usuario relatou que precisa logar toda hora.
- Revisar expiracao de token, tentativa silenciosa e fallback local.
- Melhorar mensagem quando Google desconectar.

### PDFs

- Necessario gerar PDFs reais e comparar visualmente.
- Prioridade:
  - proposta/orcamento;
  - checklist;
  - contrato simples;
  - devolucao;
  - romaneio.

## Plano de finalizacao recomendado

### Fase 1 - Estabilizacao visual e navegacao

Objetivo: deixar o sistema bonito e sem comportamento quebrado.

Tarefas:

- Revisar Dashboard, Clientes, Tipos, Estoque, Checklist, Locações, Devolucoes, Auditoria, Config e Propostas em tema claro.
- Revisar as mesmas telas em MTZ Premium e MTZ Gold.
- Corrigir contraste, cards brancos, textos apagados e icones desalinhados.
- Testar sidebar aberta, recolhida e mobile.
- Testar menu do usuario e menu de temas.

Resultado esperado:

- Navegacao sem cortes.
- Temas consistentes.
- Nenhuma tela visualmente fora do padrao.

### Fase 2 - Fluxo comercial completo

Objetivo: garantir que proposta vire operacao sem retrabalho.

Tarefas:

- Criar proposta completa.
- Gerar PDF.
- Converter em locacao.
- Confirmar locacao criada.
- Confirmar transporte de entrega.
- Confirmar transporte de retirada.
- Confirmar checklist pendente.
- Confirmar disponibilidade de estoque.

Resultado esperado:

- Fluxo Proposta -> Locacao -> Transporte -> Checklist funcionando.

### Fase 3 - PDFs profissionais

Objetivo: deixar documentos com aparencia de empresa.

Tarefas:

- Padronizar cabecalho compacto.
- Padronizar rodape.
- Padronizar tabelas.
- Ajustar quebra de pagina.
- Validar A4.
- Comparar com os PDFs de referencia do usuario.

Resultado esperado:

- PDF de proposta pronto para enviar ao cliente.
- PDF de checklist pronto para equipe.

### Fase 4 - Estoque profissional

Objetivo: preparar controle real de locadora.

Tarefas:

- Separar quantidade total, disponivel, reservada, locada, manutencao, avariada e perdida.
- Criar historico de movimentacao por item.
- Criar localizacao fisica.
- Preparar QR Code/codigo de barras.
- Criar kits e modelos de evento.

Resultado esperado:

- Estoque deixa de ser apenas cadastro e vira controle operacional.

### Fase 5 - Financeiro e relatorios

Objetivo: permitir gestao empresarial.

Tarefas:

- Contas a receber.
- Pagamentos pendentes.
- Sinal e saldo.
- Forma de pagamento.
- Comprovantes.
- Relatorio mensal.
- Receita por periodo.
- Lucro por evento.

Resultado esperado:

- Sistema passa a apoiar decisao financeira.

### Fase 6 - Backup, seguranca e usuarios

Objetivo: preparar uso comercial real.

Tarefas:

- Melhorar persistencia de sessao.
- Reforcar backup automatico.
- Melhorar logs.
- Criar permissoes por perfil.
- Preparar multiempresa no futuro.

Resultado esperado:

- Menor risco de perda de dados.
- Controle por usuario e equipe.

## Testes minimos antes de cada commit funcional

Sempre que mexer em JS:

```powershell
node --check assets/js/modules/propostas.js
node --check assets/js/modules/locacoes.js
node --check assets/js/render/locacoes.js
git diff --check
```

Ajustar os arquivos conforme o modulo alterado.

Sempre que mexer em CSS:

```powershell
git diff --check
```

Depois testar no navegador:

- abrir Dashboard;
- trocar tema;
- abrir menu do usuario;
- abrir sidebar recolhida;
- abrir Propostas;
- abrir Locacoes;
- abrir Estoque;
- testar no celular se possivel.

## Prompt para usar em outra conta

Copiar e colar este texto na nova conta:

```text
Estou continuando o projeto MTZ Eventos / LocaFlow ERP.

Antes de alterar qualquer arquivo, leia o arquivo:
RELATORIO_CONTINUIDADE_MTZ_EVENTOS.md

O repositorio esta em:
C:\Users\Alan\Documents\Codex\2026-05-19\quero-melhorar-um-app-que-est\mtz-eventos

Regras:
- nao mexer na pasta Projetos/;
- nao quebrar renderTudo();
- nao apagar dados;
- nao alterar localStorage sem migracao segura;
- fazer commits pequenos;
- testar antes de cada commit;
- sempre me entregar o comando de commit no final.

Comece pela fase recomendada no relatorio e me diga exatamente o que vai alterar antes de mexer em muitos arquivos.
```

## Comando para sincronizar antes de continuar

```powershell
cd "C:\Users\Alan\Documents\Codex\2026-05-19\quero-melhorar-um-app-que-est\mtz-eventos"
git pull origin main
git status
git log -5 --oneline
```

## Status final deste relatorio

Relatorio pronto para continuidade.

Proxima etapa recomendada: Fase 1 - revisao visual e navegacao em todas as abas, com foco em temas, sidebar, menu do usuario e mobile.
