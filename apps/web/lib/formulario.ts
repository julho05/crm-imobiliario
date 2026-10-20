import type { ZodType } from 'zod';

/**
 * Validacao de formulario com os schemas de `@app/shared`.
 *
 * Os mesmos schemas que a API usa. O site valida para dar resposta imediata,
 * sem ida ao servidor; o servidor valida de novo porque e ele quem decide. Se
 * as regras divergissem, a tela aceitaria o que a API recusa — ou pior,
 * recusaria o que ela aceita, e o usuario ficaria preso sem entender.
 *
 * Nao usa biblioteca de formulario. Para cinco telas de campos simples, o
 * ganho nao pagaria uma dependencia a mais no caminho da autenticacao.
 */

export type ErrosDoFormulario = Record<string, string>;

export type Validacao<T> =
  { ok: true; dados: T } | { ok: false; erros: ErrosDoFormulario };

/**
 * Valida e devolve **uma** mensagem por campo.
 *
 * Uma, e nao todas: duas mensagens no mesmo campo ("precisa de 10 caracteres"
 * e "precisa de uma letra") empilhadas embaixo do campo confundem mais do que
 * ajudam. A primeira e a que o Zod considera mais proxima da causa.
 */
export function validar<T>(schema: ZodType<T>, valores: unknown): Validacao<T> {
  const resultado = schema.safeParse(valores);

  if (resultado.success) {
    return { ok: true, dados: resultado.data };
  }

  const erros: ErrosDoFormulario = {};

  for (const problema of resultado.error.issues) {
    // `path` vazio e erro do objeto inteiro, nao de um campo — caso do
    // `refine` que compara duas senhas sem apontar para uma delas.
    const campo = problema.path.join('.') || '_formulario';

    if (!(campo in erros)) {
      erros[campo] = problema.message;
    }
  }

  return { ok: false, erros };
}

/**
 * Leva o foco ao primeiro campo com erro, exigencia do §8 de
 * [pages-and-navigation.md](../../../docs/pages-and-navigation.md).
 *
 * Sem isto, num formulario com seis campos a pessoa recebe a recusa e precisa
 * procurar sozinha onde esta o problema — e no celular, com o teclado aberto,
 * o campo com erro pode estar fora da tela.
 */
export function focarPrimeiroErro(
  formulario: HTMLFormElement | null,
  erros: ErrosDoFormulario,
): void {
  if (!formulario) {
    return;
  }

  for (const campo of Object.keys(erros)) {
    const elemento = formulario.elements.namedItem(campo);

    if (elemento instanceof HTMLElement) {
      elemento.focus();
      return;
    }
  }
}
