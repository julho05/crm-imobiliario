/**
 * Administracao da equipe — lista com detalhes, troca de papel e remocao.
 *
 * O risco central e escalada de privilegio: o §4.4 do
 * [permissions.md](../../../../docs/permissions.md) tem tres regras inviolaveis,
 * e cada uma aparece aqui como requisicao HTTP contra a rota de producao, nao
 * como chamada a funcao. `podeAgirSobreMembro` ja tem teste unitario em
 * `@app/shared`; o que se prova aqui e que a rota se lembra de chama-la.
 *
 * O segundo risco e transferencia pela metade: membro removido com registro
 * ainda atribuido a ele. Por isso a remocao confere o banco depois, tabela por
 * tabela, e confere que a recusa nao deixou nada pela metade.
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

type MembroDetalhado = {
  membershipId: string;
  nome: string;
  papel: string;
  situacao: string;
  euMesmo: boolean;
  email?: string;
  entrouEm?: string;
  carteira?: Record<string, number>;
  podeAlterarPapel?: boolean;
  podeRemover?: boolean;
};

function chamar(
  metodo: string,
  caminho: string,
  cookie: string,
  corpo?: unknown,
) {
  return fetch(`${app.url}/api${caminho}`, {
    method: metodo,
    headers: {
      cookie,
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

async function detalhes(cookie: string): Promise<MembroDetalhado[]> {
  const resposta = await chamar('GET', '/equipe/membros/detalhes', cookie);

  expect(resposta.status).toBe(200);

  return ((await resposta.json()) as { membros: MembroDetalhado[] }).membros;
}

function alterarPapel(cookie: string, membershipId: string, papel: string) {
  return chamar('PATCH', `/equipe/membros/${membershipId}/papel`, cookie, {
    papel,
  });
}

function remover(
  cookie: string,
  membershipId: string,
  destinoMembershipId?: string,
) {
  return chamar(
    'POST',
    `/equipe/membros/${membershipId}/remover`,
    cookie,
    destinoMembershipId === undefined ? {} : { destinoMembershipId },
  );
}

async function papelNoBanco(membershipId: string) {
  return prisma.membership.findUniqueOrThrow({
    where: { id: membershipId },
    select: { role: true, status: true },
  });
}

/**
 * Carteira completa para o `agenteA1`: alem do imovel e do lead do cenario,
 * uma negociacao, uma visita e uma tarefa pendentes — e uma visita realizada,
 * uma tarefa concluida e um lead excluido, que **nao** devem mudar de dono.
 */
async function montarCarteiraDoA1() {
  const negociacao = await prisma.deal.create({
    data: {
      organizationId: cenario.organizacaoA,
      leadId: cenario.leadDeA1,
      stageId: cenario.etapasDeA[0].id,
      assignedMemberId: cenario.agenteA1.membershipId,
    },
    select: { id: true },
  });

  const inicio = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000);

  const visitaPendente = await prisma.visit.create({
    data: {
      organizationId: cenario.organizacaoA,
      propertyId: cenario.imovelDeA1,
      leadId: cenario.leadDeA1,
      assignedMemberId: cenario.agenteA1.membershipId,
      startsAt: inicio,
      endsAt: fim,
    },
    select: { id: true },
  });

  const visitaRealizada = await prisma.visit.create({
    data: {
      organizationId: cenario.organizacaoA,
      propertyId: cenario.imovelDeA1,
      assignedMemberId: cenario.agenteA1.membershipId,
      startsAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 47 * 60 * 60 * 1000),
      status: 'DONE',
    },
    select: { id: true },
  });

  const tarefaAberta = await prisma.task.create({
    data: {
      organizationId: cenario.organizacaoA,
      assignedMemberId: cenario.agenteA1.membershipId,
      title: 'Ligar para o cliente',
    },
    select: { id: true },
  });

  const tarefaConcluida = await prisma.task.create({
    data: {
      organizationId: cenario.organizacaoA,
      assignedMemberId: cenario.agenteA1.membershipId,
      title: 'Enviar fotos',
      status: 'DONE',
      completedAt: new Date(),
    },
    select: { id: true },
  });

  const leadExcluido = await prisma.lead.create({
    data: {
      organizationId: cenario.organizacaoA,
      fullName: 'Cliente excluido',
      phone: '11988887777',
      source: 'MANUAL',
      assignedMemberId: cenario.agenteA1.membershipId,
      deletedAt: new Date(),
    },
    select: { id: true },
  });

  return {
    negociacao: negociacao.id,
    visitaPendente: visitaPendente.id,
    visitaRealizada: visitaRealizada.id,
    tarefaAberta: tarefaAberta.id,
    tarefaConcluida: tarefaConcluida.id,
    leadExcluido: leadExcluido.id,
  };
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

describe('GET /equipe/membros/detalhes', () => {
  it('quem administra recebe e-mail, entrada e carteira', async () => {
    const lista = await detalhes(cenario.ownerA.cookie);
    const a1 = lista.find(
      (m) => m.membershipId === cenario.agenteA1.membershipId,
    )!;

    expect(a1.email).toBe('agente-a1@exemplo.com');
    expect(a1.entrouEm).toEqual(expect.any(String));
    expect(a1.carteira).toEqual({
      imoveis: 1,
      clientes: 1,
      negociacoes: 0,
      visitas: 0,
      tarefas: 0,
    });
  });

  it('a carteira conta só o que a remoção transfere', async () => {
    await montarCarteiraDoA1();

    const lista = await detalhes(cenario.adminA.cookie);
    const a1 = lista.find(
      (m) => m.membershipId === cenario.agenteA1.membershipId,
    )!;

    // Visita realizada, tarefa concluída e lead excluído ficam de fora: são
    // os mesmos que a remoção deixa onde estão.
    expect(a1.carteira).toEqual({
      imoveis: 1,
      clientes: 1,
      negociacoes: 1,
      visitas: 1,
      tarefas: 1,
    });
  });

  it.each([
    ['corretor', 'agenteA1'],
    ['gerente', 'managerA'],
  ] as const)(
    'o %s não recebe e-mail nem carteira de ninguém',
    async (_rotulo, quem) => {
      const resposta = await chamar(
        'GET',
        '/equipe/membros/detalhes',
        cenario[quem].cookie,
      );
      const corpo = await resposta.text();

      expect(resposta.status).toBe(200);
      expect(corpo).not.toContain('@exemplo.com');
      expect(corpo).not.toContain('carteira');
      expect(corpo).not.toContain('entrouEm');
    },
  );

  it('suspenso aparece para quem administra, e só para ele', async () => {
    await prisma.membership.update({
      where: { id: cenario.agenteA2.membershipId },
      data: { status: 'SUSPENDED' },
    });

    const doOwner = await detalhes(cenario.ownerA.cookie);
    const doAgente = await detalhes(cenario.agenteA1.cookie);

    const a2 = doOwner.find(
      (m) => m.membershipId === cenario.agenteA2.membershipId,
    );

    expect(a2?.situacao).toBe('SUSPENDED');
    expect(a2?.podeRemover).toBe(false);
    expect(a2?.podeAlterarPapel).toBe(false);
    expect(doAgente.map((m) => m.nome)).not.toContain('Agente A2');
  });

  it('as ações oferecidas seguem as regras do §4.4', async () => {
    const lista = await detalhes(cenario.adminA.cookie);
    const acoes = (id: string) => {
      const membro = lista.find((m) => m.membershipId === id)!;
      return [membro.podeAlterarPapel, membro.podeRemover];
    };

    // ADMIN não toca OWNER, nem a si mesmo; toca gerente e corretor.
    expect(acoes(cenario.ownerA.membershipId)).toEqual([false, false]);
    expect(acoes(cenario.adminA.membershipId)).toEqual([false, false]);
    expect(acoes(cenario.managerA.membershipId)).toEqual([true, true]);
    expect(acoes(cenario.agenteA1.membershipId)).toEqual([true, true]);
  });

  it('§8.2 — a equipe de B não traz ninguém de A', async () => {
    const lista = await detalhes(cenario.ownerB.cookie);

    expect(lista.map((m) => m.nome).sort()).toEqual([
      'Agente B1',
      'Owner B',
      'Pessoa Dupla',
    ]);
  });
});

describe('PATCH /equipe/membros/:id/papel', () => {
  it('o proprietário promove um corretor a gerente, com auditoria', async () => {
    const resposta = await alterarPapel(
      cenario.ownerA.cookie,
      cenario.agenteA1.membershipId,
      'MANAGER',
    );

    expect(resposta.status).toBe(200);
    expect((await papelNoBanco(cenario.agenteA1.membershipId)).role).toBe(
      'MANAGER',
    );

    const registro = await prisma.activity.findFirst({
      where: {
        entityId: cenario.agenteA1.membershipId,
        action: 'membro.papelAlterado',
      },
    });

    expect(registro?.actorMembershipId).toBe(cenario.ownerA.membershipId);
    expect(registro?.metadata).toEqual({ de: 'AGENT', para: 'MANAGER' });
  });

  it('o novo papel vale na requisição seguinte', async () => {
    await alterarPapel(
      cenario.ownerA.cookie,
      cenario.managerA.membershipId,
      'AGENT',
    );

    // Gerente convida corretor; corretor não convida ninguém.
    const convite = await chamar(
      'POST',
      '/equipe/convites',
      cenario.managerA.cookie,
      { email: 'novo@exemplo.com', papel: 'AGENT' },
    );

    expect(convite.status).toBe(403);
  });

  it('o administrador não promove ninguém a administrador', async () => {
    // Seria contornar em dois passos a hierarquia do convite.
    const resposta = await alterarPapel(
      cenario.adminA.cookie,
      cenario.managerA.membershipId,
      'ADMIN',
    );

    expect(resposta.status).toBe(403);
    expect((await papelNoBanco(cenario.managerA.membershipId)).role).toBe(
      'MANAGER',
    );
  });

  it('o proprietário promove a administrador', async () => {
    const resposta = await alterarPapel(
      cenario.ownerA.cookie,
      cenario.managerA.membershipId,
      'ADMIN',
    );

    expect(resposta.status).toBe(200);
  });

  it('regra 1 — o administrador não altera outro administrador', async () => {
    await prisma.membership.update({
      where: { id: cenario.agenteA2.membershipId },
      data: { role: 'ADMIN' },
    });

    const resposta = await alterarPapel(
      cenario.adminA.cookie,
      cenario.agenteA2.membershipId,
      'AGENT',
    );

    expect(resposta.status).toBe(403);
    expect((await papelNoBanco(cenario.agenteA2.membershipId)).role).toBe(
      'ADMIN',
    );
  });

  it('regra 2 — ninguém altera o próprio papel, nem o proprietário', async () => {
    const doOwner = await alterarPapel(
      cenario.ownerA.cookie,
      cenario.ownerA.membershipId,
      'ADMIN',
    );
    const doAdmin = await alterarPapel(
      cenario.adminA.cookie,
      cenario.adminA.membershipId,
      'MANAGER',
    );

    expect(doOwner.status).toBe(403);
    expect(doAdmin.status).toBe(403);
    expect((await papelNoBanco(cenario.ownerA.membershipId)).role).toBe(
      'OWNER',
    );
  });

  it('regra 3 — o administrador não rebaixa o proprietário', async () => {
    const resposta = await alterarPapel(
      cenario.adminA.cookie,
      cenario.ownerA.membershipId,
      'AGENT',
    );

    expect(resposta.status).toBe(403);
  });

  it('ninguém vira proprietário por esta rota', async () => {
    const resposta = await alterarPapel(
      cenario.ownerA.cookie,
      cenario.adminA.membershipId,
      'OWNER',
    );

    expect(resposta.status).toBe(400);
    expect((await papelNoBanco(cenario.adminA.membershipId)).role).toBe(
      'ADMIN',
    );
  });

  it.each(['managerA', 'agenteA1'] as const)(
    '%s não altera papel de ninguém',
    async (quem) => {
      const resposta = await alterarPapel(
        cenario[quem].cookie,
        cenario.agenteA2.membershipId,
        'MANAGER',
      );

      expect(resposta.status).toBe(403);
    },
  );

  it('§8.2 — membro de outra organização responde 404', async () => {
    const resposta = await alterarPapel(
      cenario.ownerA.cookie,
      cenario.agenteB1.membershipId,
      'MANAGER',
    );

    expect(resposta.status).toBe(404);
    expect((await papelNoBanco(cenario.agenteB1.membershipId)).role).toBe(
      'AGENT',
    );
  });

  it('§8.2 — o vínculo da pessoa dupla em B não é alcançável a partir de A', async () => {
    const resposta = await alterarPapel(
      cenario.ownerA.cookie,
      cenario.dual.membershipEmB,
      'MANAGER',
    );

    expect(resposta.status).toBe(404);
  });

  it('membro removido não muda de papel', async () => {
    await prisma.membership.update({
      where: { id: cenario.agenteA2.membershipId },
      data: { status: 'SUSPENDED' },
    });

    const resposta = await alterarPapel(
      cenario.ownerA.cookie,
      cenario.agenteA2.membershipId,
      'MANAGER',
    );

    expect(resposta.status).toBe(409);
  });
});

describe('POST /equipe/membros/:id/remover', () => {
  it('suspende e passa toda a carteira ao destino, numa operação só', async () => {
    const extra = await montarCarteiraDoA1();

    const resposta = await remover(
      cenario.ownerA.cookie,
      cenario.agenteA1.membershipId,
      cenario.agenteA2.membershipId,
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      transferidos: {
        imoveis: 1,
        clientes: 1,
        negociacoes: 1,
        visitas: 1,
        tarefas: 1,
      },
    });

    const destino = cenario.agenteA2.membershipId;

    expect((await papelNoBanco(cenario.agenteA1.membershipId)).status).toBe(
      'SUSPENDED',
    );
    expect(
      (
        await prisma.property.findUniqueOrThrow({
          where: { id: cenario.imovelDeA1 },
        })
      ).ownerMemberId,
    ).toBe(destino);
    expect(
      (await prisma.lead.findUniqueOrThrow({ where: { id: cenario.leadDeA1 } }))
        .assignedMemberId,
    ).toBe(destino);
    expect(
      (await prisma.deal.findUniqueOrThrow({ where: { id: extra.negociacao } }))
        .assignedMemberId,
    ).toBe(destino);
    expect(
      (
        await prisma.visit.findUniqueOrThrow({
          where: { id: extra.visitaPendente },
        })
      ).assignedMemberId,
    ).toBe(destino);
    expect(
      (
        await prisma.task.findUniqueOrThrow({
          where: { id: extra.tarefaAberta },
        })
      ).assignedMemberId,
    ).toBe(destino);
  });

  it('o histórico continua dizendo quem fez', async () => {
    const extra = await montarCarteiraDoA1();

    await remover(
      cenario.ownerA.cookie,
      cenario.agenteA1.membershipId,
      cenario.agenteA2.membershipId,
    );

    const quemSaiu = cenario.agenteA1.membershipId;

    expect(
      (
        await prisma.visit.findUniqueOrThrow({
          where: { id: extra.visitaRealizada },
        })
      ).assignedMemberId,
    ).toBe(quemSaiu);
    expect(
      (
        await prisma.task.findUniqueOrThrow({
          where: { id: extra.tarefaConcluida },
        })
      ).assignedMemberId,
    ).toBe(quemSaiu);
    expect(
      (
        await prisma.lead.findUniqueOrThrow({
          where: { id: extra.leadExcluido },
        })
      ).assignedMemberId,
    ).toBe(quemSaiu);
  });

  it('A6 — quem foi removido perde o acesso na requisição seguinte', async () => {
    await remover(
      cenario.ownerA.cookie,
      cenario.agenteA1.membershipId,
      cenario.agenteA2.membershipId,
    );

    const resposta = await chamar(
      'GET',
      '/equipe/membros',
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('o destino passa a ver o cliente que recebeu', async () => {
    await remover(
      cenario.ownerA.cookie,
      cenario.agenteA1.membershipId,
      cenario.agenteA2.membershipId,
    );

    const resposta = await chamar(
      'GET',
      `/leads/${cenario.leadDeA1}`,
      cenario.agenteA2.cookie,
    );

    expect(resposta.status).toBe(200);
  });

  it('registra a remoção na auditoria, com o destino e as contagens', async () => {
    await remover(
      cenario.adminA.cookie,
      cenario.agenteA1.membershipId,
      cenario.managerA.membershipId,
    );

    const registro = await prisma.activity.findFirst({
      where: {
        entityId: cenario.agenteA1.membershipId,
        action: 'membro.removido',
      },
    });

    expect(registro?.actorMembershipId).toBe(cenario.adminA.membershipId);
    expect(registro?.metadata).toMatchObject({
      papel: 'AGENT',
      destino: cenario.managerA.membershipId,
      imoveis: 1,
      clientes: 1,
    });
  });

  it('com carteira, exige destino — e a recusa não deixa nada pela metade', async () => {
    const resposta = await remover(
      cenario.ownerA.cookie,
      cenario.agenteA1.membershipId,
    );

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({
      erros: [{ campo: 'destinoMembershipId' }],
    });
    // A suspensão acontece dentro da transação; a recusa a desfaz.
    expect((await papelNoBanco(cenario.agenteA1.membershipId)).status).toBe(
      'ACTIVE',
    );
  });

  it('sem carteira, não precisa de destino', async () => {
    const resposta = await remover(
      cenario.ownerA.cookie,
      cenario.managerA.membershipId,
    );

    expect(resposta.status).toBe(200);
    expect((await papelNoBanco(cenario.managerA.membershipId)).status).toBe(
      'SUSPENDED',
    );
  });

  it.each([
    ['a própria pessoa removida', () => cenario.agenteA1.membershipId],
    ['membro de outra organização', () => cenario.agenteB1.membershipId],
    ['o vínculo da pessoa dupla em B', () => cenario.dual.membershipEmB],
    ['identificador inventado', () => 'c'.repeat(25)],
  ])('destino inválido (%s) responde 404 e não muda nada', async (_r, id) => {
    const resposta = await remover(
      cenario.ownerA.cookie,
      cenario.agenteA1.membershipId,
      id(),
    );

    expect(resposta.status).toBe(404);
    expect((await papelNoBanco(cenario.agenteA1.membershipId)).status).toBe(
      'ACTIVE',
    );
    expect(
      (await prisma.lead.findUniqueOrThrow({ where: { id: cenario.leadDeA1 } }))
        .assignedMemberId,
    ).toBe(cenario.agenteA1.membershipId);
  });

  it('destino suspenso responde 404', async () => {
    await prisma.membership.update({
      where: { id: cenario.agenteA2.membershipId },
      data: { status: 'SUSPENDED' },
    });

    const resposta = await remover(
      cenario.ownerA.cookie,
      cenario.agenteA1.membershipId,
      cenario.agenteA2.membershipId,
    );

    expect(resposta.status).toBe(404);
  });

  it('regra 3 — o proprietário não é removível', async () => {
    const doAdmin = await remover(
      cenario.adminA.cookie,
      cenario.ownerA.membershipId,
      cenario.adminA.membershipId,
    );

    expect(doAdmin.status).toBe(403);
    expect((await papelNoBanco(cenario.ownerA.membershipId)).status).toBe(
      'ACTIVE',
    );
  });

  it('regra 2 — ninguém remove a si mesmo', async () => {
    const resposta = await remover(
      cenario.ownerA.cookie,
      cenario.ownerA.membershipId,
      cenario.adminA.membershipId,
    );

    expect(resposta.status).toBe(403);
  });

  it('regra 1 — o administrador não remove outro administrador', async () => {
    await prisma.membership.update({
      where: { id: cenario.agenteA2.membershipId },
      data: { role: 'ADMIN' },
    });

    const resposta = await remover(
      cenario.adminA.cookie,
      cenario.agenteA2.membershipId,
      cenario.managerA.membershipId,
    );

    expect(resposta.status).toBe(403);
  });

  it.each(['managerA', 'agenteA1'] as const)(
    '%s não remove ninguém',
    async (quem) => {
      const resposta = await remover(
        cenario[quem].cookie,
        cenario.agenteA2.membershipId,
        cenario.managerA.membershipId,
      );

      expect(resposta.status).toBe(403);
      expect((await papelNoBanco(cenario.agenteA2.membershipId)).status).toBe(
        'ACTIVE',
      );
    },
  );

  it('§8.2 — membro de outra organização responde 404', async () => {
    const resposta = await remover(
      cenario.ownerA.cookie,
      cenario.agenteB1.membershipId,
      cenario.agenteA2.membershipId,
    );

    expect(resposta.status).toBe(404);
    expect((await papelNoBanco(cenario.agenteB1.membershipId)).status).toBe(
      'ACTIVE',
    );
  });

  it('remover duas vezes responde 409', async () => {
    await remover(cenario.ownerA.cookie, cenario.managerA.membershipId);

    const segunda = await remover(
      cenario.ownerA.cookie,
      cenario.managerA.membershipId,
    );

    expect(segunda.status).toBe(409);
  });

  it('o seletor de responsável deixa de oferecer quem saiu', async () => {
    await remover(cenario.ownerA.cookie, cenario.managerA.membershipId);

    const resposta = await chamar(
      'GET',
      '/equipe/membros',
      cenario.ownerA.cookie,
    );
    const { membros } = (await resposta.json()) as {
      membros: { nome: string }[];
    };

    expect(membros.map((m) => m.nome)).not.toContain('Manager A');
  });
});
