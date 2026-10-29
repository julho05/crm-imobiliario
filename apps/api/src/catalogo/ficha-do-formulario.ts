import { timingSafeEqual } from 'node:crypto';
import { hmacDoServidor } from '../comum/hash-de-ip';

/**
 * A ficha do formulário de interesse — item **C6**.
 *
 * ## Por que a hora vem assinada
 *
 * O tempo mínimo de preenchimento só barra robô se quem marca a hora for o
 * servidor. Se o formulário dissesse "abri há 5 segundos", o robô diria o
 * mesmo. A ficha é `<emitidaEm>.<hmac>`: o navegador a recebe ao carregar o
 * formulário e a devolve no envio, e sem o segredo não há como fabricar uma
 * com hora anterior.
 *
 * ## O que ela não impede, dito com honestidade
 *
 * Um robô escrito para este site pede a ficha, espera dois segundos e envia. A
 * ficha não pretende barrar esse — ela encarece o envio em massa, que passa a
 * exigir uma ida a mais ao servidor e espera. O que segura o robô dedicado é o
 * limite por IP (`LIMITES.capturaPorIp`).
 *
 * ## Ligada à organização
 *
 * O slug entra na assinatura: a ficha emitida para a vitrine da Aurora não
 * vale no formulário de outra imobiliária.
 *
 * ## O segredo é o mesmo do HMAC do servidor
 *
 * Com o prefixo `ficha-de-interesse` na mensagem, a assinatura não se confunde
 * com nenhum outro uso do mesmo segredo — a chave do limite de tentativas e o
 * hash de IP assinam textos de outro formato.
 */

/** Menos do que isso, nenhuma pessoa preencheu nome, contato e o aceite. */
export const TEMPO_MINIMO_EM_MS = 2_000;

/**
 * Página esquecida aberta de um dia para o outro ainda envia. Mais do que
 * isso, a ficha velha viraria uma ficha de uso eterno.
 */
export const VALIDADE_EM_MS = 24 * 60 * 60 * 1000;

export type ResultadoDaFicha = 'valida' | 'cedo' | 'invalida';

export function emitirFicha(slug: string, agora = Date.now()): string {
  return `${agora}.${assinar(slug, agora)}`;
}

export function conferirFicha(
  slug: string,
  ficha: string,
  agora = Date.now(),
): ResultadoDaFicha {
  const [textoDaHora, assinatura, ...resto] = ficha.split('.');

  if (resto.length > 0 || !textoDaHora || !assinatura) {
    return 'invalida';
  }

  if (!/^\d{1,15}$/.test(textoDaHora)) {
    return 'invalida';
  }

  const emitidaEm = Number(textoDaHora);
  const esperada = Buffer.from(assinar(slug, emitidaEm));
  const recebida = Buffer.from(assinatura);

  // Comparação em tempo constante: a comum devolve mais cedo no primeiro
  // caractere diferente, e o tempo de resposta ensinaria a assinatura.
  if (
    esperada.length !== recebida.length ||
    !timingSafeEqual(esperada, recebida)
  ) {
    return 'invalida';
  }

  const idade = agora - emitidaEm;

  // Hora no futuro só sai de ficha adulterada, e a assinatura já a teria
  // recusado; a conferência fica para não depender disso.
  if (idade < 0 || idade > VALIDADE_EM_MS) {
    return 'invalida';
  }

  return idade < TEMPO_MINIMO_EM_MS ? 'cedo' : 'valida';
}

function assinar(slug: string, emitidaEm: number): string {
  return hmacDoServidor(`ficha-de-interesse\u0000${slug}\u0000${emitidaEm}`);
}
