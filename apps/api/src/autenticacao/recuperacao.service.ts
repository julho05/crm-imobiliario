import { Injectable, Logger } from '@nestjs/common';
import type { EntradaDeRedefinirSenha } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NaoEncontrado } from '../comum/nao-encontrado';
import {
  RemetenteDeEmail,
  enderecoDoSite,
  nomeDoProduto,
} from '../email/remetente-de-email';
import { SenhaService } from './senha.service';
import { SessaoService, hashDoToken } from './sessao.service';
import { gerarTokenDeUsoUnico, VALIDADE_DO_TOKEN } from './token-de-uso-unico';

/**
 * Verificacao de e-mail (A8) e recuperacao de senha (A9).
 *
 * Os dois fluxos juntos porque sao o mesmo mecanismo com consequencias
 * diferentes — ver `token-de-uso-unico.ts`. O que muda e o prazo e o que o
 * token autoriza.
 *
 * ## A regra que atravessa este arquivo
 *
 * **A resposta e identica exista o e-mail ou nao.** Vale para solicitar
 * recuperacao e para reenviar verificacao. Uma diferenca de status, de
 * mensagem ou mesmo de tempo de resposta transforma o formulario de
 * "esqueci minha senha" em consulta de quem tem conta — e, num CRM
 * imobiliario, isso e a lista de clientes do concorrente.
 */

/**
 * Resposta unica da solicitacao de recuperacao.
 *
 * Nao confirma nem nega a existencia da conta. E o texto que a tela mostra nos
 * dois casos.
 */
const RECUPERACAO_SOLICITADA =
  'Se existir uma conta com esse e-mail, enviamos as instrucoes para ele.';

@Injectable()
export class RecuperacaoService {
  private readonly logger = new Logger(RecuperacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senhas: SenhaService,
    private readonly sessoes: SessaoService,
    private readonly email: RemetenteDeEmail,
  ) {}

  // -------------------------------------------------------------------------
  // A9 — recuperacao de senha
  // -------------------------------------------------------------------------

  /**
   * Solicita a redefinicao de senha.
   *
   * Devolve **sempre** a mesma mensagem. Quando a conta nao existe, o metodo
   * simplesmente nao faz nada — e nao faz nada **em silencio**, sem log de
   * aviso que pudesse virar um oraculo para quem le o log.
   */
  async solicitarRedefinicao(email: string): Promise<{ mensagem: string }> {
    const usuario = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, status: true },
    });

    // Conta desativada tambem nao recebe: redefinir senha nao e caminho para
    // reativar acesso que foi tirado.
    if (usuario && usuario.status === 'ACTIVE') {
      const { token, tokenHash, expiresAt } = gerarTokenDeUsoUnico(
        VALIDADE_DO_TOKEN.redefinicaoDeSenha,
      );

      await this.prisma.$transaction(async (tx) => {
        // Invalida os pedidos anteriores: com varios tokens validos ao mesmo
        // tempo, um link antigo que vazou continuaria servindo depois de a
        // pessoa pedir outro.
        await tx.passwordResetToken.updateMany({
          where: { userId: usuario.id, usedAt: null },
          data: { usedAt: new Date() },
        });

        await tx.passwordResetToken.create({
          data: { userId: usuario.id, tokenHash, expiresAt },
        });
      });

      await this.enviarEmailDeRedefinicao(email, usuario.name, token);
    }

    return { mensagem: RECUPERACAO_SOLICITADA };
  }

  /**
   * Redefine a senha com o token recebido por e-mail.
   *
   * Encerra **as outras sessoes** do usuario, e isso e o ponto do item A9:
   * quem redefine a senha espera que o acesso de quem quer que estivesse
   * dentro termine ali. Sem isso, a redefinicao nao expulsa o invasor — ele
   * segue com a sessao que ja tinha, que e exatamente o motivo de a pessoa ter
   * trocado a senha.
   */
  async redefinirSenha(
    dados: EntradaDeRedefinirSenha,
  ): Promise<{ sessoesEncerradas: number }> {
    const registro = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashDoToken(dados.token) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { status: true } },
      },
    });

    if (
      !registro ||
      registro.usedAt !== null ||
      registro.expiresAt.getTime() <= Date.now() ||
      registro.user.status !== 'ACTIVE'
    ) {
      throw new NaoEncontrado();
    }

    const passwordHash = await this.senhas.gerar(dados.senha);

    await this.prisma.$transaction(async (tx) => {
      // `updateMany` com `usedAt: null` no filtro, e nao `update` por id: duas
      // requisicoes com o mesmo token chegariam as duas a verificacao acima, e
      // e aqui que o banco decide qual delas vale.
      const consumidos = await tx.passwordResetToken.updateMany({
        where: { id: registro.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (consumidos.count !== 1) {
        throw new NaoEncontrado();
      }

      await tx.user.update({
        where: { id: registro.userId },
        data: { passwordHash },
      });
    });

    // Fora da transacao de proposito: se a revogacao falhar, a senha nova ja
    // valendo e melhor do que a troca inteira desfeita. O risco oposto —
    // senha trocada e sessoes vivas — e tratado pelo log abaixo.
    const sessoesEncerradas = await this.sessoes.revogarTodasDoUsuario(
      registro.userId,
    );

    this.logger.log(
      `Senha redefinida; ${sessoesEncerradas} sessao(oes) encerrada(s)`,
    );

    return { sessoesEncerradas };
  }

  // -------------------------------------------------------------------------
  // A8 — verificacao de e-mail
  // -------------------------------------------------------------------------

  /**
   * Gera e envia o token de verificacao.
   *
   * Chamado no cadastro e no reenvio. Nao e erro pedir para quem ja verificou:
   * responde o mesmo, so nao envia nada.
   */
  async enviarVerificacao(userId: string): Promise<void> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });

    if (!usuario || usuario.emailVerifiedAt !== null) {
      return;
    }

    const { token, tokenHash, expiresAt } = gerarTokenDeUsoUnico(
      VALIDADE_DO_TOKEN.verificacaoDeEmail,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: usuario.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.emailVerificationToken.create({
        data: { userId: usuario.id, tokenHash, expiresAt },
      });
    });

    await this.enviarEmailDeVerificacao(usuario.email, usuario.name, token);
  }

  /**
   * Confirma o e-mail com o token.
   *
   * Uso unico: reutilizar o token falha, como exige o critério do item A8.
   */
  async verificarEmail(token: string): Promise<void> {
    const registro = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashDoToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (
      !registro ||
      registro.usedAt !== null ||
      registro.expiresAt.getTime() <= Date.now()
    ) {
      throw new NaoEncontrado();
    }

    await this.prisma.$transaction(async (tx) => {
      const consumidos = await tx.emailVerificationToken.updateMany({
        where: { id: registro.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (consumidos.count !== 1) {
        throw new NaoEncontrado();
      }

      await tx.user.update({
        where: { id: registro.userId },
        data: { emailVerifiedAt: new Date() },
      });
    });
  }

  private async enviarEmailDeRedefinicao(
    para: string,
    nome: string,
    token: string,
  ): Promise<void> {
    const link = `${enderecoDoSite()}/redefinir-senha/${token}`;
    const minutos = Math.round(VALIDADE_DO_TOKEN.redefinicaoDeSenha / 60);

    await this.email.enviar({
      para,
      assunto: 'Redefinicao de senha',
      corpo:
        `${nome}, recebemos um pedido para redefinir a sua senha em ` +
        `${nomeDoProduto()}.\n\n` +
        `Para escolher uma senha nova, acesse:\n${link}\n\n` +
        `O link vale por ${minutos} minutos e serve uma vez so.\n` +
        `Ao redefinir, as outras sessoes da sua conta serao encerradas.\n\n` +
        `Se nao foi voce que pediu, ignore esta mensagem: ` +
        `a sua senha continua a mesma.`,
    });
  }

  private async enviarEmailDeVerificacao(
    para: string,
    nome: string,
    token: string,
  ): Promise<void> {
    const link = `${enderecoDoSite()}/verificar-email/${token}`;
    const horas = Math.round(VALIDADE_DO_TOKEN.verificacaoDeEmail / 3600);

    await this.email.enviar({
      para,
      assunto: 'Confirme o seu e-mail',
      corpo:
        `${nome}, confirme o seu endereco de e-mail em ` +
        `${nomeDoProduto()}.\n\n` +
        `Acesse:\n${link}\n\n` +
        `O link vale por ${horas} horas.`,
    });
  }
}
