'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ListChecks,
  TrendingUp,
  Users,
} from 'lucide-react';
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
 * secoes que existem e mostra **dois** numeros, cada um porque a ausencia dele
 * custa dinheiro:
 *
 * - **clientes esperando distribuicao**:
 *   [permissions.md](../../../../docs/permissions.md) §5 registra que, sem ele
 *   visivel, a fila de nao atribuidos cresce sem ninguem perceber, e lead
 *   parado e venda perdida
 * - **tarefas vencidas**: o §5 do mapa de telas as poe no resumo do dia de
 *   todos os papeis. Tarefa anotada e esquecida e pior do que tarefa nao
 *   anotada, porque cria a impressao de que o compromisso esta sob controle
 *
 * Os dois sao contadores de coisa **parada**, e e so isso que se justifica
 * antes do B9. Grafico de desempenho e resumo por periodo sao o dashboard, e o
 * dashboard precisa mudar de conteudo por papel.
 */
export default function Painel() {
  const { organizacaoAtiva, papel } = useSessao();

  const alcancaAFila = podeFazer(papel, 'lead:verNaoAtribuidos') !== false;
  const [naFila, setNaFila] = useState<number | null>(null);
  const [vencidas, setVencidas] = useState<number | null>(null);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      // Cada contador por conta propria, e nao um `Promise.all`: se a fila
      // falhar, as tarefas vencidas continuam aparecendo. Com `all`, uma falha
      // apagaria os dois numeros.
      const [fila, atrasadas] = await Promise.allSettled([
        alcancaAFila
          ? chamarApi<{ total: number }>('/leads/nao-atribuidos/contagem')
          : Promise.resolve(null),
        chamarApi<{ total: number }>('/tarefas/vencidas/contagem'),
      ]);

      if (!ativo) {
        return;
      }

      // Contador e informacao auxiliar: falhar nele nao deve estragar a tela.
      // Fica sem numero, e os atalhos continuam funcionando.
      if (fila.status === 'fulfilled' && fila.value !== null) {
        setNaFila(fila.value.total);
      }

      if (atrasadas.status === 'fulfilled') {
        setVencidas(atrasadas.value.total);
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

        {vencidas !== null && vencidas > 0 ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">
                {vencidas === 1
                  ? '1 tarefa vencida'
                  : `${vencidas} tarefas vencidas`}
              </CardTitle>
              <CardDescription>
                O prazo passou e elas continuam abertas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link href="/painel/tarefas">
                  Ver o que esta atrasado
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
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp aria-hidden="true" className="size-4" />
              Funil
            </CardTitle>
            <CardDescription>
              Acompanhe em que etapa esta cada negocio e o que foi ganho ou
              perdido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/funil">
                Ver o funil
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays aria-hidden="true" className="size-4" />
              Agenda
            </CardTitle>
            <CardDescription>
              As visitas marcadas, por dia, semana ou mes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/agenda">
                Ver a agenda
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks aria-hidden="true" className="size-4" />
              Tarefas
            </CardTitle>
            <CardDescription>
              O que precisa ser feito, com prazo e responsavel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/tarefas">
                Ver tarefas
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que ainda nao existe</CardTitle>
            <CardDescription>
              O dashboard por papel e o catalogo publico estao nas proximas
              etapas. O resumo do dia, com as visitas de hoje e o desempenho do
              periodo, aparece aqui quando houver o que resumir.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
