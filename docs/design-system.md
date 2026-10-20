# Doverni — Design system inicial

## Cores
- Primária: azul-marinho `#142B3B`
- Acento: dourado suave `#C5A46D`
- Claro (padrão): fundo `#F5F7F9`, superfície `#FFFFFF`, texto principal `#142B3B`
- Escuro: fundo `#101B26`, superfície `#1C2A38`, texto principal `#F8FAFC`
- Cores de estados (sucesso/erro/aviso) são funcionais, com contraste apropriado; não limitar literalmente a UI a duas cores.

## Princípios
- Interface premium, mas funcional para uso diário
- Barra lateral azul-marinho no claro; sidebar mais escura no tema escuro
- Dourado em poucas ações/destaques, nunca como texto pequeno em branco
- Ícones consistentes, tipografia legível, estados de hover/foco/erro/vazio/loading
- Tabelas em desktop e cartões responsivos no celular
- Tema claro ao primeiro acesso; escolha individual persistida

## Telas previstas
Landing institucional, login, cadastro, recuperação de senha; dashboard; imóveis/lista/novo/detalhe/edição; clientes/lista/detalhe; funil; agenda; visitas; equipe/permissões; perfil/configurações; catálogo público e detalhe do imóvel; formulário de interesse; páginas de erro/sem resultados.

---

## Implementação — 20/10/2026

Tailwind CSS 4.3.3 e shadcn/ui configurados em `apps/web`. O tema vive em
`apps/web/app/globals.css`; **não existe `tailwind.config.js`** — o Tailwind 4
declara o tema em CSS.

Os componentes ficam em `apps/web/components/ui`, e não em `packages/ui`.
Motivo: só um app consome interface, e o [CLAUDE.md](../CLAUDE.md) condiciona
`packages/ui` a "benefício real". Mover depois é barato; manter um pacote vazio
de propósito, não.

### Contraste medido, não estimado

Os pares abaixo foram calculados pela fórmula da WCAG 2.1. Texto normal exige
4,5:1; texto grande e elementos não textuais, 3:1.

| Par | Razão | Resultado |
|---|---|---|
| `#142B3B` sobre branco | 14,60:1 | passa |
| `#142B3B` sobre `#F5F7F9` | 13,59:1 | passa |
| `#5B6B7A` sobre `#F5F7F9` | 5,11:1 | passa |
| **`#C5A46D` sobre branco** | **2,36:1** | **reprova** |
| **`#C5A46D` sobre `#F5F7F9`** | **2,20:1** | **reprova** |
| `#142B3B` sobre `#C5A46D` | 6,19:1 | passa |
| `#C5A46D` sobre `#1C2A38` | 6,19:1 | passa |
| `#826C48` sobre branco | 5,01:1 | passa |
| `#826C48` sobre `#F5F7F9` | 4,67:1 | passa |

A medição confirma com número o que este documento já dizia em palavras: o
dourado oficial **não pode ser texto em fundo claro** — reprova até no critério
mais frouxo, de texto grande. Ele funciona como fundo (com texto azul-marinho
em cima), como detalhe, e como texto no tema escuro.

Daí nasceu um terceiro tom, que não estava no plano original:

**`--gold-strong: #826C48`** — o dourado escurecido a 66%, preservando o matiz.
É o que se usa quando o dourado precisa ser texto, ícone sozinho ou anel de
foco no tema claro. Sem ele, a única saída seria não usar dourado nesses casos.

### Tokens

Semântica do shadcn/ui, onde `--muted` é **fundo** e `--muted-foreground` é
**texto**. Atenção: no CSS anterior deste projeto, `--muted` era a cor do texto
secundário. A semântica trocou.

- Marca: `--navy`, `--gold`, `--gold-strong`
- Superfícies: `--background`, `--card`, `--popover`, `--muted`
- Ações: `--primary`, `--secondary`, `--accent` (dourado), `--destructive`
- Estados: `--success`, `--warning`, `--destructive` — funcionais, como este
  documento previa
- Estrutura: `--border`, `--input`, `--ring`
- Barra lateral: `--sidebar-*`, azul-marinho no claro e mais escura que o
  conteúdo no escuro

No tema escuro a ação primária **inverte**: o azul-marinho passa a ser o fundo,
e azul sobre azul seria invisível.

### Tema claro e escuro

`next-themes` com classe no `<html>`, padrão **claro**, e a opção de seguir o
sistema disponível como escolha deliberada — não como padrão.

Hoje a preferência fica no navegador. Quando a autenticação existir, ela passa
a vir de `User.themePreference`, e é isso que faz a escolha seguir a pessoa de
um dispositivo para outro.

O alternador renderiza **os dois ícones** e deixa o CSS escolher, em vez de usar
estado com `useEffect`. O servidor não sabe o tema do usuário; a classe `dark`
é escrita antes da hidratação. Sem estado, não há segunda renderização, nem
divergência entre servidor e cliente, nem salto de layout.

### Regras que o código já aplica

- Foco visível por `:focus-visible` com anel de contraste adequado. Nunca
  remover sem oferecer indicador equivalente
- Cor nunca é o único indicador de estado: a borda colorida de um cartão vem
  sempre acompanhada de texto ou etiqueta
- Botão só de ícone exige rótulo acessível, senão o leitor de tela anuncia
  apenas "botão"

### Pendente

- Tipografia: ainda a fonte do sistema. Escolher uma família é decisão de marca,
  que não está tomada
- Componentes instalados até agora: `button`, `card`, `badge`, `input`, `label`.
  Os demais entram junto com as telas que os exigem
- Barra lateral e layout do painel: entram com a autenticação
