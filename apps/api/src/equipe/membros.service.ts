import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  papeisQuePodeConvidar,
  podeAgirSobreMembro,
  temAlgumAcesso,
  type EntradaDeAlterarPapel,
  type EntradaDeRemoverMembro,
  type MembershipStatus,
  type Role,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { NaoEncontrado } from '../comum/nao-encontrado';
import {
  AutorizacaoService,
  type ClienteDeEscrita,
} from '../autorizacao/autorizacao.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';

/**
 * Membros da organizacao ativa.
 *
 * ## Duas listagens, de proposito
 *
 * `listar()` nasceu para o seletor de responsavel da tela de leads (item B5):
 * nome, papel e `Membership.id`, so de quem esta ativo. **Nao devolve e-mail**,
 * e isso e deliberado: [permissions.md](../../../../docs/permissions.md) §4.4 da
 * ao `AGENT` acesso a "nome e papel" dos colegas, nao a lista de contatos da
 * equipe. Devolver e-mail ali entregaria, a qualquer corretor, a agenda interna
 * da imobiliaria — util para quem sai para a concorrencia, e inutil para a tela
 * que motivou o endpoint.
 *
 * `listarParaAdministrar()` serve a tela de equipe. Ela acrescenta e-mail,
 * data de entrada, situacao e carteira — **so** para quem administra a equipe
 * (`equipe:alterarPapel`). Para os demais papeis, devolve o mesmo recorte do
 * seletor. Foi o caminho que a nota original deste arquivo previa: endpoint
 * proprio com campos a mais, em vez de alargar o do seletor.
 *
 * ## Por que nao pagina
 *
 * Porque e a equipe de uma imobiliaria, nao uma listagem de dados. O MVP nao
 * tem convite em massa, e uma organizacao com centenas de membros nao e um caso
 * que exista hoje. Se existir, aqui e o lugar de acrescentar paginacao — e o
 * teto de `paginacaoSchema` ja esta em `@app/shared`.
 *
 * ## Remover e suspender
 *
 * Remover um membro **nao apaga** o vinculo: muda a situacao para `SUSPENDED`
 * (decisao de 30/10/2026). A auditoria e o historico apontam para o
 * `Membership`, e apaga-lo quebraria a trilha de quem fez o que. A guarda ja
 * corta o acesso de vinculo suspenso na requisicao seguinte (A6).
 */

export type MembroDaEquipe = {
  /** `Membership.id`. E a ele que as atribuicoes apontam, nunca ao `User`. */
  membershipId: string;
  nome: string;
  papel: Role;
  /** `true` quando e a propria pessoa que consultou. */
  euMesmo: boolean;
};

/** O que um membro tem atribuido e precisa de destino ao sair. */
export type Carteira = {
  imoveis: number;
  clientes: number;
  negociacoes: number;
  visitas: number;
  tarefas: number;
};

/** Os campos que so quem administra a equipe recebe. */
export type DetalhesDeAdministracao = {
  email: string;
  entrouEm: Date;
  carteira: Carteira;
  /** Calculados por `podeAgirSobreMembro`, para a tela nao repetir a regra. */
  podeAlterarPapel: boolean;
  podeRemover: boolean;
};

export type MembroParaAdministrar = MembroDaEquipe & {
  situacao: MembershipStatus;
} & Partial<DetalhesDeAdministracao>;

/**
 * O recorte do que conta como carteira, **um so** para contar e para
 * transferir.
 *
 * Se a contagem mostrada na confirmacao e a transferencia usassem filtros
 * diferentes, a tela prometeria passar 12 clientes e passaria 11 — e o 12o
 * ficaria preso a quem ja nao entra mais. Foi recorte duplicado que vazou nome
 * de cliente excluido no B7.
 *
 * - Imoveis, clientes e negociacoes: todos os que nao foram excluidos. A
 *   negociacao **acompanha o cliente** (visibilidade herda o lead, B7), entao
 *   as duas mudam juntas para o mesmo destino
 * - Visitas e tarefas: so as **pendentes**. A visita realizada e a tarefa
 *   concluida sao registro do que aconteceu, e continuam dizendo quem as fez
 */
const RECORTE_DA_CARTEIRA = {
  imoveis: { deletedAt: null } satisfies Prisma.PropertyWhereInput,
  clientes: { deletedAt: null } satisfies Prisma.LeadWhereInput,
  negociacoes: { deletedAt: null } satisfies Prisma.DealWhereInput,
  visitas: {
    status: { in: ['SCHEDULED', 'CONFIRMED'] },
  } satisfies Prisma.VisitWhereInput,
  tarefas: { status: 'OPEN' } satisfies Prisma.TaskWhereInput,
};

const CARTEIRA_VAZIA: Carteira = {
  imoveis: 0,
  clientes: 0,
  negociacoes: 0,
  visitas: 0,
  tarefas: 0,
};

@Injectable()
export class MembrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacao: AutorizacaoService,
  ) {}

  async listar(contexto: ContextoAutorizado): Promise<MembroDaEquipe[]> {
    const vinculos = await this.prisma.membership.findMany({
      where: {
        organizationId: contexto.organizationId,
        // Suspenso fica fora: ele nao pode receber lead, e oferece-lo no
        // seletor produziria um 404 que a pessoa nao teria como explicar.
        status: 'ACTIVE',
      },
      select: {
        id: true,
        role: true,
        user: { select: { name: true } },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    return vinculos.map((vinculo) => ({
      membershipId: vinculo.id,
      nome: vinculo.user.name,
      papel: vinculo.role,
      euMesmo: vinculo.id === contexto.membershipId,
    }));
  }

  /**
   * A equipe para a tela de administracao.
   *
   * Quem administra ve tambem os suspensos, porque e ali que confere quem ja
   * saiu. Quem nao administra ve so os ativos, como no seletor — o suspenso
   * nao e colega de ninguem.
   */
  async listarParaAdministrar(
    contexto: ContextoAutorizado,
  ): Promise<MembroParaAdministrar[]> {
    const administra = temAlgumAcesso(contexto.papel, 'equipe:alterarPapel');

    const vinculos = await this.prisma.membership.findMany({
      where: {
        organizationId: contexto.organizationId,
        ...(administra ? {} : { status: 'ACTIVE' as const }),
      },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ status: 'asc' }, { role: 'asc' }, { joinedAt: 'asc' }],
    });

    const carteiras = administra
      ? await this.contarCarteiras(contexto.organizationId)
      : new Map<string, Carteira>();

    return vinculos.map((vinculo) => {
      const basico = {
        membershipId: vinculo.id,
        nome: vinculo.user.name,
        papel: vinculo.role,
        situacao: vinculo.status,
        euMesmo: vinculo.id === contexto.membershipId,
      };

      // O e-mail so entra neste ramo. Montar o objeto inteiro e depois apagar
      // campos seria lista negra, que e o que o §5 do permissions.md proibe.
      if (!administra) {
        return basico;
      }

      const ativo = vinculo.status === 'ACTIVE';
      const parametros = {
        papelDoAtor: contexto.papel,
        papelDoAlvo: vinculo.role,
        ehOProprioMembro: basico.euMesmo,
      };

      return {
        ...basico,
        email: vinculo.user.email,
        entrouEm: vinculo.joinedAt,
        carteira: carteiras.get(vinculo.id) ?? { ...CARTEIRA_VAZIA },
        podeAlterarPapel:
          ativo &&
          podeAgirSobreMembro({ ...parametros, acao: 'equipe:alterarPapel' }),
        podeRemover:
          ativo &&
          podeAgirSobreMembro({ ...parametros, acao: 'equipe:removerMembro' }),
      };
    });
  }

  /**
   * Troca o papel de um membro.
   *
   * A guarda conferiu o piso (`equipe:alterarPapel`). Aqui ficam as duas
   * coisas que dependem do alvo e do corpo:
   *
   * 1. `podeAgirSobreMembro` — as tres regras inviolaveis do §4.4
   * 2. o **teto**: so se atribui papel que se poderia convidar. Sem isso, o
   *    `ADMIN` promoveria um corretor a `ADMIN`, que ele nao pode convidar — e
   *    a hierarquia do convite seria contornada em dois passos
   */
  async alterarPapel(
    contexto: ContextoAutorizado,
    membershipId: string,
    dados: EntradaDeAlterarPapel,
  ): Promise<{ membershipId: string; papel: Role }> {
    const alvo = await this.carregarAlvo(
      contexto,
      membershipId,
      'equipe:alterarPapel',
    );

    if (!papeisQuePodeConvidar(contexto.papel).includes(dados.papel)) {
      throw new ForbiddenException(
        'Seu papel nao permite atribuir esse papel a alguem.',
      );
    }

    if (alvo.role === dados.papel) {
      return { membershipId: alvo.id, papel: alvo.role };
    }

    await this.prisma.$transaction(async (tx) => {
      // As condicoes repetem o que foi conferido acima: entre a leitura e esta
      // escrita, outra requisicao pode ter mudado o papel ou removido a
      // pessoa. Quem decide e o banco.
      const atualizados = await tx.membership.updateMany({
        where: { id: alvo.id, role: alvo.role, status: 'ACTIVE' },
        data: { role: dados.papel },
      });

      if (atualizados.count !== 1) {
        throw new ConflictException(
          'Este membro mudou enquanto voce editava. Recarregue a lista.',
        );
      }

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Membership',
          entityId: alvo.id,
          action: 'membro.papelAlterado',
          metadata: { de: alvo.role, para: dados.papel },
        },
        tx,
      );
    });

    return { membershipId: alvo.id, papel: dados.papel };
  }

  /**
   * Remove um membro da equipe e passa a carteira dele adiante.
   *
   * Tudo numa transacao: suspensao, transferencia e auditoria. Transferencia
   * pela metade deixaria registro atribuido a quem nao entra mais — cliente
   * que ninguem atende, visita que ninguem conduz.
   *
   * **A suspensao vem primeiro**, dentro da transacao. O `UPDATE` trava a
   * linha do vinculo, e a insercao de um registro novo atribuido a ele (que
   * confere a chave estrangeira) espera o fim da transacao. Fica uma janela
   * estreita: uma requisicao dele que ja passou pela guarda pode gravar depois
   * do commit. O registro continua visivel a quem administra, com o nome de
   * quem saiu, e atribuivel a outra pessoa pelo caminho normal.
   */
  async remover(
    contexto: ContextoAutorizado,
    membershipId: string,
    dados: EntradaDeRemoverMembro,
  ): Promise<{ transferidos: Carteira }> {
    const alvo = await this.carregarAlvo(
      contexto,
      membershipId,
      'equipe:removerMembro',
    );

    return this.prisma.$transaction(async (tx) => {
      const suspensos = await tx.membership.updateMany({
        where: { id: alvo.id, role: alvo.role, status: 'ACTIVE' },
        data: { status: 'SUSPENDED' },
      });

      if (suspensos.count !== 1) {
        throw new ConflictException(
          'Este membro mudou enquanto voce editava. Recarregue a lista.',
        );
      }

      const carteira = await this.contarCarteiraDe(
        tx,
        contexto.organizationId,
        alvo.id,
      );
      const temCarteira = Object.values(carteira).some((n) => n > 0);

      let destino: string | null = null;

      if (temCarteira) {
        if (!dados.destinoMembershipId) {
          throw new BadRequestException({
            mensagem:
              'Escolha para quem passam os imoveis, clientes e compromissos ' +
              'desta pessoa.',
            erros: [
              {
                campo: 'destinoMembershipId',
                mensagem: 'Escolha um membro da equipe.',
              },
            ],
          });
        }

        destino = await this.conferirDestino(
          tx,
          contexto.organizationId,
          alvo.id,
          dados.destinoMembershipId,
        );

        await this.transferirCarteira(
          tx,
          contexto.organizationId,
          alvo.id,
          destino,
        );
      }

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Membership',
          entityId: alvo.id,
          action: 'membro.removido',
          metadata: { papel: alvo.role, destino, ...carteira },
        },
        tx,
      );

      return { transferidos: carteira };
    });
  }

  /**
   * Passo 5 e as regras do §4.4 para um alvo de `alterarPapel` ou `remover`.
   *
   * Membro de outra organizacao e indistinguivel de inexistente (404). Membro
   * desta organizacao que o ator nao pode tocar responde 403: quem administra
   * ja ve a lista inteira, e esconder seria teatro.
   */
  private async carregarAlvo(
    contexto: ContextoAutorizado,
    membershipId: string,
    acao: 'equipe:alterarPapel' | 'equipe:removerMembro',
  ) {
    const vinculo = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      select: { id: true, organizationId: true, role: true, status: true },
    });

    const alvo = this.autorizacao.conferir(contexto, vinculo);

    const permitido = podeAgirSobreMembro({
      papelDoAtor: contexto.papel,
      papelDoAlvo: alvo.role,
      ehOProprioMembro: alvo.id === contexto.membershipId,
      acao,
    });

    if (!permitido) {
      throw new ForbiddenException(
        alvo.id === contexto.membershipId
          ? 'Voce nao pode alterar o proprio vinculo.'
          : 'Seu papel nao permite alterar este membro.',
      );
    }

    if (alvo.status !== 'ACTIVE') {
      throw new ConflictException('Este membro ja foi removido da equipe.');
    }

    return alvo;
  }

  /**
   * O destino e membro **ativo desta** organizacao, e nao e quem esta saindo?
   *
   * 404 para todos os casos, como em `leads.service.ts`: a resposta nao deve
   * dizer se aquele `Membership` existe em outra organizacao. Roda dentro da
   * transacao para enxergar a suspensao que ela acabou de gravar — e assim
   * "transferir para si mesmo" cai no mesmo caso de "destino suspenso".
   */
  private async conferirDestino(
    tx: ClienteDeEscrita,
    organizationId: string,
    alvoId: string,
    destinoId: string,
  ): Promise<string> {
    const destino = await tx.membership.findFirst({
      where: {
        id: destinoId,
        organizationId,
        status: 'ACTIVE',
        NOT: { id: alvoId },
      },
      select: { id: true },
    });

    if (!destino) {
      throw new NaoEncontrado();
    }

    return destino.id;
  }

  private async transferirCarteira(
    tx: ClienteDeEscrita,
    organizationId: string,
    de: string,
    para: string,
  ): Promise<void> {
    const r = RECORTE_DA_CARTEIRA;

    await tx.property.updateMany({
      where: { organizationId, ownerMemberId: de, ...r.imoveis },
      data: { ownerMemberId: para },
    });
    await tx.lead.updateMany({
      where: { organizationId, assignedMemberId: de, ...r.clientes },
      data: { assignedMemberId: para },
    });
    await tx.deal.updateMany({
      where: { organizationId, assignedMemberId: de, ...r.negociacoes },
      data: { assignedMemberId: para },
    });
    await tx.visit.updateMany({
      where: { organizationId, assignedMemberId: de, ...r.visitas },
      data: { assignedMemberId: para },
    });
    await tx.task.updateMany({
      where: { organizationId, assignedMemberId: de, ...r.tarefas },
      data: { assignedMemberId: para },
    });
  }

  private async contarCarteiraDe(
    tx: ClienteDeEscrita,
    organizationId: string,
    membershipId: string,
  ): Promise<Carteira> {
    const r = RECORTE_DA_CARTEIRA;

    const [imoveis, clientes, negociacoes, visitas, tarefas] =
      await Promise.all([
        tx.property.count({
          where: { organizationId, ownerMemberId: membershipId, ...r.imoveis },
        }),
        tx.lead.count({
          where: {
            organizationId,
            assignedMemberId: membershipId,
            ...r.clientes,
          },
        }),
        tx.deal.count({
          where: {
            organizationId,
            assignedMemberId: membershipId,
            ...r.negociacoes,
          },
        }),
        tx.visit.count({
          where: {
            organizationId,
            assignedMemberId: membershipId,
            ...r.visitas,
          },
        }),
        tx.task.count({
          where: {
            organizationId,
            assignedMemberId: membershipId,
            ...r.tarefas,
          },
        }),
      ]);

    return { imoveis, clientes, negociacoes, visitas, tarefas };
  }

  /**
   * A carteira de toda a equipe, em cinco consultas agrupadas — e nao cinco
   * por membro, que seria o N+1 que o `CLAUDE.md` proibe.
   */
  private async contarCarteiras(
    organizationId: string,
  ): Promise<Map<string, Carteira>> {
    const r = RECORTE_DA_CARTEIRA;

    const [imoveis, clientes, negociacoes, visitas, tarefas] =
      await Promise.all([
        this.prisma.property.groupBy({
          by: ['ownerMemberId'],
          where: { organizationId, ownerMemberId: { not: null }, ...r.imoveis },
          _count: { _all: true },
        }),
        this.prisma.lead.groupBy({
          by: ['assignedMemberId'],
          where: {
            organizationId,
            assignedMemberId: { not: null },
            ...r.clientes,
          },
          _count: { _all: true },
        }),
        this.prisma.deal.groupBy({
          by: ['assignedMemberId'],
          where: {
            organizationId,
            assignedMemberId: { not: null },
            ...r.negociacoes,
          },
          _count: { _all: true },
        }),
        this.prisma.visit.groupBy({
          by: ['assignedMemberId'],
          where: { organizationId, ...r.visitas },
          _count: { _all: true },
        }),
        this.prisma.task.groupBy({
          by: ['assignedMemberId'],
          where: { organizationId, ...r.tarefas },
          _count: { _all: true },
        }),
      ]);

    const carteiras = new Map<string, Carteira>();

    function somar(
      membershipId: string | null,
      campo: keyof Carteira,
      quantidade: number,
    ) {
      if (membershipId === null) {
        return;
      }

      const carteira = carteiras.get(membershipId) ?? { ...CARTEIRA_VAZIA };
      carteira[campo] = quantidade;
      carteiras.set(membershipId, carteira);
    }

    for (const g of imoveis) somar(g.ownerMemberId, 'imoveis', g._count._all);
    for (const g of clientes)
      somar(g.assignedMemberId, 'clientes', g._count._all);
    for (const g of negociacoes)
      somar(g.assignedMemberId, 'negociacoes', g._count._all);
    for (const g of visitas)
      somar(g.assignedMemberId, 'visitas', g._count._all);
    for (const g of tarefas)
      somar(g.assignedMemberId, 'tarefas', g._count._all);

    return carteiras;
  }
}
