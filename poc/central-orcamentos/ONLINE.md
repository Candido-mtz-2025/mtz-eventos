# Preparacao da homologacao online

Base: 2997dc9744bac494ca62ae85f984727c6218b677. Somente dados ficticios.
Nenhum projeto Supabase, hospedagem, conta, migracao ou deploy foi criado.
O index publico, o nucleo financeiro e os 37 contratos permanecem preservados.
Somente proposta.criar.v1 e proposta.editar.v1 sao aceitos pela API.

## Entradas separadas

- `npm start`: demo HTTP loopback, cluster novo e emissor sintetico; NUNCA expor.
- `npm run start:online`: server.mjs, somente APP_ENV=homologation e configuracao
  explicita. Falha sem origem HTTPS, JWT assimetrico, TLS SQL, role minima e
  schema preparado. Nao importa bootstrap, fixture ou emissor de desenvolvimento.
- `node admin.mjs ...`: administracao separada, com autorizacao explicita.
- `npm run test:online`: laboratorio sintetico HTTPS + PostgreSQL TLS reais.

A API online serve o index completo e os scripts das 17 abas da mesma arvore do
repositorio. Nenhuma segunda aplicacao foi criada. PWA fica desativada para nao
persistir codigo antigo. Origem com service worker anterior e recusada, sem
apaga-lo. Estado confirmado e imutavel; importar, sincronizar e salvar legado
nao sao alternativas. Demais modulos ficam em leitura, nao centralizados.

## Identidade, empresa e comandos

Login com e-mail/senha em formulario existente adaptado; servidor troca essas
credenciais com Supabase Auth por HTTPS. Nao ha cadastro, OAuth, MFA ou reset de
senha implementados nesta etapa. Nao usar GitHub Pages como origem/callback.
Tokens ficam em cookies __Host-, HttpOnly, Secure e SameSite=Strict; nao passam
para JSON, URLs ou localStorage. Ha renovacao e logout no servidor.

JWT: issuer exato /auth/v1, audience explicita, assinatura RS256/ES256 conforme
configuracao, typ JWT, sub UUID, iat/exp, role authenticated e nao anonimo. JWKS
somente da URL configurada do provedor; nenhum jku/claim escolhe a fonte.
HS256 legado nao e aceito. Identidade interna usa somente issuer/sub; empresa,
ativo e permissoes sao consultados no SQL em cada operacao e recuperacao.
Claims de permissoes/empresa enviados pelo cliente nao concedem acesso.

RLS FORCE e orc_app sem superusuario, BYPASSRLS, criacao de roles/bancos ou
alteracao de membros/politicas/journal/recibos. Revisao esperada, locks, replay,
idempotencia, auditoria e recibo continuam no servico anterior, na mesma
transacao. Nao foi criada outra implementacao dos comandos.

Empresa A deve aceitar explicitamente a politica mtz-gerencial-v2-20:1.
Empresa B, sem politica aprovada, continua sem escrita e nao carrega o calculador
MTZ na UI. Nao foi introduzida deducao de 20% para outras empresas.

## Configuracao e conexao futura

1. Apos autorizacao do proprietario, criar projeto Supabase EXCLUSIVO de
   homologacao e hospedagem Node 24+, sem integrar dados ou dominios de producao.
   A API e a interface usam UMA origem HTTPS nova. Cadastro publico deve ficar
   desabilitado no provedor; criar tres contas de teste controladas.
2. Preencher variaveis do modelo .env.example no gerenciador de segredos da
   hospedagem, nao no navegador/Git. O arquivo nao e carregado implicitamente.
   Fixar issuer/audience/JWKS/algoritmo conforme configuracao real do projeto.
   Registrar somente essa origem para confirmacao/recuperacao no Supabase;
   esses fluxos ainda exigem configuracao e validacao externa.
3. DATABASE_URL usa usuario orc_app (ou orc_app.PROJECT no pooler) e senha
   exclusiva. Preferir conexao direta ou pooler de sessao. Nao incluir sslmode,
   sslrootcert, sslkey, sslcert ou options na URL: poderiam substituir o objeto
   TLS do driver. rejectUnauthorized permanece true; configurar PG_CA_FILE
   se a CA do provedor nao estiver no trust store. Validar DNS/cadeia reais.
4. TLS da API: certificado/chave diretos OU proxy de terminacao HTTPS com CIDRs
   de origem documentados em TRUSTED_PROXY_CIDRS e acesso direto ao backend
   bloqueado pela hospedagem. Nunca usar 0.0.0.0/0, ::/0 ou confiar genericamente
   em X-Forwarded-Proto. Se a hospedagem nao permitir comprovar esses controles,
   nao publica-la com esta configuracao. Host e Origin devem ser exatos.
5. Apenas o operador recebe ADMIN_DATABASE_URL, ADMIN_EXPECTED_HOST,
   ORC_APP_PASSWORD forte e CONFIRM_SYNTHETIC_ADMIN=yes. Nao entregar essas
   credenciais nem BACKUP_KEY_BASE64 ao processo runtime. Confirmar permissao
   do administrador gerenciado para CREATE ROLE/SCHEMA/SET ROLE; essa operacao
   ainda nao foi validada no Supabase real. Nunca substituir por role privilegiada
   na API se o provisionamento for recusado.
6. No banco novo, vazio e autorizado, preparar esquema explicitamente:

```powershell
$env:APP_ENV='homologation'
$env:CONFIRM_SYNTHETIC_ADMIN='yes'
# Definir credenciais administrativas somente neste processo protegido.
node admin.mjs apply-schema
# Arquivo privado com tres objetos {"subject":"UUID_REAL_DO_AUTH_DE_TESTE"}.
node admin.mjs seed-demo CAMINHO_PRIVADO_MEMBROS_JSON
```

apply-schema recusa schema existente; nao cria banco. seed-demo recusa base
preenchida, cria empresas ficticias A/B e vincula os tres sujeitos reais de Auth
a A com ler_aplicativo/ler_propostas/criar_proposta/editar_proposta. Nao cria
usuarios no Auth nem aceita membros do navegador. B nao herda a politica MTZ.
Os exemplos nao devem ser executados sem autorizacao externa especifica.

7. Iniciar `npm run start:online` com segredos operacionais apenas. SQL nao e
   exposto ao navegador. CSP limita conexoes a mesma origem, sem CORS aberto;
   cookies exigem Origin exato para POST. API limita corpo a 256 KB, pedidos a
   240/min/IP, login a 5/min/IP e refresh a 20/min/IP; cabecalhos/tempo limitados.
   Logs contem somente requestId, metodo, status e duracao, sem corpos, tokens,
   e-mails, rotas/identificadores ou URLs SQL. Nao habilitar logs HTTP/SQL de
   corpos/segredos na hospedagem. Limites em memoria sao por instancia; atras de
   proxy o IP observado pode agregar usuarios. Escala exige limite de borda.
8. Validar login real, emissor/rotacao, conexao SQL, permissoes, tres usuarios,
   revogacao e restore nessa infraestrutura ANTES de liberar homologacao externa.
   Servir estaticos publicos nao concede acesso aos dados: API exige identidade.

## Backup independente e restauracao

Implementado e testado: backup LOGICO MANUAL consistente das sete tabelas orc,
em REPEATABLE READ READ ONLY, criptografado AES-256-GCM, hash SHA-256 do conteudo
e do arquivo. Preserva snapshots textuais, genesis, usuarios internos, vinculos,
journal, auditoria e recibos. Nao substitui backup fisico/PITR e nao abrange
Supabase Auth, arquivos Storage, anexos externos ou segredos de infraestrutura.
Referencias/bytes ja incluidos no snapshot sao preservados, nao baixados.

1. Operador usa credencial separada de backup, capaz de ler todas as empresas
   (BYPASSRLS/superusuario; nunca na API), marcador de homologacao conferido.
   Definir chave aleatoria de 32 bytes em BACKUP_KEY_BASE64 por canal protegido.
   Nao guardar a chave junto ao arquivo nem imprimi-la em logs.
2. Executar `node admin.mjs backup CAMINHO_PRIVADO_ARQUIVO_ENCRIPTADO`.
   Nao sobrescreve arquivo existente. Registrar SHA-256 retornado; conferir com
   `Get-FileHash -Algorithm SHA256 -LiteralPath CAMINHO_PRIVADO_ARQUIVO_ENCRIPTADO`.
3. Copiar o arquivo ENCRIPTADO e o hash para armazenamento independente com
   acesso restrito/versionamento. Essa copia externa e manual, requer autorizacao
   e nao foi executada. Definir responsavel, frequencia, retencao e guarda da chave.
4. Em cluster PostgreSQL local separado, novo e vazio, sem conexao com ambientes
   ativos, preparar a MESMA versao do schema.sql. Exemplo, somente nesse destino:
   `psql $env:RESTORE_DATABASE_URL -v ON_ERROR_STOP=1 -f schema.sql`.
   Roles globais orc_owner/orc_app devem estar ausentes nesse cluster de ensaio.
5. Definir RESTORE_DATABASE_URL de loopback e chave pelo canal seguro; executar
   `node admin.mjs restore-isolated CAMINHO_PRIVADO_ARQUIVO_ENCRIPTADO`.
   Confere GCM/hash/schema antes de gravar, recusa destino nao vazio e restaura
   as sete tabelas em UMA transacao com locks. Falha implica rollback, sem limpar
   destino. O CLI nao permite restaurar em host remoto.
6. Comparar todas as linhas, IDs, revisoes, snapshots e recibos, nao apenas
   contagens. Testar leitura/replay usando o servico no destino e acesso de teste
   com emissor controlado; nao transportar senhas/contas reais. Aprovar somente
   se hash, comparacao e recuperacao coincidirem.

Nao ha agendador, copia off-site automatica, rotacao de chaves ou backup do
provedor implementados. RPO/RTO nao medidos. Nao declarar backup automatico pronto.

## Evidencias focais locais

`reports/online/resultado.json`: 12 cenarios aprovados, zero reprovados (o runner
Node contabiliza 13 testes incluindo o agrupador). Laboratorio usa CA de teste,
HTTPS e PostgreSQL TLS reais, emissor fixture compativel com JWT Supabase;
NAO e conexao com Supabase. Certificado nao confiavel e recusado pelo servidor.
ignoreHTTPSErrors e usado somente no navegador do ensaio com certificado local.

- Configuracao fail-closed, algoritmos/claims invalidos, assinatura adulterada,
  issuer/audience/exp/typ errados e JWKS com CA nao confiavel recusados.
- RS256/ES256, cookies seguros, login/refresh/logout; emissor local ausente online.
- Banco via TLS com CA verificada, CA errada/role privilegiada recusadas.
- Acesso cruzado, permissao fabricada e revogacao (inclusive apos token emitido).
- Tres usuarios leem a mesma revisao. Criacao, idempotencia, recibo e conflito;
  outros comandos recusados. Rollback apos journal sem estado/recibo parcial.
- HTTPS obrigatorio, proxy nao confiavel, Origin, corpo 413, login 429 e logs.
- Backup encriptado e restore em SEGUNDO cluster, igualdade linha a linha das
  sete tabelas; chave/hash incorretos e destino nao vazio recusados.
- Seed administrativo recusa dados existentes.
- Navegacao das 17 abas, criar, recarregar, recuperar e editar pela UI original;
  sem erros JS, sem mtzBackup/IndexedDB criados. Telas desktop/celular preservadas
  em reports/online. CDNs bloqueados no ensaio, portanto icones nao avaliados.

Exemplo preservado: faturamento 6800, custos 1700, tributo ILUSTRATIVO 60,
encargo ILUSTRATIVO 20, retencao ILUSTRATIVA 102, base gerencial positiva 5020,
deducao unica 1004 e resultado 4016. Nao sao parametros reais da MTZ.
125 declaracoes do calculador original/gerado identicas por comparador AST.
Permanece a divergencia PREEXISTENTE de 15 hashes do manifesto bruto descrita
no README; isso nao e uma aprovacao do --check do gerador original.
Os 50 testes anteriores e PDFs nao foram repetidos: fluxos/documentos intactos.

## Pendencias reais e autorizacoes

Autorizar criacao/uso de conta Supabase e hospedagem HTTPS isoladas, dominios,
custos se houver e tres contas ficticias. Fornecer configuracao publica oficial,
segredos pelo gerenciador da hospedagem, CA e topologia segura de proxy. Autorizar
schema/seed e posterior deploy SEPARADAMENTE. Definir operador e destino de backup.
Requer teste real com Auth/provedor SQL e privilegios gerenciados. Login somente
senha, uma empresa por sessao, dois comandos, replay integral e raiz serializada
continuam limites da prova, nao uma plataforma comercial de producao certificada.
GitHub Pages, Cloudflare, Salvar publico, dados reais e migracoes nao foram tocados.

Referencias oficiais consultadas:
- https://supabase.com/docs/guides/auth/jwts
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://node-postgres.com/features/ssl
