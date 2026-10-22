'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleCheck,
  Clock,
  ListChecks,
  Rocket,
  TriangleAlert,
  UserRound,
  Users,
} from 'lucide-react';
import { ROTULOS_DE_PAPEL, ROTULOS_DE_STATUS_DE_VISITA } from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  agruparPorDia,
  ehHoje,
  formatarDiaLongo,
  formatarHora,
  type Visita,
} from '@/lib/agenda';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  janelaDeHojeEAmanha,
  plural,
  type EscopoDoNumero,
  type Resumo,
} from '@/lib/painel';
import { useSessao } from '@/lib/sessao-do-painel';
import { cn } from '@/lib/utils';

/**
 * `/painel` — o dashboard (item **B9**).
 *
 * ## O que ele responde
 *
 * Uma pergunta só: **o que exige atenção agora?** Não é relatório, e por isso
 * não há gráfico nem comparação com o mês passado — isso é outra tela, para
 * outro momento. Aqui tudo é coisa parada: cliente sem primeiro contato, fila
 * sem dono, prazo vencido, cadastro não terminado, visita marcada para hoje.
 *
 * ## O conteúdo muda com o papel, porque a urgência muda com o papel
 *
 * É o que o §5 de [pages-and-navigation.md](../../../../docs/pages-and-navigation.md)
 * pede, e quem decide é o servidor: cada número vem com o escopo que a matriz
 * dá à ação correspondente. A tela usa `escopos` apenas para escrever a frase
 * certa em volta — "seus clientes" ou "da equipe". Decidir o recorte aqui, pelo
 * papel, seria repetir a matriz no lugar errado.
 *
 * A fila a distribuir chega como `null` para quem não a alcança, e aí o cartão
 * não existe. `0` seria pior do que omitir: afirmaria que a fila está vazia.
 *
 * ## Zero não é notícia; pendência é
 *
 * Cartão de número só aparece quando há número. Um painel que mostra quatro
 * zeros ocupa a tela inteira para dizer "nada a fazer" — e ensina a pessoa a
 * não olhar. Quando não há pendência nenhuma, a tela diz isso em uma linha e dá
 * espaço à agenda do dia, que é o que sobra de útil.
 *
 * ## Organização nova vê um guia, não um painel de zeros
 *
 * Exigência explícita do §5. Quem acabou de se cadastrar não tem imóvel nem
 * cliente, e "0 / 0 / 0" não diz o que fazer. A decisão de qual tela mostrar
 * vem de `primeirosPassos`, que o servidor calcula sobre a **organização** — e
 * não sobre o que é da pessoa. Para o corretor recém-contratado numa
 * imobiliária povoada, a casa já opera: ele vê o painel, não um guia mandando
 * cadastrar o primeiro imóvel de uma empresa com duzentos.
 */

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto'; resumo: Resumo }
  | { situacao: 'erro'; mensagem: string };

export default function Painel() {
  const { organizacaoAtiva, papel } = useSessao();

  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const resumo = await chamarApi<Resumo>(
          `/painel/resumo?${janelaDeHojeEAmanha()}`,
        );

        if (ativo) {
          setEstado({ situacao: 'pronto', resumo });
        }
      } catch (erro) {
        if (!ativo) {
          return;
        }

        setEstado({
          situacao: 'erro',
          mensagem:
            erro instanceof ErroDaApi
              ? erro.message
              : 'Nao foi possivel carregar o painel.',
        });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-navy text-2xl font-semibold tracking-tight dark:text-foreground">
        {organizacaoAtiva.nome}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Voce esta como {ROTULOS_DE_PAPEL[papel].toLowerCase()}.
      </p>

      <div className="mt-8">
        {estado.situacao === 'carregando' ? (
          <div className="grid gap-4" aria-busy="true" aria-live="polite">
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-muted h-24 animate-pulse rounded-xl"
                />
              ))}
            </div>
            <div className="bg-muted h-48 animate-pulse rounded-xl" />
            <span className="sr-only">Carregando o painel...</span>
          </div>
        ) : null}

        {estado.situacao === 'erro' ? (
          <div className="grid gap-3">
            <Aviso tom="erro">{estado.mensagem}</Aviso>
            <div>
              <Button variant="outline" size="sm" onClick={recarregar}>
                Tentar de novo
              </Button>
            </div>
          </div>
        ) : null}

        {estado.situacao === 'pronto' ? (
          <Conteudo resumo={estado.resumo} />
        ) : null}
      </div>
    </div>
  );
}

function Conteudo({ resumo }: { resumo: Resumo }) {
  const { primeirosPassos } = resumo;

  // A casa que ainda nao comecou: nenhum imovel e nenhum cliente. Nao basta
  // faltar um dos dois — quem tem imovel cadastrado e nenhum cliente ja esta
  // operando, e merece o painel com a pendencia apontada, nao um guia.
  if (!primeirosPassos.temImovel && !primeirosPassos.temCliente) {
    return <Guia primeirosPassos={primeirosPassos} />;
  }

  const pendencias =
    resumo.clientesNovos +
    (resumo.clientesNaFila ?? 0) +
    resumo.tarefasVencidas +
    resumo.imoveisEmRascunho;

  return (
    <div className="grid gap-8">
      {pendencias === 0 ? (
        <Aviso tom="sucesso">
          Nada em aberto: sem cliente esperando contato, sem prazo vencido e sem
          cadastro pela metade.
        </Aviso>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumo.tarefasVencidas > 0 ? (
            <Numero
              tom="alerta"
              icone={TriangleAlert}
              valor={resumo.tarefasVencidas}
              rotulo={
                resumo.tarefasVencidas === 1
                  ? 'tarefa vencida'
                  : 'tarefas vencidas'
              }
              detalhe={
                resumo.escopos.agenda === 'OWN'
                  ? 'Suas, com prazo no passado.'
                  : 'Da equipe, com prazo no passado.'
              }
              href="/painel/tarefas"
              acao="Ver o que esta atrasado"
            />
          ) : null}

          {resumo.clientesNaFila !== null && resumo.clientesNaFila > 0 ? (
            <Numero
              tom="destaque"
              icone={Users}
              valor={resumo.clientesNaFila}
              rotulo={
                resumo.clientesNaFila === 1
                  ? 'cliente a distribuir'
                  : 'clientes a distribuir'
              }
              detalhe="Ninguem ficou responsavel. Enquanto esperam, ninguem liga."
              href="/painel/leads"
              acao="Distribuir agora"
            />
          ) : null}

          {resumo.clientesNovos > 0 ? (
            <Numero
              icone={UserRound}
              valor={resumo.clientesNovos}
              rotulo={
                resumo.clientesNovos === 1 ? 'cliente novo' : 'clientes novos'
              }
              detalhe={
                resumo.escopos.clientes === 'OWN'
                  ? 'Seus, aguardando o primeiro contato.'
                  : 'Da organizacao, aguardando o primeiro contato.'
              }
              href="/painel/leads"
              acao="Ver clientes"
            />
          ) : null}

          {resumo.imoveisEmRascunho > 0 ? (
            <Numero
              icone={Building2}
              valor={resumo.imoveisEmRascunho}
              rotulo={
                resumo.imoveisEmRascunho === 1
                  ? 'imovel em rascunho'
                  : 'imoveis em rascunho'
              }
              detalhe={
                resumo.escopos.imoveis === 'OWN'
                  ? 'Cadastros seus que ainda nao foram publicados.'
                  : 'Cadastros da casa que ainda nao foram publicados.'
              }
              href="/painel/imoveis"
              acao="Terminar cadastro"
            />
          ) : null}
        </div>
      )}

      <Agenda visitas={resumo.visitas} escopo={resumo.escopos.agenda} />

      {/* O guia continua visivel enquanto algum passo falta, mas como um
          cartao ao lado do painel — e nao no lugar dele. A casa que tem
          imovel e cliente ja opera; esconder os numeros dela para repetir
          instrucao seria trocar informacao por tutorial. */}
      {!primeirosPassos.temImovelPublicado ? (
        <Card className="border-gold/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket aria-hidden="true" className="size-4" />
              Nenhum imovel no ar
            </CardTitle>
            <CardDescription>
              Imovel em rascunho nao aparece para ninguem fora da organizacao.
              Publicar e o que o coloca na vitrine quando ela existir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/imoveis">
                Ver imoveis
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Um número com o que fazer a respeito.
 *
 * Número sem ação é informação que não vira trabalho: cada cartão leva à tela
 * onde a pendência se resolve. O tom muda o que salta — vermelho para prazo
 * perdido, dourado para o que depende de uma decisão de quem coordena.
 */
function Numero({
  tom = 'neutro',
  icone: Icone,
  valor,
  rotulo,
  detalhe,
  href,
  acao,
}: {
  tom?: 'neutro' | 'destaque' | 'alerta';
  icone: typeof Users;
  valor: number;
  rotulo: string;
  detalhe: string;
  href: string;
  acao: string;
}) {
  return (
    <Card
      className={cn(
        tom === 'alerta' && 'border-destructive/40',
        tom === 'destaque' && 'border-gold/50',
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-baseline gap-2 text-base">
          <Icone
            aria-hidden="true"
            className={cn(
              'size-4 self-center',
              tom === 'alerta' && 'text-destructive',
            )}
          />
          <span className="text-2xl font-semibold tracking-tight">{valor}</span>
          <span className="font-normal">{rotulo}</span>
        </CardTitle>
        <CardDescription>{detalhe}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" size="sm">
          <Link href={href}>
            {acao}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * A agenda de hoje e amanhã.
 *
 * Vem a lista, e não a contagem: "duas visitas amanhã" não diz com quem nem
 * onde, e é isso que a pessoa abre o painel para saber. O agrupamento por dia
 * usa o mesmo utilitário da tela de agenda, então "hoje" e "amanhã" são
 * decididos pelo relógio de quem olha.
 */
function Agenda({
  visitas,
  escopo,
}: {
  visitas: { total: number; proximas: Visita[] };
  escopo: EscopoDoNumero;
}) {
  return (
    <section aria-labelledby="agenda-do-painel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="agenda-do-painel"
          className="flex items-center gap-2 text-base font-semibold"
        >
          <CalendarDays aria-hidden="true" className="size-4" />
          Hoje e amanha
        </h2>

        <Button asChild variant="ghost" size="sm">
          <Link href="/painel/agenda">
            Agenda completa
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>

      {visitas.proximas.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">
            {escopo === 'OWN'
              ? 'Nenhuma visita sua hoje ou amanha.'
              : 'Nenhuma visita marcada para hoje ou amanha.'}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Visita e o que move negociacao. Marque a partir do imovel ou da
            ficha do cliente.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/painel/agenda/nova">Agendar visita</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid gap-4">
          {agruparPorDia(visitas.proximas).map(([dia, doDia]) => (
            <div key={dia}>
              <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-medium first-letter:uppercase">
                {formatarDiaLongo(doDia[0].inicioEm)}
                {ehHoje(doDia[0].inicioEm) ? (
                  <Badge variant="secondary">Hoje</Badge>
                ) : null}
              </h3>

              <ul className="mt-2 grid gap-2">
                {doDia.map((visita) => (
                  <li key={visita.id}>
                    <Link
                      href={`/painel/agenda/${visita.id}`}
                      className="bg-card hover:border-ring focus-visible:ring-ring block rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <Clock
                            aria-hidden="true"
                            className="size-3.5 shrink-0"
                          />
                          {formatarHora(visita.inicioEm)}
                        </span>

                        {visita.situacao === 'SCHEDULED' ? null : (
                          <Badge variant="secondary">
                            {ROTULOS_DE_STATUS_DE_VISITA[visita.situacao]}
                          </Badge>
                        )}
                      </div>

                      <p className="mt-1 truncate text-sm">
                        <span className="text-muted-foreground font-mono text-xs">
                          {visita.imovel.codigo}
                        </span>{' '}
                        {visita.imovel.titulo}
                      </p>

                      <p className="text-muted-foreground mt-1 truncate text-xs">
                        {visita.cliente
                          ? visita.cliente.nomeCompleto
                          : 'Sem cliente cadastrado'}
                        {visita.minha ? '' : ` · ${visita.responsavel.nome}`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {visitas.total > visitas.proximas.length ? (
            <p className="text-muted-foreground text-xs">
              e mais{' '}
              {plural(
                visitas.total - visitas.proximas.length,
                'visita neste periodo',
                'visitas neste periodo',
              )}
              .
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * Primeiros passos, para a organização que ainda não tem nada.
 *
 * Três passos na ordem em que fazem sentido, com o seguinte sempre visível —
 * e não um por vez, porque esconder o que vem depois faz a pessoa não saber
 * onde está sendo levada. O passo cumprido fica marcado em vez de desaparecer:
 * é o que mostra progresso.
 *
 * A vitrine **não** aparece aqui, por mais tentador que seja: ela é a Fase 3 e
 * não existe. Guia que promete tela inexistente gasta a confiança que ele
 * deveria construir.
 */
function Guia({
  primeirosPassos,
}: {
  primeirosPassos: Resumo['primeirosPassos'];
}) {
  const passos = [
    {
      feito: primeirosPassos.temImovel,
      titulo: 'Cadastre o primeiro imovel',
      detalhe:
        'Titulo, tipo, finalidade e onde fica. Area e dormitorios podem ficar para depois.',
      href: '/painel/imoveis/novo',
      acao: 'Cadastrar imovel',
    },
    {
      feito: primeirosPassos.temImovelPublicado,
      titulo: 'Publique o anuncio',
      detalhe:
        'Rascunho fica visivel so para a sua organizacao. Publicar e o passo que o deixa pronto para divulgacao.',
      href: '/painel/imoveis',
      acao: 'Ver imoveis',
    },
    {
      feito: primeirosPassos.temCliente,
      titulo: 'Registre o primeiro cliente',
      detalhe:
        'Telefone ou e-mail basta. A partir dele vem a negociacao, a visita e o historico do atendimento.',
      href: '/painel/leads/novo',
      acao: 'Cadastrar cliente',
    },
  ];

  const proximo = passos.find((passo) => !passo.feito);

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Rocket aria-hidden="true" className="size-5" />
          Primeiros passos
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Sua organizacao esta vazia — e isso e esperado. Sao tres passos ate
          ela comecar a trabalhar.
        </p>
      </div>

      <ol className="grid gap-3">
        {passos.map((passo, indice) => (
          <li key={passo.titulo}>
            <Card className={cn(passo === proximo && 'border-gold/50')}>
              <CardHeader>
                <CardTitle className="flex items-start gap-2 text-base">
                  {passo.feito ? (
                    <CircleCheck
                      aria-hidden="true"
                      className="text-success mt-0.5 size-4 shrink-0"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground bg-muted mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                    >
                      {indice + 1}
                    </span>
                  )}
                  <span className={cn(passo.feito && 'text-muted-foreground')}>
                    {passo.titulo}
                  </span>
                  {passo.feito ? (
                    <span className="sr-only">(concluido)</span>
                  ) : null}
                </CardTitle>
                <CardDescription>{passo.detalhe}</CardDescription>
              </CardHeader>

              {passo.feito ? null : (
                <CardContent>
                  <Button
                    asChild
                    size="sm"
                    variant={passo === proximo ? 'default' : 'outline'}
                  >
                    <Link href={passo.href}>
                      {passo.acao}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              )}
            </Card>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks aria-hidden="true" className="size-4" />
            Depois disso
          </CardTitle>
          <CardDescription>
            O funil acompanha cada negocio, a agenda guarda as visitas e as
            tarefas lembram o que nao pode ser esquecido. Tudo fica no menu, a
            esquerda.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
