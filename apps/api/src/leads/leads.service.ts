import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  faltaFormaDeContato,
  MENSAGEM_SEM_CONTATO,
  podeFazer,
  type EntradaDeAlterarStatusDoLead,
  type EntradaDeAtribuirLead,
  type EntradaDeAtualizarLead,
  type EntradaDeCriarLead,
  type FiltrosDeLeads,
  type LeadStatus,
  type Paginacao,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { NaoEncontrado } from '../comum/nao-encontrado';
import { AutorizacaoService } from '../autorizacao/autorizacao.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';
import {
  paraRespostaDeLead,
  type DuplicataSinalizada,
  type RespostaDeLead,
} from './resposta';

/**
 * Leads — item **B5** do [roadmap.md](../../../../docs/roadmap.md).
 *
 * ## Por que este servico nao e o de imoveis com outros nomes
 *
 * Porque a matriz diz coisas diferentes sobre os dois, e a diferenca atravessa
 * tudo: `imovel:ver` e `ORG` para os quatro papeis; **`lead:ver` e `OWN` para o
 * corretor**. Tres consequencias praticas:
 *
 * 1. **A listagem recorta por responsavel** quando o escopo e `OWN`. Na de
 *    imoveis nao havia recorte nenhum — o corretor via todos.
 * 2. **O lead do colega responde 404, nao 403.** O imovel do colega devolvia
 *    403 ao ser editado, porque ele aparecia na lista e esconder seria teatro.
 *    Aqui o registro e invisivel, e um 403 entregaria a informacao que o
 *    escopo `OWN` existe para negar. Quem decide isso e o
 *    `AutorizacaoService`, pela propria matriz — nao ha lista escrita a mao.
 * 3. **A fila de nao atribuidos e inalcancavel para o corretor**, porque
 *    `lead:verNaoAtribuidos` e `false` para ele.
 *
 * ## A fila nao e um estado
 *
 * Lead sem responsavel e `assignedMemberId = null`, e nao um `status` proprio
 * (`docs/data-model.md` §3.4: "menos uma coluna para dessincronizar"). Por isso
 * atribuir aceita `null` — e como um lead volta para a fila.
 */

/** Campos sempre carregados: o que `conferir()` e a resposta precisam. */
const SELECAO_DE_LEAD = {
  id: true,
  organizationId: true,
  fullName: true,
  phone: true,
  email: true,
  source: true,
  status: true,
  notes: true,
  assignedMemberId: true,
  consentGivenAt: true,
  privacyNoticeVersion: true,
  createdAt: true,
  updatedAt: true,
  assignedMember: {
    select: {
      id: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.LeadSelect;

/** Um nome de evento por mudanca de situacao, para a auditoria responder. */
const ACAO_DE_AUDITORIA_POR_STATUS: Record<LeadStatus, string> = {
  NEW: 'lead.reaberto',
  CONTACTED: 'lead.contatado',
  QUALIFIED: 'lead.qualificado',
  DISQUALIFIED: 'lead.desqualificado',
  CONVERTED: 'lead.convertido',
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacao: AutorizacaoService,
  ) {}

  /**
   * Cadastro manual de lead.
   *
   * ## Nasce atribuido a quem cadastrou
   *
   * Para o corretor, e o que a matriz manda: `lead:criar` e `OWN`, e o
   * comentario dela diz que o resultado "nasce atribuido a si mesmo".
   *
   * Para `MANAGER` e acima, o escopo e `ORG` e a matriz nao diz onde o lead
   * cai. **[DECIDIDO 21/10/2026]** Cai com quem cadastrou, tambem. O gerente
   * que anota um lead esta quase sempre atendendo o telefone naquele instante,
   * e deixa-lo sem responsavel faria o contato que ele acabou de assumir
   * aparecer na fila como se ninguem o tivesse visto. Devolver a fila e um
   * clique (`atribuir` com `null`); descobrir dias depois que o lead ficou
   * orfao nao tem desfazer.
   */
  async criar(
    contexto: ContextoAutorizado,
    dados: EntradaDeCriarLead,
  ): Promise<{ lead: RespostaDeLead; duplicatas: DuplicataSinalizada[] }> {
    // O schema ja garantiu telefone ou e-mail na criacao.
    const duplicatas = await this.procurarDuplicatas(contexto, dados.telefone);

    const lead = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.lead.create({
        data: {
          organizationId: contexto.organizationId,
          fullName: dados.nomeCompleto,
          phone: dados.telefone,
          email: dados.email,
          source: dados.origem,
          notes: dados.observacoes,
          assignedMemberId: contexto.membershipId,
        },
        select: SELECAO_DE_LEAD,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Lead',
          entityId: criado.id,
          action: 'lead.criado',
          metadata: {
            origem: criado.source,
            // Registra que havia duplicata **no momento do cadastro**. Sem
            // isto, a pergunta "alguem foi avisado?" nao tem resposta depois.
            duplicatasSinalizadas: duplicatas.length,
          },
        },
        tx,
      );

      return criado;
    });

    return { lead: paraRespostaDeLead(lead), duplicatas };
  }

  /**
   * Lista os leads que **quem pede** pode ver, paginados.
   *
   * O recorte por responsavel nao e conveniencia: para o `AGENT` ele e a
   * propria regra de visibilidade. E por isso que o `where` sai do escopo da
   * matriz, e nao de um parametro da requisicao.
   */
  async listar(
    contexto: ContextoAutorizado,
    filtros: FiltrosDeLeads,
    paginacao: Paginacao,
  ): Promise<{
    leads: RespostaDeLead[];
    total: number;
    pagina: number;
    porPagina: number;
  }> {
    const onde: Prisma.LeadWhereInput = {
      organizationId: contexto.organizationId,
      deletedAt: null,
      // Lead anonimizado por pedido de titular sai das listas: o que restou da
      // linha existe para integridade do historico, nao para atendimento.
      anonymizedAt: null,
      ...this.recorteDeVisibilidade(contexto, filtros),
      ...(filtros.status ? { status: filtros.status } : {}),
      ...(filtros.origem ? { source: filtros.origem } : {}),
      ...(filtros.termo
        ? {
            OR: [
              { fullName: { contains: filtros.termo } },
              { phone: { contains: filtros.termo } },
              { email: { contains: filtros.termo } },
            ],
          }
        : {}),
    };

    const [registros, total] = await Promise.all([
      this.prisma.lead.findMany({
        where: onde,
        select: SELECAO_DE_LEAD,
        orderBy: { createdAt: 'desc' },
        skip: (paginacao.pagina - 1) * paginacao.porPagina,
        take: paginacao.porPagina,
      }),
      this.prisma.lead.count({ where: onde }),
    ]);

    return {
      leads: registros.map(paraRespostaDeLead),
      total,
      pagina: paginacao.pagina,
      porPagina: paginacao.porPagina,
    };
  }

  /**
   * Quantos leads esperam na fila de nao atribuidos.
   *
   * Existe como numero, e nao so como lista, porque
   * [permissions.md](../../../../docs/permissions.md) §5 registra o motivo:
   * "sem ele visivel, a fila de nao atribuidos cresce sem ninguem perceber — e
   * lead parado e venda perdida". O contador alimenta o dashboard do item B9.
   */
  async contarNaoAtribuidos(contexto: ContextoAutorizado): Promise<number> {
    return this.prisma.lead.count({
      where: {
        organizationId: contexto.organizationId,
        deletedAt: null,
        anonymizedAt: null,
        assignedMemberId: null,
      },
    });
  }

  /** Um lead. Fora do alcance de quem pede, 404 — nunca 403. */
  async ver(contexto: ContextoAutorizado, id: string): Promise<RespostaDeLead> {
    const carregado = await this.carregar(contexto, id);

    return paraRespostaDeLead(
      this.autorizacao.conferir(contexto, carregado, {
        responsavelId: carregado?.assignedMemberId ?? null,
      }),
    );
  }

  /** Edita os campos do lead. Situacao e responsavel tem rotas proprias. */
  async atualizar(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAtualizarLead,
  ): Promise<RespostaDeLead> {
    const carregado = await this.carregar(contexto, id);

    const lead = this.autorizacao.conferir(contexto, carregado, {
      responsavelId: carregado?.assignedMemberId ?? null,
    });

    this.recusarSeFicarSemFormaDeContato(lead, dados);

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.lead.update({
        where: { id: lead.id },
        data: {
          fullName: dados.nomeCompleto,
          phone: dados.telefone,
          email: dados.email,
          notes: dados.observacoes,
        },
        select: SELECAO_DE_LEAD,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Lead',
          entityId: atualizado.id,
          action: 'lead.editado',
          // Os nomes dos campos, nao os valores: o log de um lead guardaria
          // telefone e e-mail em claro, duplicando o dado pessoal que a LGPD
          // manda minimizar.
          metadata: { campos: Object.keys(dados).sort().join(',') },
        },
        tx,
      );

      return paraRespostaDeLead(atualizado);
    });
  }

  /**
   * Atribui, reatribui ou devolve a fila (`membershipId: null`).
   *
   * Exige `lead:atribuir`, que e `false` para o `AGENT`: distribuir carteira e
   * decisao de quem coordena. A guarda corta no passo 4, e e por isso que aqui
   * nao ha verificacao de papel — tentar conferir de novo duplicaria a regra em
   * dois lugares, e um dia os dois divergiriam.
   *
   * ## Por que conferir o vinculo do destinatario
   *
   * Porque `membershipId` vem do cliente. Sem conferir, daria para atribuir um
   * lead a um `Membership` de **outra organizacao** — e o nome dessa pessoa
   * passaria a aparecer na tela da organizacao que recebeu o lead. Vazamento
   * pequeno e silencioso, do tipo que ninguem procura.
   */
  async atribuir(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAtribuirLead,
  ): Promise<RespostaDeLead> {
    const carregado = await this.carregar(contexto, id);
    const lead = this.autorizacao.conferir(contexto, carregado);

    if (dados.membershipId !== null) {
      await this.recusarSeNaoForMembroAtivo(
        contexto.organizationId,
        dados.membershipId,
      );
    }

    if (lead.assignedMemberId === dados.membershipId) {
      throw new BadRequestException(
        dados.membershipId === null
          ? 'Este lead ja esta na fila de nao atribuidos.'
          : 'Este lead ja esta com essa pessoa.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.lead.update({
        where: { id: lead.id },
        data: { assignedMemberId: dados.membershipId },
        select: SELECAO_DE_LEAD,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Lead',
          entityId: lead.id,
          action:
            dados.membershipId === null
              ? 'lead.devolvidoAFila'
              : 'lead.atribuido',
          // Os dois lados da troca: "de quem para quem" e a pergunta que se faz
          // a um historico de atribuicao, e `null` aqui significa a fila.
          metadata: {
            responsavelAnterior: lead.assignedMemberId,
            responsavel: dados.membershipId,
          },
        },
        tx,
      );

      return paraRespostaDeLead(atualizado);
    });
  }

  /**
   * Muda a situacao do atendimento.
   *
   * Rota propria, e nao campo do `PATCH`, pelo mesmo motivo da publicacao de
   * imovel: "qualifiquei o lead" e um acontecimento, e a auditoria tem de
   * distingui-lo de "corrigi o telefone". Como campo de edicao, as duas coisas
   * gerariam a mesma linha, e o relatorio de conversao nao teria de onde sair.
   */
  async alterarStatus(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAlterarStatusDoLead,
  ): Promise<RespostaDeLead> {
    const carregado = await this.carregar(contexto, id);

    const lead = this.autorizacao.conferir(contexto, carregado, {
      responsavelId: carregado?.assignedMemberId ?? null,
    });

    if (lead.status === dados.status) {
      throw new BadRequestException('O lead ja esta nessa situacao.');
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.lead.update({
        where: { id: lead.id },
        data: { status: dados.status },
        select: SELECAO_DE_LEAD,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Lead',
          entityId: lead.id,
          action: ACAO_DE_AUDITORIA_POR_STATUS[dados.status],
          metadata: { statusAnterior: lead.status, status: dados.status },
        },
        tx,
      );

      return paraRespostaDeLead(atualizado);
    });
  }

  /**
   * Exclusao logica.
   *
   * `lead:excluir` e `false` para `MANAGER` e `AGENT`, e o comentario da matriz
   * diz por que: "existe para atender pedido de LGPD, nao para limpeza de
   * rotina". Quem chega aqui e `OWNER` ou `ADMIN`.
   *
   * A linha fica, com `deletedAt`. `Inquiry`, `Deal`, `Visit` e `Task` apontam
   * para ela, e apagar de verdade levaria embora o historico de negociacao — ou
   * esbarraria no `ON DELETE RESTRICT`. Atender pedido de **anonimizacao** e
   * outra coisa, e depende do parecer juridico que `docs/roadmap.md` registra
   * como pendente (item D6).
   */
  async excluir(
    contexto: ContextoAutorizado,
    id: string,
  ): Promise<{ id: string }> {
    const carregado = await this.carregar(contexto, id);
    const lead = this.autorizacao.conferir(contexto, carregado);

    return this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: { deletedAt: new Date() },
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Lead',
          entityId: lead.id,
          action: 'lead.excluido',
          // Sem nome nem telefone: o log de uma exclusao pedida por LGPD nao
          // pode ser o lugar onde o dado pessoal sobrevive.
          metadata: { origem: lead.source },
        },
        tx,
      );

      return { id: lead.id };
    });
  }

  /**
   * O recorte de visibilidade da listagem.
   *
   * Tres casos, e o terceiro e o que exige cuidado:
   *
   * - **escopo `OWN`**: so os proprios. A fila fica fora por consequencia, o
   *   que e correto — `lead:verNaoAtribuidos` e `false` para o `AGENT`.
   * - **`naoAtribuidos`**: a fila do item B6. Exige `lead:verNaoAtribuidos`, e
   *   recusa com **403** quem nao tem. Devolver lista vazia seria pior: a tela
   *   mostraria uma fila vazia como se ela existisse e estivesse em ordem.
   * - **`apenasMeus`**: conveniencia de quem tem escopo `ORG` e quer ver so a
   *   propria carteira. Para quem ja esta em `OWN` nao muda nada, e nao ha
   *   problema nisso.
   */
  private recorteDeVisibilidade(
    contexto: ContextoAutorizado,
    filtros: FiltrosDeLeads,
  ): Prisma.LeadWhereInput {
    if (filtros.naoAtribuidos) {
      if (podeFazer(contexto.papel, 'lead:verNaoAtribuidos') === false) {
        throw new ForbiddenException(
          'Seu papel nao alcanca a fila de leads nao atribuidos.',
        );
      }

      return { assignedMemberId: null };
    }

    if (contexto.escopo === 'OWN') {
      return { assignedMemberId: contexto.membershipId };
    }

    return filtros.apenasMeus
      ? { assignedMemberId: contexto.membershipId }
      : {};
  }

  /**
   * Procura leads com o mesmo telefone, **dentro do alcance de quem cadastra**.
   *
   * O alcance e o ponto. Uma busca por telefone na organizacao inteira
   * devolveria, ao corretor, o nome e o responsavel de um lead do colega — a
   * carteira dele vazando pela porta do cadastro, que e o vazamento indireto
   * que `docs/permissions.md` §8.2 manda testar.
   *
   * Entao a consulta roda sem recorte (para saber se existe) e o **resultado**
   * e filtrado pelo que a pessoa pode ver: duplicata propria vem completa,
   * duplicata de outro vem como `{ nivel: 'restrita' }`. Ver a nota em
   * `resposta.ts` sobre a troca que isso representa.
   *
   * Sem telefone nao ha o que procurar: a deteccao e por telefone, nao por
   * e-mail, porque e o indice que existe (`@@index([organizationId, phone])`) e
   * porque telefone repetido e o caso real — a mesma pessoa ligando duas vezes.
   */
  private async procurarDuplicatas(
    contexto: ContextoAutorizado,
    telefone: string | undefined,
  ): Promise<DuplicataSinalizada[]> {
    if (!telefone) {
      return [];
    }

    const candidatos = await this.prisma.lead.findMany({
      where: {
        organizationId: contexto.organizationId,
        phone: telefone,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: {
        id: true,
        fullName: true,
        assignedMemberId: true,
        createdAt: true,
        assignedMember: { select: { user: { select: { name: true } } } },
      },
      // Teto baixo de proposito: a interface mostra "ja existe contato com este
      // telefone", nao um relatorio. Carregar trinta nao ajudaria ninguem.
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    return candidatos.map((candidato) => {
      const alcanca =
        contexto.escopo === 'ORG' ||
        candidato.assignedMemberId === contexto.membershipId;

      return alcanca
        ? {
            nivel: 'visivel' as const,
            id: candidato.id,
            nomeCompleto: candidato.fullName,
            responsavel: candidato.assignedMember?.user.name ?? null,
            criadoEm: candidato.createdAt.toISOString(),
          }
        : { nivel: 'restrita' as const };
    });
  }

  /**
   * Carrega o lead para conferencia.
   *
   * Filtra por `organizationId` **e** devolve `null` para que `conferir()`
   * confira de novo: o `WHERE` protege hoje, o `conferir()` protege o dia em
   * que alguem editar esta consulta e esquecer o filtro.
   */
  private carregar(contexto: ContextoAutorizado, id: string) {
    return this.prisma.lead.findFirst({
      where: {
        id,
        organizationId: contexto.organizationId,
        deletedAt: null,
        anonymizedAt: null,
      },
      select: SELECAO_DE_LEAD,
    });
  }

  /**
   * A edicao deixaria o lead sem telefone **e** sem e-mail?
   *
   * Roda sobre a mesclagem do registro com o que veio, e nao sobre a requisicao
   * sozinha: `{ telefone: null }` e legitimo num lead que tem e-mail, e proibido
   * num que nao tem. Lead sem forma de contato nenhuma e um registro que nao
   * serve para a unica coisa que leads existem para permitir.
   */
  private recusarSeFicarSemFormaDeContato(
    lead: { phone: string | null; email: string | null },
    dados: EntradaDeAtualizarLead,
  ): void {
    const tocaEmContato = 'telefone' in dados || 'email' in dados;

    if (!tocaEmContato) {
      return;
    }

    const resultante = {
      telefone: 'telefone' in dados ? dados.telefone : lead.phone,
      email: 'email' in dados ? dados.email : lead.email,
    };

    if (faltaFormaDeContato(resultante)) {
      throw new BadRequestException({
        mensagem: 'Dados invalidos.',
        erros: [{ campo: 'telefone', mensagem: MENSAGEM_SEM_CONTATO }],
      });
    }
  }

  /**
   * O destinatario da atribuicao e membro ativo **desta** organizacao?
   *
   * Responde 404 e nao 403 para membro de outra organizacao: a resposta nao
   * deve dizer se aquele `Membership` existe em algum lugar. E o mesmo
   * raciocinio do `POST /autenticacao/organizacao-ativa`, onde o identificador
   * enviado pelo cliente e um pedido, nao uma declaracao.
   */
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
