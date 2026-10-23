'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FilePlus,
  FileText,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
} from 'lucide-react';
import {
  MAXIMO_DE_MIDIA_POR_IMOVEL,
  ROTULOS_DE_TIPO_DE_MIDIA,
  TAMANHO_MAXIMO_DE_MIDIA,
  type MediaKind,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErroDaApi, chamarApi } from '@/lib/api';
import {
  ehPublica,
  enviarMidia,
  formatarTamanho,
  recusaDoArquivo,
  tiposAceitosPara,
  type ListaDeMidia,
  type Midia,
} from '@/lib/midia';
import { cn } from '@/lib/utils';

/**
 * Fotos, plantas e documentos do imóvel — item **B4**.
 *
 * ## Duas seções, e a separação é a proteção
 *
 * [pages-and-navigation.md](../../../../docs/pages-and-navigation.md) §225 é
 * direto: a tela **deve** separar visualmente "fotos e plantas (públicas)" de
 * "documentos (internos)", "porque a consequência de confundir é expor
 * documento de proprietário".
 *
 * Então não é uma grade com etiquetas de tipo — são duas áreas, cada uma com o
 * próprio botão de envio e a própria frase dizendo para onde aquilo vai. Quem
 * envia a matrícula do imóvel escolhe "documento" antes de escolher o arquivo,
 * e não depois.
 *
 * ## Reordenar por botão, não arrastando
 *
 * Arrastar e soltar exigiria uma dependência nova e funciona mal em tela de
 * toque — e o aparelho do corretor é o celular. O caso real é escolher a
 * primeira foto, que é o que aparece no anúncio, e para isso "tornar capa"
 * resolve em um toque. As setas cobrem o ajuste fino.
 *
 * ## `<img>` comum, não `next/image`
 *
 * A URL de leitura é assinada e muda a cada carregamento da lista. O otimizador
 * do Next cacheia por URL: ele reotimizaria a mesma foto a cada visita,
 * gastando a CPU do plano compartilhado para produzir um arquivo que ele já
 * tinha sob outro nome.
 */

/** Um arquivo em trânsito. Existe só no navegador, nunca no banco. */
type ItemDaFila = {
  /** Identificador local. Não é id de mídia — ela ainda não existe. */
  chave: string;
  nome: string;
  arquivo: File;
  kind: MediaKind;
  situacao: 'esperando' | 'enviando' | 'falhou';
  mensagem?: string;
};

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'pronto' }
  | { situacao: 'erro'; mensagem: string };

export function GaleriaDeMidia({
  imovelId,
  podeEditar,
}: {
  imovelId: string;
  podeEditar: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });
  const [lista, setLista] = useState<Midia[]>([]);
  const [tentativa, setTentativa] = useState(0);
  const [fila, setFila] = useState<ItemDaFila[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  // Ver `aoFalharImagem`: a URL expira em uma hora, e a tela aberta a tarde
  // inteira mostraria imagem quebrada.
  const [recarregouPorExpiracao, setRecarregouPorExpiracao] = useState(false);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const resposta = await chamarApi<ListaDeMidia>(
          `/imoveis/${imovelId}/midia`,
        );

        if (ativo) {
          setLista(resposta.midias);
          setEstado({ situacao: 'pronto' });
        }
      } catch (erro) {
        if (ativo) {
          setEstado({
            situacao: 'erro',
            mensagem:
              erro instanceof ErroDaApi
                ? erro.message
                : 'Não foi possível carregar as fotos.',
          });
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, [imovelId, tentativa]);

  const recarregar = useCallback(async () => {
    const resposta = await chamarApi<ListaDeMidia>(
      `/imoveis/${imovelId}/midia`,
    );

    setLista(resposta.midias);
  }, [imovelId]);

  /**
   * Escolheu arquivos.
   *
   * Valida tudo antes de enviar nada, e recusa o excedente em vez de deixar o
   * servidor recusar o décimo primeiro depois de enviar dez: a pessoa precisa
   * saber o que não vai entrar **antes** de esperar o envio.
   */
  function aoEscolher(arquivos: FileList | null, kind: MediaKind) {
    setFalha(null);

    if (!arquivos || arquivos.length === 0) {
      return;
    }

    const vagas = MAXIMO_DE_MIDIA_POR_IMOVEL - lista.length;
    let aceitos = 0;

    const novos: ItemDaFila[] = Array.from(arquivos).map((arquivo, indice) => {
      const chave = `${Date.now()}-${indice}-${arquivo.name}`;
      const base = { chave, nome: arquivo.name, arquivo, kind };
      const recusa = recusaDoArquivo(arquivo, kind);

      if (recusa) {
        return { ...base, situacao: 'falhou' as const, mensagem: recusa };
      }

      if (aceitos >= vagas) {
        return {
          ...base,
          situacao: 'falhou' as const,
          mensagem: `O imóvel aceita ${MAXIMO_DE_MIDIA_POR_IMOVEL} arquivos, e já tem ${lista.length}.`,
        };
      }

      aceitos += 1;
      return { ...base, situacao: 'esperando' as const };
    });

    setFila((atual) => [...atual, ...novos]);

    if (aceitos > 0) {
      // O sinalizador liga aqui, em quem dispara, e desliga dentro da função
      // assíncrona — o ESLint deste projeto recusa `setState` síncrono no corpo
      // de um `useEffect`, e com razão.
      setEnviando(true);
      void processar(novos);
    }
  }

  /**
   * A fila, um arquivo por vez.
   *
   * Sequencial de propósito. Vinte envios de 5 MB em paralelo saturam o upload
   * de quem está num 4G e fazem todos falharem juntos; um a um, o que já entrou
   * está salvo, e dá para dizer em que arquivo a fila está.
   */
  async function processar(itens: ItemDaFila[]) {
    for (const item of itens) {
      if (item.situacao === 'falhou') {
        continue;
      }

      setFila((atual) =>
        atual.map((i) =>
          i.chave === item.chave ? { ...i, situacao: 'enviando' } : i,
        ),
      );

      try {
        const midia = await enviarMidia(
          imovelId,
          item.arquivo,
          item.kind,
          // Ver `enviarMidia`: a API não guarda o nome do arquivo, e para
          // documento é a única identificação que existe.
          item.kind === 'DOCUMENT'
            ? item.arquivo.name.slice(0, 255)
            : undefined,
        );

        setLista((atual) => [...atual, midia]);
        setFila((atual) => atual.filter((i) => i.chave !== item.chave));
      } catch (erro) {
        setFila((atual) =>
          atual.map((i) =>
            i.chave === item.chave
              ? {
                  ...i,
                  situacao: 'falhou',
                  mensagem:
                    erro instanceof ErroDaApi
                      ? erro.message
                      : 'Não foi possível enviar este arquivo.',
                }
              : i,
          ),
        );
      }
    }

    setEnviando(false);
  }

  /**
   * Define a capa.
   *
   * Recarrega a lista em vez de aproveitar a resposta, que traz só a mídia
   * promovida: definir capa **tira** a marca de outra, e a resposta de uma
   * mídia não diz qual. Atualizar só a que voltou deixaria duas capas na tela.
   */
  async function definirCapa(id: string) {
    setAgindo(id);
    setFalha(null);

    try {
      await chamarApi(`/imoveis/${imovelId}/midia/${id}/capa`, {
        metodo: 'POST',
      });
      await recarregar();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Não foi possível definir a capa.',
      );
    } finally {
      setAgindo(null);
    }
  }

  async function mover(id: string, direcao: -1 | 1) {
    const ids = novaOrdem(lista, id, direcao);

    if (!ids) {
      return;
    }

    setAgindo(id);
    setFalha(null);

    try {
      const resposta = await chamarApi<ListaDeMidia>(
        `/imoveis/${imovelId}/midia/ordem`,
        { metodo: 'POST', corpo: { ids } },
      );

      setLista(resposta.midias);
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Não foi possível mudar a ordem.',
      );
    } finally {
      setAgindo(null);
    }
  }

  /**
   * Remove.
   *
   * Recarrega pelo mesmo motivo da capa, e por um a mais: remover a capa
   * **promove a próxima** no servidor. Só a lista inteira diz qual é a nova.
   */
  async function remover(id: string) {
    setAgindo(id);
    setFalha(null);

    try {
      await chamarApi(`/imoveis/${imovelId}/midia/${id}`, {
        metodo: 'DELETE',
      });
      setConfirmando(null);
      await recarregar();
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Não foi possível remover o arquivo.',
      );
    } finally {
      setAgindo(null);
    }
  }

  async function salvarTexto(id: string, texto: string) {
    setAgindo(id);
    setFalha(null);

    try {
      const atualizada = await chamarApi<Midia>(
        `/imoveis/${imovelId}/midia/${id}`,
        {
          metodo: 'PATCH',
          // Vazio apaga. `''` seria um texto alternativo em branco, que o
          // leitor de tela anuncia como se houvesse descrição.
          corpo: {
            textoAlternativo: texto.trim() === '' ? null : texto.trim(),
          },
        },
      );

      setLista((atual) => atual.map((m) => (m.id === id ? atualizada : m)));
    } catch (erro) {
      setFalha(
        erro instanceof ErroDaApi
          ? erro.message
          : 'Não foi possível salvar a descrição.',
      );
    } finally {
      setAgindo(null);
    }
  }

  /**
   * A imagem não carregou.
   *
   * O caso esperado é a URL assinada ter expirado — ela vale uma hora, e esta
   * tela fica aberta. Recarregar a lista traz URLs novas. **Uma vez só**: se o
   * objeto não existe mais, recarregar em laço transformaria um arquivo perdido
   * numa tela que consome a API para sempre.
   */
  function aoFalharImagem() {
    if (recarregouPorExpiracao || enviando) {
      return;
    }

    setRecarregouPorExpiracao(true);
    void recarregar().catch(() => undefined);
  }

  if (estado.situacao === 'carregando') {
    return (
      <div className="grid gap-4" aria-busy="true" aria-live="polite">
        <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
        <div className="bg-muted h-48 animate-pulse rounded-xl" />
        <span className="sr-only">Carregando as fotos...</span>
      </div>
    );
  }

  if (estado.situacao === 'erro') {
    return (
      <div className="grid gap-3">
        <Aviso tom="erro">{estado.mensagem}</Aviso>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTentativa((n) => n + 1)}
          >
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  const publicas = lista.filter((m) => ehPublica(m.kind));
  const documentos = lista.filter((m) => !ehPublica(m.kind));
  const lotado = lista.length >= MAXIMO_DE_MIDIA_POR_IMOVEL;

  const acoes = {
    podeEditar,
    agindo,
    confirmando,
    aoConfirmar: setConfirmando,
    aoRemover: remover,
    aoDefinirCapa: definirCapa,
    aoMover: mover,
    aoSalvarTexto: salvarTexto,
    aoFalharImagem,
  };

  return (
    <div className="grid gap-6">
      {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fotos e plantas</CardTitle>
          <CardDescription>
            Estas imagens aparecem no anúncio público. A capa é a primeira que o
            visitante vê, e a descrição de cada uma é lida por leitor de tela e
            mostrada quando a imagem não carrega.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {publicas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma foto ainda. Imóvel sem foto não é visitado.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {publicas.map((midia, indice) => (
                <CartaoDeImagem
                  key={midia.id}
                  midia={midia}
                  primeira={indice === 0}
                  ultima={indice === publicas.length - 1}
                  {...acoes}
                />
              ))}
            </ul>
          )}

          {podeEditar ? (
            <div className="flex flex-wrap gap-2">
              <EscolherArquivo
                rotulo="Adicionar fotos"
                kind="PHOTO"
                multiplo
                desabilitado={enviando || lotado}
                aoEscolher={aoEscolher}
              />
              <EscolherArquivo
                rotulo="Adicionar planta"
                kind="FLOORPLAN"
                multiplo
                variante="outline"
                desabilitado={enviando || lotado}
                aoEscolher={aoEscolher}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos</CardTitle>
          <CardDescription>
            Matrícula, contrato, laudo. Ficam dentro do sistema: documento nunca
            vai ao anúncio público nem ao catálogo. A identificação é como cada
            um aparece nesta lista.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {documentos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum documento anexado.
            </p>
          ) : (
            <ul className="grid gap-2">
              {documentos.map((midia) => (
                <LinhaDeDocumento key={midia.id} midia={midia} {...acoes} />
              ))}
            </ul>
          )}

          {podeEditar ? (
            <div>
              <EscolherArquivo
                rotulo="Adicionar documento"
                kind="DOCUMENT"
                multiplo
                variante="outline"
                desabilitado={enviando || lotado}
                aoEscolher={aoEscolher}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {fila.length > 0 ? (
        <Fila
          itens={fila}
          aoDispensar={(chave) =>
            setFila((atual) => atual.filter((i) => i.chave !== chave))
          }
        />
      ) : null}

      <p className="text-muted-foreground text-xs">
        {lista.length} de {MAXIMO_DE_MIDIA_POR_IMOVEL} arquivos ·{' '}
        {formatarTamanho(TAMANHO_MAXIMO_DE_MIDIA)} por arquivo · JPEG, PNG, WebP
        e PDF
      </p>
    </div>
  );
}

/**
 * A nova ordem completa, com dois vizinhos trocados.
 *
 * Duas coisas que não são evidentes e quebram se mudarem:
 *
 * 1. **A API exige a lista inteira** — todas as mídias do imóvel, sem repetir,
 *    documentos incluídos. Mandar só as públicas é recusado com 400. Então os
 *    documentos viajam nas posições em que já estavam
 * 2. **O vizinho é o do mesmo grupo.** Trocar com o elemento adjacente do array
 *    poderia trocar uma foto com um documento, e a foto "sairia" da seção dela
 *    sem sair — ela só mudaria de posição num lugar onde a ordem não é mostrada
 */
function novaOrdem(
  lista: Midia[],
  id: string,
  direcao: -1 | 1,
): string[] | null {
  const indice = lista.findIndex((m) => m.id === id);

  if (indice < 0) {
    return null;
  }

  const grupo = ehPublica(lista[indice].kind);
  let vizinho = -1;

  for (let i = indice + direcao; i >= 0 && i < lista.length; i += direcao) {
    if (ehPublica(lista[i].kind) === grupo) {
      vizinho = i;
      break;
    }
  }

  if (vizinho < 0) {
    return null;
  }

  const ids = lista.map((m) => m.id);
  [ids[indice], ids[vizinho]] = [ids[vizinho], ids[indice]];

  return ids;
}

type Acoes = {
  podeEditar: boolean;
  agindo: string | null;
  confirmando: string | null;
  aoConfirmar: (id: string | null) => void;
  aoRemover: (id: string) => void;
  aoDefinirCapa: (id: string) => void;
  aoMover: (id: string, direcao: -1 | 1) => void;
  aoSalvarTexto: (id: string, texto: string) => void;
  aoFalharImagem: () => void;
};

function CartaoDeImagem({
  midia,
  primeira,
  ultima,
  podeEditar,
  agindo,
  confirmando,
  aoConfirmar,
  aoRemover,
  aoDefinirCapa,
  aoMover,
  aoSalvarTexto,
  aoFalharImagem,
}: Acoes & { midia: Midia; primeira: boolean; ultima: boolean }) {
  const ocupada = agindo === midia.id;
  const ehPdf = midia.contentType === 'application/pdf';

  return (
    <li className="border-border grid gap-2 rounded-lg border p-2">
      <div className="bg-muted relative aspect-[4/3] overflow-hidden rounded-md">
        {ehPdf ? (
          // Planta em PDF não tem miniatura. Um ícone e um link honestos valem
          // mais do que um quadrado cinza que parece imagem que não carregou.
          <a
            href={midia.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground flex h-full flex-col items-center justify-center gap-1 text-xs"
          >
            <FileText aria-hidden="true" className="size-6" />
            Abrir planta
          </a>
        ) : (
          // Abre em tamanho real. A miniatura é recortada em 4:3 pelo
          // `object-cover`, e quem cadastra precisa conferir a foto inteira —
          // é nela que se vê o dedo na lente e o reflexo no vidro.
          <a href={midia.url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL
                assinada que muda a cada leitura; ver a nota sobre `next/image`
                no topo. */}
            <img
              src={midia.url}
              alt={midia.textoAlternativo ?? ''}
              width={midia.largura ?? undefined}
              height={midia.altura ?? undefined}
              loading="lazy"
              onError={aoFalharImagem}
              className="h-full w-full object-cover"
            />
          </a>
        )}

        {/*
          Fundo sólido do tema, e não a cor da marca: a etiqueta fica **por
          cima da foto**, e o azul-marinho do `default` desaparecia numa foto
          escura — que é metade das fotos de imóvel. A sombra separa a etiqueta
          de fundos claros, e a borda, de fundos da mesma cor dela.
        */}
        {midia.ehCapa ? (
          <Badge className="bg-background text-foreground border-border absolute top-1 left-1 shadow-sm">
            Capa
          </Badge>
        ) : null}

        {midia.kind === 'FLOORPLAN' ? (
          <Badge className="bg-background text-foreground border-border absolute top-1 right-1 shadow-sm">
            {ROTULOS_DE_TIPO_DE_MIDIA.FLOORPLAN}
          </Badge>
        ) : null}
      </div>

      {podeEditar ? (
        <>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={primeira || ocupada}
              onClick={() => aoMover(midia.id, -1)}
              aria-label="Mover para antes"
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={ultima || ocupada}
              onClick={() => aoMover(midia.id, 1)}
              aria-label="Mover para depois"
            >
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={midia.ehCapa || ocupada}
              onClick={() => aoDefinirCapa(midia.id)}
              aria-label={midia.ehCapa ? 'Já é a capa' : 'Tornar capa'}
              title="Tornar capa"
            >
              <Star
                aria-hidden="true"
                className={cn(midia.ehCapa && 'fill-current')}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive ml-auto"
              disabled={ocupada}
              onClick={() => aoConfirmar(midia.id)}
              aria-label="Remover"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>

          {confirmando === midia.id ? (
            <Confirmacao
              ocupada={ocupada}
              aoCancelar={() => aoConfirmar(null)}
              aoRemover={() => aoRemover(midia.id)}
            />
          ) : (
            <TextoAlternativo
              midia={midia}
              rotulo="Descrição"
              ocupada={ocupada}
              aoSalvar={aoSalvarTexto}
            />
          )}
        </>
      ) : midia.textoAlternativo ? (
        <p className="text-muted-foreground truncate text-xs">
          {midia.textoAlternativo}
        </p>
      ) : null}
    </li>
  );
}

function LinhaDeDocumento({
  midia,
  podeEditar,
  agindo,
  confirmando,
  aoConfirmar,
  aoRemover,
  aoSalvarTexto,
}: Acoes & { midia: Midia }) {
  const ocupada = agindo === midia.id;

  return (
    <li className="border-border grid gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <FileText
          aria-hidden="true"
          className="text-muted-foreground size-5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            {midia.textoAlternativo ?? 'Documento sem identificação'}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatarTamanho(midia.tamanhoEmBytes)}
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <a href={midia.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" />
            Abrir
          </a>
        </Button>

        {podeEditar ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive"
            disabled={ocupada}
            onClick={() => aoConfirmar(midia.id)}
            aria-label="Remover documento"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {podeEditar ? (
        confirmando === midia.id ? (
          <Confirmacao
            ocupada={ocupada}
            aoCancelar={() => aoConfirmar(null)}
            aoRemover={() => aoRemover(midia.id)}
          />
        ) : (
          <TextoAlternativo
            midia={midia}
            rotulo="Identificação"
            ocupada={ocupada}
            aoSalvar={aoSalvarTexto}
          />
        )
      ) : null}
    </li>
  );
}

/**
 * O campo de texto da mídia.
 *
 * O botão só habilita quando o texto mudou. Gravar no `blur` pareceria mais
 * prático e seria pior: a pessoa não sabe se salvou, e um clique fora da caixa
 * não é um pedido para gravar.
 *
 * **Sem texto de ajuda por item.** Ele existia e foi retirado ao ver a tela
 * cheia: a mesma frase repetida embaixo de cada uma das vinte imagens é ruído,
 * e o espaço que ela ocupa tira foto do campo de visão. A explicação aparece
 * uma vez, na descrição da seção. O `<label>` continua em cada campo, porque
 * isso não é decoração — é o que liga o rótulo ao campo para o leitor de tela.
 */
function TextoAlternativo({
  midia,
  rotulo,
  ocupada,
  aoSalvar,
}: {
  midia: Midia;
  rotulo: string;
  ocupada: boolean;
  aoSalvar: (id: string, texto: string) => void;
}) {
  const original = midia.textoAlternativo ?? '';
  const [texto, setTexto] = useState(original);

  const mudou = texto.trim() !== original.trim();

  return (
    <div className="grid gap-1">
      <Label htmlFor={`texto-${midia.id}`} className="text-xs">
        {rotulo}
      </Label>
      <div className="flex gap-1">
        <Input
          id={`texto-${midia.id}`}
          value={texto}
          maxLength={255}
          onChange={(evento) => setTexto(evento.target.value)}
          className="h-8 text-xs"
        />
        {mudou ? (
          <Button
            size="sm"
            disabled={ocupada}
            onClick={() => aoSalvar(midia.id, texto)}
          >
            Salvar
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Confirmação de remoção, no lugar do próprio item.
 *
 * Em vez de `window.confirm`, que não combina com o resto do painel e cujo
 * texto não dá para escrever. A remoção apaga o objeto do armazenamento e não
 * tem desfazer — por isso ela pede confirmação, ao contrário das outras ações
 * desta tela.
 */
function Confirmacao({
  ocupada,
  aoCancelar,
  aoRemover,
}: {
  ocupada: boolean;
  aoCancelar: () => void;
  aoRemover: () => void;
}) {
  return (
    <div className="grid gap-2" role="group" aria-label="Confirmar remoção">
      <p className="text-xs">Remover este arquivo? Não há como desfazer.</p>
      <div className="flex gap-1">
        <Button
          variant="destructive"
          size="sm"
          disabled={ocupada}
          onClick={aoRemover}
        >
          {ocupada ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          Remover
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={ocupada}
          onClick={aoCancelar}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * O seletor de arquivo.
 *
 * Um `<label>` com a aparência de botão e o `<input type="file">` em `sr-only`.
 * O `display: none` esconderia o campo do teclado também; `sr-only` o mantém
 * focável, e o `focus-within` desenha o foco no rótulo, que é o que se vê.
 *
 * `value = ''` depois de escolher: sem isso, escolher o mesmo arquivo de novo
 * — depois de uma falha, que é justamente quando se repete — não dispara
 * `change`, e a tela ficaria parada sem explicação.
 */
function EscolherArquivo({
  rotulo,
  kind,
  multiplo,
  variante = 'default',
  desabilitado,
  aoEscolher,
}: {
  rotulo: string;
  kind: MediaKind;
  multiplo?: boolean;
  variante?: 'default' | 'outline';
  desabilitado?: boolean;
  aoEscolher: (arquivos: FileList | null, kind: MediaKind) => void;
}) {
  const Icone = kind === 'DOCUMENT' ? FilePlus : ImagePlus;

  return (
    <label
      className={cn(
        buttonVariants({ variant: variante, size: 'sm' }),
        'focus-within:ring-ring/50 cursor-pointer focus-within:ring-[3px]',
        desabilitado && 'pointer-events-none opacity-50',
      )}
    >
      <Icone aria-hidden="true" />
      {rotulo}
      <input
        type="file"
        className="sr-only"
        accept={tiposAceitosPara(kind)}
        multiple={multiplo}
        disabled={desabilitado}
        onChange={(evento) => {
          aoEscolher(evento.target.files, kind);
          evento.target.value = '';
        }}
      />
    </label>
  );
}

/**
 * O que está sendo enviado, e o que falhou.
 *
 * O que entrou sai desta lista e aparece na grade — ela mostra só o que ainda
 * não chegou. O item que falhou **fica**, com o motivo: some apenas quando a
 * pessoa dispensa, porque uma falha que desaparece sozinha é uma foto que ela
 * acha que enviou.
 */
function Fila({
  itens,
  aoDispensar,
}: {
  itens: ItemDaFila[];
  aoDispensar: (chave: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Envio</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2" aria-live="polite">
          {itens.map((item) => (
            <li key={item.chave} className="flex items-center gap-2 text-sm">
              {item.situacao === 'enviando' ? (
                <Loader2
                  aria-hidden="true"
                  className="size-4 shrink-0 animate-spin"
                />
              ) : (
                <FileText
                  aria-hidden="true"
                  className="text-muted-foreground size-4 shrink-0"
                />
              )}

              <span className="min-w-0 flex-1 truncate">{item.nome}</span>

              {item.situacao === 'falhou' ? (
                <>
                  <span className="text-destructive text-xs">
                    {item.mensagem}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => aoDispensar(item.chave)}
                    aria-label={`Dispensar ${item.nome}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {item.situacao === 'enviando' ? 'enviando...' : 'na fila'}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
