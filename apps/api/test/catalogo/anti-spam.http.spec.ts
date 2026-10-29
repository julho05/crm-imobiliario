/**
 * Item **C6**: anti-spam do formulário de interesse.
 *
 * O critério do roadmap — "limite por IP comprovado em teste" — já é provado
 * em `captura-de-lead.http.spec.ts`, junto com o resto do C5. Aqui ficam os
 * dois mecanismos que o C6 acrescenta:
 *
 * - **o campo-armadilha**, que descarta o envio em silêncio: a resposta tem de
 *   ser indistinguível da de um envio aceito, e nada pode ser gravado
 * - **a ficha assinada**, que mede o tempo de preenchimento pela hora do
 *   servidor. O bloco dela testa os jeitos de fabricar uma: sem assinatura,
 *   assinatura trocada, hora reescrita, ficha de outra vitrine
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import {
  conferirFicha,
  emitirFicha,
  TEMPO_MINIMO_EM_MS,
  VALIDADE_EM_MS,
} from '../../src/catalogo/ficha-do-formulario';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
} from '../apoio/cenario-de-duas-organizacoes';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;
let imovel: string;

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
  imovel = cenario.imovelDeA1;
  await prisma.property.update({
    where: { id: imovel },
    data: { status: 'AVAILABLE', publishedAt: new Date() },
  });
});

/** Uma ficha da org A emitida há `idadeEmMs`. */
function fichaComIdade(idadeEmMs: number, slug = 'org-a') {
  return emitirFicha(slug, Date.now() - idadeEmMs);
}

function enviar(extra: Record<string, unknown>) {
  return fetch(`${app.url}/api/publico/organizacoes/org-a/interesse`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.60',
    },
    body: JSON.stringify({
      propertyId: imovel,
      nomeCompleto: 'Visitante Interessada',
      telefone: '11988887777',
      consentiuComAPrivacidade: true,
      ficha: fichaComIdade(3_000),
      ...extra,
    }),
  });
}

async function contarLeads() {
  return prisma.lead.count({ where: { source: 'PUBLIC_CATALOG' } });
}

describe('campo-armadilha', () => {
  it('preenchido: a mesma resposta do envio aceito, e nada gravado', async () => {
    const aceito = await enviar({});
    const corpoAceito = await aceito.text();
    expect(await contarLeads()).toBe(1);

    const armadilha = await enviar({ site: 'https://spam.exemplo.com' });

    expect(armadilha.status).toBe(aceito.status);
    expect(await armadilha.text()).toBe(corpoAceito);
    expect(await contarLeads()).toBe(1);
    expect(await prisma.inquiry.count()).toBe(1);
  });

  it('vazio, como o navegador manda: aceito', async () => {
    expect((await enviar({ site: '' })).status).toBe(201);
    expect(await contarLeads()).toBe(1);
  });
});

describe('ficha assinada', () => {
  it('ausente: 400', async () => {
    expect((await enviar({ ficha: undefined })).status).toBe(400);
    expect(await contarLeads()).toBe(0);
  });

  it('emitida agora mesmo: 400 pedindo para enviar de novo', async () => {
    const resposta = await enviar({ ficha: fichaComIdade(0) });

    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { mensagem: string }).mensagem).toMatch(
      /envie de novo/,
    );
    expect(await contarLeads()).toBe(0);
  });

  it('a mesma ficha, depois do tempo minimo: aceita', async () => {
    // O caso da pessoa que recebeu "aguarde um instante" e clicou de novo.
    expect(
      (await enviar({ ficha: fichaComIdade(TEMPO_MINIMO_EM_MS + 100) })).status,
    ).toBe(201);
  });

  it('vencida: 400 pedindo para recarregar', async () => {
    const resposta = await enviar({
      ficha: fichaComIdade(VALIDADE_EM_MS + 60_000),
    });

    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { mensagem: string }).mensagem).toMatch(
      /Recarregue/,
    );
  });

  it('de outra vitrine: 400', async () => {
    expect(
      (await enviar({ ficha: fichaComIdade(3_000, 'org-b') })).status,
    ).toBe(400);
    expect(await contarLeads()).toBe(0);
  });

  it.each([
    ['so a hora', () => String(Date.now() - 60_000)],
    ['assinatura inventada', () => `${Date.now() - 60_000}.${'a'.repeat(64)}`],
    [
      'hora reescrita para tras, com a assinatura de uma ficha recem-emitida',
      () => {
        const [, assinatura] = emitirFicha('org-a').split('.');
        return `${Date.now() - 60_000}.${assinatura}`;
      },
    ],
    ['partes a mais', () => `${fichaComIdade(3_000)}.extra`],
    ['texto qualquer', () => 'nao-e-uma-ficha'],
  ])('fabricada (%s): 400', async (_, fabricar) => {
    expect((await enviar({ ficha: fabricar() })).status).toBe(400);
    expect(await contarLeads()).toBe(0);
  });

  it('a rota de emissao devolve uma ficha que vale para a mesma vitrine', async () => {
    const resposta = await fetch(
      `${app.url}/api/publico/organizacoes/org-a/interesse/ficha`,
    );
    const { ficha } = (await resposta.json()) as { ficha: string };

    expect(resposta.status).toBe(200);
    // Recém-emitida: cedo agora, válida dois segundos depois — sem esperar,
    // passando o relógio para `conferirFicha`.
    expect(conferirFicha('org-a', ficha)).toBe('cedo');
    expect(
      conferirFicha('org-a', ficha, Date.now() + TEMPO_MINIMO_EM_MS + 100),
    ).toBe('valida');
    expect(conferirFicha('org-b', ficha, Date.now() + 5_000)).toBe('invalida');
  });
});
