/**
 * Administracao da equipe — troca de papel e remocao de membro.
 *
 * O convite continua em `schemas/autenticacao.ts`, onde nasceu com o A10.
 *
 * Nenhum dos dois schemas decide **quem** pode agir sobre **quem**: isso
 * depende do papel do ator e do alvo, e e do servidor, por
 * `podeAgirSobreMembro` (docs/permissions.md §4.4). Aqui so a forma.
 */

import { z } from 'zod';
import { Role } from '../enums';

/**
 * Troca de papel.
 *
 * `OWNER` fica fora pelo mesmo motivo do convite: existe exatamente um por
 * organizacao, e trocar de dono e transferencia explicita, nao promocao.
 */
export const alterarPapelSchema = z.object({
  papel: z.enum([Role.ADMIN, Role.MANAGER, Role.AGENT], 'Papel invalido.'),
});
export type EntradaDeAlterarPapel = z.infer<typeof alterarPapelSchema>;

/**
 * Remocao de membro, com o destino da carteira dele.
 *
 * O destino e **opcional no schema** porque quem nao tem nada atribuido nao
 * tem o que passar adiante. Quem tem, recebe recusa do servidor sem ele — a
 * contagem esta no banco, nao no formulario.
 */
export const removerMembroSchema = z.object({
  destinoMembershipId: z
    .string()
    .length(25, 'Destino invalido.')
    .regex(/^[a-z0-9]+$/, 'Destino invalido.')
    .optional(),
});
export type EntradaDeRemoverMembro = z.infer<typeof removerMembroSchema>;
