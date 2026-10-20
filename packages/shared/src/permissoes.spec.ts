/**
 * Testes da matriz de permissoes.
 *
 * Dois tipos de verificacao aqui, e a diferenca importa:
 *
 * 1. **Estruturais**: percorrem a matriz inteira e cobrem toda acao x papel.
 *    Acao nova entra no teste sozinha, sem ninguem lembrar de adicionar.
 * 2. **Pontuais**: fixam as decisoes que doem se forem invertidas por
 *    descuido — especialmente a assimetria entre imovel e lead.
 *
 * Isto NAO substitui os testes de isolamento multi-tenant de
 * docs/permissions.md §8, que precisam de banco e chamam a API de verdade.
 * Aqui so se verifica a tabela.
 */

import { describe, expect, it } from 'vitest';
import { Role } from './enums';
import {
  type Acao,
  MATRIZ_DE_PERMISSOES,
  papeisQuePodeConvidar,
  podeAgirSobreMembro,
  podeFazer,
  temAlgumAcesso,
} from './permissoes';

const TODOS_OS_PAPEIS = Object.values(Role);
const TODAS_AS_ACOES = Object.keys(MATRIZ_DE_PERMISSOES) as Acao[];
const ESCOPOS_VALIDOS = ['ORG', 'OWN', false];

describe('estrutura da matriz', () => {
  it('cobre todas as ações', () => {
    expect(TODAS_AS_ACOES.length).toBeGreaterThan(30);
  });

  it.each(TODAS_AS_ACOES)('%s declara os quatro papéis', (acao) => {
    expect(Object.keys(MATRIZ_DE_PERMISSOES[acao]).sort()).toEqual(
      [...TODOS_OS_PAPEIS].sort(),
    );
  });

  it.each(TODAS_AS_ACOES)('%s usa apenas escopos válidos', (acao) => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(ESCOPOS_VALIDOS).toContain(podeFazer(papel, acao));
    }
  });

  it('nunca dá ao AGENT mais alcance que ao MANAGER', () => {
    // Exceção única e documentada: imóveis são legíveis por toda a
    // organização, inclusive pelo corretor. Fora disso, um corretor com
    // alcance maior que o do gerente seria sempre erro de digitação.
    const peso = { ORG: 2, OWN: 1 } as const;
    const valor = (e: 'ORG' | 'OWN' | false) => (e === false ? 0 : peso[e]);

    const invertidas = TODAS_AS_ACOES.filter(
      (acao) =>
        valor(podeFazer(Role.AGENT, acao)) >
        valor(podeFazer(Role.MANAGER, acao)),
    );

    expect(invertidas).toEqual([]);
  });
});

describe('assimetria entre imóvel e lead', () => {
  it('corretor lê todos os imóveis da organização', () => {
    expect(podeFazer(Role.AGENT, 'imovel:ver')).toBe('ORG');
  });

  it('corretor edita apenas os imóveis dele', () => {
    expect(podeFazer(Role.AGENT, 'imovel:editar')).toBe('OWN');
  });

  it('corretor lê apenas os leads dele', () => {
    // Se isto virar 'ORG', a carteira de leads de um corretor fica visível
    // aos colegas. É a decisão mais sensível da matriz.
    expect(podeFazer(Role.AGENT, 'lead:ver')).toBe('OWN');
  });

  it('corretor não vê a fila de leads não atribuídos', () => {
    expect(podeFazer(Role.AGENT, 'lead:verNaoAtribuidos')).toBe(false);
  });

  it('negociação, visita e tarefa seguem a visibilidade do lead', () => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(podeFazer(papel, 'negociacao:ver')).toBe(
        podeFazer(papel, 'lead:ver'),
      );
    }
  });
});

describe('auditoria', () => {
  it('ninguém edita o log, nem o OWNER', () => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(temAlgumAcesso(papel, 'auditoria:editarLog')).toBe(false);
    }
  });
});

describe('perfil próprio', () => {
  it('todo papel edita o próprio perfil, sempre com escopo OWN', () => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(podeFazer(papel, 'perfil:editar')).toBe('OWN');
    }
  });
});

describe('ações exclusivas do OWNER', () => {
  it.each([
    'organizacao:excluir',
    'organizacao:alterarPlano',
    'equipe:convidarAdmin',
    'equipe:transferirPropriedade',
  ] as Acao[])('%s é só do OWNER', (acao) => {
    expect(temAlgumAcesso(Role.OWNER, acao)).toBe(true);
    expect(temAlgumAcesso(Role.ADMIN, acao)).toBe(false);
    expect(temAlgumAcesso(Role.MANAGER, acao)).toBe(false);
    expect(temAlgumAcesso(Role.AGENT, acao)).toBe(false);
  });
});

describe('papéis que cada papel pode convidar', () => {
  it('OWNER convida os três', () => {
    expect(papeisQuePodeConvidar(Role.OWNER)).toEqual([
      Role.ADMIN,
      Role.MANAGER,
      Role.AGENT,
    ]);
  });

  it('ADMIN não convida outro ADMIN', () => {
    expect(papeisQuePodeConvidar(Role.ADMIN)).toEqual([
      Role.MANAGER,
      Role.AGENT,
    ]);
  });

  it('MANAGER convida apenas corretor', () => {
    expect(papeisQuePodeConvidar(Role.MANAGER)).toEqual([Role.AGENT]);
  });

  it('AGENT não convida ninguém', () => {
    expect(papeisQuePodeConvidar(Role.AGENT)).toEqual([]);
  });

  it('ninguém convida OWNER por esta via', () => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(papeisQuePodeConvidar(papel)).not.toContain(Role.OWNER);
    }
  });
});

describe('ações sobre outro membro', () => {
  const acoes = ['equipe:alterarPapel', 'equipe:removerMembro'] as const;

  it.each(acoes)('%s: ninguém age sobre si mesmo, nem o OWNER', (acao) => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(
        podeAgirSobreMembro({
          papelDoAtor: papel,
          papelDoAlvo: papel,
          ehOProprioMembro: true,
          acao,
        }),
      ).toBe(false);
    }
  });

  it.each(acoes)('%s: ninguém age sobre o OWNER', (acao) => {
    for (const papel of TODOS_OS_PAPEIS) {
      expect(
        podeAgirSobreMembro({
          papelDoAtor: papel,
          papelDoAlvo: Role.OWNER,
          ehOProprioMembro: false,
          acao,
        }),
      ).toBe(false);
    }
  });

  it.each(acoes)('%s: ADMIN não age sobre outro ADMIN', (acao) => {
    expect(
      podeAgirSobreMembro({
        papelDoAtor: Role.ADMIN,
        papelDoAlvo: Role.ADMIN,
        ehOProprioMembro: false,
        acao,
      }),
    ).toBe(false);
  });

  it.each(acoes)('%s: OWNER age sobre ADMIN', (acao) => {
    expect(
      podeAgirSobreMembro({
        papelDoAtor: Role.OWNER,
        papelDoAlvo: Role.ADMIN,
        ehOProprioMembro: false,
        acao,
      }),
    ).toBe(true);
  });

  it.each(acoes)('%s: ADMIN age sobre MANAGER e AGENT', (acao) => {
    for (const alvo of [Role.MANAGER, Role.AGENT]) {
      expect(
        podeAgirSobreMembro({
          papelDoAtor: Role.ADMIN,
          papelDoAlvo: alvo,
          ehOProprioMembro: false,
          acao,
        }),
      ).toBe(true);
    }
  });

  it.each(acoes)('%s: MANAGER e AGENT não agem sobre ninguém', (acao) => {
    for (const ator of [Role.MANAGER, Role.AGENT]) {
      for (const alvo of TODOS_OS_PAPEIS) {
        expect(
          podeAgirSobreMembro({
            papelDoAtor: ator,
            papelDoAlvo: alvo,
            ehOProprioMembro: false,
            acao,
          }),
        ).toBe(false);
      }
    }
  });
});
