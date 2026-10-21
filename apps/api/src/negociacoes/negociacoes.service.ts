import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type EntradaDeAtribuirNegociacao,
  type EntradaDeAtualizarNegociacao,
  type EntradaDeCriarNegociacao,
  type EntradaDeMoverNegociacao,
  type FiltrosDeNegociacoes,
  type Paginacao,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { NaoEncontrado } from '../comum/nao-encontrado';
import { AutorizacaoService } from '../autorizacao/autorizacao.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';
import {
  paraRespostaDeNegociacao,
  type RespostaDeEtapa,
  type RespostaDeNegociacao,
  type ResumoDaEtapa,
} from './resposta';

/**
 * Negociações — item **B7**.
 *
 * ## A regra que define este módulo
 *
 * **A visibilidade herda o lead.** Não é uma preferência de implementação: está
 * em `docs/permissions.md` §4.3 e repetida no `schema.prisma`, com o motivo —
 * "senão o funil vaza nome de cliente de colega". A negociação carrega o nome
 * do cliente, então mostrá-la a quem não alcança o lead entregaria a carteira
 * do colega por outra porta.
 *
 * Na prática, em todo lugar: o recorte da listagem filtra por
 * `lead.assignedMemberId`, e o `conferir()` recebe **o responsável do lead**
 * como `responsavelId`, nunca o da negociação.
 *
 * ## `Deal.assignedMemberId` existe, e não decide quem vê
 *
 * Ele diz quem está conduzindo o negócio — útil quando o gerente assume um
 * fechamento. Mas quem **enxerga** continua sendo quem é responsável pelo lead.
 *
 * **[DECIDIDO 21/10/2026]** Por isso atribuir a negociação a quem não é
 * responsável pelo lead é **recusado**. Permitir criaria um estado sem
 * explicação possível na tela: a pessoa apareceria como responsável por algo
 * que ela recebe 404 ao abrir. Para passar a negociação, passa-se o cliente — e
 * quem pode fazer os dois é o mesmo papel.
 */

const SELECAO_DE_NEGOCIACAO = {
  id: true,
  organizationId: true,
  leadId: true,
  stageId: true,
  assignedMemberId: true,
  expectedAmount: true,
  closedAt: true,
  lostReason: true,
  createdAt: true,
  updatedAt: true,
  stage: {
    select: {
      id: true,
      name: true,
      position: true,
      isWon: true,
      isLost: true,
    },
  },
  lead: {
    select: {
      id: true,
      fullName: true,
      status: true,
      assignedMemberId: true,
      assignedMember: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
  },
  property: { select: { id: true, code: true, title: true } },
  assignedMember: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.DealSelect;

@Injectable()
export class NegociacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacao: AutorizacaoService,
  ) {}

  /**
   * As etapas do funil da organização.
   *
   * São **linhas**, não valores de enum (decisão de 19/10/2026), semeadas na
   * criação da organização. No MVP não há tela de edição — mas a escolha de
   * tabela continua valendo, porque construir essa edição depois não exigirá
   * migração.
   */
  async listarEtapas(contexto: ContextoAutorizado): Promise<RespostaDeEtapa[]> {
    const etapas = await this.prisma.pipelineStage.findMany({
      where: { organizationId: contexto.organizationId },
      select: {
        id: true,
        name: true,
        position: true,
        isWon: true,
        isLost: true,
      },
      orderBy: { position: 'asc' },
    });

    return etapas.map((etapa) => ({
      id: etapa.id,
      nome: etapa.name,
      posicao: etapa.position,
      ganho: etapa.isWon,
      perdido: etapa.isLost,
    }));
  }

  /**
   * Abre uma negociação para um cliente.
   *
   * ## Por que confere o lead com `conferir()`
   *
   * Porque `leadId` vem do cliente. Sem a conferência, um corretor abriria
   * negociação sobre o lead de um colega — e a negociação resultante traria o
   * nome daquele cliente na resposta. Seria ler a carteira do colega
   * **escrevendo**, que é o caminho que um teste de leitura não cobre.
   *
   * O escopo que vale aqui é o de **ver lead**, e não o de criar negociação:
   * a pergunta é "esta pessoa alcança este cliente?".
   */
  async criar(
    contexto: ContextoAutorizado,
    dados: EntradaDeCriarNegociacao,
  ): Promise<RespostaDeNegociacao> {
    const lead = await this.carregarLeadAlcancavel(contexto, dados.leadId);
    const etapa = await this.resolverEtapaInicial(contexto, dados.etapaId);

    if (dados.imovelId) {
      await this.recusarSeImovelNaoForDaOrganizacao(
        contexto.organizationId,
        dados.imovelId,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const criada = await tx.deal.create({
        data: {
          organizationId: contexto.organizationId,
          leadId: lead.id,
          propertyId: dados.imovelId,
          stageId: etapa.id,
          expectedAmount: dados.valorEsperado,
          // Nasce com quem e responsavel pelo lead, e nao com quem abriu: e o
          // unico valor que mantem "quem conduz" e "quem enxerga" coerentes
          // desde o inicio.
          assignedMemberId: lead.assignedMemberId,
        },
        select: SELECAO_DE_NEGOCIACAO,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Deal',
          entityId: criada.id,
          action: 'negociacao.aberta',
          metadata: {
            leadId: lead.id,
            etapa: etapa.name,
            imovelVinculado: dados.imovelId !== undefined,
          },
        },
        tx,
      );

      return paraRespostaDeNegociacao(criada);
    });
  }

  /** Lista as negociações que quem pede alcança, paginadas. */
  async listar(
    contexto: ContextoAutorizado,
    filtros: FiltrosDeNegociacoes,
    paginacao: Paginacao,
  ): Promise<{
    negociacoes: RespostaDeNegociacao[];
    total: number;
    pagina: number;
    porPagina: number;
  }> {
    const onde = this.montarOnde(contexto, filtros);

    const [registros, total] = await Promise.all([
      this.prisma.deal.findMany({
        where: onde,
        select: SELECAO_DE_NEGOCIACAO,
        // Pela etapa e depois pela data: e a ordem em que o funil e lido, da
        // primeira coluna para a ultima.
        orderBy: [{ stage: { position: 'asc' } }, { createdAt: 'desc' }],
        skip: (paginacao.pagina - 1) * paginacao.porPagina,
        take: paginacao.porPagina,
      }),
      this.prisma.deal.count({ where: onde }),
    ]);

    return {
      negociacoes: registros.map(paraRespostaDeNegociacao),
      total,
      pagina: paginacao.pagina,
      porPagina: paginacao.porPagina,
    };
  }

  /**
   * Quantas negociações e quanto valem, por etapa.
   *
   * ## Por que no servidor
   *
   * Porque o quadro pagina por coluna. Somar no cliente daria o total da
   * página, não da etapa — um número errado de um jeito difícil de notar, que
   * a pessoa usaria para decidir onde investir o dia.
   *
   * O recorte de visibilidade é o **mesmo** da listagem: o corretor vê o total
   * dele. Um resumo que somasse a organização contaria quantas negociações os
   * colegas têm, que é informação da carteira deles.
   */
  async resumoPorEtapa(
    contexto: ContextoAutorizado,
    filtros: FiltrosDeNegociacoes,
  ): Promise<ResumoDaEtapa[]> {
    const etapas = await this.listarEtapas(contexto);

    const agregados = await this.prisma.deal.groupBy({
      by: ['stageId'],
      where: this.montarOnde(contexto, filtros),
      _count: { _all: true },
      _sum: { expectedAmount: true },
    });

    const porEtapa = new Map(agregados.map((a) => [a.stageId, a]));

    // Devolve **todas** as etapas, inclusive as vazias: o quadro precisa da
    // coluna existindo para que a pessoa possa arrastar algo para ela.
    return etapas.map((etapa) => {
      const agregado = porEtapa.get(etapa.id);

      return {
        ...etapa,
        quantidade: agregado?._count._all ?? 0,
        valorTotal: Number(agregado?._sum.expectedAmount ?? 0),
      };
    });
  }

  /** Uma negociação. Fora do alcance, 404 — nunca 403. */
  async ver(
    contexto: ContextoAutorizado,
    id: string,
  ): Promise<RespostaDeNegociacao> {
    const carregada = await this.carregar(contexto, id);

    return paraRespostaDeNegociacao(this.conferir(contexto, carregada));
  }

  /** Edita valor esperado e imóvel. Etapa e responsável têm rotas próprias. */
  async atualizar(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAtualizarNegociacao,
  ): Promise<RespostaDeNegociacao> {
    const negociacao = this.conferir(
      contexto,
      await this.carregar(contexto, id),
    );

    if (dados.imovelId) {
      await this.recusarSeImovelNaoForDaOrganizacao(
        contexto.organizationId,
        dados.imovelId,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.deal.update({
        where: { id: negociacao.id },
        data: {
          propertyId: dados.imovelId,
          expectedAmount: dados.valorEsperado,
        },
        select: SELECAO_DE_NEGOCIACAO,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Deal',
          entityId: negociacao.id,
          action: 'negociacao.editada',
          metadata: { campos: Object.keys(dados).sort().join(',') },
        },
        tx,
      );

      return paraRespostaDeNegociacao(atualizada);
    });
  }

  /**
   * Move a negociação de etapa.
   *
   * ## `closedAt` é derivado, nunca enviado
   *
   * Etapa de ganho ou de perda fecha a negociação; etapa aberta a reabre e
   * limpa o motivo da perda. Como campo editável, a interface poderia produzir
   * "fechada e na etapa de proposta", que não significa nada — e relatório
   * nenhum saberia interpretar.
   *
   * ## O motivo da perda é obrigatório
   *
   * Só na etapa de perda, e exigido aqui porque o schema não tem como saber: as
   * etapas são linhas, e `etapaId` é um identificador opaco até o servidor
   * carregá-la. É o único campo do funil que responde "por que não fechamos?",
   * e sem ele a etapa `Perdido` acumula registros que não ensinam nada.
   */
  async mover(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeMoverNegociacao,
  ): Promise<RespostaDeNegociacao> {
    const negociacao = this.conferir(
      contexto,
      await this.carregar(contexto, id),
    );

    const destino = await this.prisma.pipelineStage.findFirst({
      where: { id: dados.etapaId, organizationId: contexto.organizationId },
      select: {
        id: true,
        name: true,
        position: true,
        isWon: true,
        isLost: true,
      },
    });

    // Etapa de outra organizacao responde 404, como qualquer travessia.
    if (!destino) {
      throw new NaoEncontrado();
    }

    if (destino.id === negociacao.stageId) {
      throw new BadRequestException('A negociacao ja esta nessa etapa.');
    }

    if (destino.isLost && !dados.motivoDaPerda) {
      throw new BadRequestException({
        mensagem: 'Dados invalidos.',
        erros: [
          {
            campo: 'motivoDaPerda',
            mensagem:
              'Diga em poucas palavras por que a negociacao foi perdida.',
          },
        ],
      });
    }

    const fecha = destino.isWon || destino.isLost;

    return this.prisma.$transaction(async (tx) => {
      const movida = await tx.deal.update({
        where: { id: negociacao.id },
        data: {
          stageId: destino.id,
          closedAt: fecha ? new Date() : null,
          // O motivo acompanha a perda, e sai quando a negociacao deixa de
          // estar perdida: motivo preservado numa negociacao reaberta seria
          // uma explicacao sem fato.
          lostReason: destino.isLost ? dados.motivoDaPerda : null,
        },
        select: SELECAO_DE_NEGOCIACAO,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Deal',
          entityId: negociacao.id,
          action: destino.isWon
            ? 'negociacao.ganha'
            : destino.isLost
              ? 'negociacao.perdida'
              : 'negociacao.movida',
          metadata: {
            etapaAnterior: negociacao.stage.name,
            etapa: destino.name,
            fechada: fecha,
          },
        },
        tx,
      );

      return paraRespostaDeNegociacao(movida);
    });
  }

  /**
   * Define quem conduz a negociação.
   *
   * **[DECIDIDO 21/10/2026]** Só aceita quem é responsável pelo **lead**. A
   * razão está no topo deste arquivo: quem não alcança o lead não alcança a
   * negociação, então atribuí-la a essa pessoa criaria um responsável que
   * recebe 404 ao abrir o próprio registro. Para passar a negociação, passa-se
   * o cliente.
   */
  async atribuir(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAtribuirNegociacao,
  ): Promise<RespostaDeNegociacao> {
    const carregada = await this.carregar(contexto, id);
    // Sem `responsavelId`: `negociacao:atribuir` e false para o AGENT, entao
    // quem chega aqui tem escopo ORG e alcanca qualquer registro da
    // organizacao.
    const negociacao = this.autorizacao.conferir(contexto, carregada);

    if (
      dados.membershipId !== null &&
      dados.membershipId !== negociacao.lead.assignedMemberId
    ) {
      throw new BadRequestException(
        'A negociacao so pode ficar com quem e responsavel pelo cliente. ' +
          'Para passar a negociacao, passe o cliente primeiro.',
      );
    }

    if (negociacao.assignedMemberId === dados.membershipId) {
      throw new BadRequestException('A negociacao ja esta assim.');
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.deal.update({
        where: { id: negociacao.id },
        data: { assignedMemberId: dados.membershipId },
        select: SELECAO_DE_NEGOCIACAO,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Deal',
          entityId: negociacao.id,
          action: 'negociacao.atribuida',
          metadata: {
            responsavelAnterior: negociacao.assignedMemberId,
            responsavel: dados.membershipId,
          },
        },
        tx,
      );

      return paraRespostaDeNegociacao(atualizada);
    });
  }

  /**
   * Exclusão lógica.
   *
   * `negociacao:excluir` é `OWN` para o `MANAGER` e `ORG` para `OWNER` e
   * `ADMIN` — o único recurso em que o gerente tem escopo mais estreito que a
   * leitura. Como ele não tem negociação própria pela regra de visibilidade (a
   * visibilidade segue o lead), na prática isso o limita às negociações dos
   * leads atribuídos a ele. É o que a matriz diz, e não cabe a este serviço
   * reinterpretar.
   *
   * A linha fica: `Task` aponta para ela.
   */
  async excluir(
    contexto: ContextoAutorizado,
    id: string,
  ): Promise<{ id: string }> {
    const negociacao = this.conferir(
      contexto,
      await this.carregar(contexto, id),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id: negociacao.id },
        data: { deletedAt: new Date() },
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Deal',
          entityId: negociacao.id,
          action: 'negociacao.excluida',
          metadata: { etapa: negociacao.stage.name },
        },
        tx,
      );

      return { id: negociacao.id };
    });
  }

  /**
   * `conferir()` com o responsável **do lead**.
   *
   * Existe como método para que não haja escolha: toda chamada passa por aqui,
   * e nenhuma passa `negociacao.assignedMemberId` por engano. Essa troca seria
   * silenciosa — compilaria, funcionaria no caminho feliz, e abriria o funil do
   * colega para quem recebesse uma negociação sem receber o cliente.
   */
  private conferir<
    T extends {
      organizationId: string;
      lead: { assignedMemberId: string | null };
    },
  >(contexto: ContextoAutorizado, carregada: T | null): T {
    return this.autorizacao.conferir(contexto, carregada, {
      responsavelId: carregada?.lead.assignedMemberId ?? null,
    });
  }

  /**
   * O `where` da listagem e do resumo, para que os dois nunca divirjam.
   *
   * Se o resumo e a lista usassem recortes diferentes, o quadro mostraria
   * "Proposta: 4" numa coluna com 2 cartões — e ninguém saberia qual dos dois
   * números está certo.
   */
  private montarOnde(
    contexto: ContextoAutorizado,
    filtros: FiltrosDeNegociacoes,
  ): Prisma.DealWhereInput {
    return {
      organizationId: contexto.organizationId,
      deletedAt: null,
      // O lead excluido ou anonimizado leva a negociacao consigo: ela nao tem
      // sentido sem o cliente, e manter o cartao no funil exibiria o nome de
      // alguem que pediu exclusao.
      lead: {
        deletedAt: null,
        anonymizedAt: null,
        // **A heranca de visibilidade.** Escopo OWN ve apenas as negociacoes
        // dos leads sob sua responsabilidade.
        ...(contexto.escopo === 'OWN'
          ? { assignedMemberId: contexto.membershipId }
          : filtros.apenasMinhas
            ? { assignedMemberId: contexto.membershipId }
            : {}),
      },
      ...(filtros.etapaId ? { stageId: filtros.etapaId } : {}),
      ...(filtros.imovelId ? { propertyId: filtros.imovelId } : {}),
      ...(filtros.leadId ? { leadId: filtros.leadId } : {}),
      // Fechadas ficam fora por padrao: o funil e uma ferramenta do presente, e
      // a coluna de ganhos de dois anos cresce para sempre.
      ...(filtros.incluirFechadas ? {} : { closedAt: null }),
    };
  }

  /**
   * Carrega a negociacao para conferencia.
   *
   * ## O filtro do lead nao e repeticao da listagem
   *
   * Um teste pegou isto: sem `lead: { deletedAt: null }` aqui, a listagem
   * escondia a negociacao de um cliente excluido e a **consulta por id** ainda
   * devolvia o nome dele. Atendido um pedido de exclusao de LGPD, o nome
   * sobreviveria por essa porta — e seria a porta que ninguem olha, porque a
   * tela de listagem parecia correta.
   *
   * A regra e a mesma do `montarOnde`, e por isso vale repeti-la: as duas
   * consultas sao caminhos diferentes para o mesmo registro, e proteger apenas
   * um protege nada.
   */
  private carregar(contexto: ContextoAutorizado, id: string) {
    return this.prisma.deal.findFirst({
      where: {
        id,
        organizationId: contexto.organizationId,
        deletedAt: null,
        lead: { deletedAt: null, anonymizedAt: null },
      },
      select: SELECAO_DE_NEGOCIACAO,
    });
  }

  /**
   * Carrega o lead conferindo que quem pede o alcança.
   *
   * Usa a matriz de **lead**, e não a de negociação: a pergunta aqui é "esta
   * pessoa pode ver este cliente?". Fosse pela de negociação, um corretor
   * abriria negociação sobre lead alheio, e a resposta devolveria o nome
   * daquele cliente.
   */
  private async carregarLeadAlcancavel(
    contexto: ContextoAutorizado,
    leadId: string,
  ): Promise<{ id: string; assignedMemberId: string | null }> {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        organizationId: contexto.organizationId,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: { id: true, organizationId: true, assignedMemberId: true },
    });

    // `conferir` com o escopo desta requisicao. O `contexto.escopo` aqui e o de
    // `negociacao:criar`, que e OWN para o AGENT — o mesmo de `lead:ver`, e e
    // por isso que a conferencia vale.
    const conferido = this.autorizacao.conferir(contexto, lead, {
      responsavelId: lead?.assignedMemberId ?? null,
    });

    return { id: conferido.id, assignedMemberId: conferido.assignedMemberId };
  }

  /** A etapa pedida, ou a primeira do funil. */
  private async resolverEtapaInicial(
    contexto: ContextoAutorizado,
    etapaId: string | undefined,
  ): Promise<{ id: string; name: string }> {
    const etapa = await this.prisma.pipelineStage.findFirst({
      where: {
        organizationId: contexto.organizationId,
        ...(etapaId ? { id: etapaId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { position: 'asc' },
    });

    if (!etapa) {
      // Etapa pedida que nao existe nesta organizacao: 404, como travessia.
      // Organizacao sem etapa nenhuma seria falha do seed do cadastro, e cai
      // aqui tambem — com a mesma resposta, porque do lado de fora e o mesmo
      // "nao encontrei".
      throw new NaoEncontrado();
    }

    return etapa;
  }

  private async recusarSeImovelNaoForDaOrganizacao(
    organizationId: string,
    propertyId: string,
  ): Promise<void> {
    const imovel = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
      select: { id: true },
    });

    // 404 e nao 403: a resposta nao deve dizer se aquele imovel existe em
    // outro lugar. Note que **nao** se exige que o corretor seja responsavel
    // pelo imovel — `imovel:ver` e ORG para todos, e vincular um imovel da
    // casa a uma negociacao e justamente o trabalho dele.
    if (!imovel) {
      throw new NaoEncontrado();
    }
  }
}
