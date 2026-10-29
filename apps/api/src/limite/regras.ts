/**
 * Os limites de tentativas — item **A11**.
 *
 * Todos os numeros moram aqui, e so aqui: ajustar depois do piloto e trocar um
 * valor, sem procurar em controller.
 *
 * ## Conta-se toda tentativa, nao so a que falha
 *
 * Contar so a falha exigiria saber o resultado antes de contar — e, no login, o
 * resultado custa um Argon2, que e justamente o trabalho que o limite existe
 * para poupar. Os numeros sao folgados o bastante para que quem acerta a senha
 * na terceira tentativa nunca os encontre.
 *
 * ## Por que o login e por IP **e** e-mail juntos, e nao por e-mail sozinho
 *
 * Decisao de 29/10/2026. Por e-mail sozinho, qualquer pessoa tiraria um
 * corretor do sistema errando a senha dele dez vezes — e para quem depende do
 * sistema para atender cliente, ficar trancado e o dano maior. O que o par nao
 * barra, o ataque distribuido contra uma conta, fica com o Argon2 e a politica
 * de senha; se um dia aparecer de verdade, a resposta e verificacao extra para
 * aquela conta, nao bloqueio.
 *
 * Na recuperacao o e-mail entra sozinho, e sem o mesmo problema: o limite so
 * impede que alguem lote a caixa de entrada de outra pessoa com pedidos de
 * redefinicao.
 *
 * ## Por que o limite por IP e alto
 *
 * Uma imobiliaria com dez corretores atras do mesmo roteador compartilha um IP,
 * e todos entram no sistema na mesma manha.
 */

export type Regra = {
  /** Entra na chave: duas regras nunca dividem contador. */
  nome: string;
  maximo: number;
  janelaEmSegundos: number;
};

const QUINZE_MINUTOS = 15 * 60;
const UMA_HORA = 60 * 60;

export const LIMITES = {
  loginPorIp: {
    nome: 'login:ip',
    maximo: 100,
    janelaEmSegundos: QUINZE_MINUTOS,
  },
  loginPorIpEEmail: {
    nome: 'login:ip+email',
    maximo: 10,
    janelaEmSegundos: QUINZE_MINUTOS,
  },
  recuperacaoPorIp: {
    nome: 'recuperacao:ip',
    maximo: 10,
    janelaEmSegundos: UMA_HORA,
  },
  recuperacaoPorEmail: {
    nome: 'recuperacao:email',
    maximo: 3,
    janelaEmSegundos: UMA_HORA,
  },
  cadastroPorIp: {
    nome: 'cadastro:ip',
    maximo: 10,
    janelaEmSegundos: UMA_HORA,
  },
  /**
   * Redefinir senha, verificar e-mail, ver e aceitar convite. Um contador so
   * para todas: sao rotas que recebem token de uso unico, e quem tenta
   * adivinhar token nao escolhe uma rota so.
   */
  tokenPorIp: {
    nome: 'token:ip',
    maximo: 30,
    janelaEmSegundos: QUINZE_MINUTOS,
  },
} as const satisfies Record<string, Regra>;
