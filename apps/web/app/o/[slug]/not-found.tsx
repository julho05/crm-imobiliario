import { SearchX } from 'lucide-react';

/**
 * 404 da vitrine e do anúncio.
 *
 * Uma frase só para todos os casos — slug que nunca existiu, organização
 * suspensa, imóvel que saiu do ar ou voltou a rascunho. A API já responde igual
 * a todos eles (`permissions.md` §6), e esta página não pode desfazer isso
 * escolhendo palavras diferentes: "este imóvel foi vendido" ou "esta
 * imobiliária está suspensa" informariam o que o 404 existe para não dizer.
 *
 * Sem link para a vitrine: a página não sabe se a organização existe, e
 * oferecer o caminho seria afirmar que sim.
 */
export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <SearchX className="text-muted-foreground size-10" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-muted-foreground">
        O endereço pode ter mudado ou o anúncio pode não estar mais disponível.
      </p>
    </main>
  );
}
