'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { AlternadorDeTema } from '@/components/alternador-de-tema';
import { Aviso } from '@/components/aviso';
import { Navegacao } from '@/components/painel/navegacao';
import { SeletorDeOrganizacao } from '@/components/painel/seletor-de-organizacao';
import { Button } from '@/components/ui/button';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  ProvedorDaSessao,
  type Eu,
  type Organizacao,
} from '@/lib/sessao-do-painel';
import { cn } from '@/lib/utils';

const nomeDoApp = process.env.NEXT_PUBLIC_APP_NAME ?? 'CRM';

/**
 * Moldura de todas as telas sob `/painel`.
 *
 * ## Por que a sessao e carregada aqui, e nao em cada tela
 *
 * Porque todas precisam do mesmo: quem sou, em que organizacao estou, com que
 * papel. Carregar aqui resolve quatro coisas de uma vez:
 *
 * 1. **Uma chamada por visita**, nao uma por tela. Navegar entre painel e
 *    imoveis nao refaz o que ja se sabe.
 * 2. **A regra do 401 num lugar so.** Sessao expirada leva para `/entrar` de
 *    qualquer tela do painel. Espalhada, bastaria esquecer uma para a pessoa
 *    ver tela vazia em vez de voltar ao login.
 * 3. **A navegacao nao pisca** a cada troca de rota, porque o layout nao
 *    remonta.
 * 4. **Nenhuma tela renderiza sem sessao.** Quem usa `useSessao()` recebe dado
 *    pronto, sem `if (!sessao)` repetido em cada arquivo.
 *
 * ## Por que nao e um componente de servidor
 *
 * O cookie de sessao e `httpOnly` e `SameSite=Lax`, e o `chamarApi` fala com a
 * propria origem para que ele va e volte sozinho — o Next repassa para a API.
 * Buscar no servidor exigiria reencaminhar o cookie a mao em cada chamada, e um
 * esquecimento ali vira requisicao sem sessao: a tela nao quebra, so responde
 * "nao encontrado", que e o erro mais dificil de diagnosticar. Fica para quando
 * houver motivo de desempenho medido.
 *
 * ## Isto nao protege nada
 *
 * Nenhuma linha aqui autoriza. A autorizacao acontece no servidor, por
 * requisicao, pelos sete passos de `docs/permissions.md` §6. Este layout evita
 * mostrar tela que vai dar erro — e nada mais.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; eu: Eu; organizacoes: Organizacao[] }
  | { situacao: 'sem-organizacao' }
  | { situacao: 'erro'; mensagem: string };

export default function LayoutDoPainel({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [menuAberto, setMenuAberto] = useState(false);

  const irParaLogin = useCallback(
    (motivo?: string) => {
      const consulta = motivo ? `?motivo=${motivo}` : '';
      router.replace(`/entrar${consulta}`);
    },
    [router],
  );

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  useEffect(() => {
    // `ativo` evita gravar estado de uma resposta que chegou tarde, depois de
    // a pessoa ter saido da tela ou de uma segunda tentativa ter comecado.
    let ativo = true;

    void (async () => {
      try {
        const [eu, lista] = await Promise.all([
          chamarApi<Eu>('/autenticacao/eu'),
          chamarApi<{ organizacoes: Organizacao[] }>(
            '/autenticacao/organizacoes',
          ),
        ]);

        if (!ativo) {
          return;
        }

        // Sessao valida sem organizacao ativa e estado real, nao erro: acontece
        // a quem teve o unico vinculo suspenso. A API responderia 403 em toda
        // rota de dado, e uma tela de erro generico nao diria o porque.
        const ativaExiste = lista.organizacoes.some((o) => o.ativa);

        setEstado(
          ativaExiste
            ? { situacao: 'pronto', eu, organizacoes: lista.organizacoes }
            : { situacao: 'sem-organizacao' },
        );
      } catch (erro) {
        if (!ativo) {
          return;
        }

        // 401 nao e erro a mostrar: e sessao que nao vale mais. Expiracao,
        // logout em outra aba ou conta desativada significam o mesmo para quem
        // esta olhando — entre de novo.
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

  const sair = useCallback(async () => {
    try {
      await chamarApi('/autenticacao/sair', { metodo: 'POST' });
    } finally {
      // Sai da tela mesmo se a chamada falhar: a sessao pode ja ter sido
      // encerrada, e insistir aqui so prenderia a pessoa.
      irParaLogin();
    }
  }, [irParaLogin]);

  const trocarOrganizacao = useCallback(
    async (organizationId: string) => {
      await chamarApi('/autenticacao/organizacao-ativa', {
        metodo: 'POST',
        corpo: { organizationId },
      });

      // Recarrega em vez de ajustar o estado local: a troca muda o papel, e com
      // ele a navegacao e o que cada tela pode mostrar. Confiar no estado local
      // deixaria a tela um passo atras do servidor.
      recarregar();
      router.refresh();
    },
    [recarregar, router],
  );

  if (estado.situacao === 'carregando') {
    return (
      <MolduraSimples>
        <EsqueletoDoPainel />
      </MolduraSimples>
    );
  }

  if (estado.situacao === 'erro') {
    return (
      <MolduraSimples>
        <div className="grid gap-3">
          <Aviso tom="erro">{estado.mensagem}</Aviso>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEstado({ situacao: 'carregando' });
                recarregar();
              }}
            >
              Tentar de novo
            </Button>
          </div>
        </div>
      </MolduraSimples>
    );
  }

  if (estado.situacao === 'sem-organizacao') {
    return (
      <MolduraSimples>
        <div className="grid gap-3">
          <Aviso tom="informacao">
            Sua conta nao esta ativa em nenhuma organizacao. Se isso nao era
            esperado, fale com quem administra a sua equipe.
          </Aviso>
          <div>
            <Button variant="outline" size="sm" onClick={() => void sair()}>
              Sair
            </Button>
          </div>
        </div>
      </MolduraSimples>
    );
  }

  // `!` justificado: `situacao: 'pronto'` so e gravado quando alguma organizacao
  // tem `ativa: true`, verificado logo acima no efeito.
  const organizacaoAtiva = estado.organizacoes.find((o) => o.ativa)!;

  return (
    <ProvedorDaSessao
      value={{
        eu: estado.eu,
        organizacoes: estado.organizacoes,
        organizacaoAtiva,
        papel: organizacaoAtiva.papel,
        recarregar,
        trocarOrganizacao,
        sair,
      }}
    >
      <div className="flex min-h-svh flex-col lg:flex-row">
        {/* Cabecalho de celular: a barra lateral vira menu sob demanda. */}
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuAberto}
            onClick={() => setMenuAberto((v) => !v)}
          >
            {menuAberto ? (
              <X aria-hidden="true" />
            ) : (
              <Menu aria-hidden="true" />
            )}
          </Button>

          <Link
            href="/painel"
            className="text-navy font-semibold tracking-tight dark:text-foreground"
          >
            {nomeDoApp}
          </Link>

          <AlternadorDeTema />
        </header>

        <aside
          // `hidden` no celular quando fechado, sempre visivel no desktop.
          className={cn(
            'bg-sidebar text-sidebar-foreground border-sidebar-border flex-col gap-4 border-b p-3 lg:flex lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0',
            menuAberto ? 'flex' : 'hidden',
          )}
        >
          <div className="hidden items-center justify-between gap-2 px-3 pt-2 lg:flex">
            <Link href="/painel" className="font-semibold tracking-tight">
              {nomeDoApp}
            </Link>
            <AlternadorDeTema />
          </div>

          <SeletorDeOrganizacao />

          <Navegacao
            papel={organizacaoAtiva.papel}
            aoNavegar={() => setMenuAberto(false)}
          />

          {/* `mt-auto` empurra para o rodape da barra no desktop. */}
          <div className="lg:mt-auto">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => void sair()}
            >
              <LogOut aria-hidden="true" className="size-4" />
              Sair
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </ProvedorDaSessao>
  );
}

/** Moldura dos estados em que ainda nao existe sessao para oferecer. */
function MolduraSimples({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <span className="text-navy text-lg font-semibold tracking-tight dark:text-foreground">
          {nomeDoApp}
        </span>
        <AlternadorDeTema />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}

/**
 * Esqueleto com a forma do conteudo, e nao um girador no meio da tela: assim o
 * layout nao salta quando os dados chegam (§8 do mapa de telas).
 */
function EsqueletoDoPainel() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <div className="bg-muted h-10 w-48 animate-pulse rounded-md" />
      <div className="bg-muted h-28 animate-pulse rounded-xl" />
      <div className="bg-muted h-40 animate-pulse rounded-xl" />
      <span className="sr-only">Carregando o painel...</span>
    </div>
  );
}
