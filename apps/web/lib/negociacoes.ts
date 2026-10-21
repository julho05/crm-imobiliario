import type { LeadStatus } from '@app/shared';

/**
 * A negociação como a API do CRM a devolve, e os utilitários do funil.
 *
 * Espelha `apps/api/src/negociacoes/resposta.ts`.
 */
export type Negociacao = {
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
  imovel: { id: string; codigo: string; titulo: string } | null;
  responsavel: { membershipId: string; nome: string } | null;
  valorEsperado: number | null;
  fechadaEm: string | null;
  motivoDaPerda: string | null;
  criadaEm: string;
  atualizadaEm: string;
};

export type Etapa = {
  id: string;
  nome: string;
  posicao: number;
  ganho: boolean;
  perdido: boolean;
};

export type ResumoDaEtapa = Etapa & {
  quantidade: number;
  valorTotal: number;
};

export type PaginaDeNegociacoes = {
  negociacoes: Negociacao[];
  total: number;
  pagina: number;
  porPagina: number;
};

/**
 * Valor em BRL, **abreviado** — `R$ 467 mil`, `R$ 1,2 mi`.
 *
 * O funil mostra um total por coluna, e seis colunas lado a lado. Com o valor
 * inteiro (`R$ 467.000,00`) o número não cabe no celular e a coluna quebra. A
 * forma longa continua na tela da negociação, onde há espaço e onde o número
 * exato importa.
 */
export function formatarValorCurto(valor: number): string {
  if (valor === 0) {
    return '—';
  }

  if (valor >= 1_000_000) {
    const milhoes = valor / 1_000_000;
    // Uma casa decimal só quando ela diz algo: `R$ 1,2 mi` ajuda, `R$ 2,0 mi`
    // só ocupa espaço.
    return `R$ ${milhoes.toLocaleString('pt-BR', {
      maximumFractionDigits: milhoes < 10 ? 1 : 0,
    })} mi`;
  }

  if (valor >= 1_000) {
    return `R$ ${Math.round(valor / 1_000).toLocaleString('pt-BR')} mil`;
  }

  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

/** Valor completo, para a tela da negociação. */
export function formatarValor(valor: number | null): string {
  if (valor === null) {
    return '—';
  }

  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}
