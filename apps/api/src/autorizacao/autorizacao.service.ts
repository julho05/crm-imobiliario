import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  MATRIZ_DE_PERMISSOES,
  podeFazer,
  type Acao,
  type Role,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { NaoEncontrado } from '../comum/nao-encontrado';
import type { ContextoAutorizado } from './autorizacao.guard';

/**
 * Passos **5, 6 e 7** dos sete de
 * [permissions.md](../../../../docs/permissions.md) §6.
 *
 * 5. Carregar o recurso e conferir o dono — `recurso.organizationId` tem de
 *    bater com a organizacao ativa. Divergiu → 404
 * 6. Verificar escopo — se a permissao e `OWN`, conferir a atribuicao ao
 *    membro atual
 * 7. Registrar em auditoria — toda escrita
 *
 * ## Por que isto nao cabe na guarda
 *
 * A guarda roda **antes** do controller, e os passos 5 e 6 dependem do
 * registro ja carregado — que so o controller sabe buscar. Dai a divisao: a
 * guarda decide se a pessoa pode, em principio, agir nesta organizacao; o
 * servico decide se pode agir **naquele registro**.
 *
 * ## Por que conferir o dono se a query ja filtrou
 *
 * Porque um dia a query nao vai filtrar. O `WHERE organizationId` esquecido em
 * um `findUnique` por id, ou em um join adicionado as pressas, e o modo mais
 * comum de vazar dado entre clientes — e e silencioso: o teste do caminho
 * feliz passa, porque o registro da propria organizacao aparece do mesmo jeito.
 * Um `SELECT` a mais e defesa em profundidade barata perto disso.
 */

/** Metadados de auditoria. JSON puro: nada de `Date`, `Decimal` ou classe. */
export type MetadadosDeAuditoria = Record<
  string,
  string | number | boolean | null
>;

export type EventoDeAuditoria = {
  /** Nome do modelo, como no Prisma: `Property`, `Lead`, `Membership`. */
  entityType: string;
  entityId: string;
  /** Verbo no passado, em portugues: `imovel.publicado`, `lead.atribuido`. */
  action: string;
  metadata?: MetadadosDeAuditoria;
};

/**
 * Cliente de escrita: o `PrismaService` ou o `tx` de uma transacao.
 *
 * Existe para que a auditoria entre **na mesma transacao** da escrita que ela
 * registra. Fora da transacao, uma falha na auditoria deixaria a escrita feita
 * e o log sem a linha — exatamente o caso em que o log precisava servir de
 * prova.
 */
export type ClienteDeEscrita = Prisma.TransactionClient;

/**
 * Quem agiu, do ponto de vista da auditoria.
 *
 * Deliberadamente mais estreito que o `ContextoAutorizado` — que o satisfaz
 * por estrutura, sem conversao. Existe porque ha escrita legitima **sem**
 * organizacao ativa: aceitar um convite cria o proprio vinculo, e nesse
 * instante a pessoa ainda nao tem organizacao ativa nenhuma. Sem isto, esse
 * fluxo precisaria escrever na tabela `Activity` por conta propria, e a regra
 * de que auditoria aponta para `Membership` passaria a existir em dois lugares.
 */
export type AtorDaAuditoria = {
  organizationId: string;
  /** `Membership.id`. E a ele que a auditoria aponta, nunca ao `User`. */
  membershipId: string;
  ipHash?: string;
};

@Injectable()
export class AutorizacaoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Passos 5 e 6. Devolve o recurso quando o acesso e legitimo; lanca quando
   * nao e.
   *
   * Recebe o recurso **ja carregado** — e `null` tambem e entrada valida:
   * "nao existe" e "existe em outra organizacao" tem de produzir a mesma
   * resposta, senao a diferenca denuncia a existencia do registro.
   *
   * `opcoes.responsavelId` e o `Membership.id` do responsavel pelo registro, ou
   * `null` quando nao ha. E obrigatorio quando a acao tem escopo `OWN`;
   * omitir nesse caso e erro de programacao e estoura na hora, em vez de
   * liberar por omissao.
   */
  conferir<T extends { organizationId: string }>(
    contexto: ContextoAutorizado,
    recurso: T | null | undefined,
    opcoes?: { responsavelId: string | null },
  ): T {
    // Passo 5.
    if (!recurso || recurso.organizationId !== contexto.organizationId) {
      throw new NaoEncontrado();
    }

    if (contexto.escopo === 'ORG') {
      return recurso;
    }

    // Passo 6.
    if (!opcoes) {
      throw new Error(
        `Acao "${contexto.acao}" tem escopo OWN para o papel ` +
          `${contexto.papel}, mas conferir() foi chamado sem responsavelId. ` +
          'Carregue o responsavel do registro e passe-o.',
      );
    }

    if (opcoes.responsavelId !== contexto.membershipId) {
      // Registro nao atribuido a esta pessoa. O **codigo** da recusa depende
      // de o papel poder ou nao ver o registro — ver `escondeORegistro`.
      throw escondeORegistro(contexto.acao, contexto.papel)
        ? new NaoEncontrado()
        : new ForbiddenException(
            'Este registro esta sob responsabilidade de outra pessoa.',
          );
    }

    return recurso;
  }

  /**
   * Passo 7. Grava uma linha de auditoria.
   *
   * Nao engole erro: auditoria que falha em silencio nao serve de prova. Passe
   * o `tx` da transacao da escrita sempre que houver uma.
   *
   * Nao existe metodo de alteracao nem de exclusao aqui, e isso e deliberado:
   * `auditoria:editarLog` e `false` para **todos** os papeis na matriz,
   * inclusive o `OWNER`. Log que o administrador edita nao prova nada.
   */
  async registrar(
    ator: AtorDaAuditoria,
    evento: EventoDeAuditoria,
    cliente: ClienteDeEscrita = this.prisma,
  ): Promise<void> {
    await cliente.activity.create({
      data: {
        organizationId: ator.organizationId,
        // Aponta para o Membership, nunca para o User: quem agiu, agiu
        // naquele papel e naquela organizacao.
        actorMembershipId: ator.membershipId,
        entityType: evento.entityType,
        entityId: evento.entityId,
        action: evento.action,
        metadata: evento.metadata,
        ipHash: ator.ipHash,
      },
    });
  }
}

/**
 * Quando a atribuicao nao bate, a recusa deve esconder o registro (404) ou
 * admitir que ele existe (403)?
 *
 * A resposta sai da propria matriz, sem lista escrita a mao: se o papel le
 * **todos** os registros daquele recurso na organizacao, ele ja sabe que
 * aquele registro existe — esconder seria teatro, e o 403 e mais honesto e
 * mais util na interface. Se o papel le apenas os proprios, o registro e
 * invisivel para ele, e um 403 entregaria justamente a informacao que o escopo
 * `OWN` existe para negar.
 *
 * E a diferenca que [permissions.md](../../../../docs/permissions.md) §8.3
 * descreve entre imovel e lead, para o mesmo papel `AGENT`:
 *
 * - `imovel:ver` e `ORG` para `AGENT` → ele ve o imovel do colega e recebe
 *   **403** ao tentar editar
 * - `lead:ver` e `OWN` para `AGENT` → o lead do colega responde **404**, como
 *   se nao existisse
 *
 * Recurso sem acao de leitura na matriz (`perfil`, `equipe`, `auditoria`) cai
 * no lado que esconde. Padrao restritivo: se um dia alguem adicionar um
 * recurso e esquecer a acao de leitura, o erro revela menos, nao mais.
 */
function escondeORegistro(acao: Acao, papel: Role): boolean {
  const recurso = acao.slice(0, acao.indexOf(':'));
  const acaoDeLeitura = `${recurso}:ver`;

  if (!(acaoDeLeitura in MATRIZ_DE_PERMISSOES)) {
    return true;
  }

  return podeFazer(papel, acaoDeLeitura as Acao) !== 'ORG';
}
