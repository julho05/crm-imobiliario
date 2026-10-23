import { Module } from '@nestjs/common';
import { MidiaModule } from '../midia/midia.module';
import { CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';

/**
 * O catálogo público — item **C2**.
 *
 * ## O único módulo que **não** importa o `AutorizacaoModule`
 *
 * E é assim que deve ser: não há sessão para conferir nem papel para consultar.
 * A lista de importações diz isso sozinha, e vale mais do que um comentário
 * dentro do controller — quem acrescentar aqui um módulo que traz a guarda
 * está, sem perceber, mudando a natureza destas rotas.
 *
 * Importa o `MidiaModule` apenas pela porta `ArmazenamentoDeMidia`, para
 * transformar `objectKey` em URL. Não usa o `MidiaService`, que exige contexto
 * autorizado e não tem o que fazer aqui.
 */
@Module({
  imports: [MidiaModule],
  controllers: [CatalogoController],
  providers: [CatalogoService],
})
export class CatalogoModule {}
