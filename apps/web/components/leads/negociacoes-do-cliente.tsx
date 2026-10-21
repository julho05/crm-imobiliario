'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, TrendingUp } from 'lucide-react';
import { podeFazer, type Role } from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { chamarApi, ErroDaApi } from '@/lib/api';
import { formatarValorCurto, type Negociacao } from '@/lib/negociacoes';

/**
 * As negociações de um cliente, na ficha dele.
 *
 * ## Por que a negociação nasce aqui
 *
 * Porque ela é sobre **um cliente**. Abrir negociação a partir do funil
 * exigiria escolher o cliente numa lista de centenas — e a lista teria de
 * respeitar o escopo `OWN`, recriando metade da tela de clientes dentro de um
 * seletor. Na ficha, o cliente já está decidido: só falta o imóvel e o valor.
 *
 * O formulário é curto de propósito. Etapa, valor e imóvel podem ser ajustados
 * depois, na tela da negociação; o que importa no momento da abertura é
 * registrar que **existe** um negócio em conversa, antes que a informação se
 * perca.
 */

type Imovel = { id: string; codigo: string; titulo: string };

export function NegociacoesDoCliente({
  leadId,
  papel,
}: {
  leadId: string;
  papel: Role;
}) {
  const [negociacoes, setNegociacoes] = useState<Negociacao[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [abrindo, setAbrindo] = useState(false);

  const podeCriar = podeFazer(papel, 'negociacao:criar') !== false;

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        // `incluirFechadas` porque esta e a ficha do cliente, nao o funil: o
        // historico do que foi ganho e perdido com esta pessoa e exatamente o
        // que se quer ver antes de ligar para ela.
        const { negociacoes: lista } = await chamarApi<{
          negociacoes: Negociacao[];
        }>(`/negociacoes?leadId=${leadId}&incluirFechadas=true&porPagina=50`);

        if (ativo) {
          setNegociacoes(lista);
        }
      } catch (erro) {
        if (ativo) {
          setFalha(
            erro instanceof ErroDaApi
              ? erro.message
              : 'Nao foi possivel carregar as negociacoes.',
          );
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, [leadId, tentativa]);

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp aria-hidden="true" className="size-4" />
          Negociacoes
        </CardTitle>
        <CardDescription>
          O que esta sendo conversado com este cliente, incluindo o que ja foi
          fechado ou perdido.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {negociacoes === null && !falha ? (
          <div className="bg-muted h-16 animate-pulse rounded-lg" aria-busy />
        ) : null}

        {negociacoes?.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma negociacao aberta com este cliente.
          </p>
        ) : null}

        {negociacoes && negociacoes.length > 0 ? (
          <ul className="grid gap-2">
            {negociacoes.map((negociacao) => (
              <li key={negociacao.id}>
                <Link
                  href={`/painel/funil/${negociacao.id}`}
                  className="hover:bg-accent focus-visible:ring-ring flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          negociacao.etapa.ganho
                            ? 'default'
                            : negociacao.etapa.perdido
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {negociacao.etapa.nome}
                      </Badge>
                      {negociacao.imovel ? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {negociacao.imovel.codigo}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground mt-1 block truncate text-xs">
                      {negociacao.imovel?.titulo ?? 'Sem imovel definido'}
                    </span>
                  </span>

                  <span className="text-sm font-medium">
                    {negociacao.valorEsperado === null
                      ? '—'
                      : formatarValorCurto(negociacao.valorEsperado)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {podeCriar ? (
          abrindo ? (
            <Abertura
              leadId={leadId}
              aoAbrir={() => {
                setAbrindo(false);
                recarregar();
              }}
              aoCancelar={() => setAbrindo(false)}
            />
          ) : (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAbrindo(true)}
              >
                <Plus aria-hidden="true" className="size-4" />
                Abrir negociacao
              </Button>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * O formulário de abertura: só o imóvel e o valor.
 *
 * A etapa não aparece porque toda negociação começa na primeira — oferecer a
 * escolha convidaria a abrir algo já em "Proposta", o que faz o funil mentir
 * sobre o caminho percorrido.
 */
function Abertura({
  leadId,
  aoAbrir,
  aoCancelar,
}: {
  leadId: string;
  aoAbrir: () => void;
  aoCancelar: () => void;
}) {
  const [imoveis, setImoveis] = useState<Imovel[] | null>(null);
  const [imovelId, setImovelId] = useState('');
  const [valor, setValor] = useState('');
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        // Imoveis disponiveis, nao todos: abrir negociacao sobre um imovel
        // vendido e quase sempre engano, e a lista fica curta o suficiente para
        // um seletor.
        const { imoveis: lista } = await chamarApi<{ imoveis: Imovel[] }>(
          '/imoveis?porPagina=100',
        );

        if (ativo) {
          setImoveis(lista);
        }
      } catch {
        if (ativo) {
          // Sem a lista, a abertura continua possivel sem imovel: o campo e
          // opcional, e travar tudo por causa dele seria pior.
          setImoveis([]);
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, []);

  async function abrir(evento: React.FormEvent) {
    evento.preventDefault();
    setFalha(null);
    setEnviando(true);

    const bruto = valor.trim();

    try {
      await chamarApi('/negociacoes', {
        metodo: 'POST',
        corpo: {
          leadId,
          ...(imovelId ? { imovelId } : {}),
          ...(bruto ? { valorEsperado: Number(bruto.replace(',', '.')) } : {}),
        },
      });

      aoAbrir();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel abrir a negociacao.',
      );
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={abrir}
      noValidate
      className="grid gap-3 rounded-lg border p-3"
    >
      {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

      <div className="grid gap-2">
        <label htmlFor="imovelId" className="text-sm font-medium">
          Imovel
        </label>
        <Select
          id="imovelId"
          name="imovelId"
          value={imovelId}
          disabled={imoveis === null}
          onChange={(e) => setImovelId(e.target.value)}
        >
          <option value="">Ainda nao definido</option>
          {(imoveis ?? []).map((imovel) => (
            <option key={imovel.id} value={imovel.id}>
              {imovel.codigo} — {imovel.titulo}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2">
        <label htmlFor="valorEsperado" className="text-sm font-medium">
          Valor esperado
        </label>
        <input
          id="valorEsperado"
          name="valorEsperado"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Opcional"
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm dark:bg-input/30"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? 'Abrindo...' : 'Abrir negociacao'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={enviando}
          onClick={aoCancelar}
        >
          Cancelar
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        Comeca na primeira etapa do funil. Etapa, valor e imovel podem mudar
        depois.
      </p>
    </form>
  );
}
