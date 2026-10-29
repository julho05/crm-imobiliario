import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { EntradaDeTrocarEnderecoDaVitrine } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AutorizacaoService } from '../autorizacao/autorizacao.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';
import { LimiteDeTentativasService } from '../limite/limite-de-tentativas.service';
import { LIMITES } from '../limite/regras';
import { ehViolacaoDeUnicidade } from '../comum/erros-do-prisma';

/**
 * A organização ativa — por enquanto, só o endereço da vitrine (item **C3**).
 *
 * ## O endereço antigo fica, para sempre
 *
 * Decisão de 19/10/2026 (`data-model.md` §3.1): trocar o slug guarda o antigo
 * em `OrganizationSlugHistory`, e o catálogo responde a ele com
 * redirecionamento permanente. Anúncio impresso e link no Instagram não podem
 * virar página de erro.
 *
 * ## Ocupado é ocupado nas duas tabelas
 *
 * O slug novo é recusado se for de outra organização **ou** se ainda
 * redirecionar para outra organização — a mesma regra do cadastro. Adotar um
 * desses faria o link antigo do concorrente passar a abrir esta vitrine.
 *
 * A exceção é o slug que redireciona para **esta** organização: voltar ao
 * endereço de antes é permitido, e a linha sai do histórico, porque um slug não
 * pode ser ao mesmo tempo o atual e um antigo.
 */

export type EnderecoDaVitrine = {
  slug: string;
  /** Endereços antigos que continuam redirecionando para este. */
  anteriores: string[];
};

@Injectable()
export class OrganizacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorizacao: AutorizacaoService,
    private readonly limite: LimiteDeTentativasService,
  ) {}

  async endereco(contexto: ContextoAutorizado): Promise<EnderecoDaVitrine> {
    const organizacao = await this.prisma.organization.findUniqueOrThrow({
      where: { id: contexto.organizationId },
      select: {
        slug: true,
        slugHistory: {
          select: { slug: true },
          orderBy: { releasedAt: 'desc' },
        },
      },
    });

    return {
      slug: organizacao.slug,
      anteriores: organizacao.slugHistory.map((linha) => linha.slug),
    };
  }

  /**
   * Troca o endereço da vitrine.
   *
   * O limite (3 por 30 dias) é consumido **depois** das recusas e antes da
   * escrita: só conta a troca que vai acontecer. Ver a nota em
   * `limite/regras.ts`.
   *
   * A verificação prévia dá a mensagem boa no caso comum; a garantia é o
   * índice único das duas tabelas, dentro da transação.
   */
  async trocarEndereco(
    contexto: ContextoAutorizado,
    dados: EntradaDeTrocarEnderecoDaVitrine,
  ): Promise<EnderecoDaVitrine> {
    const atual = await this.prisma.organization.findUniqueOrThrow({
      where: { id: contexto.organizationId },
      select: { slug: true },
    });

    if (atual.slug === dados.slug) {
      throw new BadRequestException({
        mensagem: 'Este ja e o endereco atual da vitrine.',
      });
    }

    const [deOutra, noHistorico] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { slug: dados.slug },
        select: { id: true },
      }),
      this.prisma.organizationSlugHistory.findUnique({
        where: { slug: dados.slug },
        select: { id: true, organizationId: true },
      }),
    ]);

    const voltaAoProprio =
      noHistorico?.organizationId === contexto.organizationId;

    if (deOutra || (noHistorico && !voltaAoProprio)) {
      throw new ConflictException({ mensagem: ENDERECO_EM_USO });
    }

    await this.limite.consumir({
      regra: LIMITES.trocaDeEnderecoPorOrganizacao,
      partes: [contexto.organizationId],
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        if (voltaAoProprio) {
          await tx.organizationSlugHistory.delete({
            where: { id: noHistorico.id },
          });
        }

        await tx.organizationSlugHistory.create({
          data: {
            organizationId: contexto.organizationId,
            slug: atual.slug,
            releasedAt: new Date(),
          },
        });

        await tx.organization.update({
          where: { id: contexto.organizationId },
          data: { slug: dados.slug },
        });

        await this.autorizacao.registrar(
          contexto,
          {
            entityType: 'Organization',
            entityId: contexto.organizationId,
            action: 'organizacao.enderecoTrocado',
            metadata: { de: atual.slug, para: dados.slug, voltaAoProprio },
          },
          tx,
        );
      });
    } catch (erro) {
      // Outra organização adotou o mesmo slug entre a verificação e a escrita.
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ConflictException({ mensagem: ENDERECO_EM_USO });
      }

      throw erro;
    }

    return this.endereco(contexto);
  }
}

const ENDERECO_EM_USO = 'Este endereco ja esta em uso. Escolha outro.';
