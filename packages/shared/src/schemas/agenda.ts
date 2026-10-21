/**
 * Agenda de visitas e tarefas — item **B8** do
 * [roadmap.md](../../../../docs/roadmap.md).
 *
 * ## A visibilidade aqui tem **duas** portas, e não uma
 *
 * No funil, quem vê é quem responde pelo cliente, e ponto. Aqui há uma
 * diferença que vem do próprio banco: em `Visit` e `Task` o **responsável é
 * obrigatório** e o cliente é **opcional** — o inverso do que acontece em
 * `Deal`.
 *
 * Isso cria um caso que a regra original não resolvia: o gerente marca a visita
 * do cliente da Bianca e manda o Tiago conduzir, porque ela não pode no sábado.
 * O Tiago **precisa** ver essa visita: ele vai encontrar a pessoa.
 *
 * **[DECIDIDO 21/10/2026]** Quem é responsável pela visita a enxerga, mesmo sem
 * responder pelo cliente. O que ele recebe do cliente é o **mínimo do
 * encontro** — nome e telefone. Não recebe anotações, histórico, nem as outras
 * negociações daquela pessoa: continua sem acesso ao cliente no CRM.
 *
 * A contrapartida é que **atribuir passou a ser uma forma de revelar um
 * contato**. Por isso só `MANAGER` para cima atribui — o que a matriz já dizia
 * (§4.3, "Atribuir: ORG/ORG/ORG/—") — e toda atribuição gera linha de
 * auditoria.
 *
 * ## Datas em UTC, convertidas na borda
 *
 * `docs/data-model.md` §1 fixa isso, com o motivo: o Brasil tem fusos distintos
 * e o horário de verão pode voltar. O contrato aceita e devolve **ISO 8601 com
 * fuso**; a conversão para a hora local é da interface.
 */

import { z } from 'zod';
import { TaskStatus, VisitStatus } from '../enums';
import { idSchema } from '../primitivos';

/**
 * Instante em ISO 8601 **com fuso**.
 *
 * Exige o fuso de propósito: `"2026-10-25T14:00"` sem ele é ambíguo, e o
 * servidor teria de adivinhar — adivinhando errado duas vezes por ano, quando o
 * horário de verão muda. O navegador monta o valor com `toISOString()`, que
 * sempre inclui o `Z`.
 */
const instanteSchema = z.iso.datetime({
  offset: true,
  message: 'Data e hora invalidas.',
});

/**
 * Estados que a mudança de situação aceita.
 *
 * `SCHEDULED` fica de fora: é o estado inicial, e "voltar para agendada" uma
 * visita cancelada confundiria o histórico — o certo ali é marcar outra visita.
 */
export const SITUACOES_DE_VISITA_ALCANCAVEIS = [
  VisitStatus.CONFIRMED,
  VisitStatus.DONE,
  VisitStatus.CANCELED,
  VisitStatus.NO_SHOW,
] as const;

export type SituacaoDeVisitaAlcancavel =
  (typeof SITUACOES_DE_VISITA_ALCANCAVEIS)[number];

/**
 * Agendamento de visita.
 *
 * `imovelId` é obrigatório — visita é a alguma coisa. `clienteId` é opcional:
 * existe visita sem cliente cadastrado, do interessado que apareceu na porta.
 * `responsavelId` é opcional na entrada e obrigatório no banco: omitido, o
 * servidor atribui a quem está agendando.
 */
export const criarVisitaSchema = z
  .object({
    imovelId: idSchema,
    clienteId: idSchema.optional(),
    responsavelId: idSchema.optional(),
    inicioEm: instanteSchema,
    fimEm: instanteSchema,
    observacoes: z
      .string()
      .trim()
      .max(2000, 'Anotacao muito longa.')
      .optional(),
  })
  .refine((v) => new Date(v.fimEm) > new Date(v.inicioEm), {
    message: 'O fim da visita precisa ser depois do inicio.',
    path: ['fimEm'],
  });
export type EntradaDeCriarVisita = z.infer<typeof criarVisitaSchema>;

/**
 * Edição de visita.
 *
 * Horário e anotações. O imóvel e o cliente ficam de fora: trocar qualquer um
 * dos dois faz da visita outra visita, e o histórico de quem foi avisado de quê
 * deixaria de bater. Para mudar, cancela-se e marca-se outra.
 */
export const atualizarVisitaSchema = z
  .object({
    inicioEm: instanteSchema.optional(),
    fimEm: instanteSchema.optional(),
    observacoes: z
      .string()
      .trim()
      .max(2000, 'Anotacao muito longa.')
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Nenhum campo para atualizar.',
  })
  .refine(
    (v) =>
      // Só dá para comparar quando os dois vêm juntos. Quando vem só um, a
      // conferência roda no servidor, contra o que está gravado.
      !v.inicioEm || !v.fimEm || new Date(v.fimEm) > new Date(v.inicioEm),
    {
      message: 'O fim da visita precisa ser depois do inicio.',
      path: ['fimEm'],
    },
  );
export type EntradaDeAtualizarVisita = z.infer<typeof atualizarVisitaSchema>;

/** Mudança de situação da visita. */
export const alterarSituacaoDaVisitaSchema = z.object({
  situacao: z.enum(
    SITUACOES_DE_VISITA_ALCANCAVEIS,
    'Selecione uma situacao valida.',
  ),
});
export type EntradaDeAlterarSituacaoDaVisita = z.infer<
  typeof alterarSituacaoDaVisitaSchema
>;

/** Quem conduz a visita. Diferente do funil, **não** aceita `null`. */
export const atribuirSchema = z.object({
  membershipId: idSchema,
});
export type EntradaDeAtribuir = z.infer<typeof atribuirSchema>;

/**
 * Janela da agenda.
 *
 * `de` e `ate` são obrigatórios: uma agenda sem recorte carregaria todas as
 * visitas já marcadas, e a tela mostra um dia, uma semana ou um mês. A
 * paginação não serve aqui — a pessoa quer o período inteiro, não as primeiras
 * vinte.
 */
export const janelaDaAgendaSchema = z
  .object({
    de: instanteSchema,
    ate: instanteSchema,
    apenasMinhas: z
      .union([z.boolean(), z.literal('true'), z.literal('false')])
      .transform((v) => v === true || v === 'true')
      .optional(),
    imovelId: idSchema.optional(),
    clienteId: idSchema.optional(),
  })
  .refine((v) => new Date(v.ate) > new Date(v.de), {
    message: 'O fim do periodo precisa ser depois do inicio.',
    path: ['ate'],
  })
  .refine(
    (v) =>
      new Date(v.ate).getTime() - new Date(v.de).getTime() <=
      186 * 24 * 60 * 60 * 1000,
    {
      // Teto de ~6 meses: protege contra a consulta que pede dez anos e varre a
      // tabela. Nenhuma tela da agenda mostra mais do que um mês.
      message: 'O periodo pedido e longo demais. Consulte ate seis meses.',
      path: ['ate'],
    },
  );
export type JanelaDaAgenda = z.infer<typeof janelaDaAgendaSchema>;

/**
 * Criação de tarefa.
 *
 * Os três vínculos são opcionais e independentes: existe tarefa solta
 * ("preparar material da feira"), tarefa de cliente, de negociação e de imóvel.
 * `dueAt` opcional porque existe tarefa sem prazo.
 */
export const criarTarefaSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(3, 'Descreva a tarefa em pelo menos 3 caracteres.')
    .max(191, 'Titulo muito longo.'),
  clienteId: idSchema.optional(),
  negociacaoId: idSchema.optional(),
  imovelId: idSchema.optional(),
  responsavelId: idSchema.optional(),
  venceEm: instanteSchema.optional(),
});
export type EntradaDeCriarTarefa = z.infer<typeof criarTarefaSchema>;

/** Edição de tarefa: título e prazo. Os vínculos não mudam. */
export const atualizarTarefaSchema = z
  .object({
    titulo: z
      .string()
      .trim()
      .min(3, 'Descreva a tarefa em pelo menos 3 caracteres.')
      .max(191, 'Titulo muito longo.')
      .optional(),
    venceEm: instanteSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Nenhum campo para atualizar.',
  });
export type EntradaDeAtualizarTarefa = z.infer<typeof atualizarTarefaSchema>;

/**
 * Situação da tarefa.
 *
 * `OPEN` entra aqui, ao contrário de `SCHEDULED` nas visitas: reabrir uma
 * tarefa concluída por engano é corriqueiro e não confunde histórico nenhum.
 */
export const alterarSituacaoDaTarefaSchema = z.object({
  situacao: z.enum(TaskStatus, 'Selecione uma situacao valida.'),
});
export type EntradaDeAlterarSituacaoDaTarefa = z.infer<
  typeof alterarSituacaoDaTarefaSchema
>;

/** Filtros da lista de tarefas. */
export const filtrosDeTarefasSchema = z.object({
  situacao: z.enum(TaskStatus).optional(),
  clienteId: idSchema.optional(),
  negociacaoId: idSchema.optional(),
  apenasMinhas: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true')
    .optional(),
  /** Só as vencidas: o que deveria ter sido feito e não foi. */
  apenasVencidas: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type FiltrosDeTarefas = z.infer<typeof filtrosDeTarefasSchema>;
