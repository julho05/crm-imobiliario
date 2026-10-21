'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Users } from 'lucide-react';
import { podeFazer, ROTULOS_DE_PAPEL } from '@app/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { chamarApi } from '@/lib/api';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel` — ainda **nao** e o dashboard.
 *
 * O dashboard de verdade e o item **B9**, e depende de visitas, tarefas e
 * contadores que nao existem. Montar meio dashboard agora produziria um painel
 * de zeros, e o §5 do mapa de telas e explicito: **painel de zeros nao diz a
 * pessoa o que fazer**.
 *
 * O que esta tela faz e o que ja da para fazer com honestidade: aponta para as
 * duas secoes que existem e mostra **um** numero — o de clientes esperando
 * distribuicao. Esse numero nao e enfeite:
 * [permissions.md](../../../../docs/permissions.md) §5 registra que, sem ele
 * visivel, a fila de nao atribuidos cresce sem ninguem perceber, e lead parado
 * e venda perdida. E o unico contador que se justifica antes do B9.
 */
export default function Painel() {
  const { organizacaoAtiva, papel } = useSessao();

  const alcancaAFila = podeFazer(papel, 'lead:verNaoAtribuidos') !== false;
  const [naFila, setNaFila] = useState<number | null>(null);

  useEffect(() => {
    if (!alcancaAFila) {
      return;
    }

    let ativo = true;

    void (async () => {
      try {
        const { total } = await chamarApi<{ total: number }>(
          '/leads/nao-atribuidos/contagem',
        );

        if (ativo) {
          setNaFila(total);
        }
      } catch {
        // Contador e informacao auxiliar: falhar nele nao deve estragar a
        // tela. Fica sem numero, e os atalhos continuam funcionando.
      }
    })();

    return () => {
      ativo = false;
    };
  }, [alcancaAFila]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
        {organizacaoAtiva.nome}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Voce esta como {ROTULOS_DE_PAPEL[papel].toLowerCase()}.
      </p>

      <div className="mt-8 grid gap-4">
        {naFila !== null && naFila > 0 ? (
          <Card className="border-gold/50">
            <CardHeader>
              <CardTitle className="text-base">
                {naFila === 1
                  ? '1 cliente esperando distribuicao'
                  : `${naFila} clientes esperando distribuicao`}
              </CardTitle>
              <CardDescription>
                Ninguem ficou responsavel por esses contatos. Enquanto esperam,
                ninguem liga.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm">
                <Link href="/painel/leads">
                  Distribuir agora
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users aria-hidden="true" className="size-4" />
              Clientes
            </CardTitle>
            <CardDescription>
              Cadastre contatos, acompanhe a situacao de cada atendimento e
              defina quem e o responsavel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/leads">
                Ver clientes
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

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
            <Button asChild variant="outline" size="sm">
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
              Funil de negociacao, agenda de visitas, tarefas e o catalogo
              publico estao nas proximas etapas. O resumo do dia, com visitas e
              tarefas, aparece aqui quando houver dado para resumir.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
