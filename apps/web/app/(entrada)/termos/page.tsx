import Link from 'next/link';
import { Aviso } from '@/components/aviso';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata = { title: 'Termos de uso' };

/**
 * `/termos` — espera o texto juridico.
 *
 * A pagina existe porque o cadastro pede aceite dos termos e **linka para
 * ca**: deixar o link quebrado seria pedir que a pessoa aceite um documento
 * que nao da para ler.
 *
 * O texto nao e inventado de proposito. Redigir termos de uso que parecem
 * validos e pior do que nao ter nenhum: cria aparencia de protecao juridica
 * que nao existe, para o cliente e para o projeto. O parecer juridico e o item
 * D6 do roadmap.
 */
export default function Termos() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Termos de uso</CardTitle>
        <CardDescription>Documento em elaboracao.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Aviso tom="informacao">
          O texto dos termos de uso ainda esta sendo redigido com apoio
          juridico. Ele estara publicado aqui antes de o sistema ser oferecido
          comercialmente.
        </Aviso>
        <p className="text-muted-foreground text-sm">
          <Link href="/cadastro" className="underline">
            Voltar ao cadastro
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
