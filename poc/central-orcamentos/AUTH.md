# Login, convite e recuperacao - homologacao isolada

Projeto informado pelo proprietario: ktinjxvpzhlqalucbeaa (mtz-homolog-central).
Somente codigo local e testes ficticios. Nenhum usuario, convite, e-mail ou
configuracao foi criado/alterado no projeto real nesta execucao. Sem deploy.

## Implementacao

- auth-ui.mjs adapta somente a area de login do index completo. As 17 abas
  continuam no mesmo aplicativo; nao e outra interface reduzida.
- auth.mjs usa REST Supabase Auth: /token, /verify, /recover, /user e /logout.
  Usa somente chave publishable do servidor; nao precisa de service_role.
- auth-http.mjs controla os endpoints /api/auth/*, cookies e contexto restrito
  de senha. http.mjs serve /auth/confirm e aplica HTTPS/Host/Origin/CSP/no-store.
- server.mjs fornece a origem configurada ao envio de recuperacao. ui.mjs
  mantem o transporte de Orcamentos e usa o novo formulario apenas online.
- JWT continua sendo validado por assinatura, issuer, audience, algoritmo,
  exp/iat e JWKS configurados. Toda requisicao autenticada online tambem consulta
  GET /auth/v1/user no provedor e confere o ID com o sub validado. Indisponibilidade
  do provedor bloqueia acesso; nao existe fallback para identidade do navegador.
- O vinculo, situacao e permissoes continuam sendo consultados no SQL pelo
  servico existente. Auth nao cria empresa, membro ou permissao automaticamente.
  Receber convite/definir senha nao e autorizacao para consultar orcamentos.

## Fluxo de convite e senha

1. Apos hospedagem/configuracao e autorizacao FUTURA, um administrador convida
   uma conta ficticia controlada. Nao ha endpoint publico de criar usuarios.
2. O template envia o usuario para /auth/confirm com token_hash e type=invite.
   GET apenas abre a pagina; nao consome o link automaticamente. O JS remove
   query/fragmento do historico e so usa o hash em memoria ate a confirmacao.
3. Usuario clica Continuar. O servidor envia POST /verify ao Supabase, verifica
   JWT e identidade no provedor. Link incorreto, expirado ou reutilizado e recusado.
4. A resposta cria APENAS um cookie opaco __Host-central_password, HttpOnly,
   Secure e SameSite=Strict. Tokens de Auth ficam em memoria do servidor, nunca
   no JSON/URL/localStorage do navegador. Esse cookie nao autentica a API de dados.
5. Usuario digita senha e confirmacao. UI exige igualdade; servidor exige de
   12 a 1024 caracteres e deixa a politica adicional de senha a cargo do Supabase.
   PUT /user envia somente password, nunca metadados, empresa ou permissoes.
6. Apos sucesso, o contexto e consumido, cookies removidos e logout global
   solicitado no provedor. Usuario volta ao login e digita a senha nova.
   Se a senha mudou mas o logout global falhou, a UI informa a falha explicitamente.
7. Login so concede cookies de aplicativo se houver identidade valida e ao
   menos um vinculo de empresa de leitura retornado pelo banco. Criar/editar
   exige suas permissoes especificas novamente em cada transacao SQL.

O link antigo, que usava localhost e o template padrao com sessao no fragmento,
nao e convertido/reutilizado por este fluxo. Apos configurar a hospedagem,
novos links serao necessarios mediante autorizacao. Nao reenviamos nenhum agora.

## Recuperacao e logout

- Esqueci minha senha solicita /api/auth/recover. O servidor fixa redirect_to
  em PUBLIC_ORIGIN + /auth/confirm. Nao aceita URL de retorno do navegador.
- A mensagem e a mesma para conta existente/inexistente ou recusa do provedor,
  evitando enumeracao. Nao prova entrega do e-mail. Falha de rede tem aviso
  generico e ha limite local de solicitacoes. CAPTCHA no provedor, se habilitado,
  requer integracao propria antes de usar esse formulario; nao deve ser desligado
  indiscriminadamente para fazer testes passarem.
- O template Reset password usa type=recovery. A verificacao/definicao de senha
  segue o mesmo contexto restrito e exige novo login ao final.
- Sair limpa cookies de aplicativo, refresh e senha, invalida o contexto local
  e solicita logout local ao Supabase. A API recusa reapresentacao do mesmo JWT
  encerrado nesta instancia. Falha de logout remoto nao e apresentada como sucesso.
- A revogacao local de JWT e o contexto de senha sao em MEMORIA, por instancia.
  Reinicio perde o contexto e exige outro link; a troca de senha nunca e repetida
  automaticamente. Em perda de resposta, tentar login com a senha nova antes de
  nova solicitacao. Nao ha garantia de revogacao imediata de todos os JWTs emitidos
  antes de logout em outras instancias/reinicios: limitar a validade dos access
  tokens no projeto e manter a homologacao com uma instancia. Nao e certificacao
  de seguranca multi-instancia para producao. Revogacao de membros no SQL continua
  efetiva para novas operacoes independentemente de logout/JWT.

## Configuracao exata apos existir a hospedagem

A origem de hospedagem ainda NAO existe. Nao inventar URL nem usar GitHub Pages.
Defina H como a URL HTTPS REAL do servico, sem barra final, caminho ou parametros.
Exemplo de formato APENAS: https://HOST_REAL_DA_HOMOLOGACAO.

No servidor:

```text
APP_ENV=homologation
PUBLIC_ORIGIN=H
SUPABASE_URL=https://ktinjxvpzhlqalucbeaa.supabase.co
SUPABASE_AUDIENCE=authenticated
SUPABASE_JWT_ALGORITHMS=ES256 ou RS256, conforme a chave ATIVA do projeto
SUPABASE_PUBLISHABLE_KEY=configurar no gerenciador de segredos
DATABASE_URL=credencial restrita orc_app, TLS validado
```

H e uma substituicao documental, nao um valor literal valido. Algoritmos nao sao
escolhidos por suposicao. Configuracao de TLS/proxy continua exigida em ONLINE.md.

Supabase -> Authentication -> URL Configuration:

| Campo | Valor exato apos substituir H |
| --- | --- |
| Site URL | H (sem barra final) |
| Redirect URLs | H/auth/confirm |

Nao incluir localhost:3000, URLs da producao ou curingas nessa lista de
homologacao online. Depois de configurar os valores, conferir como foram salvos.

Supabase -> Authentication -> Email Templates -> Invite user:

```html
<h2>Convite para homologacao MTZ Eventos</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=invite">Definir minha senha</a></p>
```

Email Templates -> Reset password:

```html
<h2>Recuperar senha da homologacao</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Definir nova senha</a></p>
```

Nao manter ConfirmationURL nesses DOIS links: o fluxo padrao verifica antes de
chegar a aplicacao e usa fragmento de URL, que este callback nao aceita. Nao
alterar templates dos demais fluxos nem enfraquecer confirmacao de e-mail.
Hash/links de convite sao credenciais temporarias: nao enviar pelo chat, registrar
em logs de URL/query da hospedagem, capturar em screenshots ou incluir no Git.

Manter Email habilitado, cadastro publico/anonymos desabilitados, confirmacao
de e-mail habilitada e minimo de 12 caracteres. Verificar limites/destinatarios
permitidos do envio de e-mail Free. SMTP proprio nao foi contratado/configurado.

## Testes e limites

- npm run test:auth: 7 cenarios focais aprovados (8 com agrupador do runner).
  HTTPS local, provedor fixture compativel com REST/JWT, ES256 real. GET nao
  consome convite; convite/senha/reutilizacao/expiracao, recuperacao sem enumeracao,
  CSRF, consulta ao provedor, logout e percurso visual de login foram testados.
- npm run test:online: 12 cenarios de regressao focal aprovados (13 no runner).
  PostgreSQL TLS real, isolamento entre empresas, revogacao SQL, atomicidade,
  recibos, criacao/edicao e preservacao das 17 abas. Nao e nova auditoria geral.
- Relatorios/screenshots sinteticos em reports/auth e reports/online (ignorados
  pelo Git); senhas e tokens nao sao incluidos nos relatorios.
- Nenhum teste criou usuario, enviou convite ou e-mail no Supabase real. Os
  novos endpoints de senha nao acessam dados reais. Nenhum calculo, contrato
  certificado, schema ou IndexedDB foi alterado.

Pendencias: hospedagem HTTPS autorizada e proxy confiavel; schema/roles e membros
no banco de homologacao mediante autorizacao; segredos no servidor; templates e
URLs no painel; validacao externa de entrega/expiracao/rotacao e tres usuarios.
Nenhum deploy, push, conta nova, convite real ou alteracao em producao foi feito.

Referencias oficiais verificadas:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://github.com/supabase/auth/blob/master/openapi.yaml
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/reference/javascript/auth-updateuser
