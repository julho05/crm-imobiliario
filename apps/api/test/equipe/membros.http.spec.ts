/**
 * `GET /equipe/membros` — a equipe da organização ativa.
 *
 * Nasceu como dependência da atribuição de leads (item B5): o seletor de
 * responsável não tinha de onde tirar a lista. Por isso entra com teste de
 * travessia no mesmo commit, como a regra de ouro do
 * [permissions.md](../../../../docs/permissions.md) §8.6 exige.
 *
 * O que ele **não** devolve é tão importante quanto o que devolve: sem e-mail.
 * O §4.4 dá ao `AGENT` acesso a "nome e papel" dos colegas, não à agenda de
 * contatos da imobiliária.
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

type Membro = {
  membershipId: string;
  nome: string;
  papel: string;
  euMesmo: boolean;
};

function obter(caminho: string, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    headers: cookie ? { cookie } : {},
  });
}

async function membros(cookie: string): Promise<Membro[]> {
  const resposta = await obter('/equipe/membros', cookie);

  expect(resposta.status).toBe(200);

  return ((await resposta.json()) as { membros: Membro[] }).membros;
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

describe('listagem', () => {
  it('devolve a equipe da organização ativa', async () => {
    const lista = await membros(cenario.managerA.cookie);

    // Org A do cenário: owner, admin, manager, dois agentes e a pessoa com
    // dois vínculos.
    expect(lista).toHaveLength(6);
    expect(lista.map((m) => m.nome).sort()).toEqual([
      'Admin A',
      'Agente A1',
      'Agente A2',
      'Manager A',
      'Owner A',
      'Pessoa Dupla',
    ]);
  });

  it('o corretor também vê a equipe: §4.4 lhe dá nome e papel', async () => {
    const resposta = await obter('/equipe/membros', cenario.agenteA1.cookie);

    expect(resposta.status).toBe(200);
  });

  it('não devolve e-mail de ninguém', async () => {
    const resposta = await obter('/equipe/membros', cenario.agenteA1.cookie);
    const corpo = await resposta.text();

    // Devolver e-mail aqui entregaria, a qualquer corretor, a agenda interna
    // da imobiliária.
    expect(corpo).not.toContain('@exemplo.com');
  });

  it('marca quem consultou', async () => {
    const lista = await membros(cenario.agenteA1.cookie);
    const eu = lista.filter((m) => m.euMesmo);

    expect(eu).toHaveLength(1);
    expect(eu[0].membershipId).toBe(cenario.agenteA1.membershipId);
  });

  it('membro suspenso fica fora', async () => {
    await prisma.membership.update({
      where: { id: cenario.agenteA2.membershipId },
      data: { status: 'SUSPENDED' },
    });

    const lista = await membros(cenario.managerA.cookie);

    // Ele não pode receber lead, e oferecê-lo no seletor produziria um 404 que
    // a pessoa não teria como explicar.
    expect(lista.map((m) => m.nome)).not.toContain('Agente A2');
    expect(lista).toHaveLength(5);
  });
});

describe('§8.2 — isolamento', () => {
  it('a equipe de B não traz ninguém de A', async () => {
    const lista = await membros(cenario.ownerB.cookie);

    expect(lista.map((m) => m.nome).sort()).toEqual([
      'Agente B1',
      'Owner B',
      'Pessoa Dupla',
    ]);
  });

  it('a pessoa com dois vínculos vê a equipe da organização ativa', async () => {
    const naOrgA = await membros(cenario.dual.cookie);

    expect(naOrgA).toHaveLength(6);
    expect(naOrgA.map((m) => m.nome)).toContain('Owner A');
    expect(naOrgA.map((m) => m.nome)).not.toContain('Owner B');
  });

  it('trocar a organização ativa muda a equipe na requisição seguinte', async () => {
    await fetch(`${app.url}/api/autenticacao/organizacao-ativa`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cenario.dual.cookie,
      },
      body: JSON.stringify({ organizationId: cenario.organizacaoB }),
    });

    const naOrgB = await membros(cenario.dual.cookie);

    expect(naOrgB.map((m) => m.nome)).toContain('Owner B');
    expect(naOrgB.map((m) => m.nome)).not.toContain('Owner A');
  });

  it('sem sessão responde 401', async () => {
    const resposta = await obter('/equipe/membros', 'sessao=inventada');

    expect(resposta.status).toBe(401);
  });

  it('A6 — suspender o membro corta o acesso na hora', async () => {
    await prisma.membership.update({
      where: { id: cenario.agenteA1.membershipId },
      data: { status: 'SUSPENDED' },
    });

    const resposta = await obter('/equipe/membros', cenario.agenteA1.cookie);

    expect(resposta.status).toBe(404);
  });
});
