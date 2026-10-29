import { Module } from '@nestjs/common';
import { LimiteModule } from '../limite/limite.module';
import { AutenticacaoController } from './autenticacao.controller';
import { AutenticacaoService } from './autenticacao.service';
import { RecuperacaoService } from './recuperacao.service';
import { SenhaService } from './senha.service';
import { SessaoGuard } from './sessao.guard';
import { SessaoService } from './sessao.service';

// O PrismaService vem do PrismaModule, que e @Global().
@Module({
  imports: [LimiteModule],
  controllers: [AutenticacaoController],
  providers: [
    AutenticacaoService,
    RecuperacaoService,
    SenhaService,
    SessaoService,
    SessaoGuard,
  ],
  // Exportados porque outros modulos precisam: a guarda de autorizacao (A5) e
  // o aceite de convite (A10), que cria conta e abre sessao.
  exports: [SenhaService, SessaoService, SessaoGuard, RecuperacaoService],
})
export class AutenticacaoModule {}
