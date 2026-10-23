/**
 * Item **C2** e **B3**: o que o catálogo mostra, e o endereço que ele revela.
 *
 * ## O que este arquivo existe para pegar
 *
 * Dois erros, e os dois são silenciosos:
 *
 * 1. **Imóvel que não devia aparecer, aparecendo.** Rascunho, vendido,
 *    desativado, excluído, não publicado, ou de organização suspensa. Nenhum
 *    deles quebra nada — eles só ficam visíveis, e quem descobre é o cliente
 * 2. **Endereço saindo acima do nível configurado.** É o critério do B3, que
 *    até agora não tinha onde ser verificado: o campo existia desde a Fase 1,
 *    mas não havia resposta pública para interrogar
 *
 * As duas perguntas são feitas **na listagem e no detalhe**, porque é
 * exatamente aí que um recorte duplicado diverge — foi o que aconteceu no item
 * B7, onde a consulta por id esqueceu um filtro que a listagem tinha.
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

type ImovelPublico = {
  id: string;
  slug: string;
  titulo: string;
  status: string;
  cidade: string;
  bairro: string;
  endereco: {
    rua: string;
    numero: string | null;
    complemento: string | null;
  } | null;
};

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

function ajustar(id: string, data: Prisma.PropertyUpdateInput) {
  return prisma.property.update({ where: { id }, data });
}

/** Publica com endereço completo no banco, para haver o que esconder. */
function publicar(id: string, data: Prisma.PropertyUpdateInput = {}) {
  return ajustar(id, {
    status: 'AVAILABLE',
    publishedAt: new Date(),
    zipCode: '01310-100',
    street: 'Avenida Paulista',
    number: '1578',
    complement: 'Conjunto 42',
    ...data,
  });
}

async function listar(slug = 'org-a'): Promise<ImovelPublico[]> {
  const resposta = await obter(`/publico/organizacoes/${slug}/imoveis`);

  expect(resposta.status).toBe(200);

  return ((await resposta.json()) as { imoveis: ImovelPublico[] }).imoveis;
}

describe('a vitrine mostra so o que esta publicado', () => {
  it('o imovel publicado aparece', async () => {
    await publicar(cenario.imovelDeA1);

    const imoveis = await listar();

    expect(imoveis).toHaveLength(1);
    expect(imoveis[0].slug).toBe('a-001');
  });

  it('RESERVED aparece, com o status visivel para a etiqueta', async () => {
    await publicar(cenario.imovelDeA1, { status: 'RESERVED' });

    const imoveis = await listar();

    expect(imoveis).toHaveLength(1);
    expect(imoveis[0].status).toBe('RESERVED');
  });

  it.each(['DRAFT', 'SOLD', 'RENTED', 'INACTIVE'] as const)(
    '%s nao aparece, mesmo publicado',
    async (status) => {
      // Publicado **e** com o estado comercial errado: e a combinacao que
      // pega o filtro que olha so para `publishedAt`. Vender um imovel nao
      // despublica, e nao deveria mesmo — o que muda e o estado.
      await publicar(cenario.imovelDeA1, { status });

      expect(await listar()).toHaveLength(0);
    },
  );

  it('nao publicado nao aparece, mesmo disponivel', async () => {
    await ajustar(cenario.imovelDeA1, {
      status: 'AVAILABLE',
      publishedAt: null,
    });

    expect(await listar()).toHaveLength(0);
  });

  it('excluido nao aparece, mesmo publicado', async () => {
    // Soft delete: imovel com Inquiry associada nunca e apagado de verdade,
    // porque a Inquiry e prova da origem do lead. A linha fica no banco, e sem
    // o filtro ela voltaria a vitrine.
    await publicar(cenario.imovelDeA1, { deletedAt: new Date() });

    expect(await listar()).toHaveLength(0);
  });

  it('a vitrine de uma organizacao nao mostra imovel da outra', async () => {
    await publicar(cenario.imovelDeA1);
    await publicar(cenario.imovelDeB);

    const deA = await listar('org-a');
    const deB = await listar('org-b');

    expect(deA.map((i) => i.slug)).toEqual(['a-001']);
    expect(deB.map((i) => i.slug)).toEqual(['b-001']);
  });

  it('organizacao suspensa nao tem vitrine', async () => {
    await publicar(cenario.imovelDeA1);
    await prisma.organization.update({
      where: { id: cenario.organizacaoA },
      data: { status: 'SUSPENDED' },
    });

    expect((await obter('/publico/organizacoes/org-a')).status).toBe(404);
    expect((await obter('/publico/organizacoes/org-a/imoveis')).status).toBe(
      404,
    );
    expect(
      (await obter('/publico/organizacoes/org-a/imoveis/a-001')).status,
    ).toBe(404);
  });

  it('slug que nao existe responde 404, igual a organizacao suspensa', async () => {
    expect((await obter('/publico/organizacoes/nao-existe')).status).toBe(404);
  });
});

describe('o detalhe responde o mesmo que a listagem', () => {
  it.each(['DRAFT', 'SOLD', 'RENTED', 'INACTIVE'] as const)(
    '%s responde 404 no acesso direto pelo slug',
    async (status) => {
      // A pergunta que o B7 ensinou a fazer: o recorte da consulta por id
      // pode divergir do recorte da listagem, e so um teste separado percebe.
      await publicar(cenario.imovelDeA1, { status });

      expect(
        (await obter('/publico/organizacoes/org-a/imoveis/a-001')).status,
      ).toBe(404);
    },
  );

  it('nao publicado responde 404 no acesso direto', async () => {
    await ajustar(cenario.imovelDeA1, {
      status: 'AVAILABLE',
      publishedAt: null,
    });

    expect(
      (await obter('/publico/organizacoes/org-a/imoveis/a-001')).status,
    ).toBe(404);
  });

  it('o imovel de outra organizacao responde 404 sob o slug errado', async () => {
    await publicar(cenario.imovelDeB);

    // O slug do imovel de B, pedido na vitrine de A. Sem o `organizationId` no
    // recorte, o `findFirst` por slug acharia o imovel da outra imobiliaria.
    expect(
      (await obter('/publico/organizacoes/org-a/imoveis/b-001')).status,
    ).toBe(404);
  });
});

describe('o endereco respeita o nivel configurado (item B3)', () => {
  async function enderecoDoDetalhe(): Promise<ImovelPublico['endereco']> {
    const resposta = await obter('/publico/organizacoes/org-a/imoveis/a-001');

    expect(resposta.status).toBe(200);

    return ((await resposta.json()) as { imovel: ImovelPublico }).imovel
      .endereco;
  }

  it('FULL devolve rua, numero e complemento — e nunca o CEP', async () => {
    await publicar(cenario.imovelDeA1, { addressVisibility: 'FULL' });

    expect(await enderecoDoDetalhe()).toEqual({
      rua: 'Avenida Paulista',
      numero: '1578',
      complemento: 'Conjunto 42',
    });
  });

  it('STREET_ONLY devolve a rua, sem numero e sem complemento', async () => {
    await publicar(cenario.imovelDeA1, { addressVisibility: 'STREET_ONLY' });

    expect(await enderecoDoDetalhe()).toEqual({
      rua: 'Avenida Paulista',
      numero: null,
      complemento: null,
    });
  });

  it('NEIGHBORHOOD_ONLY nao devolve endereco nenhum', async () => {
    await publicar(cenario.imovelDeA1, {
      addressVisibility: 'NEIGHBORHOOD_ONLY',
    });

    expect(await enderecoDoDetalhe()).toBeNull();
  });

  it('o padrao do banco e o nivel mais restritivo', async () => {
    // Nao configura nada: o imovel do cenario nasce com o `@default` do schema.
    // E a garantia de que esquecer o campo erra para o lado seguro.
    await publicar(cenario.imovelDeA1);

    expect(await enderecoDoDetalhe()).toBeNull();
  });

  it('cidade e bairro saem em todos os niveis', async () => {
    await publicar(cenario.imovelDeA1, {
      addressVisibility: 'NEIGHBORHOOD_ONLY',
    });

    const imoveis = await listar();

    expect(imoveis[0].cidade).toBe('Sao Paulo');
    expect(imoveis[0].bairro).toBe('Centro');
  });

  it('a listagem esconde o endereco com a mesma regra do detalhe', async () => {
    await publicar(cenario.imovelDeA1, { addressVisibility: 'STREET_ONLY' });

    expect((await listar())[0].endereco).toEqual({
      rua: 'Avenida Paulista',
      numero: null,
      complemento: null,
    });
  });
});

describe('a vitrine nao exige sessao', () => {
  it('responde sem cookie nenhum', async () => {
    await publicar(cenario.imovelDeA1);

    const resposta = await obter('/publico/organizacoes/org-a');

    expect(resposta.status).toBe(200);
    expect((await resposta.json()) as { nome: string }).toMatchObject({
      nome: 'Imobiliaria A',
      slug: 'org-a',
    });
  });

  it('e nao devolve cookie de sessao', async () => {
    const resposta = await obter('/publico/organizacoes/org-a');

    expect(resposta.headers.getSetCookie()).toEqual([]);
  });
});

describe('paginacao', () => {
  it('a vitrine e paginada e informa o total', async () => {
    await publicar(cenario.imovelDeA1);
    await publicar(cenario.imovelDeA2);

    const resposta = await obter(
      '/publico/organizacoes/org-a/imoveis?pagina=1&porPagina=1',
    );
    const corpo = (await resposta.json()) as {
      imoveis: ImovelPublico[];
      total: number;
      porPagina: number;
    };

    expect(corpo.imoveis).toHaveLength(1);
    expect(corpo.total).toBe(2);
    expect(corpo.porPagina).toBe(1);
  });

  it('recusa pedido de pagina gigante', async () => {
    // O teto de 100 do `paginacaoSchema` vale aqui como em toda listagem: sem
    // ele, um robo pediria a base inteira em uma requisicao.
    const resposta = await obter(
      '/publico/organizacoes/org-a/imoveis?porPagina=5000',
    );

    expect(resposta.status).toBe(400);
  });
});
