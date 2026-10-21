'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, TrendingUp, Users } from 'lucide-react';
import { podeFazer, type Acao, type Role } from '@app/shared';
import { cn } from '@/lib/utils';

/**
 * Navegacao do painel, por papel — tabela do §5 de
 * [pages-and-navigation.md](../../../../docs/pages-and-navigation.md).
 *
 * ## Quem decide o que aparece
 *
 * A matriz de `@app/shared`, pela mesma `podeFazer()` que a guarda da API
 * consulta. Lista escrita a mao aqui divergiria da matriz no primeiro ajuste de
 * permissao, e divergiria em silencio: o menu ofereceria uma tela que responde
 * 403, ou esconderia uma que a pessoa podia usar.
 *
 * Item sem acao correspondente na matriz — o dashboard e o perfil proprio, que
 * todo mundo alcanca — declara `acao: null` em vez de uma acao inventada.
 *
 * ## So o que existe
 *
 * Esta lista tem quatro itens porque sao as quatro secoes construidas. Agenda,
 * equipe, organizacao, auditoria e perfil entram **quando existirem**:
 * menu que leva a tela vazia ou a 404 e pior do que menu curto, porque ensina a
 * pessoa a nao confiar na navegacao.
 *
 * ## Esconder nao e proteger
 *
 * O §5 do mapa de telas e explicito: **esconder item de menu nao e seguranca**.
 * Quem digitar a URL recebe a recusa do servidor de novo. Isto aqui existe para
 * nao oferecer um caminho que termina em erro.
 */

type ItemDeMenu = {
  rotulo: string;
  href: string;
  icone: typeof LayoutDashboard;
  /** Acao exigida, ou `null` quando todo papel alcanca. */
  acao: Acao | null;
};

const ITENS: ItemDeMenu[] = [
  {
    rotulo: 'Painel',
    href: '/painel',
    icone: LayoutDashboard,
    acao: null,
  },
  {
    rotulo: 'Imoveis',
    href: '/painel/imoveis',
    icone: Building2,
    acao: 'imovel:ver',
  },
  {
    rotulo: 'Clientes',
    href: '/painel/leads',
    icone: Users,
    acao: 'lead:ver',
  },
  {
    rotulo: 'Funil',
    href: '/painel/funil',
    icone: TrendingUp,
    acao: 'negociacao:ver',
  },
];

export function itensVisiveis(papel: Role): ItemDeMenu[] {
  return ITENS.filter(
    (item) => item.acao === null || podeFazer(papel, item.acao) !== false,
  );
}

export function Navegacao({
  papel,
  aoNavegar,
}: {
  papel: Role;
  /** Fecha o menu no celular depois do toque. */
  aoNavegar?: () => void;
}) {
  const caminho = usePathname();

  return (
    <nav aria-label="Navegacao principal" className="grid gap-1">
      {itensVisiveis(papel).map((item) => {
        // `/painel` casaria com tudo se o teste fosse apenas `startsWith`.
        const ativo =
          item.href === '/painel'
            ? caminho === '/painel'
            : caminho.startsWith(item.href);

        const Icone = item.icone;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={aoNavegar}
            // `aria-current` para que o leitor de tela anuncie a pagina atual:
            // o destaque de cor nao chega a quem nao ve a tela.
            aria-current={ativo ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              ativo
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
            )}
          >
            <Icone aria-hidden="true" className="size-4 shrink-0" />
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
