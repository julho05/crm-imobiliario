import { House } from 'lucide-react';
import { ROTULOS_DE_TIPO_DE_MIDIA } from '@app/shared';
import type { MidiaPublica } from '@/lib/catalogo';

/**
 * As fotos e plantas do anúncio.
 *
 * ## Rolagem nativa, sem JavaScript
 *
 * Uma faixa horizontal com `scroll-snap`: no celular, desliza com o dedo e
 * para em cada foto; no computador, rola com a barra ou com as setas do
 * teclado, porque a faixa recebe foco. Carrossel com botões exigiria componente
 * de cliente, e a página inteira é do servidor — o anúncio aparece completo
 * antes de qualquer script carregar.
 *
 * Só a primeira foto carrega de imediato. As outras ficam com
 * `loading="lazy"`: vinte fotos de uma vez no 4G do visitante atrasariam a
 * primeira, que é a única que ele vê ao abrir.
 *
 * `DOCUMENT` não chega aqui: a API nem o lê do banco.
 */
export function GaleriaPublica({ fotos }: { fotos: MidiaPublica[] }) {
  if (fotos.length === 0) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-[16/9] flex-col items-center justify-center gap-2 rounded-lg text-sm">
        <House className="size-10" aria-hidden="true" />
        <span>Este anúncio ainda não tem fotos.</span>
      </div>
    );
  }

  return (
    <div>
      <ul
        // A faixa rola; sem foco, quem usa só o teclado não alcança as fotos
        // escondidas à direita.
        tabIndex={0}
        aria-label={`Fotos do imóvel, ${fotos.length} ${
          fotos.length === 1 ? 'imagem' : 'imagens'
        }`}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-lg"
      >
        {fotos.map((foto, indice) => (
          <li
            key={foto.url}
            className="bg-muted relative aspect-[4/3] w-full shrink-0 snap-start overflow-hidden rounded-lg sm:w-[80%] lg:w-[65%]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={foto.url}
              alt={foto.textoAlternativo ?? ''}
              loading={indice === 0 ? 'eager' : 'lazy'}
              className={
                // A planta não pode ser cortada: o `cover` comeria as bordas,
                // onde estão as medidas.
                foto.kind === 'FLOORPLAN'
                  ? 'size-full bg-white object-contain'
                  : 'size-full object-cover'
              }
            />
            <span className="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              {foto.kind === 'FLOORPLAN'
                ? `${ROTULOS_DE_TIPO_DE_MIDIA.FLOORPLAN} · `
                : ''}
              {indice + 1} de {fotos.length}
            </span>
          </li>
        ))}
      </ul>

      {fotos.length > 1 && (
        <p className="text-muted-foreground mt-2 text-xs">
          Deslize para ver as outras fotos.
        </p>
      )}
    </div>
  );
}
