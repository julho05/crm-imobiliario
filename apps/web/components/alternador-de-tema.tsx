'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Botao que alterna entre claro e escuro.
 *
 * ## Por que os dois icones sao renderizados sempre
 *
 * O servidor nao sabe qual tema o usuario escolheu — essa informacao esta no
 * navegador. A solucao comum e um estado `montado` com `useEffect`, mas isso
 * provoca uma segunda renderizacao so para trocar um icone, e o React 19
 * reclama disso com razao.
 *
 * Aqui os dois icones vao na marcacao e o CSS decide qual aparece, usando a
 * mesma classe `dark` que o next-themes escreve no `<html>` **antes** da
 * hidratacao. Resultado: nenhum estado, nenhum efeito, nenhuma diferenca
 * entre servidor e cliente, e nenhum salto de layout.
 *
 * O tema atual ainda e lido para decidir o destino do clique — mas isso
 * acontece no evento, nunca na renderizacao, entao nao afeta a hidratacao.
 */
export function AlternadorDeTema() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      // O botao mostra apenas um icone; sem rotulo acessivel, um leitor de
      // tela anuncia so "botao". O texto e neutro de proposito: ele vale nos
      // dois estados, e nao depende de saber qual tema esta ativo.
      aria-label="Alternar entre tema claro e escuro"
      title="Alternar tema"
    >
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </Button>
  );
}
