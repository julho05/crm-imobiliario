/**
 * Resumo do painel — item **B9** do
 * [roadmap.md](../../../../docs/roadmap.md).
 *
 * ## Só uma entrada, e ela é uma janela de tempo
 *
 * O resumo não recebe filtros: o que ele mostra é decidido pelo papel de quem
 * pergunta, no servidor, e não por parâmetro. A única coisa que o cliente
 * informa é **o que "hoje" significa para ele**.
 *
 * Isso não é cerimônia. O servidor não tem como saber o fuso de quem olha, e
 * `docs/data-model.md` §1 já registra o motivo de não adivinhar: o Brasil tem
 * fusos distintos e o horário de verão pode voltar. Um resumo que calculasse
 * "hoje" em UTC mostraria, às 22h de Brasília, a agenda de amanhã — e diria
 * "nenhuma visita hoje" a quem ainda tem uma visita pela frente.
 *
 * A janela vem do navegador, como na agenda (item B8). Mentir nela não vaza
 * nada: muda apenas o recorte de tempo do próprio pedido, e todo registro
 * continua passando pelo recorte de visibilidade do papel.
 */

import { z } from 'zod';

/** Instante em ISO 8601 **com fuso**, igual ao contrato da agenda. */
const instanteSchema = z.iso.datetime({
  offset: true,
  message: 'Data e hora invalidas.',
});

/**
 * A janela de "hoje e amanhã", em hora local de quem pergunta.
 *
 * O teto de três dias é deliberado: o resumo é a pergunta "o que tenho agora?",
 * e a agenda já responde "o que tenho no mês". Sem teto, este endpoint viraria
 * um segundo caminho para listar a agenda inteira — com outro recorte, outro
 * limite e outro conjunto de testes, que divergiriam no primeiro ajuste.
 */
export const janelaDoResumoSchema = z
  .object({
    de: instanteSchema,
    ate: instanteSchema,
  })
  .refine((v) => new Date(v.ate) > new Date(v.de), {
    message: 'O fim do periodo precisa ser depois do inicio.',
    path: ['ate'],
  })
  .refine(
    (v) =>
      new Date(v.ate).getTime() - new Date(v.de).getTime() <=
      3 * 24 * 60 * 60 * 1000,
    {
      message:
        'O resumo cobre no maximo tres dias. Para o resto, use a agenda.',
      path: ['ate'],
    },
  );
export type JanelaDoResumo = z.infer<typeof janelaDoResumoSchema>;
