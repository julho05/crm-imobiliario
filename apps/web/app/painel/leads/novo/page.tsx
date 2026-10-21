'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  criarLeadSchema,
  ORIGENS_DE_CADASTRO_MANUAL,
  podeFazer,
  ROTULOS_DE_ORIGEM_DE_LEAD,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Campo, CampoSelecao, CampoTexto } from '@/components/campo';
import { Button } from '@/components/ui/button';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  focarPrimeiroErro,
  validar,
  type ErrosDoFormulario,
} from '@/lib/formulario';
import { formatarDataHora, type Duplicata, type Lead } from '@/lib/leads';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/leads/novo` — cadastro manual.
 *
 * ## A duplicata e o ponto delicado desta tela
 *
 * A API sinaliza duplicata por telefone em **dois niveis**, porque `lead:ver` e
 * `OWN` para o corretor: a duplicata dele vem completa, a de um colega vem
 * apenas como "existe". A tela precisa tratar os dois de formas diferentes, e
 * sobretudo precisa dizer **o que fazer** em cada caso — aviso que nao aponta
 * uma acao e so um susto.
 *
 * - duplicata propria: link para o contato existente, para a pessoa decidir se
 *   continua no mesmo registro
 * - duplicata de colega: avisa que ha contato na organizacao com aquele
 *   telefone e manda falar com quem coordena, porque e quem alcanca os dois
 *
 * O cadastro **acontece** nos dois casos: a decisao de 19/10/2026 e sinalizar,
 * nunca unir automaticamente. Fundir perderia qual corretor falou com a pessoa
 * primeiro, que e a informacao que a discussao posterior exige.
 */

type Valores = {
  nomeCompleto: string;
  telefone: string;
  email: string;
  origem: string;
  observacoes: string;
};

const VAZIO: Valores = {
  nomeCompleto: '',
  telefone: '',
  email: '',
  origem: 'MANUAL',
  observacoes: '',
};

export default function NovoLead() {
  const router = useRouter();
  const { papel } = useSessao();
  const formulario = useRef<HTMLFormElement>(null);

  const [valores, setValores] = useState<Valores>(VAZIO);
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [salvo, setSalvo] = useState<{
    lead: Lead;
    duplicatas: Duplicata[];
  } | null>(null);

  function mudar(campo: keyof Valores, valor: string) {
    setValores((atuais) => ({ ...atuais, [campo]: valor }));

    if (erros[campo]) {
      setErros(({ [campo]: _, ...resto }) => resto);
    }
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setFalha(null);

    // Campo vazio nao vai no corpo: string vazia seria gravada como texto
    // vazio onde o banco aceita nulo.
    const corpo: Record<string, unknown> = { origem: valores.origem };

    for (const campo of [
      'nomeCompleto',
      'telefone',
      'email',
      'observacoes',
    ] as const) {
      const bruto = valores[campo].trim();

      if (bruto !== '') {
        corpo[campo] = bruto;
      }
    }

    const resultado = validar(criarLeadSchema, corpo);

    if (!resultado.ok) {
      setErros(resultado.erros);
      focarPrimeiroErro(formulario.current, resultado.erros);
      return;
    }

    setEnviando(true);

    try {
      const resposta = await chamarApi<{
        lead: Lead;
        duplicatas: Duplicata[];
      }>('/leads', { metodo: 'POST', corpo });

      // Com duplicata, fica nesta tela para mostrar o aviso: levar direto para
      // o lead novo esconderia a informacao no instante em que ela importa.
      if (resposta.duplicatas.length > 0) {
        setSalvo(resposta);
        setEnviando(false);
        return;
      }

      router.push(`/painel/leads/${resposta.lead.id}`);
      router.refresh();
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
        setFalha('Nao foi possivel cadastrar o cliente.');
      }

      setEnviando(false);
    }
  }

  if (salvo) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
          Cliente cadastrado
        </h1>

        <div className="mt-6 grid gap-4">
          <Aviso tom="sucesso">
            {salvo.lead.nomeCompleto} foi cadastrado e esta sob sua
            responsabilidade.
          </Aviso>

          <AvisoDeDuplicata duplicatas={salvo.duplicatas} />

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/painel/leads/${salvo.lead.id}`}>
                Abrir o cliente
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/leads">Voltar para a lista</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/painel/leads">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Clientes
        </Link>
      </Button>

      <h1 className="text-navy mt-2 text-2xl font-semibold tracking-tight dark:text-foreground">
        Novo cliente
      </h1>

      <div className="mt-8">
        {podeFazer(papel, 'lead:criar') === false ? (
          <Aviso tom="erro">
            Seu papel nao permite cadastrar clientes nesta organizacao.
          </Aviso>
        ) : (
          <form
            ref={formulario}
            onSubmit={enviar}
            noValidate
            className="grid gap-5"
          >
            {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

            <Campo
              nome="nomeCompleto"
              rotulo="Nome completo"
              value={valores.nomeCompleto}
              onChange={(e) => mudar('nomeCompleto', e.target.value)}
              erro={erros.nomeCompleto}
              autoComplete="off"
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <Campo
                nome="telefone"
                rotulo="Telefone"
                inputMode="tel"
                value={valores.telefone}
                onChange={(e) => mudar('telefone', e.target.value)}
                erro={erros.telefone}
                ajuda="Com DDD."
                autoComplete="off"
              />

              <Campo
                nome="email"
                rotulo="E-mail"
                type="email"
                value={valores.email}
                onChange={(e) => mudar('email', e.target.value)}
                erro={erros.email}
                autoComplete="off"
              />
            </div>

            <p className="text-muted-foreground -mt-2 text-xs">
              Telefone ou e-mail: um dos dois basta, mas sem nenhum nao ha como
              dar retorno.
            </p>

            <CampoSelecao
              nome="origem"
              rotulo="Como este contato chegou"
              value={valores.origem}
              onChange={(e) => mudar('origem', e.target.value)}
              erro={erros.origem}
              opcoes={ORIGENS_DE_CADASTRO_MANUAL.map((origem) => ({
                valor: origem,
                rotulo: ROTULOS_DE_ORIGEM_DE_LEAD[origem],
              }))}
              // A origem nao muda depois: editavel, o relatorio de origem
              // viraria opiniao.
              ajuda="Nao e possivel alterar depois."
            />

            <CampoTexto
              nome="observacoes"
              rotulo="Anotacoes"
              value={valores.observacoes}
              onChange={(e) => mudar('observacoes', e.target.value)}
              erro={erros.observacoes}
              rows={5}
              ajuda="Uso interno. Nunca aparece no catalogo publico."
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={enviando}>
                {enviando ? 'Cadastrando...' : 'Cadastrar cliente'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={enviando}
                onClick={() => router.push('/painel/leads')}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * O aviso de duplicata, nos dois niveis.
 *
 * Nao e um alerta de erro: o cadastro deu certo. E um aviso de que talvez haja
 * trabalho duplicado acontecendo, com o caminho para resolver em cada caso.
 */
function AvisoDeDuplicata({ duplicatas }: { duplicatas: Duplicata[] }) {
  const visiveis = duplicatas.filter((d) => d.nivel === 'visivel');
  const restritas = duplicatas.length - visiveis.length;

  return (
    <div className="border-warning/40 bg-warning/5 grid gap-3 rounded-xl border p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        Esse telefone ja aparece em outro contato
      </p>

      {visiveis.length > 0 ? (
        <ul className="grid gap-2">
          {visiveis.map((duplicata) =>
            duplicata.nivel === 'visivel' ? (
              <li key={duplicata.id}>
                <Link
                  href={`/painel/leads/${duplicata.id}`}
                  className="hover:bg-accent focus-visible:ring-ring block rounded-md border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="font-medium">{duplicata.nomeCompleto}</span>
                  <span className="text-muted-foreground block text-xs">
                    Cadastrado em {formatarDataHora(duplicata.criadoEm)}
                    {duplicata.responsavel
                      ? ` · ${duplicata.responsavel}`
                      : ' · sem responsavel'}
                  </span>
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}

      {restritas > 0 ? (
        // Sem nome e sem responsavel, porque a API nao os envia: seria a
        // carteira do colega vazando pela porta do cadastro. O que a pessoa
        // precisa saber e que nao deve ligar antes de conferir.
        <p className="text-muted-foreground text-sm">
          {restritas === 1
            ? 'Ha outro contato na organizacao com esse telefone, sob responsabilidade de outra pessoa.'
            : `Ha ${restritas} outros contatos na organizacao com esse telefone, sob responsabilidade de outras pessoas.`}{' '}
          Fale com quem coordena a equipe antes de entrar em contato, para nao
          ligar duas vezes para a mesma pessoa.
        </p>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Os cadastros nao foram unidos. Nada e juntado automaticamente, para nao
        perder o historico de quem falou com a pessoa primeiro.
      </p>
    </div>
  );
}
