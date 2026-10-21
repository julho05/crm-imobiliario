import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { hashDoToken } from '../../src/autenticacao/sessao.service';

/**
 * O cenario base de [permissions.md](../../../../docs/permissions.md) §8.1.
 *
 * - **Org A**: `owner`, `admin`, `manager`, `agent1`, `agent2` · 2 imoveis,
 *   2 leads (um por corretor)
 * - **Org B**: `owner`, `agent1` · 1 imovel, 1 lead
 * - **`dual`**: a mesma pessoa, `AGENT` em A **e** em B, com uma sessao so
 *
 * O `admin` em A nao esta no §8.1, e foi acrescentado para o item A10: a
 * hierarquia de convites so se testa de verdade com os quatro papeis, porque e
 * entre `ADMIN` e `MANAGER` que ela decide.
 *
 * ## Por que monta tudo direto no banco
 *
 * Nao passa pelo `POST /cadastro`. Dois motivos concretos:
 *
 * 1. O cadastro gera um hash Argon2id por chamada, de proposito caro. Sete
 *    pessoas por caso de teste transformariam a suite em espera.
 * 2. O cadastro nasce sempre `OWNER` de uma organizacao nova. `MANAGER`,
 *    `AGENT` e a pessoa com dois vinculos **nao tem** como existir por ele —
 *    dependem dos convites do item A10.
 *
 * O `passwordHash` e um texto qualquer: estas pessoas entram pela sessao ja
 * criada, nunca pelo formulario. Se um teste precisar de login com senha de
 * verdade, use o `POST /cadastro`.
 */

/** Uma pessoa do cenario, com sessao aberta e pronta para reenvio. */
export type MembroDeTeste = {
  userId: string;
  /** `Membership.id`. E a ele que as atribuicoes apontam, nunca ao `User`. */
  membershipId: string;
  sessaoId: string;
  /** Cabecalho pronto: `sessao=<token>`. */
  cookie: string;
};

export type Cenario = {
  organizacaoA: string;
  organizacaoB: string;
  ownerA: MembroDeTeste;
  adminA: MembroDeTeste;
  managerA: MembroDeTeste;
  agenteA1: MembroDeTeste;
  agenteA2: MembroDeTeste;
  ownerB: MembroDeTeste;
  agenteB1: MembroDeTeste;
  /**
   * Membro de A e de B, com **uma** sessao, ativa em A. E com ele que se prova
   * que a organizacao ativa vem da sessao e nao do que o cliente mandar.
   */
  dual: MembroDeTeste & { membershipEmB: string };
  imovelDeA1: string;
  imovelDeA2: string;
  imovelDeB: string;
  leadDeA1: string;
  leadDeA2: string;
  leadDeB: string;
};

export async function montarCenario(prisma: PrismaClient): Promise<Cenario> {
  const organizacaoA = await criarOrganizacao(prisma, 'Imobiliaria A', 'org-a');
  const organizacaoB = await criarOrganizacao(prisma, 'Imobiliaria B', 'org-b');

  const ownerA = await criarMembro(prisma, {
    nome: 'Owner A',
    email: 'owner-a@exemplo.com',
    organizationId: organizacaoA,
    role: 'OWNER',
  });
  const adminA = await criarMembro(prisma, {
    nome: 'Admin A',
    email: 'admin-a@exemplo.com',
    organizationId: organizacaoA,
    role: 'ADMIN',
  });
  const managerA = await criarMembro(prisma, {
    nome: 'Manager A',
    email: 'manager-a@exemplo.com',
    organizationId: organizacaoA,
    role: 'MANAGER',
  });
  const agenteA1 = await criarMembro(prisma, {
    nome: 'Agente A1',
    email: 'agente-a1@exemplo.com',
    organizationId: organizacaoA,
    role: 'AGENT',
  });
  const agenteA2 = await criarMembro(prisma, {
    nome: 'Agente A2',
    email: 'agente-a2@exemplo.com',
    organizationId: organizacaoA,
    role: 'AGENT',
  });

  const ownerB = await criarMembro(prisma, {
    nome: 'Owner B',
    email: 'owner-b@exemplo.com',
    organizationId: organizacaoB,
    role: 'OWNER',
  });
  const agenteB1 = await criarMembro(prisma, {
    nome: 'Agente B1',
    email: 'agente-b1@exemplo.com',
    organizationId: organizacaoB,
    role: 'AGENT',
  });

  // A pessoa com dois vinculos: um usuario, duas organizacoes, uma sessao.
  const dualEmA = await criarMembro(prisma, {
    nome: 'Pessoa Dupla',
    email: 'dual@exemplo.com',
    organizationId: organizacaoA,
    role: 'AGENT',
  });
  const vinculoDualEmB = await prisma.membership.create({
    data: {
      userId: dualEmA.userId,
      organizationId: organizacaoB,
      role: 'AGENT',
    },
    select: { id: true },
  });

  const imovelDeA1 = await criarImovel(prisma, {
    organizationId: organizacaoA,
    code: 'A-001',
    ownerMemberId: agenteA1.membershipId,
  });
  const imovelDeA2 = await criarImovel(prisma, {
    organizationId: organizacaoA,
    code: 'A-002',
    ownerMemberId: agenteA2.membershipId,
  });
  const imovelDeB = await criarImovel(prisma, {
    organizationId: organizacaoB,
    code: 'B-001',
    ownerMemberId: agenteB1.membershipId,
  });

  const leadDeA1 = await criarLead(prisma, {
    organizationId: organizacaoA,
    fullName: 'Cliente do A1',
    assignedMemberId: agenteA1.membershipId,
  });
  const leadDeA2 = await criarLead(prisma, {
    organizationId: organizacaoA,
    fullName: 'Cliente do A2',
    assignedMemberId: agenteA2.membershipId,
  });
  const leadDeB = await criarLead(prisma, {
    organizationId: organizacaoB,
    fullName: 'Cliente do B1',
    assignedMemberId: agenteB1.membershipId,
  });

  return {
    organizacaoA,
    organizacaoB,
    ownerA,
    adminA,
    managerA,
    agenteA1,
    agenteA2,
    ownerB,
    agenteB1,
    dual: { ...dualEmA, membershipEmB: vinculoDualEmB.id },
    imovelDeA1,
    imovelDeA2,
    imovelDeB,
    leadDeA1,
    leadDeA2,
    leadDeB,
  };
}

async function criarOrganizacao(
  prisma: PrismaClient,
  name: string,
  slug: string,
): Promise<string> {
  const organizacao = await prisma.organization.create({
    data: { name, slug, kind: 'AGENCY' },
    select: { id: true },
  });

  return organizacao.id;
}

async function criarMembro(
  prisma: PrismaClient,
  params: {
    nome: string;
    email: string;
    organizationId: string;
    role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'AGENT';
  },
): Promise<MembroDeTeste> {
  const usuario = await prisma.user.create({
    data: {
      name: params.nome,
      email: params.email,
      // Ver a nota no topo: estas pessoas nao entram por senha.
      passwordHash: 'sem-login-por-senha-neste-cenario',
    },
    select: { id: true },
  });

  const vinculo = await prisma.membership.create({
    data: {
      userId: usuario.id,
      organizationId: params.organizationId,
      role: params.role,
    },
    select: { id: true },
  });

  const sessao = await abrirSessao(prisma, usuario.id, params.organizationId);

  return {
    userId: usuario.id,
    membershipId: vinculo.id,
    sessaoId: sessao.sessaoId,
    cookie: `sessao=${sessao.token}`,
  };
}

/**
 * Abre uma sessao gravando o **hash** do token, como faz o `SessaoService`.
 *
 * O token cru existe apenas aqui e no cookie que o teste reenvia; o banco
 * nunca o guarda. Usa a mesma funcao de hash da producao de proposito: se um
 * dia ela mudar, estes testes falham junto, em vez de validar uma sessao que a
 * aplicacao real nao aceitaria.
 */
async function abrirSessao(
  prisma: PrismaClient,
  userId: string,
  activeOrganizationId: string | null,
): Promise<{ sessaoId: string; token: string }> {
  const token = randomBytes(32).toString('base64url');

  const sessao = await prisma.session.create({
    data: {
      tokenHash: hashDoToken(token),
      userId,
      activeOrganizationId,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
    select: { id: true },
  });

  return { sessaoId: sessao.id, token };
}

async function criarImovel(
  prisma: PrismaClient,
  params: {
    organizationId: string;
    code: string;
    ownerMemberId: string | null;
  },
): Promise<string> {
  const imovel = await prisma.property.create({
    data: {
      organizationId: params.organizationId,
      code: params.code,
      slug: params.code.toLowerCase(),
      title: `Imovel ${params.code}`,
      type: 'APARTMENT',
      purpose: 'SALE',
      // O preco acompanha a finalidade de proposito. Imovel `SALE` sem preco
      // existe no banco (a coluna e nula) e o produto tolera, mas um cenario
      // base incoerente faz os testes dos outros itens partirem de um dado
      // que o cadastro nunca produziria.
      price: 450000,
      state: 'SP',
      city: 'Sao Paulo',
      neighborhood: 'Centro',
      ownerMemberId: params.ownerMemberId,
    },
    select: { id: true },
  });

  return imovel.id;
}

async function criarLead(
  prisma: PrismaClient,
  params: {
    organizationId: string;
    fullName: string;
    assignedMemberId: string | null;
  },
): Promise<string> {
  const lead = await prisma.lead.create({
    data: {
      organizationId: params.organizationId,
      fullName: params.fullName,
      phone: '11999990000',
      source: 'MANUAL',
      assignedMemberId: params.assignedMemberId,
    },
    select: { id: true },
  });

  return lead.id;
}
