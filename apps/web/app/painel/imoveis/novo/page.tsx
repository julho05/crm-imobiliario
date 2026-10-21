'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { podeFazer } from '@app/shared';
import { Aviso } from '@/components/aviso';
import { FormularioDeImovel } from '@/components/imoveis/formulario-de-imovel';
import { Button } from '@/components/ui/button';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/imoveis/novo`.
 *
 * A verificacao de papel aqui evita mostrar um formulario que o servidor vai
 * recusar no envio — nada mais. `imovel:criar` e `ORG` para os quatro papeis
 * hoje, entao o aviso nao aparece na pratica; existe porque a matriz pode
 * mudar, e quando mudar esta tela nao deve passar a enganar a pessoa.
 */
export default function NovoImovel() {
  const { papel } = useSessao();

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/painel/imoveis">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Imoveis
        </Link>
      </Button>

      <h1 className="text-navy mt-2 text-2xl font-semibold tracking-tight dark:text-foreground">
        Novo imovel
      </h1>

      <div className="mt-8">
        {podeFazer(papel, 'imovel:criar') === false ? (
          <Aviso tom="erro">
            Seu papel nao permite cadastrar imoveis nesta organizacao.
          </Aviso>
        ) : (
          <FormularioDeImovel />
        )}
      </div>
    </div>
  );
}
