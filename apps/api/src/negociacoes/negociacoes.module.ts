import { Module } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module';
import { NegociacoesController } from './negociacoes.controller';
import { NegociacoesService } from './negociacoes.service';

/**
 * Funil de negociacoes (item B7).
 *
 * E o primeiro recurso cuja visibilidade **nao** e a propria: ela herda o lead
 * (`docs/permissions.md` §4.3). A regra vive no servico, e o modulo nao tem
 * nada de especial por causa dela.
 */
@Module({
  imports: [AutorizacaoModule],
  controllers: [NegociacoesController],
  providers: [NegociacoesService],
})
export class NegociacoesModule {}
