/**
 * Item **C5**: o formulário de interesse.
 *
 * O critério do roadmap, um bloco por cláusula: "consentimento explícito
 * obrigatório; grava versão do aviso e **hash** do IP; resposta não devolve IDs
 * internos; lead vai ao responsável do imóvel ou à fila".
 *
 * Os outros blocos cobrem o que o critério supõe sem dizer: o imóvel tem de
 * ser um que o visitante alcança, o lead capturado obedece à mesma visibilidade
 * de qualquer outro no CRM, e a rota é limitada como toda rota pública.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVISO_DE_PRIVACIDADE } from '@app/shared';
import type { PrismaClient, Prisma } from '../../src/generated/prisma/client';
import { hashDeIp } from '../../src/comum/hash-de-ip';
import { emitirFicha } from '../../src/catalogo/ficha-do-formulario';
import { LIMITES } from '../../src/limite/regras';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
} from '../apoio/cenario-de-duas-organizacoes';

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
});

/** Faixa reservada para documentação (RFC 5737), como no teste do A11. */
const IP = '203.0.113.50';

/**
 * Publica um imóvel do cenário. Os do cenário base nascem rascunho, e é
 * justamente isso que os casos de 404 aproveitam.
 */
async function publicar(
  imovelId: string,
  dados: Partial<Prisma.PropertyUncheckedUpdateInput> = {},
): Promise<string> {
  await prisma.property.update({
    where: { id: imovelId },
    data: { status: 'AVAILABLE', publishedAt: new Date(), ...dados },
  });

  return imovelId;
}

function corpoValido(propertyId: string, extra: Record<string, unknown> = {}) {
  return {
    propertyId,
    nomeCompleto: 'Visitante Interessada',
    telefone: '11988887777',
    email: 'visitante@exemplo.com',
    mensagem: 'Ainda esta disponivel?',
    consentiuComAPrivacidade: true,
    // A ficha anti-spam do C6, emitida "há três segundos" para passar do tempo
    // mínimo. Os casos da ficha em si estão em `anti-spam.http.spec.ts`.
    ficha: emitirFicha('org-a', Date.now() - 3_000),
    ...extra,
  };
}

function enviar(corpo: unknown, slug = 'org-a', ip = IP) {
  return fetch(`${app.url}/api/publico/organizacoes/${slug}/interesse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(corpo),
  });
}

async function leadsCapturados() {
  return prisma.lead.findMany({
    where: { source: 'PUBLIC_CATALOG' },
    include: { inquiries: true },
  });
}

describe('consentimento explicito e obrigatorio', () => {
  it.each([
    ['ausente', {}],
    ['falso', { consentiuComAPrivacidade: false }],
    ['como texto', { consentiuComAPrivacidade: 'true' }],
  ])('consentimento %s: 400 e nenhum lead', async (_, consentimento) => {
    const imovel = await publicar(cenario.imovelDeA1);
    const corpo: Record<string, unknown> = corpoValido(imovel);
    delete corpo.consentiuComAPrivacidade;

    const resposta = await enviar({ ...corpo, ...consentimento });

    expect(resposta.status).toBe(400);
    expect(await leadsCapturados()).toHaveLength(0);
  });

  it('sem telefone e sem e-mail: 400', async () => {
    const imovel = await publicar(cenario.imovelDeA1);

    const resposta = await enviar(
      corpoValido(imovel, { telefone: undefined, email: undefined }),
    );

    expect(resposta.status).toBe(400);
    expect(await leadsCapturados()).toHaveLength(0);
  });
});

describe('o que se grava como prova do consentimento', () => {
  it('versao do aviso vinda do servidor, hora do aceite e hash do IP', async () => {
    const imovel = await publicar(cenario.imovelDeA1);
    const antes = Date.now();

    const resposta = await enviar(corpoValido(imovel));
    expect(resposta.status).toBe(201);

    const [lead] = await leadsCapturados();

    expect(lead.privacyNoticeVersion).toBe(AVISO_DE_PRIVACIDADE.versao);
    expect(lead.consentGivenAt!.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(lead.consentIpHash).toBe(hashDeIp(IP));
  });

  it('versao, data e IP enviados pelo visitante sao ignorados', async () => {
    const imovel = await publicar(cenario.imovelDeA1);

    await enviar(
      corpoValido(imovel, {
        privacyNoticeVersion: 'versao-inventada',
        versaoDoAviso: 'versao-inventada',
        consentGivenAt: '2020-01-01T00:00:00Z',
        consentIpHash: 'hash-inventado',
        assignedMemberId: cenario.agenteA2.membershipId,
        source: 'MANUAL',
      }),
    );

    const [lead] = await leadsCapturados();

    expect(lead.privacyNoticeVersion).toBe(AVISO_DE_PRIVACIDADE.versao);
    expect(lead.consentGivenAt!.getFullYear()).not.toBe(2020);
    expect(lead.consentIpHash).toBe(hashDeIp(IP));
    expect(lead.assignedMemberId).toBe(cenario.agenteA1.membershipId);
  });

  it('o IP nao aparece em claro em tabela nenhuma que a captura escreve', async () => {
    const imovel = await publicar(cenario.imovelDeA1);

    await enviar(corpoValido(imovel));

    const [lead] = await leadsCapturados();
    const atividades = await prisma.activity.findMany({
      where: { entityId: lead.id },
    });

    expect(JSON.stringify({ lead, atividades })).not.toContain(IP);
    expect(atividades).toHaveLength(1);
    expect(atividades[0].action).toBe('lead.capturado');
    expect(atividades[0].actorMembershipId).toBeNull();
    // Dado pessoal fora da auditoria, como no `lead.editado`.
    expect(JSON.stringify(atividades[0].metadata)).not.toContain('visitante');
  });
});

describe('a resposta nao devolve identificador interno', () => {
  it('so a confirmacao', async () => {
    const imovel = await publicar(cenario.imovelDeA1);

    const resposta = await enviar(corpoValido(imovel));
    const corpo = await resposta.text();
    const [lead] = await leadsCapturados();

    expect(JSON.parse(corpo)).toEqual({ recebido: true });
    expect(corpo).not.toContain(lead.id);
    expect(corpo).not.toContain(lead.inquiries[0].id);
    expect(corpo).not.toContain(cenario.agenteA1.membershipId);
  });
});

describe('para quem o lead vai', () => {
  it('ao responsavel pelo imovel, com a solicitacao ligada ao imovel', async () => {
    const imovel = await publicar(cenario.imovelDeA2);

    await enviar(corpoValido(imovel));

    const [lead] = await leadsCapturados();

    expect(lead.organizationId).toBe(cenario.organizacaoA);
    expect(lead.assignedMemberId).toBe(cenario.agenteA2.membershipId);
    expect(lead.status).toBe('NEW');
    expect(lead.inquiries).toHaveLength(1);
    expect(lead.inquiries[0].propertyId).toBe(imovel);
    expect(lead.inquiries[0].message).toBe('Ainda esta disponivel?');
    expect(lead.inquiries[0].sourceUrl).toBe('/o/org-a/imovel/a-002');
  });

  it('a fila, quando o imovel nao tem responsavel', async () => {
    const imovel = await publicar(cenario.imovelDeA1, { ownerMemberId: null });

    await enviar(corpoValido(imovel));

    const [lead] = await leadsCapturados();
    expect(lead.assignedMemberId).toBeNull();
  });

  it('a fila, quando o responsavel esta suspenso', async () => {
    const imovel = await publicar(cenario.imovelDeA1);
    await prisma.membership.update({
      where: { id: cenario.agenteA1.membershipId },
      data: { status: 'SUSPENDED' },
    });

    await enviar(corpoValido(imovel));

    const [lead] = await leadsCapturados();
    expect(lead.assignedMemberId).toBeNull();
  });

  it('cada envio e um lead novo, mesmo com o telefone repetido', async () => {
    const imovel = await publicar(cenario.imovelDeA1);

    await enviar(corpoValido(imovel));
    await enviar(corpoValido(imovel));

    expect(await leadsCapturados()).toHaveLength(2);
  });
});

describe('so imovel que o visitante alcanca', () => {
  it('rascunho: 404', async () => {
    const resposta = await enviar(corpoValido(cenario.imovelDeA1));

    expect(resposta.status).toBe(404);
    expect(await leadsCapturados()).toHaveLength(0);
  });

  it('vendido: 404', async () => {
    const imovel = await publicar(cenario.imovelDeA1, { status: 'SOLD' });

    expect((await enviar(corpoValido(imovel))).status).toBe(404);
  });

  it('excluido: 404', async () => {
    const imovel = await publicar(cenario.imovelDeA1, {
      deletedAt: new Date(),
    });

    expect((await enviar(corpoValido(imovel))).status).toBe(404);
  });

  it('imovel de outra organizacao, pelo slug desta: 404', async () => {
    // Publicado na B, enviado pela vitrine da A. Sem o recorte por
    // organização, o lead nasceria na A com um imóvel da B.
    const imovelDeB = await publicar(cenario.imovelDeB);

    expect((await enviar(corpoValido(imovelDeB), 'org-a')).status).toBe(404);
    expect(await leadsCapturados()).toHaveLength(0);
  });

  it('organizacao suspensa: 404', async () => {
    const imovel = await publicar(cenario.imovelDeA1);
    await prisma.organization.update({
      where: { id: cenario.organizacaoA },
      data: { status: 'SUSPENDED' },
    });

    expect((await enviar(corpoValido(imovel))).status).toBe(404);
    expect(await leadsCapturados()).toHaveLength(0);
  });

  it('reservado: aceito, porque aparece na vitrine', async () => {
    const imovel = await publicar(cenario.imovelDeA1, { status: 'RESERVED' });

    expect((await enviar(corpoValido(imovel))).status).toBe(201);
  });
});

describe('no CRM, o lead capturado e um lead como os outros', () => {
  async function verComo(cookie: string, id: string) {
    return fetch(`${app.url}/api/leads/${id}`, { headers: { cookie } });
  }

  it('o responsavel ve, com o consentimento; o colega recebe 404', async () => {
    const imovel = await publicar(cenario.imovelDeA1);
    await enviar(corpoValido(imovel));
    const [lead] = await leadsCapturados();

    const doResponsavel = await verComo(cenario.agenteA1.cookie, lead.id);
    expect(doResponsavel.status).toBe(200);
    const corpo = (await doResponsavel.json()) as {
      origem: string;
      consentimento: { versaoDoAviso: string } | null;
    };
    expect(corpo.origem).toBe('PUBLIC_CATALOG');
    expect(corpo.consentimento?.versaoDoAviso).toBe(
      AVISO_DE_PRIVACIDADE.versao,
    );

    expect((await verComo(cenario.agenteA2.cookie, lead.id)).status).toBe(404);
    expect((await verComo(cenario.ownerB.cookie, lead.id)).status).toBe(404);
  });
});

describe('limite por IP', () => {
  it(`o envio ${LIMITES.capturaPorIp.maximo + 1} do mesmo IP recebe 429`, async () => {
    const imovel = await publicar(cenario.imovelDeA1);
    const maximo = LIMITES.capturaPorIp.maximo;

    for (let i = 0; i < maximo; i++) {
      expect((await enviar(corpoValido(imovel))).status).toBe(201);
    }

    const bloqueada = await enviar(corpoValido(imovel));
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers.get('retry-after')).not.toBeNull();
    expect(await leadsCapturados()).toHaveLength(maximo);

    // Outro IP continua enviando.
    expect(
      (await enviar(corpoValido(imovel), 'org-a', '203.0.113.51')).status,
    ).toBe(201);
  });
});

describe('aviso de privacidade em rascunho', () => {
  it('em producao a captura responde 503 e nao grava nada', async () => {
    // O app de teste lê o `NODE_ENV` a cada requisição, então trocar aqui
    // basta — e é restaurado mesmo se a asserção falhar.
    expect(AVISO_DE_PRIVACIDADE.rascunho).toBe(true);
    const imovel = await publicar(cenario.imovelDeA1);
    const original = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = 'production';
      const resposta = await enviar(corpoValido(imovel));
      expect(resposta.status).toBe(503);
    } finally {
      process.env.NODE_ENV = original;
    }

    expect(await leadsCapturados()).toHaveLength(0);
  });
});
