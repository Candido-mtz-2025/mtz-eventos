# Aplicacao administrativa do schema privado no Supabase

Destino autorizado para preparacao: mtz-homolog-central, ktinjxvpzhlqalucbeaa.
Esta revisao NAO aplica SQL, cria usuarios Auth ou insere registros no Supabase.
Testes sao exclusivamente DDL/permissoes num cluster local novo, sem registros
de negocio. O aplicador nao e importado pela API e nao roda no build/start.

## Propriedade e participacoes

O schema/tabelas/funcoes pertencem a orc_owner (NOLOGIN, NOSUPERUSER, NOBYPASSRLS).
O instalador recebe somente a participacao temporaria necessaria para SET ROLE.
Em PG16+, o grant explicito usa SET TRUE e INHERIT FALSE, sem ADMIN OPTION.
As ACLs sao ajustadas enquanto CURRENT_USER=orc_owner; depois RESET ROLE e REVOKE
removem a participacao temporaria antes do commit.

createrole_self_grant e limpo apenas com SET LOCAL no PG16+, para nao herdar
SET/INHERIT automaticos de uma configuracao do administrador. O valor original
volta ao encerrar a transacao. No PG15, a participacao convencional e revogada
ao final; esse ramo existe por compatibilidade, mas nao foi executado no ensaio
com PostgreSQL 18.4. Nenhum upgrade do provedor e realizado automaticamente.

PG16+ atribui ao criador nao superusuario uma participacao administrativa
automatica registrada pelo bootstrap, com ADMIN TRUE, SET/INHERIT FALSE. Ela
NAO foi criada pelo grant temporario, e nao concede leitura/SET do proprietario.
Ela pode permanecer, como autoridade nativa do administrador sobre roles que
criou. Nao se promete remover capacidades inerentes a CREATEROLE do instalador.
O ensaio confirma a ausencia de SET/INHERIT e do grant explicito temporario.
orc_app nunca recebe participacao em orc_owner nem capacidade de gerir roles.

## Acesso e Data API

- PUBLIC, anon, authenticated, authenticator e service_role ficam sem privilegios
  no schema, tabelas, funcoes e sequencias orc (roles ausentes no laboratorio
  generico sao ignoradas, nao criadas pelo schema).
- Funcoes futuras de orc_owner nao herdam EXECUTE de PUBLIC. A revogacao e no
  default GLOBAL dessa role: REVOKE somente por schema nao remove o default
  global de EXECUTE. Defaults de tabelas/sequencias tambem ficam privados.
- Seis tabelas continuam com FORCE RLS. users continua privada, sem SELECT para
  orc_app; a resolucao de identidade usa o helper SECURITY DEFINER existente,
  com search_path fixo, sem acesso por roles da Data API.
- orc_app recebe somente leitura operacional, UPDATE de revision/snapshot_text
  em state e INSERT de journal/receipts/audit, sem alterar/apagar evidencias,
  usuarios, membros ou politicas. Os comandos e o servico SQL nao foram alterados.

O DDL recusa orc em pgrst.db_schemas da sessao ou nas configuracoes persistidas
do banco/roles. Isso nao le configuracao externa/env do PostgREST. Portanto o
aplicador tambem exige CONFIRM_ORC_NOT_EXPOSED=yes, apos o operador conferir
Data API -> Exposed schemas no painel correto. Nao adicionar orc a essa lista.
O instalador NAO altera a lista global nem configs de outros schemas.
Mesmo se orc for exposto por engano, as ACLs impedem acesso pelas roles da API.
Nao afirmar que o painel real foi verificado nesta execucao local.

## Procedimento futuro, somente com autorizacao especifica

1. Confirmar projeto ktinjxvpzhlqalucbeaa, plano Free e banco exclusivo de
   homologacao. Verificar que orc, orc_owner e orc_app nao existem. Se houver
   qualquer um, interromper; nao excluir nem reutilizar objetos automaticamente.
2. No painel desse projeto, verificar que orc nao esta em Exposed schemas.
   Se estiver, interromper e solicitar autorizacao para corrigir a configuracao.
3. Usar uma conexao administrativa segura do painel Connect, com TLS e CA
   validada. Preferir conexao direta; se precisar de IPv4, Session Pooler sem
   adicional pago. Conferir referencia do projeto no host/usuario da conexao.
   O administrador precisa CREATEROLE e CREATE no banco, sem exigir SUPERUSER.
   As permissoes efetivas do projeto real ainda nao foram consultadas por SQL.
4. No processo administrativo LOCAL protegido, preencher segredos fora do Git,
   sem coloca-los no historico do terminal/chat. Variaveis necessarias:

```text
APP_ENV=homologation
CONFIRM_SYNTHETIC_ADMIN=yes
CONFIRM_ORC_NOT_EXPOSED=yes
ADMIN_DATABASE_URL=conexao administrativa do projeto correto
ADMIN_EXPECTED_HOST=hostname exato dessa conexao
ORC_APP_PASSWORD=senha exclusiva forte, pelo menos 24 caracteres
PG_CA_FILE=arquivo da CA, se necessario
```

5. No diretorio poc/central-orcamentos, executar SOMENTE:

```powershell
node admin.mjs apply-schema
```

Tudo e uma transacao unica na mesma conexao: verificacao de destino vazio,
schema, participacao temporaria, ACLs, revogacao e habilitacao do login orc_app
com senha fornecida. Nenhum INSERT e executado. O SQL isolado cria orc_app
NOLOGIN; apenas esse comando administrativo o habilita apos o DDL aprovado.
Nao executar schema.sql solto com autocommit, nem via API publica/start do Render.

6. Apos commit, validar catalogo, propriedade, roles, ACLs e sete tabelas vazias;
   verificar novamente Exposed schemas no painel. Entregar ao servidor apenas
   DATABASE_URL de orc_app. Nao entregar senha administrativa nem CREATEROLE.
7. Remover segredos/flags do processo administrativo ao terminar. Nao criar
   usuarios, rodar seed-demo ou convidar pessoas como parte de apply-schema.

## Recuperacao

Erro antes do COMMIT provoca rollback inclusive das novas roles e participacoes.
Schema ou roles preexistentes provocam recusa sem sobrescrever. Se a conexao cair
durante COMMIT, nao repetir cegamente: verificar catalogo, marker e permissoes
com acesso administrativo autorizado, sem copiar dados nem apagar objetos.
Instalacao encontrada completa deve ser verificada, nao reaplicada. Estado
inconsistente exige diagnostico especifico e nova autorizacao, sem DROP CASCADE.

O hash do arquivo schema.sql faz parte do formato de backup existente. Arquivos
de backup anteriores exigem a versao correspondente para restauracao isolada;
nao editar hashes para forcar compatibilidade. Nenhum backup real e executado.
Seed/backup administrativos futuros ainda precisam de credencial com ACLs e
capacidade de atravessar FORCE RLS apropriadas. A participacao de proprietario
nao e deixada ativa para simular essa autorizacao; nao elevar orc_app para isso.
Essa verificacao de seed/backup e separada da instalacao vazia autorizada aqui.

## Evidencias

npm run test:schema: 7 cenarios aprovados, zero reprovados (8 com agrupador).
PostgreSQL local 18.4, administrador NOSUPERUSER/NOBYPASSRLS/NOINHERIT; confirmacao
e senha obrigatorias; exposicao detectada na sessao e na role authenticator;
rollback injetado apos DDL; SET/INHERIT temporarios removidos mesmo com auto-grant
habilitado; roles da API sem acesso (inclusive service_role com BYPASSRLS);
privilegios de orc_app, seis FORCE RLS e privacidade de funcoes futuras; recusa
de reaplicacao. Sete tabelas vazias, sem criacao de contas Auth ou INSERT.
Relatorio em reports/schema/resultado.json, ignorado pelo Git. Nenhuma auditoria
geral, SQL remoto, push, deploy ou alteracao de producao foi realizado.

Fontes oficiais:
- https://www.postgresql.org/docs/17/sql-grant.html
- https://www.postgresql.org/docs/17/sql-createrole.html
- https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html
- https://supabase.com/docs/guides/api/using-custom-schemas
