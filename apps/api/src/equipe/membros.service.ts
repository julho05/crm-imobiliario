import { Injectable } from '@nestjs/common';
import type { Role } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ContextoAutorizado } from '../autorizacao/autorizacao.guard';

/**
 * Membros da organizacao ativa.
 *
 * ## Por que existe, e por que so agora
 *
 * Porque a atribuicao de lead (item B5) precisa de alguem para quem atribuir, e
 * o seletor dessa tela nao tem de onde tirar a lista. Sem este endpoint, o
 * `POST /leads/:id/responsavel` existiria sem interface possivel.
 *
 * ## O que ele devolve, e o que nao
 *
 * Nome, papel e `Membership.id`. **Nao devolve e-mail**, e isso e deliberado:
 * [permissions.md](../../../../docs/permissions.md) §4.4 da ao `AGENT` acesso a
 * "nome e papel" dos colegas, nao a lista de contatos da equipe. Devolver
 * e-mail aqui entregaria, a qualquer corretor, a agenda interna da imobiliaria
 * — util para quem sai para a concorrencia, e inutil para a tela que motivou
 * este endpoint.
 *
 * Quando a tela de equipe existir (ela precisa de e-mail e de data de entrada),
 * o caminho e um endpoint proprio com `equipe:verMembros` e campos a mais, nao
 * alargar este.
 *
 * ## Por que nao pagina
 *
 * Porque e a equipe de uma imobiliaria, nao uma listagem de dados. O MVP nao
 * tem convite em massa, e uma organizacao com centenas de membros nao e um caso
 * que exista hoje. Se existir, aqui e o lugar de acrescentar paginacao — e o
 * teto de `paginacaoSchema` ja esta em `@app/shared`.
 */

export type MembroDaEquipe = {
  /** `Membership.id`. E a ele que as atribuicoes apontam, nunca ao `User`. */
  membershipId: string;
  nome: string;
  papel: Role;
  /** `true` quando e a propria pessoa que consultou. */
  euMesmo: boolean;
};

@Injectable()
export class MembrosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(contexto: ContextoAutorizado): Promise<MembroDaEquipe[]> {
    const vinculos = await this.prisma.membership.findMany({
      where: {
        organizationId: contexto.organizationId,
        // Suspenso fica fora: ele nao pode receber lead, e oferece-lo no
        // seletor produziria um 404 que a pessoa nao teria como explicar.
        status: 'ACTIVE',
      },
      select: {
        id: true,
        role: true,
        user: { select: { name: true } },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    return vinculos.map((vinculo) => ({
      membershipId: vinculo.id,
      nome: vinculo.user.name,
      papel: vinculo.role,
      euMesmo: vinculo.id === contexto.membershipId,
    }));
  }
}
