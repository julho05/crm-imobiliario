import { AVISO_DE_PRIVACIDADE } from '@app/shared';
import { Aviso } from '@/components/aviso';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata = { title: 'Aviso de privacidade' };

/**
 * `/privacidade` — o aviso que o formulário de interesse pede para aceitar.
 *
 * ## Texto provisório, e declarado como tal
 *
 * **[DECIDIDO 29/10/2026]** O texto abaixo é uma proposta para o parecer
 * jurídico (item D6), não o texto final. Enquanto `AVISO_DE_PRIVACIDADE.
 * rascunho` for `true`, a página diz isso no topo, e a captura de lead recusa
 * em produção — então nenhum visitante real aceita este texto.
 *
 * Os trechos entre colchetes são o que o parecer precisa decidir. Ficam à
 * vista de propósito: preenchê-los com um palpite plausível esconderia a
 * pendência atrás de um texto com cara de pronto.
 *
 * ## A versão vem de `@app/shared`
 *
 * A mesma constante que a API grava em `Lead.privacyNoticeVersion`. Mudar o
 * texto daqui exige mudar a versão lá — senão o banco diria que a pessoa
 * aceitou um texto que ela nunca leu.
 *
 * ## Por que o visitante do anúncio vem para a página do sistema
 *
 * Não existe aviso por organização. A organização que publica o anúncio é
 * quem decide sobre os dados do lead (controladora, na LGPD), e o texto diz
 * isso de forma genérica. Aviso próprio por imobiliária, se o parecer exigir,
 * é item novo.
 */
export default function Privacidade() {
  return (
    <Card>
      <CardHeader>
        {/* `h1` dentro do título: o `CardTitle` é uma `div`, e esta é página
            pública, que o robô de busca e o leitor de tela leem pelo título
            (C7). */}
        <CardTitle>
          <h1>Aviso de privacidade</h1>
        </CardTitle>
        <CardDescription>Versão {AVISO_DE_PRIVACIDADE.versao}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm leading-relaxed">
        {AVISO_DE_PRIVACIDADE.rascunho ? (
          <Aviso tom="informacao">
            Este texto é um rascunho e ainda não passou por revisão jurídica.
            Ele será substituído pela versão final antes de o sistema receber
            dados de clientes reais.
          </Aviso>
        ) : null}

        <Secao titulo="Quando você envia uma mensagem por um anúncio">
          <p>
            Os dados vão para a imobiliária ou o corretor que publicou o
            anúncio. É essa empresa ou pessoa que decide como usá-los e que
            responde por eles. Este sistema guarda os dados em nome dela.
          </p>
        </Secao>

        <Secao titulo="Quais dados são guardados">
          <ul className="list-disc space-y-1 pl-5">
            <li>nome, telefone e e-mail que você informar;</li>
            <li>a mensagem, se escrever uma;</li>
            <li>o imóvel sobre o qual perguntou;</li>
            <li>a data e a hora do envio e a versão deste aviso;</li>
            <li>
              um código calculado a partir do endereço IP da sua conexão. O
              endereço em si não é guardado.
            </li>
          </ul>
        </Secao>

        <Secao titulo="Para que servem">
          <p>
            Para que a imobiliária ou o corretor responda ao seu contato e
            acompanhe o atendimento. A base legal é o seu consentimento, dado ao
            marcar a caixa do formulário. [A definir no parecer: se o contato
            pode ser usado para oferecer outros imóveis.]
          </p>
        </Secao>

        <Secao titulo="Com quem são compartilhados">
          <p>
            Os dados não são vendidos. Ficam em servidores de provedores de
            hospedagem contratados para operar o sistema. [A definir no parecer:
            lista de operadores e se há transferência internacional.]
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo">
          <p>[A definir no parecer.]</p>
        </Secao>

        <Secao titulo="Seus direitos">
          <p>
            Você pode pedir acesso, correção ou exclusão dos seus dados e
            retirar o consentimento a qualquer momento. O pedido vai à
            imobiliária ou ao corretor do anúncio, pelo contato que aparece na
            página dele. [A definir no parecer: canal do encarregado e prazo de
            resposta.]
          </p>
        </Secao>

        <Secao titulo="Para quem tem conta no sistema">
          <p>[A redigir: dados de cadastro, sessão e registro de atividade.]</p>
        </Secao>
      </CardContent>
    </Card>
  );
}

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-1.5">
      <h2 className="font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}
