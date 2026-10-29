/**
 * Formulario de interesse do catalogo publico.
 *
 * E o unico contrato que um visitante sem conta consegue acionar, e por isso o
 * mais sensivel do produto: entra dado pessoal de terceiro, com exigencia de
 * consentimento (LGPD) e exposto a robo de spam.
 */

import { z } from 'zod';
import {
  emailSchema,
  nomeDePessoaSchema,
  telefoneBrSchema,
} from '../primitivos';

/**
 * Captura de lead a partir de um imovel do catalogo.
 *
 * Decisoes embutidas:
 *
 * - **Telefone e e-mail sao opcionais, mas pelo menos um e obrigatorio.** A
 *   regra esta em docs/data-model.md §3.4 como "validacao de aplicacao"; aqui
 *   ela e exatamente isso, e vale nos dois lados.
 * - **O consentimento e marcacao explicita**, nunca pre-marcada na interface.
 *   Consentimento pre-marcado nao e consentimento.
 * - **A versao do aviso de privacidade vem do servidor**, nao do formulario.
 *   Se o cliente pudesse enviar a versao, poderia alegar aceite de um texto
 *   que nunca viu.
 * - **O IP nao entra aqui.** O servidor o extrai da requisicao e guarda o
 *   hash (docs/data-model.md §7). Campo enviavel pelo cliente seria prova
 *   falsificavel.
 */
export const capturaDeLeadSchema = z
  .object({
    /** Imovel sobre o qual a pessoa esta perguntando. */
    propertyId: z.string().length(25, 'Imovel invalido.'),
    nomeCompleto: nomeDePessoaSchema,
    telefone: telefoneBrSchema.optional(),
    email: emailSchema.optional(),
    mensagem: z.string().trim().max(2000, 'Mensagem muito longa.').optional(),
    /**
     * Precisa ser `true`. Guardar o consentimento sem que ele tenha sido dado
     * e pior do que nao guardar nada.
     */
    consentiuComAPrivacidade: z.literal(
      true,
      'E preciso concordar com o aviso de privacidade para enviar.',
    ),
  })
  .refine((v) => Boolean(v.telefone ?? v.email), {
    message: 'Informe ao menos um telefone ou um e-mail para contato.',
    path: ['telefone'],
  });
export type EntradaDeCapturaDeLead = z.infer<typeof capturaDeLeadSchema>;

// Os filtros da busca do catalogo moraram aqui ate 29/10/2026. Estao em
// `./catalogo.ts`.
