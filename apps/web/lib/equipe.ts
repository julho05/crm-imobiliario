import type { MembershipStatus, Role } from '@app/shared';

/**
 * Tipos da tela de equipe, como a API os devolve.
 *
 * Os campos de administracao sao **opcionais** porque so chegam para quem
 * administra (`equipe:alterarPapel`). A tela decide o que mostrar pela
 * presenca deles, e nao pelo papel da sessao: se a regra mudar no servidor, a
 * tela acompanha sem edicao.
 */

export type Carteira = {
  imoveis: number;
  clientes: number;
  negociacoes: number;
  visitas: number;
  tarefas: number;
};

export type MembroDetalhado = {
  membershipId: string;
  nome: string;
  papel: Role;
  situacao: MembershipStatus;
  euMesmo: boolean;
  email?: string;
  entrouEm?: string;
  carteira?: Carteira;
  podeAlterarPapel?: boolean;
  podeRemover?: boolean;
};

export type ConvitePendente = {
  id: string;
  email: string;
  papel: Role;
  expiresAt: string;
  criadoEm: string;
  expirado: boolean;
};

const ROTULOS_DA_CARTEIRA: Record<keyof Carteira, [string, string]> = {
  imoveis: ['imóvel', 'imóveis'],
  clientes: ['cliente', 'clientes'],
  negociacoes: ['negociação', 'negociações'],
  visitas: ['visita pendente', 'visitas pendentes'],
  tarefas: ['tarefa aberta', 'tarefas abertas'],
};

/** "3 imoveis, 1 cliente" — so o que nao e zero, na ordem da carteira. */
export function descreverCarteira(carteira: Carteira): string[] {
  return (Object.keys(ROTULOS_DA_CARTEIRA) as (keyof Carteira)[])
    .filter((campo) => carteira[campo] > 0)
    .map((campo) => {
      const [singular, plural] = ROTULOS_DA_CARTEIRA[campo];
      const n = carteira[campo];
      return `${n} ${n === 1 ? singular : plural}`;
    });
}

export function carteiraVazia(carteira: Carteira): boolean {
  return Object.values(carteira).every((n) => n === 0);
}
