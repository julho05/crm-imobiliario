/**
 * Item **C3**: trocar o endereço da vitrine, e o endereço antigo continuar
 * levando a ela.
 *
 * ## O que este arquivo existe para pegar
 *
 * 1. **O link antigo virando 404.** Anúncio impresso, bio do Instagram e
 *    resultado do Google não se atualizam sozinhos (decisão de 19/10/2026)
 * 2. **O link antigo de uma organização passando a abrir outra.** É o critério
 *    do roadmap — "adotar slug que ainda redireciona é recusado" —, e o dano é
 *    pior que o 404: o cliente da imobiliária A cai na vitrine do concorrente
 * 3. **O redirecionamento revelando conta suspensa**, que o 404 igual para
 *    inexistente e suspensa existe para esconder
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
} from '../apoio/cenario-de-duas-organizacoes';
import { emitirFicha } from '../../src/catalogo/ficha-do-formulario';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;

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
  await prisma.property.update({
    where: { id: cenario.imovelDeA1 },
    data: { status: 'AVAILABLE', publishedAt: new Date() },
  });
});

function trocar(cookie: string, slug: string) {
  return fetch(`${app.url}/api/organizacao/endereco`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ slug }),
  });
}

/** Sem seguir o redirecionamento: o que se testa é a resposta 308 em si. */
function obterPublico(caminho: string) {
  return fetch(`${app.url}/api/publico/organizacoes/${caminho}`, {
    redirect: 'manual',
  });
}

describe('quem pode trocar', () => {
  it.each(['ownerA', 'adminA'] as const)('%s troca', async (papel) => {
    const resposta = await trocar(cenario[papel].cookie, 'imobiliaria-nova');

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      slug: 'imobiliaria-nova',
      anteriores: ['org-a'],
    });
  });

  it.each(['managerA', 'agenteA1'] as const)(
    '%s recebe 403 e nada muda',
    async (papel) => {
      const resposta = await trocar(cenario[papel].cookie, 'imobiliaria-nova');

      expect(resposta.status).toBe(403);

      const organizacao = await prisma.organization.findUniqueOrThrow({
        where: { id: cenario.organizacaoA },
      });
      expect(organizacao.slug).toBe('org-a');
    },
  );

  it('todos os papéis leem o endereço', async () => {
    const resposta = await fetch(`${app.url}/api/organizacao/endereco`, {
      headers: { cookie: cenario.agenteA1.cookie },
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ slug: 'org-a', anteriores: [] });
  });

  it('troca a organização ativa, nunca outra', async () => {
    // O corpo não leva organização nenhuma: a que muda é a da sessão.
    await trocar(cenario.ownerB.cookie, 'outra-b');

    const [a, b] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: cenario.organizacaoA },
      }),
      prisma.organization.findUniqueOrThrow({
        where: { id: cenario.organizacaoB },
      }),
    ]);

    expect(a.slug).toBe('org-a');
    expect(b.slug).toBe('outra-b');
  });

  it('registra a troca na auditoria', async () => {
    await trocar(cenario.ownerA.cookie, 'imobiliaria-nova');

    const evento = await prisma.activity.findFirstOrThrow({
      where: { action: 'organizacao.enderecoTrocado' },
    });

    expect(evento.organizationId).toBe(cenario.organizacaoA);
    expect(evento.actorMembershipId).toBe(cenario.ownerA.membershipId);
    expect(evento.metadata).toMatchObject({
      de: 'org-a',
      para: 'imobiliaria-nova',
    });
  });
});

describe('o que pode ser adotado', () => {
  it('recusa o endereço atual de outra organização', async () => {
    const resposta = await trocar(cenario.ownerA.cookie, 'org-b');

    expect(resposta.status).toBe(409);
  });

  it('recusa o endereço que ainda redireciona para outra organização', async () => {
    await trocar(cenario.ownerB.cookie, 'b-nova');

    // `org-b` agora é um endereço antigo de B. Se A o adotasse, o link antigo
    // de B passaria a abrir a vitrine de A.
    const resposta = await trocar(cenario.ownerA.cookie, 'org-b');

    expect(resposta.status).toBe(409);
    expect((await obterPublico('org-b')).headers.get('location')).toContain(
      '/b-nova',
    );
  });

  it('recusa endereço reservado e formato inválido', async () => {
    expect((await trocar(cenario.ownerA.cookie, 'painel')).status).toBe(400);
    expect((await trocar(cenario.ownerA.cookie, 'Com Espaço')).status).toBe(
      400,
    );
  });

  it('recusa o próprio endereço atual', async () => {
    expect((await trocar(cenario.ownerA.cookie, 'org-a')).status).toBe(400);
  });

  it('volta a um endereço antigo da própria organização', async () => {
    await trocar(cenario.ownerA.cookie, 'a-nova');
    const resposta = await trocar(cenario.ownerA.cookie, 'org-a');

    expect(resposta.status).toBe(200);
    // `org-a` sai do histórico — não pode ser atual e antigo ao mesmo tempo —
    // e `a-nova` entra.
    expect(await resposta.json()).toEqual({
      slug: 'org-a',
      anteriores: ['a-nova'],
    });
    expect((await obterPublico('org-a')).status).toBe(200);
  });
});

describe('limite de trocas', () => {
  it('a quarta troca em 30 dias responde 429', async () => {
    for (const slug of ['nova-1', 'nova-2', 'nova-3']) {
      expect((await trocar(cenario.ownerA.cookie, slug)).status).toBe(200);
    }

    const resposta = await trocar(cenario.ownerA.cookie, 'nova-4');

    expect(resposta.status).toBe(429);
    expect(resposta.headers.get('retry-after')).not.toBeNull();
  });

  it('a recusa por endereço ocupado não conta', async () => {
    // Quem tenta três nomes que já têm dono não pode ficar um mês trancado.
    for (let i = 0; i < 5; i++) {
      expect((await trocar(cenario.ownerA.cookie, 'org-b')).status).toBe(409);
    }

    expect((await trocar(cenario.ownerA.cookie, 'livre')).status).toBe(200);
  });

  it('o limite é por organização', async () => {
    for (const slug of ['nova-1', 'nova-2', 'nova-3']) {
      await trocar(cenario.ownerA.cookie, slug);
    }

    expect((await trocar(cenario.ownerB.cookie, 'b-nova')).status).toBe(200);
  });
});

describe('o endereço antigo redireciona', () => {
  beforeEach(async () => {
    await trocar(cenario.ownerA.cookie, 'a-nova');
  });

  it('a vitrine responde 308 para o endereço novo', async () => {
    const resposta = await obterPublico('org-a/imoveis');

    expect(resposta.status).toBe(308);
    expect(resposta.headers.get('location')).toBe(
      '/api/publico/organizacoes/a-nova/imoveis',
    );
    expect(await resposta.json()).toMatchObject({ slugAtual: 'a-nova' });
  });

  it('o anúncio e a consulta seguem no redirecionamento', async () => {
    const resposta = await obterPublico(
      'org-a/imoveis/a-001?pagina=2&tipo=APARTMENT',
    );

    expect(resposta.status).toBe(308);
    expect(resposta.headers.get('location')).toBe(
      '/api/publico/organizacoes/a-nova/imoveis/a-001?pagina=2&tipo=APARTMENT',
    );
  });

  it('seguindo o redirecionamento, o anúncio abre', async () => {
    const resposta = await fetch(
      `${app.url}/api/publico/organizacoes/org-a/imoveis/a-001`,
    );

    expect(resposta.status).toBe(200);
  });

  it('duas trocas: o primeiro endereço leva direto ao atual', async () => {
    await trocar(cenario.ownerA.cookie, 'a-terceira');

    const resposta = await obterPublico('org-a');

    expect(resposta.status).toBe(308);
    expect(resposta.headers.get('location')).toBe(
      '/api/publico/organizacoes/a-terceira',
    );
  });

  it('organização suspensa: o endereço antigo responde 404, não 308', async () => {
    await prisma.organization.update({
      where: { id: cenario.organizacaoA },
      data: { status: 'SUSPENDED' },
    });

    const antigo = await obterPublico('org-a');
    const inexistente = await obterPublico('nunca-existiu');

    // Redirecionar confirmaria que a conta existe. As duas respostas são
    // iguais, corpo inclusive.
    expect(antigo.status).toBe(404);
    expect(await antigo.json()).toEqual(await inexistente.json());
  });

  it('o envio de interesse ao endereço antigo é redirecionado como POST', async () => {
    const resposta = await fetch(
      `${app.url}/api/publico/organizacoes/org-a/interesse`,
      {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: cenario.imovelDeA1,
          nomeCompleto: 'Pessoa Com Pagina Antiga',
          telefone: '11988887777',
          consentiuComAPrivacidade: true,
          ficha: emitirFicha('org-a', Date.now() - 3_000),
        }),
      },
    );

    // 308 preserva o método. Nada é gravado no endereço antigo.
    expect(resposta.status).toBe(308);
    expect(
      await prisma.lead.count({ where: { source: 'PUBLIC_CATALOG' } }),
    ).toBe(0);
  });
});
