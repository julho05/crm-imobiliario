import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CabecalhoDaOrganizacao,
  ContatoDaOrganizacao,
} from '@/components/catalogo/cabecalho-da-organizacao';
import { CartaoDeImovel } from '@/components/catalogo/cartao-de-imovel';
import { FormularioDeBusca } from '@/components/catalogo/formulario-de-busca';
import { Aviso } from '@/components/aviso';
import { buttonVariants } from '@/components/ui/button';
import {
  buscarVitrine,
  consultaDosFiltros,
  lerFiltros,
  paginaDaConsulta,
  temFiltro,
} from '@/lib/catalogo';
import { dadosDaOrganizacao, origemDoSite, serializarJsonLd } from '@/lib/seo';
import { cn } from '@/lib/utils';

/**
 * `/o/[slug]` — a vitrine da organização, item **C1**.
 *
 * ## Server Component, ao contrário do painel
 *
 * Ver `lib/catalogo.ts`: o anúncio precisa chegar pronto ao robô de busca e à
 * prévia do link. Não há `'use client'` nesta árvore, e nenhum estado — a
 * página é função da URL, e a paginação é `?pagina=`, que se compartilha.
 *
 * ## O que aparece aqui é decisão da API
 *
 * Só `AVAILABLE` e `RESERVED`, publicados, não excluídos, de organização
 * ativa — e quem garante é o `CatalogoService.visivel()`, com teste em
 * `apps/api/test/catalogo/catalogo.http.spec.ts`. A tela não filtra nada de
 * novo, e não deveria: filtro no site é filtro depois de o dado já ter saído.
 *
 * ## A busca é a URL (item C4)
 *
 * Os filtros vêm de `searchParams`, são validados com o contrato da API em
 * `lerFiltros` e vão para a API **e** para os links de paginação — a página 2
 * de uma busca é a página 2 daquela busca, e não da vitrine inteira.
 *
 * Dois vazios diferentes, que o §8 do mapa de telas proíbe confundir: a
 * organização sem nenhum imóvel no ar, e a busca que não achou nada. O segundo
 * oferece limpar os filtros; o primeiro não tem o que oferecer.
 *
 * ## SEO (item C7)
 *
 * Canônico sem filtro, com `?pagina=` só da segunda em diante. A busca
 * filtrada responde `noindex, follow`. Ver `lib/seo.ts`.
 */

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  const parametros = await searchParams;
  const pagina = paginaDaConsulta(parametros.pagina);

  // Mesma URL que a página pede, filtros inclusive: o Next memoriza o `fetch`
  // dentro da mesma requisição, e a API é consultada uma vez só.
  const { filtros, erros } = lerFiltros(parametros);
  const { organizacao } = await buscarVitrine(slug, pagina, filtros);

  const titulo = `${organizacao.nome} — imóveis`;
  const descricao =
    organizacao.apresentacao ?? `Imóveis anunciados por ${organizacao.nome}.`;
  const canonico =
    pagina > 1
      ? `/o/${organizacao.slug}?pagina=${pagina}`
      : `/o/${organizacao.slug}`;

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: canonico },
    // Busca filtrada fica fora do índice: as combinações são infinitas, e
    // cada uma seria uma página quase igual à vitrine disputando com ela.
    // `follow` continua, para o robô chegar aos anúncios por ali também.
    robots:
      temFiltro(filtros) || Object.keys(erros).length > 0
        ? { index: false, follow: true }
        : undefined,
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: organizacao.nome,
      title: titulo,
      description: descricao,
      url: canonico,
      images: organizacao.logoUrl ? [{ url: organizacao.logoUrl }] : undefined,
    },
  };
}

export default async function Vitrine({ params, searchParams }: Props) {
  const { slug } = await params;
  const parametros = await searchParams;
  const pagina = paginaDaConsulta(parametros.pagina);
  const { filtros, erros, valores } = lerFiltros(parametros);
  const { organizacao, imoveis, total, porPagina } = await buscarVitrine(
    slug,
    pagina,
    filtros,
  );

  const totalDePaginas = Math.max(1, Math.ceil(total / porPagina));
  const filtrando = temFiltro(filtros);
  const comErro = Object.keys(erros).length > 0;
  const plural = total === 1 ? 'imóvel' : 'imóveis';

  // Sem imóvel nenhum e sem filtro, a busca não tem o que procurar.
  const vitrineVazia = total === 0 && !filtrando;

  return (
    <>
      <script
        type="application/ld+json"
        // Escapado em `serializarJsonLd`: o nome e a apresentação são texto
        // do cliente, e `</script>` dentro deles fecharia esta tag.
        dangerouslySetInnerHTML={{
          __html: serializarJsonLd(
            dadosDaOrganizacao(organizacao, origemDoSite()),
          ),
        }}
      />
      <CabecalhoDaOrganizacao organizacao={organizacao} naVitrine />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {(organizacao.apresentacao ||
          organizacao.telefone ||
          organizacao.email) && (
          <section className="bg-card mb-8 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:justify-between sm:p-6">
            {organizacao.apresentacao && (
              <p className="max-w-prose text-sm whitespace-pre-line">
                {organizacao.apresentacao}
              </p>
            )}
            <ContatoDaOrganizacao organizacao={organizacao} />
          </section>
        )}

        {!vitrineVazia && (
          <FormularioDeBusca
            slug={organizacao.slug}
            valores={valores}
            erros={erros}
            emUso={filtrando || comErro}
          />
        )}

        {comErro && (
          <Aviso tom="erro" className="mb-4">
            Algum filtro precisa de ajuste — veja os campos marcados. Enquanto
            isso, a lista mostra todos os imóveis.
          </Aviso>
        )}

        <h2 className="mb-4 text-xl font-semibold" aria-live="polite">
          {total === 0
            ? 'Imóveis'
            : filtrando
              ? `${total} ${plural} ${total === 1 ? 'encontrado' : 'encontrados'}`
              : `${total} ${plural} ${total === 1 ? 'anunciado' : 'anunciados'}`}
        </h2>

        {vitrineVazia ? (
          // Vazio sem dados (§8): não há ação para o visitante, então a frase
          // diz só o que acontece e não o culpa de nada.
          <p className="text-muted-foreground bg-card rounded-lg border p-6 text-center">
            Nenhum imóvel anunciado no momento.
          </p>
        ) : total === 0 ? (
          // Vazio por filtro (§8): diz que foi o filtro, e oferece desfazê-lo.
          <p className="text-muted-foreground bg-card rounded-lg border p-6 text-center">
            Nenhum imóvel com esses filtros.{' '}
            <Link
              href={`/o/${organizacao.slug}`}
              className="text-foreground underline"
            >
              Ver todos os imóveis
            </Link>
          </p>
        ) : imoveis.length === 0 ? (
          // Página além da última — link antigo, ou imóveis que saíram do ar
          // desde que o link foi copiado. Não é "nenhum imóvel": há imóveis,
          // e a frase leva até eles.
          <p className="text-muted-foreground bg-card rounded-lg border p-6 text-center">
            Esta página não existe mais.{' '}
            <Link
              href={`/o/${organizacao.slug}`}
              className="text-foreground underline"
            >
              Ver os imóveis anunciados
            </Link>
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {imoveis.map((imovel) => (
              <li key={imovel.id} className="flex">
                <CartaoDeImovel
                  imovel={imovel}
                  slugDaOrganizacao={organizacao.slug}
                />
              </li>
            ))}
          </ul>
        )}

        {totalDePaginas > 1 && imoveis.length > 0 && (
          <Paginacao
            slug={organizacao.slug}
            consulta={consultaDosFiltros(filtros)}
            pagina={pagina}
            totalDePaginas={totalDePaginas}
          />
        )}
      </main>
    </>
  );
}

/**
 * Anterior e próxima, como links.
 *
 * Links, e não botões: cada página tem URL própria, que o robô de busca segue
 * e que o visitante compartilha. O extremo vira texto apagado com
 * `aria-disabled`, para a posição dos controles não mudar entre páginas.
 *
 * `consulta` leva os filtros da busca junto. A página 1 fica sem `?pagina=`,
 * para a primeira página da vitrine ter um endereço só.
 */
function Paginacao({
  slug,
  consulta,
  pagina,
  totalDePaginas,
}: {
  slug: string;
  consulta: URLSearchParams;
  pagina: number;
  totalDePaginas: number;
}) {
  const endereco = (numero: number) => {
    const destino = new URLSearchParams(consulta);

    if (numero > 1) {
      destino.set('pagina', String(numero));
    }

    const texto = destino.toString();
    return texto ? `/o/${slug}?${texto}` : `/o/${slug}`;
  };

  const classe = cn(buttonVariants({ variant: 'outline', size: 'sm' }));
  const desligado = cn(classe, 'pointer-events-none opacity-50');

  return (
    <nav
      aria-label="Páginas da vitrine"
      className="mt-8 flex items-center justify-between gap-4"
    >
      {pagina > 1 ? (
        <Link href={endereco(pagina - 1)} className={classe} rel="prev">
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Link>
      ) : (
        <span className={desligado} aria-disabled="true">
          <ChevronLeft aria-hidden="true" />
          Anterior
        </span>
      )}

      <span className="text-muted-foreground text-sm">
        Página {pagina} de {totalDePaginas}
      </span>

      {pagina < totalDePaginas ? (
        <Link href={endereco(pagina + 1)} className={classe} rel="next">
          Próxima
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span className={desligado} aria-disabled="true">
          Próxima
          <ChevronRight aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
