/**
 * Testes de integração da sessão opaca.
 *
 * O ponto central: comprovar que o token **não existe no banco**, e que cada
 * motivo de invalidez (revogada, expirada, inativa, conta desativada) é
 * indistinguível dos outros para quem chama.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Role } from '@app/shared';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  compararEmTempoConstante,
  DURACAO_DA_SESSAO,
  hashDoToken,
  SessaoService,
} from '../../src/autenticacao/sessao.service';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';

let prisma: PrismaClient;
let sessoes: SessaoService;
let userId: string;
let organizationId: string;

beforeAll(async () => {
  prisma = criarClienteDeTeste();
  await prisma.$connect();
  sessoes = new SessaoService(prisma as unknown as PrismaService);
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparBanco(prisma);

  const usuario = await prisma.user.create({
    data: {
      name: 'Joao Souza',
      email: 'joao@exemplo.com',
      passwordHash: 'hash-irrelevante-para-estes-testes',
    },
    select: { id: true },
  });
  userId = usuario.id;

  const organizacao = await prisma.organization.create({
    data: { name: 'Souza Imoveis', slug: 'souza-imoveis', kind: 'SOLO' },
    select: { id: true },
  });
  organizationId = organizacao.id;

  await prisma.membership.create({
    data: { userId, organizationId, role: Role.OWNER },
  });
});

describe('criação da sessão', () => {
  it('guarda apenas o hash do token', async () => {
    const { token } = await sessoes.criar({ userId });

    const registros = await prisma.session.findMany();
    expect(registros).toHaveLength(1);

    // Vazamento da tabela Session não deve entregar sessões utilizáveis.
    expect(registros[0].tokenHash).not.toBe(token);
    expect(registros[0].tokenHash).toBe(hashDoToken(token));
    expect(JSON.stringify(registros)).not.toContain(token);
  });

  it('gera tokens com entropia suficiente e sempre diferentes', async () => {
    const tokens = new Set<string>();

    for (let i = 0; i < 20; i++) {
      const { token } = await sessoes.criar({ userId });
      tokens.add(token);
      // 32 bytes em base64url dão 43 caracteres.
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }

    expect(tokens.size).toBe(20);
  });

  it('guarda o hash do IP e o user agent', async () => {
    await sessoes.criar({
      userId,
      requisicao: { ipHash: 'hash-ficticio', userAgent: 'Navegador/1.0' },
    });

    const registro = await prisma.session.findFirst();
    expect(registro?.ipHash).toBe('hash-ficticio');
    expect(registro?.userAgent).toBe('Navegador/1.0');
  });

  it('corta user agent exageradamente longo em vez de estourar a coluna', async () => {
    await sessoes.criar({
      userId,
      requisicao: { userAgent: 'x'.repeat(5000) },
    });

    const registro = await prisma.session.findFirst();
    expect(registro?.userAgent?.length).toBe(255);
  });
});

describe('resolução da sessão', () => {
  it('resolve um token válido', async () => {
    const { token } = await sessoes.criar({
      userId,
      activeOrganizationId: organizationId,
    });

    const sessao = await sessoes.resolver(token);

    expect(sessao?.userId).toBe(userId);
    expect(sessao?.activeOrganizationId).toBe(organizationId);
  });

  it('devolve null para token ausente, vazio ou inventado', async () => {
    expect(await sessoes.resolver(undefined)).toBeNull();
    expect(await sessoes.resolver('')).toBeNull();
    expect(await sessoes.resolver('token-que-nunca-existiu')).toBeNull();
  });

  it('devolve null para sessão revogada', async () => {
    const { token } = await sessoes.criar({ userId });
    const sessao = await sessoes.resolver(token);

    await sessoes.revogar(sessao!.id);

    expect(await sessoes.resolver(token)).toBeNull();
  });

  it('devolve null para sessão expirada', async () => {
    const { token } = await sessoes.criar({ userId });

    await prisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    // Expiração absoluta: a sessão morre na data, tenha sido usada ou não.
    expect(await sessoes.resolver(token)).toBeNull();
  });

  it('devolve null para sessão parada há tempo demais', async () => {
    const { token } = await sessoes.criar({ userId });

    const muitoAtras = new Date(
      Date.now() - (DURACAO_DA_SESSAO.inatividade + 60) * 1000,
    );
    await prisma.session.updateMany({ data: { lastUsedAt: muitoAtras } });

    // Expiração por inatividade: protege o computador compartilhado que
    // ficou aberto, mesmo com a expiração absoluta ainda longe.
    expect(await sessoes.resolver(token)).toBeNull();
  });

  it('devolve null quando a conta do usuário é desativada', async () => {
    const { token } = await sessoes.criar({ userId });

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'DISABLED' },
    });

    // Conta desativada não continua navegando com a sessão que já tinha.
    expect(await sessoes.resolver(token)).toBeNull();
  });

  it('registra o uso para empurrar a expiração por inatividade', async () => {
    const { token } = await sessoes.criar({ userId });

    const dezMinutosAtras = new Date(Date.now() - 10 * 60 * 1000);
    await prisma.session.updateMany({ data: { lastUsedAt: dezMinutosAtras } });

    await sessoes.resolver(token);

    const registro = await prisma.session.findFirst();
    expect(registro!.lastUsedAt.getTime()).toBeGreaterThan(
      dezMinutosAtras.getTime(),
    );
  });

  it('não escreve no banco a cada requisição', async () => {
    const { token } = await sessoes.criar({ userId });

    const antes = await prisma.session.findFirst();
    await sessoes.resolver(token);
    const depois = await prisma.session.findFirst();

    // Carregar o painel dispara várias chamadas; sem a folga de um minuto,
    // cada uma escreveria na mesma linha sem necessidade.
    expect(depois!.lastUsedAt.getTime()).toBe(antes!.lastUsedAt.getTime());
  });
});

describe('revogação', () => {
  it('revogar duas vezes não é erro', async () => {
    const { token } = await sessoes.criar({ userId });
    const sessao = await sessoes.resolver(token);

    await sessoes.revogar(sessao!.id);
    // O logout não deve falhar porque a sessão já foi encerrada em outra aba.
    await expect(sessoes.revogar(sessao!.id)).resolves.toBeUndefined();
  });

  it('revoga todas as sessões do usuário', async () => {
    const a = await sessoes.criar({ userId });
    const b = await sessoes.criar({ userId });
    const c = await sessoes.criar({ userId });

    const revogadas = await sessoes.revogarTodasDoUsuario(userId);

    expect(revogadas).toBe(3);
    for (const { token } of [a, b, c]) {
      expect(await sessoes.resolver(token)).toBeNull();
    }
  });

  it('poupa a sessão atual ao revogar as outras', async () => {
    const atual = await sessoes.criar({ userId });
    const outra = await sessoes.criar({ userId });
    const sessaoAtual = await sessoes.resolver(atual.token);

    // Caso da troca de senha: encerra o acesso de quem mais estivesse dentro,
    // sem deslogar quem acabou de trocar.
    await sessoes.revogarTodasDoUsuario(userId, sessaoAtual!.id);

    expect(await sessoes.resolver(atual.token)).not.toBeNull();
    expect(await sessoes.resolver(outra.token)).toBeNull();
  });

  it('não toca nas sessões de outro usuário', async () => {
    const outroUsuario = await prisma.user.create({
      data: {
        name: 'Ana Lima',
        email: 'ana@exemplo.com',
        passwordHash: 'hash-irrelevante',
      },
      select: { id: true },
    });

    const minha = await sessoes.criar({ userId });
    const dela = await sessoes.criar({ userId: outroUsuario.id });

    await sessoes.revogarTodasDoUsuario(userId);

    expect(await sessoes.resolver(minha.token)).toBeNull();
    expect(await sessoes.resolver(dela.token)).not.toBeNull();
  });
});

describe('organização ativa', () => {
  it('é gravada na sessão, no servidor', async () => {
    const { token } = await sessoes.criar({ userId });
    const sessao = await sessoes.resolver(token);
    expect(sessao?.activeOrganizationId).toBeNull();

    await sessoes.definirOrganizacaoAtiva(sessao!.id, organizationId);

    // É isso que impede o cliente de escolher em nome de qual organização
    // está agindo (permissions.md §6, passo 2).
    const depois = await sessoes.resolver(token);
    expect(depois?.activeOrganizationId).toBe(organizationId);
  });
});

describe('comparação em tempo constante', () => {
  it('reconhece iguais e diferentes', () => {
    expect(compararEmTempoConstante('abc123', 'abc123')).toBe(true);
    expect(compararEmTempoConstante('abc123', 'abc124')).toBe(false);
  });

  it('não estoura com tamanhos diferentes', () => {
    // timingSafeEqual lança se os buffers têm tamanhos distintos.
    expect(compararEmTempoConstante('abc', 'abcdef')).toBe(false);
    expect(compararEmTempoConstante('', 'x')).toBe(false);
    expect(compararEmTempoConstante('', '')).toBe(true);
  });
});
