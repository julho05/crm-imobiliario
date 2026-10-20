import { SetMetadata } from '@nestjs/common';
import type { Acao } from '@app/shared';

export const CHAVE_DA_ACAO_EXIGIDA = 'acaoExigida';

/**
 * Declara qual acao a rota exige.
 *
 * ```ts
 * @Exige('imovel:editar')
 * @Patch(':id')
 * editar(...) {}
 * ```
 *
 * A acao vem do tipo `Acao` de `@app/shared`, que e fechado: nao da para
 * escrever uma acao que nao exista na matriz, porque o TypeScript recusa antes
 * de rodar. Isso elimina a classe de erro mais chata desse tipo de guarda — a
 * rota protegida por uma string com erro de digitacao, que nunca casa com nada
 * e por isso **libera** ou **bloqueia** tudo, dependendo de como a guarda
 * trata o caso desconhecido.
 */
export const Exige = (acao: Acao) => SetMetadata(CHAVE_DA_ACAO_EXIGIDA, acao);
