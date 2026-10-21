'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, TrendingUp } from 'lucide-react';
import { podeFazer } from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  formatarValorCurto,
  type Negociacao,
  type ResumoDaEtapa,
} from '@/lib/negociacoes';
import { useSessao } from '@/lib/sessao-do-painel';
import { cn } from '@/lib/utils';

/**
 * `/painel/funil` — o quadro de negociações (item B7).
 *
 * ## Por que colunas, e não uma lista
 *
 * Porque a pergunta que o funil responde é "onde estão meus negócios?", e a
 * resposta é espacial: quantos em cada etapa, somando quanto. Uma lista
 * ordenada por etapa responde a mesma coisa pior, porque obriga a contar.
 *
 * ## De onde vêm os totais
 *
 * De `GET /negociacoes/resumo`, no servidor. Somar os cartões carregados daria
 * o total **do que está na tela**, não da etapa — e com paginação os dois
 * números divergem sem avisar. O resumo respeita o mesmo recorte de
 * visibilidade da listagem, então o corretor vê o total dele.
 *
 * ## Por que não há arrastar e soltar
 *
 * Porque mover entre etapas é uma decisão com consequência — a etapa de perda
 * exige motivo, e a de ganho fecha a negociação. Arrastar convida ao movimento
 * acidental, e um arrasto errado para "Perdido" abriria um formulário que a
 * pessoa não pediu. O movimento acontece na tela da negociação, onde há espaço
 * para a confirmação e para o motivo.
 *
 * Fica registrado como escolha, não como limitação: se o uso mostrar que o
 * arrasto é esperado, ele entra com confirmação para as etapas de desfecho.
 */

type Estado =
  | { situacao: 'carregando' }
  | {
      situacao: 'pronto';
      etapas: ResumoDaEtapa[];
      porEtapa: Map<string, Negociacao[]>;
    }
  | { situacao: 'erro'; mensagem: string };

/** Quantos cartões cada coluna mostra antes de remeter à lista completa. */
const CARTOES_POR_COLUNA = 8;

export default function Funil() {
  const { papel, organizacaoAtiva } = useSessao();

  const escopoDeLeitura = podeFazer(papel, 'negociacao:ver');
  const temAlternancia = escopoDeLeitura === 'ORG';

  const [apenasMinhas, setApenasMinhasBruto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [tentativa, setTentativaBruta] = useState(0);
  const [buscando, setBuscando] = useState(false);

  // Quem dispara a busca liga o sinalizador; o efeito o desliga depois do
  // `await`. `setState` sincrono no corpo do efeito gera renderizacao em
  // cascata.
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
        const consulta = new URLSearchParams();

        if (apenasMinhas) {
          consulta.set('apenasMinhas', 'true');
        }

        // As duas chamadas em paralelo: o resumo dá os totais, a listagem dá
        // os cartões. Uma chamada por coluna seriam seis requisições para
        // montar uma tela.
        //
        // O resumo pede `incluirFechadas`, e a listagem não. Parece
        // contraditório e não é: negociação em etapa aberta **nunca** está
        // fechada, porque mover para etapa aberta limpa o `closedAt`. Então
        // incluir as fechadas não mexe nos números das colunas abertas, e é o
        // que dá os totais reais de ganho e de perda — que a listagem do funil
        // deliberadamente não traz.
        const resumoConsulta = new URLSearchParams(consulta);
        resumoConsulta.set('incluirFechadas', 'true');

        const [resumo, pagina] = await Promise.all([
          chamarApi<{ etapas: ResumoDaEtapa[] }>(
            `/negociacoes/resumo?${resumoConsulta.toString()}`,
          ),
          chamarApi<{ negociacoes: Negociacao[] }>(
            `/negociacoes?porPagina=100&${consulta.toString()}`,
          ),
        ]);

        if (!ativo) {
          return;
        }

        const porEtapa = new Map<string, Negociacao[]>();

        for (const negociacao of pagina.negociacoes) {
          const lista = porEtapa.get(negociacao.etapa.id) ?? [];
          lista.push(negociacao);
          porEtapa.set(negociacao.etapa.id, lista);
        }

        setEstado({ situacao: 'pronto', etapas: resumo.etapas, porEtapa });
      } catch (erro) {
        if (!ativo) {
          return;
        }

        setEstado({
          situacao: 'erro',
          mensagem:
            erro instanceof ErroDaApi
              ? erro.message
              : 'Nao foi possivel carregar o funil.',
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
  }, [apenasMinhas, tentativa]);

  // `isWon`/`isLost` vem do servidor, e nao de uma lista de nomes aqui: as
  // etapas sao linhas e a imobiliaria podera renomea-las. Comparar por nome
  // quebraria no dia em que alguem trocar "Fechado" por "Ganho".
  const abertas =
    estado.situacao === 'pronto'
      ? estado.etapas.filter((e) => !e.ganho && !e.perdido)
      : [];
  const desfechos =
    estado.situacao === 'pronto'
      ? estado.etapas.filter((e) => e.ganho || e.perdido)
      : [];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
            Funil
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {organizacaoAtiva.nome}
          </p>
        </div>

        {podeFazer(papel, 'negociacao:criar') !== false ? (
          <Button asChild size="sm">
            <Link href="/painel/leads">
              <Plus aria-hidden="true" className="size-4" />
              Abrir negociacao
            </Link>
          </Button>
        ) : null}
      </div>

      {temAlternancia ? (
        <div className="mt-6 flex gap-1" role="group" aria-label="Recorte">
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

      <div className="mt-6">
        {estado.situacao === 'carregando' ? (
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-live="polite"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-muted h-48 animate-pulse rounded-xl" />
            ))}
            <span className="sr-only">Carregando o funil...</span>
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
          <>
            {abertas.every((e) => e.quantidade === 0) &&
            desfechos.every((e) => e.quantidade === 0) ? (
              <Vazio apenasMinhas={apenasMinhas} />
            ) : (
              <>
                {/* Colunas que viram cartoes empilhados no celular: um quadro
                    com rolagem horizontal em tela de 360px e inutilizavel, e o
                    §7 do mapa de telas exige que as paginas funcionem nessa
                    largura. */}
                <div
                  className={cn(
                    'grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-4',
                    buscando && 'opacity-50',
                  )}
                  aria-busy={buscando || undefined}
                >
                  {abertas.map((etapa) => (
                    <Coluna
                      key={etapa.id}
                      etapa={etapa}
                      negociacoes={estado.porEtapa.get(etapa.id) ?? []}
                    />
                  ))}
                </div>

                {/* Os desfechos sao **totais**, nao colunas. Como coluna, elas
                    ficariam sempre vazias — negociacao fechada sai da listagem
                    do funil —, e duas colunas que nunca tem nada ensinam a
                    pessoa a ignorar a tela. */}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {desfechos.map((etapa) => (
                    <Desfecho key={etapa.id} etapa={etapa} />
                  ))}
                </div>
              </>
            )}

            <p className="text-muted-foreground mt-6 text-xs">
              O funil mostra o que esta em andamento. As negociacoes fechadas
              entram nos totais acima e continuam acessiveis pela ficha do
              cliente.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Uma etapa do funil.
 *
 * O total vem do servidor; os cartões são os que couberam na página. Quando há
 * mais do que o mostrado, a coluna diz quantos faltam em vez de fingir que
 * aquilo é tudo — número que não fecha com o total é o tipo de detalhe que faz
 * a pessoa desconfiar da tela inteira.
 */
function Coluna({
  etapa,
  negociacoes,
}: {
  etapa: ResumoDaEtapa;
  negociacoes: Negociacao[];
}) {
  const mostradas = negociacoes.slice(0, CARTOES_POR_COLUNA);
  const restantes = etapa.quantidade - mostradas.length;

  return (
    <section
      aria-labelledby={`etapa-${etapa.id}`}
      className={cn(
        'bg-muted/40 rounded-xl border p-3',
        etapa.ganho && 'border-success/40',
        etapa.perdido && 'border-destructive/30',
      )}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 id={`etapa-${etapa.id}`} className="text-sm font-semibold">
          {etapa.nome}
        </h2>
        <Badge variant="secondary">{etapa.quantidade}</Badge>
      </header>

      <p className="text-muted-foreground mt-1 text-xs">
        {formatarValorCurto(etapa.valorTotal)}
      </p>

      <ul className="mt-3 grid gap-2">
        {mostradas.map((negociacao) => (
          <li key={negociacao.id}>
            <Link
              href={`/painel/funil/${negociacao.id}`}
              className="bg-card hover:border-ring focus-visible:ring-ring block rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <p className="truncate text-sm font-medium">
                {negociacao.cliente.nomeCompleto}
              </p>

              {negociacao.imovel ? (
                <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                  <Building2 aria-hidden="true" className="size-3 shrink-0" />
                  <span className="truncate">
                    {negociacao.imovel.codigo} · {negociacao.imovel.titulo}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground mt-1 text-xs italic">
                  Sem imovel definido
                </p>
              )}

              <p className="mt-2 text-xs font-medium">
                {negociacao.valorEsperado === null
                  ? 'Valor a definir'
                  : formatarValorCurto(negociacao.valorEsperado)}
              </p>

              {negociacao.cliente.responsavel ? (
                <p className="text-muted-foreground mt-1 truncate text-xs">
                  {negociacao.cliente.responsavel.nome}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {restantes > 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          e mais {restantes}
          {restantes === 1 ? ' negociacao' : ' negociacoes'}
        </p>
      ) : null}

      {etapa.quantidade === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">Nenhuma aqui.</p>
      ) : null}
    </section>
  );
}

/**
 * Um desfecho: ganho ou perda.
 *
 * Mostra o acumulado, sem cartoes. Quem quer a lista das ganhas vai a ficha do
 * cliente ou, mais adiante, a um relatorio — o funil responde "onde estao os
 * negocios em andamento?", e o historico de fechamentos e outra pergunta.
 */
function Desfecho({ etapa }: { etapa: ResumoDaEtapa }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        etapa.ganho && 'border-success/40 bg-success/5',
        etapa.perdido && 'border-destructive/30',
      )}
    >
      <p className="text-sm font-semibold">{etapa.nome}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {etapa.quantidade}
      </p>
      <p className="text-muted-foreground text-xs">
        {formatarValorCurto(etapa.valorTotal)}
      </p>
    </div>
  );
}

function Vazio({ apenasMinhas }: { apenasMinhas: boolean }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <TrendingUp aria-hidden="true" className="text-muted-foreground size-8" />
      <p className="font-medium">
        {apenasMinhas
          ? 'Nenhuma negociacao sua em andamento.'
          : 'Nenhuma negociacao em andamento.'}
      </p>
      <p className="text-muted-foreground max-w-sm text-sm">
        A negociacao comeca na ficha do cliente: abra um cliente e registre o
        negocio que esta sendo conversado.
      </p>
      <Button asChild size="sm">
        <Link href="/painel/leads">Ver clientes</Link>
      </Button>
    </div>
  );
}
