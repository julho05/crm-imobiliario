# Doverni — Roadmap do MVP

## Fase 0: validação (antes do código)
- Entrevistar corretores autônomos e pequenas imobiliárias; confirmar três dores prioritárias
- Confirmar viabilidade de uso da marca Doverni no INPI e domínio no Registro.br
- Validar a compatibilidade da hospedagem gerenciada escolhida
- Aprovar campos, papéis, permissões e telas principais

## Fase 1: fundação
- Monorepo leve, lint, format, test, CI, env.example, README
- API e frontend com health checks
- MySQL/Prisma e migrações
- Autenticação + organização + membership + segurança multi-tenant

## Fase 2: gestão imobiliária
- Cadastro de imóveis e fotos
- Cadastro de leads e atribuição
- Funil de negociação
- Agenda/visitas
- Dashboard básico

## Fase 3: catálogo público
- Perfil e vitrine de cada organização
- Busca/filtros/detalhes
- Captura de lead vinculada ao imóvel
- Anti-spam, privacidade, responsividade e SEO básico

## Fase 4: piloto e lançamento
- Testes críticos, especialmente isolamento entre organizações
- Backups e restauração, monitoramento, deploy gerenciado
- Piloto com corretores; corrigir fricções observadas
- Definir planos, limites, pagamento, suporte e termos antes do lançamento pago

## Critério mínimo de pronto
Um corretor pode entrar, cadastrar e publicar imóvel, receber lead do catálogo, agendar visita e mover negociação. Uma imobiliária pode convidar membros e controlar acesso. Uma organização não vê dados privados de outra. O sistema funciona no celular.
