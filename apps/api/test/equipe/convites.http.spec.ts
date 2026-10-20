/**
 * Item A10: convites de membro.
 *
 * É por aqui que `ADMIN`, `MANAGER` e `AGENT` passam a existir — o cadastro só
 * cria `OWNER`. Dois eixos importam: a **hierarquia** (quem convida quem) e o
 * **token** (hash no banco, prazo, uso único).
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
import {
  montarCenario,
  type Cenario,
} from '../apoio/cenario-de-duas-organizacoes';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;
let emails: RemetenteDeLog;

const CONVIDADO = 'convidado@exemplo.com';

function enviar(
  metodo: 'POST' | 'DELETE',
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

function obter(caminho: string, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    headers: cookie ? { cookie } : {},
  });
}

function convidar(papel: string, cookie: string, email = CONVIDADO) {
  return enviar('POST', '/equipe/convites', cookie, { email, papel });
}

/** O token só existe no e-mail: o banco guarda apenas o hash dele. */
function tokenDoUltimoEmail(para = CONVIDADO): string {
  const email = emails.ultimoPara(para);
  const encontrado = email?.corpo.match(/\/convite\/([A-Za-z0-9_-]+)/);

  if (!encontrado) {
    throw new Error(`Nenhum link de convite enviado para ${para}.`);
  }

  return encontrado[1];
}

/**
 * Insere um convite direto no banco, com token conhecido.
 *
 * Serve aos casos que a criacao pela rota recusa de proposito — convidar quem
 * ja e membro, por exemplo. Esse estado existe na pratica: o convite e criado,
 * a pessoa entra por outro caminho, e so depois clica no link.
 */
async function criarConviteNoBanco(params: {
  organizationId: string;
  email: string;
  token: string;
  papel?: 'ADMIN' | 'MANAGER' | 'AGENT';
}): Promise<void> {
  const convidante = await prisma.membership.findFirstOrThrow({
    where: { organizationId: params.organizationId },
    select: { id: true },
  });

  await prisma.invitation.create({
    data: {
      organizationId: params.organizationId,
      email: params.email,
      role: params.papel ?? 'AGENT',
      tokenHash: hashDoToken(params.token),
      invitedByMembershipId: convidante.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
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
  cenario = await montarCenario(prisma);
  emails.enviados.length = 0;
});

describe('POST /api/equipe/convites — hierarquia', () => {
  it('responde 401 sem sessão', async () => {
    const resposta = await enviar('POST', '/equipe/convites', undefined, {
      email: CONVIDADO,
      papel: 'AGENT',
    });

    expect(resposta.status).toBe(401);
  });

  it('o OWNER convida qualquer papel', async () => {
    for (const papel of ['ADMIN', 'MANAGER', 'AGENT']) {
      const resposta = await convidar(
        papel,
        cenario.ownerA.cookie,
        `${papel.toLowerCase()}@exemplo.com`,
      );

      expect(resposta.status).toBe(201);
    }
  });

  it('o ADMIN convida MANAGER e AGENT, mas não outro ADMIN', async () => {
    expect(
      (await convidar('MANAGER', cenario.adminA.cookie, 'm@exemplo.com'))
        .status,
    ).toBe(201);
    expect(
      (await convidar('AGENT', cenario.adminA.cookie, 'a@exemplo.com')).status,
    ).toBe(201);

    // A matriz dá `equipe:convidarAdmin` só ao OWNER.
    expect(
      (await convidar('ADMIN', cenario.adminA.cookie, 'x@exemplo.com')).status,
    ).toBe(403);
  });

  it('o MANAGER convida só AGENT', async () => {
    expect(
      (await convidar('AGENT', cenario.managerA.cookie, 'a@exemplo.com'))
        .status,
    ).toBe(201);
    expect(
      (await convidar('MANAGER', cenario.managerA.cookie, 'm@exemplo.com'))
        .status,
    ).toBe(403);
    expect(
      (await convidar('ADMIN', cenario.managerA.cookie, 'x@exemplo.com'))
        .status,
    ).toBe(403);
  });

  it('o AGENT não convida ninguém', async () => {
    const resposta = await convidar('AGENT', cenario.agenteA1.cookie);

    // Aqui a recusa vem da guarda, no passo 4: o papel não alcança nem a
    // permissão de convite mais baixa.
    expect(resposta.status).toBe(403);
  });

  it('OWNER não é convidável', async () => {
    const resposta = await convidar('OWNER', cenario.ownerA.cookie);

    // Existe exatamente um OWNER por organização, e trocar de dono é
    // transferência explícita. O schema já exclui o valor.
    expect(resposta.status).toBe(400);
  });

  it('papel inventado é recusado', async () => {
    expect((await convidar('SUPERUSER', cenario.ownerA.cookie)).status).toBe(
      400,
    );
  });
});

describe('POST /api/equipe/convites — token e e-mail', () => {
  it('nunca devolve o token na resposta', async () => {
    const resposta = await convidar('AGENT', cenario.ownerA.cookie);
    const corpo = await resposta.text();
    const token = tokenDoUltimoEmail();

    // Devolver o token deixaria quem convida entrar na conta que ele criou.
    expect(corpo).not.toContain(token);
  });

  it('o banco guarda o hash, nunca o token', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const token = tokenDoUltimoEmail();

    const convite = await prisma.invitation.findFirstOrThrow({
      select: { tokenHash: true },
    });

    expect(convite.tokenHash).toBe(hashDoToken(token));
    expect(convite.tokenHash).not.toBe(token);
  });

  it('envia o link para o endereço convidado', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);

    const email = emails.ultimoPara(CONVIDADO);
    expect(email).toBeDefined();
    expect(email!.corpo).toContain('/convite/');
    expect(email!.corpo).toContain('Imobiliaria A');
  });

  it('grava prazo de validade', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);

    const convite = await prisma.invitation.findFirstOrThrow({
      select: { expiresAt: true },
    });

    expect(convite.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('registra auditoria apontando para quem convidou', async () => {
    await convidar('AGENT', cenario.managerA.cookie);

    const registro = await prisma.activity.findFirstOrThrow({
      where: { action: 'convite.criado' },
    });

    expect(registro.organizationId).toBe(cenario.organizacaoA);
    expect(registro.actorMembershipId).toBe(cenario.managerA.membershipId);
    expect(registro.entityType).toBe('Invitation');
  });

  it('a auditoria não guarda o token', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const token = tokenDoUltimoEmail();

    const registro = await prisma.activity.findFirstOrThrow({
      where: { action: 'convite.criado' },
    });

    expect(JSON.stringify(registro.metadata)).not.toContain(token);
  });
});

describe('POST /api/equipe/convites — duplicatas', () => {
  it('recusa convidar quem já é membro', async () => {
    const resposta = await convidar(
      'AGENT',
      cenario.ownerA.cookie,
      'agente-a1@exemplo.com',
    );

    expect(resposta.status).toBe(409);
  });

  it('recusa segundo convite pendente para o mesmo e-mail', async () => {
    expect((await convidar('AGENT', cenario.ownerA.cookie)).status).toBe(201);
    expect((await convidar('AGENT', cenario.ownerA.cookie)).status).toBe(409);
  });

  it('a mesma pessoa pode ser convidada por organizações diferentes', async () => {
    expect((await convidar('AGENT', cenario.ownerA.cookie)).status).toBe(201);
    expect((await convidar('AGENT', cenario.ownerB.cookie)).status).toBe(201);
  });
});

describe('GET e DELETE /api/equipe/convites', () => {
  it('lista só os convites da própria organização', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);

    const deB = await obter('/equipe/convites', cenario.ownerB.cookie);
    const corpoDeB = (await deB.json()) as { convites: unknown[] };
    expect(corpoDeB.convites).toHaveLength(0);

    const deA = await obter('/equipe/convites', cenario.ownerA.cookie);
    const corpoDeA = (await deA.json()) as {
      convites: { email: string; papel: string; expirado: boolean }[];
    };
    expect(corpoDeA.convites).toHaveLength(1);
    expect(corpoDeA.convites[0].email).toBe(CONVIDADO);
    expect(corpoDeA.convites[0].expirado).toBe(false);
  });

  it('a listagem não devolve o hash do token', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);

    const resposta = await obter('/equipe/convites', cenario.ownerA.cookie);

    expect(await resposta.text()).not.toContain('tokenHash');
  });

  it('revogar convite de outra organização responde 404', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const convite = await prisma.invitation.findFirstOrThrow();

    const resposta = await enviar(
      'DELETE',
      `/equipe/convites/${convite.id}`,
      cenario.ownerB.cookie,
    );

    // 404, nunca 403: um 403 confirmaria que o convite existe.
    expect(resposta.status).toBe(404);
  });

  it('o MANAGER não revoga convite de ADMIN', async () => {
    await convidar('ADMIN', cenario.ownerA.cookie);
    const convite = await prisma.invitation.findFirstOrThrow();

    const resposta = await enviar(
      'DELETE',
      `/equipe/convites/${convite.id}`,
      cenario.managerA.cookie,
    );

    // Quem não pode criar um ADMIN também não mexe no convite de um.
    expect(resposta.status).toBe(403);
  });

  it('revogar invalida o token e registra auditoria', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const token = tokenDoUltimoEmail();
    const convite = await prisma.invitation.findFirstOrThrow();

    const resposta = await enviar(
      'DELETE',
      `/equipe/convites/${convite.id}`,
      cenario.ownerA.cookie,
    );
    expect(resposta.status).toBe(200);

    expect((await obter(`/convites/${token}`)).status).toBe(404);

    const registro = await prisma.activity.findFirst({
      where: { action: 'convite.revogado' },
    });
    expect(registro).not.toBeNull();
  });

  it('revogar duas vezes responde 409', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const convite = await prisma.invitation.findFirstOrThrow();

    await enviar(
      'DELETE',
      `/equipe/convites/${convite.id}`,
      cenario.ownerA.cookie,
    );
    const segunda = await enviar(
      'DELETE',
      `/equipe/convites/${convite.id}`,
      cenario.ownerA.cookie,
    );

    expect(segunda.status).toBe(409);
  });
});

describe('GET /api/convites/:token', () => {
  it('mostra o convite a quem tem o token', async () => {
    await convidar('MANAGER', cenario.ownerA.cookie);

    const resposta = await obter(`/convites/${tokenDoUltimoEmail()}`);

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      email: string;
      papel: string;
      organizacao: string;
      precisaCriarConta: boolean;
    };

    expect(corpo.email).toBe(CONVIDADO);
    expect(corpo.papel).toBe('MANAGER');
    expect(corpo.organizacao).toBe('Imobiliaria A');
    expect(corpo.precisaCriarConta).toBe(true);
  });

  it('token inventado responde 404', async () => {
    expect((await obter('/convites/nao-existe')).status).toBe(404);
  });

  it('diz que não precisa criar conta quando o e-mail já tem uma', async () => {
    // O owner de B tem conta, e nao e membro de A.
    await convidar('AGENT', cenario.ownerA.cookie, 'owner-b@exemplo.com');

    const resposta = await obter(
      `/convites/${tokenDoUltimoEmail('owner-b@exemplo.com')}`,
    );
    const corpo = (await resposta.json()) as { precisaCriarConta: boolean };

    expect(corpo.precisaCriarConta).toBe(false);
  });
});

describe('POST /api/convites/aceitar — criando conta', () => {
  const DADOS = {
    nome: 'Pessoa Convidada',
    senha: 'SenhaBoa123',
    aceitouOsTermos: true,
  };

  async function aceitar(token: string, extra: Record<string, unknown> = {}) {
    return enviar('POST', '/convites/aceitar', undefined, {
      token,
      ...DADOS,
      ...extra,
    });
  }

  it('cria conta e vínculo com o papel do convite, e deixa a pessoa dentro', async () => {
    await convidar('MANAGER', cenario.ownerA.cookie);

    const resposta = await aceitar(tokenDoUltimoEmail());
    expect(resposta.status).toBe(201);

    // Entra direto: acabou de criar a senha.
    const cookie = cookieDaResposta(resposta, 'sessao');
    expect(cookie).toBeDefined();

    const usuario = await prisma.user.findUniqueOrThrow({
      where: { email: CONVIDADO },
      select: { id: true, name: true, emailVerifiedAt: true },
    });
    expect(usuario.name).toBe(DADOS.nome);
    // Quem chegou pelo link provou que controla o endereço: o link só existia
    // na caixa de entrada dele.
    expect(usuario.emailVerifiedAt).not.toBeNull();

    const vinculo = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: usuario.id,
          organizationId: cenario.organizacaoA,
        },
      },
      select: { role: true, status: true },
    });
    expect(vinculo.role).toBe('MANAGER');
    expect(vinculo.status).toBe('ACTIVE');
  });

  it('o papel do convite não é escolhido por quem aceita', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);

    await aceitar(tokenDoUltimoEmail(), { papel: 'OWNER', role: 'ADMIN' });

    const vinculo = await prisma.membership.findFirstOrThrow({
      where: { user: { email: CONVIDADO } },
      select: { role: true },
    });

    expect(vinculo.role).toBe('AGENT');
  });

  it('o token é de uso único', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const token = tokenDoUltimoEmail();

    expect((await aceitar(token)).status).toBe(201);
    // Reutilizar não cria um segundo vínculo nem responde diferente de um
    // token que nunca existiu.
    expect((await aceitar(token)).status).toBe(404);

    expect(
      await prisma.membership.count({ where: { user: { email: CONVIDADO } } }),
    ).toBe(1);
  });

  it('marca o convite como aceito', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    await aceitar(tokenDoUltimoEmail());

    const convite = await prisma.invitation.findFirstOrThrow({
      select: { acceptedAt: true },
    });

    expect(convite.acceptedAt).not.toBeNull();
  });

  it('registra auditoria apontando para o vínculo recém-criado', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    await aceitar(tokenDoUltimoEmail());

    const vinculo = await prisma.membership.findFirstOrThrow({
      where: { user: { email: CONVIDADO } },
      select: { id: true },
    });
    const registro = await prisma.activity.findFirstOrThrow({
      where: { action: 'convite.aceito' },
    });

    // Foi a própria pessoa que aceitou; quem convidou já ficou em
    // `convite.criado`.
    expect(registro.actorMembershipId).toBe(vinculo.id);
    expect(registro.organizationId).toBe(cenario.organizacaoA);
  });

  it('convite expirado responde 404', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const token = tokenDoUltimoEmail();

    await prisma.invitation.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await aceitar(token)).status).toBe(404);
  });

  it('convite revogado responde 404', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const token = tokenDoUltimoEmail();

    await prisma.invitation.updateMany({ data: { revokedAt: new Date() } });

    expect((await aceitar(token)).status).toBe(404);
  });

  it('organização suspensa responde 404', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const token = tokenDoUltimoEmail();

    await prisma.organization.update({
      where: { id: cenario.organizacaoA },
      data: { status: 'SUSPENDED' },
    });

    // Entrar aqui seria passar por uma porta que a guarda fecha na requisição
    // seguinte.
    expect((await aceitar(token)).status).toBe(404);
  });

  it('recusa quando o e-mail já tem conta, sem trocar a senha dela', async () => {
    await convidar('AGENT', cenario.ownerA.cookie, 'owner-b@exemplo.com');
    const token = tokenDoUltimoEmail('owner-b@exemplo.com');

    const antes = await prisma.user.findUniqueOrThrow({
      where: { email: 'owner-b@exemplo.com' },
      select: { passwordHash: true },
    });

    const resposta = await aceitar(token);
    expect(resposta.status).toBe(409);

    const depois = await prisma.user.findUniqueOrThrow({
      where: { email: 'owner-b@exemplo.com' },
      select: { passwordHash: true },
    });

    // Sobrescrever a senha a partir de um link de convite seria um caminho de
    // tomada de conta para quem conseguisse convidar um endereço alheio.
    expect(depois.passwordHash).toBe(antes.passwordHash);
  });

  it('exige o aceite dos termos e senha válida', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);
    const token = tokenDoUltimoEmail();

    expect((await aceitar(token, { aceitouOsTermos: false })).status).toBe(400);
    expect((await aceitar(token, { senha: 'curta' })).status).toBe(400);
  });
});

describe('POST /api/convites/vincular — quem já tem conta', () => {
  function vincular(token: string, cookie?: string) {
    return enviar('POST', '/convites/vincular', cookie, { token });
  }

  it('responde 401 sem sessão', async () => {
    await criarConviteNoBanco({
      organizationId: cenario.organizacaoB,
      email: 'owner-c@exemplo.com',
      token: 'token-sem-sessao',
    });

    expect((await vincular('token-sem-sessao')).status).toBe(401);
  });

  it('cria o vínculo quando o e-mail da sessão é o do convite', async () => {
    // A pessoa dupla já é membro de A e de B; convidamos para uma terceira.
    const terceira = await prisma.organization.create({
      data: { name: 'Imobiliaria C', slug: 'org-c', kind: 'AGENCY' },
      select: { id: true },
    });
    const ownerC = await prisma.user.create({
      data: {
        name: 'Owner C',
        email: 'owner-c@exemplo.com',
        passwordHash: 'sem-login',
      },
      select: { id: true },
    });
    await prisma.membership.create({
      data: {
        userId: ownerC.id,
        organizationId: terceira.id,
        role: 'OWNER',
      },
    });
    await prisma.invitation.create({
      data: {
        organizationId: terceira.id,
        email: 'dual@exemplo.com',
        role: 'AGENT',
        tokenHash: hashDoToken('token-de-teste-para-vincular'),
        invitedByMembershipId: (
          await prisma.membership.findFirstOrThrow({
            where: { organizationId: terceira.id },
            select: { id: true },
          })
        ).id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const resposta = await vincular(
      'token-de-teste-para-vincular',
      cenario.dual.cookie,
    );

    expect(resposta.status).toBe(200);

    const vinculo = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: cenario.dual.userId,
          organizationId: terceira.id,
        },
      },
      select: { role: true },
    });
    expect(vinculo.role).toBe('AGENT');

    // A organizacao ativa nao muda: a pessoa pode estar no meio de algo na
    // organizacao em que ja estava. Quem decide e ela, pelo endpoint do A7.
    const sessao = await prisma.session.findUniqueOrThrow({
      where: { id: cenario.dual.sessaoId },
      select: { activeOrganizationId: true },
    });
    expect(sessao.activeOrganizationId).toBe(cenario.organizacaoA);
  });

  it('responde 404 quando o e-mail da sessão não é o do convite', async () => {
    await convidar('AGENT', cenario.ownerA.cookie);

    const resposta = await vincular(
      tokenDoUltimoEmail(),
      cenario.agenteB1.cookie,
    );

    // A mesma resposta de token inválido: dizer "este convite não é seu"
    // confirmaria, para quem interceptou o link, que ele é válido.
    expect(resposta.status).toBe(404);

    const total = await prisma.membership.count({
      where: { userId: cenario.agenteB1.userId },
    });
    expect(total).toBe(1);
  });

  it('responde 409 quando já é membro da organização', async () => {
    // Direto no banco: a rota de criacao recusaria convidar quem ja e membro.
    await criarConviteNoBanco({
      organizationId: cenario.organizacaoA,
      email: 'dual@exemplo.com',
      token: 'token-de-quem-ja-e-membro',
    });

    const resposta = await vincular(
      'token-de-quem-ja-e-membro',
      cenario.dual.cookie,
    );

    expect(resposta.status).toBe(409);
  });
});
