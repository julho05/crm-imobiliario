# Doverni — Definição de produto

## Proposta de valor
Uma única plataforma para corretores autônomos e pequenas imobiliárias administrarem imóveis, leads, negociações e visitas, com catálogo público integrado que converte interessados em novos leads dentro do CRM.

## Perfis
- Visitante público: pesquisa imóveis e envia interesse sem criar conta
- Corretor autônomo: administra sua própria organização
- Corretor membro de imobiliária: administra itens atribuídos/autorizados
- Gerente: distribui leads e acompanha equipe conforme permissões
- Admin/proprietário: configura organização, equipe e visibilidade dos dados
- Admin Doverni: suporte operacional restrito e segregado, sem acesso irrestrito aos dados dos clientes

## Fluxos principais
1. Corretor cria organização, cadastra imóvel, marca como publicado; imóvel aparece no catálogo.
2. Visitante filtra imóveis, abre detalhe, preenche formulário com política de privacidade; lead entra no CRM associado ao imóvel.
3. Corretor acompanha lead, registra contato, agenda visita, muda etapa do funil e registra desfecho.
4. Imobiliária convida corretores, define papéis e atribui imóveis/leads.

## Perguntas a decidir antes de codificar

### Resolvidas em 19/10/2026

| Pergunta | Resposta | Onde está |
|---|---|---|
| Fluxo de cadastro: autônomo/imobiliária ou único? | **Único.** Autônomo é uma organização com um membro `OWNER`; convidar gente não exige migração | [permissions.md](permissions.md) §9 |
| Visibilidade de leads e imóveis na equipe | Leads: só os próprios. Imóveis: lê todos, edita só os seus | [permissions.md](permissions.md) §4 |
| Estados do imóvel | `DRAFT`, `AVAILABLE`, `RESERVED`, `SOLD`, `RENTED`, `INACTIVE` — separados de `publishedAt` | [data-model.md](data-model.md) §3.2 |
| Privacidade do endereço | `addressVisibility`, padrão restritivo `NEIGHBORHOOD_ONLY` | [data-model.md](data-model.md) §3.2, §5 |
| Consentimento de lead | `consentGivenAt` + `privacyNoticeVersion` + `consentIpHash` | [data-model.md](data-model.md) §7 |
| Rota do catálogo | `/o/[slug]`, com histórico de slug e redirecionamento. Domínio próprio fora do MVP | [data-model.md](data-model.md) §3.1 |

### Ainda em aberto

| Pergunta | Quando precisa de resposta |
|---|---|
| Quais campos do imóvel são **obrigatórios** no cadastro? | Antes do módulo de imóveis (Fase 2) |
| Exclusão de leads: anonimização atende à LGPD? **Requer parecer jurídico** | Antes do piloto (Fase 4) |
| Qual serviço de e-mail transacional? | Antes de ativar verificação e convites de verdade; em desenvolvimento, basta registrar no log |
| Limites de usuários, imóveis e mídia por plano | Antes de vender. Cobrança está fora do MVP |
| Integrações indispensáveis para o piloto | Antes da Fase 4 |
