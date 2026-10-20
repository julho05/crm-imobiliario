import { Injectable, Logger } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Hash de senha com Argon2id.
 *
 * ## Por que Argon2id, e por que o pacote @node-rs
 *
 * Argon2id e a recomendacao atual da OWASP: ele e *memory-hard*, o que torna
 * o ataque com GPU muito mais caro do que contra bcrypt. A variante `id`
 * combina resistencia a canal lateral (Argon2i) e a trade-off de memoria
 * (Argon2d).
 *
 * O `@node-rs/argon2` distribui binario pronto para Windows e Linux, em vez de
 * compilar com node-gyp. Isso nao e detalhe de conveniencia: o npm 11 deste
 * projeto bloqueia install scripts por padrao, e a hospedagem gerenciada nao
 * da acesso root ([CLAUDE.md](../../../../CLAUDE.md)). Um pacote que precisa
 * compilar na instalacao seria uma falha esperando o deploy.
 *
 * ## Sobre o custo
 *
 * Os valores padrao sao a linha de base da OWASP para Argon2id:
 * 19 MiB de memoria, 2 iteracoes, paralelismo 1. Medido nesta maquina de
 * desenvolvimento: ~19 ms por hash.
 *
 * [data-model.md](../../../../docs/data-model.md) §3.1 e explicito: o custo
 * precisa ser **calibrado no servidor real, nao no notebook**. Por isso os
 * tres parametros vem de variavel de ambiente. A regra pratica e subir o
 * custo ate o hash levar entre 100 ms e 500 ms no servidor de producao —
 * tempo que o usuario nao percebe no login e que multiplica o custo de um
 * ataque de dicionario por milhares.
 *
 * ## O que este servico nao faz
 *
 * Nao valida a politica de senha. Isso e do `senhaSchema` em `@app/shared`,
 * que vale igual no formulario e no servidor. Aqui so se transforma e compara.
 */

/** Parametros do Argon2id. Ver a nota sobre calibracao acima. */
function lerParametros() {
  return {
    algorithm: Algorithm.Argon2id,
    // Em KiB. 19456 KiB = 19 MiB.
    memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19456),
    timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
  };
}

@Injectable()
export class SenhaService {
  private readonly logger = new Logger(SenhaService.name);
  private readonly parametros = lerParametros();

  /**
   * Gera o hash de uma senha.
   *
   * O salt e aleatorio por chamada, gerado pela propria biblioteca, e vai
   * embutido no texto do hash — junto com o algoritmo e os parametros. E por
   * isso que trocar o custo depois nao invalida as senhas antigas: cada hash
   * carrega os parametros com que foi feito.
   */
  async gerar(senha: string): Promise<string> {
    return hash(senha, this.parametros);
  }

  /**
   * Confere uma senha contra um hash.
   *
   * Nunca lanca: hash corrompido, truncado ou em formato desconhecido devolve
   * `false`. Deixar a excecao subir transformaria um registro ruim no banco em
   * erro 500 durante o login, o que entrega ao atacante que aquele e-mail tem
   * conta — exatamente a informacao que o login tenta nao dar.
   */
  async conferir(hashArmazenado: string, senha: string): Promise<boolean> {
    try {
      return await verify(hashArmazenado, senha, this.parametros);
    } catch (erro) {
      this.logger.warn(
        `Hash de senha ilegivel ao conferir: ${(erro as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Hash descartavel, usado quando o e-mail informado no login nao existe.
   *
   * Sem isto, a resposta para "e-mail inexistente" voltaria muito mais rapido
   * do que a de "senha errada", porque nao haveria hash para conferir. A
   * diferenca de tempo e mensuravel e permite enumerar quem tem conta na
   * plataforma — mesmo com as duas mensagens de erro identicas.
   *
   * O valor precisa ser um hash Argon2 **valido**: se o formato estiver
   * errado, a verificacao falha na hora, nao gasta tempo nenhum e a defesa
   * deixa de existir sem ninguem notar. Por isso ha um teste conferindo que
   * esta constante parseia e consome tempo comparavel a um hash real.
   *
   * Foi gerado uma vez a partir de 32 bytes aleatorios, descartados em
   * seguida. Nao corresponde a nenhuma senha conhecida ou utilizavel.
   */
  async gastarTempoComoSeConferisse(senha: string): Promise<void> {
    await this.conferir(SenhaService.HASH_DESCARTAVEL, senha);
  }

  static readonly HASH_DESCARTAVEL =
    '$argon2id$v=19$m=19456,t=2,p=1$phIjyJkvY32qSIjDzP29vg$' +
    'N4hRo6oa0gpYdBko9hWJXEFFoN8TfnGdN4pcXc2U+1k';
}
