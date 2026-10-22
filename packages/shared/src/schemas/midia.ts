/**
 * Fotos e documentos do imóvel — item **B4** do
 * [roadmap.md](../../../../docs/roadmap.md).
 *
 * ## O upload é em dois passos, e isso define o contrato
 *
 * O arquivo **não** passa pela API. Quem pede autoriza, recebe uma URL
 * assinada de validade curta e envia o arquivo direto ao armazenamento.
 *
 * Não é preciosismo de arquitetura: a hospedagem é um plano compartilhado com
 * 3 GB de RAM para dois processos Node, e receber 20 fotos de 5 MB por
 * requisição significaria ocupar esse processo — o mesmo que atende o corretor
 * que está trabalhando — segurando bytes em memória para depois reenviá-los.
 * `docs/architecture.md` registra a decisão.
 *
 * Então são duas chamadas:
 *
 * 1. **`url-de-upload`** — a API autoriza, confere o limite e o tipo, e devolve
 *    a URL assinada com a chave do objeto. Nada é gravado no banco ainda.
 * 2. **`registrar`** — depois do envio, o cliente informa a chave recebida e a
 *    linha é criada. A API confere que a chave pertence àquela organização e
 *    àquele imóvel, porque chave vinda do cliente é pedido, não declaração.
 *
 * A consequência aceita: upload interrompido entre os dois passos deixa um
 * objeto sem linha no banco. É o lado seguro do erro — órfão não aparece em
 * tela nenhuma, ao contrário de uma linha apontando para um arquivo que não
 * existe, que viraria imagem quebrada no anúncio.
 */

import { z } from 'zod';
import { MediaKind } from '../enums';
import { idSchema } from '../primitivos';

/**
 * Teto por imóvel.
 *
 * Vinte é generoso para um anúncio e barato de servir. Sem teto, o upload de
 * quarenta fotos de celular em alta resolução gastaria banda do plano
 * compartilhado entregando o que ninguém amplia — e anúncio com quarenta fotos
 * não vende mais do que um com quinze, vende menos, porque ninguém chega ao
 * fim.
 */
export const MAXIMO_DE_MIDIA_POR_IMOVEL = 20;

/** Cinco megabytes. Foto de celular moderno cabe com folga depois do recorte. */
export const TAMANHO_MAXIMO_DE_MIDIA = 5 * 1024 * 1024;

/**
 * O que cada tipo de mídia aceita.
 *
 * `VIDEO` fica **fora do MVP**: vídeo exige transcodificação para tocar em
 * todo navegador, e transcodificar é trabalho de worker — que o plano de
 * hospedagem não tem (`CLAUDE.md`). O valor continua no enum porque o banco já
 * o conhece; o que não existe é caminho de upload para ele.
 */
export const TIPOS_ACEITOS: Partial<Record<MediaKind, readonly string[]>> = {
  PHOTO: ['image/jpeg', 'image/png', 'image/webp'],
  FLOORPLAN: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  DOCUMENT: ['application/pdf', 'image/jpeg', 'image/png'],
};

/** Os tipos de mídia que o upload aceita hoje. */
export const TIPOS_DE_MIDIA_ACEITOS = Object.keys(TIPOS_ACEITOS) as MediaKind[];

/** Extensão por `contentType`, para montar a chave do objeto. */
export const EXTENSAO_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const kindSchema = z.enum(
  TIPOS_DE_MIDIA_ACEITOS as [MediaKind, ...MediaKind[]],
  'Tipo de midia nao aceito.',
);

/**
 * Pedido de URL de upload.
 *
 * O tamanho vem declarado pelo cliente, e o servidor o confere contra o teto
 * **antes** de assinar. Declaração de cliente não é prova — o arquivo real
 * pode ser maior —, e por isso o limite é repetido na assinatura, que o
 * armazenamento faz valer. Conferir aqui serve para recusar cedo e com
 * mensagem útil, em vez de deixar a pessoa esperar o envio de um arquivo que
 * será rejeitado no fim.
 */
export const pedirUrlDeUploadSchema = z
  .object({
    kind: kindSchema,
    contentType: z.string().trim().min(1, 'Informe o tipo do arquivo.'),
    tamanhoEmBytes: z
      .number()
      .int('Tamanho invalido.')
      .positive('Tamanho invalido.')
      .max(
        TAMANHO_MAXIMO_DE_MIDIA,
        `Arquivo maior que o limite de ${Math.round(
          TAMANHO_MAXIMO_DE_MIDIA / (1024 * 1024),
        )} MB.`,
      ),
  })
  .refine((v) => (TIPOS_ACEITOS[v.kind] ?? []).includes(v.contentType), {
    message: 'Este tipo de arquivo nao e aceito para esta finalidade.',
    path: ['contentType'],
  });
export type EntradaDePedirUrlDeUpload = z.infer<typeof pedirUrlDeUploadSchema>;

/**
 * Registro da mídia, depois do envio.
 *
 * `largura` e `altura` são opcionais e vêm do navegador, que já carregou a
 * imagem para mostrar a pré-visualização. Servem para a tela reservar o espaço
 * certo antes de a foto chegar — e não para validar nada: quem decide o que é
 * imagem válida é o armazenamento, não um número que o cliente informou.
 */
export const registrarMidiaSchema = z.object({
  objectKey: z
    .string()
    .trim()
    .min(1, 'Chave do objeto ausente.')
    .max(255, 'Chave do objeto longa demais.'),
  kind: kindSchema,
  contentType: z.string().trim().min(1, 'Informe o tipo do arquivo.'),
  tamanhoEmBytes: z.number().int().positive().max(TAMANHO_MAXIMO_DE_MIDIA),
  textoAlternativo: z
    .string()
    .trim()
    .max(255, 'Descricao muito longa.')
    .optional(),
  largura: z.number().int().positive().max(100_000).optional(),
  altura: z.number().int().positive().max(100_000).optional(),
});
export type EntradaDeRegistrarMidia = z.infer<typeof registrarMidiaSchema>;

/**
 * Edição da mídia: só o texto alternativo.
 *
 * Tipo, arquivo e dimensões não mudam — mídia diferente é outro upload. O texto
 * alternativo muda porque é o único campo escrito por pessoa, e é o que torna o
 * anúncio legível a quem usa leitor de tela.
 */
export const atualizarMidiaSchema = z.object({
  textoAlternativo: z
    .string()
    .trim()
    .max(255, 'Descricao muito longa.')
    .nullable(),
});
export type EntradaDeAtualizarMidia = z.infer<typeof atualizarMidiaSchema>;

/**
 * Nova ordem das mídias do imóvel.
 *
 * Vem a lista **inteira**, e não "mova o item X para a posição 3". Duas razões:
 * a interface arrasta e solta, então ela já tem a lista final na mão; e ordem
 * parcial exigiria que o servidor adivinhasse o que fazer com o que não foi
 * mencionado, o que é a porta para duas mídias na mesma posição.
 */
export const reordenarMidiaSchema = z.object({
  ids: z
    .array(idSchema)
    .min(1, 'Informe a nova ordem.')
    .max(MAXIMO_DE_MIDIA_POR_IMOVEL, 'Lista longa demais.'),
});
export type EntradaDeReordenarMidia = z.infer<typeof reordenarMidiaSchema>;
