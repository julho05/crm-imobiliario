import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseFilters,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  capturaDeLeadLiberada,
  capturaDeLeadSchema,
  filtrosDoCatalogoSchema,
  paginacaoSchema,
  type EntradaDeCapturaDeLead,
  type FiltrosDoCatalogo,
  type Paginacao,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { LimiteDeTentativasService } from '../limite/limite-de-tentativas.service';
import { LIMITES } from '../limite/regras';
import { CatalogoService } from './catalogo.service';
import { FiltroDeEnderecoMovido } from './endereco-movido';
import { conferirFicha, emitirFicha } from './ficha-do-formulario';

/**
 * O catálogo público — item **C2**.
 *
 * ## Não há `@UseGuards` aqui, e a ausência é deliberada
 *
 * Este é o único controller do produto sem guarda de autorização, porque é o
 * único que atende quem não tem conta. Guarda que falta por engano é
 * indistinguível, lendo o código, de guarda que falta de propósito — e por isso
 * a ausência está escrita.
 *
 * O que substitui a guarda é o recorte do `CatalogoService`: nenhuma destas
 * rotas aceita `organizationId` de qualquer origem, e o único identificador que
 * o visitante informa é o **slug**, que é público por definição — ele está na
 * URL do anúncio.
 *
 * ## `publico` no caminho
 *
 * As rotas vivem sob `/api/publico/`, separadas de tudo o mais. Um prefixo é
 * fraco como mecanismo — o que protege é o serviço —, mas é forte como aviso:
 * quem acrescentar uma rota aqui vê, pelo caminho em que está escrevendo, que
 * ela responde a qualquer pessoa da internet.
 *
 * ## Slug antigo responde 308 (C3)
 *
 * Em todas as rotas que carregam a organização — ver `endereco-movido.ts`. O
 * filtro é deste controller, e não global: só aqui um slug na URL pode ter
 * mudado de dono.
 */
@Controller('publico/organizacoes/:slug')
@UseFilters(FiltroDeEnderecoMovido)
export class CatalogoController {
  private readonly logger = new Logger(CatalogoController.name);

  constructor(
    private readonly catalogo: CatalogoService,
    private readonly limite: LimiteDeTentativasService,
  ) {}

  @Get()
  organizacao(@Param('slug') slug: string) {
    return this.catalogo.organizacao(slug);
  }

  /**
   * A vitrine, com os filtros do item C4.
   *
   * Os dois `@Query` leem a mesma query string, cada um pegando o que conhece.
   * O schema dos filtros descarta chave desconhecida em vez de recusá-la — ver
   * a nota em `packages/shared/src/schemas/catalogo.ts` sobre `fbclid`.
   */
  @Get('imoveis')
  listar(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(paginacaoSchema)) paginacao: Paginacao,
    @Query(new ZodValidationPipe(filtrosDoCatalogoSchema))
    filtros: FiltrosDoCatalogo,
  ) {
    return this.catalogo.listarImoveis(slug, paginacao, filtros);
  }

  /**
   * Um anúncio.
   *
   * Vem depois de `imoveis` na ordem de declaração, mas não há conflito: os
   * caminhos têm profundidades diferentes. A ordem continua importando se
   * alguém acrescentar algo como `imoveis/destaques`, que **precisa** vir
   * antes desta — a mesma armadilha que o módulo de mídia já tinha.
   */
  @Get('imoveis/:slugDoImovel')
  imovel(
    @Param('slug') slug: string,
    @Param('slugDoImovel') slugDoImovel: string,
  ) {
    return this.catalogo.imovel(slug, slugDoImovel);
  }

  /**
   * A ficha anti-spam do formulário de interesse — item **C6**. Ver
   * `ficha-do-formulario.ts`.
   *
   * **Sem `limite.consumir`, e a ausência é deliberada** (a regra do A11 pede
   * que ela salte aos olhos, e por isso está escrita): a rota não lê nem
   * escreve no banco, só assina a hora. Contar cada abertura de anúncio
   * custaria uma escrita no MySQL por visita, para proteger uma resposta que
   * não custa nada. O limite fica no envio, que é onde o dano acontece.
   *
   * Não confere se o slug existe pelo mesmo motivo: a ficha de um slug
   * inexistente só serve para um envio que vai receber 404.
   */
  @Get('interesse/ficha')
  ficha(@Param('slug') slug: string) {
    return { ficha: emitirFicha(slug) };
  }

  /**
   * O formulário de interesse — item **C5**. A única escrita do catálogo.
   *
   * Duas recusas antes de qualquer trabalho, e nesta ordem:
   *
   * 1. **503 enquanto o aviso de privacidade for rascunho, em produção.** Ver
   *    `AVISO_DE_PRIVACIDADE` em `@app/shared`: sem texto revisado, não há o
   *    que a pessoa aceitar, e gravar o aceite de um rascunho seria registrar
   *    um consentimento que não vale
   * 2. **O limite de tentativas**, como primeira linha de toda rota pública
   *    (A11). Contado antes de saber se o imóvel existe, para o limite valer
   *    também para quem sonda ids
   *
   * A resposta não devolve id nenhum, nem do lead nem do imóvel: o visitante
   * não tem o que fazer com eles, e cada id a mais é um identificador interno
   * circulando fora (`permissions.md` §5).
   *
   * ## Anti-spam (C6), depois do limite
   *
   * Depois, para o robô gastar o limite dele também.
   *
   * - **Campo-armadilha preenchido: 201 sem gravar nada.** A resposta é igual
   *   à do envio aceito. Um 400 diria ao robô qual campo deixar em branco, e
   *   nenhuma pessoa preenche um campo que não vê
   * - **Ficha antiga demais, adulterada ou de outra vitrine: 400**, com a
   *   mensagem de recarregar a página. É o que a pessoa com a página aberta
   *   desde ontem precisa ler
   * - **Ficha com menos de dois segundos: 400**, pedindo para enviar de novo.
   *   Recusa visível, e não descarte silencioso: o preenchimento automático
   *   do navegador é rápido, e lead de verdade jogado fora sem aviso não tem
   *   como ser recuperado. Quem reenvia passa, porque o tempo já correu
   */
  @Post('interesse')
  @HttpCode(201)
  async registrarInteresse(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(capturaDeLeadSchema))
    dados: EntradaDeCapturaDeLead,
    @Req() requisicao: Request,
  ) {
    if (!capturaDeLeadLiberada(process.env.NODE_ENV)) {
      throw new ServiceUnavailableException({
        mensagem:
          'O envio de mensagens pelo site ainda nao esta disponivel. Use o contato da imobiliaria.',
      });
    }

    await this.limite.consumir({
      regra: LIMITES.capturaPorIp,
      partes: [requisicao.ip],
    });

    if (dados.site) {
      // Sem dado do envio no log: o nome e o telefone podem ser de uma pessoa
      // real que o robô copiou de algum lugar.
      this.logger.warn(`Envio descartado na vitrine ${slug}: campo-armadilha`);
      return { recebido: true };
    }

    const ficha = conferirFicha(slug, dados.ficha);

    if (ficha === 'invalida') {
      throw new BadRequestException({
        mensagem:
          'Este formulario expirou. Recarregue a pagina e envie de novo.',
      });
    }

    if (ficha === 'cedo') {
      throw new BadRequestException({
        mensagem: 'Aguarde um instante e envie de novo.',
      });
    }

    await this.catalogo.registrarInteresse(slug, dados, requisicao.ip);

    return { recebido: true };
  }
}
