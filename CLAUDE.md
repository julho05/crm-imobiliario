# Doverni — Instruções permanentes para Claude Code

> Repositório **privado**. Este arquivo é versionado para acompanhar o projeto entre máquinas.

## Objetivo
Construir um SaaS brasileiro de CRM imobiliário com catálogo público de imóveis para corretores autônomos e imobiliárias, com assinatura recorrente. Entregar um MVP seguro, responsivo, simples de usar e possível de hospedar em serviço Node.js gerenciado.

## Estado do projeto
**Fase 1 — fundação** (desde 19/10/2026). O planejamento foi concluído e a fundação técnica está de pé: monorepo com npm workspaces, MySQL em container, Next.js e NestJS subindo e conversando entre si.

Ainda não existem schema do Prisma, tabelas, autenticação nem telas de verdade.

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

Versões fixadas no projeto: Next 16.4.2 · React 19.3.1 · NestJS 12.2.0 · **TypeScript 6.0.3** · Prisma 7.10.1 quando entrar.

Duas armadilhas confirmadas na prática:
- `npm view prisma version` devolve um **release candidate** (8.0.0-rc). A versão estável está na tag `prev`. Sempre fixar a versão do Prisma explicitamente.
- O TypeScript 7 existe, mas o NestJS 12 depende de `typescript@~6.0.2`. Usar o 7 quebra o build; manter o **6.0.3** até o NestJS acompanhar.

## Situação das dez entregas do briefing inicial
| # | Entrega | Situação |
|---|---|---|
| 1 | Produto e jornadas | `docs/product.md` |
| 2 | Arquitetura | `docs/architecture.md` |
| 3 | Árvore de pastas | Criada na Fase 1 |
| 4 | Modelo de dados | `docs/data-model.md` |
| 5 | Permissões e testes multi-tenant | `docs/permissions.md` |
| 6 | Páginas e navegação | **Pendente** |
| 7 | Roadmap com critérios de aceitação por tarefa | **Parcial** — `docs/roadmap.md` sem critérios |
| 8 | Riscos, LGPD, segurança | **Parcial**, espalhado pelos documentos |
| 9 | Checklist Hostinger | **Adiado por decisão do responsável** — só na Fase 4 |
| 10 | Decisões principais | Respondidas em `docs/permissions.md` §9 |
