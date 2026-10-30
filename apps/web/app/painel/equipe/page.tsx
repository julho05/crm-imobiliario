'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  convidarMembroSchema,
  papeisQuePodeConvidar,
  ROTULOS_DE_PAPEL,
  type Role,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Campo, CampoSelecao } from '@/components/campo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  carteiraVazia,
  descreverCarteira,
  type ConvitePendente,
  type MembroDetalhado,
} from '@/lib/equipe';
import {
  focarPrimeiroErro,
  validar,
  type ErrosDoFormulario,
} from '@/lib/formulario';
import { useSessao } from '@/lib/sessao-do-painel';
import { cn } from '@/lib/utils';

/**
 * `/painel/equipe` — membros, convites, troca de papel e remocao.
 *
 * ## A tela nao decide quem pode o que
 *
 * Os botoes "Alterar papel" e "Remover" aparecem pelo que a **API** responde
 * em cada membro (`podeAlterarPapel`, `podeRemover`), calculado por
 * `podeAgirSobreMembro`. Os papeis oferecidos — no convite e na troca — saem de
 * `papeisQuePodeConvidar()`, a mesma funcao que o servidor consulta. Nenhuma
 * regra do §4.4 esta escrita aqui; se estivesse, a primeira divergencia faria
 * a tela oferecer o que o servidor recusa.
 *
 * ## Remover pede o destino antes, com a carteira escrita
 *
 * Quem remove precisa ver o que a pessoa leva — "12 clientes, 3 visitas
 * pendentes" — e escolher quem assume, **antes** de confirmar. Descobrir
 * depois seria descobrir pelos clientes que ninguem ligou.
 *
 * ## O corretor ve nome e papel
 *
 * A API ja corta e-mail e carteira para quem nao administra. A tela so mostra
 * o que veio.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; membros: MembroDetalhado[] }
  | { situacao: 'erro'; mensagem: string };

export default function Equipe() {
  const { papel, organizacaoAtiva } = useSessao();
  const convidaveis = papeisQuePodeConvidar(papel);
  const podeConvidar = convidaveis.length > 0;

  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [convites, setConvites] = useState<ConvitePendente[] | null>(null);
  const [versao, setVersao] = useState(0);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const [lista, pendentes] = await Promise.all([
          chamarApi<{ membros: MembroDetalhado[] }>('/equipe/membros/detalhes'),
          // Convite pendente tem e-mail de quem ainda nem entrou: so busca
          // quem pode convidar.
          podeConvidar
            ? chamarApi<{ convites: ConvitePendente[] }>('/equipe/convites')
            : Promise.resolve(null),
        ]);

        if (!ativo) return;

        setEstado({ situacao: 'pronto', membros: lista.membros });
        setConvites(pendentes?.convites ?? null);
      } catch (erro) {
        if (!ativo) return;

        setEstado({
          situacao: 'erro',
          mensagem:
            erro instanceof ErroDaApi
              ? erro.message
              : 'Nao foi possivel carregar a equipe.',
        });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [organizacaoAtiva.organizationId, podeConvidar, versao]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-navy dark:text-foreground text-2xl font-semibold tracking-tight">
        Equipe
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {organizacaoAtiva.nome}
      </p>

      {podeConvidar ? (
        <FormularioDeConvite papeis={convidaveis} aoConvidar={recarregar} />
      ) : null}

      {convites && convites.length > 0 ? (
        <ConvitesPendentes
          convites={convites}
          papeisQueRevoga={convidaveis}
          aoRevogar={recarregar}
        />
      ) : null}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Membros</h2>

        {estado.situacao === 'carregando' ? (
          <div className="mt-3 grid gap-2" aria-busy="true">
            <div className="bg-muted h-20 animate-pulse rounded-lg" />
            <div className="bg-muted h-20 animate-pulse rounded-lg" />
            <span className="sr-only">Carregando a equipe...</span>
          </div>
        ) : null}

        {estado.situacao === 'erro' ? (
          <Aviso tom="erro" className="mt-3">
            {estado.mensagem}
          </Aviso>
        ) : null}

        {estado.situacao === 'pronto' ? (
          <ul className="mt-3 grid gap-2">
            {estado.membros.map((membro) => (
              <LinhaDeMembro
                key={membro.membershipId}
                membro={membro}
                equipe={estado.membros}
                papeisAtribuiveis={convidaveis}
                aoMudar={recarregar}
              />
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function opcoesDePapel(papeis: Role[]) {
  return papeis.map((p) => ({ valor: p, rotulo: ROTULOS_DE_PAPEL[p] }));
}

function FormularioDeConvite({
  papeis,
  aoConvidar,
}: {
  papeis: Role[];
  aoConvidar: () => void;
}) {
  const formulario = useRef<HTMLFormElement>(null);

  // Com um papel so (o gerente convida apenas corretor), ele ja vem marcado:
  // obrigar a escolher a unica opcao seria um passo sem decisao.
  const [email, setEmail] = useState('');
  const [papelEscolhido, setPapelEscolhido] = useState(
    papeis.length === 1 ? papeis[0] : '',
  );
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalha(null);
    setEnviado(null);

    const validacao = validar(convidarMembroSchema, {
      email,
      papel: papelEscolhido,
    });

    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroErro(formulario.current, validacao.erros);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      const convite = await chamarApi<{ email: string }>('/equipe/convites', {
        metodo: 'POST',
        corpo: validacao.dados,
      });

      setEnviado(convite.email);
      setEmail('');
      aoConvidar();
    } catch (erro) {
      if (erro instanceof ErroDaApi) {
        setErros(erro.porCampo);
        setFalha(erro.message);
      } else {
        setFalha('Nao foi possivel enviar o convite. Tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="bg-card mt-6 rounded-lg border p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Convidar</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        A pessoa recebe um link por e-mail, válido por sete dias.
      </p>

      {enviado ? (
        <Aviso tom="sucesso" className="mt-4">
          Convite enviado para {enviado}.
        </Aviso>
      ) : null}

      {falha ? (
        <Aviso tom="erro" className="mt-4">
          {falha}
        </Aviso>
      ) : null}

      <form
        ref={formulario}
        onSubmit={enviar}
        method="post"
        noValidate
        className="mt-4 grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-start"
      >
        <Campo
          nome="email"
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          disabled={enviando}
          onChange={(evento) => setEmail(evento.currentTarget.value)}
          erro={erros.email}
        />
        <CampoSelecao
          nome="papel"
          rotulo="Papel"
          opcoes={opcoesDePapel(papeis)}
          textoVazio={papeis.length === 1 ? undefined : 'Escolha'}
          value={papelEscolhido}
          disabled={enviando}
          onChange={(evento) => setPapelEscolhido(evento.currentTarget.value)}
          erro={erros.papel}
        />
        <div className="sm:pt-[1.375rem]">
          <Button
            type="submit"
            disabled={enviando}
            className="w-full sm:w-auto"
          >
            {enviando ? 'Enviando...' : 'Enviar convite'}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ConvitesPendentes({
  convites,
  papeisQueRevoga,
  aoRevogar,
}: {
  convites: ConvitePendente[];
  papeisQueRevoga: Role[];
  aoRevogar: () => void;
}) {
  const [revogando, setRevogando] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  async function revogar(id: string) {
    setRevogando(id);
    setFalha(null);

    try {
      await chamarApi(`/equipe/convites/${id}`, { metodo: 'DELETE' });
      aoRevogar();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel revogar o convite.',
      );
    } finally {
      setRevogando(null);
    }
  }

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">Convites pendentes</h2>

      {falha ? (
        <Aviso tom="erro" className="mt-3">
          {falha}
        </Aviso>
      ) : null}

      <ul className="mt-3 grid gap-2">
        {convites.map((convite) => (
          <li
            key={convite.id}
            className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{convite.email}</p>
              <p className="text-muted-foreground text-xs">
                {ROTULOS_DE_PAPEL[convite.papel]} ·{' '}
                {convite.expirado
                  ? 'Expirado — revogue e convide de novo'
                  : `Vale até ${formatarData(convite.expiresAt)}`}
              </p>
            </div>

            {/* O gerente nao revoga convite de gerente: a API recusaria. */}
            {papeisQueRevoga.includes(convite.papel) ? (
              <Button
                variant="outline"
                size="sm"
                disabled={revogando !== null}
                onClick={() => void revogar(convite.id)}
              >
                {revogando === convite.id ? 'Revogando...' : 'Revogar'}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Modo = 'nada' | 'papel' | 'remover';

function LinhaDeMembro({
  membro,
  equipe,
  papeisAtribuiveis,
  aoMudar,
}: {
  membro: MembroDetalhado;
  equipe: MembroDetalhado[];
  papeisAtribuiveis: Role[];
  aoMudar: () => void;
}) {
  const [modo, setModo] = useState<Modo>('nada');
  const removido = membro.situacao === 'SUSPENDED';

  return (
    <li
      className={cn(
        'bg-card rounded-lg border px-4 py-3',
        removido && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{membro.nome}</span>
            {membro.euMesmo ? (
              <span className="text-muted-foreground text-xs font-normal">
                (você)
              </span>
            ) : null}
            <Badge variant="secondary">{ROTULOS_DE_PAPEL[membro.papel]}</Badge>
            {removido ? <Badge variant="outline">Removido</Badge> : null}
          </p>

          {membro.email ? (
            <p className="text-muted-foreground truncate text-sm">
              {membro.email}
            </p>
          ) : null}

          {membro.carteira && !removido ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {carteiraVazia(membro.carteira)
                ? 'Nada atribuído'
                : descreverCarteira(membro.carteira).join(' · ')}
              {membro.entrouEm
                ? ` · Entrou em ${formatarData(membro.entrouEm)}`
                : null}
            </p>
          ) : null}
        </div>

        {modo === 'nada' && (membro.podeAlterarPapel || membro.podeRemover) ? (
          <div className="flex flex-wrap gap-2">
            {membro.podeAlterarPapel ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModo('papel')}
              >
                Alterar papel
              </Button>
            ) : null}
            {membro.podeRemover ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModo('remover')}
              >
                Remover
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {modo === 'papel' ? (
        <TrocaDePapel
          membro={membro}
          papeis={papeisAtribuiveis}
          aoCancelar={() => setModo('nada')}
          aoConcluir={() => {
            setModo('nada');
            aoMudar();
          }}
        />
      ) : null}

      {modo === 'remover' ? (
        <Remocao
          membro={membro}
          destinos={equipe.filter(
            (m) =>
              m.situacao === 'ACTIVE' && m.membershipId !== membro.membershipId,
          )}
          aoCancelar={() => setModo('nada')}
          aoConcluir={() => {
            setModo('nada');
            aoMudar();
          }}
        />
      ) : null}
    </li>
  );
}

function TrocaDePapel({
  membro,
  papeis,
  aoCancelar,
  aoConcluir,
}: {
  membro: MembroDetalhado;
  papeis: Role[];
  aoCancelar: () => void;
  aoConcluir: () => void;
}) {
  const [papel, setPapel] = useState<string>(
    papeis.includes(membro.papel) ? membro.papel : '',
  );
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (papel === membro.papel) {
      aoCancelar();
      return;
    }

    setEnviando(true);
    setFalha(null);

    try {
      await chamarApi(`/equipe/membros/${membro.membershipId}/papel`, {
        metodo: 'PATCH',
        corpo: { papel },
      });
      aoConcluir();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel alterar o papel.',
      );
      setEnviando(false);
    }
  }

  const nome = `papel-${membro.membershipId}`;

  return (
    <form
      onSubmit={salvar}
      method="post"
      className="mt-4 grid gap-3 border-t pt-4"
    >
      {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

      <CampoSelecao
        nome={nome}
        rotulo={`Novo papel de ${membro.nome}`}
        opcoes={opcoesDePapel(papeis)}
        textoVazio={papeis.includes(membro.papel) ? undefined : 'Escolha'}
        value={papel}
        disabled={enviando}
        onChange={(evento) => setPapel(evento.currentTarget.value)}
        ajuda="Vale a partir da próxima ação da pessoa no sistema."
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={enviando || papel === ''}>
          {enviando ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={enviando}
          onClick={aoCancelar}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Remocao({
  membro,
  destinos,
  aoCancelar,
  aoConcluir,
}: {
  membro: MembroDetalhado;
  destinos: MembroDetalhado[];
  aoCancelar: () => void;
  aoConcluir: () => void;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const [destino, setDestino] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);

  // Sem carteira vinda da API, nao ha o que perguntar. A API confere de novo,
  // e recusa com erro no campo se a pessoa tiver algo atribuido.
  const itens = membro.carteira ? descreverCarteira(membro.carteira) : [];
  const precisaDeDestino = itens.length > 0;
  const nome = `destino-${membro.membershipId}`;

  async function confirmar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalha(null);

    if (precisaDeDestino && destino === '') {
      const faltando = { [nome]: 'Escolha quem assume.' };
      setErros(faltando);
      focarPrimeiroErro(formulario.current, faltando);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      await chamarApi(`/equipe/membros/${membro.membershipId}/remover`, {
        metodo: 'POST',
        corpo: destino === '' ? {} : { destinoMembershipId: destino },
      });
      aoConcluir();
    } catch (erro) {
      if (erro instanceof ErroDaApi) {
        const doCampo = erro.porCampo.destinoMembershipId;
        if (doCampo) setErros({ [nome]: doCampo });
        setFalha(
          erro.status === 404
            ? 'Esse membro não está mais disponível. Recarregue a página.'
            : erro.message,
        );
      } else {
        setFalha('Nao foi possivel remover. Tente de novo.');
      }
      setEnviando(false);
    }
  }

  return (
    <form
      ref={formulario}
      onSubmit={confirmar}
      method="post"
      noValidate
      className="mt-4 grid gap-3 border-t pt-4"
    >
      <Aviso>
        <p>
          <strong>{membro.nome}</strong> perde o acesso a esta organização na
          próxima ação no sistema. Nada é apagado: o histórico continua
          mostrando o que a pessoa fez.
        </p>
        {precisaDeDestino ? (
          <p className="mt-2">
            Passam para quem você escolher: {itens.join(', ')}.
          </p>
        ) : null}
      </Aviso>

      {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

      {precisaDeDestino ? (
        destinos.length > 0 ? (
          <CampoSelecao
            nome={nome}
            rotulo="Quem assume"
            opcoes={destinos.map((m) => ({
              valor: m.membershipId,
              rotulo: `${m.nome} — ${ROTULOS_DE_PAPEL[m.papel]}`,
            }))}
            textoVazio="Escolha"
            value={destino}
            disabled={enviando}
            onChange={(evento) => setDestino(evento.currentTarget.value)}
            erro={erros[nome]}
          />
        ) : (
          <Aviso tom="erro">
            Não há outro membro ativo para assumir. Convide alguém antes.
          </Aviso>
        )
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={enviando || (precisaDeDestino && destinos.length === 0)}
        >
          {enviando ? 'Removendo...' : 'Remover da equipe'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={enviando}
          onClick={aoCancelar}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
