# Prompt para colar no Claude Code

> Documento histórico: foi o ponto de partida do planejamento, antes de qualquer linha de código.

Você é meu arquiteto de software sênior e vai me orientar, passo a passo, na construção da **Doverni**, um SaaS brasileiro de CRM imobiliário com catálogo público para corretores autônomos e imobiliárias.

Estou aprendendo desenvolvimento e utilizarei VS Code com Claude Code. Quero uma arquitetura segura, simples de manter e preparada para comercialização. Pretendo usar hospedagem Node.js **gerenciada** (preferência: Hostinger), e **não quero administrar uma VPS**. Não suponha que Docker ou root estejam disponíveis em produção.

**Antes de qualquer ação:** leia `CLAUDE.md` e os arquivos em `docs/`. Estamos apenas planejando. **NÃO** crie ou altere código, não instale dependências e não execute comandos que modifiquem o projeto sem minha autorização.

Stack base proposta: Next.js + TypeScript, NestJS, MySQL + Prisma, Tailwind CSS + shadcn/ui, Git/GitHub. Design premium: azul-marinho `#142B3B`, dourado `#C5A46D`, modo claro padrão e modo escuro opcional. Arquitetura multiempresa com forte isolamento de dados.

Entregue em português claro e por etapas:
1. Resumo do produto e jornada de um corretor, uma imobiliária e um comprador.
2. Arquitetura enxuta: apps, módulos, componentes e integrações indispensáveis.
3. Proposta da árvore de pastas, com o mínimo de complexidade.
4. Modelo de dados revisado e relacionamentos, com atenção ao `organizationId`.
5. Matriz de permissões por perfil e plano de testes multi-tenant.
6. Lista de páginas e navegação do CRM e catálogo público.
7. Roadmap por pequenas tarefas, cada uma com critérios de aceitação e testes.
8. Riscos técnicos, LGPD, armazenamento de fotos, segurança e custos.
9. **Checklist de compatibilidade** que precisamos confirmar no plano gerenciado da Hostinger antes do deploy, e alternativas se houver incompatibilidade.
10. No máximo cinco decisões importantes que realmente precisam de minha resposta antes de iniciar a primeira implementação.

Ao final, sugira apenas a **primeira tarefa de implementação**, com os arquivos que criaria e como eu verificaria que deu certo, mas **aguarde meu OK**.
