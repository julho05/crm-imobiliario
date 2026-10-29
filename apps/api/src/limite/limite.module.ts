import { Module } from '@nestjs/common';
import { LimiteDeTentativasService } from './limite-de-tentativas.service';

/**
 * Limite de tentativas (A11).
 *
 * Nao e `@Global()`: quem limita importa o modulo, e a lista de imports passa
 * a dizer quais areas do sistema tem rota limitada. O `PrismaService` chega do
 * `PrismaModule`, que e global.
 */
@Module({
  providers: [LimiteDeTentativasService],
  exports: [LimiteDeTentativasService],
})
export class LimiteModule {}
