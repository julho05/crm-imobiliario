/**
 * Cookie de sessao: nome, opcoes e leitura.
 *
 * Nao usamos `cookie-parser`. Precisamos de **um** cookie, que nao e assinado
 * (o valor e opaco e so vale se existir no banco), e a leitura cabe em poucas
 * linhas com teste proprio. Dependencia a menos no caminho da autenticacao.
 */

/**
 * Nome curto e sem pistas. `sessao` nao diz qual biblioteca ou framework esta
 * por tras — `connect.sid` ou `next-auth.session-token` dizem, e isso economiza
 * trabalho de reconhecimento para quem procura alvo.
 */
export const NOME_DO_COOKIE_DE_SESSAO = 'sessao';

export type OpcoesDeCookie = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge?: number;
};

/**
 * Opcoes do cookie de sessao.
 *
 * - `httpOnly`: JavaScript da pagina nao le o cookie. E o que transforma um XSS
 *   de "roubo de sessao" em "estrago limitado a sessao da vitima naquela aba".
 * - `secure` em producao: o cookie nunca viaja em HTTP puro. Em
 *   desenvolvimento fica desligado, senao o navegador o descarta em
 *   `http://localhost`.
 * - `sameSite: 'lax'`: o navegador nao envia o cookie em requisicao
 *   disparada por outro site, o que corta CSRF na maioria dos casos, mas
 *   mantem o cookie quando o usuario chega por um link externo. So e possivel
 *   porque site e API ficam no **mesmo dominio** (decisao de 20/10/2026); em
 *   dominios separados seria obrigatorio `none` + `secure`.
 * - `path: '/'`: vale para o site e para `/api`.
 *
 * `maxAge` em segundos; quando ausente, o cookie vira de sessao do navegador.
 */
export function opcoesDoCookieDeSessao(maxAgeEmSegundos?: number) {
  const opcoes: OpcoesDeCookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };

  if (maxAgeEmSegundos !== undefined) {
    // O Express espera milissegundos aqui.
    opcoes.maxAge = maxAgeEmSegundos * 1000;
  }

  return opcoes;
}

/**
 * Le um cookie do cabecalho `Cookie`.
 *
 * Detalhes que um `split(';')` ingenuo erra, e que o teste cobre:
 * valor contendo `=` (base64url nao gera, mas outro cookie da mesma pagina
 * pode), espacos ao redor do `=`, cookie de nome parecido (`sessao_antiga`
 * nao e `sessao`), e valor percent-encoded.
 */
export function lerCookie(
  cabecalho: string | undefined,
  nome: string,
): string | undefined {
  if (!cabecalho) {
    return undefined;
  }

  for (const parte of cabecalho.split(';')) {
    const separador = parte.indexOf('=');
    if (separador === -1) {
      continue;
    }

    if (parte.slice(0, separador).trim() !== nome) {
      continue;
    }

    const bruto = parte.slice(separador + 1).trim();

    try {
      return decodeURIComponent(bruto);
    } catch {
      // Percent-encoding malformado: devolve como veio, em vez de estourar.
      return bruto;
    }
  }

  return undefined;
}
