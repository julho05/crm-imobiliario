'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { solicitarRecuperacaoSchema } from '@app/shared';
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
 * `/recuperar-senha` — pede o link de redefinicao.
 *
 * A tela mostra **a mesma confirmacao** exista a conta ou nao. Nao e descuido:
 * uma resposta diferente por caso transformaria este formulario em consulta de
 * quem tem conta na plataforma, que e a informacao que um concorrente mais
 * gostaria de ter.
 *
 * Consequencia de usabilidade que vale aceitar: quem digita o e-mail errado
 * recebe a confirmacao e fica esperando uma mensagem que nunca chega. O texto
 * diz "se existir uma conta" justamente para que a pessoa reconsidere o
 * endereco em vez de concluir que o sistema esta quebrado.
 */
export default function RecuperarSenha() {
  const formulario = useRef<HTMLFormElement>(null);

  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalha(null);

    const dados = new FormData(evento.currentTarget);
    const valores = { email: String(dados.get('email') ?? '') };

    const validacao = validar(solicitarRecuperacaoSchema, valores);

    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroErro(formulario.current, validacao.erros);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      const resposta = await chamarApi<{ mensagem: string }>(
        '/autenticacao/recuperacao',
        { metodo: 'POST', corpo: validacao.dados },
      );

      // A mensagem vem do servidor, e nao e escrita aqui: assim o texto que
      // nao revela existencia de conta tem uma unica fonte.
      setConfirmacao(resposta.mensagem);
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Nao foi possivel enviar o pedido. Tente de novo.',
      );
      setEnviando(false);
    }
  }

  if (confirmacao) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verifique o seu e-mail</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Aviso tom="sucesso">{confirmacao}</Aviso>
          <p className="text-muted-foreground text-sm">
            O link vale por uma hora e serve uma vez so. Se nao chegar, confira
            a caixa de spam antes de pedir outro.
          </p>
          <p className="text-sm">
            <Link
              href="/entrar"
              className="text-primary underline dark:text-accent"
            >
              Voltar para entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>
          Informe o seu e-mail e enviaremos um link para criar uma senha nova.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {falha ? (
          <Aviso tom="erro" className="mb-4">
            {falha}
          </Aviso>
        ) : null}

        <form
          ref={formulario}
          onSubmit={enviar}
          className="grid gap-4"
          noValidate
        >
          <Campo
            nome="email"
            rotulo="E-mail"
            type="email"
            autoComplete="email"
            autoFocus
            required
            erro={erros.email}
          />

          <Button type="submit" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Enviar link'}
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-sm">
          Lembrou a senha?{' '}
          <Link
            href="/entrar"
            className="text-primary underline dark:text-accent"
          >
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
