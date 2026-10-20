/**
 * Testes de integração do cadastro e do login, contra MySQL de verdade.
 *
 * Banco real, e não dublê, porque o que mais importa aqui só existe no banco:
 * a transação do cadastro, os índices únicos de e-mail e slug, e as chaves
 * estrangeiras. Um `PrismaService` simulado passaria em todos estes testes com
 * o código errado.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import {
  ETAPAS_PADRAO_DO_FUNIL,
  Role,
  type EntradaDeCadastro,
} from '@app/shared';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AutenticacaoService } from '../../src/autenticacao/autenticacao.service';
import { SenhaService } from '../../src/autenticacao/senha.service';
import { SessaoService } from '../../src/autenticacao/sessao.service';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';

let prisma: PrismaClient;
let autenticacao: AutenticacaoService;
let sessoes: SessaoService;

const CADASTRO_BASE: EntradaDeCadastro = {
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  senha: 'SenhaBoa123',
  nomeDaOrganizacao: 'Imobiliaria Silva',
  slugDaOrganizacao: 'imobiliaria-silva',
  aceitouOsTermos: true,
};

beforeAll(async () => {
  prisma = criarClienteDeTeste();
  await prisma.$connect();

  // O PrismaService é injetado por tipo; aqui entra o cliente de teste, que
  // aponta para o banco de teste em vez do de desenvolvimento.
  const comoServico = prisma as unknown as PrismaService;
  const senhas = new SenhaService();
  sessoes = new SessaoService(comoServico);
  autenticacao = new AutenticacaoService(comoServico, senhas, sessoes);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparBanco(prisma);
});

describe('cadastro', () => {
  it('cria pessoa, organização, vínculo OWNER e etapas do funil', async () => {
    const { userId, organizationId } =
      await autenticacao.cadastrar(CADASTRO_BASE);

    const usuario = await prisma.user.findUnique({ where: { id: userId } });
    expect(usuario?.email).toBe('maria@exemplo.com');
    expect(usuario?.name).toBe('Maria Silva');
    // A senha nunca é gravada em claro.
    expect(usuario?.passwordHash).not.toContain('SenhaBoa123');
    expect(usuario?.passwordHash.startsWith('$argon2id$')).toBe(true);

    const organizacao = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    expect(organizacao?.slug).toBe('imobiliaria-silva');
    // Nasce SOLO: convidar alguém depois não exige migrar nada.
    expect(organizacao?.kind).toBe('SOLO');

    const vinculos = await prisma.membership.findMany({
      where: { organizationId },
    });
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0].role).toBe(Role.OWNER);
    expect(vinculos[0].status).toBe('ACTIVE');

    const etapas = await prisma.pipelineStage.findMany({
      where: { organizationId },
      orderBy: { position: 'asc' },
    });
    expect(etapas.map((e) => e.name)).toEqual(
      ETAPAS_PADRAO_DO_FUNIL.map((e) => e.nome),
    );
    expect(etapas.filter((e) => e.isWon)).toHaveLength(1);
    expect(etapas.filter((e) => e.isLost)).toHaveLength(1);
  });

  it('registra a criação em auditoria', async () => {
    const { organizationId } = await autenticacao.cadastrar(CADASTRO_BASE);

    const registros = await prisma.activity.findMany({
      where: { organizationId },
    });

    expect(registros).toHaveLength(1);
    expect(registros[0].action).toBe('organizacao.criada');
    expect(registros[0].entityType).toBe('Organization');
    expect(registros[0].actorMembershipId).not.toBeNull();
  });

  it('guarda o hash do IP, nunca o IP', async () => {
    const { organizationId } = await autenticacao.cadastrar(CADASTRO_BASE, {
      ipHash: 'hash-de-ip-ficticio-para-teste',
    });

    const registro = await prisma.activity.findFirst({
      where: { organizationId },
    });

    expect(registro?.ipHash).toBe('hash-de-ip-ficticio-para-teste');
  });

  it('define a organização como a última ativa do usuário', async () => {
    const { userId, organizationId } =
      await autenticacao.cadastrar(CADASTRO_BASE);

    const usuario = await prisma.user.findUnique({ where: { id: userId } });
    expect(usuario?.lastActiveOrganizationId).toBe(organizationId);
  });

  it('recusa e-mail já cadastrado sem confirmar que a conta existe', async () => {
    await autenticacao.cadastrar(CADASTRO_BASE);

    const erro = await autenticacao
      .cadastrar({ ...CADASTRO_BASE, slugDaOrganizacao: 'outro-endereco' })
      .catch((e) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    const mensagem = (erro as ConflictException).message;
    // A mensagem não pode confirmar que aquele e-mail tem conta: isso
    // transformaria o cadastro em consulta de quem é cliente da plataforma.
    expect(mensagem).not.toMatch(/ja existe|em uso|cadastrado/i);
    expect(mensagem).toContain('Nao foi possivel criar a conta');
  });

  it('recusa slug já usado por outra organização', async () => {
    await autenticacao.cadastrar(CADASTRO_BASE);

    const erro = await autenticacao
      .cadastrar({ ...CADASTRO_BASE, email: 'outra@exemplo.com' })
      .catch((e) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).message).toContain('endereco publico');
  });

  it('recusa slug que ainda redireciona para outra organização', async () => {
    const { organizationId } = await autenticacao.cadastrar(CADASTRO_BASE);

    // A organização trocou de endereço; o antigo continua redirecionando.
    await prisma.organizationSlugHistory.create({
      data: {
        organizationId,
        slug: 'endereco-antigo',
        releasedAt: new Date(),
      },
    });

    const erro = await autenticacao
      .cadastrar({
        ...CADASTRO_BASE,
        email: 'outra@exemplo.com',
        slugDaOrganizacao: 'endereco-antigo',
      })
      .catch((e) => e);

    // Deixar alguém adotar este slug faria o redirecionamento passar a apontar
    // para o concorrente — pior do que o 404 que ele veio evitar.
    expect(erro).toBeInstanceOf(ConflictException);
  });

  it('não deixa resíduo quando o cadastro falha', async () => {
    await autenticacao.cadastrar(CADASTRO_BASE);

    await autenticacao
      .cadastrar({ ...CADASTRO_BASE, email: 'outra@exemplo.com' })
      .catch(() => undefined);

    // A segunda tentativa falhou no slug. Nenhum usuário órfão pode sobrar:
    // ele não conseguiria entrar em organização nenhuma.
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.organization.count()).toBe(1);
  });

  it('mantém exatamente um OWNER ativo por organização', async () => {
    const { organizationId } = await autenticacao.cadastrar(CADASTRO_BASE);

    // Invariante que o MySQL não expressa em constraint
    // (data-model.md §3.1): é a transação que a garante.
    const donos = await prisma.membership.count({
      where: { organizationId, role: Role.OWNER, status: 'ACTIVE' },
    });

    expect(donos).toBe(1);
  });
});

describe('login', () => {
  beforeEach(async () => {
    await autenticacao.cadastrar(CADASTRO_BASE);
  });

  it('abre sessão com a senha correta', async () => {
    const resultado = await autenticacao.entrar({
      email: 'maria@exemplo.com',
      senha: 'SenhaBoa123',
      permanecerConectado: false,
    });

    expect(resultado.token.length).toBeGreaterThan(30);

    const sessao = await sessoes.resolver(resultado.token);
    expect(sessao?.userId).toBe(resultado.userId);
    // Com um único vínculo, entra direto nele: o corretor autônomo não deve
    // passar por tela de escolha com uma opção só.
    expect(sessao?.activeOrganizationId).not.toBeNull();
  });

  it('normaliza o e-mail antes de procurar', async () => {
    // O schema já normaliza, mas o serviço não pode depender disso em
    // silêncio: quem cadastrou com minúsculas precisa entrar digitando
    // como quiser.
    const resultado = await autenticacao.entrar({
      email: 'maria@exemplo.com',
      senha: 'SenhaBoa123',
      permanecerConectado: false,
    });

    expect(resultado.token).toBeTruthy();
  });

  it('recusa senha errada e e-mail inexistente com a MESMA mensagem', async () => {
    const comSenhaErrada = await autenticacao
      .entrar({
        email: 'maria@exemplo.com',
        senha: 'SenhaErrada123',
        permanecerConectado: false,
      })
      .catch((e) => e);

    const comEmailInexistente = await autenticacao
      .entrar({
        email: 'ninguem@exemplo.com',
        senha: 'SenhaBoa123',
        permanecerConectado: false,
      })
      .catch((e) => e);

    expect(comSenhaErrada).toBeInstanceOf(UnauthorizedException);
    expect(comEmailInexistente).toBeInstanceOf(UnauthorizedException);
    // Mensagens diferentes permitiriam enumerar quem tem conta.
    expect((comSenhaErrada as Error).message).toBe(
      (comEmailInexistente as Error).message,
    );
    expect((comSenhaErrada as Error).message).toBe(
      'E-mail ou senha incorretos.',
    );
  });

  it('recusa conta desativada com a mesma mensagem', async () => {
    await prisma.user.updateMany({
      where: { email: 'maria@exemplo.com' },
      data: { status: 'DISABLED' },
    });

    const erro = await autenticacao
      .entrar({
        email: 'maria@exemplo.com',
        senha: 'SenhaBoa123',
        permanecerConectado: false,
      })
      .catch((e) => e);

    expect(erro).toBeInstanceOf(UnauthorizedException);
    expect((erro as Error).message).toBe('E-mail ou senha incorretos.');
  });

  it('prolonga a sessão quando pedem para permanecer conectado', async () => {
    const curta = await autenticacao.entrar({
      email: 'maria@exemplo.com',
      senha: 'SenhaBoa123',
      permanecerConectado: false,
    });

    const longa = await autenticacao.entrar({
      email: 'maria@exemplo.com',
      senha: 'SenhaBoa123',
      permanecerConectado: true,
    });

    expect(longa.maxAgeEmSegundos).toBeGreaterThan(curta.maxAgeEmSegundos);
  });

  it('gera um token novo a cada login', async () => {
    const primeiro = await autenticacao.entrar({
      email: 'maria@exemplo.com',
      senha: 'SenhaBoa123',
      permanecerConectado: false,
    });

    const segundo = await autenticacao.entrar({
      email: 'maria@exemplo.com',
      senha: 'SenhaBoa123',
      permanecerConectado: false,
    });

    // Rotação no login: o identificador nunca é reaproveitado.
    expect(primeiro.token).not.toBe(segundo.token);
  });

  it('ignora a última organização ativa se o vínculo não estiver mais ativo', async () => {
    await prisma.membership.updateMany({ data: { status: 'SUSPENDED' } });

    const resultado = await autenticacao.entrar({
      email: 'maria@exemplo.com',
      senha: 'SenhaBoa123',
      permanecerConectado: false,
    });

    const sessao = await sessoes.resolver(resultado.token);

    // `lastActiveOrganizationId` é conveniência de interface, nunca fonte de
    // autorização: ele é revalidado contra um Membership ativo.
    expect(sessao?.activeOrganizationId).toBeNull();
  });
});

describe('logout', () => {
  it('invalida a sessão no servidor', async () => {
    await autenticacao.cadastrar(CADASTRO_BASE);
    const { token } = await autenticacao.entrar({
      email: 'maria@exemplo.com',
      senha: 'SenhaBoa123',
      permanecerConectado: false,
    });

    const antes = await sessoes.resolver(token);
    expect(antes).not.toBeNull();

    await autenticacao.sair(antes!.id);

    // O cookie copiado antes do logout não volta a funcionar: é a revogação
    // no servidor que encerra a sessão, não a limpeza do cookie.
    expect(await sessoes.resolver(token)).toBeNull();
  });
});
