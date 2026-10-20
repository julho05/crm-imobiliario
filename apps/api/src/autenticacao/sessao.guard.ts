import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { lerCookie, NOME_DO_COOKIE_DE_SESSAO } from './cookie';
import { SessaoService, type SessaoAtiva } from './sessao.service';

/** Requisicao com a sessao resolvida. */
export type RequisicaoAutenticada = Request & { sessao: SessaoAtiva };

/**
 * Exige sessao valida.
 *
 * Cobre os passos **1 a 2** dos sete de
 * [permissions.md](../../../../docs/permissions.md) §6: autentica e resolve a
 * organizacao ativa a partir da sessao.
 *
 * **Nao cobre os passos 3 a 7**: carregar o `Membership`, conferir papel
 * contra acao, conferir o dono do registro, conferir escopo e registrar
 * auditoria. Isso e a guarda de autorizacao do item A5 do roadmap. Usar
 * apenas esta guarda em rota que toca dado privado deixa passar travessia
 * entre organizacoes.
 *
 * O que importa aqui: a organizacao ativa vem **da sessao**, nunca do corpo
 * ou da query da requisicao. E isso que impede o cliente de escolher em nome
 * de qual organizacao esta agindo.
 */
@Injectable()
export class SessaoGuard implements CanActivate {
  constructor(private readonly sessoes: SessaoService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto.switchToHttp().getRequest<Request>();
    const token = lerCookie(
      requisicao.headers.cookie,
      NOME_DO_COOKIE_DE_SESSAO,
    );

    const sessao = await this.sessoes.resolver(token);

    if (!sessao) {
      // Mensagem unica: sessao inexistente, expirada, revogada, inativa ou de
      // conta desativada sao indistinguiveis para quem chama.
      throw new UnauthorizedException('Sessao invalida ou expirada.');
    }

    (requisicao as RequisicaoAutenticada).sessao = sessao;
    return true;
  }
}
