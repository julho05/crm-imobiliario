import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global porque praticamente todo modulo de dominio vai precisar do client,
// e repetir o import em cada um nao agrega nada.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
