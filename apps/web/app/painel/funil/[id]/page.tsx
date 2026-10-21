'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Trash2, UserRound } from 'lucide-react';
import { podeFazer, ROTULOS_DE_STATUS_DE_LEAD } from '@app/shared';
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
import { chamarApi, ErroDaApi } from '@/lib/api';
import { formatarDataHora } from '@/lib/leads';
import { formatarValor, type Etapa, type Negociacao } from '@/lib/negociacoes';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/funil/[id]` — uma negociação.
 *
 * ## É aqui que o movimento entre etapas acontece
 *
 * E não por arrastar no quadro, de propósito: a etapa de perda exige motivo e a
 * de ganho fecha a negociação. Essas duas consequências pedem uma confirmação
 * com espaço para explicar, não um gesto que pode ser acidental.
 *
 * ## O cliente aparece com link, e isso não é redundância
 *
 * A negociação não tem telefone nem e-mail — eles vivem no lead. Quem abre esta
 * tela para ligar precisa chegar ao contato em um clique. Duplicar o telefone
 * aqui espalharia dado pessoal por mais uma tela, por conveniência que um link
 * resolve.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; negociacao: Negociacao }
  | { situacao: 'nao-encontrada' }
  | { situacao: 'erro'; mensagem: string };

export default function DetalheDaNegociacao() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { papel, organizacaoAtiva } = useSessao();

  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [etapas, setEtapas] = useState<Etapa[] | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const [negociacao, listaDeEtapas] = await Promise.all([
          chamarApi<Negociacao>(`/negociacoes/${id}`),
          chamarApi<{ etapas: Etapa[] }>('/negociacoes/etapas'),
        ]);

        if (ativo) {
          setEstado({ situacao: 'pronto', negociacao });
          setEtapas(listaDeEtapas.etapas);
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
              : 'Nao foi possivel carregar a negociacao.',
        });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [id, tentativa]);

  const trocar = useCallback(
    (negociacao: Negociacao) => setEstado({ situacao: 'pronto', negociacao }),
    [],
  );

  if (estado.situacao === 'carregando') {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="grid gap-4" aria-busy="true" aria-live="polite">
          <div className="bg-muted h-8 w-56 animate-pulse rounded-md" />
          <div className="bg-muted h-24 animate-pulse rounded-xl" />
          <div className="bg-muted h-40 animate-pulse rounded-xl" />
          <span className="sr-only">Carregando a negociacao...</span>
        </div>
      </div>
    );
  }

  if (estado.situacao === 'nao-encontrada') {
    return (
      <div className="mx-auto grid max-w-2xl gap-4">
        <Aviso tom="erro">
          Negociacao nao encontrada. Ela pode ter sido excluida, pertencer a um
          cliente de outra pessoa, ou o endereco esta errado.
        </Aviso>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/painel/funil">Voltar para o funil</Link>
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

  const { negociacao } = estado;

  // A visibilidade herda o lead, e a negociação que a pessoa não alcança nem
  // chega aqui — responderia 404. Então basta conferir o escopo.
  const escopoDeEdicao = podeFazer(papel, 'negociacao:editar');
  const podeEditar =
    escopoDeEdicao === 'ORG' ||
    (escopoDeEdicao === 'OWN' &&
      negociacao.cliente.responsavel?.membershipId ===
        organizacaoAtiva.membershipId);

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/painel/funil">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Funil
        </Link>
      </Button>

      <div className="mt-2">
        <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
          {negociacao.cliente.nomeCompleto}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-2">
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
          {negociacao.fechadaEm ? (
            <span className="text-muted-foreground text-xs">
              Fechada em {formatarDataHora(negociacao.fechadaEm)}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">
              Aberta em {formatarDataHora(negociacao.criadaEm)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        {negociacao.motivoDaPerda ? (
          <Aviso tom="informacao">
            <strong>Motivo da perda:</strong> {negociacao.motivoDaPerda}
          </Aviso>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente e imovel</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link
              href={`/painel/leads/${negociacao.cliente.id}`}
              className="hover:bg-accent focus-visible:ring-ring flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <UserRound
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {negociacao.cliente.nomeCompleto}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {ROTULOS_DE_STATUS_DE_LEAD[negociacao.cliente.situacao]}
                  {negociacao.cliente.responsavel
                    ? ` · ${negociacao.cliente.responsavel.nome}`
                    : ' · sem responsavel'}
                </span>
              </span>
            </Link>

            {negociacao.imovel ? (
              <Link
                href={`/painel/imoveis/${negociacao.imovel.id}/editar`}
                className="hover:bg-accent focus-visible:ring-ring flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <Building2
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {negociacao.imovel.titulo}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {negociacao.imovel.codigo}
                  </span>
                </span>
              </Link>
            ) : (
              <p className="text-muted-foreground text-sm">
                Sem imovel definido — o cliente ainda esta procurando.
              </p>
            )}

            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">Valor esperado: </span>
              <strong>{formatarValor(negociacao.valorEsperado)}</strong>
            </p>
          </CardContent>
        </Card>

        {etapas ? (
          <Movimento
            negociacao={negociacao}
            etapas={etapas}
            pode={podeEditar}
            aoMover={trocar}
          />
        ) : null}

        {podeEditar ? (
          <Dados negociacao={negociacao} aoMudar={trocar} />
        ) : (
          <Aviso tom="informacao">
            Esta negociacao pertence a um cliente de{' '}
            {negociacao.cliente.responsavel?.nome ?? 'outra pessoa'}. Voce pode
            ve-la, mas nao edita-la.
          </Aviso>
        )}

        {podeFazer(papel, 'negociacao:excluir') !== false ? (
          <Exclusao
            negociacao={negociacao}
            aoExcluir={() => router.push('/painel/funil')}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Mover de etapa.
 *
 * A etapa de perda abre o campo de motivo **antes** de enviar, e não depois de
 * a API recusar: pedir o motivo em resposta a um erro faz a pessoa achar que
 * errou, quando ela só não sabia que o campo existia.
 */
function Movimento({
  negociacao,
  etapas,
  pode,
  aoMover,
}: {
  negociacao: Negociacao;
  etapas: Etapa[];
  pode: boolean;
  aoMover: (negociacao: Negociacao) => void;
}) {
  const [pedindoMotivo, setPedindoMotivo] = useState<Etapa | null>(null);
  const [motivo, setMotivo] = useState('');
  const [agindo, setAgindo] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [erroDoMotivo, setErroDoMotivo] = useState<string | undefined>();

  async function mover(etapa: Etapa, motivoDaPerda?: string) {
    setAgindo(etapa.id);
    setFalha(null);

    try {
      aoMover(
        await chamarApi<Negociacao>(`/negociacoes/${negociacao.id}/etapa`, {
          metodo: 'POST',
          corpo: { etapaId: etapa.id, motivoDaPerda },
        }),
      );

      setPedindoMotivo(null);
      setMotivo('');
      setErroDoMotivo(undefined);
    } catch (erro) {
      if (erro instanceof ErroDaApi) {
        const doMotivo = erro.porCampo.motivoDaPerda;

        if (doMotivo) {
          setErroDoMotivo(doMotivo);
        } else {
          setFalha(erro.message);
        }
      } else {
        setFalha('Nao foi possivel mover a negociacao.');
      }
    } finally {
      setAgindo(null);
    }
  }

  function escolher(etapa: Etapa) {
    if (etapa.perdido) {
      setPedindoMotivo(etapa);
      setFalha(null);
      return;
    }

    void mover(etapa);
  }

  const disponiveis = etapas.filter((e) => e.id !== negociacao.etapa.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Etapa</CardTitle>
        <CardDescription>
          Hoje: <strong>{negociacao.etapa.nome}</strong>. Mover para uma etapa
          de ganho ou de perda fecha a negociacao.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {!pode ? (
          <p className="text-muted-foreground text-sm">
            Seu papel nao permite mover esta negociacao.
          </p>
        ) : pedindoMotivo ? (
          <div className="grid gap-3">
            <CampoTexto
              nome="motivoDaPerda"
              rotulo={`Por que a negociacao foi perdida?`}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setErroDoMotivo(undefined);
              }}
              erro={erroDoMotivo}
              rows={3}
              ajuda="E o unico campo que explica por que nao fechamos. Fica no historico."
            />

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={agindo !== null}
                onClick={() => void mover(pedindoMotivo, motivo.trim())}
              >
                {agindo ? 'Aguarde...' : `Mover para ${pedindoMotivo.nome}`}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={agindo !== null}
                onClick={() => {
                  setPedindoMotivo(null);
                  setMotivo('');
                  setErroDoMotivo(undefined);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {disponiveis.map((etapa) => (
              <Button
                key={etapa.id}
                variant={etapa.ganho ? 'default' : 'outline'}
                size="sm"
                disabled={agindo !== null}
                onClick={() => escolher(etapa)}
              >
                {agindo === etapa.id ? 'Aguarde...' : etapa.nome}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Valor esperado e vínculo com o imóvel. */
function Dados({
  negociacao,
  aoMudar,
}: {
  negociacao: Negociacao;
  aoMudar: (negociacao: Negociacao) => void;
}) {
  const [valor, setValor] = useState(
    negociacao.valorEsperado === null ? '' : String(negociacao.valorEsperado),
  );
  const [erro, setErro] = useState<string | undefined>();
  const [falha, setFalha] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setFalha(null);
    setErro(undefined);

    const bruto = valor.trim();

    await enviarCorpo({
      // Vazio apaga o valor: "a definir" e um estado legitimo.
      valorEsperado: bruto === '' ? null : Number(bruto.replace(',', '.')),
    });
  }

  async function enviarCorpo(corpo: Record<string, unknown>) {
    setEnviando(true);

    try {
      aoMudar(
        await chamarApi<Negociacao>(`/negociacoes/${negociacao.id}`, {
          metodo: 'PATCH',
          corpo,
        }),
      );
      setSalvo(true);
    } catch (e) {
      if (e instanceof ErroDaApi) {
        const doCampo = e.porCampo.valorEsperado;

        if (doCampo) {
          setErro(doCampo);
        } else {
          setFalha(e.message);
        }
      } else {
        setFalha('Nao foi possivel salvar.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Valor esperado</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={salvar} noValidate className="grid gap-4">
          {falha ? <Aviso tom="erro">{falha}</Aviso> : null}
          {salvo ? <Aviso tom="sucesso">Alteracoes salvas.</Aviso> : null}

          <Campo
            nome="valorEsperado"
            rotulo="Valor esperado"
            inputMode="decimal"
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setSalvo(false);
              setErro(undefined);
            }}
            erro={erro}
            ajuda="Em reais. Deixe em branco se ainda nao ha valor definido."
          />

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Salvar'}
            </Button>

            {negociacao.imovel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={enviando}
                onClick={() => void enviarCorpo({ imovelId: null })}
              >
                Desvincular o imovel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Exclusao({
  negociacao,
  aoExcluir,
}: {
  negociacao: Negociacao;
  aoExcluir: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  async function excluir() {
    setExcluindo(true);
    setFalha(null);

    try {
      await chamarApi(`/negociacoes/${negociacao.id}`, { metodo: 'DELETE' });
      aoExcluir();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel excluir a negociacao.',
      );
      setExcluindo(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base">Excluir negociacao</CardTitle>
        <CardDescription>
          Ela sai do funil. O cliente e o imovel continuam como estao — so o
          registro do negocio e removido.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {confirmando ? (
          <div className="grid gap-3">
            <p className="text-sm">
              Excluir a negociacao de{' '}
              <strong>{negociacao.cliente.nomeCompleto}</strong>?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={excluindo}
                onClick={() => void excluir()}
              >
                {excluindo ? 'Excluindo...' : 'Sim, excluir'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={excluindo}
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmando(true)}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Excluir
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
