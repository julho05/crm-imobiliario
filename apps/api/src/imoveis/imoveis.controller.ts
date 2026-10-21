import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  atualizarImovelSchema,
  criarImovelSchema,
  filtrosDeImoveisSchema,
  paginacaoSchema,
  type EntradaDeAtualizarImovel,
  type EntradaDeCriarImovel,
  type FiltrosDeImoveis,
  type Paginacao,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard';
import type { RequisicaoAutorizada } from '../autorizacao/autorizacao.guard';
import { Exige } from '../autorizacao/exige.decorator';
import { ImoveisService } from './imoveis.service';

/**
 * Imoveis da organizacao ativa — item **B1** do
 * [roadmap.md](../../../../docs/roadmap.md).
 *
 * E o primeiro controller de dado privado do produto. Toda rota declara a acao
 * que exige com `@Exige`, e a guarda **fecha** quando a declaracao falta: rota
 * nova sem acao devolve 403 em vez de virar endpoint aberto por esquecimento.
 *
 * ## O que nao esta aqui
 *
 * Nenhuma rota recebe `organizationId`. Ele vem da sessao, pela guarda, e e o
 * que impede alguem de agir em nome de outra organizacao trocando um campo do
 * corpo — o cenario §8.4 de
 * [permissions.md](../../../../docs/permissions.md).
 *
 * Publicar e despublicar tambem nao estao: sao o item B2, com `imovel:publicar`
 * e evento de auditoria proprios.
 */
@Controller('imoveis')
@UseGuards(AutorizacaoGuard)
export class ImoveisController {
  constructor(private readonly imoveis: ImoveisService) {}

  @Post()
  @HttpCode(201)
  @Exige('imovel:criar')
  criar(
    @Body(new ZodValidationPipe(criarImovelSchema)) dados: EntradaDeCriarImovel,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.imoveis.criar(requisicao.autorizacao, dados);
  }

  /**
   * Listagem paginada.
   *
   * Dois pipes na mesma query de proposito: os filtros e a paginacao sao
   * contratos separados, e a paginacao e a mesma de toda listagem do produto —
   * `CLAUDE.md` exige paginacao, e o teto de 100 vive em `@app/shared`, nao
   * aqui.
   */
  @Get()
  @Exige('imovel:ver')
  listar(
    @Query(new ZodValidationPipe(filtrosDeImoveisSchema))
    filtros: FiltrosDeImoveis,
    @Query(new ZodValidationPipe(paginacaoSchema)) paginacao: Paginacao,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.imoveis.listar(requisicao.autorizacao, filtros, paginacao);
  }

  @Get(':id')
  @Exige('imovel:ver')
  ver(@Req() requisicao: RequisicaoAutorizada, @Param('id') id: string) {
    return this.imoveis.ver(requisicao.autorizacao, id);
  }

  @Patch(':id')
  @Exige('imovel:editar')
  atualizar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarImovelSchema))
    dados: EntradaDeAtualizarImovel,
  ) {
    return this.imoveis.atualizar(requisicao.autorizacao, id, dados);
  }

  /**
   * Item B2. `POST`, e nao `PATCH` no `status`: publicar e um **evento**, com
   * regra propria e linha de auditoria propria. Expor `status` e `publishedAt`
   * como campos editaveis deixaria a interface combinar estados que o negocio
   * nao admite — imovel vendido e anunciado ao mesmo tempo, por exemplo.
   */
  @Post(':id/publicar')
  @HttpCode(200)
  @Exige('imovel:publicar')
  publicar(@Req() requisicao: RequisicaoAutorizada, @Param('id') id: string) {
    return this.imoveis.publicar(requisicao.autorizacao, id);
  }

  @Post(':id/despublicar')
  @HttpCode(200)
  @Exige('imovel:publicar')
  despublicar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
  ) {
    return this.imoveis.despublicar(requisicao.autorizacao, id);
  }

  @Delete(':id')
  @Exige('imovel:excluir')
  excluir(@Req() requisicao: RequisicaoAutorizada, @Param('id') id: string) {
    return this.imoveis.excluir(requisicao.autorizacao, id);
  }
}
