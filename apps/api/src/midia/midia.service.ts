import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EXTENSAO_POR_TIPO,
  MAXIMO_DE_MIDIA_POR_IMOVEL,
  MIDIA_PUBLICA,
  type EntradaDeAtualizarMidia,
  type EntradaDePedirUrlDeUpload,
  type EntradaDeRegistrarMidia,
  type EntradaDeReordenarMidia,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { NaoEncontrado } from '../comum/nao-encontrado';
import { AutorizacaoService } from '../autorizacao/autorizacao.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';
import { ArmazenamentoDeMidia } from './armazenamento-de-midia';
import { paraRespostaDeMidia, type RespostaDeMidia } from './resposta';

/**
 * Fotos e documentos do imóvel — item **B4**.
 *
 * ## A chave do objeto é montada aqui, e conferida na volta
 *
 * `organizacoes/<organizationId>/imoveis/<propertyId>/<uuid>.<ext>`
 *
 * O prefixo não é organização de pasta: é o que torna possível **conferir** a
 * chave que o cliente devolve no passo de registro. Entre pedir a URL e
 * registrar, a chave passa pelo navegador, e chave vinda do cliente é pedido,
 * não declaração — sem a conferência, alguém poderia registrar, no imóvel dele,
 * uma chave de outra organização, e a resposta passaria a servir aquele objeto.
 *
 * O `uuid` evita adivinhação: no adaptador local e num bucket com leitura
 * pública, conhecer a chave é poder ler o objeto. Chave previsível
 * (`.../foto-1.jpg`) deixaria qualquer um enumerar as fotos de uma organização.
 *
 * ## A capa nasce sozinha, e nunca fica vazia
 *
 * A primeira mídia pública de um imóvel vira capa, e remover a capa promove a
 * próxima. O banco já exigia "no máximo um `true` por imóvel"; o que isto
 * acrescenta é não deixar o imóvel **sem** capa depois de uma remoção — anúncio
 * sem capa não tem o que mostrar na lista do catálogo, e ninguém se lembra de
 * voltar para marcar.
 *
 * `DOCUMENT` nunca é capa: matrícula não é vitrine (`MIDIA_PUBLICA`).
 */

const SELECAO_DE_MIDIA = {
  id: true,
  kind: true,
  objectKey: true,
  position: true,
  isCover: true,
  altText: true,
  width: true,
  height: true,
  byteSize: true,
  contentType: true,
  createdAt: true,
} satisfies Prisma.PropertyMediaSelect;

@Injectable()
export class MidiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacao: AutorizacaoService,
    private readonly armazenamento: ArmazenamentoDeMidia,
  ) {}

  /**
   * Passo 1: autoriza e assina.
   *
   * Nada é gravado aqui. O limite é conferido **antes** de assinar, porque
   * assinar é autorizar o envio: deixar passar e recusar no registro faria a
   * pessoa esperar o upload de 5 MB para então ouvir que não cabia.
   */
  async urlDeUpload(
    contexto: ContextoAutorizado,
    imovelId: string,
    dados: EntradaDePedirUrlDeUpload,
  ) {
    await this.conferirImovel(contexto, imovelId);
    await this.recusarSeLotado(imovelId);

    const extensao = EXTENSAO_POR_TIPO[dados.contentType];

    if (!extensao) {
      // O schema compartilhado ja recusa tipo nao aceito; isto cobre o caso de
      // alguem acrescentar um tipo na lista e esquecer a extensao.
      throw new BadRequestException({
        mensagem: 'Dados invalidos.',
        erros: [
          { campo: 'contentType', mensagem: 'Tipo de arquivo nao aceito.' },
        ],
      });
    }

    const objectKey =
      `organizacoes/${contexto.organizationId}/imoveis/${imovelId}/` +
      `${randomUUID()}.${extensao}`;

    const upload = await this.armazenamento.urlDeUpload({
      objectKey,
      contentType: dados.contentType,
      tamanhoEmBytes: dados.tamanhoEmBytes,
    });

    return { objectKey, ...upload };
  }

  /**
   * Passo 2: registra a mídia enviada.
   *
   * Confere o limite de novo, e não por desconfiança do passo 1: entre os dois
   * passos cabe outra aba enviando outra foto, e duas URLs assinadas quando
   * faltava uma vaga registrariam vinte e uma.
   */
  async registrar(
    contexto: ContextoAutorizado,
    imovelId: string,
    dados: EntradaDeRegistrarMidia,
  ): Promise<RespostaDeMidia> {
    await this.conferirImovel(contexto, imovelId);
    await this.recusarSeLotado(imovelId);

    const prefixo = `organizacoes/${contexto.organizationId}/imoveis/${imovelId}/`;

    // A conferencia que justifica o prefixo. Sem ela, o cliente registraria
    // uma chave de outra organizacao e a resposta passaria a servir aquele
    // objeto a partir do imovel dele.
    if (
      !dados.objectKey.startsWith(prefixo) ||
      dados.objectKey.includes('..')
    ) {
      throw new NaoEncontrado();
    }

    const existentes = await this.prisma.propertyMedia.findMany({
      where: { propertyId: imovelId },
      select: { position: true, isCover: true, kind: true },
    });

    const proximaPosicao =
      existentes.reduce((maior, m) => Math.max(maior, m.position), -1) + 1;

    const ehPublica = MIDIA_PUBLICA.includes(dados.kind);
    const jaTemCapa = existentes.some((m) => m.isCover);

    const criada = await this.prisma.$transaction(async (tx) => {
      const midia = await tx.propertyMedia.create({
        data: {
          organizationId: contexto.organizationId,
          propertyId: imovelId,
          objectKey: dados.objectKey,
          kind: dados.kind,
          position: proximaPosicao,
          isCover: ehPublica && !jaTemCapa,
          altText: dados.textoAlternativo,
          width: dados.largura,
          height: dados.altura,
          byteSize: dados.tamanhoEmBytes,
          contentType: dados.contentType,
        },
        select: SELECAO_DE_MIDIA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Property',
          entityId: imovelId,
          action: 'imovel.midiaAdicionada',
          metadata: {
            midiaId: midia.id,
            kind: dados.kind,
            // Sem a chave: ela e o endereco do objeto, e o log de auditoria e
            // lido por mais gente do que quem pode ver o arquivo.
            tamanhoEmBytes: dados.tamanhoEmBytes,
            virouCapa: midia.isCover,
          },
        },
        tx,
      );

      return midia;
    });

    return paraRespostaDeMidia(
      criada,
      await this.armazenamento.urlDeLeitura(criada.objectKey),
    );
  }

  /**
   * As mídias do imóvel, em ordem.
   *
   * Exige apenas `imovel:ver`, que é `ORG` para os quatro papéis: o corretor
   * precisa ver as fotos de qualquer imóvel da casa para oferecê-lo ao cliente
   * dele (decisão de 19/10/2026). Editar continua sendo outra conversa.
   */
  async listar(
    contexto: ContextoAutorizado,
    imovelId: string,
  ): Promise<{ midias: RespostaDeMidia[] }> {
    await this.conferirImovel(contexto, imovelId);

    const midias = await this.prisma.propertyMedia.findMany({
      where: { propertyId: imovelId },
      select: SELECAO_DE_MIDIA,
      orderBy: { position: 'asc' },
    });

    // As URLs em paralelo: no R2 cada assinatura e trabalho local, mas um
    // adaptador futuro pode falar com a rede, e vinte chamadas em serie
    // apareceriam como tela lenta.
    return {
      midias: await Promise.all(
        midias.map(async (midia) =>
          paraRespostaDeMidia(
            midia,
            await this.armazenamento.urlDeLeitura(midia.objectKey),
          ),
        ),
      ),
    };
  }

  /** Texto alternativo. É o único campo editável da mídia. */
  async atualizar(
    contexto: ContextoAutorizado,
    imovelId: string,
    midiaId: string,
    dados: EntradaDeAtualizarMidia,
  ): Promise<RespostaDeMidia> {
    await this.conferirImovel(contexto, imovelId);
    await this.carregarMidia(imovelId, midiaId);

    const atualizada = await this.prisma.propertyMedia.update({
      where: { id: midiaId },
      data: { altText: dados.textoAlternativo },
      select: SELECAO_DE_MIDIA,
    });

    return paraRespostaDeMidia(
      atualizada,
      await this.armazenamento.urlDeLeitura(atualizada.objectKey),
    );
  }

  /**
   * Define a capa.
   *
   * Em transação, porque são duas escritas que não podem existir separadas: a
   * capa antiga perde a marca e a nova a recebe. Entre as duas, o banco teria
   * duas capas — e o `isCover` do schema promete no máximo uma.
   */
  async definirCapa(
    contexto: ContextoAutorizado,
    imovelId: string,
    midiaId: string,
  ): Promise<RespostaDeMidia> {
    await this.conferirImovel(contexto, imovelId);

    const midia = await this.carregarMidia(imovelId, midiaId);

    if (!MIDIA_PUBLICA.includes(midia.kind)) {
      throw new BadRequestException(
        'Documento nao pode ser capa: ele nunca aparece no catalogo publico.',
      );
    }

    const atualizada = await this.prisma.$transaction(async (tx) => {
      await tx.propertyMedia.updateMany({
        where: { propertyId: imovelId, isCover: true },
        data: { isCover: false },
      });

      const nova = await tx.propertyMedia.update({
        where: { id: midiaId },
        data: { isCover: true },
        select: SELECAO_DE_MIDIA,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Property',
          entityId: imovelId,
          action: 'imovel.capaDefinida',
          metadata: { midiaId },
        },
        tx,
      );

      return nova;
    });

    return paraRespostaDeMidia(
      atualizada,
      await this.armazenamento.urlDeLeitura(atualizada.objectKey),
    );
  }

  /**
   * Reordena, em dois passos dentro da transação.
   *
   * `@@unique([propertyId, position])` é o que exige o rodeio: aplicar a ordem
   * nova direto colide com a antiga no meio do caminho — a mídia que vai para a
   * posição 2 encontra a que ainda está nela. Então todas vão primeiro para
   * posições negativas, que nenhuma linha válida ocupa, e só depois para as
   * definitivas.
   *
   * A lista tem de ser **exatamente** as mídias do imóvel. Lista parcial
   * deixaria mídia fora da ordem, e lista com id estranho é tentativa de mexer
   * no imóvel de outra pessoa.
   */
  async reordenar(
    contexto: ContextoAutorizado,
    imovelId: string,
    dados: EntradaDeReordenarMidia,
  ): Promise<{ midias: RespostaDeMidia[] }> {
    await this.conferirImovel(contexto, imovelId);

    const existentes = await this.prisma.propertyMedia.findMany({
      where: { propertyId: imovelId },
      select: { id: true },
    });

    const idsExistentes = new Set(existentes.map((m) => m.id));
    const recebidos = new Set(dados.ids);

    if (
      recebidos.size !== dados.ids.length ||
      recebidos.size !== idsExistentes.size ||
      dados.ids.some((id) => !idsExistentes.has(id))
    ) {
      throw new BadRequestException(
        'A nova ordem precisa conter exatamente as midias deste imovel, sem repetir.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Passo 1: para fora do alcance da restricao de unicidade.
      for (const [indice, id] of dados.ids.entries()) {
        await tx.propertyMedia.update({
          where: { id },
          data: { position: -1 - indice },
        });
      }

      // Passo 2: para as posicoes definitivas.
      for (const [indice, id] of dados.ids.entries()) {
        await tx.propertyMedia.update({
          where: { id },
          data: { position: indice },
        });
      }

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Property',
          entityId: imovelId,
          action: 'imovel.midiaReordenada',
          metadata: { quantidade: dados.ids.length },
        },
        tx,
      );
    });

    return this.listar(contexto, imovelId);
  }

  /**
   * Remove a mídia e o objeto.
   *
   * A linha sai primeiro, e o objeto depois. A ordem importa: se o
   * armazenamento falhar, sobra um objeto órfão, que não aparece em tela
   * nenhuma. Na ordem inversa, a falha deixaria uma linha apontando para um
   * arquivo que já não existe — imagem quebrada no anúncio, que é o erro que o
   * cliente vê.
   */
  async remover(
    contexto: ContextoAutorizado,
    imovelId: string,
    midiaId: string,
  ): Promise<void> {
    await this.conferirImovel(contexto, imovelId);

    const midia = await this.carregarMidia(imovelId, midiaId);

    await this.prisma.$transaction(async (tx) => {
      await tx.propertyMedia.delete({ where: { id: midiaId } });

      // Capa removida promove a proxima publica, pela ordem. Sem isto, o
      // imovel ficaria sem capa e ninguem se lembraria de voltar para marcar.
      if (midia.isCover) {
        const proxima = await tx.propertyMedia.findFirst({
          where: { propertyId: imovelId, kind: { in: [...MIDIA_PUBLICA] } },
          orderBy: { position: 'asc' },
          select: { id: true },
        });

        if (proxima) {
          await tx.propertyMedia.update({
            where: { id: proxima.id },
            data: { isCover: true },
          });
        }
      }

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Property',
          entityId: imovelId,
          action: 'imovel.midiaRemovida',
          metadata: { midiaId, kind: midia.kind, eraCapa: midia.isCover },
        },
        tx,
      );
    });

    await this.armazenamento.remover(midia.objectKey);
  }

  /**
   * Confere o imóvel do caminho contra quem pede.
   *
   * **Uma função para leitura e escrita**, e não duas: o que muda entre
   * listar e editar é o `@Exige` da rota, que a guarda transforma em
   * `contexto.acao` e `contexto.escopo`. O `conferir` lê dali. Duas funções com
   * o mesmo corpo divergiriam no primeiro ajuste, e a que divergisse seria
   * descoberta por um teste de permissão — ou por um cliente.
   *
   * As consequências vêm da matriz, sem lista escrita à mão:
   *
   * - **listar** (`imovel:ver`, `ORG` para os quatro papéis): o corretor vê as
   *   fotos de qualquer imóvel da casa, para poder oferecê-lo ao cliente dele
   *   (decisão de 19/10/2026)
   * - **escrever** (`imovel:editar`, `OWN` para o `AGENT`): o imóvel do colega
   *   responde **403**, e não 404, porque ele está vendo aquele imóvel na tela
   *   — esconder a existência de algo que ele acabou de ler seria teatro
   * - **outra organização**: 404 nos dois casos
   */
  private async conferirImovel(
    contexto: ContextoAutorizado,
    imovelId: string,
  ): Promise<void> {
    const imovel = await this.prisma.property.findFirst({
      where: { id: imovelId, deletedAt: null },
      select: { id: true, organizationId: true, ownerMemberId: true },
    });

    this.autorizacao.conferir(contexto, imovel, {
      responsavelId: imovel?.ownerMemberId ?? null,
    });
  }

  /**
   * A mídia, conferida contra o imóvel.
   *
   * O `propertyId` entra no `where`, e não é redundância: sem ele, o id de uma
   * mídia de outro imóvel — de outra organização, inclusive — passaria, porque
   * a autorização confere o **imóvel** do caminho, e não a mídia.
   */
  private async carregarMidia(imovelId: string, midiaId: string) {
    const midia = await this.prisma.propertyMedia.findFirst({
      where: { id: midiaId, propertyId: imovelId },
      select: SELECAO_DE_MIDIA,
    });

    if (!midia) {
      throw new NaoEncontrado();
    }

    return midia;
  }

  private async recusarSeLotado(imovelId: string): Promise<void> {
    const quantidade = await this.prisma.propertyMedia.count({
      where: { propertyId: imovelId },
    });

    if (quantidade >= MAXIMO_DE_MIDIA_POR_IMOVEL) {
      throw new BadRequestException(
        `Este imovel ja tem ${MAXIMO_DE_MIDIA_POR_IMOVEL} arquivos, que e o limite. ` +
          'Remova algum antes de enviar outro.',
      );
    }
  }
}
