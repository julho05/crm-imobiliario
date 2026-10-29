import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  aceitarConviteSchema,
  tokenDeUsoUnicoSchema,
  type EntradaDeAceitarConvite,
  type EntradaDeTokenDeUsoUnico,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { hashDeIp } from '../comum/hash-de-ip';
import { LimiteDeTentativasService } from '../limite/limite-de-tentativas.service';
import { LIMITES } from '../limite/regras';
import {
  NOME_DO_COOKIE_DE_SESSAO,
  opcoesDoCookieDeSessao,
} from '../autenticacao/cookie';
import {
  SessaoGuard,
  type RequisicaoAutenticada,
} from '../autenticacao/sessao.guard';
import { ConvitesService } from './convites.service';

/**
 * Aceite de convite.
 *
 * Separado do `EquipeController` porque **nao pode** passar pela guarda de
 * autorizacao: quem aceita um convite ainda nao e membro de organizacao
 * nenhuma, logo nao tem organizacao ativa e nao teria papel a conferir. A
 * autorizacao aqui e o proprio token — que foi para a caixa de entrada de um
 * endereco especifico e tem prazo e uso unico.
 *
 * Duas rotas de aceite, e nao uma com comportamento variavel:
 *
 * - **`/aceitar`** para quem nao tem conta: cria `User` e `Membership` juntos
 * - **`/vincular`** para quem ja tem: exige sessao, e o e-mail da sessao tem de
 *   ser o mesmo do convite
 *
 * Uma rota so que decidisse pelo estado da sessao teria de aceitar `nome` e
 * `senha` opcionais, e um corpo opcional em fluxo de criacao de conta e onde
 * mora o erro que ninguem ve.
 *
 * As tres rotas recebem token e dividem o mesmo contador por IP (A11): quem
 * tenta adivinhar token nao escolhe uma rota so.
 */
@Controller('convites')
export class ConvitesPublicosController {
  constructor(
    private readonly convites: ConvitesService,
    private readonly limite: LimiteDeTentativasService,
  ) {}

  /** Dados do convite, para a tela decidir qual formulario mostrar. */
  @Get(':token')
  async ver(@Param('token') token: string, @Req() requisicao: Request) {
    await this.limite.consumir({
      regra: LIMITES.tokenPorIp,
      partes: [requisicao.ip],
    });

    return this.convites.ver(token);
  }

  @Post('aceitar')
  @HttpCode(201)
  async aceitar(
    @Body(new ZodValidationPipe(aceitarConviteSchema))
    dados: EntradaDeAceitarConvite,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ) {
    await this.limite.consumir({
      regra: LIMITES.tokenPorIp,
      partes: [requisicao.ip],
    });

    const sessao = await this.convites.aceitarCriandoConta(dados, {
      ipHash: hashDeIp(requisicao.ip),
      userAgent: requisicao.headers['user-agent'],
    });

    // Entra direto: a pessoa acabou de criar a senha, e pedir login em seguida
    // e atrito sem ganho de seguranca.
    resposta.cookie(
      NOME_DO_COOKIE_DE_SESSAO,
      sessao.token,
      opcoesDoCookieDeSessao(sessao.maxAgeEmSegundos),
    );

    return { ok: true };
  }

  @Post('vincular')
  @HttpCode(200)
  @UseGuards(SessaoGuard)
  async vincular(
    @Body(new ZodValidationPipe(tokenDeUsoUnicoSchema))
    dados: EntradaDeTokenDeUsoUnico,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    await this.limite.consumir({
      regra: LIMITES.tokenPorIp,
      partes: [requisicao.ip],
    });

    const { organizationId } = await this.convites.aceitarComContaExistente(
      requisicao.sessao.userId,
      dados.token,
      {
        ipHash: hashDeIp(requisicao.ip),
        userAgent: requisicao.headers['user-agent'],
      },
    );

    // Nao troca a organizacao ativa: quem decide isso e a pessoa, pelo
    // endpoint de troca (A7). Ela pode estar no meio de algo na organizacao
    // em que ja estava.
    return { organizationId };
  }
}
