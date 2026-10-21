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
  alterarSituacaoDaVisitaSchema,
  atribuirSchema,
  atualizarVisitaSchema,
  criarVisitaSchema,
  janelaDaAgendaSchema,
  type EntradaDeAlterarSituacaoDaVisita,
  type EntradaDeAtribuir,
  type EntradaDeAtualizarVisita,
  type EntradaDeCriarVisita,
  type JanelaDaAgenda,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard';
import type { RequisicaoAutorizada } from '../autorizacao/autorizacao.guard';
import { Exige } from '../autorizacao/exige.decorator';
import { VisitasService } from './visitas.service';

/**
 * Agenda de visitas — item **B8**.
 *
 * ## As ações se chamam `negociacao:*`
 *
 * [permissions.md](../../../../docs/permissions.md) §4.3 trata `Deal`, `Visit`
 * e `Task` como um grupo, com uma linha de matriz para os três. Usar as mesmas
 * ações é seguir o documento; inventar `visita:ver` exigiria decidir o escopo
 * dos quatro papéis de novo, e duas matrizes para a mesma regra divergem no
 * primeiro ajuste.
 *
 * ## Agendar para outra pessoa é atribuir
 *
 * A rota de criação exige apenas `negociacao:criar`, que todos têm. Quando o
 * corpo traz `responsavelId` de outra pessoa, o serviço confere
 * `negociacao:atribuir` — o teto depende do corpo, e `@Exige` é estático por
 * rota. É o mesmo arranjo do controller de convites.
 */
@Controller('visitas')
@UseGuards(AutorizacaoGuard)
export class VisitasController {
  constructor(private readonly visitas: VisitasService) {}

  @Post()
  @HttpCode(201)
  @Exige('negociacao:criar')
  criar(
    @Body(new ZodValidationPipe(criarVisitaSchema)) dados: EntradaDeCriarVisita,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.visitas.criar(requisicao.autorizacao, dados);
  }

  /**
   * As visitas de um período.
   *
   * `de` e `ate` são obrigatórios, e o contrato limita a seis meses. Sem
   * paginação de propósito: a agenda mostra o período inteiro, e "as primeiras
   * vinte do mês" não é uma agenda.
   */
  @Get()
  @Exige('negociacao:ver')
  async listar(
    @Query(new ZodValidationPipe(janelaDaAgendaSchema)) janela: JanelaDaAgenda,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return {
      visitas: await this.visitas.listar(requisicao.autorizacao, janela),
    };
  }

  @Get(':id')
  @Exige('negociacao:ver')
  ver(@Req() requisicao: RequisicaoAutorizada, @Param('id') id: string) {
    return this.visitas.ver(requisicao.autorizacao, id);
  }

  @Patch(':id')
  @Exige('negociacao:editar')
  atualizar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarVisitaSchema))
    dados: EntradaDeAtualizarVisita,
  ) {
    return this.visitas.atualizar(requisicao.autorizacao, id, dados);
  }

  @Post(':id/situacao')
  @HttpCode(200)
  @Exige('negociacao:editar')
  alterarSituacao(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(alterarSituacaoDaVisitaSchema))
    dados: EntradaDeAlterarSituacaoDaVisita,
  ) {
    return this.visitas.alterarSituacao(requisicao.autorizacao, id, dados);
  }

  @Post(':id/responsavel')
  @HttpCode(200)
  @Exige('negociacao:atribuir')
  atribuir(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atribuirSchema)) dados: EntradaDeAtribuir,
  ) {
    return this.visitas.atribuir(requisicao.autorizacao, id, dados);
  }
}
