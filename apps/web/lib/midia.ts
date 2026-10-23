import {
  MIDIA_PUBLICA,
  TAMANHO_MAXIMO_DE_MIDIA,
  TIPOS_ACEITOS,
  type MediaKind,
} from '@app/shared';
import { ErroDaApi, chamarApi } from './api';

/**
 * Fotos e documentos do imóvel, do lado do navegador — item **B4**.
 *
 * ## O envio tem dois passos, e o segundo não passa pela API
 *
 * A API autoriza e devolve uma URL assinada; o **navegador** envia o arquivo
 * direto ao armazenamento; depois a API registra a chave. O motivo está em
 * `packages/shared/src/schemas/midia.ts`: receber 20 fotos de 5 MB por
 * requisição ocuparia, segurando bytes em memória, o mesmo processo que atende
 * o corretor que está trabalhando.
 *
 * Por isso `enviarMidia` não é uma chamada ao `chamarApi` e sim três etapas,
 * sendo a do meio um `fetch` para fora da nossa origem.
 *
 * ## O tipo é espelho, não import
 *
 * `Midia` espelha `apps/api/src/midia/resposta.ts` pela mesma razão registrada
 * em [imoveis.ts](./imoveis.ts): `packages/shared` não depende de `apps/`, e o
 * site não alcança o código interno da API.
 */

export type Midia = {
  id: string;
  kind: MediaKind;
  /**
   * URL assinada, de validade curta.
   *
   * **Não guarde.** Ela é montada a cada leitura e expira em uma hora; gravada
   * em algum lugar, estaria morta na segunda vez que alguém abrisse a tela.
   */
  url: string;
  posicao: number;
  ehCapa: boolean;
  textoAlternativo: string | null;
  largura: number | null;
  altura: number | null;
  tamanhoEmBytes: number | null;
  contentType: string | null;
  criadaEm: string;
};

export type ListaDeMidia = { midias: Midia[] };

/** O que a API devolve no passo 1 do envio. */
type AutorizacaoDeEnvio = {
  objectKey: string;
  url: string;
  metodo: 'PUT';
  cabecalhos: Record<string, string>;
  expiraEm: string;
};

/**
 * Vai ao catálogo público?
 *
 * A pergunta decide em qual das duas seções da tela a mídia aparece, e a
 * resposta vem do enum compartilhado — `DOCUMENT` nunca é material de vitrine
 * ([data-model.md](../../../docs/data-model.md) §7). Repetir a regra aqui
 * criaria a chance de ela divergir da do servidor, que é a que vale.
 */
export function ehPublica(kind: MediaKind): boolean {
  return MIDIA_PUBLICA.includes(kind);
}

/** Os tipos que o seletor de arquivo deve oferecer para esta finalidade. */
export function tiposAceitosPara(kind: MediaKind): string {
  return (TIPOS_ACEITOS[kind] ?? []).join(',');
}

/**
 * Tamanho em unidade legível.
 *
 * `null` vira travessão, e não "0 B", pelo mesmo motivo que preço ausente não
 * vira "R$ 0,00": ausência de informação não é zero.
 */
export function formatarTamanho(bytes: number | null): string {
  if (bytes === null) {
    return '—';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })} MB`;
}

/**
 * Por que este arquivo não serve — ou `null` se ele serve.
 *
 * **Isto não autoriza nada.** O servidor confere tipo e tamanho de novo antes
 * de assinar, e o armazenamento os faz valer na assinatura. Conferir aqui serve
 * para recusar na hora, com uma frase útil, em vez de deixar a pessoa esperar o
 * envio de um arquivo que será rejeitado no fim.
 *
 * A mensagem do PDF é específica de propósito: "tipo não aceito" deixaria a
 * pessoa sem saber o que fazer, quando o que falta é escolher outra finalidade.
 */
export function recusaDoArquivo(arquivo: File, kind: MediaKind): string | null {
  const aceitos = TIPOS_ACEITOS[kind] ?? [];

  if (!aceitos.includes(arquivo.type)) {
    if (arquivo.type === 'application/pdf') {
      return 'PDF não entra como foto. Envie-o como planta ou como documento.';
    }

    return 'Este tipo de arquivo não é aceito aqui. Use JPEG, PNG ou WebP.';
  }

  if (arquivo.size > TAMANHO_MAXIMO_DE_MIDIA) {
    return `Arquivo de ${formatarTamanho(arquivo.size)}. O limite é ${formatarTamanho(
      TAMANHO_MAXIMO_DE_MIDIA,
    )}.`;
  }

  if (arquivo.size === 0) {
    return 'Arquivo vazio.';
  }

  return null;
}

/**
 * Largura e altura, lidas antes do envio.
 *
 * O navegador vai carregar a imagem de qualquer forma para mostrá-la; medir
 * aqui e mandar no registro é o que permite à grade reservar o espaço certo e
 * não "pular" quando a foto chega.
 *
 * Devolve `null` para PDF e para imagem que o navegador não decodifica — e não
 * lança: dimensão é conforto visual, e perder o conforto não é motivo para
 * perder o arquivo. Quem valida imagem é o armazenamento.
 */
export async function dimensoesDaImagem(
  arquivo: File,
): Promise<{ largura: number; altura: number } | null> {
  if (!arquivo.type.startsWith('image/')) {
    return null;
  }

  const endereco = URL.createObjectURL(arquivo);

  try {
    return await new Promise((resolver) => {
      const imagem = new Image();

      imagem.onload = () =>
        resolver({
          largura: imagem.naturalWidth,
          altura: imagem.naturalHeight,
        });
      imagem.onerror = () => resolver(null);
      imagem.src = endereco;
    });
  } finally {
    // Sem isto, cada arquivo escolhido deixa o conteúdo na memória da aba até
    // a navegação — e são 20 arquivos de 5 MB.
    URL.revokeObjectURL(endereco);
  }
}

/**
 * Envia um arquivo e devolve a mídia registrada.
 *
 * `textoAlternativo` existe aqui porque a API **não guarda o nome do arquivo**.
 * Para documento isso importa: sem ele, uma matrícula enviada é um ícone de PDF
 * sem identificação nenhuma, e quem precisa encontrá-la depois abre um por um.
 * Para foto não se preenche — `IMG_4821.jpg` é ruído, e ruído num campo que
 * leitor de tela lê em voz alta é pior do que campo vazio.
 *
 * As três etapas na ordem em que precisam acontecer. Falha no meio deixa um
 * objeto no armazenamento sem linha no banco — o lado seguro do erro, conforme
 * o contrato: órfão não aparece em tela nenhuma, ao contrário de uma linha
 * apontando para arquivo inexistente, que viraria imagem quebrada no anúncio.
 */
export async function enviarMidia(
  imovelId: string,
  arquivo: File,
  kind: MediaKind,
  textoAlternativo?: string,
): Promise<Midia> {
  const dimensoes = await dimensoesDaImagem(arquivo);

  const autorizacao = await chamarApi<AutorizacaoDeEnvio>(
    `/imoveis/${imovelId}/midia/url-de-upload`,
    {
      metodo: 'POST',
      corpo: {
        kind,
        contentType: arquivo.type,
        tamanhoEmBytes: arquivo.size,
      },
    },
  );

  await enviarAoArmazenamento(autorizacao, arquivo);

  return chamarApi<Midia>(`/imoveis/${imovelId}/midia`, {
    metodo: 'POST',
    corpo: {
      objectKey: autorizacao.objectKey,
      kind,
      contentType: arquivo.type,
      tamanhoEmBytes: arquivo.size,
      largura: dimensoes?.largura,
      altura: dimensoes?.altura,
      textoAlternativo,
    },
  });
}

/**
 * O passo do meio: o arquivo, direto ao armazenamento.
 *
 * Três diferenças em relação ao `chamarApi`, e cada uma tem motivo:
 *
 * - **`credentials: 'omit'`.** Em produção esta URL é do Cloudflare R2, um
 *   domínio que não é nosso. Mandar o cookie de sessão para terceiro é o tipo
 *   de coisa que ninguém descobre depois
 * - **Os cabeçalhos vêm do servidor**, não daqui. O `content-type` faz parte do
 *   que foi assinado: o armazenamento recusa envio que declare outro tipo, e é
 *   isso que impede que uma URL pedida para JPEG sirva para subir um executável
 * - **O corpo é o `File`.** Sem `JSON.stringify`, sem ler em memória: o
 *   navegador transmite do disco
 */
async function enviarAoArmazenamento(
  autorizacao: AutorizacaoDeEnvio,
  arquivo: File,
): Promise<void> {
  let resposta: Response;

  try {
    resposta = await fetch(autorizacao.url, {
      method: autorizacao.metodo,
      headers: autorizacao.cabecalhos,
      body: arquivo,
      credentials: 'omit',
    });
  } catch {
    throw new ErroDaApi(
      0,
      'Não foi possível enviar o arquivo. Verifique a conexão e tente de novo.',
    );
  }

  if (!resposta.ok) {
    // A mensagem do armazenamento não é escrita para quem usa o sistema, e no
    // R2 é XML. O status basta para distinguir o caso que a pessoa resolve.
    throw new ErroDaApi(
      resposta.status,
      resposta.status === 403
        ? 'A autorização de envio expirou. Tente enviar de novo.'
        : 'O armazenamento recusou o arquivo. Tente de novo em instantes.',
    );
  }
}
