/**
 * Testes de HTTP da autenticação, contra a aplicação inteira no ar.
 *
 * O que só se prova aqui, e não nos testes de serviço: os atributos do cookie,
 * os códigos de status, o formato do erro de validação, e — o mais importante —
 * o que **não** aparece no corpo da resposta.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import {
  cookieDaResposta,
  subirAppDeTeste,
  type AppDeTeste,
} from '../apoio/app-de-teste';

let app: AppDeTeste;
let prisma: PrismaClient;

const CADASTRO = {
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  senha: 'SenhaBoa123',
  nomeDaOrganizacao: 'Imobiliaria Silva',
  slugDaOrganizacao: 'imobiliaria-silva',
  aceitouOsTermos: true,
};

function postar(caminho: string, corpo: unknown, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

function obter(caminho: string, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    headers: cookie ? { cookie } : {},
  });
}

/** Faz cadastro e devolve o cookie de sessão pronto para reenvio. */
async function cadastrarEObterCookie(): Promise<string> {
  const resposta = await postar('/autenticacao/cadastro', CADASTRO);
  const cookie = cookieDaResposta(resposta, 'sessao');
  return `sessao=${cookie!.valor}`;
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
});

describe('POST /api/autenticacao/cadastro', () => {
  it('responde 201 e grava o cookie de sessão', async () => {
    const resposta = await postar('/autenticacao/cadastro', CADASTRO);

    expect(resposta.status).toBe(201);

    const cookie = cookieDaResposta(resposta, 'sessao');
    expect(cookie).toBeDefined();
    expect(cookie!.valor.length).toBeGreaterThan(30);
  });

  it('marca o cookie como HttpOnly, SameSite=Lax e Path=/', async () => {
    const resposta = await postar('/autenticacao/cadastro', CADASTRO);
    const atributos = cookieDaResposta(resposta, 'sessao')!.atributos;

    // HttpOnly: JavaScript da página não lê o cookie, o que limita o estrago
    // de um XSS a sessão roubada.
    expect(atributos).toMatch(/HttpOnly/i);
    // Lax: o navegador não envia o cookie em requisição disparada por outro
    // site. Só é possível porque site e API ficam no mesmo domínio.
    expect(atributos).toMatch(/SameSite=Lax/i);
    expect(atributos).toMatch(/Path=\//i);
  });

  it('não marca Secure fora de produção', async () => {
    // Em http://localhost o navegador descartaria um cookie Secure, e ninguém
    // conseguiria entrar em desenvolvimento.
    const resposta = await postar('/autenticacao/cadastro', CADASTRO);

    expect(cookieDaResposta(resposta, 'sessao')!.atributos).not.toMatch(
      /Secure/i,
    );
  });

  it('nunca devolve o token no corpo da resposta', async () => {
    const resposta = await postar('/autenticacao/cadastro', CADASTRO);
    const token = cookieDaResposta(resposta, 'sessao')!.valor;
    const corpo = await resposta.text();

    // Token no JSON seria legível por JavaScript da página, desfazendo
    // justamente a proteção que o HttpOnly existe para dar.
    expect(corpo).not.toContain(token);
  });

  it('nunca devolve o hash da senha', async () => {
    const resposta = await postar('/autenticacao/cadastro', CADASTRO);
    const corpo = await resposta.text();

    expect(corpo).not.toContain('argon2');
    expect(corpo).not.toContain(CADASTRO.senha);
  });

  it('responde 400 com erro por campo quando a entrada é inválida', async () => {
    const resposta = await postar('/autenticacao/cadastro', {
      ...CADASTRO,
      email: 'nao-e-email',
      senha: 'curta',
      slugDaOrganizacao: 'AI',
    });

    expect(resposta.status).toBe(400);

    const corpo = (await resposta.json()) as {
      mensagem: string;
      erros: { campo: string; mensagem: string }[];
    };

    expect(corpo.mensagem).toBe('Dados invalidos.');
    const campos = corpo.erros.map((e) => e.campo);
    expect(campos).toContain('email');
    expect(campos).toContain('senha');
    expect(campos).toContain('slugDaOrganizacao');
  });

  it('recusa slug reservado', async () => {
    const resposta = await postar('/autenticacao/cadastro', {
      ...CADASTRO,
      slugDaOrganizacao: 'admin',
    });

    // A lista é compartilhada com o site, mas é a recusa aqui que vale.
    expect(resposta.status).toBe(400);
  });

  it('exige o aceite dos termos', async () => {
    const resposta = await postar('/autenticacao/cadastro', {
      ...CADASTRO,
      aceitouOsTermos: false,
    });

    expect(resposta.status).toBe(400);
  });

  it('descarta campo não declarado no schema', async () => {
    const resposta = await postar('/autenticacao/cadastro', {
      ...CADASTRO,
      // Tentativa de nascer com papel diferente pela porta da entrada.
      papel: 'ADMIN',
      status: 'DISABLED',
    });

    expect(resposta.status).toBe(201);

    const usuario = await prisma.user.findFirst();
    expect(usuario?.status).toBe('ACTIVE');

    const vinculo = await prisma.membership.findFirst();
    expect(vinculo?.role).toBe('OWNER');
  });

  it('responde 409 em e-mail repetido, sem confirmar que a conta existe', async () => {
    await postar('/autenticacao/cadastro', CADASTRO);

    const resposta = await postar('/autenticacao/cadastro', {
      ...CADASTRO,
      slugDaOrganizacao: 'outro-endereco',
    });

    expect(resposta.status).toBe(409);
    const corpo = await resposta.text();
    expect(corpo).not.toMatch(/ja existe|cadastrado|em uso/i);
  });
});

describe('POST /api/autenticacao/entrar', () => {
  beforeEach(async () => {
    await postar('/autenticacao/cadastro', CADASTRO);
  });

  it('responde 200 e grava cookie novo', async () => {
    const resposta = await postar('/autenticacao/entrar', {
      email: CADASTRO.email,
      senha: CADASTRO.senha,
    });

    expect(resposta.status).toBe(200);
    expect(cookieDaResposta(resposta, 'sessao')).toBeDefined();
  });

  it('responde 401 com a mesma mensagem para senha errada e e-mail inexistente', async () => {
    const senhaErrada = await postar('/autenticacao/entrar', {
      email: CADASTRO.email,
      senha: 'SenhaErrada123',
    });
    const emailInexistente = await postar('/autenticacao/entrar', {
      email: 'ninguem@exemplo.com',
      senha: CADASTRO.senha,
    });

    expect(senhaErrada.status).toBe(401);
    expect(emailInexistente.status).toBe(401);

    // Status e mensagem idênticos: distinguir os dois casos transformaria o
    // login em consulta de quem tem conta na plataforma.
    expect(await senhaErrada.text()).toBe(await emailInexistente.text());
  });

  it('não grava cookie quando o login falha', async () => {
    const resposta = await postar('/autenticacao/entrar', {
      email: CADASTRO.email,
      senha: 'SenhaErrada123',
    });

    expect(cookieDaResposta(resposta, 'sessao')).toBeUndefined();
  });
});

describe('GET /api/autenticacao/eu', () => {
  it('responde 401 sem cookie', async () => {
    expect((await obter('/autenticacao/eu')).status).toBe(401);
  });

  it('responde 401 com cookie inventado', async () => {
    const resposta = await obter('/autenticacao/eu', 'sessao=inventado123');
    expect(resposta.status).toBe(401);
  });

  it('responde 200 com a sessão válida', async () => {
    const cookie = await cadastrarEObterCookie();

    const resposta = await obter('/autenticacao/eu', cookie);
    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as {
      userId: string;
      organizationId: string | null;
    };

    expect(corpo.userId).toHaveLength(25);
    // Com um único vínculo, a organização ativa já vem resolvida.
    expect(corpo.organizationId).not.toBeNull();
  });

  it('para de responder quando a conta é desativada', async () => {
    const cookie = await cadastrarEObterCookie();
    expect((await obter('/autenticacao/eu', cookie)).status).toBe(200);

    await prisma.user.updateMany({ data: { status: 'DISABLED' } });

    // Conta desativada não continua navegando com a sessão que já tinha.
    expect((await obter('/autenticacao/eu', cookie)).status).toBe(401);
  });
});

describe('POST /api/autenticacao/sair', () => {
  it('invalida a sessão e limpa o cookie', async () => {
    const cookie = await cadastrarEObterCookie();

    const saida = await postar('/autenticacao/sair', {}, cookie);
    expect(saida.status).toBe(200);

    // O cookie copiado antes do logout não volta a funcionar: é a revogação
    // no servidor que encerra a sessão, não a limpeza do cookie.
    expect((await obter('/autenticacao/eu', cookie)).status).toBe(401);
  });

  it('responde 401 sem sessão', async () => {
    expect((await postar('/autenticacao/sair', {})).status).toBe(401);
  });
});

describe('rotas sob /api', () => {
  it('o health check responde no prefixo', async () => {
    const resposta = await obter('/health');

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { database: string };
    expect(corpo.database).toBe('ok');
  });

  it('rota sem o prefixo /api não existe', async () => {
    // O Next repassa /api/*; qualquer caminho fora disso não é da API.
    const resposta = await fetch(`${app.url}/health`);
    expect(resposta.status).toBe(404);
  });
});
