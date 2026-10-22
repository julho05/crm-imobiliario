import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { janelaDoResumoSchema, type JanelaDoResumo } from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard';
import type { RequisicaoAutorizada } from '../autorizacao/autorizacao.guard';
import { Exige } from '../autorizacao/exige.decorator';
import { ResumoService } from './resumo.service';

/**
 * Resumo do painel — item **B9**.
 *
 * ## Sobre o `@Exige('imovel:ver')`
 *
 * É o **piso**, e não o teto — o mesmo arranjo do controller de convites e do
 * de visitas. `imovel:ver` é `ORG` para os quatro papéis, então a guarda aqui
 * garante apenas o que esta rota de fato exige: sessão válida, organização
 * ativa resolvida no servidor e vínculo ativo, ou seja, os passos 1 a 3 de
 * [permissions.md](../../../../docs/permissions.md) §6.
 *
 * O teto de **cada número** é conferido no serviço, porque são quatro ações
 * diferentes com escopos diferentes. Declarar aqui a mais restritiva delas
 * esconderia o painel inteiro de quem pode ver metade dele; declarar a mais
 * permissiva não protegeria nada. O `@Exige` é estático por rota, e esta rota
 * responde a cinco perguntas.
 *
 * Isto **não** é uma brecha: nenhum número é montado com o escopo desta
 * declaração. O serviço deriva o contexto de cada um a partir da matriz, e é lá
 * que o teste de permissão olha.
 */
@Controller('painel')
@UseGuards(AutorizacaoGuard)
export class ResumoController {
  constructor(private readonly resumo: ResumoService) {}

  @Get('resumo')
  @Exige('imovel:ver')
  montar(
    @Query(new ZodValidationPipe(janelaDoResumoSchema)) janela: JanelaDoResumo,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.resumo.montar(requisicao.autorizacao, janela);
  }
}
