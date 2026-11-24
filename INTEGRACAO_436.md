# Integracao 4.36 no aplicativo completo

## Escopo e origem

- Branch: `integracao/app-completo-436-20261124`, criada da main publica
  `e7e56d075a20cd0f98e7571e54ab820277809f85`.
- Integracao preserva a cadeia homologada ate
  `ed958bc2c70ec27e1a7a2795f063c24e356fd4be`, sem reescrever commits.
- Index original completo, seus 42 scripts locais e suas 17 abas preservados.
  Nenhum modulo comercial, operacional, cadastral, financeiro ou administrativo
  foi substituido pelo host limitado do Cloudflare.
- Integradas composicao propria/terceirizada/mista, nomes de precos e custos,
  logistica opcional, modalidades fiscais exclusivas, resumo gerencial,
  acessibilidade/foco e correcoes dos PDFs comercial e interno.
- Codigo financeiro aprovado reutilizado, sem novas aliquotas ou formulas.

## Ajustes proprios da integracao

- Referencias de cache de utils, storage, app e relatorios atualizadas no index.
- A inicializacao completa injetava estilos genericos de impressao que forcavam
  preto sobre os cabecalhos escuros do PDF interno. A exclusao especifica de
  `data-pdf-tipo="proposta-interna"` conserva o template homologado; os demais
  relatorios continuam abrangidos pela regra antiga.
- O pacote usa o index completo sem transformacoes. Nao injeta meta de
  homologacao, nao remove scripts e nao ativa o bootstrap sintetico.
- Fontes/harnesses homologados foram preservados no Git, mas `homologacao/`,
  `tools/`, documentos, patches, dq e backups nao entram no pacote publicavel.

## Validacao sintetica direcionada

- `tools/test-app-completo.cjs`: 26 aprovados, zero reprovados na rodada final.
  Inicializacao real, 17 abas, igualdade dos scripts e menus com main,
  formulario em 1280x900 e 390x700, modalidades fiscais, historico/anexos,
  PDF comercial e interno com download, permissoes herdadas e pacote.
- `tools/test-proposal-usability.cjs`: 14 aprovados, zero reprovados.
- `tools/test-proposal-gerencial.cjs`: 21 aprovados, zero reprovados.
- `tools/test-proposal-idb.cjs`: 14 aprovados, zero reprovados, somente bancos
  sinteticos com nomes de ensaio. Confirma 37 comandos, identidades tipadas,
  conflitos, rollback e falha fechada sem fallback localStorage.
- Total final: 75 verificacoes aprovadas. PDFs reais abertos com Poppler e
  inspecionados visualmente: comercial sem custos/resultados internos;
  interno com tabela legivel e valores gerenciais preservados.
- Bibliotecas CDN oficiais fornecidas ao navegador pelo harness; chamadas
  externas restantes bloqueadas. Perfis novos, sem cookies ou bases pessoais.
- As primeiras execucoes de desenvolvimento do harness e seus resultados foram
  preservados; nao sao a rodada final de aprovacao. Houve chamadas inadequadas
  de PDF/expectativas de normalizacao corrigidas no teste e o conflito real de
  estilos corrigido na aplicacao. O teste IDB tambem precisou da pasta de saida.

Exemplo sintetico identico antes/depois, com percentuais apenas ilustrativos:

| Componente | Valor R$ |
| --- | ---: |
| Itens (3 x 2.000) | 6.000,00 |
| Frete cobrado / montagem cobrada | 400,00 / 600,00 |
| Desconto | 200,00 |
| Faturamento | 6.800,00 |
| Terceirizacao real / despesa interna | 1.200,00 / 500,00 |
| Tributo ilustrativo / encargo ilustrativo | 60,00 / 20,00 |
| Retencao ilustrativa (somente caixa) | 102,00 |
| Resultado antes da deducao | 5.020,00 |
| Deducao gerencial unica (20%) | 1.004,00 |
| Resultado gerencial / margem | 4.016,00 / 59,06% |
| Recebimento apos retencoes | 6.698,00 |

## Persistencia e limites reais

- No index completo o IndexedDB NAO e ativado. Nenhum banco e criado pela
  inicializacao ou pelo botao Salvar de Orcamentos.
- O Salvar publico continua retornando
  `PERSISTENCIA_PROPOSTA_SEGURA_INDISPONIVEL`, sem mudar propostas/auditoria.
  Nao se usou `salvarLocal()` como alternativa para esse botao.
- Os demais modulos mantem a persistencia legada original. Nao existe nesta
  integracao uma segunda autoridade IDB sobre a mesma raiz legada.
- O host de ensaio continua disponivel separadamente, mas nao representa o
  aplicativo completo e nao faz parte do pacote.
- Leitura de registros antigos ainda passa pela normalizacao legada ja
  existente. O ensaio preservou valores finais, lucro historico, anexos e
  campos desconhecidos; nao adicionou fechamento gerencial aos antigos.
  O codigo de migrations nao foi alterado.
- Controle de perfil local preservado; nao equivale a autenticacao forte ou
  autorizacao de servidor. Login Google/sync real e escrita operacional de
  todos os modulos nao foram exercitados: nao eram necessarios nem seguros
  para este ensaio. Nao e uma certificacao geral multiusuario.

## Pacote e evidencias

- Gerar: `node tools/package-app-completo.cjs`. A pasta nova e o inventario
  SHA-256 externo sao impressos no terminal. Somente arquivos estaticos
  rastreados entram na allowlist. Nao publicar a raiz inteira do workspace.
- Evidencias finais desta execucao ficam fora do pacote, em
  `C:/Users/Alan/Documents/Codex/mtz-integracao-completa-436-20261124-final`.
- Regressoes: pastas irmas com sufixos `-usabilidade` e `-idb`.
- Preview local completo: `node tools/test-app-completo.cjs --serve`, origem
  `http://127.0.0.1:54146/`. Usar somente dados ficticios e nunca importar backups
  reais. Playwright precisa estar disponivel via `MTZ_PLAYWRIGHT` para este tool.

## Backup e retorno antes de qualquer publicacao futura

1. Autorizacao expressa para publicar somente a atualizacao de interface/PDF;
   isso nao autoriza habilitar IDB ou migrar bases reais.
2. Responsavel suspende gravacoes/sync, fecha todas as abas e PWAs antigos em
   cada computador e guarda backups independentes pelo fluxo ja existente.
   Conferir integridade e capacidade de restauracao em copia isolada antes
   de qualquer mudanca. Nenhum backup de usuario foi lido ou criado aqui.
3. Preservar bundle Git, pacote da versao publica e inventario do novo pacote.
   Os dados permanecem no armazenamento original; nao executar importacao,
   preflight de dados reais, limpeza, recalculo ou adocao automaticamente.
4. Apos autorizacao, atualizar o codigo completo, verificar caches e reabrir
   somente a nova versao. Se qualquer verificacao falhar, suspender uso.
5. Retorno de codigo: republicar o pacote conhecido de e7e56d075 pelo fluxo
   normal, sem force push, reset destrutivo ou limpeza de armazenamento.
   Restauracao de dados, se realmente necessaria, exige autorizacao propria,
   validacao do backup e conciliacao de alteracoes posteriores; nunca restaurar
   cegamente um snapshot antigo por cima de trabalho novo.

## Veredito

Preparado para revisao e publicacao controlada das melhorias no aplicativo
completo, mantendo os bloqueios atuais. NAO preparado para liberar o Salvar
IDB publico sobre dados existentes sem adocao e corte dos escritores antigos
especificamente autorizados. Nenhuma publicacao ou migracao foi executada.
