/**
 * Negociações — item **B7** do [roadmap.md](../../../../docs/roadmap.md).
 *
 * ## A visibilidade herda o lead, e isso atravessa tudo
 *
 * `docs/data-model.md` §3.4 e `docs/permissions.md` §4.3 dizem a mesma coisa:
 * **quem não vê o lead não vê a negociação**. Qualquer outra combinação vaza
 * por via indireta — a negociação carrega o nome do cliente, então um funil que
 * mostrasse negociação de lead alheio entregaria a carteira do colega pela
 * porta do funil.
 *
 * Consequência que o contrato precisa respeitar: `Deal.assignedMemberId` existe
 * (quem está conduzindo a negociação), mas **não é ele que decide quem vê**. É
 * sempre `lead.assignedMemberId`.
 *
 * ## O que este schema não aceita
 *
 * - **`organizationId`** — vem da sessão (§6, passo 2)
 * - **`leadId` na edição** — a negociação nasce ligada a um cliente e não troca
 *   de cliente. Permitir isso moveria a negociação para dentro da carteira de
 *   outra pessoa, ou para fora da sua, sem passar pela atribuição do lead
 * - **`closedAt`** — derivado da etapa. Etapa de ganho ou perda fecha a
 *   negociação; etapa aberta reabre. Campo editável permitiria "fechada e na
 *   etapa de proposta", que não significa nada
 */

import { z } from 'zod';
import { idSchema } from '../primitivos';

/** Valor esperado do negócio. Mesmo teto e precisão dos preços de imóvel. */
const dinheiroSchema = z
  .number()
  .nonnegative('O valor nao pode ser negativo.')
  .max(999_999_999.99, 'Valor acima do limite aceito.')
  .multipleOf(0.01, 'Use no maximo duas casas decimais.');

/**
 * Motivo da perda.
 *
 * Obrigatório ao mover para uma etapa de perda, e por um motivo prático: é o
 * único campo do funil que responde "por que não fechamos?". Sem ele, a etapa
 * `Perdido` acumula registros que não ensinam nada, e a imobiliária perde a
 * informação mais útil que o funil produz.
 */
export const motivoDaPerdaSchema = z
  .string()
  .trim()
  .min(3, 'Diga em poucas palavras por que a negociacao foi perdida.')
  .max(255, 'Motivo muito longo.');

/**
 * Abertura de negociação.
 *
 * `etapaId` é opcional: omitido, o servidor usa a primeira etapa do funil da
 * organização. Exigi-lo obrigaria a interface a carregar as etapas só para
 * abrir uma negociação, e a primeira etapa é onde toda negociação começa.
 */
export const criarNegociacaoSchema = z.object({
  leadId: idSchema,
  /** Opcional: existe negociacao sem imovel definido. */
  imovelId: idSchema.optional(),
  etapaId: idSchema.optional(),
  valorEsperado: dinheiroSchema.optional(),
});
export type EntradaDeCriarNegociacao = z.infer<typeof criarNegociacaoSchema>;

/**
 * Edição.
 *
 * Só dois campos, porque só dois são do registro e não de um evento: o valor
 * esperado e o imóvel. Etapa, responsável e exclusão têm rotas próprias.
 *
 * `null` no imóvel desfaz o vínculo — a negociação volta a ser "procura algo",
 * que é um estado legítimo e o motivo de `propertyId` ser opcional no banco.
 */
export const atualizarNegociacaoSchema = z
  .object({
    imovelId: idSchema.nullable().optional(),
    valorEsperado: dinheiroSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Nenhum campo para atualizar.',
  });
export type EntradaDeAtualizarNegociacao = z.infer<
  typeof atualizarNegociacaoSchema
>;

/**
 * Mover de etapa.
 *
 * `motivoDaPerda` é conferido no servidor, e não aqui: só ele sabe se a etapa
 * de destino é de perda — as etapas são **linhas**, não valores de enum
 * (decisão de 19/10/2026), então o schema não tem como saber o que `etapaId`
 * significa.
 */
export const moverNegociacaoSchema = z.object({
  etapaId: idSchema,
  motivoDaPerda: motivoDaPerdaSchema.optional(),
});
export type EntradaDeMoverNegociacao = z.infer<typeof moverNegociacaoSchema>;

/**
 * Quem conduz a negociação.
 *
 * `null` deixa sem responsável próprio — a negociação continua visível para
 * quem é responsável pelo **lead**, que é quem a visibilidade segue.
 */
export const atribuirNegociacaoSchema = z.object({
  membershipId: idSchema.nullable(),
});
export type EntradaDeAtribuirNegociacao = z.infer<
  typeof atribuirNegociacaoSchema
>;

/** Filtros da listagem do funil. */
export const filtrosDeNegociacoesSchema = z.object({
  etapaId: idSchema.optional(),
  imovelId: idSchema.optional(),
  leadId: idSchema.optional(),
  apenasMinhas: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true')
    .optional(),
  /** Inclui as negociações já fechadas, que por padrão ficam fora. */
  incluirFechadas: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type FiltrosDeNegociacoes = z.infer<typeof filtrosDeNegociacoesSchema>;
