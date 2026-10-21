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
| B2 | Publicação — *concluído em 21/10/2026* | `status` e `publishedAt` independentes; publicar/despublicar registrado em auditoria | B1 |
| B3 | Privacidade do endereço | `addressVisibility` nasce em `NEIGHBORHOOD_ONLY`; teste confirma que a API pública **não** devolve rua, número, CEP nem coordenada exata quando não deve | B1 |
| B4 | Fotos e mídia | Upload por URL assinada gerada **só depois** da autorização, com validade curta; no máximo um `isCover` por imóvel; `DOCUMENT` nunca sai na API pública | B1, armazenamento |
| B5 | Leads — *concluído em 21/10/2026* | Telefone **ou** e-mail obrigatório; `AGENT` vê só os dele; duplicata por telefone **sinalizada**, nunca unida automaticamente | A12 |
| B6 | Fila de não atribuídos — *concluído em 21/10/2026* | Lead sem responsável aparece para `MANAGER` e acima, com contador no dashboard; `AGENT` não a acessa | B5 |
| B7 | Funil — *concluído em 21/10/2026* | Negociação herda a visibilidade do lead; mover etapa registrado em auditoria; teste confirma que o funil não mostra lead de colega ao `AGENT` | B5 |
| B8 | Agenda e tarefas — *API concluída em 21/10/2026; telas pendentes* | Datas gravadas em UTC e exibidas no fuso local; mesma visibilidade do lead | B5 |
| B9 | Dashboard | Conteúdo muda por papel; organização nova mostra primeiros passos, não zeros | B1, B5 |
| B10 | Desempenho de listagem | Paginação em todas as listas; **teste que conta consultas** e falha se a listagem fizer uma por item | B1, B5 |

### Telas de imóveis — **concluído em 21/10/2026**

Entraram junto com o B2, em `apps/web/app/painel/`:

- **Layout do painel** com navegação por papel, seletor de organização ativa (só para quem tem mais de um vínculo), alternância de tema e encerramento de sessão. A sessão é carregada **uma vez** pelo layout e oferecida por contexto; a regra "401 leva para `/entrar`" existe num lugar só
- **Lista** com busca, filtros, paginação e alternância "Todos / Meus imóveis", com os dois estados vazios que o §8 do mapa de telas distingue
- **Formulário** de cadastro e edição em cinco seções, com o controle de `addressVisibility` visível e explicado, e o aviso no campo de descrição quando o endereço não é `FULL`
- **Publicar e tirar do ar**, e exclusão com confirmação em duas etapas

### Estado comercial e seed — **concluído em 21/10/2026**

Duas pontas soltas, fechadas no mesmo dia:

- **Estado comercial** (`POST /imoveis/:id/estado`): disponível, reservado, vendido, alugado e arquivado, cada um com evento de auditoria próprio — `imovel.vendido`, não um `estadoAlterado` genérico, porque a pergunta que se faz ao histórico é "quando foi vendido?". `DRAFT` não é destino aceito: voltar a rascunho confundiria "não terminei de cadastrar" com "não quero mais anunciar", e a segunda é a rota de despublicar. Vendido, alugado e arquivado **saem do catálogo**; reservado continua no ar, porque o item C1 o mostra com etiqueta
- **Seed de desenvolvimento** (`npm run db:seed`): três organizações — uma imobiliária com cinco papéis e 26 imóveis, outra com dois, e um corretor autônomo —, com imóveis nos seis estados, alguns sem responsável e alguns sem área, mais uma pessoa com vínculo em duas organizações. Tem três guardas, todas verificadas: recusa `NODE_ENV=production`, recusa banco que não se chame `crm_dev` e recusa host que não seja local

O que **não** entrou: fotos (B4, depende do armazenamento de objetos).

**Verificação.** A API tem 421 testes. As telas foram conferidas por tipo, lint e build, e o percurso cadastro → imóvel → publicação foi exercitado contra o servidor em execução. **Não há teste de componente no site** — decisão de 21/10/2026, para não acrescentar `@testing-library/react` e `jsdom` agora. A consequência é concreta: a lógica do formulário (erro por campo, preço por finalidade, vazio que apaga na edição) não tem rede de proteção automatizada.

### Leads — API **concluída em 21/10/2026**

Sete rotas em `/api/leads`, com 87 testes. O item B6 (fila de não atribuídos) saiu junto, porque é o mesmo recorte de visibilidade com o sinal invertido.

**A inversão em relação a imóveis é o que define este item.** `imovel:ver` é `ORG` para os quatro papéis; `lead:ver` é **`OWN`** para o corretor. Consequência: o imóvel do colega responde **403** ao ser editado, e o lead do colega responde **404**. Mesma pessoa, mesmo papel, mesma organização, códigos diferentes — e quem decide isso é a matriz, pelo `AutorizacaoService`, sem lista escrita à mão.

Decisões tomadas durante a implementação:

- **O lead nasce atribuído a quem cadastrou**, inclusive para `MANAGER` e acima. Para o `AGENT` é o que a matriz manda; para os outros a matriz não dizia, e deixá-lo sem responsável faria o contato que o gerente acabou de atender pelo telefone aparecer na fila como se ninguém o tivesse visto. Devolver à fila é um clique (`responsavel: null`)
- **A duplicata é sinalizada em dois níveis.** Duplicata no alcance de quem cadastra vem com nome e responsável; duplicata de um colega vem apenas como `{ nivel: 'restrita' }`, sem nome e sem responsável. Sem esse recorte, a busca por telefone no cadastro vazaria a carteira do colega — o vazamento indireto que §8.2 manda testar. O nível `restrita` ainda revela *que* alguém tem aquele telefone: é troca deliberada, porque sem aviso nenhum dois corretores ligam para a mesma pessoa no mesmo dia
- **`origem` não é editável.** Ela registra como o contato chegou, e editável transformaria o relatório de origem em opinião. `PUBLIC_CATALOG` é recusada no cadastro manual: só a vitrine a produz
- **A fila não tem rota própria**: é o filtro `naoAtribuidos=true`, com a permissão conferida no serviço. Duas rotas lendo a mesma tabela duplicariam recorte, paginação e busca, e um dia só uma ganharia um filtro novo
- **Pedir a fila sem `lead:verNaoAtribuidos` responde 403**, e não lista vazia: lista vazia mostraria uma fila em ordem onde há uma recusa

### Telas de clientes — **concluídas em 21/10/2026**

`/painel/leads`, `/painel/leads/novo` e `/painel/leads/[id]`, mais o contador da fila no `/painel`.

Três decisões de interface vale registrar:

- **A fila é uma aba, não uma tela separada** como o mapa previa. A API é a mesma rota com um filtro, e duas telas com busca, paginação e lista idênticas garantiriam que um dia só uma ganhasse uma coluna nova. A aba só aparece para quem tem `lead:verNaoAtribuidos`
- **O aviso de duplicata diz o que fazer em cada nível.** Duplicata própria vira link para o contato existente; duplicata de colega diz que há contato na organização com aquele telefone e manda falar com quem coordena. Aviso que não aponta uma ação é só um susto
- **A fila vazia é boa notícia**, e o estado vazio diz isso em vez de "nenhum cliente cadastrado" — que ali seria errado e assustador

Entrou junto, por necessidade: **`GET /equipe/membros`** (nome, papel e `Membership.id`, **sem e-mail**). O seletor de responsável não tinha de onde tirar a lista, então o `POST /leads/:id/responsavel` existia sem interface possível. Sem e-mail porque §4.4 dá ao `AGENT` acesso a "nome e papel" dos colegas, não à agenda de contatos da imobiliária.

O seed agora cria **24 leads** nas três organizações, com os pontos de variação que as telas precisam: quatro na fila, dois com o mesmo telefone, um só com e-mail, consentimento registrado em quem veio da vitrine, e as cinco situações.

### Funil — API **concluída em 21/10/2026**

Oito rotas em `/api/negociacoes`, com 71 testes.

**A visibilidade herda o lead**, e isso atravessa o módulo inteiro: o recorte da listagem filtra por `lead.assignedMemberId`, e o `conferir()` recebe o responsável do **lead**, nunca o da negociação. O motivo está no `schema.prisma` desde o início — "senão o funil vaza nome de cliente de colega". A negociação carrega o nome do cliente, então mostrá-la a quem não alcança o lead entregaria a carteira por outra porta.

Decisões tomadas durante a implementação:

- **Atribuir a negociação a quem não é responsável pelo cliente é recusado.** `Deal.assignedMemberId` existe (quem conduz o negócio), mas não decide quem vê. Permitir criaria um responsável que recebe 404 ao abrir o próprio registro. Para passar a negociação, passa-se o cliente — e quem pode fazer os dois é o mesmo papel
- **`closedAt` é derivado da etapa**, nunca enviado: etapa de ganho ou perda fecha, etapa aberta reabre e limpa o motivo da perda. Como campo editável, a interface poderia produzir "fechada e na etapa de proposta"
- **O motivo da perda é obrigatório** ao mover para uma etapa de perda. É o único campo do funil que responde "por que não fechamos?", e a validação é do servidor porque as etapas são linhas: o schema não tem como saber o que `etapaId` significa
- **Fechadas ficam fora da listagem por padrão.** O funil é ferramenta do presente, e a coluna de ganhos de dois anos cresce para sempre
- **Existe `GET /negociacoes/resumo`** com contagem e valor por etapa, respeitando o mesmo recorte de visibilidade. Somar no cliente daria o total da página, não da etapa — número errado de um jeito difícil de notar

**Um teste encontrou um vazamento real.** A listagem excluía negociação de cliente excluído, mas a consulta por id ainda devolvia o nome dele: o `carregar` filtrava só o `deletedAt` da negociação. Atendido um pedido de exclusão de LGPD, o nome sobreviveria por essa porta. Corrigido, e o filtro agora é o mesmo nos dois caminhos.

Entrou junto: o **cenário de teste passou a criar as seis etapas do funil** em cada organização, como o `POST /cadastro` faz. Sem elas, o cenário descrevia uma organização que não pode existir.

### Tela do funil — **concluída em 21/10/2026**

`/painel/funil` e `/painel/funil/[id]`, mais a seção de negociações na ficha do cliente.

Três decisões de interface:

- **Não há arrastar e soltar.** Mover para a etapa de perda exige motivo e a de ganho fecha a negociação: duas consequências que pedem confirmação com espaço para explicar, não um gesto que pode ser acidental. O movimento acontece na tela da negociação. Fica registrado como escolha, não limitação — se o uso mostrar que o arrasto é esperado, ele entra com confirmação nas etapas de desfecho
- **Os desfechos são totais, não colunas.** Negociação fechada sai da listagem do funil, então as colunas "Fechado" e "Perdido" ficariam **sempre vazias** — e duas colunas que nunca têm nada ensinam a pessoa a ignorar a tela. Elas viraram dois totais acumulados abaixo do quadro
- **A negociação nasce na ficha do cliente.** Abrir pelo funil exigiria escolher o cliente numa lista que precisa respeitar o escopo `OWN`, recriando metade da tela de clientes dentro de um seletor

Detalhe que tornou os totais possíveis: o resumo é pedido com `incluirFechadas=true` e a listagem sem. Parece contraditório e não é — negociação em etapa aberta **nunca** está fechada, porque mover para etapa aberta limpa o `closedAt`. Então incluir as fechadas não mexe nos números das colunas abertas, e é o que dá os totais reais de ganho e de perda.

O seed agora cria **15 negociações** nas três organizações, espalhadas pelas seis etapas, duas delas fechadas, uma sem imóvel e uma sem valor esperado.

### Agenda e tarefas — API **concluída em 21/10/2026**

Onze rotas em `/api/visitas` e `/api/tarefas`, com 94 testes.

**A visibilidade ganhou uma segunda porta, e isso é uma mudança de regra.** Em `Visit` e `Task` o responsável é **obrigatório** e o cliente é **opcional** — o inverso de `Deal`. Isso criou um caso que a regra original não resolvia: o gerente manda o Tiago conduzir a visita do cliente da Bianca, porque ela não pode no sábado. O Tiago precisa ver a visita — ele vai encontrar a pessoa.

**[DECIDIDO 21/10/2026]** Enxerga quem responde pelo **registro** ou pelo **cliente**. O que o responsável pela visita recebe do cliente é o mínimo do encontro — **nome e telefone**, e nada mais: sem anotações, sem origem, sem situação, e a ficha do cliente continua respondendo 404 para ele. A diferença entre "sei com quem me encontro sábado" e "tenho acesso ao cliente do meu colega" é exatamente essa lista de campos, e há teste para cada parte dela.

A contrapartida: **atribuir passou a ser uma forma de revelar um contato**. Por isso só `MANAGER` para cima atribui — o que a matriz já dizia — e a auditoria registra `revelouCliente` quando a atribuição deu acesso a alguém que não atende aquele cliente.

Outras decisões:

- **`negociacao:*` serve para visitas e tarefas**, porque §4.3 trata `Deal`, `Visit` e `Task` como um grupo com uma linha de matriz. Inventar `visita:ver` exigiria decidir o escopo dos quatro papéis de novo, e duas matrizes para a mesma regra divergem no primeiro ajuste
- **Datas em ISO 8601 com fuso, obrigatoriamente.** Sem o fuso o valor é ambíguo e o servidor teria de adivinhar — errando duas vezes por ano, quando o horário de verão muda
- **A agenda não pagina**, e o contrato limita o período a seis meses: a tela mostra um dia, uma semana ou um mês inteiros, e "as primeiras vinte do mês" não é uma agenda
- **`completedAt` é derivado** da situação, como o `closedAt` da negociação
- **"Vencida" é calculado no servidor**, não na interface: depende do relógio, e o do navegador pode estar errado ou em outro fuso

**Uma armadilha nova, registrada:** filtrar por relação opcional no Prisma (`lead: { deletedAt: null }`) **exige que a relação exista**, então a visita sem cliente desapareceria da agenda. A forma correta é `OR: [{ leadId: null }, { lead: {...} }]`. É engano que passa no caminho feliz, porque o caso de teste costuma ter cliente.

Pendente deste item: as **telas** (`/painel/agenda` e `/painel/tarefas`) e o seed, que ainda não cria visita nem tarefa.

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
| ~~Hospedagem: gerenciada ou VPS~~ | ~~D1~~ | **Decidido em 21/10/2026: gerenciada**, plano Unlimited da Hostinger, limites confirmados pelo suporte |
| Serviço de e-mail transacional | **Só produção** — A8, A9 e A10 já funcionam em dev pela porta `RemetenteDeEmail`, com `EMAIL_PROVIDER=log` | Responsável (tem custo) |
| ~~Armazenamento de objetos~~ | ~~B4~~ | **Decidido em 21/10/2026: Cloudflare R2.** Gratuito até 10 GB; a Hostinger não oferece o serviço. Ver `architecture.md` |
| ~~Campos obrigatórios do imóvel~~ | ~~B1~~ | **Decidido em 21/10/2026**: piso do banco mais preço coerente com a finalidade. Ver `packages/shared/src/schemas/imovel.ts` |
| Unificar leads duplicados no MVP | B5 | Responsável |
| Mecanismo anti-spam | C6 | Responsável (custo e LGPD) |
| Parecer jurídico sobre anonimização | D6, piloto | Advogado — **não é decisão técnica** |
| Marca verificada no INPI e Registro.br | Qualquer uso público | Responsável |
| ~~Seis etapas do funil ou cinco?~~ | ~~A2~~ | **Seis**, confirmado em 21/10/2026: era divergência de redação, não decisão em aberto. O código já semeava seis desde o A2, e `data-model.md` §3.4 foi corrigido |
