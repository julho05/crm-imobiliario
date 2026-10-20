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

Ainda não existem seed de dados nem telas de produto. Falta o **A11** (rate limiting), que depende de decisão sua: precisa de dependência nova ou de implementação sobre o MySQL, e a escolha muda se a hospedagem rodar mais de um processo. O critério de saída da fase é o **A12**, cujo cenário base já está montado em `apps/api/test/apoio/cenario-de-duas-organizacoes.ts` — mas ele só fecha de verdade contra endpoints de recurso, que são a Fase 2.

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

## Stack proposta
- TypeScript em frontend e backend
- Next.js (App Router) para o painel e o catálogo público
- NestJS para API REST
- MySQL + Prisma para persistência
- Tailwind CSS + shadcn/ui para design system
- Git/GitHub para versionamento
- Testes: unitários, integração e e2e para fluxos críticos
- Ambiente local: MySQL local ou Docker *somente no desenvolvimento*, se for útil
- Produção: hospedagem Node.js gerenciada, preferencialmente Hostinger, **dependente de validação dos limites do plano** para Next.js + API NestJS, variáveis, builds, processos e conexões de banco; não assumir acesso root, Docker em produção ou PostgreSQL interno.

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
- Arquivos de mídia em armazenamento de objetos externo; não depender do disco efêmero da hospedagem
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
- O **Zod 4 recusa `.pick()` em runtime** quando o objeto tem refinamento (`.refine()`), mesmo compilando sem erro — o tipo diz que dá, a execução diz que não. `redefinirSenhaSchema.pick({ token: true })` passava no `tsc` e estourava ao carregar o módulo. Contrato compartilhado novo vai declarado em `packages/shared`, não derivado de um schema com refinamento.
- **`@UseGuards(Classe)` instancia a guarda no módulo do controller**, não reaproveita a instância do módulo que a declara. As dependências dela precisam estar no alcance desse módulo. Por isso o `AutorizacaoModule` **reexporta** o `AutenticacaoModule`: o `PrismaService` chega sozinho porque o `PrismaModule` é `@Global()`, mas o `SessaoService` não. O sintoma é um `Nest can't resolve dependencies of the AutorizacaoGuard` que não aponta para a causa.
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
