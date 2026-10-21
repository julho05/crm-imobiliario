/**
 * Isolamento multi-tenant do **funil** — regra de ouro do
 * [permissions.md](../../../../docs/permissions.md) §8.6 aplicada ao item B7.
 *
 * ## Por que o funil merece atenção extra
 *
 * Porque ele é o recurso com **mais caminhos indiretos** até um dado alheio. A
 * negociação não carrega só o próprio id: ela traz o nome do cliente, o código
 * do imóvel e o nome de dois responsáveis. Cada um desses campos é uma porta,
 * e cada porta precisa de um teste:
 *
 * - o `leadId` do corpo, na abertura
 * - o `imovelId` do corpo, na abertura e na edição
 * - o `etapaId` do corpo, na abertura e ao mover
 * - o `membershipId` do corpo, na atribuição
 * - o id da própria negociação, em cinco rotas
 * - os **números do resumo**, que somam sem devolver registro nenhum
 *
 * O resumo é o mais fácil de esquecer: ele não devolve nenhum dado de
 * negociação, só contagens. Mas uma contagem que somasse a outra organização
 * diria quantos negócios ela tem — e isso é informação dela.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
  type EtapaDeTeste,
} from '../apoio/cenario-de-duas-organizacoes';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;

/** Uma negociação em cada organização, aberta pelo proprietário de cada uma. */
let negociacaoDeA: string;
let negociacaoDeB: string;

function obter(caminho: string, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    headers: cookie ? { cookie } : {},
  });
}

function enviar(
  metodo: 'POST' | 'PATCH' | 'DELETE',
  caminho: string,
  cookie?: string,
  corpo?: unknown,
) {
  return fetch(`${app.url}/api${caminho}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

function etapa(nome: string, etapas: EtapaDeTeste[]) {
  const encontrada = etapas.find((e) => e.nome === nome);

  if (!encontrada) {
    throw new Error(`Etapa "${nome}" nao existe no cenario.`);
  }

  return encontrada;
}

async function abrir(cookie: string, leadId: string): Promise<string> {
  const resposta = await enviar('POST', '/negociacoes', cookie, { leadId });

  expect(resposta.status).toBe(201);

  return ((await resposta.json()) as { id: string }).id;
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

  negociacaoDeA = await abrir(cenario.ownerA.cookie, cenario.leadDeA1);
  negociacaoDeB = await abrir(cenario.ownerB.cookie, cenario.leadDeB);
});

describe('§8.2 — travessia por ID direto, nas cinco rotas', () => {
  it('ler negociação da org A como membro da org B responde 404', async () => {
    const resposta = await obter(
      `/negociacoes/${negociacaoDeA}`,
      cenario.ownerB.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('editar responde 404 e não escreve', async () => {
    const resposta = await enviar(
      'PATCH',
      `/negociacoes/${negociacaoDeA}`,
      cenario.ownerB.cookie,
      { valorEsperado: 1 },
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.deal.findUniqueOrThrow({
      where: { id: negociacaoDeA },
      select: { expectedAmount: true },
    });

    expect(noBanco.expectedAmount).toBeNull();
  });

  it('mover de etapa responde 404 e não escreve', async () => {
    const antes = await prisma.deal.findUniqueOrThrow({
      where: { id: negociacaoDeA },
      select: { stageId: true },
    });

    const resposta = await enviar(
      'POST',
      `/negociacoes/${negociacaoDeA}/etapa`,
      cenario.ownerB.cookie,
      { etapaId: etapa('Proposta', cenario.etapasDeB).id },
    );

    expect(resposta.status).toBe(404);

    const depois = await prisma.deal.findUniqueOrThrow({
      where: { id: negociacaoDeA },
      select: { stageId: true },
    });

    expect(depois.stageId).toBe(antes.stageId);
  });

  it('atribuir responde 404 e não escreve', async () => {
    const resposta = await enviar(
      'POST',
      `/negociacoes/${negociacaoDeA}/responsavel`,
      cenario.ownerB.cookie,
      { membershipId: cenario.agenteB1.membershipId },
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.deal.findUniqueOrThrow({
      where: { id: negociacaoDeA },
      select: { assignedMemberId: true },
    });

    expect(noBanco.assignedMemberId).toBe(cenario.agenteA1.membershipId);
  });

  it('excluir responde 404 e não escreve', async () => {
    const resposta = await enviar(
      'DELETE',
      `/negociacoes/${negociacaoDeA}`,
      cenario.ownerB.cookie,
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.deal.findUniqueOrThrow({
      where: { id: negociacaoDeA },
      select: { deletedAt: true },
    });

    expect(noBanco.deletedAt).toBeNull();
  });

  it('o 404 da travessia é indistinguível do de registro inexistente', async () => {
    const daOutraOrganizacao = await obter(
      `/negociacoes/${negociacaoDeA}`,
      cenario.ownerB.cookie,
    );

    const inexistente = await obter(
      '/negociacoes/clzzzzzzzzzzzzzzzzzzzzzzz',
      cenario.ownerB.cookie,
    );

    expect(daOutraOrganizacao.status).toBe(inexistente.status);
    expect(await daOutraOrganizacao.text()).toBe(await inexistente.text());
  });

  it('o dono alcança a mesma negociação: o 404 não é geral', async () => {
    const resposta = await obter(
      `/negociacoes/${negociacaoDeA}`,
      cenario.ownerA.cookie,
    );

    expect(resposta.status).toBe(200);
  });
});

describe('§8.2 — travessia pelo corpo da requisição', () => {
  it('abrir negociação com cliente de outra organização responde 404', async () => {
    const antes = await prisma.deal.count();

    const resposta = await enviar(
      'POST',
      '/negociacoes',
      cenario.ownerA.cookie,
      {
        leadId: cenario.leadDeB,
      },
    );

    expect(resposta.status).toBe(404);
    expect(await prisma.deal.count()).toBe(antes);
  });

  it('abrir com imóvel de outra organização responde 404', async () => {
    const resposta = await enviar(
      'POST',
      '/negociacoes',
      cenario.ownerA.cookie,
      {
        leadId: cenario.leadDeA2,
        imovelId: cenario.imovelDeB,
      },
    );

    expect(resposta.status).toBe(404);
  });

  it('abrir com etapa de outra organização responde 404', async () => {
    const resposta = await enviar(
      'POST',
      '/negociacoes',
      cenario.ownerA.cookie,
      {
        leadId: cenario.leadDeA2,
        etapaId: etapa('Novo', cenario.etapasDeB).id,
      },
    );

    expect(resposta.status).toBe(404);
  });

  it('vincular imóvel de outra organização na edição responde 404', async () => {
    const resposta = await enviar(
      'PATCH',
      `/negociacoes/${negociacaoDeA}`,
      cenario.ownerA.cookie,
      { imovelId: cenario.imovelDeB },
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.deal.findUniqueOrThrow({
      where: { id: negociacaoDeA },
      select: { propertyId: true },
    });

    expect(noBanco.propertyId).toBeNull();
  });

  it('mover para etapa de outra organização responde 404', async () => {
    const resposta = await enviar(
      'POST',
      `/negociacoes/${negociacaoDeA}/etapa`,
      cenario.ownerA.cookie,
      { etapaId: etapa('Proposta', cenario.etapasDeB).id },
    );

    expect(resposta.status).toBe(404);
  });

  it('atribuir a membro de outra organização é recusado', async () => {
    const resposta = await enviar(
      'POST',
      `/negociacoes/${negociacaoDeA}/responsavel`,
      cenario.ownerA.cookie,
      { membershipId: cenario.agenteB1.membershipId },
    );

    // Recusa porque esse membro não é responsável pelo cliente — regra que
    // também fecha a travessia, porque ninguém de outra organização pode ser.
    expect(resposta.status).toBe(400);

    const noBanco = await prisma.deal.findUniqueOrThrow({
      where: { id: negociacaoDeA },
      select: { assignedMemberId: true },
    });

    expect(noBanco.assignedMemberId).toBe(cenario.agenteA1.membershipId);
  });
});

describe('§8.2 — travessia pela listagem e pelos números', () => {
  it('a listagem de B não traz negociação de A', async () => {
    const resposta = await obter('/negociacoes', cenario.ownerB.cookie);
    const corpo = (await resposta.json()) as {
      negociacoes: { id: string }[];
      total: number;
    };

    expect(corpo.total).toBe(1);
    expect(corpo.negociacoes[0].id).toBe(negociacaoDeB);
  });

  it('o resumo não soma a outra organização', async () => {
    const resposta = await obter('/negociacoes/resumo', cenario.ownerB.cookie);
    const { etapas } = (await resposta.json()) as {
      etapas: { nome: string; quantidade: number }[];
    };

    // A porta mais fácil de esquecer: o resumo não devolve registro nenhum, só
    // contagens — e uma contagem errada diria quantos negócios A tem.
    const total = etapas.reduce((soma, e) => soma + e.quantidade, 0);
    expect(total).toBe(1);
  });

  it('as etapas listadas são as da organização ativa', async () => {
    const resposta = await obter('/negociacoes/etapas', cenario.ownerB.cookie);
    const { etapas } = (await resposta.json()) as { etapas: { id: string }[] };

    const idsDeB = cenario.etapasDeB.map((e) => e.id).sort();

    expect(etapas.map((e) => e.id).sort()).toEqual(idsDeB);
  });

  it('filtrar por etapa da outra organização não devolve nada', async () => {
    const resposta = await obter(
      `/negociacoes?etapaId=${etapa('Novo', cenario.etapasDeA).id}`,
      cenario.ownerB.cookie,
    );

    expect(((await resposta.json()) as { total: number }).total).toBe(0);
  });

  it('filtrar por cliente da outra organização não devolve nada', async () => {
    const resposta = await obter(
      `/negociacoes?leadId=${cenario.leadDeA1}`,
      cenario.ownerB.cookie,
    );

    expect(((await resposta.json()) as { total: number }).total).toBe(0);
  });

  it('paginar não escapa do filtro por organização', async () => {
    const resposta = await obter(
      '/negociacoes?porPagina=100',
      cenario.ownerB.cookie,
    );

    expect(
      ((await resposta.json()) as { negociacoes: unknown[] }).negociacoes,
    ).toHaveLength(1);
  });
});

describe('§8.4 — organização ativa e revogação', () => {
  it('a pessoa com dois vínculos não alcança a negociação de B com A ativa', async () => {
    const resposta = await obter(
      `/negociacoes/${negociacaoDeB}`,
      cenario.dual.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('organizationId na query é ignorado', async () => {
    const resposta = await obter(
      `/negociacoes?organizationId=${cenario.organizacaoB}`,
      cenario.dual.cookie,
    );

    // Ela é AGENT em A e não tem lead atribuído lá, então o escopo OWN não lhe
    // dá nenhuma negociação — e empurrar B não muda isso.
    expect(((await resposta.json()) as { total: number }).total).toBe(0);
  });

  it('A6 — suspender o membro corta o acesso ao funil na hora', async () => {
    expect((await obter('/negociacoes', cenario.ownerA.cookie)).status).toBe(
      200,
    );

    await prisma.membership.update({
      where: { id: cenario.ownerA.membershipId },
      data: { status: 'SUSPENDED' },
    });

    expect((await obter('/negociacoes', cenario.ownerA.cookie)).status).toBe(
      404,
    );
  });

  it('A6 — suspender a organização corta o acesso de todos', async () => {
    await prisma.organization.update({
      where: { id: cenario.organizacaoA },
      data: { status: 'SUSPENDED' },
    });

    expect((await obter('/negociacoes', cenario.ownerA.cookie)).status).toBe(
      404,
    );
    expect((await obter('/negociacoes', cenario.ownerB.cookie)).status).toBe(
      200,
    );
  });

  it('sem sessão responde 401', async () => {
    const resposta = await obter('/negociacoes', 'sessao=inventada');

    expect(resposta.status).toBe(401);
  });
});

describe('§8.2 — a escrita cruzada não deixa rastro', () => {
  it('a tentativa de travessia não gera Activity', async () => {
    const antes = await prisma.activity.count();

    await enviar(
      'PATCH',
      `/negociacoes/${negociacaoDeA}`,
      cenario.ownerB.cookie,
      { valorEsperado: 1 },
    );

    expect(await prisma.activity.count()).toBe(antes);
  });

  it('a auditoria fica na organização de quem escreveu', async () => {
    await enviar(
      'PATCH',
      `/negociacoes/${negociacaoDeB}`,
      cenario.ownerB.cookie,
      { valorEsperado: 350_000 },
    );

    const linhas = await prisma.activity.findMany({
      where: { entityId: negociacaoDeB, action: 'negociacao.editada' },
      select: { organizationId: true, actorMembershipId: true },
    });

    expect(linhas).toHaveLength(1);
    expect(linhas[0].organizationId).toBe(cenario.organizacaoB);
    expect(linhas[0].actorMembershipId).toBe(cenario.ownerB.membershipId);
  });
});
