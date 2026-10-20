import {
  Controller,
  Get,
  Module,
  Patch,
  Post,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AutorizacaoModule } from '../../src/autorizacao/autorizacao.module';
import {
  AutorizacaoGuard,
  type RequisicaoAutorizada,
} from '../../src/autorizacao/autorizacao.guard';
import { AutorizacaoService } from '../../src/autorizacao/autorizacao.service';
import { Exige } from '../../src/autorizacao/exige.decorator';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Rotas que existem **somente nos testes**, para exercitar os sete passos de
 * [permissions.md](../../../../docs/permissions.md) §6 ponta a ponta.
 *
 * ## Por que rotas de teste, e nao as de producao
 *
 * Porque as de producao ainda nao existem: imovel e lead sao a Fase 2 do
 * roadmap. Esperar por elas significaria entregar a guarda sem teste, e e
 * justamente o tipo de codigo que nao se verifica depois.
 *
 * O que estas rotas tem de real: a guarda de verdade, o servico de verdade, as
 * tabelas de verdade e as mesmas acoes da matriz. O que elas nao provam: que a
 * rota de producao vai se lembrar de chamar o servico. Essa parte so o item B1
 * fecha, com teste de travessia por endpoint ([permissions.md] §8.6).
 *
 * Elas devolvem o contexto montado pela guarda **de proposito**: e assim que o
 * teste verifica que a organizacao ativa saiu da sessao e nao do que o cliente
 * mandou no corpo ou na query.
 */
@Controller('teste')
@UseGuards(AutorizacaoGuard)
export class RecursosDeTesteController {
  constructor(
    private readonly autorizacao: AutorizacaoService,
    private readonly prisma: PrismaService,
  ) {}

  /** Passos 1 a 4 apenas. Devolve o contexto para inspecao. */
  @Get('contexto')
  @Exige('organizacao:ver')
  contexto(@Req() requisicao: RequisicaoAutorizada) {
    const { organizationId, membershipId, papel, escopo, acao } =
      requisicao.autorizacao;

    return { organizationId, membershipId, papel, escopo, acao };
  }

  /** `imovel:ver` e `ORG` para todos os papeis: so o passo 5 pesa aqui. */
  @Get('imoveis/:id')
  @Exige('imovel:ver')
  async verImovel(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
  ) {
    // De proposito **sem** `organizationId` no where: e o passo 5 que tem de
    // barrar o registro de outra organizacao. Uma query que ja filtra nao
    // testaria nada — e o `WHERE` esquecido e o que se quer cobrir.
    const imovel = await this.prisma.property.findUnique({
      where: { id },
      select: { id: true, code: true, organizationId: true },
    });

    return this.autorizacao.conferir(requisicao.autorizacao, imovel);
  }

  /**
   * `imovel:editar` e `OWN` para `AGENT`: passos 5, 6 e 7.
   *
   * Como `imovel:ver` e `ORG`, o corretor **ve** o imovel do colega — logo a
   * recusa ao editar e 403, nao 404.
   */
  @Patch('imoveis/:id')
  @Exige('imovel:editar')
  async editarImovel(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
  ) {
    const imovel = await this.prisma.property.findUnique({
      where: { id },
      select: { id: true, organizationId: true, ownerMemberId: true },
    });

    const autorizado = this.autorizacao.conferir(
      requisicao.autorizacao,
      imovel,
      { responsavelId: imovel?.ownerMemberId ?? null },
    );

    // Passo 7: toda escrita gera auditoria.
    await this.autorizacao.registrar(requisicao.autorizacao, {
      entityType: 'Property',
      entityId: autorizado.id,
      action: 'imovel.editado',
      metadata: { viaTeste: true },
    });

    return { id: autorizado.id };
  }

  /**
   * `lead:ver` e `OWN` para `AGENT`: o lead do colega responde **404**.
   *
   * O par com `verImovel` e o ponto central: mesma pessoa, mesmo papel, mesma
   * organizacao, codigos diferentes — porque a matriz diz coisas diferentes
   * sobre ver imovel e ver lead.
   */
  @Get('leads/:id')
  @Exige('lead:ver')
  async verLead(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        organizationId: true,
        assignedMemberId: true,
      },
    });

    return this.autorizacao.conferir(requisicao.autorizacao, lead, {
      responsavelId: lead?.assignedMemberId ?? null,
    });
  }

  /** `imovel:excluir` e `false` para `MANAGER` e `AGENT`: 403 no passo 4. */
  @Post('imoveis/:id/excluir')
  @Exige('imovel:excluir')
  excluirImovel(@Param('id') id: string) {
    return { id };
  }

  /**
   * Rota com a guarda e **sem** `@Exige`. Erro de programacao que tem de
   * fechar: abrir por omissao faria um esquecimento virar rota publica.
   */
  @Get('sem-acao-declarada')
  semAcaoDeclarada() {
    return { naoDeveriaChegarAqui: true };
  }

  /**
   * Acao de escopo `OWN` cujo `conferir()` e chamado **sem** o responsavel.
   * Tem de estourar erro de programacao (500), nunca liberar por omissao.
   */
  @Get('leads/:id/sem-responsavel')
  @Exige('lead:ver')
  async leadSemResponsavel(
    @Req() requisicao: RequisicaoAutorizada,
    @Param('id') id: string,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });

    return this.autorizacao.conferir(requisicao.autorizacao, lead);
  }
}

@Module({
  imports: [AutorizacaoModule],
  controllers: [RecursosDeTesteController],
})
export class RecursosDeTesteModule {}
