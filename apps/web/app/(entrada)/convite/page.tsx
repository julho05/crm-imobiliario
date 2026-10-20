import { Suspense } from 'react';
import { ConteudoDoConvite } from './conteudo';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export const metadata = { title: 'Convite' };

/**
 * `/convite?token=...`
 *
 * O Suspense e obrigatorio porque o conteudo le o token da URL, que so existe
 * no navegador.
 */
export default function Convite() {
  return (
    <Suspense
      fallback={
        <Card aria-busy="true">
          <CardHeader>
            <div className="bg-muted h-6 w-32 animate-pulse rounded" />
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="bg-muted h-20 animate-pulse rounded" />
            <div className="bg-muted h-9 animate-pulse rounded" />
          </CardContent>
        </Card>
      }
    >
      <ConteudoDoConvite />
    </Suspense>
  );
}
