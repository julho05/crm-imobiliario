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
  atribuirNegociacaoSchema,
  atualizarNegociacaoSchema,
  criarNegociacaoSchema,
  filtrosDeNegociacoesSchema,
  moverNegociacaoSchema,
  paginacaoSchema,
  type EntradaDeAtribuirNegociacao,
  type EntradaDeAtualizarNegociacao,
  type EntradaDeCriarNegociacao,
  type EntradaDeMoverNegociacao,
  type FiltrosDeNegociacoes,
  type Paginacao,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard';
import type { RequisicaoAutorizada } from '../autorizacao/autorizacao.guard';
import { Exige } from '../autorizacao/exige.decorator';
import { NegociacoesService } from './negociacoes.service';

/**
 * Funil de negociações — item **B7**.
 *
 * ## Ordem das rotas importa
 *
 * `etapas` e `resumo` vêm **antes** de `:id`. O Nest resolve na ordem de
 * declaração, e `@Get(':id')` casaria com `/negociacoes/etapas`, tratando
 * "etapas" como identificador — um 404 que não aponta para a causa.
 *
 * ## Mover de etapa é `POST`, não `PATCH`
 *
 * Pelo mesmo motivo da publicação de imóvel e da situação do lead: é um
 * acontecimento. "Movi para Proposta" e "corrigi o valor esperado" precisam de
 * linhas de auditoria distintas, senão o relatório de conversão do funil não
 * tem de onde sair.
 */
@Controller('negociacoes')
@UseGuards(AutorizacaoGuard)
export class NegociacoesController {
  constructor(private readonly negociacoes: NegociacoesService) {}

  @Get('etapas')
  @Exige('negociacao:ver')
  async listarEtapas(@Req() requisicao: RequisicaoAutorizada) {
    return {
      etapas: await this.negociacoes.listarEtapas(requisicao.autorizacao),
    };
  }

  /** Contagem e valor por etapa, para os totais das colunas do quadro. */
  @Get('resumo')
  @Exige('negociacao:ver')
  async resumo(
    @Query(new ZodValidationPipe(filtrosDeNegociacoesSchema))
    filtros: FiltrosDeNegociacoes,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return {
      etapas: await this.negociacoes.resumoPorEtapa(
        requisicao.autorizacao,
        filtros,
      ),
    };
  }

  @Post()
  @HttpCode(201)
  @Exige('negociacao:criar')
  criar(
    @Body(new ZodValidationPipe(criarNegociacaoSchema))
    dados: EntradaDeCriarNegociacao,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.negociacoes.criar(requisicao.autorizacao, dados);
  }

  @Get()
  @Exige('negociacao:ver')
  listar(
    @Query(new ZodValidationPipe(filtrosDeNegociacoesSchema))
    filtros: FiltrosDeNegociacoes,
    @Query(new ZodValidationPipe(paginacaoSchema)) paginacao: Paginacao,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.negociacoes.listar(requisicao.autorizacao, filtros, paginacao);
  }

  @Get(':id')
  @Exige('negociacao:ver')
  ver(@Req() requisicao: RequisicaoAutorizada, @Param('id') id: string) {
    return this.negociacoes.ver(requisicao.autorizacao, id);
  }

  @Patch(':id')
  @Exige('negociacao:editar')
  atualizar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarNegociacaoSchema))
    dados: EntradaDeAtualizarNegociacao,
  ) {
    return this.negociacoes.atualizar(requisicao.autorizacao, id, dados);
  }

  @Post(':id/etapa')
  @HttpCode(200)
  @Exige('negociacao:editar')
  mover(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moverNegociacaoSchema))
    dados: EntradaDeMoverNegociacao,
  ) {
    return this.negociacoes.mover(requisicao.autorizacao, id, dados);
  }

  @Post(':id/responsavel')
  @HttpCode(200)
  @Exige('negociacao:atribuir')
  atribuir(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atribuirNegociacaoSchema))
    dados: EntradaDeAtribuirNegociacao,
  ) {
    return this.negociacoes.atribuir(requisicao.autorizacao, id, dados);
  }

  @Delete(':id')
  @Exige('negociacao:excluir')
  excluir(@Req() requisicao: RequisicaoAutorizada, @Param('id') id: string) {
    return this.negociacoes.excluir(requisicao.autorizacao, id);
  }
}
