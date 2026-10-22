import { Module } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';
import { VisitasController } from './visitas.controller';
import { VisitasService } from './visitas.service';

/**
 * Agenda: visitas e tarefas (item B8).
 *
 * Um modulo para os dois porque compartilham a regra que os define — a
 * visibilidade de **duas portas**, decidida em 21/10/2026: enxerga quem
 * responde pelo registro ou pelo cliente ligado a ele. Separados, a regra
 * existiria em dois lugares e divergiria no primeiro ajuste.
 */
@Module({
  imports: [AutorizacaoModule],
  controllers: [VisitasController, TarefasController],
  providers: [VisitasService, TarefasService],
  // Exportados para o PainelModule: as visitas de hoje e as tarefas vencidas
  // do resumo saem daqui, com a visibilidade de duas portas ja aplicada.
  exports: [VisitasService, TarefasService],
})
export class AgendaModule {}
