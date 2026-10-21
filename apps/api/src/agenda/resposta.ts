import type { TaskStatus, VisitStatus } from '@app/shared';

/**
 * As respostas da agenda, montadas campo a campo.
 *
 * ## O recorte do cliente é a parte que importa
 *
 * **[DECIDIDO 21/10/2026]** Quem conduz uma visita a enxerga mesmo sem
 * responder pelo cliente — ele vai encontrar a pessoa. Mas o que ele recebe
 * daquele cliente é o **mínimo do encontro**: nome e telefone.
 *
 * Não recebe anotações, situação do atendimento, origem nem histórico. A
 * diferença entre "sei com quem vou me encontrar sábado" e "tenho acesso ao
 * cliente do meu colega" é exatamente esta lista de campos, e é por isso que
 * ela é montada à mão em vez de reaproveitar a resposta de lead.
 *
 * `clienteAcessivel` diz à interface se vale oferecer o link para a ficha do
 * cliente. Sem ele, a tela ofereceria um link que responde 404 — e a pessoa
 * concluiria que o sistema está quebrado, quando ele está funcionando.
 */

export type ClienteDaAgenda = {
  id: string;
  nomeCompleto: string;
  telefone: string | null;
  /** `true` quando quem consulta também responde pelo cliente. */
  acessivel: boolean;
};

export type RespostaDeVisita = {
  id: string;
  imovel: { id: string; codigo: string; titulo: string };
  cliente: ClienteDaAgenda | null;
  responsavel: { membershipId: string; nome: string };
  inicioEm: string;
  fimEm: string;
  situacao: VisitStatus;
  observacoes: string | null;
  /** `true` quando quem consulta é quem conduz a visita. */
  minha: boolean;
  criadaEm: string;
  atualizadaEm: string;
};

type VisitaCarregada = {
  id: string;
  leadId: string | null;
  assignedMemberId: string;
  startsAt: Date;
  endsAt: Date;
  status: VisitStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  property: { id: string; code: string; title: string };
  lead: {
    id: string;
    fullName: string;
    phone: string | null;
    assignedMemberId: string | null;
  } | null;
  assignedMember: { id: string; user: { name: string } };
};

export function paraRespostaDeVisita(
  visita: VisitaCarregada,
  membershipId: string,
): RespostaDeVisita {
  return {
    id: visita.id,
    imovel: {
      id: visita.property.id,
      codigo: visita.property.code,
      titulo: visita.property.title,
    },
    cliente: visita.lead
      ? {
          id: visita.lead.id,
          nomeCompleto: visita.lead.fullName,
          // O telefone entra porque a visita acontece no mundo fisico: quem
          // conduz precisa poder avisar que esta atrasado.
          telefone: visita.lead.phone,
          acessivel: visita.lead.assignedMemberId === membershipId,
        }
      : null,
    responsavel: {
      membershipId: visita.assignedMember.id,
      nome: visita.assignedMember.user.name,
    },
    inicioEm: visita.startsAt.toISOString(),
    fimEm: visita.endsAt.toISOString(),
    situacao: visita.status,
    observacoes: visita.notes,
    minha: visita.assignedMemberId === membershipId,
    criadaEm: visita.createdAt.toISOString(),
    atualizadaEm: visita.updatedAt.toISOString(),
  };
}

export type RespostaDeTarefa = {
  id: string;
  titulo: string;
  situacao: TaskStatus;
  venceEm: string | null;
  concluidaEm: string | null;
  cliente: ClienteDaAgenda | null;
  negociacao: { id: string; etapa: string } | null;
  imovel: { id: string; codigo: string; titulo: string } | null;
  responsavel: { membershipId: string; nome: string };
  minha: boolean;
  /** `true` quando o prazo passou e a tarefa continua aberta. */
  vencida: boolean;
  criadaEm: string;
  atualizadaEm: string;
};

type TarefaCarregada = {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt: Date | null;
  completedAt: Date | null;
  assignedMemberId: string;
  createdAt: Date;
  updatedAt: Date;
  lead: {
    id: string;
    fullName: string;
    phone: string | null;
    assignedMemberId: string | null;
  } | null;
  deal: { id: string; stage: { name: string } } | null;
  property: { id: string; code: string; title: string } | null;
  assignedMember: { id: string; user: { name: string } };
};

export function paraRespostaDeTarefa(
  tarefa: TarefaCarregada,
  membershipId: string,
): RespostaDeTarefa {
  return {
    id: tarefa.id,
    titulo: tarefa.title,
    situacao: tarefa.status,
    venceEm: tarefa.dueAt?.toISOString() ?? null,
    concluidaEm: tarefa.completedAt?.toISOString() ?? null,
    cliente: tarefa.lead
      ? {
          id: tarefa.lead.id,
          nomeCompleto: tarefa.lead.fullName,
          telefone: tarefa.lead.phone,
          acessivel: tarefa.lead.assignedMemberId === membershipId,
        }
      : null,
    negociacao: tarefa.deal
      ? { id: tarefa.deal.id, etapa: tarefa.deal.stage.name }
      : null,
    imovel: tarefa.property
      ? {
          id: tarefa.property.id,
          codigo: tarefa.property.code,
          titulo: tarefa.property.title,
        }
      : null,
    responsavel: {
      membershipId: tarefa.assignedMember.id,
      nome: tarefa.assignedMember.user.name,
    },
    minha: tarefa.assignedMemberId === membershipId,
    // Calculado no servidor, e nao na interface: "vencida" depende do relogio,
    // e o relogio do navegador pode estar errado ou em outro fuso. O servidor
    // tem um so.
    vencida:
      tarefa.status === 'OPEN' &&
      tarefa.dueAt !== null &&
      tarefa.dueAt.getTime() < Date.now(),
    criadaEm: tarefa.createdAt.toISOString(),
    atualizadaEm: tarefa.updatedAt.toISOString(),
  };
}
