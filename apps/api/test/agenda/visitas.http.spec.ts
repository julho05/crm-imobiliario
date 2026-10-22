/**
 * Item **B8**: agenda de visitas.
 *
 * Os dois critérios do roadmap: datas gravadas em **UTC** e exibidas no fuso
 * local, e **mesma visibilidade do lead**.
 *
 * ## O segundo critério ganhou uma exceção, e ela é o centro deste arquivo
 *
 * **[DECIDIDO 21/10/2026]** Em `Visit` o responsável é obrigatório e o cliente
 * é opcional — o inverso de `Deal`. Isso criou um caso que a regra original não
 * resolvia: o gerente manda o Tiago conduzir a visita do cliente da Bianca,
 * porque ela não pode no sábado. O Tiago precisa ver — ele vai encontrar a
 * pessoa.
 *
 * A decisão: enxerga quem responde pela **visita** ou pelo **cliente**. E o que
 * o responsável pela visita recebe do cliente é o mínimo do encontro — nome e
 * telefone. Os testes de `recorte do cliente` provam que o resto não vem junto,
 * e que a ficha do cliente continua fechada para ele.
 *
 * ## Duas armadilhas que este arquivo vigia
 *
 * Cada uma já causou um erro real neste código:
 *
 * 1. **A listagem filtra e a consulta por id não** — foi assim que um nome de
 *    cliente excluído vazou no item B7.
 * 2. **Filtrar por relação opcional some com quem não a tem** — `lead: {...}`
 *    no Prisma exige que a relação exista, e a visita sem cliente
 *    desapareceria da agenda.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
} from '../apoio/cenario-de-duas-organizacoes';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;

/** Uma janela larga o suficiente para conter tudo que os testes agendam. */
const JANELA = 'de=2026-01-01T00:00:00.000Z&ate=2026-06-01T00:00:00.000Z';

const INICIO = '2026-03-14T14:00:00.000Z';
const FIM = '2026-03-14T15:00:00.000Z';

type Visita = {
  id: string;
  imovel: { id: string; codigo: string; titulo: string };
  cliente: {
    id: string;
    nomeCompleto: string;
    telefone: string | null;
    acessivel: boolean;
  } | null;
  responsavel: { membershipId: string; nome: string };
  inicioEm: string;
  fimEm: string;
  situacao: string;
  observacoes: string | null;
  minha: boolean;
};

function obter(caminho: string, cookie?: string) {
  return fetch(`${app.url}/api${caminho}`, {
    headers: cookie ? { cookie } : {},
  });
}

function enviar(
  metodo: 'POST' | 'PATCH' | 'DELETE',
  caminho: string,
  cookie?: string,
  corpo?: unknown,
) {
  return fetch(`${app.url}/api${caminho}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

function agendar(cookie: string, corpo: Record<string, unknown> = {}) {
  return enviar('POST', '/visitas', cookie, {
    imovelId: cenario.imovelDeA1,
    inicioEm: INICIO,
    fimEm: FIM,
    ...corpo,
  });
}

async function agendarEObter(
  cookie: string,
  corpo: Record<string, unknown> = {},
): Promise<Visita> {
  const resposta = await agendar(cookie, corpo);

  expect(resposta.status).toBe(201);

  return (await resposta.json()) as Visita;
}

async function listar(cookie: string, consulta = JANELA): Promise<Visita[]> {
  const resposta = await obter(`/visitas?${consulta}`, cookie);

  expect(resposta.status).toBe(200);

  return ((await resposta.json()) as { visitas: Visita[] }).visitas;
}

function auditoriaDe(entityId: string) {
  return prisma.activity.findMany({
    where: { entityId },
    select: { action: true, metadata: true, actorMembershipId: true },
    orderBy: { createdAt: 'asc' },
  });
}

beforeAll(async () => {
  app = await subirAppDeTeste();
  prisma = criarClienteDeTeste();
  await prisma.$connect();
}, 60_000);

afterAll(async () => {
  await app.encerrar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparBanco(prisma);
  cenario = await montarCenario(prisma);
});

describe('agendamento', () => {
  it('agenda e devolve 201', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    expect(visita.imovel.codigo).toBe('A-001');
    expect(visita.situacao).toBe('SCHEDULED');
    expect(visita.cliente).toBeNull();
  });

  it('nasce com quem agendou como responsável', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    expect(visita.responsavel.membershipId).toBe(cenario.agenteA1.membershipId);
    expect(visita.minha).toBe(true);
  });

  it('agenda com cliente quando ele está ao alcance', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie, {
      clienteId: cenario.leadDeA1,
    });

    expect(visita.cliente?.nomeCompleto).toBe('Cliente do A1');
    expect(visita.cliente?.acessivel).toBe(true);
  });

  it('o corretor não agenda visita do cliente do colega', async () => {
    const resposta = await agendar(cenario.agenteA1.cookie, {
      clienteId: cenario.leadDeA2,
    });

    // A resposta traria o nome e o telefone daquela pessoa.
    expect(resposta.status).toBe(404);
    expect(await prisma.visit.count()).toBe(0);
  });

  it('recusa imóvel de outra organização, com 404', async () => {
    const resposta = await agendar(cenario.agenteA1.cookie, {
      imovelId: cenario.imovelDeB,
    });

    expect(resposta.status).toBe(404);
  });

  it('o corretor não agenda para outra pessoa', async () => {
    const resposta = await agendar(cenario.agenteA1.cookie, {
      responsavelId: cenario.agenteA2.membershipId,
    });

    // Agendar para outro é atribuir, e `negociacao:atribuir` é false para o
    // AGENT. O teto depende do corpo, então a conferência é no serviço.
    expect(resposta.status).toBe(400);
  });

  it('o gerente agenda para um corretor', async () => {
    const visita = await agendarEObter(cenario.managerA.cookie, {
      responsavelId: cenario.agenteA1.membershipId,
    });

    expect(visita.responsavel.nome).toBe('Agente A1');
  });

  it('recusa fim antes do início', async () => {
    const resposta = await agendar(cenario.agenteA1.cookie, {
      fimEm: '2026-03-14T13:00:00.000Z',
    });

    expect(resposta.status).toBe(400);
  });

  it('recusa data sem fuso horário', async () => {
    const resposta = await agendar(cenario.agenteA1.cookie, {
      inicioEm: '2026-03-14T14:00:00',
    });

    // Sem fuso o valor é ambíguo, e o servidor teria de adivinhar — errando
    // duas vezes por ano, quando o horário de verão muda.
    expect(resposta.status).toBe(400);
  });

  it('grava e devolve em UTC', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    expect(visita.inicioEm).toBe(INICIO);

    const noBanco = await prisma.visit.findUniqueOrThrow({
      where: { id: visita.id },
      select: { startsAt: true },
    });

    expect(noBanco.startsAt.toISOString()).toBe(INICIO);
  });

  it('registra o agendamento em auditoria', async () => {
    const visita = await agendarEObter(cenario.managerA.cookie, {
      clienteId: cenario.leadDeA1,
      responsavelId: cenario.agenteA1.membershipId,
    });

    const [linha] = await auditoriaDe(visita.id);

    expect(linha.action).toBe('visita.agendada');
    expect(linha.metadata).toMatchObject({
      comCliente: true,
      atribuidaAOutro: true,
    });
  });
});

describe('as duas portas da visibilidade', () => {
  /** Visita do cliente da A2, conduzida pelo A1 — o caso que decidiu a regra. */
  async function visitaCruzada(): Promise<Visita> {
    return agendarEObter(cenario.managerA.cookie, {
      clienteId: cenario.leadDeA2,
      responsavelId: cenario.agenteA1.membershipId,
    });
  }

  it('quem conduz enxerga, mesmo sem responder pelo cliente', async () => {
    const visita = await visitaCruzada();

    const resposta = await obter(
      `/visitas/${visita.id}`,
      cenario.agenteA1.cookie,
    );

    // Ele vai encontrar a pessoa: precisa ver a visita.
    expect(resposta.status).toBe(200);
  });

  it('quem responde pelo cliente enxerga, mesmo sem conduzir', async () => {
    const visita = await visitaCruzada();

    const resposta = await obter(
      `/visitas/${visita.id}`,
      cenario.agenteA2.cookie,
    );

    expect(resposta.status).toBe(200);
  });

  it('quem não é nem um nem outro recebe 404', async () => {
    const visita = await visitaCruzada();

    const resposta = await obter(`/visitas/${visita.id}`, cenario.dual.cookie);

    // A pessoa com dois vínculos é AGENT em A e não tem nada a ver com esta
    // visita.
    expect(resposta.status).toBe(404);
  });

  it('a visita sem cliente é vista só por quem a conduz', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    expect(
      (await obter(`/visitas/${visita.id}`, cenario.agenteA1.cookie)).status,
    ).toBe(200);
    expect(
      (await obter(`/visitas/${visita.id}`, cenario.agenteA2.cookie)).status,
    ).toBe(404);
  });

  it('a visita sem cliente aparece na agenda de quem a conduz', async () => {
    await agendarEObter(cenario.agenteA1.cookie);

    // A armadilha: `lead: { deletedAt: null }` exigiria que a relação
    // existisse, e esta visita sumiria da agenda.
    const agenda = await listar(cenario.agenteA1.cookie);

    expect(agenda).toHaveLength(1);
    expect(agenda[0].cliente).toBeNull();
  });

  it('o gerente vê as visitas de todos', async () => {
    await visitaCruzada();
    await agendarEObter(cenario.agenteA2.cookie);

    expect(await listar(cenario.managerA.cookie)).toHaveLength(2);
  });

  it('apenasMinhas recorta para quem tem escopo ORG', async () => {
    await visitaCruzada();

    const agenda = await listar(
      cenario.managerA.cookie,
      `${JANELA}&apenasMinhas=true`,
    );

    expect(agenda).toHaveLength(0);
  });
});

describe('recorte do cliente — o que a segunda porta NÃO abre', () => {
  async function visitaCruzada(): Promise<Visita> {
    return agendarEObter(cenario.managerA.cookie, {
      clienteId: cenario.leadDeA2,
      responsavelId: cenario.agenteA1.membershipId,
    });
  }

  it('entrega nome e telefone, porque o encontro é físico', async () => {
    const visita = await visitaCruzada();

    const resposta = await obter(
      `/visitas/${visita.id}`,
      cenario.agenteA1.cookie,
    );

    const corpo = (await resposta.json()) as Visita;

    expect(corpo.cliente?.nomeCompleto).toBe('Cliente do A2');
    expect(corpo.cliente?.telefone).toBe('11999990000');
  });

  it('marca o cliente como inacessível para quem só conduz', async () => {
    const visita = await visitaCruzada();

    const doCondutor = await obter(
      `/visitas/${visita.id}`,
      cenario.agenteA1.cookie,
    );
    expect(((await doCondutor.json()) as Visita).cliente?.acessivel).toBe(
      false,
    );

    const doDono = await obter(
      `/visitas/${visita.id}`,
      cenario.agenteA2.cookie,
    );
    expect(((await doDono.json()) as Visita).cliente?.acessivel).toBe(true);
  });

  it('o cliente **e** acessivel para quem tem escopo ORG, mesmo sem responder por ele', async () => {
    // Corrige um defeito de 21/10/2026, achado em 22/10 ao montar o dashboard:
    // `acessivel` comparava so a atribuicao, entao para o gerente — cujo
    // `lead:ver` e `ORG` — a resposta dizia `false` em toda visita de cliente
    // de outra pessoa. A ficha abre; a tela e que escondia o link, e nada
    // explicava por que. Errava para o lado seguro, e por isso ficou invisivel
    // ate uma tela depender dele.
    const visita = await visitaCruzada();

    for (const quem of [cenario.managerA, cenario.adminA, cenario.ownerA]) {
      const resposta = await obter(`/visitas/${visita.id}`, quem.cookie);

      expect(((await resposta.json()) as Visita).cliente?.acessivel).toBe(true);
    }
  });

  it('não entrega anotações, origem nem situação do cliente', async () => {
    await prisma.lead.update({
      where: { id: cenario.leadDeA2 },
      data: { notes: 'ANOTACAO INTERNA SIGILOSA', email: 'a2@exemplo.com' },
    });

    const visita = await visitaCruzada();

    const resposta = await obter(
      `/visitas/${visita.id}`,
      cenario.agenteA1.cookie,
    );

    const texto = await resposta.text();

    // A diferença entre "sei com quem me encontro" e "tenho acesso ao cliente
    // do meu colega" é exatamente esta lista de campos.
    expect(texto).not.toContain('ANOTACAO INTERNA SIGILOSA');
    expect(texto).not.toContain('a2@exemplo.com');
  });

  it('a ficha do cliente continua fechada para quem só conduz', async () => {
    await visitaCruzada();

    const resposta = await obter(
      `/leads/${cenario.leadDeA2}`,
      cenario.agenteA1.cookie,
    );

    // Ver a visita não dá acesso ao cliente no CRM.
    expect(resposta.status).toBe(404);
  });
});

describe('janela da agenda', () => {
  it('traz só o que está no período', async () => {
    await agendarEObter(cenario.agenteA1.cookie);

    const dentro = await listar(
      cenario.agenteA1.cookie,
      'de=2026-03-14T00:00:00.000Z&ate=2026-03-15T00:00:00.000Z',
    );
    expect(dentro).toHaveLength(1);

    const fora = await listar(
      cenario.agenteA1.cookie,
      'de=2026-03-15T00:00:00.000Z&ate=2026-03-16T00:00:00.000Z',
    );
    expect(fora).toHaveLength(0);
  });

  it('recusa período maior que seis meses', async () => {
    const resposta = await obter(
      '/visitas?de=2026-01-01T00:00:00.000Z&ate=2036-01-01T00:00:00.000Z',
      cenario.agenteA1.cookie,
    );

    // Protege contra a consulta que varre a tabela inteira.
    expect(resposta.status).toBe(400);
  });

  it('exige o período', async () => {
    const resposta = await obter('/visitas', cenario.agenteA1.cookie);

    expect(resposta.status).toBe(400);
  });

  it('devolve em ordem de início', async () => {
    await agendarEObter(cenario.agenteA1.cookie, {
      inicioEm: '2026-03-20T10:00:00.000Z',
      fimEm: '2026-03-20T11:00:00.000Z',
    });
    await agendarEObter(cenario.agenteA1.cookie);

    const agenda = await listar(cenario.agenteA1.cookie);

    expect(agenda[0].inicioEm).toBe(INICIO);
  });
});

describe('o cliente excluído some da agenda — pelos dois caminhos', () => {
  it('some da listagem e da consulta por id', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie, {
      clienteId: cenario.leadDeA1,
    });

    await enviar('DELETE', `/leads/${cenario.leadDeA1}`, cenario.ownerA.cookie);

    expect(await listar(cenario.ownerA.cookie)).toHaveLength(0);

    // A armadilha do item B7: a listagem filtrava e a consulta por id não,
    // então o nome de um cliente excluído continuava acessível.
    const porId = await obter(`/visitas/${visita.id}`, cenario.ownerA.cookie);
    expect(porId.status).toBe(404);
  });

  it('a visita sem cliente continua na agenda', async () => {
    await agendarEObter(cenario.agenteA1.cookie);
    const comCliente = await agendarEObter(cenario.agenteA1.cookie, {
      clienteId: cenario.leadDeA1,
    });

    await enviar('DELETE', `/leads/${cenario.leadDeA1}`, cenario.ownerA.cookie);

    const agenda = await listar(cenario.ownerA.cookie);

    // Só a do cliente excluído sai.
    expect(agenda).toHaveLength(1);
    expect(agenda[0].id).not.toBe(comCliente.id);
  });
});

describe('situação da visita', () => {
  function mudar(id: string, situacao: string, cookie: string) {
    return enviar('POST', `/visitas/${id}/situacao`, cookie, { situacao });
  }

  it('confirma, realiza, cancela e marca falta', async () => {
    for (const situacao of ['CONFIRMED', 'DONE', 'CANCELED', 'NO_SHOW']) {
      const visita = await agendarEObter(cenario.agenteA1.cookie);
      const resposta = await mudar(
        visita.id,
        situacao,
        cenario.agenteA1.cookie,
      );

      expect(resposta.status, situacao).toBe(200);
      expect(((await resposta.json()) as Visita).situacao).toBe(situacao);
    }
  });

  it('recusa voltar para agendada', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    const resposta = await mudar(
      visita.id,
      'SCHEDULED',
      cenario.agenteA1.cookie,
    );

    // O certo ali é marcar outra visita.
    expect(resposta.status).toBe(400);
  });

  it('recusa a situação em que já está', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    await mudar(visita.id, 'CONFIRMED', cenario.agenteA1.cookie);
    const repetido = await mudar(
      visita.id,
      'CONFIRMED',
      cenario.agenteA1.cookie,
    );

    expect(repetido.status).toBe(400);
  });

  it('cada situação gera evento de auditoria próprio', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    await mudar(visita.id, 'CONFIRMED', cenario.agenteA1.cookie);
    await mudar(visita.id, 'DONE', cenario.agenteA1.cookie);

    const linhas = await auditoriaDe(visita.id);

    expect(linhas.map((l) => l.action)).toEqual([
      'visita.agendada',
      'visita.confirmada',
      'visita.realizada',
    ]);
  });
});

describe('remarcar', () => {
  it('muda o horário', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    const resposta = await enviar(
      'PATCH',
      `/visitas/${visita.id}`,
      cenario.agenteA1.cookie,
      {
        inicioEm: '2026-03-15T16:00:00.000Z',
        fimEm: '2026-03-15T17:00:00.000Z',
      },
    );

    expect(resposta.status).toBe(200);
    expect(((await resposta.json()) as Visita).inicioEm).toBe(
      '2026-03-15T16:00:00.000Z',
    );
  });

  it('enviar só o fim é conferido contra o início gravado', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    const invalido = await enviar(
      'PATCH',
      `/visitas/${visita.id}`,
      cenario.agenteA1.cookie,
      { fimEm: '2026-03-14T13:00:00.000Z' },
    );

    // Só o servidor tem o registro para comparar.
    expect(invalido.status).toBe(400);

    const valido = await enviar(
      'PATCH',
      `/visitas/${visita.id}`,
      cenario.agenteA1.cookie,
      { fimEm: '2026-03-14T18:00:00.000Z' },
    );

    expect(valido.status).toBe(200);
  });

  it('recusa corpo vazio', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    const resposta = await enviar(
      'PATCH',
      `/visitas/${visita.id}`,
      cenario.agenteA1.cookie,
      {},
    );

    expect(resposta.status).toBe(400);
  });
});

describe('atribuição', () => {
  function atribuir(id: string, membershipId: string, cookie: string) {
    return enviar('POST', `/visitas/${id}/responsavel`, cookie, {
      membershipId,
    });
  }

  it('o corretor recebe 403', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    const resposta = await atribuir(
      visita.id,
      cenario.agenteA2.membershipId,
      cenario.agenteA1.cookie,
    );

    // Atribuir passou a revelar um contato, então fica com quem coordena.
    expect(resposta.status).toBe(403);
  });

  it('o gerente troca quem conduz', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    const resposta = await atribuir(
      visita.id,
      cenario.agenteA2.membershipId,
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(200);
    expect(((await resposta.json()) as Visita).responsavel.nome).toBe(
      'Agente A2',
    );
  });

  it('recusa membro de outra organização, com 404', async () => {
    const visita = await agendarEObter(cenario.agenteA1.cookie);

    const resposta = await atribuir(
      visita.id,
      cenario.agenteB1.membershipId,
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('a auditoria registra quando a atribuição revelou um cliente', async () => {
    const visita = await agendarEObter(cenario.managerA.cookie, {
      clienteId: cenario.leadDeA1,
    });

    await atribuir(
      visita.id,
      cenario.agenteA2.membershipId,
      cenario.managerA.cookie,
    );

    const linhas = await auditoriaDe(visita.id);
    const atribuicao = linhas.find((l) => l.action === 'visita.atribuida');

    // O cliente é do agenteA1; passar a visita ao agenteA2 revelou o contato.
    expect(atribuicao?.metadata).toMatchObject({ revelouCliente: true });
  });

  it('não marca revelação quando o destinatário já responde pelo cliente', async () => {
    const visita = await agendarEObter(cenario.managerA.cookie, {
      clienteId: cenario.leadDeA1,
      responsavelId: cenario.agenteA2.membershipId,
    });

    await atribuir(
      visita.id,
      cenario.agenteA1.membershipId,
      cenario.managerA.cookie,
    );

    const linhas = await auditoriaDe(visita.id);
    const atribuicao = linhas.find((l) => l.action === 'visita.atribuida');

    expect(atribuicao?.metadata).toMatchObject({ revelouCliente: false });
  });
});
