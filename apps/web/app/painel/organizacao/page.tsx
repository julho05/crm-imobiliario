'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { podeFazer, trocarEnderecoDaVitrineSchema } from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Campo } from '@/components/campo';
import { Button } from '@/components/ui/button';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  focarPrimeiroErro,
  validar,
  type ErrosDoFormulario,
} from '@/lib/formulario';
import { useSessao } from '@/lib/sessao-do-painel';

/**
 * `/painel/organizacao` — por enquanto, só o endereço da vitrine (item **C3**).
 *
 * Nome, contato público, apresentação e logo ficam para um item próprio
 * (decisão de 29/10/2026). A tela existe agora porque o C3 precisa de um jeito
 * de trocar o endereço, e sem ele o redirecionamento não teria o que
 * redirecionar.
 *
 * ## A troca pede confirmação, com a consequência escrita
 *
 * Trocar o endereço muda todo link já compartilhado. O antigo continua levando
 * à vitrine — e passa a ficar reservado para esta organização, contando para o
 * limite de três trocas em trinta dias. Quem aperta o botão precisa ler isso
 * **antes**, e não descobrir depois.
 */

type Endereco = { slug: string; anteriores: string[] };

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; endereco: Endereco }
  | { situacao: 'erro'; mensagem: string };

export default function Organizacao() {
  const { papel, organizacaoAtiva, recarregar } = useSessao();
  const podeTrocar = podeFazer(papel, 'organizacao:editarSlug') !== false;

  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });

  useEffect(() => {
    let ativo = true;

    chamarApi<Endereco>('/organizacao/endereco')
      .then((endereco) => {
        if (ativo) setEstado({ situacao: 'pronto', endereco });
      })
      .catch((erro: unknown) => {
        if (ativo) {
          setEstado({
            situacao: 'erro',
            mensagem:
              erro instanceof ErroDaApi
                ? erro.message
                : 'Nao foi possivel carregar o endereco.',
          });
        }
      });

    return () => {
      ativo = false;
    };
  }, [organizacaoAtiva.organizationId]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-navy dark:text-foreground text-2xl font-semibold tracking-tight">
        Organização
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {organizacaoAtiva.nome}
      </p>

      <section className="bg-card mt-6 rounded-lg border p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Endereço da vitrine</h2>

        {estado.situacao === 'carregando' ? (
          <div
            className="bg-muted mt-4 h-10 animate-pulse rounded-md"
            aria-busy="true"
          >
            <span className="sr-only">Carregando o endereço...</span>
          </div>
        ) : null}

        {estado.situacao === 'erro' ? (
          <Aviso tom="erro" className="mt-4">
            {estado.mensagem}
          </Aviso>
        ) : null}

        {estado.situacao === 'pronto' ? (
          <>
            <p className="mt-3 text-sm">
              Sua vitrine está em{' '}
              <Link
                href={`/o/${estado.endereco.slug}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-medium underline"
              >
                /o/{estado.endereco.slug}
                <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(abre em outra aba)</span>
              </Link>
            </p>

            {estado.endereco.anteriores.length > 0 ? (
              <p className="text-muted-foreground mt-2 text-sm">
                Endereços antigos que continuam levando para cá:{' '}
                {estado.endereco.anteriores.map((slug, indice) => (
                  <span key={slug}>
                    {indice > 0 ? ', ' : null}
                    <span className="text-foreground">/o/{slug}</span>
                  </span>
                ))}
              </p>
            ) : null}

            {podeTrocar ? (
              <Troca
                atual={estado.endereco.slug}
                aoTrocar={(endereco) => {
                  setEstado({ situacao: 'pronto', endereco });
                  // O slug também mora na sessão do painel (lista de
                  // organizações); sem recarregar, o resto do painel
                  // continuaria apontando para o endereço antigo.
                  recarregar();
                }}
              />
            ) : (
              <p className="text-muted-foreground mt-4 text-sm">
                Só o proprietário e os administradores trocam o endereço.
              </p>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

function Troca({
  atual,
  aoTrocar,
}: {
  atual: string;
  aoTrocar: (endereco: Endereco) => void;
}) {
  const formulario = useRef<HTMLFormElement>(null);

  const [slug, setSlug] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [trocado, setTrocado] = useState<string | null>(null);

  function revisar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalha(null);
    setTrocado(null);

    const validacao = validar(trocarEnderecoDaVitrineSchema, { slug });

    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroErro(formulario.current, validacao.erros);
      return;
    }

    setErros({});
    setSlug(validacao.dados.slug);
    setConfirmando(true);
  }

  async function confirmar() {
    setEnviando(true);
    setFalha(null);

    try {
      const endereco = await chamarApi<Endereco>('/organizacao/endereco', {
        metodo: 'PATCH',
        corpo: { slug },
      });

      setTrocado(endereco.slug);
      setSlug('');
      setConfirmando(false);
      aoTrocar(endereco);
    } catch (erro) {
      setConfirmando(false);

      if (erro instanceof ErroDaApi) {
        setErros(erro.porCampo);
        setFalha(erro.message);
      } else {
        setFalha('Nao foi possivel trocar o endereco. Tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-6 border-t pt-6">
      {trocado ? (
        <Aviso tom="sucesso" className="mb-4">
          Endereço trocado para /o/{trocado}. O antigo continua levando para a
          vitrine.
        </Aviso>
      ) : null}

      {falha ? (
        <Aviso tom="erro" className="mb-4">
          {falha}
        </Aviso>
      ) : null}

      <form
        ref={formulario}
        onSubmit={revisar}
        noValidate
        className="grid gap-4"
      >
        <Campo
          nome="slug"
          rotulo="Novo endereço"
          inputMode="url"
          autoComplete="off"
          value={slug}
          disabled={confirmando || enviando}
          onChange={(evento) => setSlug(evento.currentTarget.value)}
          erro={erros.slug}
          ajuda={
            <>
              Letras minúsculas, números e hífens. Ficará assim:{' '}
              <span className="text-foreground font-medium">
                /o/{slug.trim().toLowerCase() || atual}
              </span>
            </>
          }
        />

        {confirmando ? (
          <div className="grid gap-3">
            <Aviso>
              <p>
                Os links que você já compartilhou com{' '}
                <strong>/o/{atual}</strong> continuam funcionando: quem abrir um
                deles chega em <strong>/o/{slug}</strong>.
              </p>
              <p className="mt-2">
                O endereço antigo fica reservado para a sua organização. São no
                máximo três trocas a cada trinta dias.
              </p>
            </Aviso>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={confirmar} disabled={enviando}>
                {enviando ? 'Trocando...' : 'Confirmar a troca'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmando(false)}
                disabled={enviando}
              >
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button type="submit">Trocar endereço</Button>
          </div>
        )}
      </form>
    </div>
  );
}
