import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AVISO_DE_PRIVACIDADE,
  MIDIA_PUBLICA,
  PropertyPurpose,
  STATUS_VISIVEIS_NO_CATALOGO,
  type EntradaDeCapturaDeLead,
  type FiltrosDoCatalogo,
  type Paginacao,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { hashDeIp } from '../comum/hash-de-ip';
import { ArmazenamentoDeMidia } from '../midia/armazenamento-de-midia';
import type { Prisma } from '../generated/prisma/client';
import { EnderecoMovido } from './endereco-movido';
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
 * quatro consultas deste arquivo a usam — a do formulário de interesse (C5)
 * inclusive. Não há segunda versão dela em lugar
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
   *
   * Os filtros do C4 entram **ao lado** do `visivel()`, num `AND`, e nunca
   * dentro dele: o recorte continua sendo uma cláusula só, e filtro nenhum
   * consegue alargá-lo — só estreitar. A contagem usa a mesma cláusula, para
   * "12 imóveis" significar os doze que a busca alcança.
   */
  async listarImoveis(
    slug: string,
    paginacao: Paginacao,
    filtros: FiltrosDoCatalogo = {},
  ): Promise<{
    organizacao: RespostaPublicaDeOrganizacao;
    imoveis: RespostaPublicaDeImovel[];
    total: number;
    pagina: number;
    porPagina: number;
  }> {
    const organizacao = await this.carregarOrganizacao(slug);
    const onde: Prisma.PropertyWhereInput = {
      AND: [this.visivel(organizacao.id), ...filtrar(filtros)],
    };

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
   * O formulário de interesse — item **C5**.
   *
   * Mora aqui, e não no módulo de leads, por causa do `visivel()`: o imóvel
   * sobre o qual o visitante pergunta tem de ser um que ele alcança, e esta é
   * a única definição disso. Um serviço à parte precisaria de uma segunda, e
   * foi recorte duplicado que vazou nome de cliente excluído no B7. Daí os
   * quatro casos — rascunho, de outra organização, excluído, organização
   * suspensa — darem o mesmo 404 da vitrine.
   *
   * ## Para quem o lead vai
   *
   * Para o responsável pelo imóvel, **se o vínculo dele estiver ativo**. Sem
   * responsável, ou com ele suspenso, vai para a fila (`assignedMemberId`
   * nulo). Entregar a quem foi suspenso esconderia o contato: ele não entra
   * mais no sistema, e o lead nunca apareceria na fila para ninguém o pegar.
   *
   * ## Um lead novo por envio
   *
   * Mesmo com telefone repetido. `data-model.md` §3.4 proíbe fusão automática,
   * e a tela do CRM já sinaliza a duplicata a quem atende.
   *
   * ## O que vem do servidor, e não do formulário
   *
   * A versão do aviso, a hora do consentimento e o hash do IP. Os três são a
   * prova do aceite, e prova que o cliente pudesse escrever não provaria nada.
   * O schema descarta qualquer outra chave do corpo.
   */
  async registrarInteresse(
    slug: string,
    dados: EntradaDeCapturaDeLead,
    ip: string | undefined,
  ): Promise<void> {
    const organizacao = await this.carregarOrganizacao(slug);

    const imovel = await this.prisma.property.findFirst({
      where: { ...this.visivel(organizacao.id), id: dados.propertyId },
      select: {
        id: true,
        slug: true,
        ownerMemberId: true,
        ownerMember: { select: { status: true } },
      },
    });

    if (!imovel) {
      throw new NotFoundException({ mensagem: 'Imovel nao encontrado.' });
    }

    const responsavel =
      imovel.ownerMember?.status === 'ACTIVE' ? imovel.ownerMemberId : null;
    const ipHash = hashDeIp(ip);

    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          organizationId: organizacao.id,
          fullName: dados.nomeCompleto,
          phone: dados.telefone,
          email: dados.email,
          source: 'PUBLIC_CATALOG',
          assignedMemberId: responsavel,
          consentGivenAt: new Date(),
          privacyNoticeVersion: AVISO_DE_PRIVACIDADE.versao,
          consentIpHash: ipHash,
        },
        select: { id: true },
      });

      await tx.inquiry.create({
        data: {
          organizationId: organizacao.id,
          propertyId: imovel.id,
          leadId: lead.id,
          message: dados.mensagem || null,
          // Montada aqui, e não lida do `Referer`: o cabeçalho é do cliente, e
          // o caminho do anúncio é tudo o que esta coluna precisa dizer.
          sourceUrl: `/o/${slug}/imovel/${imovel.slug}`,
        },
      });

      // Escrita direto na tabela, sem o `AutorizacaoService.registrar`: aqui
      // não há `Membership` que tenha agido — quem agiu foi um visitante sem
      // conta, e `actorMembershipId` nulo é exatamente isso. Os dados pessoais
      // não entram no `metadata`, pela mesma razão do `lead.editado`.
      await tx.activity.create({
        data: {
          organizationId: organizacao.id,
          actorMembershipId: null,
          entityType: 'Lead',
          entityId: lead.id,
          action: 'lead.capturado',
          metadata: {
            origem: 'PUBLIC_CATALOG',
            imovelId: imovel.id,
            foiParaAFila: responsavel === null,
            versaoDoAviso: AVISO_DE_PRIVACIDADE.versao,
          },
          ipHash,
        },
      });
    });
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
   *
   * ## Slug antigo redireciona (C3)
   *
   * Só depois de o slug não ser o atual de ninguém, e só para organização
   * **ativa**: redirecionar o endereço antigo de uma conta suspensa confirmaria
   * que ela existe, que é o que o 404 igual para os dois casos esconde. Trocas
   * em sequência (A→B→C) levam direto ao atual, porque toda linha do histórico
   * aponta para a organização, e não para o slug seguinte.
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
      const antigo = await this.prisma.organizationSlugHistory.findUnique({
        where: { slug },
        select: { organization: { select: { slug: true, status: true } } },
      });

      if (antigo?.organization.status === 'ACTIVE') {
        throw new EnderecoMovido(antigo.organization.slug);
      }

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
 * Os filtros da busca, como cláusulas do Prisma — item **C4**.
 *
 * ## A rua não é consultada, em nenhuma cláusula
 *
 * Nem `street`, nem `number`, nem `complement`, nem `zipCode`, nem as
 * coordenadas. A busca livre olha título, código, bairro e cidade. Se a rua
 * entrasse no `termo`, o visitante que não a vê descobriria qual é testando
 * nomes até a vitrine responder — o `addressVisibility` contornado pela porta
 * da busca. Há teste para exatamente isso, com a rua preenchida e oculta.
 *
 * ## Ausência nunca vira zero
 *
 * `bedrooms >= 2` em SQL é falso para `NULL`, então o imóvel sem dormitórios
 * informados sai do resultado sem cláusula extra — que é a regra de 21/10/2026.
 * Um `?? 0` em qualquer lugar daqui inverteria isso em silêncio.
 *
 * O mínimo zero é ignorado (`if (f.quartosMinimo)`), e de propósito: aplicado,
 * ele também excluiria o imóvel sem o valor, e o visitante não pediu filtro.
 *
 * ## Maiúscula e acento
 *
 * `contains` vira `LIKE`, e quem decide se "sao paulo" encontra "São Paulo" é
 * a collation da coluna (`utf8mb4_unicode_ci`, insensível às duas — conferido
 * no banco em 29/10/2026, e coberto por teste), não o código. O Prisma não
 * aceita `mode: 'insensitive'` no MySQL.
 */
function filtrar(f: FiltrosDoCatalogo): Prisma.PropertyWhereInput[] {
  const clausulas: Prisma.PropertyWhereInput[] = [];

  if (f.termo) {
    clausulas.push({
      OR: [
        { title: { contains: f.termo } },
        { code: { contains: f.termo } },
        { neighborhood: { contains: f.termo } },
        { city: { contains: f.termo } },
      ],
    });
  }

  if (f.cidade) clausulas.push({ city: f.cidade });
  if (f.bairro) clausulas.push({ neighborhood: f.bairro });
  if (f.estado) clausulas.push({ state: f.estado });
  if (f.tipo) clausulas.push({ type: f.tipo });

  if (f.finalidade) {
    // O imóvel que aceita as duas finalidades aparece nas duas buscas.
    clausulas.push({ purpose: { in: [f.finalidade, PropertyPurpose.BOTH] } });

    // E o preço comparado é o da finalidade pedida: quem procura aluguel até
    // R$ 3.000 não quer ver o imóvel `BOTH` cujo preço de venda é R$ 2.500.
    const faixa = {
      ...(f.precoMinimo ? { gte: f.precoMinimo } : {}),
      ...(f.precoMaximo ? { lte: f.precoMaximo } : {}),
    };

    if (Object.keys(faixa).length > 0) {
      clausulas.push(
        f.finalidade === PropertyPurpose.SALE
          ? { price: faixa }
          : { rentPrice: faixa },
      );
    }
  }

  if (f.quartosMinimo) clausulas.push({ bedrooms: { gte: f.quartosMinimo } });
  if (f.banheirosMinimo) {
    clausulas.push({ bathrooms: { gte: f.banheirosMinimo } });
  }
  if (f.vagasMinimo) clausulas.push({ parkingSpots: { gte: f.vagasMinimo } });

  if (f.areaMinima) {
    // A útil quando existe, senão a total — o mesmo critério do cartão. Sem
    // nenhuma das duas, o imóvel sai.
    clausulas.push({
      OR: [
        { areaUseful: { gte: f.areaMinima } },
        { areaUseful: null, areaTotal: { gte: f.areaMinima } },
      ],
    });
  }

  return clausulas;
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
