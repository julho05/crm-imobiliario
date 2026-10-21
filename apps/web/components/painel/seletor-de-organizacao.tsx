'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { ROTULOS_DE_PAPEL } from '@app/shared';
import { useSessao } from '@/lib/sessao-do-painel';
import { cn } from '@/lib/utils';

/**
 * Troca de organizacao ativa.
 *
 * ## Quando este componente nao aparece
 *
 * Quando a pessoa tem **um** vinculo. O §5 do mapa de telas decide isso:
 * "um seletor com uma opcao so e ruido", e o corretor autonomo — a maioria dos
 * clientes — e exatamente esse caso. Em vez do seletor, mostra o nome da
 * organizacao e o papel, que e a informacao util.
 *
 * ## A troca acontece no servidor
 *
 * O clique chama `POST /autenticacao/organizacao-ativa`, e o servidor confere o
 * vinculo antes de gravar na sessao. O `organizationId` que vai no corpo e um
 * **pedido**, nao uma declaracao — e e por isso que ele pode ir no corpo sem
 * contradizer a regra de que a organizacao ativa nunca vem do cliente.
 *
 * Nada e guardado no navegador: recarregar a pagina, abrir outra aba ou voltar
 * amanha mostra a mesma organizacao, porque o estado mora na sessao no MySQL.
 */
export function SeletorDeOrganizacao() {
  const { organizacoes, organizacaoAtiva, trocarOrganizacao } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null);

  if (organizacoes.length <= 1) {
    return (
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium">{organizacaoAtiva.nome}</p>
        <p className="text-sidebar-foreground/60 text-xs">
          {ROTULOS_DE_PAPEL[organizacaoAtiva.papel]}
        </p>
      </div>
    );
  }

  async function escolher(organizationId: string) {
    if (organizationId === organizacaoAtiva.organizationId) {
      setAberto(false);
      return;
    }

    setTrocando(organizationId);

    try {
      await trocarOrganizacao(organizationId);
      setAberto(false);
    } finally {
      setTrocando(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors',
          'hover:bg-sidebar-accent/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {organizacaoAtiva.nome}
          </span>
          <span className="text-sidebar-foreground/60 block text-xs">
            {ROTULOS_DE_PAPEL[organizacaoAtiva.papel]}
          </span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 opacity-60"
        />
      </button>

      {aberto ? (
        <>
          {/* Camada que fecha ao clicar fora. Antes da lista no DOM para que a
              lista fique por cima sem precisar de z-index maior. */}
          <button
            type="button"
            aria-label="Fechar"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setAberto(false)}
          />

          <ul
            role="listbox"
            aria-label="Suas organizacoes"
            className="bg-popover text-popover-foreground absolute z-20 mt-1 w-full overflow-hidden rounded-md border shadow-md"
          >
            {organizacoes.map((organizacao) => {
              const ativa =
                organizacao.organizationId === organizacaoAtiva.organizationId;

              return (
                <li key={organizacao.organizationId} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={ativa}
                    disabled={trocando !== null}
                    onClick={() => void escolher(organizacao.organizationId)}
                    className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring flex w-full items-center gap-2 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                  >
                    <Check
                      aria-hidden="true"
                      className={cn('size-4 shrink-0', !ativa && 'invisible')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{organizacao.nome}</span>
                      <span className="text-muted-foreground block text-xs">
                        {ROTULOS_DE_PAPEL[organizacao.papel]}
                      </span>
                    </span>
                    {trocando === organizacao.organizationId ? (
                      <span className="text-muted-foreground text-xs">
                        Trocando...
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
