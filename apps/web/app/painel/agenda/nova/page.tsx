'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { criarVisitaSchema, podeFazer, ROTULOS_DE_PAPEL } from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Campo, CampoSelecao, CampoTexto } from '@/components/campo';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  isoDeCampoLocal,
  type MembroDaEquipe,
  type Visita,
} from '@/lib/agenda';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  focarPrimeiroErro,
  validar,
  type ErrosDoFormulario,
} from '@/lib/formulario';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/agenda/nova` — agendar uma visita.
 *
 * ## Por que esta tela existe, e a negociação não tem equivalente
 *
 * A negociação nasce na ficha do cliente porque ela é **sobre um cliente**, e
 * escolher o cliente numa lista exigiria recriar metade da tela de clientes
 * dentro de um seletor. A visita é diferente: ela é sobre um **imóvel**, que é
 * obrigatório, e `imovel:ver` tem escopo `ORG` para os quatro papéis — a lista
 * de imóveis é a mesma para todo mundo e cabe num seletor sem recorte nenhum.
 *
 * O cliente aqui é opcional, e com razão: existe a visita do interessado que
 * apareceu na porta do prédio e ainda não está cadastrado.
 *
 * Quem chega da ficha de um cliente ou de um imóvel traz o vínculo na URL
 * (`?cliente=` ou `?imovel=`), e o campo já vem preenchido.
 *
 * ## O fim se preenche sozinho, e dá para mudar
 *
 * Marcada a hora de início, o fim vira uma hora depois — o tempo de uma visita
 * comum. Não é regra: é o palpite que evita que a pessoa digite a mesma data
 * duas vezes. Quem tem visita de duas horas corrige o campo.
 */

type Imovel = { id: string; codigo: string; titulo: string };
type Cliente = { id: string; nomeCompleto: string };

/** Uma hora, em milissegundos: a duração sugerida para a visita. */
const UMA_HORA = 60 * 60 * 1000;

export default function NovaVisita() {
  const router = useRouter();
  const parametros = useSearchParams();
  const { papel, organizacaoAtiva } = useSessao();

  const formulario = useRef<HTMLFormElement>(null);

  const podeAtribuir = podeFazer(papel, 'negociacao:atribuir') !== false;

  const [imoveis, setImoveis] = useState<Imovel[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [membros, setMembros] = useState<MembroDaEquipe[]>([]);

  const [imovelId, setImovelId] = useState(parametros.get('imovel') ?? '');
  const [clienteId, setClienteId] = useState(parametros.get('cliente') ?? '');
  const [responsavelId, setResponsavelId] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      // As três listas em paralelo, e cada falha isolada: sem a equipe o
      // formulário continua servindo para marcar a própria visita, e sem os
      // clientes continua servindo para a visita sem cliente cadastrado.
      // Travar tudo porque uma lista auxiliar falhou seria pior.
      const [listaDeImoveis, listaDeClientes, listaDeMembros] =
        await Promise.allSettled([
          chamarApi<{ imoveis: Imovel[] }>('/imoveis?porPagina=100'),
          chamarApi<{ leads: Cliente[] }>('/leads?porPagina=100'),
          podeAtribuir
            ? chamarApi<{ membros: MembroDaEquipe[] }>('/equipe/membros')
            : Promise.resolve({ membros: [] }),
        ]);

      if (!ativo) {
        return;
      }

      setImoveis(
        listaDeImoveis.status === 'fulfilled'
          ? listaDeImoveis.value.imoveis
          : [],
      );
      setClientes(
        listaDeClientes.status === 'fulfilled'
          ? listaDeClientes.value.leads
          : [],
      );
      setMembros(
        listaDeMembros.status === 'fulfilled'
          ? listaDeMembros.value.membros
          : [],
      );
    })();

    return () => {
      ativo = false;
    };
  }, [podeAtribuir]);

  /**
   * Sugere o fim uma hora depois do início — **só** quando o campo está vazio.
   *
   * Sobrescrever o que a pessoa digitou a cada ajuste do início transformaria
   * a sugestão em teimosia.
   */
  function mudarInicio(valor: string) {
    setInicio(valor);
    setErros({});

    if (fim !== '' || valor === '') {
      return;
    }

    const instante = new Date(valor);

    if (!Number.isNaN(instante.getTime())) {
      const depois = new Date(instante.getTime() + UMA_HORA);
      const dois = (n: number) => String(n).padStart(2, '0');

      setFim(
        `${depois.getFullYear()}-${dois(depois.getMonth() + 1)}-${dois(
          depois.getDate(),
        )}T${dois(depois.getHours())}:${dois(depois.getMinutes())}`,
      );
    }
  }

  async function agendar(evento: React.FormEvent) {
    evento.preventDefault();
    setFalha(null);

    const inicioEm = isoDeCampoLocal(inicio);
    const fimEm = isoDeCampoLocal(fim);

    // Campo de data vazio ou impossível é recusado aqui, e não enviado como
    // texto vago: o schema exige ISO com fuso, e a mensagem dele ("Data e hora
    // invalidas") não diria qual dos dois campos faltou.
    if (!inicioEm || !fimEm) {
      const faltando: ErrosDoFormulario = {};

      if (!inicioEm) {
        faltando.inicioEm = 'Informe a data e a hora de inicio.';
      }

      if (!fimEm) {
        faltando.fimEm = 'Informe a data e a hora de fim.';
      }

      setErros(faltando);
      focarPrimeiroErro(formulario.current, faltando);
      return;
    }

    const valores = {
      imovelId,
      ...(clienteId ? { clienteId } : {}),
      ...(responsavelId ? { responsavelId } : {}),
      inicioEm,
      fimEm,
      ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
    };

    const validacao = validar(criarVisitaSchema, valores);

    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroErro(formulario.current, validacao.erros);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      const visita = await chamarApi<Visita>('/visitas', {
        metodo: 'POST',
        corpo: validacao.dados,
      });

      router.push(`/painel/agenda/${visita.id}`);
    } catch (erro) {
      if (erro instanceof ErroDaApi && erro.erros.length > 0) {
        setErros(erro.porCampo);
        focarPrimeiroErro(formulario.current, erro.porCampo);
      } else {
        setFalha(
          erro instanceof ErroDaApi
            ? erro.message
            : 'Nao foi possivel agendar a visita.',
        );
      }

      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/painel/agenda">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Agenda
        </Link>
      </Button>

      <h1 className="text-navy mt-2 text-2xl font-semibold tracking-tight dark:text-foreground">
        Agendar visita
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {organizacaoAtiva.nome}
      </p>

      <form
        ref={formulario}
        onSubmit={agendar}
        noValidate
        className="mt-6 grid gap-6"
      >
        {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que e a visita</CardTitle>
            <CardDescription>
              O imovel e obrigatorio — visita e a alguma coisa. O cliente e
              opcional: existe visita de interessado que ainda nao esta
              cadastrado.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <CampoSelecao
              nome="imovelId"
              rotulo="Imovel"
              value={imovelId}
              disabled={imoveis === null || enviando}
              onChange={(e) => {
                setImovelId(e.target.value);
                setErros({});
              }}
              erro={erros.imovelId}
              textoVazio={
                imoveis === null ? 'Carregando...' : 'Selecione o imovel'
              }
              opcoes={(imoveis ?? []).map((imovel) => ({
                valor: imovel.id,
                rotulo: `${imovel.codigo} — ${imovel.titulo}`,
              }))}
            />

            <CampoSelecao
              nome="clienteId"
              rotulo="Cliente"
              value={clienteId}
              disabled={clientes === null || enviando}
              onChange={(e) => {
                setClienteId(e.target.value);
                setErros({});
              }}
              erro={erros.clienteId}
              textoVazio={
                clientes === null ? 'Carregando...' : 'Sem cliente cadastrado'
              }
              opcoes={(clientes ?? []).map((cliente) => ({
                valor: cliente.id,
                rotulo: cliente.nomeCompleto,
              }))}
              ajuda="A lista traz os clientes que voce acompanha."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quando</CardTitle>
            <CardDescription>
              No seu horario local. O sistema guarda o instante com o fuso, para
              que a hora continue certa em qualquer aparelho.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Campo
              nome="inicioEm"
              rotulo="Inicio"
              type="datetime-local"
              value={inicio}
              disabled={enviando}
              onChange={(e) => mudarInicio(e.target.value)}
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
                setErros({});
              }}
              erro={erros.fimEm}
              ajuda="Sugerido: uma hora depois do inicio."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quem conduz</CardTitle>
            <CardDescription>
              {podeAtribuir
                ? 'Em branco, a visita fica com voce. Atribuir a outra pessoa da a ela o nome e o telefone do cliente — e nada mais.'
                : 'A visita fica com voce. Atribuir visita a outra pessoa e tarefa de quem coordena a equipe.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {podeAtribuir ? (
              <CampoSelecao
                nome="responsavelId"
                rotulo="Responsavel"
                value={responsavelId}
                disabled={enviando}
                onChange={(e) => {
                  setResponsavelId(e.target.value);
                  setErros({});
                }}
                erro={erros.responsavelId}
                textoVazio="Eu mesmo"
                // "Eu mesmo" já é a opção vazia: repetir a própria pessoa na
                // lista daria dois caminhos para o mesmo resultado, e um deles
                // seria uma atribuição registrada na auditoria sem necessidade.
                opcoes={membros
                  .filter((membro) => !membro.euMesmo)
                  .map((membro) => ({
                    valor: membro.membershipId,
                    rotulo: `${membro.nome} — ${ROTULOS_DE_PAPEL[membro.papel]}`,
                  }))}
              />
            ) : null}

            <CampoTexto
              nome="observacoes"
              rotulo="Anotacoes"
              value={observacoes}
              rows={3}
              disabled={enviando}
              onChange={(e) => {
                setObservacoes(e.target.value);
                setErros({});
              }}
              erro={erros.observacoes}
              ajuda="Opcional. Combinado de portaria, chave, quem abre o imovel."
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Agendando...' : 'Agendar visita'}
          </Button>
          <Button asChild type="button" variant="ghost" disabled={enviando}>
            <Link href="/painel/agenda">Cancelar</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
