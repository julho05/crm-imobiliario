/**
 * Contratos de entrada da autenticacao.
 *
 * Os mesmos schemas valem para o formulario no site e para o endpoint na API.
 * O front valida para dar resposta imediata; o servidor valida de novo porque
 * e ele quem decide. Cliente nunca e fonte de verdade.
 */

import { z } from 'zod';
import {
  emailSchema,
  nomeDePessoaSchema,
  senhaSchema,
  slugSchema,
} from '../primitivos';
import { Role } from '../enums';

/**
 * Cadastro: cria a pessoa e a organizacao na mesma operacao.
 *
 * Fluxo unico, por decisao de 19/10/2026: corretor autonomo e uma organizacao
 * de um membro `OWNER`, nao um tipo de conta. Nao existe escolha de "sou
 * autonomo" ou "sou imobiliaria" no cadastro.
 */
export const cadastroSchema = z.object({
  nome: nomeDePessoaSchema,
  email: emailSchema,
  senha: senhaSchema,
  nomeDaOrganizacao: z
    .string()
    .trim()
    .min(2, 'Informe o nome da sua imobiliaria ou o seu nome profissional.')
    .max(191, 'Nome muito longo.'),
  slugDaOrganizacao: slugSchema,
  /**
   * Aceite explicito dos termos e do aviso de privacidade. Guardamos a versao
   * aceita, nao so o fato do aceite: mudar o texto depois nao deve invalidar
   * nem reescrever o consentimento antigo (docs/data-model.md §7).
   */
  aceitouOsTermos: z
    .literal(true, 'E preciso aceitar os termos para criar a conta.')
    .describe('Deve ser true; a versao aceita e registrada pelo servidor'),
});
export type EntradaDeCadastro = z.infer<typeof cadastroSchema>;

/**
 * Login.
 *
 * A senha aqui e so `string().min(1)`, de proposito: aplicar a politica de
 * senha no login daria ao atacante um jeito de descobrir se uma senha antiga
 * atende a politica atual, e impediria quem tem senha legada de entrar. A
 * politica vale na criacao e na troca.
 */
export const loginSchema = z.object({
  email: emailSchema,
  senha: z.string().min(1, 'Informe a senha.'),
  /** Estende a expiracao da sessao. O servidor decide o quanto. */
  permanecerConectado: z.boolean().default(false),
});
export type EntradaDeLogin = z.infer<typeof loginSchema>;

/**
 * Token de uso unico sozinho no corpo: verificacao de e-mail, aceite de
 * convite por quem ja tem conta.
 *
 * O formato **nao** e validado de proposito — so o hash do token e guardado, e
 * validar formato no cliente adiantaria informacao sobre como ele e
 * construido. O `min(1)` existe para recusar corpo vazio, nada mais.
 */
export const tokenDeUsoUnicoSchema = z.object({
  token: z.string().min(1, 'Token invalido.'),
});
export type EntradaDeTokenDeUsoUnico = z.infer<typeof tokenDeUsoUnicoSchema>;

export const solicitarRecuperacaoSchema = z.object({
  email: emailSchema,
});
export type EntradaDeSolicitarRecuperacao = z.infer<
  typeof solicitarRecuperacaoSchema
>;

/**
 * Redefinicao de senha com token recebido por e-mail.
 *
 * O token nao tem formato validado aqui porque sua geracao e detalhe do
 * servidor: so o hash e guardado (docs/data-model.md §3.1). Validar formato
 * no cliente so adiantaria informacao sobre como o token e construido.
 */
export const redefinirSenhaSchema = z
  .object({
    token: z.string().min(1, 'Token invalido.'),
    senha: senhaSchema,
    confirmacaoDaSenha: z.string(),
  })
  .refine((v) => v.senha === v.confirmacaoDaSenha, {
    message: 'As senhas nao conferem.',
    path: ['confirmacaoDaSenha'],
  });
export type EntradaDeRedefinirSenha = z.infer<typeof redefinirSenhaSchema>;

/**
 * Convite de membro.
 *
 * `OWNER` nao e convidavel: existe exatamente um por organizacao, e a troca
 * de dono e uma transferencia explicita, nao um convite
 * (docs/permissions.md §4.4).
 */
export const convidarMembroSchema = z.object({
  email: emailSchema,
  papel: z.enum([Role.ADMIN, Role.MANAGER, Role.AGENT], 'Papel invalido.'),
});
export type EntradaDeConvidarMembro = z.infer<typeof convidarMembroSchema>;

/** Aceite de convite por quem ainda nao tem conta. */
export const aceitarConviteSchema = z.object({
  token: z.string().min(1, 'Convite invalido.'),
  nome: nomeDePessoaSchema,
  senha: senhaSchema,
  aceitouOsTermos: z.literal(
    true,
    'E preciso aceitar os termos para criar a conta.',
  ),
});
export type EntradaDeAceitarConvite = z.infer<typeof aceitarConviteSchema>;

/**
 * Troca da organizacao ativa.
 *
 * O servidor grava a escolha na sessao **depois** de confirmar que existe
 * `Membership` ativo. Este schema valida o formato; nao e autorizacao
 * (docs/permissions.md §6).
 */
export const trocarOrganizacaoAtivaSchema = z.object({
  organizationId: z.string().length(25, 'Organizacao invalida.'),
});
export type EntradaDeTrocarOrganizacaoAtiva = z.infer<
  typeof trocarOrganizacaoAtivaSchema
>;
