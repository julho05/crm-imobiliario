'use client';

import { createContext, useContext } from 'react';
import type { Role } from '@app/shared';

/**
 * A sessao, como as telas do painel a consomem.
 *
 * ## Por que contexto, e nao cada tela buscando o que precisa
 *
 * Porque todas precisam do mesmo: quem sou, em que organizacao estou e com que
 * papel. Sem contexto, cada tela faria duas chamadas iguais no carregamento, a
 * navegacao piscaria a cada troca de rota, e a regra de "401 leva para
 * `/entrar`" estaria escrita em oito lugares — bastando esquecer um para a
 * pessoa ver uma tela vazia em vez de voltar ao login.
 *
 * ## O papel daqui serve para montar a tela, nunca para autorizar
 *
 * [pages-and-navigation.md](../../../docs/pages-and-navigation.md) §5 e direto:
 * **esconder item de menu nao e seguranca**. O papel que chega aqui veio do
 * servidor, mas chegou ao navegador, e no navegador tudo e editavel. Ele existe
 * para nao oferecer a pessoa um botao que vai dar erro — cortesia visual. Cada
 * requisicao e autorizada de novo no servidor, pelos sete passos de
 * `docs/permissions.md` §6.
 */

export type Eu = {
  userId: string;
  organizationId: string | null;
  expiraEm: string;
};

export type Organizacao = {
  organizationId: string;
  nome: string;
  slug: string;
  papel: Role;
  membershipId: string;
  ativa: boolean;
};

export type SessaoDoPainel = {
  eu: Eu;
  organizacoes: Organizacao[];
  /** A organizacao ativa. */
  organizacaoAtiva: Organizacao;
  /** Papel na organizacao ativa. Atalho para `organizacaoAtiva.papel`. */
  papel: Role;
  /** Recarrega sessao e organizacoes do servidor. */
  recarregar: () => void;
  /** Troca a organizacao ativa e recarrega. */
  trocarOrganizacao: (organizationId: string) => Promise<void>;
  /** Encerra a sessao no servidor e volta para `/entrar`. */
  sair: () => Promise<void>;
};

const Contexto = createContext<SessaoDoPainel | null>(null);

export const ProvedorDaSessao = Contexto.Provider;

/**
 * A sessao do painel.
 *
 * Lanca quando usada fora do layout do painel, e isso e proposital: devolver
 * `null` faria cada tela escrever a mesma verificacao defensiva, e a que
 * esquecesse quebraria com "cannot read property of null" — erro que nao diz
 * qual e a causa. Assim a mensagem aponta direto para o problema.
 */
export function useSessao(): SessaoDoPainel {
  const sessao = useContext(Contexto);

  if (!sessao) {
    throw new Error(
      'useSessao() precisa estar dentro do layout de /painel, que e quem ' +
        'carrega a sessao e a oferece por contexto.',
    );
  }

  return sessao;
}
