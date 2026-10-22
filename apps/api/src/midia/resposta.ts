import type { MediaKind } from '@app/shared';

/**
 * A mídia como a API a devolve.
 *
 * ## A URL é gerada na resposta, e não guardada
 *
 * O banco guarda `objectKey` — o caminho do objeto no armazenamento — e nunca
 * uma URL. A URL é montada a cada leitura, porque ela é assinada e expira: uma
 * URL gravada na linha estaria morta na segunda vez que alguém abrisse a tela,
 * e mudar de armazenamento invalidaria todas de uma vez.
 *
 * É o mesmo princípio do `data-model.md` §1 sobre não guardar valor derivado:
 * a URL é derivada da chave, do adaptador e do relógio.
 */
export type RespostaDeMidia = {
  id: string;
  kind: MediaKind;
  /** URL assinada, de validade curta. Não é estável — não a guarde. */
  url: string;
  posicao: number;
  ehCapa: boolean;
  textoAlternativo: string | null;
  largura: number | null;
  altura: number | null;
  tamanhoEmBytes: number | null;
  contentType: string | null;
  criadaEm: string;
};

type MidiaCarregada = {
  id: string;
  kind: MediaKind;
  objectKey: string;
  position: number;
  isCover: boolean;
  altText: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  contentType: string | null;
  createdAt: Date;
};

export function paraRespostaDeMidia(
  midia: MidiaCarregada,
  url: string,
): RespostaDeMidia {
  return {
    id: midia.id,
    kind: midia.kind,
    url,
    posicao: midia.position,
    ehCapa: midia.isCover,
    textoAlternativo: midia.altText,
    largura: midia.width,
    altura: midia.height,
    tamanhoEmBytes: midia.byteSize,
    contentType: midia.contentType,
    criadaEm: midia.createdAt.toISOString(),
  };
}
