/**
 * Leads — item **B5** do [roadmap.md](../../../../docs/roadmap.md).
 *
 * ## A diferenca que importa em relacao a imoveis
 *
 * `imovel:ver` e `ORG` para todos os papeis; `lead:ver` e **`OWN`** para o
 * corretor. A consequencia pratica inverte os codigos de erro: o imovel do
 * colega responde **403** ao ser editado (o corretor o ve na lista, esconder
 * seria teatro), e o lead do colega responde **404** (ele nao o ve, e um 403
 * entregaria justamente o que o escopo `OWN` existe para negar).
 *
 * A razao e de negocio, nao tecnica, e esta em
 * [permissions.md](../../../../docs/permissions.md) §4.2: lead e a moeda de
 * troca da imobiliaria. Expor a carteira de um corretor aos colegas gera
 * conflito interno e faz o cliente abandonar o CRM.
 *
 * ## O que este schema nao aceita
 *
 * - **`organizationId`** — vem da sessao (§6, passo 2)
 * - **`assignedMemberId`** — atribuir exige `lead:atribuir`, que o `AGENT` nao
 *   tem. Aceitar o campo no cadastro deixaria o corretor criar lead no nome de
 *   um colega, ou tirar da fila um lead que o gerente ia distribuir
 * - **`consentGivenAt`, `privacyNoticeVersion`, `consentIpHash`** — sao prova
 *   de consentimento do visitante do catalogo, montada pelo servidor (item
 *   C5). Campo de consentimento enviavel pelo cliente seria prova
 *   falsificavel, e e justamente o que a LGPD cobra
 * - **`anonymizedAt`** — resposta a pedido de titular, nao edicao de rotina
 */

import { z } from 'zod';
import { LeadSource, LeadStatus } from '../enums';
import {
  emailSchema,
  nomeDePessoaSchema,
  telefoneBrSchema,
} from '../primitivos';

/**
 * Origens que o cadastro manual aceita.
 *
 * `PUBLIC_CATALOG` fica **fora**: so o formulario da vitrine cria lead com essa
 * origem, e e o servidor que a define. Aceita-la aqui permitiria inflar o
 * relatorio de desempenho do catalogo com lead digitado a mao — numero que
 * depois sustenta decisao sobre investir ou nao na vitrine.
 */
export const ORIGENS_DE_CADASTRO_MANUAL = [
  LeadSource.MANUAL,
  LeadSource.REFERRAL,
  LeadSource.IMPORT,
  LeadSource.OTHER,
] as const;

/**
 * Tem como entrar em contato com esta pessoa?
 *
 * Funcao solta, e nao `.refine()` dentro do objeto, pelo mesmo motivo do
 * `precoFaltandoParaAFinalidade` em `imovel.ts`: na criacao os dois campos
 * estao presentes; na edicao parcial a conferencia tem de rodar sobre o
 * **resultado** da mesclagem com o que ja esta gravado. Mesma regra, uma
 * implementacao.
 *
 * E a validacao que `docs/data-model.md` §3.4 registra como "de aplicacao": o
 * banco aceita os dois nulos, porque nao ha como expressar "um ou outro" em
 * coluna.
 */
export function faltaFormaDeContato(valores: {
  telefone?: string | null;
  email?: string | null;
}): boolean {
  return !valores.telefone && !valores.email;
}

export const MENSAGEM_SEM_CONTATO =
  'Informe ao menos um telefone ou um e-mail: sem isso nao ha como dar retorno.';

/**
 * Os campos do lead, **sem** refinamento.
 *
 * Separado do contrato final pela armadilha anotada em `CLAUDE.md`: no Zod 4,
 * `.partial()` sobre um objeto que ja passou por `.refine()` compila e falha em
 * tempo de execucao.
 */
const camposDoLead = z.object({
  nomeCompleto: nomeDePessoaSchema,
  telefone: telefoneBrSchema.optional(),
  email: emailSchema.optional(),
  origem: z
    .enum(ORIGENS_DE_CADASTRO_MANUAL, 'Selecione a origem do contato.')
    .default(LeadSource.MANUAL),
  /**
   * Anotacao interna. **Nunca** sai na API publica.
   *
   * O limite e generoso porque e aqui que o corretor escreve o historico do
   * atendimento, e cortar isso em 500 caracteres empurraria a informacao para
   * fora do sistema — para o caderno ou para o WhatsApp dele.
   */
  observacoes: z
    .string()
    .trim()
    .max(20_000, 'Anotacao muito longa.')
    .optional(),
});

/** Cadastro manual de lead. */
export const criarLeadSchema = camposDoLead.check((ctx) => {
  if (faltaFormaDeContato(ctx.value)) {
    ctx.issues.push({
      code: 'custom',
      input: ctx.value,
      // Aponta para o telefone porque e o campo que a imobiliaria preenche
      // primeiro; a mensagem cita os dois.
      path: ['telefone'],
      message: MENSAGEM_SEM_CONTATO,
    });
  }
});
export type EntradaDeCriarLead = z.infer<typeof criarLeadSchema>;

/**
 * Edicao de lead.
 *
 * `null` apaga onde o banco aceita nulo. A coerencia "telefone ou e-mail" nao e
 * conferida aqui: quem envia `{ telefone: null }` pode ter e-mail gravado, e so
 * o servidor, com o registro em maos, sabe responder.
 *
 * `origem` fica fora: ela registra **como** o contato chegou, e isso nao muda
 * depois. Deixa-la editavel transformaria o relatorio de origem em opiniao.
 */
export const atualizarLeadSchema = camposDoLead
  .omit({ origem: true })
  .partial()
  .extend({
    telefone: telefoneBrSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    observacoes: camposDoLead.shape.observacoes.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Nenhum campo para atualizar.',
  });
export type EntradaDeAtualizarLead = z.infer<typeof atualizarLeadSchema>;

/**
 * Atribuicao e reatribuicao.
 *
 * `null` devolve o lead a **fila de nao atribuidos**, e isso e deliberado: a
 * fila nao e um estado separado, e a ausencia de responsavel
 * (`docs/data-model.md` §3.4 — "menos uma coluna para dessincronizar"). Sem
 * aceitar `null`, um lead atribuido por engano nao teria como voltar para a
 * fila, e o gerente o passaria para si mesmo so para tira-lo da frente.
 */
export const atribuirLeadSchema = z.object({
  membershipId: z
    .string()
    .length(25, 'Responsavel invalido.')
    .regex(/^[a-z0-9]+$/, 'Responsavel invalido.')
    .nullable(),
});
export type EntradaDeAtribuirLead = z.infer<typeof atribuirLeadSchema>;

/** Mudanca de etapa do atendimento. */
export const alterarStatusDoLeadSchema = z.object({
  status: z.enum(LeadStatus, 'Selecione uma situacao valida.'),
});
export type EntradaDeAlterarStatusDoLead = z.infer<
  typeof alterarStatusDoLeadSchema
>;

/**
 * Filtros da listagem de leads.
 *
 * `naoAtribuidos` e a **fila** do item B6, e nao um filtro qualquer: ela exige
 * `lead:verNaoAtribuidos`, que o `AGENT` nao tem. O servidor recusa; isto aqui
 * so descreve o pedido.
 */
export const filtrosDeLeadsSchema = z.object({
  termo: z.string().trim().max(120).optional(),
  status: z.enum(LeadStatus).optional(),
  origem: z.enum(LeadSource).optional(),
  apenasMeus: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true')
    .optional(),
  naoAtribuidos: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type FiltrosDeLeads = z.infer<typeof filtrosDeLeadsSchema>;
