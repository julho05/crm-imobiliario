import type { LeadSource, LeadStatus } from '@app/shared';

/**
 * O lead como a API do CRM o devolve, e os utilitarios de exibicao.
 *
 * Espelha `apps/api/src/leads/resposta.ts`. Nao e importado de la de proposito:
 * `packages/shared` nao pode depender de `apps/`, e o site tambem nao deve
 * alcancar o codigo interno da API.
 */
export type Lead = {
  id: string;
  nomeCompleto: string;
  telefone: string | null;
  email: string | null;
  origem: LeadSource;
  status: LeadStatus;
  observacoes: string | null;
  responsavel: { membershipId: string; nome: string } | null;
  consentimento: { dadoEm: string; versaoDoAviso: string | null } | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type PaginaDeLeads = {
  leads: Lead[];
  total: number;
  pagina: number;
  porPagina: number;
};

/**
 * Duplicata sinalizada no cadastro, nos dois niveis que a API devolve.
 *
 * O nivel `restrita` existe porque `lead:ver` e `OWN` para o corretor: a
 * duplicata que pertence a um colega chega **sem** nome e **sem** responsavel,
 * para nao vazar a carteira dele pela porta do cadastro. A tela mostra os dois
 * casos de formas diferentes, e e importante que mostre — um aviso que nao diz
 * o que fazer e pior do que nenhum.
 */
export type Duplicata =
  | {
      nivel: 'visivel';
      id: string;
      nomeCompleto: string;
      responsavel: string | null;
      criadoEm: string;
    }
  | { nivel: 'restrita' };

/**
 * Telefone brasileiro para leitura.
 *
 * O banco guarda somente digitos (`docs/data-model.md` §3.4), porque e o que
 * torna possivel detectar duplicata. A formatacao e assunto de exibicao, e
 * mora aqui.
 */
export function formatarTelefone(telefone: string | null): string | null {
  if (!telefone) {
    return null;
  }

  if (telefone.length === 11) {
    return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 7)}-${telefone.slice(7)}`;
  }

  if (telefone.length === 10) {
    return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 6)}-${telefone.slice(6)}`;
  }

  // Comprimento inesperado — telefone importado de planilha antiga, por
  // exemplo. Mostra como esta, em vez de recortar e exibir numero errado.
  return telefone;
}

/** Data e hora no fuso local, como `CLAUDE.md` pede. */
export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Quem pode agir neste lead?
 *
 * **Isto nao autoriza nada** — serve para nao mostrar um botao que vai
 * responder erro. A decisao e do servidor, em cada requisicao.
 *
 * Diferente de imoveis num ponto: aqui o lead fora do alcance nem chega a
 * aparecer na lista, porque `lead:ver` e `OWN`. Entao esta funcao decide quase
 * sempre entre "pode" e "pode, mas nao e seu" dentro do que ja veio.
 */
export function ehResponsavel(
  lead: Lead,
  membershipId: string | undefined,
): boolean {
  return (
    membershipId !== undefined &&
    lead.responsavel?.membershipId === membershipId
  );
}

/**
 * A ordem das situacoes no funil de atendimento.
 *
 * Nao sai de `Object.values(LeadStatus)` porque a ordem do enum e a do schema
 * do Prisma, e aqui a ordem tem significado: e a sequencia que a pessoa segue.
 * `DISQUALIFIED` fica no fim, ao lado de `CONVERTED`, porque os dois sao
 * desfechos.
 */
export const ORDEM_DAS_SITUACOES: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'CONVERTED',
  'DISQUALIFIED',
];
