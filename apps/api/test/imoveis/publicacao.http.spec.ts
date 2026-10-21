/**
 * Item **B2**: publicação.
 *
 * Os dois critérios do roadmap: `status` e `publishedAt` **independentes**, e
 * publicar/despublicar registrado em auditoria.
 *
 * A independência é o ponto difícil, e vale dizer por quê. `status` é o estado
 * comercial — disponível, reservado, vendido. `publishedAt` é a visibilidade no
 * catálogo. Um imóvel reservado continua anunciado, com etiqueta (item C1); um
 * imóvel disponível pode estar fora do ar porque o proprietário pediu
 * discrição. Tratar os dois como um só campo faria o produto perder essa
 * distinção, que é a diferença entre "não está mais à venda" e "não quero
 * anunciar agora".
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
} from '../apoio/cenario-de-duas-organizacoes';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;

type RespostaDeImovel = {
  id: string;
  status: string;
  publicadoEm: string | null;
};

function enviar(caminho: string, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
  });
}

function publicar(id: string, cookie: string) {
  return enviar(`/imoveis/${id}/publicar`, cookie);
}

function despublicar(id: string, cookie: string) {
  return enviar(`/imoveis/${id}/despublicar`, cookie);
}

function auditoriaDe(entityId: string) {
  return prisma.activity.findMany({
    where: { entityId },
    select: { action: true, metadata: true, actorMembershipId: true },
    orderBy: { createdAt: 'asc' },
  });
}

beforeAll(async () => {
  app = await subirAppDeTeste();
  prisma = criarClienteDeTeste();
  await prisma.$connect();
}, 60_000);

afterAll(async () => {
  await app.encerrar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparBanco(prisma);
  cenario = await montarCenario(prisma);
});

describe('publicar', () => {
  it('grava publishedAt e tira o imóvel do rascunho', async () => {
    const resposta = await publicar(
      cenario.imovelDeA1,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as RespostaDeImovel;
    expect(corpo.publicadoEm).not.toBeNull();
    // DRAFT significa "ainda não terminei": não faria sentido anunciar algo
    // que a própria pessoa marcou como rascunho.
    expect(corpo.status).toBe('AVAILABLE');
  });

  it('não mexe no status quando ele já não é DRAFT', async () => {
    await prisma.property.update({
      where: { id: cenario.imovelDeA1 },
      data: { status: 'RESERVED' },
    });

    const resposta = await publicar(
      cenario.imovelDeA1,
      cenario.agenteA1.cookie,
    );

    const corpo = (await resposta.json()) as RespostaDeImovel;

    // É a independência dos dois campos: o imóvel reservado vai ao ar
    // continuando reservado, porque o catálogo o mostra com etiqueta.
    expect(corpo.status).toBe('RESERVED');
    expect(corpo.publicadoEm).not.toBeNull();
  });

  it('recusa publicar imóvel vendido ou alugado', async () => {
    for (const status of ['SOLD', 'RENTED'] as const) {
      await prisma.property.update({
        where: { id: cenario.imovelDeA1 },
        data: { status },
      });

      const resposta = await publicar(
        cenario.imovelDeA1,
        cenario.agenteA1.cookie,
      );

      // Anunciar imóvel vendido gera lead que nasce frustrado.
      expect(resposta.status).toBe(400);
    }
  });

  it('recusa publicar imóvel inativo', async () => {
    await prisma.property.update({
      where: { id: cenario.imovelDeA1 },
      data: { status: 'INACTIVE' },
    });

    const resposta = await publicar(
      cenario.imovelDeA1,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(400);
  });

  it('recusa publicar imóvel sem o preço que a finalidade exige', async () => {
    // O B1 tolera este registro na edição; a vitrine não. É aqui que a
    // tolerância para o dado legado encontra o seu limite.
    const semPreco = await prisma.property.create({
      data: {
        organizationId: cenario.organizacaoA,
        code: 'SEM-PRECO',
        slug: 'sem-preco',
        title: 'Imovel importado sem preco',
        type: 'APARTMENT',
        purpose: 'SALE',
        state: 'SP',
        city: 'Sao Paulo',
        neighborhood: 'Centro',
        ownerMemberId: cenario.agenteA1.membershipId,
      },
      select: { id: true },
    });

    const resposta = await publicar(semPreco.id, cenario.agenteA1.cookie);

    expect(resposta.status).toBe(400);

    const corpo = (await resposta.json()) as {
      erros: { campo: string }[];
    };

    expect(corpo.erros[0].campo).toBe('preco');

    // E continua fora do ar.
    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: semPreco.id },
      select: { publishedAt: true },
    });

    expect(noBanco.publishedAt).toBeNull();
  });

  it('publicar de novo atualiza a data', async () => {
    await publicar(cenario.imovelDeA1, cenario.agenteA1.cookie);

    const primeira = await prisma.property.findUniqueOrThrow({
      where: { id: cenario.imovelDeA1 },
      select: { publishedAt: true },
    });

    await despublicar(cenario.imovelDeA1, cenario.agenteA1.cookie);
    await publicar(cenario.imovelDeA1, cenario.agenteA1.cookie);

    const segunda = await prisma.property.findUniqueOrThrow({
      where: { id: cenario.imovelDeA1 },
      select: { publishedAt: true },
    });

    expect(segunda.publishedAt?.getTime()).toBeGreaterThanOrEqual(
      primeira.publishedAt?.getTime() ?? 0,
    );
  });
});

describe('despublicar', () => {
  it('limpa publishedAt e deixa o status como estava', async () => {
    await prisma.property.update({
      where: { id: cenario.imovelDeA1 },
      data: { status: 'RESERVED', publishedAt: new Date() },
    });

    const resposta = await despublicar(
      cenario.imovelDeA1,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as RespostaDeImovel;

    // Despublicar é "não mostre mais", não "não está mais disponível".
    expect(corpo.publicadoEm).toBeNull();
    expect(corpo.status).toBe('RESERVED');
  });

  it('recusa despublicar o que não está no ar', async () => {
    const resposta = await despublicar(
      cenario.imovelDeA1,
      cenario.agenteA1.cookie,
    );

    // Idempotente seria mais simples, mas esconderia da interface que ela
    // estava desatualizada e precisa recarregar.
    expect(resposta.status).toBe(400);
  });
});

describe('permissão', () => {
  it('o corretor publica o imóvel dele', async () => {
    const resposta = await publicar(
      cenario.imovelDeA1,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);
  });

  it('o corretor recebe 403 ao publicar o imóvel do colega', async () => {
    const resposta = await publicar(
      cenario.imovelDeA2,
      cenario.agenteA1.cookie,
    );

    // `imovel:publicar` é OWN para o AGENT, e ele VÊ o imóvel do colega.
    expect(resposta.status).toBe(403);
  });

  it('o gerente publica o imóvel de qualquer corretor', async () => {
    const resposta = await publicar(
      cenario.imovelDeA2,
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(200);
  });

  it('publicar imóvel de outra organização responde 404, nunca 403', async () => {
    const resposta = await publicar(cenario.imovelDeA1, cenario.ownerB.cookie);

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: cenario.imovelDeA1 },
      select: { publishedAt: true },
    });

    expect(noBanco.publishedAt).toBeNull();
  });

  it('despublicar imóvel de outra organização responde 404', async () => {
    await prisma.property.update({
      where: { id: cenario.imovelDeA1 },
      data: { publishedAt: new Date() },
    });

    const resposta = await despublicar(
      cenario.imovelDeA1,
      cenario.ownerB.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('sem sessão responde 401', async () => {
    const resposta = await publicar(cenario.imovelDeA1, 'sessao=inventada');

    expect(resposta.status).toBe(401);
  });
});

describe('auditoria', () => {
  it('publicar registra o estado anterior e se ele mudou', async () => {
    await publicar(cenario.imovelDeA1, cenario.agenteA1.cookie);

    const linhas = await auditoriaDe(cenario.imovelDeA1);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].action).toBe('imovel.publicado');
    expect(linhas[0].actorMembershipId).toBe(cenario.agenteA1.membershipId);
    // Sem isto o log não distingue "coloquei no ar" de "coloquei no ar e
    // marquei como disponível".
    expect(linhas[0].metadata).toMatchObject({
      codigo: 'A-001',
      statusAnterior: 'DRAFT',
      virouDisponivel: true,
    });
  });

  it('despublicar registra evento próprio', async () => {
    await publicar(cenario.imovelDeA1, cenario.agenteA1.cookie);
    await despublicar(cenario.imovelDeA1, cenario.agenteA1.cookie);

    const linhas = await auditoriaDe(cenario.imovelDeA1);

    // Duas linhas, não uma sobrescrita: o histórico de um imóvel que entrou e
    // saiu do ar é exatamente o que se vai querer consultar depois.
    expect(linhas.map((l) => l.action)).toEqual([
      'imovel.publicado',
      'imovel.despublicado',
    ]);
    expect(linhas[1].metadata).toMatchObject({ status: 'AVAILABLE' });
  });

  it('a publicação recusada não gera Activity', async () => {
    await prisma.property.update({
      where: { id: cenario.imovelDeA1 },
      data: { status: 'SOLD' },
    });

    await publicar(cenario.imovelDeA1, cenario.agenteA1.cookie);

    expect(await auditoriaDe(cenario.imovelDeA1)).toHaveLength(0);
  });

  it('a tentativa de outra organização não gera Activity', async () => {
    await publicar(cenario.imovelDeA1, cenario.ownerB.cookie);

    expect(await prisma.activity.count()).toBe(0);
  });
});
