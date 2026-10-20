import * as React from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mensagem de erro, sucesso ou informacao no topo de um formulario.
 *
 * Sempre com **icone e texto**, nunca so a cor: quem nao distingue vermelho de
 * verde precisa receber a mesma informacao, e a exigencia esta no
 * [CLAUDE.md](../../../CLAUDE.md).
 *
 * O `role` muda com o tom de proposito. `alert` interrompe o leitor de tela
 * para anunciar — correto quando a operacao falhou, exagerado para uma
 * instrucao que estava ali antes de a pessoa fazer nada.
 */
const TONS = {
  erro: {
    classe: 'border-destructive/30 bg-destructive/5 text-destructive',
    Icone: CircleAlert,
    role: 'alert' as const,
    rotulo: 'Erro',
  },
  sucesso: {
    classe: 'border-success/30 bg-success/5 text-success',
    Icone: CircleCheck,
    role: 'status' as const,
    rotulo: 'Sucesso',
  },
  informacao: {
    classe: 'border-border bg-muted text-foreground',
    Icone: Info,
    role: undefined,
    rotulo: 'Informacao',
  },
};

export function Aviso({
  tom = 'informacao',
  children,
  className,
}: {
  tom?: keyof typeof TONS;
  children: React.ReactNode;
  className?: string;
}) {
  const { classe, Icone, role, rotulo } = TONS[tom];

  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        classe,
        className,
      )}
    >
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {/* O rotulo existe para o leitor de tela: visualmente o icone ja diz. */}
      <span className="sr-only">{rotulo}:</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
