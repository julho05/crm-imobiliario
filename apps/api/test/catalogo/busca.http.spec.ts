/**
 * Item **C4**: a busca da vitrine.
 *
 * ## O critério do roadmap é o primeiro bloco
 *
 * "Teste confirma que **não** há filtro por rua, CEP ou coordenada." Conferir
 * que o schema não tem esses campos seria fraco: o schema descarta chave
 * desconhecida, então `?cep=` nunca chegaria a falhar. O que prova o critério é
 * a busca **não responder** sobre o endereço — um imóvel com a rua cadastrada e
 * oculta, e o `termo` com o nome da rua devolvendo zero. Se algum dia a busca
 * livre passar a olhar a coluna da rua, o visitante descobriria o endereço por
 * tentativa, e é este caso que quebra.
 *
 * ## Os outros blocos
 *
 * - **Ausência não vira zero** (decisão de 21/10/2026): o imóvel sem área ou sem
 *   dormitórios sai do resultado quando há mínimo
 * - **Preço pela finalidade**: o imóvel `BOTH` aparece nas duas buscas, e cada
 *   uma compara o preço certo
 * - **O recorte continua valendo**: filtro nenhum alarga o `visivel()`
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient, Prisma } from '../../src/generated/prisma/client';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
} from '../apoio/cenario-de-duas-organizacoes';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;
let sequencia = 0;

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

/**
 * Um imóvel publicado e disponível na organização A, com o que o caso pedir
 * por cima. Devolve o slug, que é o que a vitrine mostra.
 *
 * Os imóveis do cenário base (`A-001`, `A-002`, `B-001`) são rascunhos, então
 * não aparecem em busca nenhuma — e servem de prova disso de graça.
 */
async function anunciar(
  dados: Partial<Prisma.PropertyUncheckedCreateInput> = {},
): Promise<string> {
  sequencia += 1;
  const code = `T-${String(sequencia).padStart(3, '0')}`;

  const imovel = await prisma.property.create({
    data: {
      organizationId: cenario.organizacaoA,
      code,
      slug: code.toLowerCase(),
      title: `Imovel ${code}`,
      type: 'APARTMENT',
      purpose: 'SALE',
      price: 450000,
      state: 'SP',
      city: 'Sao Paulo',
      neighborhood: 'Centro',
      status: 'AVAILABLE',
      publishedAt: new Date(),
      ...dados,
    },
    select: { slug: true },
  });

  return imovel.slug;
}

function consultar(consulta: Record<string, string>, slug = 'org-a') {
  return fetch(
    `${app.url}/api/publico/organizacoes/${slug}/imoveis?${new URLSearchParams(
      consulta,
    )}`,
  );
}

/** Os slugs encontrados, em ordem alfabética para comparar sem depender da data. */
async function buscar(
  consulta: Record<string, string> = {},
  slug = 'org-a',
): Promise<string[]> {
  const resposta = await consultar(consulta, slug);

  expect(resposta.status).toBe(200);

  const { imoveis } = (await resposta.json()) as {
    imoveis: { slug: string }[];
  };

  return imoveis.map((imovel) => imovel.slug).sort();
}

describe('a busca nao responde sobre o endereco', () => {
  it.each(['NEIGHBORHOOD_ONLY', 'STREET_ONLY', 'FULL'] as const)(
    'o termo com a rua, o numero ou o CEP nao encontra nada (%s)',
    async (visibilidade) => {
      await anunciar({
        street: 'Rua Secreta das Acacias',
        number: '4471',
        complement: 'Bloco Z',
        zipCode: '04538-133',
        latitude: -23.5873,
        longitude: -46.6824,
        addressVisibility: visibilidade,
      });

      // Nem no `FULL`, em que a rua sai no anúncio: a busca não olha a coluna
      // em nível nenhum, e assim não depende de ninguém lembrar de conferir a
      // visibilidade dentro do filtro.
      expect(await buscar({ termo: 'Secreta' })).toEqual([]);
      expect(await buscar({ termo: 'Acacias' })).toEqual([]);
      expect(await buscar({ termo: '4471' })).toEqual([]);
      expect(await buscar({ termo: 'Bloco Z' })).toEqual([]);
      expect(await buscar({ termo: '04538' })).toEqual([]);
    },
  );

  it('parametros de endereco sao ignorados: o resultado e o da vitrine sem filtro', async () => {
    const comRua = await anunciar({
      street: 'Rua Secreta das Acacias',
      zipCode: '04538-133',
      latitude: -23.5873,
    });
    const outro = await anunciar({ street: 'Avenida Qualquer' });

    const semFiltro = await buscar();

    expect(semFiltro).toEqual([comRua, outro].sort());
    expect(
      await buscar({
        rua: 'Rua Secreta das Acacias',
        street: 'Rua Secreta das Acacias',
        cep: '04538-133',
        zipCode: '04538-133',
        numero: '4471',
        latitude: '-23.5873',
        longitude: '-46.6824',
      }),
    ).toEqual(semFiltro);
  });

  it('parametros que redes sociais acrescentam ao link nao quebram a vitrine', async () => {
    const slug = await anunciar();

    expect(
      await buscar({ fbclid: 'IwAR0abc', utm_source: 'whatsapp' }),
    ).toEqual([slug]);
  });
});

describe('busca livre', () => {
  it('encontra pelo titulo, pelo codigo, pelo bairro e pela cidade', async () => {
    const porTitulo = await anunciar({ title: 'Cobertura com vista' });
    const porBairro = await anunciar({ neighborhood: 'Jardim Aquarius' });
    const porCidade = await anunciar({ city: 'Ribeirao Preto' });
    const porCodigo = await anunciar();

    expect(await buscar({ termo: 'cobertura' })).toEqual([porTitulo]);
    expect(await buscar({ termo: 'aquarius' })).toEqual([porBairro]);
    expect(await buscar({ termo: 'ribeirao' })).toEqual([porCidade]);
    expect(await buscar({ termo: porCodigo.toUpperCase() })).toEqual([
      porCodigo,
    ]);
  });

  it('ignora acento e maiuscula, nos dois sentidos', async () => {
    const comAcento = await anunciar({ city: 'São José dos Campos' });
    const semAcento = await anunciar({ neighborhood: 'Vila Mariana' });

    expect(await buscar({ termo: 'SAO JOSE' })).toEqual([comAcento]);
    expect(await buscar({ termo: 'víla MARIÂNA' })).toEqual([semAcento]);
  });

  it('cidade, bairro e estado filtram pelo valor exato, sem diferenciar acento', async () => {
    const emCampinas = await anunciar({ city: 'Campinas', state: 'SP' });
    await anunciar({ city: 'Belo Horizonte', state: 'MG' });

    expect(await buscar({ cidade: 'campinas' })).toEqual([emCampinas]);
    expect(await buscar({ estado: 'sp' })).toContain(emCampinas);
    expect(await buscar({ estado: 'MG', cidade: 'Campinas' })).toEqual([]);
  });

  it('tipo de imovel', async () => {
    const casa = await anunciar({ type: 'HOUSE' });
    await anunciar({ type: 'APARTMENT' });

    expect(await buscar({ tipo: 'HOUSE' })).toEqual([casa]);
  });
});

describe('finalidade e preco', () => {
  async function tresFinalidades() {
    return {
      venda: await anunciar({ purpose: 'SALE', price: 500000 }),
      aluguel: await anunciar({
        purpose: 'RENT',
        price: null,
        rentPrice: 3000,
      }),
      // Venda cara, aluguel barato: é ele que denuncia preço comparado com o
      // campo errado.
      ambos: await anunciar({
        purpose: 'BOTH',
        price: 900000,
        rentPrice: 2500,
      }),
    };
  }

  it('o imovel que aceita as duas finalidades aparece nas duas buscas', async () => {
    const { venda, aluguel, ambos } = await tresFinalidades();

    expect(await buscar({ finalidade: 'SALE' })).toEqual([venda, ambos].sort());
    expect(await buscar({ finalidade: 'RENT' })).toEqual(
      [aluguel, ambos].sort(),
    );
  });

  it('a faixa de preco compara o preco da finalidade pedida', async () => {
    const { venda, ambos } = await tresFinalidades();

    // Aluguel até R$ 2.800: entra o `BOTH` (aluguel de 2.500) mesmo com a
    // venda de 900 mil, e sai o de aluguel puro (3.000).
    expect(await buscar({ finalidade: 'RENT', precoMaximo: '2800' })).toEqual([
      ambos,
    ]);

    // Venda até 600 mil: sai o `BOTH`, cujo aluguel de 2.500 cabe na faixa
    // mas a venda de 900 mil não.
    expect(await buscar({ finalidade: 'SALE', precoMaximo: '600000' })).toEqual(
      [venda],
    );

    expect(await buscar({ finalidade: 'SALE', precoMinimo: '600000' })).toEqual(
      [ambos],
    );
  });

  it('o total conta o que a busca alcanca, nao a vitrine inteira', async () => {
    await tresFinalidades();

    const resposta = await consultar({ finalidade: 'RENT' });
    const corpo = (await resposta.json()) as { total: number };

    expect(corpo.total).toBe(2);
  });

  it('preco sem finalidade e recusado', async () => {
    const resposta = await consultar({ precoMaximo: '3000' });

    expect(resposta.status).toBe(400);
  });

  it('preco minimo maior que o maximo e recusado', async () => {
    const resposta = await consultar({
      finalidade: 'SALE',
      precoMinimo: '900000',
      precoMaximo: '100000',
    });

    expect(resposta.status).toBe(400);
  });

  it('finalidade BOTH nao e opcao de busca', async () => {
    const resposta = await consultar({ finalidade: 'BOTH' });

    expect(resposta.status).toBe(400);
  });

  it('campos em branco do formulario valem como ausentes, e nao como zero', async () => {
    const semPreco = await anunciar({ purpose: 'SALE', price: null });
    const comPreco = await anunciar();

    // É o que o formulário com envio por GET manda quando ninguém preenche
    // nada. `precoMinimo=''` virando 0 seria um filtro que ninguém pediu.
    expect(
      await buscar({
        termo: '',
        tipo: '',
        finalidade: '',
        precoMinimo: '',
        precoMaximo: '',
        quartosMinimo: '',
        areaMinima: '',
      }),
    ).toEqual([semPreco, comPreco].sort());
  });
});

describe('ausencia nunca vira zero', () => {
  it('quem nao informou dormitorios sai do filtro de dormitorios', async () => {
    const tres = await anunciar({ bedrooms: 3 });
    const um = await anunciar({ bedrooms: 1 });
    const semInformacao = await anunciar({ bedrooms: null });

    expect(await buscar({ quartosMinimo: '2' })).toEqual([tres]);
    expect(await buscar({ quartosMinimo: '1' })).toEqual([tres, um].sort());

    // Mínimo zero é o mesmo que nenhum mínimo: aplicado, ele também esconderia
    // o imóvel sem a informação.
    expect(await buscar({ quartosMinimo: '0' })).toEqual(
      [tres, um, semInformacao].sort(),
    );
  });

  it('vagas e banheiros seguem a mesma regra', async () => {
    const completo = await anunciar({ parkingSpots: 2, bathrooms: 2 });
    await anunciar({ parkingSpots: null, bathrooms: null });

    expect(await buscar({ vagasMinimo: '1' })).toEqual([completo]);
    expect(await buscar({ banheirosMinimo: '1' })).toEqual([completo]);
  });

  it('area: a util quando existe, senao a total, e sem nenhuma das duas o imovel sai', async () => {
    const util80 = await anunciar({ areaUseful: 80, areaTotal: 200 });
    const total120 = await anunciar({ areaUseful: null, areaTotal: 120 });
    await anunciar({ areaUseful: null, areaTotal: null });

    // O de área útil 80 e total 200 sai do mínimo 100: o que vale é a útil,
    // que é a que o cartão mostra.
    expect(await buscar({ areaMinima: '100' })).toEqual([total120]);
    expect(await buscar({ areaMinima: '50' })).toEqual(
      [util80, total120].sort(),
    );
  });
});

describe('o recorte continua valendo com qualquer filtro', () => {
  it('rascunho, vendido, nao publicado, excluido e outra organizacao nao aparecem', async () => {
    const visivel = await anunciar({ title: 'Casa Exclusiva visivel' });

    await anunciar({ title: 'Casa Exclusiva vendida', status: 'SOLD' });
    await anunciar({ title: 'Casa Exclusiva rascunho', status: 'DRAFT' });
    await anunciar({ title: 'Casa Exclusiva fora do ar', publishedAt: null });
    await anunciar({ title: 'Casa Exclusiva excluida', deletedAt: new Date() });
    await anunciar({
      title: 'Casa Exclusiva de B',
      organizationId: cenario.organizacaoB,
    });

    expect(
      await buscar({
        termo: 'Exclusiva',
        finalidade: 'SALE',
        precoMinimo: '1',
      }),
    ).toEqual([visivel]);
  });

  it('a busca na organizacao B nao alcanca o imovel de A', async () => {
    await anunciar({ title: 'Cobertura de A' });

    expect(await buscar({ termo: 'Cobertura' }, 'org-b')).toEqual([]);
  });
});
