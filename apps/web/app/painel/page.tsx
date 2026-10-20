'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlternadorDeTema } from '@/components/alternador-de-tema';
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
import { ROTULOS_DE_PAPEL, type Role } from '@app/shared';
import { chamarApi, ErroDaApi } from '@/lib/api';

/**
 * `/painel` — provisorio.
 *
 * **Nao e o dashboard.** O dashboard de verdade esta descrito no §5 de
 * `docs/pages-and-navigation.md` e depende de imoveis e leads, que sao a Fase
 * 2 do roadmap.
 *
 * Esta tela existe por uma razao pratica: sem ela, entrar e cadastrar-se
 * levariam a lugar nenhum, e nao haveria como conferir pelo navegador que a
 * sessao abriu e que a organizacao ativa esta certa. Ela mostra o que a API
 * sabe responder hoje, e nada mais.
 */

type Eu = {
  userId: string;
  organizationId: string | null;
  expiraEm: string;
};

type Organizacao = {
  organizationId: string;
  nome: string;
  slug: string;
  papel: Role;
  membershipId: string;
  ativa: boolean;
};

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; eu: Eu; organizacoes: Organizacao[] }
  | { situacao: 'erro'; mensagem: string };

export default function Painel() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [trocando, setTrocando] = useState<string | null>(null);

  const irParaLogin = useCallback(
    (motivo?: string) => {
      const consulta = motivo ? `?motivo=${motivo}` : '';
      router.replace(`/entrar${consulta}`);
    },
    [router],
  );

  // Recarrega quando muda: o botao de tentar de novo e a troca de organizacao
  // incrementam, e o efeito roda outra vez. Chamar uma funcao de busca direto
  // do efeito esconderia a dependencia e cairia na regra de renderizacao em
  // cascata do React.
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    // `ativo` evita gravar estado de uma resposta que chegou tarde, depois de
    // a pessoa ter saido da tela ou de uma segunda tentativa ter comecado.
    // Sem isso, a resposta antiga pode sobrescrever a nova.
    let ativo = true;

    void (async () => {
      try {
        const [eu, lista] = await Promise.all([
          chamarApi<Eu>('/autenticacao/eu'),
          chamarApi<{ organizacoes: Organizacao[] }>(
            '/autenticacao/organizacoes',
          ),
        ]);

        if (ativo) {
          setEstado({
            situacao: 'pronto',
            eu,
            organizacoes: lista.organizacoes,
          });
        }
      } catch (erro) {
        if (!ativo) {
          return;
        }

        // 401 nao e erro a mostrar: e sessao que nao vale mais. Pode ser
        // expiracao, logout em outra aba ou conta desativada — para quem esta
        // olhando a tela, os tres significam "entre de novo".
        if (erro instanceof ErroDaApi && erro.status === 401) {
          irParaLogin('sessao-expirada');
          return;
        }

        setEstado({
          situacao: 'erro',
          mensagem:
            erro instanceof ErroDaApi
              ? erro.message
              : 'Nao foi possivel carregar os seus dados.',
        });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [irParaLogin, tentativa]);

  async function sair() {
    try {
      await chamarApi('/autenticacao/sair', { metodo: 'POST' });
    } finally {
      // Sai da tela mesmo se a chamada falhar: a sessao pode ja ter sido
      // encerrada, e nesse caso insistir aqui so prenderia a pessoa.
      irParaLogin();
    }
  }

  async function trocarOrganizacao(organizationId: string) {
    setTrocando(organizationId);

    try {
      await chamarApi('/autenticacao/organizacao-ativa', {
        metodo: 'POST',
        corpo: { organizationId },
      });

      setTentativa((n) => n + 1);
    } catch {
      setEstado({
        situacao: 'erro',
        mensagem: 'Nao foi possivel trocar de organizacao.',
      });
    } finally {
      setTrocando(null);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
            Painel
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Voce esta dentro. As telas de imoveis e clientes ainda nao existem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AlternadorDeTema />
          <Button variant="outline" size="sm" onClick={sair}>
            Sair
          </Button>
        </div>
      </div>

      {estado.situacao === 'carregando' ? (
        // Esqueleto com a forma do conteudo, nao um girador no meio da tela:
        // assim o layout nao salta quando os dados chegam (§8 do mapa de telas).
        <div className="mt-8 grid gap-4" aria-busy="true" aria-live="polite">
          <div className="bg-muted h-28 animate-pulse rounded-xl" />
          <div className="bg-muted h-40 animate-pulse rounded-xl" />
          <span className="sr-only">Carregando os seus dados...</span>
        </div>
      ) : null}

      {estado.situacao === 'erro' ? (
        <div className="mt-8 grid gap-3">
          <Aviso tom="erro">{estado.mensagem}</Aviso>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEstado({ situacao: 'carregando' });
                setTentativa((n) => n + 1);
              }}
            >
              Tentar de novo
            </Button>
          </div>
        </div>
      ) : null}

      {estado.situacao === 'pronto' ? (
        <div className="mt-8 grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessao</CardTitle>
              <CardDescription>
                Aberta e valida ate{' '}
                {new Date(estado.eu.expiraEm).toLocaleString('pt-BR')}.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suas organizacoes</CardTitle>
              <CardDescription>
                A organizacao ativa fica guardada no servidor, na sessao — nao
                no navegador.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {estado.organizacoes.map((organizacao) => (
                <div
                  key={organizacao.organizationId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{organizacao.nome}</p>
                    <p className="text-muted-foreground text-xs">
                      /o/{organizacao.slug} ·{' '}
                      {ROTULOS_DE_PAPEL[organizacao.papel]}
                    </p>
                  </div>

                  {organizacao.ativa ? (
                    <Badge>Ativa</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={trocando !== null}
                      onClick={() =>
                        void trocarOrganizacao(organizacao.organizationId)
                      }
                    >
                      {trocando === organizacao.organizationId
                        ? 'Trocando...'
                        : 'Usar esta'}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
