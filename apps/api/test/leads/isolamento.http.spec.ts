/**
 * Isolamento multi-tenant dos **leads** — a regra de ouro do
 * [permissions.md](../../../../docs/permissions.md) §8.6 aplicada ao item B5:
 * endpoint novo sem teste de travessia não entra.
 *
 * ## Por que um arquivo separado do de imóveis
 *
 * Porque o 404 aqui tem **duas causas diferentes**, e confundi-las esconderia
 * um furo. Em imóveis, o 404 só aparece na travessia entre organizações: dentro
 * da organização a leitura é `ORG`, e a recusa de escrita é 403. Em leads, o
 * lead do colega **também** responde 404, porque `lead:ver` é `OWN`.
 *
 * Isso cria um risco que imóveis não tinha: uma rota que respondesse 404 para
 * tudo passaria nos testes de travessia e estaria quebrada. Por isso cada
 * bloco abaixo tem um caso que **precisa** responder 200 — a prova de que o 404
 * é específico, e não um erro geral disfarçado de segurança.
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

type ListaDeLeads = {
  leads: { id: string; nomeCompleto: string }[];
  total: number;
};

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

async function lista(caminho: string, cookie: string): Promise<ListaDeLeads> {
  const resposta = await obter(caminho, cookie);

  expect(resposta.status).toBe(200);

  return (await resposta.json()) as ListaDeLeads;
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

describe('§8.2 — travessia entre organizações por ID direto', () => {
  it('ler lead da org A como membro da org B responde 404', async () => {
    const resposta = await obter(
      `/leads/${cenario.leadDeA1}`,
      cenario.ownerB.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('editar lead da org A como membro da org B responde 404', async () => {
    const resposta = await enviar(
      'PATCH',
      `/leads/${cenario.leadDeA1}`,
      cenario.ownerB.cookie,
      { nomeCompleto: 'Invadido' },
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.lead.findUniqueOrThrow({
      where: { id: cenario.leadDeA1 },
      select: { fullName: true },
    });

    expect(noBanco.fullName).toBe('Cliente do A1');
  });

  it('atribuir lead da org A responde 404', async () => {
    const resposta = await enviar(
      'POST',
      `/leads/${cenario.leadDeA1}/responsavel`,
      cenario.ownerB.cookie,
      { membershipId: cenario.agenteB1.membershipId },
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.lead.findUniqueOrThrow({
      where: { id: cenario.leadDeA1 },
      select: { assignedMemberId: true },
    });

    expect(noBanco.assignedMemberId).toBe(cenario.agenteA1.membershipId);
  });

  it('mudar a situação de lead da org A responde 404', async () => {
    const resposta = await enviar(
      'POST',
      `/leads/${cenario.leadDeA1}/situacao`,
      cenario.ownerB.cookie,
      { status: 'CONVERTED' },
    );

    expect(resposta.status).toBe(404);
  });

  it('excluir lead da org A responde 404', async () => {
    const resposta = await enviar(
      'DELETE',
      `/leads/${cenario.leadDeA1}`,
      cenario.ownerB.cookie,
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.lead.findUniqueOrThrow({
      where: { id: cenario.leadDeA1 },
      select: { deletedAt: true },
    });

    expect(noBanco.deletedAt).toBeNull();
  });

  it('o 404 da travessia é indistinguível do 404 de registro inexistente', async () => {
    const daOutraOrganizacao = await obter(
      `/leads/${cenario.leadDeA1}`,
      cenario.ownerB.cookie,
    );

    const inexistente = await obter(
      '/leads/clzzzzzzzzzzzzzzzzzzzzzzz',
      cenario.ownerB.cookie,
    );

    expect(daOutraOrganizacao.status).toBe(inexistente.status);
    expect(await daOutraOrganizacao.text()).toBe(await inexistente.text());
  });

  it('o 404 do lead do colega é indistinguível do de outra organização', async () => {
    // A particularidade dos leads: as duas recusas têm de ser iguais, senão a
    // diferença revela que o registro existe na mesma organização.
    const doColega = await obter(
      `/leads/${cenario.leadDeA2}`,
      cenario.agenteA1.cookie,
    );

    const deOutraOrganizacao = await obter(
      `/leads/${cenario.leadDeB}`,
      cenario.agenteA1.cookie,
    );

    expect(doColega.status).toBe(404);
    expect(await doColega.text()).toBe(await deOutraOrganizacao.text());
  });

  it('o dono do lead alcança o mesmo registro: o 404 não é geral', async () => {
    // Sem este caso, uma rota quebrada que respondesse 404 para todo mundo
    // passaria em todos os testes acima.
    const resposta = await obter(
      `/leads/${cenario.leadDeA1}`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);
  });
});

describe('§8.2 — travessia pela listagem', () => {
  it('a listagem de B não traz nenhum lead de A', async () => {
    const corpo = await lista('/leads', cenario.ownerB.cookie);

    expect(corpo.total).toBe(1);
    expect(corpo.leads[0].nomeCompleto).toBe('Cliente do B1');
  });

  it('o contador não soma registros da outra organização', async () => {
    expect((await lista('/leads', cenario.ownerB.cookie)).total).toBe(1);
    expect((await lista('/leads', cenario.ownerA.cookie)).total).toBe(2);
  });

  it('buscar por nome que só existe na org A não devolve nada em B', async () => {
    const corpo = await lista(
      '/leads?termo=Cliente%20do%20A1',
      cenario.ownerB.cookie,
    );

    expect(corpo.leads).toEqual([]);
    expect(corpo.total).toBe(0);
  });

  it('buscar por telefone compartilhado não atravessa organização', async () => {
    // Os três leads do cenário têm o mesmo telefone, de propósito: é o caso em
    // que um `WHERE` esquecido apareceria imediatamente.
    const corpo = await lista(
      '/leads?termo=11999990000',
      cenario.ownerB.cookie,
    );

    expect(corpo.total).toBe(1);
    expect(corpo.leads[0].nomeCompleto).toBe('Cliente do B1');
  });

  it('a fila de não atribuídos não mistura organizações', async () => {
    await prisma.lead.create({
      data: {
        organizationId: cenario.organizacaoA,
        fullName: 'Fila de A',
        phone: '11911112222',
        source: 'PUBLIC_CATALOG',
        assignedMemberId: null,
      },
    });

    const filaDeB = await lista(
      '/leads?naoAtribuidos=true',
      cenario.ownerB.cookie,
    );
    expect(filaDeB.total).toBe(0);

    const filaDeA = await lista(
      '/leads?naoAtribuidos=true',
      cenario.ownerA.cookie,
    );
    expect(filaDeA.total).toBe(1);
  });

  it('o contador da fila não soma a outra organização', async () => {
    await prisma.lead.create({
      data: {
        organizationId: cenario.organizacaoA,
        fullName: 'Fila de A',
        phone: '11911112222',
        source: 'PUBLIC_CATALOG',
        assignedMemberId: null,
      },
    });

    const deB = await obter(
      '/leads/nao-atribuidos/contagem',
      cenario.ownerB.cookie,
    );

    expect(((await deB.json()) as { total: number }).total).toBe(0);
  });

  it('paginar não escapa do filtro por organização', async () => {
    const corpo = await lista('/leads?porPagina=100', cenario.ownerB.cookie);

    expect(corpo.leads).toHaveLength(1);
  });
});

describe('§8.2 — a duplicata não atravessa organização nem carteira', () => {
  it('o cadastro em B não sinaliza lead de A com o mesmo telefone', async () => {
    const resposta = await enviar('POST', '/leads', cenario.ownerB.cookie, {
      nomeCompleto: 'Novo contato em B',
      telefone: '11999990000',
    });

    expect(resposta.status).toBe(201);

    const corpo = (await resposta.json()) as {
      duplicatas: { nivel: string }[];
    };

    // Os dois leads de A têm esse telefone. Nenhum pode aparecer, nem como
    // "restrita": a existência de contato em outra organização não é
    // informação desta.
    expect(corpo.duplicatas).toHaveLength(1);
  });
});

describe('§8.4 — organização ativa não é manipulável pelo cliente', () => {
  it('a pessoa com dois vínculos só vê a organização ativa', async () => {
    // Ela é AGENT em A, e o escopo OWN não lhe dá nenhum lead de A: o cenário
    // atribui os leads de A aos outros dois corretores.
    const corpo = await lista('/leads', cenario.dual.cookie);

    expect(corpo.total).toBe(0);
  });

  it('com A ativa, o lead de B responde 404 mesmo sendo ela membro de B', async () => {
    const resposta = await obter(
      `/leads/${cenario.leadDeB}`,
      cenario.dual.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('organizationId na query é ignorado', async () => {
    const corpo = await lista(
      `/leads?organizationId=${cenario.organizacaoB}`,
      cenario.dual.cookie,
    );

    expect(corpo.total).toBe(0);
  });

  it('organizationId no corpo da escrita é ignorado', async () => {
    const resposta = await enviar('POST', '/leads', cenario.dual.cookie, {
      nomeCompleto: 'Lead empurrado para B',
      telefone: '11900001111',
      organizationId: cenario.organizacaoB,
    });

    expect(resposta.status).toBe(201);

    const criado = (await resposta.json()) as { lead: { id: string } };
    const noBanco = await prisma.lead.findUniqueOrThrow({
      where: { id: criado.lead.id },
      select: { organizationId: true },
    });

    expect(noBanco.organizationId).toBe(cenario.organizacaoA);
  });

  it('trocar a organização ativa muda o resultado na requisição seguinte', async () => {
    // Em A ela não tem lead; em B, também não — então o que muda é o que ela
    // alcança por ID direto.
    const antes = await obter(`/leads/${cenario.leadDeB}`, cenario.dual.cookie);

    expect(antes.status).toBe(404);

    const troca = await enviar(
      'POST',
      '/autenticacao/organizacao-ativa',
      cenario.dual.cookie,
      { organizationId: cenario.organizacaoB },
    );

    expect(troca.status).toBe(200);

    // Continua 404, mas por outro motivo: agora é o escopo OWN, porque o lead
    // de B é do agenteB1. É o caso que mostra por que os dois 404 precisam ser
    // iguais.
    const depois = await obter(
      `/leads/${cenario.leadDeB}`,
      cenario.dual.cookie,
    );

    expect(depois.status).toBe(404);
  });

  it('A6 — suspender o membro corta o acesso aos leads na hora', async () => {
    expect((await obter('/leads', cenario.agenteA1.cookie)).status).toBe(200);

    await prisma.membership.update({
      where: { id: cenario.agenteA1.membershipId },
      data: { status: 'SUSPENDED' },
    });

    expect((await obter('/leads', cenario.agenteA1.cookie)).status).toBe(404);
  });

  it('A6 — suspender a organização corta o acesso de todos', async () => {
    await prisma.organization.update({
      where: { id: cenario.organizacaoA },
      data: { status: 'SUSPENDED' },
    });

    expect((await obter('/leads', cenario.ownerA.cookie)).status).toBe(404);
    expect((await obter('/leads', cenario.ownerB.cookie)).status).toBe(200);
  });
});

describe('§8.2 — a escrita cruzada não deixa rastro', () => {
  it('a tentativa de travessia não gera Activity', async () => {
    await enviar('PATCH', `/leads/${cenario.leadDeA1}`, cenario.ownerB.cookie, {
      nomeCompleto: 'Invadido',
    });

    expect(await prisma.activity.count()).toBe(0);
  });

  it('a tentativa no lead do colega não gera Activity', async () => {
    await enviar(
      'POST',
      `/leads/${cenario.leadDeA2}/situacao`,
      cenario.agenteA1.cookie,
      { status: 'CONVERTED' },
    );

    expect(await prisma.activity.count()).toBe(0);
  });

  it('a auditoria da escrita legítima fica na organização de quem escreveu', async () => {
    await enviar('PATCH', `/leads/${cenario.leadDeB}`, cenario.ownerB.cookie, {
      nomeCompleto: 'Cliente de B corrigido',
    });

    const linhas = await prisma.activity.findMany({
      select: { organizationId: true, actorMembershipId: true },
    });

    expect(linhas).toHaveLength(1);
    expect(linhas[0].organizationId).toBe(cenario.organizacaoB);
    expect(linhas[0].actorMembershipId).toBe(cenario.ownerB.membershipId);
  });
});
