import { Injectable } from '@nestjs/common';
import { podeFazer, type Acao, type JanelaDoResumo } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';
import { ImoveisService } from '../imoveis/imoveis.service';
import { LeadsService } from '../leads/leads.service';
import { TarefasService } from '../agenda/tarefas.service';
import { VisitasService } from '../agenda/visitas.service';
import type { EscopoDoNumero, RespostaDoResumo } from './resposta';

/**
 * Resumo do painel — item **B9**.
 *
 * ## Cinco perguntas, cinco escopos
 *
 * Este é o primeiro serviço do projeto que responde a mais de uma pergunta na
 * mesma requisição, e por isso é o primeiro que não cabe num `@Exige` só. Os
 * escopos divergem de verdade:
 *
 * | Número | Ação | `AGENT` | `MANAGER`+ |
 * |---|---|---|---|
 * | Clientes novos | `lead:ver` | `OWN` | `ORG` |
 * | Fila a distribuir | `lead:verNaoAtribuidos` | **`false`** | `ORG` |
 * | Imóveis em rascunho | `imovel:editar` | `OWN` | `ORG` |
 * | Visitas e tarefas | `negociacao:ver` | `OWN` | `ORG` |
 *
 * A saída é `paraAcao()`: cada número é calculado num contexto derivado, com a
 * ação que ele de fato representa e o escopo que a **matriz** dá àquela ação
 * para aquele papel. Nada aqui decide permissão por conta própria.
 *
 * ## Por que reaproveita os serviços em vez de consultar o banco
 *
 * Porque o recorte de visibilidade de cada recurso já existe, e escrevê-lo de
 * novo aqui criaria uma segunda versão de cada regra. O item B7 já mostrou o
 * custo disso na prática: um filtro escrito em dois lugares deixou o nome de um
 * cliente excluído sair por um dos dois caminhos. Um resumo com seis consultas
 * escritas à mão seria seis chances novas do mesmo erro — e num lugar onde o
 * erro é discreto, porque um contador errado não parece quebrado.
 *
 * A única consulta própria é a dos primeiros passos, que não tem recorte por
 * responsável: ela pergunta se a **organização** já começou a operar.
 */
@Injectable()
export class ResumoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imoveis: ImoveisService,
    private readonly leads: LeadsService,
    private readonly tarefas: TarefasService,
    private readonly visitas: VisitasService,
  ) {}

  /** Quantas visitas a lista do painel mostra antes de remeter à agenda. */
  private static readonly VISITAS_NO_PAINEL = 5;

  async montar(
    contexto: ContextoAutorizado,
    janela: JanelaDoResumo,
  ): Promise<RespostaDoResumo> {
    const alcancaAFila =
      podeFazer(contexto.papel, 'lead:verNaoAtribuidos') !== false;

    // Tudo em paralelo: são consultas independentes, e em série a tela
    // esperaria a soma dos tempos em vez do maior deles.
    const [
      clientesNovos,
      clientesNaFila,
      tarefasVencidas,
      imoveisEmRascunho,
      visitas,
      primeirosPassos,
    ] = await Promise.all([
      this.leads.contarNovos(this.paraAcao(contexto, 'lead:ver')),
      // A fila não é "zero" para quem não a alcança: é pergunta que não é
      // dele. Quem decide é a matriz, e o contador nem chega a rodar.
      alcancaAFila
        ? this.leads.contarNaoAtribuidos(
            this.paraAcao(contexto, 'lead:verNaoAtribuidos'),
          )
        : Promise.resolve(null),
      this.tarefas.contarVencidas(this.paraAcao(contexto, 'negociacao:ver')),
      this.imoveis.contarRascunhos(this.paraAcao(contexto, 'imovel:editar')),
      this.visitas.listar(this.paraAcao(contexto, 'negociacao:ver'), {
        de: janela.de,
        ate: janela.ate,
      }),
      this.contarPrimeirosPassos(contexto.organizationId),
    ]);

    return {
      escopos: {
        clientes: this.escopoDe(contexto, 'lead:ver'),
        imoveis: this.escopoDe(contexto, 'imovel:editar'),
        agenda: this.escopoDe(contexto, 'negociacao:ver'),
      },
      clientesNovos,
      clientesNaFila,
      tarefasVencidas,
      imoveisEmRascunho,
      visitas: {
        total: visitas.length,
        // A agenda já devolve ordenado por início, então cortar aqui pega as
        // mais próximas, e não cinco quaisquer.
        proximas: visitas.slice(0, ResumoService.VISITAS_NO_PAINEL),
      },
      primeirosPassos,
    };
  }

  /**
   * O mesmo contexto, com a ação e o escopo de **uma** das perguntas.
   *
   * É o que permite a um endpoint só respeitar quatro recortes diferentes sem
   * que nenhum serviço precise saber que está sendo chamado pelo resumo. Cada
   * um continua lendo `contexto.escopo`, como sempre fez; quem troca o escopo é
   * esta função, e ela o tira da matriz.
   *
   * O `escopo` cai para `OWN` quando a ação é `false` para o papel. Esse caso
   * não chega a acontecer hoje — a única ação `false` em jogo é a da fila, e
   * ela é conferida antes —, mas o padrão restritivo é o que evita que uma
   * mudança futura na matriz transforme uma recusa em acesso ampliado, calado.
   */
  private paraAcao(
    contexto: ContextoAutorizado,
    acao: Acao,
  ): ContextoAutorizado {
    const escopo = podeFazer(contexto.papel, acao);

    return {
      ...contexto,
      acao,
      escopo: escopo === false ? 'OWN' : escopo,
    };
  }

  private escopoDe(contexto: ContextoAutorizado, acao: Acao): EscopoDoNumero {
    return podeFazer(contexto.papel, acao) === 'ORG' ? 'ORG' : 'OWN';
  }

  /**
   * Três perguntas de existência sobre a organização.
   *
   * `findFirst` com `select: { id: true }`, e não `count`: a pergunta é "existe
   * algum?", e contar duzentos imóveis para responder "sim" é trabalho jogado
   * fora. Em organização nova as três consultas não encontram nada e voltam
   * rápido, que é exatamente o caso em que esta resposta importa.
   */
  private async contarPrimeirosPassos(organizationId: string): Promise<{
    temImovel: boolean;
    temImovelPublicado: boolean;
    temCliente: boolean;
  }> {
    const [imovel, publicado, cliente] = await Promise.all([
      this.prisma.property.findFirst({
        where: { organizationId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.property.findFirst({
        where: { organizationId, deletedAt: null, publishedAt: { not: null } },
        select: { id: true },
      }),
      this.prisma.lead.findFirst({
        where: { organizationId, deletedAt: null, anonymizedAt: null },
        select: { id: true },
      }),
    ]);

    return {
      temImovel: imovel !== null,
      temImovelPublicado: publicado !== null,
      temCliente: cliente !== null,
    };
  }
}
