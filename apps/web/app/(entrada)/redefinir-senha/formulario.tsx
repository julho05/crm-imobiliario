'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { redefinirSenhaSchema } from '@app/shared';
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
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  focarPrimeiroErro,
  validar,
  type ErrosDoFormulario,
} from '@/lib/formulario';

/**
 * O formulario de `/redefinir-senha`.
 *
 * Token expirado, ja usado e inexistente mostram **a mesma** mensagem. A API
 * responde 404 nos tres casos, e a tela nao tenta ser mais esperta: dizer
 * "este token expirou" confirmaria que ele existiu, e distinguir "invalido" de
 * "expirado" informa sobre o formato a quem esta sondando.
 *
 * O token nao e conferido ao abrir a tela. Seria uma chamada a mais para
 * descobrir, no melhor caso, o que a pessoa vai descobrir ao enviar — e, no
 * pior, para transformar cada link aberto em um consumo de tentativa.
 */
export function FormularioDeRedefinicao() {
  const parametros = useSearchParams();
  const formulario = useRef<HTMLFormElement>(null);

  const token = parametros.get('token') ?? '';

  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<number | null>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalha(null);

    const dados = new FormData(evento.currentTarget);
    const valores = {
      token,
      senha: String(dados.get('senha') ?? ''),
      confirmacaoDaSenha: String(dados.get('confirmacaoDaSenha') ?? ''),
    };

    const validacao = validar(redefinirSenhaSchema, valores);

    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroErro(formulario.current, validacao.erros);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      const resposta = await chamarApi<{ sessoesEncerradas: number }>(
        '/autenticacao/senha/redefinir',
        { metodo: 'POST', corpo: validacao.dados },
      );

      setPronto(resposta.sessoesEncerradas);
    } catch (erro) {
      if (erro instanceof ErroDaApi && erro.status === 404) {
        setFalha(
          'Este link nao serve mais. Ele pode ter expirado ou ja ter sido ' +
            'usado. Peca um link novo.',
        );
      } else if (erro instanceof ErroDaApi) {
        setErros(erro.porCampo);
        setFalha(erro.message);
      } else {
        setFalha('Nao foi possivel redefinir a senha. Tente de novo.');
      }

      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link incompleto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Aviso tom="erro">
            Este endereco nao tem o codigo de redefinicao. Abra o link direto do
            e-mail que voce recebeu, sem copiar e colar pela metade.
          </Aviso>
          <p className="text-sm">
            <Link
              href="/recuperar-senha"
              className="text-primary underline dark:text-accent"
            >
              Pedir um link novo
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (pronto !== null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Senha alterada</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Aviso tom="sucesso">
            A sua senha foi trocada. Use a senha nova para entrar.
          </Aviso>

          {pronto > 0 ? (
            <p className="text-muted-foreground text-sm">
              {pronto === 1
                ? 'Encerramos a sessao que estava aberta.'
                : `Encerramos as ${pronto} sessoes que estavam abertas.`}{' '}
              Quem estivesse usando a sua conta em outro aparelho precisa entrar
              de novo — com a senha nova.
            </p>
          ) : null}

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova senha</CardTitle>
        <CardDescription>
          Escolha a senha que voce vai usar de agora em diante.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {falha ? (
          <Aviso tom="erro" className="mb-4">
            {falha}{' '}
            <Link href="/recuperar-senha" className="underline">
              Pedir outro link
            </Link>
            .
          </Aviso>
        ) : null}

        <form
          ref={formulario}
          onSubmit={enviar}
          className="grid gap-4"
          noValidate
        >
          <Campo
            nome="senha"
            rotulo="Nova senha"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            erro={erros.senha}
            ajuda="Pelo menos 10 caracteres, com letras e numeros."
          />

          <Campo
            nome="confirmacaoDaSenha"
            rotulo="Repita a nova senha"
            type="password"
            autoComplete="new-password"
            required
            erro={erros.confirmacaoDaSenha}
          />

          <Aviso tom="informacao">
            Ao trocar a senha, as outras sessoes da sua conta serao encerradas.
          </Aviso>

          <Button type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar nova senha'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
