import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Cliente do Prisma apontado para o banco de **teste**.
 *
 * Separado do banco de desenvolvimento de proposito: os testes truncam as
 * tabelas entre casos, e isso nao pode apagar o que alguem cadastrou enquanto
 * trabalhava. A URL vem de `TEST_DATABASE_URL`, e a ausencia dela e erro, nao
 * um silencioso "usa o de sempre" — esse silencio apagaria o banco errado.
 */

/**
 * Ordem de limpeza: das tabelas que **apontam** para as outras em direcao as
 * apontadas. Chave estrangeira com `ON DELETE RESTRICT` recusa apagar o pai
 * antes do filho, entao a ordem aqui nao e estetica — trocar duas linhas
 * quebra a limpeza.
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

export function urlDoBancoDeTeste(): string {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL nao definida. Veja .env.example. ' +
        'Os testes de integracao NAO usam o banco de desenvolvimento.',
    );
  }

  if (!/\/crm_test(\?|$)/.test(url)) {
    // Guarda contra o acidente que custa caro: apontar o truncamento para o
    // banco de desenvolvimento ou, pior, de producao.
    throw new Error(
      `TEST_DATABASE_URL precisa terminar em /crm_test. Recebido: ${url.replace(
        /\/\/[^@]*@/,
        '//***@',
      )}`,
    );
  }

  return url;
}

export function criarClienteDeTeste(): PrismaClient {
  const endereco = new URL(urlDoBancoDeTeste());

  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: endereco.hostname,
      port: endereco.port ? Number(endereco.port) : 3306,
      user: decodeURIComponent(endereco.username),
      password: decodeURIComponent(endereco.password),
      database: endereco.pathname.replace(/^\//, ''),
      // Mesmo motivo do PrismaService: MySQL 8 com caching_sha2_password
      // precisa da chave publica em conexao sem TLS. Aqui e sempre local.
      allowPublicKeyRetrieval: true,
      connectionLimit: 5,
    }),
  });
}

/**
 * Esvazia o banco de teste.
 *
 * Usa `DELETE` na ordem de dependencia, e **nao** `TRUNCATE` com as checagens
 * de chave estrangeira desligadas. O motivo e concreto: `FOREIGN_KEY_CHECKS` e
 * variavel de **sessao**, e o Prisma pode executar cada comando numa conexao
 * diferente do pool — o desligamento nao valia para o `TRUNCATE` seguinte, e o
 * MySQL recusa truncar tabela referenciada mesmo quando ela esta vazia.
 *
 * Em tabela de teste, com poucas linhas, a diferenca de velocidade e
 * irrelevante. E a ordem explicita tem um efeito colateral bom: se um dia ela
 * estiver errada, o banco reclama em vez de deixar passar.
 */
export async function limparBanco(prisma: PrismaClient): Promise<void> {
  for (const tabela of ORDEM_DE_LIMPEZA) {
    // Indexacao dinamica no cliente do Prisma: cada nome acima e um modelo.
    await (
      prisma[tabela] as unknown as { deleteMany: () => Promise<unknown> }
    ).deleteMany();
  }
}
