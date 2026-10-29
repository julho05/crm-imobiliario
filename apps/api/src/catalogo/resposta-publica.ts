import {
  AddressVisibility,
  type MediaKind,
  type OrganizationKind,
  type PropertyPurpose,
  type PropertyStatus,
  type PropertyType,
} from '@app/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * O que o visitante sem conta recebe — item **C2**, e com ele o **B3**.
 *
 * ## Lista branca, campo a campo, e nunca o registro do Prisma
 *
 * [permissions.md](../../../../docs/permissions.md) §5 é explícito: "nada de
 * `select *` com exclusões — exclusão por lista negra sempre esquece o campo
 * novo que alguém adicionou na semana passada".
 *
 * Este arquivo **não reaproveita** `../imoveis/resposta.ts`, e a tentação de
 * fazê-lo com um `omit` é exatamente o erro que o item existe para evitar:
 * aquela resposta carrega `code`, `zipCode`, `street`, `number` e o
 * responsável. Partir dela e remover campos é lista negra escrita de outro
 * jeito.
 *
 * ## As duas listas abaixo são o mecanismo, não documentação
 *
 * `COLUNAS_PUBLICAS_DE_*` e `COLUNAS_PRIVADAS_DE_*` classificam **todas** as
 * colunas de cada modelo que o catálogo toca. O teste
 * `test/catalogo/vazamento.http.spec.ts` compara as duas listas com o
 * `Prisma.*ScalarFieldEnum` — a lista de colunas que o Prisma gera a partir do
 * schema — e falha quando uma coluna não está em nenhuma delas.
 *
 * O efeito prático: acrescentar `comissao` ao `Property` quebra a suíte até
 * alguém decidir se aquilo é público. Um teste que conferisse apenas os campos
 * da resposta continuaria passando, porque campo novo que ninguém mapeou
 * simplesmente não aparece — e é assim que um vazamento nasce de uma migration
 * inocente.
 *
 * Classificar errado ainda é possível. O que deixa de ser possível é vazar por
 * esquecimento, que é o caso real.
 */

// ---------------------------------------------------------------------------
// Classificação das colunas
// ---------------------------------------------------------------------------

/**
 * Colunas do `Property` que o catálogo pode devolver.
 *
 * `id` entra porque o formulário de interesse o exige: `capturaDeLeadSchema`
 * identifica o imóvel por `propertyId`. `status` entra porque `RESERVED`
 * aparece com etiqueta (decisão de 19/10/2026) — esconder a etiqueta faria o
 * visitante ligar para perguntar sobre um imóvel que já tem proposta.
 *
 * `street`, `number` e `complement` são **condicionais**: entram conforme o
 * `addressVisibility`, e `montarEndereco` é o único lugar que decide. Estar
 * nesta lista significa "pode sair em alguma configuração", não "sai sempre".
 *
 * `code` entrou nesta lista em 29/10/2026; até ali era privado. Ele já saía de
 * qualquer jeito, dentro do slug (`apartamento-no-pinheiros-ap-001`, decisão
 * do B1), e o código no anúncio é o padrão do mercado: o cliente escreve "vi o
 * AP-001" no WhatsApp e o corretor acha o imóvel na hora. O motivo que o
 * mantinha privado — revelar o tamanho da carteira — é fraco: a numeração é
 * por tipo, e é editável justamente para a imobiliária usar a sua.
 */
export const COLUNAS_PUBLICAS_DE_IMOVEL = [
  'id',
  'code',
  'slug',
  'title',
  'description',
  'type',
  'purpose',
  'status',
  'price',
  'rentPrice',
  'condoFee',
  'iptu',
  'bedrooms',
  'bathrooms',
  'suites',
  'parkingSpots',
  'areaTotal',
  'areaUseful',
  'state',
  'city',
  'neighborhood',
  'street',
  'number',
  'complement',
  'publishedAt',
] as const;

/**
 * Colunas do `Property` que **nunca** saem, com o motivo de cada uma.
 *
 * - `organizationId` e `ownerMemberId`: identificadores internos. O §5 proíbe
 *   devolver qualquer `userId`, e `ownerMemberId` leva a um.
 *
 *   Ressalva honesta sobre o primeiro: a chave do objeto de mídia é
 *   `organizacoes/<org>/imoveis/<imovel>/...` (decisão do B4), então o
 *   `organizationId` está **dentro da URL da foto** — hoje codificado na
 *   assinatura, e no Cloudflare R2 visível no caminho. Ele não sai como campo,
 *   mas sai. Isso é aceito: o id é um identificador opaco, não uma credencial,
 *   e toda rota privada deriva a organização da sessão, nunca do que o cliente
 *   informa. Está na lista dos privados para não ser entregue de graça, não
 *   porque conhecê-lo abra alguma porta

 * - `zipCode`: identifica o quarteirão e, em prédio, o próprio endereço —
 *   devolvê-lo anularia `STREET_ONLY` e `NEIGHBORHOOD_ONLY`
 * - `latitude` e `longitude`: ver `montarEndereco`
 * - `addressVisibility`: é a **configuração** da privacidade, não conteúdo.
 *   Dizer ao visitante "este endereço está oculto" não lhe serve de nada e
 *   informa a quem sonda quais imóveis escondem coisa
 * - `deletedAt`: imóvel excluído não chega até aqui; o campo não tem leitor
 * - `createdAt` e `updatedAt`: data de cadastro revela há quanto tempo o imóvel
 *   não vende, que é informação de negociação. `publishedAt` sai porque ordena
 *   a vitrine
 */
export const COLUNAS_PRIVADAS_DE_IMOVEL = [
  'organizationId',
  'zipCode',
  'latitude',
  'longitude',
  'addressVisibility',
  'ownerMemberId',
  'deletedAt',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Colunas da `Organization` que o catálogo pode devolver.
 *
 * Os campos `public*` existem no modelo para isto. `name` e `kind` saem porque
 * a vitrine é da imobiliária e precisa dizer de quem ela é.
 */
export const COLUNAS_PUBLICAS_DE_ORGANIZACAO = [
  'name',
  'slug',
  'kind',
  'logoObjectKey',
  'publicEmail',
  'publicPhone',
  'publicBio',
] as const;

/**
 * Colunas da `Organization` que nunca saem.
 *
 * `plan` e `leadVisibility` são configuração comercial e interna; `status` diz
 * se a conta está suspensa, e organização suspensa simplesmente não tem
 * vitrine — responder 404 conta menos do que responder "existe, mas está
 * suspensa". `id` fica de fora porque o `slug` é o identificador público, e
 * é ele que aparece na URL.
 */
export const COLUNAS_PRIVADAS_DE_ORGANIZACAO = [
  'id',
  'plan',
  'leadVisibility',
  'status',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Colunas da `PropertyMedia` que o catálogo pode devolver.
 *
 * `objectKey` sai transformado em URL, nunca como chave: a chave é o endereço
 * do objeto no armazenamento, e num bucket com leitura pública conhecê-la é
 * poder lê-la. `kind` sai porque a tela distingue foto de planta.
 */
export const COLUNAS_PUBLICAS_DE_MIDIA = [
  'kind',
  'objectKey',
  'altText',
  'width',
  'height',
] as const;

/**
 * Colunas da `PropertyMedia` que nunca saem.
 *
 * `isCover` e `position` governam a **ordem** da resposta em vez de aparecer
 * nela. `byteSize` e `contentType` são detalhe de armazenamento. Os
 * identificadores ficam de fora porque a mídia pública não é endereçável por
 * si: ela só existe dentro do imóvel.
 */
export const COLUNAS_PRIVADAS_DE_MIDIA = [
  'id',
  'organizationId',
  'propertyId',
  'position',
  'isCover',
  'byteSize',
  'contentType',
  'createdAt',
  'updatedAt',
] as const;

// ---------------------------------------------------------------------------
// O contrato
// ---------------------------------------------------------------------------

export type MidiaPublica = {
  kind: MediaKind;
  url: string;
  textoAlternativo: string | null;
  largura: number | null;
  altura: number | null;
};

/**
 * O endereço que o visitante vê.
 *
 * `null` quando a visibilidade não permite nada — e não um objeto com todos os
 * campos nulos, que faria a tela desenhar um bloco de endereço vazio.
 */
export type EnderecoPublico = {
  rua: string;
  numero: string | null;
  complemento: string | null;
};

export type RespostaPublicaDeImovel = {
  id: string;
  /** "AP-001", ou a numeração da própria imobiliária. */
  codigo: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  tipo: PropertyType;
  finalidade: PropertyPurpose;
  /** Só `AVAILABLE` ou `RESERVED` chegam aqui; o filtro é do servidor. */
  status: PropertyStatus;
  preco: number | null;
  precoDeAluguel: number | null;
  condominio: number | null;
  iptu: number | null;
  dormitorios: number | null;
  banheiros: number | null;
  suites: number | null;
  vagas: number | null;
  areaTotal: number | null;
  areaUtil: number | null;
  estado: string;
  cidade: string;
  bairro: string;
  endereco: EnderecoPublico | null;
  caracteristicas: string[];
  capa: MidiaPublica | null;
  /** Vazio na listagem, completo no detalhe. Ver `paraImovelPublico`. */
  fotos: MidiaPublica[];
  publicadoEm: string;
};

export type RespostaPublicaDeOrganizacao = {
  slug: string;
  nome: string;
  tipo: OrganizationKind;
  email: string | null;
  telefone: string | null;
  apresentacao: string | null;
  /**
   * Já como URL, nunca como chave do objeto — mesma regra da mídia do imóvel.
   *
   * Ainda não existe tela que envie logotipo, então na prática é `null` hoje.
   * O campo sai assim mesmo porque a alternativa seria classificar
   * `logoObjectKey` como privada e voltar atrás no dia em que a tela entrar —
   * e é nesse dia que alguém devolve a chave crua por engano.
   */
  logoUrl: string | null;
};

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

/** O imóvel como o `select` do serviço o carrega. */
type ImovelCarregado = {
  id: string;
  code: string;
  slug: string;
  title: string;
  description: string | null;
  type: PropertyType;
  purpose: PropertyPurpose;
  status: PropertyStatus;
  price: Prisma.Decimal | null;
  rentPrice: Prisma.Decimal | null;
  condoFee: Prisma.Decimal | null;
  iptu: Prisma.Decimal | null;
  bedrooms: number | null;
  bathrooms: number | null;
  suites: number | null;
  parkingSpots: number | null;
  areaTotal: Prisma.Decimal | null;
  areaUseful: Prisma.Decimal | null;
  state: string;
  city: string;
  neighborhood: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  addressVisibility: AddressVisibility;
  publishedAt: Date | null;
  features: { feature: string }[];
};

type MidiaCarregada = {
  kind: MediaKind;
  objectKey: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  isCover: boolean;
};

/**
 * O endereço conforme a visibilidade.
 *
 * Três níveis, e o `switch` é exaustivo de propósito: nível novo no enum vira
 * erro de tipo aqui, e não um `default` silencioso que escolheria por conta
 * própria o que mostrar.
 *
 * ## O CEP não sai em nível nenhum
 *
 * Nem no `FULL`. Ele é o campo que mais identifica sozinho — em prédio, o CEP
 * é o endereço —, e a tabela de campos públicos de
 * [data-model.md](../../../../docs/data-model.md) §5 o lista entre os
 * privados sem ressalva.
 *
 * ## As coordenadas também não, e isso foi decidido em 23/10/2026
 *
 * O §5 deixara duas saídas em aberto: devolvê-las deslocadas dentro de um raio,
 * ou não devolvê-las. Fica a segunda. Não há mapa no MVP, então a coordenada
 * não tem para que servir hoje; e coordenada deslocada é precisão falsa num
 * JSON que qualquer pessoa lê — quem quiser o ponto exato compara dois imóveis
 * vizinhos e estreita o raio. Quando houver mapa, o deslocamento se decide
 * junto com ele, com raio escolhido para o que o mapa mostra.
 */
export function montarEndereco(imovel: {
  addressVisibility: AddressVisibility;
  street: string | null;
  number: string | null;
  complement: string | null;
}): EnderecoPublico | null {
  switch (imovel.addressVisibility) {
    case AddressVisibility.FULL:
      return imovel.street === null
        ? null
        : {
            rua: imovel.street,
            numero: imovel.number,
            complemento: imovel.complement,
          };

    case AddressVisibility.STREET_ONLY:
      // Rua sem número e sem complemento. O número é o que transforma "fica na
      // Rua Tal" em "é aquela casa", e o complemento entrega o apartamento.
      return imovel.street === null
        ? null
        : { rua: imovel.street, numero: null, complemento: null };

    case AddressVisibility.NEIGHBORHOOD_ONLY:
      // Nada. Cidade e bairro saem nos campos próprios, que são públicos em
      // todos os níveis — sem eles não existe catálogo.
      return null;
  }
}

/**
 * Monta o imóvel público.
 *
 * `midias` chega **já filtrada** pelo serviço, que só consulta `PHOTO` e
 * `FLOORPLAN`. A filtragem acontece na consulta, e não aqui, porque
 * `DOCUMENT` não deve nem ser carregado do banco: dado que não é lido não
 * vaza por descuido de quem mexer nesta função depois.
 */
export function paraImovelPublico(
  imovel: ImovelCarregado,
  midias: { midia: MidiaCarregada; url: string }[],
): RespostaPublicaDeImovel {
  const fotos = midias.map(({ midia, url }) => paraMidiaPublica(midia, url));

  return {
    id: imovel.id,
    codigo: imovel.code,
    slug: imovel.slug,
    titulo: imovel.title,
    descricao: imovel.description,
    tipo: imovel.type,
    finalidade: imovel.purpose,
    status: imovel.status,
    preco: paraNumero(imovel.price),
    precoDeAluguel: paraNumero(imovel.rentPrice),
    condominio: paraNumero(imovel.condoFee),
    iptu: paraNumero(imovel.iptu),
    dormitorios: imovel.bedrooms,
    banheiros: imovel.bathrooms,
    suites: imovel.suites,
    vagas: imovel.parkingSpots,
    areaTotal: paraNumero(imovel.areaTotal),
    areaUtil: paraNumero(imovel.areaUseful),
    estado: imovel.state,
    cidade: imovel.city,
    bairro: imovel.neighborhood,
    endereco: montarEndereco(imovel),
    caracteristicas: imovel.features.map((f) => f.feature),
    capa:
      midias
        .filter(({ midia }) => midia.isCover)
        .map(({ midia, url }) => paraMidiaPublica(midia, url))[0] ?? null,
    fotos,
    // Não nulo na prática: o filtro do catálogo exige `publishedAt != null`. O
    // `?? ''` existe porque o tipo do Prisma não sabe disso, e inventar uma
    // data aqui seria pior do que a string vazia que denuncia o engano.
    publicadoEm: imovel.publishedAt?.toISOString() ?? '',
  };
}

function paraMidiaPublica(midia: MidiaCarregada, url: string): MidiaPublica {
  return {
    kind: midia.kind,
    url,
    textoAlternativo: midia.altText,
    largura: midia.width,
    altura: midia.height,
  };
}

export function paraOrganizacaoPublica(
  organizacao: {
    name: string;
    slug: string;
    kind: OrganizationKind;
    publicEmail: string | null;
    publicPhone: string | null;
    publicBio: string | null;
  },
  logoUrl: string | null,
): RespostaPublicaDeOrganizacao {
  return {
    slug: organizacao.slug,
    nome: organizacao.name,
    tipo: organizacao.kind,
    email: organizacao.publicEmail,
    telefone: organizacao.publicPhone,
    apresentacao: organizacao.publicBio,
    logoUrl,
  };
}

/** Ver a nota equivalente em `../imoveis/resposta.ts`. */
function paraNumero(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : Number(valor);
}
