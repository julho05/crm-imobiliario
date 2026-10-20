/**
 * Blocos de validacao reutilizados pelos schemas. Mensagens em portugues do
 * Brasil, porque sao exibidas direto ao usuario.
 */

import { z } from 'zod';

/**
 * E-mail normalizado: sem espacos nas pontas e em minusculas.
 *
 * O `.pipe()` nao e enfeite. No Zod 4 a verificacao de formato de `z.email()`
 * roda antes dos transformes encadeados depois dela, entao " A@B.com " seria
 * recusado por causa dos espacos. Normalizar primeiro e validar depois e o
 * que faz o formulario aceitar o que o usuario realmente digita.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Informe o e-mail.')
  .max(191, 'E-mail muito longo.')
  .pipe(z.email('E-mail invalido.'));

/**
 * Politica de senha.
 *
 * Comprimento minimo acima do habitual e exigencia de variedade, porque
 * `CLAUDE.md` pede "senhas com hash forte" e hash forte nao salva senha curta.
 * O limite maximo existe por um motivo pratico: o bcrypt ignora o que passa de
 * 72 bytes, o que criaria senhas longas silenciosamente equivalentes. O
 * algoritmo final ainda nao foi escolhido (Argon2id ou bcrypt), e 128 e um
 * teto seguro para os dois.
 */
export const senhaSchema = z
  .string()
  .min(10, 'A senha precisa de pelo menos 10 caracteres.')
  .max(128, 'A senha pode ter no maximo 128 caracteres.')
  .refine((v) => /[a-z]/.test(v), 'Inclua pelo menos uma letra minuscula.')
  .refine((v) => /[A-Z]/.test(v), 'Inclua pelo menos uma letra maiuscula.')
  .refine((v) => /\d/.test(v), 'Inclua pelo menos um numero.');

export const nomeDePessoaSchema = z
  .string()
  .trim()
  .min(2, 'Informe o nome completo.')
  .max(191, 'Nome muito longo.');

/**
 * Telefone brasileiro. Guarda somente digitos — formatacao e assunto de
 * exibicao, e normalizar na entrada e o que torna possivel detectar lead
 * duplicado por telefone (docs/data-model.md §3.4).
 *
 * Aceita 10 digitos (fixo) ou 11 (celular com o 9), com DDD. Opcionalmente
 * com o 55 na frente, que e descartado.
 */
export const telefoneBrSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .transform((v) => (v.length > 11 && v.startsWith('55') ? v.slice(2) : v))
  .refine(
    (v) => v.length === 10 || v.length === 11,
    'Telefone invalido. Informe DDD e numero.',
  )
  .refine((v) => Number(v.slice(0, 2)) >= 11, 'DDD invalido.');

/**
 * Slugs que nao podem ser usados por nenhuma organizacao, porque colidem com
 * rotas da aplicacao ou com termos que confundiriam o usuario.
 *
 * A lista e compartilhada de proposito: o formulario avisa na hora, e o
 * servidor **tambem** recusa. O aviso no front e conveniencia; a recusa no
 * servidor e a regra.
 */
export const SLUGS_RESERVADOS: readonly string[] = [
  'admin',
  'administrador',
  'ajuda',
  'api',
  'app',
  'auth',
  'blog',
  'cadastro',
  'catalogo',
  'configuracoes',
  'contato',
  'dashboard',
  'entrar',
  'equipe',
  'health',
  'imoveis',
  'login',
  'logout',
  'o',
  'painel',
  'perfil',
  'planos',
  'precos',
  'privacidade',
  'public',
  'recuperar',
  'sair',
  'senha',
  'sobre',
  'static',
  'suporte',
  'termos',
  'www',
] as const;

/**
 * Slug da organizacao, usado em `/o/[slug]`.
 *
 * Minusculo, sem acento, sem underscore. Nao pode comecar nem terminar com
 * hifen, nem ter hifen duplo — essas formas confundem leitura e copia de
 * link. Minimo de 3 caracteres para nao esgotar nomes de uma letra.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'O endereco precisa de pelo menos 3 caracteres.')
  .max(63, 'O endereco pode ter no maximo 63 caracteres.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use apenas letras minusculas, numeros e hifen entre palavras.',
  )
  .refine(
    (v) => !SLUGS_RESERVADOS.includes(v),
    'Este endereco e reservado. Escolha outro.',
  );

/** Identificador de registro: `cuid()` em CHAR(25) (docs/data-model.md §1). */
export const idSchema = z
  .string()
  .length(25, 'Identificador invalido.')
  .regex(/^[a-z0-9]+$/, 'Identificador invalido.');

/**
 * Paginacao. `CLAUDE.md` exige paginacao em listagens; o teto de 100 existe
 * para que ninguem peca a base inteira em uma requisicao.
 */
export const paginacaoSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});
export type Paginacao = z.infer<typeof paginacaoSchema>;
