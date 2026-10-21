import { PropertyType } from '@app/shared';
import type { Prisma } from '../generated/prisma/client';

/**
 * Geracao do codigo de referencia do imovel.
 *
 * **[DECIDIDO 21/10/2026]** O codigo e gerado quando a pessoa nao informa um,
 * e respeitado quando informa. Prefixo por tipo e sequencial por organizacao:
 * `AP-001`, `CA-002`.
 *
 * ## Por que o prefixo vem do tipo
 *
 * Porque o codigo e lido em voz alta e colado no WhatsApp. `AP-014` diz algo a
 * quem atende o telefone; `014` nao diz nada. Custa um `switch` e economiza uma
 * consulta ao sistema a cada atendimento.
 *
 * ## Por que o sequencial e por organizacao
 *
 * `Property` tem `@@unique([organizationId, code])`, e nao unicidade global —
 * de proposito (ver o comentario no `schema.prisma`). Sequencial global
 * vazaria informacao entre clientes: a imobiliaria que cadastrasse dois
 * imoveis seguidos e recebesse `AP-087` e `AP-412` saberia quantos imoveis as
 * outras cadastraram no intervalo.
 */

const PREFIXO_POR_TIPO: Record<PropertyType, string> = {
  APARTMENT: 'AP',
  HOUSE: 'CA',
  LAND: 'TE',
  COMMERCIAL: 'CO',
  RURAL: 'RU',
  OTHER: 'IM',
};

/** Quantos digitos o sequencial tem antes de precisar crescer. */
const DIGITOS = 3;

/**
 * Proximo codigo livre para o tipo, naquela organizacao.
 *
 * ## Por que o maior existente, e nao a contagem
 *
 * Contar imoveis e reutilizar numero de registro excluido. O codigo de um
 * imovel vendido continua em contrato, em anuncio e na memoria do cliente;
 * reciclar esse numero em outro imovel confunde quem conferir depois. O maior
 * sufixo so cresce.
 *
 * ## Por que isto nao basta sozinho
 *
 * Nao e atomico: duas requisicoes simultaneas leem o mesmo maior sufixo e
 * tentam o mesmo codigo. Uma delas perde no indice unico, e e por isso que
 * `ImoveisService` chama esta funcao dentro de um laco de retentativa, em vez
 * de confiar no resultado. A alternativa seria uma tabela de contadores com
 * bloqueio por linha, que serializaria todo cadastro da organizacao para
 * resolver uma colisao que acontece quando duas pessoas salvam no mesmo
 * segundo.
 */
export async function proximoCodigoDisponivel(
  cliente: Prisma.TransactionClient,
  organizationId: string,
  tipo: PropertyType,
): Promise<string> {
  const prefixo = PREFIXO_POR_TIPO[tipo];

  // `startsWith` com o hifen junto evita casar `AP` com um codigo digitado a
  // mao como `APX-1`, que nao pertence a esta sequencia.
  const existentes = await cliente.property.findMany({
    where: { organizationId, code: { startsWith: `${prefixo}-` } },
    select: { code: true },
  });

  const maiorSufixo = existentes.reduce((maior, { code }) => {
    const sufixo = Number(code.slice(prefixo.length + 1));

    // Codigo fora do formato — digitado a mao como `AP-FUNDOS` — nao entra na
    // conta. Ignorar e certo: ele ocupa o nome, nao a posicao na sequencia.
    return Number.isInteger(sufixo) && sufixo > maior ? sufixo : maior;
  }, 0);

  return `${prefixo}-${String(maiorSufixo + 1).padStart(DIGITOS, '0')}`;
}
