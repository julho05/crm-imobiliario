import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sessao opaca com estado no MySQL.
 *
 * ## Por que nao JWT
 *
 * [permissions.md](../../../../docs/permissions.md) §4.4 exige que suspender um
 * membro **corte o acesso imediatamente**. Com JWT isso nao acontece: o token
 * continua valido ate expirar, e implementar revogacao exige uma lista de
 * bloqueio consultada a cada requisicao — que e justamente a consulta ao banco
 * que o JWT prometia evitar. Decisao registrada em
 * [architecture.md](../../../../docs/architecture.md).
 *
 * ## O que vai no cookie, e o que vai no banco
 *
 * O cookie carrega **32 bytes aleatorios** em base64url. O banco guarda apenas
 * o **SHA-256** desse valor. Consequencia pratica: um vazamento da tabela
 * `Session` nao entrega sessoes utilizaveis, do mesmo jeito que o hash de senha
 * nao entrega senhas.
 *
 * SHA-256 sem salt e sem custo e adequado **aqui**, ao contrario do caso da
 * senha: o segredo tem 256 bits de entropia aleatoria, logo nao existe ataque
 * de dicionario nem tabela pre-computada contra ele. Custo alto so tornaria
 * cada requisicao mais lenta sem ganho.
 *
 * ## Duas expiracoes
 *
 * - **Absoluta** (`expiresAt`): a sessao morre nessa data, use-se ou nao.
 *   Limita a janela de uma sessao roubada.
 * - **Por inatividade** (`lastUsedAt`): sem uso por X, morre antes.
 *   Protege o computador compartilhado que ficou aberto.
 */

const MINUTO = 60;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Duracoes em segundos. Ajustaveis por ambiente. */
export const DURACAO_DA_SESSAO = {
  /** Sessao comum. */
  absoluta: Number(process.env.SESSAO_DURACAO_ABSOLUTA ?? 12 * HORA),
  /** Com "permanecer conectado" marcado. */
  absolutaProlongada: Number(process.env.SESSAO_DURACAO_PROLONGADA ?? 30 * DIA),
  /** Tempo maximo sem uso antes de expirar. */
  inatividade: Number(process.env.SESSAO_DURACAO_INATIVIDADE ?? 7 * DIA),
} as const;

/**
 * Tempo minimo entre duas gravacoes de `lastUsedAt`.
 *
 * Sem isto, toda requisicao autenticada faria um UPDATE — carregar o painel
 * dispara varias chamadas, e cada uma escreveria na mesma linha. Com um minuto
 * de folga, a precisao perdida e irrelevante para a regra de inatividade
 * (medida em dias) e o banco deixa de levar escrita desnecessaria.
 */
const INTERVALO_PARA_REGISTRAR_USO = 60 * 1000;

export type SessaoAtiva = {
  id: string;
  userId: string;
  activeOrganizationId: string | null;
  expiresAt: Date;
};

export type DadosDaRequisicao = {
  ipHash?: string;
  userAgent?: string;
};

@Injectable()
export class SessaoService {
  private readonly logger = new Logger(SessaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria uma sessao e devolve o token **cru**, que so existe aqui e no cookie.
   * Depois deste retorno, nao ha como recuperar o valor a partir do banco.
   */
  async criar(params: {
    userId: string;
    activeOrganizationId?: string | null;
    permanecerConectado?: boolean;
    requisicao?: DadosDaRequisicao;
  }): Promise<{ token: string; expiresAt: Date; maxAgeEmSegundos: number }> {
    const token = gerarToken();
    const duracao = params.permanecerConectado
      ? DURACAO_DA_SESSAO.absolutaProlongada
      : DURACAO_DA_SESSAO.absoluta;
    const expiresAt = new Date(Date.now() + duracao * 1000);

    await this.prisma.session.create({
      data: {
        tokenHash: hashDoToken(token),
        userId: params.userId,
        activeOrganizationId: params.activeOrganizationId ?? null,
        expiresAt,
        ipHash: params.requisicao?.ipHash,
        userAgent: params.requisicao?.userAgent?.slice(0, 255),
      },
    });

    return { token, expiresAt, maxAgeEmSegundos: duracao };
  }

  /**
   * Resolve o token do cookie em sessao ativa, ou `null`.
   *
   * Devolve `null` — nunca lanca e nunca diferencia os motivos — para sessao
   * inexistente, revogada, expirada, inativa demais, de usuario desativado ou
   * de usuario apagado. Quem chama nao deve saber qual foi: a resposta ao
   * cliente e a mesma em todos os casos.
   */
  async resolver(token: string | undefined): Promise<SessaoAtiva | null> {
    if (!token) {
      return null;
    }

    const sessao = await this.prisma.session.findUnique({
      where: { tokenHash: hashDoToken(token) },
      select: {
        id: true,
        userId: true,
        activeOrganizationId: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        user: { select: { status: true } },
      },
    });

    if (!sessao || sessao.revokedAt) {
      return null;
    }

    const agora = Date.now();

    if (sessao.expiresAt.getTime() <= agora) {
      return null;
    }

    const limiteDeInatividade =
      sessao.lastUsedAt.getTime() + DURACAO_DA_SESSAO.inatividade * 1000;

    if (limiteDeInatividade <= agora) {
      return null;
    }

    // Passo 1 dos sete de permissions.md §6: o usuario existe E esta ativo.
    // Conta desativada nao continua navegando com a sessao que já tinha.
    if (sessao.user.status !== 'ACTIVE') {
      return null;
    }

    if (agora - sessao.lastUsedAt.getTime() > INTERVALO_PARA_REGISTRAR_USO) {
      await this.registrarUso(sessao.id);
    }

    return {
      id: sessao.id,
      userId: sessao.userId,
      activeOrganizationId: sessao.activeOrganizationId,
      expiresAt: sessao.expiresAt,
    };
  }

  /**
   * Revoga uma sessao. Idempotente: revogar duas vezes nao e erro, e o logout
   * nao deve falhar so porque a sessao ja tinha sido encerrada em outra aba.
   */
  async revogar(sessaoId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessaoId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoga todas as sessoes de um usuario, opcionalmente poupando uma.
   *
   * Usado na troca de senha: quem redefiniu a senha espera que o acesso de
   * quem quer que estivesse dentro termine ali. Poupar a sessao atual evita
   * deslogar a propria pessoa que acabou de trocar.
   */
  async revogarTodasDoUsuario(
    userId: string,
    pouparSessaoId?: string,
  ): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(pouparSessaoId ? { id: { not: pouparSessaoId } } : {}),
      },
      data: { revokedAt: new Date() },
    });

    if (count > 0) {
      this.logger.log(`${count} sessao(oes) revogada(s) do usuario`);
    }

    return count;
  }

  /** Grava a organizacao ativa **na sessao**, do lado do servidor. */
  async definirOrganizacaoAtiva(
    sessaoId: string,
    organizationId: string | null,
  ): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessaoId },
      data: { activeOrganizationId: organizationId },
    });
  }

  private async registrarUso(sessaoId: string): Promise<void> {
    try {
      await this.prisma.session.update({
        where: { id: sessaoId },
        data: { lastUsedAt: new Date() },
      });
    } catch (erro) {
      // Falhar aqui nao pode derrubar a requisicao: o registro de uso e
      // manutencao da sessao, nao a operacao que o usuario pediu.
      this.logger.warn(
        `Nao foi possivel registrar uso da sessao: ${(erro as Error).message}`,
      );
    }
  }
}

/**
 * 32 bytes de aleatoriedade criptografica em base64url.
 *
 * `randomBytes`, nunca `Math.random()`: o segundo e previsivel e serve para
 * sortear cor de grafico, nao para guardar acesso a dado de cliente.
 *
 * base64url (sem `+`, `/` nem `=`) atravessa cabecalho de cookie e URL sem
 * precisar de escape.
 */
function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 em hexadecimal. Ver a nota sobre por que basta, no topo. */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Comparacao de strings em tempo constante.
 *
 * Exportada para uso em comparacao de tokens que **nao** passam pelo indice do
 * banco — convite e redefinicao de senha, onde o registro e localizado por
 * outro campo e o token e conferido em memoria. A comparacao com `===` para
 * cedo no primeiro byte diferente, e essa diferenca de tempo e explorável.
 */
export function compararEmTempoConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  // timingSafeEqual exige o mesmo tamanho. Comparar os tamanhos antes vaza
  // apenas o comprimento, que nao e segredo em token de tamanho fixo.
  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}
