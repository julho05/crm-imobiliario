'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Pencil, Plus, Search } from 'lucide-react';
import {
  podeFazer,
  PropertyPurpose,
  PropertyType,
  ROTULOS_DE_FINALIDADE,
  ROTULOS_DE_STATUS_DE_IMOVEL,
  ROTULOS_DE_TIPO_DE_IMOVEL,
  UFS_DO_BRASIL,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { chamarApi, ErroDaApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ehResponsavel,
  formatarArea,
  precoPorFinalidade,
  type PaginaDeImoveis,
} from '@/lib/imoveis';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/imoveis` — lista paginada, item B1.
 *
 * ## Todos os papeis leem todos os imoveis
 *
 * Inclusive o `AGENT`, e isso e deliberado (decisao de 19/10/2026): o corretor
 * precisa poder oferecer qualquer imovel da casa ao cliente dele. Restringir
 * quebraria o negocio.
 *
 * O que muda com o papel e o **botao de editar**, que aparece somente nos
 * imoveis sob responsabilidade de quem olha — e isso e cortesia visual, nao
 * seguranca: quem digitar a URL de edicao recebe 403 do servidor.
 *
 * "Todos" e "Meus imoveis" e um **filtro**, nao uma permissao. O §5 do mapa de
 * telas insiste nessa distincao porque confundi-la levaria a tela a esconder
 * dado que a pessoa tem direito de ver.
 */

const POR_PAGINA = 20;

type Filtros = {
  termo: string;
  tipo: string;
  finalidade: string;
  estado: string;
  cidade: string;
  apenasMeus: boolean;
};

const FILTROS_VAZIOS: Filtros = {
  termo: '',
  tipo: '',
  finalidade: '',
  estado: '',
  cidade: '',
  apenasMeus: false,
};

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; pagina: PaginaDeImoveis }
  | { situacao: 'erro'; mensagem: string };

export default function ListaDeImoveis() {
  const { papel, organizacaoAtiva } = useSessao();
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });

  // `filtros` e o que a pessoa esta digitando; `aplicados` e o que foi enviado
  // ao servidor. Separar os dois evita uma requisicao por tecla, sem precisar
  // de debounce: a busca acontece no envio do formulario.
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VAZIOS);
  const [pagina, setPaginaBruta] = useState(1);

  /**
   * Busca em andamento **depois** da primeira carga.
   *
   * Separado de `estado` de proposito. Trocar para `carregando` a cada filtro
   * substituiria a lista por esqueletos, e a tela saltaria — some o conteudo,
   * aparecem tres blocos cinza, volta o conteudo. Com este sinalizador a lista
   * atual continua na tela, esmaecida, e so o resultado novo a substitui.
   *
   * E ligado por quem dispara a busca, nunca dentro do efeito: `setState`
   * sincrono no corpo de um efeito provoca renderizacao em cascata.
   */
  const [buscando, setBuscando] = useState(false);

  /** Troca de pagina: um lugar so para marcar a busca em andamento. */
  const setPagina = useCallback((proxima: number | ((p: number) => number)) => {
    setBuscando(true);
    setPaginaBruta(proxima);
  }, []);

  const podeCriar = podeFazer(papel, 'imovel:criar') !== false;
  const escopoDeEdicao = podeFazer(papel, 'imovel:editar');

  const buscar = useCallback(async () => {
    const consulta = new URLSearchParams({
      pagina: String(pagina),
      porPagina: String(POR_PAGINA),
    });

    // Campo vazio nao vai na consulta: `termo=` seria um filtro por string
    // vazia, e o schema da API recusaria `estado=` por nao ser UF valida.
    if (aplicados.termo) consulta.set('termo', aplicados.termo);
    if (aplicados.tipo) consulta.set('tipo', aplicados.tipo);
    if (aplicados.finalidade) consulta.set('finalidade', aplicados.finalidade);
    if (aplicados.estado) consulta.set('estado', aplicados.estado);
    if (aplicados.cidade) consulta.set('cidade', aplicados.cidade);
    if (aplicados.apenasMeus) consulta.set('apenasMeus', 'true');

    return chamarApi<PaginaDeImoveis>(`/imoveis?${consulta.toString()}`);
  }, [aplicados, pagina]);

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
              : 'Nao foi possivel carregar os imoveis.',
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

  function aplicar(evento: React.FormEvent) {
    evento.preventDefault();
    // Volta para a primeira pagina: continuar na pagina 3 de um resultado novo
    // mostraria uma lista vazia e pareceria "nenhum imovel encontrado".
    setPagina(1);
    setAplicados(filtros);
  }

  function limpar() {
    setFiltros(FILTROS_VAZIOS);
    setPagina(1);
    setAplicados(FILTROS_VAZIOS);
  }

  const temFiltro = Object.entries(aplicados).some(([, valor]) =>
    typeof valor === 'boolean' ? valor : valor !== '',
  );

  const totalDePaginas =
    estado.situacao === 'pronto'
      ? Math.max(1, Math.ceil(estado.pagina.total / estado.pagina.porPagina))
      : 1;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
            Imoveis
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {organizacaoAtiva.nome}
          </p>
        </div>

        {podeCriar ? (
          <Button asChild size="sm">
            <Link href="/painel/imoveis/novo">
              <Plus aria-hidden="true" className="size-4" />
              Novo imovel
            </Link>
          </Button>
        ) : null}
      </div>

      <form onSubmit={aplicar} className="mt-6 grid gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              name="termo"
              value={filtros.termo}
              onChange={(e) =>
                setFiltros({ ...filtros, termo: e.target.value })
              }
              placeholder="Buscar por titulo ou codigo"
              aria-label="Buscar por titulo ou codigo"
              className="pl-9"
            />
          </div>

          <Button type="submit" variant="outline">
            Filtrar
          </Button>

          {temFiltro ? (
            <Button type="button" variant="ghost" onClick={limpar}>
              Limpar
            </Button>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            name="tipo"
            aria-label="Tipo"
            value={filtros.tipo}
            onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
          >
            <option value="">Todos os tipos</option>
            {Object.values(PropertyType).map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULOS_DE_TIPO_DE_IMOVEL[tipo]}
              </option>
            ))}
          </Select>

          <Select
            name="finalidade"
            aria-label="Finalidade"
            value={filtros.finalidade}
            onChange={(e) =>
              setFiltros({ ...filtros, finalidade: e.target.value })
            }
          >
            <option value="">Venda e locacao</option>
            {Object.values(PropertyPurpose).map((finalidade) => (
              <option key={finalidade} value={finalidade}>
                {ROTULOS_DE_FINALIDADE[finalidade]}
              </option>
            ))}
          </Select>

          <Input
            name="cidade"
            value={filtros.cidade}
            onChange={(e) => setFiltros({ ...filtros, cidade: e.target.value })}
            placeholder="Cidade"
            aria-label="Cidade"
          />

          <Select
            name="estado"
            aria-label="UF"
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
          >
            <option value="">Qualquer UF</option>
            {UFS_DO_BRASIL.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </div>

        {/* Alternancia "Todos / Meus imoveis": filtro, nao permissao. */}
        <div className="flex gap-1" role="group" aria-label="Responsavel">
          {[
            { rotulo: 'Todos', valor: false },
            { rotulo: 'Meus imoveis', valor: true },
          ].map((opcao) => (
            <Button
              key={opcao.rotulo}
              type="button"
              size="sm"
              variant={filtros.apenasMeus === opcao.valor ? 'default' : 'ghost'}
              aria-pressed={filtros.apenasMeus === opcao.valor}
              onClick={() => {
                const novos = { ...filtros, apenasMeus: opcao.valor };
                setFiltros(novos);
                setPagina(1);
                setAplicados(novos);
              }}
            >
              {opcao.rotulo}
            </Button>
          ))}
        </div>
      </form>

      <div className="mt-6">
        {estado.situacao === 'carregando' ? (
          <div className="grid gap-3" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-muted h-24 animate-pulse rounded-xl" />
            ))}
            <span className="sr-only">Carregando imoveis...</span>
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

        {estado.situacao === 'pronto' && estado.pagina.imoveis.length === 0 ? (
          <Vazio
            comFiltro={temFiltro}
            podeCriar={podeCriar}
            aoLimpar={limpar}
          />
        ) : null}

        {estado.situacao === 'pronto' && estado.pagina.imoveis.length > 0 ? (
          <>
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {estado.pagina.total === 1
                ? '1 imovel'
                : `${estado.pagina.total} imoveis`}
            </p>

            <ul
              className={cn(
                'mt-3 grid gap-3 transition-opacity',
                buscando && 'opacity-50',
              )}
              aria-busy={buscando || undefined}
            >
              {estado.pagina.imoveis.map((imovel) => {
                const podeEditar =
                  escopoDeEdicao === 'ORG' ||
                  (escopoDeEdicao === 'OWN' &&
                    ehResponsavel(imovel, organizacaoAtiva.membershipId));

                return (
                  <li
                    key={imovel.id}
                    className="bg-card flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground font-mono text-xs">
                          {imovel.codigo}
                        </span>
                        <Badge
                          variant={
                            imovel.status === 'AVAILABLE'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {ROTULOS_DE_STATUS_DE_IMOVEL[imovel.status]}
                        </Badge>
                        {imovel.publicadoEm ? (
                          <Badge variant="outline">No ar</Badge>
                        ) : null}
                      </div>

                      <p className="mt-1 truncate font-medium">
                        {imovel.titulo}
                      </p>

                      <p className="text-muted-foreground mt-1 text-sm">
                        {imovel.bairro}, {imovel.cidade} — {imovel.estado}
                      </p>

                      <p className="mt-2 text-sm font-medium">
                        {precoPorFinalidade(imovel)}
                      </p>

                      <p className="text-muted-foreground mt-1 text-xs">
                        {[
                          ROTULOS_DE_TIPO_DE_IMOVEL[imovel.tipo],
                          imovel.dormitorios === null
                            ? null
                            : `${imovel.dormitorios} dorm.`,
                          imovel.vagas === null
                            ? null
                            : `${imovel.vagas} vaga(s)`,
                          imovel.areaTotal === null
                            ? null
                            : formatarArea(imovel.areaTotal),
                          imovel.responsavel
                            ? `Resp.: ${imovel.responsavel.nome}`
                            : 'Sem responsavel',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    {podeEditar ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/painel/imoveis/${imovel.id}/editar`}>
                          <Pencil aria-hidden="true" className="size-4" />
                          Editar
                        </Link>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
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
 * Estado vazio, nos dois sabores que o §8 do mapa de telas distingue.
 *
 * "Nenhum imovel ainda" e "nenhum resultado para este filtro" exigem acoes
 * diferentes: a primeira pede um cadastro, a segunda pede limpar o filtro.
 * Uma mensagem unica deixaria a pessoa procurando o botao errado.
 */
function Vazio({
  comFiltro,
  podeCriar,
  aoLimpar,
}: {
  comFiltro: boolean;
  podeCriar: boolean;
  aoLimpar: () => void;
}) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <Building2 aria-hidden="true" className="text-muted-foreground size-8" />

      {comFiltro ? (
        <>
          <p className="font-medium">Nenhum imovel com esses filtros.</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Tente uma busca mais ampla ou limpe os filtros.
          </p>
          <Button variant="outline" size="sm" onClick={aoLimpar}>
            Limpar filtros
          </Button>
        </>
      ) : (
        <>
          <p className="font-medium">Nenhum imovel cadastrado ainda.</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Cadastre o primeiro imovel para come&ccedil;ar. Ele nasce como
            rascunho, e so vai ao ar quando voce publicar.
          </p>
          {podeCriar ? (
            <Button asChild size="sm">
              <Link href="/painel/imoveis/novo">
                <Plus aria-hidden="true" className="size-4" />
                Cadastrar imovel
              </Link>
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
