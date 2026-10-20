/**
 * Itens A8 e A9: verificação de e-mail e recuperação de senha.
 *
 * O que estes testes vigiam, acima de tudo: a resposta é **idêntica** exista a
 * conta ou não, e o token serve **uma vez**. Os dois são fáceis de quebrar sem
 * ninguém notar — o fluxo continua funcionando para quem tem conta, e é só o
 * vazamento que aparece.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { RemetenteDeEmail } from '../../src/email/remetente-de-email';
import type { RemetenteDeLog } from '../../src/email/remetente-de-log';
import { hashDoToken } from '../../src/autenticacao/sessao.service';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import {
  cookieDaResposta,
  subirAppDeTeste,
  type AppDeTeste,
} from '../apoio/app-de-teste';

let app: AppDeTeste;
let prisma: PrismaClient;
let emails: RemetenteDeLog;

const CADASTRO = {
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  senha: 'SenhaBoa123',
  nomeDaOrganizacao: 'Imobiliaria Silva',
  slugDaOrganizacao: 'imobiliaria-silva',
  aceitouOsTermos: true,
};

const SENHA_NOVA = 'OutraSenhaBoa456';

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

/** Cadastra e devolve o cookie de sessão. */
async function cadastrar(): Promise<string> {
  const resposta = await postar('/autenticacao/cadastro', CADASTRO);
  return `sessao=${cookieDaResposta(resposta, 'sessao')!.valor}`;
}

function linkDoUltimoEmail(prefixo: string, para = CADASTRO.email): string {
  const email = emails.ultimoPara(para);
  const encontrado = email?.corpo.match(
    new RegExp(`/${prefixo}/([A-Za-z0-9_-]+)`),
  );

  if (!encontrado) {
    throw new Error(`Nenhum link de ${prefixo} enviado para ${para}.`);
  }

  return encontrado[1];
}

beforeAll(async () => {
  app = await subirAppDeTeste();
  emails = app.provedor(RemetenteDeEmail) as RemetenteDeLog;
  prisma = criarClienteDeTeste();
  await prisma.$connect();
}, 60_000);

afterAll(async () => {
  await app.encerrar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparBanco(prisma);
  emails.enviados.length = 0;
});

describe('A8 — verificação de e-mail', () => {
  it('o cadastro envia o link de verificação', async () => {
    await cadastrar();

    const email = emails.ultimoPara(CADASTRO.email);
    expect(email).toBeDefined();
    expect(email!.corpo).toContain('/verificar-email/');
  });

  it('o banco guarda o hash do token, nunca o token', async () => {
    await cadastrar();
    const token = linkDoUltimoEmail('verificar-email');

    const registro = await prisma.emailVerificationToken.findFirstOrThrow({
      select: { tokenHash: true },
    });

    expect(registro.tokenHash).toBe(hashDoToken(token));
    expect(registro.tokenHash).not.toBe(token);
  });

  it('a conta nasce sem e-mail verificado', async () => {
    await cadastrar();

    const usuario = await prisma.user.findUniqueOrThrow({
      where: { email: CADASTRO.email },
      select: { emailVerifiedAt: true },
    });

    expect(usuario.emailVerifiedAt).toBeNull();
  });

  it('verificar com o token marca a conta', async () => {
    await cadastrar();
    const token = linkDoUltimoEmail('verificar-email');

    const resposta = await postar('/autenticacao/email/verificar', { token });
    expect(resposta.status).toBe(200);

    const usuario = await prisma.user.findUniqueOrThrow({
      where: { email: CADASTRO.email },
      select: { emailVerifiedAt: true },
    });
    expect(usuario.emailVerifiedAt).not.toBeNull();
  });

  it('o token serve uma vez só', async () => {
    await cadastrar();
    const token = linkDoUltimoEmail('verificar-email');

    expect(
      (await postar('/autenticacao/email/verificar', { token })).status,
    ).toBe(200);
    // Reutilizar falha, como exige o critério do A8.
    expect(
      (await postar('/autenticacao/email/verificar', { token })).status,
    ).toBe(404);
  });

  it('token expirado responde 404', async () => {
    await cadastrar();
    const token = linkDoUltimoEmail('verificar-email');

    await prisma.emailVerificationToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(
      (await postar('/autenticacao/email/verificar', { token })).status,
    ).toBe(404);
  });

  it('token inventado responde 404', async () => {
    const resposta = await postar('/autenticacao/email/verificar', {
      token: 'inventado',
    });

    expect(resposta.status).toBe(404);
  });

  it('reenviar exige sessão e invalida o token anterior', async () => {
    const cookie = await cadastrar();
    const primeiro = linkDoUltimoEmail('verificar-email');

    expect(
      (await postar('/autenticacao/email/reenviar-verificacao', {})).status,
    ).toBe(401);

    emails.enviados.length = 0;
    const reenvio = await postar(
      '/autenticacao/email/reenviar-verificacao',
      {},
      cookie,
    );
    expect(reenvio.status).toBe(200);

    const segundo = linkDoUltimoEmail('verificar-email');
    expect(segundo).not.toBe(primeiro);

    // Com dois tokens válidos ao mesmo tempo, um link antigo que vazou
    // continuaria servindo depois de a pessoa pedir outro.
    expect(
      (await postar('/autenticacao/email/verificar', { token: primeiro }))
        .status,
    ).toBe(404);
    expect(
      (await postar('/autenticacao/email/verificar', { token: segundo }))
        .status,
    ).toBe(200);
  });

  it('reenviar para quem já verificou responde 200 e não envia nada', async () => {
    const cookie = await cadastrar();
    const token = linkDoUltimoEmail('verificar-email');
    await postar('/autenticacao/email/verificar', { token });

    emails.enviados.length = 0;
    const resposta = await postar(
      '/autenticacao/email/reenviar-verificacao',
      {},
      cookie,
    );

    expect(resposta.status).toBe(200);
    expect(emails.enviados).toHaveLength(0);
  });

  it('o e-mail não verificado não impede usar o sistema', async () => {
    const cookie = await cadastrar();

    // Decisão do MVP: nada depende da confirmação. Bloquear o acesso até a
    // confirmação criaria um caminho de suporte para quem não recebeu o e-mail.
    expect((await obter('/autenticacao/eu', cookie)).status).toBe(200);
  });
});

describe('A9 — solicitar recuperação de senha', () => {
  it('responde o mesmo para e-mail existente e inexistente', async () => {
    await cadastrar();

    const existente = await postar('/autenticacao/recuperacao', {
      email: CADASTRO.email,
    });
    const inexistente = await postar('/autenticacao/recuperacao', {
      email: 'ninguem@exemplo.com',
    });

    expect(existente.status).toBe(inexistente.status);
    // Corpos idênticos: qualquer diferença aqui transforma o formulário em
    // consulta de quem tem conta na plataforma.
    expect(await existente.text()).toBe(await inexistente.text());
  });

  it('não envia e-mail para endereço sem conta', async () => {
    emails.enviados.length = 0;

    await postar('/autenticacao/recuperacao', {
      email: 'ninguem@exemplo.com',
    });

    expect(emails.enviados).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it('envia o link para quem tem conta', async () => {
    await cadastrar();
    emails.enviados.length = 0;

    await postar('/autenticacao/recuperacao', { email: CADASTRO.email });

    const email = emails.ultimoPara(CADASTRO.email);
    expect(email).toBeDefined();
    expect(email!.corpo).toContain('/redefinir-senha/');
  });

  it('não envia para conta desativada', async () => {
    await cadastrar();
    await prisma.user.updateMany({ data: { status: 'DISABLED' } });
    emails.enviados.length = 0;

    const resposta = await postar('/autenticacao/recuperacao', {
      email: CADASTRO.email,
    });

    // Mesma resposta, mas nada sai: redefinir senha não é caminho para
    // reativar acesso que foi tirado.
    expect(resposta.status).toBe(200);
    expect(emails.enviados).toHaveLength(0);
  });

  it('o segundo pedido invalida o token do primeiro', async () => {
    await cadastrar();

    await postar('/autenticacao/recuperacao', { email: CADASTRO.email });
    const primeiro = linkDoUltimoEmail('redefinir-senha');

    emails.enviados.length = 0;
    await postar('/autenticacao/recuperacao', { email: CADASTRO.email });
    const segundo = linkDoUltimoEmail('redefinir-senha');

    expect(segundo).not.toBe(primeiro);

    const falha = await postar('/autenticacao/senha/redefinir', {
      token: primeiro,
      senha: SENHA_NOVA,
      confirmacaoDaSenha: SENHA_NOVA,
    });
    expect(falha.status).toBe(404);
  });

  it('recusa e-mail mal formado', async () => {
    const resposta = await postar('/autenticacao/recuperacao', {
      email: 'nao-e-email',
    });

    expect(resposta.status).toBe(400);
  });
});

describe('A9 — redefinir senha', () => {
  async function pedirToken(): Promise<string> {
    await postar('/autenticacao/recuperacao', { email: CADASTRO.email });
    return linkDoUltimoEmail('redefinir-senha');
  }

  function redefinir(token: string, senha = SENHA_NOVA) {
    return postar('/autenticacao/senha/redefinir', {
      token,
      senha,
      confirmacaoDaSenha: senha,
    });
  }

  function entrar(senha: string) {
    return postar('/autenticacao/entrar', {
      email: CADASTRO.email,
      senha,
    });
  }

  it('troca a senha e a antiga deixa de servir', async () => {
    await cadastrar();
    const token = await pedirToken();

    expect((await redefinir(token)).status).toBe(200);

    expect((await entrar(SENHA_NOVA)).status).toBe(200);
    expect((await entrar(CADASTRO.senha)).status).toBe(401);
  });

  it('encerra as outras sessões do usuário', async () => {
    // Três sessões abertas, como quem usa o celular e dois navegadores.
    const cookie = await cadastrar();
    await postar('/autenticacao/entrar', {
      email: CADASTRO.email,
      senha: CADASTRO.senha,
    });
    await postar('/autenticacao/entrar', {
      email: CADASTRO.email,
      senha: CADASTRO.senha,
    });

    expect((await obter('/autenticacao/eu', cookie)).status).toBe(200);

    const token = await pedirToken();
    const resposta = await redefinir(token);

    const corpo = (await resposta.json()) as { sessoesEncerradas: number };
    expect(corpo.sessoesEncerradas).toBe(3);

    // É o ponto do A9: quem redefine a senha espera que o acesso de quem
    // estivesse dentro termine ali. Sem isto, a redefinição não expulsa o
    // invasor — e expulsá-lo era o motivo de trocar a senha.
    expect((await obter('/autenticacao/eu', cookie)).status).toBe(401);
  });

  it('o token serve uma vez só', async () => {
    await cadastrar();
    const token = await pedirToken();

    expect((await redefinir(token)).status).toBe(200);
    expect((await redefinir(token, 'TerceiraSenha789')).status).toBe(404);

    // E a senha da segunda tentativa não valeu.
    expect((await entrar('TerceiraSenha789')).status).toBe(401);
  });

  it('token expirado responde 404', async () => {
    await cadastrar();
    const token = await pedirToken();

    await prisma.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await redefinir(token)).status).toBe(404);
  });

  it('token inventado responde 404', async () => {
    expect((await redefinir('inventado')).status).toBe(404);
  });

  it('exige senha forte e confirmação igual', async () => {
    await cadastrar();
    const token = await pedirToken();

    expect((await redefinir(token, 'curta')).status).toBe(400);

    const divergente = await postar('/autenticacao/senha/redefinir', {
      token,
      senha: SENHA_NOVA,
      confirmacaoDaSenha: 'OutraCoisa123',
    });
    expect(divergente.status).toBe(400);

    // Nenhuma das tentativas inválidas consumiu o token.
    expect((await redefinir(token)).status).toBe(200);
  });

  it('a senha nova é gravada com hash, nunca em claro', async () => {
    await cadastrar();
    const token = await pedirToken();
    await redefinir(token);

    const usuario = await prisma.user.findUniqueOrThrow({
      where: { email: CADASTRO.email },
      select: { passwordHash: true },
    });

    expect(usuario.passwordHash).not.toContain(SENHA_NOVA);
    expect(usuario.passwordHash).toMatch(/^\$argon2id\$/);
  });
});
