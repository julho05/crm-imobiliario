import type {
  AddressVisibility,
  PropertyPurpose,
  PropertyStatus,
  PropertyType,
} from '@app/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * A resposta de imovel do **CRM**, montada campo a campo.
 *
 * ## Por que nao devolver o registro do Prisma
 *
 * Por tres motivos que nao se resolvem com um `omit`:
 *
 * 1. **Campo novo nao vaza por omissao.** Devolver o objeto do Prisma faria
 *    cada coluna acrescentada ao `Property` aparecer na API no mesmo dia, sem
 *    ninguem decidir. O item C2 do roadmap exige essa disciplina na API
 *    publica; comecar aqui e mais barato do que converter depois.
 * 2. **`Decimal` nao atravessa JSON de forma util.** O serializador do Nest o
 *    entrega como string, e a interface passaria a fazer `Number(...)` espalhado
 *    por componente. A conversao fica num lugar so.
 * 3. **Nome em portugues.** O contrato do produto fala a lingua do produto;
 *    o schema fala a do banco.
 *
 * ## Esta resposta e privada
 *
 * Carrega endereco completo, codigo interno e o responsavel. Ela nunca serve ao
 * catalogo publico — esse DTO e separado, nasce no item B3/C2 e respeita o
 * `addressVisibility`. O campo vem junto aqui para que a tela do CRM mostre a
 * quem cadastra **o que o visitante vera**, nao para ser aplicado nesta
 * resposta.
 */
export type RespostaDeImovel = {
  id: string;
  codigo: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  tipo: PropertyType;
  finalidade: PropertyPurpose;
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
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  visibilidadeDoEndereco: AddressVisibility;
  responsavel: { membershipId: string; nome: string } | null;
  publicadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

/** O registro como `SELECAO_DE_IMOVEL` o carrega. */
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
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  addressVisibility: AddressVisibility;
  ownerMemberId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  ownerMember: { id: string; user: { name: string } } | null;
};

export function paraRespostaDeImovel(
  imovel: ImovelCarregado,
): RespostaDeImovel {
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
    cep: imovel.zipCode,
    rua: imovel.street,
    numero: imovel.number,
    complemento: imovel.complement,
    visibilidadeDoEndereco: imovel.addressVisibility,
    // Aponta para o `Membership`, nunca para o `User` (data-model.md §3.3). O
    // nome vem junto porque a lista precisa exibi-lo, e buscar por imovel
    // seria a consulta N+1 que o item B10 proibe.
    responsavel: imovel.ownerMember
      ? {
          membershipId: imovel.ownerMember.id,
          nome: imovel.ownerMember.user.name,
        }
      : null,
    publicadoEm: imovel.publishedAt?.toISOString() ?? null,
    criadoEm: imovel.createdAt.toISOString(),
    atualizadoEm: imovel.updatedAt.toISOString(),
  };
}

/**
 * `Decimal` para numero.
 *
 * Seguro para dinheiro nesta faixa: o contrato limita valor a
 * R$ 999.999.999,99 com duas casas, e um `double` representa inteiros ate
 * 2^53 sem perda — portanto todo centavo possivel aqui cabe exato. Se um dia o
 * limite subir, isto precisa virar string e a interface formatar a partir dela.
 */
function paraNumero(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : Number(valor);
}
