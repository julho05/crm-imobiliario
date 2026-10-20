import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  papeisQuePodeConvidar,
  Role,
  type EntradaDeAceitarConvite,
  type EntradaDeConvidarMembro,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NaoEncontrado } from '../comum/nao-encontrado';
import { ehViolacaoDeUnicidade } from '../comum/erros-do-prisma';
import {
  RemetenteDeEmail,
  enderecoDoSite,
  nomeDoProduto,
} from '../email/remetente-de-email';
import { SenhaService } from '../autenticacao/senha.service';
import {
  SessaoService,
  type DadosDaRequisicao,
} from '../autenticacao/sessao.service';
import { hashDoToken } from '../autenticacao/sessao.service';
import {
  gerarTokenDeUsoUnico,
  VALIDADE_DO_TOKEN,
} from '../autenticacao/token-de-uso-unico';
import {
  AutorizacaoService,
  type ClienteDeEscrita,
} from '../autorizacao/autorizacao.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';

/**
 * Convites de membro — item A10 do [roadmap.md](../../../../docs/roadmap.md).
 *
 * E por aqui que `ADMIN`, `MANAGER` e `AGENT` passam a existir: o cadastro so
 * cria `OWNER`, e sem convite a imobiliaria com equipe nao tem como ser
 * montada.
 *
 * ## A hierarquia nao e deste arquivo
 *
 * Quem pode convidar quem esta na matriz de `@app/shared`
 * (`papeisQuePodeConvidar`), nao em `if` aqui. Este servico **consulta**. E a
 * mesma funcao que o formulario usa para montar o seletor de papel, e isso
 * importa: se divergissem, a interface ofereceria uma opcao que o servidor
 * recusa.
 *
 * ## Por que o aceite tambem mora aqui
 *
 * Porque ele escreve na mesma tabela. O aceite roda **sem** organizacao ativa
 * — a pessoa ainda nao e membro de nada — e por isso nao passa pela guarda de
 * autorizacao; a autorizacao dele e o proprio token. Separar criacao e aceite
 * em servicos diferentes espalharia as regras do `Invitation` por dois lugares.
 */

/**
 * Resposta unica para todo convite que nao serve.
 *
 * Inexistente, expirado, ja aceito e revogado respondem **isto**, sem
 * variacao. Distinguir os casos permitiria sondar tokens e descobrir, por
 * exemplo, que um convite existiu e foi aceito.
 */
const CONVITE_INVALIDO = 'Convite invalido ou expirado.';

@Injectable()
export class ConvitesService {
  private readonly logger = new Logger(ConvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacao: AutorizacaoService,
    private readonly senhas: SenhaService,
    private readonly sessoes: SessaoService,
    private readonly email: RemetenteDeEmail,
  ) {}

  /**
   * Cria o convite e envia o link.
   *
   * A guarda ja garantiu o piso: quem chega aqui pode convidar **alguem**. O
   * que ela nao consegue garantir e o teto, porque ele depende do papel do
   * convidado, que vem no corpo da requisicao — `@Exige` e estatico por rota.
   * Por isso a conferencia do papel-alvo e aqui, e e ela que impede o
   * `MANAGER` de criar um `ADMIN`.
   */
  async convidar(
    contexto: ContextoAutorizado,
    dados: EntradaDeConvidarMembro,
  ): Promise<{ id: string; email: string; papel: Role; expiresAt: Date }> {
    this.recusarSeNaoPodeConvidarEstePapel(contexto.papel, dados.papel);

    await this.recusarSeJaEMembro(contexto.organizationId, dados.email);
    await this.recusarSeJaTemConvitePendente(
      contexto.organizationId,
      dados.email,
    );

    const { token, tokenHash, expiresAt } = gerarTokenDeUsoUnico(
      VALIDADE_DO_TOKEN.convite,
    );

    let convite: { id: string };

    try {
      convite = await this.prisma.$transaction(async (tx) => {
        const criado = await tx.invitation.create({
          data: {
            organizationId: contexto.organizationId,
            email: dados.email,
            role: dados.papel,
            tokenHash,
            invitedByMembershipId: contexto.membershipId,
            expiresAt,
          },
          select: { id: true },
        });

        await this.autorizacao.registrar(
          contexto,
          {
            entityType: 'Invitation',
            entityId: criado.id,
            action: 'convite.criado',
            // O e-mail entra no log porque e o proprio objeto da acao: sem ele
            // o registro nao responde "quem foi convidado". O token, nunca.
            metadata: { email: dados.email, papel: dados.papel },
          },
          tx,
        );

        return criado;
      });
    } catch (erro) {
      // Dois convites simultaneos para o mesmo e-mail colidem no indice
      // unico. A verificacao acima da a mensagem boa; esta e a garantia.
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ConflictException(
          'Ja existe um convite pendente para este e-mail.',
        );
      }

      throw erro;
    }

    const organizacao = await this.prisma.organization.findUniqueOrThrow({
      where: { id: contexto.organizationId },
      select: { name: true },
    });

    await this.enviarEmailDeConvite(dados.email, organizacao.name, token);

    // O token **nao** volta na resposta. Quem convida nao precisa dele, e
    // devolve-lo permitiria a um `MANAGER` entrar na conta que ele criou.
    return {
      id: convite.id,
      email: dados.email,
      papel: dados.papel,
      expiresAt,
    };
  }

  /** Convites que ainda podem ser aceitos. */
  async listarPendentes(contexto: ContextoAutorizado) {
    const convites = await this.prisma.invitation.findMany({
      where: {
        organizationId: contexto.organizationId,
        acceptedAt: null,
        revokedAt: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return convites.map((convite) => ({
      id: convite.id,
      email: convite.email,
      papel: convite.role,
      expiresAt: convite.expiresAt,
      criadoEm: convite.createdAt,
      // O convite expirado continua na lista, marcado: quem administra precisa
      // ver que mandou e ninguem respondeu, para reenviar.
      expirado: convite.expiresAt.getTime() <= Date.now(),
    }));
  }

  /**
   * Revoga um convite pendente.
   *
   * Confere o papel do convite, nao so o piso da guarda: um `MANAGER` que nao
   * pode criar `ADMIN` tambem nao pode mexer no convite de um.
   */
  async revogar(contexto: ContextoAutorizado, conviteId: string) {
    const convite = await this.prisma.invitation.findUnique({
      where: { id: conviteId },
      select: {
        id: true,
        organizationId: true,
        role: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });

    // Passo 5: convite de outra organizacao e indistinguivel de inexistente.
    const autorizado = this.autorizacao.conferir(contexto, convite);

    this.recusarSeNaoPodeConvidarEstePapel(contexto.papel, autorizado.role);

    if (autorizado.acceptedAt !== null || autorizado.revokedAt !== null) {
      throw new ConflictException('Este convite nao esta mais pendente.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: autorizado.id },
        data: { revokedAt: new Date() },
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Invitation',
          entityId: autorizado.id,
          action: 'convite.revogado',
          metadata: { papel: autorizado.role },
        },
        tx,
      );
    });
  }

  /**
   * Mostra o convite a quem tem o token, antes de aceitar.
   *
   * Devolve o nome da organizacao de proposito: quem recebeu precisa saber
   * quem convidou antes de criar conta. Nao e vazamento — o token foi para a
   * caixa de entrada daquele endereco, e e ele a credencial.
   *
   * `precisaCriarConta` evita que a interface tenha de adivinhar qual
   * formulario mostrar.
   */
  async ver(token: string) {
    const convite = await this.buscarConvitePendente(token);

    const usuario = await this.prisma.user.findUnique({
      where: { email: convite.email },
      select: { id: true },
    });

    return {
      email: convite.email,
      papel: convite.role,
      organizacao: convite.organization.name,
      precisaCriarConta: usuario === null,
    };
  }

  /**
   * Aceita o convite criando a conta, e deixa a pessoa dentro.
   *
   * Tudo numa transacao: `User`, `Membership` e a baixa do convite. Falha no
   * meio nao pode deixar conta criada sem vinculo — a pessoa ficaria com uma
   * conta que nao da acesso a nada e um convite que diz que ja foi usado.
   */
  async aceitarCriandoConta(
    dados: EntradaDeAceitarConvite,
    requisicao?: DadosDaRequisicao,
  ): Promise<{ token: string; maxAgeEmSegundos: number }> {
    const convite = await this.buscarConvitePendente(dados.token);

    const jaExiste = await this.prisma.user.findUnique({
      where: { email: convite.email },
      select: { id: true },
    });

    if (jaExiste) {
      // Nao sobrescreve a senha de uma conta existente a partir de um link de
      // convite: isso seria um caminho de tomada de conta para quem
      // conseguisse convidar um endereco alheio.
      throw new ConflictException(
        'Ja existe conta para este e-mail. Entre e aceite o convite.',
      );
    }

    const passwordHash = await this.senhas.gerar(dados.senha);

    const { userId, organizationId } = await this.prisma.$transaction(
      async (tx) => {
        const usuario = await tx.user.create({
          data: {
            name: dados.nome,
            email: convite.email,
            passwordHash,
            // Quem chegou por convite provou que controla o endereco: o link
            // so existia na caixa de entrada dele. Pedir verificacao de novo
            // seria cerimonia sem ganho.
            emailVerifiedAt: new Date(),
            lastActiveOrganizationId: convite.organizationId,
          },
          select: { id: true },
        });

        const vinculo = await tx.membership.create({
          data: {
            userId: usuario.id,
            organizationId: convite.organizationId,
            role: convite.role,
          },
          select: { id: true },
        });

        await this.baixarConvite(tx, convite.id, vinculo.id, requisicao);

        return { userId: usuario.id, organizationId: convite.organizationId };
      },
    );

    const sessao = await this.sessoes.criar({
      userId,
      activeOrganizationId: organizationId,
      requisicao,
    });

    return {
      token: sessao.token,
      maxAgeEmSegundos: sessao.maxAgeEmSegundos,
    };
  }

  /**
   * Aceita o convite para quem ja tem conta.
   *
   * Exige sessao, e o e-mail da sessao tem de ser **o mesmo** do convite.
   * Sem essa conferencia, quem interceptasse um link entraria na organizacao
   * com a propria conta — o convite deixaria de ser para uma pessoa e passaria
   * a ser para quem clicasse primeiro.
   */
  async aceitarComContaExistente(
    userId: string,
    token: string,
    requisicao?: DadosDaRequisicao,
  ): Promise<{ organizationId: string }> {
    const convite = await this.buscarConvitePendente(token);

    const usuario = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    if (usuario.email !== convite.email) {
      this.logger.warn(
        'Tentativa de aceitar convite com conta de outro endereco',
      );
      // A mesma resposta de token invalido: dizer "este convite nao e seu"
      // confirmaria para quem interceptou o link que ele e valido.
      throw new NaoEncontrado();
    }

    const jaEMembro = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: convite.organizationId,
        },
      },
      select: { id: true },
    });

    if (jaEMembro) {
      throw new ConflictException('Voce ja e membro desta organizacao.');
    }

    await this.prisma.$transaction(async (tx) => {
      const vinculo = await tx.membership.create({
        data: {
          userId,
          organizationId: convite.organizationId,
          role: convite.role,
        },
        select: { id: true },
      });

      await this.baixarConvite(tx, convite.id, vinculo.id, requisicao);
    });

    // Nao troca a organizacao ativa por conta propria: a pessoa pode estar no
    // meio de algo na organizacao em que ja estava. Quem decide e ela, pelo
    // endpoint de troca (A7).
    return { organizationId: convite.organizationId };
  }

  /**
   * Marca o convite como aceito e registra a auditoria.
   *
   * O ator e o **vinculo recem-criado**: foi a propria pessoa que aceitou, e o
   * registro precisa apontar para alguem da organizacao. Quem convidou ja
   * ficou registrado em `convite.criado`.
   */
  private async baixarConvite(
    tx: ClienteDeEscrita,
    conviteId: string,
    membershipId: string,
    requisicao?: DadosDaRequisicao,
  ): Promise<void> {
    const atualizados = await tx.invitation.updateMany({
      // As condicoes repetem a verificacao de `buscarConvitePendente` de
      // proposito: entre a leitura e esta escrita, outra requisicao pode ter
      // aceito o mesmo convite. Aqui quem decide e o banco.
      where: { id: conviteId, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });

    if (atualizados.count !== 1) {
      throw new ConflictException(CONVITE_INVALIDO);
    }

    const convite = await tx.invitation.findUniqueOrThrow({
      where: { id: conviteId },
      select: { organizationId: true, role: true },
    });

    await this.autorizacao.registrar(
      {
        organizationId: convite.organizationId,
        membershipId,
        ipHash: requisicao?.ipHash,
      },
      {
        entityType: 'Membership',
        entityId: membershipId,
        action: 'convite.aceito',
        metadata: { papel: convite.role },
      },
      tx,
    );
  }

  /** Busca pelo hash do token e confere prazo, aceite e revogacao. */
  private async buscarConvitePendente(token: string) {
    const convite = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashDoToken(token) },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        organization: { select: { name: true, status: true } },
      },
    });

    if (
      !convite ||
      convite.acceptedAt !== null ||
      convite.revokedAt !== null ||
      convite.expiresAt.getTime() <= Date.now() ||
      // Organizacao suspensa nao recebe membro novo: seria entrar por uma
      // porta que a guarda de autorizacao fecha na requisicao seguinte.
      convite.organization.status !== 'ACTIVE'
    ) {
      throw new NaoEncontrado();
    }

    return convite;
  }

  private recusarSeNaoPodeConvidarEstePapel(
    papelDoAtor: Role,
    papelAlvo: Role,
  ): void {
    // `OWNER` nao e convidavel: existe exatamente um por organizacao, e trocar
    // de dono e transferencia explicita, nao convite. O schema de `@app/shared`
    // ja exclui o valor; esta linha e a defesa do servidor, para o caso de a
    // chamada vir de outro caminho.
    if (papelAlvo === Role.OWNER) {
      throw new ForbiddenException(
        'O papel de proprietario nao e convidavel. ' +
          'Para trocar de dono, use a transferencia de propriedade.',
      );
    }

    if (!papeisQuePodeConvidar(papelDoAtor).includes(papelAlvo)) {
      throw new ForbiddenException(
        'Seu papel nao permite convidar alguem com esse papel.',
      );
    }
  }

  private async recusarSeJaEMembro(
    organizationId: string,
    email: string,
  ): Promise<void> {
    const vinculo = await this.prisma.membership.findFirst({
      where: { organizationId, user: { email } },
      select: { id: true },
    });

    if (vinculo) {
      // Dizer isto nao vaza nada indevido: quem convida ja pode ver a lista de
      // membros da propria organizacao.
      throw new ConflictException('Esta pessoa ja e membro da organizacao.');
    }
  }

  private async recusarSeJaTemConvitePendente(
    organizationId: string,
    email: string,
  ): Promise<void> {
    const convite = await this.prisma.invitation.findFirst({
      where: {
        organizationId,
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (convite) {
      throw new ConflictException(
        'Ja existe um convite pendente para este e-mail. ' +
          'Revogue o anterior para enviar outro.',
      );
    }
  }

  private async enviarEmailDeConvite(
    para: string,
    nomeDaOrganizacao: string,
    token: string,
  ): Promise<void> {
    const link = `${enderecoDoSite()}/convite/${token}`;
    const dias = Math.round(VALIDADE_DO_TOKEN.convite / 86400);

    await this.email.enviar({
      para,
      assunto: `Convite para ${nomeDaOrganizacao}`,
      corpo:
        `Voce foi convidado para participar de ${nomeDaOrganizacao} ` +
        `em ${nomeDoProduto()}.\n\n` +
        `Para aceitar, acesse:\n${link}\n\n` +
        `O convite vale por ${dias} dias.\n` +
        `Se voce nao esperava este convite, ignore esta mensagem.`,
    });
  }
}
