import { randomBytes } from 'node:crypto';
import { hashDoToken } from './sessao.service';

/**
 * Tokens de uso unico entregues por e-mail: convite (A10), verificacao de
 * e-mail (A8) e redefinicao de senha (A9).
 *
 * Os tres sao o **mesmo** mecanismo, e por isso vivem aqui em vez de serem
 * reescritos tres vezes: valor aleatorio entregue a pessoa, **hash** no banco,
 * prazo de validade e uso unico. Escrever tres vezes significaria divergir em
 * algum detalhe — qual a janela, se reenviar invalida o anterior, o que
 * acontece ao reusar — e descobrir a divergencia no fluxo menos testado.
 *
 * ## Por que o banco guarda o hash
 *
 * Mesmo motivo da sessao e da senha: um vazamento da tabela nao entrega tokens
 * utilizaveis. A diferenca em relacao a senha e que aqui o segredo tem 256
 * bits de aleatoriedade, logo nao existe ataque de dicionario contra ele e o
 * SHA-256 sem custo basta — ver a nota em `sessao.service.ts`.
 *
 * ## Por que nao se compara token em memoria
 *
 * Porque nao e preciso: o `tokenHash` tem indice unico nas tres tabelas, logo
 * a busca e por ele. Comparacao em tempo constante
 * (`compararEmTempoConstante`) seria necessaria se o registro fosse localizado
 * por outro campo — por e-mail, por exemplo — e o token conferido depois.
 */

const MINUTO = 60;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/**
 * Validades, em segundos.
 *
 * Nao sao iguais de proposito. Quanto maior o estrago de um token vazado,
 * menor a janela: a redefinicao de senha entrega a conta inteira, enquanto o
 * convite entrega entrada em uma organizacao que ja esperava a pessoa — e
 * convite com uma hora de validade seria recusado por quem abre o e-mail no
 * dia seguinte.
 */
export const VALIDADE_DO_TOKEN = {
  convite: Number(process.env.VALIDADE_DO_CONVITE ?? 7 * DIA),
  verificacaoDeEmail: Number(process.env.VALIDADE_DA_VERIFICACAO ?? 1 * DIA),
  redefinicaoDeSenha: Number(process.env.VALIDADE_DA_REDEFINICAO ?? 1 * HORA),
} as const;

export type TokenDeUsoUnico = {
  /** Vai no link do e-mail. Existe so aqui e na caixa de entrada da pessoa. */
  token: string;
  /** Vai no banco. */
  tokenHash: string;
  expiresAt: Date;
};

/**
 * Gera um token e o prazo dele.
 *
 * 32 bytes de `randomBytes` em base64url, como a sessao: `Math.random()` e
 * previsivel e serve para sortear cor de grafico, nao para guardar acesso.
 * base64url atravessa URL sem escape, o que importa porque este valor viaja em
 * link de e-mail.
 */
export function gerarTokenDeUsoUnico(
  validadeEmSegundos: number,
): TokenDeUsoUnico {
  const token = randomBytes(32).toString('base64url');

  return {
    token,
    tokenHash: hashDoToken(token),
    expiresAt: new Date(Date.now() + validadeEmSegundos * 1000),
  };
}

/** Confere prazo e uso. Separado para que a regra seja a mesma nos tres fluxos. */
export function tokenAindaVale(registro: {
  expiresAt: Date;
  usadoEm: Date | null;
}): boolean {
  if (registro.usadoEm !== null) {
    return false;
  }

  return registro.expiresAt.getTime() > Date.now();
}
