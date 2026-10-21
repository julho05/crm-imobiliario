'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Trash2 } from 'lucide-react';
import {
  ESTADOS_COMERCIAIS_ALCANCAVEIS,
  estadoIncompativelComAFinalidade,
  podeFazer,
  ROTULOS_DE_STATUS_DE_IMOVEL,
  type EstadoComercialAlcancavel,
  type Escopo,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { FormularioDeImovel } from '@/components/imoveis/formulario-de-imovel';
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
import { ehResponsavel, type Imovel } from '@/lib/imoveis';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/imoveis/[id]/editar` — edicao (B1) e publicacao (B2).
 *
 * ## Por que as duas coisas na mesma tela
 *
 * Porque e a mesma decisao, do ponto de vista de quem usa: a pessoa abre o
 * imovel para mexer nele, e "colocar no ar" e uma das coisas que ela quer
 * fazer ali. Separar em outra rota obrigaria a navegar para publicar o que
 * acabou de corrigir.
 *
 * No servidor eles continuam separados, e isso e que importa: publicar e um
 * `POST` proprio, com `imovel:publicar` e evento de auditoria distinto de
 * `imovel.editado`.
 *
 * ## O 404 chega aqui como "nao encontrado", nao como erro
 *
 * Imovel de outra organizacao responde 404, igual a imovel inexistente — de
 * proposito (`docs/permissions.md` §6). A tela nao tenta distinguir os dois,
 * porque nao da e porque nao deve.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; imovel: Imovel }
  | { situacao: 'nao-encontrado' }
  | { situacao: 'erro'; mensagem: string };

export default function EditarImovel() {
  const parametros = useParams<{ id: string }>();
  const consulta = useSearchParams();
  const router = useRouter();
  const { papel, organizacaoAtiva } = useSessao();

  const id = parametros.id;
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  // `?salvo=1` vem do proprio formulario depois de gravar. Mensagem na URL, e
  // nao em estado, para sobreviver ao `router.push` que troca cadastro por
  // edicao — sem isso, o cadastro bem-sucedido nao confirmaria nada.
  const [salvo, setSalvo] = useState(consulta.get('salvo') === '1');

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const imovel = await chamarApi<Imovel>(`/imoveis/${id}`);

        if (ativo) {
          setEstado({ situacao: 'pronto', imovel });
        }
      } catch (erro) {
        if (!ativo) {
          return;
        }

        if (erro instanceof ErroDaApi && erro.status === 404) {
          setEstado({ situacao: 'nao-encontrado' });
          return;
        }

        setEstado({
          situacao: 'erro',
          mensagem:
            erro instanceof ErroDaApi
              ? erro.message
              : 'Nao foi possivel carregar o imovel.',
        });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [id, tentativa]);

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  if (estado.situacao === 'carregando') {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="grid gap-4" aria-busy="true" aria-live="polite">
          <div className="bg-muted h-8 w-64 animate-pulse rounded-md" />
          <div className="bg-muted h-64 animate-pulse rounded-xl" />
          <span className="sr-only">Carregando o imovel...</span>
        </div>
      </div>
    );
  }

  if (estado.situacao === 'nao-encontrado') {
    return (
      <div className="mx-auto max-w-3xl grid gap-4">
        <Aviso tom="erro">
          Imovel nao encontrado. Ele pode ter sido excluido, ou o endereco esta
          errado.
        </Aviso>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/painel/imoveis">Voltar para a lista</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (estado.situacao === 'erro') {
    return (
      <div className="mx-auto max-w-3xl grid gap-4">
        <Aviso tom="erro">{estado.mensagem}</Aviso>
        <div>
          <Button variant="outline" size="sm" onClick={recarregar}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  const { imovel } = estado;

  const alcanca = (acao: Parameters<typeof podeFazer>[1]): boolean =>
    permite(podeFazer(papel, acao), imovel, organizacaoAtiva.membershipId);

  const podeEditar = alcanca('imovel:editar');

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/painel/imoveis">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Imoveis
        </Link>
      </Button>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-navy truncate text-2xl font-semibold tracking-tight dark:text-foreground">
            {imovel.titulo}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {imovel.codigo}
            </span>
            <Badge variant="secondary">
              {ROTULOS_DE_STATUS_DE_IMOVEL[imovel.status]}
            </Badge>
            {imovel.publicadoEm ? <Badge>No ar</Badge> : null}
          </div>
        </div>
      </div>

      {salvo ? (
        <div className="mt-6">
          <Aviso tom="sucesso">Imovel salvo.</Aviso>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6">
        <Publicacao
          imovel={imovel}
          pode={alcanca('imovel:publicar')}
          aoMudar={(atualizado) => {
            setSalvo(false);
            setEstado({ situacao: 'pronto', imovel: atualizado });
          }}
        />

        <EstadoComercial
          imovel={imovel}
          pode={podeEditar}
          aoMudar={(atualizado) => {
            setSalvo(false);
            setEstado({ situacao: 'pronto', imovel: atualizado });
          }}
        />

        {podeEditar ? (
          <FormularioDeImovel imovel={imovel} />
        ) : (
          <Aviso tom="informacao">
            Este imovel esta sob responsabilidade de{' '}
            {imovel.responsavel?.nome ?? 'outra pessoa'}. Voce pode ve-lo, mas
            nao edita-lo.
          </Aviso>
        )}

        {alcanca('imovel:excluir') ? (
          <Exclusao
            imovel={imovel}
            aoExcluir={() => router.push('/painel/imoveis')}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * O escopo da matriz aplicado a **este** registro.
 *
 * `ORG` alcanca qualquer imovel da organizacao; `OWN` so o que esta sob
 * responsabilidade de quem olha; `false` nao alcanca nada. Mais uma vez: isto
 * decide o que **aparece**, nao o que e permitido.
 */
function permite(
  escopo: Escopo,
  imovel: Imovel,
  membershipId: string | undefined,
): boolean {
  if (escopo === false) {
    return false;
  }

  return escopo === 'ORG' || ehResponsavel(imovel, membershipId);
}

/**
 * Publicar e despublicar — item B2.
 *
 * O texto explica o que cada estado significa porque `status` e `publishedAt`
 * sao coisas diferentes, e essa distincao nao e obvia: um imovel pode estar
 * reservado **e** anunciado, com etiqueta. Sem a explicacao, a pessoa leria os
 * dois selos como contradicao.
 */
function Publicacao({
  imovel,
  pode,
  aoMudar,
}: {
  imovel: Imovel;
  pode: boolean;
  aoMudar: (imovel: Imovel) => void;
}) {
  const [agindo, setAgindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const noAr = imovel.publicadoEm !== null;

  async function alternar() {
    setAgindo(true);
    setFalha(null);

    try {
      const atualizado = await chamarApi<Imovel>(
        `/imoveis/${imovel.id}/${noAr ? 'despublicar' : 'publicar'}`,
        { metodo: 'POST' },
      );

      aoMudar(atualizado);
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? // A API recusa publicar imovel vendido, inativo ou sem o preco que
            // a finalidade exige. A mensagem dela e especifica e util aqui:
            // quem pediu e membro da organizacao e precisa saber o que corrigir.
            erro.message
          : 'Nao foi possivel mudar a publicacao.',
      );
    } finally {
      setAgindo(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Publicacao</CardTitle>
        <CardDescription>
          {noAr
            ? `No ar desde ${new Date(imovel.publicadoEm!).toLocaleString('pt-BR')}. Aparece no catalogo publico.`
            : 'Fora do ar. So quem tem acesso a esta organizacao ve este imovel.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {pode ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={noAr ? 'outline' : 'default'}
              size="sm"
              disabled={agindo}
              onClick={() => void alternar()}
            >
              {noAr ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
              {agindo
                ? 'Aguarde...'
                : noAr
                  ? 'Tirar do ar'
                  : 'Publicar no catalogo'}
            </Button>

            {noAr ? null : (
              <p className="text-muted-foreground text-xs">
                Publicar exige o preco da finalidade escolhida.
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Seu papel nao permite publicar este imovel.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Estado comercial: disponivel, reservado, vendido, alugado, arquivado.
 *
 * ## Por que botoes, e nao um seletor
 *
 * Porque cada um e um **acontecimento**, nao a escolha de um valor. "Marquei
 * como vendido" e uma data que alguem vai consultar depois, e a API grava um
 * evento de auditoria com nome proprio para cada um. Um seletor com "salvar"
 * faria a mudanca parecer edicao de campo, e convidaria a troca por engano em
 * algo que mexe no anuncio publico.
 *
 * O texto avisa quando a mudanca tira o imovel do ar, porque essa consequencia
 * nao e obvia e nao da para desfazer com um clique — republicar e outra acao.
 */
function EstadoComercial({
  imovel,
  pode,
  aoMudar,
}: {
  imovel: Imovel;
  pode: boolean;
  aoMudar: (imovel: Imovel) => void;
}) {
  const [agindo, setAgindo] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  async function alterar(estado: EstadoComercialAlcancavel) {
    setAgindo(estado);
    setFalha(null);

    try {
      const atualizado = await chamarApi<Imovel>(
        `/imoveis/${imovel.id}/estado`,
        { metodo: 'POST', corpo: { estado } },
      );

      aoMudar(atualizado);
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? // A API recusa vender imovel so de locacao, alugar imovel so de
            // venda, e voltar a disponivel sem o preco da finalidade. As
            // mensagens dela sao especificas e uteis aqui.
            erro.message
          : 'Nao foi possivel mudar o estado do imovel.',
      );
    } finally {
      setAgindo(null);
    }
  }

  // Esconde o que a finalidade nao admite, em vez de oferecer e recusar: o
  // imovel so de locacao nao tem como ser vendido.
  const disponiveis = ESTADOS_COMERCIAIS_ALCANCAVEIS.filter(
    (estado) =>
      estado !== imovel.status &&
      estadoIncompativelComAFinalidade(estado, imovel.finalidade) === null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estado comercial</CardTitle>
        <CardDescription>
          Hoje: <strong>{ROTULOS_DE_STATUS_DE_IMOVEL[imovel.status]}</strong>. E
          diferente da publicacao — um imovel reservado continua anunciado, com
          etiqueta.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {pode ? (
          <div className="flex flex-wrap gap-2">
            {disponiveis.map((estado) => (
              <Button
                key={estado}
                variant="outline"
                size="sm"
                disabled={agindo !== null}
                onClick={() => void alterar(estado)}
              >
                {agindo === estado
                  ? 'Aguarde...'
                  : ROTULOS_DE_STATUS_DE_IMOVEL[estado]}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Seu papel nao permite mudar o estado deste imovel.
          </p>
        )}

        {pode && imovel.publicadoEm ? (
          <p className="text-muted-foreground text-xs">
            Marcar como vendido, alugado ou arquivado tira o imovel do catalogo
            publico.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Exclusao, com confirmacao em duas etapas.
 *
 * Nao usa `confirm()` do navegador: ele nao e estilizavel, aparece deslocado da
 * tela e, em algumas configuracoes, e bloqueado. A confirmacao inline tambem
 * deixa claro **o que** sera excluido, porque o codigo do imovel fica a vista.
 *
 * A exclusao e logica no servidor: a linha fica, com `deletedAt`. O texto diz
 * "remover da lista" e nao "apagar para sempre" porque e isso que acontece — e
 * prometer o que nao se faz e pior do que explicar o que se faz.
 */
function Exclusao({
  imovel,
  aoExcluir,
}: {
  imovel: Imovel;
  aoExcluir: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  async function excluir() {
    setExcluindo(true);
    setFalha(null);

    try {
      await chamarApi(`/imoveis/${imovel.id}`, { metodo: 'DELETE' });
      aoExcluir();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel excluir o imovel.',
      );
      setExcluindo(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base">Excluir imovel</CardTitle>
        <CardDescription>
          O imovel sai das listas e do catalogo. O historico de negociacoes
          ligado a ele e preservado.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {confirmando ? (
          <div className="grid gap-3">
            <p className="text-sm">
              Excluir <strong>{imovel.codigo}</strong> — {imovel.titulo}?
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
