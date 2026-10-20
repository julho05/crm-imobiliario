import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Erro de validacao devolvido ao cliente, campo a campo. */
export type ErroDeCampo = {
  campo: string;
  mensagem: string;
};

/**
 * Valida o corpo (ou a query) de uma requisicao com um schema do Zod.
 *
 * ## Por que um pipe, e nao validacao dentro do controller
 *
 * `CLAUDE.md` pede validacao de entradas e proibe duplicacao. Se cada
 * controller validasse por conta, a regra divergiria entre endpoints e o
 * esquecimento de um seria invisivel. Aqui a validacao e declarada junto da
 * rota e falha do mesmo jeito em todas.
 *
 * ## Por que o schema vem de `@app/shared`
 *
 * E o mesmo objeto que o formulario no site usa. O front valida para dar
 * resposta imediata; este pipe valida de novo porque **o cliente nunca e
 * fonte de verdade**. Nao e redundancia: sao papeis diferentes.
 *
 * ## O que ele deliberadamente nao faz
 *
 * Nao autoriza. Validacao responde "esta entrada tem a forma certa?"; a
 * pergunta "esta pessoa pode fazer isso nesta organizacao?" e outra, resolvida
 * no servidor pelos seis passos de docs/permissions.md §6. Schema que
 * recebesse `organizationId` do cliente e confiasse nele seria exatamente o
 * furo que aquele documento descreve.
 *
 * Uso:
 * ```ts
 * @Post('entrar')
 * entrar(@Body(new ZodValidationPipe(loginSchema)) dados: EntradaDeLogin) {}
 * ```
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(valor: unknown): T {
    const resultado = this.schema.safeParse(valor);

    if (resultado.success) {
      return resultado.data;
    }

    const erros: ErroDeCampo[] = resultado.error.issues.map((problema) => ({
      // Caminho vazio significa erro do objeto todo, nao de um campo.
      campo: problema.path.join('.') || '_',
      mensagem: problema.message,
    }));

    // Mensagem generica no topo, detalhe por campo na lista. O conteudo vem
    // do schema, escrito em portugues para ser exibido direto no formulario.
    throw new BadRequestException({
      mensagem: 'Dados invalidos.',
      erros,
    });
  }
}
