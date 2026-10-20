import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AutenticacaoModule } from './autenticacao/autenticacao.module';
import { AutorizacaoModule } from './autorizacao/autorizacao.module';
import { EmailModule } from './email/email.module';
import { EquipeModule } from './equipe/equipe.module';

// O AutorizacaoModule entra aqui ainda sem rota propria: os recursos que ele
// protege sao da Fase 2. Fica no grafo desde agora para que a injecao de
// dependencia da guarda seja validada em toda inicializacao, e nao apenas no
// dia em que a primeira rota protegida aparecer.
@Module({
  imports: [
    PrismaModule,
    EmailModule,
    AutenticacaoModule,
    AutorizacaoModule,
    EquipeModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
