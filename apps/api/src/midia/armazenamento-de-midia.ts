/**
 * A porta de armazenamento de objetos.
 *
 * ## Por que uma porta, e não o SDK direto
 *
 * O mesmo arranjo do e-mail (`RemetenteDeEmail`), e pelo mesmo motivo prático:
 * o destino de produção está **decidido** — Cloudflare R2, em 21/10/2026 — mas
 * a conta e as credenciais não existem ainda, e o adaptador real não pode ser
 * exercitado sem elas. Com a porta, o item B4 inteiro — autorização, URL
 * assinada, capa, ordenação, exclusão e tela — é construído e verificado contra
 * um adaptador de disco local. Trocar pelo R2 é acrescentar uma classe e uma
 * linha no módulo.
 *
 * ## O que a porta promete, e o que ela deliberadamente não promete
 *
 * Promete: gerar uma URL de **envio** de validade curta, gerar uma URL de
 * **leitura**, e remover um objeto. Nada mais.
 *
 * Não promete redimensionar, recortar nem converter formato. Isso exigiria
 * processar imagem no servidor — trabalho de worker, que o plano de hospedagem
 * não tem (`CLAUDE.md`). O recorte, quando existir, acontece no navegador antes
 * do envio, ou no R2 por transformação de imagem, que é configuração e não
 * código.
 *
 * ## A assinatura é a autorização, e por isso é curta
 *
 * A URL de envio **é** a permissão de escrever naquela chave: quem a tiver,
 * grava. O roadmap exige que ela seja gerada "só depois da autorização, com
 * validade curta", e a razão é essa — ela sobrevive ao cookie de sessão. Dez
 * minutos é o bastante para enviar 5 MB numa conexão ruim e curto o bastante
 * para que um link copiado de um log não sirva para nada amanhã.
 */

/** Validade da URL de envio. Ver a nota acima sobre por que é curta. */
export const VALIDADE_DO_UPLOAD_EM_SEGUNDOS = 10 * 60;

/** Validade da URL de leitura assinada. */
export const VALIDADE_DA_LEITURA_EM_SEGUNDOS = 60 * 60;

/** O que o cliente precisa para enviar o arquivo por conta própria. */
export type UrlDeUpload = {
  /** Para onde enviar. */
  url: string;
  /** Método HTTP do envio. `PUT` no R2 e no adaptador local. */
  metodo: 'PUT';
  /**
   * Cabeçalhos obrigatórios no envio.
   *
   * O `content-type` entra aqui porque ele faz parte do que foi assinado: o
   * armazenamento recusa o envio que declarar outro tipo. É o que impede que
   * uma URL pedida para JPEG seja usada para subir um executável.
   */
  cabecalhos: Record<string, string>;
  /** Quando a URL deixa de valer, em ISO 8601. */
  expiraEm: string;
};

export abstract class ArmazenamentoDeMidia {
  /**
   * URL para o cliente enviar o arquivo.
   *
   * Quem chama já autorizou e já montou a chave. A porta não decide chave:
   * ela é derivada da organização e do imóvel, e essa regra é de negócio.
   */
  abstract urlDeUpload(params: {
    objectKey: string;
    contentType: string;
    tamanhoEmBytes: number;
  }): Promise<UrlDeUpload>;

  /**
   * URL para exibir o objeto.
   *
   * Assinada e de validade curta neste adaptador. O adaptador do R2 poderá
   * servir foto e planta por domínio público — é o que faz o catálogo não
   * gastar CPU do plano —, mas **nunca** documento: matrícula e contrato
   * continuam atrás de URL assinada, porque `DOCUMENT` não é material de
   * vitrine (`data-model.md` §7).
   */
  abstract urlDeLeitura(objectKey: string): Promise<string>;

  /**
   * Apaga o objeto.
   *
   * Não lança quando o objeto já não existe: a remoção é chamada depois de
   * apagar a linha do banco, e falhar ali deixaria a pessoa olhando um erro
   * sobre uma foto que, para ela, já foi removida.
   */
  abstract remover(objectKey: string): Promise<void>;
}
