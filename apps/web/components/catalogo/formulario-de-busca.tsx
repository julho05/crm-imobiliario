import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';
import { PropertyType, ROTULOS_DE_TIPO_DE_IMOVEL } from '@app/shared';
import { Campo, CampoSelecao } from '@/components/campo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * A busca da vitrine — item **C4**.
 *
 * ## Formulário HTML comum, enviado por GET
 *
 * Sem `'use client'`, sem estado, sem `onSubmit`. O navegador monta a URL com
 * os campos e pede a página de novo, e o servidor a desenha já filtrada. Três
 * consequências, todas desejadas:
 *
 * - funciona antes de qualquer script carregar, no 4G do visitante
 * - a busca vira URL — "apartamentos para alugar até R$ 3.000" se manda pelo
 *   WhatsApp
 * - enviar volta à página 1, porque `pagina` não é campo do formulário
 *
 * O preço do custo: o formulário não reage ao que se escolhe. Os campos de
 * preço não podem aparecer só depois da finalidade, então ficam sempre
 * visíveis, com a ajuda dizendo que dependem dela; e preço sem finalidade volta
 * como erro no campo, validado pelo mesmo contrato da API.
 *
 * ## Os filtros secundários ficam recolhidos
 *
 * Num `<details>`, que também dispensa JavaScript. A busca livre fica sempre à
 * vista — é o que se usa mais — e o resto abre sozinho quando há filtro em uso
 * ou erro a corrigir, para ninguém ter um filtro aplicado escondido.
 */

const FINALIDADES = [
  { valor: 'SALE', rotulo: 'Comprar' },
  { valor: 'RENT', rotulo: 'Alugar' },
];

const TIPOS = Object.values(PropertyType).map((tipo) => ({
  valor: tipo,
  rotulo: ROTULOS_DE_TIPO_DE_IMOVEL[tipo],
}));

const MINIMOS = [1, 2, 3, 4].map((n) => ({
  valor: String(n),
  rotulo: `${n} ou mais`,
}));

/** Os campos que moram dentro do `<details>`. */
const SECUNDARIOS = [
  'finalidade',
  'tipo',
  'precoMinimo',
  'precoMaximo',
  'quartosMinimo',
  'vagasMinimo',
  'areaMinima',
];

export function FormularioDeBusca({
  slug,
  valores,
  erros,
  emUso,
}: {
  slug: string;
  valores: Record<string, string>;
  erros: Record<string, string>;
  /** Há filtro aplicado, ou erro de filtro — mostra o "Limpar busca". */
  emUso: boolean;
}) {
  const abrirDetalhes =
    Object.keys(erros).length > 0 ||
    SECUNDARIOS.some((campo) => Boolean(valores[campo]));

  return (
    <form
      method="get"
      action={`/o/${slug}`}
      role="search"
      aria-label="Buscar imóveis"
      className="bg-card mb-6 rounded-lg border p-4"
    >
      <div className="flex gap-2">
        <label htmlFor="termo" className="sr-only">
          Buscar por bairro, cidade, título ou código
        </label>
        <Input
          id="termo"
          name="termo"
          type="search"
          defaultValue={valores.termo ?? ''}
          placeholder="Bairro, cidade ou código"
          maxLength={120}
          aria-invalid={erros.termo ? true : undefined}
        />
        <Button type="submit" className="shrink-0">
          <Search aria-hidden="true" />
          <span className="max-sm:sr-only">Buscar</span>
        </Button>
      </div>

      {emUso && (
        // Fora do `<details>`: a busca só por texto deixa os filtros
        // recolhidos, e o caminho de volta não pode ficar escondido com eles.
        <p className="mt-2 text-right text-sm">
          <Link
            href={`/o/${slug}`}
            className="text-muted-foreground hover:text-foreground underline"
          >
            Limpar busca
          </Link>
        </p>
      )}

      <details open={abrirDetalhes} className="mt-3">
        <summary className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1.5 text-sm select-none">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Mais filtros
        </summary>

        {/* `items-start`: o texto de ajuda do preço mínimo deixa aquela célula
            mais alta, e esticadas as outras desceriam o rótulo. */}
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CampoSelecao
            nome="finalidade"
            rotulo="Quero"
            opcoes={FINALIDADES}
            textoVazio="Comprar ou alugar"
            defaultValue={valores.finalidade ?? ''}
            erro={erros.finalidade}
          />
          <CampoSelecao
            nome="tipo"
            rotulo="Tipo"
            opcoes={TIPOS}
            textoVazio="Qualquer tipo"
            defaultValue={valores.tipo ?? ''}
            erro={erros.tipo}
          />
          <Campo
            nome="precoMinimo"
            rotulo="Preço mínimo (R$)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={valores.precoMinimo ?? ''}
            erro={erros.precoMinimo}
            ajuda="Escolha comprar ou alugar para usar o preço."
          />
          <Campo
            nome="precoMaximo"
            rotulo="Preço máximo (R$)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={valores.precoMaximo ?? ''}
            erro={erros.precoMaximo}
          />
          <CampoSelecao
            nome="quartosMinimo"
            rotulo="Dormitórios"
            opcoes={MINIMOS}
            textoVazio="Qualquer"
            defaultValue={valores.quartosMinimo ?? ''}
            erro={erros.quartosMinimo}
          />
          <CampoSelecao
            nome="vagasMinimo"
            rotulo="Vagas"
            opcoes={MINIMOS.slice(0, 3)}
            textoVazio="Qualquer"
            defaultValue={valores.vagasMinimo ?? ''}
            erro={erros.vagasMinimo}
          />
          <Campo
            nome="areaMinima"
            rotulo="Área mínima (m²)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={valores.areaMinima ?? ''}
            erro={erros.areaMinima}
          />

          {/* Na base da célula, alinhado aos campos e não aos rótulos. */}
          <Button type="submit" className="w-full self-end">
            Aplicar filtros
          </Button>
        </div>
      </details>
    </form>
  );
}
