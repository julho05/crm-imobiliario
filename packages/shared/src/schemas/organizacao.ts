/**
 * Dados da organização — por enquanto, só o endereço da vitrine (item **C3**).
 *
 * O resto da tela `/painel/organizacao` (nome, contato público, apresentação,
 * logo) fica para um item próprio, por decisão de 29/10/2026. Quando entrar,
 * entra aqui, em schema separado: trocar o endereço tem permissão própria
 * (`organizacao:editarSlug`) e consequência própria, e misturá-lo com o nome
 * num formulário só faria a troca acontecer sem querer.
 */

import { z } from 'zod';
import { slugSchema } from '../primitivos';

export const trocarEnderecoDaVitrineSchema = z.object({
  slug: slugSchema,
});

export type EntradaDeTrocarEnderecoDaVitrine = z.infer<
  typeof trocarEnderecoDaVitrineSchema
>;
