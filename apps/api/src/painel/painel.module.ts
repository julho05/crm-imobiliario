import { Module } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module';
import { AgendaModule } from '../agenda/agenda.module';
import { ImoveisModule } from '../imoveis/imoveis.module';
import { LeadsModule } from '../leads/leads.module';
import { ResumoController } from './resumo.controller';
import { ResumoService } from './resumo.service';

/**
 * Painel: o resumo do item **B9**.
 *
 * ## Por que este modulo importa tres outros
 *
 * E o unico modulo do projeto que depende de outros modulos de dominio, e isso
 * e proposital: o resumo nao tem dado proprio. Ele faz perguntas sobre imoveis,
 * clientes, visitas e tarefas, e cada uma dessas perguntas tem um recorte de
 * visibilidade que ja vive no servico do recurso.
 *
 * A alternativa seria este modulo consultar as tabelas direto, sem passar pelos
 * servicos. Seria menos acoplado e mais perigoso: cada consulta propria seria
 * uma copia de um recorte, e copia de recorte e como vaza dado — o item B7
 * perdeu o nome de um cliente excluido exatamente por um filtro escrito duas
 * vezes.
 *
 * A seta aponta so para um lado: nenhum dos tres sabe que o painel existe.
 */
@Module({
  imports: [AutorizacaoModule, ImoveisModule, LeadsModule, AgendaModule],
  controllers: [ResumoController],
  providers: [ResumoService],
})
export class PainelModule {}
