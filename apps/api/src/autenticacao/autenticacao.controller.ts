import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  cadastroSchema,
  loginSchema,
  redefinirSenhaSchema,
  solicitarRecuperacaoSchema,
  tokenDeUsoUnicoSchema,
  trocarOrganizacaoAtivaSchema,
  type EntradaDeCadastro,
  type EntradaDeLogin,
  type EntradaDeRedefinirSenha,
  type EntradaDeSolicitarRecuperacao,
  type EntradaDeTokenDeUsoUnico,
  type EntradaDeTrocarOrganizacaoAtiva,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { hashDeIp } from '../comum/hash-de-ip';
import { AutenticacaoService } from './autenticacao.service';
import { RecuperacaoService } from './recuperacao.service';
import { NOME_DO_COOKIE_DE_SESSAO, opcoesDoCookieDeSessao } from './cookie';
import { SessaoGuard, type RequisicaoAutenticada } from './sessao.guard';
import { SessaoService } from './sessao.service';

/**
 * Rotas de autenticacao.
 *
 * Nenhuma resposta devolve o token de sessao no corpo. Ele sai **apenas** no
 * cookie `httpOnly`: token em JSON seria lido por JavaScript da pagina, o que
 * desfaz justamente a protecao que o `httpOnly` existe para dar.
 */
@Controller('autenticacao')
export class AutenticacaoController {
  private readonly logger = new Logger(AutenticacaoController.name);

  constructor(
    private readonly autenticacao: AutenticacaoService,
    private readonly sessoes: SessaoService,
    private readonly recuperacao: RecuperacaoService,
  ) {}

  @Post('cadastro')
  @HttpCode(201)
  async cadastrar(
    @Body(new ZodValidationPipe(cadastroSchema)) dados: EntradaDeCadastro,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ) {
    const contexto = contextoDaRequisicao(requisicao);

    const { userId } = await this.autenticacao.cadastrar(dados, contexto);

    // Entra direto apos o cadastro: pedir login em seguida e atrito sem ganho
    // de seguranca, ja que a pessoa acabou de provar que tem a senha.
    const sessao = await this.autenticacao.entrar(
      { email: dados.email, senha: dados.senha, permanecerConectado: false },
      contexto,
    );

    gravarCookieDeSessao(resposta, sessao.token, sessao.maxAgeEmSegundos);

    // Verificacao de e-mail (A8), depois de gravar o cookie: a pessoa entra no
    // painel exista ou nao a confirmacao, e nada no MVP depende dela.
    //
    // A falha e engolida de proposito. Uma indisponibilidade do provedor de
    // e-mail derrubaria o cadastro inteiro — conta criada, sessao aberta e
    // resposta de erro —, e o caminho de recuperacao disso e pior do que um
    // e-mail nao confirmado: existe reenvio, e a conta ja funciona.
    try {
      await this.recuperacao.enviarVerificacao(userId);
    } catch (erro) {
      this.logger.error(
        `Cadastro feito, mas a verificacao de e-mail nao saiu: ` +
          `${(erro as Error).message}`,
      );
    }

    return { userId };
  }

  @Post('entrar')
  @HttpCode(200)
  async entrar(
    @Body(new ZodValidationPipe(loginSchema)) dados: EntradaDeLogin,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ) {
    const sessao = await this.autenticacao.entrar(
      dados,
      contextoDaRequisicao(requisicao),
    );

    gravarCookieDeSessao(resposta, sessao.token, sessao.maxAgeEmSegundos);

    return { ok: true };
  }

  @Post('sair')
  @HttpCode(200)
  @UseGuards(SessaoGuard)
  async sair(
    @Req() requisicao: RequisicaoAutenticada,
    @Res({ passthrough: true }) resposta: Response,
  ) {
    await this.autenticacao.sair(requisicao.sessao.id);

    // Revogar no servidor e o que encerra a sessao. Limpar o cookie e
    // arrumacao do navegador: sem a revogacao, um cookie copiado antes
    // continuaria valendo.
    resposta.clearCookie(NOME_DO_COOKIE_DE_SESSAO, opcoesDoCookieDeSessao());

    return { ok: true };
  }

  /**
   * Solicita a redefinicao de senha.
   *
   * Responde **200 com a mesma mensagem** exista o e-mail ou nao. Distinguir
   * os casos transformaria este formulario em consulta de quem tem conta.
   */
  @Post('recuperacao')
  @HttpCode(200)
  solicitarRecuperacao(
    @Body(new ZodValidationPipe(solicitarRecuperacaoSchema))
    dados: EntradaDeSolicitarRecuperacao,
  ) {
    return this.recuperacao.solicitarRedefinicao(dados.email);
  }

  /**
   * Redefine a senha com o token do e-mail.
   *
   * Encerra as outras sessoes do usuario: quem redefine espera que o acesso de
   * quem estivesse dentro termine ali.
   */
  @Post('senha/redefinir')
  @HttpCode(200)
  async redefinirSenha(
    @Body(new ZodValidationPipe(redefinirSenhaSchema))
    dados: EntradaDeRedefinirSenha,
  ) {
    const { sessoesEncerradas } = await this.recuperacao.redefinirSenha(dados);

    return { ok: true, sessoesEncerradas };
  }

  /** Confirma o e-mail com o token recebido. Uso unico. */
  @Post('email/verificar')
  @HttpCode(200)
  async verificarEmail(
    @Body(new ZodValidationPipe(tokenDeUsoUnicoSchema))
    dados: EntradaDeTokenDeUsoUnico,
  ) {
    await this.recuperacao.verificarEmail(dados.token);

    return { ok: true };
  }

  /**
   * Reenvia a verificacao de e-mail para a conta da sessao.
   *
   * Nao recebe endereco: ele vem da sessao. Aceitar um e-mail no corpo faria
   * desta rota um disparador de mensagem para endereco alheio.
   */
  @Post('email/reenviar-verificacao')
  @HttpCode(200)
  @UseGuards(SessaoGuard)
  async reenviarVerificacao(@Req() requisicao: RequisicaoAutenticada) {
    await this.recuperacao.enviarVerificacao(requisicao.sessao.userId);

    return { ok: true };
  }

  /**
   * Quem sou eu. Serve ao site para decidir entre painel e tela de login.
   *
   * Devolve o minimo: identificadores e validade. **Sem papel e sem
   * permissoes**, de proposito — quem precisa decidir o que mostrar na tela usa
   * `GET /autenticacao/organizacoes`, que ja traz o papel de cada vinculo. E
   * quem decide o que **pode** e sempre o servidor, na guarda de autorizacao.
   */
  /**
   * As organizacoes em que a pessoa pode entrar, com a ativa marcada.
   *
   * Serve ao seletor de organizacao do painel. Quem tem um unico vinculo nao
   * precisa de seletor, mas a rota responde igual — e a interface que decide
   * esconder o controle, nao a API que muda de forma.
   */
  @Get('organizacoes')
  @UseGuards(SessaoGuard)
  async organizacoes(@Req() requisicao: RequisicaoAutenticada) {
    const organizacoes = await this.autenticacao.organizacoesDoUsuario(
      requisicao.sessao.userId,
    );

    return {
      organizacoes: organizacoes.map((organizacao) => ({
        ...organizacao,
        ativa:
          organizacao.organizationId === requisicao.sessao.activeOrganizationId,
      })),
    };
  }

  /**
   * Troca a organizacao ativa.
   *
   * O `organizationId` do corpo e um **pedido**, nao uma declaracao: o
   * servidor confere o vinculo antes de gravar na sessao, e so a sessao decide
   * em nome de quem a pessoa age nas requisicoes seguintes. Nenhum outro
   * endpoint le `organizationId` do cliente.
   */
  @Post('organizacao-ativa')
  @HttpCode(200)
  @UseGuards(SessaoGuard)
  async trocarOrganizacaoAtiva(
    @Body(new ZodValidationPipe(trocarOrganizacaoAtivaSchema))
    dados: EntradaDeTrocarOrganizacaoAtiva,
    @Req() requisicao: RequisicaoAutenticada,
  ) {
    await this.autenticacao.trocarOrganizacaoAtiva(
      requisicao.sessao.id,
      requisicao.sessao.userId,
      dados.organizationId,
    );

    return { ok: true };
  }

  @Get('eu')
  @UseGuards(SessaoGuard)
  eu(@Req() requisicao: RequisicaoAutenticada) {
    return {
      userId: requisicao.sessao.userId,
      organizationId: requisicao.sessao.activeOrganizationId,
      expiraEm: requisicao.sessao.expiresAt.toISOString(),
    };
  }
}

function gravarCookieDeSessao(
  resposta: Response,
  token: string,
  maxAgeEmSegundos: number,
): void {
  resposta.cookie(
    NOME_DO_COOKIE_DE_SESSAO,
    token,
    opcoesDoCookieDeSessao(maxAgeEmSegundos),
  );
}

/**
 * Dados da requisicao guardados junto da sessao.
 *
 * O IP vai **hasheado com segredo** (ver `comum/hash-de-ip.ts`), nunca em
 * claro. `req.ip` respeita `trust proxy`, que precisa ser configurado conforme
 * a hospedagem na Fase 4 — atras de proxy mal configurado, `req.ip` devolve o
 * IP do proxy e o registro perde sentido.
 */
function contextoDaRequisicao(requisicao: Request) {
  return {
    ipHash: hashDeIp(requisicao.ip),
    userAgent: requisicao.headers['user-agent'],
  };
}
