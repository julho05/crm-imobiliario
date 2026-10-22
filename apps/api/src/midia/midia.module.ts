import { Module, type Type } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module';
import { ArmazenamentoDeMidia } from './armazenamento-de-midia';
import { ArmazenamentoLocal } from './armazenamento-local';
import { MidiaController } from './midia.controller';
import { MidiaLocalController } from './midia-local.controller';
import { MidiaService } from './midia.service';

/**
 * Mídia do imóvel (item **B4**) e a escolha do adaptador de armazenamento.
 *
 * Mesmo arranjo do `EmailModule`: um `switch` num lugar só, e o resto do
 * projeto depende da classe abstrata `ArmazenamentoDeMidia`. Quando as
 * credenciais do Cloudflare R2 existirem, entra aqui um segundo `case` com o
 * adaptador do R2 — e nada mais no projeto muda.
 */
function ehLocal(): boolean {
  return (process.env.MIDIA_PROVIDER ?? 'local') === 'local';
}

function escolherArmazenamento(): Type<ArmazenamentoDeMidia> {
  const provedor = process.env.MIDIA_PROVIDER ?? 'local';

  if (provedor === 'local') {
    // A recusa e na inicializacao, e nao no primeiro upload: falhar ao subir
    // aparece no deploy. Falhar no primeiro envio seria descoberto por um
    // cliente, com a foto dele.
    //
    // O motivo de recusar: o disco da hospedagem gerenciada serviria a midia
    // pelo mesmo processo Node que atende o corretor, gastando a CPU e a banda
    // do plano compartilhado — exatamente o que a decisao de 21/10/2026 evitou
    // ao escolher o R2. E o disco de um plano compartilhado nao tem a
    // durabilidade que foto de cliente exige.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'MIDIA_PROVIDER=local nao e aceito em producao: o adaptador de ' +
          'desenvolvimento grava no disco da aplicacao e serve os arquivos ' +
          'pelo processo da API. Configure o Cloudflare R2 antes de subir ' +
          '(ver docs/architecture.md).',
      );
    }

    return ArmazenamentoLocal;
  }

  throw new Error(
    `MIDIA_PROVIDER="${provedor}" nao e conhecido. ` +
      'Hoje o unico valor aceito e "local", para desenvolvimento. O ' +
      'adaptador do Cloudflare R2 entra quando as credenciais existirem ' +
      '(ver docs/roadmap.md, item B4).',
  );
}

const armazenamento = escolherArmazenamento();

@Module({
  imports: [AutorizacaoModule],
  // O receptor do armazenamento local **so** e registrado com o adaptador
  // local. Em producao essas rotas nao existem — nao ficam protegidas por um
  // `if` dentro delas, simplesmente nao estao no grafo.
  controllers: ehLocal()
    ? [MidiaController, MidiaLocalController]
    : [MidiaController],
  providers: [
    MidiaService,
    armazenamento,
    { provide: ArmazenamentoDeMidia, useExisting: armazenamento },
  ],
  exports: [MidiaService, ArmazenamentoDeMidia],
})
export class MidiaModule {}
