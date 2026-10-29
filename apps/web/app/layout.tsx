import type { Metadata } from 'next';
import './globals.css';
import { ProvedorDeTema } from '@/components/provedor-de-tema';
import { origemDoSite } from '@/lib/seo';

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'CRM';

export const metadata: Metadata = {
  // Base dos endereços relativos de canônico e Open Graph (item C7). A prévia
  // do WhatsApp e o Google exigem URL absoluta.
  metadataBase: new URL(origemDoSite()),
  title: appName,
  description: 'CRM imobiliario com catalogo publico',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning e exigido pelo next-themes: ele escreve a
    // classe do tema no <html> antes da hidratacao para evitar o flash de
    // tema errado, e isso deixa o atributo do servidor diferente do cliente.
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ProvedorDeTema>{children}</ProvedorDeTema>
      </body>
    </html>
  );
}
