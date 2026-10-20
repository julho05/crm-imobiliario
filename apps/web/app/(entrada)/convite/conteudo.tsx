'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { aceitarConviteSchema, ROTULOS_DE_PAPEL, type Role } from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Campo } from '@/components/campo';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  focarPrimeiroErro,
  validar,
  type ErrosDoFormulario,
} from '@/lib/formulario';

/**
 * `/convite?token=...` — aceite de convite.
 *
 * Dois caminhos, decididos pelo servidor e nao adivinhados aqui: a API informa
 * em `precisaCriarConta` se aquele e-mail ja tem conta.
 *
 * - **Sem conta**: define nome e senha, aceita os termos e entra ja dentro da
 *   organizacao
 * - **Com conta**: entra normalmente e o convite vira um vinculo novo. E o caso
 *   previsto do corretor que atende duas imobiliarias
 *
 * A tela **nao** decide nada sobre validade do convite. Expirado, revogado e
 * inexistente chegam como o mesmo 404, e e assim que devem aparecer: dizer
 * "este convite foi revogado" confirmaria que ele existiu.
 */

type Convite = {
  email: string;
  papel: Role;
  organizacao: string;
  precisaCriarConta: boolean;
};

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'invalido' }
  | { situacao: 'falhaDeRede'; mensagem: string }
  | { situacao: 'pronto'; convite: Convite; temSessao: boolean };

export function ConteudoDoConvite() {
  const router = useRouter();
  const parametros = useSearchParams();
  const formulario = useRef<HTMLFormElement>(null);

  const token = parametros.get('token') ?? '';

  // O estado inicial ja considera a falta do token: sem isso, seria preciso
  // chamar setState de forma sincrona dentro do efeito — renderizacao em
  // cascata — e a tela mostraria um esqueleto antes de concluir o obvio.
  const [estado, setEstado] = useState<Estado>(() =>
    token ? { situacao: 'carregando' } : { situacao: 'invalido' },
  );
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    let ativo = true;

    void (async () => {
      try {
        const convite = await chamarApi<Convite>(
          `/convites/${encodeURIComponent(token)}`,
        );

        // Saber se ha sessao decide entre mostrar o botao de aceitar ou pedir
        // que a pessoa entre primeiro. A ausencia de sessao nao e erro aqui.
        let temSessao = false;

        try {
          await chamarApi('/autenticacao/eu');
          temSessao = true;
        } catch {
          temSessao = false;
        }

        if (ativo) {
          setEstado({ situacao: 'pronto', convite, temSessao });
        }
      } catch (erro) {
        if (!ativo) {
          return;
        }

        if (erro instanceof ErroDaApi && erro.status === 404) {
          setEstado({ situacao: 'invalido' });
          return;
        }

        setEstado({
          situacao: 'falhaDeRede',
          mensagem:
            erro instanceof ErroDaApi
              ? erro.message
              : 'Nao foi possivel carregar o convite.',
        });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [token]);

  async function criarContaEAceitar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalha(null);

    const dados = new FormData(evento.currentTarget);
    const valores = {
      token,
      nome: String(dados.get('nome') ?? ''),
      senha: String(dados.get('senha') ?? ''),
      aceitouOsTermos: dados.get('aceitouOsTermos') === 'on',
    };

    const validacao = validar(aceitarConviteSchema, valores);

    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroErro(formulario.current, validacao.erros);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      await chamarApi('/convites/aceitar', {
        metodo: 'POST',
        corpo: validacao.dados,
      });

      // O aceite ja abre a sessao com a organizacao ativa.
      router.replace('/painel');
    } catch (erro) {
      setFalha(mensagemDeFalhaNoAceite(erro));
      setEnviando(false);
    }
  }

  async function vincularAContaExistente() {
    setFalha(null);
    setEnviando(true);

    try {
      await chamarApi('/convites/vincular', {
        metodo: 'POST',
        corpo: { token },
      });

      // A organizacao ativa **nao** muda com o vinculo: a pessoa pode estar no
      // meio de algo na organizacao em que ja estava. O painel lista as duas.
      router.replace('/painel');
    } catch (erro) {
      setFalha(mensagemDeFalhaNoAceite(erro));
      setEnviando(false);
    }
  }

  if (estado.situacao === 'carregando') {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <div className="bg-muted h-6 w-32 animate-pulse rounded" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="bg-muted h-20 animate-pulse rounded" />
          <div className="bg-muted h-9 animate-pulse rounded" />
          <span className="sr-only">Carregando o convite...</span>
        </CardContent>
      </Card>
    );
  }

  if (estado.situacao === 'invalido') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Convite indisponivel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Aviso tom="erro">
            Este convite nao esta mais valido. Convites tem prazo, servem uma
            vez so e podem ser cancelados por quem os enviou.
          </Aviso>
          <p className="text-muted-foreground text-sm">
            Peca um convite novo a quem te chamou. Se voce ja tem conta, pode
            entrar normalmente.
          </p>
          <p className="text-sm">
            <Link
              href="/entrar"
              className="text-primary underline dark:text-accent"
            >
              Ir para entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (estado.situacao === 'falhaDeRede') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Convite</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Aviso tom="erro">{estado.mensagem}</Aviso>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.refresh()}
            >
              Tentar de novo
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { convite, temSessao } = estado;
  const papel = ROTULOS_DE_PAPEL[convite.papel];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Convite para {convite.organizacao}</CardTitle>
        <CardDescription>
          Voce foi convidado como <strong>{papel.toLowerCase()}</strong>, no
          endereco <strong>{convite.email}</strong>.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {falha ? (
          <Aviso tom="erro" className="mb-4">
            {falha}
          </Aviso>
        ) : null}

        {convite.precisaCriarConta ? (
          <form
            ref={formulario}
            onSubmit={criarContaEAceitar}
            className="grid gap-4"
            noValidate
          >
            <Campo
              nome="nome"
              rotulo="Seu nome"
              autoComplete="name"
              autoFocus
              required
              erro={erros.nome}
            />

            <Campo
              nome="senha"
              rotulo="Crie uma senha"
              type="password"
              autoComplete="new-password"
              required
              erro={erros.senha}
              ajuda="Pelo menos 10 caracteres, com letras e numeros."
            />

            <div className="flex items-start gap-2">
              <input
                id="aceitouOsTermos"
                name="aceitouOsTermos"
                type="checkbox"
                required
                aria-invalid={erros.aceitouOsTermos ? true : undefined}
                aria-describedby={
                  erros.aceitouOsTermos ? 'aceitouOsTermos-erro' : undefined
                }
                className="border-input text-primary focus-visible:ring-ring/50 mt-1 size-4 rounded border focus-visible:ring-[3px]"
              />
              <div className="grid gap-1">
                <Label htmlFor="aceitouOsTermos" className="font-normal">
                  Li e aceito os{' '}
                  <Link href="/termos" className="underline">
                    termos de uso
                  </Link>{' '}
                  e o{' '}
                  <Link href="/privacidade" className="underline">
                    aviso de privacidade
                  </Link>
                  .
                </Label>
                {erros.aceitouOsTermos ? (
                  <p
                    id="aceitouOsTermos-erro"
                    role="alert"
                    className="text-destructive text-xs"
                  >
                    {erros.aceitouOsTermos}
                  </p>
                ) : null}
              </div>
            </div>

            <Button type="submit" disabled={enviando}>
              {enviando ? 'Criando conta...' : 'Aceitar e criar conta'}
            </Button>
          </form>
        ) : temSessao ? (
          <div className="grid gap-4">
            <Aviso tom="informacao">
              Ao aceitar, {convite.organizacao} entra na sua lista de
              organizacoes. A organizacao em que voce esta trabalhando agora nao
              muda — voce escolhe quando trocar.
            </Aviso>

            <Button
              onClick={() => void vincularAContaExistente()}
              disabled={enviando}
            >
              {enviando ? 'Aceitando...' : 'Aceitar convite'}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <Aviso tom="informacao">
              Ja existe uma conta com o endereco {convite.email}. Entre com ela
              para aceitar o convite.
            </Aviso>

            <Button asChild>
              <Link
                href={`/entrar?destino=${encodeURIComponent(
                  `/convite?token=${token}`,
                )}`}
              >
                Entrar para aceitar
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Texto da falha ao aceitar.
 *
 * O 404 ganha redacao propria porque, entre carregar a tela e enviar o
 * formulario, o convite pode ter sido revogado ou aceito em outra aba — e a
 * mensagem crua ("Nao encontrado") nao explicaria nada a quem esta olhando.
 */
function mensagemDeFalhaNoAceite(erro: unknown): string {
  if (erro instanceof ErroDaApi && erro.status === 404) {
    return (
      'Este convite deixou de valer enquanto esta pagina estava aberta. ' +
      'Peca um convite novo a quem te chamou.'
    );
  }

  if (erro instanceof ErroDaApi) {
    return erro.message;
  }

  return 'Nao foi possivel aceitar o convite. Tente de novo.';
}
