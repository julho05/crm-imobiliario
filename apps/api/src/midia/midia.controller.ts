import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  atualizarMidiaSchema,
  pedirUrlDeUploadSchema,
  registrarMidiaSchema,
  reordenarMidiaSchema,
  type EntradaDeAtualizarMidia,
  type EntradaDePedirUrlDeUpload,
  type EntradaDeRegistrarMidia,
  type EntradaDeReordenarMidia,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard';
import type { RequisicaoAutorizada } from '../autorizacao/autorizacao.guard';
import { Exige } from '../autorizacao/exige.decorator';
import { MidiaService } from './midia.service';

/**
 * Fotos e documentos do imóvel — item **B4**.
 *
 * ## Por que tudo sob `/imoveis/:imovelId/midia`
 *
 * Porque o imóvel é quem decide a permissão. Com rotas em `/midia/:id`, cada
 * uma teria de carregar a mídia, descobrir o imóvel dela e só então autorizar —
 * e o dia em que alguém esquecesse esse primeiro passo, a rota passaria a
 * aceitar o id de uma mídia de outra organização. Com o imóvel no caminho, a
 * autorização é a mesma linha em todas, e o id da mídia é conferido **contra**
 * aquele imóvel.
 *
 * ## `imovel:ver` para listar, `imovel:editar` para o resto
 *
 * Listar é `ORG` para os quatro papéis: o corretor precisa ver as fotos de
 * qualquer imóvel da casa para oferecê-lo ao cliente dele. Escrever é `OWN`
 * para o `AGENT`, que recebe **403** no imóvel do colega.
 */
@Controller('imoveis/:imovelId/midia')
@UseGuards(AutorizacaoGuard)
export class MidiaController {
  constructor(private readonly midia: MidiaService) {}

  /**
   * Passo 1 do upload: a URL assinada.
   *
   * `POST` numa rota que não cria nada no banco, e de propósito: ela **produz**
   * uma autorização de escrita no armazenamento, com efeito e validade. `GET`
   * sugeriria algo repetível e cacheável, e navegador e proxy tratam assim.
   */
  @Post('url-de-upload')
  @HttpCode(200)
  @Exige('imovel:editar')
  urlDeUpload(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('imovelId') imovelId: string,
    @Body(new ZodValidationPipe(pedirUrlDeUploadSchema))
    dados: EntradaDePedirUrlDeUpload,
  ) {
    return this.midia.urlDeUpload(requisicao.autorizacao, imovelId, dados);
  }

  /** Passo 2: registra o que foi enviado. */
  @Post()
  @HttpCode(201)
  @Exige('imovel:editar')
  registrar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('imovelId') imovelId: string,
    @Body(new ZodValidationPipe(registrarMidiaSchema))
    dados: EntradaDeRegistrarMidia,
  ) {
    return this.midia.registrar(requisicao.autorizacao, imovelId, dados);
  }

  @Get()
  @Exige('imovel:ver')
  listar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('imovelId') imovelId: string,
  ) {
    return this.midia.listar(requisicao.autorizacao, imovelId);
  }

  /**
   * Nova ordem.
   *
   * Vem **antes** das rotas com `:midiaId`: o Nest resolve na ordem de
   * declaração, e `@Post(':midiaId/capa')` não casaria com `ordem`, mas um
   * `@Patch(':midiaId')` casaria com qualquer coisa — a mesma armadilha que o
   * contador de tarefas vencidas já tinha.
   */
  @Post('ordem')
  @HttpCode(200)
  @Exige('imovel:editar')
  reordenar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('imovelId') imovelId: string,
    @Body(new ZodValidationPipe(reordenarMidiaSchema))
    dados: EntradaDeReordenarMidia,
  ) {
    return this.midia.reordenar(requisicao.autorizacao, imovelId, dados);
  }

  @Post(':midiaId/capa')
  @HttpCode(200)
  @Exige('imovel:editar')
  definirCapa(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('imovelId') imovelId: string,
    @Param('midiaId') midiaId: string,
  ) {
    return this.midia.definirCapa(requisicao.autorizacao, imovelId, midiaId);
  }

  @Patch(':midiaId')
  @Exige('imovel:editar')
  atualizar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('imovelId') imovelId: string,
    @Param('midiaId') midiaId: string,
    @Body(new ZodValidationPipe(atualizarMidiaSchema))
    dados: EntradaDeAtualizarMidia,
  ) {
    return this.midia.atualizar(
      requisicao.autorizacao,
      imovelId,
      midiaId,
      dados,
    );
  }

  @Delete(':midiaId')
  @HttpCode(204)
  @Exige('imovel:editar')
  async remover(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('imovelId') imovelId: string,
    @Param('midiaId') midiaId: string,
  ) {
    await this.midia.remover(requisicao.autorizacao, imovelId, midiaId);
  }
}
