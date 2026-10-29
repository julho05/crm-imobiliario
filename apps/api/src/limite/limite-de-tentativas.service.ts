import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hmacDoServidor } from '../comum/hash-de-ip';
import { LimiteAtingido } from './limite-atingido';
import type { Regra } from './regras';

/**
 * Limite de tentativas sobre o MySQL — item **A11**.
 *
 * ## Por que no banco, e nao em memoria
 *
 * Decisao de 21/10/2026 (`architecture.md`): a hospedagem nao garante processo
 * unico, e com contador em memoria cada processo teria o seu — o limite real
 * seria o multiplo do configurado. O banco e o unico estado que todos os
 * processos enxergam.
 *
 * ## Janela fixa, e o que isso custa
 *
 * O contador e por janela alinhada ao relogio (`15:00–15:15`, `15:15–15:30`).
 * Quem conhece a regra consegue o dobro do maximo na virada — dez tentativas
 * as 15:14 e mais dez as 15:15. Janela deslizante fecharia isso, ao preco de
 * guardar um registro por tentativa. Para os numeros daqui, o dobro de dez
 * continua sendo nada contra um Argon2.
 *
 * ## O incremento e atomico; a leitura e conservadora
 *
 * `INSERT ... ON DUPLICATE KEY UPDATE hits = hits + 1` incrementa sem corrida
 * entre processos. A leitura que vem depois pode ver um numero **maior** que o
 * da propria tentativa, se outra chegou no meio — e nunca menor. Logo, a
 * tentativa que passa do maximo e sempre recusada; no pior caso, uma que
 * estava no limite tambem e. Ha teste com requisicoes simultaneas.
 *
 * ## Limpeza durante o uso
 *
 * O plano nao permite tarefa agendada. Uma chamada em cada
 * `1 / PROBABILIDADE_DE_LIMPEZA` apaga um lote de janelas vencidas, sem que a
 * requisicao espere por isso.
 */
@Injectable()
export class LimiteDeTentativasService {
  private readonly logger = new Logger(LimiteDeTentativasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Conta uma tentativa em cada regra e recusa com 429 se alguma estourou.
   *
   * Todas as regras sao contadas antes da recusa, inclusive as que nao
   * estouraram: a tentativa aconteceu, e deixar de conta-la porque outra regra
   * ja barrou daria a quem insiste um contador que nao anda.
   *
   * `partes` sao os valores que distinguem o contador — o IP, o e-mail. Chegam
   * em claro e saem daqui so dentro do HMAC.
   */
  async consumir(
    ...pedidos: { regra: Regra; partes: (string | undefined)[] }[]
  ): Promise<void> {
    const agora = Date.now();
    let espera = 0;

    for (const { regra, partes } of pedidos) {
      const janelaEmMs = regra.janelaEmSegundos * 1000;
      const inicio = new Date(Math.floor(agora / janelaEmMs) * janelaEmMs);
      const fim = new Date(inicio.getTime() + janelaEmMs);

      // Sem IP (chamada interna, proxy que nao repassou o endereco) cai num
      // contador compartilhado, e nao em contador nenhum: deixar de limitar
      // quem chega sem IP seria a porta para contornar o limite.
      const chave = hmacDoServidor(
        [regra.nome, ...partes.map((parte) => parte ?? 'sem-valor')].join(
          '\u0000',
        ),
      );

      await this.prisma.$executeRaw`
        INSERT INTO RateLimitHit (\`key\`, windowStart, hits, expiresAt)
        VALUES (${chave}, ${inicio}, 1, ${fim})
        ON DUPLICATE KEY UPDATE hits = hits + 1`;

      const [linha] = await this.prisma.$queryRaw<{ hits: number | bigint }[]>`
        SELECT hits FROM RateLimitHit
        WHERE \`key\` = ${chave} AND windowStart = ${inicio}`;

      if (Number(linha?.hits ?? 0) > regra.maximo) {
        espera = Math.max(espera, Math.ceil((fim.getTime() - agora) / 1000));
      }
    }

    if (Math.random() < PROBABILIDADE_DE_LIMPEZA) {
      void this.limparVencidos().catch((erro: Error) =>
        this.logger.warn(`Limpeza de limites vencidos falhou: ${erro.message}`),
      );
    }

    if (espera > 0) {
      throw new LimiteAtingido(espera);
    }
  }

  /**
   * Apaga um lote de janelas vencidas. Devolve quantas linhas sairam.
   *
   * Em lote, com `LIMIT`, para que uma tabela acumulada nao transforme a
   * limpeza numa consulta longa disputando o banco com o login.
   */
  limparVencidos(): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM RateLimitHit WHERE expiresAt < ${new Date()} LIMIT 1000`;
  }
}

/** Uma limpeza a cada cinquenta tentativas limitadas, em media. */
const PROBABILIDADE_DE_LIMPEZA = 1 / 50;
