import { notFound, permanentRedirect } from 'next/navigation';
import {
  filtrosDoCatalogoSchema,
  type FiltrosDoCatalogo,
  type MediaKind,
  type OrganizationKind,
  type PropertyPurpose,
  type PropertyStatus,
  type PropertyType,
} from '@app/shared';

/**
 * O catálogo público como o site o lê — item **C1**.
 *
 * ## Os tipos espelham `apps/api/src/catalogo/resposta-publica.ts`
 *
 * E não `lib/imoveis.ts`. O imóvel do CRM tem `cep`, a rua solta, a
 * visibilidade do endereço e o responsável; o daqui não tem nenhum deles, e a
 * ausência é a proteção: uma tela da vitrine que tentasse mostrar o CEP não
 * compila. Partir
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
  /** Público desde 29/10/2026: é o que o cliente cita no WhatsApp. */
  codigo: string;
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
  filtros: FiltrosDoCatalogo = {},
): Promise<VitrinePublica> {
  const consulta = consultaDosFiltros(filtros);
  consulta.set('pagina', String(pagina));
  consulta.set('porPagina', String(POR_PAGINA_DA_VITRINE));

  return lerDaApi(
    `/publico/organizacoes/${encodeURIComponent(slug)}/imoveis?${consulta}`,
    (slugAtual) => {
      // A busca segue junto; a página 1 fica sem `?pagina=`, como na paginação.
      const destino = consultaDosFiltros(filtros);
      if (pagina > 1) destino.set('pagina', String(pagina));
      const texto = destino.toString();
      return texto ? `/o/${slugAtual}?${texto}` : `/o/${slugAtual}`;
    },
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
    (slugAtual) => `/o/${slugAtual}/imovel/${encodeURIComponent(slugDoImovel)}`,
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
 *
 * ## 308 vira redirecionamento da página (C3)
 *
 * A vitrine trocou de endereço. A API responde 308 com o slug atual no corpo, e
 * o `fetch` **não** segue sozinho (`redirect: 'manual'`): seguir mostraria a
 * vitrine nova debaixo do endereço velho, e o Google continuaria indexando o
 * velho. Quem monta o endereço da **página** é `destino`, porque o `Location`
 * da API aponta para a API.
 *
 * `permanentRedirect` responde 308, e não 301 — decisão de 29/10/2026: os dois
 * são permanentes para o robô de busca, e o 301 exigiria um interceptador
 * consultando a API em toda visita.
 */
async function lerDaApi<T>(
  caminho: string,
  destino: (slugAtual: string) => string,
): Promise<T> {
  const base = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3333';

  const resposta = await fetch(`${base}/api${caminho}`, {
    cache: 'no-store',
    redirect: 'manual',
    headers: { accept: 'application/json' },
  });

  if (resposta.status === 404) {
    notFound();
  }

  if (resposta.status === 308) {
    const { slugAtual } = (await resposta.json()) as { slugAtual: string };
    permanentRedirect(destino(slugAtual));
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

type ParametrosDaUrl = { [chave: string]: string | string[] | undefined };

/**
 * Os filtros da URL da vitrine, validados pelo mesmo contrato da API — item
 * **C4**.
 *
 * ## Filtro inválido não derruba a página
 *
 * Preço sem finalidade, mínimo maior que o máximo: a API responderia 400, e a
 * página viraria tela de erro. Aqui a validação acontece **antes**, e o que
 * falhar volta como mensagem por campo, com a vitrine mostrada sem filtro
 * nenhum. Aplicar só a parte válida seria pior: a pessoa veria um resultado
 * que não corresponde ao que pediu, sem saber por quê.
 *
 * `valores` guarda o texto cru de cada campo, para o formulário reabrir com o
 * que a pessoa digitou — inclusive o que estava errado, que é o que ela
 * precisa corrigir.
 */
export function lerFiltros(parametros: ParametrosDaUrl): {
  filtros: FiltrosDoCatalogo;
  erros: Record<string, string>;
  valores: Record<string, string>;
} {
  const valores = Object.fromEntries(
    Object.entries(parametros).flatMap(([chave, valor]) => {
      const primeiro = Array.isArray(valor) ? valor[0] : valor;
      return primeiro === undefined ? [] : [[chave, primeiro]];
    }),
  );

  const resultado = filtrosDoCatalogoSchema.safeParse(valores);

  if (resultado.success) {
    return { filtros: resultado.data, erros: {}, valores };
  }

  const erros: Record<string, string> = {};

  for (const problema of resultado.error.issues) {
    const campo = String(problema.path[0] ?? 'formulario');
    erros[campo] ??= problema.message;
  }

  return { filtros: {}, erros, valores };
}

/**
 * Os filtros de volta a query string — para a API e para os links de
 * paginação, que precisam levar a busca junto.
 *
 * Só o que tem valor: `?tipo=&termo=` na URL de cada página seria ruído no
 * link que a pessoa compartilha.
 */
export function consultaDosFiltros(
  filtros: FiltrosDoCatalogo,
): URLSearchParams {
  const consulta = new URLSearchParams();

  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== '') {
      consulta.set(chave, String(valor));
    }
  }

  return consulta;
}

/** Algum filtro em uso? Distingue "vitrine vazia" de "busca sem resultado". */
export function temFiltro(filtros: FiltrosDoCatalogo): boolean {
  return consultaDosFiltros(filtros).size > 0;
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
