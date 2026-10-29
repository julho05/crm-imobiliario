/**
 * Filtros da busca do catalogo publico — item **C4** do
 * [roadmap.md](../../../../docs/roadmap.md).
 *
 * Morava em `captura-de-lead.ts` desde 20/10/2026, sem uso. Saiu de la porque
 * filtro de busca nao e captura de lead, e quem procurasse um nao acharia o
 * outro.
 *
 * ## O que **nao** esta aqui e proposital
 *
 * Nao ha filtro por rua, CEP nem coordenada. Permitir isso contornaria
 * `addressVisibility` pela porta da busca: o visitante que nao ve a rua
 * descobriria qual e perguntando ao filtro, um nome de cada vez
 * ([data-model.md](../../../../docs/data-model.md) §5). Pelo mesmo motivo a
 * busca livre (`termo`) nao alcanca a coluna da rua — isso e do servico, e
 * tem teste.
 *
 * ## Parametro desconhecido e ignorado, nao recusado
 *
 * O `z.object` descarta chave que nao conhece, e isso e deliberado: o WhatsApp
 * e o Facebook acrescentam `fbclid` e `utm_source` ao link compartilhado, e um
 * contrato estrito transformaria o link do anuncio em pagina de erro. O efeito
 * colateral desejado e que `?cep=` ou `?rua=` nao filtram nada.
 *
 * ## Campo vazio e campo ausente
 *
 * A vitrine usa formulario HTML com envio por GET, que manda os campos em
 * branco como `?tipo=&precoMinimo=`. Sem tratamento, `tipo=''` seria um enum
 * invalido e `precoMinimo=''` viraria **zero** pelo `coerce` — um filtro que
 * ninguem pediu. `semVazio` converte os dois casos em ausencia.
 */

import { z } from 'zod';
import { PropertyPurpose, PropertyType } from '../enums';
import { ufSchema } from '../primitivos';

/** `''` e so-espacos viram `undefined` antes da validacao. */
function semVazio<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (valor) =>
      typeof valor === 'string' && valor.trim() === '' ? undefined : valor,
    schema.optional(),
  );
}

/**
 * As duas finalidades que o visitante procura: comprar ou alugar.
 *
 * `BOTH` nao e opcao de filtro — ninguem procura "um imovel que eu possa
 * comprar ou alugar". O imovel `BOTH` aparece nas **duas** buscas, cada uma
 * comparando o preco correspondente.
 */
export const FINALIDADES_DE_BUSCA = [
  PropertyPurpose.SALE,
  PropertyPurpose.RENT,
] as const;

export type FinalidadeDeBusca = (typeof FINALIDADES_DE_BUSCA)[number];

/** Teto comum dos contadores: acima disso, o filtro nao filtra nada real. */
const contador = z.coerce.number().int().min(0).max(20);

/**
 * Filtros da vitrine. Tudo opcional: a vitrine abre sem filtro nenhum.
 *
 * Os limites de valor e area existem para recusar consulta absurda, nao para
 * descrever o mercado.
 *
 * ## Preco so com finalidade
 *
 * Comparar R$ 2.000 de aluguel com R$ 500 mil de venda nao tem sentido, e
 * adivinhar qual dos dois o visitante quis seria pior do que recusar. A tela
 * so mostra os campos de preco depois que a finalidade e escolhida, entao a
 * recusa so alcanca quem monta a URL a mao.
 *
 * ## Minimo zero e o mesmo que nenhum minimo
 *
 * O servico ignora `quartosMinimo=0`. Aplicado, ele **excluiria** o imovel sem
 * dormitorios informados — que e a regra para todo minimo maior que zero
 * (decisao de 21/10/2026: ausencia nunca vira zero), mas que no zero
 * esconderia imoveis sem que o visitante tivesse pedido filtro nenhum.
 */
export const filtrosDoCatalogoSchema = z
  .object({
    /** Titulo, codigo, bairro e cidade. Nunca a rua. */
    termo: semVazio(z.string().trim().max(120)),
    cidade: semVazio(z.string().trim().max(191)),
    bairro: semVazio(z.string().trim().max(191)),
    estado: semVazio(ufSchema),
    tipo: semVazio(z.enum(PropertyType, 'Tipo de imovel invalido.')),
    finalidade: semVazio(
      z.enum(FINALIDADES_DE_BUSCA, 'Escolha comprar ou alugar.'),
    ),
    precoMinimo: semVazio(z.coerce.number().min(0).max(999_999_999)),
    precoMaximo: semVazio(z.coerce.number().min(0).max(999_999_999)),
    quartosMinimo: semVazio(contador),
    banheirosMinimo: semVazio(contador),
    vagasMinimo: semVazio(contador),
    /** Area util quando informada; senao, a total. O mesmo que o cartao mostra. */
    areaMinima: semVazio(z.coerce.number().min(0).max(1_000_000)),
  })
  .refine(
    (v) =>
      v.finalidade !== undefined ||
      (v.precoMinimo === undefined && v.precoMaximo === undefined),
    {
      message: 'Escolha comprar ou alugar para filtrar por preco.',
      path: ['finalidade'],
    },
  )
  .refine(
    (v) =>
      v.precoMinimo === undefined ||
      v.precoMaximo === undefined ||
      v.precoMinimo <= v.precoMaximo,
    {
      message: 'O preco minimo e maior que o maximo.',
      path: ['precoMaximo'],
    },
  );
export type FiltrosDoCatalogo = z.infer<typeof filtrosDoCatalogoSchema>;
