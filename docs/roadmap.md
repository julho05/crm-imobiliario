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

**A11 fechou em 29/10/2026** — ver a seção dele abaixo da tabela. Com ele, a Fase 1 está completa.

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
| A11 | Rate limiting — *concluído em 29/10/2026; a captura de lead recebe o limite junto com o C5* | Login, recuperação e captura de lead limitados por IP; teste confirma bloqueio após N tentativas | A4 |
| A12 | **Testes de isolamento multi-tenant** — *concluído em 21/10/2026* | Os cenários de [permissions.md](permissions.md) §8 passando: travessia entre organizações devolve **404 e nunca 403**, escopo `OWN` respeitado, organização ativa não é manipulável pelo cliente | A5, A6, A7 |
| A13 | Auditoria de escrita — *concluído em 21/10/2026* | Toda escrita gera `Activity`; nenhum endpoint permite editar o log | A5 |

**A12 é o critério de saída da Fase 1.** Sem ele, nada do que vem depois pode ser considerado seguro: é o teste que prova que uma organização não vê dados de outra.

**Fechado em 21/10/2026**, com o A11 em aberto; **completo em 29/10/2026**, quando o A11 entrou.

### Limite de tentativas — **A11 concluído em 29/10/2026**

Tabela `RateLimitHit` (migration `20261029120000_limite_de_tentativas`), serviço em `apps/api/src/limite/` e **14 testes** em `test/limite/limite.http.spec.ts`. Quem passa do limite recebe **429** com `Retry-After` e mensagem em português, que a tela de login já mostrava sem mudança.

| Rota | Por IP | Outra chave |
|---|---|---|
| Login | 100 / 15 min | **IP + e-mail**: 10 / 15 min |
| Recuperação de senha | 10 / hora | e-mail: 3 / hora |
| Cadastro | 10 / hora | — |
| Redefinir senha, verificar e-mail, ver/aceitar/vincular convite | 30 / 15 min, um contador para todas | — |

Decisões tomadas, a não reabrir sem motivo:

- **No MySQL**, como decidido em 21/10/2026: sem garantia de processo único, contador em memória daria um limite por processo. O incremento é atômico (`INSERT … ON DUPLICATE KEY UPDATE`), e o teste com 45 requisições simultâneas confirma que nenhuma passa do máximo
- **Login por IP + e-mail, nunca por e-mail sozinho** (decisão do responsável, 29/10/2026). Por e-mail sozinho, qualquer pessoa tiraria um corretor do sistema errando a senha dele dez vezes. O ataque distribuído contra uma conta fica com o Argon2 e a política de senha; se aparecer de verdade, a resposta é verificação extra para aquela conta, não bloqueio
- **Conta-se toda tentativa**, não só a que falha: contar só a falha exigiria rodar o Argon2 antes de contar, que é o trabalho que o limite existe para poupar
- **A recuperação conta por e-mail exista a conta ou não.** Contar só as que existem faria do 429 a resposta que a mensagem idêntica do A9 existe para não dar
- **Nem IP nem e-mail em claro na tabela**: a chave é um HMAC com o mesmo segredo do hash de IP, com teste
- **Chamada explícita no controller**, depois da validação, e não guarda: a guarda rodaria antes do corpo validado, e a chamada escrita na rota torna visível a rota nova que a esqueceu
- **Janela fixa**, aceitando que quem conhece a regra consiga o dobro do máximo na virada da janela. Contra um Argon2, vinte tentativas continuam sendo nada
- **Limpeza durante o uso**, em lote, em uma a cada cinquenta chamadas: o plano não permite tarefa agendada

**Risco que passa para a Fase 4 (D1), obrigatório:** o limite depende de `req.ip`, e `req.ip` depende de `TRUST_PROXY_HOPS`. Saltos de menos põem todos os visitantes atrás do IP do proxy, e eles se bloqueiam juntos; saltos de mais, ou nenhum proxy na frente, deixam qualquer um forjar `X-Forwarded-For` e escapar do limite. Conferir contra a hospedagem real antes do piloto.

**Incidente na criação da migration**, para quem for criar a próxima: o `prisma migrate dev` travou sem saída neste ambiente, esperando interação que o terminal não oferece, e um processo interrompido continuou vivo e criou uma pasta duplicada. A migration foi gerada com `prisma migrate diff --from-config-datasource --to-schema` e aplicada com `migrate deploy`; a duplicata foi marcada com `migrate resolve --rolled-back` e removida. O banco de teste e a produção não foram tocados.

---

## Fase 2: gestão imobiliária

Depende de: Fase 1 completa, **A12 inclusive** (fechado em 21/10/2026) · campos obrigatórios do imóvel decididos (21/10/2026, ver B1) · armazenamento de objetos escolhido — **ainda pendente**, e bloqueia apenas o B4.

| # | Tarefa | Critério de aceitação verificável | Depende de |
|---|---|---|---|
| B1 | CRUD de imóveis — *concluído em 21/10/2026* | `code` único por organização, com erro legível na colisão; `purpose = BOTH` exige os dois preços; `AGENT` edita só os dele e recebe **403** nos outros da mesma organização, 404 nos de outra | A12 |
| B2 | Publicação — *concluído em 21/10/2026* | `status` e `publishedAt` independentes; publicar/despublicar registrado em auditoria | B1 |
| B3 | Privacidade do endereço — *concluído em 23/10/2026, junto com o C2* | `addressVisibility` nasce em `NEIGHBORHOOD_ONLY`; teste confirma que a API pública **não** devolve rua, número, CEP nem coordenada exata quando não deve | B1 |
| B4 | Fotos e mídia — *concluído em 23/10/2026; só o adaptador do R2 pendente* | Upload por URL assinada gerada **só depois** da autorização, com validade curta; no máximo um `isCover` por imóvel; `DOCUMENT` nunca sai na API pública | B1, armazenamento |
| B5 | Leads — *concluído em 21/10/2026* | Telefone **ou** e-mail obrigatório; `AGENT` vê só os dele; duplicata por telefone **sinalizada**, nunca unida automaticamente | A12 |
| B6 | Fila de não atribuídos — *concluído em 21/10/2026* | Lead sem responsável aparece para `MANAGER` e acima, com contador no dashboard; `AGENT` não a acessa | B5 |
| B7 | Funil — *concluído em 21/10/2026* | Negociação herda a visibilidade do lead; mover etapa registrado em auditoria; teste confirma que o funil não mostra lead de colega ao `AGENT` | B5 |
| B8 | Agenda e tarefas — *concluído em 22/10/2026* | Datas gravadas em UTC e exibidas no fuso local; mesma visibilidade do lead | B5 |
| B9 | Dashboard — *concluído em 22/10/2026* | Conteúdo muda por papel; organização nova mostra primeiros passos, não zeros | B1, B5 |
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

### Fotos e mídia — API **concluída em 22/10/2026**

Sete rotas sob `/imoveis/:imovelId/midia`, com 30 testes. O modelo de dados já existia desde a Fase 1 — `PropertyMedia` com `objectKey`, `isCover` e `@@unique([propertyId, position])` —, então não houve migration: o item é a porta de armazenamento, a autorização e o fluxo de upload.

**O upload é em dois passos, e o arquivo não passa pela API.** A API autoriza, confere limite e tipo, e devolve uma URL assinada de 10 minutos; o navegador envia direto ao armazenamento; depois informa a chave e a linha é criada. O motivo é o plano de hospedagem: receber 20 fotos de 5 MB por requisição ocuparia, segurando bytes em memória, o mesmo processo que atende o corretor.

**A porta (`ArmazenamentoDeMidia`) é o que permitiu construir o item sem a conta do R2**, como o e-mail fez com `RemetenteDeEmail`. O adaptador de desenvolvimento grava em disco e assina com HMAC, reproduzindo a forma de uma URL pré-assinada do S3 — chave, tipo, tamanho e prazo dentro da assinatura. `MIDIA_PROVIDER=local` é recusado em produção na inicialização. O adaptador do R2, com as duas dependências do SDK, entra quando as credenciais existirem: **é a única parte do item que continua pendente**, e a decisão de não escrevê-lo às cegas foi deliberada — dependência que serve código não exercitado é dependência que ninguém sabe se está certa.

Decisões tomadas durante a implementação:

- **A chave do objeto carrega organização e imóvel** (`organizacoes/<org>/imoveis/<imovel>/<uuid>.<ext>`), e isso não é organização de pasta: entre os dois passos a chave passa pelo navegador, e chave vinda do cliente é pedido, não declaração. Sem conferir o prefixo, alguém registraria no imóvel dele uma chave de outra organização, e a resposta passaria a servir aquele objeto. O `uuid` evita enumeração — num bucket com leitura pública, conhecer a chave é poder ler o arquivo
- **O limite é conferido duas vezes**, ao assinar e ao registrar. Não é desconfiança do primeiro: entre os dois passos cabe outra aba, e duas URLs emitidas com uma vaga restante registrariam vinte e uma
- **A capa nasce sozinha e nunca fica vazia.** A primeira mídia pública vira capa, e remover a capa promove a próxima. O banco já garantia "no máximo uma"; o que faltava era não deixar o imóvel **sem** capa depois de uma remoção — anúncio sem capa não tem o que mostrar na lista do catálogo, e ninguém volta para marcar
- **`DOCUMENT` nunca é capa**, nem por escolha nem por ser o único arquivo. Matrícula não é vitrine
- **A reordenação recebe a lista inteira** e é aplicada em dois passos dentro da transação, porque `@@unique([propertyId, position])` colide no meio do caminho: todas vão primeiro para posições negativas, que nenhuma linha válida ocupa. Lista parcial é recusada, porque deixaria mídia fora da ordem
- **A remoção apaga a linha antes do objeto.** Se o armazenamento falhar, sobra um objeto órfão, que não aparece em tela nenhuma; na ordem inversa, sobraria uma linha apontando para arquivo inexistente — imagem quebrada no anúncio, que é o erro que o cliente vê
- **A chave do objeto não vai para a auditoria.** Ela é o endereço do arquivo, e o log é lido por mais gente do que quem pode abrir a foto. Há teste para isso
- **Uma função de autorização, não duas.** Listar exige `imovel:ver` (`ORG` para os quatro papéis, porque o corretor precisa ver as fotos de qualquer imóvel da casa para oferecê-lo) e escrever exige `imovel:editar` (`OWN` para o `AGENT`, que recebe **403** no imóvel do colega). O que muda é o `@Exige` da rota; o serviço lê o escopo do contexto
- **O receptor do adaptador local não tem guarda de sessão**, e isso é o fluxo real: no R2 o envio vai do navegador para a Cloudflare, onde o cookie não chega. Quem autoriza é a assinatura. Guarda de sessão ali testaria um fluxo que não é o de produção e deixaria a assinatura sem exercício

**Verificação.** 752 testes. Os casos que importam são os de recusa, e todos passam pelo fluxo completo — pedir a URL, enviar para ela, registrar: token alterado **403**, tipo diferente do assinado **400**, arquivo maior que o autorizado **413**, chave de outra organização **404**, chave de outro imóvel da mesma organização **404**, travessia de diretório **404**, vigésima primeira mídia **400**, e o corretor pedindo URL para o imóvel do colega **403**.

### Telas de fotos e documentos — **concluídas em 23/10/2026**

`/painel/imoveis/[id]/fotos`, com `apps/web/lib/midia.ts` (o envio em três etapas) e `apps/web/components/imoveis/galeria-de-midia.tsx` (as duas seções e as ações). O botão de entrada está no cabeçalho da tela de edição, e aparece também para quem só pode ver — ver as fotos do imóvel da casa e oferecê-lo ao cliente é exatamente o que `imovel:ver` com escopo `ORG` permite.

**Rota própria, e não uma seção do formulário.** O formulário é um envio só, com cinco seções que a pessoa preenche e salva; a mídia não tem "salvar" — cada arquivo entra no instante em que é enviado. Juntar as duas coisas criaria um formulário onde parte do conteúdo já foi gravado e parte não, e nenhum aviso de "alterações não salvas" daria conta disso.

Decisões tomadas durante a implementação:

- **Duas seções, não uma grade com etiquetas.** É o que o §225 do mapa de telas exige, e a separação é a proteção: quem envia a matrícula escolhe "documento" **antes** de escolher o arquivo. Três botões — "Adicionar fotos", "Adicionar planta", "Adicionar documento" —, e com isso o tipo nunca é uma pergunta depois do envio, nem um seletor que alguém deixa no valor errado
- **Reordenar por botão, não arrastando.** Arrastar e soltar exigiria dependência nova e funciona mal em tela de toque, que é o aparelho do corretor. O caso real é escolher a primeira foto, e para isso "tornar capa" resolve em um toque; as setas cobrem o ajuste fino
- **A fila é sequencial, um arquivo por vez.** Vinte envios de 5 MB em paralelo saturam o upload de quem está num 4G e fazem todos falharem juntos. Um a um, o que entrou está salvo e dá para dizer em que arquivo a fila está. Sem barra de porcentagem: `fetch` não reporta progresso de upload, e trocar o cliente HTTP por `XMLHttpRequest` só por isso não se paga
- **A falha de um arquivo fica na tela, com o motivo, até ser dispensada.** Falha que desaparece sozinha é foto que a pessoa acha que enviou
- **`<img>` comum, não `next/image`.** A URL de leitura é assinada e muda a cada leitura; o otimizador do Next cacheia por URL e reotimizaria a mesma foto a cada visita, gastando CPU do plano compartilhado para produzir um arquivo que ele já tinha sob outro nome
- **A URL de leitura expira em uma hora**, e esta tela fica aberta. O `onError` da imagem recarrega a lista **uma vez**: em laço, um objeto perdido viraria uma tela consumindo a API para sempre
- **Capa e remoção recarregam a lista; a ordem aproveita a resposta.** Definir capa tira a marca de outra mídia, e remover a capa promove a próxima — a resposta de um item não diz qual é o outro. `ordem` devolve a lista inteira, então ali não há segunda chamada
- **O nome do arquivo é gravado como texto alternativo do documento.** A API não guarda nome de arquivo; sem isso, uma matrícula enviada é um ícone de PDF sem identificação, e quem procura abre um por um. Para foto não se preenche — `IMG_4821.jpg` lido em voz alta por leitor de tela é pior do que silêncio
- **Largura e altura são medidas no navegador** antes do envio, como o contrato previa, para a grade reservar o espaço e não "pular" quando a foto chega
- **Planta em PDF mostra ícone e link, não miniatura.** Um quadrado cinza pareceria imagem que não carregou

**Verificação.** Tipo, lint e build. O percurso foi exercitado contra o servidor em execução, nas mesmas chamadas e na mesma ordem em que a tela as faz, com 29 conferências: a primeira foto nasce capa, a troca de capa deixa exatamente uma, documento recusa ser capa, a ordem que a galeria monta é aceita e a parcial é recusada com 400, descrição salva e vazio apaga, PDF como foto / GIF / arquivo de 6 MB recusados, remover a capa promove a próxima e a nova não é documento, o vigésimo primeiro arquivo não recebe URL assinada, a URL de leitura adulterada responde 403 — e as duas perguntas de isolamento: o corretor **vê** a mídia do imóvel do colega (`imovel:ver` é `ORG`) e **não** envia nela (`imovel:editar` é `OWN`, 403).

**Continua sem teste de componente**, pela decisão de 21/10/2026. A fila de envio e o tratamento de falha parcial são a lógica mais delicada do site até agora, e quem mexer nelas não tem como saber se quebrou algo. A função `novaOrdem` — que monta a lista inteira trocando dois vizinhos do mesmo grupo — foi conferida no percurso justamente porque é a parte que o 400 do servidor pegaria tarde.

**Um defeito da API do B4 apareceu ao rodar a suíte em máquina limpa e foi corrigido:** o adaptador local lia `API_PUBLIC_URL` no construtor, e a aplicação de teste sobe em porta aleatória que só se conhece depois de escutar. Toda URL assinada do teste apontava para a porta 3000, então os 17 casos que enviam o arquivo de verdade **só passavam com o `npm run dev` no ar** — suíte que depende de processo externo passa na máquina de quem escreveu e falha na do próximo. A base agora é lida a cada uso e o teste a aponta para si mesmo.

Pendente deste item: só o **adaptador do R2**.

---

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

### Telas de agenda e tarefas — **concluídas em 22/10/2026**

`/painel/agenda`, `/painel/agenda/nova`, `/painel/agenda/[id]` e `/painel/tarefas`, mais os dois itens novos no menu e o contador de tarefas vencidas no `/painel`.

Quatro decisões de interface:

- **Dia, semana e mês são recortes da mesma lista, não três calendários.** Os três períodos que o §8 pede existem, e nenhum deles é grade. O motivo é o §7: a página tem de funcionar em tela de 360px, e grade de sete colunas nessa largura só funciona com rolagem horizontal — a interação que mais se perde no celular, que é o aparelho que o corretor leva para a visita. Agrupada por dia, a mesma informação desce verticalmente. O padrão é a **semana**: dia é curto demais para "o que eu tenho pela frente?", e mês, em lista, é longo demais para ser a primeira coisa que aparece
- **A tarefa não tem tela de detalhe**, e o mapa de telas já previa isso. Ela tem título, prazo e situação; uma tela inteira para três campos faria da baixa dois cliques e uma navegação, e a tarefa é justamente o registro que não pode dar trabalho — se der, ninguém anota e a lista morre. Criar, concluir, reabrir e mudar o prazo acontecem todos na lista
- **O link para a ficha do cliente é condicional**, e é aqui que a decisão de 21/10/2026 aparece na tela: a visita traz nome e telefone mesmo para quem não responde pelo cliente, mas o link só existe quando `cliente.acessivel` é `true`. Oferecê-lo sempre levaria a um 404, e quem clicasse concluiria que o sistema está quebrado — quando ele está funcionando exatamente como deve. O bloco sem link vem com uma linha explicando por quê
- **O telefone é repetido na tela da visita**, ao contrário do que a tela da negociação faz. Lá, duplicar dado pessoal por conveniência que um link resolve não se justifica. Aqui, quem conduz a visita do cliente de um colega **não alcança** a ficha, e sem o telefone a decisão de deixá-lo ver a visita não serviria para nada

Uma conversão entra em dois pontos e mora num lugar só (`lib/agenda.ts`): o `datetime-local` entrega hora local **sem fuso**, que o contrato recusa de propósito, e o período pedido à API é montado em hora local antes de virar ISO. Pedir a janela em UTC cortaria as visitas de sábado à noite — que são as que existem.

### Seed com agenda — **22/10/2026**

Quinze visitas e dezoito tarefas nas três organizações. Dois pontos de método:

- **As datas são relativas a hoje**, não fixas. Data fixa envelhece: em um mês, toda a agenda do seed estaria no passado, e a tela que mais importa conferir — "o que tenho esta semana" — nasceria vazia
- **Uma linha existe só para provar a segunda porta**: a visita do cliente da Bianca conduzida pelo Tiago. Entrando como Tiago, ela aparece com o nome e o telefone da cliente e **sem** link para a ficha, que responde 404 para ele. Sem esse registro no banco, a decisão de 21/10/2026 não teria como ser vista funcionando, e o seed imprime a instrução de como chegar nela

**Verificação.** 697 testes na API, `npm run build` passando nos dois apps. O percurso foi exercitado contra o servidor em execução: agendar atribuindo a outra pessoa, editar horário, mudar situação, criar tarefa, o erro por campo do fim antes do início, e os três códigos que a matriz decide — o corretor atribuindo recebe **403**, o gerente **200**, e o corretor que perdeu a condução da visita passa a receber **404** nela. As telas continuam **sem teste de componente**, pela decisão de 21/10/2026.

---

### Dashboard — **concluído em 22/10/2026**

`GET /painel/resumo` e a reescrita do `/painel`, que até aqui era provisório. 23 testes novos.

**Uma rota, quatro escopos — e é isso que define o item.** O resumo é a primeira rota do projeto que responde a mais de uma pergunta na mesma requisição, e os escopos divergem de verdade: `lead:ver` é `OWN` para o corretor, `imovel:ver` é `ORG` para todos, `lead:verNaoAtribuidos` é `false` para ele. Um `@Exige` não expressa isso — ele é estático por rota.

A saída foi `paraAcao()`: a guarda confere o piso (sessão, organização ativa, vínculo), e cada número é calculado num contexto derivado, com a ação que ele representa e o escopo que a **matriz** dá àquela ação para aquele papel. Nenhum serviço sabe que está sendo chamado pelo resumo; cada um continua lendo `contexto.escopo` como sempre.

Decisões tomadas durante a implementação:

- **O resumo reaproveita os serviços, não consulta as tabelas.** Seria menos acoplado consultar direto, e mais perigoso: cada consulta própria seria uma cópia de um recorte de visibilidade. O item B7 já pagou essa conta — um filtro escrito duas vezes deixou o nome de um cliente excluído sair por um dos dois caminhos. Em um resumo o erro é ainda mais discreto, porque contador inflado não parece defeito, parece número grande
- **O escopo dos rascunhos vem de `imovel:editar`, não de `imovel:ver`.** A pergunta que o número responde é "o que falta eu terminar?", e terminar é editar. Como `imovel:ver` é `ORG` para todos, usá-la daria ao corretor o total da casa inteira — trabalho que ele não pode fazer, porque não edita o imóvel do colega. Contador que aponta trabalho impossível ensina a pessoa a ignorá-lo
- **A fila a distribuir é `null`, nunca `0`, para quem não a alcança.** `0` afirmaria que a fila está vazia, e a tela mostraria um número tranquilizador que ninguém mediu. `null` diz "esta pergunta não é sua", e o cartão não existe
- **A resposta carrega `escopos`**, e não é informação de depuração: é o que permite à tela escrever "seus clientes" ou "da equipe". "3 clientes novos" significa coisas diferentes por papel, e uma legenda única mentiria para metade deles
- **A janela de "hoje e amanhã" vem do navegador**, como na agenda, com teto de três dias no contrato. O servidor não sabe o fuso de quem olha; calculada em UTC, a janela mostraria a agenda de amanhã às 22h de Brasília. O teto existe para este endpoint não virar um segundo caminho para listar a agenda inteira
- **Cartão de número só aparece quando há número.** Painel com quatro zeros ocupa a tela para dizer "nada a fazer" e ensina a não olhar. Sem pendência, a tela diz isso em uma linha e dá o espaço à agenda do dia
- **Primeiros passos substituem o painel só quando a organização não tem imóvel *nem* cliente.** Quem já cadastrou imóvel está operando e merece ver a pendência apontada, não um tutorial. A decisão vem de contagens da **organização**, não do que é da pessoa: para o corretor recém-contratado numa imobiliária povoada, a casa já opera, e ele vê o painel
- **O guia não menciona a vitrine**, por mais natural que fosse ("cadastre → publique → compartilhe"). Ela é a Fase 3 e não existe. Guia que promete tela inexistente gasta a confiança que deveria construir

**Um defeito do B8 apareceu aqui, e foi corrigido.** `acessivel`, no recorte do cliente da agenda, comparava apenas `lead.assignedMemberId === membershipId`. Para o `AGENT` está certo — `lead:ver` é `OWN` para ele. Para `MANAGER` e acima estava **errado para o lado seguro**: o escopo deles é `ORG`, a ficha do cliente abre, e a tela escondia o link em toda visita ou tarefa de cliente de outra pessoa. Ninguém perdeu dado; o gerente apenas não conseguia chegar ao cliente a partir da agenda, e nada explicava por quê.

Ficou invisível por um dia porque **teste de isolamento testa o que não deve aparecer**, e este era o contrário: algo permitido que não aparecia. Apareceu quando o painel do gerente ficou sem um único link para cliente. O cálculo agora considera o escopo, há teste para os quatro papéis, e o campo ganhou a nota do porquê.

**Verificação.** 722 testes na API, `npm run build` nos dois apps. Exercitado contra o servidor com as contas do seed: o corretor vê 1 cliente novo, 1 rascunho, `naFila: null` e só a visita dele; o gerente vê 9, 3, `naFila: 3` e as três visitas da casa. Uma conta criada pelo `POST /autenticacao/cadastro` devolveu os três primeiros passos pendentes e todos os contadores em zero — o caso do guia.

---

## Fase 3: catálogo público

Depende de: B1 a B4 · mecanismo anti-spam decidido · texto do aviso de privacidade.

| # | Tarefa | Critério de aceitação verificável | Depende de |
|---|---|---|---|
| C1 | Vitrine `/o/[slug]` — *concluído em 29/10/2026* | Mostra só `AVAILABLE` e `RESERVED`, este com etiqueta; teste confirma que `DRAFT`, `SOLD`, `RENTED`, `INACTIVE` e excluído **não** aparecem | B2 |
| C2 | DTO público — *concluído em 23/10/2026* | Construído campo a campo; **teste que falha se um campo novo do `Property` vazar** na resposta pública | B3 |
| C3 | Redirecionamento de slug | Slug antigo responde 301 para o novo; adotar slug que ainda redireciona é recusado | A2 |
| C4 | Busca e filtros — *concluído em 29/10/2026* | Filtros de `filtrosDoCatalogoSchema`; teste confirma que **não** há filtro por rua, CEP ou coordenada | C2 |
| C5 | Captura de lead — *concluído em 29/10/2026, com o aviso em rascunho e travado em produção* | Consentimento explícito obrigatório; grava versão do aviso e **hash** do IP; resposta não devolve IDs internos; lead vai ao responsável do imóvel ou à fila | B5, C1 |
| C6 | Anti-spam | Limite por IP comprovado em teste; mecanismo escolhido registrado em `docs/` | C5 |
| C7 | SEO e responsividade | Título, descrição e dados estruturados por imóvel; páginas utilizáveis em tela de 360px | C1 |

### API pública — **C2 concluído em 23/10/2026, e com ele o B3**

Três rotas em `apps/api/src/catalogo/`, sob `/api/publico/organizacoes/:slug`: a organização, a vitrine paginada e o anúncio por slug. São **788 testes**.

**O teste que define o item falha sem ninguém editá-lo.** `test/catalogo/vazamento.http.spec.ts` lê `Prisma.PropertyScalarFieldEnum` — a lista de colunas que o Prisma gera a partir do schema — e exige que **cada** coluna esteja declarada como pública ou privada em `resposta-publica.ts`. Uma migration que acrescente coluna quebra a suíte até alguém decidir de que lado ela fica. O mecanismo foi verificado na prática, não presumido: uma coluna `comissao` acrescentada ao schema apareceu em `semDecisao` e derrubaria o caso.

Um teste que apenas conferisse os campos da resposta não cumpriria o critério: campo que ninguém mapeou não aparece na resposta, e o vazamento nasceria no dia em que alguém o mapeasse. A mesma classificação cobre `Organization` e `PropertyMedia`.

Decisões tomadas durante a implementação:

- **O DTO público não reaproveita nada do DTO do CRM.** Aquele carrega `code`, `zipCode`, `street`, `number` e o responsável; partir dele e remover campos é lista negra escrita de outro jeito, e `permissions.md` §5 proíbe exatamente isso
- **Um recorte, em um lugar só** (`visivel()`), usado pelas três consultas. No B7 a listagem e a consulta por id tinham recortes separados, a segunda esqueceu um filtro e o nome de um cliente excluído saiu por ali. Lá era o CRM; aqui é a porta da rua. Há teste separado para a listagem e para o acesso direto pelo slug, com os quatro estados comerciais
- **Quatro condições, e a quarta é a que se esquece:** publicado, estado visível, não excluído e **organização ativa**. Sem a última, suspender uma conta deixaria a vitrine no ar
- **Tudo responde 404 — slug inexistente, organização suspensa, imóvel em rascunho.** Não há sessão para negar, e 403 diria ao visitante que aquele endereço existe e está escondido
- **`DOCUMENT` não é filtrado depois de carregado: ele não é lido.** A consulta de mídia pede só `PHOTO` e `FLOORPLAN`, então matrícula e contrato não saem do banco — nenhuma mudança futura no DTO consegue deixá-los escapar
- **O `select` repete a lista branca no nível do banco.** O que não é lido não pode ser devolvido por engano
- **Ordenado por `publishedAt`, não por `createdAt`:** um imóvel cadastrado em março e publicado hoje tem de aparecer primeiro
- **A capa vem por `select` aninhado com `take: 1`** — uma consulta para a página inteira. É onde o N+1 do item B10 nasceria

**Ressalva registrada:** a chave do objeto de mídia é `organizacoes/<org>/imoveis/<imovel>/…` (decisão do B4), então o `organizationId` viaja **dentro da URL da foto** — hoje dentro da assinatura, no R2 visível no caminho. Ele não sai como campo, mas sai. Aceito: é identificador opaco, não credencial, e toda rota privada deriva a organização da sessão.

**Pendência que o C2 torna concreta:** a URL de leitura da mídia expira em uma hora. No catálogo público isso não serve — a página fica em cache e o robô de busca guarda o HTML. O adaptador do R2 precisa servir `PHOTO` e `FLOORPLAN` por domínio público, como a porta já prevê; `DOCUMENT` continua atrás de URL assinada, e nunca aparece aqui.

### Vitrine — **C1 concluído em 29/10/2026**

Duas páginas em `apps/web/app/o/[slug]/`: a vitrine, paginada por `?pagina=`, e o anúncio em `imovel/[imovelSlug]`. Continuam **788 testes**: o critério de aceitação — `DRAFT`, `SOLD`, `RENTED`, `INACTIVE`, excluído e organização suspensa não aparecem — já é provado pela API em `test/catalogo/catalogo.http.spec.ts`, e a tela não abre caminho de dados novo. Sem teste de componente, pela decisão de 21/10/2026.

**Gerada no servidor, ao contrário do painel.** As páginas são Server Components, sem `'use client'`: o robô de busca e a prévia do link no WhatsApp recebem o anúncio pronto, e o C7 depende disso. A requisição sai do Next para a API pelo `API_INTERNAL_URL`, **sem cookie** — o corretor logado vê a vitrine exatamente como o cliente.

Decisões tomadas durante a implementação:

- **Tipo próprio em `apps/web/lib/catalogo.ts`**, espelho de `resposta-publica.ts` e não de `lib/imoveis.ts`. Uma tela da vitrine que tentasse mostrar o código do imóvel não compila
- **Sem cache** (`no-store`): a URL da foto expira em uma hora. Volta a ser discutido com o adaptador do R2
- **404 de verdade, com uma frase só**, para slug inexistente, organização suspensa e imóvel fora do ar. A página não oferece link para a vitrine, porque isso afirmaria que a organização existe
- **Sem formulário de interesse** até o C5. Formulário que não envia é pior do que nenhum; até lá, o anúncio mostra o contato público da organização, e o bloco some quando ela não tem nenhum
- **Galeria por rolagem nativa com `scroll-snap`**, sem JavaScript. A planta usa `object-contain`, porque o corte comeria as medidas
- O seed dá apresentação e contato à Aurora e ao Paulo Reis; a **Meridiano fica sem**, para que a vitrine de uma conta nova seja exercitada

Verificado contra o servidor em execução: com imóveis vendido, alugado, inativo e rascunho **publicados à força** no banco, nenhum aparece e o acesso direto responde 404; os três níveis de endereço saem como `montarEndereco` decide, e o CEP em nenhum; foto e planta enviadas pelo fluxo do B4 aparecem na galeria e na capa do cartão; as duas páginas cabem em 360px. Um defeito apareceu na captura de tela e foi corrigido: o cartão encolhia até o conteúdo, e a grade saía com larguras diferentes.

**Divergência encontrada e decidida no mesmo dia:** o slug do imóvel é montado com o título **e o código** (`apartamento-no-pinheiros-ap-001`, decisão do B1), e o C2 classificava `code` como coluna **privada**. O código já saía na URL de todo anúncio. **Decidido em 29/10/2026: o código é público** — ver `data-model.md` §5. Ele passou para `COLUNAS_PUBLICAS_DE_IMOVEL`, sai como `codigo` na API pública, com teste que exige a presença dele, e o anúncio mostra "Cód. AP-001" e pede ao visitante que o informe no contato.

### Busca e filtros — **C4 concluído em 29/10/2026**

`GET /api/publico/organizacoes/:slug/imoveis` aceita os filtros de `filtrosDoCatalogoSchema`, que saiu de `captura-de-lead.ts` para `packages/shared/src/schemas/catalogo.ts` e trocou texto livre por enumeração em tipo e finalidade. Na vitrine, um formulário GET sem JavaScript. São **21 testes novos** em `test/catalogo/busca.http.spec.ts`.

**O teste que cumpre o critério não confere o schema — confere a resposta.** Um imóvel com rua, número, complemento e CEP cadastrados, nos três níveis de visibilidade, e a busca livre por cada um deles devolvendo zero. Conferir que o schema não tem campo `rua` provaria pouco, porque chave desconhecida é descartada e `?cep=` nunca falharia. A mutação foi feita na prática: com `street` acrescentado à busca livre, os três casos quebram.

Decisões tomadas durante a implementação:

- **Os filtros entram ao lado do `visivel()`, num `AND`**, e nunca dentro dele: filtro nenhum alarga o recorte, e há teste com rascunho, vendido, despublicado, excluído e outra organização casando com o termo
- **Busca livre em título, código, bairro e cidade.** Nunca na rua, em nível nenhum — nem no `FULL`, para não depender de conferir a visibilidade dentro do filtro
- **Preço exige finalidade; `BOTH` aparece nas duas buscas**, comparado pelo preço da finalidade pedida. Testado com um `BOTH` de venda cara e aluguel barato, que é o caso que denuncia o campo trocado
- **Ausência nunca vira zero**, como decidido em 21/10/2026. Mínimo zero é ignorado, porque aplicado também esconderia o imóvel sem a informação. Área usa a útil quando existe, senão a total
- **Parâmetro desconhecido é ignorado**, não recusado: `fbclid` e `utm_source` chegam em todo link compartilhado
- **Campo em branco é ausência.** O formulário GET manda `?precoMinimo=`, que o `coerce` transformaria em zero
- **Filtro inválido não derruba a página:** volta como erro no campo, e a lista mostra tudo com um aviso. Aplicar só a parte válida mostraria um resultado que não corresponde ao pedido
- **Acento e maiúscula** ficam com a collation da coluna, `utf8mb4_unicode_ci` — conferida no banco, e coberta por teste nos dois sentidos

Verificado contra o servidor em execução: contagem por finalidade e por termo, formulário enviado em branco, erro de preço sem finalidade com a lista inteira, paginação de uma busca de 15 resultados levando o termo na página 2, e as duas larguras.

**Fica para quando houver motivo:** busca textual (FULLTEXT). O `LIKE '%termo%'` não usa índice, e basta enquanto a busca roda dentro de uma organização só.

### Captura de lead — **C5 concluído em 29/10/2026**

`POST /api/publico/organizacoes/:slug/interesse` e o formulário no anúncio. São **21 testes novos** em `test/catalogo/captura-de-lead.http.spec.ts`, e nenhuma migration: as colunas de consentimento e a tabela `Inquiry` existiam desde a fundação.

**A dependência do aviso de privacidade foi resolvida com uma trava, não com um texto.** O roadmap exigia o texto do aviso, e `pages-and-navigation.md` §4 proíbe texto jurídico improvisado. Decidido em 29/10/2026: o aviso existe com texto provisório e `rascunho: true` em `packages/shared/src/aviso-de-privacidade.ts`, e **em produção a rota responde 503 e o anúncio não mostra o formulário** enquanto for assim. Liberar exige o parecer (D6), trocar o texto de `/privacidade` e mudar a versão — as três coisas juntas.

Decisões tomadas durante a implementação:

- **A captura mora no `CatalogoService`**, ao lado do `visivel()`, e não no módulo de leads: o imóvel tem de ser um que o visitante alcança, e esta é a única definição disso. Rascunho, vendido, excluído, de outra organização e organização suspensa dão o mesmo 404. Verificado por mutação: trocar o recorte por um filtro só de organização quebra três casos
- **O lead vai ao responsável do imóvel se o vínculo dele estiver ativo**; sem responsável ou com ele suspenso, à fila. Entregar a quem foi suspenso esconderia o contato de todo mundo
- **Versão do aviso, hora do aceite e hash do IP vêm do servidor.** Teste envia os três inventados, mais responsável e origem, e confere que nada disso chega ao banco
- **Um lead novo por envio**, mesmo com telefone repetido — `data-model.md` §3.4 proíbe fusão automática, e a tela já sinaliza a duplicata
- **Auditoria `lead.capturado` com `actorMembershipId` nulo**: quem agiu foi um visitante sem conta. Sem dado pessoal no `metadata`
- **Limite de 5 envios por hora por IP** (`LIMITES.capturaPorIp`). O mecanismo anti-spam do C6 soma-se a ele
- **O formulário é o único `'use client'` do catálogo.** A caixa de consentimento nasce desmarcada e o link do aviso abre em outra aba, para quem o lê no meio do preenchimento não perder o que escreveu
- O seed passou a gravar a versão real do aviso nos leads da vitrine, em vez de uma data que não correspondia a texto nenhum

Verificado contra o servidor em execução, pelo proxy do site: o anúncio mostra o formulário com a caixa desmarcada, nas duas larguras; o envio cria o lead para o Tiago, com a versão do aviso, hash de 64 caracteres, a origem `/o/aurora/imovel/...` e uma linha de auditoria; o Tiago o vê com o consentimento, a Bianca não; sem consentimento responde 400, e o imóvel da Aurora enviado pela vitrine da Meridiano, 404.

**Pendente:** o texto final do aviso (D6). A seção "Para quem tem conta no sistema" de `/privacidade` também está por redigir — o cadastro linka para a mesma página.

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
| ~~Código do imóvel no slug público~~ | ~~Coerência entre B1 e C2~~ | **Decidido em 29/10/2026: o código é público.** Ver `data-model.md` §5 |
| Parecer jurídico sobre anonimização | D6, piloto | Advogado — **não é decisão técnica** |
| Marca verificada no INPI e Registro.br | Qualquer uso público | Responsável |
| ~~Seis etapas do funil ou cinco?~~ | ~~A2~~ | **Seis**, confirmado em 21/10/2026: era divergência de redação, não decisão em aberto. O código já semeava seis desde o A2, e `data-model.md` §3.4 foi corrigido |
