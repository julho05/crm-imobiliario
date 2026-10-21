'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Phone, Plus, Search, UserRound, Users } from 'lucide-react';
import {
  LeadSource,
  podeFazer,
  ROTULOS_DE_ORIGEM_DE_LEAD,
  ROTULOS_DE_STATUS_DE_LEAD,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  formatarDataHora,
  formatarTelefone,
  ORDEM_DAS_SITUACOES,
  type PaginaDeLeads,
} from '@/lib/leads';
import { useSessao } from '@/lib/sessao-do-painel';
import { cn } from '@/lib/utils';

/**
 * `/painel/leads` — lista e **fila de nao atribuidos** (itens B5 e B6).
 *
 * ## A fila nao e outra tela
 *
 * O mapa de telas previa `/painel/leads/a-distribuir` separado. Ficou como uma
 * aba aqui, por dois motivos: a API e a mesma rota com um filtro, e manter duas
 * telas com busca, paginacao e lista identicas garantiria que um dia so uma
 * ganhasse uma coluna nova.
 *
 * A aba **so aparece** para quem tem `lead:verNaoAtribuidos`. Quem nao tem e
 * digitar o endereco com o filtro recebe 403 do servidor — esconder a aba e
 * cortesia, nao protecao.
 *
 * ## O que o corretor ve aqui
 *
 * Somente os leads dele. Nao e filtro: e a regra de visibilidade, aplicada no
 * servidor (`lead:ver` e `OWN`). E a diferenca em relacao a tela de imoveis,
 * onde ele ve todos os da organizacao — e a razao esta em
 * [permissions.md](../../../../docs/permissions.md) §4.2: lead e a moeda de
 * troca da imobiliaria.
 */

type Aba = 'todos' | 'meus' | 'fila';

type Filtros = {
  termo: string;
  status: string;
  origem: string;
};

const FILTROS_VAZIOS: Filtros = { termo: '', status: '', origem: '' };

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; pagina: PaginaDeLeads }
  | { situacao: 'erro'; mensagem: string };

export default function ListaDeLeads() {
  const { papel, organizacaoAtiva } = useSessao();

  const alcancaAFila = podeFazer(papel, 'lead:verNaoAtribuidos') !== false;
  const escopoDeLeitura = podeFazer(papel, 'lead:ver');
  // Quem le em escopo OWN ja ve somente os proprios: oferecer "todos" e "meus"
  // seriam duas abas com o mesmo resultado.
  const temAbaDeCarteira = escopoDeLeitura === 'ORG';

  const [aba, setAbaBruta] = useState<Aba>(temAbaDeCarteira ? 'todos' : 'meus');
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VAZIOS);
  const [pagina, setPaginaBruta] = useState(1);
  const [buscando, setBuscando] = useState(false);
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [naFila, setNaFila] = useState<number | null>(null);

  // Quem dispara a busca liga o sinalizador; o efeito o desliga depois do
  // `await`. `setState` sincrono no corpo de um efeito provoca renderizacao em
  // cascata, e o ESLint deste projeto recusa — com razao.
  const setPagina = useCallback((proxima: number | ((p: number) => number)) => {
    setBuscando(true);
    setPaginaBruta(proxima);
  }, []);

  const setAba = useCallback((proxima: Aba) => {
    setBuscando(true);
    setPaginaBruta(1);
    setAbaBruta(proxima);
  }, []);

  const buscar = useCallback(() => {
    const consulta = new URLSearchParams({
      pagina: String(pagina),
      porPagina: '20',
    });

    if (aba === 'meus') consulta.set('apenasMeus', 'true');
    if (aba === 'fila') consulta.set('naoAtribuidos', 'true');
    if (aplicados.termo) consulta.set('termo', aplicados.termo);
    if (aplicados.status) consulta.set('status', aplicados.status);
    if (aplicados.origem) consulta.set('origem', aplicados.origem);

    return chamarApi<PaginaDeLeads>(`/leads?${consulta.toString()}`);
  }, [aba, aplicados, pagina]);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const resultado = await buscar();

        if (ativo) {
          setEstado({ situacao: 'pronto', pagina: resultado });
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
              : 'Nao foi possivel carregar os leads.',
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
  }, [buscar]);

  // O contador da fila, separado da listagem: ele aparece na aba mesmo quando a
  // pessoa esta olhando outra, e e o que o §5 do permissions.md pede para que a
  // fila nao cresca sem ninguem perceber.
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
        // Contador e informacao auxiliar: falhar nele nao deve estragar a tela.
        // Fica sem numero, e a aba continua funcionando.
      }
    })();

    return () => {
      ativo = false;
    };
  }, [alcancaAFila, estado]);

  function aplicar(evento: React.FormEvent) {
    evento.preventDefault();
    setPagina(1);
    setAplicados(filtros);
  }

  function limpar() {
    setFiltros(FILTROS_VAZIOS);
    setPagina(1);
    setAplicados(FILTROS_VAZIOS);
  }

  const temFiltro = Object.values(aplicados).some((v) => v !== '');

  const totalDePaginas =
    estado.situacao === 'pronto'
      ? Math.max(1, Math.ceil(estado.pagina.total / estado.pagina.porPagina))
      : 1;

  const abas: { valor: Aba; rotulo: string; contador?: number | null }[] = [
    ...(temAbaDeCarteira
      ? [
          { valor: 'todos' as Aba, rotulo: 'Todos' },
          { valor: 'meus' as Aba, rotulo: 'Meus leads' },
        ]
      : [{ valor: 'meus' as Aba, rotulo: 'Meus leads' }]),
    ...(alcancaAFila
      ? [{ valor: 'fila' as Aba, rotulo: 'A distribuir', contador: naFila }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
            Clientes
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {organizacaoAtiva.nome}
          </p>
        </div>

        {podeFazer(papel, 'lead:criar') !== false ? (
          <Button asChild size="sm">
            <Link href="/painel/leads/novo">
              <Plus aria-hidden="true" className="size-4" />
              Novo cliente
            </Link>
          </Button>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Recorte da lista"
        className="mt-6 flex flex-wrap gap-1"
      >
        {abas.map((opcao) => (
          <Button
            key={opcao.valor}
            type="button"
            role="tab"
            aria-selected={aba === opcao.valor}
            size="sm"
            variant={aba === opcao.valor ? 'default' : 'ghost'}
            onClick={() => setAba(opcao.valor)}
          >
            {opcao.rotulo}
            {opcao.contador != null && opcao.contador > 0 ? (
              <Badge variant="secondary" className="ml-1">
                {opcao.contador}
              </Badge>
            ) : null}
          </Button>
        ))}
      </div>

      <form
        onSubmit={aplicar}
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            name="termo"
            value={filtros.termo}
            onChange={(e) => setFiltros({ ...filtros, termo: e.target.value })}
            placeholder="Buscar por nome, telefone ou e-mail"
            aria-label="Buscar por nome, telefone ou e-mail"
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Select
            name="status"
            aria-label="Situacao"
            value={filtros.status}
            onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
          >
            <option value="">Todas as situacoes</option>
            {ORDEM_DAS_SITUACOES.map((situacao) => (
              <option key={situacao} value={situacao}>
                {ROTULOS_DE_STATUS_DE_LEAD[situacao]}
              </option>
            ))}
          </Select>

          <Select
            name="origem"
            aria-label="Origem"
            value={filtros.origem}
            onChange={(e) => setFiltros({ ...filtros, origem: e.target.value })}
          >
            <option value="">Todas as origens</option>
            {Object.values(LeadSource).map((origem) => (
              <option key={origem} value={origem}>
                {ROTULOS_DE_ORIGEM_DE_LEAD[origem]}
              </option>
            ))}
          </Select>

          <Button type="submit" variant="outline">
            Filtrar
          </Button>

          {temFiltro ? (
            <Button type="button" variant="ghost" onClick={limpar}>
              Limpar
            </Button>
          ) : null}
        </div>
      </form>

      <div className="mt-6">
        {estado.situacao === 'carregando' ? (
          <div className="grid gap-3" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-muted h-20 animate-pulse rounded-xl" />
            ))}
            <span className="sr-only">Carregando clientes...</span>
          </div>
        ) : null}

        {estado.situacao === 'erro' ? (
          <div className="grid gap-3">
            <Aviso tom="erro">{estado.mensagem}</Aviso>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBuscando(true);
                  setAplicados({ ...aplicados });
                }}
              >
                Tentar de novo
              </Button>
            </div>
          </div>
        ) : null}

        {estado.situacao === 'pronto' && estado.pagina.leads.length === 0 ? (
          <Vazio aba={aba} comFiltro={temFiltro} aoLimpar={limpar} />
        ) : null}

        {estado.situacao === 'pronto' && estado.pagina.leads.length > 0 ? (
          <>
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {estado.pagina.total === 1
                ? '1 cliente'
                : `${estado.pagina.total} clientes`}
            </p>

            <ul
              className={cn(
                'mt-3 grid gap-3 transition-opacity',
                buscando && 'opacity-50',
              )}
              aria-busy={buscando || undefined}
            >
              {estado.pagina.leads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/painel/leads/${lead.id}`}
                    className="bg-card hover:border-ring focus-visible:ring-ring block rounded-xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">
                            {lead.nomeCompleto}
                          </span>
                          <Badge
                            variant={
                              lead.status === 'NEW' ? 'default' : 'secondary'
                            }
                          >
                            {ROTULOS_DE_STATUS_DE_LEAD[lead.status]}
                          </Badge>
                          {lead.responsavel ? null : (
                            <Badge variant="outline">Sem responsavel</Badge>
                          )}
                        </div>

                        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          {lead.telefone ? (
                            <span className="flex items-center gap-1.5">
                              <Phone aria-hidden="true" className="size-3.5" />
                              {formatarTelefone(lead.telefone)}
                            </span>
                          ) : null}
                          {lead.email ? (
                            <span className="flex items-center gap-1.5">
                              <Mail aria-hidden="true" className="size-3.5" />
                              <span className="truncate">{lead.email}</span>
                            </span>
                          ) : null}
                        </div>

                        <p className="text-muted-foreground mt-1 text-xs">
                          {ROTULOS_DE_ORIGEM_DE_LEAD[lead.origem]} ·{' '}
                          {formatarDataHora(lead.criadoEm)}
                          {lead.responsavel
                            ? ` · ${lead.responsavel.nome}`
                            : ''}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {totalDePaginas > 1 ? (
              <div className="mt-6 flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => p - 1)}
                >
                  Anterior
                </Button>

                <p className="text-muted-foreground text-sm">
                  Pagina {pagina} de {totalDePaginas}
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= totalDePaginas}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Proxima
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Estado vazio, nos tres sabores que importam.
 *
 * A fila vazia e **boa noticia** — nenhum lead esperando distribuicao —, e
 * dizer "nenhum cliente cadastrado" ali seria errado e assustador. O §8 do mapa
 * de telas pede estados vazios que digam o que fazer; aqui, um deles diz que
 * nao ha nada a fazer.
 */
function Vazio({
  aba,
  comFiltro,
  aoLimpar,
}: {
  aba: Aba;
  comFiltro: boolean;
  aoLimpar: () => void;
}) {
  if (comFiltro) {
    return (
      <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
        <Search aria-hidden="true" className="text-muted-foreground size-8" />
        <p className="font-medium">Nenhum cliente com esses filtros.</p>
        <Button variant="outline" size="sm" onClick={aoLimpar}>
          Limpar filtros
        </Button>
      </div>
    );
  }

  if (aba === 'fila') {
    return (
      <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
        <Users aria-hidden="true" className="text-muted-foreground size-8" />
        <p className="font-medium">Nenhum cliente esperando distribuicao.</p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Quando alguem pedir contato pela vitrine e o imovel nao tiver
          responsavel, o cliente aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <UserRound aria-hidden="true" className="text-muted-foreground size-8" />
      <p className="font-medium">
        {aba === 'meus'
          ? 'Nenhum cliente sob sua responsabilidade.'
          : 'Nenhum cliente cadastrado ainda.'}
      </p>
      <p className="text-muted-foreground max-w-sm text-sm">
        Cadastre o contato de quem liga ou aparece na imobiliaria. Telefone ou
        e-mail basta para comecar.
      </p>
      <Button asChild size="sm">
        <Link href="/painel/leads/novo">
          <Plus aria-hidden="true" className="size-4" />
          Cadastrar cliente
        </Link>
      </Button>
    </div>
  );
}
