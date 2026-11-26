# Proxy HTTPS Render Free e preparacao de push

Escopo: homologacao sintetica, uma instancia Free, hostname nativo onrender.com.
Nenhum push, deploy ou recurso externo e executado por esta preparacao.

## Fronteira de confianca

O controle anterior exigia identificar o peer de um proxy HTTP por CIDRs.
Isso continua necessario para um proxy generico, mas nao e a unica forma de
operar com HTTPS terminado em infraestrutura gerenciada.

Garantias oficiais do Render consultadas:
- A porta HTTP da instancia nao e diretamente acessivel pela internet.
- O balanceador redireciona HTTP publico para HTTPS antes de encaminhar HTTP
  internamente. A criptografia publica termina na borda, nao no processo Node.
- Web services Free nao recebem trafego da rede privada e nao escalam para
  mais de uma instancia.
- RENDER, RENDER_SERVICE_TYPE, RENDER_EXTERNAL_URL e RENDER_EXTERNAL_HOSTNAME
  sao metadados definidos no ambiente do servico pelo Render.

Com base nessas garantias, DEPLOYMENT_TARGET=render habilita uma politica de
transporte ESPECIFICA da plataforma. Nao tenta adivinhar o protocolo original
por headers. A configuracao e responsabilidade do operador confiavel, assim
como a escolha de certificado ou proxy em outro ambiente; nao e atestacao
criptografica de que um processo esta no Render.

## Controles implementados

- Opt-in explicito; nao e habilitado automaticamente pela presenca de header.
- Exige RENDER=true, RENDER_SERVICE_TYPE=web e PORT valido.
- URL publica HTTPS, hostname nativo onrender.com, sem credenciais, porta
  alternativa, caminho ou parametros; URL e hostname devem ser coerentes.
- PUBLIC_ORIGIN e opcional nesse modo. Se presente, deve corresponder exatamente
  a mesma origem. Nenhum dominio/callback e construido com Host ou forwarded.
- TLS_CERT_FILE, TLS_KEY_FILE e TRUSTED_PROXY_CIDRS nao podem ser misturados ao
  modo Render. Nao aceitar 0.0.0.0/0, ::/0 ou faixas privadas genericas.
- Host recebido deve corresponder a autoridade fixa; Host duplicado e pedido
  absoluto/protocol-relative ou com barra invertida sao recusados.
- Origin falso e recusado; POST sem Origin exato tambem. CSRF nao foi relaxado.
- X-Forwarded-Proto, X-Forwarded-Host, X-Forwarded-For e Forwarded sao ignorados
  para protocolo, dominio e identidade/IP nesse modo. O rate limit continua
  usando o peer TCP, portanto pode agregar vendedores no mesmo proxy. Nao e
  contornavel apenas mudando X-Forwarded-For.
- Cookies continuam __Host-, HttpOnly, Secure e SameSite=Strict; HSTS e CSP
  continuam ativos. Nao ha cookies inseguros por causa do salto HTTP interno.
- Fora do modo Render, HTTP continua exigindo peer explicitamente confiavel
  e X-Forwarded-Proto=https, ou TLS direto. Nao existe fallback permissivo.

Nao reutilizar essa politica em servidor exposto diretamente, instancia com
entrada privada adicional, outro provedor ou outra topologia. A homologacao
online devera verificar o redirecionamento HTTP publico e headers realmente
servidos, sem ativar logs de URLs/corpos que contenham credenciais temporarias.
Dominio personalizado e escala/rede privada exigem avaliacao propria; nao
foram habilitados nesta correcao.

## Configuracao do futuro servico

Branch: poc/orcamentos-online-prep-20261124. Root Directory vazio (raiz do repo).
Runtime Node 24; Free; uma instancia; Auto-Deploy desativado; sem comando pre-deploy.
Health Check Path vazio para verificacao TCP inicial. Nao adicionar /health
inexistente nem executar schema/seed no build/start.

Build:
```sh
npm --prefix poc/central-orcamentos ci --omit=dev --ignore-scripts --no-audit --no-fund
```
Start:
```sh
node poc/central-orcamentos/server.mjs
```

Variaveis a configurar no painel:
```text
APP_ENV=homologation
DEPLOYMENT_TARGET=render
SUPABASE_URL=https://ktinjxvpzhlqalucbeaa.supabase.co
SUPABASE_AUDIENCE=authenticated
SUPABASE_JWT_ALGORITHMS=ES256
SUPABASE_PUBLISHABLE_KEY=preencher no gerenciador seguro
DATABASE_URL=conexao restrita orc_app com TLS verificado
```

PORT, RENDER e os demais metadados RENDER_* sao fornecidos pelo provedor; nao
copiar valores ficticios de teste para o painel. Omitir PUBLIC_ORIGIN: a API
usa RENDER_EXTERNAL_URL validada. Omitir TRUSTED_PROXY_CIDRS e TLS_CERT/KEY_FILE.
Configurar PG_CA_FILE via arquivo seguro apenas se a CA SQL precisar ser fornecida.
Nunca colocar ADMIN_DATABASE_URL, service_role ou chave de backup na API.
Configuracao PostgreSQL, privilegios e marcador do schema continuam verificados
antes de abrir a porta. Falta de schema/role nao provoca criacao automatica.

Site URL futura = RENDER_EXTERNAL_URL (sem barra final).
Redirect URL futura = RENDER_EXTERNAL_URL + /auth/confirm.
Templates de convite/recuperacao em AUTH.md. Configurar no projeto exclusivo
somente apos existir o endereco e mediante autorizacao.

## Evidencias focais

- npm run test:proxy: 6 cenarios aprovados, zero reprovados (7 com agrupador).
  Configuracoes incompletas/incoerentes recusadas; HTTP interno Render; forwarded
  manipulado nao muda origem; Host/Origin/CSRF e pedidos ambiguos recusados;
  modo generico continua restrito; limite nao e burlado por X-Forwarded-For.
  Gateway HTTPS local com certificado verificado encaminhou HTTP ao backend;
  login, cookies Secure, sessao e logout mantiveram o comportamento esperado.
- npm run test:auth: 7 cenarios aprovados, zero reprovados (8 com agrupador).
  Convite, senha, recuperacao, expiracao, CSRF, logout e UI original preservados.
- Relatorios em reports/proxy/resultado.json e reports/auth/resultado.json,
  ignorados pelo Git. Dados ficticios; nenhum Supabase/Render real conectado.
- Nao repetidos testes gerais de SQL, calculos ou PDFs; esses componentes nao
  foram alterados. O teste de proxy usa um servico de identidade de ensaio;
  a bateria auth valida JWT/JWKS reais em HTTPS local, nao o provedor hospedado.

## Push preparado, NAO executado

Depois do commit local, conferir branch, diferencas rastreadas e remoto:
```sh
git branch --show-current
git status --short
git ls-remote --heads origin refs/heads/poc/orcamentos-online-prep-20261124
```
Antes da autorizacao de push, verificar tambem que nao ha automacao de deploy
vinculada a essa branch. Se o remoto contiver commits desconhecidos, interromper
e comparar; nao forcar atualizacao, apagar historico ou empurrar para main.

Com autorizacao ESPECIFICA, e somente estando na branch indicada:
```sh
git push origin refs/heads/poc/orcamentos-online-prep-20261124:refs/heads/poc/orcamentos-online-prep-20261124
```
Nao foi executado. A criacao do Web Service dispara a primeira publicacao e
tambem requer autorizacao especifica; nao clicar em Deploy Web Service agora.

Bloqueio de CIDRs removido para a topologia documentada. Ainda faltam autorizacao
de push/deploy, schema e membros de teste no Supabase, segredos no servidor,
templates/URLs e verificacao final NA HOSPEDAGEM. Nao e declaracao de deploy
aprovado antes desses passos. Producao, main, Pages, Cloudflare e dados reais
continuam intactos.

Fontes oficiais:
- https://render.com/docs/web-services#port-binding
- https://render.com/docs/web-services#connecting-from-the-public-internet
- https://render.com/docs/tls
- https://render.com/docs/free
- https://render.com/docs/environment-variables
