import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ETAPAS_PADRAO_DO_FUNIL,
  Role,
  type EntradaDeCadastro,
  type EntradaDeLogin,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NaoEncontrado } from '../comum/nao-encontrado';
import { ehViolacaoDeUnicidade } from '../comum/erros-do-prisma';
import { SenhaService } from './senha.service';
import { SessaoService, type DadosDaRequisicao } from './sessao.service';

/**
 * Cadastro, login e logout.
 *
 * A entrada chega **ja validada** pelo `ZodValidationPipe` com os schemas de
 * `@app/shared`. Aqui cuidamos do que schema nao expressa: unicidade,
 * transacao e as mensagens que nao devem contar demais a quem pergunta.
 */

/**
 * Mensagem unica para toda falha de login.
 *
 * Credencial errada, e-mail inexistente e conta desativada respondem **isto**,
 * sem variacao. Distinguir "este e-mail nao existe" de "senha incorreta"
 * transforma o formulario de login em consulta de quem tem conta na
 * plataforma — para um CRM imobiliario, isso e a lista de clientes do
 * concorrente.
 */
const FALHA_DE_LOGIN = 'E-mail ou senha incorretos.';

/**
 * Mensagem do cadastro com e-mail ja existente.
 *
 * Nao da como perfeito. Confirmar que o e-mail tem conta entrega quem e
 * cliente; nao dizer nada deixa perdida a pessoa que esqueceu que ja se
 * cadastrou. Esta redacao nao confirma a existencia e oferece as duas saidas
 * uteis. A alternativa mais rigorosa — responder sucesso sempre e avisar por
 * e-mail — fica para quando houver servico de e-mail configurado.
 */
const FALHA_DE_CADASTRO =
  'Nao foi possivel criar a conta com esses dados. ' +
  'Se voce ja tem cadastro, entre ou recupere a senha.';

@Injectable()
export class AutenticacaoService {
  private readonly logger = new Logger(AutenticacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly sessoes: SessaoService,
  ) {}

  /**
   * Cria pessoa e organizacao juntas.
   *
   * Fluxo unico, por decisao de 19/10/2026: corretor autonomo e uma
   * organizacao de um membro `OWNER`, nao um tipo de conta. Nao existe
   * escolha de "sou autonomo" ou "sou imobiliaria".
   *
   * **Tudo numa transacao.** Se qualquer passo falhar, nada fica: uma
   * organizacao sem `OWNER` seria inacessivel para sempre, e um usuario sem
   * organizacao nao conseguiria entrar em lugar nenhum. A invariante "um
   * `OWNER` ativo por organizacao" nao e expressavel em constraint no MySQL
   * ([data-model.md](../../../../docs/data-model.md) §3.1), logo e esta
   * transacao que a garante.
   */
  async cadastrar(
    dados: EntradaDeCadastro,
    requisicao?: DadosDaRequisicao,
  ): Promise<{ userId: string; organizationId: string }> {
    await this.recusarSeEmailEmUso(dados.email);
    await this.recusarSeSlugEmUso(dados.slugDaOrganizacao);

    const passwordHash = await this.senhas.gerar(dados.senha);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const usuario = await tx.user.create({
          data: {
            name: dados.nome,
            email: dados.email,
            passwordHash,
          },
          select: { id: true },
        });

        const organizacao = await tx.organization.create({
          data: {
            name: dados.nomeDaOrganizacao,
            slug: dados.slugDaOrganizacao,
            // Nasce SOLO. Convidar alguem depois nao exige migrar nada: o
            // tipo so muda textos, nunca permissao (decisao 4).
            kind: 'SOLO',
          },
          select: { id: true },
        });

        const vinculo = await tx.membership.create({
          data: {
            userId: usuario.id,
            organizationId: organizacao.id,
            role: Role.OWNER,
          },
          select: { id: true },
        });

        // Etapas padrao do funil. Sem tela de edicao no MVP, mas criadas como
        // dados para que a edicao futura nao exija ALTER TABLE.
        await tx.pipelineStage.createMany({
          data: ETAPAS_PADRAO_DO_FUNIL.map((etapa) => ({
            organizationId: organizacao.id,
            name: etapa.nome,
            position: etapa.posicao,
            isWon: etapa.isWon,
            isLost: etapa.isLost,
          })),
        });

        await tx.user.update({
          where: { id: usuario.id },
          data: { lastActiveOrganizationId: organizacao.id },
        });

        await tx.activity.create({
          data: {
            organizationId: organizacao.id,
            actorMembershipId: vinculo.id,
            entityType: 'Organization',
            entityId: organizacao.id,
            action: 'organizacao.criada',
            metadata: { kind: 'SOLO', viaCadastro: true },
            ipHash: requisicao?.ipHash,
          },
        });

        return { userId: usuario.id, organizationId: organizacao.id };
      });
    } catch (erro) {
      // Corrida: duas requisicoes com o mesmo e-mail ou slug passam pelas
      // verificacoes acima e colidem no indice unico. A verificacao previa
      // existe para dar mensagem boa no caso comum; este catch e a garantia
      // real, porque so o banco decide quem chegou primeiro.
      if (ehViolacaoDeUnicidade(erro)) {
        this.logger.warn('Colisao de unicidade no cadastro');
        throw new ConflictException(FALHA_DE_CADASTRO);
      }

      throw erro;
    }
  }

  /**
   * Autentica e abre sessao.
   *
   * O custo de tempo e pago **sempre**, exista o e-mail ou nao: sem isso, a
   * resposta para e-mail inexistente volta visivelmente mais rapido, e a
   * diferenca permite enumerar contas mesmo com as mensagens identicas.
   */
  async entrar(
    dados: EntradaDeLogin,
    requisicao?: DadosDaRequisicao,
  ): Promise<{ token: string; maxAgeEmSegundos: number; userId: string }> {
    const usuario = await this.prisma.user.findUnique({
      where: { email: dados.email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        lastActiveOrganizationId: true,
      },
    });

    if (!usuario) {
      await this.senhas.gastarTempoComoSeConferisse(dados.senha);
      throw new UnauthorizedException(FALHA_DE_LOGIN);
    }

    const senhaConfere = await this.senhas.conferir(
      usuario.passwordHash,
      dados.senha,
    );

    if (!senhaConfere) {
      throw new UnauthorizedException(FALHA_DE_LOGIN);
    }

    // Conta desativada responde igual a senha errada. Dizer "sua conta esta
    // desativada" confirmaria que a conta existe.
    if (usuario.status !== 'ACTIVE') {
      throw new UnauthorizedException(FALHA_DE_LOGIN);
    }

    const organizacaoAtiva = await this.escolherOrganizacaoAtiva(
      usuario.id,
      usuario.lastActiveOrganizationId,
    );

    const sessao = await this.sessoes.criar({
      userId: usuario.id,
      activeOrganizationId: organizacaoAtiva,
      permanecerConectado: dados.permanecerConectado,
      requisicao,
    });

    return {
      token: sessao.token,
      maxAgeEmSegundos: sessao.maxAgeEmSegundos,
      userId: usuario.id,
    };
  }

  async sair(sessaoId: string): Promise<void> {
    await this.sessoes.revogar(sessaoId);
  }

  /**
   * As organizacoes em que a pessoa pode entrar.
   *
   * Lista apenas vinculo **ativo** em organizacao **ativa**, pelo mesmo
   * critterio do passo 3 de [permissions.md](../../../../docs/permissions.md)
   * §6. Organizacao de que a pessoa foi suspensa nao aparece: se aparecesse,
   * ela escolheria e levaria 404 na tela seguinte, sem entender por que.
   *
   * Devolve o `Membership.id` junto porque e dele que o cliente precisa para
   * reconhecer o que e seu numa lista — o `userId` nao serve para isso, ja que
   * atribuicao aponta para o vinculo.
   */
  async organizacoesDoUsuario(userId: string) {
    const vinculos = await this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      select: {
        id: true,
        role: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { organization: { name: 'asc' } },
    });

    return vinculos.map((vinculo) => ({
      organizationId: vinculo.organization.id,
      nome: vinculo.organization.name,
      slug: vinculo.organization.slug,
      papel: vinculo.role,
      membershipId: vinculo.id,
    }));
  }

  /**
   * Troca a organizacao ativa **na sessao**, do lado do servidor.
   *
   * E este metodo que torna o item A7 possivel sem abrir brecha: o cliente
   * envia para qual organizacao quer ir, e o servidor confere o vinculo antes
   * de gravar. A diferenca em relacao a confiar no `organizationId` do corpo
   * da requisicao e toda: ali o cliente **declara** em nome de quem age; aqui
   * ele **pede** e o servidor decide.
   *
   * Sem vinculo, com vinculo suspenso, com a organizacao suspensa ou com
   * organizacao inexistente: **404**, com o mesmo corpo nos quatro casos. Um
   * 403 confirmaria que aquela organizacao existe, e este endpoint aceita
   * identificador arbitrario — seria um consultor de existencia de
   * organizacoes para quem tem qualquer conta.
   */
  async trocarOrganizacaoAtiva(
    sessaoId: string,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const vinculo = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { status: true, organization: { select: { status: true } } },
    });

    if (
      !vinculo ||
      vinculo.status !== 'ACTIVE' ||
      vinculo.organization.status !== 'ACTIVE'
    ) {
      throw new NaoEncontrado();
    }

    await this.sessoes.definirOrganizacaoAtiva(sessaoId, organizationId);

    // Conveniencia de interface, para o proximo login cair na mesma
    // organizacao. Nunca e fonte de autorizacao — ver `escolherOrganizacaoAtiva`.
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveOrganizationId: organizationId },
    });
  }

  /**
   * Escolhe a organizacao ativa no login.
   *
   * `User.lastActiveOrganizationId` e **conveniencia de interface**, nunca
   * fonte de autorizacao: ele e revalidado aqui contra um `Membership` ativo.
   * Se o vinculo tiver sido suspenso ou removido desde o ultimo acesso, a
   * sugestao e descartada.
   *
   * Com um unico vinculo, entra direto nele — o corretor autonomo nao deve
   * passar por tela de escolha com uma opcao so. Com varios e nenhuma
   * sugestao valida, devolve `null` e a interface pede para escolher.
   */
  private async escolherOrganizacaoAtiva(
    userId: string,
    sugestao: string | null,
  ): Promise<string | null> {
    const vinculos = await this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      select: { organizationId: true },
      orderBy: { joinedAt: 'asc' },
    });

    if (vinculos.length === 0) {
      return null;
    }

    if (sugestao && vinculos.some((v) => v.organizationId === sugestao)) {
      return sugestao;
    }

    return vinculos.length === 1 ? vinculos[0].organizationId : null;
  }

  private async recusarSeEmailEmUso(email: string): Promise<void> {
    const existe = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existe) {
      throw new ConflictException(FALHA_DE_CADASTRO);
    }
  }

  /**
   * Confere o slug contra **duas** tabelas.
   *
   * `OrganizationSlugHistory` guarda os slugs que ainda redirecionam para
   * outra organizacao (decisao de 19/10/2026). Permitir adotar um deles faria
   * o redirecionamento passar a apontar para o concorrente — pior do que o
   * erro 404 que ele veio evitar.
   */
  private async recusarSeSlugEmUso(slug: string): Promise<void> {
    const [atual, historico] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { slug },
        select: { id: true },
      }),
      this.prisma.organizationSlugHistory.findUnique({
        where: { slug },
        select: { id: true },
      }),
    ]);

    if (atual || historico) {
      throw new ConflictException(
        'Este endereco publico ja esta em uso. Escolha outro.',
      );
    }
  }
}
