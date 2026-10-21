/**
 * Item **B5**: leads.
 *
 * Os critérios do roadmap: telefone **ou** e-mail obrigatório, `AGENT` vê só os
 * dele, e duplicata por telefone **sinalizada**, nunca unida automaticamente.
 *
 * ## A inversão em relação a imóveis
 *
 * É o que mais importa neste arquivo. `imovel:ver` é `ORG` para os quatro
 * papéis, então o imóvel do colega responde **403** ao ser editado — o corretor
 * o vê na lista, e esconder seria teatro. `lead:ver` é **`OWN`** para o
 * corretor, então o lead do colega responde **404**: ele não o vê, e um 403
 * entregaria justamente a informação que o escopo `OWN` existe para negar.
 *
 * Mesma pessoa, mesmo papel, mesma organização, códigos diferentes — porque a
 * matriz diz coisas diferentes sobre ver imóvel e ver lead. É o par que
 * `docs/permissions.md` §8.3 usa para explicar a distinção, e agora ele existe
 * dos dois lados.
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

/** Corpo mínimo aceito: nome e uma forma de contato. */
const LEAD_MINIMO = {
  nomeCompleto: 'Mariana Fontes',
  telefone: '11988887777',
};

type RespostaDeLead = {
  id: string;
  nomeCompleto: string;
  telefone: string | null;
  email: string | null;
  origem: string;
  status: string;
  observacoes: string | null;
  responsavel: { membershipId: string; nome: string } | null;
  consentimento: { dadoEm: string; versaoDoAviso: string | null } | null;
};

type Duplicata =
  | {
      nivel: 'visivel';
      id: string;
      nomeCompleto: string;
      responsavel: string | null;
    }
  | { nivel: 'restrita' };

type RespostaDeCadastro = {
  lead: RespostaDeLead;
  duplicatas: Duplicata[];
};

type ErroDeValidacao = {
  mensagem: string;
  erros: { campo: string; mensagem: string }[];
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

function criar(cookie: string, corpo: Record<string, unknown> = {}) {
  return enviar('POST', '/leads', cookie, { ...LEAD_MINIMO, ...corpo });
}

async function criarEObter(
  cookie: string,
  corpo: Record<string, unknown> = {},
): Promise<RespostaDeCadastro> {
  const resposta = await criar(cookie, corpo);

  expect(resposta.status).toBe(201);

  return (await resposta.json()) as RespostaDeCadastro;
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

describe('cadastro', () => {
  it('cria o lead e devolve 201', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie);

    expect(lead.nomeCompleto).toBe('Mariana Fontes');
    expect(lead.telefone).toBe('11988887777');
    expect(lead.status).toBe('NEW');
    expect(lead.origem).toBe('MANUAL');
  });

  it('nasce atribuído a quem cadastrou', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie);

    // Para o AGENT é o que a matriz manda (`lead:criar` é OWN). Para o gerente
    // é decisão de 21/10/2026: ele anota o lead atendendo o telefone, e
    // deixá-lo sem responsável faria o contato aparecer na fila como se
    // ninguém o tivesse visto.
    expect(lead.responsavel?.membershipId).toBe(cenario.agenteA1.membershipId);
    expect(lead.responsavel?.nome).toBe('Agente A1');

    const { lead: doGerente } = await criarEObter(cenario.managerA.cookie, {
      telefone: '11977776666',
    });

    expect(doGerente.responsavel?.membershipId).toBe(
      cenario.managerA.membershipId,
    );
  });

  it('normaliza o telefone e o e-mail', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie, {
      telefone: '+55 (11) 98888-7777',
      email: '  MARIANA@Exemplo.COM ',
    });

    expect(lead.telefone).toBe('11988887777');
    expect(lead.email).toBe('mariana@exemplo.com');
  });

  it('aceita só e-mail, sem telefone', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie, {
      telefone: undefined,
      email: 'mariana@exemplo.com',
    });

    expect(lead.telefone).toBeNull();
    expect(lead.email).toBe('mariana@exemplo.com');
  });

  it('recusa lead sem telefone e sem e-mail', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, {
      telefone: undefined,
    });

    expect(resposta.status).toBe(400);

    const corpo = (await resposta.json()) as ErroDeValidacao;
    expect(corpo.erros[0].campo).toBe('telefone');
  });

  it('recusa origem PUBLIC_CATALOG no cadastro manual', async () => {
    // Só o formulário da vitrine cria lead com essa origem, e é o servidor que
    // a define. Aceitá-la aqui permitiria inflar o relatório do catálogo com
    // lead digitado à mão.
    const resposta = await criar(cenario.agenteA1.cookie, {
      origem: 'PUBLIC_CATALOG',
    });

    expect(resposta.status).toBe(400);
  });

  it('aceita as outras origens de cadastro manual', async () => {
    for (const origem of ['MANUAL', 'REFERRAL', 'IMPORT', 'OTHER']) {
      const { lead } = await criarEObter(cenario.agenteA1.cookie, {
        origem,
        telefone: undefined,
        email: `${origem.toLowerCase()}@exemplo.com`,
      });

      expect(lead.origem).toBe(origem);
    }
  });

  it('nasce sem consentimento: ele é prova do visitante, não do cadastro', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie);

    expect(lead.consentimento).toBeNull();
  });

  it('nasce na organização ativa, e não em outra enviada no corpo', async () => {
    const { lead } = await criarEObter(cenario.dual.cookie, {
      organizationId: cenario.organizacaoB,
    });

    const noBanco = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      select: { organizationId: true },
    });

    expect(noBanco.organizationId).toBe(cenario.organizacaoA);
  });

  it('não aceita responsável pelo corpo: atribuir exige lead:atribuir', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie, {
      assignedMemberId: cenario.agenteA2.membershipId,
    });

    // Sem isto, o corretor cadastraria lead no nome de um colega.
    expect(lead.responsavel?.membershipId).toBe(cenario.agenteA1.membershipId);
  });
});

describe('duplicata por telefone', () => {
  // O cenário cria os três leads com o mesmo telefone, o que serve bem aqui:
  // leadDeA1 é do agenteA1 e leadDeA2 é do agenteA2.
  const MESMO_TELEFONE = '11999990000';

  it('sinaliza a duplicata própria com nome e responsável', async () => {
    const { duplicatas } = await criarEObter(cenario.agenteA1.cookie, {
      telefone: MESMO_TELEFONE,
    });

    const visiveis = duplicatas.filter((d) => d.nivel === 'visivel');

    expect(visiveis).toHaveLength(1);
    expect(visiveis[0]).toMatchObject({
      id: cenario.leadDeA1,
      nomeCompleto: 'Cliente do A1',
      responsavel: 'Agente A1',
    });
  });

  it('a duplicata do colega vem sem nome e sem responsável', async () => {
    const { duplicatas } = await criarEObter(cenario.agenteA1.cookie, {
      telefone: MESMO_TELEFONE,
    });

    const restritas = duplicatas.filter((d) => d.nivel === 'restrita');

    // O lead do agenteA2 existe com esse telefone, mas `lead:ver` é OWN: o
    // nome e o responsável vazariam a carteira do colega pela porta do
    // cadastro.
    expect(restritas).toHaveLength(1);
    expect(JSON.stringify(restritas[0])).not.toContain('Cliente do A2');
    expect(JSON.stringify(restritas[0])).not.toContain('Agente A2');
  });

  it('o gerente vê as duas duplicatas por inteiro', async () => {
    const { duplicatas } = await criarEObter(cenario.managerA.cookie, {
      telefone: MESMO_TELEFONE,
    });

    // Escopo ORG: não há carteira a proteger dele.
    expect(duplicatas.every((d) => d.nivel === 'visivel')).toBe(true);
    expect(duplicatas).toHaveLength(2);
  });

  it('não sinaliza lead de outra organização', async () => {
    // O leadDeB tem o mesmo telefone, e não pode aparecer.
    const { duplicatas } = await criarEObter(cenario.ownerA.cookie, {
      telefone: MESMO_TELEFONE,
    });

    expect(duplicatas).toHaveLength(2);
  });

  it('cadastra mesmo com duplicata: sinalizar não é recusar', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, {
      telefone: MESMO_TELEFONE,
    });

    // Decisão de 19/10/2026: sinalizada, nunca unida automaticamente. Fundir
    // perde qual corretor falou com a pessoa primeiro.
    expect(resposta.status).toBe(201);
    expect(await prisma.lead.count({ where: { phone: MESMO_TELEFONE } })).toBe(
      4,
    );
  });

  it('sem telefone não há o que procurar', async () => {
    const { duplicatas } = await criarEObter(cenario.agenteA1.cookie, {
      telefone: undefined,
      email: 'mariana@exemplo.com',
    });

    expect(duplicatas).toEqual([]);
  });

  it('não sinaliza lead excluído', async () => {
    await prisma.lead.update({
      where: { id: cenario.leadDeA1 },
      data: { deletedAt: new Date() },
    });

    const { duplicatas } = await criarEObter(cenario.agenteA1.cookie, {
      telefone: MESMO_TELEFONE,
    });

    expect(duplicatas.filter((d) => d.nivel === 'visivel')).toHaveLength(0);
  });

  it('registra na auditoria quantas duplicatas foram sinalizadas', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie, {
      telefone: MESMO_TELEFONE,
    });

    const [linha] = await auditoriaDe(lead.id);

    // Sem isto, "alguém foi avisado?" não tem resposta depois.
    expect(linha.metadata).toMatchObject({ duplicatasSinalizadas: 2 });
  });
});

describe('listagem', () => {
  it('o corretor vê só os leads dele', async () => {
    const resposta = await obter('/leads', cenario.agenteA1.cookie);

    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as {
      leads: RespostaDeLead[];
      total: number;
    };

    // Aqui a leitura É restrita, ao contrário dos imóveis: lead é a moeda de
    // troca da imobiliária (decisão de 19/10/2026).
    expect(corpo.total).toBe(1);
    expect(corpo.leads[0].nomeCompleto).toBe('Cliente do A1');
  });

  it('o gerente vê os leads de todos os corretores', async () => {
    const resposta = await obter('/leads', cenario.managerA.cookie);
    const corpo = (await resposta.json()) as { total: number };

    expect(corpo.total).toBe(2);
  });

  it('apenasMeus recorta para quem tem escopo ORG', async () => {
    const resposta = await obter(
      '/leads?apenasMeus=true',
      cenario.managerA.cookie,
    );

    const corpo = (await resposta.json()) as { total: number };

    // O gerente não tem lead atribuído no cenário.
    expect(corpo.total).toBe(0);
  });

  it('busca por nome, telefone e e-mail', async () => {
    await criarEObter(cenario.agenteA1.cookie, {
      nomeCompleto: 'Joana Peixoto',
      telefone: '11955554444',
      email: 'joana@exemplo.com',
    });

    for (const termo of ['Peixoto', '5555', 'joana@']) {
      const resposta = await obter(
        `/leads?termo=${encodeURIComponent(termo)}`,
        cenario.agenteA1.cookie,
      );

      const corpo = (await resposta.json()) as { total: number };
      expect(corpo.total, `termo ${termo}`).toBe(1);
    }
  });

  it('filtra por situação e por origem', async () => {
    await criarEObter(cenario.agenteA1.cookie, {
      origem: 'REFERRAL',
      telefone: '11944443333',
    });

    const porOrigem = await obter(
      '/leads?origem=REFERRAL',
      cenario.agenteA1.cookie,
    );
    expect(((await porOrigem.json()) as { total: number }).total).toBe(1);

    const porStatus = await obter('/leads?status=NEW', cenario.agenteA1.cookie);
    expect(((await porStatus.json()) as { total: number }).total).toBe(2);
  });

  it('pagina, com o teto de 100 do contrato compartilhado', async () => {
    const paginada = await obter('/leads?porPagina=1', cenario.managerA.cookie);

    const corpo = (await paginada.json()) as {
      leads: RespostaDeLead[];
      total: number;
    };

    expect(corpo.leads).toHaveLength(1);
    expect(corpo.total).toBe(2);

    const acimaDoTeto = await obter(
      '/leads?porPagina=500',
      cenario.managerA.cookie,
    );

    expect(acimaDoTeto.status).toBe(400);
  });

  it('lead excluído e lead anonimizado ficam fora', async () => {
    await prisma.lead.update({
      where: { id: cenario.leadDeA1 },
      data: { deletedAt: new Date() },
    });
    await prisma.lead.update({
      where: { id: cenario.leadDeA2 },
      data: { anonymizedAt: new Date() },
    });

    const resposta = await obter('/leads', cenario.managerA.cookie);

    expect(((await resposta.json()) as { total: number }).total).toBe(0);
  });
});

describe('fila de não atribuídos — item B6', () => {
  async function criarNaFila(): Promise<string> {
    const lead = await prisma.lead.create({
      data: {
        organizationId: cenario.organizacaoA,
        fullName: 'Lead sem responsavel',
        phone: '11933332222',
        source: 'PUBLIC_CATALOG',
        assignedMemberId: null,
      },
      select: { id: true },
    });

    return lead.id;
  }

  it('o gerente vê a fila', async () => {
    await criarNaFila();

    const resposta = await obter(
      '/leads?naoAtribuidos=true',
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as {
      leads: RespostaDeLead[];
      total: number;
    };

    expect(corpo.total).toBe(1);
    expect(corpo.leads[0].responsavel).toBeNull();
  });

  it('o corretor recebe 403 ao pedir a fila, e não lista vazia', async () => {
    await criarNaFila();

    const resposta = await obter(
      '/leads?naoAtribuidos=true',
      cenario.agenteA1.cookie,
    );

    // Lista vazia seria pior: a tela mostraria uma fila vazia como se ela
    // existisse e estivesse em ordem.
    expect(resposta.status).toBe(403);
  });

  it('o lead da fila não aparece na lista do corretor', async () => {
    await criarNaFila();

    const resposta = await obter('/leads', cenario.agenteA1.cookie);
    const corpo = (await resposta.json()) as { total: number };

    // O recorte por responsável exclui a fila por consequência, o que é
    // correto: `lead:verNaoAtribuidos` é false para ele.
    expect(corpo.total).toBe(1);
  });

  it('o corretor recebe 404 no lead da fila por ID direto', async () => {
    const id = await criarNaFila();

    const resposta = await obter(`/leads/${id}`, cenario.agenteA1.cookie);

    expect(resposta.status).toBe(404);
  });

  it('o contador existe para o dashboard, e o corretor não o alcança', async () => {
    await criarNaFila();
    await criarNaFila();

    const doGerente = await obter(
      '/leads/nao-atribuidos/contagem',
      cenario.managerA.cookie,
    );

    expect(doGerente.status).toBe(200);
    expect(((await doGerente.json()) as { total: number }).total).toBe(2);

    const doCorretor = await obter(
      '/leads/nao-atribuidos/contagem',
      cenario.agenteA1.cookie,
    );

    expect(doCorretor.status).toBe(403);
  });

  it('a rota do contador não é confundida com um identificador', async () => {
    // `@Get(':id')` casaria com este caminho se viesse antes na declaração.
    const resposta = await obter(
      '/leads/nao-atribuidos/contagem',
      cenario.ownerA.cookie,
    );

    expect(resposta.status).toBe(200);
  });
});

describe('ver e editar', () => {
  it('o corretor vê o lead dele', async () => {
    const resposta = await obter(
      `/leads/${cenario.leadDeA1}`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);
  });

  it('o lead do colega responde 404 — não 403, como nos imóveis', async () => {
    const resposta = await obter(
      `/leads/${cenario.leadDeA2}`,
      cenario.agenteA1.cookie,
    );

    // A inversão central deste item: ele não vê esse lead, e um 403 entregaria
    // a informação que o escopo OWN existe para negar.
    expect(resposta.status).toBe(404);
  });

  it('editar o lead do colega também responde 404', async () => {
    const resposta = await enviar(
      'PATCH',
      `/leads/${cenario.leadDeA2}`,
      cenario.agenteA1.cookie,
      { nomeCompleto: 'Nao deveria passar' },
    );

    expect(resposta.status).toBe(404);

    const noBanco = await prisma.lead.findUniqueOrThrow({
      where: { id: cenario.leadDeA2 },
      select: { fullName: true },
    });

    expect(noBanco.fullName).toBe('Cliente do A2');
  });

  it('o gerente edita o lead de qualquer corretor', async () => {
    const resposta = await enviar(
      'PATCH',
      `/leads/${cenario.leadDeA2}`,
      cenario.managerA.cookie,
      { nomeCompleto: 'Cliente corrigido' },
    );

    expect(resposta.status).toBe(200);
  });

  it('null apaga o campo opcional', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie, {
      email: 'mariana@exemplo.com',
      observacoes: 'Prefere contato pela manha.',
    });

    const resposta = await enviar(
      'PATCH',
      `/leads/${lead.id}`,
      cenario.agenteA1.cookie,
      { observacoes: null },
    );

    expect(((await resposta.json()) as RespostaDeLead).observacoes).toBeNull();
  });

  it('recusa a edição que deixaria o lead sem forma de contato', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie);

    // Só tem telefone: apagá-lo deixaria um registro que não serve para a
    // única coisa que leads existem para permitir.
    const resposta = await enviar(
      'PATCH',
      `/leads/${lead.id}`,
      cenario.agenteA1.cookie,
      { telefone: null },
    );

    expect(resposta.status).toBe(400);
  });

  it('aceita apagar o telefone quando há e-mail gravado', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie, {
      email: 'mariana@exemplo.com',
    });

    const resposta = await enviar(
      'PATCH',
      `/leads/${lead.id}`,
      cenario.agenteA1.cookie,
      { telefone: null },
    );

    expect(resposta.status).toBe(200);
  });

  it('a edição não muda a origem', async () => {
    const resposta = await enviar(
      'PATCH',
      `/leads/${cenario.leadDeA1}`,
      cenario.agenteA1.cookie,
      { origem: 'REFERRAL', nomeCompleto: 'Cliente do A1' },
    );

    // Origem registra COMO o contato chegou, e isso não muda depois: editável,
    // o relatório de origem viraria opinião.
    expect(resposta.status).toBe(200);

    const noBanco = await prisma.lead.findUniqueOrThrow({
      where: { id: cenario.leadDeA1 },
      select: { source: true },
    });

    expect(noBanco.source).toBe('MANUAL');
  });

  it('recusa corpo vazio', async () => {
    const resposta = await enviar(
      'PATCH',
      `/leads/${cenario.leadDeA1}`,
      cenario.agenteA1.cookie,
      {},
    );

    expect(resposta.status).toBe(400);
  });
});

describe('atribuição', () => {
  function atribuir(id: string, membershipId: string | null, cookie: string) {
    return enviar('POST', `/leads/${id}/responsavel`, cookie, {
      membershipId,
    });
  }

  it('o gerente atribui o lead a um corretor', async () => {
    const resposta = await atribuir(
      cenario.leadDeA1,
      cenario.agenteA2.membershipId,
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(200);
    expect(
      ((await resposta.json()) as RespostaDeLead).responsavel?.membershipId,
    ).toBe(cenario.agenteA2.membershipId);
  });

  it('o corretor recebe 403: distribuir carteira não é dele', async () => {
    const resposta = await atribuir(
      cenario.leadDeA1,
      cenario.agenteA1.membershipId,
      cenario.agenteA1.cookie,
    );

    // `lead:atribuir` é false para o AGENT, e a guarda corta no passo 4.
    expect(resposta.status).toBe(403);
  });

  it('null devolve o lead à fila', async () => {
    const resposta = await atribuir(
      cenario.leadDeA1,
      null,
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(200);
    expect(((await resposta.json()) as RespostaDeLead).responsavel).toBeNull();
  });

  it('recusa atribuir a membro de outra organização, com 404', async () => {
    const resposta = await atribuir(
      cenario.leadDeA1,
      cenario.agenteB1.membershipId,
      cenario.managerA.cookie,
    );

    // Sem esta conferência, o nome de alguém de outra organização passaria a
    // aparecer na tela desta. E o 404 não diz se aquele Membership existe.
    expect(resposta.status).toBe(404);

    const noBanco = await prisma.lead.findUniqueOrThrow({
      where: { id: cenario.leadDeA1 },
      select: { assignedMemberId: true },
    });

    expect(noBanco.assignedMemberId).toBe(cenario.agenteA1.membershipId);
  });

  it('recusa atribuir a membro suspenso', async () => {
    await prisma.membership.update({
      where: { id: cenario.agenteA2.membershipId },
      data: { status: 'SUSPENDED' },
    });

    const resposta = await atribuir(
      cenario.leadDeA1,
      cenario.agenteA2.membershipId,
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('recusa atribuir a quem já é o responsável', async () => {
    const resposta = await atribuir(
      cenario.leadDeA1,
      cenario.agenteA1.membershipId,
      cenario.managerA.cookie,
    );

    expect(resposta.status).toBe(400);
  });

  it('registra os dois lados da troca na auditoria', async () => {
    await atribuir(
      cenario.leadDeA1,
      cenario.agenteA2.membershipId,
      cenario.managerA.cookie,
    );

    const linhas = await auditoriaDe(cenario.leadDeA1);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].action).toBe('lead.atribuido');
    expect(linhas[0].actorMembershipId).toBe(cenario.managerA.membershipId);
    // "De quem para quem" é a pergunta que se faz a um histórico de atribuição
    // quando dois corretores discutem de quem era o cliente.
    expect(linhas[0].metadata).toMatchObject({
      responsavelAnterior: cenario.agenteA1.membershipId,
      responsavel: cenario.agenteA2.membershipId,
    });
  });

  it('devolver à fila gera evento próprio', async () => {
    await atribuir(cenario.leadDeA1, null, cenario.managerA.cookie);

    const [linha] = await auditoriaDe(cenario.leadDeA1);

    expect(linha.action).toBe('lead.devolvidoAFila');
    expect(linha.metadata).toMatchObject({ responsavel: null });
  });
});

describe('situação do atendimento', () => {
  function mudar(id: string, status: string, cookie: string) {
    return enviar('POST', `/leads/${id}/situacao`, cookie, { status });
  }

  it('o corretor move o lead dele', async () => {
    const resposta = await mudar(
      cenario.leadDeA1,
      'CONTACTED',
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);
    expect(((await resposta.json()) as RespostaDeLead).status).toBe(
      'CONTACTED',
    );
  });

  it('o lead do colega responde 404', async () => {
    const resposta = await mudar(
      cenario.leadDeA2,
      'CONTACTED',
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(404);
  });

  it('recusa a situação em que o lead já está', async () => {
    const resposta = await mudar(
      cenario.leadDeA1,
      'NEW',
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(400);
  });

  it('recusa situação inventada', async () => {
    const resposta = await mudar(
      cenario.leadDeA1,
      'TALVEZ',
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(400);
  });

  it('cada situação gera um evento de auditoria com nome próprio', async () => {
    await mudar(cenario.leadDeA1, 'CONTACTED', cenario.agenteA1.cookie);
    await mudar(cenario.leadDeA1, 'QUALIFIED', cenario.agenteA1.cookie);
    await mudar(cenario.leadDeA1, 'CONVERTED', cenario.agenteA1.cookie);

    const linhas = await auditoriaDe(cenario.leadDeA1);

    // Como campo de edição, "qualifiquei o lead" e "corrigi o telefone"
    // gerariam a mesma linha, e o relatório de conversão não teria de onde sair.
    expect(linhas.map((l) => l.action)).toEqual([
      'lead.contatado',
      'lead.qualificado',
      'lead.convertido',
    ]);
  });
});

describe('exclusão', () => {
  it('o corretor e o gerente não excluem: é pedido de LGPD', async () => {
    const doCorretor = await enviar(
      'DELETE',
      `/leads/${cenario.leadDeA1}`,
      cenario.agenteA1.cookie,
    );

    const doGerente = await enviar(
      'DELETE',
      `/leads/${cenario.leadDeA1}`,
      cenario.managerA.cookie,
    );

    expect(doCorretor.status).toBe(403);
    expect(doGerente.status).toBe(403);
  });

  it('o proprietário exclui, e a exclusão é lógica', async () => {
    const resposta = await enviar(
      'DELETE',
      `/leads/${cenario.leadDeA1}`,
      cenario.ownerA.cookie,
    );

    expect(resposta.status).toBe(200);

    const noBanco = await prisma.lead.findUniqueOrThrow({
      where: { id: cenario.leadDeA1 },
      select: { deletedAt: true },
    });

    // A linha fica: Inquiry, Deal, Visit e Task apontam para ela.
    expect(noBanco.deletedAt).not.toBeNull();
  });

  it('o lead excluído sai da lista e responde 404 por ID direto', async () => {
    await enviar('DELETE', `/leads/${cenario.leadDeA1}`, cenario.ownerA.cookie);

    const lista = await obter('/leads', cenario.ownerA.cookie);
    expect(((await lista.json()) as { total: number }).total).toBe(1);

    const porId = await obter(
      `/leads/${cenario.leadDeA1}`,
      cenario.ownerA.cookie,
    );

    expect(porId.status).toBe(404);
  });

  it('a auditoria da exclusão não guarda dado pessoal', async () => {
    await enviar('DELETE', `/leads/${cenario.leadDeA1}`, cenario.ownerA.cookie);

    const [linha] = await auditoriaDe(cenario.leadDeA1);

    expect(linha.action).toBe('lead.excluido');
    // O log de uma exclusão pedida por LGPD não pode ser o lugar onde o dado
    // pessoal sobrevive.
    const comoTexto = JSON.stringify(linha.metadata);
    expect(comoTexto).not.toContain('Cliente do A1');
    expect(comoTexto).not.toContain('11999990000');
  });
});

describe('A13 — auditoria de escrita', () => {
  it('a edição registra os campos, não os valores', async () => {
    await enviar(
      'PATCH',
      `/leads/${cenario.leadDeA1}`,
      cenario.agenteA1.cookie,
      { nomeCompleto: 'Cliente renomeado', telefone: '11922221111' },
    );

    const [linha] = await auditoriaDe(cenario.leadDeA1);

    expect(linha.action).toBe('lead.editado');
    expect(linha.metadata).toEqual({ campos: 'nomeCompleto,telefone' });
    // O telefone não pode estar no log: seria duplicar o dado pessoal que a
    // LGPD manda minimizar.
    expect(JSON.stringify(linha.metadata)).not.toContain('11922221111');
  });

  it('a tentativa recusada não gera Activity', async () => {
    await enviar(
      'PATCH',
      `/leads/${cenario.leadDeA2}`,
      cenario.agenteA1.cookie,
      { nomeCompleto: 'Nao deveria passar' },
    );

    expect(await auditoriaDe(cenario.leadDeA2)).toHaveLength(0);
  });

  it('o cadastro recusado não deixa lead nem Activity', async () => {
    const antes = await prisma.lead.count();

    const resposta = await criar(cenario.agenteA1.cookie, {
      telefone: undefined,
    });

    expect(resposta.status).toBe(400);
    expect(await prisma.lead.count()).toBe(antes);
    expect(await prisma.activity.count()).toBe(0);
  });

  it('o IP vai hasheado, nunca em claro', async () => {
    const { lead } = await criarEObter(cenario.agenteA1.cookie);

    const linhas = await prisma.activity.findMany({
      where: { entityId: lead.id },
      select: { ipHash: true },
    });

    expect(linhas[0].ipHash).not.toBeNull();
    expect(linhas[0].ipHash).not.toContain('127.0.0.1');
  });
});
