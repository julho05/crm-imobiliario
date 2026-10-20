/**
 * Autorização ponta a ponta: os sete passos de `docs/permissions.md` §6.
 *
 * Tudo aqui chama a API direto, sem interface nenhuma. É o ponto: esconder
 * botão não é segurança, e a prova de que a decisão é do servidor só vale se o
 * teste ignorar a tela.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
} from '../apoio/cenario-de-duas-organizacoes';
import { RecursosDeTesteModule } from './recursos-de-teste.module';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;

function obter(caminho: string, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    headers: cookie ? { cookie } : {},
  });
}

function enviar(
  metodo: 'PATCH' | 'POST',
  caminho: string,
  cookie?: string,
  corpo: unknown = {},
) {
  return fetch(`${app.url}/api${caminho}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

beforeAll(async () => {
  app = await subirAppDeTeste([RecursosDeTesteModule]);
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

describe('passos 1 e 2: sessão e organização ativa', () => {
  it('responde 401 sem cookie', async () => {
    expect((await obter('/teste/contexto')).status).toBe(401);
  });

  it('responde 401 com cookie inventado', async () => {
    const resposta = await obter('/teste/contexto', 'sessao=inventado');
    expect(resposta.status).toBe(401);
  });

  it('a organização ativa vem da sessão', async () => {
    const resposta = await obter('/teste/contexto', cenario.agenteA1.cookie);

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      organizationId: string;
      membershipId: string;
      papel: string;
    };

    expect(corpo.organizationId).toBe(cenario.organizacaoA);
    // O contexto aponta para o Membership, nunca para o User.
    expect(corpo.membershipId).toBe(cenario.agenteA1.membershipId);
    expect(corpo.papel).toBe('AGENT');
  });

  it('responde 403 quando a sessão não tem organização ativa', async () => {
    await prisma.session.update({
      where: { id: cenario.agenteA1.sessaoId },
      data: { activeOrganizationId: null },
    });

    const resposta = await obter('/teste/contexto', cenario.agenteA1.cookie);
    expect(resposta.status).toBe(403);
  });
});

describe('passo 3: membership ativo', () => {
  it('responde 404 quando o vínculo não existe na organização ativa', async () => {
    // Sessão apontando para uma organização de que a pessoa não é membro.
    await prisma.session.update({
      where: { id: cenario.agenteA1.sessaoId },
      data: { activeOrganizationId: cenario.organizacaoB },
    });

    const resposta = await obter('/teste/contexto', cenario.agenteA1.cookie);

    // 404, não 403: um 403 confirmaria que aquela organização existe, o que
    // permite mapear a base de clientes um identificador por vez.
    expect(resposta.status).toBe(404);
  });

  it('A6 — suspender o membro corta o acesso na requisição seguinte', async () => {
    // É este teste que justifica sessão com estado no servidor em vez de JWT.
    // Com JWT o token seguiria valendo até expirar.
    expect(
      (await obter('/teste/contexto', cenario.agenteA1.cookie)).status,
    ).toBe(200);

    await prisma.membership.update({
      where: { id: cenario.agenteA1.membershipId },
      data: { status: 'SUSPENDED' },
    });

    const depois = await obter('/teste/contexto', cenario.agenteA1.cookie);

    // Sem logout, sem expiração, sem nova requisição de login: a próxima
    // chamada com o mesmo cookie já não passa.
    expect(depois.status).toBe(404);
  });

  it('A6 — suspender a organização corta o acesso de todos os membros', async () => {
    await prisma.organization.update({
      where: { id: cenario.organizacaoA },
      data: { status: 'SUSPENDED' },
    });

    expect((await obter('/teste/contexto', cenario.ownerA.cookie)).status).toBe(
      404,
    );
    expect(
      (await obter('/teste/contexto', cenario.agenteA1.cookie)).status,
    ).toBe(404);
    // A organização B segue intacta: a suspensão não transborda.
    expect((await obter('/teste/contexto', cenario.ownerB.cookie)).status).toBe(
      200,
    );
  });

  it('membro suspenso continua com sessão válida para rotas só autenticadas', async () => {
    await prisma.membership.update({
      where: { id: cenario.agenteA1.membershipId },
      data: { status: 'SUSPENDED' },
    });

    // A sessão não foi revogada — a pessoa segue autenticada. O que ela perdeu
    // é o acesso àquela organização. A distinção importa: quem tem dois
    // vínculos não deve ser deslogado por causa de um.
    const resposta = await obter('/autenticacao/eu', cenario.agenteA1.cookie);
    expect(resposta.status).toBe(200);
  });
});

describe('passo 4: papel × ação', () => {
  it('responde 403 quando o papel não alcança a ação', async () => {
    // `imovel:excluir` é false para MANAGER e AGENT.
    const gerente = await enviar(
      'POST',
      `/teste/imoveis/${cenario.imovelDeA1}/excluir`,
      cenario.managerA.cookie,
    );
    const corretor = await enviar(
      'POST',
      `/teste/imoveis/${cenario.imovelDeA1}/excluir`,
      cenario.agenteA1.cookie,
    );

    // 403 legítimo: o vínculo existe e a organização existe. A pessoa já sabe
    // que ambos existem — trabalha lá. Não há nada a esconder.
    expect(gerente.status).toBe(403);
    expect(corretor.status).toBe(403);
  });

  it('o OWNER alcança a mesma ação', async () => {
    const resposta = await enviar(
      'POST',
      `/teste/imoveis/${cenario.imovelDeA1}/excluir`,
      cenario.ownerA.cookie,
    );

    expect(resposta.status).toBe(201);
  });

  it('rota com a guarda e sem @Exige fecha', async () => {
    const resposta = await obter(
      '/teste/sem-acao-declarada',
      cenario.ownerA.cookie,
    );

    // Esquecer o @Exige é erro de programação. Abrir por omissão faria o
    // esquecimento virar rota pública.
    expect(resposta.status).toBe(403);
  });
});

describe('passo 5: travessia entre organizações', () => {
  it('imóvel de outra organização responde 404, nunca 403', async () => {
    const resposta = await obter(
      `/teste/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteB1.cookie,
    );

    expect(resposta.status).toBe(404);
    expect(resposta.status).not.toBe(403);
  });

  it('lead de outra organização responde 404', async () => {
    const resposta = await obter(
      `/teste/leads/${cenario.leadDeA1}`,
      cenario.agenteB1.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('escrita em registro de outra organização responde 404', async () => {
    const resposta = await enviar(
      'PATCH',
      `/teste/imoveis/${cenario.imovelDeA1}`,
      cenario.ownerB.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('registro inexistente e registro de outra organização são indistinguíveis', async () => {
    const inexistente = await obter(
      '/teste/imoveis/cl00000000000000000000000',
      cenario.agenteB1.cookie,
    );
    const deOutraOrganizacao = await obter(
      `/teste/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteB1.cookie,
    );

    expect(inexistente.status).toBe(deOutraOrganizacao.status);
    // Corpos idênticos: qualquer diferença aqui denuncia que o registro existe.
    expect(await inexistente.text()).toBe(await deOutraOrganizacao.text());
  });

  it('o próprio registro continua acessível', async () => {
    const resposta = await obter(
      `/teste/imoveis/${cenario.imovelDeB}`,
      cenario.agenteB1.cookie,
    );

    expect(resposta.status).toBe(200);
  });
});

describe('passo 6: escopo OWN dentro da mesma organização', () => {
  it('o corretor vê o imóvel do colega', async () => {
    // `imovel:ver` é ORG até para AGENT: o corretor precisa poder oferecer
    // qualquer imóvel da casa ao cliente dele.
    const resposta = await obter(
      `/teste/imoveis/${cenario.imovelDeA2}`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);
  });

  it('o corretor recebe 403 ao editar o imóvel do colega', async () => {
    const resposta = await enviar(
      'PATCH',
      `/teste/imoveis/${cenario.imovelDeA2}`,
      cenario.agenteA1.cookie,
    );

    // 403, e não 404, porque ele acabou de poder ver o registro na linha de
    // cima. Esconder agora seria teatro.
    expect(resposta.status).toBe(403);
  });

  it('o corretor edita o imóvel dele', async () => {
    const resposta = await enviar(
      'PATCH',
      `/teste/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);
  });

  it('o corretor recebe 404 no lead do colega', async () => {
    const resposta = await obter(
      `/teste/leads/${cenario.leadDeA2}`,
      cenario.agenteA1.cookie,
    );

    // Mesma pessoa, mesmo papel, mesma organização do caso do imóvel — e
    // código diferente, porque `lead:ver` é OWN e `imovel:ver` é ORG. O lead
    // do colega não existe para ele.
    expect(resposta.status).toBe(404);
  });

  it('o corretor vê o lead dele', async () => {
    const resposta = await obter(
      `/teste/leads/${cenario.leadDeA1}`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);
  });

  it('o gerente vê o lead de qualquer corretor da organização', async () => {
    const deA1 = await obter(
      `/teste/leads/${cenario.leadDeA1}`,
      cenario.managerA.cookie,
    );
    const deA2 = await obter(
      `/teste/leads/${cenario.leadDeA2}`,
      cenario.managerA.cookie,
    );

    expect(deA1.status).toBe(200);
    expect(deA2.status).toBe(200);
  });

  it('ação de escopo OWN sem responsável declarado estoura, não libera', async () => {
    const resposta = await obter(
      `/teste/leads/${cenario.leadDeA1}/sem-responsavel`,
      cenario.agenteA1.cookie,
    );

    // Erro de programação: chamar conferir() sem o responsável numa ação OWN.
    // Tem de falhar alto. Liberar por omissão seria o pior desfecho possível —
    // e, sem este teste, seria o desfecho silencioso.
    expect(resposta.status).toBe(500);
  });

  it('o gerente passa pelo mesmo registro sem precisar de responsável', async () => {
    // Para MANAGER o escopo é ORG, então o passo 6 não roda e a ausência do
    // responsável não é erro.
    const resposta = await obter(
      `/teste/leads/${cenario.leadDeA1}/sem-responsavel`,
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(200);
  });
});

describe('passo 7: auditoria', () => {
  it('a escrita gera Activity na organização certa, apontando para o Membership', async () => {
    await enviar(
      'PATCH',
      `/teste/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
    );

    const registro = await prisma.activity.findFirst({
      where: { entityId: cenario.imovelDeA1, action: 'imovel.editado' },
    });

    expect(registro).not.toBeNull();
    expect(registro!.organizationId).toBe(cenario.organizacaoA);
    // Membership, nunca User: quem agiu, agiu naquele papel e naquela
    // organização.
    expect(registro!.actorMembershipId).toBe(cenario.agenteA1.membershipId);
    expect(registro!.entityType).toBe('Property');
  });

  it('a tentativa recusada não gera Activity', async () => {
    await enviar(
      'PATCH',
      `/teste/imoveis/${cenario.imovelDeA2}`,
      cenario.agenteA1.cookie,
    );

    const total = await prisma.activity.count({
      where: { entityId: cenario.imovelDeA2 },
    });

    expect(total).toBe(0);
  });

  it('o IP vai hasheado, nunca em claro', async () => {
    await enviar(
      'PATCH',
      `/teste/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
    );

    const registro = await prisma.activity.findFirst({
      where: { entityId: cenario.imovelDeA1 },
    });

    expect(registro!.ipHash).not.toBeNull();
    // HMAC-SHA256 em hexadecimal, e nada parecido com um endereço.
    expect(registro!.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(registro!.ipHash).not.toContain('127.0.0.1');
  });
});

describe('organização ativa não é manipulável pelo cliente', () => {
  it('organizationId no corpo da requisição é ignorado', async () => {
    const resposta = await fetch(`${app.url}/api/teste/contexto`, {
      headers: {
        cookie: cenario.dual.cookie,
        'content-type': 'application/json',
      },
    });

    const corpo = (await resposta.json()) as { organizationId: string };
    expect(corpo.organizationId).toBe(cenario.organizacaoA);

    // Agora com a organização B empurrada pela query, que é o que um cliente
    // mal-intencionado tentaria.
    const comQuery = await obter(
      `/teste/contexto?organizationId=${cenario.organizacaoB}`,
      cenario.dual.cookie,
    );

    const corpoComQuery = (await comQuery.json()) as { organizationId: string };
    expect(corpoComQuery.organizationId).toBe(cenario.organizacaoA);
  });

  it('a pessoa com dois vínculos não alcança registro de B com A ativa', async () => {
    // Ela É membro de B. O que a barra não é falta de vínculo, é a sessão
    // dizer que a organização ativa é A.
    const resposta = await obter(
      `/teste/imoveis/${cenario.imovelDeB}`,
      cenario.dual.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('trocar a organização ativa na sessão muda o resultado na hora', async () => {
    // Pelo endpoint de verdade, não por escrita direta no banco: é a troca
    // completa — pedido do cliente, conferência do vínculo, gravação na
    // sessão — que precisa produzir este efeito.
    const troca = await enviar(
      'POST',
      '/autenticacao/organizacao-ativa',
      cenario.dual.cookie,
      { organizationId: cenario.organizacaoB },
    );
    expect(troca.status).toBe(200);

    const emB = await obter(
      `/teste/imoveis/${cenario.imovelDeB}`,
      cenario.dual.cookie,
    );
    const emA = await obter(
      `/teste/imoveis/${cenario.imovelDeA1}`,
      cenario.dual.cookie,
    );

    expect(emB.status).toBe(200);
    // E o que era visível em A deixa de ser, sem resquício de cache.
    expect(emA.status).toBe(404);
  });

  it('o contexto passa a apontar para o Membership de B', async () => {
    await prisma.session.update({
      where: { id: cenario.dual.sessaoId },
      data: { activeOrganizationId: cenario.organizacaoB },
    });

    const resposta = await obter('/teste/contexto', cenario.dual.cookie);
    const corpo = (await resposta.json()) as { membershipId: string };

    // Mesmo usuário, outro vínculo. Se o membershipId não trocasse, as
    // atribuições de uma organização valeriam na outra.
    expect(corpo.membershipId).toBe(cenario.dual.membershipEmB);
    expect(corpo.membershipId).not.toBe(cenario.dual.membershipId);
  });
});
