/**
 * Isolamento multi-tenant da **agenda** — regra de ouro do
 * [permissions.md](../../../../docs/permissions.md) §8.6 aplicada ao item B8.
 *
 * ## Por que a agenda tem mais portas que os itens anteriores
 *
 * Uma visita referencia **imóvel, cliente e responsável**; uma tarefa
 * referencia **cliente, negociação, imóvel e responsável**. São sete campos que
 * chegam pelo corpo da requisição, e cada um é um caminho até um registro de
 * outra organização.
 *
 * E há uma porta que os itens anteriores não tinham: **a segunda porta da
 * visibilidade**. Ela foi aberta de propósito em 21/10/2026 — quem conduz a
 * visita a enxerga sem responder pelo cliente. Uma porta aberta de propósito
 * dentro da organização não pode virar uma fresta entre organizações, e é o que
 * o primeiro bloco verifica.
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

let visitaDeA: string;
let visitaDeB: string;
let tarefaDeA: string;

const JANELA = 'de=2026-01-01T00:00:00.000Z&ate=2026-06-01T00:00:00.000Z';
const INICIO = '2026-03-14T14:00:00.000Z';
const FIM = '2026-03-14T15:00:00.000Z';

function obter(caminho: string, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    headers: cookie ? { cookie } : {},
  });
}

function enviar(
  metodo: 'POST' | 'PATCH',
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

async function agendar(
  cookie: string,
  corpo: Record<string, unknown>,
): Promise<string> {
  const resposta = await enviar('POST', '/visitas', cookie, {
    inicioEm: INICIO,
    fimEm: FIM,
    ...corpo,
  });

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

  visitaDeA = await agendar(cenario.ownerA.cookie, {
    imovelId: cenario.imovelDeA1,
    clienteId: cenario.leadDeA1,
  });

  visitaDeB = await agendar(cenario.ownerB.cookie, {
    imovelId: cenario.imovelDeB,
    clienteId: cenario.leadDeB,
  });

  const tarefa = await enviar('POST', '/tarefas', cenario.ownerA.cookie, {
    titulo: 'Tarefa da organizacao A',
    clienteId: cenario.leadDeA1,
  });

  tarefaDeA = ((await tarefa.json()) as { id: string }).id;
});

describe('§8.2 — a segunda porta não atravessa organização', () => {
  it('ser responsável por visita não dá acesso entre organizações', async () => {
    // O cenário não permite atribuir alguém de B a uma visita de A — e é
    // exatamente isso que este caso verifica.
    const resposta = await enviar(
      'POST',
      `/visitas/${visitaDeA}/responsavel`,
      cenario.ownerA.cookie,
      { membershipId: cenario.agenteB1.membershipId },
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.visit.findUniqueOrThrow({
      where: { id: visitaDeA },
      select: { assignedMemberId: true },
    });

    expect(noBanco.assignedMemberId).toBe(cenario.ownerA.membershipId);
  });

  it('o mesmo vale para tarefas', async () => {
    const resposta = await enviar(
      'POST',
      `/tarefas/${tarefaDeA}/responsavel`,
      cenario.ownerA.cookie,
      { membershipId: cenario.agenteB1.membershipId },
    );

    expect(resposta.status).toBe(404);
  });
});

describe('§8.2 — travessia por ID direto', () => {
  it('ler visita da org A como membro da org B responde 404', async () => {
    expect(
      (await obter(`/visitas/${visitaDeA}`, cenario.ownerB.cookie)).status,
    ).toBe(404);
  });

  it('ler tarefa da org A responde 404', async () => {
    expect(
      (await obter(`/tarefas/${tarefaDeA}`, cenario.ownerB.cookie)).status,
    ).toBe(404);
  });

  it('remarcar visita da org A responde 404 e não escreve', async () => {
    const resposta = await enviar(
      'PATCH',
      `/visitas/${visitaDeA}`,
      cenario.ownerB.cookie,
      {
        inicioEm: '2026-04-01T10:00:00.000Z',
        fimEm: '2026-04-01T11:00:00.000Z',
      },
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.visit.findUniqueOrThrow({
      where: { id: visitaDeA },
      select: { startsAt: true },
    });

    expect(noBanco.startsAt.toISOString()).toBe(INICIO);
  });

  it('mudar a situação da visita da org A responde 404', async () => {
    const resposta = await enviar(
      'POST',
      `/visitas/${visitaDeA}/situacao`,
      cenario.ownerB.cookie,
      { situacao: 'CANCELED' },
    );

    expect(resposta.status).toBe(404);
  });

  it('concluir tarefa da org A responde 404 e não escreve', async () => {
    const resposta = await enviar(
      'POST',
      `/tarefas/${tarefaDeA}/situacao`,
      cenario.ownerB.cookie,
      { situacao: 'DONE' },
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.task.findUniqueOrThrow({
      where: { id: tarefaDeA },
      select: { status: true },
    });

    expect(noBanco.status).toBe('OPEN');
  });

  it('o 404 da travessia é indistinguível do de registro inexistente', async () => {
    const daOutra = await obter(`/visitas/${visitaDeA}`, cenario.ownerB.cookie);
    const inexistente = await obter(
      '/visitas/clzzzzzzzzzzzzzzzzzzzzzzz',
      cenario.ownerB.cookie,
    );

    expect(daOutra.status).toBe(inexistente.status);
    expect(await daOutra.text()).toBe(await inexistente.text());
  });

  it('o dono alcança: o 404 não é geral', async () => {
    expect(
      (await obter(`/visitas/${visitaDeA}`, cenario.ownerA.cookie)).status,
    ).toBe(200);
    expect(
      (await obter(`/tarefas/${tarefaDeA}`, cenario.ownerA.cookie)).status,
    ).toBe(200);
  });
});

describe('§8.2 — travessia pelo corpo da requisição', () => {
  it('agendar com imóvel de outra organização responde 404', async () => {
    const antes = await prisma.visit.count();

    const resposta = await enviar('POST', '/visitas', cenario.ownerA.cookie, {
      imovelId: cenario.imovelDeB,
      inicioEm: INICIO,
      fimEm: FIM,
    });

    expect(resposta.status).toBe(404);
    expect(await prisma.visit.count()).toBe(antes);
  });

  it('agendar com cliente de outra organização responde 404', async () => {
    const resposta = await enviar('POST', '/visitas', cenario.ownerA.cookie, {
      imovelId: cenario.imovelDeA1,
      clienteId: cenario.leadDeB,
      inicioEm: INICIO,
      fimEm: FIM,
    });

    expect(resposta.status).toBe(404);
  });

  it('agendar com responsável de outra organização responde 404', async () => {
    const resposta = await enviar('POST', '/visitas', cenario.ownerA.cookie, {
      imovelId: cenario.imovelDeA1,
      responsavelId: cenario.agenteB1.membershipId,
      inicioEm: INICIO,
      fimEm: FIM,
    });

    expect(resposta.status).toBe(404);
  });

  it('tarefa com cliente, negociação ou imóvel de outra organização responde 404', async () => {
    const negociacaoDeB = await enviar(
      'POST',
      '/negociacoes',
      cenario.ownerB.cookie,
      { leadId: cenario.leadDeB },
    );

    const { id: negociacaoId } = (await negociacaoDeB.json()) as {
      id: string;
    };

    const casos: Record<string, unknown>[] = [
      { clienteId: cenario.leadDeB },
      { negociacaoId },
      { imovelId: cenario.imovelDeB },
    ];

    for (const caso of casos) {
      const resposta = await enviar('POST', '/tarefas', cenario.ownerA.cookie, {
        titulo: 'Tentativa de travessia',
        ...caso,
      });

      expect(resposta.status, JSON.stringify(caso)).toBe(404);
    }
  });
});

describe('§8.2 — travessia pela listagem', () => {
  it('a agenda de B não traz visita de A', async () => {
    const resposta = await obter(`/visitas?${JANELA}`, cenario.ownerB.cookie);
    const { visitas } = (await resposta.json()) as {
      visitas: { id: string }[];
    };

    expect(visitas).toHaveLength(1);
    expect(visitas[0].id).toBe(visitaDeB);
  });

  it('a lista de tarefas de B não traz tarefa de A', async () => {
    const resposta = await obter('/tarefas', cenario.ownerB.cookie);

    expect(((await resposta.json()) as { total: number }).total).toBe(0);
  });

  it('o contador de vencidas não soma a outra organização', async () => {
    await prisma.task.update({
      where: { id: tarefaDeA },
      data: { dueAt: new Date(Date.now() - 86_400_000) },
    });

    const deB = await obter(
      '/tarefas/vencidas/contagem',
      cenario.ownerB.cookie,
    );

    expect(((await deB.json()) as { total: number }).total).toBe(0);

    const deA = await obter(
      '/tarefas/vencidas/contagem',
      cenario.ownerA.cookie,
    );
    expect(((await deA.json()) as { total: number }).total).toBe(1);
  });

  it('filtrar por cliente da outra organização não devolve nada', async () => {
    const resposta = await obter(
      `/visitas?${JANELA}&clienteId=${cenario.leadDeA1}`,
      cenario.ownerB.cookie,
    );

    const { visitas } = (await resposta.json()) as { visitas: unknown[] };
    expect(visitas).toHaveLength(0);
  });

  it('filtrar por imóvel da outra organização não devolve nada', async () => {
    const resposta = await obter(
      `/visitas?${JANELA}&imovelId=${cenario.imovelDeA1}`,
      cenario.ownerB.cookie,
    );

    const { visitas } = (await resposta.json()) as { visitas: unknown[] };
    expect(visitas).toHaveLength(0);
  });
});

describe('§8.4 — organização ativa e revogação', () => {
  it('a pessoa com dois vínculos não alcança a visita de B com A ativa', async () => {
    expect(
      (await obter(`/visitas/${visitaDeB}`, cenario.dual.cookie)).status,
    ).toBe(404);
  });

  it('A6 — suspender o membro corta o acesso na hora', async () => {
    expect(
      (await obter(`/visitas?${JANELA}`, cenario.ownerA.cookie)).status,
    ).toBe(200);

    await prisma.membership.update({
      where: { id: cenario.ownerA.membershipId },
      data: { status: 'SUSPENDED' },
    });

    expect(
      (await obter(`/visitas?${JANELA}`, cenario.ownerA.cookie)).status,
    ).toBe(404);
  });

  it('A6 — suspender a organização corta o acesso de todos', async () => {
    await prisma.organization.update({
      where: { id: cenario.organizacaoA },
      data: { status: 'SUSPENDED' },
    });

    expect((await obter('/tarefas', cenario.ownerA.cookie)).status).toBe(404);
    expect((await obter('/tarefas', cenario.ownerB.cookie)).status).toBe(200);
  });

  it('sem sessão responde 401', async () => {
    expect((await obter(`/visitas?${JANELA}`, 'sessao=inventada')).status).toBe(
      401,
    );
  });
});

describe('§8.2 — a escrita cruzada não deixa rastro', () => {
  it('a tentativa de travessia não gera Activity', async () => {
    const antes = await prisma.activity.count();

    await enviar(
      'POST',
      `/visitas/${visitaDeA}/situacao`,
      cenario.ownerB.cookie,
      { situacao: 'CANCELED' },
    );

    expect(await prisma.activity.count()).toBe(antes);
  });

  it('a auditoria fica na organização de quem escreveu', async () => {
    await enviar(
      'POST',
      `/visitas/${visitaDeB}/situacao`,
      cenario.ownerB.cookie,
      { situacao: 'CONFIRMED' },
    );

    const linhas = await prisma.activity.findMany({
      where: { entityId: visitaDeB, action: 'visita.confirmada' },
      select: { organizationId: true, actorMembershipId: true },
    });

    expect(linhas).toHaveLength(1);
    expect(linhas[0].organizationId).toBe(cenario.organizacaoB);
    expect(linhas[0].actorMembershipId).toBe(cenario.ownerB.membershipId);
  });
});
