'use client';

import { useEffect, useState } from 'react';

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'CRM';
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

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
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 16px' }}>
      <h1 style={{ color: 'var(--navy)', marginBottom: 4 }}>{appName}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Fundacao do projeto. Nenhuma funcionalidade ainda.
      </p>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 20,
          marginTop: 32,
        }}
      >
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Web (Next.js)</h2>
        <p style={{ margin: 0, color: 'green' }}>
          Funcionando. Voce esta vendo esta pagina.
        </p>
      </section>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderLeft: `4px solid ${
            api.kind === 'ok'
              ? 'green'
              : api.kind === 'error'
                ? 'crimson'
                : 'var(--gold)'
          }`,
          borderRadius: 8,
          padding: 20,
          marginTop: 16,
        }}
      >
        <h2 style={{ fontSize: 16, marginTop: 0 }}>API (NestJS)</h2>

        {api.kind === 'loading' && (
          <p style={{ margin: 0, color: 'var(--muted)' }}>Consultando...</p>
        )}

        {api.kind === 'ok' && (
          <>
            <p style={{ margin: '0 0 8px', color: 'green' }}>
              Respondeu. O site conversa com a API.
            </p>
            <pre
              style={{
                background: 'var(--bg)',
                padding: 12,
                borderRadius: 6,
                fontSize: 13,
                overflowX: 'auto',
                margin: 0,
              }}
            >
              {JSON.stringify(api.payload, null, 2)}
            </pre>
          </>
        )}

        {api.kind === 'error' && (
          <>
            <p style={{ margin: '0 0 8px', color: 'crimson' }}>
              Nao respondeu: {api.message}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
              Verifique se a API subiu em {apiUrl}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
