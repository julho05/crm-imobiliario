/**
 * Item **B1**: CRUD de imóveis.
 *
 * Os três critérios de aceitação do roadmap, verificados pela API:
 *
 * 1. `code` único por organização, com erro legível na colisão
 * 2. `purpose = BOTH` exige os dois preços
 * 3. `AGENT` edita só os dele
 *
 * O terceiro tem uma sutileza que o roadmap escreve como "404 nos outros" e
 * que [permissions.md](../../../../docs/permissions.md) §8.3 corrige para
 * **403**: `imovel:ver` é `ORG` para o corretor, então ele está vendo o imóvel
 * do colega na tela — esconder com 404 algo que ele acabou de ler seria teatro.
 * O 404 vale para travessia entre organizações, que é o arquivo vizinho.
 *
 * O item **A13** (auditoria de escrita) entra aqui junto: cada escrita confere
 * a linha de `Activity` que ela gerou.
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

/** Corpo mínimo aceito: o piso decidido em 21/10/2026. */
const IMOVEL_MINIMO = {
  titulo: 'Apartamento no Centro',
  tipo: 'APARTMENT',
  finalidade: 'SALE',
  preco: 450_000,
  estado: 'SP',
  cidade: 'Sao Paulo',
  bairro: 'Centro',
};

type RespostaDeImovel = {
  id: string;
  codigo: string;
  slug: string;
  titulo: string;
  status: string;
  preco: number | null;
  precoDeAluguel: number | null;
  condominio: number | null;
  estado: string;
  responsavel: { membershipId: string; nome: string } | null;
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
  return enviar('POST', '/imoveis', cookie, { ...IMOVEL_MINIMO, ...corpo });
}

async function criarEObter(
  cookie: string,
  corpo: Record<string, unknown> = {},
): Promise<RespostaDeImovel> {
  const resposta = await criar(cookie, corpo);

  expect(resposta.status).toBe(201);

  return (await resposta.json()) as RespostaDeImovel;
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
  it('cria o imóvel com o piso de campos e devolve 201', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);

    expect(imovel.titulo).toBe('Apartamento no Centro');
    expect(imovel.preco).toBe(450_000);
    expect(imovel.precoDeAluguel).toBeNull();
  });

  it('o imóvel nasce em DRAFT, nunca publicado', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);

    expect(imovel.status).toBe('DRAFT');

    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: imovel.id },
      select: { publishedAt: true, addressVisibility: true },
    });

    expect(noBanco.publishedAt).toBeNull();
    // Padrão restritivo de endereço, do schema. Quem cadastra não precisa
    // lembrar de configurar para o endereço não vazar.
    expect(noBanco.addressVisibility).toBe('NEIGHBORHOOD_ONLY');
  });

  it('nasce atribuído a quem cadastrou', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);

    // Sem isto o corretor salvaria o imóvel e receberia 403 para corrigir o
    // próprio texto, porque `imovel:editar` é OWN para ele.
    expect(imovel.responsavel?.membershipId).toBe(
      cenario.agenteA1.membershipId,
    );
    expect(imovel.responsavel?.nome).toBe('Agente A1');
  });

  it('nasce na organização ativa, e não em outra enviada no corpo', async () => {
    const imovel = await criarEObter(cenario.dual.cookie, {
      organizationId: cenario.organizacaoB,
    });

    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: imovel.id },
      select: { organizationId: true },
    });

    expect(noBanco.organizationId).toBe(cenario.organizacaoA);
  });

  it('recusa quem não tem sessão', async () => {
    const resposta = await criar('sessao=inventada');

    expect(resposta.status).toBe(401);
  });
});

describe('código de referência', () => {
  it('gera sequencial com prefixo do tipo quando não é informado', async () => {
    // O cenário já tem A-001 e A-002, que não pertencem à sequência AP-.
    const primeiro = await criarEObter(cenario.agenteA1.cookie);
    const segundo = await criarEObter(cenario.agenteA1.cookie);

    expect(primeiro.codigo).toBe('AP-001');
    expect(segundo.codigo).toBe('AP-002');
  });

  it('o prefixo acompanha o tipo do imóvel', async () => {
    const casa = await criarEObter(cenario.agenteA1.cookie, {
      tipo: 'HOUSE',
    });
    const terreno = await criarEObter(cenario.agenteA1.cookie, {
      tipo: 'LAND',
    });

    expect(casa.codigo).toBe('CA-001');
    expect(terreno.codigo).toBe('TE-001');
  });

  it('a sequência é por organização, e não global', async () => {
    const emA = await criarEObter(cenario.agenteA1.cookie);
    const emB = await criarEObter(cenario.agenteB1.cookie);

    // Se fosse global, B receberia AP-002 e saberia que alguém cadastrou um
    // imóvel no intervalo.
    expect(emA.codigo).toBe('AP-001');
    expect(emB.codigo).toBe('AP-001');
  });

  it('respeita o código informado, normalizado em maiúsculas', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie, {
      codigo: 'ref-casa-7',
    });

    expect(imovel.codigo).toBe('REF-CASA-7');
  });

  it('código repetido devolve erro legível no campo, não 500', async () => {
    await criarEObter(cenario.agenteA1.cookie, { codigo: 'REP-1' });

    const resposta = await criar(cenario.agenteA1.cookie, { codigo: 'rep-1' });

    expect(resposta.status).toBe(400);

    const corpo = (await resposta.json()) as ErroDeValidacao;
    expect(corpo.erros).toEqual([
      {
        campo: 'codigo',
        mensagem: 'O codigo REP-1 ja esta em uso em outro imovel.',
      },
    ]);
  });

  it('o mesmo código em outra organização é aceito', async () => {
    await criarEObter(cenario.agenteA1.cookie, { codigo: 'REP-1' });

    const emB = await criarEObter(cenario.agenteB1.cookie, {
      codigo: 'REP-1',
    });

    expect(emB.codigo).toBe('REP-1');
  });

  it('código fora do formato da sequência não atrapalha a geração', async () => {
    // `AP-FUNDOS` ocupa o nome, não a posição: ignorá-lo é o certo.
    await criarEObter(cenario.agenteA1.cookie, { codigo: 'AP-FUNDOS' });

    const gerado = await criarEObter(cenario.agenteA1.cookie);

    expect(gerado.codigo).toBe('AP-001');
  });

  it('o slug sai do título com o código no fim', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie, {
      titulo: 'Cobertura Duplex — Jardim Paulista, 3 Suítes!',
    });

    expect(imovel.slug).toBe(
      'cobertura-duplex-jardim-paulista-3-suites-ap-001',
    );
  });
});

describe('preço e finalidade', () => {
  it('SALE sem preço de venda é recusado', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, { preco: undefined });

    expect(resposta.status).toBe(400);

    const corpo = (await resposta.json()) as ErroDeValidacao;
    expect(corpo.erros).toEqual([
      {
        campo: 'preco',
        mensagem: 'Informe o preco de venda para esta finalidade.',
      },
    ]);
  });

  it('RENT exige o valor do aluguel', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, {
      finalidade: 'RENT',
      preco: undefined,
    });

    expect(resposta.status).toBe(400);

    const corpo = (await resposta.json()) as ErroDeValidacao;
    expect(corpo.erros[0].campo).toBe('precoDeAluguel');
  });

  it('BOTH exige os dois preços', async () => {
    const soVenda = await criar(cenario.agenteA1.cookie, {
      finalidade: 'BOTH',
    });

    expect(soVenda.status).toBe(400);
    expect(((await soVenda.json()) as ErroDeValidacao).erros[0].campo).toBe(
      'precoDeAluguel',
    );

    const comOsDois = await criar(cenario.agenteA1.cookie, {
      finalidade: 'BOTH',
      precoDeAluguel: 3_500,
    });

    expect(comOsDois.status).toBe(201);
  });

  it('recusa centavo fracionado em vez de arredondar em silêncio', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, {
      preco: 1000.555,
    });

    expect(resposta.status).toBe(400);
  });

  it('recusa UF que não existe', async () => {
    const resposta = await criar(cenario.agenteA1.cookie, { estado: 'XX' });

    expect(resposta.status).toBe(400);
  });
});

describe('listagem', () => {
  it('lista só os imóveis da organização ativa, paginados', async () => {
    const resposta = await obter('/imoveis', cenario.agenteA1.cookie);

    expect(resposta.status).toBe(200);

    const corpo = (await resposta.json()) as {
      imoveis: RespostaDeImovel[];
      total: number;
      pagina: number;
      porPagina: number;
    };

    // Os dois imóveis de A do cenário, e nenhum de B.
    expect(corpo.total).toBe(2);
    expect(corpo.pagina).toBe(1);
    expect(corpo.porPagina).toBe(20);
    expect(corpo.imoveis.map((i) => i.codigo).sort()).toEqual([
      'A-001',
      'A-002',
    ]);
  });

  it('o corretor vê os imóveis do colega: imovel:ver é ORG para todos', async () => {
    const resposta = await obter('/imoveis', cenario.agenteA1.cookie);
    const corpo = (await resposta.json()) as { imoveis: RespostaDeImovel[] };

    // Decisão de 19/10/2026: restringir quebraria o negócio, porque o corretor
    // precisa poder oferecer qualquer imóvel da casa ao cliente dele.
    expect(corpo.imoveis).toHaveLength(2);
  });

  it('apenasMeus recorta por responsável', async () => {
    const resposta = await obter(
      '/imoveis?apenasMeus=true',
      cenario.agenteA1.cookie,
    );

    const corpo = (await resposta.json()) as { imoveis: RespostaDeImovel[] };

    expect(corpo.imoveis.map((i) => i.codigo)).toEqual(['A-001']);
  });

  it('respeita o tamanho de página pedido', async () => {
    const resposta = await obter(
      '/imoveis?porPagina=1&pagina=2',
      cenario.agenteA1.cookie,
    );

    const corpo = (await resposta.json()) as {
      imoveis: RespostaDeImovel[];
      total: number;
    };

    expect(corpo.imoveis).toHaveLength(1);
    expect(corpo.total).toBe(2);
  });

  it('recusa página maior que o teto de 100', async () => {
    const resposta = await obter(
      '/imoveis?porPagina=500',
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(400);
  });

  it('filtra por termo no título e no código', async () => {
    await criarEObter(cenario.agenteA1.cookie, {
      titulo: 'Loja com vitrine na avenida',
      tipo: 'COMMERCIAL',
    });

    const porTitulo = await obter(
      '/imoveis?termo=vitrine',
      cenario.ownerA.cookie,
    );
    expect(
      ((await porTitulo.json()) as { imoveis: RespostaDeImovel[] }).imoveis,
    ).toHaveLength(1);

    const porCodigo = await obter(
      '/imoveis?termo=A-001',
      cenario.ownerA.cookie,
    );
    expect(
      ((await porCodigo.json()) as { imoveis: RespostaDeImovel[] }).imoveis,
    ).toHaveLength(1);
  });
});

describe('edição', () => {
  it('o corretor edita o imóvel dele', async () => {
    const resposta = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
      { titulo: 'Titulo corrigido' },
    );

    expect(resposta.status).toBe(200);
    expect(((await resposta.json()) as RespostaDeImovel).titulo).toBe(
      'Titulo corrigido',
    );
  });

  it('o corretor recebe 403 no imóvel do colega, não 404', async () => {
    const resposta = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA2}`,
      cenario.agenteA1.cookie,
      { titulo: 'Nao deveria passar' },
    );

    // 403 e não 404 porque ele VÊ esse imóvel na listagem: permissions.md §8.3.
    expect(resposta.status).toBe(403);
  });

  it('o gerente edita o imóvel de qualquer corretor', async () => {
    const resposta = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA2}`,
      cenario.managerA.cookie,
      { titulo: 'Ajuste do gerente' },
    );

    expect(resposta.status).toBe(200);
  });

  it('o corretor recebe 403 em imóvel sem responsável', async () => {
    const semResponsavel = await prisma.property.create({
      data: {
        organizationId: cenario.organizacaoA,
        code: 'SEM-DONO',
        slug: 'sem-dono',
        title: 'Imovel sem responsavel',
        type: 'APARTMENT',
        purpose: 'SALE',
        state: 'SP',
        city: 'Sao Paulo',
        neighborhood: 'Centro',
      },
      select: { id: true },
    });

    const resposta = await enviar(
      'PATCH',
      `/imoveis/${semResponsavel.id}`,
      cenario.agenteA1.cookie,
      { titulo: 'Nao deveria passar' },
    );

    expect(resposta.status).toBe(403);

    // Mas o gerente alcança: é o que o schema.prisma já previa ao deixar
    // `ownerMemberId` opcional.
    const doGerente = await enviar(
      'PATCH',
      `/imoveis/${semResponsavel.id}`,
      cenario.managerA.cookie,
      { titulo: 'Assumido pelo gerente' },
    );

    expect(doGerente.status).toBe(200);
  });

  it('o slug não muda quando o título muda', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);

    const resposta = await enviar(
      'PATCH',
      `/imoveis/${imovel.id}`,
      cenario.agenteA1.cookie,
      { titulo: 'Titulo completamente diferente' },
    );

    // A URL pública pode já estar em anúncio e em conversa de WhatsApp.
    expect(((await resposta.json()) as RespostaDeImovel).slug).toBe(
      imovel.slug,
    );
  });

  it('null apaga o valor; campo omitido não mexe', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie, {
      condominio: 800,
    });

    expect(imovel.condominio).toBe(800);

    const resposta = await enviar(
      'PATCH',
      `/imoveis/${imovel.id}`,
      cenario.agenteA1.cookie,
      { condominio: null },
    );

    const atualizado = (await resposta.json()) as RespostaDeImovel;
    expect(atualizado.condominio).toBeNull();
    // O preço não foi tocado.
    expect(atualizado.preco).toBe(450_000);
  });

  it('mudar para BOTH sem ter aluguel gravado é recusado', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);

    // O corpo não traz preço nenhum: só a mesclagem com o registro revela o
    // que falta.
    const resposta = await enviar(
      'PATCH',
      `/imoveis/${imovel.id}`,
      cenario.agenteA1.cookie,
      { finalidade: 'BOTH' },
    );

    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as ErroDeValidacao).erros[0].campo).toBe(
      'precoDeAluguel',
    );
  });

  it('mudar para BOTH enviando o aluguel na mesma requisição é aceito', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);

    const resposta = await enviar(
      'PATCH',
      `/imoveis/${imovel.id}`,
      cenario.agenteA1.cookie,
      { finalidade: 'BOTH', precoDeAluguel: 3_000 },
    );

    expect(resposta.status).toBe(200);
  });

  it('apagar o preço de um imóvel à venda é recusado', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);

    const resposta = await enviar(
      'PATCH',
      `/imoveis/${imovel.id}`,
      cenario.agenteA1.cookie,
      { preco: null },
    );

    expect(resposta.status).toBe(400);
  });

  it('imóvel já incoerente no banco continua editável no que não é preço', async () => {
    // A coluna `price` é nula no banco, e importação ou script de dados criam
    // linha que o cadastro nunca produziria. Recusar a correção de um bairro
    // com a mensagem "informe o preço de venda" apontaria para um campo que a
    // pessoa não tocou, numa tela em que ela não estava.
    const incoerente = await prisma.property.create({
      data: {
        organizationId: cenario.organizacaoA,
        code: 'SEM-PRECO',
        slug: 'sem-preco',
        title: 'Imovel importado sem preco',
        type: 'APARTMENT',
        purpose: 'SALE',
        state: 'SP',
        city: 'Sao Paulo',
        neighborhood: 'Centro',
        ownerMemberId: cenario.agenteA1.membershipId,
      },
      select: { id: true },
    });

    const correcao = await enviar(
      'PATCH',
      `/imoveis/${incoerente.id}`,
      cenario.agenteA1.cookie,
      { bairro: 'Bela Vista' },
    );

    expect(correcao.status).toBe(200);

    // Mas mexer na finalidade do mesmo registro cai na regra: todo caminho
    // capaz de CRIAR a incoerência continua fechado.
    const mudandoFinalidade = await enviar(
      'PATCH',
      `/imoveis/${incoerente.id}`,
      cenario.agenteA1.cookie,
      { finalidade: 'RENT' },
    );

    expect(mudandoFinalidade.status).toBe(400);
  });

  it('recusa corpo vazio', async () => {
    const resposta = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
      {},
    );

    expect(resposta.status).toBe(400);
  });

  it('não aceita status pelo corpo: publicar é o item B2', async () => {
    const resposta = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
      { status: 'AVAILABLE', titulo: 'Com status no corpo' },
    );

    expect(resposta.status).toBe(200);

    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: cenario.imovelDeA1 },
      select: { status: true, publishedAt: true },
    });

    expect(noBanco.status).toBe('DRAFT');
    expect(noBanco.publishedAt).toBeNull();
  });

  it('não aceita responsável pelo corpo: isso exige imovel:alterarResponsavel', async () => {
    const resposta = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
      { ownerMemberId: cenario.agenteA2.membershipId, titulo: 'Tentativa' },
    );

    expect(resposta.status).toBe(200);

    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: cenario.imovelDeA1 },
      select: { ownerMemberId: true },
    });

    expect(noBanco.ownerMemberId).toBe(cenario.agenteA1.membershipId);
  });
});

describe('exclusão', () => {
  it('o corretor e o gerente não excluem: 403 no passo 4', async () => {
    const doCorretor = await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
    );

    const doGerente = await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA2}`,
      cenario.managerA.cookie,
    );

    expect(doCorretor.status).toBe(403);
    expect(doGerente.status).toBe(403);
  });

  it('o proprietário exclui, e a exclusão é lógica', async () => {
    const resposta = await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.ownerA.cookie,
    );

    expect(resposta.status).toBe(200);

    // A linha fica: Inquiry, Deal e Visit apontam para ela.
    const noBanco = await prisma.property.findUniqueOrThrow({
      where: { id: cenario.imovelDeA1 },
      select: { deletedAt: true },
    });

    expect(noBanco.deletedAt).not.toBeNull();
  });

  it('o imóvel excluído sai da listagem e responde 404 por ID direto', async () => {
    await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.ownerA.cookie,
    );

    const lista = await obter('/imoveis', cenario.ownerA.cookie);
    const corpo = (await lista.json()) as {
      imoveis: RespostaDeImovel[];
      total: number;
    };

    expect(corpo.total).toBe(1);
    expect(corpo.imoveis.map((i) => i.codigo)).toEqual(['A-002']);

    const porId = await obter(
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.ownerA.cookie,
    );

    expect(porId.status).toBe(404);
  });

  it('excluir duas vezes responde 404 na segunda', async () => {
    const caminho = `/imoveis/${cenario.imovelDeA1}`;

    await enviar('DELETE', caminho, cenario.ownerA.cookie);
    const segunda = await enviar('DELETE', caminho, cenario.ownerA.cookie);

    expect(segunda.status).toBe(404);
  });
});

describe('A13 — auditoria de escrita', () => {
  async function auditoriaDe(entityId: string) {
    return prisma.activity.findMany({
      where: { entityId },
      select: {
        action: true,
        entityType: true,
        organizationId: true,
        actorMembershipId: true,
        metadata: true,
        ipHash: true,
      },
    });
  }

  it('o cadastro gera Activity apontando para o Membership', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);
    const linhas = await auditoriaDe(imovel.id);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].action).toBe('imovel.criado');
    expect(linhas[0].entityType).toBe('Property');
    expect(linhas[0].organizationId).toBe(cenario.organizacaoA);
    // Aponta para o Membership, nunca para o User: quem agiu, agiu naquele
    // papel e naquela organização.
    expect(linhas[0].actorMembershipId).toBe(cenario.agenteA1.membershipId);
    expect(linhas[0].metadata).toMatchObject({
      codigo: 'AP-001',
      codigoInformado: false,
    });
  });

  it('a edição registra quais campos mudaram, não os valores', async () => {
    await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.agenteA1.cookie,
      { titulo: 'Novo titulo', dormitorios: 3 },
    );

    const linhas = await auditoriaDe(cenario.imovelDeA1);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].action).toBe('imovel.editado');
    // Os nomes, não o conteúdo: o log diz o que mudou sem virar uma segunda
    // cópia do cadastro.
    expect(linhas[0].metadata).toEqual({ campos: 'dormitorios,titulo' });
  });

  it('a exclusão registra o código do imóvel', async () => {
    await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA1}`,
      cenario.ownerA.cookie,
    );

    const linhas = await auditoriaDe(cenario.imovelDeA1);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].action).toBe('imovel.excluido');
    expect(linhas[0].metadata).toEqual({ codigo: 'A-001' });
  });

  it('a tentativa recusada não gera Activity', async () => {
    await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA2}`,
      cenario.agenteA1.cookie,
      { titulo: 'Nao deveria passar' },
    );

    expect(await auditoriaDe(cenario.imovelDeA2)).toHaveLength(0);
  });

  it('o cadastro recusado por preço não deixa imóvel nem Activity', async () => {
    const antes = await prisma.property.count();

    const resposta = await criar(cenario.agenteA1.cookie, {
      finalidade: 'BOTH',
    });

    expect(resposta.status).toBe(400);
    expect(await prisma.property.count()).toBe(antes);
    expect(await prisma.activity.count()).toBe(0);
  });

  it('o IP vai hasheado, nunca em claro', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);
    const linhas = await auditoriaDe(imovel.id);

    expect(linhas[0].ipHash).not.toBeNull();
    expect(linhas[0].ipHash).not.toContain('127.0.0.1');
    expect(linhas[0].ipHash).not.toContain('::1');
  });

  it('nenhum endpoint de imóvel permite editar o log', async () => {
    const imovel = await criarEObter(cenario.agenteA1.cookie);
    const [linha] = await auditoriaDe(imovel.id);

    // `auditoria:editarLog` é false para TODOS os papéis, inclusive o OWNER:
    // log que o administrador edita não prova nada. A verificação aqui é de
    // superfície — não existe rota que escreva em Activity.
    expect(linha.action).toBe('imovel.criado');

    const total = await prisma.activity.count();
    await enviar('PATCH', `/imoveis/${imovel.id}`, cenario.agenteA1.cookie, {
      titulo: 'Outra coisa',
    });

    // A edição ACRESCENTA uma linha; nunca altera a anterior.
    expect(await prisma.activity.count()).toBe(total + 1);
    const depois = await auditoriaDe(imovel.id);
    expect(depois.map((l) => l.action).sort()).toEqual([
      'imovel.criado',
      'imovel.editado',
    ]);
  });
});
