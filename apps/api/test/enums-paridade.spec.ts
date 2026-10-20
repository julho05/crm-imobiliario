/**
 * Paridade entre os enums de `@app/shared` e os do schema do Prisma.
 *
 * ## Por que este teste existe
 *
 * `packages/shared` nao pode importar o client do Prisma: ele e gerado dentro
 * de `apps/api/`, e um pacote compartilhado que dependesse de um app criaria a
 * dependencia invertida que a arquitetura evita. A consequencia e que os
 * mesmos valores existem em dois lugares.
 *
 * Duplicacao sem verificacao apodrece. Este teste e a verificacao, e roda nos
 * dois sentidos:
 *
 * 1. Enum compartilhado que divergir do Prisma falha.
 * 2. Enum novo no Prisma que nao esteja nem compartilhado nem na lista de
 *    "somente servidor" tambem falha — porque a alternativa seria o valor
 *    nascer no banco e nunca aparecer na interface.
 *
 * Este arquivo mora na API porque a API e o unico lugar que ve os dois lados.
 */

import { describe, expect, it } from 'vitest';
import {
  AddressVisibility,
  ENUMS_SOMENTE_SERVIDOR,
  ETAPAS_PADRAO_DO_FUNIL,
  LeadSource,
  LeadStatus,
  MediaKind,
  MembershipStatus,
  OrganizationKind,
  ORDEM_DOS_PAPEIS,
  PropertyPurpose,
  PropertyStatus,
  PropertyType,
  Role,
  TaskStatus,
  ThemePreference,
  VisitStatus,
} from '@app/shared';
import * as prisma from '../src/generated/prisma/enums';

/** Os enums que `@app/shared` publica, pelo nome que têm no schema Prisma. */
const COMPARTILHADOS: Record<string, Record<string, string>> = {
  Role,
  MembershipStatus,
  OrganizationKind,
  ThemePreference,
  PropertyType,
  PropertyPurpose,
  PropertyStatus,
  AddressVisibility,
  MediaKind,
  LeadSource,
  LeadStatus,
  VisitStatus,
  TaskStatus,
};

/**
 * Enums do Prisma, descobertos em tempo de execucao. Não é uma lista escrita à
 * mão de propósito: lista escrita à mão não detecta enum novo, que é
 * exatamente o caso que mais importa.
 */
function enumsDoPrisma(): Record<string, Record<string, string>> {
  const encontrados: Record<string, Record<string, string>> = {};

  for (const [nome, valor] of Object.entries(prisma)) {
    const pareceEnum =
      typeof valor === 'object' &&
      valor !== null &&
      Object.values(valor).every((v) => typeof v === 'string');

    if (pareceEnum) {
      encontrados[nome] = valor as Record<string, string>;
    }
  }

  return encontrados;
}

describe('enums compartilhados x schema do Prisma', () => {
  const doPrisma = enumsDoPrisma();

  it('encontra os enums gerados pelo Prisma', () => {
    // Guarda contra o teste passar por não ter achado nada para comparar.
    expect(Object.keys(doPrisma).length).toBeGreaterThan(10);
  });

  describe.each(Object.keys(COMPARTILHADOS))('%s', (nome) => {
    it('existe no schema do Prisma', () => {
      expect(
        doPrisma[nome],
        `${nome} não existe no schema do Prisma`,
      ).toBeDefined();
    });

    it('tem exatamente os mesmos valores', () => {
      expect(Object.keys(COMPARTILHADOS[nome]).sort()).toEqual(
        Object.keys(doPrisma[nome] ?? {}).sort(),
      );
      expect(COMPARTILHADOS[nome]).toEqual(doPrisma[nome]);
    });
  });

  it('todo enum do Prisma está compartilhado ou declarado como somente servidor', () => {
    const naoClassificados = Object.keys(doPrisma).filter(
      (nome) =>
        !(nome in COMPARTILHADOS) &&
        !(ENUMS_SOMENTE_SERVIDOR as readonly string[]).includes(nome),
    );

    expect(
      naoClassificados,
      'Enum novo no schema. Compartilhe em packages/shared/src/enums.ts ou ' +
        'declare em ENUMS_SOMENTE_SERVIDOR explicando por que fica fora.',
    ).toEqual([]);
  });

  it('não sobra enum "somente servidor" que já saiu do schema', () => {
    const obsoletos = (ENUMS_SOMENTE_SERVIDOR as readonly string[]).filter(
      (nome) => !(nome in doPrisma),
    );

    expect(obsoletos, 'Remova de ENUMS_SOMENTE_SERVIDOR').toEqual([]);
  });
});

describe('hierarquia de papéis', () => {
  it('cobre todos os papéis, sem repetição', () => {
    expect([...ORDEM_DOS_PAPEIS].sort()).toEqual(Object.keys(Role).sort());
  });

  it('começa no OWNER', () => {
    expect(ORDEM_DOS_PAPEIS[0]).toBe(Role.OWNER);
  });
});

describe('etapas padrão do funil', () => {
  it('tem posições únicas e sequenciais', () => {
    const posicoes = ETAPAS_PADRAO_DO_FUNIL.map((e) => e.posicao);
    expect(posicoes).toEqual([...new Set(posicoes)].sort((a, b) => a - b));
  });

  it('tem exatamente uma etapa de ganho e uma de perda', () => {
    expect(ETAPAS_PADRAO_DO_FUNIL.filter((e) => e.isWon)).toHaveLength(1);
    expect(ETAPAS_PADRAO_DO_FUNIL.filter((e) => e.isLost)).toHaveLength(1);
  });

  it('não marca a mesma etapa como ganha e perdida', () => {
    expect(ETAPAS_PADRAO_DO_FUNIL.filter((e) => e.isWon && e.isLost)).toEqual(
      [],
    );
  });
});
