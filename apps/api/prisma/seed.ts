import { config as carregarEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hash } from '@node-rs/argon2';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  ETAPAS_PADRAO_DO_FUNIL,
  paraSlug,
  type LeadSource,
  type LeadStatus,
  type PropertyPurpose,
  type PropertyStatus,
  type PropertyType,
  type Role,
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
      'Criando Imobiliaria Aurora (5 pessoas, 26 imoveis, 18 leads)...',
    );
    const aurora = await criarOrganizacao(prisma, {
      nome: 'Imobiliaria Aurora',
      slug: 'aurora',
      tipo: 'AGENCY',
      pessoas: AURORA,
      senhaHash,
      imoveis: imoveisDaAurora(),
      leads: leadsDaAurora(),
    });

    console.log('Criando Meridiano Imoveis (2 pessoas, 4 imoveis, 4 leads)...');
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
    });

    console.log('Criando corretor autonomo (1 pessoa, 3 imoveis, 2 leads)...');
    await criarOrganizacao(prisma, {
      nome: 'Paulo Reis Imoveis',
      slug: 'paulo-reis',
      // Corretor autonomo e uma organizacao de um membro, e nao um tipo de
      // conta (decisao de 19/10/2026). O `kind` SOLO so muda a interface.
      tipo: 'SOLO',
      pessoas: AUTONOMO,
      senhaHash,
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
  },
): Promise<string> {
  const organizacao = await prisma.organization.create({
    data: { name: dados.nome, slug: dados.slug, kind: dados.tipo },
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

  for (const imovel of dados.imoveis) {
    const proximo = (contadorPorTipo.get(imovel.tipo) ?? 0) + 1;
    contadorPorTipo.set(imovel.tipo, proximo);

    const codigo = `${PREFIXO_POR_TIPO[imovel.tipo]}-${String(proximo).padStart(3, '0')}`;

    await prisma.property.create({
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
  }

  for (const lead of dados.leads ?? []) {
    await prisma.lead.create({
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
              privacyNoticeVersion: '2026-10-01',
              // Hash, nunca o IP. O valor e inventado e tem o formato certo.
              consentIpHash: 'seed-sem-ip-real',
            }
          : {}),
      },
    });
  }

  return organizacao.id;
}

function imprimirResumo(): void {
  const linhas = [
    ['Imobiliaria Aurora', '26 im./18 leads', '3 leads na fila a distribuir'],
    ['  helena@exemplo.com', 'OWNER', 've e edita tudo, exclui'],
    ['  rafael@exemplo.com', 'ADMIN', 've e edita tudo, exclui'],
    ['  celina@exemplo.com', 'MANAGER', 've e edita tudo, NAO exclui'],
    ['  tiago@exemplo.com', 'AGENT', '5 leads; ve so os dele'],
    ['  bianca@exemplo.com', 'AGENT', '5 leads; ve so os dela'],
    ['Meridiano Imoveis', '4 im./4 leads', '1 lead na fila'],
    ['  otavio@exemplo.com', 'OWNER', ''],
    ['  dora@exemplo.com', 'AGENT', 'tambem e AGENT na Aurora'],
    ['Paulo Reis Imoveis', '3 im./2 leads', 'corretor autonomo'],
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
}

void main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
