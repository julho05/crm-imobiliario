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

## Estrutura

```
apps/
  api/        NestJS — regras de negócio e API REST
  web/        Next.js — painel do CRM e catálogo público
packages/
  shared/     tipos e validações compartilhados
docs/         documentação de produto e arquitetura
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/product.md](docs/product.md) | Produto, perfis e fluxos |
| [docs/permissions.md](docs/permissions.md) | Papéis, permissões e isolamento multi-tenant |
| [docs/data-model.md](docs/data-model.md) | Entidades, índices e LGPD |
| [docs/architecture.md](docs/architecture.md) | Arquitetura e decisões de fundação |
| [docs/design-system.md](docs/design-system.md) | Cores, princípios e telas |
| [docs/roadmap.md](docs/roadmap.md) | Fases do MVP |

## Estado atual

**Fase 1 — fundação.** O esqueleto está de pé: monorepo, MySQL em container, API e site subindo e conversando entre si.

Ainda **não** existem: tabelas no banco, schema do Prisma, autenticação, organizações ou telas de verdade.

## Segurança

O arquivo `.env` contém segredos e **nunca** é versionado. Use o `.env.example` como modelo.
Nunca use dados reais de clientes em desenvolvimento.
