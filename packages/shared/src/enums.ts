/**
 * Enums compartilhados entre a API e o site.
 *
 * ## Por que estes existem se o Prisma ja gera os mesmos enums
 *
 * O client do Prisma vive em `apps/api/src/generated/`, e nao e versionado.
 * Um pacote em `packages/` nao pode importar de dentro de um `apps/` — seria
 * dependencia invertida, e nenhuma build do front sobreviveria a isso.
 *
 * Entao a direcao e sempre a mesma: `shared` nao importa nada; API e web
 * importam `shared`. Nao existe ciclo possivel.
 *
 * O preco e ter o mesmo conjunto de valores escrito em dois lugares. O
 * contrapeso e um teste de paridade (`apps/api/test/enums-paridade.spec.ts`)
 * que falha se este arquivo e o schema do Prisma divergirem, nos dois
 * sentidos. Divergencia silenciosa e o que o teste impede.
 *
 * ## Criterio para entrar aqui
 *
 * Apenas enums com uso concreto na interface. Os que so o servidor decide
 * ficam de fora, listados em `ENUMS_SOMENTE_SERVIDOR` para que o teste
 * saiba que a ausencia e deliberada, nao esquecimento.
 */

// ---------------------------------------------------------------------------
// Identidade e acesso
// ---------------------------------------------------------------------------

/** Papeis dentro da organizacao. Ver docs/permissions.md §2.1. */
export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  AGENT: 'AGENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/**
 * Hierarquia, do mais poderoso ao menos. Serve para ordenar listas e
 * desabilitar opcoes na interface.
 *
 * **Nao use isto para autorizar.** A autorizacao e por regra explicita no
 * servidor (docs/permissions.md §6), nunca por comparacao de posicao.
 */
export const ORDEM_DOS_PAPEIS: readonly Role[] = [
  Role.OWNER,
  Role.ADMIN,
  Role.MANAGER,
  Role.AGENT,
] as const;

export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type MembershipStatus =
  (typeof MembershipStatus)[keyof typeof MembershipStatus];

/** Muda apenas textos e telas. Nunca entra em verificacao de permissao. */
export const OrganizationKind = {
  SOLO: 'SOLO',
  AGENCY: 'AGENCY',
} as const;
export type OrganizationKind =
  (typeof OrganizationKind)[keyof typeof OrganizationKind];

export const ThemePreference = {
  LIGHT: 'LIGHT',
  DARK: 'DARK',
  SYSTEM: 'SYSTEM',
} as const;
export type ThemePreference =
  (typeof ThemePreference)[keyof typeof ThemePreference];

// ---------------------------------------------------------------------------
// Imoveis
// ---------------------------------------------------------------------------

export const PropertyType = {
  APARTMENT: 'APARTMENT',
  HOUSE: 'HOUSE',
  LAND: 'LAND',
  COMMERCIAL: 'COMMERCIAL',
  RURAL: 'RURAL',
  OTHER: 'OTHER',
} as const;
export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];

export const PropertyPurpose = {
  SALE: 'SALE',
  RENT: 'RENT',
  BOTH: 'BOTH',
} as const;
export type PropertyPurpose =
  (typeof PropertyPurpose)[keyof typeof PropertyPurpose];

/** Estado comercial. Diferente de publicacao, que e `publishedAt`. */
export const PropertyStatus = {
  DRAFT: 'DRAFT',
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  SOLD: 'SOLD',
  RENTED: 'RENTED',
  INACTIVE: 'INACTIVE',
} as const;
export type PropertyStatus =
  (typeof PropertyStatus)[keyof typeof PropertyStatus];

/**
 * Status que o catalogo publico pode exibir. `RESERVED` aparece com etiqueta
 * visivel (decisao de 19/10/2026 em docs/data-model.md §9).
 *
 * O catalogo publico filtra no servidor. Esta lista existe para a interface
 * saber o que rotular, nao para decidir visibilidade.
 */
export const STATUS_VISIVEIS_NO_CATALOGO: readonly PropertyStatus[] = [
  PropertyStatus.AVAILABLE,
  PropertyStatus.RESERVED,
] as const;

/** Padrao restritivo: na duvida, o endereco nao vaza. */
export const AddressVisibility = {
  FULL: 'FULL',
  STREET_ONLY: 'STREET_ONLY',
  NEIGHBORHOOD_ONLY: 'NEIGHBORHOOD_ONLY',
} as const;
export type AddressVisibility =
  (typeof AddressVisibility)[keyof typeof AddressVisibility];

export const MediaKind = {
  PHOTO: 'PHOTO',
  FLOORPLAN: 'FLOORPLAN',
  VIDEO: 'VIDEO',
  DOCUMENT: 'DOCUMENT',
} as const;
export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];

/**
 * Midia que pode ir ao catalogo publico. `DOCUMENT` nunca entra: matricula
 * e contrato nao sao material de vitrine.
 */
export const MIDIA_PUBLICA: readonly MediaKind[] = [
  MediaKind.PHOTO,
  MediaKind.FLOORPLAN,
] as const;

// ---------------------------------------------------------------------------
// Comercial
// ---------------------------------------------------------------------------

export const LeadSource = {
  PUBLIC_CATALOG: 'PUBLIC_CATALOG',
  MANUAL: 'MANUAL',
  IMPORT: 'IMPORT',
  REFERRAL: 'REFERRAL',
  OTHER: 'OTHER',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  DISQUALIFIED: 'DISQUALIFIED',
  CONVERTED: 'CONVERTED',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const VisitStatus = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  DONE: 'DONE',
  CANCELED: 'CANCELED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type VisitStatus = (typeof VisitStatus)[keyof typeof VisitStatus];

export const TaskStatus = {
  OPEN: 'OPEN',
  DONE: 'DONE',
  CANCELED: 'CANCELED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

// ---------------------------------------------------------------------------
// Funil
// ---------------------------------------------------------------------------

/**
 * Etapas criadas junto com a organizacao. No MVP nao ha tela de edicao
 * (decisao de 19/10/2026), mas `PipelineStage` e tabela, nao enum, para que
 * a edicao futura nao exija migracao.
 *
 * **Divergencia na documentacao, pendente de decisao:** docs/data-model.md
 * §3.4 diz "cinco etapas", mas lista seis nomes
 * (Novo → Contato feito → Visita agendada → Proposta → Fechado / Perdido).
 * Como `PipelineStage` tem `@@unique([organizationId, position])`, "Fechado"
 * e "Perdido" precisam de posicoes diferentes — ou seja, sao seis linhas.
 * Seguimos com seis; se a intencao era cinco, dizer qual sai.
 */
export const ETAPAS_PADRAO_DO_FUNIL = [
  { nome: 'Novo', posicao: 1, isWon: false, isLost: false },
  { nome: 'Contato feito', posicao: 2, isWon: false, isLost: false },
  { nome: 'Visita agendada', posicao: 3, isWon: false, isLost: false },
  { nome: 'Proposta', posicao: 4, isWon: false, isLost: false },
  { nome: 'Fechado', posicao: 5, isWon: true, isLost: false },
  { nome: 'Perdido', posicao: 6, isWon: false, isLost: true },
] as const;

// ---------------------------------------------------------------------------
// Enums que ficam de fora, de proposito
// ---------------------------------------------------------------------------

/**
 * Enums que existem no Prisma e **nao** sao compartilhados, porque so o
 * servidor decide sobre eles. O teste de paridade usa esta lista para
 * distinguir omissao deliberada de esquecimento: um enum novo no schema que
 * nao esteja aqui nem acima faz o teste falhar.
 */
export const ENUMS_SOMENTE_SERVIDOR = [
  // Conta desabilitada nao chega a renderizar interface.
  'UserStatus',
  // Organizacao suspensa e barrada antes de qualquer tela.
  'OrganizationStatus',
  // Planos e limites nao estao definidos; cobranca esta fora do MVP.
  'OrganizationPlan',
  // Nasce fixo em OWN e nao tem tela (docs/permissions.md §4.2).
  'LeadVisibility',
] as const;
