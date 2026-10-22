import type { Visita } from './agenda';

/**
 * O resumo do painel como a API o devolve.
 *
 * Espelha `apps/api/src/painel/resposta.ts`.
 */

export type EscopoDoNumero = 'ORG' | 'OWN';

export type Resumo = {
  /**
   * Qual recorte cada número usou.
   *
   * A tela precisa disso para escrever o rótulo certo: "3 clientes novos"
   * significa "os seus" para o corretor e "os da casa" para o gerente, e uma
   * legenda única mentiria para metade dos papéis.
   */
  escopos: {
    clientes: EscopoDoNumero;
    imoveis: EscopoDoNumero;
    agenda: EscopoDoNumero;
  };
  clientesNovos: number;
  /** `null` quando o papel não alcança a fila — não é zero. */
  clientesNaFila: number | null;
  tarefasVencidas: number;
  imoveisEmRascunho: number;
  visitas: { total: number; proximas: Visita[] };
  primeirosPassos: {
    temImovel: boolean;
    temImovelPublicado: boolean;
    temCliente: boolean;
  };
};

/**
 * A janela de hoje e amanhã, em hora **local**, como o contrato exige.
 *
 * O servidor não sabe onde quem pergunta está, e `docs/data-model.md` §1 proíbe
 * adivinhar. Calculada em UTC, esta janela mostraria a agenda de amanhã às 22h
 * de Brasília — e diria "nenhuma visita hoje" a quem ainda tem uma pela frente.
 *
 * Dois dias de largura, e não um: o painel responde "hoje e amanhã", porque a
 * visita de amanhã cedo é a que ainda dá tempo de preparar hoje.
 */
export function janelaDeHojeEAmanha(): string {
  const de = new Date();
  de.setHours(0, 0, 0, 0);

  const ate = new Date(de);
  ate.setDate(ate.getDate() + 2);

  return new URLSearchParams({
    de: de.toISOString(),
    ate: ate.toISOString(),
  }).toString();
}

/** Plural sem `if` espalhado pela tela. */
export function plural(
  quantidade: number,
  singular: string,
  plural: string,
): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}
