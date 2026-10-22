'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
} from 'lucide-react';
import { podeFazer, ROTULOS_DE_STATUS_DE_VISITA, type Role } from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  agruparPorDia,
  deslocar,
  ehHoje,
  formatarDiaLongo,
  formatarHora,
  janelaDe,
  rotuloDoPeriodo,
  type Periodo,
  type Visita,
} from '@/lib/agenda';
import { chamarApi, ErroDaApi } from '@/lib/api';
import { useSessao } from '@/lib/sessao-do-painel';
import { cn } from '@/lib/utils';

/**
 * `/painel/agenda` — as visitas de um período (item B8).
 *
 * ## Lista agrupada por dia, e não grade de calendário
 *
 * Os três períodos que o §8 do mapa de telas pede — dia, semana e mês — estão
 * aqui, mas nenhum deles é uma grade. O motivo é o §7 do mesmo documento: a
 * página tem de funcionar em tela de 360px, e uma grade de sete colunas nessa
 * largura só funciona com rolagem horizontal, que é a interação que mais se
 * perde no celular. Agrupada por dia, a mesma informação desce verticalmente e
 * continua legível no aparelho que o corretor leva para a visita.
 *
 * O padrão é a **semana**: dia é curto demais para a pergunta que se faz ao
 * abrir a agenda — "o que eu tenho pela frente?" — e o mês, numa lista, é longo
 * demais para ser a primeira coisa que aparece.
 *
 * ## O período vem do relógio de quem olha
 *
 * `janelaDe` monta os limites em hora local e converte com `toISOString()`. A
 * conta não é decorativa: "esta semana" para quem está em Brasília termina às
 * 23h59 de sábado no relógio dela, e pedir o período em UTC cortaria as visitas
 * do fim de sábado à noite — que são justamente as que existem.
 *
 * ## O cliente aparece, a ficha dele não necessariamente
 *
 * A visita traz nome e telefone do cliente mesmo para quem não responde por
 * ele, porque quem conduz vai encontrar aquela pessoa. O link para a ficha só
 * aparece quando `cliente.acessivel` é `true` — oferecê-lo sempre levaria a um
 * 404, e quem clicasse concluiria que o sistema está quebrado.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; visitas: Visita[] }
  | { situacao: 'erro'; mensagem: string };

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 'dia', rotulo: 'Dia' },
  { valor: 'semana', rotulo: 'Semana' },
  { valor: 'mes', rotulo: 'Mes' },
];

export default function Agenda() {
  const { papel, organizacaoAtiva } = useSessao();

  const escopoDeLeitura = podeFazer(papel, 'negociacao:ver');
  const temAlternancia = escopoDeLeitura === 'ORG';

  const [periodo, setPeriodoBruto] = useState<Periodo>('semana');
  const [referencia, setReferenciaBruta] = useState(() => new Date());
  const [apenasMinhas, setApenasMinhasBruto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [tentativa, setTentativaBruta] = useState(0);
  const [buscando, setBuscando] = useState(false);

  // Quem dispara a busca liga o sinalizador; o efeito o desliga depois do
  // `await`. `setState` sincrono no corpo do efeito gera renderizacao em
  // cascata — e o ESLint deste projeto recusa, com razao.
  const setPeriodo = useCallback((valor: Periodo) => {
    setBuscando(true);
    setPeriodoBruto(valor);
  }, []);

  const setReferencia = useCallback((valor: Date) => {
    setBuscando(true);
    setReferenciaBruta(valor);
  }, []);

  const setApenasMinhas = useCallback((valor: boolean) => {
    setBuscando(true);
    setApenasMinhasBruto(valor);
  }, []);

  const recarregar = useCallback(() => {
    setBuscando(true);
    setTentativaBruta((n) => n + 1);
  }, []);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const { de, ate } = janelaDe(referencia, periodo);
        const consulta = new URLSearchParams({ de, ate });

        if (apenasMinhas) {
          consulta.set('apenasMinhas', 'true');
        }

        const { visitas } = await chamarApi<{ visitas: Visita[] }>(
          `/visitas?${consulta.toString()}`,
        );

        if (ativo) {
          setEstado({ situacao: 'pronto', visitas });
        }
      } catch (erro) {
        if (!ativo) {
          return;
        }

        setEstado({
          situacao: 'erro',
          mensagem:
            erro instanceof ErroDaApi
              ? erro.message
              : 'Nao foi possivel carregar a agenda.',
        });
      } finally {
        if (ativo) {
          setBuscando(false);
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, [apenasMinhas, periodo, referencia, tentativa]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
            Agenda
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {organizacaoAtiva.nome}
          </p>
        </div>

        {podeFazer(papel, 'negociacao:criar') !== false ? (
          <Button asChild size="sm">
            <Link href="/painel/agenda/nova">
              <Plus aria-hidden="true" className="size-4" />
              Agendar visita
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3">
        <div className="flex gap-1" role="group" aria-label="Periodo">
          {PERIODOS.map((opcao) => (
            <Button
              key={opcao.valor}
              type="button"
              size="sm"
              variant={periodo === opcao.valor ? 'default' : 'ghost'}
              aria-pressed={periodo === opcao.valor}
              onClick={() => setPeriodo(opcao.valor)}
            >
              {opcao.rotulo}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Periodo anterior"
            onClick={() => setReferencia(deslocar(referencia, periodo, -1))}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            aria-label="Periodo seguinte"
            onClick={() => setReferencia(deslocar(referencia, periodo, 1))}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>

          {/* `aria-live` porque o rotulo e a unica confirmacao de que o clique
              na seta mudou o periodo: quem nao ve a tela precisa ouvi-lo. */}
          <p
            className="text-sm font-medium first-letter:uppercase"
            aria-live="polite"
          >
            {rotuloDoPeriodo(referencia, periodo)}
          </p>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReferencia(new Date())}
          >
            Hoje
          </Button>
        </div>

        {temAlternancia ? (
          <div className="flex gap-1" role="group" aria-label="Recorte">
            {[
              { rotulo: 'Toda a equipe', valor: false },
              { rotulo: 'Minhas', valor: true },
            ].map((opcao) => (
              <Button
                key={opcao.rotulo}
                type="button"
                size="sm"
                variant={apenasMinhas === opcao.valor ? 'default' : 'ghost'}
                aria-pressed={apenasMinhas === opcao.valor}
                onClick={() => setApenasMinhas(opcao.valor)}
              >
                {opcao.rotulo}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        {estado.situacao === 'carregando' ? (
          <div className="grid gap-3" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-muted h-20 animate-pulse rounded-xl" />
            ))}
            <span className="sr-only">Carregando a agenda...</span>
          </div>
        ) : null}

        {estado.situacao === 'erro' ? (
          <div className="grid gap-3">
            <Aviso tom="erro">{estado.mensagem}</Aviso>
            <div>
              <Button variant="outline" size="sm" onClick={recarregar}>
                Tentar de novo
              </Button>
            </div>
          </div>
        ) : null}

        {estado.situacao === 'pronto' ? (
          estado.visitas.length === 0 ? (
            <Vazio apenasMinhas={apenasMinhas} papel={papel} />
          ) : (
            <div
              className={cn(
                'grid gap-6 transition-opacity',
                buscando && 'opacity-50',
              )}
              aria-busy={buscando || undefined}
            >
              {agruparPorDia(estado.visitas).map(([dia, visitas]) => (
                <section key={dia} aria-labelledby={`dia-${dia}`}>
                  <h2
                    id={`dia-${dia}`}
                    className="flex items-center gap-2 text-sm font-semibold first-letter:uppercase"
                  >
                    {formatarDiaLongo(visitas[0].inicioEm)}
                    {ehHoje(visitas[0].inicioEm) ? (
                      <Badge variant="secondary">Hoje</Badge>
                    ) : null}
                  </h2>

                  <ul className="mt-2 grid gap-2">
                    {visitas.map((visita) => (
                      <li key={visita.id}>
                        <LinhaDaVisita visita={visita} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * Uma visita na lista.
 *
 * O horário vem primeiro porque é por ele que se procura numa agenda. A
 * situação aparece como etiqueta só quando **não** é "Agendada": marcar o
 * estado inicial em toda linha gastaria a atenção da pessoa no que não mudou.
 */
function LinhaDaVisita({ visita }: { visita: Visita }) {
  const cancelada =
    visita.situacao === 'CANCELED' || visita.situacao === 'NO_SHOW';

  return (
    <Link
      href={`/painel/agenda/${visita.id}`}
      className={cn(
        'bg-card hover:border-ring focus-visible:ring-ring block rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none',
        cancelada && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock aria-hidden="true" className="size-3.5 shrink-0" />
          {formatarHora(visita.inicioEm)} as {formatarHora(visita.fimEm)}
        </span>

        {visita.situacao === 'SCHEDULED' ? null : (
          <Badge
            variant={
              visita.situacao === 'DONE'
                ? 'default'
                : cancelada
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {ROTULOS_DE_STATUS_DE_VISITA[visita.situacao]}
          </Badge>
        )}
      </div>

      <p className="mt-1 truncate text-sm">
        <span className="text-muted-foreground font-mono text-xs">
          {visita.imovel.codigo}
        </span>{' '}
        {visita.imovel.titulo}
      </p>

      <p className="text-muted-foreground mt-1 truncate text-xs">
        {visita.cliente
          ? visita.cliente.nomeCompleto
          : 'Sem cliente cadastrado'}
        {visita.minha ? '' : ` · ${visita.responsavel.nome}`}
      </p>
    </Link>
  );
}

function Vazio({
  apenasMinhas,
  papel,
}: {
  apenasMinhas: boolean;
  papel: Role;
}) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <CalendarDays
        aria-hidden="true"
        className="text-muted-foreground size-8"
      />
      <p className="font-medium">
        {apenasMinhas
          ? 'Nenhuma visita sua neste periodo.'
          : 'Nenhuma visita neste periodo.'}
      </p>
      <p className="text-muted-foreground max-w-sm text-sm">
        A agenda mostra um periodo por vez. Se a visita que voce procura e de
        outro mes, use as setas acima.
      </p>

      {podeFazer(papel, 'negociacao:criar') !== false ? (
        <Button asChild size="sm">
          <Link href="/painel/agenda/nova">Agendar visita</Link>
        </Button>
      ) : null}
    </div>
  );
}
