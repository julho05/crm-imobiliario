/**
 * Item **B8**: tarefas.
 *
 * Mesma visibilidade de duas portas das visitas, e pelo mesmo motivo: em `Task`
 * o responsável é obrigatório e os vínculos são todos opcionais.
 *
 * A **tarefa solta** — sem cliente, sem negociação, sem imóvel — é o caso que
 * torna a segunda porta necessária em vez de opcional: "preparar material da
 * feira" não pertence a cliente nenhum, e só quem responde por ela a enxerga.
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

type Tarefa = {
  id: string;
  titulo: string;
  situacao: string;
  venceEm: string | null;
  concluidaEm: string | null;
  cliente: { id: string; nomeCompleto: string; acessivel: boolean } | null;
  negociacao: { id: string; etapa: string } | null;
  imovel: { id: string; codigo: string } | null;
  responsavel: { membershipId: string; nome: string };
  minha: boolean;
  vencida: boolean;
};

const ONTEM = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const AMANHA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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

function criar(cookie: string, corpo: Record<string, unknown> = {}) {
  return enviar('POST', '/tarefas', cookie, {
    titulo: 'Ligar para confirmar a visita',
    ...corpo,
  });
}

async function criarEObter(
  cookie: string,
  corpo: Record<string, unknown> = {},
): Promise<Tarefa> {
  const resposta = await criar(cookie, corpo);

  expect(resposta.status).toBe(201);

  return (await resposta.json()) as Tarefa;
}

async function listar(cookie: string, consulta = ''): Promise<Tarefa[]> {
  const resposta = await obter(`/tarefas?${consulta}`, cookie);

  expect(resposta.status).toBe(200);

  return ((await resposta.json()) as { tarefas: Tarefa[] }).tarefas;
}

function auditoriaDe(entityId: string) {
  return prisma.activity.findMany({
    where: { entityId },
    select: { action: true, metadata: true },
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

describe('criação', () => {
  it('cria tarefa solta, sem vínculo nenhum', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie, {
      titulo: 'Preparar material da feira',
    });

    expect(tarefa.cliente).toBeNull();
    expect(tarefa.negociacao).toBeNull();
    expect(tarefa.imovel).toBeNull();
    expect(tarefa.situacao).toBe('OPEN');
    expect(tarefa.minha).toBe(true);
  });

  it('aceita os três vínculos de uma vez', async () => {
    const negociacao = await enviar(
      'POST',
      '/negociacoes',
      cenario.agenteA1.cookie,
      { leadId: cenario.leadDeA1 },
    );

    const { id: negociacaoId } = (await negociacao.json()) as { id: string };

    const tarefa = await criarEObter(cenario.agenteA1.cookie, {
      clienteId: cenario.leadDeA1,
      negociacaoId,
      imovelId: cenario.imovelDeA1,
    });

    expect(tarefa.cliente?.nomeCompleto).toBe('Cliente do A1');
    expect(tarefa.negociacao?.etapa).toBe('Novo');
    expect(tarefa.imovel?.codigo).toBe('A-001');
  });

  it('sem prazo é válido', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie);

    expect(tarefa.venceEm).toBeNull();
    expect(tarefa.vencida).toBe(false);
  });

  it('o corretor não amarra tarefa ao cliente do colega', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, {
      clienteId: cenario.leadDeA2,
    });

    // A resposta devolveria o nome daquela pessoa.
    expect(resposta.status).toBe(404);
    expect(await prisma.task.count()).toBe(0);
  });

  it('o corretor não amarra tarefa à negociação do colega', async () => {
    const negociacao = await enviar(
      'POST',
      '/negociacoes',
      cenario.managerA.cookie,
      { leadId: cenario.leadDeA2 },
    );

    const { id } = (await negociacao.json()) as { id: string };

    const resposta = await criar(cenario.agenteA1.cookie, {
      negociacaoId: id,
    });

    expect(resposta.status).toBe(404);
  });

  it('recusa imóvel de outra organização', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, {
      imovelId: cenario.imovelDeB,
    });

    expect(resposta.status).toBe(404);
  });

  it('o corretor não cria tarefa para outra pessoa', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, {
      responsavelId: cenario.agenteA2.membershipId,
    });

    expect(resposta.status).toBe(400);
  });

  it('o gerente cria tarefa para um corretor', async () => {
    const tarefa = await criarEObter(cenario.managerA.cookie, {
      responsavelId: cenario.agenteA1.membershipId,
    });

    expect(tarefa.responsavel.nome).toBe('Agente A1');
  });

  it('recusa título curto demais', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, { titulo: 'ab' });

    expect(resposta.status).toBe(400);
  });
});

describe('as duas portas', () => {
  it('a tarefa solta é vista só por quem responde por ela', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie, {
      titulo: 'Preparar material da feira',
    });

    expect(
      (await obter(`/tarefas/${tarefa.id}`, cenario.agenteA1.cookie)).status,
    ).toBe(200);
    expect(
      (await obter(`/tarefas/${tarefa.id}`, cenario.agenteA2.cookie)).status,
    ).toBe(404);
  });

  it('quem responde pelo cliente vê a tarefa dele, mesmo sem ser o responsável', async () => {
    const tarefa = await criarEObter(cenario.managerA.cookie, {
      clienteId: cenario.leadDeA1,
      responsavelId: cenario.agenteA2.membershipId,
    });

    // O cliente é do agenteA1.
    expect(
      (await obter(`/tarefas/${tarefa.id}`, cenario.agenteA1.cookie)).status,
    ).toBe(200);
    expect(
      (await obter(`/tarefas/${tarefa.id}`, cenario.agenteA2.cookie)).status,
    ).toBe(200);
  });

  it('marca o cliente como inacessível para quem só executa', async () => {
    const tarefa = await criarEObter(cenario.managerA.cookie, {
      clienteId: cenario.leadDeA1,
      responsavelId: cenario.agenteA2.membershipId,
    });

    const resposta = await obter(
      `/tarefas/${tarefa.id}`,
      cenario.agenteA2.cookie,
    );

    expect(((await resposta.json()) as Tarefa).cliente?.acessivel).toBe(false);
  });

  it('marca o cliente como acessivel para quem tem escopo ORG', async () => {
    // O outro lado do teste acima, e o defeito corrigido em 22/10/2026: para o
    // gerente, `lead:ver` e `ORG` e a ficha do cliente abre — entao a resposta
    // precisa dizer `true`, ou a tela esconde um link que funcionaria.
    const tarefa = await criarEObter(cenario.managerA.cookie, {
      clienteId: cenario.leadDeA1,
      responsavelId: cenario.agenteA2.membershipId,
    });

    const resposta = await obter(
      `/tarefas/${tarefa.id}`,
      cenario.managerA.cookie,
    );

    expect(((await resposta.json()) as Tarefa).cliente?.acessivel).toBe(true);
  });

  it('a tarefa solta aparece na lista de quem responde por ela', async () => {
    await criarEObter(cenario.agenteA1.cookie, {
      titulo: 'Preparar material da feira',
    });

    // A armadilha da relação opcional: um filtro por `lead` sumiria com ela.
    expect(await listar(cenario.agenteA1.cookie)).toHaveLength(1);
  });

  it('o gerente vê as tarefas de todos', async () => {
    await criarEObter(cenario.agenteA1.cookie);
    await criarEObter(cenario.agenteA2.cookie);

    expect(await listar(cenario.managerA.cookie)).toHaveLength(2);
  });
});

describe('prazo e vencimento', () => {
  it('marca como vencida a aberta com prazo no passado', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie, {
      venceEm: ONTEM,
    });

    expect(tarefa.vencida).toBe(true);
  });

  it('não marca como vencida a que ainda tem prazo', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie, {
      venceEm: AMANHA,
    });

    expect(tarefa.vencida).toBe(false);
  });

  it('a concluída depois do prazo não está vencida', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie, {
      venceEm: ONTEM,
    });

    const resposta = await enviar(
      'POST',
      `/tarefas/${tarefa.id}/situacao`,
      cenario.agenteA1.cookie,
      { situacao: 'DONE' },
    );

    // Está concluída, não vencida.
    expect(((await resposta.json()) as Tarefa).vencida).toBe(false);
  });

  it('apenasVencidas traz só as abertas com prazo passado', async () => {
    await criarEObter(cenario.agenteA1.cookie, { venceEm: ONTEM });
    await criarEObter(cenario.agenteA1.cookie, { venceEm: AMANHA });
    await criarEObter(cenario.agenteA1.cookie);

    const vencidas = await listar(
      cenario.agenteA1.cookie,
      'apenasVencidas=true',
    );

    expect(vencidas).toHaveLength(1);
  });

  it('o contador de vencidas respeita o recorte de visibilidade', async () => {
    await criarEObter(cenario.agenteA1.cookie, { venceEm: ONTEM });
    await criarEObter(cenario.agenteA2.cookie, { venceEm: ONTEM });

    const doCorretor = await obter(
      '/tarefas/vencidas/contagem',
      cenario.agenteA1.cookie,
    );
    expect(((await doCorretor.json()) as { total: number }).total).toBe(1);

    const doGerente = await obter(
      '/tarefas/vencidas/contagem',
      cenario.managerA.cookie,
    );
    expect(((await doGerente.json()) as { total: number }).total).toBe(2);
  });

  it('a rota do contador não é confundida com um identificador', async () => {
    const resposta = await obter(
      '/tarefas/vencidas/contagem',
      cenario.ownerA.cookie,
    );

    expect(resposta.status).toBe(200);
  });

  it('as com prazo vêm antes das sem prazo', async () => {
    await criarEObter(cenario.agenteA1.cookie, { titulo: 'Sem prazo nenhum' });
    await criarEObter(cenario.agenteA1.cookie, {
      titulo: 'Com prazo amanha',
      venceEm: AMANHA,
    });

    const tarefas = await listar(cenario.agenteA1.cookie);

    expect(tarefas[0].titulo).toBe('Com prazo amanha');
  });
});

describe('situação', () => {
  it('concluir grava a data; reabrir a limpa', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie);

    const concluida = await enviar(
      'POST',
      `/tarefas/${tarefa.id}/situacao`,
      cenario.agenteA1.cookie,
      { situacao: 'DONE' },
    );

    expect(((await concluida.json()) as Tarefa).concluidaEm).not.toBeNull();

    const reaberta = await enviar(
      'POST',
      `/tarefas/${tarefa.id}/situacao`,
      cenario.agenteA1.cookie,
      { situacao: 'OPEN' },
    );

    // Campo editável permitiria "aberta e concluída em março".
    expect(((await reaberta.json()) as Tarefa).concluidaEm).toBeNull();
  });

  it('aceita reabrir, ao contrário das visitas', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie);

    await enviar(
      'POST',
      `/tarefas/${tarefa.id}/situacao`,
      cenario.agenteA1.cookie,
      { situacao: 'DONE' },
    );

    const resposta = await enviar(
      'POST',
      `/tarefas/${tarefa.id}/situacao`,
      cenario.agenteA1.cookie,
      { situacao: 'OPEN' },
    );

    // Reabrir tarefa concluída por engano é corriqueiro e não confunde
    // histórico nenhum.
    expect(resposta.status).toBe(200);
  });

  it('cada situação gera evento próprio', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie);

    await enviar(
      'POST',
      `/tarefas/${tarefa.id}/situacao`,
      cenario.agenteA1.cookie,
      { situacao: 'DONE' },
    );
    await enviar(
      'POST',
      `/tarefas/${tarefa.id}/situacao`,
      cenario.agenteA1.cookie,
      { situacao: 'CANCELED' },
    );

    const linhas = await auditoriaDe(tarefa.id);

    expect(linhas.map((l) => l.action)).toEqual([
      'tarefa.criada',
      'tarefa.concluida',
      'tarefa.cancelada',
    ]);
  });
});

describe('edição e atribuição', () => {
  it('edita título e prazo', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie);

    const resposta = await enviar(
      'PATCH',
      `/tarefas/${tarefa.id}`,
      cenario.agenteA1.cookie,
      { titulo: 'Titulo corrigido', venceEm: AMANHA },
    );

    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as Tarefa;
    expect(corpo.titulo).toBe('Titulo corrigido');
    expect(corpo.venceEm).toBe(AMANHA);
  });

  it('null apaga o prazo', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie, {
      venceEm: AMANHA,
    });

    const resposta = await enviar(
      'PATCH',
      `/tarefas/${tarefa.id}`,
      cenario.agenteA1.cookie,
      { venceEm: null },
    );

    expect(((await resposta.json()) as Tarefa).venceEm).toBeNull();
  });

  it('o corretor não atribui', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie);

    const resposta = await enviar(
      'POST',
      `/tarefas/${tarefa.id}/responsavel`,
      cenario.agenteA1.cookie,
      { membershipId: cenario.agenteA2.membershipId },
    );

    expect(resposta.status).toBe(403);
  });

  it('o gerente atribui, e a auditoria registra se revelou cliente', async () => {
    const tarefa = await criarEObter(cenario.managerA.cookie, {
      clienteId: cenario.leadDeA1,
    });

    await enviar(
      'POST',
      `/tarefas/${tarefa.id}/responsavel`,
      cenario.managerA.cookie,
      { membershipId: cenario.agenteA2.membershipId },
    );

    const linhas = await auditoriaDe(tarefa.id);
    const atribuicao = linhas.find((l) => l.action === 'tarefa.atribuida');

    expect(atribuicao?.metadata).toMatchObject({ revelouCliente: true });
  });
});

describe('o cliente excluído some pelos dois caminhos', () => {
  it('some da listagem e da consulta por id', async () => {
    const tarefa = await criarEObter(cenario.agenteA1.cookie, {
      clienteId: cenario.leadDeA1,
    });

    await enviar('DELETE', `/leads/${cenario.leadDeA1}`, cenario.ownerA.cookie);

    expect(await listar(cenario.ownerA.cookie)).toHaveLength(0);

    const porId = await obter(`/tarefas/${tarefa.id}`, cenario.ownerA.cookie);
    expect(porId.status).toBe(404);
  });

  it('a tarefa solta continua na lista', async () => {
    await criarEObter(cenario.agenteA1.cookie, { titulo: 'Tarefa solta' });
    await criarEObter(cenario.agenteA1.cookie, {
      clienteId: cenario.leadDeA1,
    });

    await enviar('DELETE', `/leads/${cenario.leadDeA1}`, cenario.ownerA.cookie);

    const tarefas = await listar(cenario.ownerA.cookie);

    expect(tarefas).toHaveLength(1);
    expect(tarefas[0].titulo).toBe('Tarefa solta');
  });
});
