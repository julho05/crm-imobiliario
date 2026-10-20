import { Module } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module';
import { ConvitesPublicosController } from './convites-publicos.controller';
import { ConvitesService } from './convites.service';
import { EquipeController } from './equipe.controller';

/**
 * Equipe: convites e, mais adiante, membros e papeis.
 *
 * Importa apenas o `AutorizacaoModule`. Ele reexporta o `AutenticacaoModule`,
 * de onde vem o `SenhaService` e o `SessaoService` que o aceite de convite
 * precisa para criar conta e abrir sessao — e o `PrismaService` e o
 * `RemetenteDeEmail` chegam dos modulos `@Global()`.
 */
@Module({
  imports: [AutorizacaoModule],
  controllers: [EquipeController, ConvitesPublicosController],
  providers: [ConvitesService],
})
export class EquipeModule {}
