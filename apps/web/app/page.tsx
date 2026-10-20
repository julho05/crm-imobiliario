'use client';

import { useEffect, useState } from 'react';
import { AlternadorDeTema } from '@/components/alternador-de-tema';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'CRM';

// Caminho relativo, de proposito: o navegador fala com a propria origem e o
// Next repassa para a API (ver next.config.mjs). Nada de URL absoluta com
// porta — ela voltaria a ser requisicao entre origens.
const apiUrl = '/api';

type ApiState =
  | { kind: 'loading' }
  | { kind: 'ok'; payload: unknown }
  | { kind: 'error'; message: string };

export default function Home() {
  const [api, setApi] = useState<ApiState>({ kind: 'loading' });

  useEffect(() => {
    fetch(`${apiUrl}/health`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((payload) => setApi({ kind: 'ok', payload }))
      .catch((e: Error) => setApi({ kind: 'error', message: e.message }));
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-navy text-3xl font-semibold tracking-tight dark:text-foreground">
            {appName}
          </h1>
          <p className="text-muted-foreground mt-1">
            Fundacao do projeto. Nenhuma funcionalidade ainda.
          </p>
        </div>
        <AlternadorDeTema />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Web (Next.js)</CardTitle>
          <CardDescription>
            Funcionando. Voce esta vendo esta pagina.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card
        className={
          // A borda colorida a esquerda e o indicador de estado. Nunca e o
          // unico: o texto e a etiqueta dizem a mesma coisa, porque cor
          // sozinha nao comunica a quem nao a distingue.
          'mt-4 border-l-4 ' +
          (api.kind === 'ok'
            ? 'border-l-success'
            : api.kind === 'error'
              ? 'border-l-destructive'
              : 'border-l-accent')
        }
      >
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">API (NestJS)</CardTitle>

            {api.kind === 'loading' && (
              <Badge variant="secondary">Consultando</Badge>
            )}
            {api.kind === 'ok' && <Badge variant="secondary">No ar</Badge>}
            {api.kind === 'error' && (
              <Badge variant="destructive">Sem resposta</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {api.kind === 'loading' && (
            <p className="text-muted-foreground">Consultando...</p>
          )}

          {api.kind === 'ok' && (
            <>
              <p className="mb-3">Respondeu. O site conversa com a API.</p>
              <pre className="bg-muted text-muted-foreground overflow-x-auto rounded-md p-3 text-xs">
                {JSON.stringify(api.payload, null, 2)}
              </pre>
            </>
          )}

          {api.kind === 'error' && (
            <>
              <p className="mb-2">Nao respondeu: {api.message}</p>
              <p className="text-muted-foreground text-sm">
                Verifique se a API subiu em {apiUrl}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
