import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import {
  trocarEnderecoDaVitrineSchema,
  type EntradaDeTrocarEnderecoDaVitrine,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard';
import type { RequisicaoAutorizada } from '../autorizacao/autorizacao.guard';
import { Exige } from '../autorizacao/exige.decorator';
import { OrganizacaoService } from './organizacao.service';

/**
 * A organização ativa — item **C3**.
 *
 * Sem `:id` no caminho, de propósito: a organização é sempre a ativa da sessão.
 * Uma rota `/organizacoes/:id` convidaria a conferir o id recebido contra o
 * vínculo, e aqui não há o que conferir — não se recebe id nenhum.
 */
@Controller('organizacao')
@UseGuards(AutorizacaoGuard)
export class OrganizacaoController {
  constructor(private readonly organizacao: OrganizacaoService) {}

  @Get('endereco')
  @Exige('organizacao:ver')
  endereco(@Req() requisicao: RequisicaoAutorizada) {
    return this.organizacao.endereco(requisicao.autorizacao);
  }

  /**
   * Só `OWNER` e `ADMIN` (`organizacao:editarSlug`). É a ação de maior alcance
   * da organização sobre o que está fora dela: muda todo link já compartilhado.
   */
  @Patch('endereco')
  @Exige('organizacao:editarSlug')
  trocarEndereco(
    @Body(new ZodValidationPipe(trocarEnderecoDaVitrineSchema))
    dados: EntradaDeTrocarEnderecoDaVitrine,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.organizacao.trocarEndereco(requisicao.autorizacao, dados);
  }
}
