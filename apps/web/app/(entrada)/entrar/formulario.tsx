'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginSchema } from '@app/shared';
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
 * O formulario de `/entrar`.
 *
 * Separado da pagina porque usa `useSearchParams`, que obriga a um limite de
 * Suspense: sem ele o Next nao consegue pre-renderizar a rota, ja que os
 * parametros da URL so existem no navegador. O erro de build e claro, mas a
 * causa nao — por isso fica escrito aqui.
 *
 * A tela **nao** distingue senha errada de e-mail inexistente, e isso nao e
 * descuido de redacao: a API responde a mesma coisa nos dois casos de
 * proposito, e qualquer tentativa de ser mais especifico aqui transformaria o
 * formulario em consulta de quem tem conta na plataforma. Para um CRM
 * imobiliario, essa lista e a carteira de clientes do concorrente.
 */
export function FormularioDeEntrada() {
  const router = useRouter();
  const parametros = useSearchParams();
  const formulario = useRef<HTMLFormElement>(null);

  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Para onde ir depois de entrar. Preservar o destino e o que faz a sessao
  // expirada no meio de uma tarefa nao jogar a pessoa no inicio.
  const destino = destinoSeguro(parametros.get('destino'));
  const sessaoExpirou = parametros.get('motivo') === 'sessao-expirada';

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalha(null);

    const dados = new FormData(evento.currentTarget);
    const valores = {
      email: String(dados.get('email') ?? ''),
      senha: String(dados.get('senha') ?? ''),
      permanecerConectado: dados.get('permanecerConectado') === 'on',
    };

    const validacao = validar(loginSchema, valores);

    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroErro(formulario.current, validacao.erros);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      await chamarApi('/autenticacao/entrar', {
        metodo: 'POST',
        corpo: validacao.dados,
      });

      // `replace`, nao `push`: o botao voltar do navegador nao deve levar de
      // volta ao formulario de login de quem acabou de entrar.
      router.replace(destino);
    } catch (erro) {
      if (erro instanceof ErroDaApi) {
        setErros(erro.porCampo);
        setFalha(erro.message);
      } else {
        setFalha('Nao foi possivel entrar. Tente de novo.');
      }

      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>
          Acesse a sua conta para gerenciar imoveis e clientes.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {sessaoExpirou ? (
          <Aviso tom="informacao" className="mb-4">
            A sua sessao expirou. Entre de novo para continuar.
          </Aviso>
        ) : null}

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

          <Campo
            nome="senha"
            rotulo="Senha"
            type="password"
            autoComplete="current-password"
            required
            erro={erros.senha}
          />

          <div className="flex items-center gap-2">
            <input
              id="permanecerConectado"
              name="permanecerConectado"
              type="checkbox"
              className="border-input text-primary focus-visible:ring-ring/50 size-4 rounded border focus-visible:ring-[3px]"
            />
            <Label htmlFor="permanecerConectado" className="font-normal">
              Permanecer conectado
            </Label>
          </div>

          {/* Desabilitado durante o envio, para nao duplicar a tentativa. */}
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <div className="text-muted-foreground mt-6 grid gap-2 text-sm">
          <Link
            href="/recuperar-senha"
            className="hover:text-foreground underline"
          >
            Esqueci a minha senha
          </Link>
          <p>
            Nao tem conta?{' '}
            <Link
              href="/cadastro"
              className="text-primary underline dark:text-accent"
            >
              Criar uma conta
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * So aceita destino interno.
 *
 * Sem esta conferencia, `/entrar?destino=https://site-falso/...` faria o
 * proprio login redirecionar para fora — um redirecionamento aberto, que e
 * usado para dar aparencia legitima a pagina de phishing. A barra inicial
 * dupla (`//outro-site`) tambem e externa, e e o caso que se esquece.
 */
function destinoSeguro(valor: string | null): string {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//')) {
    return '/painel';
  }

  return valor;
}
