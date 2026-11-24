# Orcamentos centralizados: prova local e preparacao online

Adaptacoes para homologacao online: [ONLINE.md](ONLINE.md). A entrada `server.mjs`
e separada da demo abaixo; nao cria cluster, chaves, schema ou fixtures no inicio.
O modo online carrega os modulos das 17 abas do aplicativo completo, com leitura
nos demais dominios e somente criar/editar Orcamentos no servidor. A demo local
mantem seu carregamento restrito anterior. Nenhum ambiente externo foi criado.

Somente dados sinteticos. Base de codigo: b21be3aaec1f9a24873dccd8bb6dd0b58ea988f0.
Nenhuma conta Supabase, recurso de nuvem, assinatura ou migracao real e criado.
O index publico, os calculos e os 37 comandos existentes nao sao modificados.

## Implementado

- PostgreSQL 18.4 real, portatil, novo cluster por execucao, somente 127.0.0.1,
  fsync/synchronous_commit/full_page_writes ativos e credenciais aleatorias.
- Node.js 24 com HTTP nativo, pg e jose fixados em package-lock.json.
- Emissor de teste com chave RSA efemera, JWKS fixo em loopback, JWT RS256
  tipado, issuer/audience/sub/iat/exp verificados. Nao ha endpoint publico de
  emissao de identidades nem login por simples escolha de nome.
- Identidade interna resolvida por issuer/sub. Claims de empresa, e-mail,
  papel e permissoes nao concedem autoridade. O tenant da URL e apenas um
  escopo solicitado, validado contra vinculo/permissoes no banco.
- RLS FORCE e role operacional sem superusuario/BYPASSRLS; sem UPDATE/DELETE
  de membros, usuarios, politicas, journal, auditoria ou recibos.
- Aplicacao transacional somente de proposta.criar.v1 e proposta.editar.v1,
  por prepararComandoPropostaTexto e pelo nucleo gerado existente, sem motor novo.
- Raiz completa por empresa, mantendo o contrato dos redutores. O prefixo do
  journal e reconstruido e conferido com raiz, recibos e auditoria em cada
  leitura/comando. Contextos exclusivos de outros dominios nao foram simulados.
- API fornece ator e relogio. Aceita somente o DTO comercial certificado,
  operacaoId, tipo e revisaoEsperada; nao aceita totais/snapshot/metadados finais.
- Estado, journal, auditoria e recibo confirmam na mesma transacao SQL. Lock
  por raiz/empresa, revisao esperada e chave idempotente por empresa. Mesmo
  comando/ator recupera o resultado; outro conteudo/ator recebe conflito.
- Autorizacao antes de idempotencia/recuperacao. Locks de usuario/vinculo
  ordenam revogacao: operacao ja autorizada pode confirmar antes da revogacao;
  depois que ela confirma, novas requisicoes sao negadas.

## Esquema minimo (schema.sql)

| Tabela | Uso |
| --- | --- |
| companies | Identidade, politica explicitamente permitida e genesis sintetico |
| users | Identidade por emissor/sujeito e situacao |
| members | Vinculo, situacao e permissoes por empresa |
| state | Raiz canonica e revisao autoritativa |
| journal | Comando, dados, ator, relogio, politica e snapshots/hashes |
| receipts | Resultado recuperavel, ator e fingerprint idempotente |
| audit | Evidencia associada a operacao/revisao |

Clientes e itens permanecem na raiz do contrato atual, nao em um segundo modelo.
IDs 1 (numero) e "1" (texto) coexistem. Campos futuros e fechamento sao preservados.

## Empresas e politicas

A: Alice, Bob e Carol compartilham a mesma raiz central; tambem existem identidades
de teste sem permissao, somente leitura e revogada.
B: Bea tem acesso somente a sua empresa, cuja politica financeira nao foi aprovada.

Somente A possui a autorizacao explicita `mtz-gerencial-v2-20:1`. B pode ler sua
raiz vazia pela API, mas criar/editar e recusado com POLITICA_EMPRESA_NAO_SUPORTADA.
A UI de B nao carrega o calculador MTZ. Isso evita herdar os 20%; NAO implementa
percentuais gerenciais arbitrarios para outros clientes. O nucleo homologado
continua fixo e intacto; parametrizacao futura exige alteracao pequena e propria.
Aliquotas das fixtures sao somente ilustrativas, nunca parametros reais.

## Interface e endpoints

O servidor reutiliza o index e os controles originais, aplicando em memoria o
mesmo ponto de integracao de formulario da homologacao. ui.mjs e somente um
adaptador de transporte SQL. Nao existe uma segunda tela de orcamentos.
Na demo local, somente handlers do escopo sao carregados; no adaptador online,
os modulos originais sao carregados, exceto registro de PWA/service worker.
As demais escritas permanecem bloqueadas. Guards de renderizacao evitam gravar
tipo Geral, caches e aliases de checklist no snapshot central imutavel.

| Endpoint | Uso |
| --- | --- |
| POST /api/session | Troca JWT sintetico valido por cookie HttpOnly/SameSite=Strict |
| GET /api/me | Identidade e empresas permitidas pelo banco |
| GET /api/companies/:empresa/state | Raiz comprovada e revisao |
| POST /api/companies/:empresa/commands | Criar/editar |
| GET /api/companies/:empresa/receipts/:operacao | Recuperar resultado proprio |

Host fixado a 127.0.0.1:porta, verificacao de Origin e sem CORS permissivo.
Arquivos de banco, schema, testes e credenciais locais nao sao servidos.
Nenhum ingresso de localStorage/IndexedDB, sincronizador ou fallback legado.
Rascunho de pedido pendente usa sessionStorage separado por usuario/empresa;
somente SQL confirma salvamento. Atualizar a lista nao rebaseia edicao aberta.

## Executar localmente

Requer Windows x64, Node.js >=24 e portas de loopback. Binarios PostgreSQL sao
dependencia de desenvolvimento; nao usar esta distribuicao beta em producao.

```powershell
cd poc/central-orcamentos
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd test
# Definir MTZ_PLAYWRIGHT e MTZ_CHROME conforme instalacao local:
node test-ui.mjs
npm.cmd start
```

Demo: http://127.0.0.1:54148/. Os links individuais de sessao sintetica sao
gerados em .local-data/acessos-locais.txt, fora do Git, e expiram em 9 minutos.
Abri-los em perfis/contextos diferentes para comparar Alice, Bob e Carol.
Nao sao senhas reais; nao compartilhar. O cookie nao e Secure porque o ensaio
e exclusivamente HTTP loopback. Nao expor esta API na rede.
Ctrl+C encerra HTTP/JWKS/PostgreSQL. Cada inicio cria uma base NOVA; clusters
anteriores ficam preservados em .local-data/run-UUID, sem importacao automatica.
Nao usar esse ciclo de vida como armazenamento de dados reais.

## Evidencias finais

- reports/backend.json: 19 cenarios aprovados, zero reprovados.
  PostgreSQL real/RLS, tres usuarios A, duas empresas, IDs tipados, equivalencia,
  adulteracoes, permissoes/revogacoes, concorrencia, idempotencia, rollback em
  quatro pontos, perda de resposta e recuperacao apos reiniciar HTTP.
- reports/ui/resultado.json: 10 cenarios aprovados, zero reprovados.
  Criar, compartilhar, editar, conflito sem perda do rascunho, recarregar,
  recuperar resposta perdida, barreira B, desktop/mobile e os dois PDFs reais.
- tools/test-proposal-gerencial.cjs: 21 cenarios aprovados, zero reprovados.
- check-kernel.cjs: 125 declaracoes originais/geradas identicas por AST/texto
  com CRLF normalizado. Essa comparacao independente nao equivale a aprovar
  o manifesto bruto do gerador original: 15 hashes nao conferem nas variantes
  de finais de linha verificadas. O resultado registra essa distincao.
- Exemplo numerico A: faturamento 6800; custos reais 1700; tributo ilustrativo
  60; encargo ilustrativo 20; retencao ilustrativa 102; deducao 1004; resultado
  4016. Mesmo candidato integral do redutor e mesmo fechamento apos editar evento.
- Primeiras rodadas UI preservadas em resultado-primeira-rodada.json e
  resultado-segunda-rodada.json. Falhas do harness: navegacao ate o botao de
  revisao e injecao de perda de resposta. Na rodada final o harness descarta
  explicitamente uma resposta ja confirmada, sem alterar expectativas.
- O checker original tools/build-proposal-kernel.cjs --check acusa divergencia
  do manifesto bruto. Nenhum arquivo original foi regenerado. O comparador
  local prova igualdade das 125 declaracoes com finais de linha normalizados,
  mas nao declara geracao byte a byte aprovada. Essa pendencia de tooling
  permanece para uma futura certificacao, sem alterar o motor nesta POC.

## Limites e conexao futura

Os itens abaixo descrevem a prova local original. As novas adaptacoes HTTPS,
Supabase JWT, TLS e backup manual estao documentadas e testadas em ONLINE.md;
isso nao significa que um provedor real tenha sido conectado ou homologado.

1. Auth sintetica assinada nao comprova pessoas reais, MFA, recuperacao de conta
   ou seguranca comercial. Supabase Auth nao foi provisionado nem conectado.
2. Nenhuma migracao, backup automatico, assinatura, cobranca ou escrita em outros
   modulos foi implementada. Uma POC de dois comandos nao certifica os outros 35
   em SQL, nem certifica a raiz interdominios de uma base real desconhecida.
3. Replay integral e snapshots aumentam custo e tamanho do journal. A raiz e
   serializada por empresa. Volume grande e desempenho de producao nao validados.
4. SQL/credenciais do backend sao uma fronteira confiavel: comprometer a API ou
   o operador do cluster nao e impedido por esta simulacao. Chaves/credenciais
   efemeras e arquivos de cluster nunca entram em commits ou pacote publico.
5. Para infraestrutura real: autorizar ambiente separado, escolher versao
   PostgreSQL suportada, configurar Supabase issuer/JWKS/algoritmos oficiais,
   sessoes HTTPS, role SQL minima, segredos, limites, logs e backups/restauracao.
   Validar adaptador/RLS com provedor real antes de considerar liberacao.
6. Reaproveitar apenas schema/servico/adapter e nucleo; nao reutilizar fixture,
   emissor local ou inicializacao automatica como bootstrap de producao.
