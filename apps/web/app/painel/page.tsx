'use client';

import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';
import { ROTULOS_DE_PAPEL } from '@app/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel` — ainda **nao** e o dashboard.
 *
 * O dashboard de verdade e o item **B9** do roadmap, e depende de imoveis e
 * leads: ele mostra contadores, visitas de hoje e a fila de leads a distribuir.
 * Leads sao o item B5, que nao existe. Montar meio dashboard agora significaria
 * montar um painel de zeros, e o §5 do mapa de telas e explicito sobre isso:
 * **painel de zeros nao diz a pessoa o que fazer**.
 *
 * Entao esta tela faz o que ja da para fazer com honestidade: confirma onde a
 * pessoa esta e aponta para o unico lugar que existe. Quando o B5 e o B9
 * entrarem, ela e substituida inteira.
 */
export default function Painel() {
  const { organizacaoAtiva, papel } = useSessao();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
        {organizacaoAtiva.nome}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Voce esta como {ROTULOS_DE_PAPEL[papel].toLowerCase()}.
      </p>

      <div className="mt-8 grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 aria-hidden="true" className="size-4" />
              Imoveis
            </CardTitle>
            <CardDescription>
              Cadastre, edite e publique os imoveis da organizacao.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link href="/painel/imoveis">
                Ver imoveis
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que ainda nao existe</CardTitle>
            <CardDescription>
              Clientes, funil de negociacao, agenda e o catalogo publico estao
              nas proximas etapas. O resumo com numeros e tarefas do dia aparece
              aqui quando houver dado para resumir.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
