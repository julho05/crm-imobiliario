/**
 * Item **B9**: o resumo do painel.
 *
 * ## O que este arquivo existe para pegar
 *
 * O resumo é a primeira rota do projeto que responde a **quatro perguntas com
 * quatro escopos diferentes** na mesma requisição, e por isso é a primeira em
 * que um erro de escopo não aparece como erro: um contador inflado parece um
 * número grande, não uma falha. O corretor que lê "12 clientes novos" quando
 * tem 2 não vê um vazamento — vê um painel animador. Então aqui cada número é
 * conferido contra o escopo da **sua** ação, para os dois papéis.
 *
 * O caso mais importante é o dos imóveis em rascunho: `imovel:ver` é `ORG` para
 * todos, e o caminho fácil seria usá-la. O número então contaria os rascunhos
 * da casa inteira para o corretor, que não pode terminar o cadastro do colega.
 * Por isso o escopo vem de `imovel:editar`, e há teste para a diferença.
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

type Resumo = {
  escopos: { clientes: string; imoveis: string; agenda: string };
  clientesNovos: number;
  clientesNaFila: number | null;
  tarefasVencidas: number;
  imoveisEmRascunho: number;
  visitas: {
    total: number;
    proximas: {
      id: string;
      inicioEm: string;
      cliente: {
        nomeCompleto: string;
        telefone: string | null;
        acessivel: boolean;
      } | null;
    }[];
  };
  primeirosPassos: {
    temImovel: boolean;
    temImovelPublicado: boolean;
    temCliente: boolean;
  };
};

/**
 * A janela que o navegador manda: hoje 00:00 até depois de amanhã 00:00, em
 * hora **local**. É a mesma conta que a tela faz, e repeti-la aqui é o que
 * garante que o contrato aceita o que o site envia.
 */
function janelaDeHojeEAmanha(): string {
  const de = new Date();
  de.setHours(0, 0, 0, 0);

  const ate = new Date(de);
  ate.setDate(ate.getDate() + 2);

  return new URLSearchParams({
    de: de.toISOString(),
    ate: ate.toISOString(),
  }).toString();
}

function obter(consulta: string, cookie?: string) {
  return fetch(`${app.url}/api/painel/resumo?${consulta}`, {
    headers: cookie ? { cookie } : {},
  });
}

async function resumoDe(cookie: string): Promise<Resumo> {
  const resposta = await obter(janelaDeHojeEAmanha(), cookie);

  expect(resposta.status).toBe(200);

  return (await resposta.json()) as Resumo;
}

/** Uma visita daqui a algumas horas, direto no banco. */
function criarVisita(params: {
  organizationId: string;
  propertyId: string;
  leadId: string | null;
  assignedMemberId: string;
  emHoras: number;
}) {
  const inicio = new Date(Date.now() + params.emHoras * 60 * 60 * 1000);

  return prisma.visit.create({
    data: {
      organizationId: params.organizationId,
      propertyId: params.propertyId,
      leadId: params.leadId,
      assignedMemberId: params.assignedMemberId,
      startsAt: inicio,
      endsAt: new Date(inicio.getTime() + 60 * 60 * 1000),
    },
    select: { id: true },
  });
}

function criarTarefaVencida(params: {
  organizationId: string;
  assignedMemberId: string;
  leadId?: string;
}) {
  return prisma.task.create({
    data: {
      organizationId: params.organizationId,
      title: 'Tarefa atrasada',
      assignedMemberId: params.assignedMemberId,
      leadId: params.leadId,
      dueAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      status: 'OPEN',
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  prisma = criarClienteDeTeste();
  app = await subirAppDeTeste();
});

afterAll(async () => {
  await app.encerrar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparBanco(prisma);
  cenario = await montarCenario(prisma);
});

describe('GET /painel/resumo — sessao e janela', () => {
  it('recusa sem sessao', async () => {
    const resposta = await obter(janelaDeHojeEAmanha());

    expect(resposta.status).toBe(401);
  });

  it('recusa janela sem fuso, que seria ambigua', async () => {
    const resposta = await obter(
      'de=2026-10-22T00:00&ate=2026-10-24T00:00',
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(400);
  });

  it('recusa periodo maior que tres dias e aponta a agenda', async () => {
    const de = new Date();
    const ate = new Date(de.getTime() + 10 * 24 * 60 * 60 * 1000);

    const resposta = await obter(
      new URLSearchParams({
        de: de.toISOString(),
        ate: ate.toISOString(),
      }).toString(),
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(400);

    const corpo = (await resposta.json()) as {
      erros: { campo: string; mensagem: string }[];
    };

    expect(corpo.erros[0].campo).toBe('ate');
    expect(corpo.erros[0].mensagem).toContain('agenda');
  });
});

describe('GET /painel/resumo — escopo de cada numero', () => {
  it('o corretor recebe os numeros dele, e a tela sabe que sao dele', async () => {
    const resumo = await resumoDe(cenario.agenteA1.cookie);

    // O cenario base: um lead e um imovel em rascunho por corretor.
    expect(resumo.clientesNovos).toBe(1);
    expect(resumo.imoveisEmRascunho).toBe(1);

    // `escopos` e o que permite a tela escrever "seus clientes" em vez de
    // "clientes da equipe". Sem isso, metade dos papeis le um rotulo falso.
    expect(resumo.escopos).toEqual({
      clientes: 'OWN',
      imoveis: 'OWN',
      agenda: 'OWN',
    });
  });

  it('o gerente recebe os numeros da organizacao', async () => {
    const resumo = await resumoDe(cenario.managerA.cookie);

    // Os dois leads e os dois imoveis de A, dos dois corretores.
    expect(resumo.clientesNovos).toBe(2);
    expect(resumo.imoveisEmRascunho).toBe(2);

    expect(resumo.escopos).toEqual({
      clientes: 'ORG',
      imoveis: 'ORG',
      agenda: 'ORG',
    });
  });

  it('o rascunho do colega **nao** entra no numero do corretor', async () => {
    // Este e o teste que justifica o escopo sair de `imovel:editar` e nao de
    // `imovel:ver`. O corretor **ve** o imovel do colega — `imovel:ver` e
    // `ORG` para ele, por decisao de 19/10/2026 — mas nao pode terminar o
    // cadastro dele. Um contador que somasse os dois apontaria trabalho que
    // ele nao tem como fazer.
    const doA1 = await resumoDe(cenario.agenteA1.cookie);
    const doA2 = await resumoDe(cenario.agenteA2.cookie);
    const doGerente = await resumoDe(cenario.managerA.cookie);

    expect(doA1.imoveisEmRascunho).toBe(1);
    expect(doA2.imoveisEmRascunho).toBe(1);
    expect(doGerente.imoveisEmRascunho).toBe(2);
  });

  it('imovel publicado sai do numero de rascunhos', async () => {
    await prisma.property.update({
      where: { id: cenario.imovelDeA1 },
      data: { status: 'AVAILABLE', publishedAt: new Date() },
    });

    const resumo = await resumoDe(cenario.agenteA1.cookie);

    expect(resumo.imoveisEmRascunho).toBe(0);
  });
});

describe('GET /painel/resumo — a fila a distribuir', () => {
  it('e `null` para o corretor, e nao zero', async () => {
    await prisma.lead.create({
      data: {
        organizationId: cenario.organizacaoA,
        fullName: 'Cliente sem responsavel',
        source: 'PUBLIC_CATALOG',
        assignedMemberId: null,
      },
    });

    const resumo = await resumoDe(cenario.agenteA1.cookie);

    // `null` diz "esta pergunta nao e sua". `0` afirmaria que a fila esta
    // vazia — e havia um lead nela —, e a tela mostraria um numero
    // tranquilizador que ninguem mediu.
    expect(resumo.clientesNaFila).toBeNull();
  });

  it('conta para o gerente', async () => {
    await prisma.lead.create({
      data: {
        organizationId: cenario.organizacaoA,
        fullName: 'Cliente sem responsavel',
        source: 'PUBLIC_CATALOG',
        assignedMemberId: null,
      },
    });

    const resumo = await resumoDe(cenario.managerA.cookie);

    expect(resumo.clientesNaFila).toBe(1);
  });

  it('a fila de outra organizacao nao entra na conta', async () => {
    await prisma.lead.create({
      data: {
        organizationId: cenario.organizacaoB,
        fullName: 'Cliente da outra casa',
        source: 'PUBLIC_CATALOG',
        assignedMemberId: null,
      },
    });

    const resumo = await resumoDe(cenario.managerA.cookie);

    expect(resumo.clientesNaFila).toBe(0);
  });
});

describe('GET /painel/resumo — agenda e tarefas', () => {
  it('traz as visitas da janela, com a lista e o total', async () => {
    await criarVisita({
      organizationId: cenario.organizacaoA,
      propertyId: cenario.imovelDeA1,
      leadId: cenario.leadDeA1,
      assignedMemberId: cenario.agenteA1.membershipId,
      emHoras: 2,
    });

    const resumo = await resumoDe(cenario.agenteA1.cookie);

    expect(resumo.visitas.total).toBe(1);
    expect(resumo.visitas.proximas).toHaveLength(1);
    expect(resumo.visitas.proximas[0].cliente?.nomeCompleto).toBe(
      'Cliente do A1',
    );
  });

  it('a visita de depois de amanha fica fora da janela', async () => {
    await criarVisita({
      organizationId: cenario.organizacaoA,
      propertyId: cenario.imovelDeA1,
      leadId: cenario.leadDeA1,
      assignedMemberId: cenario.agenteA1.membershipId,
      emHoras: 24 * 5,
    });

    const resumo = await resumoDe(cenario.agenteA1.cookie);

    expect(resumo.visitas.total).toBe(0);
  });

  it('a visita do colega nao aparece para o corretor, e aparece para o gerente', async () => {
    await criarVisita({
      organizationId: cenario.organizacaoA,
      propertyId: cenario.imovelDeA2,
      leadId: cenario.leadDeA2,
      assignedMemberId: cenario.agenteA2.membershipId,
      emHoras: 3,
    });

    expect((await resumoDe(cenario.agenteA1.cookie)).visitas.total).toBe(0);

    const doGerente = await resumoDe(cenario.managerA.cookie);

    expect(doGerente.visitas.total).toBe(1);

    // Para o gerente o cliente **e** acessivel: `lead:ver` e `ORG` para ele, e
    // a ficha abre. Foi montando este painel que apareceu o defeito corrigido
    // em 22/10/2026 — o painel dele nao tinha um unico link para cliente.
    expect(doGerente.visitas.proximas[0].cliente?.acessivel).toBe(true);
  });

  it('a visita do cliente de um colega aparece para quem a conduz, com o cliente nao acessivel', async () => {
    // A segunda porta de visibilidade, decidida em 21/10/2026: o resumo tem de
    // herda-la, porque quem abre o painel de manha precisa ver a visita que
    // vai conduzir hoje — mesmo que o cliente nao seja dele.
    await criarVisita({
      organizationId: cenario.organizacaoA,
      propertyId: cenario.imovelDeA2,
      leadId: cenario.leadDeA2,
      assignedMemberId: cenario.agenteA1.membershipId,
      emHoras: 4,
    });

    const resumo = await resumoDe(cenario.agenteA1.cookie);

    expect(resumo.visitas.total).toBe(1);

    // Nome e telefone chegam — e o telefone **tem** de chegar: quem conduz a
    // visita precisa poder avisar que esta atrasado. O que nao chega e o
    // acesso ao cliente, e `acessivel: false` e a tela sabendo que nao deve
    // oferecer link para uma ficha que responde 404.
    expect(resumo.visitas.proximas[0].cliente?.nomeCompleto).toBe(
      'Cliente do A2',
    );
    expect(resumo.visitas.proximas[0].cliente?.telefone).toBe('11999990000');
    expect(resumo.visitas.proximas[0].cliente?.acessivel).toBe(false);
  });

  it('mostra no maximo cinco visitas, com o total inteiro', async () => {
    for (let i = 1; i <= 7; i += 1) {
      await criarVisita({
        organizationId: cenario.organizacaoA,
        propertyId: cenario.imovelDeA1,
        leadId: cenario.leadDeA1,
        assignedMemberId: cenario.agenteA1.membershipId,
        emHoras: i,
      });
    }

    const resumo = await resumoDe(cenario.agenteA1.cookie);

    // O total nao mente sobre o que foi cortado: numero que nao fecha com a
    // lista faz a pessoa desconfiar da tela inteira.
    expect(resumo.visitas.total).toBe(7);
    expect(resumo.visitas.proximas).toHaveLength(5);

    const horarios = resumo.visitas.proximas.map((v) => v.inicioEm);

    expect([...horarios].sort()).toEqual(horarios);
  });

  it('conta as tarefas vencidas de quem pergunta', async () => {
    await criarTarefaVencida({
      organizationId: cenario.organizacaoA,
      assignedMemberId: cenario.agenteA1.membershipId,
    });
    await criarTarefaVencida({
      organizationId: cenario.organizacaoA,
      assignedMemberId: cenario.agenteA2.membershipId,
    });

    expect((await resumoDe(cenario.agenteA1.cookie)).tarefasVencidas).toBe(1);
    expect((await resumoDe(cenario.managerA.cookie)).tarefasVencidas).toBe(2);
  });

  it('tarefa com prazo no futuro nao esta vencida', async () => {
    await prisma.task.create({
      data: {
        organizationId: cenario.organizacaoA,
        title: 'Tarefa em dia',
        assignedMemberId: cenario.agenteA1.membershipId,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'OPEN',
      },
    });

    expect((await resumoDe(cenario.agenteA1.cookie)).tarefasVencidas).toBe(0);
  });
});

describe('GET /painel/resumo — isolamento entre organizacoes', () => {
  it('nenhum numero atravessa a fronteira da organizacao', async () => {
    // A organizacao B ganha de tudo. Nada disso pode mexer nos numeros de A —
    // e os de B continuam sendo os de B.
    await prisma.lead.create({
      data: {
        organizationId: cenario.organizacaoB,
        fullName: 'Outro cliente de B',
        source: 'MANUAL',
        assignedMemberId: cenario.agenteB1.membershipId,
      },
    });
    await criarVisita({
      organizationId: cenario.organizacaoB,
      propertyId: cenario.imovelDeB,
      leadId: cenario.leadDeB,
      assignedMemberId: cenario.agenteB1.membershipId,
      emHoras: 2,
    });
    await criarTarefaVencida({
      organizationId: cenario.organizacaoB,
      assignedMemberId: cenario.agenteB1.membershipId,
    });

    const deA = await resumoDe(cenario.managerA.cookie);

    expect(deA.clientesNovos).toBe(2);
    expect(deA.imoveisEmRascunho).toBe(2);
    expect(deA.visitas.total).toBe(0);
    expect(deA.tarefasVencidas).toBe(0);

    const deB = await resumoDe(cenario.ownerB.cookie);

    expect(deB.clientesNovos).toBe(2);
    expect(deB.imoveisEmRascunho).toBe(1);
    expect(deB.visitas.total).toBe(1);
    expect(deB.tarefasVencidas).toBe(1);
  });

  it('a organizacao ativa vem da sessao, e o resumo a segue', async () => {
    // A pessoa com dois vinculos, com sessao ativa em A. O resumo dela tem de
    // ser o de A, e nao a soma das duas casas.
    await prisma.lead.create({
      data: {
        organizationId: cenario.organizacaoB,
        fullName: 'Cliente da dupla em B',
        source: 'MANUAL',
        assignedMemberId: cenario.dual.membershipEmB,
      },
    });

    const resumo = await resumoDe(cenario.dual.cookie);

    // Em A ela nao tem lead nenhum atribuido, e e `AGENT`: escopo `OWN`.
    expect(resumo.clientesNovos).toBe(0);
  });
});

describe('GET /painel/resumo — primeiros passos', () => {
  it('diz o que a organizacao ja tem, para a tela nao mostrar zeros', async () => {
    const resumo = await resumoDe(cenario.agenteA1.cookie);

    expect(resumo.primeirosPassos).toEqual({
      temImovel: true,
      temImovelPublicado: false,
      temCliente: true,
    });
  });

  it('publicar um imovel muda o passo correspondente', async () => {
    await prisma.property.update({
      where: { id: cenario.imovelDeA1 },
      data: { status: 'AVAILABLE', publishedAt: new Date() },
    });

    const resumo = await resumoDe(cenario.agenteA1.cookie);

    expect(resumo.primeirosPassos.temImovelPublicado).toBe(true);
  });

  it('organizacao vazia tem os tres passos pendentes', async () => {
    const vazia = await prisma.organization.create({
      data: { name: 'Casa Nova', slug: 'casa-nova', kind: 'SOLO' },
      select: { id: true },
    });

    // A mesma pessoa de A, agora dona de uma organizacao recem-criada. E o
    // caso do cadastro novo: a sessao precisa apontar para la.
    await prisma.membership.create({
      data: {
        userId: cenario.ownerA.userId,
        organizationId: vazia.id,
        role: 'OWNER',
      },
    });
    await prisma.session.update({
      where: { id: cenario.ownerA.sessaoId },
      data: { activeOrganizationId: vazia.id },
    });

    const resumo = await resumoDe(cenario.ownerA.cookie);

    expect(resumo.primeirosPassos).toEqual({
      temImovel: false,
      temImovelPublicado: false,
      temCliente: false,
    });

    // E os contadores, coerentes com isso: zero em tudo, sem erro nenhum.
    expect(resumo.clientesNovos).toBe(0);
    expect(resumo.clientesNaFila).toBe(0);
    expect(resumo.imoveisEmRascunho).toBe(0);
    expect(resumo.visitas.total).toBe(0);
    expect(resumo.tarefasVencidas).toBe(0);
  });

  it('o que existe em outra organizacao nao conta como primeiro passo dado', async () => {
    // A organizacao vazia nao "herda" os imoveis de A por a pessoa ser membro
    // das duas. Sem este corte, quem abre a segunda organizacao receberia o
    // painel de operacao de uma casa que ainda nao tem nada.
    const vazia = await prisma.organization.create({
      data: { name: 'Casa Nova', slug: 'casa-nova-2', kind: 'SOLO' },
      select: { id: true },
    });

    await prisma.membership.create({
      data: {
        userId: cenario.agenteA1.userId,
        organizationId: vazia.id,
        role: 'OWNER',
      },
    });
    await prisma.session.update({
      where: { id: cenario.agenteA1.sessaoId },
      data: { activeOrganizationId: vazia.id },
    });

    const resumo = await resumoDe(cenario.agenteA1.cookie);

    expect(resumo.primeirosPassos.temImovel).toBe(false);
    expect(resumo.primeirosPassos.temCliente).toBe(false);
  });
});
