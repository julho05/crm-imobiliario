import { BadRequestException, Injectable } from '@nestjs/common';
import {
  podeFazer,
  type EntradaDeAlterarSituacaoDaVisita,
  type EntradaDeAtribuir,
  type EntradaDeAtualizarVisita,
  type EntradaDeCriarVisita,
  type JanelaDaAgenda,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { NaoEncontrado } from '../comum/nao-encontrado';
import { AutorizacaoService } from '../autorizacao/autorizacao.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';
import { paraRespostaDeVisita, type RespostaDeVisita } from './resposta';

/**
 * Visitas — item **B8**.
 *
 * ## A visibilidade tem duas portas
 *
 * No funil, quem vê é quem responde pelo cliente. Aqui há uma segunda porta, e
 * ela vem do banco: em `Visit` o **responsável é obrigatório** e o cliente é
 * **opcional** — o inverso de `Deal`.
 *
 * **[DECIDIDO 21/10/2026]** Enxerga a visita quem responde por ela **ou** quem
 * responde pelo cliente. O caso que forçou a decisão é rotina de imobiliária: o
 * gerente marca a visita do cliente da Bianca e manda o Tiago conduzir. O Tiago
 * precisa ver — ele vai encontrar a pessoa.
 *
 * O que ele recebe do cliente é o **mínimo do encontro**: nome e telefone. Não
 * recebe anotações, histórico nem as outras negociações — continua sem acesso
 * ao cliente no CRM. O recorte está em `resposta.ts`.
 *
 * A contrapartida é que **atribuir passou a revelar um contato**. Por isso só
 * `MANAGER` para cima atribui, o que a matriz já dizia (§4.3), e toda
 * atribuição gera auditoria.
 *
 * ## Por que as ações se chamam `negociacao:*`
 *
 * Porque [permissions.md](../../../../docs/permissions.md) §4.3 trata
 * `Deal`, `Visit` e `Task` como um grupo só, com uma linha de matriz para os
 * três. Inventar `visita:ver` exigiria decidir o escopo dos quatro papéis de
 * novo, e duas matrizes para a mesma regra divergem no primeiro ajuste.
 */

const SELECAO_DE_VISITA = {
  id: true,
  organizationId: true,
  leadId: true,
  assignedMemberId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  property: { select: { id: true, code: true, title: true } },
  lead: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      assignedMemberId: true,
      assignedMember: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
  },
  assignedMember: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.VisitSelect;

/** Um nome de evento por situação, para a auditoria responder perguntas. */
const ACAO_POR_SITUACAO: Record<string, string> = {
  CONFIRMED: 'visita.confirmada',
  DONE: 'visita.realizada',
  CANCELED: 'visita.cancelada',
  NO_SHOW: 'visita.naoCompareceu',
};

@Injectable()
export class VisitasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacao: AutorizacaoService,
  ) {}

  /**
   * Agenda uma visita.
   *
   * O responsável omitido vira quem está agendando. Informá-lo é atribuir, e
   * atribuir exige `negociacao:atribuir` — conferido aqui, e não por `@Exige`,
   * porque depende do corpo da requisição: a mesma rota serve para o corretor
   * marcar a própria visita e para o gerente marcar a de outro.
   */
  async criar(
    contexto: ContextoAutorizado,
    dados: EntradaDeCriarVisita,
  ): Promise<RespostaDeVisita> {
    await this.recusarSeImovelNaoForDaOrganizacao(
      contexto.organizationId,
      dados.imovelId,
    );

    // O cliente, quando informado, precisa estar ao alcance de quem agenda:
    // sem isto, o corretor marcaria visita do cliente de um colega e a
    // resposta traria o nome e o telefone daquela pessoa.
    const lead = dados.clienteId
      ? await this.carregarLeadAlcancavel(contexto, dados.clienteId)
      : null;

    const responsavelId = await this.resolverResponsavel(
      contexto,
      dados.responsavelId,
    );

    return this.prisma.$transaction(async (tx) => {
      const criada = await tx.visit.create({
        data: {
          organizationId: contexto.organizationId,
          propertyId: dados.imovelId,
          leadId: lead?.id,
          assignedMemberId: responsavelId,
          startsAt: new Date(dados.inicioEm),
          endsAt: new Date(dados.fimEm),
          notes: dados.observacoes,
        },
        select: SELECAO_DE_VISITA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Visit',
          entityId: criada.id,
          action: 'visita.agendada',
          metadata: {
            responsavel: responsavelId,
            // Registra se a visita nasceu com cliente: e o que distingue uma
            // visita de carteira de um atendimento de porta.
            comCliente: lead !== null,
            // E se ela nasceu com outra pessoa como responsavel, que e o ato
            // que revela o contato.
            atribuidaAOutro: responsavelId !== contexto.membershipId,
          },
        },
        tx,
      );

      return paraRespostaDeVisita(criada, contexto.membershipId);
    });
  }

  /**
   * As visitas de um período.
   *
   * Sem paginação, com teto de seis meses no contrato: a agenda mostra um dia,
   * uma semana ou um mês inteiros, e "as primeiras vinte do mês" não é uma
   * agenda. O teto protege contra a consulta que pede dez anos.
   */
  async listar(
    contexto: ContextoAutorizado,
    janela: JanelaDaAgenda,
  ): Promise<RespostaDeVisita[]> {
    const visitas = await this.prisma.visit.findMany({
      where: {
        organizationId: contexto.organizationId,
        startsAt: { gte: new Date(janela.de), lt: new Date(janela.ate) },
        ...(janela.imovelId ? { propertyId: janela.imovelId } : {}),
        ...(janela.clienteId ? { leadId: janela.clienteId } : {}),
        AND: [
          this.recorteDeVisibilidade(contexto, janela.apenasMinhas),
          CLIENTE_VIVO,
        ],
      },
      select: SELECAO_DE_VISITA,
      orderBy: { startsAt: 'asc' },
    });

    return visitas.map((visita) =>
      paraRespostaDeVisita(visita, contexto.membershipId),
    );
  }

  async ver(
    contexto: ContextoAutorizado,
    id: string,
  ): Promise<RespostaDeVisita> {
    const carregada = await this.carregar(contexto, id);

    return paraRespostaDeVisita(
      this.conferir(contexto, carregada),
      contexto.membershipId,
    );
  }

  /** Edita horário e anotações. Imóvel e cliente não mudam. */
  async atualizar(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAtualizarVisita,
  ): Promise<RespostaDeVisita> {
    const visita = this.conferir(contexto, await this.carregar(contexto, id));

    // A conferencia de ordem roda sobre a **mesclagem**: quem envia so o fim
    // precisa que ele seja depois do inicio gravado, e so o servidor tem o
    // registro.
    const inicio = dados.inicioEm ? new Date(dados.inicioEm) : visita.startsAt;
    const fim = dados.fimEm ? new Date(dados.fimEm) : visita.endsAt;

    if (fim <= inicio) {
      throw new BadRequestException({
        mensagem: 'Dados invalidos.',
        erros: [
          {
            campo: 'fimEm',
            mensagem: 'O fim da visita precisa ser depois do inicio.',
          },
        ],
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.visit.update({
        where: { id: visita.id },
        data: {
          startsAt: dados.inicioEm ? inicio : undefined,
          endsAt: dados.fimEm ? fim : undefined,
          notes: dados.observacoes,
        },
        select: SELECAO_DE_VISITA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Visit',
          entityId: visita.id,
          action: 'visita.remarcada',
          metadata: { campos: Object.keys(dados).sort().join(',') },
        },
        tx,
      );

      return paraRespostaDeVisita(atualizada, contexto.membershipId);
    });
  }

  /** Confirmada, realizada, cancelada ou não compareceu. */
  async alterarSituacao(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAlterarSituacaoDaVisita,
  ): Promise<RespostaDeVisita> {
    const visita = this.conferir(contexto, await this.carregar(contexto, id));

    if (visita.status === dados.situacao) {
      throw new BadRequestException('A visita ja esta nessa situacao.');
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.visit.update({
        where: { id: visita.id },
        data: { status: dados.situacao },
        select: SELECAO_DE_VISITA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Visit',
          entityId: visita.id,
          action: ACAO_POR_SITUACAO[dados.situacao],
          metadata: {
            situacaoAnterior: visita.status,
            situacao: dados.situacao,
          },
        },
        tx,
      );

      return paraRespostaDeVisita(atualizada, contexto.membershipId);
    });
  }

  /**
   * Troca quem conduz a visita.
   *
   * Exige `negociacao:atribuir`, que é `false` para o `AGENT`: a guarda corta
   * no passo 4. É aqui que a decisão de 21/10/2026 cobra o preço — atribuir uma
   * visita com cliente **revela aquele contato** a quem recebe, então o ato
   * fica com quem coordena e vai para a auditoria com os dois lados da troca.
   */
  async atribuir(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAtribuir,
  ): Promise<RespostaDeVisita> {
    const visita = this.conferir(contexto, await this.carregar(contexto, id));

    await this.recusarSeNaoForMembroAtivo(
      contexto.organizationId,
      dados.membershipId,
    );

    if (visita.assignedMemberId === dados.membershipId) {
      throw new BadRequestException('A visita ja esta com essa pessoa.');
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.visit.update({
        where: { id: visita.id },
        data: { assignedMemberId: dados.membershipId },
        select: SELECAO_DE_VISITA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Visit',
          entityId: visita.id,
          action: 'visita.atribuida',
          metadata: {
            responsavelAnterior: visita.assignedMemberId,
            responsavel: dados.membershipId,
            // O que importa auditar: se esta atribuicao deu a alguem acesso ao
            // contato de um cliente que ela nao atende.
            revelouCliente:
              visita.leadId !== null &&
              visita.lead?.assignedMemberId !== dados.membershipId,
          },
        },
        tx,
      );

      return paraRespostaDeVisita(atualizada, contexto.membershipId);
    });
  }

  /**
   * O recorte de visibilidade — **as duas portas**.
   *
   * Escopo `ORG` alcança tudo. Escopo `OWN` alcança o que é seu por
   * responsabilidade da visita **ou** por responsabilidade do cliente.
   */
  private recorteDeVisibilidade(
    contexto: ContextoAutorizado,
    apenasMinhas: boolean | undefined,
  ): Prisma.VisitWhereInput {
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

  /**
   * `conferir()` com o responsável que decide **este** caso.
   *
   * O `AutorizacaoService.conferir` compara um único identificador, e aqui há
   * duas portas. Em vez de duplicar a regra de 404 para exprimir um "ou", o
   * truque é escolher qual responsável apresentar: se quem pergunta conduz a
   * visita, é ele mesmo — e a comparação passa. Se não, apresenta-se o
   * responsável pelo cliente, e a comparação decide pela segunda porta.
   *
   * O resultado é idêntico a um `ou`, e o código de recusa continua saindo da
   * matriz, sem lista escrita à mão.
   */
  private conferir<
    T extends {
      organizationId: string;
      assignedMemberId: string;
      lead: { assignedMemberId: string | null } | null;
    },
  >(contexto: ContextoAutorizado, carregada: T | null): T {
    const conduzAVisita = carregada?.assignedMemberId === contexto.membershipId;

    return this.autorizacao.conferir(contexto, carregada, {
      responsavelId: conduzAVisita
        ? contexto.membershipId
        : (carregada?.lead?.assignedMemberId ?? null),
    });
  }

  private carregar(contexto: ContextoAutorizado, id: string) {
    return this.prisma.visit.findFirst({
      where: {
        id,
        organizationId: contexto.organizationId,
        // Mesmo filtro da listagem. As duas consultas sao caminhos diferentes
        // para o mesmo registro, e proteger apenas um protege nada — foi assim
        // que um nome de cliente excluido vazou no item B7.
        AND: [CLIENTE_VIVO],
      },
      select: SELECAO_DE_VISITA,
    });
  }

  /** O responsável pedido, ou quem está agendando. */
  private async resolverResponsavel(
    contexto: ContextoAutorizado,
    pedido: string | undefined,
  ): Promise<string> {
    if (pedido === undefined || pedido === contexto.membershipId) {
      return contexto.membershipId;
    }

    // Agendar para outra pessoa e atribuir. A guarda da rota exige apenas
    // `negociacao:criar`, que todos tem; o teto depende do corpo, e e conferido
    // aqui — o mesmo arranjo do controller de convites.
    if (podeFazer(contexto.papel, 'negociacao:atribuir') === false) {
      throw new BadRequestException(
        'Seu papel nao permite agendar visita para outra pessoa.',
      );
    }

    await this.recusarSeNaoForMembroAtivo(contexto.organizationId, pedido);

    return pedido;
  }

  private async carregarLeadAlcancavel(
    contexto: ContextoAutorizado,
    leadId: string,
  ): Promise<{ id: string }> {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        organizationId: contexto.organizationId,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: { id: true, organizationId: true, assignedMemberId: true },
    });

    const conferido = this.autorizacao.conferir(contexto, lead, {
      responsavelId: lead?.assignedMemberId ?? null,
    });

    return { id: conferido.id };
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

/**
 * "Não tem cliente, **ou** tem um cliente vivo."
 *
 * Escrito como `OR` de propósito. A forma curta — `lead: { deletedAt: null }` —
 * parece equivalente e **não é**: no Prisma, filtrar por uma relação opcional
 * exige que ela exista, então a visita sem cliente desapareceria da agenda. É o
 * tipo de engano que passa no teste do caminho feliz, porque o caso de teste
 * costuma ter cliente.
 */
const CLIENTE_VIVO: Prisma.VisitWhereInput = {
  OR: [{ leadId: null }, { lead: { deletedAt: null, anonymizedAt: null } }],
};
