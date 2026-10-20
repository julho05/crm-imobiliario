import { Suspense } from 'react';
import { FormularioDeEntrada } from './formulario';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export const metadata = { title: 'Entrar' };

/**
 * `/entrar` — login.
 *
 * A tela **nao** distingue senha errada de e-mail inexistente, e isso nao e
 * descuido de redacao: a API responde a mesma coisa nos dois casos de
 * proposito, e qualquer tentativa de ser mais especifico aqui transformaria o
 * formulario em consulta de quem tem conta na plataforma. Para um CRM
 * imobiliario, essa lista e a carteira de clientes do concorrente.
 *
 * O Suspense existe porque o formulario le a URL (`?destino=`, `?motivo=`), o
 * que so acontece no navegador. O esqueleto tem a forma do cartao para que o
 * layout nao salte quando o conteudo aparece.
 */
export default function Entrar() {
  return (
    <Suspense
      fallback={
        <Card aria-busy="true">
          <CardHeader>
            <div className="bg-muted h-6 w-24 animate-pulse rounded" />
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="bg-muted h-14 animate-pulse rounded" />
            <div className="bg-muted h-14 animate-pulse rounded" />
            <div className="bg-muted h-9 animate-pulse rounded" />
          </CardContent>
        </Card>
      }
    >
      <FormularioDeEntrada />
    </Suspense>
  );
}
