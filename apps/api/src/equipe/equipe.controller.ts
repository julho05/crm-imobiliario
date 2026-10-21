import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  convidarMembroSchema,
  type EntradaDeConvidarMembro,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard';
import type { RequisicaoAutorizada } from '../autorizacao/autorizacao.guard';
import { Exige } from '../autorizacao/exige.decorator';
import { ConvitesService } from './convites.service';
import { MembrosService } from './membros.service';

/**
 * Administracao de convites, dentro da organizacao ativa.
 *
 * Todas as rotas passam pela guarda de autorizacao: os sete passos de
 * [permissions.md](../../../../docs/permissions.md) §6 valem aqui como em
 * qualquer rota de dado privado.
 *
 * ## Sobre o `@Exige('equipe:convidarAgent')`
 *
 * E o **piso**, nao o teto. Convidar `AGENT` e a permissao de convite mais
 * baixa que existe: quem nao a tem nao convida ninguem, e a guarda corta ai.
 * O teto — se este papel alcanca o papel **do convidado** — depende do corpo
 * da requisicao, e `@Exige` e estatico por rota. Essa parte e conferida no
 * servico, e e ela que impede o `MANAGER` de criar um `ADMIN`.
 */
@Controller('equipe')
@UseGuards(AutorizacaoGuard)
export class EquipeController {
  constructor(
    private readonly convites: ConvitesService,
    private readonly membros: MembrosService,
  ) {}

  /**
   * A equipe da organizacao ativa: nome, papel e `Membership.id`.
   *
   * Existe para o seletor de responsavel da tela de leads. Sem e-mail, de
   * proposito — ver a nota em `membros.service.ts`.
   */
  @Get('membros')
  @Exige('equipe:verMembros')
  async listarMembros(@Req() requisicao: RequisicaoAutorizada) {
    return { membros: await this.membros.listar(requisicao.autorizacao) };
  }

  @Post('convites')
  @HttpCode(201)
  @Exige('equipe:convidarAgent')
  async convidar(
    @Body(new ZodValidationPipe(convidarMembroSchema))
    dados: EntradaDeConvidarMembro,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    const convite = await this.convites.convidar(requisicao.autorizacao, dados);

    // Sem o token: quem convida nao precisa dele, e devolve-lo deixaria um
    // `MANAGER` entrar na conta que ele mesmo criou.
    return {
      id: convite.id,
      email: convite.email,
      papel: convite.papel,
      expiraEm: convite.expiresAt.toISOString(),
    };
  }

  @Get('convites')
  @Exige('equipe:verMembros')
  listar(@Req() requisicao: RequisicaoAutorizada) {
    return this.convites
      .listarPendentes(requisicao.autorizacao)
      .then((convites) => ({ convites }));
  }

  @Delete('convites/:id')
  @HttpCode(200)
  @Exige('equipe:convidarAgent')
  async revogar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
  ) {
    await this.convites.revogar(requisicao.autorizacao, id);

    return { ok: true };
  }
}
