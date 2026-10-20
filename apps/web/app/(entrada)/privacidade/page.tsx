import Link from 'next/link';
import { Aviso } from '@/components/aviso';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata = { title: 'Aviso de privacidade' };

/**
 * `/privacidade` — espera o texto juridico.
 *
 * Mesmo motivo de `/termos`: o cadastro linka para ca. E com um agravante —
 * este documento e o que sustenta o consentimento de LGPD registrado em cada
 * lead (`privacyNoticeVersion` em `docs/data-model.md` §7). Um texto
 * improvisado aqui tornaria invalido o consentimento que o banco guarda.
 */
export default function Privacidade() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aviso de privacidade</CardTitle>
        <CardDescription>Documento em elaboracao.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Aviso tom="informacao">
          O aviso de privacidade ainda esta sendo redigido com apoio juridico.
          Ele sera publicado aqui, com versao datada, antes de o sistema receber
          dados de clientes reais.
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
