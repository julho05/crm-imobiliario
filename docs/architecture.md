# Doverni — Arquitetura proposta

## Visão
- Next.js: aplicação autenticada e catálogo público responsivo
- NestJS: API REST com autenticação e autorização por organização
- MySQL: dados transacionais com Prisma Migrate
- Object storage: fotos e arquivos (URL assinada para upload, validação de tipo/tamanho e otimização)
- Serviço de e-mail transacional: verificação, convites e recuperação de senha (escolher depois)

## Implantação
A preferência é por hospedagem Node.js gerenciada (Hostinger), não VPS. **Bloqueio obrigatório antes de escolher infraestrutura**: confirmar na documentação/plano comprado se suporta simultaneamente Next.js, processo NestJS, variáveis de ambiente, rede privada/URLs, tarefas agendadas, bancos MySQL, armazenamento, logs e builds. Alternativamente, avaliar implantação gerenciada dividida por componentes. Não assumir Docker/root em produção.

## Multi-tenant
Padrão proposto: banco compartilhado e `organizationId` nas tabelas privadas, membership com papéis e autorizações server-side. Catalogação pública só consulta imóveis publicados e dados explicitamente públicos. Considere índices compostos e unicidade escopada à organização. Testar isolamento em endpoints, filtros, links de fotos e buscas.

## Segurança e privacidade
Hash de senha adequado, verificação de e-mail, sessões/cookies seguros, rate limits, CORS estrito, validação, sanitização apropriada, auditoria, controles anti-spam em formulário e retenção de dados conforme política definida. Sem acesso geral ao banco pelo painel público.

## Organização de código
Evitar superengenharia; manter módulos claros e contratos de API consistentes. Preferir evolução incremental com migrações pequenas, teste automatizado e revisão de PR.

---

## Decisões de fundação — aprovadas em 19/10/2026

Estas destravam a Fase 1 do [roadmap.md](roadmap.md). Ver também [permissions.md](permissions.md) e [data-model.md](data-model.md).

| Assunto | Decisão |
|---|---|
| Monorepo | **npm workspaces**, sem Turborepo |
| Autenticação | **Sessão opaca em cookie `httpOnly`**, estado no MySQL |
| Banco local | **Docker Compose**, apenas em desenvolvimento |
| Versionamento | **Git desde o início**, com `.gitignore` antes do primeiro arquivo |

### Monorepo: npm workspaces

Dois apps e um ou dois pacotes compartilhados não justificam Turborepo. O ganho dele é cache de build e orquestração, que só compensam quando o build dói. `npm` já vem com o Node, usa um lockfile só e não adiciona conceito novo — alinhado com "evitar superengenharia" do [CLAUDE.md](../CLAUDE.md).

Reversível: migrar para pnpm ou adicionar Turborepo depois não exige tocar no código da aplicação.

### Autenticação: sessão no servidor

O cookie carrega um identificador **opaco**; a sessão vive no MySQL com `userId`, `activeOrganizationId`, expiração e metadados.

O motivo é direto: [permissions.md](permissions.md) §4.4 exige que suspender um membro **remova o acesso imediatamente**. Com JWT isso não acontece — o token continua válido até expirar, e implementar revogação exige uma lista de bloqueio consultada a cada requisição, que é a consulta ao banco que o JWT prometia evitar. Para este produto, o JWT paga o custo e não entrega o benefício.

Além disso, a **organização ativa mora na sessão**, no servidor ([permissions.md](permissions.md) §6, passo 2). Isso é o que impede o cliente de escolher a própria organização.

Configuração do cookie: `httpOnly`, `Secure` em produção, `SameSite=Lax`, rotação de identificador no login, expiração absoluta e por inatividade.

**[DECIDIR]** Next.js e NestJS no mesmo domínio (via proxy/rewrite) ou em domínios separados? Mesmo domínio simplifica o cookie e dispensa CORS; separados exigem `SameSite=None`, `Secure` e CORS estrito. **Proponho mesmo domínio.** Precisa ser conferido contra a hospedagem quando a Hostinger for avaliada.

### Banco local: Docker Compose

Um `docker-compose.yml` sobe o MySQL na versão exata da produção, descartável e idêntico para qualquer pessoa que entre no projeto. Nada é instalado no Windows.

Isso é **exclusivo de desenvolvimento**, como o [CLAUDE.md](../CLAUDE.md) permite. A produção continua sem Docker e sem root.

### Git

A pasta ainda não é um repositório. O `.gitignore` entra **antes** do primeiro arquivo de código: segredo que entra no histórico não sai sem reescrevê-lo. Mínimo a ignorar: `node_modules/`, `.env*` (exceto `.env.example`), `dist/`, `.next/`, `coverage/`, `*.log`.

Repositório **privado**. O GitHub remoto fica para quando o `gh` estiver autenticado nesta máquina.

---

## Prisma 7 — decisões forçadas pela versão, 20/10/2026

O Prisma 7 mudou três coisas que afetam a forma do código. Nenhuma foi escolha
nossa; todas são exigência da versão estável fixada (7.10.1).

### A URL de conexão saiu do schema

O bloco `datasource` não aceita mais `url`. A URL agora mora em dois lugares
diferentes, por propósito:

- **`apps/api/prisma.config.ts`** — para o Prisma Migrate (migrations, diff)
- **Driver adapter**, em tempo de execução — para o client da aplicação

O `prisma.config.ts` também carrega o `.env` na mão: a CLI do Prisma 7 não lê
mais `.env` sozinha, e o nosso fica na raiz do monorepo, não em `apps/api`.

### Driver adapter obrigatório: `@prisma/adapter-mariadb`

No Prisma 7 o client recebe a conexão por driver adapter. Para MySQL o adapter
oficial é o `@prisma/adapter-mariadb` — **não existe** `@prisma/adapter-mysql`.
É dependência obrigatória, não preferência: sem ela o client não conecta.

Fica encapsulado em `PrismaService` (`apps/api/src/prisma/`), exposto por um
módulo `@Global()` porque praticamente todo módulo de domínio vai precisar dele.

### O client é gerado dentro de `src/`, e não é versionado

`prisma generate` escreve em `apps/api/src/generated/prisma`. A pasta está no
`.gitignore`, então `prisma generate` roda antes do `dev` e do `build` — um
clone novo compila sem passo manual.

### Shadow database: um GRANT no MySQL de desenvolvimento

O `prisma migrate dev` cria e descarta um banco temporário para detectar
desvios. O usuário de aplicação não pode criar bancos, e sem permissão a
migration falha com `P3014`.

Resolvido em `docker/mysql/init/01-shadow-db.sh`, que roda na primeira
inicialização do volume e concede privilégio **restrito ao padrão**
`prisma_migrate_shadow_db%`. O usuário continua sem poder criar qualquer outro
banco. É exclusivo de desenvolvimento: em produção as migrations rodam com
`prisma migrate deploy`, que não usa shadow database.

### Quebras de linha fixadas em `.gitattributes`

Essa máquina tem `core.autocrlf=true`. Um script `.sh` entregue com CRLF ao
container Linux falha com "bad interpreter". O `.gitattributes` força LF,
independente da configuração local do Git de quem clonar.

### Armadilha de versão, confirmada mais uma vez

`npm view prisma version` devolve `8.0.0-rc.23`. A estável está na tag `prev`
(`7.10.1`). A própria CLI exibe um banner sugerindo atualizar para o RC —
**ignorar**. Toda dependência do Prisma está fixada com `--save-exact`.
