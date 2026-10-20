/**
 * Rotulos em portugues do Brasil para os enums.
 *
 * Ficam no pacote compartilhado por um motivo concreto: os mesmos nomes
 * aparecem no CRM, no catalogo publico e, mais tarde, em e-mail enviado pela
 * API. Mantidos em cada lugar, divergem — e o usuario le "Disponivel" numa
 * tela e "Ativo" na outra para o mesmo estado.
 *
 * `Record<Enum, string>` e deliberado: valor novo no enum quebra a
 * compilacao aqui, em vez de aparecer na tela como texto cru.
 */

import {
  AddressVisibility,
  LeadSource,
  LeadStatus,
  MediaKind,
  MembershipStatus,
  OrganizationKind,
  PropertyPurpose,
  PropertyStatus,
  PropertyType,
  Role,
  TaskStatus,
  ThemePreference,
  VisitStatus,
} from './enums';

export const ROTULOS_DE_PAPEL: Record<Role, string> = {
  OWNER: 'Proprietario',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  AGENT: 'Corretor',
};

export const ROTULOS_DE_STATUS_DE_MEMBRO: Record<MembershipStatus, string> = {
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
};

export const ROTULOS_DE_TIPO_DE_ORGANIZACAO: Record<OrganizationKind, string> =
  {
    SOLO: 'Corretor autonomo',
    AGENCY: 'Imobiliaria',
  };

export const ROTULOS_DE_TEMA: Record<ThemePreference, string> = {
  LIGHT: 'Claro',
  DARK: 'Escuro',
  SYSTEM: 'Seguir o sistema',
};

export const ROTULOS_DE_TIPO_DE_IMOVEL: Record<PropertyType, string> = {
  APARTMENT: 'Apartamento',
  HOUSE: 'Casa',
  LAND: 'Terreno',
  COMMERCIAL: 'Comercial',
  RURAL: 'Rural',
  OTHER: 'Outro',
};

export const ROTULOS_DE_FINALIDADE: Record<PropertyPurpose, string> = {
  SALE: 'Venda',
  RENT: 'Aluguel',
  BOTH: 'Venda e aluguel',
};

export const ROTULOS_DE_STATUS_DE_IMOVEL: Record<PropertyStatus, string> = {
  DRAFT: 'Rascunho',
  AVAILABLE: 'Disponivel',
  RESERVED: 'Reservado',
  SOLD: 'Vendido',
  RENTED: 'Alugado',
  INACTIVE: 'Inativo',
};

export const ROTULOS_DE_VISIBILIDADE_DE_ENDERECO: Record<
  AddressVisibility,
  string
> = {
  FULL: 'Endereco completo',
  STREET_ONLY: 'Apenas a rua',
  NEIGHBORHOOD_ONLY: 'Apenas o bairro',
};

export const ROTULOS_DE_TIPO_DE_MIDIA: Record<MediaKind, string> = {
  PHOTO: 'Foto',
  FLOORPLAN: 'Planta',
  VIDEO: 'Video',
  DOCUMENT: 'Documento',
};

export const ROTULOS_DE_ORIGEM_DE_LEAD: Record<LeadSource, string> = {
  PUBLIC_CATALOG: 'Catalogo publico',
  MANUAL: 'Cadastro manual',
  IMPORT: 'Importacao',
  REFERRAL: 'Indicacao',
  OTHER: 'Outra',
};

export const ROTULOS_DE_STATUS_DE_LEAD: Record<LeadStatus, string> = {
  NEW: 'Novo',
  CONTACTED: 'Contato feito',
  QUALIFIED: 'Qualificado',
  DISQUALIFIED: 'Desqualificado',
  CONVERTED: 'Convertido',
};

export const ROTULOS_DE_STATUS_DE_VISITA: Record<VisitStatus, string> = {
  SCHEDULED: 'Agendada',
  CONFIRMED: 'Confirmada',
  DONE: 'Realizada',
  CANCELED: 'Cancelada',
  NO_SHOW: 'Nao compareceu',
};

export const ROTULOS_DE_STATUS_DE_TAREFA: Record<TaskStatus, string> = {
  OPEN: 'Aberta',
  DONE: 'Concluida',
  CANCELED: 'Cancelada',
};
