import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Campo de formulario com rotulo, ajuda e erro.
 *
 * Existe para que a parte acessivel nao dependa de ninguem lembrar dela em cada
 * tela. O que ele garante sempre:
 *
 * - `aria-invalid` no campo com erro, e nao apenas a borda vermelha. Cor nunca
 *   e o unico indicador de estado ([CLAUDE.md](../../../CLAUDE.md))
 * - `aria-describedby` apontando para a mensagem, para que o leitor de tela a
 *   anuncie junto com o campo, em vez de deixar a pessoa adivinhar
 * - `role="alert"` na mensagem, para que ela seja lida quando aparecer
 * - `name` igual a chave do schema, que e o que permite ao `focarPrimeiroErro`
 *   achar o campo
 */
export function Campo({
  nome,
  rotulo,
  erro,
  ajuda,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'name' | 'id'> & {
  nome: string;
  rotulo: string;
  erro?: string;
  ajuda?: React.ReactNode;
}) {
  const idDaAjuda = `${nome}-ajuda`;
  const idDoErro = `${nome}-erro`;

  const descricao =
    [erro ? idDoErro : null, ajuda ? idDaAjuda : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={nome}>{rotulo}</Label>

      <Input
        id={nome}
        name={nome}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricao}
        {...props}
      />

      {ajuda ? (
        <p id={idDaAjuda} className="text-muted-foreground text-xs">
          {ajuda}
        </p>
      ) : null}

      {erro ? (
        <p id={idDoErro} role="alert" className="text-destructive text-xs">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
