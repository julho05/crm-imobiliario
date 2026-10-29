import { createHmac } from 'node:crypto';

/**
 * Hash de endereco IP, para guardar sem reter o dado pessoal.
 *
 * ## Por que HMAC com segredo, e nao SHA-256 puro
 *
 * Isto importa mais do que parece. Existem cerca de 4,3 bilhoes de enderecos
 * IPv4 — o espaco inteiro cabe em uma tabela que se gera em minutos num
 * computador comum. `sha256(ip)` nao anonimiza nada: quem tiver o hash
 * descobre o IP por forca bruta trivial.
 *
 * Com HMAC e um segredo que nao esta no banco, o atacante que vaze a tabela
 * **nao** consegue reverter: faltaria o segredo, que vive apenas na
 * configuracao do servidor.
 *
 * [data-model.md](../../../../docs/data-model.md) §7 promete "hash de IP, nunca
 * IP bruto" como medida de minimizacao da LGPD. Sem o segredo, a promessa nao
 * se sustenta tecnicamente.
 *
 * ## Consequencia operacional
 *
 * Trocar `IP_HASH_SECRET` torna todos os hashes anteriores incomparaveis com
 * os novos. Isso **nao** invalida o consentimento registrado em `Lead` — o
 * `consentGivenAt` e a versao do aviso continuam valendo —, mas impede
 * comparar origem antiga com nova. Nao e um valor para rotacionar sem motivo.
 */

function lerSegredo(): string {
  const segredo = process.env.IP_HASH_SECRET;

  if (!segredo || segredo.length < 32) {
    throw new Error(
      'IP_HASH_SECRET ausente ou curta demais (minimo 32 caracteres). ' +
        "Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  return segredo;
}

/**
 * Devolve o hash do IP, ou `undefined` quando nao ha IP para registrar —
 * caso de chamada interna ou de proxy que nao repassou o endereco.
 *
 * Falha ruidosamente se o segredo nao estiver configurado. E deliberado:
 * guardar um hash reversivel achando que e anonimo e pior do que nao guardar.
 */
export function hashDeIp(ip: string | undefined): string | undefined {
  if (!ip) {
    return undefined;
  }

  return hmacDoServidor(ip);
}

/**
 * O mesmo HMAC, para qualquer texto que nao deva ser guardado em claro.
 *
 * Existe para o limite de tentativas (A11), cuja chave junta IP e e-mail: o
 * e-mail tem o mesmo problema do IP — o espaco de enderecos de uma lista vazada
 * e pequeno o bastante para forca bruta sobre um SHA-256 puro.
 */
export function hmacDoServidor(texto: string): string {
  return createHmac('sha256', lerSegredo()).update(texto).digest('hex');
}
