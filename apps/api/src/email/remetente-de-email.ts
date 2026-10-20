/**
 * A porta de saida de e-mail.
 *
 * ## Por que uma porta, e nao uma chamada direta ao provedor
 *
 * O provedor de e-mail transacional **ainda nao foi escolhido** — e uma
 * decisao com custo, registrada como pendente em
 * [roadmap.md](../../../../docs/roadmap.md). Tres itens do roadmap (A8, A9 e
 * A10) dependem de enviar e-mail, e todos ficariam parados esperando essa
 * decisao.
 *
 * Com a porta, nao ficam: o codigo depende desta interface, nunca de um SDK.
 * Trocar o adaptador de log pelo provedor real e acrescentar uma classe e uma
 * linha no modulo — nenhum fluxo de negocio e tocado.
 *
 * ## O que NAO entra aqui
 *
 * Template, HTML e marca. A marca ainda nao esta decidida
 * ([CLAUDE.md](../../../../CLAUDE.md)), e e-mail transacional em texto puro
 * chega melhor e e mais facil de testar. O nome do produto sai de
 * `APP_NAME`, em um lugar so.
 */

/** Um e-mail a enviar. Texto puro, de proposito. */
export type Email = {
  para: string;
  assunto: string;
  corpo: string;
};

/**
 * Classe abstrata, e nao `interface` com token de string.
 *
 * Interface do TypeScript nao existe em tempo de execucao, logo nao serve de
 * token de injecao, e o contorno usual (`@Inject('REMETENTE')`) troca a
 * verificacao do compilador por uma string que ninguem confere. Classe
 * abstrata e o idioma do Nest justamente por isso: serve de tipo **e** de
 * token.
 */
export abstract class RemetenteDeEmail {
  abstract enviar(email: Email): Promise<void>;
}

/** Nome visivel do produto nos e-mails. Um lugar so, porque a marca pode mudar. */
export function nomeDoProduto(): string {
  return (
    process.env.APP_NAME ?? process.env.NEXT_PUBLIC_APP_NAME ?? 'o sistema'
  );
}

/**
 * Base das URLs que vao nos e-mails.
 *
 * Aponta para o **site**, nunca para a API: quem clica no link precisa cair em
 * uma tela, nao em um JSON.
 */
export function enderecoDoSite(): string {
  return (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
}
