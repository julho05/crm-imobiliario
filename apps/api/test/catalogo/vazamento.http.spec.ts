/**
 * Item **C2**: o catálogo público não vaza campo privado.
 *
 * ## O teste que o roadmap pede falha sem ninguém editá-lo
 *
 * O critério de aceitação do C2 é um "teste que **falha se um campo novo do
 * `Property` vazar**". Um teste que apenas confira os campos da resposta não
 * cumpre isso: acrescentar `comissao` ao modelo não quebraria nada, porque
 * campo que ninguém mapeou simplesmente não aparece na resposta — e o vazamento
 * nasceria no dia em que alguém mapeasse.
 *
 * Então o primeiro bloco aqui não olha para a resposta. Ele lê
 * `Prisma.PropertyScalarFieldEnum` — a lista de colunas que o Prisma gera a
 * partir do `schema.prisma` — e exige que **cada** coluna esteja declarada como
 * pública ou privada em `resposta-publica.ts`. Uma migration que acrescente
 * coluna quebra a suíte até alguém decidir de que lado ela fica.
 *
 * O segundo bloco olha para a resposta de verdade, porque a classificação
 * promete e o DTO cumpre — ou não.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '../../src/generated/prisma/client';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
} from '../apoio/cenario-de-duas-organizacoes';
import {
  COLUNAS_PRIVADAS_DE_IMOVEL,
  COLUNAS_PRIVADAS_DE_MIDIA,
  COLUNAS_PRIVADAS_DE_ORGANIZACAO,
  COLUNAS_PUBLICAS_DE_IMOVEL,
  COLUNAS_PUBLICAS_DE_MIDIA,
  COLUNAS_PUBLICAS_DE_ORGANIZACAO,
} from '../../src/catalogo/resposta-publica';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;

beforeAll(async () => {
  prisma = criarClienteDeTeste();
  app = await subirAppDeTeste();
});

afterAll(async () => {
  await app.encerrar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparBanco(prisma);
  cenario = await montarCenario(prisma);
});

function obter(caminho: string) {
  return fetch(`${app.url}/api${caminho}`);
}

/**
 * Publica o imóvel de A1 com endereço completo preenchido.
 *
 * O endereço entra **cheio** de propósito: um imóvel sem rua nem CEP passaria
 * nestes testes por não ter o que vazar, e provaria nada.
 */
async function publicarImovelCompleto(dados: Record<string, unknown> = {}) {
  await prisma.property.update({
    where: { id: cenario.imovelDeA1 },
    data: {
      status: 'AVAILABLE',
      publishedAt: new Date(),
      zipCode: '01310-100',
      street: 'Avenida Paulista',
      number: '1578',
      complement: 'Conjunto 42',
      latitude: -23.5614,
      longitude: -46.6559,
      description: 'Sala comercial reformada.',
      ...dados,
    },
  });
}

describe('toda coluna do banco esta classificada', () => {
  /**
   * O caso que falha sozinho.
   *
   * Se este teste quebrar depois de uma migration, a correção **não** é
   * acrescentar a coluna à lista pública para a suíte passar. É decidir se
   * aquele dado pode ser lido por qualquer pessoa da internet — e, na dúvida,
   * ele é privado.
   */
  it('nenhuma coluna do Property fica sem decisao', () => {
    const colunas = Object.keys(Prisma.PropertyScalarFieldEnum);
    const classificadas = new Set<string>([
      ...COLUNAS_PUBLICAS_DE_IMOVEL,
      ...COLUNAS_PRIVADAS_DE_IMOVEL,
    ]);

    const semDecisao = colunas.filter((coluna) => !classificadas.has(coluna));

    expect(
      semDecisao,
      'Coluna nova no Property sem classificacao em resposta-publica.ts. ' +
        'Decida se ela pode ser lida por qualquer visitante antes de seguir.',
    ).toEqual([]);
  });

  it('nenhuma coluna esta nas duas listas ao mesmo tempo', () => {
    const publicas = new Set<string>(COLUNAS_PUBLICAS_DE_IMOVEL);
    const nas_duas = COLUNAS_PRIVADAS_DE_IMOVEL.filter((coluna) =>
      publicas.has(coluna),
    );

    expect(nas_duas).toEqual([]);
  });

  it('nenhuma classificacao aponta para coluna que nao existe mais', () => {
    // O espelho do primeiro caso. Sem ele, uma coluna removida do schema
    // deixaria uma linha morta na lista, e a proxima pessoa leria a lista como
    // descricao do banco — que e o que ela e.
    const colunas = new Set(Object.keys(Prisma.PropertyScalarFieldEnum));
    const inexistentes = [
      ...COLUNAS_PUBLICAS_DE_IMOVEL,
      ...COLUNAS_PRIVADAS_DE_IMOVEL,
    ].filter((coluna) => !colunas.has(coluna));

    expect(inexistentes).toEqual([]);
  });

  it('nenhuma coluna da Organization fica sem decisao', () => {
    const colunas = Object.keys(Prisma.OrganizationScalarFieldEnum);
    const classificadas = new Set<string>([
      ...COLUNAS_PUBLICAS_DE_ORGANIZACAO,
      ...COLUNAS_PRIVADAS_DE_ORGANIZACAO,
    ]);

    expect(colunas.filter((c) => !classificadas.has(c))).toEqual([]);
  });

  it('nenhuma coluna da PropertyMedia fica sem decisao', () => {
    const colunas = Object.keys(Prisma.PropertyMediaScalarFieldEnum);
    const classificadas = new Set<string>([
      ...COLUNAS_PUBLICAS_DE_MIDIA,
      ...COLUNAS_PRIVADAS_DE_MIDIA,
    ]);

    expect(colunas.filter((c) => !classificadas.has(c))).toEqual([]);
  });
});

describe('a resposta publica nao carrega o que e privado', () => {
  /**
   * Os nomes em **português** dos campos privados, que é como eles sairiam se
   * alguém os acrescentasse ao DTO — mais os nomes em inglês, que é como eles
   * sairiam se alguém devolvesse o registro do Prisma direto.
   */
  const PROIBIDOS = [
    'codigo',
    'code',
    'organizationId',
    'organizacaoId',
    'ownerMemberId',
    'responsavel',
    'cep',
    'zipCode',
    'latitude',
    'longitude',
    'visibilidadeDoEndereco',
    'addressVisibility',
    'deletedAt',
    'excluidoEm',
    'objectKey',
  ];

  function conferirSemProibidos(corpo: unknown) {
    const texto = JSON.stringify(corpo);

    for (const proibido of PROIBIDOS) {
      expect(texto, `"${proibido}" apareceu na resposta publica`).not.toContain(
        `"${proibido}"`,
      );
    }
  }

  it('no detalhe do imovel', async () => {
    await publicarImovelCompleto();

    const resposta = await obter('/publico/organizacoes/org-a/imoveis/a-001');

    expect(resposta.status).toBe(200);
    conferirSemProibidos(await resposta.json());
  });

  it('na listagem', async () => {
    await publicarImovelCompleto();

    const resposta = await obter('/publico/organizacoes/org-a/imoveis');

    expect(resposta.status).toBe(200);
    conferirSemProibidos(await resposta.json());
  });

  it('e nenhum valor privado aparece, mesmo com nome de campo diferente', async () => {
    await publicarImovelCompleto();

    const texto = await (
      await obter('/publico/organizacoes/org-a/imoveis/a-001')
    ).text();

    // Conferir os **valores**, e nao so os nomes dos campos: um DTO que
    // renomeasse `zipCode` para `localizacao` passaria no caso anterior.
    expect(texto).not.toContain('01310-100');
    expect(texto).not.toContain('-23.5614');
    expect(texto).not.toContain('-46.6559');
    expect(texto).not.toContain(cenario.organizacaoA);
    expect(texto).not.toContain(cenario.agenteA1.membershipId);
  });

  it('o documento do imovel nunca sai, nem o caminho dele', async () => {
    await publicarImovelCompleto();

    await prisma.propertyMedia.createMany({
      data: [
        {
          organizationId: cenario.organizacaoA,
          propertyId: cenario.imovelDeA1,
          objectKey: `organizacoes/${cenario.organizacaoA}/imoveis/${cenario.imovelDeA1}/foto.jpg`,
          kind: 'PHOTO',
          position: 0,
          isCover: true,
        },
        {
          organizationId: cenario.organizacaoA,
          propertyId: cenario.imovelDeA1,
          objectKey: `organizacoes/${cenario.organizacaoA}/imoveis/${cenario.imovelDeA1}/matricula-secreta.pdf`,
          kind: 'DOCUMENT',
          position: 1,
          isCover: false,
        },
      ],
    });

    const corpo = (await (
      await obter('/publico/organizacoes/org-a/imoveis/a-001')
    ).json()) as {
      imovel: { fotos: { kind: string }[]; capa: { kind: string } | null };
    };

    // A unica midia que sai e a foto. O documento nao e filtrado depois de
    // carregado: ele nao chega a ser lido do banco.
    expect(corpo.imovel.fotos).toHaveLength(1);
    expect(corpo.imovel.fotos[0].kind).toBe('PHOTO');
    expect(corpo.imovel.capa?.kind).toBe('PHOTO');
  });
});
