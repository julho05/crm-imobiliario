import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AutenticacaoModule } from './autenticacao/autenticacao.module';
import { AutorizacaoModule } from './autorizacao/autorizacao.module';
import { EmailModule } from './email/email.module';
import { EquipeModule } from './equipe/equipe.module';
import { ImoveisModule } from './imoveis/imoveis.module';
import { LeadsModule } from './leads/leads.module';
import { NegociacoesModule } from './negociacoes/negociacoes.module';

// O AutorizacaoModule continua no grafo por conta propria, e nao so por ser
// dependencia de quem o usa: ele nao tem rota, mas a injecao de dependencia da
// guarda e validada em toda inicializacao por estar aqui.
//
// Desde o item B1 ha rota protegida de verdade — o ImoveisModule.
@Module({
  imports: [
    PrismaModule,
    EmailModule,
    AutenticacaoModule,
    AutorizacaoModule,
    EquipeModule,
    ImoveisModule,
    LeadsModule,
    NegociacoesModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
