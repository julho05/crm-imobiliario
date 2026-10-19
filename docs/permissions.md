# Doverni — Papéis, permissões e isolamento multi-tenant

> Status: **as cinco decisões estruturais foram aprovadas em 19/10/2026** (seção 9). O restante segue como proposta.
> Marcadores usados: **[FATO]** decorre de documento já aprovado · **[DECIDIDO]** aprovado pelo responsável, com data · **[PROPOSTA]** sugestão minha, padrão razoável para o mercado · **[DECIDIR]** precisa de resposta antes de codificar.
>
> Referências: [CLAUDE.md](../CLAUDE.md), [product.md](product.md), [architecture.md](architecture.md), [data-model.md](data-model.md).

---

## 1. Princípio central

**[FATO]** Toda operação sobre dado privado é autorizada no servidor a partir de três coisas: **usuário autenticado + organização ativa + papel na organização**. Filtrar por `organizationId` não é autorização — é apenas um filtro, e um filtro pode ser contornado por qualquer requisição que informe outro ID.

Consequência prática: o `organizationId` **nunca** vem do cliente como fonte de verdade. Ele é derivado da sessão (organização ativa) e validado contra a tabela `Membership`. Se o recurso solicitado pertence a outra organização, a resposta é a mesma que para um recurso inexistente.

---

## 2. Papéis

### 2.1 Papéis dentro da organização

**[DECIDIDO 19/10/2026]** Quatro papéis, hierárquicos (cada um contém o anterior):

| Papel | Código | Quem é | Quantos |
|---|---|---|---|
| Proprietário | `OWNER` | Quem criou a organização; dono do negócio | Exatamente 1, sempre |
| Administrador | `ADMIN` | Sócio ou responsável administrativo | 0 ou mais |
| Gerente | `MANAGER` | Coordena a equipe, distribui leads | 0 ou mais |
| Corretor | `AGENT` | Opera a própria carteira | 0 ou mais |

**[DECIDIDO 19/10/2026]** O corretor autônomo **não é um papel nem um tipo de conta separado**. É simplesmente uma organização com um único membro `OWNER`. Isso evita dois caminhos de código, dois conjuntos de testes e a migração dolorosa de "autônomo virou imobiliária". O campo `Organization.kind` existe só para ajustar textos e telas, nunca para decidir permissão.

### 2.2 Papel fora da organização

**[FATO]** `product.md` prevê um **Admin Doverni** para suporte operacional, "restrito e segregado, sem acesso irrestrito aos dados dos clientes".

**[PROPOSTA]** Tratar isso como um sistema à parte, não como um quinto papel na tabela `Membership`:

- Vive em tabela própria (`PlatformAdmin`), nunca em `Membership`
- Por padrão enxerga **metadados**, não conteúdo: nome da organização, plano, contagem de imóveis/leads, data de criação, status de pagamento
- Acesso a dados de cliente exige **concessão temporária e explícita** do `OWNER`, com prazo e registro em auditoria
- Toda ação de Admin Doverni é auditada sem exceção

**[DECIDIR]** Isso pode ser adiado para depois do MVP — mas a tabela precisa nascer separada desde o início, senão vira retrabalho estrutural.

---

## 3. Escopos

O papel diz *o que* você pode fazer. O escopo diz *sobre quais registros*.

| Escopo | Significado |
|---|---|
| `OWN` | Apenas registros atribuídos ao próprio membro (`assignedUserId` / `ownerMemberId`) |
| `ORG` | Todos os registros da organização ativa |
| `NONE` | Sem acesso |

Nenhum escopo atravessa organizações. Essa é a invariante que os testes do item 8 protegem.

---

## 4. Matriz de permissões

Legenda: `ORG` = todos da organização · `OWN` = só os próprios · `—` = sem acesso

### 4.1 Imóveis (`Property`, `PropertyMedia`)

| Ação | OWNER | ADMIN | MANAGER | AGENT |
|---|---|---|---|---|
| Listar / ver | ORG | ORG | ORG | **ORG** |
| Criar | ✅ | ✅ | ✅ | ✅ |
| Editar | ORG | ORG | ORG | **OWN** |
| Publicar / despublicar | ORG | ORG | ORG | **OWN** |
| Alterar responsável | ORG | ORG | ORG | — |
| Arquivar | ORG | ORG | ORG | OWN |
| Excluir definitivamente | ✅ | ✅ | — | — |

**[DECIDIDO 19/10/2026]** O corretor **lê toda a carteira da organização**, mas edita só os imóveis sob sua responsabilidade. Esse é o comportamento real de uma imobiliária: o corretor precisa poder oferecer qualquer imóvel da casa ao cliente dele. Restringir a leitura quebraria o negócio.

### 4.2 Leads e solicitações (`Lead`, `Inquiry`)

| Ação | OWNER | ADMIN | MANAGER | AGENT |
|---|---|---|---|---|
| Listar / ver | ORG | ORG | ORG | **OWN** |
| Criar manualmente | ✅ | ✅ | ✅ | ✅ (atribuído a si) |
| Editar | ORG | ORG | ORG | OWN |
| Atribuir / reatribuir | ORG | ORG | ORG | — |
| Ver leads não atribuídos | ✅ | ✅ | ✅ | — |
| Excluir (pedido LGPD) | ✅ | ✅ | — | — |

**[DECIDIDO 19/10/2026]** Aqui a leitura **é** restrita, ao contrário dos imóveis. Lead é a moeda de troca da imobiliária — expor a carteira de leads de um corretor aos colegas gera conflito interno e é o tipo de coisa que faz o cliente abandonar o CRM. É também a diferença mais relevante entre os dois modelos de permissão, e por isso vale sua atenção.

**[DECIDIDO 19/10/2026]** Sem configuração por organização no MVP. O comportamento é fixo em `OWN`. Se um cliente do piloto pedir transparência total, a opção (`leadVisibility: OWN | ORG`) pode ser adicionada depois — por isso a verificação mora em um único lugar (seção 7), para que isso seja uma linha e não uma caçada pelo código.

### 4.3 Negociações, visitas e tarefas (`Deal`, `Visit`, `Task`)

| Ação | OWNER | ADMIN | MANAGER | AGENT |
|---|---|---|---|---|
| Listar / ver | ORG | ORG | ORG | **OWN** |
| Criar | ✅ | ✅ | ✅ | ✅ |
| Editar / mover etapa | ORG | ORG | ORG | OWN |
| Atribuir | ORG | ORG | ORG | — |
| Excluir | ORG | ORG | OWN | — |

**[PROPOSTA]** Seguem a visibilidade do lead: se você não vê o lead, não vê a negociação nem a visita ligada a ele. Qualquer outra combinação vaza por via indireta — a agenda mostraria o nome do cliente de um colega.

### 4.4 Equipe (`Membership`, convites)

| Ação | OWNER | ADMIN | MANAGER | AGENT |
|---|---|---|---|---|
| Ver membros | ✅ | ✅ | ✅ | ✅ (nome e papel apenas) |
| Convidar `AGENT` | ✅ | ✅ | ✅ | — |
| Convidar `MANAGER` | ✅ | ✅ | — | — |
| Convidar `ADMIN` | ✅ | — | — | — |
| Alterar papel | ✅ | ✅¹ | — | — |
| Remover membro | ✅ | ✅¹ | — | — |
| Transferir propriedade | ✅ | — | — | — |

¹ `ADMIN` não altera nem remove `OWNER` ou outro `ADMIN`.

**Regras invioláveis:**

- A organização nunca fica sem `OWNER`. Transferência é uma operação atômica, não "remover e adicionar".
- Ninguém altera o próprio papel, nem o `OWNER`.
- Remover um membro **não apaga** os dados dele. Ao remover, o sistema **exige** destino para imóveis, leads, negociações e visitas atribuídos.

### 4.5 Organização, plano e catálogo público

| Ação | OWNER | ADMIN | MANAGER | AGENT |
|---|---|---|---|---|
| Ver dados da organização | ✅ | ✅ | ✅ | ✅ |
| Editar nome, logo, contato | ✅ | ✅ | — | — |
| Editar `slug` público | ✅ | ✅ | — | — |
| Configurar vitrine pública | ✅ | ✅ | — | — |
| Ver plano e limites | ✅ | ✅ | ✅ (leitura) | — |
| Alterar plano / pagamento | ✅ | — | — | — |
| Excluir organização | ✅ | — | — | — |

### 4.6 Auditoria (`Activity`)

| Ação | OWNER | ADMIN | MANAGER | AGENT |
|---|---|---|---|---|
| Ver log da organização | ✅ | ✅ | — | — |
| Ver histórico de um registro | ORG | ORG | ORG | OWN |
| Editar ou apagar log | — | — | — | — |

O log de auditoria é **somente-escrita pela aplicação**. Nenhum papel edita. Retenção é política, não permissão.

### 4.7 Perfil próprio

Todo membro edita o próprio nome, senha, foto e preferência de tema, em qualquer papel. Não há matriz — é sempre `OWN`, e `OWN` aqui significa o próprio `User`, não o `Membership`.

---

## 5. Visitante público

**[FATO]** O catálogo público não autentica ninguém. Por isso ele é a maior superfície de vazamento do produto, e merece regra própria.

O endpoint público:

- consulta **somente** imóveis com `status = publicado` e organização ativa
- retorna **somente** campos marcados como públicos — nunca o objeto `Property` inteiro
- **[PROPOSTA]** nunca retorna: endereço exato (só bairro/cidade, conforme `addressVisibility`), valor de comissão, anotações internas, nome do proprietário do imóvel, código interno, histórico, ou qualquer `userId`
- é servido por um **DTO público explícito**, construído campo a campo. Nada de `select *` com exclusões — exclusão por lista negra sempre esquece o campo novo que alguém adicionou na semana passada.

Ao enviar o formulário de interesse, o visitante cria um `Lead` + `Inquiry`:

- **[DECIDIDO 19/10/2026]** o lead é atribuído ao corretor responsável pelo imóvel; se não houver, fica não atribuído e aparece para `MANAGER`/`ADMIN`/`OWNER`
- a resposta da API confirma o envio e **não devolve** dados do lead criado nem IDs internos
- exige anti-spam, rate limit por IP, e registro da versão do aviso de privacidade aceito (`privacyNoticeVersion`)

**[DECIDIDO 19/10/2026]** Sem rodízio automático no MVP. Lead sem responsável vai para uma **fila de não atribuídos**, distribuída manualmente por `MANAGER`/`ADMIN`/`OWNER`. Implica uma tela de "leads a distribuir" e um contador visível no dashboard desses papéis — caso contrário a fila cresce sem ninguém perceber.

---

## 6. Como a verificação funciona no servidor

Toda requisição autenticada passa pela mesma sequência, na ordem:

1. **Autenticar** — sessão válida, usuário existe e está ativo
2. **Resolver organização ativa** — da sessão, nunca do corpo ou da query da requisição
3. **Carregar membership** — `(userId, organizationId)` com `status = ACTIVE`. Sem membership → 404
4. **Verificar papel × ação** — a matriz acima, em um único módulo central
5. **Carregar o recurso e conferir o dono** — `recurso.organizationId === membership.organizationId`. Divergiu → 404
6. **Verificar escopo** — se a permissão é `OWN`, conferir atribuição ao membro atual
7. **Registrar em auditoria** — toda escrita

Os passos 5 e 6 acontecem **depois** de carregar o registro, e isso é intencional: é a defesa em profundidade que pega o `WHERE organizationId` esquecido em uma query. Pagar um SELECT a mais é barato perto de vazar dados entre clientes.

**Detalhes que decidem se isso funciona ou não:**

- **404, nunca 403**, para recurso de outra organização. Um 403 confirma que o registro existe — é vazamento por canal lateral e permite enumerar a base de um concorrente.
- **IDs não sequenciais** (`cuid`/`uuid`). Não é autorização, mas corta a enumeração trivial.
- **Fotos e mídia**: URL assinada é autorização *de transporte*, não *de acesso*. Gere a URL **somente depois** de passar pelos 6 passos, com validade curta. URL assinada de longa duração que vaza em um print é acesso permanente a dado de cliente.
- **Busca, autocomplete, contadores, exportações e webhooks** usam o mesmo módulo do passo 4. São exatamente os lugares onde o vazamento aparece, porque ninguém lembra deles ao revisar.
- **Um usuário em várias organizações** é previsto em `CLAUDE.md`. Trocar de organização ativa invalida qualquer cache por usuário; caso contrário o corretor que atende duas imobiliárias vê a lista errada.

---

## 7. Onde isso vive no código

**[PROPOSTA]** Um módulo único, `packages/shared/permissions`, com a matriz como **dado**, não como `if` espalhado:

```
can(role, action, resource) -> 'ORG' | 'OWN' | false
```

A API consome para autorizar; o frontend consome para esconder botões. **Esconder botão não é segurança** — é cortesia visual. A decisão real é sempre do servidor, e o teste do item 8 prova isso chamando o endpoint diretamente, sem passar pela interface.

Vantagem de ser dado: a matriz vira uma tabela que você lê em dez segundos, e o teste a percorre inteira automaticamente, em vez de alguém escrever 60 testes à mão e esquecer quatro.

---

## 8. Plano de testes de isolamento

**[FATO]** `CLAUDE.md` torna esses testes obrigatórios. Proposta de cobertura mínima.

### 8.1 Cenário base

Duas organizações completas, criadas por *fixture* e reutilizadas:

- **Org A**: `owner_a`, `manager_a`, `agent_a1`, `agent_a2` · 2 imóveis, 2 leads (um por corretor)
- **Org B**: `owner_b`, `agent_b1` · 1 imóvel, 1 lead
- **`user_dual`**: membro de A (`AGENT`) e de B (`AGENT`)

### 8.2 Travessia entre organizações — deve dar 404

Para **cada** endpoint de leitura, escrita e exclusão, autenticado como `agent_b1`, usando ID de recurso da Org A:

- buscar imóvel, lead, negociação, visita, tarefa, membro, log por ID direto
- editar e excluir cada um
- solicitar URL assinada de foto da Org A
- buscar por termo que só existe na Org A
- contadores do dashboard não somam registros da Org A

### 8.3 Escopo dentro da mesma organização

- `agent_a1` **não** vê o lead, a negociação, a visita nem a tarefa de `agent_a2`
- `agent_a1` **vê** o imóvel de `agent_a2`, mas recebe 403 ao editar
- `agent_a1` não atribui nem reatribui nada
- `manager_a` vê tudo de A e reatribui o lead de `agent_a2`
- `manager_a` não convida `ADMIN`, não altera plano, não exclui a organização

### 8.4 Organização ativa

- `user_dual` com A ativa não vê nenhum registro de B na mesma sessão
- trocar para B muda o resultado imediatamente, sem resquício de cache
- enviar `organizationId` de B no corpo da requisição, com A ativa, **não** muda o resultado
- membership com `status != ACTIVE` perde acesso imediatamente

### 8.5 Catálogo público

- imóvel em rascunho/arquivado não aparece na listagem nem responde no detalhe por ID direto
- resposta pública não contém endereço exato, `userId`, código interno nem campo privado — **teste por lista branca de campos**, não por ausência de alguns
- `/o/[slug]` de A nunca retorna imóvel de B
- envio do formulário respeita rate limit e grava `privacyNoticeVersion`

### 8.6 Regra de ouro

**[PROPOSTA]** Endpoint novo sem teste de travessia não entra. Vale uma verificação no CI que liste rotas autenticadas sem teste correspondente — é o tipo de coisa que se esquece exatamente quando o projeto fica grande e a pressa aumenta.

---

## 9. Decisões aprovadas

Aprovadas pelo responsável em **19/10/2026**. Alterar qualquer uma destas depois do início da implementação tem custo alto — mudam a matriz, as queries e os testes ao mesmo tempo.

| # | Decisão | Resposta |
|---|---|---|
| 1 | Corretor vê os leads dos colegas? | **Não.** Escopo `OWN`. `MANAGER`/`ADMIN`/`OWNER` veem todos |
| 2 | Corretor vê os imóveis dos colegas? | **Lê todos** da organização, **edita só os dele** |
| 3 | Quantos papéis? | **Quatro**: `OWNER`, `ADMIN`, `MANAGER`, `AGENT` |
| 4 | Corretor autônomo é tipo de conta separado? | **Não.** É uma organização com um único membro `OWNER` |
| 5 | Lead do catálogo sem responsável? | **Fila de não atribuídos**, sem rodízio automático no MVP |

### Consequências diretas destas decisões

- O módulo `can()` da seção 7 precisa distinguir escopo de **leitura** e de **escrita** por recurso — a decisão 2 cria um caso em que os dois diferem no mesmo recurso. Se a assinatura só devolver um escopo por ação, ela já nasce insuficiente.
- `Property.ownerMemberId`, hoje opcional em [data-model.md](data-model.md), vira o eixo da permissão de escrita. Imóvel sem responsável fica editável só por `MANAGER` ou acima.
- A fila de não atribuídos (decisão 5) exige uma tela e um contador no dashboard de `MANAGER`/`ADMIN`/`OWNER`.
- `Organization.kind` fica proibido de aparecer em qualquer verificação de permissão (decisão 4). Serve apenas para texto e layout.

---

## 10. Pendências que este documento não resolve

- Limites por plano (usuários, imóveis, mídia) — é cobrança, não permissão; só o gatilho mora aqui
- Retenção e exclusão de dados de lead por pedido do titular (LGPD) — precisa de documento próprio
- Escopo e fluxo de concessão do Admin Doverni
- Permissões de relatórios e exportação, quando existirem
