# Doverni — Roadmap do MVP

> Revisão de 20/10/2026. Entrega #7 do briefing inicial: critérios de aceitação verificáveis, dependências e definição de pronto por tarefa.
>
> Critério verificável aqui significa **um comando que roda ou uma ação que alguém executa e observa**. "Autenticação funcionando" não é critério; "sessão de membro suspenso para de abrir o painel na requisição seguinte" é.

---

## Definição de pronto

Vale para **toda** tarefa deste roadmap. Uma tarefa que não cumpre os sete itens não está pronta, mesmo que a tela apareça e funcione na mão.

1. `npm run verify` passa (lint, formatação, tipos, testes)
2. `npm run build` passa nos dois apps
3. Autorização verificada **no servidor**, pelos sete passos de [permissions.md](permissions.md) §6 — nunca só escondendo botão
4. Teste automatizado cobrindo o caminho principal **e** a tentativa de acesso indevido, quando a tarefa envolve dado privado
5. Entradas validadas por schema de `@app/shared`, com o servidor revalidando o que o cliente enviou
6. Estados de carregando, vazio e erro tratados ([pages-and-navigation.md](pages-and-navigation.md) §8)
7. Documentação em `docs/` atualizada quando a tarefa muda uma decisão

**Regra de ouro dos dados**: nenhum dado real de cliente em desenvolvimento ([CLAUDE.md](../CLAUDE.md)).

---

## Fase 0: validação — antes do código

| Tarefa | Critério de aceitação | Situação |
|---|---|---|
| Entrevistar corretores e pequenas imobiliárias | Três dores prioritárias escritas, com quantas das pessoas entrevistadas citaram cada uma | **Pendente** |
| Verificar a marca | Consulta ao INPI e ao Registro.br registrada com data e resultado | **Pendente** — a disponibilidade de "Doverni" **não** foi comprovada |
| Validar a hospedagem | Checklist respondido com base na documentação do plano comprado, não em suposição | **Adiado por decisão do responsável** — Fase 4 |
| Aprovar campos, papéis, permissões e telas | Documentos de `docs/` aprovados | **Concluído** em 19 e 20/10/2026 |

> A Fase 1 avançou sem a Fase 0 estar completa. Foi decisão consciente: a fundação técnica não depende das entrevistas. Mas **vender** depende, e a marca precisa estar resolvida antes de qualquer uso público.

---

## Fase 1: fundação

### 1.1 Monorepo, banco e ferramentas — **concluído em 19 e 20/10/2026**

| Tarefa | Critério de aceitação | Como verificar | Situação |
|---|---|---|---|
| Monorepo com npm workspaces | Um lockfile; `npm run dev` sobe API e site juntos | `npm run dev` | ✅ |
| MySQL em container, só em dev | `npm run db:up` sobe a mesma versão da produção | `docker compose ps` mostra `healthy` | ✅ |
| Schema do Prisma | 19 tabelas conforme [data-model.md](data-model.md) | `npm run db:status` em dia | ✅ |
| Migration inicial versionada | Migration aplicada e sem desvio | `npm run db:drift` → "No difference detected" | ✅ |
| Health check com banco | `GET /health` responde `database: ok`, e `degraded` se o banco cair | `curl localhost:3333/health` | ✅ |
| Lint, formatação e testes | `npm run verify` passa | `npm run verify` | ✅ |
| CI | Workflow roda migrations, desvio, lint, tipos, testes e build | Execução verde no GitHub Actions | ⚠️ **escrito, nunca executado** — depende de remoto configurado |
| Design system | Tailwind 4 e shadcn/ui com as cores oficiais, claro e escuro | `npm run build -w @app/web` + alternar tema na tela | ✅ |
| Contratos compartilhados | Enums, matriz de permissões e schemas em `@app/shared`, sem ciclo | `npm run test` (teste de paridade com o Prisma) | ✅ |

### 1.2 Autenticação — **em andamento**

Situação em 20/10/2026: **A1 a A10 concluídos.** Verificável com `npm run verify` (330 testes) e `npm run build`.

- **A1 a A4** — hash Argon2id, cadastro transacional, sessão opaca com estado no MySQL, login e logout
- **A5** — os sete passos de [permissions.md](permissions.md) §6 em um módulo: a guarda `AutorizacaoGuard` cobre os passos 1 a 4, o `AutorizacaoService` cobre 5 a 7
- **A6** — `apps/api/test/autorizacao/autorizacao.http.spec.ts` prova que suspender membro ou organização corta o acesso na requisição seguinte, sem esperar expiração
- **A7** — `GET /autenticacao/organizacoes` e `POST /autenticacao/organizacao-ativa`. O `organizationId` do corpo é um **pedido**, não uma declaração: o servidor confere o vínculo antes de gravar na sessão, e recusa com 404 — nunca 403 — para organização sem vínculo, com vínculo suspenso, suspensa ou inexistente, com o mesmo corpo nos quatro casos

- **A8** — verificação de e-mail com token hasheado, prazo de 24h e uso único. Enviada no cadastro, com reenvio pela sessão. Nada no MVP depende da confirmação: bloquear o acesso até ela criaria um caminho de suporte para quem não recebeu o e-mail
- **A9** — recuperação de senha. Resposta **idêntica** exista o e-mail ou não; token de 1h, uso único; redefinir **encerra as outras sessões** do usuário. Pedir um token novo invalida o anterior
- **A10** — convites. A hierarquia sai de `papeisQuePodeConvidar()` em `@app/shared`, a mesma função que monta o seletor do formulário; `OWNER` não é convidável; aceitar cria `Membership` em transação com a conta

**Decisão de 20/10/2026 — o e-mail entra por uma porta.** O provedor transacional continua **não escolhido**, mas deixou de bloquear: o código depende da classe abstrata `RemetenteDeEmail`, e o adaptador de desenvolvimento (`EMAIL_PROVIDER=log`) escreve a mensagem no terminal. A API **recusa iniciar** com esse adaptador em produção, porque o corpo carrega o token em claro e log é copiado e agregado por mais gente do que a caixa de entrada da pessoa. Trocar pelo provedor real é uma classe e uma linha no `EmailModule`.

**A12 e A13 fecharam em 21/10/2026**, junto com o item B1 — e não antes dele por uma razão de método: os dois só existem de verdade contra endpoint de recurso. Até ali, o que havia era a guarda provada por rotas que existiam somente no teste, o que demonstra que o mecanismo funciona mas não que a rota de produção se lembra de chamá-lo. Ver `apps/api/test/imoveis/isolamento.http.spec.ts`.

Em aberto: **A11**, que depende da decisão de rate limiting.

**Limitação conhecida do A9.** As respostas são idênticas em status e corpo, mas o *tempo* de resposta não é: quando a conta existe, há escrita no banco e envio de e-mail. Com o adaptador de log a diferença é desprezível; com um provedor real, a latência da chamada tornaria a existência da conta observável por cronômetro. A correção é enviar fora do caminho da requisição, e ela entra junto com a escolha do provedor.

O cenário base de [permissions.md](permissions.md) §8.1 — duas organizações completas e a pessoa com dois vínculos — já existe em `apps/api/test/apoio/cenario-de-duas-organizacoes.ts` e é o alicerce do A12.

Depende de: 1.1 concluído · decisão de domínio único ou separado · serviço de e-mail (pode ser log em dev).

| # | Tarefa | Critério de aceitação verificável | Depende de |
|---|---|---|---|
| A1 | Hash de senha | Senha nunca gravada em claro; custo configurável por ambiente; teste confirma que dois cadastros da mesma senha geram hashes diferentes | — |
| A2 | Cadastro | `POST /cadastro` cria `User` + `Organization` + `Membership(OWNER)` + 6 etapas do funil **em uma transação**; falha no meio não deixa organização sem dono; e-mail duplicado responde erro sem revelar que a conta existe | A1 |
| A3 | Sessão opaca | Cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; o cookie carrega identificador opaco e o estado fica no MySQL; identificador **rotaciona** no login | A1 |
| A4 | Login e logout | Credencial errada e conta desabilitada devolvem **a mesma** mensagem; logout invalida a sessão no servidor, e o cookie reaproveitado não volta a funcionar | A3 |
| A5 | Guarda de autorização | Os sete passos de [permissions.md](permissions.md) §6 em **um** módulo; consome `podeFazer()` de `@app/shared` | A3 |
| A6 | Revogação imediata | **Suspender um membro corta o acesso na requisição seguinte**, sem esperar expiração. É o teste que justifica sessão no servidor em vez de JWT | A5 |
| A7 | Organização ativa | Vem da sessão, nunca do corpo ou da query; `organizationId` enviado pelo cliente é ignorado; trocar de organização invalida cache por usuário | A5 |
| A8 | Verificação de e-mail | Token com **hash** no banco, expiração e uso único; reutilizar o token falha | A2 |
| A9 | Recuperação de senha | Resposta idêntica exista o e-mail ou não; token de uso único; redefinir **encerra as outras sessões** do usuário | A2, A3 |
| A10 | Convites | `OWNER`/`ADMIN`/`MANAGER` convidam conforme a hierarquia; `OWNER` não é convidável; token com hash e expiração; aceitar cria `Membership` | A5 |
| A11 | Rate limiting | Login, recuperação e captura de lead limitados por IP; teste confirma bloqueio após N tentativas | A4 |
| A12 | **Testes de isolamento multi-tenant** — *concluído em 21/10/2026* | Os cenários de [permissions.md](permissions.md) §8 passando: travessia entre organizações devolve **404 e nunca 403**, escopo `OWN` respeitado, organização ativa não é manipulável pelo cliente | A5, A6, A7 |
| A13 | Auditoria de escrita — *concluído em 21/10/2026* | Toda escrita gera `Activity`; nenhum endpoint permite editar o log | A5 |

**A12 é o critério de saída da Fase 1.** Sem ele, nada do que vem depois pode ser considerado seguro: é o teste que prova que uma organização não vê dados de outra.

**Fechado em 21/10/2026.** A Fase 1 tem um único item em aberto, o A11, e ele não bloqueia a Fase 2.

---

## Fase 2: gestão imobiliária

Depende de: Fase 1 completa, **A12 inclusive** (fechado em 21/10/2026) · campos obrigatórios do imóvel decididos (21/10/2026, ver B1) · armazenamento de objetos escolhido — **ainda pendente**, e bloqueia apenas o B4.

| # | Tarefa | Critério de aceitação verificável | Depende de |
|---|---|---|---|
| B1 | CRUD de imóveis — *concluído em 21/10/2026* | `code` único por organização, com erro legível na colisão; `purpose = BOTH` exige os dois preços; `AGENT` edita só os dele e recebe **403** nos outros da mesma organização, 404 nos de outra | A12 |
| B2 | Publicação | `status` e `publishedAt` independentes; publicar/despublicar registrado em auditoria | B1 |
| B3 | Privacidade do endereço | `addressVisibility` nasce em `NEIGHBORHOOD_ONLY`; teste confirma que a API pública **não** devolve rua, número, CEP nem coordenada exata quando não deve | B1 |
| B4 | Fotos e mídia | Upload por URL assinada gerada **só depois** da autorização, com validade curta; no máximo um `isCover` por imóvel; `DOCUMENT` nunca sai na API pública | B1, armazenamento |
| B5 | Leads | Telefone **ou** e-mail obrigatório; `AGENT` vê só os dele; duplicata por telefone **sinalizada**, nunca unida automaticamente | A12 |
| B6 | Fila de não atribuídos | Lead sem responsável aparece para `MANAGER` e acima, com contador no dashboard; `AGENT` não a acessa | B5 |
| B7 | Funil | Negociação herda a visibilidade do lead; mover etapa registrado em auditoria; teste confirma que o funil não mostra lead de colega ao `AGENT` | B5 |
| B8 | Agenda e tarefas | Datas gravadas em UTC e exibidas no fuso local; mesma visibilidade do lead | B5 |
| B9 | Dashboard | Conteúdo muda por papel; organização nova mostra primeiros passos, não zeros | B1, B5 |
| B10 | Desempenho de listagem | Paginação em todas as listas; **teste que conta consultas** e falha se a listagem fizer uma por item | B1, B5 |

---

## Fase 3: catálogo público

Depende de: B1 a B4 · mecanismo anti-spam decidido · texto do aviso de privacidade.

| # | Tarefa | Critério de aceitação verificável | Depende de |
|---|---|---|---|
| C1 | Vitrine `/o/[slug]` | Mostra só `AVAILABLE` e `RESERVED`, este com etiqueta; teste confirma que `DRAFT`, `SOLD`, `RENTED`, `INACTIVE` e excluído **não** aparecem | B2 |
| C2 | DTO público | Construído campo a campo; **teste que falha se um campo novo do `Property` vazar** na resposta pública | B3 |
| C3 | Redirecionamento de slug | Slug antigo responde 301 para o novo; adotar slug que ainda redireciona é recusado | A2 |
| C4 | Busca e filtros | Filtros de `filtrosDoCatalogoSchema`; teste confirma que **não** há filtro por rua, CEP ou coordenada | C2 |
| C5 | Captura de lead | Consentimento explícito obrigatório; grava versão do aviso e **hash** do IP; resposta não devolve IDs internos; lead vai ao responsável do imóvel ou à fila | B5, C1 |
| C6 | Anti-spam | Limite por IP comprovado em teste; mecanismo escolhido registrado em `docs/` | C5 |
| C7 | SEO e responsividade | Título, descrição e dados estruturados por imóvel; páginas utilizáveis em tela de 360px | C1 |

---

## Fase 4: piloto e lançamento

| # | Tarefa | Critério de aceitação verificável | Depende de |
|---|---|---|---|
| D1 | Checklist da hospedagem | Cada item respondido com link para a documentação do plano, não com suposição | — |
| D2 | TLS no banco em produção | Conexão com TLS; `allowPublicKeyRetrieval` **desligado** fora da máquina local | D1 |
| D3 | Backup e restauração | Restauração **testada** em base vazia, com tempo medido. Backup não testado não é backup | D1 |
| D4 | Observabilidade | Erros agregados e health check monitorado; alerta quando `/health` responde `degraded` | D1 |
| D5 | Deploy | Deploy reproduzível, com `prisma migrate deploy` e rollback definido | D1, D3 |
| D6 | Parecer jurídico LGPD | Resposta escrita sobre anonimização de leads, termos e aviso de privacidade | — |
| D7 | Piloto | Corretores reais usando; fricções registradas e priorizadas | Fases 2 e 3 |
| D8 | Planos e cobrança | Limites, preço, pagamento, suporte e termos definidos **antes** de vender | D6, D7 |

---

## Critério mínimo de pronto do MVP

Um corretor entra, cadastra e publica imóvel, recebe lead do catálogo, agenda visita e move negociação. Uma imobiliária convida membros e controla acesso. **Uma organização não vê dados privados de outra** — provado por teste, não por inspeção. O sistema funciona no celular.

---

## Pendências que bloqueiam fases

| Pendência | Bloqueia | Quem decide |
|---|---|---|
| Domínio único ou separado para API e site | A3 | Responsável, com validação na Fase 4 |
| Serviço de e-mail transacional | **Só produção** — A8, A9 e A10 já funcionam em dev pela porta `RemetenteDeEmail`, com `EMAIL_PROVIDER=log` | Responsável (tem custo) |
| Armazenamento de objetos | B4 | Responsável (tem custo) |
| ~~Campos obrigatórios do imóvel~~ | ~~B1~~ | **Decidido em 21/10/2026**: piso do banco mais preço coerente com a finalidade. Ver `packages/shared/src/schemas/imovel.ts` |
| Unificar leads duplicados no MVP | B5 | Responsável |
| Mecanismo anti-spam | C6 | Responsável (custo e LGPD) |
| Parecer jurídico sobre anonimização | D6, piloto | Advogado — **não é decisão técnica** |
| Marca verificada no INPI e Registro.br | Qualquer uso público | Responsável |
| ~~Seis etapas do funil ou cinco?~~ | ~~A2~~ | **Seis**, confirmado em 21/10/2026: era divergência de redação, não decisão em aberto. O código já semeava seis desde o A2, e `data-model.md` §3.4 foi corrigido |
