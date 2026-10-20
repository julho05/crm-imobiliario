import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { podeFazer, type Acao, type Escopo, type Role } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { hashDeIp } from '../comum/hash-de-ip';
import { NaoEncontrado } from '../comum/nao-encontrado';
import { lerCookie, NOME_DO_COOKIE_DE_SESSAO } from '../autenticacao/cookie';
import {
  SessaoService,
  type SessaoAtiva,
} from '../autenticacao/sessao.service';
import { CHAVE_DA_ACAO_EXIGIDA } from './exige.decorator';

/**
 * Contexto de autorizacao, montado pela guarda e usado pelo resto da
 * requisicao. Tudo aqui vem do servidor; nada vem do cliente.
 */
export type ContextoAutorizado = {
  sessao: SessaoAtiva;
  /** `Membership.id`. E a ele que atribuicoes apontam, nunca ao `User`. */
  membershipId: string;
  userId: string;
  organizationId: string;
  papel: Role;
  /** Alcance desta acao para este papel: `'ORG'` ou `'OWN'`. */
  escopo: Exclude<Escopo, false>;
  acao: Acao;
  /**
   * IP da requisicao, **hasheado com segredo** (ver `comum/hash-de-ip.ts`).
   * Vai para a auditoria do passo 7. `undefined` quando nao ha IP a registrar.
   */
  ipHash?: string;
};

export type RequisicaoAutorizada = Request & {
  autorizacao: ContextoAutorizado;
};

/**
 * Guarda de autorizacao: passos **1 a 4** dos sete de
 * [permissions.md](../../../../docs/permissions.md) §6.
 *
 * 1. Autenticar — sessao valida, usuario existe e esta ativo
 * 2. Resolver organizacao ativa — **da sessao**, nunca do corpo ou da query
 * 3. Carregar membership `(userId, organizationId)` com `status = ACTIVE`
 * 4. Verificar papel x acao, pela matriz de `@app/shared`
 *
 * Os passos **5 a 7** (conferir o dono do registro, conferir escopo e
 * registrar auditoria) acontecem **depois** de carregar o recurso, e por isso
 * nao cabem numa guarda. Eles vivem no `AutorizacaoService`.
 *
 * ## Por que 404 e nao 403
 *
 * Quando a pessoa tem sessao mas nao tem vinculo com a organizacao, a resposta
 * e **404**. Um 403 confirmaria que aquela organizacao existe, o que permite
 * mapear a base de clientes um identificador por vez. O 403 fica reservado
 * para o caso em que o vinculo existe e so o papel nao alcanca a acao — ai nao
 * ha nada a esconder, porque a pessoa ja sabe que a organizacao existe: ela
 * trabalha nela.
 */
@Injectable()
export class AutorizacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessoes: SessaoService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const acao = this.reflector.getAllAndOverride<Acao | undefined>(
      CHAVE_DA_ACAO_EXIGIDA,
      [contexto.getHandler(), contexto.getClass()],
    );

    if (!acao) {
      // Rota com a guarda mas sem @Exige: erro de programacao, e **fecha**.
      // Abrir por omissao faria um esquecimento virar rota publica.
      throw new ForbiddenException('Rota sem acao declarada.');
    }

    const requisicao = contexto.switchToHttp().getRequest<Request>();

    // Passo 1.
    const sessao = await this.sessoes.resolver(
      lerCookie(requisicao.headers.cookie, NOME_DO_COOKIE_DE_SESSAO),
    );

    if (!sessao) {
      throw new UnauthorizedException('Sessao invalida ou expirada.');
    }

    // Passo 2. A organizacao ativa mora na sessao. Nunca se le o
    // `organizationId` do corpo, da query ou de cabecalho: e exatamente o que
    // permitiria ao cliente agir em nome de outra organizacao.
    const { activeOrganizationId } = sessao;

    if (!activeOrganizationId) {
      throw new ForbiddenException(
        'Nenhuma organizacao ativa. Selecione uma organizacao.',
      );
    }

    // Passo 3.
    const vinculo = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: sessao.userId,
          organizationId: activeOrganizationId,
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
        organization: { select: { status: true } },
      },
    });

    // Vinculo inexistente ou suspenso: 404, indistinguivel um do outro.
    //
    // E aqui que a suspensao de membro corta o acesso **na requisicao
    // seguinte**, sem esperar expiracao de token. E a razao de a sessao ter
    // estado no servidor em vez de ser um JWT.
    if (
      !vinculo ||
      vinculo.status !== 'ACTIVE' ||
      vinculo.organization.status !== 'ACTIVE'
    ) {
      throw new NaoEncontrado();
    }

    // Passo 4.
    const escopo = podeFazer(vinculo.role, acao);

    if (escopo === false) {
      // 403 legitimo: o vinculo existe, a organizacao existe, so o papel nao
      // alcanca esta acao. Nao ha informacao nova sendo revelada.
      throw new ForbiddenException(
        'Seu papel nao permite esta acao nesta organizacao.',
      );
    }

    (requisicao as RequisicaoAutorizada).autorizacao = {
      sessao,
      membershipId: vinculo.id,
      userId: sessao.userId,
      organizationId: activeOrganizationId,
      papel: vinculo.role,
      escopo,
      acao,
      ipHash: hashDeIp(requisicao.ip),
    };

    return true;
  }
}
