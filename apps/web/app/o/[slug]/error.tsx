'use client';

import { CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Falha ao carregar a vitrine ou o anúncio — API fora do ar, erro 500.
 *
 * Nunca a mensagem técnica (§8 do mapa de telas). Em produção o Next nem a
 * entrega ao navegador; em desenvolvimento entregaria, e por isso ela não é
 * lida aqui.
 *
 * `retry` refaz a busca no servidor, ao contrário de `reset`, que só
 * redesenharia o que já tinha falhado.
 */
export default function ErroDaVitrine({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <CloudOff className="text-muted-foreground size-10" aria-hidden="true" />
      <h1 className="text-xl font-semibold">
        Não foi possível carregar esta página
      </h1>
      <p className="text-muted-foreground">
        Pode ser uma instabilidade passageira. Tente de novo em instantes.
      </p>
      <Button onClick={() => retry()} className="mt-2">
        Tentar de novo
      </Button>
    </main>
  );
}
