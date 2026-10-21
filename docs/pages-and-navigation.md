# Doverni — Páginas e navegação

> Revisão de 20/10/2026. Entrega #6 do briefing inicial.
>
> Marcadores: **[DECIDIDO]** aprovado com data · **[PROPOSTA]** sugestão minha, aberta a mudança · **[DECIDIR]** precisa de resposta antes de construir a tela.
>
> Este documento define **o que existe e quem vê**. Não define aparência: isso é [design-system.md](design-system.md). As permissões citadas são as de [permissions.md](permissions.md) §4, e aqui aparecem apenas aplicadas à navegação.

---

## 1. Convenções

**[PROPOSTA]**

| Assunto | Decisão | Por quê |
|---|---|---|
| Idioma das rotas | Português, sem acento | A linguagem do produto é pt-BR ([CLAUDE.md](../CLAUDE.md)). `/imoveis` é o que o corretor esperaria digitar; `/properties` não |
| Prefixo do painel | `/painel/...` | Separa com clareza o que exige sessão do que é público. Facilita regra de middleware e de cache |
| Rota pública da organização | `/o/[slug]` | **[DECIDIDO 19/10/2026]** em [data-model.md](data-model.md) §3.1 |
| Identificador na URL | `slug` quando houver, `cuid` quando não | Slug é legível e compartilhável. O `cuid` não é sequencial, o que corta enumeração trivial ([permissions.md](permissions.md) §6) |
| Recurso de outra organização | **404, nunca 403** | 403 confirma que o registro existe. É vazamento por canal lateral |
| Mobile | Todas as telas do painel funcionam no celular | Tabela em desktop, cartões no celular ([design-system.md](design-system.md)) |

**Toda tela de lista precisa de quatro estados**, não só o de sucesso: carregando, vazia por não haver nada, vazia por filtro que não achou nada, e erro. São estados diferentes e **dizem coisas diferentes ao usuário** — "você ainda não cadastrou imóveis" não é a mesma mensagem que "nenhum imóvel bate com esse filtro". Confundi-los é o defeito de usabilidade mais comum em CRM.

---

## 2. Mapa geral

```
PÚBLICO (sem sessão)
  /                                  landing institucional
  /entrar                            login
  /cadastro                          criar conta + organização
  /recuperar-senha                   solicitar redefinição
  /redefinir-senha                   redefinir com token
  /convite                           aceitar convite
  /termos                            termos de uso
  /privacidade                       aviso de privacidade (versionado)

CATÁLOGO PÚBLICO (sem sessão)
  /o/[slug]                          vitrine da organização
  /o/[slug]/imovel/[imovelSlug]      detalhe do imóvel + formulário de interesse

PAINEL (exige sessão + organização ativa)
  /painel                            dashboard
  /painel/imoveis                    lista
  /painel/imoveis/novo               cadastro
  /painel/imoveis/[id]               detalhe
  /painel/imoveis/[id]/editar        edição
  /painel/imoveis/[id]/fotos         mídia
  /painel/leads                      lista
  /painel/leads/a-distribuir         fila de não atribuídos
  /painel/leads/novo                 cadastro manual
  /painel/leads/[id]                 detalhe + histórico
  /painel/funil                      quadro de negociações
  /painel/funil/[id]                 detalhe da negociação
  /painel/agenda                     calendário de visitas
  /painel/agenda/[id]                detalhe da visita
  /painel/tarefas                    lista de tarefas
  /painel/equipe                     membros e convites
  /painel/equipe/convidar            novo convite
  /painel/organizacao                dados, vitrine e slug
  /painel/auditoria                  log de atividades
  /painel/perfil                     nome, senha, foto
  /painel/perfil/aparencia           tema claro/escuro
  /painel/trocar-organizacao         seleção de organização ativa

ADMINISTRAÇÃO DA PLATAFORMA (PlatformAdmin, segregado)
  /adm                               painel de suporte
  /adm/organizacoes                  busca de organizações
  /adm/organizacoes/[id]             dados operacionais, sem dados de cliente

ERROS
  /nao-encontrado                    404
  /sem-permissao                     403 dentro da própria organização
  /erro                              500
```

---

## 3. Área pública

### `/` — landing institucional

Explica o produto e leva a `/cadastro` ou `/entrar`.

**[DECIDIR]** O nome visível vem de `NEXT_PUBLIC_APP_NAME`, porque a marca não está decidida ([CLAUDE.md](../CLAUDE.md)). A landing precisa de texto definitivo antes de ir ao ar, e esse texto depende da marca.

Quem já tem sessão válida é levado a `/painel`. **[PROPOSTA]** Sem redirecionamento automático: um link "ir para o painel" no topo. Redirecionar à força impede o cliente de mostrar a própria landing a um colega.

### `/termos` e `/privacidade`

Públicas, sem sessão, e **versionadas**. O aviso de privacidade guarda número de versão, porque é isso que `Lead.privacyNoticeVersion` referencia ([data-model.md](data-model.md) §7): mudar o texto não pode reescrever retroativamente o que alguém aceitou.

**[DECIDIR]** O conteúdo jurídico não existe. Precisa de redação própria antes do piloto, e [data-model.md](data-model.md) §9 já registra que a anonimização de leads depende de parecer jurídico.

---

## 4. Autenticação

> **Construído em 20/10/2026.** As cinco telas existem em `apps/web/app/(entrada)/`, ligadas à API dos itens A1 a A10 do [roadmap.md](roadmap.md). Verificado ponta a ponta pelo navegador: cadastro, login, logout, recuperação de senha com uso único do token, e convite aceito criando conta.
>
> Duas coisas que o documento não previa e o código decidiu:
>
> - **`/entrar` recusa destino externo.** O parâmetro `?destino=` só aceita caminho que começa com uma barra. Sem isso, `?destino=https://site-falso/...` faria o próprio login redirecionar para fora — um redirecionamento aberto, que serve para dar aparência legítima a página de phishing.
> - **`/termos` e `/privacidade` existem, mas sem texto.** Declaram que o documento está em elaboração. Texto jurídico improvisado criaria aparência de proteção que não existe e invalidaria o consentimento que o banco registra em `privacyNoticeVersion`. Depende do item D6.
>
> Ainda **não** construído: o campo de `slug` não verifica disponibilidade enquanto a pessoa digita. Ele valida formato e recusa os reservados de `@app/shared`, e a colisão aparece como erro ao enviar. A verificação ao vivo exige um endpoint que não existe.

### `/entrar`

Campos: e-mail e senha, com "permanecer conectado". Contrato: `loginSchema` em `@app/shared`.

| Situação | O que a tela mostra |
|---|---|
| Credencial errada | **"E-mail ou senha incorretos."** Nunca "este e-mail não existe": isso entrega quais e-mails têm conta na plataforma |
| Conta desabilitada | Mensagem genérica, idêntica à anterior, pelo mesmo motivo |
| E-mail não verificado | **[DECIDIDO 20/10/2026] Não bloqueia.** Bloquear o primeiro acesso, dependendo de um e-mail que pode cair em spam, é a forma mais rápida de perder o cliente recém-cadastrado. Nada no MVP depende da confirmação, e há teste garantindo que a conta não verificada usa o sistema |
| Muitas tentativas | Mensagem de limite atingido. Rate limiting é exigência do [CLAUDE.md](../CLAUDE.md) |

### `/cadastro`

Fluxo **único**, por decisão de 19/10/2026: cria `User` + `Organization` + `Membership` com papel `OWNER`, numa transação. Não há escolha de "sou autônomo" ou "sou imobiliária" — o corretor autônomo é uma organização de um membro.

Campos: nome, e-mail, senha, nome da organização, endereço público (`slug`) e aceite dos termos. Contrato: `cadastroSchema`.

O campo de `slug` mostra o resultado final (`doverni.com.br/o/seu-endereco`) enquanto a pessoa digita, verifica disponibilidade e recusa a lista de reservados (`SLUGS_RESERVADOS` em `@app/shared`). A verificação no servidor é a que vale, e consulta **duas** tabelas: `Organization.slug` e `OrganizationSlugHistory.slug` ([data-model.md](data-model.md) §3.1).

Ao concluir: cria as etapas padrão do funil (`ETAPAS_PADRAO_DO_FUNIL`), define a organização como ativa na sessão e leva a `/painel`.

### `/recuperar-senha` e `/redefinir-senha`

A tela de solicitação responde **sempre a mesma coisa**, exista o e-mail ou não: "Se houver uma conta com esse e-mail, enviamos as instruções." Resposta diferente por caso transforma o formulário em consulta de quem tem conta.

`/redefinir-senha?token=...` valida o token no servidor. Token expirado, já usado ou inválido levam à **mesma** mensagem, com link para pedir outro — distinguir "expirado" de "inválido" informa o atacante sobre o formato.

### `/convite`

`/convite?token=...`. Dois caminhos:

- **Pessoa sem conta**: define nome e senha, aceita os termos, entra já com a organização ativa (`aceitarConviteSchema`)
- **Pessoa que já tem conta**: faz login e o convite vira um novo `Membership`. É o caso previsto do corretor que atende duas imobiliárias

Convite expirado, revogado ou já aceito mostra tela explicativa com orientação para pedir novo convite a quem convidou.

---

## 5. Painel

Toda rota sob `/painel` exige os sete passos de [permissions.md](permissions.md) §6. O middleware verifica a sessão; a **autorização de dado acontece no servidor, por requisição**, nunca só na navegação.

### Navegação por papel

A barra lateral mostra apenas o que o papel alcança. **Esconder item de menu não é segurança** — é cortesia visual, e o servidor recusa de novo se alguém digitar a URL.

| Item | OWNER | ADMIN | MANAGER | AGENT |
|---|---|---|---|---|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Imóveis | ✅ | ✅ | ✅ | ✅ |
| Leads | ✅ | ✅ | ✅ | ✅ (só os dele) |
| Leads a distribuir | ✅ | ✅ | ✅ | — |
| Funil | ✅ | ✅ | ✅ | ✅ (só os dele) |
| Agenda | ✅ | ✅ | ✅ | ✅ (só dele) |
| Tarefas | ✅ | ✅ | ✅ | ✅ (só dele) |
| Equipe | ✅ | ✅ | ✅ | ✅ (nome e papel) |
| Organização | ✅ | ✅ | — | — |
| Auditoria | ✅ | ✅ | — | — |
| Perfil | ✅ | ✅ | ✅ | ✅ |

O seletor de organização ativa aparece **somente** para quem tem mais de um `Membership` ativo. Para o corretor autônomo, que é a maioria, um seletor com uma opção só é ruído.

**Construído em 21/10/2026**, em `apps/web/components/painel/navegacao.tsx`. Duas diferenças em relação à tabela acima, ambas deliberadas:

1. **O menu lista só o que existe** — hoje painel e imóveis. Item que leva a tela vazia ou a 404 ensina a pessoa a não confiar na navegação, e é pior do que menu curto.
2. **Quem decide a visibilidade é a matriz**, pela mesma `podeFazer()` que a guarda da API consulta, e não uma lista escrita à mão aqui. Lista própria divergiria da matriz no primeiro ajuste de permissão, e divergiria em silêncio.

### `/painel` — dashboard

**[PROPOSTA]** O conteúdo muda com o papel, porque o que é urgente muda com o papel.

Para `AGENT`: meus leads novos, minhas visitas de hoje e amanhã, minhas tarefas vencidas, meus imóveis em rascunho.

Para `MANAGER`, `ADMIN` e `OWNER`: tudo acima no escopo da organização, mais o **contador de leads a distribuir**. Esse contador não é enfeite: [permissions.md](permissions.md) §5 registra que, sem ele visível, a fila de não atribuídos cresce sem ninguém perceber — e lead parado é venda perdida.

Estado vazio da organização nova: um guia de primeiros passos (cadastre um imóvel → publique → compartilhe a vitrine), não um painel de zeros. Painel de zeros não diz à pessoa o que fazer.

### `/painel/imoveis`

Lista paginada com busca e filtros (status, tipo, finalidade, cidade, bairro, responsável). Paginação é exigência do [CLAUDE.md](../CLAUDE.md); a capa vem com `include`, nunca uma consulta por item.

**Todos os papéis leem todos os imóveis da organização** — inclusive `AGENT`. Isso é deliberado: o corretor precisa poder oferecer qualquer imóvel da casa ao cliente dele.

O `AGENT` vê o botão de editar **somente** nos imóveis sob sua responsabilidade. Nos outros, o botão não aparece, e a rota `/painel/imoveis/[id]/editar` responde erro de permissão se ele insistir.

Alternar entre "Todos" e "Meus imóveis" é um filtro, não uma permissão.

### `/painel/imoveis/novo` e `/editar`

Formulário por seções: identificação, características, endereço, valores, publicação.

Dois pontos onde a tela precisa proteger o cliente:

1. **`addressVisibility` nasce em `NEIGHBORHOOD_ONLY`** e o controle fica visível na seção de endereço, com explicação do que o público verá. Padrão restritivo é o que impede vazamento por esquecimento.
2. **Aviso no campo de descrição** quando `addressVisibility != FULL`, lembrando que aquele texto é público — **[DECIDIDO 19/10/2026]**. É o furo que nenhum desenho de banco resolve: o corretor escreve o endereço completo na descrição livre.

`purpose = BOTH` exige preço de venda **e** de aluguel. `code` é único por organização, e o erro precisa dizer qual código já existe.

**[DECIDIDO 21/10/2026]** Obrigatórios: título, tipo, finalidade, UF, cidade, bairro e o preço coerente com a finalidade. Área e dormitórios ficam **opcionais** — campo obrigatório que o corretor ainda não sabe produz número inventado, pior para o filtro do que o campo vazio, porque o vazio se detecta e o errado não. O contrato está em `packages/shared/src/schemas/imovel.ts`.

Consequência para o item C4: filtro por área ou por dormitórios tem de **excluir** o imóvel sem o valor, nunca tratá-lo como zero.

**Construído em 21/10/2026**, menos a aba de fotos. O código de referência é gerado (`AP-001`, sequencial por organização, prefixo pelo tipo) e pode ser sobrescrito — a imobiliária que já numera imóveis usa essa referência no anúncio.

### `/painel/imoveis/[id]/fotos`

Upload múltiplo com reordenação e escolha de capa. Envio por URL assinada, gerada **somente depois** da autorização completa e com validade curta.

`DOCUMENT` nunca vai ao catálogo — matrícula e contrato não são material de vitrine. A tela deve separar visualmente "fotos e plantas (públicas)" de "documentos (internos)", porque a consequência de confundir é expor documento de proprietário.

### `/painel/leads`

**Aqui a leitura é restrita, ao contrário dos imóveis.** O `AGENT` vê só os leads atribuídos a ele. Lead é a moeda de troca da imobiliária, e expor a carteira de um corretor aos colegas gera conflito interno.

A lista marca **possível duplicata** por telefone, sem unir nada automaticamente — **[DECIDIDO 19/10/2026]**. Fusão automática erra quando duas pessoas dividem um telefone, e registro fundido por engano não se separa depois.

**[DECIDIR]** A ação de *unificar* leads duplicados entra no MVP, ou basta o aviso? Pendência 7 de [data-model.md](data-model.md) §9. Muda esta tela.

### `/painel/leads/a-distribuir`

Fila de leads sem responsável, para `MANAGER` e acima. Sem rodízio automático no MVP — **[DECIDIDO 19/10/2026]**. Atribuição manual, em lote quando possível.

### `/painel/leads/[id]`

Dados, origem, histórico de interações, visitas, negociações e as `Inquiry` que originaram o lead — com o imóvel de cada uma, que é o sinal de intenção mais útil para o corretor.

Mostra consentimento registrado: data, versão do aviso aceita, e origem. **[PROPOSTA]** Ação de anonimizar, visível só para `OWNER` e `ADMIN`, com confirmação explícita que diga o que será perdido. Depende do parecer jurídico pendente.

### `/painel/funil`

Quadro com as etapas em colunas, arrastar para mover. A visibilidade **herda o lead**: quem não vê o lead não vê a negociação. Sem isso, o funil vaza o nome do cliente de um colega.

Sem tela de edição de etapas no MVP — **[DECIDIDO 19/10/2026]**, só o seed.

**[PROPOSTA]** No celular, o quadro vira lista agrupada por etapa com seletor de mudança. Arrastar em tela pequena não funciona bem.

### `/painel/agenda` e `/painel/tarefas`

Calendário de visitas (dia, semana, mês) e lista de tarefas. Mesma regra de visibilidade do lead. Datas em UTC no banco, convertidas na borda — o Brasil tem fusos distintos, e o horário de verão pode voltar.

### `/painel/equipe`

Lista de membros com papel e situação. `AGENT` vê apenas nome e papel — a redução é do DTO, não da navegação.

Convite respeita a hierarquia: `OWNER` convida qualquer papel, `ADMIN` não convida `ADMIN`, `MANAGER` convida só `AGENT`. O seletor usa `papeisQuePodeConvidar()` de `@app/shared`.

**Remover membro abre fluxo de transferência obrigatória**: a tela exige destino para imóveis, leads, negociações e visitas atribuídos antes de concluir. Não é um botão de excluir — é um assistente. Remover sem destino deixaria registros órfãos e é recusado pelo banco (`ON DELETE RESTRICT`).

Ninguém altera o próprio papel, nem o `OWNER`. Transferir propriedade é operação atômica e separada, com confirmação forte.

### `/painel/organizacao`

Dados, logo, contato público, bio e `slug`. Só `OWNER` e `ADMIN`.

Trocar o `slug` mostra aviso claro: o endereço antigo continua funcionando com redirecionamento permanente (`OrganizationSlugHistory`) — **[DECIDIDO 19/10/2026]**. Anúncio impresso e link no Instagram não podem virar página de erro.

### `/painel/auditoria`

Log somente leitura, para `OWNER` e `ADMIN`. Nenhum papel edita: log que o administrador pode editar não serve de prova.

### `/painel/perfil` e `/painel/perfil/aparencia`

Nome, foto, senha e tema. Sempre escopo próprio, em qualquer papel.

A aparência oferece claro, escuro e seguir o sistema (`ThemePreference`). **Tema claro é o padrão** de quem nunca escolheu. A preferência é persistida por usuário em `User.themePreference`, e é isso que faz a escolha seguir a pessoa de um dispositivo para outro.

> Estado atual: o alternador existe e guarda a escolha no navegador. A persistência em `User.themePreference` entra com a autenticação.

### `/painel/trocar-organizacao`

Lista os `Membership` ativos. A escolha é gravada **na sessão, no servidor** — é isso que impede o cliente de escolher a própria organização. Trocar invalida cache por usuário; sem isso, o corretor que atende duas imobiliárias vê a lista errada.

---

## 6. Catálogo público

A maior superfície de vazamento do produto. Não autentica ninguém.

### `/o/[slug]` — vitrine

Identidade da organização (nome, logo, bio, contato público) e os imóveis publicados, com busca e filtros (`filtrosDoCatalogoSchema`).

Mostra `AVAILABLE` e `RESERVED`, este **com etiqueta visível** — **[DECIDIDO 19/10/2026]**. A etiqueta não é detalhe estético: sem ela, o interessado descobre a reserva só depois de ligar. Nunca mostra `DRAFT`, `SOLD`, `RENTED`, `INACTIVE` nem excluído.

Servido por **DTO público explícito, campo a campo**. Nada de `select *` com exclusões: lista negra sempre esquece o campo novo que alguém adicionou na semana passada.

Os filtros **não** incluem rua, CEP nem coordenada. Permitir isso contornaria `addressVisibility` pela porta da busca.

Slug antigo responde redirecionamento permanente. Slug inexistente responde 404 — nunca "organização suspensa", que informaria sobre o cliente.

### `/o/[slug]/imovel/[imovelSlug]` — detalhe

Fotos e plantas, características, valores e localização conforme `addressVisibility`. Com `NEIGHBORHOOD_ONLY`, as coordenadas saem deslocadas aleatoriamente dentro de um raio, ou não saem — **[PROPOSTA]**. Devolver o ponto exato e desenhar um círculo no mapa não protege nada: o dado está no JSON.

### Formulário de interesse

Nome, telefone e/ou e-mail, mensagem e **marcação explícita de consentimento, nunca pré-marcada**. Contrato: `capturaDeLeadSchema`.

Cria `Lead` + `Inquiry`. O lead é atribuído ao corretor responsável pelo imóvel; sem responsável, vai para a fila de não atribuídos — **[DECIDIDO 19/10/2026]**.

A resposta confirma o envio e **não devolve** dados do lead nem IDs internos. Exige anti-spam e rate limit por IP. Guarda a versão do aviso de privacidade e o **hash** do IP, nunca o IP.

**[DECIDIR]** Qual mecanismo anti-spam? Captcha de terceiro envolve custo e dado pessoal indo para fora; alternativas (campo-armadilha, limite por IP, prova de trabalho) são mais fracas mas não vazam nada. Não decido isso sozinho.

---

## 7. Administração da plataforma

`/adm`, para `PlatformAdmin` — tabela separada de `Membership`, por [permissions.md](permissions.md) §2.2.

**[PROPOSTA]** Acesso a dados **operacionais**, não a dados de cliente: existência da organização, plano, situação, contadores, erros. Não lista leads nem imóveis de ninguém.

Suporte que precise ver dados de um cliente passa por acesso temporário, registrado em auditoria e com consentimento do `OWNER`. **[DECIDIR]** Fora do MVP, ou mínimo necessário para operar o piloto?

---

## 8. Estados obrigatórios

**[PROPOSTA]** Padrão para toda tela, porque cada um destes estados aparece na vida real e, sem tratamento, viram tela branca.

| Estado | Regra |
|---|---|
| Carregando | Esqueleto com a forma do conteúdo, não um spinner centralizado. Lista mostra linhas vazias; o layout não deve saltar quando os dados chegam |
| Vazio sem dados | Explica o que é aquilo e oferece a ação principal. "Nenhum imóvel cadastrado — cadastrar o primeiro" |
| Vazio por filtro | Diz que o filtro não achou nada e oferece limpar. **Nunca** a mesma mensagem do caso acima |
| Erro de rede | Diz que não foi possível carregar e oferece tentar de novo. Nunca mostra mensagem técnica nem stack |
| Sem permissão, mesma organização | `/sem-permissao`, explicando que o papel não alcança aquilo e a quem pedir |
| Recurso de outra organização | **404**, idêntico a recurso inexistente |
| Sessão expirada | Leva a `/entrar` preservando o destino, e avisa que a sessão expirou |
| Membro suspenso | Encerra a sessão imediatamente. `status != ACTIVE` remove o acesso na hora |
| Formulário inválido | Erro junto ao campo, em português, vindo do schema de `@app/shared`. Foco vai ao primeiro campo com erro |
| Operação demorada | Botão desabilitado com indicação de progresso, para não duplicar envio |

Acessibilidade, do [CLAUDE.md](../CLAUDE.md): foco sempre visível, contraste WCAG, e **cor nunca é o único indicador** de estado — sempre acompanhada de texto, ícone ou etiqueta.

---

## 9. O que este documento não resolve

| Pendência | Bloqueia | Onde está registrada |
|---|---|---|
| Campos obrigatórios do imóvel | `/painel/imoveis/novo` | [product.md](product.md) |
| Unificar leads duplicados entra no MVP? | `/painel/leads` | [data-model.md](data-model.md) §9 |
| Mecanismo anti-spam do formulário público | Captura de lead | este documento, §6 |
| Bloquear login sem e-mail verificado? | `/entrar` | este documento, §4 |
| Serviço de e-mail transacional | Cadastro, convite, recuperação | [product.md](product.md) |
| Escopo do `/adm` no MVP | Administração | este documento, §7 |
| Texto jurídico de termos e privacidade | `/termos`, `/privacidade` | este documento, §3 |
| Marca definida | Landing e nome visível | [CLAUDE.md](../CLAUDE.md) |

Nenhuma delas bloqueia a autenticação, que é o próximo passo da Fase 1.
