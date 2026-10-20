'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cadastroSchema, SLUGS_RESERVADOS } from '@app/shared';
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
 * `/cadastro` — cria a pessoa e a organizacao na mesma operacao.
 *
 * Fluxo **unico**, por decisao de 19/10/2026: nao se pergunta "voce e autonomo
 * ou imobiliaria?". O corretor autonomo e uma organizacao de um membro, nao um
 * tipo de conta — e a pessoa que esta se cadastrando nao deveria precisar
 * entender essa modelagem para criar uma conta.
 */
export default function Cadastro() {
  const router = useRouter();
  const formulario = useRef<HTMLFormElement>(null);

  const [slug, setSlug] = useState('');
  const [slugEditado, setSlugEditado] = useState(false);
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /**
   * Sugere o endereco a partir do nome da organizacao, ate a pessoa mexer no
   * campo. Depois disso, para de sugerir: sobrescrever o que alguem digitou e
   * a forma mais rapida de irritar quem estava no meio de uma escolha.
   */
  function aoDigitarNomeDaOrganizacao(valor: string) {
    if (!slugEditado) {
      setSlug(sugerirSlug(valor));
    }
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalha(null);

    const dados = new FormData(evento.currentTarget);
    const valores = {
      nome: String(dados.get('nome') ?? ''),
      email: String(dados.get('email') ?? ''),
      senha: String(dados.get('senha') ?? ''),
      nomeDaOrganizacao: String(dados.get('nomeDaOrganizacao') ?? ''),
      slugDaOrganizacao: String(dados.get('slugDaOrganizacao') ?? ''),
      aceitouOsTermos: dados.get('aceitouOsTermos') === 'on',
    };

    const validacao = validar(cadastroSchema, valores);

    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroErro(formulario.current, validacao.erros);
      return;
    }

    // A lista de reservados e compartilhada, mas e a recusa do servidor que
    // vale: aqui so evitamos a ida inutil.
    if (SLUGS_RESERVADOS.includes(validacao.dados.slugDaOrganizacao)) {
      const reservado = {
        slugDaOrganizacao: 'Este endereco e reservado. Escolha outro.',
      };
      setErros(reservado);
      focarPrimeiroErro(formulario.current, reservado);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      await chamarApi('/autenticacao/cadastro', {
        metodo: 'POST',
        corpo: validacao.dados,
      });

      // O cadastro ja abre a sessao e define a organizacao ativa: a pessoa
      // acabou de provar que tem a senha, e pedir login em seguida seria
      // atrito sem ganho de seguranca.
      router.replace('/painel');
    } catch (erro) {
      if (erro instanceof ErroDaApi) {
        setErros(erro.porCampo);
        setFalha(erro.message);
        focarPrimeiroErro(formulario.current, erro.porCampo);
      } else {
        setFalha('Nao foi possivel criar a conta. Tente de novo.');
      }

      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>
          Comece a cadastrar imoveis e atender clientes. Se voce trabalha
          sozinho, esta no lugar certo: convidar colegas e opcional.
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
            nome="nome"
            rotulo="Seu nome"
            autoComplete="name"
            autoFocus
            required
            erro={erros.nome}
          />

          <Campo
            nome="email"
            rotulo="E-mail"
            type="email"
            autoComplete="email"
            required
            erro={erros.email}
          />

          <Campo
            nome="senha"
            rotulo="Senha"
            type="password"
            autoComplete="new-password"
            required
            erro={erros.senha}
            ajuda="Pelo menos 10 caracteres, com letras e numeros."
          />

          <Campo
            nome="nomeDaOrganizacao"
            rotulo="Nome da imobiliaria"
            autoComplete="organization"
            required
            erro={erros.nomeDaOrganizacao}
            ajuda="Se voce trabalha sozinho, use o seu nome profissional."
            onChange={(evento) =>
              aoDigitarNomeDaOrganizacao(evento.currentTarget.value)
            }
          />

          <Campo
            nome="slugDaOrganizacao"
            rotulo="Endereco da sua vitrine"
            required
            inputMode="url"
            value={slug}
            onChange={(evento) => {
              setSlugEditado(true);
              setSlug(evento.currentTarget.value);
            }}
            erro={erros.slugDaOrganizacao}
            ajuda={
              <>
                Letras minusculas, numeros e hifens. Ficara assim:{' '}
                <span className="text-foreground font-medium">
                  /o/{slug || 'seu-endereco'}
                </span>
              </>
            }
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
            {enviando ? 'Criando conta...' : 'Criar conta'}
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-sm">
          Ja tem conta?{' '}
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

/**
 * Transforma "Imobiliaria Silva & Filhos" em "imobiliaria-silva-filhos".
 *
 * `normalize('NFD')` separa a letra do acento, e a faixa a seguir remove os
 * acentos soltos — sem isso, "Imoveis Sao Joao" viraria um endereco com
 * caracteres que o `slugSchema` recusa, e a pessoa levaria um erro em um campo
 * que ela nem preencheu.
 */
function sugerirSlug(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}
