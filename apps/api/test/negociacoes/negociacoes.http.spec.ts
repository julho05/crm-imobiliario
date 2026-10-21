/**
 * Item **B7**: funil de negociações.
 *
 * Os três critérios do roadmap: a negociação **herda a visibilidade do lead**,
 * mover etapa é registrado em auditoria, e o funil não mostra lead de colega ao
 * `AGENT`.
 *
 * ## A herança é o que este arquivo existe para provar
 *
 * `docs/permissions.md` §4.3 e o `schema.prisma` dizem a mesma coisa, com o
 * motivo: "senão o funil vaza nome de cliente de colega". A negociação carrega
 * o nome do cliente, então quem não alcança o lead não pode alcançar a
 * negociação — nem lendo, nem criando, nem pelo resumo das colunas.
 *
 * O caso mais sutil está em `atribuição`: a negociação tem responsável próprio
 * (`Deal.assignedMemberId`), e ele **não** decide quem vê. Atribuí-la a quem
 * não é dono do lead criaria um responsável que recebe 404 ao abrir o próprio
 * registro, e é por isso que a API recusa.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { criarClienteDeTeste, limparBanco } from '../apoio/banco-de-teste';
import { subirAppDeTeste, type AppDeTeste } from '../apoio/app-de-teste';
import {
  montarCenario,
  type Cenario,
  type EtapaDeTeste,
} from '../apoio/cenario-de-duas-organizacoes';

let app: AppDeTeste;
let prisma: PrismaClient;
let cenario: Cenario;

type RespostaDeNegociacao = {
  id: string;
  etapa: { id: string; nome: string; ganho: boolean; perdido: boolean };
  cliente: {
    id: string;
    nomeCompleto: string;
    responsavel: { membershipId: string; nome: string } | null;
  };
  imovel: { id: string; codigo: string; titulo: string } | null;
  responsavel: { membershipId: string; nome: string } | null;
  valorEsperado: number | null;
  fechadaEm: string | null;
  motivoDaPerda: string | null;
};

type ResumoDaEtapa = {
  id: string;
  nome: string;
  quantidade: number;
  valorTotal: number;
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

function etapa(nome: string, etapas: EtapaDeTeste[] = cenario.etapasDeA) {
  const encontrada = etapas.find((e) => e.nome === nome);

  if (!encontrada) {
    throw new Error(`Etapa "${nome}" nao existe no cenario.`);
  }

  return encontrada;
}

function criar(cookie: string, corpo: Record<string, unknown>) {
  return enviar('POST', '/negociacoes', cookie, corpo);
}

async function criarEObter(
  cookie: string,
  corpo: Record<string, unknown>,
): Promise<RespostaDeNegociacao> {
  const resposta = await criar(cookie, corpo);

  expect(resposta.status).toBe(201);

  return (await resposta.json()) as RespostaDeNegociacao;
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

describe('etapas do funil', () => {
  it('devolve as seis etapas da organização, em ordem', async () => {
    const resposta = await obter(
      '/negociacoes/etapas',
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as { etapas: EtapaDeTeste[] };

    expect(corpo.etapas.map((e) => e.nome)).toEqual([
      'Novo',
      'Contato feito',
      'Visita agendada',
      'Proposta',
      'Fechado',
      'Perdido',
    ]);
  });

  it('marca ganho e perda nas duas últimas', async () => {
    const resposta = await obter('/negociacoes/etapas', cenario.ownerA.cookie);
    const { etapas } = (await resposta.json()) as {
      etapas: { nome: string; ganho: boolean; perdido: boolean }[];
    };

    expect(etapas.find((e) => e.nome === 'Fechado')?.ganho).toBe(true);
    expect(etapas.find((e) => e.nome === 'Perdido')?.perdido).toBe(true);
  });

  it('a rota de etapas não é confundida com um identificador', async () => {
    // `@Get(':id')` casaria com este caminho se viesse antes na declaração.
    expect(
      (await obter('/negociacoes/etapas', cenario.ownerA.cookie)).status,
    ).toBe(200);
    expect(
      (await obter('/negociacoes/resumo', cenario.ownerA.cookie)).status,
    ).toBe(200);
  });
});

describe('abertura', () => {
  it('abre a negociação na primeira etapa quando nenhuma é informada', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    expect(negociacao.etapa.nome).toBe('Novo');
    expect(negociacao.cliente.nomeCompleto).toBe('Cliente do A1');
    expect(negociacao.fechadaEm).toBeNull();
  });

  it('nasce com o responsável do cliente, não com quem abriu', async () => {
    const negociacao = await criarEObter(cenario.managerA.cookie, {
      leadId: cenario.leadDeA1,
    });

    // É o único valor que mantém "quem conduz" e "quem enxerga" coerentes.
    expect(negociacao.responsavel?.membershipId).toBe(
      cenario.agenteA1.membershipId,
    );
  });

  it('aceita etapa, imóvel e valor esperado', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
      etapaId: etapa('Proposta').id,
      imovelId: cenario.imovelDeA1,
      valorEsperado: 480_000,
    });

    expect(negociacao.etapa.nome).toBe('Proposta');
    expect(negociacao.imovel?.codigo).toBe('A-001');
    expect(negociacao.valorEsperado).toBe(480_000);
  });

  it('abre sem imóvel: existe negociação sem imóvel definido', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    expect(negociacao.imovel).toBeNull();
  });

  it('o corretor não abre negociação sobre o cliente do colega', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA2,
    });

    // Seria ler a carteira do colega **escrevendo**: a resposta traria o nome
    // daquele cliente.
    expect(resposta.status).toBe(404);
    expect(await prisma.deal.count()).toBe(0);
  });

  it('o gerente abre negociação sobre o cliente de qualquer corretor', async () => {
    const resposta = await criar(cenario.managerA.cookie, {
      leadId: cenario.leadDeA2,
    });

    expect(resposta.status).toBe(201);
  });

  it('recusa cliente de outra organização, com 404', async () => {
    const resposta = await criar(cenario.ownerA.cookie, {
      leadId: cenario.leadDeB,
    });

    expect(resposta.status).toBe(404);
  });

  it('recusa imóvel de outra organização, com 404', async () => {
    const resposta = await criar(cenario.ownerA.cookie, {
      leadId: cenario.leadDeA1,
      imovelId: cenario.imovelDeB,
    });

    expect(resposta.status).toBe(404);
    expect(await prisma.deal.count()).toBe(0);
  });

  it('recusa etapa de outra organização, com 404', async () => {
    const resposta = await criar(cenario.ownerA.cookie, {
      leadId: cenario.leadDeA1,
      etapaId: etapa('Novo', cenario.etapasDeB).id,
    });

    expect(resposta.status).toBe(404);
  });

  it('aceita imóvel que não é do corretor: imovel:ver é ORG', async () => {
    // Vincular um imóvel da casa a uma negociação é justamente o trabalho dele.
    const resposta = await criar(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
      imovelId: cenario.imovelDeA2,
    });

    expect(resposta.status).toBe(201);
  });

  it('registra a abertura em auditoria', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    const [linha] = await auditoriaDe(negociacao.id);

    expect(linha.action).toBe('negociacao.aberta');
    expect(linha.actorMembershipId).toBe(cenario.agenteA1.membershipId);
    expect(linha.metadata).toMatchObject({
      etapa: 'Novo',
      imovelVinculado: false,
    });
  });
});

describe('herança de visibilidade — o critério do item', () => {
  async function abrirAsDuas() {
    const doA1 = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
      valorEsperado: 100_000,
    });

    const doA2 = await criarEObter(cenario.managerA.cookie, {
      leadId: cenario.leadDeA2,
      valorEsperado: 200_000,
    });

    return { doA1, doA2 };
  }

  it('o funil do corretor não mostra negociação de cliente do colega', async () => {
    await abrirAsDuas();

    const resposta = await obter('/negociacoes', cenario.agenteA1.cookie);
    const corpo = (await resposta.json()) as {
      negociacoes: RespostaDeNegociacao[];
      total: number;
    };

    // É o critério do roadmap, literal: o funil não mostra lead de colega.
    expect(corpo.total).toBe(1);
    expect(corpo.negociacoes[0].cliente.nomeCompleto).toBe('Cliente do A1');
  });

  it('o gerente vê as duas', async () => {
    await abrirAsDuas();

    const resposta = await obter('/negociacoes', cenario.managerA.cookie);

    expect(((await resposta.json()) as { total: number }).total).toBe(2);
  });

  it('a negociação do colega responde 404 por ID direto', async () => {
    const { doA2 } = await abrirAsDuas();

    const resposta = await obter(
      `/negociacoes/${doA2.id}`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('o resumo por etapa respeita o mesmo recorte', async () => {
    await abrirAsDuas();

    const doCorretor = await obter(
      '/negociacoes/resumo',
      cenario.agenteA1.cookie,
    );
    const { etapas: doCorretorEtapas } = (await doCorretor.json()) as {
      etapas: ResumoDaEtapa[];
    };

    const novoDoCorretor = doCorretorEtapas.find((e) => e.nome === 'Novo');

    // Um resumo que somasse a organização contaria quantas negociações os
    // colegas têm — informação da carteira deles.
    expect(novoDoCorretor?.quantidade).toBe(1);
    expect(novoDoCorretor?.valorTotal).toBe(100_000);

    const doGerente = await obter(
      '/negociacoes/resumo',
      cenario.managerA.cookie,
    );
    const { etapas: doGerenteEtapas } = (await doGerente.json()) as {
      etapas: ResumoDaEtapa[];
    };

    const novoDoGerente = doGerenteEtapas.find((e) => e.nome === 'Novo');
    expect(novoDoGerente?.quantidade).toBe(2);
    expect(novoDoGerente?.valorTotal).toBe(300_000);
  });

  it('o resumo devolve todas as etapas, inclusive as vazias', async () => {
    const resposta = await obter('/negociacoes/resumo', cenario.ownerA.cookie);
    const { etapas } = (await resposta.json()) as { etapas: ResumoDaEtapa[] };

    // O quadro precisa da coluna existindo para que se possa mover algo para
    // ela.
    expect(etapas).toHaveLength(6);
    expect(etapas.every((e) => e.quantidade === 0)).toBe(true);
  });

  it('passar o cliente passa a negociação com ele', async () => {
    const { doA1 } = await abrirAsDuas();

    // O agenteA1 enxerga hoje.
    expect(
      (await obter(`/negociacoes/${doA1.id}`, cenario.agenteA1.cookie)).status,
    ).toBe(200);

    await enviar(
      'POST',
      `/leads/${cenario.leadDeA1}/responsavel`,
      cenario.managerA.cookie,
      { membershipId: cenario.agenteA2.membershipId },
    );

    // Deixou de enxergar, sem ninguém tocar na negociação. É o que "herda a
    // visibilidade do lead" significa na prática.
    expect(
      (await obter(`/negociacoes/${doA1.id}`, cenario.agenteA1.cookie)).status,
    ).toBe(404);

    expect(
      (await obter(`/negociacoes/${doA1.id}`, cenario.agenteA2.cookie)).status,
    ).toBe(200);
  });

  it('o cliente excluído tira a negociação do funil', async () => {
    const { doA1 } = await abrirAsDuas();

    await enviar('DELETE', `/leads/${cenario.leadDeA1}`, cenario.ownerA.cookie);

    const resposta = await obter('/negociacoes', cenario.ownerA.cookie);
    const corpo = (await resposta.json()) as { total: number };

    // Manter o cartão exibiria o nome de alguém que pediu exclusão.
    expect(corpo.total).toBe(1);
    expect(
      (await obter(`/negociacoes/${doA1.id}`, cenario.ownerA.cookie)).status,
    ).toBe(404);
  });
});

describe('mover de etapa', () => {
  let negociacao: RespostaDeNegociacao;

  beforeEach(async () => {
    negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });
  });

  function mover(
    etapaId: string,
    cookie: string,
    corpo: Record<string, unknown> = {},
  ) {
    return enviar('POST', `/negociacoes/${negociacao.id}/etapa`, cookie, {
      etapaId,
      ...corpo,
    });
  }

  it('move para uma etapa aberta sem fechar', async () => {
    const resposta = await mover(etapa('Proposta').id, cenario.agenteA1.cookie);

    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as RespostaDeNegociacao;
    expect(corpo.etapa.nome).toBe('Proposta');
    expect(corpo.fechadaEm).toBeNull();
  });

  it('a etapa de ganho fecha a negociação', async () => {
    const resposta = await mover(etapa('Fechado').id, cenario.agenteA1.cookie);
    const corpo = (await resposta.json()) as RespostaDeNegociacao;

    expect(corpo.etapa.ganho).toBe(true);
    expect(corpo.fechadaEm).not.toBeNull();
  });

  it('a etapa de perda exige motivo', async () => {
    const semMotivo = await mover(etapa('Perdido').id, cenario.agenteA1.cookie);

    expect(semMotivo.status).toBe(400);

    const corpo = (await semMotivo.json()) as {
      erros: { campo: string }[];
    };

    // É o único campo do funil que responde "por que não fechamos?".
    expect(corpo.erros[0].campo).toBe('motivoDaPerda');
  });

  it('a etapa de perda com motivo fecha e guarda o motivo', async () => {
    const resposta = await mover(etapa('Perdido').id, cenario.agenteA1.cookie, {
      motivoDaPerda: 'Comprou com a concorrencia.',
    });

    const corpo = (await resposta.json()) as RespostaDeNegociacao;

    expect(corpo.etapa.perdido).toBe(true);
    expect(corpo.fechadaEm).not.toBeNull();
    expect(corpo.motivoDaPerda).toBe('Comprou com a concorrencia.');
  });

  it('voltar a uma etapa aberta reabre e limpa o motivo', async () => {
    await mover(etapa('Perdido').id, cenario.agenteA1.cookie, {
      motivoDaPerda: 'Comprou com a concorrencia.',
    });

    const resposta = await mover(
      etapa('Contato feito').id,
      cenario.agenteA1.cookie,
    );

    const corpo = (await resposta.json()) as RespostaDeNegociacao;

    // Motivo preservado numa negociação reaberta seria explicação sem fato.
    expect(corpo.fechadaEm).toBeNull();
    expect(corpo.motivoDaPerda).toBeNull();
  });

  it('recusa mover para a etapa em que já está', async () => {
    const resposta = await mover(etapa('Novo').id, cenario.agenteA1.cookie);

    expect(resposta.status).toBe(400);
  });

  it('recusa etapa de outra organização, com 404', async () => {
    const resposta = await mover(
      etapa('Proposta', cenario.etapasDeB).id,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('o corretor não move a negociação de cliente do colega', async () => {
    const doColega = await criarEObter(cenario.managerA.cookie, {
      leadId: cenario.leadDeA2,
    });

    const resposta = await enviar(
      'POST',
      `/negociacoes/${doColega.id}/etapa`,
      cenario.agenteA1.cookie,
      { etapaId: etapa('Proposta').id },
    );

    expect(resposta.status).toBe(404);
  });

  it('cada desfecho gera um evento de auditoria com nome próprio', async () => {
    await mover(etapa('Proposta').id, cenario.agenteA1.cookie);
    await mover(etapa('Fechado').id, cenario.agenteA1.cookie);

    const linhas = await auditoriaDe(negociacao.id);

    // "Quando ganhamos?" tem resposta; "quando o campo stageId mudou?" não é a
    // pergunta que se faz ao histórico.
    expect(linhas.map((l) => l.action)).toEqual([
      'negociacao.aberta',
      'negociacao.movida',
      'negociacao.ganha',
    ]);
    expect(linhas[2].metadata).toMatchObject({
      etapaAnterior: 'Proposta',
      etapa: 'Fechado',
      fechada: true,
    });
  });

  it('a perda gera evento próprio', async () => {
    await mover(etapa('Perdido').id, cenario.agenteA1.cookie, {
      motivoDaPerda: 'Sem credito aprovado.',
    });

    const linhas = await auditoriaDe(negociacao.id);

    expect(linhas.map((l) => l.action)).toContain('negociacao.perdida');
  });

  it('a tentativa recusada não gera Activity nova', async () => {
    const antes = (await auditoriaDe(negociacao.id)).length;

    await mover(etapa('Perdido').id, cenario.agenteA1.cookie);

    expect(await auditoriaDe(negociacao.id)).toHaveLength(antes);
  });
});

describe('fechadas ficam fora do funil', () => {
  it('a negociação fechada sai da listagem por padrão', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    await enviar(
      'POST',
      `/negociacoes/${negociacao.id}/etapa`,
      cenario.agenteA1.cookie,
      { etapaId: etapa('Fechado').id },
    );

    const padrao = await obter('/negociacoes', cenario.agenteA1.cookie);
    expect(((await padrao.json()) as { total: number }).total).toBe(0);

    // O funil é ferramenta do presente: a coluna de ganhos de dois anos
    // cresceria para sempre.
    const incluindo = await obter(
      '/negociacoes?incluirFechadas=true',
      cenario.agenteA1.cookie,
    );
    expect(((await incluindo.json()) as { total: number }).total).toBe(1);
  });

  it('continua acessível por ID direto', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    await enviar(
      'POST',
      `/negociacoes/${negociacao.id}/etapa`,
      cenario.agenteA1.cookie,
      { etapaId: etapa('Fechado').id },
    );

    const resposta = await obter(
      `/negociacoes/${negociacao.id}`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);
  });
});

describe('edição', () => {
  it('edita valor esperado e imóvel', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    const resposta = await enviar(
      'PATCH',
      `/negociacoes/${negociacao.id}`,
      cenario.agenteA1.cookie,
      { valorEsperado: 520_000, imovelId: cenario.imovelDeA1 },
    );

    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as RespostaDeNegociacao;
    expect(corpo.valorEsperado).toBe(520_000);
    expect(corpo.imovel?.codigo).toBe('A-001');
  });

  it('null desfaz o vínculo com o imóvel', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
      imovelId: cenario.imovelDeA1,
    });

    const resposta = await enviar(
      'PATCH',
      `/negociacoes/${negociacao.id}`,
      cenario.agenteA1.cookie,
      { imovelId: null },
    );

    // Volta a ser "procura algo", que é um estado legítimo.
    expect(((await resposta.json()) as RespostaDeNegociacao).imovel).toBeNull();
  });

  it('não aceita trocar o cliente', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    const resposta = await enviar(
      'PATCH',
      `/negociacoes/${negociacao.id}`,
      cenario.agenteA1.cookie,
      { leadId: cenario.leadDeA2, valorEsperado: 1 },
    );

    expect(resposta.status).toBe(200);

    const noBanco = await prisma.deal.findUniqueOrThrow({
      where: { id: negociacao.id },
      select: { leadId: true },
    });

    // Trocar o cliente moveria a negociação para dentro da carteira de outra
    // pessoa sem passar pela atribuição do lead.
    expect(noBanco.leadId).toBe(cenario.leadDeA1);
  });

  it('recusa corpo vazio', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    const resposta = await enviar(
      'PATCH',
      `/negociacoes/${negociacao.id}`,
      cenario.agenteA1.cookie,
      {},
    );

    expect(resposta.status).toBe(400);
  });
});

describe('atribuição', () => {
  it('o corretor recebe 403: distribuir não é dele', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    const resposta = await enviar(
      'POST',
      `/negociacoes/${negociacao.id}/responsavel`,
      cenario.agenteA1.cookie,
      { membershipId: cenario.agenteA1.membershipId },
    );

    expect(resposta.status).toBe(403);
  });

  it('recusa atribuir a quem não é responsável pelo cliente', async () => {
    const negociacao = await criarEObter(cenario.managerA.cookie, {
      leadId: cenario.leadDeA1,
    });

    const resposta = await enviar(
      'POST',
      `/negociacoes/${negociacao.id}/responsavel`,
      cenario.managerA.cookie,
      { membershipId: cenario.agenteA2.membershipId },
    );

    // Criaria um responsável que recebe 404 ao abrir o próprio registro.
    expect(resposta.status).toBe(400);
  });

  it('aceita deixar sem responsável próprio', async () => {
    const negociacao = await criarEObter(cenario.managerA.cookie, {
      leadId: cenario.leadDeA1,
    });

    const resposta = await enviar(
      'POST',
      `/negociacoes/${negociacao.id}/responsavel`,
      cenario.managerA.cookie,
      { membershipId: null },
    );

    expect(resposta.status).toBe(200);
    expect(
      ((await resposta.json()) as RespostaDeNegociacao).responsavel,
    ).toBeNull();

    // Continua visível para quem é responsável pelo cliente.
    expect(
      (await obter(`/negociacoes/${negociacao.id}`, cenario.agenteA1.cookie))
        .status,
    ).toBe(200);
  });

  it('aceita atribuir a quem é responsável pelo cliente', async () => {
    const negociacao = await criarEObter(cenario.managerA.cookie, {
      leadId: cenario.leadDeA1,
    });

    await enviar(
      'POST',
      `/negociacoes/${negociacao.id}/responsavel`,
      cenario.managerA.cookie,
      { membershipId: null },
    );

    const resposta = await enviar(
      'POST',
      `/negociacoes/${negociacao.id}/responsavel`,
      cenario.managerA.cookie,
      { membershipId: cenario.agenteA1.membershipId },
    );

    expect(resposta.status).toBe(200);
  });
});

describe('exclusão', () => {
  it('o corretor recebe 403', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    const resposta = await enviar(
      'DELETE',
      `/negociacoes/${negociacao.id}`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(403);
  });

  it('o proprietário exclui, e a exclusão é lógica', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    const resposta = await enviar(
      'DELETE',
      `/negociacoes/${negociacao.id}`,
      cenario.ownerA.cookie,
    );

    expect(resposta.status).toBe(200);

    const noBanco = await prisma.deal.findUniqueOrThrow({
      where: { id: negociacao.id },
      select: { deletedAt: true },
    });

    // A linha fica: Task aponta para ela.
    expect(noBanco.deletedAt).not.toBeNull();
  });

  it('a excluída sai do funil e responde 404 por ID direto', async () => {
    const negociacao = await criarEObter(cenario.agenteA1.cookie, {
      leadId: cenario.leadDeA1,
    });

    await enviar(
      'DELETE',
      `/negociacoes/${negociacao.id}`,
      cenario.ownerA.cookie,
    );

    const lista = await obter('/negociacoes', cenario.ownerA.cookie);
    expect(((await lista.json()) as { total: number }).total).toBe(0);

    expect(
      (await obter(`/negociacoes/${negociacao.id}`, cenario.ownerA.cookie))
        .status,
    ).toBe(404);
  });
});
