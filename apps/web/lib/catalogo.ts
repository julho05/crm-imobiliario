import { notFound } from 'next/navigation';
import type {
  MediaKind,
  OrganizationKind,
  PropertyPurpose,
  PropertyStatus,
  PropertyType,
} from '@app/shared';

/**
 * O catálogo público como o site o lê — item **C1**.
 *
 * ## Os tipos espelham `apps/api/src/catalogo/resposta-publica.ts`
 *
 * E não `lib/imoveis.ts`. O imóvel do CRM tem `codigo`, `cep`, a rua solta e o
 * responsável; o daqui não tem nenhum deles, e a ausência é a proteção: uma
 * tela da vitrine que tentasse mostrar o código do imóvel não compila. Partir
 * do tipo do CRM e tirar campos seria a lista negra que o `permissions.md` §5
 * proíbe, escrita do lado do site.
 *
 * ## Lido no servidor, nunca no navegador
 *
 * As páginas da vitrine são Server Components, ao contrário do painel. O robô
 * de busca e a prévia do link no WhatsApp recebem o anúncio pronto, e não uma
 * tela de "carregando" — e o C7 (SEO) depende disso.
 *
 * Consequência: a requisição sai do processo do Next direto para a API, pelo
 * `API_INTERNAL_URL`, e não pelo `/api` relativo do `lib/api.ts` — no servidor
 * não há origem em que o caminho relativo se apoie.
 */

export type MidiaPublica = {
  kind: MediaKind;
  url: string;
  textoAlternativo: string | null;
  largura: number | null;
  altura: number | null;
};

export type EnderecoPublico = {
  rua: string;
  numero: string | null;
  complemento: string | null;
};

export type ImovelPublico = {
  id: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  tipo: PropertyType;
  finalidade: PropertyPurpose;
  status: PropertyStatus;
  preco: number | null;
  precoDeAluguel: number | null;
  condominio: number | null;
  iptu: number | null;
  dormitorios: number | null;
  banheiros: number | null;
  suites: number | null;
  vagas: number | null;
  areaTotal: number | null;
  areaUtil: number | null;
  estado: string;
  cidade: string;
  bairro: string;
  /** `null` quando a visibilidade do endereço não permite nada. */
  endereco: EnderecoPublico | null;
  caracteristicas: string[];
  capa: MidiaPublica | null;
  /** Vazio na listagem, completo no detalhe. */
  fotos: MidiaPublica[];
  publicadoEm: string;
};

export type OrganizacaoPublica = {
  slug: string;
  nome: string;
  tipo: OrganizationKind;
  email: string | null;
  telefone: string | null;
  apresentacao: string | null;
  logoUrl: string | null;
};

export type VitrinePublica = {
  organizacao: OrganizacaoPublica;
  imoveis: ImovelPublico[];
  total: number;
  pagina: number;
  porPagina: number;
};

export type AnuncioPublico = {
  organizacao: OrganizacaoPublica;
  imovel: ImovelPublico;
};

/** Múltiplo de 2 e de 3, para a grade fechar inteira no celular e no desktop. */
export const POR_PAGINA_DA_VITRINE = 12;

export function buscarVitrine(
  slug: string,
  pagina: number,
): Promise<VitrinePublica> {
  const consulta = new URLSearchParams({
    pagina: String(pagina),
    porPagina: String(POR_PAGINA_DA_VITRINE),
  });

  return lerDaApi(
    `/publico/organizacoes/${encodeURIComponent(slug)}/imoveis?${consulta}`,
  );
}

export function buscarAnuncio(
  slug: string,
  slugDoImovel: string,
): Promise<AnuncioPublico> {
  return lerDaApi(
    `/publico/organizacoes/${encodeURIComponent(
      slug,
    )}/imoveis/${encodeURIComponent(slugDoImovel)}`,
  );
}

/**
 * Um GET na API pública.
 *
 * ## Sem cookie, e de propósito
 *
 * O `fetch` do servidor não repassa os cookies de quem pediu a página, e aqui
 * nada é feito para que repasse. O catálogo não autentica ninguém: o corretor
 * logado vê a mesma vitrine que um desconhecido, e é isso que lhe permite
 * conferir o anúncio como o cliente o verá.
 *
 * ## Sem cache, por enquanto
 *
 * `cache: 'no-store'` porque a URL das fotos expira em uma hora, e página
 * guardada por mais tempo que isso serviria imagem quebrada. Quando o adaptador
 * do R2 servir `PHOTO` e `FLOORPLAN` por domínio público, a URL deixa de
 * expirar e o cache volta a ser discutido.
 *
 * ## 404 vira `notFound()`; o resto, erro
 *
 * A API responde 404 para slug inexistente, organização suspensa e imóvel fora
 * do ar, com a mesma mensagem — e a página repassa isso sem distinguir, como
 * status HTTP 404 de verdade. Qualquer outra falha cai no `error.tsx`, que não
 * mostra a mensagem técnica.
 */
async function lerDaApi<T>(caminho: string): Promise<T> {
  const base = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3333';

  const resposta = await fetch(`${base}/api${caminho}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  if (resposta.status === 404) {
    notFound();
  }

  if (!resposta.ok) {
    throw new Error(`Catálogo respondeu ${resposta.status} em ${caminho}`);
  }

  return (await resposta.json()) as T;
}

/**
 * A página pedida em `?pagina=`, saneada.
 *
 * Valor inválido vira 1 em vez de erro: o parâmetro está numa URL que alguém
 * compartilhou, e um link malformado deve levar à vitrine, não a uma falha.
 */
export function paginaDaConsulta(valor: string | string[] | undefined): number {
  const numero = Number(Array.isArray(valor) ? valor[0] : valor);
  return Number.isInteger(numero) && numero >= 1 ? numero : 1;
}

/** "Pinheiros, São Paulo - SP" — a localização que sai em todos os níveis. */
export function localizacao(imovel: ImovelPublico): string {
  return `${imovel.bairro}, ${imovel.cidade} - ${imovel.estado}`;
}

/** "Rua das Flores, 120 - apto 31", até onde a API liberou. */
export function enderecoPorExtenso(endereco: EnderecoPublico): string {
  let texto = endereco.rua;

  if (endereco.numero) {
    texto += `, ${endereco.numero}`;
  }

  if (endereco.complemento) {
    texto += ` - ${endereco.complemento}`;
  }

  return texto;
}

/**
 * O telefone para o `href` de `tel:`.
 *
 * Só os dígitos, com o `+` se houver: os discadores não tratam parênteses e
 * espaços do mesmo jeito em todos os aparelhos.
 */
export function telefoneParaLink(telefone: string): string {
  return telefone.replace(/[^\d+]/g, '');
}
