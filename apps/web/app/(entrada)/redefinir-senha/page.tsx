import { Suspense } from 'react';
import { FormularioDeRedefinicao } from './formulario';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export const metadata = { title: 'Nova senha' };

/**
 * `/redefinir-senha?token=...`
 *
 * O Suspense e obrigatorio porque o formulario le o token da URL, e isso so
 * acontece no navegador — sem ele o Next nao consegue pre-renderizar a rota.
 */
export default function RedefinirSenha() {
  return (
    <Suspense
      fallback={
        <Card aria-busy="true">
          <CardHeader>
            <div className="bg-muted h-6 w-28 animate-pulse rounded" />
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="bg-muted h-14 animate-pulse rounded" />
            <div className="bg-muted h-14 animate-pulse rounded" />
            <div className="bg-muted h-9 animate-pulse rounded" />
          </CardContent>
        </Card>
      }
    >
      <FormularioDeRedefinicao />
    </Suspense>
  );
}
