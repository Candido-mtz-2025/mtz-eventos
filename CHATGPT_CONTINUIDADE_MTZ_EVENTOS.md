# Continuidade do projeto MTZ Eventos / LocaFlow ERP

Data deste relatorio: 13/07/2026

Este arquivo foi criado para outro ChatGPT/Codex ler antes de continuar o projeto.
Ele resume o estado atual do app, regras de seguranca, arquivos principais,
commits recentes e proximos passos recomendados.

## Repositorio

Repositorio GitHub:
https://github.com/Candido-mtz-2025/mtz-eventos.git

Observacao:
o caminho local depende da maquina onde o projeto for clonado. Use a pasta do
repositorio `mtz-eventos` como raiz de trabalho.

## Regras obrigatorias antes de mexer

- Nao mexer na pasta `Projetos/`.
- Nao quebrar `renderTudo()`.
- Nao alterar `localStorage` sem migracao segura.
- Nao apagar dados antigos.
- Nao mudar nomes de funcoes publicas sem necessidade.
- Nao mexer em calculos, PDF, estoque, conversao ou fiscal quando a tarefa for apenas visual.
- Fazer mudancas pequenas e testaveis.
- Rodar validacoes antes de pedir commit.
- Sempre informar o comando de commit no final.

## Estado atual conhecido

Branch principal: `main`

Commits recentes:

- `2500800 Separa base estimada de NFe em propostas`
- `39a2e80 Separa base estimada de NFe em propostas`
- `fdd6679 Ajusta consistencia da base fiscal estimada em propostas`
- `e3aa987 Melhora exibicao de mao de obra e custos internos no PDF da proposta`
- `e7eabef Corrige fluxo de revisoes de propostas`
- `b02cd3c Corrige foco do orcamento recem alterado na lista`
- `7679c49 Melhora legibilidade das regras por categoria`
- `36ad463 Inclui mao de obra cobrada na base fiscal da proposta`

Versoes de cache atuais no `index.html`:

- `style.css?v=23.27`
- `propostas.js?v=3.9`

Antes de continuar, rode `git status --short` para confirmar se ha arquivos
pendentes. Se este relatorio ainda nao tiver sido commitado, ele aparecera como
arquivo novo.

## Arquivos principais

Estrutura e tela:

- `index.html`
- `assets/css/style.css`

Core:

- `assets/js/core/app.js`
- `assets/js/core/state.js`
- `assets/js/core/storage.js`
- `assets/js/core/migrations.js`
- `assets/js/core/utils.js`

Eventos/UI:

- `assets/js/ui/eventos.js`
- `assets/js/ui/pwa.js`

Modulos:

- `assets/js/modules/propostas.js`
- `assets/js/modules/locacoes.js`
- `assets/js/modules/estoque.js`
- `assets/js/modules/devolucoes.js`
- `assets/js/modules/checklist.js`
- `assets/js/modules/relatorios.js`
- `assets/js/modules/backup-tools.js`

Render:

- `assets/js/render/estoque.js`
- `assets/js/render/locacoes.js`
- `assets/js/render/devolucoes.js`
- outros arquivos dentro de `assets/js/render/`.

## Estado funcional do sistema

O app e um sistema de gestao de locacao/eventos com:

- Dashboard
- Clientes
- Tipos
- Estoque
- Checklists
- Locacoes
- Devolucoes
- Auditoria
- Configuracoes
- Propostas/Orcamentos
- PDF
- Backup
- Sincronizacao/localStorage
- Temas visuais
- Navegacao lateral com grupos

O app tem temas:

- Claro
- Escuro
- MTZ Premium
- MTZ Gold
- Automatico

Os temas foram bastante ajustados. Ainda assim, quando mexer em CSS, verificar
em todos os temas se nao aparecem fundos brancos indevidos, textos cortados ou
desalinhamento de header/sidebar.

## Estado da aba Orcamentos / Propostas

A aba Orcamentos/Propostas e o modulo mais sensivel do sistema.
Ela tem:

- modo guiado por etapas;
- dados da proposta;
- cliente vinculado ao cadastro principal;
- `clienteId`;
- `clienteSnapshot`;
- busca de cliente cadastrado;
- preenchimento por CEP;
- dados fiscais do cliente;
- opcao "Cliente precisa de nota fiscal";
- itens com categoria comercial;
- itens com tipo fiscal;
- resumo comercial;
- resumo fiscal;
- base estimada de NFS-e;
- base estimada de NF-e;
- pre-nota/dados para faturamento;
- revisoes;
- duplicacao;
- PDF cliente;
- PDF interno;
- conversao para locacao.

Funcoes importantes em `assets/js/modules/propostas.js`:

- `calcularResumoProposta()`
- `calcularResumoFiscalProposta()`
- `montarHtmlPreNotaProposta()`
- `montarHtmlPdfProposta()`
- `montarCabecalhoPropostaPdf()`
- `obterBaseEstimadaNfeResumoFiscal()`
- `formatarCodigoRevisaoProposta()`
- `obterProximaRevisaoProposta()`
- `criarNovaRevisaoProposta()`
- `criarNovaRevisaoPropostaAtual()`

## Regras fiscais atuais da aba Orcamentos

Resumo atual do comportamento fiscal:

- Itens `produto_venda` entram em `baseEstimadaNfe`.
- Servicos entram em `baseEstimadaNfse` conforme matriz fiscal.
- Mao de obra cobrada do cliente entra no total comercial e tambem na base fiscal como tipo `mao_de_obra`.
- Mao de obra interna e hospedagem interna sao custos internos e nao entram em base fiscal.
- Locacao de bem movel nao deve entrar automaticamente na base de NFS-e.
- Reembolso e itens "verificar contador" exigem cuidado/conferencia.
- O sistema deve sempre tratar tudo como estimativa fiscal para conferencia.
- Nao emitir nota real e nao integrar API fiscal nesta fase.

Aviso padrao fiscal que deve ser preservado:

`Pre-nota para conferencia. Emissao fiscal oficial deve ser validada pela contabilidade.`

## Cenarios fiscais ja considerados

- Orcamento somente com locacao.
- Orcamento somente com produto/venda.
- Orcamento somente com servico.
- Orcamento com mao de obra de montagem e desmontagem.
- Orcamento misto com produto/venda e servico.
- Frete como custo adicional.
- Frete como item fiscal.
- Custos internos de mao de obra e hospedagem.
- Orcamento antigo sem tipo fiscal.
- Opcao "precisa de nota fiscal" divergente das bases calculadas.

Se continuar auditoria fiscal, nao mudar matriz, aliquotas ou bases sem confirmar.

## Regras de revisao de proposta

Comportamento esperado:

- Nova proposta: `Rev. 00`.
- Primeira revisao: `Rev. 01`.
- Segunda revisao: `Rev. 02`.
- Todas compartilham o mesmo `codigoBase`.
- Cada revisao tem `id` proprio.
- `propostaOrigemId` deve apontar para a base/origem correta.
- Criar revisao nao pode sobrescrever a proposta anterior.
- Duplicar proposta nao deve ser tratado como revisao, salvo regra explicita.
- Converter para locacao deve usar a revisao selecionada.

## Pontos recentes importantes

Foram feitas correcoes em:

- digitacao e travamentos em busca/campos;
- performance leve em buscas;
- renderizacao de estoque sem recalcular KPIs durante digitacao;
- PDF de proposta com cabecalho mais profissional;
- cliente vinculado ao orcamento;
- CEP puxando endereco no orcamento;
- modo guiado separando etapas;
- validacao fiscal quando cliente precisa de NF;
- foco do orcamento recem alterado na lista;
- revisoes no formato Rev. 00, Rev. 01;
- mao de obra cobrada do cliente;
- mao de obra e hospedagem internas;
- base estimada de NF-e separada;
- ajustes visuais em tabelas fiscais.

## Pendencias recomendadas

Prioridade 1 - Estabilizar e revisar:

- Testar todos os fluxos principais em tema claro, escuro, premium e gold.
- Confirmar que nenhum campo volta a rolar sozinho durante digitacao.
- Confirmar que buscas nao invertem texto.
- Confirmar que dashboard, clientes, estoque, locacoes e propostas abrem sem erro.
- Confirmar que nao existem arquivos pendentes no `git status`.

Prioridade 2 - Orcamentos:

- Validar os cenarios fiscais com dados reais do usuario antes de novas regras.
- Melhorar PDF final do cliente sem mudar calculos.
- Melhorar pre-nota/dados para faturamento, mantendo aviso de conferencia contabil.
- Conferir mao de obra/hospedagem em PDF cliente e interno antes de novos ajustes.

Prioridade 3 - Estoque/Operacao:

- Evoluir controle de disponibilidade, reservado, manutencao, avaria e perdido.
- Melhorar historico de movimentacao por item.
- Melhorar QR code/codigo de barras quando for prioridade.

Prioridade 4 - Produto comercial:

- Relatorios gerenciais.
- Financeiro completo.
- Agenda operacional.
- Usuarios/permissoes por perfil.
- Multiempresa e banco real no futuro.

## Comandos uteis para validacao

Dentro da pasta do projeto:

```powershell
node --check assets/js/modules/propostas.js
node --check assets/js/core/app.js
node --check assets/js/ui/eventos.js
git diff --check
git status --short
```

Quando houver commit:

```powershell
git add <arquivos>
git commit -m "Mensagem curta e clara"
git push origin main
git log -1 --oneline
```

Se o push for rejeitado por existir commit remoto:

```powershell
git pull --rebase origin main
git push origin main
```

Nao adicionar a pasta `Projetos/`.

## Mensagem pronta para colar em outro ChatGPT/Codex

```text
Quero continuar o projeto MTZ Eventos / LocaFlow ERP.

Repositorio:
https://github.com/Candido-mtz-2025/mtz-eventos.git

Antes de alterar qualquer coisa, leia o arquivo:
CHATGPT_CONTINUIDADE_MTZ_EVENTOS.md

Regras:
- Nao mexer na pasta Projetos/.
- Nao quebrar renderTudo().
- Nao alterar localStorage sem migracao segura.
- Nao apagar dados antigos.
- Fazer mudancas pequenas e testaveis.
- Validar antes de pedir commit.
- Sempre me passar o comando de commit no final.

Quero continuar a partir das pendencias recomendadas do relatorio,
priorizando estabilidade, orcamentos/propostas, PDF e fluxo fiscal.
```
