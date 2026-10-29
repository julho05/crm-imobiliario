/**
 * Item **A11**: limite de tentativas.
 *
 * O critério do roadmap — "teste confirma bloqueio após N tentativas" — é o
 * primeiro bloco. Os outros existem porque um limite pode falhar de jeitos que
 * o bloqueio sozinho não mostra:
 *
 * - **barrar quem não devia**: outro IP, outro e-mail, a janela seguinte
 * - **deixar passar sob concorrência**: o contador mora no MySQL justamente
 *   para valer com mais de um processo, e requisições simultâneas são o caso
 *   em que um contador ingênuo erra
 * - **guardar o que não devia**: a tabela não pode ter IP nem e-mail em claro
 *
 * Os IPs vêm do `X-Forwarded-For`, que o `trust proxy` de `configurarApp` faz o
 * Express ler — a mesma configuração de produção. Os endereços são da faixa
 * reservada para documentação (RFC 5737).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { LimiteDeTentativasService } from '../../src/limite/limite-de-tentativas.service';
import { LIMITES } from '../../src/limite/regras';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';

let app: AppDeTeste;
let prisma: PrismaClient;

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
});

const IP_A = '203.0.113.10';
const IP_B = '203.0.113.20';

function postar(caminho: string, corpo: unknown, ip = IP_A) {
  return fetch(`${app.url}/api${caminho}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(corpo),
  });
}

function entrar(email: string, ip = IP_A) {
  return postar(
    '/autenticacao/entrar',
    { email, senha: 'SenhaErrada123!' },
    ip,
  );
}

/** Um token bem formado e inexistente: a rota responde 404, rápido. */
const TOKEN_INEXISTENTE = 'a'.repeat(43);

function verificarEmail(ip = IP_A) {
  return postar(
    '/autenticacao/email/verificar',
    { token: TOKEN_INEXISTENTE },
    ip,
  );
}

/** Faz `vezes` chamadas em sequência e devolve os status. */
async function repetir(vezes: number, chamada: () => Promise<Response>) {
  const status: number[] = [];

  for (let i = 0; i < vezes; i++) {
    status.push((await chamada()).status);
  }

  return status;
}

describe('bloqueio apos N tentativas', () => {
  it('login: a tentativa N+1 com o mesmo e-mail e IP recebe 429', async () => {
    const maximo = LIMITES.loginPorIpEEmail.maximo;

    const status = await repetir(maximo, () => entrar('ana@exemplo.com'));
    expect(status.every((s) => s === 401)).toBe(true);

    const bloqueada = await entrar('ana@exemplo.com');
    expect(bloqueada.status).toBe(429);
  });

  it('o 429 traz Retry-After dentro da janela e mensagem em portugues', async () => {
    await repetir(LIMITES.loginPorIpEEmail.maximo, () =>
      entrar('ana@exemplo.com'),
    );

    const bloqueada = await entrar('ana@exemplo.com');
    const espera = Number(bloqueada.headers.get('retry-after'));
    const corpo = (await bloqueada.json()) as { mensagem: string };

    expect(espera).toBeGreaterThan(0);
    expect(espera).toBeLessThanOrEqual(
      LIMITES.loginPorIpEEmail.janelaEmSegundos,
    );
    expect(corpo.mensagem).toMatch(
      /^Muitas tentativas seguidas\. Tente de novo em \d+ minutos?\.$/,
    );
  });

  it('recuperacao: o 4o pedido para o mesmo e-mail e recusado, mesmo vindo de outro IP', async () => {
    const maximo = LIMITES.recuperacaoPorEmail.maximo;

    // IPs diferentes a cada pedido: é o e-mail que conta aqui, e é isso que
    // impede alguém de lotar a caixa de entrada de outra pessoa.
    for (let i = 0; i < maximo; i++) {
      const resposta = await postar(
        '/autenticacao/recuperacao',
        { email: 'bia@exemplo.com' },
        `203.0.113.${100 + i}`,
      );
      expect(resposta.status).toBe(200);
    }

    const bloqueada = await postar(
      '/autenticacao/recuperacao',
      { email: 'bia@exemplo.com' },
      '203.0.113.200',
    );
    expect(bloqueada.status).toBe(429);
  });

  it('recuperacao: o limite por e-mail conta igual para conta que nao existe', async () => {
    // Se o 429 so viesse para e-mail com conta, ele responderia a pergunta que
    // a mensagem igual para todos existe para nao responder.
    const status = await repetir(LIMITES.recuperacaoPorEmail.maximo + 1, () =>
      postar('/autenticacao/recuperacao', { email: 'ninguem@exemplo.com' }),
    );

    expect(status.at(-1)).toBe(429);
  });

  it('rotas de token: a tentativa N+1 recebe 429', async () => {
    const maximo = LIMITES.tokenPorIp.maximo;

    const status = await repetir(maximo, () => verificarEmail());
    expect(status.every((s) => s === 404)).toBe(true);

    expect((await verificarEmail()).status).toBe(429);
  });

  it('rotas de token dividem o contador: o convite tambem fica bloqueado', async () => {
    await repetir(LIMITES.tokenPorIp.maximo, () => verificarEmail());

    const convite = await fetch(
      `${app.url}/api/convites/${TOKEN_INEXISTENTE}`,
      {
        headers: { 'x-forwarded-for': IP_A },
      },
    );

    expect(convite.status).toBe(429);
  });

  it('cadastro: a tentativa N+1 do mesmo IP recebe 429', async () => {
    const corpo = {
      nome: 'Carla Teste',
      email: 'carla@exemplo.com',
      senha: 'SenhaForte123!',
      nomeDaOrganizacao: 'Carla Imoveis',
      slugDaOrganizacao: 'carla-imoveis',
      aceitouOsTermos: true,
    };

    // A primeira cria a conta; as seguintes batem no e-mail repetido. Todas
    // contam: o limite vem antes de qualquer trabalho.
    const status = await repetir(LIMITES.cadastroPorIp.maximo, () =>
      postar('/autenticacao/cadastro', corpo),
    );
    expect(status).not.toContain(429);

    expect((await postar('/autenticacao/cadastro', corpo)).status).toBe(429);
  });
});

describe('o limite nao barra quem nao devia', () => {
  it('outro IP, mesmo e-mail: o login continua aberto', async () => {
    await repetir(LIMITES.loginPorIpEEmail.maximo + 1, () =>
      entrar('ana@exemplo.com', IP_A),
    );

    // Por IP + e-mail, e nao por e-mail sozinho (decisão de 29/10/2026):
    // errar a senha de alguém dez vezes não tira essa pessoa do sistema.
    expect((await entrar('ana@exemplo.com', IP_B)).status).toBe(401);
  });

  it('mesmo IP, outro e-mail: o login continua aberto', async () => {
    await repetir(LIMITES.loginPorIpEEmail.maximo + 1, () =>
      entrar('ana@exemplo.com'),
    );

    expect((await entrar('bruno@exemplo.com')).status).toBe(401);
  });

  it('login e recuperacao contam separado', async () => {
    await repetir(LIMITES.loginPorIpEEmail.maximo + 1, () =>
      entrar('ana@exemplo.com'),
    );

    const recuperacao = await postar('/autenticacao/recuperacao', {
      email: 'ana@exemplo.com',
    });

    expect(recuperacao.status).toBe(200);
  });

  it('a janela seguinte libera', async () => {
    await repetir(LIMITES.loginPorIpEEmail.maximo + 1, () =>
      entrar('ana@exemplo.com'),
    );
    expect((await entrar('ana@exemplo.com')).status).toBe(429);

    // Recua as janelas gravadas um dia: para o servidor, as tentativas
    // passaram a ser de ontem. O relógio da aplicação não é substituído.
    await prisma.$executeRaw`
      UPDATE RateLimitHit SET windowStart = DATE_SUB(windowStart, INTERVAL 1 DAY)`;

    expect((await entrar('ana@exemplo.com')).status).toBe(401);
  });
});

describe('o contador vale sob concorrencia', () => {
  it('requisicoes simultaneas nao passam do maximo', async () => {
    const maximo = LIMITES.tokenPorIp.maximo;
    const total = maximo + 15;

    const respostas = await Promise.all(
      Array.from({ length: total }, () => verificarEmail()),
    );
    const status = respostas.map((r) => r.status);

    // No máximo `maximo` passam. A leitura depois do incremento pode ver um
    // número maior que o da própria tentativa — nunca menor —, então errar é
    // recusar uma a mais, nunca deixar passar uma a mais.
    expect(status.filter((s) => s !== 429).length).toBeLessThanOrEqual(maximo);
    expect(status.filter((s) => s === 429).length).toBeGreaterThanOrEqual(
      total - maximo,
    );

    // E o contador registrou todas: o incremento é atômico.
    const linhas = await prisma.rateLimitHit.findMany();
    expect(linhas.map((l) => l.hits)).toEqual([total]);
  });
});

describe('a tabela nao guarda IP nem e-mail', () => {
  it('as chaves sao HMAC, sem nada legivel', async () => {
    await entrar('ana@exemplo.com');
    await postar('/autenticacao/recuperacao', { email: 'ana@exemplo.com' });

    const linhas = await prisma.rateLimitHit.findMany();
    expect(linhas.length).toBeGreaterThan(0);

    for (const linha of linhas) {
      expect(linha.key).toMatch(/^[0-9a-f]{64}$/);
    }

    const tudo = JSON.stringify(linhas);
    expect(tudo).not.toContain('203.0.113');
    expect(tudo).not.toContain('ana@exemplo.com');
  });
});

describe('limpeza durante o uso', () => {
  it('apaga as janelas vencidas e deixa as vigentes', async () => {
    await entrar('ana@exemplo.com');

    await prisma.rateLimitHit.create({
      data: {
        key: 'f'.repeat(64),
        windowStart: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const antes = await prisma.rateLimitHit.count();
    const apagadas = await app
      .provedor(LimiteDeTentativasService)
      .limparVencidos();

    expect(apagadas).toBe(1);
    expect(await prisma.rateLimitHit.count()).toBe(antes - 1);
    expect(
      await prisma.rateLimitHit.findFirst({ where: { key: 'f'.repeat(64) } }),
    ).toBeNull();
  });
});
