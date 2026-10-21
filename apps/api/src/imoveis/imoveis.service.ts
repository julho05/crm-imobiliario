import { BadRequestException, Injectable } from '@nestjs/common';
import {
  mensagemDePrecoFaltando,
  paraSlug,
  precoFaltandoParaAFinalidade,
  type EntradaDeAtualizarImovel,
  type EntradaDeCriarImovel,
  type FiltrosDeImoveis,
  type Paginacao,
  type AddressVisibility,
  type PropertyPurpose,
  type PropertyStatus,
  type PropertyType,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ehViolacaoDeUnicidade } from '../comum/erros-do-prisma';
import { AutorizacaoService } from '../autorizacao/autorizacao.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';
import { proximoCodigoDisponivel } from './codigo-do-imovel';
import { paraRespostaDeImovel, type RespostaDeImovel } from './resposta';

/**
 * Imoveis — item **B1** do [roadmap.md](../../../../docs/roadmap.md).
 *
 * E o primeiro recurso de dado privado do produto, e com ele os itens **A12**
 * (isolamento multi-tenant) e **A13** (auditoria de escrita) saem do teste
 * sintetico e passam a valer sobre endpoint de verdade.
 *
 * ## Como a autorizacao se divide aqui
 *
 * A guarda ja resolveu os passos 1 a 4 de
 * [permissions.md](../../../../docs/permissions.md) §6 antes de o controller
 * ser chamado. Este servico cuida dos passos 5 a 7, sempre pelo
 * `AutorizacaoService` — nunca com `if` proprio:
 *
 * - **passo 5** (o registro e desta organizacao?) e **6** (o escopo `OWN`
 *   bate?) ficam em `conferir()`
 * - **passo 7** (auditoria) fica em `registrar()`, dentro da transacao da
 *   escrita
 *
 * ## Duas barreiras para a mesma coisa, de proposito
 *
 * Toda consulta filtra por `organizationId` **e** passa por `conferir()`. Nao e
 * redundancia por desconfianca do codigo: e que as duas falham de maneiras
 * diferentes. O `WHERE` protege a listagem, onde nao ha registro unico para
 * conferir; o `conferir()` protege o dia em que alguem acrescentar um
 * `findUnique` por id e esquecer o filtro — que e silencioso, porque o teste do
 * caminho feliz passa igual.
 */

/**
 * Campos sempre carregados: o que `conferir()` e a resposta precisam.
 *
 * `satisfies`, e nao `as const`: com `as const` o objeto fica `readonly`, e a
 * inferencia do Prisma nao atravessa isso — o `ownerMember` aninhado
 * desaparecia do tipo do resultado, e o erro aparecia longe daqui, na chamada
 * do mapeador de resposta.
 */
const SELECAO_DE_IMOVEL = {
  id: true,
  organizationId: true,
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
  zipCode: true,
  street: true,
  number: true,
  complement: true,
  addressVisibility: true,
  ownerMemberId: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  ownerMember: {
    select: {
      id: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.PropertySelect;

/**
 * Quantas vezes tentar quando o codigo gerado colide.
 *
 * Tres bastam: a colisao exige duas pessoas salvando no mesmo instante, e cada
 * retentativa le o maior sufixo de novo. Falhar depois disso e sinal de outro
 * problema — codigo informado a mao que ja existe, por exemplo —, e esse caso
 * merece erro legivel em vez de laco eterno.
 */
const TENTATIVAS_DE_CODIGO = 3;

@Injectable()
export class ImoveisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacao: AutorizacaoService,
  ) {}

  /**
   * Cadastra um imovel na organizacao ativa.
   *
   * ## Por que o imovel nasce atribuido a quem cadastrou
   *
   * Porque a matriz diz que `imovel:criar` e `ORG` para o `AGENT`, mas
   * `imovel:editar` e `OWN`. Um imovel criado **sem** responsavel ficaria fora
   * do alcance de quem o cadastrou: o corretor salvaria o imovel e, no clique
   * seguinte, receberia 403 para corrigir o proprio texto. Atribuir a quem
   * cadastrou resolve isso sem abrir nada — reatribuir continua exigindo
   * `imovel:alterarResponsavel`, que o `AGENT` nao tem.
   *
   * O campo nao vem do cliente justamente por isso: aceita-lo deixaria o
   * corretor cadastrar imovel no nome de um colega.
   */
  async criar(
    contexto: ContextoAutorizado,
    dados: EntradaDeCriarImovel,
  ): Promise<RespostaDeImovel> {
    // O schema ja garantiu a coerencia entre preco e finalidade na criacao,
    // onde todos os campos estao presentes.
    const camposDoBanco = this.paraCamposDoBanco(dados);

    for (let tentativa = 1; tentativa <= TENTATIVAS_DE_CODIGO; tentativa += 1) {
      const codigo =
        dados.codigo ??
        (await proximoCodigoDisponivel(
          this.prisma,
          contexto.organizationId,
          dados.tipo,
        ));

      try {
        return await this.prisma.$transaction(async (tx) => {
          const imovel = await tx.property.create({
            data: {
              ...camposDoBanco,
              // Os seis campos do piso, repetidos aqui de proposito: e o que
              // faz o TypeScript conferir que a criacao nao depende de um
              // mapeador cujos campos sao todos opcionais, porque ele serve
              // tambem a edicao parcial. Se um deles sair do contrato, isto
              // deixa de compilar.
              title: dados.titulo,
              type: dados.tipo,
              purpose: dados.finalidade,
              state: dados.estado,
              city: dados.cidade,
              neighborhood: dados.bairro,
              organizationId: contexto.organizationId,
              code: codigo,
              slug: this.montarSlug(dados.titulo, codigo),
              ownerMemberId: contexto.membershipId,
            },
            select: SELECAO_DE_IMOVEL,
          });

          // Passo 7, na mesma transacao: auditoria que falha depois da escrita
          // deixaria o log sem a linha justamente quando ele serviria de prova.
          await this.autorizacao.registrar(
            contexto,
            {
              entityType: 'Property',
              entityId: imovel.id,
              action: 'imovel.criado',
              metadata: {
                codigo: imovel.code,
                tipo: imovel.type,
                finalidade: imovel.purpose,
                // Registra se o codigo foi escolhido pela pessoa ou gerado:
                // na duvida sobre uma numeracao, e a primeira pergunta.
                codigoInformado: dados.codigo !== undefined,
              },
            },
            tx,
          );

          return paraRespostaDeImovel(imovel);
        });
      } catch (erro) {
        if (!ehViolacaoDeUnicidade(erro)) {
          throw erro;
        }

        // Codigo informado a mao que ja existe: retentar nao resolve, porque o
        // valor nao muda. Erro legivel, como pede o criterio do B1.
        if (dados.codigo !== undefined) {
          throw new BadRequestException({
            mensagem: 'Dados invalidos.',
            erros: [
              {
                campo: 'codigo',
                mensagem: `O codigo ${dados.codigo} ja esta em uso em outro imovel.`,
              },
            ],
          });
        }

        if (tentativa === TENTATIVAS_DE_CODIGO) {
          throw erro;
        }
      }
    }

    // Inalcancavel: o laco sempre retorna ou lanca. Existe para o controle de
    // fluxo do TypeScript, que nao deduz isso do `for`.
    throw new Error('Nao foi possivel gerar um codigo de imovel.');
  }

  /**
   * Lista os imoveis da organizacao ativa, paginados.
   *
   * `imovel:ver` e `ORG` para **todos** os papeis, inclusive o `AGENT`: o
   * corretor precisa poder oferecer qualquer imovel da casa ao cliente dele
   * (decisao de 19/10/2026). Por isso aqui nao ha recorte por responsavel — o
   * `apenasMeus` e conveniencia de quem consulta, nao barreira.
   *
   * Excluidos (`deletedAt`) ficam fora: a exclusao e logica, e quem apagou nao
   * espera reencontrar o imovel na lista.
   */
  async listar(
    contexto: ContextoAutorizado,
    filtros: FiltrosDeImoveis,
    paginacao: Paginacao,
  ): Promise<{
    imoveis: RespostaDeImovel[];
    total: number;
    pagina: number;
    porPagina: number;
  }> {
    const onde = {
      organizationId: contexto.organizationId,
      deletedAt: null,
      ...(filtros.apenasMeus ? { ownerMemberId: contexto.membershipId } : {}),
      ...(filtros.tipo ? { type: filtros.tipo } : {}),
      ...(filtros.finalidade ? { purpose: filtros.finalidade } : {}),
      ...(filtros.estado ? { state: filtros.estado } : {}),
      ...(filtros.cidade ? { city: filtros.cidade } : {}),
      ...(filtros.bairro ? { neighborhood: filtros.bairro } : {}),
      ...(filtros.termo
        ? {
            OR: [
              { title: { contains: filtros.termo } },
              { code: { contains: filtros.termo } },
            ],
          }
        : {}),
    };

    // As duas consultas em paralelo, e o `ownerMember` por `select` aninhado:
    // uma consulta para a pagina inteira, nao uma por imovel. E o que o item
    // B10 vai cobrar com teste que conta consultas.
    const [registros, total] = await Promise.all([
      this.prisma.property.findMany({
        where: onde,
        select: SELECAO_DE_IMOVEL,
        orderBy: { createdAt: 'desc' },
        skip: (paginacao.pagina - 1) * paginacao.porPagina,
        take: paginacao.porPagina,
      }),
      this.prisma.property.count({ where: onde }),
    ]);

    return {
      imoveis: registros.map(paraRespostaDeImovel),
      total,
      pagina: paginacao.pagina,
      porPagina: paginacao.porPagina,
    };
  }

  /** Um imovel da organizacao ativa. Fora dela, 404 — nunca 403. */
  async ver(
    contexto: ContextoAutorizado,
    id: string,
  ): Promise<RespostaDeImovel> {
    const imovel = await this.carregar(contexto, id);

    return paraRespostaDeImovel(this.autorizacao.conferir(contexto, imovel));
  }

  /**
   * Edita os campos do imovel.
   *
   * Nao muda `status` nem `publishedAt`: publicar e o item B2, com rota e
   * evento de auditoria proprios. "Corrigi o titulo" e "coloquei no ar" sao
   * acontecimentos diferentes, e um log que os confunde nao responde a pergunta
   * que se faz a ele depois.
   *
   * O `AGENT` edita so os seus e recebe **403** — nao 404 — nos dos colegas,
   * porque `imovel:ver` e `ORG` para ele: ele esta vendo o imovel na tela, e
   * esconder a existencia de algo que ele acabou de ler seria teatro.
   */
  async atualizar(
    contexto: ContextoAutorizado,
    id: string,
    dados: EntradaDeAtualizarImovel,
  ): Promise<RespostaDeImovel> {
    const carregado = await this.carregar(contexto, id);

    const imovel = this.autorizacao.conferir(contexto, carregado, {
      responsavelId: carregado?.ownerMemberId ?? null,
    });

    this.recusarSeOPrecoNaoCombinaComAFinalidade(imovel, dados);

    const camposDoBanco = this.paraCamposDoBanco(dados);

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.property.update({
        where: { id: imovel.id },
        // O `slug` **nao** e recalculado quando o titulo muda, de proposito: a
        // URL publica do imovel ja pode estar em anuncio e em conversa de
        // WhatsApp. Trocar o endereco por causa de uma correcao de texto
        // quebraria esses links em silencio.
        data: camposDoBanco,
        select: SELECAO_DE_IMOVEL,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Property',
          entityId: atualizado.id,
          action: 'imovel.editado',
          // Os nomes dos campos, nao os valores: o log diz o que mudou sem
          // virar uma segunda copia do cadastro dentro da auditoria.
          metadata: { campos: Object.keys(dados).sort().join(',') },
        },
        tx,
      );

      return paraRespostaDeImovel(atualizado);
    });
  }

  /**
   * Coloca o imovel no ar — item **B2**.
   *
   * ## `status` e `publishedAt` sao coisas diferentes
   *
   * O `schema.prisma` ja anotava a distincao, e aqui ela vira comportamento:
   * `status` e o **estado comercial** (disponivel, reservado, vendido) e
   * `publishedAt` e a **visibilidade** no catalogo. Um imovel reservado
   * continua anunciado, com etiqueta (item C1); um imovel disponivel pode
   * estar fora do ar porque o proprietario pediu discricao.
   *
   * Por isso publicar grava `publishedAt` e **nao** mexe no `status`, com uma
   * excecao: `DRAFT` significa "ainda nao terminei", e nao faria sentido
   * anunciar algo que a propria pessoa marcou como rascunho. Nesse caso o
   * estado vira `AVAILABLE` junto, e a auditoria registra que mudou.
   *
   * ## Onde o imovel incoerente e barrado
   *
   * Aqui. O item B1 tolera `SALE` sem preco em registro que ja existia no
   * banco (ver `recusarSeOPrecoNaoCombinaComAFinalidade`), porque recusar a
   * edicao de um bairro por causa disso apontaria para um campo que a pessoa
   * nao tocou. Mas anuncio sem preco nao vai ao ar: e o visitante do catalogo
   * que pagaria por essa tolerancia.
   */
  async publicar(
    contexto: ContextoAutorizado,
    id: string,
  ): Promise<RespostaDeImovel> {
    const carregado = await this.carregar(contexto, id);

    const imovel = this.autorizacao.conferir(contexto, carregado, {
      responsavelId: carregado?.ownerMemberId ?? null,
    });

    this.recusarSePublicacaoNaoFazSentido(imovel);

    const viraDisponivel = imovel.status === 'DRAFT';

    return this.prisma.$transaction(async (tx) => {
      const publicado = await tx.property.update({
        where: { id: imovel.id },
        data: {
          publishedAt: new Date(),
          ...(viraDisponivel ? { status: 'AVAILABLE' } : {}),
        },
        select: SELECAO_DE_IMOVEL,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Property',
          entityId: imovel.id,
          action: 'imovel.publicado',
          metadata: {
            codigo: imovel.code,
            // Registra se a publicacao tambem mudou o estado comercial: sem
            // isto, o log nao distingue "coloquei no ar" de "coloquei no ar e
            // marquei como disponivel".
            statusAnterior: imovel.status,
            virouDisponivel: viraDisponivel,
          },
        },
        tx,
      );

      return paraRespostaDeImovel(publicado);
    });
  }

  /**
   * Tira o imovel do ar, sem mexer no estado comercial.
   *
   * O `status` fica como estava de proposito: despublicar e dizer "nao mostre
   * mais", nao "nao esta mais disponivel". Quem tira do ar um imovel
   * `AVAILABLE` costuma querer justamente que ele continue disponivel para a
   * carteira interna — e voltar a publicar nao deveria exigir reconfigurar o
   * estado.
   */
  async despublicar(
    contexto: ContextoAutorizado,
    id: string,
  ): Promise<RespostaDeImovel> {
    const carregado = await this.carregar(contexto, id);

    const imovel = this.autorizacao.conferir(contexto, carregado, {
      responsavelId: carregado?.ownerMemberId ?? null,
    });

    if (imovel.publishedAt === null) {
      // Idempotente seria mais simples, mas esconderia da interface que o
      // botao nao fazia o que ela pensava — e a tela que mostra "publicar"
      // para um imovel ja fora do ar esta desatualizada e precisa recarregar.
      throw new BadRequestException('Este imovel nao esta publicado.');
    }

    return this.prisma.$transaction(async (tx) => {
      const despublicado = await tx.property.update({
        where: { id: imovel.id },
        data: { publishedAt: null },
        select: SELECAO_DE_IMOVEL,
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Property',
          entityId: imovel.id,
          action: 'imovel.despublicado',
          metadata: { codigo: imovel.code, status: imovel.status },
        },
        tx,
      );

      return paraRespostaDeImovel(despublicado);
    });
  }

  /**
   * Exclusao **logica**: grava `deletedAt` e tira o imovel das listas.
   *
   * A linha fica. `Inquiry`, `Deal` e `Visit` apontam para ela, e apagar de
   * verdade levaria embora o historico de negociacao de um imovel vendido — ou
   * esbarraria no `ON DELETE RESTRICT` e devolveria erro 500 para o que, da
   * perspectiva de quem usa, e so "remover o anuncio".
   *
   * `imovel:excluir` e `false` para `MANAGER` e `AGENT`: quem chega aqui tem
   * escopo `ORG`, e a guarda barrou os outros no passo 4.
   */
  async excluir(
    contexto: ContextoAutorizado,
    id: string,
  ): Promise<{ id: string }> {
    const carregado = await this.carregar(contexto, id);
    const imovel = this.autorizacao.conferir(contexto, carregado);

    return this.prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id: imovel.id },
        data: { deletedAt: new Date() },
      });

      await this.autorizacao.registrar(
        contexto,
        {
          entityType: 'Property',
          entityId: imovel.id,
          action: 'imovel.excluido',
          metadata: { codigo: imovel.code },
        },
        tx,
      );

      return { id: imovel.id };
    });
  }

  /**
   * Carrega o imovel para conferencia.
   *
   * Filtra por `organizationId` **e** devolve `null` para que `conferir()`
   * confira de novo. Ver a nota sobre as duas barreiras no topo do arquivo: a
   * do `WHERE` e a que existe hoje, a do `conferir()` e a que vai existir no
   * dia em que alguem editar esta consulta.
   */
  private carregar(contexto: ContextoAutorizado, id: string) {
    return this.prisma.property.findFirst({
      where: { id, organizationId: contexto.organizationId, deletedAt: null },
      select: SELECAO_DE_IMOVEL,
    });
  }

  /**
   * O imovel pode ir ao ar?
   *
   * Duas recusas, por motivos diferentes:
   *
   * 1. **Estado comercial encerrado** (`SOLD`, `RENTED`) ou desativado
   *    (`INACTIVE`). Anunciar um imovel vendido gera lead que nasce frustrado,
   *    e e o tipo de erro que a imobiliaria descobre pelo cliente irritado.
   * 2. **Preco faltando para a finalidade.** O B1 tolera isso em registro que
   *    ja estava no banco; a vitrine nao. Anuncio sem preco faz o visitante
   *    pedir contato para descobrir um numero que deveria estar na tela.
   *
   * A mensagem e especifica nos dois casos, e isso e deliberado: aqui nao ha
   * nada a esconder — quem pede a publicacao e membro da organizacao, com
   * permissao para publicar aquele imovel, e precisa saber o que corrigir.
   */
  private recusarSePublicacaoNaoFazSentido(imovel: {
    status: PropertyStatus;
    purpose: PropertyPurpose;
    price: unknown;
    rentPrice: unknown;
  }): void {
    const MOTIVO_POR_STATUS: Partial<Record<PropertyStatus, string>> = {
      SOLD: 'Este imovel esta marcado como vendido e nao pode ser publicado.',
      RENTED: 'Este imovel esta marcado como alugado e nao pode ser publicado.',
      INACTIVE: 'Este imovel esta inativo. Reative-o antes de publicar.',
    };

    const impedimento = MOTIVO_POR_STATUS[imovel.status];

    if (impedimento) {
      throw new BadRequestException(impedimento);
    }

    const faltando = precoFaltandoParaAFinalidade({
      finalidade: imovel.purpose,
      preco: imovel.price === null ? null : Number(imovel.price),
      precoDeAluguel:
        imovel.rentPrice === null ? null : Number(imovel.rentPrice),
    });

    if (faltando) {
      throw new BadRequestException({
        mensagem: 'Dados invalidos.',
        erros: [
          { campo: faltando, mensagem: mensagemDePrecoFaltando(faltando) },
        ],
      });
    }
  }

  /**
   * A finalidade resultante da edicao continua tendo os precos que exige?
   *
   * Roda sobre a **mesclagem** do registro com o que veio na requisicao, e nao
   * sobre a requisicao sozinha. Dois casos reais que so assim se resolvem:
   * mudar de `SALE` para `BOTH` sem enviar preco de aluguel tem de falhar,
   * ainda que o corpo nao tenha nenhum campo de preco; e enviar
   * `{ preco: null }` num imovel `SALE` tambem tem de falhar, ainda que a
   * finalidade nao tenha sido tocada.
   *
   * ## Por que so quando a edicao toca nesses campos
   *
   * **[DECIDIDO 21/10/2026]** Porque existe imovel gravado que ja nao cumpre a
   * regra: a coluna `price` e nula no banco, e linha criada por importacao ou
   * por script de dados nao passou por esta validacao. Conferir sempre faria o
   * sistema recusar uma correcao de bairro com a mensagem "informe o preco de
   * venda" — apontando para um campo que a pessoa nao tocou, numa tela em que
   * ela nao estava.
   *
   * O que isso **nao** abre: todo caminho capaz de criar a incoerencia
   * continua fechado, porque criar exige os precos e qualquer edicao de
   * finalidade ou de preco cai aqui. O registro incoerente que ja existe
   * permanece editavel e incoerente, e o lugar de barra-lo e a publicacao
   * (item B2) — um imovel sem preco nao tem como ir ao catalogo.
   */
  private recusarSeOPrecoNaoCombinaComAFinalidade(
    imovel: {
      purpose: PropertyPurpose;
      price: unknown;
      rentPrice: unknown;
    },
    dados: EntradaDeAtualizarImovel,
  ): void {
    const tocaEmPrecoOuFinalidade =
      'finalidade' in dados || 'preco' in dados || 'precoDeAluguel' in dados;

    if (!tocaEmPrecoOuFinalidade) {
      return;
    }

    const resultante = {
      finalidade: dados.finalidade ?? imovel.purpose,
      preco:
        'preco' in dados
          ? dados.preco
          : imovel.price === null
            ? null
            : Number(imovel.price),
      precoDeAluguel:
        'precoDeAluguel' in dados
          ? dados.precoDeAluguel
          : imovel.rentPrice === null
            ? null
            : Number(imovel.rentPrice),
    };

    const faltando = precoFaltandoParaAFinalidade(resultante);

    if (faltando) {
      throw new BadRequestException({
        mensagem: 'Dados invalidos.',
        erros: [
          { campo: faltando, mensagem: mensagemDePrecoFaltando(faltando) },
        ],
      });
    }
  }

  /**
   * Traduz o contrato em portugues para as colunas em ingles do Prisma.
   *
   * A traducao fica em **um** lugar de proposito. Os nomes divergem porque o
   * schema segue a convencao do banco (ingles) e o contrato segue a lingua do
   * produto (portugues, por `CLAUDE.md`); espalhar esse mapeamento por cada
   * metodo garantiria que um dia um campo novo entrasse na criacao e nao na
   * edicao.
   *
   * `undefined` o Prisma ignora — "nao mexa"; `null` ele grava — "apague".
   * E exatamente a distincao que `atualizarImovelSchema` aceita do cliente.
   */
  private paraCamposDoBanco(dados: EntradaDeAtualizarImovel) {
    return {
      title: dados.titulo,
      description: dados.descricao,
      type: dados.tipo as PropertyType | undefined,
      purpose: dados.finalidade as PropertyPurpose | undefined,
      price: dados.preco,
      rentPrice: dados.precoDeAluguel,
      condoFee: dados.condominio,
      iptu: dados.iptu,
      bedrooms: dados.dormitorios,
      bathrooms: dados.banheiros,
      suites: dados.suites,
      parkingSpots: dados.vagas,
      areaTotal: dados.areaTotal,
      areaUseful: dados.areaUtil,
      state: dados.estado,
      city: dados.cidade,
      neighborhood: dados.bairro,
      zipCode: dados.cep,
      street: dados.rua,
      number: dados.numero,
      complement: dados.complemento,
      // Omitido na criacao, o banco aplica `NEIGHBORHOOD_ONLY`: o padrao
      // restritivo e o que impede vazamento por esquecimento.
      addressVisibility: dados.visibilidadeDoEndereco as
        AddressVisibility | undefined,
    };
  }

  /**
   * Slug do imovel: titulo mais codigo.
   *
   * O codigo entra no fim porque e ele que garante a unicidade — `Property` tem
   * `@@unique([organizationId, slug])`, e dois imoveis com o mesmo titulo na
   * mesma rua sao rotina. Herdar a unicidade do codigo, que o banco ja garante,
   * evita um segundo mecanismo de desempate.
   *
   * O titulo e truncado para caber em `VarChar(191)` com folga para o codigo.
   * Titulo sem nenhum caractere aproveitavel — escrito so com emoji — deixa o
   * slug como o codigo puro, em vez de um hifen solto.
   */
  private montarSlug(titulo: string, codigo: string): string {
    const base = paraSlug(titulo).slice(0, 150).replace(/-+$/, '');
    const sufixo = paraSlug(codigo);

    return base ? `${base}-${sufixo}` : sufixo;
  }
}
