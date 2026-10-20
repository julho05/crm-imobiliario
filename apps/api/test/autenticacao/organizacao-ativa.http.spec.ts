/**
 * Item A7: a organização ativa vem da sessão, e trocá-la passa pelo servidor.
 *
 * O ponto destes testes não é a troca funcionar — é ela **recusar**. Um
 * endpoint que aceita `organizationId` arbitrário é exatamente o lugar onde a
 * travessia entre organizações entra, se a conferência do vínculo falhar.
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

function obter(caminho: string, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    headers: cookie ? { cookie } : {},
  });
}

function trocar(organizationId: unknown, cookie?: string) {
  return fetch(`${app.url}/api/autenticacao/organizacao-ativa`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ organizationId }),
  });
}

async function organizacaoAtivaSegundoOServidor(
  cookie: string,
): Promise<string | null> {
  const resposta = await obter('/autenticacao/eu', cookie);
  const corpo = (await resposta.json()) as { organizationId: string | null };

  return corpo.organizationId;
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

describe('GET /api/autenticacao/organizacoes', () => {
  it('responde 401 sem sessão', async () => {
    expect((await obter('/autenticacao/organizacoes')).status).toBe(401);
  });

  it('lista as duas organizações de quem tem dois vínculos, com a ativa marcada', async () => {
    const resposta = await obter(
      '/autenticacao/organizacoes',
      cenario.dual.cookie,
    );

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      organizacoes: {
        organizationId: string;
        papel: string;
        membershipId: string;
        ativa: boolean;
      }[];
    };

    expect(corpo.organizacoes).toHaveLength(2);

    const ativa = corpo.organizacoes.filter((o) => o.ativa);
    expect(ativa).toHaveLength(1);
    expect(ativa[0].organizationId).toBe(cenario.organizacaoA);
  });

  it('lista apenas a própria organização de quem tem um vínculo', async () => {
    const resposta = await obter(
      '/autenticacao/organizacoes',
      cenario.agenteB1.cookie,
    );

    const corpo = (await resposta.json()) as {
      organizacoes: { organizationId: string }[];
    };

    expect(corpo.organizacoes).toHaveLength(1);
    expect(corpo.organizacoes[0].organizationId).toBe(cenario.organizacaoB);
    // A organização A não aparece de forma nenhuma, nem como opção indisponível.
    const texto = await obter(
      '/autenticacao/organizacoes',
      cenario.agenteB1.cookie,
    ).then((r) => r.text());
    expect(texto).not.toContain(cenario.organizacaoA);
  });

  it('traz o Membership de cada vínculo, não o userId', async () => {
    const resposta = await obter(
      '/autenticacao/organizacoes',
      cenario.dual.cookie,
    );

    const corpo = (await resposta.json()) as {
      organizacoes: { organizationId: string; membershipId: string }[];
    };

    const emA = corpo.organizacoes.find(
      (o) => o.organizationId === cenario.organizacaoA,
    );
    const emB = corpo.organizacoes.find(
      (o) => o.organizationId === cenario.organizacaoB,
    );

    // Mesmo usuário, dois vínculos distintos. É ao vínculo que as atribuições
    // apontam, nunca ao usuário.
    expect(emA!.membershipId).toBe(cenario.dual.membershipId);
    expect(emB!.membershipId).toBe(cenario.dual.membershipEmB);
  });

  it('vínculo suspenso desaparece da lista', async () => {
    await prisma.membership.update({
      where: { id: cenario.dual.membershipEmB },
      data: { status: 'SUSPENDED' },
    });

    const resposta = await obter(
      '/autenticacao/organizacoes',
      cenario.dual.cookie,
    );
    const corpo = (await resposta.json()) as {
      organizacoes: { organizationId: string }[];
    };

    // Se continuasse aparecendo, a pessoa escolheria e levaria 404 na tela
    // seguinte, sem entender por quê.
    expect(corpo.organizacoes).toHaveLength(1);
    expect(corpo.organizacoes[0].organizationId).toBe(cenario.organizacaoA);
  });

  it('organização suspensa desaparece da lista', async () => {
    await prisma.organization.update({
      where: { id: cenario.organizacaoB },
      data: { status: 'SUSPENDED' },
    });

    const resposta = await obter(
      '/autenticacao/organizacoes',
      cenario.dual.cookie,
    );
    const corpo = (await resposta.json()) as {
      organizacoes: { organizationId: string }[];
    };

    expect(corpo.organizacoes).toHaveLength(1);
  });
});

describe('POST /api/autenticacao/organizacao-ativa', () => {
  it('responde 401 sem sessão', async () => {
    expect((await trocar(cenario.organizacaoA)).status).toBe(401);
  });

  it('responde 400 quando o formato é inválido', async () => {
    const resposta = await trocar('curto', cenario.dual.cookie);

    expect(resposta.status).toBe(400);
  });

  it('troca para a organização em que a pessoa tem vínculo', async () => {
    const resposta = await trocar(cenario.organizacaoB, cenario.dual.cookie);

    expect(resposta.status).toBe(200);
    expect(await organizacaoAtivaSegundoOServidor(cenario.dual.cookie)).toBe(
      cenario.organizacaoB,
    );
  });

  it('a troca vale para a sessão, não só para a resposta', async () => {
    await trocar(cenario.organizacaoB, cenario.dual.cookie);

    const sessao = await prisma.session.findUnique({
      where: { id: cenario.dual.sessaoId },
      select: { activeOrganizationId: true },
    });

    // O estado fica no servidor. É o que permite ao próximo pedido saber em
    // nome de quem a pessoa age sem que ela precise declarar de novo.
    expect(sessao!.activeOrganizationId).toBe(cenario.organizacaoB);
  });

  it('trocar para a mesma organização é idempotente', async () => {
    const resposta = await trocar(cenario.organizacaoA, cenario.dual.cookie);

    expect(resposta.status).toBe(200);
    expect(await organizacaoAtivaSegundoOServidor(cenario.dual.cookie)).toBe(
      cenario.organizacaoA,
    );
  });

  it('responde 404 para organização existente sem vínculo', async () => {
    const resposta = await trocar(
      cenario.organizacaoA,
      cenario.agenteB1.cookie,
    );

    // 404, não 403: o 403 confirmaria que a organização A existe. Como este
    // endpoint aceita identificador arbitrário, um 403 o transformaria em
    // consultor de organizações para quem tiver qualquer conta.
    expect(resposta.status).toBe(404);
    expect(resposta.status).not.toBe(403);
  });

  it('organização sem vínculo e organização inexistente são indistinguíveis', async () => {
    const semVinculo = await trocar(
      cenario.organizacaoA,
      cenario.agenteB1.cookie,
    );
    const inexistente = await trocar(
      'cl00000000000000000000000',
      cenario.agenteB1.cookie,
    );

    expect(semVinculo.status).toBe(inexistente.status);
    expect(await semVinculo.text()).toBe(await inexistente.text());
  });

  it('a recusa não muda a organização ativa', async () => {
    await trocar(cenario.organizacaoA, cenario.agenteB1.cookie);

    expect(
      await organizacaoAtivaSegundoOServidor(cenario.agenteB1.cookie),
    ).toBe(cenario.organizacaoB);
  });

  it('responde 404 quando o vínculo de destino está suspenso', async () => {
    await prisma.membership.update({
      where: { id: cenario.dual.membershipEmB },
      data: { status: 'SUSPENDED' },
    });

    const resposta = await trocar(cenario.organizacaoB, cenario.dual.cookie);

    expect(resposta.status).toBe(404);
  });

  it('responde 404 quando a organização de destino está suspensa', async () => {
    await prisma.organization.update({
      where: { id: cenario.organizacaoB },
      data: { status: 'SUSPENDED' },
    });

    const resposta = await trocar(cenario.organizacaoB, cenario.dual.cookie);

    expect(resposta.status).toBe(404);
  });

  it('não vaza o papel nem o nome da organização recusada', async () => {
    const resposta = await trocar(
      cenario.organizacaoA,
      cenario.agenteB1.cookie,
    );
    const corpo = await resposta.text();

    expect(corpo).not.toContain('Imobiliaria A');
    expect(corpo).not.toContain('org-a');
    expect(corpo).not.toContain('AGENT');
  });

  it('grava a sugestão para o próximo login, sem que ela autorize nada', async () => {
    await trocar(cenario.organizacaoB, cenario.dual.cookie);

    const usuario = await prisma.user.findUnique({
      where: { id: cenario.dual.userId },
      select: { lastActiveOrganizationId: true },
    });

    expect(usuario!.lastActiveOrganizationId).toBe(cenario.organizacaoB);

    // E a sugestão é revalidada: suspenso o vínculo em B, um login novo não
    // entra em B só porque o campo aponta para lá.
    await prisma.membership.update({
      where: { id: cenario.dual.membershipEmB },
      data: { status: 'SUSPENDED' },
    });

    const resposta = await obter(
      '/autenticacao/organizacoes',
      cenario.dual.cookie,
    );
    const lista = (await resposta.json()) as {
      organizacoes: { organizationId: string }[];
    };

    expect(lista.organizacoes.map((o) => o.organizationId)).not.toContain(
      cenario.organizacaoB,
    );
  });
});
