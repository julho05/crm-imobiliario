/**
 * Item **A12** — isolamento multi-tenant, agora contra **endpoint de verdade**.
 *
 * ## Por que este arquivo existe, se `autorizacao.http.spec.ts` já cobre os
 * sete passos
 *
 * Porque aquele arquivo prova que a guarda e o `AutorizacaoService` funcionam,
 * usando rotas que só existem no teste. O que ele **não** prova está escrito
 * nele mesmo: "que a rota de produção vai se lembrar de chamar o serviço".
 *
 * É essa a lacuna aqui fechada. Cada caso abaixo fala com `/api/imoveis`, a
 * rota que o site usa, e a pergunta é sempre a mesma: a organização B alcança
 * algo da organização A? A resposta tem de ser **404**, nunca 403 — um 403
 * confirmaria que o registro existe, o que permite mapear a base de clientes
 * um identificador por vez.
 *
 * Cobre [permissions.md](../../../../docs/permissions.md) §8.2 (travessia),
 * §8.3 (escopo dentro da organização) e §8.4 (organização ativa) na parte que
 * toca imóveis. §8.5 é catálogo público, da Fase 3.
 *
 * É a **regra de ouro** do §8.6 aplicada pela primeira vez: endpoint novo sem
 * teste de travessia não entra.
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

type ListaDeImoveis = {
  imoveis: { id: string; codigo: string }[];
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

async function lista(caminho: string, cookie: string): Promise<ListaDeImoveis> {
  const resposta = await obter(caminho, cookie);

  expect(resposta.status).toBe(200);

  return (await resposta.json()) as ListaDeImoveis;
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
  it('ler imóvel da org A como membro da org B responde 404', async () => {
    const resposta = await obter(
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteB1.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('editar imóvel da org A como membro da org B responde 404', async () => {
    const resposta = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteB1.cookie,
      { titulo: 'Invadido' },
    );

    expect(resposta.status).toBe(404);

    // E nada foi escrito.
    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: cenario.imovelDeA1 },
      select: { title: true },
    });

    expect(noBanco.title).toBe('Imovel A-001');
  });

  it('excluir imóvel da org A como proprietário da org B responde 404', async () => {
    // Tem de ser o OWNER de B: `imovel:excluir` é false para AGENT, e um 403
    // do passo 4 não provaria nada sobre travessia.
    const resposta = await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.ownerB.cookie,
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: cenario.imovelDeA1 },
      select: { deletedAt: true },
    });

    expect(noBanco.deletedAt).toBeNull();
  });

  it('o 404 da travessia é indistinguível do 404 de registro inexistente', async () => {
    const daOutraOrganizacao = await obter(
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteB1.cookie,
    );

    const inexistente = await obter(
      '/imoveis/clzzzzzzzzzzzzzzzzzzzzzzz',
      cenario.agenteB1.cookie,
    );

    expect(daOutraOrganizacao.status).toBe(inexistente.status);
    // Mesmo corpo, não só mesmo status: a diferença entre as mensagens
    // devolveria justamente o que o 404 existe para esconder.
    expect(await daOutraOrganizacao.text()).toBe(await inexistente.text());
  });

  it('o proprietário da org A alcança o mesmo imóvel: o 404 não é geral', async () => {
    // Sem este caso, uma rota quebrada que respondesse 404 para todo mundo
    // passaria nos testes acima.
    const resposta = await obter(
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.ownerA.cookie,
    );

    expect(resposta.status).toBe(200);
  });
});

describe('§8.2 — travessia pela listagem', () => {
  it('a listagem de B não traz nenhum imóvel de A', async () => {
    const corpo = await lista('/imoveis', cenario.agenteB1.cookie);

    expect(corpo.total).toBe(1);
    expect(corpo.imoveis.map((i) => i.codigo)).toEqual(['B-001']);
  });

  it('o contador não soma registros da outra organização', async () => {
    // A tem 2 imóveis e B tem 1. Um `count` sem filtro devolveria 3.
    expect((await lista('/imoveis', cenario.agenteB1.cookie)).total).toBe(1);
    expect((await lista('/imoveis', cenario.ownerA.cookie)).total).toBe(2);
  });

  it('buscar por termo que só existe na org A não devolve nada em B', async () => {
    const corpo = await lista('/imoveis?termo=A-001', cenario.agenteB1.cookie);

    // A busca é o caminho que mais facilmente escapa do filtro por
    // organização, porque o `OR` do termo tende a ser escrito separado do
    // `WHERE organizationId`.
    expect(corpo.imoveis).toEqual([]);
    expect(corpo.total).toBe(0);
  });

  it('filtrar por cidade da org A não devolve nada em B', async () => {
    const corpo = await lista(
      '/imoveis?cidade=Sao Paulo&estado=SP',
      cenario.agenteB1.cookie,
    );

    // O imóvel de B também está em São Paulo no cenário — então este caso só
    // vale porque compara com o que A vê no mesmo filtro.
    expect(corpo.imoveis.map((i) => i.codigo)).toEqual(['B-001']);
  });

  it('paginar não escapa do filtro por organização', async () => {
    // Pede mais itens do que existem na organização: se o filtro fosse
    // aplicado depois da paginação, um registro de A apareceria para
    // completar a página.
    const corpo = await lista(
      '/imoveis?porPagina=100',
      cenario.agenteB1.cookie,
    );

    expect(corpo.imoveis).toHaveLength(1);
  });
});

describe('§8.3 — escopo dentro da mesma organização', () => {
  it('o corretor vê o imóvel do colega, mas recebe 403 ao editar', async () => {
    const leitura = await obter(
      `/imoveis/${cenario.imovelDeA2}`,
      cenario.agenteA1.cookie,
    );

    const escrita = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA2}`,
      cenario.agenteA1.cookie,
      { titulo: 'Nao deveria passar' },
    );

    // É o par que distingue os dois códigos: 200 na leitura porque
    // `imovel:ver` é ORG, 403 na escrita porque `imovel:editar` é OWN.
    expect(leitura.status).toBe(200);
    expect(escrita.status).toBe(403);
  });

  it('o corretor não exclui nem o imóvel dele', async () => {
    const resposta = await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(403);
  });

  it('o gerente alcança qualquer imóvel da organização', async () => {
    const leitura = await obter(
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.managerA.cookie,
    );

    const escrita = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.managerA.cookie,
      { titulo: 'Ajuste do gerente' },
    );

    expect(leitura.status).toBe(200);
    expect(escrita.status).toBe(200);
  });

  it('o gerente não alcança imóvel da outra organização', async () => {
    // Papel alto não atravessa fronteira de organização: o escopo ORG vale
    // dentro da organização ativa, não acima dela.
    const resposta = await obter(
      `/imoveis/${cenario.imovelDeB}`,
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(404);
  });
});

describe('§8.4 — organização ativa não é manipulável pelo cliente', () => {
  it('a pessoa com dois vínculos só vê a organização ativa', async () => {
    // Ela É membro de A e de B. O que a barra não é falta de vínculo: é a
    // sessão dizer que a ativa é A.
    const corpo = await lista('/imoveis', cenario.dual.cookie);

    expect(corpo.imoveis.map((i) => i.codigo).sort()).toEqual([
      'A-001',
      'A-002',
    ]);
  });

  it('com A ativa, o imóvel de B responde 404 mesmo sendo ela membro de B', async () => {
    const resposta = await obter(
      `/imoveis/${cenario.imovelDeB}`,
      cenario.dual.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('organizationId na query é ignorado', async () => {
    const corpo = await lista(
      `/imoveis?organizationId=${cenario.organizacaoB}`,
      cenario.dual.cookie,
    );

    expect(corpo.imoveis.map((i) => i.codigo).sort()).toEqual([
      'A-001',
      'A-002',
    ]);
  });

  it('organizationId no corpo da escrita é ignorado', async () => {
    const resposta = await enviar('POST', '/imoveis', cenario.dual.cookie, {
      titulo: 'Imovel empurrado para B',
      tipo: 'APARTMENT',
      finalidade: 'SALE',
      preco: 100_000,
      estado: 'SP',
      cidade: 'Sao Paulo',
      bairro: 'Centro',
      organizationId: cenario.organizacaoB,
    });

    expect(resposta.status).toBe(201);

    const criado = (await resposta.json()) as { id: string };
    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: criado.id },
      select: { organizationId: true },
    });

    // Nasceu em A, a organização da sessão.
    expect(noBanco.organizationId).toBe(cenario.organizacaoA);
  });

  it('trocar a organização ativa muda o resultado na requisição seguinte', async () => {
    const antes = await lista('/imoveis', cenario.dual.cookie);
    expect(antes.imoveis.map((i) => i.codigo).sort()).toEqual([
      'A-001',
      'A-002',
    ]);

    const troca = await enviar(
      'POST',
      '/autenticacao/organizacao-ativa',
      cenario.dual.cookie,
      { organizationId: cenario.organizacaoB },
    );

    expect(troca.status).toBe(200);

    const depois = await lista('/imoveis', cenario.dual.cookie);

    // Sem resquício de cache: a troca vale já na requisição seguinte.
    expect(depois.imoveis.map((i) => i.codigo)).toEqual(['B-001']);
  });

  it('A6 — suspender o membro corta o acesso aos imóveis na hora', async () => {
    expect((await obter('/imoveis', cenario.agenteA1.cookie)).status).toBe(200);

    await prisma.membership.update({
      where: { id: cenario.agenteA1.membershipId },
      data: { status: 'SUSPENDED' },
    });

    // Sem esperar expiração de sessão. É a razão de a sessão ter estado no
    // servidor em vez de ser um JWT.
    expect((await obter('/imoveis', cenario.agenteA1.cookie)).status).toBe(404);
  });

  it('A6 — suspender a organização corta o acesso de todos', async () => {
    await prisma.organization.update({
      where: { id: cenario.organizacaoA },
      data: { status: 'SUSPENDED' },
    });

    expect((await obter('/imoveis', cenario.ownerA.cookie)).status).toBe(404);
    expect(
      (await obter(`/imoveis/${cenario.imovelDeA1}`, cenario.ownerA.cookie))
        .status,
    ).toBe(404);

    // A organização B segue funcionando: a suspensão é de uma, não do sistema.
    expect((await obter('/imoveis', cenario.ownerB.cookie)).status).toBe(200);
  });
});

describe('§8.2 — a escrita cruzada não deixa rastro na organização errada', () => {
  it('a tentativa de travessia não gera Activity em nenhuma das duas', async () => {
    await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteB1.cookie,
      { titulo: 'Invadido' },
    );

    expect(await prisma.activity.count()).toBe(0);
  });

  it('a auditoria da escrita legítima fica na organização de quem escreveu', async () => {
    await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeB}`,
      cenario.ownerB.cookie,
      { titulo: 'Ajuste em B' },
    );

    const linhas = await prisma.activity.findMany({
      select: { organizationId: true, actorMembershipId: true },
    });

    expect(linhas).toHaveLength(1);
    expect(linhas[0].organizationId).toBe(cenario.organizacaoB);
    expect(linhas[0].actorMembershipId).toBe(cenario.ownerB.membershipId);
  });
});
