import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Junta classes condicionais e resolve conflitos do Tailwind.
 *
 * O twMerge existe porque "px-2 px-4" nao e resolvido pela cascata do CSS: as
 * duas classes tem a mesma especificidade, e quem ganha depende da ordem no
 * arquivo gerado, nao da ordem em que foram escritas. Ele mantem a ultima.
 *
 * Usado por todos os componentes do shadcn/ui.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
