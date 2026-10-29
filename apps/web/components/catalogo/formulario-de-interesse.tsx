'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AVISO_DE_PRIVACIDADE, capturaDeLeadSchema } from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Campo, CampoTexto } from '@/components/campo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  focarPrimeiroErro,
  validar,
  type ErrosDoFormulario,
} from '@/lib/formulario';

/**
 * O formulário de interesse do anúncio — item **C5**.
 *
 * O único componente do catálogo com `'use client'`: a vitrine e a busca
 * funcionam sem JavaScript, e este não teria como — a resposta precisa
 * aparecer na própria página, sem levar o visitante para outra.
 *
 * ## A caixa de consentimento nasce desmarcada
 *
 * Sem `defaultChecked`, e isso não é detalhe de interface: consentimento
 * pré-marcado não é consentimento (LGPD, art. 8º), e o banco gravaria um aceite
 * que a pessoa não deu. A API recusa o envio sem a marcação, então a regra vale
 * mesmo para quem desligar o JavaScript ou chamar a rota direto.
 *
 * ## O aviso abre em outra aba
 *
 * Quem lê o aviso no meio do preenchimento não pode perder o que escreveu.
 *
 * ## Campo em branco vira ausente
 *
 * O schema aceita telefone **ou** e-mail; um `''` no telefone seria um telefone
 * inválido, e o erro apareceria num campo que a pessoa deixou vazio de
 * propósito.
 */
export function FormularioDeInteresse({
  slug,
  imovelId,
  codigo,
  nomeDaOrganizacao,
}: {
  slug: string;
  imovelId: string;
  codigo: string;
  nomeDaOrganizacao: string;
}) {
  const formulario = useRef<HTMLFormElement>(null);

  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [ficha, setFicha] = useState<string | null>(null);
  /**
   * Vira `true` quando o React já assumiu o formulário. Até lá o botão fica
   * desabilitado — ver a nota sobre o envio nativo no `<form>`.
   */
  const [pronto, setPronto] = useState(false);

  // A ficha anti-spam (C6) é pedida quando o formulário aparece: é a hora
  // dela que conta como início do preenchimento. `pronto` liga mesmo se ela
  // não vier — o envio sem ficha pede uma nova, em vez de travar o botão.
  useEffect(() => {
    let ativo = true;

    pedirFicha(slug).then((emitida) => {
      if (ativo) {
        setFicha(emitida);
        setPronto(true);
      }
    });

    return () => {
      ativo = false;
    };
  }, [slug]);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalha(null);

    const dados = new FormData(evento.currentTarget);

    if (!ficha) {
      // A ficha não chegou (rede caiu ao carregar). Pede agora; o tempo dela
      // começa a contar aqui, então o envio imediato seria recusado de
      // qualquer jeito.
      setFicha(await pedirFicha(slug));
      setFalha('Aguarde um instante e envie de novo.');
      return;
    }

    const texto = (campo: string) =>
      String(dados.get(campo) ?? '').trim() || undefined;

    const validacao = validar(capturaDeLeadSchema, {
      propertyId: imovelId,
      nomeCompleto: texto('nomeCompleto') ?? '',
      telefone: texto('telefone'),
      email: texto('email'),
      mensagem: texto('mensagem'),
      consentiuComAPrivacidade: dados.get('consentiuComAPrivacidade') === 'on',
      ficha,
      site: texto('site'),
    });

    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroErro(formulario.current, validacao.erros);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      await chamarApi(`/publico/organizacoes/${slug}/interesse`, {
        metodo: 'POST',
        corpo: validacao.dados,
      });

      setEnviado(true);
    } catch (erro) {
      if (erro instanceof ErroDaApi) {
        setErros(erro.porCampo);
        setFalha(erro.message);
      } else {
        setFalha('Nao foi possivel enviar. Tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <Aviso tom="sucesso">
        Mensagem enviada. {nomeDaOrganizacao} vai entrar em contato sobre o
        imóvel {codigo}.
      </Aviso>
    );
  }

  // ## O envio nativo, antes de o JavaScript carregar
  //
  // Encontrado em 29/10/2026, no C6: até o React assumir a página, um clique
  // em "Enviar" fazia o navegador enviar o formulário sozinho — por GET, que é
  // o padrão, com nome e telefone na URL. A URL vai para o histórico, para o
  // log do servidor e para o `Referer` da próxima página. No 4G do visitante,
  // essa janela dura segundos.
  //
  // Duas defesas, porque cada uma sozinha tem furo: o botão nasce desabilitado
  // (o que também bloqueia o Enter num campo), e `method="post"` garante que,
  // se algo ainda disparar o envio nativo, os dados vão no corpo e não na URL.
  return (
    <form
      ref={formulario}
      onSubmit={enviar}
      method="post"
      className="grid gap-3"
      noValidate
      aria-label="Mensagem sobre este imóvel"
    >
      {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

      {/*
        O campo-armadilha (C6). Fora da tela, e não `type="hidden"` nem
        `display: none`: robô que lê o HTML pula esses dois, e o que se quer é
        que ele preencha. `aria-hidden` e `tabIndex={-1}` o tiram do leitor de
        tela e do Tab, e `autoComplete="off"` do preenchimento automático —
        senão o navegador de uma pessoa de verdade o preencheria por ela, e o
        lead seria descartado em silêncio.
      */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px overflow-hidden"
      >
        <label htmlFor="site">Deixe este campo em branco</label>
        <input
          id="site"
          name="site"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Campo
        nome="nomeCompleto"
        rotulo="Nome"
        autoComplete="name"
        required
        erro={erros.nomeCompleto}
      />

      <Campo
        nome="telefone"
        rotulo="Telefone ou WhatsApp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        erro={erros.telefone}
        ajuda="Informe o telefone, o e-mail ou os dois."
      />

      <Campo
        nome="email"
        rotulo="E-mail"
        type="email"
        autoComplete="email"
        erro={erros.email}
      />

      <CampoTexto
        nome="mensagem"
        rotulo="Mensagem (opcional)"
        rows={3}
        maxLength={2000}
        placeholder={`Tenho interesse no imóvel ${codigo}.`}
        erro={erros.mensagem}
      />

      <div className="flex items-start gap-2">
        <input
          id="consentiuComAPrivacidade"
          name="consentiuComAPrivacidade"
          type="checkbox"
          required
          aria-invalid={erros.consentiuComAPrivacidade ? true : undefined}
          aria-describedby={
            erros.consentiuComAPrivacidade
              ? 'consentiuComAPrivacidade-erro'
              : undefined
          }
          className="border-input text-primary focus-visible:ring-ring/50 mt-1 size-4 shrink-0 rounded border focus-visible:ring-[3px]"
        />
        <div className="grid gap-1">
          <Label
            htmlFor="consentiuComAPrivacidade"
            className="text-sm leading-snug font-normal"
          >
            <span>
              Concordo que {nomeDaOrganizacao} use estes dados para responder ao
              meu contato, conforme o{' '}
              <Link
                href="/privacidade"
                target="_blank"
                rel="noopener"
                className="underline"
              >
                aviso de privacidade
              </Link>
              .
            </span>
          </Label>
          {erros.consentiuComAPrivacidade ? (
            <p
              id="consentiuComAPrivacidade-erro"
              role="alert"
              className="text-destructive text-xs"
            >
              {erros.consentiuComAPrivacidade}
            </p>
          ) : null}
        </div>
      </div>

      <Button type="submit" disabled={!pronto || enviando}>
        {enviando ? 'Enviando...' : 'Enviar mensagem'}
      </Button>

      <p className="text-muted-foreground text-xs">
        Aviso de privacidade, versão {AVISO_DE_PRIVACIDADE.versao}.
      </p>
    </form>
  );
}

/** A ficha anti-spam, ou `null` se a API não respondeu. */
async function pedirFicha(slug: string): Promise<string | null> {
  try {
    const { ficha } = await chamarApi<{ ficha: string }>(
      `/publico/organizacoes/${slug}/interesse/ficha`,
    );
    return ficha;
  } catch {
    return null;
  }
}
