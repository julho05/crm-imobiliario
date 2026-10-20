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

/**
 * Filtros da busca do catalogo publico.
 *
 * Tudo opcional: a vitrine abre sem filtro nenhum. Os limites de valor e area
 * existem para impedir consulta absurda que viraria varredura de tabela.
 *
 * O que **nao** esta aqui e proposital: nao ha filtro por rua, CEP nem
 * coordenada. Permitir isso contornaria `addressVisibility` pela porta da
 * busca (docs/data-model.md §5).
 */
export const filtrosDoCatalogoSchema = z.object({
  termo: z.string().trim().max(120).optional(),
  cidade: z.string().trim().max(191).optional(),
  bairro: z.string().trim().max(191).optional(),
  estado: z.string().trim().toUpperCase().length(2, 'UF invalida.').optional(),
  tipo: z.string().trim().max(32).optional(),
  finalidade: z.string().trim().max(16).optional(),
  precoMinimo: z.coerce.number().min(0).max(999_999_999).optional(),
  precoMaximo: z.coerce.number().min(0).max(999_999_999).optional(),
  quartosMinimo: z.coerce.number().int().min(0).max(20).optional(),
  banheirosMinimo: z.coerce.number().int().min(0).max(20).optional(),
  vagasMinimo: z.coerce.number().int().min(0).max(20).optional(),
  areaMinima: z.coerce.number().min(0).max(1_000_000).optional(),
});
export type FiltrosDoCatalogo = z.infer<typeof filtrosDoCatalogoSchema>;
