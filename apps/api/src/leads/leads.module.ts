import { Module } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

/**
 * Leads: o segundo recurso de dado privado, e o primeiro com leitura
 * restrita por responsavel (item B5).
 *
 * Importa apenas o `AutorizacaoModule`, que traz a guarda e o servico dos sete
 * passos de [permissions.md](../../../../docs/permissions.md) §6 — e reexporta
 * o `AutenticacaoModule`, de onde a guarda tira o `SessaoService`.
 */
@Module({
  imports: [AutorizacaoModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  // Exportado para o PainelModule: o resumo do item B9 reaproveita os
  // contadores daqui, que ja carregam o recorte de visibilidade do lead.
  exports: [LeadsService],
})
export class LeadsModule {}
