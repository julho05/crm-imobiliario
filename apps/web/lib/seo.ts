import { ROTULOS_DE_TIPO_DE_IMOVEL, type PropertyPurpose } from '@app/shared';
import type { ImovelPublico, OrganizacaoPublica } from './catalogo';

/**
 * O que o robô de busca e a prévia de link leem — item **C7**.
 *
 * Funções puras, sem `@/` e sem nada do Next, para serem testadas sem montar
 * página (`seo.spec.ts`). As páginas da vitrine só as chamam.
 *
 * ## A mesma regra de endereço da página, e nenhuma a mais
 *
 * A descrição e os dados estruturados levam bairro, cidade e UF — **nunca a
 * rua**, nem quando o corretor escolheu mostrá-la na página. O que vai para o
 * Google sai do controle do corretor: mudar a visibilidade depois não tira a
 * rua do índice. Coordenada e CEP já nem chegam ao site.
 *
 * Pelo mesmo motivo a descrição é montada dos campos, e não copiada do texto
 * livre do anúncio — é nele que o corretor escreve a rua quando esquece
 * (`pages-and-navigation.md` §5).
 */

/**
 * A origem pública do site, para os endereços absolutos (canônico, Open Graph,
 * JSON-LD). É a mesma `WEB_ORIGIN` que a API usa nos links de e-mail: um valor
 * só para "onde o site está", em vez de dois que divergem no deploy.
 */
export function origemDoSite(): string {
  return (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
}

const FINALIDADE_NA_FRASE: Record<PropertyPurpose, string> = {
  SALE: 'à venda',
  RENT: 'para alugar',
  BOTH: 'à venda ou para alugar',
};

const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/**
 * "Apartamento à venda em Pinheiros, São Paulo - SP · 3 dormitórios · 85 m² ·
 * R$ 850.000".
 *
 * Só o que foi informado: dormitório e área são opcionais (decisão de
 * 21/10/2026), e "0 dormitórios" seria número inventado.
 */
export function descricaoDoImovel(imovel: ImovelPublico): string {
  const partes = [
    `${ROTULOS_DE_TIPO_DE_IMOVEL[imovel.tipo]} ${
      FINALIDADE_NA_FRASE[imovel.finalidade]
    } em ${imovel.bairro}, ${imovel.cidade} - ${imovel.estado}`,
  ];

  if (imovel.dormitorios !== null) {
    partes.push(
      `${imovel.dormitorios} ${
        imovel.dormitorios === 1 ? 'dormitório' : 'dormitórios'
      }`,
    );
  }

  const area = imovel.areaUtil ?? imovel.areaTotal;
  if (area !== null) {
    partes.push(`${area.toLocaleString('pt-BR')} m²`);
  }

  const preco = precoPrincipal(imovel);
  if (preco) {
    partes.push(preco);
  }

  return partes.join(' · ');
}

/** O preço de venda, quando há; senão o aluguel, por mês. */
function precoPrincipal(imovel: ImovelPublico): string | null {
  if (imovel.finalidade !== 'RENT' && imovel.preco !== null) {
    return reais.format(imovel.preco);
  }

  if (imovel.finalidade !== 'SALE' && imovel.precoDeAluguel !== null) {
    return `${reais.format(imovel.precoDeAluguel)}/mês`;
  }

  return null;
}

type JsonLd = Record<string, unknown>;

const SEPARADOR_DE_LINHA = String.fromCharCode(0x2028);
const SEPARADOR_DE_PARAGRAFO = String.fromCharCode(0x2029);

/**
 * A imobiliária, como `RealEstateAgent` do schema.org.
 *
 * Telefone e e-mail são os de **contato público**, os mesmos que a vitrine já
 * mostra.
 */
export function dadosDaOrganizacao(
  organizacao: OrganizacaoPublica,
  origem: string,
): JsonLd {
  return semVazios({
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: organizacao.nome,
    url: `${origem}/o/${organizacao.slug}`,
    description: organizacao.apresentacao,
    telephone: organizacao.telefone,
    email: organizacao.email,
    logo: organizacao.logoUrl,
  });
}

/**
 * O anúncio, como `RealEstateListing` do schema.org.
 *
 * Uma oferta por finalidade com preço: o imóvel `BOTH` tem duas, e a de
 * aluguel diz que o preço é mensal.
 */
export function dadosDoAnuncio(
  organizacao: OrganizacaoPublica,
  imovel: ImovelPublico,
  origem: string,
): JsonLd {
  const ofertas: JsonLd[] = [];

  if (imovel.finalidade !== 'RENT' && imovel.preco !== null) {
    ofertas.push({
      '@type': 'Offer',
      price: imovel.preco,
      priceCurrency: 'BRL',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
    });
  }

  if (imovel.finalidade !== 'SALE' && imovel.precoDeAluguel !== null) {
    ofertas.push({
      '@type': 'Offer',
      priceCurrency: 'BRL',
      businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: imovel.precoDeAluguel,
        priceCurrency: 'BRL',
        unitCode: 'MON',
      },
    });
  }

  return semVazios({
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: imovel.titulo,
    description: descricaoDoImovel(imovel),
    url: `${origem}/o/${organizacao.slug}/imovel/${imovel.slug}`,
    datePosted: imovel.publicadoEm,
    identifier: imovel.codigo,
    // Só fotos: a planta é imagem do anúncio, mas não é "a cara" do imóvel
    // que o resultado de busca mostra.
    image: imovel.fotos
      .filter((foto) => foto.kind === 'PHOTO')
      .map((foto) => foto.url),
    offers: ofertas,
    contentLocation: {
      '@type': 'Place',
      name: `${imovel.bairro}, ${imovel.cidade} - ${imovel.estado}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: imovel.cidade,
        addressRegion: imovel.estado,
        addressCountry: 'BR',
      },
    },
    provider: {
      '@type': 'RealEstateAgent',
      name: organizacao.nome,
      url: `${origem}/o/${organizacao.slug}`,
    },
  });
}

/**
 * O JSON-LD pronto para ir dentro de `<script type="application/ld+json">`.
 *
 * ## Por que não basta `JSON.stringify`
 *
 * O título, a apresentação e o nome da organização são texto de cliente. Um
 * título com `</script><script>...` fecharia a tag no meio do JSON e abriria
 * outra — script de terceiro rodando na vitrine. O HTML não entende JSON: ele
 * procura `</script>` no texto, e o `JSON.stringify` não escapa `<`.
 *
 * Escapar `<`, `>` e `&` como sequência unicode do próprio JSON (barra, `u`,
 * quatro dígitos) mantém o JSON idêntico para quem o lê e tira do HTML
 * qualquer coisa que pareça tag. U+2028 e U+2029 entram junto: são válidos em
 * JSON e quebram JavaScript antigo.
 *
 * Os dois separadores vêm de `String.fromCharCode`, e não escritos na regex:
 * o caractere literal é uma quebra de linha para editores e ferramentas, e já
 * quebrou este arquivo uma vez.
 */
export function serializarJsonLd(dados: JsonLd): string {
  return JSON.stringify(dados)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replaceAll(SEPARADOR_DE_LINHA, '\\u2028')
    .replaceAll(SEPARADOR_DE_PARAGRAFO, '\\u2029');
}

/**
 * Tira `null`, `undefined` e lista vazia do primeiro nível. O validador do
 * Google acusa `"telephone": null` como erro, e propriedade ausente não.
 */
function semVazios(dados: JsonLd): JsonLd {
  return Object.fromEntries(
    Object.entries(dados).filter(
      ([, valor]) =>
        valor !== null &&
        valor !== undefined &&
        !(Array.isArray(valor) && valor.length === 0),
    ),
  );
}
