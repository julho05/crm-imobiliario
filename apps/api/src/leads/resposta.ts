import type { LeadSource, LeadStatus } from '@app/shared';

/**
 * O lead como a API do CRM o devolve, montado campo a campo.
 *
 * ## O que fica de fora, e por que
 *
 * - **`consentIpHash`** — e prova de consentimento, guardada como hash
 *   (`docs/data-model.md` §7). Devolve-la a interface nao serve a ninguem e
 *   espalha um dado que existe para ficar parado.
 * - **`anonymizedAt`** e **`deletedAt`** — estado interno. Lead anonimizado ou
 *   excluido nao aparece nas listas, entao a interface nunca precisa do campo
 *   para decidir nada.
 *
 * `consentGivenAt` e `privacyNoticeVersion` **entram**: quem atende precisa
 * saber se aquela pessoa consentiu e com qual versao do aviso, porque e isso
 * que autoriza o contato.
 */
export type RespostaDeLead = {
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

/** O registro como `SELECAO_DE_LEAD` o carrega. */
type LeadCarregado = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  notes: string | null;
  assignedMemberId: string | null;
  consentGivenAt: Date | null;
  privacyNoticeVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignedMember: { id: string; user: { name: string } } | null;
};

export function paraRespostaDeLead(lead: LeadCarregado): RespostaDeLead {
  return {
    id: lead.id,
    nomeCompleto: lead.fullName,
    telefone: lead.phone,
    email: lead.email,
    origem: lead.source,
    status: lead.status,
    observacoes: lead.notes,
    // Aponta para o `Membership`, nunca para o `User` (data-model.md §3.3). O
    // nome vem junto porque a lista o exibe, e buscar por lead seria a consulta
    // N+1 que o item B10 proibe.
    responsavel: lead.assignedMember
      ? {
          membershipId: lead.assignedMember.id,
          nome: lead.assignedMember.user.name,
        }
      : null,
    // Agrupado num objeto so, em vez de dois campos soltos: consentimento sem
    // data nao e consentimento, e a versao sozinha nao diz nada. Juntos, ou
    // `null`.
    consentimento: lead.consentGivenAt
      ? {
          dadoEm: lead.consentGivenAt.toISOString(),
          versaoDoAviso: lead.privacyNoticeVersion,
        }
      : null,
    criadoEm: lead.createdAt.toISOString(),
    atualizadoEm: lead.updatedAt.toISOString(),
  };
}

/**
 * Possivel duplicata, sinalizada no cadastro.
 *
 * **[DECIDIDO 19/10/2026]** Duplicata por telefone e **sinalizada**, nunca
 * unida automaticamente (`docs/data-model.md` §9, decisao 1). Fundir dois leads
 * perde informacao que nao volta — qual corretor falou com a pessoa primeiro, e
 * sobre qual imovel.
 *
 * ## Por que existe uma forma sem nome nem responsavel
 *
 * Porque `lead:ver` e `OWN` para o corretor. Devolver nome e responsavel de uma
 * duplicata que pertence a um colega vazaria a carteira dele pela porta do
 * cadastro — exatamente o que o escopo `OWN` existe para impedir, e o tipo de
 * vazamento indireto que `docs/permissions.md` §8.2 manda testar.
 *
 * Entao a sinalizacao tem dois niveis:
 *
 * - **`visivel`**: a duplicata esta no alcance de quem cadastrou. Vem com nome
 *   e responsavel, e a interface pode oferecer o link.
 * - **`restrita`**: existe, mas pertence a outra pessoa. Vem **sem** nome e
 *   **sem** responsavel. Quem cadastrou sabe que nao deve ligar, e o gerente
 *   resolve.
 *
 * O nivel `restrita` ainda revela *que* alguem na organizacao tem aquele
 * telefone. E uma troca deliberada: sem nenhum aviso, dois corretores ligam
 * para a mesma pessoa no mesmo dia, que e o problema concreto que a
 * imobiliaria sente. Com o aviso completo, a carteira vaza. O meio-termo
 * entrega o que evita a ligacao duplicada e nada mais.
 */
export type DuplicataSinalizada =
  | {
      nivel: 'visivel';
      id: string;
      nomeCompleto: string;
      responsavel: string | null;
      criadoEm: string;
    }
  | { nivel: 'restrita' };
