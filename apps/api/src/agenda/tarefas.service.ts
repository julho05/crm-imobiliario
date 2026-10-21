import { BadRequestException, Injectable } from '@nestjs/common';
import {
  podeFazer,
  type EntradaDeAlterarSituacaoDaTarefa,
  type EntradaDeAtribuir,
  type EntradaDeAtualizarTarefa,
  type EntradaDeCriarTarefa,
  type FiltrosDeTarefas,
  type Paginacao,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { NaoEncontrado } from '../comum/nao-encontrado';
import { AutorizacaoService } from '../autorizacao/autorizacao.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';
import { paraRespostaDeTarefa, type RespostaDeTarefa } from './resposta';

/**
 * Tarefas — item **B8**.
 *
 * Mesma regra de visibilidade das visitas, e pelo mesmo motivo: em `Task` o
 * responsável é obrigatório e os vínculos são todos opcionais. Enxerga quem
 * responde pela tarefa **ou** pelo cliente ligado a ela.
 *
 * ## A tarefa solta é o caso que o modelo permite e que vale lembrar
 *
 * `leadId`, `dealId` e `propertyId` são **todos** opcionais e independentes.
 * Existe tarefa que não é sobre nada do CRM — "preparar material da feira" —, e
 * ela é visível só para quem responde por ela. É o caso que faz a segunda porta
 * ser necessária em vez de opcional.
 */

const SELECAO_DE_TAREFA = {
  id: true,
  organizationId: true,
  title: true,
  status: true,
  dueAt: true,
  completedAt: true,
  leadId: true,
  assignedMemberId: true,
  createdAt: true,
  updatedAt: true,
  lead: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      assignedMemberId: true,
    },
  },
  deal: { select: { id: true, stage: { select: { name: true } } } },
  property: { select: { id: true, code: true, title: true } },
  assignedMember: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.TaskSelect;

@Injectable()
export class TarefasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacao: AutorizacaoService,
  ) {}

  async criar(
    contexto: ContextoAutorizado,
    dados: EntradaDeCriarTarefa,
  ): Promise<RespostaDeTarefa> {
    // Cada vinculo informado precisa estar ao alcance de quem cria. Sem isto,
    // amarrar uma tarefa ao cliente de um colega devolveria o nome e o telefone
    // daquela pessoa na resposta.
    if (dados.clienteId) {
      await this.recusarSeLeadForaDoAlcance(contexto, dados.clienteId);
    }

    if (dados.negociacaoId) {
      await this.recusarSeNegociacaoForaDoAlcance(contexto, dados.negociacaoId);
    }

    if (dados.imovelId) {
      await this.recusarSeImovelNaoForDaOrganizacao(
        contexto.organizationId,
        dados.imovelId,
      );
    }

    const responsavelId = await this.resolverResponsavel(
      contexto,
      dados.responsavelId,
    );

    return this.prisma.$transaction(async (tx) => {
      const criada = await tx.task.create({
        data: {
          organizationId: contexto.organizationId,
          title: dados.titulo,
          leadId: dados.clienteId,
          dealId: dados.negociacaoId,
          propertyId: dados.imovelId,
          assignedMemberId: responsavelId,
          dueAt: dados.venceEm ? new Date(dados.venceEm) : null,
        },
        select: SELECAO_DE_TAREFA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Task',
          entityId: criada.id,
          action: 'tarefa.criada',
          metadata: {
            responsavel: responsavelId,
            comPrazo: dados.venceEm !== undefined,
            atribuidaAOutro: responsavelId !== contexto.membershipId,
          },
        },
        tx,
      );

      return paraRespostaDeTarefa(criada, contexto.membershipId);
    });
  }

  async listar(
    contexto: ContextoAutorizado,
    filtros: FiltrosDeTarefas,
    paginacao: Paginacao,
  ): Promise<{
    tarefas: RespostaDeTarefa[];
    total: number;
    pagina: number;
    porPagina: number;
  }> {
    const onde: Prisma.TaskWhereInput = {
      organizationId: contexto.organizationId,
      ...(filtros.situacao ? { status: filtros.situacao } : {}),
      ...(filtros.clienteId ? { leadId: filtros.clienteId } : {}),
      ...(filtros.negociacaoId ? { dealId: filtros.negociacaoId } : {}),
      // Vencida e **aberta com prazo no passado**: tarefa concluida depois do
      // prazo nao esta vencida, esta concluida.
      ...(filtros.apenasVencidas
        ? { status: 'OPEN', dueAt: { lt: new Date() } }
        : {}),
      AND: [
        this.recorteDeVisibilidade(contexto, filtros.apenasMinhas),
        CLIENTE_VIVO,
      ],
    };

    const [registros, total] = await Promise.all([
      this.prisma.task.findMany({
        where: onde,
        select: SELECAO_DE_TAREFA,
        // Sem prazo vai para o fim: o que tem data cobra atencao primeiro.
        orderBy: [
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (paginacao.pagina - 1) * paginacao.porPagina,
        take: paginacao.porPagina,
      }),
      this.prisma.task.count({ where: onde }),
    ]);

    return {
      tarefas: registros.map((tarefa) =>
        paraRespostaDeTarefa(tarefa, contexto.membershipId),
      ),
      total,
      pagina: paginacao.pagina,
      porPagina: paginacao.porPagina,
    };
  }

  /**
   * Quantas tarefas vencidas quem pergunta tem.
   *
   * Para o painel, pelo mesmo motivo do contador da fila de leads: o que não
   * está visível não é feito. Respeita o recorte de visibilidade, então o
   * corretor vê o número dele.
   */
  async contarVencidas(contexto: ContextoAutorizado): Promise<number> {
    return this.prisma.task.count({
      where: {
        organizationId: contexto.organizationId,
        status: 'OPEN',
        dueAt: { lt: new Date() },
        AND: [this.recorteDeVisibilidade(contexto, false), CLIENTE_VIVO],
      },
    });
  }

  async ver(
    contexto: ContextoAutorizado,
    id: string,
  ): Promise<RespostaDeTarefa> {
    const carregada = await this.carregar(contexto, id);

    return paraRespostaDeTarefa(
      this.conferir(contexto, carregada),
      contexto.membershipId,
    );
  }

  async atualizar(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAtualizarTarefa,
  ): Promise<RespostaDeTarefa> {
    const tarefa = this.conferir(contexto, await this.carregar(contexto, id));

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.task.update({
        where: { id: tarefa.id },
        data: {
          title: dados.titulo,
          dueAt:
            dados.venceEm === undefined
              ? undefined
              : dados.venceEm === null
                ? null
                : new Date(dados.venceEm),
        },
        select: SELECAO_DE_TAREFA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Task',
          entityId: tarefa.id,
          action: 'tarefa.editada',
          metadata: { campos: Object.keys(dados).sort().join(',') },
        },
        tx,
      );

      return paraRespostaDeTarefa(atualizada, contexto.membershipId);
    });
  }

  /**
   * Concluir, cancelar ou reabrir.
   *
   * `completedAt` é **derivado**, como o `closedAt` da negociação: concluir
   * marca a data, reabrir a limpa. Campo editável permitiria "aberta e
   * concluída em março", que não significa nada.
   */
  async alterarSituacao(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAlterarSituacaoDaTarefa,
  ): Promise<RespostaDeTarefa> {
    const tarefa = this.conferir(contexto, await this.carregar(contexto, id));

    if (tarefa.status === dados.situacao) {
      throw new BadRequestException('A tarefa ja esta nessa situacao.');
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.task.update({
        where: { id: tarefa.id },
        data: {
          status: dados.situacao,
          completedAt: dados.situacao === 'DONE' ? new Date() : null,
        },
        select: SELECAO_DE_TAREFA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Task',
          entityId: tarefa.id,
          action:
            dados.situacao === 'DONE'
              ? 'tarefa.concluida'
              : dados.situacao === 'CANCELED'
                ? 'tarefa.cancelada'
                : 'tarefa.reaberta',
          metadata: {
            situacaoAnterior: tarefa.status,
            situacao: dados.situacao,
          },
        },
        tx,
      );

      return paraRespostaDeTarefa(atualizada, contexto.membershipId);
    });
  }

  async atribuir(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAtribuir,
  ): Promise<RespostaDeTarefa> {
    const tarefa = this.conferir(contexto, await this.carregar(contexto, id));

    await this.recusarSeNaoForMembroAtivo(
      contexto.organizationId,
      dados.membershipId,
    );

    if (tarefa.assignedMemberId === dados.membershipId) {
      throw new BadRequestException('A tarefa ja esta com essa pessoa.');
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.task.update({
        where: { id: tarefa.id },
        data: { assignedMemberId: dados.membershipId },
        select: SELECAO_DE_TAREFA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Task',
          entityId: tarefa.id,
          action: 'tarefa.atribuida',
          metadata: {
            responsavelAnterior: tarefa.assignedMemberId,
            responsavel: dados.membershipId,
            revelouCliente:
              tarefa.leadId !== null &&
              tarefa.lead?.assignedMemberId !== dados.membershipId,
          },
        },
        tx,
      );

      return paraRespostaDeTarefa(atualizada, contexto.membershipId);
    });
  }

  /** As duas portas, como nas visitas. */
  private recorteDeVisibilidade(
    contexto: ContextoAutorizado,
    apenasMinhas: boolean | undefined,
  ): Prisma.TaskWhereInput {
    if (contexto.escopo === 'OWN') {
      return {
        OR: [
          { assignedMemberId: contexto.membershipId },
          { lead: { assignedMemberId: contexto.membershipId } },
        ],
      };
    }

    return apenasMinhas ? { assignedMemberId: contexto.membershipId } : {};
  }

  /** Ver a explicação do mesmo método em `visitas.service.ts`. */
  private conferir<
    T extends {
      organizationId: string;
      assignedMemberId: string;
      lead: { assignedMemberId: string | null } | null;
    },
  >(contexto: ContextoAutorizado, carregada: T | null): T {
    const responsavelPelaTarefa =
      carregada?.assignedMemberId === contexto.membershipId;

    return this.autorizacao.conferir(contexto, carregada, {
      responsavelId: responsavelPelaTarefa
        ? contexto.membershipId
        : (carregada?.lead?.assignedMemberId ?? null),
    });
  }

  private carregar(contexto: ContextoAutorizado, id: string) {
    return this.prisma.task.findFirst({
      where: {
        id,
        organizationId: contexto.organizationId,
        AND: [CLIENTE_VIVO],
      },
      select: SELECAO_DE_TAREFA,
    });
  }

  private async resolverResponsavel(
    contexto: ContextoAutorizado,
    pedido: string | undefined,
  ): Promise<string> {
    if (pedido === undefined || pedido === contexto.membershipId) {
      return contexto.membershipId;
    }

    if (podeFazer(contexto.papel, 'negociacao:atribuir') === false) {
      throw new BadRequestException(
        'Seu papel nao permite criar tarefa para outra pessoa.',
      );
    }

    await this.recusarSeNaoForMembroAtivo(contexto.organizationId, pedido);

    return pedido;
  }

  private async recusarSeLeadForaDoAlcance(
    contexto: ContextoAutorizado,
    leadId: string,
  ): Promise<void> {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        organizationId: contexto.organizationId,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: { id: true, organizationId: true, assignedMemberId: true },
    });

    this.autorizacao.conferir(contexto, lead, {
      responsavelId: lead?.assignedMemberId ?? null,
    });
  }

  private async recusarSeNegociacaoForaDoAlcance(
    contexto: ContextoAutorizado,
    dealId: string,
  ): Promise<void> {
    const negociacao = await this.prisma.deal.findFirst({
      where: {
        id: dealId,
        organizationId: contexto.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        lead: { select: { assignedMemberId: true } },
      },
    });

    // A negociacao herda o lead, como no item B7: a conferencia usa o
    // responsavel pelo cliente, nao o da negociacao.
    this.autorizacao.conferir(contexto, negociacao, {
      responsavelId: negociacao?.lead.assignedMemberId ?? null,
    });
  }

  private async recusarSeImovelNaoForDaOrganizacao(
    organizationId: string,
    propertyId: string,
  ): Promise<void> {
    const imovel = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
      select: { id: true },
    });

    if (!imovel) {
      throw new NaoEncontrado();
    }
  }

  private async recusarSeNaoForMembroAtivo(
    organizationId: string,
    membershipId: string,
  ): Promise<void> {
    const vinculo = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!vinculo) {
      throw new NaoEncontrado();
    }
  }
}

/** Ver a nota sobre esta forma em `visitas.service.ts`. */
const CLIENTE_VIVO: Prisma.TaskWhereInput = {
  OR: [{ leadId: null }, { lead: { deletedAt: null, anonymizedAt: null } }],
};
