import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  alterarStatusDoLeadSchema,
  atribuirLeadSchema,
  atualizarLeadSchema,
  criarLeadSchema,
  filtrosDeLeadsSchema,
  paginacaoSchema,
  type EntradaDeAlterarStatusDoLead,
  type EntradaDeAtribuirLead,
  type EntradaDeAtualizarLead,
  type EntradaDeCriarLead,
  type FiltrosDeLeads,
  type Paginacao,
} from '@app/shared';
import { ZodValidationPipe } from '../validacao/zod-validation.pipe';
import { AutorizacaoGuard } from '../autorizacao/autorizacao.guard';
import type { RequisicaoAutorizada } from '../autorizacao/autorizacao.guard';
import { Exige } from '../autorizacao/exige.decorator';
import { LeadsService } from './leads.service';

/**
 * Leads da organizacao ativa — item **B5**.
 *
 * ## A fila de nao atribuidos nao tem rota propria
 *
 * Ela e o filtro `naoAtribuidos=true` da listagem. A alternativa seria um
 * `GET /leads/a-distribuir` com `@Exige('lead:verNaoAtribuidos')`, o que
 * deixaria a guarda resolver a permissao estaticamente — mais limpo nesse
 * ponto, e pior no resto: duas rotas lendo a mesma tabela com o mesmo recorte,
 * paginacao e busca duplicados, e a certeza de que um dia so uma das duas
 * ganharia um filtro novo.
 *
 * O preco e que a permissao da fila e conferida no **servico**, e nao por
 * `@Exige`. E o mesmo arranjo do controller de convites: a guarda garante o
 * piso (`lead:ver`), e o teto — que depende do que veio na requisicao — e
 * conferido onde a requisicao e lida.
 *
 * ## Duas rotas de evento, e nao campos de edicao
 *
 * `atribuir` e `status` sao `POST` proprios. Como campos do `PATCH`, "passei o
 * lead para a Bianca" e "corrigi o telefone" gerariam a mesma linha de
 * auditoria — e o historico de atribuicao, que e exatamente o que se consulta
 * quando dois corretores discutem de quem era o cliente, nao existiria.
 */
@Controller('leads')
@UseGuards(AutorizacaoGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @HttpCode(201)
  @Exige('lead:criar')
  criar(
    @Body(new ZodValidationPipe(criarLeadSchema)) dados: EntradaDeCriarLead,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.leads.criar(requisicao.autorizacao, dados);
  }

  @Get()
  @Exige('lead:ver')
  listar(
    @Query(new ZodValidationPipe(filtrosDeLeadsSchema)) filtros: FiltrosDeLeads,
    @Query(new ZodValidationPipe(paginacaoSchema)) paginacao: Paginacao,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.leads.listar(requisicao.autorizacao, filtros, paginacao);
  }

  /**
   * Contador da fila, para o dashboard.
   *
   * Vem **antes** de `:id` de proposito: `@Get(':id')` casaria com
   * `/leads/nao-atribuidos` e trataria "nao-atribuidos" como identificador. O
   * Nest resolve rotas na ordem de declaracao, e trocar estes dois metodos de
   * lugar quebraria esta rota com um 404 que nao aponta para a causa.
   */
  @Get('nao-atribuidos/contagem')
  @Exige('lead:verNaoAtribuidos')
  async contarNaoAtribuidos(@Req() requisicao: RequisicaoAutorizada) {
    return {
      total: await this.leads.contarNaoAtribuidos(requisicao.autorizacao),
    };
  }

  @Get(':id')
  @Exige('lead:ver')
  ver(@Req() requisicao: RequisicaoAutorizada, @Param('id') id: string) {
    return this.leads.ver(requisicao.autorizacao, id);
  }

  @Patch(':id')
  @Exige('lead:editar')
  atualizar(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atualizarLeadSchema))
    dados: EntradaDeAtualizarLead,
  ) {
    return this.leads.atualizar(requisicao.autorizacao, id, dados);
  }

  @Post(':id/responsavel')
  @HttpCode(200)
  @Exige('lead:atribuir')
  atribuir(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(atribuirLeadSchema))
    dados: EntradaDeAtribuirLead,
  ) {
    return this.leads.atribuir(requisicao.autorizacao, id, dados);
  }

  @Post(':id/situacao')
  @HttpCode(200)
  @Exige('lead:editar')
  alterarStatus(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(alterarStatusDoLeadSchema))
    dados: EntradaDeAlterarStatusDoLead,
  ) {
    return this.leads.alterarStatus(requisicao.autorizacao, id, dados);
  }

  @Delete(':id')
  @Exige('lead:excluir')
  excluir(@Req() requisicao: RequisicaoAutorizada, @Param('id') id: string) {
    return this.leads.excluir(requisicao.autorizacao, id);
  }
}
