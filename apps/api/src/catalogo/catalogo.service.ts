import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MIDIA_PUBLICA,
  STATUS_VISIVEIS_NO_CATALOGO,
  type Paginacao,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ArmazenamentoDeMidia } from '../midia/armazenamento-de-midia';
import type { Prisma } from '../generated/prisma/client';
import {
  paraImovelPublico,
  paraOrganizacaoPublica,
  type RespostaPublicaDeImovel,
  type RespostaPublicaDeOrganizacao,
} from './resposta-publica';

/**
 * O catálogo público — item **C2**.
 *
 * ## Um recorte, em um lugar só
 *
 * `visivel()` devolve a cláusula que define o que o visitante alcança, e as
 * três consultas deste arquivo a usam. Não há segunda versão dela em lugar
 * nenhum, e isso não é elegância: no item B7 a listagem e a consulta por id
 * tinham recortes separados, a segunda esqueceu um filtro, e o nome de um
 * cliente excluído continuou saindo por aquela porta. Ali era o CRM, onde quem
 * vê já está autenticado. Aqui é a porta da rua.
 *
 * ## Quatro condições, e a quarta é a que se esquece
 *
 * Publicado, estado comercial que o catálogo mostra, não excluído — e
 * **organização ativa**. Sem a quarta, suspender uma conta por falta de
 * pagamento ou por denúncia deixaria a vitrine dela no ar.
 *
 * ## Tudo responde 404, nunca 403
 *
 * Imóvel em rascunho, de organização suspensa ou inexistente dão a mesma
 * resposta. Aqui não há sessão para negar: 403 diria ao visitante que aquele
 * endereço existe e está escondido, que é precisamente o que ele não precisa
 * saber (`permissions.md` §6).
 */
@Injectable()
export class CatalogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly armazenamento: ArmazenamentoDeMidia,
  ) {}

  async organizacao(slug: string): Promise<RespostaPublicaDeOrganizacao> {
    const organizacao = await this.carregarOrganizacao(slug);

    return paraOrganizacaoPublica(
      organizacao,
      organizacao.logoObjectKey === null
        ? null
        : await this.armazenamento.urlDeLeitura(organizacao.logoObjectKey),
    );
  }

  /**
   * A vitrine da organização.
   *
   * Ordenada por `publishedAt` decrescente: a vitrine mostra primeiro o que
   * entrou por último, e `createdAt` ordenaria pela data de cadastro — um
   * imóvel cadastrado em março e publicado hoje apareceria no fim.
   *
   * Carrega **só a capa** de cada imóvel, com `take: 1` no `select` aninhado:
   * uma consulta para a página inteira, e não uma por imóvel. É o que o item
   * B10 vai cobrar com teste que conta consultas, e a listagem pública é
   * justamente onde o N+1 nasceria.
   */
  async listarImoveis(
    slug: string,
    paginacao: Paginacao,
  ): Promise<{
    organizacao: RespostaPublicaDeOrganizacao;
    imoveis: RespostaPublicaDeImovel[];
    total: number;
    pagina: number;
    porPagina: number;
  }> {
    const organizacao = await this.carregarOrganizacao(slug);
    const onde = this.visivel(organizacao.id);

    const [registros, total] = await Promise.all([
      this.prisma.property.findMany({
        where: onde,
        select: {
          ...SELECAO_PUBLICA_DE_IMOVEL,
          media: {
            where: { isCover: true, kind: { in: [...MIDIA_PUBLICA] } },
            select: SELECAO_PUBLICA_DE_MIDIA,
            take: 1,
          },
        },
        orderBy: { publishedAt: 'desc' },
        skip: (paginacao.pagina - 1) * paginacao.porPagina,
        take: paginacao.porPagina,
      }),
      this.prisma.property.count({ where: onde }),
    ]);

    return {
      organizacao: paraOrganizacaoPublica(
        organizacao,
        organizacao.logoObjectKey === null
          ? null
          : await this.armazenamento.urlDeLeitura(organizacao.logoObjectKey),
      ),
      imoveis: await Promise.all(
        registros.map(async (registro) =>
          paraImovelPublico(registro, await this.comUrl(registro.media)),
        ),
      ),
      total,
      pagina: paginacao.pagina,
      porPagina: paginacao.porPagina,
    };
  }

  /**
   * Um imóvel, pelo slug dele dentro da organização.
   *
   * Pelo slug e não pelo id: é o que vai na URL do anúncio, é o que o
   * `@@unique([organizationId, slug])` garante único, e é o que sobrevive a
   * ser compartilhado por WhatsApp. O id continua saindo no corpo, porque o
   * formulário de interesse o exige (item C5).
   */
  async imovel(
    slug: string,
    slugDoImovel: string,
  ): Promise<{
    organizacao: RespostaPublicaDeOrganizacao;
    imovel: RespostaPublicaDeImovel;
  }> {
    const organizacao = await this.carregarOrganizacao(slug);

    const registro = await this.prisma.property.findFirst({
      // O recorte inteiro, mais o slug. Buscar pelo slug e conferir a
      // publicação depois daria o mesmo resultado hoje e seria a porta por
      // onde o próximo filtro esquecido entraria.
      where: { ...this.visivel(organizacao.id), slug: slugDoImovel },
      select: {
        ...SELECAO_PUBLICA_DE_IMOVEL,
        media: {
          // `DOCUMENT` não é filtrado depois: ele não é lido. Matrícula e
          // contrato não saem do banco nesta consulta, e assim nenhuma
          // mudança futura em `paraImovelPublico` consegue deixá-los escapar.
          where: { kind: { in: [...MIDIA_PUBLICA] } },
          select: SELECAO_PUBLICA_DE_MIDIA,
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!registro) {
      throw new NotFoundException({ mensagem: 'Imovel nao encontrado.' });
    }

    return {
      organizacao: paraOrganizacaoPublica(
        organizacao,
        organizacao.logoObjectKey === null
          ? null
          : await this.armazenamento.urlDeLeitura(organizacao.logoObjectKey),
      ),
      imovel: paraImovelPublico(registro, await this.comUrl(registro.media)),
    };
  }

  /**
   * O que o visitante alcança. **A única definição.**
   *
   * `deletedAt: null` está aqui mesmo que o catálogo nunca tenha mostrado o
   * imóvel excluído: imóvel com `Inquiry` associada é excluído por soft delete,
   * porque a `Inquiry` é prova da origem do lead (`data-model.md` §3.4). A
   * linha continua no banco, e sem este filtro ela voltaria à vitrine.
   */
  private visivel(organizationId: string): Prisma.PropertyWhereInput {
    return {
      organizationId,
      deletedAt: null,
      publishedAt: { not: null },
      status: { in: [...STATUS_VISIVEIS_NO_CATALOGO] },
    };
  }

  /**
   * A organização, se ela tiver vitrine.
   *
   * Lança 404 para slug inexistente **e** para organização suspensa, com a
   * mesma mensagem. Distinguir os dois diria a quem sonda quais contas existem.
   */
  private async carregarOrganizacao(slug: string) {
    const organizacao = await this.prisma.organization.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: {
        // `id` entra porque as consultas de imóvel precisam dele. Ele **não**
        // chega à resposta: `paraOrganizacaoPublica` monta campo a campo e não
        // o inclui.
        id: true,
        name: true,
        slug: true,
        kind: true,
        logoObjectKey: true,
        publicEmail: true,
        publicPhone: true,
        publicBio: true,
      },
    });

    if (!organizacao) {
      throw new NotFoundException({ mensagem: 'Pagina nao encontrada.' });
    }

    return organizacao;
  }

  /**
   * As URLs das mídias, em paralelo.
   *
   * Mesma razão do módulo de mídia: assinar é trabalho local no adaptador de
   * hoje, mas um adaptador que fale com a rede faria vinte assinaturas em série
   * aparecerem como página lenta.
   */
  private async comUrl<T extends { objectKey: string }>(midias: T[]) {
    return Promise.all(
      midias.map(async (midia) => ({
        midia,
        url: await this.armazenamento.urlDeLeitura(midia.objectKey),
      })),
    );
  }
}

/**
 * As colunas que a consulta carrega — e só elas.
 *
 * O `select` repete a lista branca de `resposta-publica.ts` no nível do banco,
 * de propósito: o que não é lido não pode ser devolvido por engano. `street`,
 * `number` e `complement` são carregados porque podem sair conforme a
 * visibilidade, e `addressVisibility` vem junto **para decidir** isso — ele é
 * o único campo aqui que a resposta não contém.
 */
const SELECAO_PUBLICA_DE_IMOVEL = {
  id: true,
  code: true,
  slug: true,
  title: true,
  description: true,
  type: true,
  purpose: true,
  status: true,
  price: true,
  rentPrice: true,
  condoFee: true,
  iptu: true,
  bedrooms: true,
  bathrooms: true,
  suites: true,
  parkingSpots: true,
  areaTotal: true,
  areaUseful: true,
  state: true,
  city: true,
  neighborhood: true,
  street: true,
  number: true,
  complement: true,
  addressVisibility: true,
  publishedAt: true,
  features: { select: { feature: true }, orderBy: { feature: 'asc' } },
} satisfies Prisma.PropertySelect;

const SELECAO_PUBLICA_DE_MIDIA = {
  kind: true,
  objectKey: true,
  altText: true,
  width: true,
  height: true,
  isCover: true,
} satisfies Prisma.PropertyMediaSelect;
