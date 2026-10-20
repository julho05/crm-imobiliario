/**
 * Cliente da API.
 *
 * Caminho relativo sempre (`/api/...`): o navegador fala com a propria origem
 * do site e o Next repassa para a API (ver `next.config.mjs`). URL absoluta com
 * porta voltaria a ser requisicao entre origens, exigiria CORS e quebraria o
 * `SameSite=Lax` do cookie de sessao.
 *
 * `credentials: 'same-origin'` para que o cookie `httpOnly` va e volte. O site
 * **nunca** le o token: ele nao e acessivel a JavaScript, e e isso que limita o
 * estrago de um XSS.
 */

/** Erro de um campo especifico, como o `ZodValidationPipe` devolve. */
export type ErroDeCampo = {
  campo: string;
  mensagem: string;
};

/**
 * Falha de uma chamada a API.
 *
 * Carrega o status para quem precisa distinguir casos (401 leva a `/entrar`,
 * 404 mostra "nao encontrado") e os erros por campo, quando houver.
 */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly erros: ErroDeCampo[] = [],
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }

  /** Mapa campo → mensagem, pronto para o formulario. */
  get porCampo(): Record<string, string> {
    return Object.fromEntries(this.erros.map((e) => [e.campo, e.mensagem]));
  }
}

/**
 * Mensagem para quando nao da para confiar no que veio.
 *
 * Falha de rede e erro 500 nao tem texto proprio: o da API seria tecnico, e
 * mostrar detalhe interno ao usuario nao ajuda ninguem e ajuda quem sonda
 * ([pages-and-navigation.md](../../../docs/pages-and-navigation.md) §8).
 */
const FALHA_GENERICA =
  'Nao foi possivel completar a operacao. Tente de novo em instantes.';

export async function chamarApi<T>(
  caminho: string,
  opcoes: {
    metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    corpo?: unknown;
  } = {},
): Promise<T> {
  const metodo = opcoes.metodo ?? 'GET';

  let resposta: Response;

  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: opcoes.corpo ? { 'content-type': 'application/json' } : {},
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    });
  } catch {
    // Rede fora, servidor no ar ou nao: o usuario nao tem como agir sobre a
    // diferenca, e a mensagem e a mesma.
    throw new ErroDaApi(
      0,
      'Nao foi possivel falar com o servidor. Verifique a conexao.',
    );
  }

  if (resposta.status === 204) {
    return undefined as T;
  }

  const corpo = await lerJson(resposta);

  if (!resposta.ok) {
    throw new ErroDaApi(
      resposta.status,
      mensagemDoErro(resposta.status, corpo),
      errosDoCorpo(corpo),
    );
  }

  return corpo as T;
}

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    return null;
  }
}

/**
 * Qual texto mostrar.
 *
 * Para 4xx, usa a mensagem da API: todas elas sao escritas por nos, em
 * portugues, pensando em quem le — "E-mail ou senha incorretos", "Este
 * endereco publico ja esta em uso". Para 5xx, **ignora** o que veio: ali a
 * mensagem e tecnica ou acidental.
 */
function mensagemDoErro(status: number, corpo: unknown): string {
  if (status >= 500) {
    return FALHA_GENERICA;
  }

  if (typeof corpo === 'object' && corpo !== null) {
    const campos = corpo as { mensagem?: unknown; message?: unknown };

    if (typeof campos.mensagem === 'string') {
      return campos.mensagem;
    }

    // Formato padrao do Nest para as excecoes de HTTP.
    if (typeof campos.message === 'string') {
      return campos.message;
    }
  }

  return FALHA_GENERICA;
}

function errosDoCorpo(corpo: unknown): ErroDeCampo[] {
  if (typeof corpo !== 'object' || corpo === null) {
    return [];
  }

  const { erros } = corpo as { erros?: unknown };

  if (!Array.isArray(erros)) {
    return [];
  }

  return erros.filter(
    (erro): erro is ErroDeCampo =>
      typeof erro === 'object' &&
      erro !== null &&
      typeof (erro as ErroDeCampo).campo === 'string' &&
      typeof (erro as ErroDeCampo).mensagem === 'string',
  );
}
