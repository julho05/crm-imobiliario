# Doverni — Modelo de dados

> Revisão de 19/10/2026, incorporando as decisões de [permissions.md](permissions.md) §9.
> Marcadores: **[DECIDIDO]** aprovado · **[PROPOSTA]** sugestão minha · **[DECIDIR]** precisa de resposta antes de gerar o schema Prisma.
>
> Este documento substitui o esboço anterior de entidades. Ainda **não** é um schema Prisma — é o desenho que o schema vai implementar.

---

## 1. Convenções gerais

**[PROPOSTA]** Aplicam-se a todas as tabelas, salvo onde dito o contrário.

| Assunto | Decisão | Por quê |
|---|---|---|
| Chave primária | `cuid()` em `CHAR(25)` | Não sequencial, corta enumeração trivial da base ([permissions.md](permissions.md) §6) |
| Timestamps | `createdAt`, `updatedAt` em toda tabela | Auditoria e ordenação estável |
| Dinheiro | `Decimal(12, 2)` | **Nunca `Float`.** Ponto flutuante erra centavos e gera divergência em comissão |
| Datas/hora | `DATETIME` em **UTC**, convertido na borda | Brasil tem fusos distintos; horário de verão pode voltar |
| Texto indexado | `VARCHAR(191)` | Margem segura para índice em `utf8mb4` |
| Charset | `utf8mb4` / `utf8mb4_0900_ai_ci` | Acentos e emoji; colação insensível a acento ajuda a busca em português |
| Exclusão | `deletedAt` (soft delete), exceto onde a LGPD exigir apagar | Preserva histórico e auditoria |
| Enums | `ENUM` nativo via Prisma | Ver ressalva em §8 |

**Regra estrutural:** toda tabela de dado privado carrega `organizationId`, **mesmo quando seria dedutível** por junção. `PropertyMedia` tem `organizationId` apesar de pertencer a `Property`. Isso é redundância deliberada: permite verificar o dono sem join e torna possível o passo 5 da autorização ([permissions.md](permissions.md) §6). O preço é manter a consistência na escrita; o benefício é que uma query mal escrita falha de forma segura.

---

## 2. O que mudou em relação ao esboço anterior

| Mudança | Origem |
|---|---|
| `Property.ownerMemberId` deixa de ser acessório e vira **eixo da permissão de escrita** | Decisão 2 |
| `Lead.assignedUserId` passa a determinar visibilidade, não só responsabilidade | Decisão 1 |
| Nasce o conceito de **lead não atribuído** como estado de trabalho | Decisão 5 |
| Referências de atribuição apontam para `Membership`, não para `User` | §3.3 |
| Separação explícita de campos públicos e privados do imóvel | §5 |
| Entram `Invitation`, `PipelineStage`, `PlatformAdmin` e tabelas de token | §3 |
| `Organization.kind` fica proibido em verificação de permissão | Decisão 4 |

---

## 3. Entidades

### 3.1 Identidade e acesso

**`User`** — a pessoa, independente de organização.

```
id, name, email (único global), emailVerifiedAt?, passwordHash,
themePreference (LIGHT|DARK|SYSTEM, padrão LIGHT), avatarObjectKey?,
lastActiveOrganizationId?, status (ACTIVE|DISABLED), timestamps
```

- `email` é único **globalmente**, não por organização. A mesma pessoa atendendo duas imobiliárias tem uma conta só, com dois `Membership`.
- `lastActiveOrganizationId` é conveniência de interface. **Nunca é fonte de autorização** — a organização ativa vem da sessão e é revalidada contra `Membership` a cada requisição.
- `passwordHash` com Argon2id ou bcrypt (custo calibrado no servidor real, não no seu notebook).

**`Organization`**

```
id, name, slug (único global), kind (SOLO|AGENCY), logoObjectKey?,
publicEmail?, publicPhone?, publicBio?, plan (FREE|PRO|…),
leadVisibility (OWN, fixo no MVP), status (ACTIVE|SUSPENDED), timestamps
```

- `slug` alimenta `/o/[slug]`. Único global, minúsculo, sem acento, com lista de reservados (`api`, `app`, `admin`, `login`, `sobre`…).
- **[DECIDIDO 19/10/2026]** Trocar o slug **preserva o antigo com redirecionamento permanente** (ver `OrganizationSlugHistory` abaixo). Anúncio impresso, link no Instagram e resultado do Google não podem virar página de erro.
- `kind` **só** muda textos e telas. Nunca aparece em verificação de permissão (decisão 4).
- `leadVisibility` nasce com valor fixo `OWN`. Existe como coluna para que a opção futura não exija migração ([permissions.md](permissions.md) §4.2).

**`OrganizationSlugHistory`** — **[DECIDIDO 19/10/2026]**

```
id, organizationId, slug (único global), releasedAt, createdAt
```

A unicidade de `slug` é verificada contra **as duas tabelas**: ninguém pode adotar um slug que ainda redireciona para outra organização. Caso contrário o redirecionamento passaria a apontar para o concorrente — pior do que o erro 404 que ele veio evitar.

**[PROPOSTA]** Prazo de retenção: indefinido no MVP. Liberar um slug depois exige decisão explícita do `OWNER`, com aviso de que os links antigos param de funcionar.

**`Membership`** — o vínculo. É aqui que mora o papel.

```
id, userId, organizationId, role (OWNER|ADMIN|MANAGER|AGENT),
status (ACTIVE|SUSPENDED), joinedAt, timestamps
@@unique([userId, organizationId])
```

- Exatamente um `OWNER` ativo por organização. MySQL não expressa isso em constraint parcial — **garantir em transação na aplicação** e cobrir com teste. É o tipo de invariante que se perde silenciosamente.
- `status != ACTIVE` remove o acesso imediatamente, sem apagar o histórico.

**`Invitation`**

```
id, organizationId, email, role, tokenHash, invitedByMembershipId,
expiresAt, acceptedAt?, revokedAt?, timestamps
@@unique([organizationId, email, acceptedAt])
```

Guardar **hash** do token, nunca o token. Vazamento do banco não deve entregar convites válidos. Mesma regra para `PasswordResetToken` e `EmailVerificationToken`, que seguem o mesmo formato.

**`PlatformAdmin`** — tabela separada, fora de `Membership` ([permissions.md](permissions.md) §2.2). Pode ficar para depois do MVP, mas **precisa nascer separada**.

### 3.2 Imóveis

**`Property`**

```
id, organizationId, code, slug,
title, description,
type (APARTMENT|HOUSE|LAND|COMMERCIAL|RURAL|OTHER),
purpose (SALE|RENT|BOTH),
status (DRAFT|AVAILABLE|RESERVED|SOLD|RENTED|INACTIVE),
price?, rentPrice?, condoFee?, iptu?,
bedrooms?, bathrooms?, suites?, parkingSpots?, areaTotal?, areaUseful?,
state, city, neighborhood, zipCode?, street?, number?, complement?,
latitude?, longitude?,
addressVisibility (FULL|STREET_ONLY|NEIGHBORHOOD_ONLY, padrão NEIGHBORHOOD_ONLY),
ownerMemberId?, publishedAt?, deletedAt?, timestamps
@@unique([organizationId, code])
@@unique([organizationId, slug])
```

Pontos que merecem atenção:

- **`code` é único por organização, não global.** Duas imobiliárias podem usar "AP-001" sem colidir. Unicidade global aqui vazaria informação entre clientes.
- **`ownerMemberId` aponta para `Membership`**, não para `User` — ver §3.3. É opcional porque imóvel pode não ter responsável; nesse caso só `MANAGER` para cima edita (decisão 2).
- **`DRAFT` e `publishedAt` são coisas diferentes.** `status` é o estado comercial; publicação é visibilidade.
- **[DECIDIDO 19/10/2026]** O catálogo mostra `AVAILABLE` e `RESERVED`, este último **com etiqueta visível**; nunca `DRAFT`, `SOLD`, `RENTED`, `INACTIVE` ou `deletedAt != null`. A etiqueta não é detalhe estético: sem ela, o interessado descobre a reserva só depois de ligar.
- **`addressVisibility` com padrão restritivo.** Se alguém esquecer de configurar, o endereço **não** vaza. Padrão inseguro é a causa mais comum de vazamento em catálogo imobiliário.
- `purpose = BOTH` exige `price` **e** `rentPrice`. Validação de aplicação, não de banco.

**`PropertyFeature`** — **[PROPOSTA]** em vez de vinte colunas booleanas (`hasPool`, `hasGym`…):

```
PropertyFeature(id, propertyId, organizationId, feature)
@@unique([propertyId, feature])
```

Adicionar característica nova vira uma linha, não uma migração.

**`PropertyMedia`**

```
id, organizationId, propertyId, objectKey, kind (PHOTO|FLOORPLAN|VIDEO|DOCUMENT),
position, altText?, isCover, width?, height?, byteSize?, contentType?, timestamps
@@unique([propertyId, position])
```

- `objectKey` aponta para o object storage. **Nenhum binário no MySQL** (já previsto em [architecture.md](architecture.md)).
- `kind = DOCUMENT` **nunca** é público — matrícula e contrato não vão para o catálogo.
- `isCover` precisa de no máximo um `true` por imóvel; garantir em transação.
- Dimensões e tamanho guardados na ingestão evitam medir imagem a cada renderização.

### 3.3 Por que atribuição aponta para `Membership`

**[PROPOSTA]** `ownerMemberId`, `assignedMemberId` e similares referenciam `Membership`, não `User`.

O motivo: a autorização pergunta "este registro é deste membro **nesta organização**?". Com `userId`, essa pergunta exige um join extra a cada verificação, e a pergunta errada (`registro.assignedUserId === session.userId`) **passa sem verificar a organização**. Esse é exatamente o bug de travessia que os testes de [permissions.md](permissions.md) §8 procuram, e apontar para `Membership` o torna impossível de escrever por acidente.

Custo: para exibir o nome, é preciso chegar ao `User` através do `Membership`. É um join a mais em leitura, em troca de uma classe inteira de falha de segurança eliminada.

### 3.4 Comercial

**`Lead`**

```
id, organizationId, fullName, phone?, email?, source (PUBLIC_CATALOG|MANUAL|IMPORT|REFERRAL|OTHER),
assignedMemberId?, status (NEW|CONTACTED|QUALIFIED|DISQUALIFIED|CONVERTED),
notes?, consentGivenAt?, privacyNoticeVersion?, consentIpHash?,
deletedAt?, anonymizedAt?, timestamps
```

- **`assignedMemberId` nulo = fila de não atribuídos** (decisão 5). Não é um estado separado; é a ausência de responsável. Menos uma coluna para dessincronizar.
- **Telefone e e-mail são ambos opcionais, mas pelo menos um é obrigatório.** Validação de aplicação.
- **[DECIDIDO 19/10/2026]** **Não deduplicar automaticamente.** Cada envio cria um `Lead`; a interface sinaliza "possível duplicata deste telefone" e o corretor decide unir. Fusão automática erra quando duas pessoas dividem um telefone, e registro fundido por engano não se separa depois. Implica: índice `(organizationId, phone)`, um indicador na lista e uma ação manual de unificação — **[DECIDIR]** a ação de unificar entra no MVP ou basta o aviso?
- `consentIpHash` guarda **hash** do IP, não o IP. Comprova consentimento sem reter dado pessoal desnecessário.

**`Inquiry`** — a solicitação concreta vinda do catálogo.

```
id, organizationId, propertyId, leadId, message?, sourceUrl?, createdAt
```

Separado de `Lead` porque o mesmo interessado pode perguntar sobre vários imóveis. Fundir os dois perderia essa informação, que é justamente o sinal de intenção mais útil para o corretor.

**`PipelineStage`** — **[PROPOSTA]** etapas em tabela, não em enum.

```
id, organizationId, name, position, isWon, isLost, timestamps
@@unique([organizationId, position])
```

[CLAUDE.md](../CLAUDE.md) diz "funil configurado inicialmente com etapas padrão", o que implica que as etapas podem mudar. Como enum, cada imobiliária que quisesse renomear uma etapa exigiria `ALTER TABLE`. Como tabela, é seed na criação da organização.

Padrão sugerido: Novo → Contato feito → Visita agendada → Proposta → Fechado (`isWon`) / Perdido (`isLost`).

**[DECIDIDO 19/10/2026]** **Só o seed no MVP.** As cinco etapas são criadas junto com a organização e não há tela de edição. A escolha de tabela em vez de enum continua valendo: construir a edição depois não exige migração nem `ALTER TABLE`.

**`Deal`**

```
id, organizationId, leadId, propertyId?, stageId, assignedMemberId?,
expectedAmount?, closedAt?, lostReason?, deletedAt?, timestamps
```

- `propertyId` opcional: existe negociação sem imóvel definido ("procuro 2 quartos na zona sul").
- **Visibilidade herda o lead** ([permissions.md](permissions.md) §4.3). Qualquer consulta a `Deal` precisa do mesmo escopo aplicado a `Lead`, senão o funil vaza nome de cliente de colega.

**`Visit`**

```
id, organizationId, propertyId, leadId?, assignedMemberId,
startsAt, endsAt, status (SCHEDULED|CONFIRMED|DONE|CANCELED|NO_SHOW),
notes?, timestamps
```

**`Task`**

```
id, organizationId, leadId?, dealId?, propertyId?, assignedMemberId,
title, dueAt?, status (OPEN|DONE|CANCELED), completedAt?, timestamps
```

### 3.5 Auditoria

**`Activity`**

```
id, organizationId, actorMembershipId?, actorPlatformAdminId?,
entityType, entityId, action, metadata (JSON), ipHash?, createdAt
```

- **Somente inserção.** Nenhum papel edita ([permissions.md](permissions.md) §4.6).
- Um dos dois atores pode ser nulo; ambos nulos significa ação do sistema.
- `metadata` em JSON evita uma tabela por tipo de evento. Aceitável porque não se consulta por dentro dele — só se exibe.
- Cresce rápido. Definir retenção **antes** do piloto, não quando a tabela tiver 50 milhões de linhas.

---

## 4. Relacionamentos

```
User 1──N Membership N──1 Organization
Membership 1──N Property        (ownerMemberId, opcional)
Membership 1──N Lead/Deal/Visit/Task   (assignedMemberId)
Organization 1──N Property 1──N PropertyMedia
                           1──N PropertyFeature
Organization 1──N Lead 1──N Inquiry N──1 Property
                      1──N Deal N──1 PipelineStage
Organization 1──N Visit, Task, Activity, PipelineStage, Invitation
```

**Comportamento ao apagar:**

- Remover `Membership` **nunca** cascateia para imóveis e leads. [permissions.md](permissions.md) §4.4 exige destino explícito antes de remover alguém. No banco: `ON DELETE RESTRICT`.
- Apagar `Property` com `Inquiry` associada: **soft delete**, nunca físico. A `Inquiry` é prova de origem do lead.
- Apagar `Organization`: operação deliberada, com exportação prévia e prazo de carência. Não é um `DELETE`.

---

## 5. Campos públicos e privados do imóvel

**[DECIDIDO]** por [permissions.md](permissions.md) §5: o catálogo é servido por **lista branca**, campo a campo.

| Públicos | Privados — nunca saem da API pública |
|---|---|
| `title`, `description`, `type`, `purpose` | `code` (código interno) |
| `price`, `rentPrice`, `condoFee`, `iptu` | `ownerMemberId` e qualquer `userId` |
| `bedrooms`, `bathrooms`, `suites`, `parkingSpots` | `street`, `number`, `complement` (conforme `addressVisibility`) |
| `areaTotal`, `areaUseful` | `zipCode` |
| `state`, `city`, `neighborhood` | coordenadas exatas |
| fotos e plantas (`PHOTO`, `FLOORPLAN`) | `PropertyMedia.kind = DOCUMENT` |
| `PropertyFeature` | notas internas, histórico, `Activity` |
| `slug`, `publishedAt` | dados do proprietário do imóvel |

**[PROPOSTA]** Com `addressVisibility = NEIGHBORHOOD_ONLY`, as coordenadas saem **deslocadas aleatoriamente** dentro de um raio, ou não saem. Devolver o ponto exato e desenhar um círculo no mapa não protege nada — o dado está no JSON.

**[PROPOSTA]** O `description`, preenchido livremente, costuma conter o endereço que os outros campos escondem. Nenhum desenho de banco resolve isso. Mínimo: aviso discreto no campo de descrição quando `addressVisibility != FULL`, lembrando que aquele texto é público.

---

## 6. Índices

**[PROPOSTA]** Além das chaves estrangeiras, índices compostos desenhados para as consultas reais. A ordem das colunas importa: o mais seletivo e o mais filtrado primeiro.

```
Property      (organizationId, status, publishedAt)     -- lista do CRM
              (organizationId, ownerMemberId)           -- "meus imóveis"
              (organizationId, city, neighborhood)      -- filtro de busca
              (status, publishedAt)                     -- catálogo público
Lead          (organizationId, assignedMemberId, createdAt)
              (organizationId, assignedMemberId, status)
              (organizationId, phone)                   -- detecção de duplicata
Deal          (organizationId, stageId, assignedMemberId)
Visit         (organizationId, assignedMemberId, startsAt)
Task          (organizationId, assignedMemberId, status, dueAt)
Inquiry       (organizationId, propertyId, createdAt)
Activity      (organizationId, entityType, entityId, createdAt)
Membership    (userId), (organizationId, role)
```

Note que `(organizationId, assignedMemberId, …)` aparece em quase tudo: é o reflexo direto da decisão 1 no plano de consulta. A permissão virou índice.

**Evitar N+1** ([CLAUDE.md](../CLAUDE.md)): listas de imóveis carregam a capa com `include`, não uma query por item. Listas de leads carregam o responsável em lote. Vale um teste que conte queries nos endpoints de listagem — é a forma mais confiável de impedir regressão, porque N+1 não quebra nada, só fica lento quando o cliente cresce.

**Busca textual:** `LIKE '%termo%'` não usa índice e degrada rápido. **[PROPOSTA]** `FULLTEXT` do MySQL em `title` e `description` no MVP; mecanismo dedicado só se o piloto mostrar necessidade.

---

## 7. LGPD no modelo

| Exigência | Como aparece no modelo |
|---|---|
| Consentimento comprovável | `consentGivenAt`, `privacyNoticeVersion`, `consentIpHash` em `Lead` |
| Versionamento do aviso | Guardar a **versão aceita**; mudar o texto não invalida o consentimento antigo |
| Direito de exclusão | `anonymizedAt` + substituição de `fullName`/`phone`/`email` por valores neutros |
| Minimização | Hash de IP, nunca IP bruto; não coletar CPF no MVP |
| Retenção | Política por tipo de dado, a definir antes do piloto |

**[PROPOSTA]** Pedido de exclusão **anonimiza em vez de apagar**. Apagar a linha destruiria a `Inquiry` e o histórico de negociação, que são registro legítimo da operação da imobiliária. Anonimizar remove o dado pessoal e preserva o fato.

**[DECIDIR]** Isso precisa de validação jurídica. Não é uma decisão técnica, e eu não tenho competência para afirmar que atende à LGPD. Em caso de dúvida, consultar quem entende antes do piloto.

---

## 8. Riscos e ressalvas

**Enums nativos endurecem o schema.** Cada valor novo em `Property.status` é um `ALTER TABLE`, que em tabela grande trava escrita. Para `status` e `type`, que mudam raramente, é aceitável. Foi por isso que `PipelineStage` virou tabela: é o enum que mais tende a mudar.

**A redundância de `organizationId` precisa de disciplina.** Nada no banco impede que `PropertyMedia.organizationId` divirja de `Property.organizationId`. **[PROPOSTA]** um teste que varre as tabelas procurando divergência, rodando no CI. Barato, e pega o bug antes de virar vazamento.

**Nenhum dado real de cliente em desenvolvimento** ([CLAUDE.md](../CLAUDE.md)). As fixtures de [permissions.md](permissions.md) §8.1 servem também como seed.

**`Decimal` em JavaScript.** O Prisma devolve `Decimal` como objeto, não `number`. Converter com `Number()` reintroduz o erro de ponto flutuante que o `Decimal` evitou. Tratar na serialização, com teste.

---

## 9. Decisões

### Aprovadas em 19/10/2026

| # | Decisão | Resposta |
|---|---|---|
| 1 | Deduplicar lead por telefone? | **Não.** Sinalizar possível duplicata; corretor decide |
| 2 | Editar etapas do funil no MVP? | **Não.** Apenas o seed de cinco etapas |
| 3 | Redirecionar `slug` antigo? | **Sim.** `OrganizationSlugHistory` + redirecionamento permanente |
| 4 | Avisar sobre endereço na descrição livre? | **Sim.** Aviso no campo quando `addressVisibility != FULL` |
| 6 | Catálogo mostra imóvel `RESERVED`? | **Sim**, com etiqueta visível |

### Ainda em aberto

| # | Pendência | Bloqueia |
|---|---|---|
| 5 | A anonimização de leads atende à LGPD? **Requer parecer jurídico — não é decisão técnica** | Piloto |
| 7 | A ação de *unificar* leads duplicados entra no MVP, ou basta o aviso? | Captura de lead |

Nenhuma das duas bloqueia a Fase 1 do [roadmap.md](roadmap.md).
