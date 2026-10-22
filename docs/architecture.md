# Doverni — Arquitetura proposta

## Visão
- Next.js: aplicação autenticada e catálogo público responsivo
- NestJS: API REST com autenticação e autorização por organização
- MySQL: dados transacionais com Prisma Migrate
- Object storage: fotos e arquivos (URL assinada para upload, validação de tipo/tamanho e otimização)
- Serviço de e-mail transacional: verificação, convites e recuperação de senha (escolher depois)

## Implantação
**Decidido em 21/10/2026** — ver "Infraestrutura" no fim deste documento, com os limites confirmados pelo suporte: hospedagem **gerenciada** (plano Unlimited da Hostinger), mídia no **Cloudflare R2**, sem Docker nem root em produção.

O texto original desta seção listava o que precisava ser confirmado antes de escolher. Foi confirmado, com três consequências que o código precisa respeitar: **sem workers persistentes**, **sem tarefas agendadas internas** e **sem WebSocket de entrada**.

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

---

## Infraestrutura — decisões de 21/10/2026

As três pendências de infraestrutura foram fechadas no mesmo dia, depois de
consultar a documentação dos provedores e o suporte da Hostinger. O que era
suposição virou resposta com fonte, como o item D1 exige.

### Hospedagem: gerenciada, plano Unlimited da Hostinger

**Gerenciada e não VPS.** O VPS daria liberdade total — Docker, root, versão
do Node à escolha — e cobraria por isso a manutenção permanente do servidor:
correções de segurança do Linux, MySQL de pé, reinício de madrugada. O produto
é construído por uma pessoa só, e toda hora de administração de servidor é hora
que não foi para o CRM.

**Limites confirmados pelo suporte**, e por que cada um basta:

| Limite do plano | Do que precisamos | Folga |
|---|---|---|
| 2 aplicações Node simultâneas (de 5 cadastráveis) | exatamente 2: Next.js e NestJS | **nenhuma** |
| 120 processos (NPROC) e 3 GB de RAM, compartilhados | ~300 MB nas duas aplicações | confortável |
| 75 conexões simultâneas ao MySQL | `DATABASE_POOL_LIMIT`, hoje 10, e só a API conecta | grande |
| Processo de longa duração, **sem hibernação** | catálogo público sem atraso na primeira visita | — |

A linha sem folga é a primeira: **não há espaço para um terceiro processo**. É
o que torna as limitações abaixo estruturais, e não contornáveis com "sobe mais
um serviço".

### As três limitações da plataforma, e o que cada uma custa

**Não há workers persistentes.** Esta é a que mais pesa, porque invalida uma
correção que já estava documentada. O item A9 tem uma limitação conhecida: a
recuperação de senha responde igual exista a conta ou não, mas o *tempo* da
resposta denuncia, porque quando a conta existe há escrita e envio de e-mail. A
correção registrada era "enviar fora do caminho da requisição" — uma fila com
um processo trabalhando atrás. **Isso não é possível aqui.**

Saídas, em ordem de preferência: provedor de e-mail cuja API aceite a chamada e
devolva imediatamente, sem esperarmos a entrega; ou aceitar a limitação e
registrá-la como residual, documentando que o canal de tempo existe. A escolha
entra junto com a do provedor de e-mail, que segue pendente.

**Não há tarefas agendadas dentro da aplicação.** Hoje nada limpa sessão nem
token expirado — eles não são risco de segurança, porque a validade é conferida
na leitura, mas as tabelas crescem sem fim. Sem worker, as opções são um
endpoint protegido chamado por tarefa agendada do painel da hospedagem, ou
limpeza oportunista durante requisições normais. Vira item da Fase 4.

**Não há WebSocket de entrada.** O MVP não usa nenhum. Fecha a porta para
notificação em tempo real ("chegou um lead agora"), que precisaria de consulta
periódica. Registrado para não ser descoberto no meio de uma implementação.

**O limite de 120 segundos por requisição não nos afeta**: as nossas levam
milissegundos, e o envio de fotos vai do navegador direto ao armazenamento, sem
passar pela API — o que agora tem uma segunda justificativa além da boa prática.

### Armazenamento de mídia: Cloudflare R2

A Hostinger **não oferece armazenamento de objetos gerenciado**. O que existe é
uma página deles sobre instalar o RustFS num VPS — ou seja, software que
passaria a ser nosso para manter, o que recria o ponto único de falha que o
armazenamento externo existe para evitar.

**Correção de uma premissa errada, de 21/10/2026.** A regra do `CLAUDE.md`
dizia "não depender do disco efêmero da hospedagem". O disco da Hostinger
**não é efêmero** — é hospedagem tradicional, com sistema de arquivos real, e a
generalização veio de plataformas em contêiner (Vercel, Railway), que são outra
coisa. Guardar as fotos no disco do plano era tecnicamente viável.

A escolha pelo R2 fica de pé por outro motivo, mais modesto e mais concreto:
**cada foto aberta por um visitante do catálogo seria uma requisição servida
pelo nosso servidor**, gastando CPU e banda dos mesmos 3 GB e 120 processos que
o CRM usa. Um imóvel com 15 fotos visto por 100 pessoas são 1.500 downloads
disputando recurso com o corretor que está trabalhando. No R2 essas requisições
não tocam no servidor: saem da rede da Cloudflare, perto de quem vê.

Pesa também que o backup fica independente da hospedagem, e que trocar de
provedor depois vira uma sincronização de arquivos em vez de uma migração.

**Por que o R2 e não o Backblaze B2**, que é mais barato por GB: o R2 não cobra
**saída de dados**, nunca. Num catálogo público, a saída é o único número que
pode crescer de forma imprevisível — um anúncio circulando num grupo de
WhatsApp multiplica os downloads num dia. O B2 dá franquia de 3× o armazenado e
cobra o excedente; é provavelmente suficiente, e é uma conta que passaríamos a
acompanhar. A recomendação é não ter que acompanhar.

Custo real no início: **zero**. A camada gratuita é de 10 GB/mês, e 500 imóveis
com 15 fotos otimizadas ocupam cerca de 7,5 GB. Aos 30 GB, o custo seria de
cerca de US$ 0,45/mês.

Todos os provedores falam o mesmo protocolo (o do S3), então trocar depois é
configuração, não reescrita.

#### Como o código fala com o armazenamento (22/10/2026, item B4)

Por uma **porta** (`ArmazenamentoDeMidia`), e nunca por um SDK direto — o mesmo
arranjo do e-mail, e pelo mesmo motivo prático: o destino está decidido, mas a
conta e as credenciais do R2 ainda não existem, e adaptador que não pode ser
exercitado não deveria carregar o item inteiro.

A porta promete três coisas: gerar URL de **envio** de validade curta (10
minutos), gerar URL de **leitura** e remover objeto. Não promete redimensionar
nem converter formato — isso exigiria processar imagem no servidor, que é
trabalho de worker, e o plano não tem worker. Quando necessário, o recorte
acontece no navegador antes do envio, ou na transformação de imagem do próprio
R2, que é configuração.

O adaptador de desenvolvimento (`MIDIA_PROVIDER=local`) grava em disco e assina
as URLs com HMAC, reproduzindo a forma de uma URL pré-assinada do S3 — chave,
tipo, tamanho e prazo dentro do que foi assinado. **É recusado em produção na
inicialização**, como o `EMAIL_PROVIDER=log`: servir foto pelo processo da API é
exatamente o que a escolha do R2 evitou.

O arquivo **não passa pela API** em nenhum dos dois adaptadores. O navegador
envia direto ao armazenamento, com a URL assinada que a API emitiu depois de
conferir a permissão. Receber 20 fotos de 5 MB por requisição significaria
ocupar o processo que atende o corretor segurando bytes em memória para depois
reenviá-los.

Entra junto uma consequência para a Fase 3: no R2, foto e planta poderão ser
servidas por domínio público (é o que faz o catálogo não gastar CPU do plano),
mas **documento nunca** — matrícula e contrato continuam atrás de URL assinada,
porque `DOCUMENT` não é material de vitrine.

### Rate limiting (A11): sobre o MySQL, não em memória

O suporte não informa contagem de processos por aplicação, e o limite de 120
NPROC é compartilhado. **Sem garantia de processo único, contador em memória
não serve**: cada processo teria o seu, e o limite real seria o múltiplo disso.

A implementação vai sobre o MySQL, que funciona com um processo ou com vinte.
Custa um pouco mais de trabalho e remove uma pendência — o A11 deixou de
depender de resposta sobre infraestrutura.

### Orçamento, para não ser surpresa

O preço promocional do Unlimited é R$ 12,99/mês **com 48 meses pagos de uma
vez** (R$ 623,52). A renovação é **R$ 64,99/mês**, cerca de R$ 780 por ano.
Orçar pela renovação.

Recomendação de contratação, quando chegar a Fase 4: **12 meses, não 48**.
Custa mais por mês e arrisca menos — os limites do plano só se provam com a
aplicação real rodando, e um ano é tempo suficiente para descobrir se apertam.

### O que ainda não está confirmado

Uma pergunta ficou aberta e vale fazer antes do deploy: **ao publicar uma versão
nova, arquivos dentro da pasta da aplicação são preservados?** Não nos afeta
enquanto as fotos estiverem no R2, mas define onde podem morar arquivos de
operação (logs, cache em disco) se algum dia houver.
