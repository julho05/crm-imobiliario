import Link from 'next/link';
import { AlternadorDeTema } from '@/components/alternador-de-tema';

const nomeDoApp = process.env.NEXT_PUBLIC_APP_NAME ?? 'CRM';

/**
 * Moldura das telas de entrada: entrar, cadastro, recuperar senha, redefinir
 * senha e convite.
 *
 * `(entrada)` entre parenteses e um grupo de rotas do Next: organiza os
 * arquivos e compartilha este layout **sem** entrar na URL. A tela de login
 * continua em `/entrar`, como o mapa de telas define.
 *
 * O alternador de tema fica aqui, e nao so dentro do painel, porque a
 * preferencia de tema precisa valer antes de existir sessao — quem prefere
 * tema escuro nao deve levar um clarao na tela de login.
 */
export default function LayoutDeEntrada({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="text-navy text-lg font-semibold tracking-tight dark:text-foreground"
        >
          {nomeDoApp}
        </Link>
        <AlternadorDeTema />
      </header>

      {/* `flex-1` com centralizacao vertical: em tela de celular o conteudo
          comeca no topo e cresce; em tela grande fica centralizado. */}
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="text-muted-foreground px-4 py-6 text-center text-xs sm:px-6">
        <Link href="/termos" className="hover:text-foreground underline">
          Termos de uso
        </Link>
        <span className="mx-2">·</span>
        <Link href="/privacidade" className="hover:text-foreground underline">
          Aviso de privacidade
        </Link>
      </footer>
    </div>
  );
}
