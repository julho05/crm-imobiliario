import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Seletor **nativo**, e nao o `Select` do Radix.
 *
 * O `radix-ui` ja e dependencia do projeto, entao a escolha nao foi por evitar
 * instalacao. Foi por tres razoes concretas:
 *
 * 1. **No celular, o nativo e melhor.** O sistema abre a roda ou a lista
 *    propria do aparelho, com o tamanho de toque e a rolagem que a pessoa ja
 *    conhece. O produto e usado por corretor em visita, no telefone, e isso
 *    pesa mais aqui do que controle fino de estilo.
 * 2. **Funciona sem JavaScript** e e acessivel por teclado sem nada escrito:
 *    nenhum `aria-` a lembrar, nenhuma armadilha de foco a testar.
 * 3. O `name` chega ao `FormData` sozinho, que e como os formularios deste
 *    projeto leem os valores (ver `lib/formulario.ts`).
 *
 * O que se perde: opcao com icone, busca dentro da lista e estilo da lista
 * aberta. Nenhum dos tres e necessario para tipo, finalidade e UF. Se um dia
 * um campo precisar de busca — cidade, por exemplo —, aquele campo troca de
 * componente, e nao todos.
 */
function Select({
  className,
  children,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          'h-9 w-full appearance-none rounded-md border border-input bg-transparent py-1 pr-9 pl-3 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          // O `option` herda a cor do tema escuro em alguns navegadores e fica
          // texto claro sobre fundo claro. Declarar as duas resolve.
          '[&>option]:bg-background [&>option]:text-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </select>

      {/* `pointer-events-none` para que o clique na seta chegue ao select. */}
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}

export { Select };
