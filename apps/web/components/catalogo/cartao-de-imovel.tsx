import Link from 'next/link';
import { BedDouble, Car, House, Ruler } from 'lucide-react';
import { ROTULOS_DE_FINALIDADE, ROTULOS_DE_TIPO_DE_IMOVEL } from '@app/shared';
import { formatarArea, precoPorFinalidade } from '@/lib/imoveis';
import { localizacao, type ImovelPublico } from '@/lib/catalogo';
import { EtiquetaDeReserva } from './etiqueta-de-reserva';

/**
 * Um imóvel na grade da vitrine.
 *
 * O cartão inteiro é o link: no celular, alvo de toque do tamanho do cartão é
 * o que se acerta com o polegar. O título fica dentro do link e é o que o
 * leitor de tela anuncia.
 *
 * ## Sem foto não pode parecer defeito
 *
 * Muitos imóveis vão ao ar antes das fotos — o corretor publica para mandar o
 * link e fotografa depois. O espaço da capa mantém a mesma proporção com ou sem
 * imagem, para a grade não pular, e diz "sem foto" em vez de mostrar um ícone
 * de imagem quebrada.
 */
export function CartaoDeImovel({
  imovel,
  slugDaOrganizacao,
}: {
  imovel: ImovelPublico;
  slugDaOrganizacao: string;
}) {
  // A área útil é a que o comprador compara; a total entra quando é a única.
  const area = imovel.areaUtil ?? imovel.areaTotal;

  return (
    <Link
      href={`/o/${slugDaOrganizacao}/imovel/${imovel.slug}`}
      className="group bg-card text-card-foreground flex w-full flex-col overflow-hidden rounded-lg border shadow-xs transition-shadow hover:shadow-md"
    >
      <div className="bg-muted relative aspect-[4/3]">
        {imovel.capa ? (
          // `<img>` comum, não `next/image`: ver a nota em
          // `components/imoveis/galeria-de-midia.tsx` — a URL é assinada e muda
          // a cada leitura, e o otimizador cacheia por URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imovel.capa.url}
            alt={imovel.capa.textoAlternativo ?? ''}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-1 text-sm">
            <House className="size-8" aria-hidden="true" />
            <span>Sem foto</span>
          </div>
        )}

        {imovel.status === 'RESERVED' && (
          <EtiquetaDeReserva className="absolute top-2 left-2" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-muted-foreground text-xs">
          {ROTULOS_DE_TIPO_DE_IMOVEL[imovel.tipo]} ·{' '}
          {ROTULOS_DE_FINALIDADE[imovel.finalidade]}
        </p>

        <h2 className="line-clamp-2 font-medium group-hover:underline">
          {imovel.titulo}
        </h2>

        <p className="text-muted-foreground text-sm">{localizacao(imovel)}</p>

        <p className="mt-2 text-lg font-semibold">
          {precoPorFinalidade(imovel)}
        </p>

        {/* Só o que existe: imóvel sem dormitório informado não ganha "0". */}
        <ul className="text-muted-foreground mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm">
          {imovel.dormitorios !== null && (
            <li className="flex items-center gap-1">
              <BedDouble className="size-4" aria-hidden="true" />
              {imovel.dormitorios}{' '}
              {imovel.dormitorios === 1 ? 'dormitório' : 'dormitórios'}
            </li>
          )}
          {imovel.vagas !== null && (
            <li className="flex items-center gap-1">
              <Car className="size-4" aria-hidden="true" />
              {imovel.vagas} {imovel.vagas === 1 ? 'vaga' : 'vagas'}
            </li>
          )}
          {area !== null && (
            <li className="flex items-center gap-1">
              <Ruler className="size-4" aria-hidden="true" />
              {formatarArea(area)}
            </li>
          )}
        </ul>
      </div>
    </Link>
  );
}
