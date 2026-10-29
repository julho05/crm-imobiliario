import { config as carregarEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  AVISO_DE_PRIVACIDADE,
  ETAPAS_PADRAO_DO_FUNIL,
  paraSlug,
  type LeadSource,
  type LeadStatus,
  type PropertyPurpose,
  type PropertyStatus,
  type PropertyType,
  type Role,
  type TaskStatus,
  type VisitStatus,
} from '@app/shared';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Dados de desenvolvimento: duas organizacoes povoadas, com equipe, imoveis em
 * estados variados e um funil.
 *
 * ## Para que serve
 *
 * Sem isto, conferir qualquer tela exige cadastrar tudo a mao — e os estados
 * que mais importam nao se alcancam com uma conta so: a lista paginada precisa
 * de mais de vinte imoveis, o botao de editar que **nao** aparece precisa de um
 * imovel de colega, e o isolamento entre organizacoes precisa de duas. Montar
 * isso pelo formulario a cada vez custa mais do que escrever este arquivo.
 *
 * ## Tres guardas, e por que cada uma existe
 *
 * Este comando **apaga** dados antes de inserir. Entao:
 *
 * 1. **Recusa em producao** (`NODE_ENV=production`). Nao ha caso legitimo de
 *    popular producao com "Imobiliaria Aurora".
 * 2. **Recusa banco que nao pareca de desenvolvimento**: o nome tem de ser
 *    `crm_dev`. Um `.env` apontado para outro lugar por engano e o acidente
 *    que custa caro, e o erro de nome e barato.
 * 3. **Recusa host remoto**: so `localhost` e `127.0.0.1`.
 *
 * As tres juntas, e nao uma: cada uma cobre um engano diferente — ambiente
 * errado, banco errado, maquina errada.
 *
 * ## Nada aqui e dado real
 *
 * `CLAUDE.md` proibe dado real de cliente em desenvolvimento. Nomes,
 * enderecos e telefones sao inventados, e os e-mails usam `@exemplo.com`, que
 * e reservado justamente para isso e nao entrega mensagem a ninguem.
 */

/**
 * Carrega o `.env` da raiz do monorepo, procurando para cima.
 *
 * Contar niveis com `../../..` seria mais curto e estaria errado: este arquivo
 * e **compilado** antes de rodar, e o `__dirname` do JavaScript em
 * `dist-seed/prisma/` esta um nivel mais fundo que o do TypeScript em
 * `prisma/`. Procurar pelo marcador funciona nos dois, e continua funcionando
 * se a pasta de saida mudar de lugar.
 */
function carregarEnvDaRaiz(): void {
  let diretorio = __dirname;

  // `dirname` de uma raiz devolve ela mesma: e isso que termina o laco.
  for (let nivel = 0; nivel < 8; nivel += 1) {
    const candidato = resolve(diretorio, '.env');

    if (existsSync(candidato)) {
      carregarEnv({ path: candidato });
      return;
    }

    const acima = dirname(diretorio);

    if (acima === diretorio) {
      break;
    }

    diretorio = acima;
  }

  // Sem `.env` nenhum, a guarda de `DATABASE_URL` recusa logo adiante, com
  // mensagem melhor do que qualquer coisa que se pudesse dizer aqui.
}

carregarEnvDaRaiz();

/** Senha unica de todas as contas do seed. Impressa no fim, de proposito. */
const SENHA = 'Desenvolvimento123';

/**
 * Custo baixo de proposito, e **so** aqui.
 *
 * O `SenhaService` usa o custo de producao, caro por design. Aplicado a treze
 * contas, transformaria o seed numa espera de dezenas de segundos. Estas contas
 * nao protegem nada: existem num banco local, com a senha impressa no terminal.
 */
const CUSTO_DE_DESENVOLVIMENTO = {
  memoryCost: 19456,
  timeCost: 1,
  parallelism: 1,
} as const;

type PessoaDoSeed = {
  nome: string;
  email: string;
  papel: Role;
};

type ImovelDoSeed = {
  titulo: string;
  tipo: PropertyType;
  finalidade: PropertyPurpose;
  status: PropertyStatus;
  publicado: boolean;
  preco?: number;
  precoDeAluguel?: number;
  bairro: string;
  cidade: string;
  estado: string;
  dormitorios?: number;
  banheiros?: number;
  vagas?: number;
  areaTotal?: number;
  /** Indice em `pessoas`, ou `null` para imovel sem responsavel. */
  responsavel: number | null;
};

/**
 * Negociacao do seed.
 *
 * `lead` e `etapa` sao **indices e nomes**, nao identificadores: os ids so
 * existem depois da insercao, e escrever o nome da etapa ("Proposta") deixa a
 * lista legivel e resistente a mudanca de ordem.
 */
type NegociacaoDoSeed = {
  /** Indice em `leads` da mesma organizacao. */
  lead: number;
  /** Nome da etapa, como em ETAPAS_PADRAO_DO_FUNIL. */
  etapa: string;
  /** Indice em `imoveis`, ou `null` para negociacao sem imovel definido. */
  imovel: number | null;
  valorEsperado?: number;
  motivoDaPerda?: string;
};

/**
 * Visita do seed.
 *
 * `dias` e `hora` sao **relativos a hoje**, e nao datas fixas. Data fixa
 * envelhece: num mes, toda a agenda do seed estaria no passado, e a tela que
 * mais importa conferir — "o que tenho esta semana" — nasceria vazia.
 */
type VisitaDoSeed = {
  /** Indice em `imoveis`. Obrigatorio: visita e a alguma coisa. */
  imovel: number;
  /** Indice em `leads`, ou `null` para o interessado que apareceu na porta. */
  cliente: number | null;
  /** Indice em `pessoas`: quem conduz. Obrigatorio no banco. */
  responsavel: number;
  /** Dias a partir de hoje. Negativo e passado. */
  dias: number;
  hora: number;
  duracaoEmHoras?: number;
  situacao: VisitStatus;
  observacoes?: string;
};

/** Tarefa do seed. Os tres vinculos sao opcionais e independentes. */
type TarefaDoSeed = {
  titulo: string;
  /** Indice em `pessoas`. */
  responsavel: number;
  /** Dias a partir de hoje, ou `null` para tarefa sem prazo. */
  dias: number | null;
  hora?: number;
  situacao: TaskStatus;
  /** Indice em `leads`. */
  cliente?: number;
  /** Indice em `negociacoes`. */
  negociacao?: number;
  /** Indice em `imoveis`. */
  imovel?: number;
};

type LeadDoSeed = {
  nomeCompleto: string;
  telefone?: string;
  email?: string;
  origem: LeadSource;
  status: LeadStatus;
  observacoes?: string;
  /** Indice em `pessoas`, ou `null` para a fila de nao atribuidos. */
  responsavel: number | null;
  /** Visitante do catalogo: consentimento registrado. */
  consentiu?: boolean;
};

const AURORA: PessoaDoSeed[] = [
  { nome: 'Helena Vasques', email: 'helena@exemplo.com', papel: 'OWNER' },
  { nome: 'Rafael Dumont', email: 'rafael@exemplo.com', papel: 'ADMIN' },
  { nome: 'Celina Prado', email: 'celina@exemplo.com', papel: 'MANAGER' },
  { nome: 'Tiago Moreno', email: 'tiago@exemplo.com', papel: 'AGENT' },
  { nome: 'Bianca Salles', email: 'bianca@exemplo.com', papel: 'AGENT' },
];

const MERIDIANO: PessoaDoSeed[] = [
  { nome: 'Otavio Lins', email: 'otavio@exemplo.com', papel: 'OWNER' },
  { nome: 'Dora Camargo', email: 'dora@exemplo.com', papel: 'AGENT' },
];

/** Corretor autonomo: organizacao de um membro, nao um tipo de conta. */
const AUTONOMO: PessoaDoSeed[] = [
  { nome: 'Paulo Reis', email: 'paulo@exemplo.com', papel: 'OWNER' },
];

const BAIRROS = [
  ['Pinheiros', 'Sao Paulo', 'SP'],
  ['Vila Mariana', 'Sao Paulo', 'SP'],
  ['Moema', 'Sao Paulo', 'SP'],
  ['Centro', 'Campinas', 'SP'],
  ['Savassi', 'Belo Horizonte', 'MG'],
  ['Botafogo', 'Rio de Janeiro', 'RJ'],
] as const;

/**
 * Vinte e seis imoveis na organizacao grande.
 *
 * O numero nao e estetico: a listagem pagina de vinte em vinte, e com vinte e
 * seis a segunda pagina existe e tem conteudo. Com vinte e um, a segunda pagina
 * teria um item e esconderia erro de contagem.
 */
function imoveisDaAurora(): ImovelDoSeed[] {
  const variacoes: Array<
    Pick<ImovelDoSeed, 'tipo' | 'finalidade' | 'status' | 'publicado'>
  > = [
    {
      tipo: 'APARTMENT',
      finalidade: 'SALE',
      status: 'AVAILABLE',
      publicado: true,
    },
    {
      tipo: 'APARTMENT',
      finalidade: 'RENT',
      status: 'AVAILABLE',
      publicado: true,
    },
    {
      tipo: 'APARTMENT',
      finalidade: 'BOTH',
      status: 'AVAILABLE',
      publicado: true,
    },
    { tipo: 'HOUSE', finalidade: 'SALE', status: 'RESERVED', publicado: true },
    { tipo: 'HOUSE', finalidade: 'SALE', status: 'DRAFT', publicado: false },
    {
      tipo: 'COMMERCIAL',
      finalidade: 'RENT',
      status: 'AVAILABLE',
      publicado: false,
    },
    { tipo: 'LAND', finalidade: 'SALE', status: 'SOLD', publicado: false },
    {
      tipo: 'APARTMENT',
      finalidade: 'RENT',
      status: 'RENTED',
      publicado: false,
    },
    { tipo: 'RURAL', finalidade: 'SALE', status: 'INACTIVE', publicado: false },
  ];

  return Array.from({ length: 26 }, (_, indice) => {
    const variacao = variacoes[indice % variacoes.length];
    const [bairro, cidade, estado] = BAIRROS[indice % BAIRROS.length];
    const precoBase = 320_000 + indice * 47_000;
    const aluguelBase = 1_800 + indice * 230;

    const vende =
      variacao.finalidade === 'SALE' || variacao.finalidade === 'BOTH';
    const aluga =
      variacao.finalidade === 'RENT' || variacao.finalidade === 'BOTH';

    return {
      ...variacao,
      titulo: `${NOME_POR_TIPO[variacao.tipo]} no ${bairro}`,
      preco: vende ? precoBase : undefined,
      precoDeAluguel: aluga ? aluguelBase : undefined,
      bairro,
      cidade,
      estado,
      dormitorios: variacao.tipo === 'LAND' ? undefined : 1 + (indice % 4),
      banheiros: variacao.tipo === 'LAND' ? undefined : 1 + (indice % 3),
      vagas: indice % 3,
      // Um em cada cinco fica sem area, para que a tela seja conferida com o
      // campo ausente — que e o caso que a decisao de 21/10/2026 permitiu.
      areaTotal: indice % 5 === 0 ? undefined : 48 + indice * 7,
      // Distribui entre gerente, os dois corretores e ninguem. O imovel sem
      // responsavel existe para conferir que so MANAGER para cima o edita.
      responsavel: [2, 3, 4, 3, null][indice % 5],
    };
  });
}

/**
 * Dezoito leads na organizacao grande.
 *
 * Os pontos de variacao nao sao decorativos — cada um existe para que uma tela
 * possa ser conferida:
 *
 * - **tres na fila** (`responsavel: null`), para o item B6 e o contador
 * - **dois com o mesmo telefone**, para a sinalizacao de duplicata
 * - **um so com e-mail** e **um so com telefone**, porque o contrato aceita
 *   qualquer um dos dois e a tela precisa lidar com o campo ausente
 * - **origem `PUBLIC_CATALOG` com consentimento**, que e o unico caso em que o
 *   bloco de consentimento aparece na tela
 * - **as cinco situacoes**, para o filtro e para as etiquetas
 */
function leadsDaAurora(): LeadDoSeed[] {
  return [
    {
      nomeCompleto: 'Marcia Albuquerque',
      telefone: '11988881111',
      email: 'marcia.albuquerque@exemplo.com',
      origem: 'PUBLIC_CATALOG',
      status: 'NEW',
      observacoes: 'Chegou pelo anuncio do AP-001. Quer visitar no sabado.',
      responsavel: 3,
      consentiu: true,
    },
    {
      nomeCompleto: 'Joaquim Ferraz',
      telefone: '11988882222',
      origem: 'MANUAL',
      status: 'CONTACTED',
      observacoes: 'Ligou perguntando por imovel de dois dormitorios.',
      responsavel: 3,
    },
    {
      nomeCompleto: 'Leticia Barros',
      email: 'leticia.barros@exemplo.com',
      origem: 'REFERRAL',
      status: 'QUALIFIED',
      observacoes: 'Indicada pela Marcia. Credito pre-aprovado.',
      responsavel: 3,
    },
    {
      nomeCompleto: 'Ricardo Teles',
      telefone: '11988883333',
      email: 'ricardo.teles@exemplo.com',
      origem: 'PUBLIC_CATALOG',
      status: 'CONVERTED',
      observacoes: 'Fechou a CA-001. Documentacao em andamento.',
      responsavel: 3,
      consentiu: true,
    },
    {
      nomeCompleto: 'Sonia Meireles',
      telefone: '11988884444',
      origem: 'MANUAL',
      status: 'DISQUALIFIED',
      observacoes: 'Procura em outra cidade. Sem perfil para a carteira.',
      responsavel: 3,
    },
    {
      nomeCompleto: 'Henrique Pontes',
      telefone: '11988885555',
      email: 'henrique.pontes@exemplo.com',
      origem: 'PUBLIC_CATALOG',
      status: 'NEW',
      responsavel: 4,
      consentiu: true,
    },
    {
      nomeCompleto: 'Vera Lucia Andrade',
      telefone: '11988886666',
      origem: 'MANUAL',
      status: 'CONTACTED',
      observacoes: 'Prefere contato pela manha.',
      responsavel: 4,
    },
    {
      nomeCompleto: 'Fabio Nunes',
      telefone: '11988887777',
      origem: 'IMPORT',
      status: 'NEW',
      observacoes: 'Importado da planilha antiga.',
      responsavel: 4,
    },
    {
      nomeCompleto: 'Camila Rezende',
      telefone: '11988888888',
      email: 'camila.rezende@exemplo.com',
      origem: 'REFERRAL',
      status: 'QUALIFIED',
      responsavel: 4,
    },
    // Mesmo telefone do Joaquim Ferraz, de proposito: e a duplicata que a tela
    // de cadastro sinaliza. Esta pertence a outra pessoa, entao o corretor 3 ve
    // a dele completa e esta como "restrita".
    {
      nomeCompleto: 'Joaquim F. Ferraz',
      telefone: '11988882222',
      origem: 'PUBLIC_CATALOG',
      status: 'NEW',
      observacoes: 'Possivel duplicata do Joaquim Ferraz.',
      responsavel: 4,
      consentiu: true,
    },
    {
      nomeCompleto: 'Beatriz Olinto',
      telefone: '11988889999',
      origem: 'MANUAL',
      status: 'CONTACTED',
      responsavel: 2,
    },
    {
      nomeCompleto: 'Gustavo Pessoa',
      telefone: '11977771111',
      email: 'gustavo.pessoa@exemplo.com',
      origem: 'OTHER',
      status: 'NEW',
      responsavel: 2,
    },
    {
      nomeCompleto: 'Isabel Carvalho',
      telefone: '11977772222',
      origem: 'MANUAL',
      status: 'QUALIFIED',
      responsavel: 0,
    },
    {
      nomeCompleto: 'Nelson Braga',
      telefone: '11977773333',
      origem: 'REFERRAL',
      status: 'CONTACTED',
      responsavel: 1,
    },
    {
      nomeCompleto: 'Priscila Matos',
      telefone: '11977774444',
      origem: 'PUBLIC_CATALOG',
      status: 'NEW',
      observacoes: 'Perguntou pelo AP-003 pelo formulario da vitrine.',
      responsavel: null,
      consentiu: true,
    },
    {
      nomeCompleto: 'Eduardo Simoes',
      telefone: '11977775555',
      email: 'eduardo.simoes@exemplo.com',
      origem: 'PUBLIC_CATALOG',
      status: 'NEW',
      observacoes: 'Chegou pela vitrine. Imovel sem responsavel.',
      responsavel: null,
      consentiu: true,
    },
    {
      nomeCompleto: 'Tereza Gomes',
      telefone: '11977776666',
      origem: 'PUBLIC_CATALOG',
      status: 'NEW',
      responsavel: null,
      consentiu: true,
    },
    {
      nomeCompleto: 'Wagner Ribeiro',
      email: 'wagner.ribeiro@exemplo.com',
      origem: 'OTHER',
      status: 'NEW',
      observacoes: 'So deixou e-mail.',
      responsavel: 2,
    },
  ];
}

/**
 * Doze negociacoes na organizacao grande, espalhadas pelo funil.
 *
 * Os pontos de variacao, de novo escolhidos para que as telas possam ser
 * conferidas:
 *
 * - **as seis etapas ocupadas**, para que nenhuma coluna do quadro nasca vazia
 *   por acidente — e uma delas vazia de proposito, para ver a coluna vazia
 * - **duas fechadas** (ganha e perdida), que **nao** aparecem no funil por
 *   padrao e exigem o filtro de fechadas
 * - **uma sem imovel**, que e o caso de "procuro dois quartos na zona sul"
 * - **uma sem valor esperado**, para a coluna somar com registro ausente
 * - **negociacoes de corretores diferentes**, para que o recorte por
 *   responsavel do lead seja visivel ao entrar como cada um
 */
function negociacoesDaAurora(): NegociacaoDoSeed[] {
  return [
    // Do Tiago (lead 1, 2, 3): o funil dele tem quatro etapas ocupadas.
    { lead: 0, etapa: 'Novo', imovel: 0, valorEsperado: 420_000 },
    { lead: 1, etapa: 'Contato feito', imovel: 1, valorEsperado: 467_000 },
    { lead: 2, etapa: 'Visita agendada', imovel: 2, valorEsperado: 514_000 },
    { lead: 2, etapa: 'Proposta', imovel: 3, valorEsperado: 561_000 },
    // Fechada com ganho: fora do funil por padrao.
    { lead: 3, etapa: 'Fechado', imovel: 4, valorEsperado: 608_000 },
    // Fechada com perda: tambem fora, e com motivo, que o contrato exige.
    {
      lead: 4,
      etapa: 'Perdido',
      imovel: 5,
      valorEsperado: 655_000,
      motivoDaPerda: 'Procurava em outra cidade.',
    },
    // Da Bianca (leads 5 a 9).
    { lead: 5, etapa: 'Novo', imovel: 6, valorEsperado: 702_000 },
    { lead: 6, etapa: 'Contato feito', imovel: null, valorEsperado: 350_000 },
    // Sem valor esperado: a coluna soma com registro ausente.
    { lead: 8, etapa: 'Proposta', imovel: 7 },
    // Da Celina (lead 10, 11) e do Owner/Admin (12, 13).
    { lead: 10, etapa: 'Visita agendada', imovel: 8, valorEsperado: 749_000 },
    { lead: 12, etapa: 'Contato feito', imovel: 9, valorEsperado: 796_000 },
    { lead: 13, etapa: 'Novo', imovel: null, valorEsperado: 843_000 },
  ];
}

/**
 * Quinze visitas na organizacao grande.
 *
 * Os pontos de variacao, cada um para que uma tela possa ser conferida:
 *
 * - **visitas em cinco periodos** — semana passada, ontem, hoje, esta semana e
 *   mes que vem —, porque a agenda abre na semana e as setas precisam ter para
 *   onde levar
 * - **duas hoje**, que e o unico jeito de ver o agrupamento por dia com mais de
 *   uma linha
 * - **as cinco situacoes**, incluindo a cancelada e a "nao compareceu", que sao
 *   as que a lista mostra esmaecidas
 * - **uma sem cliente**, o interessado que apareceu no imovel sem cadastro
 * - **o caso que forcou a decisao de 21/10/2026**: a visita do cliente da
 *   Bianca conduzida pelo Tiago. E o unico registro do seed que prova a
 *   segunda porta de visibilidade — entrando como Tiago, a visita aparece com
 *   o nome e o telefone da cliente, e **sem** link para a ficha dela, porque
 *   `/painel/leads/<id>` responde 404 para ele. Sem esta linha no banco, a
 *   decisao inteira nao teria como ser vista funcionando
 */
function visitasDaAurora(): VisitaDoSeed[] {
  return [
    // Semana passada e ontem: historico, para a seta de "periodo anterior".
    {
      imovel: 4,
      cliente: 3,
      responsavel: 3,
      dias: -8,
      hora: 10,
      situacao: 'DONE',
      observacoes: 'Cliente gostou. Vai conversar com a esposa.',
    },
    {
      imovel: 0,
      cliente: 0,
      responsavel: 3,
      dias: -1,
      hora: 14,
      situacao: 'DONE',
    },
    {
      imovel: 1,
      cliente: 1,
      responsavel: 3,
      dias: -1,
      hora: 17,
      situacao: 'NO_SHOW',
      observacoes: 'Nao apareceu e nao avisou.',
    },
    // Hoje, duas: uma confirmada de manha e uma a tarde sem cliente.
    {
      imovel: 2,
      cliente: 2,
      responsavel: 3,
      dias: 0,
      hora: 9,
      situacao: 'CONFIRMED',
      observacoes: 'Confirmou por telefone. Chave na portaria.',
    },
    {
      imovel: 3,
      cliente: null,
      responsavel: 4,
      dias: 0,
      hora: 16,
      situacao: 'SCHEDULED',
      observacoes: 'Interessado que passou em frente ao imovel. Sem cadastro.',
    },
    {
      imovel: 6,
      cliente: 5,
      responsavel: 4,
      dias: 1,
      hora: 11,
      situacao: 'SCHEDULED',
    },
    // A visita que prova a segunda porta: cliente da Bianca (lead 6),
    // conduzida pelo Tiago (pessoa 3) porque ela nao pode no dia.
    {
      imovel: 7,
      cliente: 6,
      responsavel: 3,
      dias: 2,
      hora: 10,
      duracaoEmHoras: 2,
      situacao: 'CONFIRMED',
      observacoes:
        'Cliente da Bianca. Ela nao pode neste dia e pediu ao Tiago para conduzir.',
    },
    {
      imovel: 8,
      cliente: 10,
      responsavel: 2,
      dias: 3,
      hora: 15,
      situacao: 'CONFIRMED',
    },
    {
      imovel: 9,
      cliente: 12,
      responsavel: 1,
      dias: 4,
      hora: 9,
      situacao: 'CANCELED',
      observacoes: 'Cliente desmarcou: viagem de trabalho.',
    },
    {
      imovel: 10,
      cliente: 13,
      responsavel: 0,
      dias: 5,
      hora: 18,
      situacao: 'SCHEDULED',
    },
    {
      imovel: 11,
      cliente: 7,
      responsavel: 4,
      dias: 6,
      hora: 10,
      situacao: 'SCHEDULED',
    },
    {
      imovel: 12,
      cliente: 8,
      responsavel: 4,
      dias: 9,
      hora: 14,
      situacao: 'SCHEDULED',
    },
    {
      imovel: 13,
      cliente: 2,
      responsavel: 3,
      dias: 12,
      hora: 11,
      situacao: 'SCHEDULED',
    },
    // Mes que vem: so aparece no periodo "mes", e so depois de avancar uma vez.
    {
      imovel: 14,
      cliente: 9,
      responsavel: 4,
      dias: 34,
      hora: 10,
      situacao: 'SCHEDULED',
    },
    {
      imovel: 15,
      cliente: 11,
      responsavel: 2,
      dias: 38,
      hora: 16,
      situacao: 'SCHEDULED',
    },
  ];
}

/**
 * Catorze tarefas na organizacao grande.
 *
 * - **quatro vencidas**, para o contador do painel e a aba "Vencidas". Vencida
 *   e **aberta com prazo no passado**: a concluida com atraso nao conta, e
 *   existe aqui uma dessas para provar a diferenca
 * - **duas sem prazo**, que vao para o fim da lista e nunca vencem
 * - **uma concluida e uma cancelada**, para a aba de concluidas e para a linha
 *   esmaecida
 * - **os tres vinculos** — cliente, negociacao e imovel —, mais tarefas soltas
 */
function tarefasDaAurora(): TarefaDoSeed[] {
  return [
    {
      titulo: 'Levar a contraproposta assinada',
      responsavel: 3,
      dias: -4,
      hora: 17,
      situacao: 'OPEN',
      cliente: 0,
      negociacao: 0,
    },
    {
      titulo: 'Pedir a matricula atualizada no cartorio',
      responsavel: 3,
      dias: -2,
      hora: 12,
      situacao: 'OPEN',
      imovel: 0,
    },
    {
      titulo: 'Devolver ligacao para o comprador',
      responsavel: 4,
      dias: -1,
      hora: 18,
      situacao: 'OPEN',
      cliente: 5,
    },
    {
      titulo: 'Conferir o laudo de vistoria',
      responsavel: 2,
      dias: -1,
      hora: 9,
      situacao: 'OPEN',
    },
    // Concluida **depois** do prazo: nao esta vencida, esta concluida.
    {
      titulo: 'Enviar as fotos novas para o proprietario',
      responsavel: 3,
      dias: -3,
      hora: 15,
      situacao: 'DONE',
      cliente: 2,
    },
    {
      titulo: 'Confirmar a chave com o sindico',
      responsavel: 3,
      dias: 0,
      hora: 19,
      situacao: 'OPEN',
      cliente: 1,
    },
    {
      titulo: 'Montar a proposta para a Leticia',
      responsavel: 3,
      dias: 1,
      hora: 11,
      situacao: 'OPEN',
      cliente: 2,
      negociacao: 3,
    },
    {
      titulo: 'Agendar avaliacao do imovel da esquina',
      responsavel: 4,
      dias: 2,
      hora: 14,
      situacao: 'OPEN',
      imovel: 6,
    },
    {
      titulo: 'Retomar contato com quem visitou e nao voltou',
      responsavel: 4,
      dias: 5,
      hora: 10,
      situacao: 'OPEN',
      negociacao: 6,
    },
    {
      titulo: 'Revisar os anuncios que estao fora do ar',
      responsavel: 1,
      dias: 7,
      hora: 15,
      situacao: 'OPEN',
    },
    {
      titulo: 'Fechar a escala de plantao do fim de semana',
      responsavel: 2,
      dias: 10,
      hora: 17,
      situacao: 'OPEN',
    },
    {
      titulo: 'Preparar o material da feira de imoveis',
      responsavel: 0,
      dias: null,
      situacao: 'OPEN',
    },
    {
      titulo: 'Estudar a mudanca na taxa de financiamento',
      responsavel: 3,
      dias: null,
      situacao: 'OPEN',
    },
    {
      titulo: 'Reservar a sala de reuniao para quinta',
      responsavel: 4,
      dias: -6,
      hora: 10,
      situacao: 'CANCELED',
    },
  ];
}

/**
 * Hoje mais um deslocamento, no fuso de quem roda o seed.
 *
 * Local de proposito: a agenda da tela recorta o periodo pelo relogio de quem
 * olha, e uma visita gravada "as 9h UTC" apareceria as 6h da manha para quem
 * esta em Brasilia — horario em que ninguem visita imovel.
 */
function daqui(dias: number, hora: number, minuto = 0): Date {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  data.setHours(hora, minuto, 0, 0);

  return data;
}

const NOME_POR_TIPO: Record<PropertyType, string> = {
  APARTMENT: 'Apartamento',
  HOUSE: 'Casa',
  LAND: 'Terreno',
  COMMERCIAL: 'Sala comercial',
  RURAL: 'Chacara',
  OTHER: 'Imovel',
};

const PREFIXO_POR_TIPO: Record<PropertyType, string> = {
  APARTMENT: 'AP',
  HOUSE: 'CA',
  LAND: 'TE',
  COMMERCIAL: 'CO',
  RURAL: 'RU',
  OTHER: 'IM',
};

async function main() {
  const url = conferirQueEhSeguro();
  const prisma = clienteDe(url);

  try {
    await prisma.$connect();

    console.log('Limpando o banco de desenvolvimento...');
    await limpar(prisma);

    const senhaHash = await hash(SENHA, CUSTO_DE_DESENVOLVIMENTO);

    console.log(
      'Criando Imobiliaria Aurora (5 pessoas, 26 imoveis, 18 leads, 12 negociacoes, 15 visitas, 14 tarefas)...',
    );
    const aurora = await criarOrganizacao(prisma, {
      nome: 'Imobiliaria Aurora',
      slug: 'aurora',
      tipo: 'AGENCY',
      pessoas: AURORA,
      senhaHash,
      imoveis: imoveisDaAurora(),
      leads: leadsDaAurora(),
      negociacoes: negociacoesDaAurora(),
      visitas: visitasDaAurora(),
      tarefas: tarefasDaAurora(),
      vitrine: {
        apresentacao:
          'Ha 15 anos ajudando familias a encontrar o imovel certo.\nAtendimento de segunda a sabado.',
        telefone: '(11) 3000-1000',
        email: 'contato@exemplo.com',
      },
    });

    console.log(
      'Criando Meridiano Imoveis (2 pessoas, 4 imoveis, 4 leads, 2 negociacoes, 2 visitas, 2 tarefas)...',
    );
    await criarOrganizacao(prisma, {
      nome: 'Meridiano Imoveis',
      slug: 'meridiano',
      tipo: 'AGENCY',
      pessoas: MERIDIANO,
      senhaHash,
      imoveis: [
        {
          titulo: 'Cobertura na Savassi',
          tipo: 'APARTMENT',
          finalidade: 'SALE',
          status: 'AVAILABLE',
          publicado: true,
          preco: 1_250_000,
          bairro: 'Savassi',
          cidade: 'Belo Horizonte',
          estado: 'MG',
          dormitorios: 4,
          banheiros: 3,
          vagas: 2,
          areaTotal: 210,
          responsavel: 1,
        },
        {
          titulo: 'Loja de rua no Centro',
          tipo: 'COMMERCIAL',
          finalidade: 'RENT',
          status: 'AVAILABLE',
          publicado: true,
          precoDeAluguel: 7_400,
          bairro: 'Centro',
          cidade: 'Belo Horizonte',
          estado: 'MG',
          areaTotal: 95,
          responsavel: 0,
        },
        {
          titulo: 'Casa com quintal no Bairro Novo',
          tipo: 'HOUSE',
          finalidade: 'BOTH',
          status: 'AVAILABLE',
          publicado: false,
          preco: 690_000,
          precoDeAluguel: 4_200,
          bairro: 'Bairro Novo',
          cidade: 'Contagem',
          estado: 'MG',
          dormitorios: 3,
          banheiros: 2,
          vagas: 2,
          areaTotal: 160,
          responsavel: 1,
        },
        {
          titulo: 'Terreno em condominio fechado',
          tipo: 'LAND',
          finalidade: 'SALE',
          status: 'DRAFT',
          publicado: false,
          preco: 240_000,
          bairro: 'Alphaville',
          cidade: 'Nova Lima',
          estado: 'MG',
          areaTotal: 450,
          responsavel: null,
        },
      ],
      leads: [
        {
          nomeCompleto: 'Alice Damasceno',
          telefone: '31988881111',
          email: 'alice.damasceno@exemplo.com',
          origem: 'PUBLIC_CATALOG',
          status: 'NEW',
          responsavel: 1,
          consentiu: true,
        },
        {
          nomeCompleto: 'Bruno Caetano',
          telefone: '31988882222',
          origem: 'MANUAL',
          status: 'CONTACTED',
          responsavel: 0,
        },
        {
          nomeCompleto: 'Carla Pimenta',
          telefone: '31988883333',
          origem: 'PUBLIC_CATALOG',
          status: 'NEW',
          responsavel: null,
          consentiu: true,
        },
        // Mesmo telefone de um lead da Aurora, de proposito: prova que a
        // deteccao de duplicata nao atravessa organizacao.
        {
          nomeCompleto: 'Homonimo de outra organizacao',
          telefone: '11988882222',
          origem: 'MANUAL',
          status: 'NEW',
          responsavel: 1,
        },
      ],
      negociacoes: [
        { lead: 0, etapa: 'Proposta', imovel: 0, valorEsperado: 1_190_000 },
        { lead: 1, etapa: 'Contato feito', imovel: 1, valorEsperado: 88_800 },
      ],
      visitas: [
        {
          imovel: 0,
          cliente: 0,
          responsavel: 1,
          dias: 0,
          hora: 11,
          situacao: 'CONFIRMED',
        },
        {
          imovel: 1,
          cliente: 1,
          responsavel: 0,
          dias: 2,
          hora: 15,
          situacao: 'SCHEDULED',
        },
      ],
      tarefas: [
        {
          titulo: 'Reenviar o contrato para assinatura',
          responsavel: 1,
          dias: -2,
          hora: 16,
          situacao: 'OPEN',
          cliente: 0,
        },
        {
          titulo: 'Atualizar as fotos da cobertura',
          responsavel: 0,
          dias: null,
          situacao: 'OPEN',
          imovel: 0,
        },
      ],
    });

    console.log(
      'Criando corretor autonomo (1 pessoa, 3 imoveis, 2 leads, 1 negociacao, 1 visita, 2 tarefas)...',
    );
    await criarOrganizacao(prisma, {
      nome: 'Paulo Reis Imoveis',
      slug: 'paulo-reis',
      // Corretor autonomo e uma organizacao de um membro, e nao um tipo de
      // conta (decisao de 19/10/2026). O `kind` SOLO so muda a interface.
      tipo: 'SOLO',
      pessoas: AUTONOMO,
      senhaHash,
      vitrine: {
        apresentacao: 'Corretor autonomo, CRECI 00000-F. Atendo pelo WhatsApp.',
        telefone: '(11) 98000-2000',
        // Diferente do e-mail de login, de proposito: o contato publico e o
        // que o corretor escolhe divulgar, e nao precisa ser a conta.
        email: 'atendimento.paulo@exemplo.com',
      },
      imoveis: [
        {
          titulo: 'Apartamento compacto perto do metro',
          tipo: 'APARTMENT',
          finalidade: 'RENT',
          status: 'AVAILABLE',
          publicado: true,
          precoDeAluguel: 2_300,
          bairro: 'Santana',
          cidade: 'Sao Paulo',
          estado: 'SP',
          dormitorios: 1,
          banheiros: 1,
          vagas: 0,
          areaTotal: 38,
          responsavel: 0,
        },
        {
          titulo: 'Casa de vila reformada',
          tipo: 'HOUSE',
          finalidade: 'SALE',
          status: 'AVAILABLE',
          publicado: true,
          preco: 540_000,
          bairro: 'Vila Madalena',
          cidade: 'Sao Paulo',
          estado: 'SP',
          dormitorios: 2,
          banheiros: 2,
          vagas: 1,
          areaTotal: 85,
          responsavel: 0,
        },
        {
          titulo: 'Sala comercial para consultorio',
          tipo: 'COMMERCIAL',
          finalidade: 'RENT',
          status: 'DRAFT',
          publicado: false,
          precoDeAluguel: 3_100,
          bairro: 'Paraiso',
          cidade: 'Sao Paulo',
          estado: 'SP',
          areaTotal: 42,
          responsavel: 0,
        },
      ],
      // O corretor autonomo e OWNER de uma organizacao de um membro: tem
      // escopo ORG e ve os proprios leads por serem os unicos que existem.
      leads: [
        {
          nomeCompleto: 'Denise Portela',
          telefone: '11966661111',
          origem: 'PUBLIC_CATALOG',
          status: 'CONTACTED',
          observacoes: 'Interessada na casa de vila.',
          responsavel: 0,
          consentiu: true,
        },
        {
          nomeCompleto: 'Elias Tavares',
          email: 'elias.tavares@exemplo.com',
          origem: 'REFERRAL',
          status: 'NEW',
          responsavel: 0,
        },
      ],
      negociacoes: [
        {
          lead: 0,
          etapa: 'Visita agendada',
          imovel: 1,
          valorEsperado: 540_000,
        },
      ],
      visitas: [
        {
          imovel: 1,
          cliente: 0,
          responsavel: 0,
          dias: 1,
          hora: 10,
          situacao: 'CONFIRMED',
          observacoes: 'Levar a planta impressa.',
        },
      ],
      tarefas: [
        {
          titulo: 'Confirmar documentacao do financiamento',
          responsavel: 0,
          dias: -1,
          hora: 14,
          situacao: 'OPEN',
          negociacao: 0,
        },
        {
          titulo: 'Responder o e-mail do Elias',
          responsavel: 0,
          dias: 0,
          hora: 18,
          situacao: 'OPEN',
          cliente: 1,
        },
      ],
    });

    // A pessoa com dois vinculos: um usuario, duas organizacoes. E com ela que
    // se confere o seletor de organizacao ativa, que **so** aparece neste caso.
    const dora = await prisma.user.findUniqueOrThrow({
      where: { email: 'dora@exemplo.com' },
      select: { id: true },
    });

    await prisma.membership.create({
      data: { userId: dora.id, organizationId: aurora, role: 'AGENT' },
    });

    console.log('Pronto.\n');
    imprimirResumo();
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * As tres guardas. Devolve a URL quando for seguro; encerra o processo quando
 * nao for.
 *
 * Encerra com `exit(1)` em vez de lancar: a mensagem precisa ser lida por
 * quem rodou o comando, e um rastro de pilha do Node esconderia o motivo no
 * meio do ruido.
 */
function conferirQueEhSeguro(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    recusar('DATABASE_URL nao definida. Veja o .env.example.');
  }

  if (process.env.NODE_ENV === 'production') {
    recusar(
      'NODE_ENV=production. Este comando apaga dados e nunca roda em producao.',
    );
  }

  let endereco: URL;

  try {
    endereco = new URL(url);
  } catch {
    recusar('DATABASE_URL nao e uma URL valida.');
  }

  const banco = endereco.pathname.replace(/^\//, '');

  if (banco !== 'crm_dev') {
    recusar(
      `O seed so roda no banco "crm_dev". DATABASE_URL aponta para "${banco}".`,
    );
  }

  if (!['localhost', '127.0.0.1'].includes(endereco.hostname)) {
    recusar(
      `O seed so roda em banco local. DATABASE_URL aponta para "${endereco.hostname}".`,
    );
  }

  return url;
}

function recusar(motivo: string): never {
  console.error(`\n  Seed recusado: ${motivo}\n`);
  process.exit(1);
}

function clienteDe(url: string): PrismaClient {
  const endereco = new URL(url);

  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: endereco.hostname,
      port: endereco.port ? Number(endereco.port) : 3306,
      user: decodeURIComponent(endereco.username),
      password: decodeURIComponent(endereco.password),
      database: endereco.pathname.replace(/^\//, ''),
      // Mesmo motivo do PrismaService: MySQL 8 com caching_sha2_password
      // precisa da chave publica em conexao sem TLS. Aqui e sempre local, e as
      // guardas acima ja garantiram isso.
      allowPublicKeyRetrieval: true,
      connectionLimit: 5,
    }),
  });
}

/**
 * Ordem de limpeza: das tabelas que **apontam** para as outras em direcao as
 * apontadas. A mesma de `test/apoio/banco-de-teste.ts`, e pelo mesmo motivo —
 * chave estrangeira com `ON DELETE RESTRICT` recusa apagar o pai antes do
 * filho, entao trocar duas linhas quebra a limpeza.
 */
const ORDEM_DE_LIMPEZA = [
  'activity',
  'task',
  'visit',
  'deal',
  'inquiry',
  'lead',
  'pipelineStage',
  'propertyMedia',
  'propertyFeature',
  'property',
  'invitation',
  'organizationSlugHistory',
  'session',
  'passwordResetToken',
  'emailVerificationToken',
  'platformAdmin',
  'membership',
  'organization',
  'user',
] as const;

async function limpar(prisma: PrismaClient): Promise<void> {
  for (const tabela of ORDEM_DE_LIMPEZA) {
    await (
      prisma[tabela] as unknown as { deleteMany: () => Promise<unknown> }
    ).deleteMany();
  }
}

async function criarOrganizacao(
  prisma: PrismaClient,
  dados: {
    nome: string;
    slug: string;
    tipo: 'AGENCY' | 'SOLO';
    pessoas: PessoaDoSeed[];
    senhaHash: string;
    imoveis: ImovelDoSeed[];
    leads?: LeadDoSeed[];
    negociacoes?: NegociacaoDoSeed[];
    visitas?: VisitaDoSeed[];
    tarefas?: TarefaDoSeed[];
    /**
     * O que a vitrine publica (item C1). Opcional de proposito: ainda nao ha
     * tela que preencha esses campos, e uma organizacao real comeca sem eles —
     * a Meridiano fica assim para que a vitrine sem contato seja exercitada.
     */
    vitrine?: { apresentacao: string; telefone: string; email: string };
  },
): Promise<string> {
  const organizacao = await prisma.organization.create({
    data: {
      name: dados.nome,
      slug: dados.slug,
      kind: dados.tipo,
      publicBio: dados.vitrine?.apresentacao,
      publicPhone: dados.vitrine?.telefone,
      publicEmail: dados.vitrine?.email,
    },
    select: { id: true },
  });

  // As seis etapas do funil, da mesma lista que o POST /cadastro usa.
  await prisma.pipelineStage.createMany({
    data: ETAPAS_PADRAO_DO_FUNIL.map((etapa) => ({
      organizationId: organizacao.id,
      name: etapa.nome,
      position: etapa.posicao,
      isWon: etapa.isWon,
      isLost: etapa.isLost,
    })),
  });

  const vinculos: string[] = [];

  for (const pessoa of dados.pessoas) {
    const usuario = await prisma.user.create({
      data: {
        name: pessoa.nome,
        email: pessoa.email,
        passwordHash: dados.senhaHash,
        // Verificado: o seed existe para encurtar caminho, e conferir e-mail a
        // mao em treze contas nao ensina nada.
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });

    const vinculo = await prisma.membership.create({
      data: {
        userId: usuario.id,
        organizationId: organizacao.id,
        role: pessoa.papel,
      },
      select: { id: true },
    });

    vinculos.push(vinculo.id);
  }

  const contadorPorTipo = new Map<PropertyType, number>();
  const idsDeImoveis: string[] = [];

  for (const imovel of dados.imoveis) {
    const proximo = (contadorPorTipo.get(imovel.tipo) ?? 0) + 1;
    contadorPorTipo.set(imovel.tipo, proximo);

    const codigo = `${PREFIXO_POR_TIPO[imovel.tipo]}-${String(proximo).padStart(3, '0')}`;

    const imovelCriado = await prisma.property.create({
      select: { id: true },
      data: {
        organizationId: organizacao.id,
        code: codigo,
        // Mesma regra do servico: o codigo no fim garante a unicidade do slug,
        // porque ele ja e unico por organizacao.
        slug: `${paraSlug(imovel.titulo)}-${codigo.toLowerCase()}`,
        title: imovel.titulo,
        description:
          'Imovel de demonstracao, criado pelo seed de desenvolvimento. ' +
          'Nenhum dado aqui corresponde a imovel, pessoa ou endereco real.',
        type: imovel.tipo,
        purpose: imovel.finalidade,
        status: imovel.status,
        price: imovel.preco,
        rentPrice: imovel.precoDeAluguel,
        bedrooms: imovel.dormitorios,
        bathrooms: imovel.banheiros,
        parkingSpots: imovel.vagas,
        areaTotal: imovel.areaTotal,
        state: imovel.estado,
        city: imovel.cidade,
        neighborhood: imovel.bairro,
        publishedAt: imovel.publicado ? new Date() : null,
        ownerMemberId:
          imovel.responsavel === null ? null : vinculos[imovel.responsavel],
      },
    });

    idsDeImoveis.push(imovelCriado.id);
  }

  const idsDeLeads: string[] = [];

  for (const lead of dados.leads ?? []) {
    const leadCriado = await prisma.lead.create({
      select: { id: true },
      data: {
        organizationId: organizacao.id,
        fullName: lead.nomeCompleto,
        phone: lead.telefone,
        email: lead.email,
        source: lead.origem,
        status: lead.status,
        notes: lead.observacoes,
        assignedMemberId:
          lead.responsavel === null ? null : vinculos[lead.responsavel],
        // Consentimento so existe para quem chegou pela vitrine: e prova do
        // visitante, montada pelo servidor no envio do formulario. Lead
        // digitado a mao pelo corretor nao tem consentimento a registrar, e
        // inventar um aqui criaria prova falsa no banco de desenvolvimento.
        ...(lead.consentiu
          ? {
              consentGivenAt: new Date(),
              // A versao que existe. Ate o C5 era uma data inventada, que nao
              // correspondia a texto nenhum.
              privacyNoticeVersion: AVISO_DE_PRIVACIDADE.versao,
              // Hash, nunca o IP. O valor e inventado e tem o formato certo.
              consentIpHash: 'seed-sem-ip-real',
            }
          : {}),
      },
    });

    idsDeLeads.push(leadCriado.id);
  }

  const idsDeNegociacoes = await criarNegociacoes(prisma, {
    organizationId: organizacao.id,
    negociacoes: dados.negociacoes ?? [],
    idsDeLeads,
    idsDeImoveis,
  });

  await criarVisitas(prisma, {
    organizationId: organizacao.id,
    visitas: dados.visitas ?? [],
    idsDeImoveis,
    idsDeLeads,
    vinculos,
  });

  await criarTarefas(prisma, {
    organizationId: organizacao.id,
    tarefas: dados.tarefas ?? [],
    idsDeImoveis,
    idsDeLeads,
    idsDeNegociacoes,
    vinculos,
  });

  return organizacao.id;
}

/**
 * As negociacoes, depois dos leads e dos imoveis.
 *
 * Precisa vir depois porque referencia os dois, e os ids so existem apos a
 * insercao. Carrega as etapas por nome, numa consulta so — nao uma por
 * negociacao.
 */
async function criarNegociacoes(
  prisma: PrismaClient,
  dados: {
    organizationId: string;
    negociacoes: NegociacaoDoSeed[];
    idsDeLeads: string[];
    idsDeImoveis: string[];
  },
): Promise<string[]> {
  if (dados.negociacoes.length === 0) {
    return [];
  }

  const etapas = await prisma.pipelineStage.findMany({
    where: { organizationId: dados.organizationId },
    select: { id: true, name: true, isWon: true, isLost: true },
  });

  const porNome = new Map(etapas.map((etapa) => [etapa.name, etapa]));
  const criadas: string[] = [];

  for (const negociacao of dados.negociacoes) {
    const etapa = porNome.get(negociacao.etapa);

    if (!etapa) {
      throw new Error(
        `Etapa "${negociacao.etapa}" nao existe. Confira ETAPAS_PADRAO_DO_FUNIL.`,
      );
    }

    const leadId = dados.idsDeLeads[negociacao.lead];

    if (!leadId) {
      throw new Error(
        `Negociacao aponta para o lead ${negociacao.lead}, que nao existe nesta organizacao.`,
      );
    }

    // Quem responde pelo lead responde pela negociacao: e o unico valor que
    // mantem "quem conduz" e "quem enxerga" coerentes, como o servico faz.
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
      select: { assignedMemberId: true },
    });

    const fechada = etapa.isWon || etapa.isLost;

    const criada = await prisma.deal.create({
      select: { id: true },
      data: {
        organizationId: dados.organizationId,
        leadId,
        propertyId:
          negociacao.imovel === null
            ? null
            : dados.idsDeImoveis[negociacao.imovel],
        stageId: etapa.id,
        assignedMemberId: lead.assignedMemberId,
        expectedAmount: negociacao.valorEsperado,
        // Derivado da etapa, como na API: etapa de ganho ou perda fecha.
        closedAt: fechada ? new Date() : null,
        lostReason: etapa.isLost ? negociacao.motivoDaPerda : null,
      },
    });

    criadas.push(criada.id);
  }

  return criadas;
}

/**
 * As visitas, depois dos imoveis e dos leads.
 *
 * Quem conduz vem do indice declarado, e **nao** do responsavel pelo cliente:
 * e justamente a divergencia entre os dois que produz o caso da segunda porta
 * de visibilidade — o Tiago conduzindo a visita da cliente da Bianca.
 */
async function criarVisitas(
  prisma: PrismaClient,
  dados: {
    organizationId: string;
    visitas: VisitaDoSeed[];
    idsDeImoveis: string[];
    idsDeLeads: string[];
    vinculos: string[];
  },
): Promise<void> {
  for (const visita of dados.visitas) {
    const propertyId = dados.idsDeImoveis[visita.imovel];

    if (!propertyId) {
      throw new Error(
        `Visita aponta para o imovel ${visita.imovel}, que nao existe nesta organizacao.`,
      );
    }

    const inicio = daqui(visita.dias, visita.hora);
    const fim = new Date(
      inicio.getTime() + (visita.duracaoEmHoras ?? 1) * 60 * 60 * 1000,
    );

    await prisma.visit.create({
      data: {
        organizationId: dados.organizationId,
        propertyId,
        leadId:
          visita.cliente === null ? null : dados.idsDeLeads[visita.cliente],
        assignedMemberId: dados.vinculos[visita.responsavel],
        startsAt: inicio,
        endsAt: fim,
        status: visita.situacao,
        notes: visita.observacoes,
      },
    });
  }
}

/**
 * As tarefas, por ultimo: elas podem apontar para negociacao, que depende de
 * lead e imovel.
 *
 * `completedAt` sai da situacao, como na API: `DONE` fecha, e qualquer outra
 * deixa nulo. Gravar data de conclusao numa tarefa aberta criaria no banco um
 * estado que o servico nunca produz — e um dia alguem o encontraria e trataria
 * como possivel.
 */
async function criarTarefas(
  prisma: PrismaClient,
  dados: {
    organizationId: string;
    tarefas: TarefaDoSeed[];
    idsDeImoveis: string[];
    idsDeLeads: string[];
    idsDeNegociacoes: string[];
    vinculos: string[];
  },
): Promise<void> {
  for (const tarefa of dados.tarefas) {
    const prazo =
      tarefa.dias === null ? null : daqui(tarefa.dias, tarefa.hora ?? 12);

    await prisma.task.create({
      data: {
        organizationId: dados.organizationId,
        title: tarefa.titulo,
        assignedMemberId: dados.vinculos[tarefa.responsavel],
        dueAt: prazo,
        status: tarefa.situacao,
        completedAt: tarefa.situacao === 'DONE' ? new Date() : null,
        leadId:
          tarefa.cliente === undefined
            ? null
            : dados.idsDeLeads[tarefa.cliente],
        dealId:
          tarefa.negociacao === undefined
            ? null
            : dados.idsDeNegociacoes[tarefa.negociacao],
        propertyId:
          tarefa.imovel === undefined
            ? null
            : dados.idsDeImoveis[tarefa.imovel],
      },
    });
  }
}

function imprimirResumo(): void {
  const linhas = [
    [
      'Imobiliaria Aurora',
      '26 im./18 leads',
      '12 negociacoes · 3 leads na fila',
    ],
    ['  helena@exemplo.com', 'OWNER', 've e edita tudo, exclui'],
    ['  rafael@exemplo.com', 'ADMIN', 've e edita tudo, exclui'],
    ['  celina@exemplo.com', 'MANAGER', 've e edita tudo, NAO exclui'],
    ['  tiago@exemplo.com', 'AGENT', '5 leads; conduz visita da Bianca'],
    ['  bianca@exemplo.com', 'AGENT', '5 leads; ve so os dela'],
    ['Meridiano Imoveis', '4 im./4 leads', '2 negociacoes · 1 lead na fila'],
    ['  otavio@exemplo.com', 'OWNER', ''],
    ['  dora@exemplo.com', 'AGENT', 'tambem e AGENT na Aurora'],
    ['Paulo Reis Imoveis', '3 im./2 leads', '1 negociacao · corretor autonomo'],
    ['  paulo@exemplo.com', 'OWNER', 'organizacao de um membro'],
  ];

  console.log(`  Senha de todas as contas: ${SENHA}\n`);

  for (const [quem, o_que, nota] of linhas) {
    console.log(`  ${quem.padEnd(24)} ${o_que.padEnd(12)} ${nota}`);
  }

  console.log(
    '\n  Entre com dora@exemplo.com para ver o seletor de organizacao:\n' +
      '  ele aparece somente para quem tem mais de um vinculo ativo.\n',
  );

  console.log(
    '  Entre com tiago@exemplo.com e abra a agenda daqui a dois dias:\n' +
      '  ele conduz a visita de uma cliente da Bianca. Ve o nome e o telefone\n' +
      '  dela, e **nao** ve o link para a ficha — a decisao de 21/10/2026.\n',
  );

  console.log(
    '  Vitrines publicas, sem login: /o/aurora, /o/meridiano e /o/paulo-reis.\n' +
      '  A Meridiano nao tem apresentacao nem contato, como uma conta nova.\n',
  );
}

void main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
