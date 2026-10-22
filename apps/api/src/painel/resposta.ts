import type { RespostaDeVisita } from '../agenda/resposta';

/**
 * O resumo do painel, montado campo a campo.
 *
 * ## Cada número tem um escopo próprio, e a resposta diz qual
 *
 * `escopos` não é informação de depuração: é o que permite à tela escrever a
 * frase certa em volta do número. "3 clientes novos" significa coisas
 * diferentes para o corretor (os dele) e para o gerente (os da casa), e uma
 * tela que não sabe a diferença escreve um rótulo que mente para metade dos
 * papéis.
 *
 * ## `null` não é zero
 *
 * `leadsNaFila` é `null` para quem não alcança a fila — `lead:verNaoAtribuidos`
 * é `false` para o `AGENT`. Devolver `0` ali seria afirmar que a fila está
 * vazia, e a tela mostraria um contador tranquilizador sobre um número que
 * ninguém mediu. `null` diz "esta pergunta não é sua", e a tela omite o cartão.
 */

export type EscopoDoNumero = 'ORG' | 'OWN';

export type RespostaDoResumo = {
  /** Qual recorte cada número usou, para a tela rotular com honestidade. */
  escopos: {
    clientes: EscopoDoNumero;
    imoveis: EscopoDoNumero;
    agenda: EscopoDoNumero;
  };
  /** Clientes em `NEW`: os que ainda não receberam primeiro contato. */
  clientesNovos: number;
  /** `null` quando o papel não alcança a fila de não atribuídos. */
  clientesNaFila: number | null;
  /** Abertas com prazo no passado. Calculado com o relógio do servidor. */
  tarefasVencidas: number;
  /** Cadastro começado e não publicado, no alcance de quem pode terminá-lo. */
  imoveisEmRascunho: number;
  /**
   * As visitas da janela que o cliente pediu — hoje e amanhã, no fuso dele.
   *
   * Vem a lista, e não só o total, porque "duas visitas amanhã" não diz com
   * quem nem onde, e é justamente isso que a pessoa abre o painel para ver. O
   * total existe para quando a lista for cortada.
   */
  visitas: {
    total: number;
    proximas: RespostaDeVisita[];
  };
  /**
   * O que a organização já tem, para a tela decidir entre painel e guia.
   *
   * São contagens da **organização inteira**, sem recorte por responsável, e
   * isso é deliberado: a pergunta aqui não é "o que é meu?", e sim "esta casa
   * já começou a operar?". Para o corretor novo numa imobiliária povoada, a
   * resposta é sim, e ele vê o painel — não um guia de primeiros passos que
   * manda cadastrar o primeiro imóvel de uma empresa com duzentos.
   *
   * Não vazam dados: são três booleanos sobre a própria organização de quem
   * pergunta, e dizem apenas que algo existe, nunca o que é.
   */
  primeirosPassos: {
    temImovel: boolean;
    temImovelPublicado: boolean;
    temCliente: boolean;
  };
};
