# Orcamentos: homologacao local isolada

Executar na raiz do repositorio, com Node.js:

```powershell
node tools/serve-orcamentos.cjs 54145
```

Endereco: http://127.0.0.1:54145/

A porta de uso e fixa. O CLI recusa outra porta e nao escolhe uma automaticamente
se houver conflito. localhost redireciona para 127.0.0.1, inclusive /index.html.
O banco, a identidade e a epoca da homologacao anterior foram mantidos. Nao
confundir navegadores/perfis diferentes com perda de dados. Service worker
preexistente bloqueia a inicializacao, sem exclusao automatica de caches/dados.

Somente dados sinteticos. A estrutura principal (cabecalho, sidebar e navegacao)
e a do aplicativo existente; somente Orcamentos recebe comandos de escrita.
Na primeira visita, clicar em **Iniciar base sintetica**.
O host nunca importa localStorage, backups, credenciais ou cadastros reais.
Nao reutilizar esta base para operacao comercial. Nao publicar este host.

## Fluxo validado

- Preencher cliente manual, evento e itens na interface existente.
- Salvar: `proposta.criar.v1` ou `proposta.editar.v1`, via gateway e journal existentes.
- Aguardar a mensagem de commit confirmado. A lista usa exclusivamente a raiz relida e validada.
- Recarregar, abrir Lista de orcamentos e Editar para recuperar o registro.
- O fechamento salvo fica preservado. Para editar valores, usar o botao existente
  **Simular com regras gerenciais atuais** no fechamento; somente um novo Salvar
  confirmado registra a revisao. O snapshot anterior permanece na auditoria.
- Em conflito, atualizar a lista e reabrir o registro. O formulario rejeitado nao e mesclado automaticamente.
- Se uma resposta falhar, usar **Recuperar salvamento** antes de repetir.
  A intencao pendente fica em sessionStorage, nao o estado financeiro. Somente o
  recibo verificado no IndexedDB comprova a operacao.
- Previa e exportacao PDF utilizam os geradores atuais. A previa local e somente
  leitura; nao declara exportacao, download ou envio concluido no historico.

## Autoridade e isolamento

Nao ha comando novo. O registro conserva 37 comandos, mas este bootstrap permite
somente criar/editar propostas e ler/inicializar a base sintetica. Nenhuma outra
aba ou piloto e carregado. Nao ha conversao, sync, importacao ou migracao real.

O estado publicado e congelado e os escritores legados sao recusados pela
fronteira existente. O host carrega as funcoes reais de storage.js DEPOIS de selar
a fronteira, para recusar salvarLocal, carregarLocal, aplicarDadosSistema e
sincronizar antes de leitura, escrita ou rede. O onload legado de app.js nao e
executado nessa fronteira: somente suas funcoes de tema, sidebar e navegacao
sao inicializadas. Nao carrega sync.js, PWA, autenticacao remota, executores
financeiros legados ou os modulos de Clientes/Tipos. Nao agenda autosave ou
backup legado. Outras telas permanecem indisponiveis para escrita.

O banco tem nome `mtz-idb-fundacao-lote1-teste-interdominios-orcamentos-local-v1`.
A origem, a identidade e o checkpoint inicial sao estaveis e sinteticos. A selecao
de autoridade existente nao permite reinicializar automaticamente uma base usada.
Falhas ou incompatibilidades bloqueiam o fluxo, sem fallback para localStorage.

O acesso a localhost nao e autenticacao forte. O ator e documental/sintetico.
Nao existe garantia contra administrador local, DevTools, limpeza dos dados do
navegador, perda simultanea de todos os bancos ou exclusao do perfil. Abas antigas
do site publicado **nao** foram revogadas: ficam em outra origem e nao recebem
esta autoridade ou estes dados. Liberacao publica e migracao continuam pendentes.

O snapshot gerencial v3 e reconstruido pelo nucleo gerado das regras atuais,
sem aceitar totais, historicos ou assinaturas da interface. Valores informados de
mao de obra desmarcada e descontos limitados sao preservados para replay exato;
isso nao adiciona custo, retencao ou depreciacao ao calculo aprovado.

## Testes

```powershell
node tools/test-proposal-gerencial.cjs
node tools/test-proposal-idb.cjs
node tools/test-orcamentos-local.cjs
node tools/test-orcamentos-main.cjs
node tools/build-proposal-kernel.cjs --check
```

Os ensaios de navegador exigem Playwright e Chrome/Chromium disponiveis.
As variaveis opcionais `MTZ_PLAYWRIGHT`, `MTZ_CHROME` e `MTZ_BABEL_BUNDLE`
permitem localizar dependencias ja instaladas sem adicionar dependencias ao app.
`MTZ_TEST_OUTPUT` indica uma pasta existente para evidencias sinteticas.
Os testes criam origens efemeras e perfis descartaveis, nunca o perfil do usuario.

As bibliotecas PDF e icones conservam os CDNs utilizados pelo aplicativo;
exportacao PDF exige que esses recursos sejam carregados. O banco e local ao
navegador e origem: trocar navegador, perfil ou porta nao transfere os registros.
Atualizacoes futuras que alterem o checkpoint ou protocolo precisam de migracao
explicita; este ensaio nao implementa migracao nem atualizacao de bases reais.

Uma aba antiga ainda pode escrever seu proprio localStorage: essa escrita nao e
autoritativa, nao e importada, nao publica dados e nao altera o IndexedDB. Isso
nao significa revogacao global de clientes antigos ou do sincronizador remoto.
O procedimento para adocao futura esta em ADOCAO_ORCAMENTOS.md.
