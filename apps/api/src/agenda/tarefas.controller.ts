import {
  Body,
  Controller,
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
  alterarSituacaoDaTarefaSchema,
  atribuirSchema,
  atualizarTarefaSchema,
  criarTarefaSchema,
  filtrosDeTarefasSchema,
  paginacaoSchema,
  type EntradaDeAlterarSituacaoDaTarefa,
  type EntradaDeAtribuir,
  type EntradaDeAtualizarTarefa,
  type EntradaDeCriarTarefa,
  type FiltrosDeTarefas,
  type Paginacao,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard';
import type { RequisicaoAutorizada } from '../autorizacao/autorizacao.guard';
import { Exige } from '../autorizacao/exige.decorator';
import { TarefasService } from './tarefas.service';

/**
 * Tarefas — item **B8**.
 *
 * Mesmas acoes `negociacao:*` das visitas, pelo mesmo motivo: §4.3 trata
 * `Deal`, `Visit` e `Task` como um grupo so.
 */
@Controller('tarefas')
@UseGuards(AutorizacaoGuard)
export class TarefasController {
  constructor(private readonly tarefas: TarefasService) {}

  @Post()
  @HttpCode(201)
  @Exige('negociacao:criar')
  criar(
    @Body(new ZodValidationPipe(criarTarefaSchema)) dados: EntradaDeCriarTarefa,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.tarefas.criar(requisicao.autorizacao, dados);
  }

  @Get()
  @Exige('negociacao:ver')
  listar(
    @Query(new ZodValidationPipe(filtrosDeTarefasSchema))
    filtros: FiltrosDeTarefas,
    @Query(new ZodValidationPipe(paginacaoSchema)) paginacao: Paginacao,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.tarefas.listar(requisicao.autorizacao, filtros, paginacao);
  }

  /**
   * Contador de vencidas, para o painel.
   *
   * Vem **antes** de `:id`: o Nest resolve rotas na ordem de declaracao, e
   * `@Get(':id')` casaria com `/tarefas/vencidas/contagem`.
   */
  @Get('vencidas/contagem')
  @Exige('negociacao:ver')
  async contarVencidas(@Req() requisicao: RequisicaoAutorizada) {
    return {
      total: await this.tarefas.contarVencidas(requisicao.autorizacao),
    };
  }

  @Get(':id')
  @Exige('negociacao:ver')
  ver(@Req() requisicao: RequisicaoAutorizada, @Param('id') id: string) {
    return this.tarefas.ver(requisicao.autorizacao, id);
  }

  @Patch(':id')
  @Exige('negociacao:editar')
  atualizar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarTarefaSchema))
    dados: EntradaDeAtualizarTarefa,
  ) {
    return this.tarefas.atualizar(requisicao.autorizacao, id, dados);
  }

  @Post(':id/situacao')
  @HttpCode(200)
  @Exige('negociacao:editar')
  alterarSituacao(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(alterarSituacaoDaTarefaSchema))
    dados: EntradaDeAlterarSituacaoDaTarefa,
  ) {
    return this.tarefas.alterarSituacao(requisicao.autorizacao, id, dados);
  }

  @Post(':id/responsavel')
  @HttpCode(200)
  @Exige('negociacao:atribuir')
  atribuir(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atribuirSchema)) dados: EntradaDeAtribuir,
  ) {
    return this.tarefas.atribuir(requisicao.autorizacao, id, dados);
  }
}
