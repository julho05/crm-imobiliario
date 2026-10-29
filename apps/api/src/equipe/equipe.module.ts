import { Module } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module';
import { LimiteModule } from '../limite/limite.module';
import { ConvitesPublicosController } from './convites-publicos.controller';
import { ConvitesService } from './convites.service';
import { EquipeController } from './equipe.controller';
import { MembrosService } from './membros.service';

/**
 * Equipe: convites e, mais adiante, membros e papeis.
 *
 * Importa apenas o `AutorizacaoModule`. Ele reexporta o `AutenticacaoModule`,
 * de onde vem o `SenhaService` e o `SessaoService` que o aceite de convite
 * precisa para criar conta e abrir sessao — e o `PrismaService` e o
 * `RemetenteDeEmail` chegam dos modulos `@Global()`.
 *
 * O `LimiteModule` serve as rotas publicas de convite, que recebem token (A11).
 */
@Module({
  imports: [AutorizacaoModule, LimiteModule],
  controllers: [EquipeController, ConvitesPublicosController],
  providers: [ConvitesService, MembrosService],
})
export class EquipeModule {}
