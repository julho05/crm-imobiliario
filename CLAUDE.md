# Doverni — Instruções permanentes para Claude Code

> Repositório **privado**. Este arquivo é versionado para acompanhar o projeto entre máquinas.

## Objetivo
Construir um SaaS brasileiro de CRM imobiliário com catálogo público de imóveis para corretores autônomos e imobiliárias, com assinatura recorrente. Entregar um MVP seguro, responsivo, simples de usar e possível de hospedar em serviço Node.js gerenciado.

## Estado do projeto
**Fase 1 — fundação** (desde 19/10/2026). O planejamento foi concluído e a fundação técnica está de pé: monorepo com npm workspaces, MySQL em container, Next.js e NestJS subindo e conversando entre si.

Em 20/10/2026 o banco ganhou estrutura: `apps/api/prisma/schema.prisma` implementa o `docs/data-model.md` em 19 tabelas, a migration inicial está aplicada e versionada, e o `GET /health` consulta o MySQL de verdade. Ver `docs/data-model.md` §10 e `docs/architecture.md` (seção Prisma 7).

Em 20/10/2026, no mesmo dia, foram resolvidas as quatro pendências da revisão arquitetural: design system (Tailwind 4 + shadcn/ui com as cores oficiais, claro e escuro), mapa de telas (`docs/pages-and-navigation.md`), roadmap com critérios de aceitação verificáveis, e contratos compartilhados em `packages/shared` (enums, matriz de permissões, schemas Zod). Entraram também ESLint, Prettier, Vitest e CI.

Em 20/10/2026 a autenticação avançou até o **A10**: hash Argon2id, cadastro transacional, sessão opaca com estado no MySQL, login e logout (A1 a A4), e os sete passos de `docs/permissions.md` §6 em um módulo — a guarda `AutorizacaoGuard` cobre os passos 1 a 4 e o `AutorizacaoService` cobre 5 a 7 (A5). O A6 está provado por teste: suspender um membro ou uma organização corta o acesso na requisição seguinte, sem esperar expiração. O A7 expõe a troca de organização ativa conferindo o vínculo no servidor. A8, A9 e A10 — verificação de e-mail, recuperação de senha e convites — compartilham um único mecanismo de token de uso único (`token-de-uso-unico.ts`) e uma porta de e-mail. São 330 testes em `npm run verify`.

**Decisão de 20/10/2026:** o e-mail entra por uma porta (`RemetenteDeEmail`), com adaptador de log em desenvolvimento. O provedor real continua **não escolhido**, mas não bloqueia mais nada. A API recusa iniciar com `EMAIL_PROVIDER=log` em produção.

Em 20/10/2026 entraram as **primeiras telas**: `/cadastro`, `/entrar`, `/recuperar-senha`, `/redefinir-senha`, `/convite` e um `/painel` provisório, em `apps/web/app/(entrada)/`. Fecham o item 1 do escopo do MVP e foram verificadas ponta a ponta pelo navegador. O `/painel` **não** é o dashboard: ele confirma a sessão, lista organizações e encerra a sessão, nada mais.

Em 21/10/2026 entrou o **B1** (CRUD de imóveis), e com ele fecharam o **A12** e o **A13** — nessa ordem por necessidade, não por escolha: os dois só existem de verdade contra endpoint de recurso. Até ali a guarda estava provada por rotas que existiam somente no teste, o que mostra que o mecanismo funciona mas não que a rota de produção se lembra de chamá-lo. Agora `apps/api/test/imoveis/isolamento.http.spec.ts` faz as perguntas do `docs/permissions.md` §8.2, §8.3 e §8.4 contra `/api/imoveis`, a rota que o site usa. São **401 testes** em `npm run verify`.

**A Fase 1 está fechada**, com um único item em aberto: o **A11** (rate limiting), que depende de decisão sua — dependência nova ou implementação sobre o MySQL, e a escolha muda se a hospedagem rodar mais de um processo. Ele não bloqueia a Fase 2.

Em 21/10/2026, ainda no mesmo dia, entraram o **B2** (publicação) e as **telas de imóveis**: layout do painel com navegação por papel e seletor de organização, lista com filtros e paginação, formulário de cadastro e edição em cinco seções, publicar/tirar do ar e exclusão com confirmação. São **421 testes** na API.

O formulário carrega as duas proteções que `docs/pages-and-navigation.md` §5 exige e que nenhum desenho de banco resolve: o controle de visibilidade do endereço fica **visível e explicado**, e o campo de descrição avisa que o texto é público quando o endereço não é `FULL` — porque o furo real é o corretor configurar o endereço como oculto e escrever a rua no texto livre.

**As telas não têm teste automatizado** (decisão de 21/10/2026: não acrescentar `@testing-library/react` e `jsdom` agora). Elas passam por tipo, lint e build, e o percurso cadastro → imóvel → publicação foi exercitado contra o servidor em execução. A lógica do formulário — erro por campo, preço por finalidade, vazio que apaga na edição — está sem rede de proteção, e quem mexer nela depois não tem como saber se quebrou algo.

Ainda em 21/10/2026 entraram o **estado comercial** do imóvel (`POST /imoveis/:id/estado`, com evento de auditoria por estado) e o **seed de desenvolvimento** (`npm run db:seed`). São **435 testes**.

O seed cria três organizações — uma imobiliária com os quatro papéis e 26 imóveis, outra com dois membros, e um corretor autônomo —, com imóveis nos seis estados, alguns sem responsável e alguns sem área, e uma pessoa com vínculo em duas organizações. Senha de todas as contas: `Desenvolvimento123`. Ele **apaga** o banco antes de inserir, e por isso tem três guardas, todas verificadas na prática: recusa `NODE_ENV=production`, recusa banco que não se chame `crm_dev` e recusa host não local.

**O seed pagou-se na primeira hora:** ele revelou que o painel tratava "tem vínculo em duas organizações e ainda não escolheu" como "conta sem organização nenhuma" — e dizia à pessoa que ela não pertencia a lugar nenhum, sem oferecer saída. A API estava certa: devolve `null` de propósito para forçar a escolha explícita. A tela agora distingue os dois casos. Nenhum teste automatizado pegaria isso, porque não há teste de componente no site.

Em 21/10/2026 entraram o **B5** e o **B6** — leads e fila de não atribuídos — com API e telas. São **532 testes**.

**A inversão em relação a imóveis é o que define o item.** `imovel:ver` é `ORG` para os quatro papéis; `lead:ver` é **`OWN`** para o corretor. Então o imóvel do colega responde **403** ao ser editado (ele o vê na lista; esconder seria teatro) e o lead do colega responde **404** (ele não o vê; um 403 entregaria o que o escopo `OWN` existe para negar). Quem decide é a matriz, pelo `AutorizacaoService`, sem lista escrita à mão.

A duplicata por telefone é sinalizada em **dois níveis**, e isso merece atenção se alguém mexer: duplicata no alcance de quem cadastra vem com nome e responsável; duplicata de um colega vem apenas como `{ nivel: 'restrita' }`. Sem esse recorte, a busca do cadastro vazaria a carteira do colega. O nível restrito ainda revela *que* alguém tem aquele telefone — troca deliberada, porque sem aviso nenhum dois corretores ligam para a mesma pessoa no mesmo dia.

Entrou junto, por necessidade: **`GET /equipe/membros`** (nome, papel e `Membership.id`, **sem e-mail**) — o seletor de responsável não tinha de onde tirar a lista.

Em 21/10/2026 entrou o **B7** — funil de negociações — com API e tela. São **603 testes**.

**A visibilidade herda o lead**, e isso atravessa o módulo: o recorte da listagem filtra por `lead.assignedMemberId`, e o `conferir()` recebe o responsável do **lead**, nunca o da negociação. Passar o cliente a outra pessoa passa a negociação com ele, sem ninguém tocar no registro — verificado contra o servidor. Consequência: atribuir a negociação a quem não é responsável pelo cliente é **recusado**, porque criaria um responsável que recebe 404 ao abrir o próprio registro.

**Outro teste encontrou um vazamento real**, o segundo em dois dias: a listagem excluía negociação de cliente excluído, mas a consulta por id ainda devolvia o nome dele — o `carregar` filtrava só o `deletedAt` da negociação. Atendido um pedido de LGPD, o nome sobreviveria por essa porta. O filtro agora é o mesmo nos dois caminhos.

Em 21/10/2026 entrou a **API do B8** — agenda e tarefas —, e em 22/10/2026 as **telas**: `/painel/agenda`, `/painel/agenda/nova`, `/painel/agenda/[id]` e `/painel/tarefas`. São **697 testes**.

**A visibilidade ganhou uma segunda porta, e isso é mudança de regra, não detalhe.** Em `Visit` e `Task` o responsável é obrigatório e o cliente é opcional — o inverso de `Deal`. Então enxerga quem responde pelo **registro** ou pelo **cliente**: o gerente manda o Tiago conduzir a visita da cliente da Bianca, e o Tiago precisa ver, porque vai encontrar a pessoa. O que ele recebe do cliente é o **mínimo do encontro** — nome e telefone, e nada mais —, e a ficha do cliente continua respondendo 404 para ele. A contrapartida: atribuir passou a ser uma forma de revelar um contato, então só `MANAGER` para cima atribui e a auditoria registra `revelouCliente`.

Na tela, essa decisão aparece em **um** lugar concreto: o link para a ficha do cliente só existe quando `cliente.acessivel` é `true`. Oferecê-lo sempre levaria a um 404, e quem clicasse concluiria que o sistema quebrou — quando ele está funcionando como deve. Verificado contra o servidor: o corretor que perde a condução da visita passa a receber 404 nela.

**A agenda é lista agrupada por dia, não grade** — dia, semana e mês são recortes da mesma lista, com semana por padrão. Grade de sete colunas em tela de 360px só funciona com rolagem horizontal, e o aparelho do corretor é o celular. A conversão de fuso mora num lugar só (`apps/web/lib/agenda.ts`): o `datetime-local` entrega hora local sem fuso, que o contrato recusa, e a janela pedida à API é montada em hora local — em UTC, ela cortaria as visitas de sábado à noite.

**A tarefa não tem tela de detalhe**, por decisão: título, prazo e situação não justificam uma tela, e baixa que custa dois cliques é baixa que não acontece. Criar, concluir, reabrir e mudar o prazo acontecem na própria lista.

O seed cria **15 visitas e 18 tarefas**, com datas **relativas a hoje** — data fixa envelheceria e em um mês a agenda do seed estaria toda no passado. Uma linha existe só para provar a segunda porta: a visita do cliente da Bianca conduzida pelo Tiago, e o seed imprime como chegar nela.

Ainda não existem dashboard nem catálogo público.

Continua valendo: **não** executar migrations, criar commits, alterar infraestrutura ou adicionar dependências sem autorização explícita do responsável. Primeiro examine este arquivo e os documentos da pasta `docs/`; em caso de conflito, apresente as divergências para decisão.

### Decisões já tomadas — não reabrir sem motivo
Registradas com data em [docs/permissions.md](docs/permissions.md) §9, [docs/data-model.md](docs/data-model.md) §9 e [docs/architecture.md](docs/architecture.md).

- Quatro papéis: `OWNER`, `ADMIN`, `MANAGER`, `AGENT`
- Corretor autônomo é uma organização de um membro, **não** um tipo de conta
- Leads: corretor vê só os próprios. Imóveis: lê todos da organização, edita só os dele
- Atribuição referencia `Membership`, nunca `User`
- Sessão opaca em cookie `httpOnly` com estado no MySQL — **não** JWT
- npm workspaces, sem Turborepo
- A marca ainda **não** está decidida; manter o código neutro, com o nome só em `NEXT_PUBLIC_APP_NAME`
- **Campos obrigatórios do imóvel** (21/10/2026): só o piso do banco — título, tipo, finalidade, UF, cidade, bairro — mais o preço coerente com a finalidade. Área e dormitórios são opcionais, porque campo obrigatório que o corretor ainda não sabe produz número inventado. Consequência registrada para a Fase 3: filtro por área ou dormitório tem de **excluir** o imóvel sem o valor, nunca tratá-lo como zero
- **Código do imóvel** (21/10/2026): gerado pelo servidor (`AP-001`, sequencial por organização, prefixo pelo tipo) e **editável** — a imobiliária que já numera imóveis usa essa referência no anúncio e no WhatsApp
- **Hospedagem gerenciada, não VPS** (21/10/2026): o VPS daria Docker e root e cobraria a manutenção permanente do servidor. O produto é feito por uma pessoa só
- **Sem workers persistentes, sem tarefas agendadas internas e sem WebSocket de entrada** — limites do plano. Consequência imediata: a correção documentada do A9 (enviar e-mail fora do caminho da requisição) **não é possível**; a saída entra junto com a escolha do provedor de e-mail
- **A11 sobre o MySQL, não em memória** (21/10/2026): sem garantia de processo único, contador em memória daria um limite por processo
- **Visibilidade do endereço é editável** (21/10/2026), ao contrário de `status` e `ownerMemberId`: é decisão de quem cadastra e precisa estar no formulário. O padrão restritivo continua no banco, então omitir o campo nunca abre o endereço — o esquecimento erra para o lado seguro
- **O lead nasce atribuído a quem cadastrou** (21/10/2026), inclusive para `MANAGER` e acima. A matriz só exigia isso do `AGENT`; para os outros, deixá-lo sem responsável faria o contato que o gerente acabou de atender no telefone cair na fila como se ninguém o tivesse visto. Devolver à fila é um clique (`responsavel: null`)
- **`origem` do lead não é editável** (21/10/2026): ela registra como o contato chegou, e editável transformaria o relatório de origem em opinião. `PUBLIC_CATALOG` é recusada no cadastro manual — só a vitrine a produz
- **Seis etapas no funil**, não cinco (21/10/2026): era divergência de redação em `docs/data-model.md` §3.4, já corrigida. `Fechado` e `Perdido` são etapas distintas, e o código semeia seis desde o A2

## Stack proposta
- TypeScript em frontend e backend
- Next.js (App Router) para o painel e o catálogo público
- NestJS para API REST
- MySQL + Prisma para persistência
- Tailwind CSS + shadcn/ui para design system
- Git/GitHub para versionamento
- Testes: unitários, integração e e2e para fluxos críticos
- Ambiente local: MySQL local ou Docker *somente no desenvolvimento*, se for útil
- Produção **decidida em 21/10/2026**: hospedagem **gerenciada** da Hostinger, plano **Unlimited**, com os limites confirmados pelo suporte — 2 aplicações Node simultâneas, 120 processos e 3 GB de RAM compartilhados, 75 conexões MySQL, processo contínuo sem hibernação. Mídia no **Cloudflare R2**. Continua valendo: não assumir acesso root, Docker em produção ou PostgreSQL interno. Detalhes e consequências em [docs/architecture.md](docs/architecture.md), seção Infraestrutura

## Identidade visual
Nome provisoriamente aprovado pelo empreendedor: **Doverni**. Antes de uso público, verificar marca no INPI e domínio no Registro.br (a disponibilidade NÃO foi comprovada).
- Azul-marinho `#142B3B`: navegação e identidade
- Dourado suave `#C5A46D`: destaques e ações selecionadas
- Neutros: branco, cinza muito claro, tons de cinza para texto
- Tema CLARO por padrão; tema ESCURO opcional e preferência persistida por usuário
- Priorizar contraste WCAG, foco visível, interface responsiva e uso moderado do dourado
- Linguagem do produto: português do Brasil; moeda BRL e datas locais

## Dois tipos de cliente, uma plataforma
- Corretor autônomo: organização própria com um usuário no plano inicial
- Imobiliária: organização com proprietário/admin, gerente e corretores
- Um usuário poderá pertencer a uma ou mais organizações; selecionar organização ativa explicitamente
- Toda operação com dados privados deve ser autorizada no servidor com base em usuário + organização + papel; filtros por `organizationId` não são suficientes sozinhos
- Nunca expor dados privados de uma organização a outra (incluindo por IDs diretos, buscas e uploads)
- Não confiar em `organizationId` fornecido pelo cliente sem validar associação e permissão

## Escopo do MVP
1. Cadastro e login, recuperação de senha e convite de usuários
2. Organizações, membros e papéis de acesso
3. Dashboard básico
4. Imóveis (cadastro, edição, fotos, disponibilidade, publicação)
5. Contatos/leads, origem, histórico e corretor responsável
6. Funil de negociações configurado inicialmente com etapas padrão
7. Agenda de visitas e tarefas
8. Catálogo público (busca, filtros, detalhe e solicitação de contato)
9. Captura do lead com identificação do imóvel e consentimento/aviso de privacidade
10. Configurações de perfil e aparência

## Fora do MVP, salvo nova aprovação
- WhatsApp automatizado e integrações com portais
- Aplicativo iOS/Android nativo
- IA generativa embutida
- Gestão financeira e de aluguel avançada
- Cobrança automática e assinatura paga (definir antes de vender, com integração e termos próprios)
- Site builder personalizável completo e domínio customizado por cliente

## Requisitos não funcionais
- Senhas com hash forte, sessões protegidas, política para tokens/cookies, rate limiting e validação de entradas
- Autorização robusta, logs de auditoria básicos, segredos fora do Git
- Política de privacidade e requisitos LGPD desde o design, especialmente leads e fotos
- Arquivos de mídia em armazenamento de objetos externo (**Cloudflare R2**, decidido em 21/10/2026). A justificativa **mudou**: o disco da Hostinger não é efêmero — isso vale para plataformas em contêiner, não para hospedagem tradicional. O motivo real é não gastar a CPU e a banda do plano compartilhado servindo foto de catálogo público, trabalho que o R2 faz de graça e perto do visitante
- Migrações versionadas e backups testados
- Tratamento de erros seguro e observabilidade mínima
- Paginação em listagens; índices apropriados; evitar N+1
- Testes de isolamento multi-tenant e permissão obrigatórios
- Sem dados reais de clientes em desenvolvimento

## Regras de colaboração com IA
1. Antes de cada implementação, explicar objetivo, abordagem, arquivos impactados, riscos e testes.
2. Fazer mudanças pequenas por módulo e aguardar aprovação quando envolver arquitetura, custos, dados ou segurança.
3. Nunca modificar infraestrutura de produção, faturamento ou dados existentes sem confirmação.
4. Não adicionar dependências sem justificar; usar versões estáveis verificadas ao instalar.
5. Não inventar compatibilidade com plano de hospedagem ou disponibilidade de serviços.
6. Para cada tarefa, entregar critérios de aceitação, testes e instruções de execução.
7. Não incluir segredos nem credenciais em arquivos rastreados; fornecer `.env.example` com placeholders.
8. Seguir documentação existente e atualizar `docs/` a cada decisão relevante.
9. Separar nitidamente fatos confirmados, hipóteses e decisões pendentes.
10. **Nunca assinar commits, pull requests, código ou documentos com nome de ferramenta ou de IA.** Nada de `Co-Authored-By`, nada de "Generated with", nada de menção a Anthropic ou Claude. A única autoria é a do responsável pelo projeto.

## Estrutura alvo (não criar tudo imediatamente)
```
doverni/
  apps/
    web/               # Next.js: CRM + catálogo público
    api/               # NestJS: regras de negócio + REST
  packages/
    ui/                # opcional, se houver benefício real
    shared/            # tipos e validações compartilháveis
  docs/
    product.md
    architecture.md
    data-model.md
    permissions.md
    design-system.md
    roadmap.md
  CLAUDE.md            # local, fora do Git
  README.md
```

## Ambiente de desenvolvimento verificado em 19/10/2026
Node 24.21.0 · npm 11.19.0 · Git 2.55.0 · Docker 29.9.1 (motor Linux via WSL 2) · MySQL 8.4.11 em container.

Versões fixadas no projeto: Next 16.4.2 · React 19.3.1 · NestJS 12.2.0 · **TypeScript 6.0.3** · Prisma 7.10.1 · Tailwind 4.3.3 · Zod 4.6.7 · ESLint 10.13.0 · Vitest 5.0.5.

Toda dependência é instalada com `--save-exact`. Faixa de versão (`^`) não entra sem motivo declarado.

Armadilhas confirmadas na prática:
- `npm view prisma version` devolve um **release candidate** (8.0.0-rc). A versão estável está na tag `prev`. Sempre fixar a versão do Prisma explicitamente. A própria CLI exibe banner sugerindo atualizar para o RC — ignorar.
- O TypeScript 7 existe, mas o NestJS 12 depende de `typescript@~6.0.2`. Usar o 7 quebra o build; manter o **6.0.3** até o NestJS acompanhar.
- No Prisma 7 a URL de conexão **não** fica no `datasource` do schema: vai em `prisma.config.ts` (Migrate) e no driver adapter (runtime). Para MySQL o adapter é `@prisma/adapter-mariadb`; `@prisma/adapter-mysql` não existe.
- A CLI do Prisma 7 não carrega `.env` sozinha. O `prisma.config.ts` carrega da raiz do monorepo.
- O `npm 11` bloqueia install scripts por padrão. No caso do Prisma não atrapalha: os engines vêm no pacote e o query compiler é WASM.
- `git config core.autocrlf` está `true` nesta máquina. Scripts `.sh` que rodam dentro de container precisam de LF — garantido pelo `.gitattributes`.
- **MySQL 8 + driver Node**: a autenticação `caching_sha2_password` exige a chave pública RSA do servidor em conexão sem TLS, e o driver recusa buscá-la sem permissão explícita. O MySQL **cacheia** autenticação bem-sucedida, então a falha fica escondida até o container reiniciar ou alguém rodar `FLUSH PRIVILEGES`. Resolvido em `PrismaService`, com `allowPublicKeyRetrieval` apenas em host local e fora de produção. Em produção, exige TLS.
- O Tailwind 4 **não** usa `tailwind.config.js`: o tema é declarado em CSS, em `apps/web/app/globals.css`.
- O CLI do shadcn instala dependências por conta própria, com faixa de versão e pacotes não solicitados (instalou `cn@^0.5.0`). Conferir o `package.json` depois de cada `shadcn add` e fixar as versões.
- O `tsc` emite arquivos mesmo quando falha com erro de tipo. Em `packages/shared` isso deixava um `dist/` parcial parecendo válido; corrigido com `noEmitOnError`.
- **Nao rodar `npm run build` com `npm run dev` no ar.** O `nest build` apaga e recria o `apps/api/dist`, e o processo do `nest start --watch` perde o arquivo que estava executando: a API morre com `Cannot find module dist/main` e fica esperando mudanca de arquivo. O sintoma engana — o site responde, mas toda chamada a API volta 500, porque o proxy do Next nao acha a porta 3333. Encerrar o `dev`, buildar, e subir de novo.
- O **Zod 4 recusa `.pick()` em runtime** quando o objeto tem refinamento (`.refine()`), mesmo compilando sem erro — o tipo diz que dá, a execução diz que não. `redefinirSenhaSchema.pick({ token: true })` passava no `tsc` e estourava ao carregar o módulo. Contrato compartilhado novo vai declarado em `packages/shared`, não derivado de um schema com refinamento.
- **`@UseGuards(Classe)` instancia a guarda no módulo do controller**, não reaproveita a instância do módulo que a declara. As dependências dela precisam estar no alcance desse módulo. Por isso o `AutorizacaoModule` **reexporta** o `AutenticacaoModule`: o `PrismaService` chega sozinho porque o `PrismaModule` é `@Global()`, mas o `SessaoService` não. O sintoma é um `Nest can't resolve dependencies of the AutorizacaoGuard` que não aponta para a causa.
- **Script fora de `src/` fica fora do `tsconfig.json` da API**, que inclui só `src/**/*` — a mesma armadilha que a pasta `test/` já tinha. O `prisma/seed.ts` ganhou `apps/api/prisma/tsconfig.json`, incluído no script `typecheck`. Duas consequências que custaram tentativa: o `rootDir` precisa ser `..` e não `prisma/`, porque o seed importa o client gerado que vive em `src/generated/`; e a saída vai para `dist-seed/`, nunca `dist/`, porque o `nest build` apaga e recria aquele. Pasta nova de saída precisa entrar no `eslint.config.mjs` e no `.prettierignore` — o `.gitignore` não vale para eles.
- **`__dirname` de um script compilado não é o da fonte.** O `prisma/seed.ts` carregava o `.env` com `../../../.env`, contado a partir de `prisma/`; compilado em `dist-seed/prisma/`, passou a apontar para `apps/.env`, e o seed recusou dizendo que `DATABASE_URL` não existia. Procurar o arquivo subindo a árvore funciona nas duas profundidades e sobrevive a mudança de pasta de saída.
- O ESLint deste projeto **recusa `setState` síncrono no corpo de um `useEffect`** (`react-hooks/set-state-in-effect`), e com razão: provoca renderização em cascata. O caso típico é marcar "carregando" antes de buscar. A saída não é contornar a regra — é ligar o sinalizador em **quem dispara** a busca, e desligá-lo dentro da função assíncrona, depois do `await`.
- **`as const` num `select` do Prisma 7 quebra a inferência de relação aninhada.** O objeto fica `readonly` e o tipo do resultado perde a relação incluída — no caso, o `ownerMember` desaparecia do retorno. O erro aparece longe da causa, na função que consome o registro, reclamando de propriedade que falta. Usar `satisfies Prisma.<Modelo>Select`, que preserva os tipos literais sem tornar o objeto somente-leitura.
- O `apps/api/test/` estava **fora** do `tsconfig.json` (que inclui só `src/**/*`), então `tsc --noEmit` nunca o verificava. Pior: o transformador do Vitest procura o `tsconfig.json` mais próximo do arquivo para saber de `experimentalDecorators`, e sem nenhum ali um controller de teste com `@Req()` falhava com "Decorators are not valid here" — erro que aparece como falha de suite, não de configuração. Resolvido com `apps/api/test/tsconfig.json`, que **precisa** ter esse nome exato, e que declara `module: esnext` porque quem carrega esses arquivos é o Vitest, como ESM, e não o `tsc` para CommonJS.

## Situação das dez entregas do briefing inicial
| # | Entrega | Situação |
|---|---|---|
| 1 | Produto e jornadas | `docs/product.md` |
| 2 | Arquitetura | `docs/architecture.md` |
| 3 | Árvore de pastas | Criada na Fase 1 |
| 4 | Modelo de dados | `docs/data-model.md` |
| 5 | Permissões e testes multi-tenant | `docs/permissions.md` |
| 6 | Páginas e navegação | `docs/pages-and-navigation.md` |
| 7 | Roadmap com critérios de aceitação por tarefa | `docs/roadmap.md`, com critérios, dependências e definição de pronto |
| 8 | Riscos, LGPD, segurança | **Parcial**, espalhado pelos documentos |
| 9 | Checklist Hostinger | **Adiado por decisão do responsável** — só na Fase 4 |
| 10 | Decisões principais | Respondidas em `docs/permissions.md` §9 |
