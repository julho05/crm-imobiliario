import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * "Reservado", no cartão e no anúncio.
 *
 * A etiqueta não é detalhe estético (decisão de 19/10/2026, em
 * [pages-and-navigation.md](../../../../docs/pages-and-navigation.md) §6): sem
 * ela, o interessado descobre a reserva só depois de ligar.
 *
 * Dourado com texto azul-marinho, que passa no contraste (6,19:1), e com ícone
 * e texto — nunca só a cor.
 */
export function EtiquetaDeReserva({ className }: { className?: string }) {
  return (
    <Badge
      className={cn('bg-accent text-accent-foreground shadow-sm', className)}
    >
      <Clock aria-hidden="true" />
      Reservado
    </Badge>
  );
}
