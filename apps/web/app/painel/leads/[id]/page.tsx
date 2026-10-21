'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Phone, ShieldCheck, Trash2 } from 'lucide-react';
import {
  atualizarLeadSchema,
  podeFazer,
  ROTULOS_DE_ORIGEM_DE_LEAD,
  ROTULOS_DE_PAPEL,
  ROTULOS_DE_STATUS_DE_LEAD,
  type LeadStatus,
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
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  focarPrimeiroErro,
  validar,
  type ErrosDoFormulario,
} from '@/lib/formulario';
import {
  formatarDataHora,
  formatarTelefone,
  ORDEM_DAS_SITUACOES,
  type Lead,
} from '@/lib/leads';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/leads/[id]` — o atendimento de um cliente.
 *
 * ## Por que tudo numa tela
 *
 * Porque e assim que o trabalho acontece: a pessoa abre o contato para ligar,
 * e no mesmo instante anota o que foi dito, move a situacao e, se for o caso,
 * passa para um colega. Separar em abas obrigaria a navegar entre passos de uma
 * unica conversa telefonica.
 *
 * No servidor eles continuam separados, e e isso que importa: `situacao` e
 * `responsavel` sao `POST` proprios, com eventos de auditoria distintos de
 * `lead.editado`.
 *
 * ## O 404 aqui tem duas causas, e a tela nao as distingue
 *
 * Lead de outra organizacao e lead de um colega respondem o **mesmo** 404 — de
 * proposito (`docs/permissions.md` §4.2). A tela nao tenta adivinhar qual foi,
 * porque nao da e porque nao deve: a mensagem que ela mostra serve para os
 * dois.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; lead: Lead }
  | { situacao: 'nao-encontrado' }
  | { situacao: 'erro'; mensagem: string };

type Membro = {
  membershipId: string;
  nome: string;
  papel: keyof typeof ROTULOS_DE_PAPEL;
  euMesmo: boolean;
};

export default function DetalheDoLead() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { papel, organizacaoAtiva } = useSessao();

  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const lead = await chamarApi<Lead>(`/leads/${id}`);

        if (ativo) {
          setEstado({ situacao: 'pronto', lead });
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
              : 'Nao foi possivel carregar o cliente.',
        });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [id, tentativa]);

  const trocar = useCallback(
    (lead: Lead) => setEstado({ situacao: 'pronto', lead }),
    [],
  );

  if (estado.situacao === 'carregando') {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="grid gap-4" aria-busy="true" aria-live="polite">
          <div className="bg-muted h-8 w-56 animate-pulse rounded-md" />
          <div className="bg-muted h-24 animate-pulse rounded-xl" />
          <div className="bg-muted h-48 animate-pulse rounded-xl" />
          <span className="sr-only">Carregando o cliente...</span>
        </div>
      </div>
    );
  }

  if (estado.situacao === 'nao-encontrado') {
    return (
      <div className="mx-auto grid max-w-2xl gap-4">
        <Aviso tom="erro">
          Cliente nao encontrado. Ele pode ter sido excluido, estar sob
          responsabilidade de outra pessoa, ou o endereco esta errado.
        </Aviso>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/painel/leads">Voltar para a lista</Link>
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

  const { lead } = estado;

  // `lead:editar` e OWN para o corretor, e o lead que ele nao alcanca nem
  // chega aqui — responderia 404. Entao basta conferir o escopo.
  const escopoDeEdicao = podeFazer(papel, 'lead:editar');
  const podeEditar =
    escopoDeEdicao === 'ORG' ||
    (escopoDeEdicao === 'OWN' &&
      lead.responsavel?.membershipId === organizacaoAtiva.membershipId);

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/painel/leads">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Clientes
        </Link>
      </Button>

      <div className="mt-2">
        <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
          {lead.nomeCompleto}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={lead.status === 'NEW' ? 'default' : 'secondary'}>
            {ROTULOS_DE_STATUS_DE_LEAD[lead.status]}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {ROTULOS_DE_ORIGEM_DE_LEAD[lead.origem]} ·{' '}
            {formatarDataHora(lead.criadoEm)}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        <Contato lead={lead} />

        {lead.consentimento ? (
          <Consentimento consentimento={lead.consentimento} />
        ) : null}

        <Situacao lead={lead} pode={podeEditar} aoMudar={trocar} />

        <Responsavel
          lead={lead}
          pode={podeFazer(papel, 'lead:atribuir') !== false}
          aoMudar={trocar}
        />

        {podeEditar ? (
          <Dados lead={lead} aoMudar={trocar} />
        ) : (
          <Aviso tom="informacao">
            Este cliente esta sob responsabilidade de{' '}
            {lead.responsavel?.nome ?? 'outra pessoa'}. Voce pode ve-lo, mas nao
            edita-lo.
          </Aviso>
        )}

        {podeFazer(papel, 'lead:excluir') !== false ? (
          <Exclusao
            lead={lead}
            aoExcluir={() => router.push('/painel/leads')}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Telefone e e-mail prontos para discar e escrever. */
function Contato({ lead }: { lead: Lead }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contato</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {lead.telefone ? (
          // `tel:` com os digitos crus: quem abre no celular disca direto, e e
          // onde o corretor usa isto.
          <a
            href={`tel:+55${lead.telefone}`}
            className="hover:text-foreground focus-visible:ring-ring flex w-fit items-center gap-2 text-sm underline focus-visible:ring-2 focus-visible:outline-none"
          >
            <Phone aria-hidden="true" className="size-4" />
            {formatarTelefone(lead.telefone)}
          </a>
        ) : null}

        {lead.email ? (
          <a
            href={`mailto:${lead.email}`}
            className="hover:text-foreground focus-visible:ring-ring flex w-fit items-center gap-2 text-sm underline focus-visible:ring-2 focus-visible:outline-none"
          >
            <Mail aria-hidden="true" className="size-4" />
            {lead.email}
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Consentimento, quando existe.
 *
 * So aparece para quem chegou pela vitrine: e prova montada pelo servidor no
 * envio do formulario. Mostra-la importa porque e **ela** que autoriza o
 * contato — quem atende precisa saber se pode ligar, e com base em qual versao
 * do aviso.
 */
function Consentimento({
  consentimento,
}: {
  consentimento: NonNullable<Lead['consentimento']>;
}) {
  return (
    <div className="border-success/40 bg-success/5 flex items-start gap-2 rounded-xl border p-4">
      <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="text-sm">
        <p className="font-medium">Consentimento registrado</p>
        <p className="text-muted-foreground text-xs">
          Em {formatarDataHora(consentimento.dadoEm)}
          {consentimento.versaoDoAviso
            ? `, aviso de privacidade versao ${consentimento.versaoDoAviso}`
            : ''}
          .
        </p>
      </div>
    </div>
  );
}

/**
 * Situacao do atendimento.
 *
 * Botoes, e nao um seletor com "salvar": cada mudanca e um acontecimento, com
 * evento de auditoria proprio. E a partir deles que sai o relatorio de
 * conversao.
 */
function Situacao({
  lead,
  pode,
  aoMudar,
}: {
  lead: Lead;
  pode: boolean;
  aoMudar: (lead: Lead) => void;
}) {
  const [agindo, setAgindo] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  async function mudar(status: LeadStatus) {
    setAgindo(status);
    setFalha(null);

    try {
      aoMudar(
        await chamarApi<Lead>(`/leads/${lead.id}/situacao`, {
          metodo: 'POST',
          corpo: { status },
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Situacao</CardTitle>
        <CardDescription>
          Hoje: <strong>{ROTULOS_DE_STATUS_DE_LEAD[lead.status]}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {pode ? (
          <div className="flex flex-wrap gap-2">
            {ORDEM_DAS_SITUACOES.filter((s) => s !== lead.status).map(
              (status) => (
                <Button
                  key={status}
                  variant="outline"
                  size="sm"
                  disabled={agindo !== null}
                  onClick={() => void mudar(status)}
                >
                  {agindo === status
                    ? 'Aguarde...'
                    : ROTULOS_DE_STATUS_DE_LEAD[status]}
                </Button>
              ),
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Seu papel nao permite mudar a situacao deste cliente.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Responsavel pelo atendimento.
 *
 * Carrega a equipe de `GET /equipe/membros`, que nasceu para esta tela. A opcao
 * vazia devolve o lead a **fila de nao atribuidos** — a fila nao e um estado
 * separado, e a ausencia de responsavel.
 */
function Responsavel({
  lead,
  pode,
  aoMudar,
}: {
  lead: Lead;
  pode: boolean;
  aoMudar: (lead: Lead) => void;
}) {
  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    if (!pode) {
      return;
    }

    let ativo = true;

    void (async () => {
      try {
        const { membros: lista } = await chamarApi<{ membros: Membro[] }>(
          '/equipe/membros',
        );

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

  async function atribuir(valor: string) {
    setAgindo(true);
    setFalha(null);

    try {
      aoMudar(
        await chamarApi<Lead>(`/leads/${lead.id}/responsavel`, {
          metodo: 'POST',
          corpo: { membershipId: valor === '' ? null : valor },
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
        <CardTitle className="text-base">Responsavel</CardTitle>
        <CardDescription>
          {lead.responsavel
            ? lead.responsavel.nome
            : 'Ninguem — este cliente esta na fila a distribuir.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {pode ? (
          <>
            <Select
              aria-label="Responsavel"
              disabled={agindo || membros === null}
              value={lead.responsavel?.membershipId ?? ''}
              onChange={(e) => void atribuir(e.target.value)}
            >
              <option value="">Deixar na fila a distribuir</option>
              {(membros ?? []).map((membro) => (
                <option key={membro.membershipId} value={membro.membershipId}>
                  {membro.nome}
                  {membro.euMesmo ? ' (voce)' : ''} —{' '}
                  {ROTULOS_DE_PAPEL[membro.papel]}
                </option>
              ))}
            </Select>

            {agindo ? (
              <p className="text-muted-foreground text-xs">Salvando...</p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Distribuir clientes e atribuicao de quem coordena a equipe.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Nome, contato e anotacoes. */
function Dados({
  lead,
  aoMudar,
}: {
  lead: Lead;
  aoMudar: (lead: Lead) => void;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const [valores, setValores] = useState({
    nomeCompleto: lead.nomeCompleto,
    telefone: lead.telefone ?? '',
    email: lead.email ?? '',
    observacoes: lead.observacoes ?? '',
  });
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  function mudar(campo: keyof typeof valores, valor: string) {
    setValores((atuais) => ({ ...atuais, [campo]: valor }));
    setSalvo(false);

    if (erros[campo]) {
      setErros(({ [campo]: _, ...resto }) => resto);
    }
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setFalha(null);

    // Vazio significa "apague" na edicao, e e `null` que a API entende assim.
    const corpo = {
      nomeCompleto: valores.nomeCompleto.trim(),
      telefone: valores.telefone.trim() || null,
      email: valores.email.trim() || null,
      observacoes: valores.observacoes.trim() || null,
    };

    const resultado = validar(atualizarLeadSchema, corpo);

    if (!resultado.ok) {
      setErros(resultado.erros);
      focarPrimeiroErro(formulario.current, resultado.erros);
      return;
    }

    setEnviando(true);

    try {
      aoMudar(
        await chamarApi<Lead>(`/leads/${lead.id}`, {
          metodo: 'PATCH',
          corpo,
        }),
      );
      setSalvo(true);
    } catch (erro) {
      if (erro instanceof ErroDaApi) {
        const porCampo = erro.porCampo;

        if (Object.keys(porCampo).length > 0) {
          setErros(porCampo);
          focarPrimeiroErro(formulario.current, porCampo);
        } else {
          setFalha(erro.message);
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
        <CardTitle className="text-base">Dados e anotacoes</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          ref={formulario}
          onSubmit={enviar}
          noValidate
          className="grid gap-5"
        >
          {falha ? <Aviso tom="erro">{falha}</Aviso> : null}
          {salvo ? <Aviso tom="sucesso">Alteracoes salvas.</Aviso> : null}

          <Campo
            nome="nomeCompleto"
            rotulo="Nome completo"
            value={valores.nomeCompleto}
            onChange={(e) => mudar('nomeCompleto', e.target.value)}
            erro={erros.nomeCompleto}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Campo
              nome="telefone"
              rotulo="Telefone"
              inputMode="tel"
              value={valores.telefone}
              onChange={(e) => mudar('telefone', e.target.value)}
              erro={erros.telefone}
            />
            <Campo
              nome="email"
              rotulo="E-mail"
              type="email"
              value={valores.email}
              onChange={(e) => mudar('email', e.target.value)}
              erro={erros.email}
            />
          </div>

          <CampoTexto
            nome="observacoes"
            rotulo="Anotacoes"
            value={valores.observacoes}
            onChange={(e) => mudar('observacoes', e.target.value)}
            erro={erros.observacoes}
            rows={6}
            ajuda="Uso interno. Nunca aparece no catalogo publico."
          />

          <div>
            <Button type="submit" size="sm" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Salvar alteracoes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Exclusao — pedido de LGPD, nao limpeza de rotina.
 *
 * O texto diz isso porque a matriz diz isso: `lead:excluir` e `false` para
 * `MANAGER` e `AGENT` exatamente para que a exclusao nao seja um botao de
 * arrumar a lista.
 */
function Exclusao({ lead, aoExcluir }: { lead: Lead; aoExcluir: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  async function excluir() {
    setExcluindo(true);
    setFalha(null);

    try {
      await chamarApi(`/leads/${lead.id}`, { metodo: 'DELETE' });
      aoExcluir();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel excluir o cliente.',
      );
      setExcluindo(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base">Excluir cliente</CardTitle>
        <CardDescription>
          Para atender pedido de exclusao de dados. O cliente sai das listas, e
          o historico de negociacoes ligado a ele e preservado.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        {confirmando ? (
          <div className="grid gap-3">
            <p className="text-sm">
              Excluir <strong>{lead.nomeCompleto}</strong>?
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
