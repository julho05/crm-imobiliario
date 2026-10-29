import { Module } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module';
import { LimiteModule } from '../limite/limite.module';
import { OrganizacaoController } from './organizacao.controller';
import { OrganizacaoService } from './organizacao.service';

/**
 * A organização ativa: por enquanto, só o endereço da vitrine (C3).
 *
 * O `LimiteModule` entra por um motivo diferente do das rotas públicas: não é
 * contra força bruta, é contra ocupação de nomes — ver
 * `trocaDeEnderecoPorOrganizacao` em `limite/regras.ts`.
 */
@Module({
  imports: [AutorizacaoModule, LimiteModule],
  controllers: [OrganizacaoController],
  providers: [OrganizacaoService],
})
export class OrganizacaoModule {}
