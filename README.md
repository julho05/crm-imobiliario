# CRM imobiliário — monorepo

SaaS brasileiro de CRM imobiliário com catálogo público, para corretores autônomos e imobiliárias.

> **Nome provisório.** A marca ainda não foi decidida, e o código é mantido neutro de marca.
> O nome visível fica só em `NEXT_PUBLIC_APP_NAME`. Ver [docs/architecture.md](docs/architecture.md).

---

## Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| Node.js | 20.9 ou superior |
| npm | vem com o Node |
| Docker Desktop | para o MySQL local |
| Git | — |

## Primeira execução

```bash
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de configuração
cp .env.example .env     # no PowerShell: Copy-Item .env.example .env

# 3. Subir o banco de dados
npm run db:up

# 4. Subir o site e a API
npm run dev
```

Depois abra:

- **http://localhost:3000** — o site (Next.js)
- **http://localhost:3333/health** — a API (NestJS)

A página inicial consulta a API sozinha e mostra se as duas peças estão conversando.

> O Docker Desktop precisa estar **aberto** antes do `npm run db:up`.

## Trabalhando em mais de um computador

```bash
# Ao sentar para trabalhar
git pull
npm install        # só se o package.json mudou
npm run db:up
npm run dev

# Ao terminar, antes de sair
git add -A
git commit -m "descrição do que foi feito"
git push
```

**Antes de fechar o computador, rode `git status`.** Se aparecer arquivo em vermelho ou a frase *"your branch is ahead"*, falta enviar. Esquecer o `push` é o que gera conflito depois.

O que **não** sincroniza entre máquinas: o `.env` (cada uma tem as suas senhas), os dados do banco, e o `node_modules/`. A estrutura do banco sincroniza, porque as migrations são arquivos.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe site e API juntos |
| `npm run dev:api` | Só a API |
| `npm run dev:web` | Só o site |
| `npm run build` | Compila os dois |
| `npm run db:up` | Liga o MySQL |
| `npm run db:down` | Desliga o MySQL |
| `npm run db:logs` | Mostra os logs do banco |
| `npm run db:migrate` | Cria e aplica migration a partir do schema |
| `npm run db:status` | Mostra quais migrations o banco já tem |
| `npm run db:generate` | Regera o client do Prisma |
| `npm run db:studio` | Abre o navegador de dados do Prisma |
| `npm run db:drift` | Confere se o banco bate com as migrations |
| `npm run verify` | Lint + formatação + tipos + testes, tudo de uma vez |
| `npm run lint` | Procura problemas no código |
| `npm run format` | Formata o código |
| `npm run typecheck` | Confere os tipos |
| `npm run test` | Roda os testes |

## Estrutura

```
apps/
  api/        NestJS — regras de negócio e API REST
    prisma/   schema e migrations
  web/        Next.js — painel do CRM e catálogo público
    components/ui/   componentes do shadcn/ui
packages/
  shared/     enums, matriz de permissões e validações compartilhadas
docker/       scripts de inicialização do MySQL de desenvolvimento
docs/         documentação de produto e arquitetura
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/product.md](docs/product.md) | Produto, perfis e fluxos |
| [docs/permissions.md](docs/permissions.md) | Papéis, permissões e isolamento multi-tenant |
| [docs/data-model.md](docs/data-model.md) | Entidades, índices e LGPD |
| [docs/architecture.md](docs/architecture.md) | Arquitetura e decisões de fundação |
| [docs/design-system.md](docs/design-system.md) | Cores, contraste medido, tokens e tema |
| [docs/pages-and-navigation.md](docs/pages-and-navigation.md) | Rotas, permissões por papel, fluxos e estados |
| [docs/roadmap.md](docs/roadmap.md) | Fases do MVP, critérios de aceitação e definição de pronto |

## Estado atual

**Fase 1 — fundação.** O esqueleto está de pé: monorepo, MySQL em container, API e site subindo e conversando entre si.

O banco tem estrutura: o schema do Prisma traduz o [modelo de dados](docs/data-model.md) em
19 tabelas, aplicadas pela migration inicial. O `GET /health` da API consulta o banco de verdade.

Também já existem o design system (Tailwind + shadcn/ui com as cores oficiais, tema claro e escuro),
os contratos compartilhados em `packages/shared` (enums, matriz de permissões e validações) e a
rede de verificação: lint, formatação, tipos, testes e CI.

Ainda **não** existem: autenticação, organizações, seed de dados ou telas de produto.
O próximo passo e seus critérios de aceitação estão no [roadmap](docs/roadmap.md).

## Segurança

O arquivo `.env` contém segredos e **nunca** é versionado. Use o `.env.example` como modelo.
Nunca use dados reais de clientes em desenvolvimento.
