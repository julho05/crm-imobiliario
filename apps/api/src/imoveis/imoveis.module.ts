import { Module } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module';
import { ImoveisController } from './imoveis.controller';
import { ImoveisService } from './imoveis.service';

/**
 * Imoveis: o primeiro recurso de dado privado do produto (item B1).
 *
 * Importa apenas o `AutorizacaoModule`, que traz a guarda e o servico dos sete
 * passos de [permissions.md](../../../../docs/permissions.md) §6 — e reexporta
 * o `AutenticacaoModule`, de onde a guarda tira o `SessaoService`. O
 * `PrismaService` chega sozinho, porque o `PrismaModule` e `@Global()`.
 */
@Module({
  imports: [AutorizacaoModule],
  controllers: [ImoveisController],
  providers: [ImoveisService],
  // Exportado para o PainelModule, pelo mesmo motivo do LeadsModule.
  exports: [ImoveisService],
})
export class ImoveisModule {}
