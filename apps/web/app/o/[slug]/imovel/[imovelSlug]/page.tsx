import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Check, MapPin } from 'lucide-react';
import { ROTULOS_DE_FINALIDADE, ROTULOS_DE_TIPO_DE_IMOVEL } from '@app/shared';
import {
  CabecalhoDaOrganizacao,
  ContatoDaOrganizacao,
} from '@/components/catalogo/cabecalho-da-organizacao';
import { EtiquetaDeReserva } from '@/components/catalogo/etiqueta-de-reserva';
import { GaleriaPublica } from '@/components/catalogo/galeria-publica';
import {
  buscarAnuncio,
  enderecoPorExtenso,
  localizacao,
  type ImovelPublico,
} from '@/lib/catalogo';
import { formatarArea, formatarDinheiro } from '@/lib/imoveis';

/**
 * `/o/[slug]/imovel/[imovelSlug]` — o anúncio, item **C1**.
 *
 * ## O endereço é o que a API devolveu, e nada além
 *
 * `imovel.endereco` já vem cortado conforme a visibilidade escolhida pelo
 * corretor (`montarEndereco`, na API): rua com número, rua sem número, ou
 * `null`. A tela não sabe qual foi a escolha — o campo `addressVisibility` não
 * sai no catálogo — e não precisa: com `null`, o bloco simplesmente não
 * existe, e o bairro e a cidade já estão no topo.
 *
 * ## O formulário de interesse ainda não está aqui
 *
 * É o item C5, que depende do aviso de privacidade e do anti-spam. Até lá, o
 * lado do anúncio mostra o contato da organização. Desenhar um formulário que
 * não envia nada seria pior do que não ter: o visitante preencheria e
 * esperaria resposta.
 */

type Props = {
  params: Promise<{ slug: string; imovelSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, imovelSlug } = await params;
  const { organizacao, imovel } = await buscarAnuncio(slug, imovelSlug);

  return {
    title: `${imovel.titulo} — ${organizacao.nome}`,
    description: `${ROTULOS_DE_TIPO_DE_IMOVEL[imovel.tipo]} em ${localizacao(
      imovel,
    )}.`,
  };
}

export default async function Anuncio({ params }: Props) {
  const { slug, imovelSlug } = await params;
  const { organizacao, imovel } = await buscarAnuncio(slug, imovelSlug);

  const temContato = Boolean(organizacao.telefone || organizacao.email);

  return (
    <>
      <CabecalhoDaOrganizacao organizacao={organizacao} naVitrine={false} />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Link
          href={`/o/${organizacao.slug}`}
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Todos os imóveis
        </Link>

        <GaleriaPublica fotos={imovel.fotos} />

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
          <article className="min-w-0">
            <p className="text-muted-foreground text-sm">
              {ROTULOS_DE_TIPO_DE_IMOVEL[imovel.tipo]} ·{' '}
              {ROTULOS_DE_FINALIDADE[imovel.finalidade]} · Cód. {imovel.codigo}
            </p>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {imovel.titulo}
            </h1>

            {imovel.status === 'RESERVED' && (
              <div className="mt-3">
                <EtiquetaDeReserva />
                <p className="text-muted-foreground mt-1 text-sm">
                  Há uma proposta em andamento para este imóvel.
                </p>
              </div>
            )}

            <p className="mt-3 flex items-start gap-1.5">
              <MapPin
                className="text-muted-foreground mt-1 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                {imovel.endereco && (
                  <span className="block">
                    {enderecoPorExtenso(imovel.endereco)}
                  </span>
                )}
                <span
                  className={imovel.endereco ? 'text-muted-foreground' : ''}
                >
                  {localizacao(imovel)}
                </span>
              </span>
            </p>

            <Valores imovel={imovel} />

            <Numeros imovel={imovel} />

            {imovel.descricao && (
              <section className="mt-8">
                <h2 className="mb-2 text-lg font-semibold">Descrição</h2>
                <p className="max-w-prose whitespace-pre-line">
                  {imovel.descricao}
                </p>
              </section>
            )}

            {imovel.caracteristicas.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-2 text-lg font-semibold">Características</h2>
                <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {imovel.caracteristicas.map((caracteristica) => (
                    <li
                      key={caracteristica}
                      className="flex items-center gap-2"
                    >
                      <Check
                        className="text-success size-4 shrink-0"
                        aria-hidden="true"
                      />
                      {caracteristica}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>

          {temContato && (
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="bg-card rounded-lg border p-4">
                <h2 className="mb-1 font-semibold">Gostou deste imóvel?</h2>
                <p className="text-muted-foreground mb-3 text-sm">
                  Fale com {organizacao.nome} e informe o código{' '}
                  <strong className="text-foreground">{imovel.codigo}</strong>.
                </p>
                <ContatoDaOrganizacao organizacao={organizacao} />
              </div>
            </aside>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * Preços, condomínio e IPTU.
 *
 * Cada valor em uma linha com o próprio rótulo, em vez do resumo de uma linha
 * do cartão: no anúncio o visitante está decidindo se liga, e "R$ 850,00" solto
 * não diz se é o condomínio ou o IPTU. Valor ausente não aparece — mostrar um
 * travessão ao lado de "IPTU" sugeriria que o imóvel não paga.
 */
function Valores({ imovel }: { imovel: ImovelPublico }) {
  const linhas: [string, string][] = [];

  if (imovel.finalidade !== 'RENT' && imovel.preco !== null) {
    linhas.push(['Venda', formatarDinheiro(imovel.preco)]);
  }
  if (imovel.finalidade !== 'SALE' && imovel.precoDeAluguel !== null) {
    linhas.push(['Aluguel', `${formatarDinheiro(imovel.precoDeAluguel)}/mês`]);
  }
  if (imovel.condominio !== null) {
    linhas.push(['Condomínio', `${formatarDinheiro(imovel.condominio)}/mês`]);
  }
  if (imovel.iptu !== null) {
    linhas.push(['IPTU', formatarDinheiro(imovel.iptu)]);
  }

  if (linhas.length === 0) {
    return null;
  }

  return (
    <dl className="bg-card mt-6 divide-y rounded-lg border">
      {linhas.map(([rotulo, valor], indice) => (
        <div key={rotulo} className="flex justify-between gap-4 px-4 py-2.5">
          <dt className="text-muted-foreground">{rotulo}</dt>
          <dd
            className={indice === 0 ? 'text-lg font-semibold' : 'font-medium'}
          >
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Dormitórios, vagas, áreas.
 *
 * Só o que foi informado. Área e dormitórios são opcionais por decisão de
 * 21/10/2026 — campo obrigatório que o corretor ainda não sabe produz número
 * inventado —, e a consequência aqui é não transformar ausência em zero.
 */
function Numeros({ imovel }: { imovel: ImovelPublico }) {
  const itens: [string, string][] = [];

  if (imovel.dormitorios !== null) {
    itens.push(['Dormitórios', String(imovel.dormitorios)]);
  }
  if (imovel.suites !== null) {
    itens.push(['Suítes', String(imovel.suites)]);
  }
  if (imovel.banheiros !== null) {
    itens.push(['Banheiros', String(imovel.banheiros)]);
  }
  if (imovel.vagas !== null) {
    itens.push(['Vagas', String(imovel.vagas)]);
  }
  if (imovel.areaUtil !== null) {
    itens.push(['Área útil', formatarArea(imovel.areaUtil)]);
  }
  if (imovel.areaTotal !== null) {
    itens.push(['Área total', formatarArea(imovel.areaTotal)]);
  }

  if (itens.length === 0) {
    return null;
  }

  return (
    <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="bg-muted rounded-md px-3 py-2">
          <dt className="text-muted-foreground text-xs">{rotulo}</dt>
          <dd className="font-semibold">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}
