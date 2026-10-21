import type { LeadStatus } from '@app/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * A negociação como a API do CRM a devolve, montada campo a campo.
 *
 * ## Por que o lead vem junto, e reduzido
 *
 * Porque um funil sem o nome do cliente é uma coluna de valores sem sentido —
 * a tela precisa dizer "Proposta: Marcia Albuquerque, R$ 450.000". Mas vem
 * **reduzido**: nome, situação e responsável. Telefone, e-mail e anotações
 * ficam no lead, acessíveis por `/leads/:id`.
 *
 * Isso não é economia de bytes. A negociação é lida em lista, muitas por tela;
 * cada campo pessoal a mais multiplica por vinte o dado que atravessa a rede e
 * fica no cache do navegador. O princípio é o da LGPD: carregar o que a tela
 * usa, não o que o registro tem.
 *
 * ## O responsável do lead vem aqui de propósito
 *
 * É **ele** que decide quem vê esta negociação, não `responsavel`. Devolvê-lo
 * permite à interface explicar por que alguém alcança ou não um registro, em
 * vez de a pessoa descobrir por tentativa.
 */
export type RespostaDeNegociacao = {
  id: string;
  etapa: {
    id: string;
    nome: string;
    posicao: number;
    ganho: boolean;
    perdido: boolean;
  };
  cliente: {
    id: string;
    nomeCompleto: string;
    situacao: LeadStatus;
    /** Responsável pelo **lead** — quem a visibilidade segue. */
    responsavel: { membershipId: string; nome: string } | null;
  };
  imovel: {
    id: string;
    codigo: string;
    titulo: string;
  } | null;
  /** Quem conduz a negociação. Pode ser diferente de quem a enxerga. */
  responsavel: { membershipId: string; nome: string } | null;
  valorEsperado: number | null;
  fechadaEm: string | null;
  motivoDaPerda: string | null;
  criadaEm: string;
  atualizadaEm: string;
};

/** O registro como `SELECAO_DE_NEGOCIACAO` o carrega. */
type NegociacaoCarregada = {
  id: string;
  expectedAmount: Prisma.Decimal | null;
  closedAt: Date | null;
  lostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  stage: {
    id: string;
    name: string;
    position: number;
    isWon: boolean;
    isLost: boolean;
  };
  lead: {
    id: string;
    fullName: string;
    status: LeadStatus;
    assignedMemberId: string | null;
    assignedMember: { id: string; user: { name: string } } | null;
  };
  property: { id: string; code: string; title: string } | null;
  assignedMember: { id: string; user: { name: string } } | null;
};

export function paraRespostaDeNegociacao(
  negociacao: NegociacaoCarregada,
): RespostaDeNegociacao {
  return {
    id: negociacao.id,
    etapa: {
      id: negociacao.stage.id,
      nome: negociacao.stage.name,
      posicao: negociacao.stage.position,
      ganho: negociacao.stage.isWon,
      perdido: negociacao.stage.isLost,
    },
    cliente: {
      id: negociacao.lead.id,
      nomeCompleto: negociacao.lead.fullName,
      situacao: negociacao.lead.status,
      responsavel: negociacao.lead.assignedMember
        ? {
            membershipId: negociacao.lead.assignedMember.id,
            nome: negociacao.lead.assignedMember.user.name,
          }
        : null,
    },
    imovel: negociacao.property
      ? {
          id: negociacao.property.id,
          codigo: negociacao.property.code,
          titulo: negociacao.property.title,
        }
      : null,
    responsavel: negociacao.assignedMember
      ? {
          membershipId: negociacao.assignedMember.id,
          nome: negociacao.assignedMember.user.name,
        }
      : null,
    valorEsperado:
      negociacao.expectedAmount === null
        ? null
        : Number(negociacao.expectedAmount),
    fechadaEm: negociacao.closedAt?.toISOString() ?? null,
    motivoDaPerda: negociacao.lostReason,
    criadaEm: negociacao.createdAt.toISOString(),
    atualizadaEm: negociacao.updatedAt.toISOString(),
  };
}

/** Uma etapa do funil, como a interface a consome. */
export type RespostaDeEtapa = {
  id: string;
  nome: string;
  posicao: number;
  ganho: boolean;
  perdido: boolean;
};

/**
 * Resumo por etapa: quantas negociações e quanto valem.
 *
 * Existe para que o quadro do funil mostre o total de cada coluna **sem**
 * carregar todas as negociações de todas as etapas. Com seis colunas e
 * paginação por coluna, somar no cliente daria o total da página, não da
 * etapa — e o número exibido estaria errado de um jeito difícil de notar.
 *
 * Os números respeitam o mesmo recorte de visibilidade da listagem: o corretor
 * vê o total **dele**, não o da organização. Um resumo que somasse tudo
 * contaria quantas negociações os colegas têm, que é informação da carteira
 * deles.
 */
export type ResumoDaEtapa = RespostaDeEtapa & {
  quantidade: number;
  valorTotal: number;
};
