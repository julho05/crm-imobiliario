'use client';

import { ThemeProvider } from 'next-themes';

/**
 * Provedor do tema claro/escuro.
 *
 * `defaultTheme="light"` cumpre "tema CLARO por padrao" do CLAUDE.md:
 * quem nunca escolheu nada ve o claro, mesmo que o sistema operacional
 * esteja no escuro. `enableSystem` existe porque `ThemePreference` tem a
 * opcao `SYSTEM` — ela e uma escolha deliberada do usuario, nao o padrao.
 *
 * Hoje a preferencia mora no navegador (localStorage do next-themes). Quando
 * a autenticacao existir, ela passa a ser lida de `User.themePreference` e o
 * valor do servidor vira a fonte de verdade — e o que faz a escolha seguir a
 * pessoa de um dispositivo para outro.
 */
export function ProvedorDeTema({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      // Sem isto, trocar de tema anima todas as cores da pagina ao mesmo
      // tempo, o que parece defeito em vez de transicao.
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
