import { Module } from '@nestjs/common';
import { AutenticacaoModule } from '../autenticacao/autenticacao.module';
import { AutorizacaoGuard } from './autorizacao.guard';
import { AutorizacaoService } from './autorizacao.service';

/**
 * Autorizacao: os sete passos de
 * [permissions.md](../../../../docs/permissions.md) §6 em **um** lugar.
 *
 * A guarda cobre os passos 1 a 4; o servico, os passos 5 a 7. Nenhum modulo de
 * recurso deve reimplementar essa verificacao — quem precisa autorizar importa
 * este modulo e usa `@Exige()` + `AutorizacaoService`.
 *
 * A guarda **nao** e registrada globalmente, de proposito: `APP_GUARD` exigiria
 * marcar como publica cada rota que nao autentica (catalogo, health, login), e
 * essa lista de excecoes e o lugar classico onde se esquece de tirar uma rota.
 * Aqui a protecao e explicita por rota, e rota com a guarda sem `@Exige`
 * **fecha** em vez de abrir.
 */
@Module({
  imports: [AutenticacaoModule],
  providers: [AutorizacaoGuard, AutorizacaoService],
  // O `AutenticacaoModule` e reexportado de proposito, e nao por descuido.
  //
  // `@UseGuards(AutorizacaoGuard)` com referencia de classe faz o Nest
  // **instanciar a guarda no modulo do controller**, nao reaproveitar a
  // instancia daqui. Consequencia: as dependencias dela precisam estar no
  // alcance desse modulo. O `PrismaService` chega sozinho, porque o
  // `PrismaModule` e `@Global()`; o `SessaoService`, nao.
  //
  // Sem esta linha, cada modulo de recurso teria de importar os dois modulos e
  // descobrir o motivo por tentativa e erro, lendo um "Nest can't resolve
  // dependencies of the AutorizacaoGuard" que nao aponta para a causa.
  // Importar `AutorizacaoModule` passa a bastar.
  exports: [AutorizacaoGuard, AutorizacaoService, AutenticacaoModule],
})
export class AutorizacaoModule {}
