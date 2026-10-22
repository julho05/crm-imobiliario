'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Building2, Phone, UserRound } from 'lucide-react';
import {
  podeFazer,
  ROTULOS_DE_PAPEL,
  ROTULOS_DE_STATUS_DE_VISITA,
  type VisitStatus,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Campo, CampoTexto } from '@/components/campo';
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
import {
  campoLocalDeIso,
  formatarDiaLongo,
  formatarHora,
  isoDeCampoLocal,
  SITUACOES_DE_VISITA_ALCANCAVEIS,
  type MembroDaEquipe,
  type Visita,
} from '@/lib/agenda';
import { chamarApi, ErroDaApi } from '@/lib/api';
import { formatarTelefone } from '@/lib/leads';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/agenda/[id]` — uma visita.
 *
 * ## O telefone aparece aqui, e não é descuido
 *
 * Na tela da negociação o telefone **não** é duplicado: há um link para a ficha
 * do cliente, e espalhar dado pessoal por mais telas por conveniência que um
 * link resolve não se justifica. Aqui a conta é outra. Quem conduz a visita do
 * cliente de um colega **não alcança** a ficha — ela responde 404 para ele por
 * decisão de 21/10/2026 —, e precisa poder avisar que está atrasado. O telefone
 * é o mínimo do encontro, e sem ele a decisão de deixá-lo ver a visita não
 * serviria para nada.
 *
 * O link para a ficha só aparece quando `cliente.acessivel` é `true`, que é a
 * API dizendo "esta pessoa também responde por este cliente".
 *
 * ## O que não se edita
 *
 * Imóvel e cliente. Trocar qualquer um dos dois faz da visita outra visita, e o
 * histórico de quem foi avisado de quê deixaria de bater — o contrato recusa os
 * dois campos na edição. Para mudar, cancela-se e marca-se outra.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; visita: Visita }
  | { situacao: 'nao-encontrada' }
  | { situacao: 'erro'; mensagem: string };

export default function DetalheDaVisita() {
  const { id } = useParams<{ id: string }>();
  const { papel, organizacaoAtiva } = useSessao();

  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const visita = await chamarApi<Visita>(`/visitas/${id}`);

        if (ativo) {
          setEstado({ situacao: 'pronto', visita });
        }
      } catch (erro) {
        if (!ativo) {
          return;
        }

        if (erro instanceof ErroDaApi && erro.status === 404) {
          setEstado({ situacao: 'nao-encontrada' });
          return;
        }

        setEstado({
          situacao: 'erro',
          mensagem:
            erro instanceof ErroDaApi
              ? erro.message
              : 'Nao foi possivel carregar a visita.',
        });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [id, tentativa]);

  const trocar = useCallback(
    (visita: Visita) => setEstado({ situacao: 'pronto', visita }),
    [],
  );

  if (estado.situacao === 'carregando') {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="grid gap-4" aria-busy="true" aria-live="polite">
          <div className="bg-muted h-8 w-56 animate-pulse rounded-md" />
          <div className="bg-muted h-24 animate-pulse rounded-xl" />
          <div className="bg-muted h-40 animate-pulse rounded-xl" />
          <span className="sr-only">Carregando a visita...</span>
        </div>
      </div>
    );
  }

  if (estado.situacao === 'nao-encontrada') {
    return (
      <div className="mx-auto grid max-w-2xl gap-4">
        <Aviso tom="erro">
          Visita nao encontrada. Ela pode ter sido excluida, estar sob
          responsabilidade de outra pessoa, ou o endereco esta errado.
        </Aviso>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/painel/agenda">Voltar para a agenda</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (estado.situacao === 'erro') {
    return (
      <div className="mx-auto grid max-w-2xl gap-4">
        <Aviso tom="erro">{estado.mensagem}</Aviso>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTentativa((n) => n + 1)}
          >
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  const { visita } = estado;

  // A visita que a pessoa não alcança nem chega aqui — responderia 404 ou 403
  // pela matriz. Então basta conferir o escopo, com as **duas** portas: conduz
  // a visita, ou responde pelo cliente.
  const escopoDeEdicao = podeFazer(papel, 'negociacao:editar');
  const podeEditar =
    escopoDeEdicao === 'ORG' ||
    (escopoDeEdicao === 'OWN' &&
      (visita.responsavel.membershipId === organizacaoAtiva.membershipId ||
        visita.cliente?.acessivel === true));

  const fechada =
    visita.situacao === 'CANCELED' || visita.situacao === 'NO_SHOW';

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/painel/agenda">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Agenda
        </Link>
      </Button>

      <div className="mt-2">
        <h1 className="text-navy text-2xl font-semibold tracking-tight first-letter:uppercase dark:text-foreground">
          {formatarDiaLongo(visita.inicioEm)}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {formatarHora(visita.inicioEm)} as {formatarHora(visita.fimEm)}
          </span>
          <Badge
            variant={
              visita.situacao === 'DONE'
                ? 'default'
                : fechada
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {ROTULOS_DE_STATUS_DE_VISITA[visita.situacao]}
          </Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Imovel e cliente</CardTitle>
            <CardDescription>
              Os dois nao mudam depois de agendada: trocar um deles faria desta
              outra visita. Para mudar, cancele e marque outra.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link
              href={`/painel/imoveis/${visita.imovel.id}/editar`}
              className="hover:bg-accent focus-visible:ring-ring flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Building2
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {visita.imovel.titulo}
                </span>
                <span className="text-muted-foreground block font-mono text-xs">
                  {visita.imovel.codigo}
                </span>
              </span>
            </Link>

            {visita.cliente ? (
              <Cliente cliente={visita.cliente} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Sem cliente cadastrado — interessado que apareceu no imovel.
              </p>
            )}
          </CardContent>
        </Card>

        <Situacao visita={visita} pode={podeEditar} aoMudar={trocar} />

        {podeEditar ? (
          <Horario visita={visita} aoMudar={trocar} />
        ) : (
          <Aviso tom="informacao">
            Esta visita esta sob responsabilidade de {visita.responsavel.nome}.
            Voce pode ve-la, mas nao edita-la.
          </Aviso>
        )}

        <Responsavel
          visita={visita}
          pode={podeFazer(papel, 'negociacao:atribuir') !== false}
          euMesmo={organizacaoAtiva.membershipId}
          aoMudar={trocar}
        />
      </div>
    </div>
  );
}

/**
 * O cliente da visita: nome e telefone.
 *
 * Duas formas, e a diferença entre elas é a decisão de 21/10/2026. Com acesso,
 * é um link para a ficha. Sem acesso, é um bloco sem link — porque quem conduz
 * a visita vê o mínimo do encontro e não o cliente no CRM.
 */
function Cliente({ cliente }: { cliente: NonNullable<Visita['cliente']> }) {
  const telefone = formatarTelefone(cliente.telefone);

  const conteudo = (
    <>
      <UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {cliente.nomeCompleto}
        </span>
        {telefone ? (
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Phone aria-hidden="true" className="size-3 shrink-0" />
            {telefone}
          </span>
        ) : (
          <span className="text-muted-foreground block text-xs">
            Sem telefone cadastrado
          </span>
        )}
      </span>
    </>
  );

  if (cliente.acessivel) {
    return (
      <Link
        href={`/painel/leads/${cliente.id}`}
        className="hover:bg-accent focus-visible:ring-ring flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {conteudo}
      </Link>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
        {conteudo}
      </div>
      <p className="text-muted-foreground text-xs">
        Este cliente e acompanhado por outra pessoa. Voce recebe o nome e o
        telefone porque vai conduzir a visita; o atendimento continua com quem
        responde por ele.
      </p>
    </div>
  );
}

/**
 * Confirmar, realizar, cancelar ou registrar que não compareceu.
 *
 * "Agendada" não está entre os destinos porque o contrato não a aceita: é o
 * estado inicial, e voltar a ele apagaria a informação de que a visita foi
 * cancelada. O caminho certo ali é marcar outra visita.
 */
function Situacao({
  visita,
  pode,
  aoMudar,
}: {
  visita: Visita;
  pode: boolean;
  aoMudar: (visita: Visita) => void;
}) {
  const [agindo, setAgindo] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  async function alterar(situacao: VisitStatus) {
    setAgindo(situacao);
    setFalha(null);

    try {
      aoMudar(
        await chamarApi<Visita>(`/visitas/${visita.id}/situacao`, {
          metodo: 'POST',
          corpo: { situacao },
        }),
      );
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel mudar a situacao.',
      );
    } finally {
      setAgindo(null);
    }
  }

  const disponiveis = SITUACOES_DE_VISITA_ALCANCAVEIS.filter(
    (situacao) => situacao !== visita.situacao,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Situacao</CardTitle>
        <CardDescription>
          Hoje: <strong>{ROTULOS_DE_STATUS_DE_VISITA[visita.situacao]}</strong>.
          Registrar o que aconteceu e o que faz a agenda servir de historico.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {pode ? (
          <div className="flex flex-wrap gap-2">
            {disponiveis.map((situacao) => (
              <Button
                key={situacao}
                variant={situacao === 'DONE' ? 'default' : 'outline'}
                size="sm"
                disabled={agindo !== null}
                onClick={() => void alterar(situacao)}
              >
                {agindo === situacao
                  ? 'Aguarde...'
                  : ROTULOS_DE_STATUS_DE_VISITA[situacao]}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Seu papel nao permite mudar a situacao desta visita.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Horário e anotações — os dois campos que a edição aceita. */
function Horario({
  visita,
  aoMudar,
}: {
  visita: Visita;
  aoMudar: (visita: Visita) => void;
}) {
  const [inicio, setInicio] = useState(campoLocalDeIso(visita.inicioEm));
  const [fim, setFim] = useState(campoLocalDeIso(visita.fimEm));
  const [observacoes, setObservacoes] = useState(visita.observacoes ?? '');

  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setFalha(null);
    setErros({});

    const inicioEm = isoDeCampoLocal(inicio);
    const fimEm = isoDeCampoLocal(fim);

    if (!inicioEm || !fimEm) {
      setErros({
        ...(inicioEm ? {} : { inicioEm: 'Informe a data e a hora de inicio.' }),
        ...(fimEm ? {} : { fimEm: 'Informe a data e a hora de fim.' }),
      });
      return;
    }

    setEnviando(true);

    try {
      aoMudar(
        await chamarApi<Visita>(`/visitas/${visita.id}`, {
          metodo: 'PATCH',
          corpo: {
            inicioEm,
            fimEm,
            // Vazio apaga a anotação: deixar um texto que já não vale seria
            // pior do que não ter nenhum.
            observacoes: observacoes.trim() === '' ? null : observacoes.trim(),
          },
        }),
      );

      setSalvo(true);
    } catch (erro) {
      if (erro instanceof ErroDaApi && erro.erros.length > 0) {
        setErros(erro.porCampo);
      } else {
        setFalha(
          erro instanceof ErroDaApi ? erro.message : 'Nao foi possivel salvar.',
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Horario e anotacoes</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={salvar} noValidate className="grid gap-4">
          {falha ? <Aviso tom="erro">{falha}</Aviso> : null}
          {salvo ? <Aviso tom="sucesso">Alteracoes salvas.</Aviso> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              nome="inicioEm"
              rotulo="Inicio"
              type="datetime-local"
              value={inicio}
              disabled={enviando}
              onChange={(e) => {
                setInicio(e.target.value);
                setSalvo(false);
                setErros({});
              }}
              erro={erros.inicioEm}
            />

            <Campo
              nome="fimEm"
              rotulo="Fim"
              type="datetime-local"
              value={fim}
              disabled={enviando}
              onChange={(e) => {
                setFim(e.target.value);
                setSalvo(false);
                setErros({});
              }}
              erro={erros.fimEm}
            />
          </div>

          <CampoTexto
            nome="observacoes"
            rotulo="Anotacoes"
            value={observacoes}
            rows={3}
            disabled={enviando}
            onChange={(e) => {
              setObservacoes(e.target.value);
              setSalvo(false);
              setErros({});
            }}
            erro={erros.observacoes}
            ajuda="Em branco, apaga a anotacao."
          />

          <div>
            <Button type="submit" size="sm" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Quem conduz a visita.
 *
 * O aviso sobre revelar o contato não é enfeite: atribuir a visita de um
 * cliente a outra pessoa **dá a ela** o nome e o telefone daquele cliente, e a
 * auditoria registra isso. Quem atribui precisa saber o que está fazendo antes
 * de clicar, não depois.
 *
 * Não aceita "ninguém": em `Visit` o responsável é obrigatório no banco, ao
 * contrário do lead, onde a ausência é a fila de distribuição.
 */
function Responsavel({
  visita,
  pode,
  euMesmo,
  aoMudar,
}: {
  visita: Visita;
  pode: boolean;
  euMesmo: string;
  aoMudar: (visita: Visita) => void;
}) {
  const [membros, setMembros] = useState<MembroDaEquipe[] | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    if (!pode) {
      return;
    }

    let ativo = true;

    void (async () => {
      try {
        const { membros: lista } = await chamarApi<{
          membros: MembroDaEquipe[];
        }>('/equipe/membros');

        if (ativo) {
          setMembros(lista);
        }
      } catch {
        if (ativo) {
          setFalha('Nao foi possivel carregar a equipe.');
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, [pode]);

  async function atribuir(membershipId: string) {
    setAgindo(true);
    setFalha(null);

    try {
      aoMudar(
        await chamarApi<Visita>(`/visitas/${visita.id}/responsavel`, {
          metodo: 'POST',
          corpo: { membershipId },
        }),
      );
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel mudar o responsavel.',
      );
    } finally {
      setAgindo(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quem conduz</CardTitle>
        <CardDescription>
          {visita.responsavel.membershipId === euMesmo
            ? 'Voce'
            : visita.responsavel.nome}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {pode ? (
          <>
            <div className="grid gap-2">
              <label htmlFor="responsavel" className="text-sm font-medium">
                Passar para
              </label>
              <Select
                id="responsavel"
                name="responsavel"
                value={visita.responsavel.membershipId}
                disabled={membros === null || agindo}
                onChange={(e) => void atribuir(e.target.value)}
              >
                {(membros ?? []).map((membro) => (
                  <option key={membro.membershipId} value={membro.membershipId}>
                    {membro.nome} — {ROTULOS_DE_PAPEL[membro.papel]}
                  </option>
                ))}
              </Select>
            </div>

            {visita.cliente ? (
              <p className="text-muted-foreground text-xs">
                Passar esta visita da a quem recebe o nome e o telefone de{' '}
                {visita.cliente.nomeCompleto} — o minimo para conduzir o
                encontro. Fica registrado no historico.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Passar visita para outra pessoa e tarefa de quem coordena a equipe.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
