'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import {
  ROTULOS_DE_STATUS_DE_IMOVEL,
  podeFazer,
  type Escopo,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { GaleriaDeMidia } from '@/components/imoveis/galeria-de-midia';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErroDaApi, chamarApi } from '@/lib/api';
import { ehResponsavel, type Imovel } from '@/lib/imoveis';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/imoveis/[id]/fotos` — mídia do imóvel (item **B4**).
 *
 * ## Por que rota própria, e não uma seção do formulário
 *
 * É o que o mapa de telas já previa
 * ([pages-and-navigation.md](../../../../../docs/pages-and-navigation.md)
 * §221), e por um motivo de uso: o formulário é um envio só, com cinco seções
 * que a pessoa preenche e salva. A mídia não tem "salvar" — cada arquivo entra
 * no momento em que é enviado, cada remoção acontece na hora. Misturar as duas
 * coisas na mesma tela criaria um formulário onde parte do conteúdo já foi
 * gravado e parte não, e nenhum aviso de "alterações não salvas" daria conta
 * disso.
 *
 * ## O imóvel é carregado aqui, não na galeria
 *
 * A galeria precisa do id e da permissão, não do imóvel. Esta tela carrega o
 * registro porque quem chega por link precisa saber **de qual imóvel** são
 * estas fotos — e porque é daqui que sai a cortesia visual de edição, com a
 * mesma regra da tela de editar: a decisão de verdade é do servidor, em cada
 * requisição.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; imovel: Imovel }
  | { situacao: 'nao-encontrado' }
  | { situacao: 'erro'; mensagem: string };

export default function FotosDoImovel() {
  const parametros = useParams<{ id: string }>();
  const { papel, organizacaoAtiva } = useSessao();

  const id = parametros.id;
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

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
              : 'Não foi possível carregar o imóvel.',
        });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [id, tentativa]);

  if (estado.situacao === 'carregando') {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="grid gap-4" aria-busy="true" aria-live="polite">
          <div className="bg-muted h-8 w-64 animate-pulse rounded-md" />
          <div className="bg-muted h-64 animate-pulse rounded-xl" />
          <span className="sr-only">Carregando o imóvel...</span>
        </div>
      </div>
    );
  }

  if (estado.situacao === 'nao-encontrado') {
    return (
      <div className="mx-auto grid max-w-3xl gap-4">
        <Aviso tom="erro">
          Imóvel não encontrado. Ele pode ter sido excluído, ou o endereço está
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
      <div className="mx-auto grid max-w-3xl gap-4">
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

  const { imovel } = estado;
  const podeEditar = alcanca(
    podeFazer(papel, 'imovel:editar'),
    imovel,
    organizacaoAtiva.membershipId,
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/painel/imoveis/${imovel.id}/editar`}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Imóvel
        </Link>
      </Button>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-navy truncate text-2xl font-semibold tracking-tight dark:text-foreground">
            Fotos e documentos
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {imovel.codigo}
            </span>
            <span className="text-muted-foreground min-w-0 truncate text-sm">
              {imovel.titulo}
            </span>
            <Badge variant="secondary">
              {ROTULOS_DE_STATUS_DE_IMOVEL[imovel.status]}
            </Badge>
          </div>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href={`/painel/imoveis/${imovel.id}/editar`}>
            <Pencil aria-hidden="true" />
            Editar dados
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-6">
        {podeEditar ? null : (
          <Aviso tom="informacao">
            Este imóvel está sob responsabilidade de{' '}
            {imovel.responsavel?.nome ?? 'outra pessoa'}. Você pode ver as fotos
            e os documentos, mas não alterá-los.
          </Aviso>
        )}

        <GaleriaDeMidia imovelId={imovel.id} podeEditar={podeEditar} />
      </div>
    </div>
  );
}

/**
 * O escopo da matriz aplicado a **este** imóvel.
 *
 * Mesma função da tela de editar, e pela mesma razão: `imovel:editar` é `ORG`
 * para `OWNER`, `ADMIN` e `MANAGER`, e `OWN` para `AGENT`. Isto decide o que
 * **aparece**, nunca o que é permitido — a autorização é a do servidor, e a
 * API recusa com 403 quem o escopo não alcança, tela ou não.
 */
function alcanca(
  escopo: Escopo,
  imovel: Imovel,
  membershipId: string | undefined,
): boolean {
  if (escopo === false) {
    return false;
  }

  return escopo === 'ORG' || ehResponsavel(imovel, membershipId);
}
