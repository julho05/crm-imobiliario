import { Controller, Get, Param, Query } from '@nestjs/common';
import { paginacaoSchema, type Paginacao } from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { CatalogoService } from './catalogo.service';

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
 */
@Controller('publico/organizacoes/:slug')
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get()
  organizacao(@Param('slug') slug: string) {
    return this.catalogo.organizacao(slug);
  }

  @Get('imoveis')
  listar(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(paginacaoSchema)) paginacao: Paginacao,
  ) {
    return this.catalogo.listarImoveis(slug, paginacao);
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
}
