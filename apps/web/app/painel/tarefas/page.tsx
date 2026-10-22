'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CircleCheck,
  ListChecks,
  Plus,
  RotateCcw,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import {
  criarTarefaSchema,
  podeFazer,
  ROTULOS_DE_STATUS_DE_TAREFA,
  type TaskStatus,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  campoLocalDeIso,
  formatarDiaLongo,
  isoDeCampoLocal,
  type PaginaDeTarefas,
  type Tarefa,
} from '@/lib/agenda';
import { chamarApi, ErroDaApi } from '@/lib/api';
import { validar, type ErrosDoFormulario } from '@/lib/formulario';
import { useSessao } from '@/lib/sessao-do-painel';
import { cn } from '@/lib/utils';

/**
 * `/painel/tarefas` — o que precisa ser feito (item B8).
 *
 * ## Uma tela só, sem tela de detalhe
 *
 * O mapa de telas prevê `/painel/agenda/[id]` para a visita e **nada**
 * equivalente para a tarefa, e isso está certo: a tarefa tem título, prazo e
 * situação. Uma tela inteira para três campos obrigaria dois cliques para
 * concluir o que se conclui com um, e a tarefa é justamente o registro que não
 * pode dar trabalho — se der, ninguém anota e a lista morre.
 *
 * Então tudo acontece aqui: criar, concluir, reabrir e ajustar o prazo.
 *
 * ## "Vencida" vem do servidor
 *
 * O campo `vencida` é calculado na API, e a tela só o exibe. Comparar o prazo
 * com `Date.now()` aqui parece equivalente e não é: o relógio do navegador pode
 * estar errado ou em outro fuso, e uma tarefa marcada como atrasada quando não
 * está — ou o contrário — faz a pessoa deixar de confiar na lista.
 *
 * ## Por que o filtro de vencidas é um botão, e não um aviso
 *
 * Porque a pergunta "o que está atrasado?" é a primeira que se faz ao abrir
 * esta tela, e ela precisa de uma resposta em um toque.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; pagina: PaginaDeTarefas }
  | { situacao: 'erro'; mensagem: string };

type Recorte = 'abertas' | 'vencidas' | 'minhas' | 'concluidas';

const RECORTES: { valor: Recorte; rotulo: string }[] = [
  { valor: 'abertas', rotulo: 'Abertas' },
  { valor: 'vencidas', rotulo: 'Vencidas' },
  { valor: 'minhas', rotulo: 'Minhas' },
  { valor: 'concluidas', rotulo: 'Concluidas' },
];

/** Os parâmetros que cada recorte manda à API. */
function consultaDoRecorte(recorte: Recorte): Record<string, string> {
  if (recorte === 'vencidas') {
    return { apenasVencidas: 'true' };
  }

  if (recorte === 'minhas') {
    return { apenasMinhas: 'true', situacao: 'OPEN' };
  }

  if (recorte === 'concluidas') {
    return { situacao: 'DONE' };
  }

  return { situacao: 'OPEN' };
}

export default function Tarefas() {
  const { papel, organizacaoAtiva } = useSessao();

  const podeCriar = podeFazer(papel, 'negociacao:criar') !== false;

  const [recorte, setRecorteBruto] = useState<Recorte>('abertas');
  const [pagina, setPaginaBruta] = useState(1);
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [tentativa, setTentativaBruta] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [criando, setCriando] = useState(false);

  // Quem dispara a busca liga o sinalizador; o efeito o desliga depois do
  // `await`. `setState` sincrono no corpo do efeito gera renderizacao em
  // cascata, e o ESLint deste projeto recusa — com razao.
  const setRecorte = useCallback((proximo: Recorte) => {
    setBuscando(true);
    setPaginaBruta(1);
    setRecorteBruto(proximo);
  }, []);

  const setPagina = useCallback((proxima: number | ((p: number) => number)) => {
    setBuscando(true);
    setPaginaBruta(proxima);
  }, []);

  const recarregar = useCallback(() => {
    setBuscando(true);
    setTentativaBruta((n) => n + 1);
  }, []);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const consulta = new URLSearchParams({
          pagina: String(pagina),
          porPagina: '20',
          ...consultaDoRecorte(recorte),
        });

        const resultado = await chamarApi<PaginaDeTarefas>(
          `/tarefas?${consulta.toString()}`,
        );

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
              : 'Nao foi possivel carregar as tarefas.',
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
  }, [pagina, recorte, tentativa]);

  const totalDePaginas =
    estado.situacao === 'pronto'
      ? Math.max(1, Math.ceil(estado.pagina.total / estado.pagina.porPagina))
      : 1;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
            Tarefas
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {organizacaoAtiva.nome}
          </p>
        </div>

        {podeCriar && !criando ? (
          <Button size="sm" onClick={() => setCriando(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Nova tarefa
          </Button>
        ) : null}
      </div>

      {criando ? (
        <div className="mt-6">
          <Criacao
            aoCriar={() => {
              setCriando(false);
              recarregar();
            }}
            aoCancelar={() => setCriando(false)}
          />
        </div>
      ) : null}

      <div
        className="mt-6 flex flex-wrap gap-1"
        role="group"
        aria-label="Recorte"
      >
        {RECORTES.map((opcao) => (
          <Button
            key={opcao.valor}
            type="button"
            size="sm"
            variant={recorte === opcao.valor ? 'default' : 'ghost'}
            aria-pressed={recorte === opcao.valor}
            onClick={() => setRecorte(opcao.valor)}
          >
            {opcao.rotulo}
          </Button>
        ))}
      </div>

      <div className="mt-6">
        {estado.situacao === 'carregando' ? (
          <div className="grid gap-2" aria-busy="true" aria-live="polite">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
            ))}
            <span className="sr-only">Carregando as tarefas...</span>
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
          estado.pagina.tarefas.length === 0 ? (
            <Vazio recorte={recorte} />
          ) : (
            <>
              <ul
                className={cn(
                  'grid gap-2 transition-opacity',
                  buscando && 'opacity-50',
                )}
                aria-busy={buscando || undefined}
              >
                {estado.pagina.tarefas.map((tarefa) => (
                  <li key={tarefa.id}>
                    <LinhaDaTarefa
                      tarefa={tarefa}
                      pode={
                        podeFazer(papel, 'negociacao:editar') === 'ORG' ||
                        tarefa.minha ||
                        tarefa.cliente?.acessivel === true
                      }
                      aoMudar={recarregar}
                    />
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
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * Uma tarefa na lista.
 *
 * Concluir é **um** clique, e é o botão mais à mão. Quem anota uma tarefa anota
 * para dar baixa depois, e uma baixa que custa dois cliques e uma tela nova é
 * uma baixa que não acontece — a lista então enche de coisa feita e deixa de
 * dizer o que falta.
 */
function LinhaDaTarefa({
  tarefa,
  pode,
  aoMudar,
}: {
  tarefa: Tarefa;
  pode: boolean;
  aoMudar: () => void;
}) {
  const [agindo, setAgindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [editandoPrazo, setEditandoPrazo] = useState(false);
  const [prazo, setPrazo] = useState(campoLocalDeIso(tarefa.venceEm));

  async function mudarSituacao(situacao: TaskStatus) {
    setAgindo(true);
    setFalha(null);

    try {
      await chamarApi(`/tarefas/${tarefa.id}/situacao`, {
        metodo: 'POST',
        corpo: { situacao },
      });

      aoMudar();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel mudar a situacao.',
      );
      setAgindo(false);
    }
  }

  async function salvarPrazo() {
    setAgindo(true);
    setFalha(null);

    try {
      await chamarApi(`/tarefas/${tarefa.id}`, {
        metodo: 'PATCH',
        // Vazio apaga o prazo: tarefa sem data é um caso legítimo, e não um
        // campo que alguém esqueceu de preencher.
        corpo: { venceEm: isoDeCampoLocal(prazo) },
      });

      setEditandoPrazo(false);
      aoMudar();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel mudar o prazo.',
      );
      setAgindo(false);
    }
  }

  return (
    <div
      className={cn(
        'bg-card rounded-lg border p-3',
        tarefa.vencida && 'border-destructive/40',
        tarefa.situacao !== 'OPEN' && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              'text-sm font-medium',
              tarefa.situacao === 'DONE' && 'line-through',
            )}
          >
            {tarefa.titulo}
          </p>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {tarefa.venceEm ? (
              <span className="first-letter:uppercase">
                {formatarDiaLongo(tarefa.venceEm)}
              </span>
            ) : (
              <span className="italic">Sem prazo</span>
            )}

            {tarefa.minha ? null : <span>{tarefa.responsavel.nome}</span>}

            {tarefa.situacao === 'OPEN' ? null : (
              <Badge
                variant={tarefa.situacao === 'DONE' ? 'default' : 'secondary'}
              >
                {ROTULOS_DE_STATUS_DE_TAREFA[tarefa.situacao]}
              </Badge>
            )}

            {tarefa.vencida ? (
              <Badge variant="destructive">Vencida</Badge>
            ) : null}
          </div>
        </div>

        {pode ? (
          <div className="flex shrink-0 gap-1">
            {tarefa.situacao === 'OPEN' ? (
              <Button
                variant="outline"
                size="sm"
                disabled={agindo}
                onClick={() => void mudarSituacao('DONE')}
              >
                <CircleCheck aria-hidden="true" className="size-4" />
                Concluir
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={agindo}
                onClick={() => void mudarSituacao('OPEN')}
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Reabrir
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {/* Os vinculos: cliente, negociacao e imovel, cada um opcional e
          independente. O do cliente so vira link quando a ficha esta ao
          alcance de quem olha. */}
      {tarefa.cliente || tarefa.negociacao || tarefa.imovel ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {tarefa.cliente ? (
            tarefa.cliente.acessivel ? (
              <Link
                href={`/painel/leads/${tarefa.cliente.id}`}
                className="hover:bg-accent focus-visible:ring-ring flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <UserRound aria-hidden="true" className="size-3" />
                {tarefa.cliente.nomeCompleto}
              </Link>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1.5 rounded-md border px-2 py-1">
                <UserRound aria-hidden="true" className="size-3" />
                {tarefa.cliente.nomeCompleto}
              </span>
            )
          ) : null}

          {tarefa.negociacao ? (
            <Link
              href={`/painel/funil/${tarefa.negociacao.id}`}
              className="hover:bg-accent focus-visible:ring-ring flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <TrendingUp aria-hidden="true" className="size-3" />
              {tarefa.negociacao.etapa}
            </Link>
          ) : null}

          {tarefa.imovel ? (
            <Link
              href={`/painel/imoveis/${tarefa.imovel.id}/editar`}
              className="hover:bg-accent focus-visible:ring-ring flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Building2 aria-hidden="true" className="size-3" />
              {tarefa.imovel.codigo}
            </Link>
          ) : null}
        </div>
      ) : null}

      {falha ? (
        <div className="mt-2">
          <Aviso tom="erro">{falha}</Aviso>
        </div>
      ) : null}

      {pode && tarefa.situacao === 'OPEN' ? (
        <div className="mt-2">
          {editandoPrazo ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <label
                  htmlFor={`prazo-${tarefa.id}`}
                  className="text-xs font-medium"
                >
                  Prazo
                </label>
                <input
                  id={`prazo-${tarefa.id}`}
                  type="datetime-local"
                  value={prazo}
                  disabled={agindo}
                  onChange={(e) => setPrazo(e.target.value)}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm dark:bg-input/30"
                />
              </div>

              <Button
                size="sm"
                disabled={agindo}
                onClick={() => void salvarPrazo()}
              >
                {agindo ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={agindo}
                onClick={() => {
                  setEditandoPrazo(false);
                  setPrazo(campoLocalDeIso(tarefa.venceEm));
                }}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditandoPrazo(true)}
            >
              {tarefa.venceEm ? 'Mudar o prazo' : 'Definir prazo'}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Criar tarefa: título e prazo.
 *
 * Os vínculos com cliente, negociação e imóvel não aparecem aqui de propósito.
 * A tarefa vinculada nasce onde o vínculo já está decidido — na ficha do
 * cliente ou na negociação —, e oferecer três seletores no formulário rápido
 * transformaria "anotar que preciso ligar para o síndico" numa decisão de
 * cadastro.
 */
function Criacao({
  aoCriar,
  aoCancelar,
}: {
  aoCriar: () => void;
  aoCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [prazo, setPrazo] = useState('');
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setFalha(null);

    const venceEm = isoDeCampoLocal(prazo);

    const validacao = validar(criarTarefaSchema, {
      titulo: titulo.trim(),
      ...(venceEm ? { venceEm } : {}),
    });

    if (!validacao.ok) {
      setErros(validacao.erros);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      await chamarApi('/tarefas', { metodo: 'POST', corpo: validacao.dados });
      aoCriar();
    } catch (erro) {
      if (erro instanceof ErroDaApi && erro.erros.length > 0) {
        setErros(erro.porCampo);
      } else {
        setFalha(
          erro instanceof ErroDaApi
            ? erro.message
            : 'Nao foi possivel criar a tarefa.',
        );
      }

      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={criar}
      noValidate
      className="grid gap-3 rounded-xl border p-4"
    >
      {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

      <div className="grid gap-2">
        <label htmlFor="titulo" className="text-sm font-medium">
          O que precisa ser feito
        </label>
        <input
          id="titulo"
          name="titulo"
          value={titulo}
          disabled={enviando}
          autoFocus
          aria-invalid={erros.titulo ? true : undefined}
          aria-describedby={erros.titulo ? 'titulo-erro' : undefined}
          onChange={(e) => {
            setTitulo(e.target.value);
            setErros({});
          }}
          placeholder="Ligar para o sindico e confirmar a chave"
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm dark:bg-input/30"
        />
        {erros.titulo ? (
          <p id="titulo-erro" role="alert" className="text-destructive text-xs">
            {erros.titulo}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label htmlFor="venceEm" className="text-sm font-medium">
          Prazo
        </label>
        <input
          id="venceEm"
          name="venceEm"
          type="datetime-local"
          value={prazo}
          disabled={enviando}
          aria-invalid={erros.venceEm ? true : undefined}
          aria-describedby="venceEm-ajuda"
          onChange={(e) => {
            setPrazo(e.target.value);
            setErros({});
          }}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm dark:bg-input/30"
        />
        <p id="venceEm-ajuda" className="text-muted-foreground text-xs">
          Opcional. Sem prazo, a tarefa fica no fim da lista e nunca aparece
          como vencida.
        </p>
        {erros.venceEm ? (
          <p role="alert" className="text-destructive text-xs">
            {erros.venceEm}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? 'Criando...' : 'Criar tarefa'}
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
        A tarefa fica com voce. Para vincular a um cliente ou a uma negociacao,
        crie a partir da ficha dele.
      </p>
    </form>
  );
}

/**
 * O vazio de cada recorte diz coisas diferentes.
 *
 * "Nenhuma tarefa vencida" é **boa notícia**, e precisa soar como tal — o mesmo
 * cuidado que a fila de clientes não atribuídos exigiu. Uma mensagem única para
 * os quatro recortes diria "nenhuma tarefa cadastrada" a quem acabou de pôr a
 * lista em ordem.
 */
function Vazio({ recorte }: { recorte: Recorte }) {
  const texto: Record<Recorte, { titulo: string; detalhe: string }> = {
    abertas: {
      titulo: 'Nenhuma tarefa aberta.',
      detalhe:
        'Tarefa serve para o que nao pode ser esquecido entre uma ligacao e a proxima: devolver contato, levar documento, confirmar chave.',
    },
    vencidas: {
      titulo: 'Nada vencido.',
      detalhe: 'Tudo o que tinha prazo esta dentro dele.',
    },
    minhas: {
      titulo: 'Nenhuma tarefa sua em aberto.',
      detalhe: 'As tarefas da equipe continuam na aba "Abertas".',
    },
    concluidas: {
      titulo: 'Nenhuma tarefa concluida ainda.',
      detalhe: 'Conforme forem concluidas, elas aparecem aqui.',
    },
  };

  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <ListChecks aria-hidden="true" className="text-muted-foreground size-8" />
      <p className="font-medium">{texto[recorte].titulo}</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        {texto[recorte].detalhe}
      </p>
    </div>
  );
}
