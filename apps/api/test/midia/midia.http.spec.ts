/**
 * Item **B4**: fotos e documentos do imóvel.
 *
 * ## O que este arquivo existe para pegar
 *
 * A URL assinada é a parte do fluxo em que o erro não aparece como erro. Um
 * upload que funciona não prova nada sobre o que ele **recusa** — e é o que ele
 * recusa que impede alguém de gravar na chave de outra organização, de subir um
 * executável com uma URL pedida para JPEG, ou de reaproveitar amanhã um link
 * copiado de um log hoje.
 *
 * Por isso os casos aqui são, em ordem de importância:
 *
 * 1. a assinatura só é emitida **depois** da autorização;
 * 2. a chave devolvida pelo cliente é conferida contra a organização e o imóvel;
 * 3. o receptor recusa token alterado, tipo diferente do assinado e arquivo
 *    maior do que o autorizado;
 * 4. a capa é única, nasce sozinha, nunca é documento e não desaparece.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
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

type Midia = {
  id: string;
  kind: string;
  url: string;
  posicao: number;
  ehCapa: boolean;
  textoAlternativo: string | null;
  contentType: string | null;
};

type Autorizacao = {
  objectKey: string;
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  expiraEm: string;
};

/** Um JPEG mínimo de verdade: os dois bytes que o abrem e o que os fecha. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

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

function pedirUrl(
  cookie: string,
  imovelId: string,
  corpo: Record<string, unknown> = {},
) {
  return enviar('POST', `/imoveis/${imovelId}/midia/url-de-upload`, cookie, {
    kind: 'PHOTO',
    contentType: 'image/jpeg',
    tamanhoEmBytes: JPEG.length,
    ...corpo,
  });
}

/**
 * O caminho completo do navegador: pede a URL, envia o arquivo **para a URL
 * assinada** e registra. É o fluxo real, e não um atalho que grava direto no
 * banco — o atalho deixaria a assinatura sem exercício.
 */
async function subirFoto(
  cookie: string,
  imovelId: string,
  corpo: Record<string, unknown> = {},
): Promise<Midia> {
  const resposta = await pedirUrl(cookie, imovelId, corpo);

  expect(resposta.status).toBe(200);

  const autorizacao = (await resposta.json()) as Autorizacao;

  const envio = await fetch(autorizacao.url, {
    method: autorizacao.metodo,
    headers: autorizacao.cabecalhos,
    body: new Uint8Array(JPEG),
  });

  expect(envio.status).toBe(200);

  const registro = await enviar('POST', `/imoveis/${imovelId}/midia`, cookie, {
    objectKey: autorizacao.objectKey,
    kind: 'PHOTO',
    contentType: 'image/jpeg',
    tamanhoEmBytes: JPEG.length,
    ...corpo,
  });

  expect(registro.status).toBe(201);

  return (await registro.json()) as Midia;
}

async function listar(cookie: string, imovelId: string): Promise<Midia[]> {
  const resposta = await obter(`/imoveis/${imovelId}/midia`, cookie);

  expect(resposta.status).toBe(200);

  return ((await resposta.json()) as { midias: Midia[] }).midias;
}

beforeAll(async () => {
  prisma = criarClienteDeTeste();
  app = await subirAppDeTeste();
});

afterAll(async () => {
  await app.encerrar();
  await prisma.$disconnect();

  // Os arquivos que os testes gravaram. O adaptador local escreve de verdade,
  // e deixar o lixo acumulado faria a pasta crescer a cada execucao.
  await rm(resolve(process.env.MIDIA_DIR ?? '.midia-dev', 'organizacoes'), {
    recursive: true,
    force: true,
  });
});

beforeEach(async () => {
  await limparBanco(prisma);
  cenario = await montarCenario(prisma);
});

describe('a URL assinada so sai depois da autorizacao', () => {
  it('recusa sem sessao', async () => {
    const resposta = await enviar(
      'POST',
      `/imoveis/${cenario.imovelDeA1}/midia/url-de-upload`,
      undefined,
      { kind: 'PHOTO', contentType: 'image/jpeg', tamanhoEmBytes: 10 },
    );

    expect(resposta.status).toBe(401);
  });

  it('o corretor assina para o imovel dele', async () => {
    const resposta = await pedirUrl(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );

    expect(resposta.status).toBe(200);

    const autorizacao = (await resposta.json()) as Autorizacao;

    expect(autorizacao.objectKey).toContain(
      `organizacoes/${cenario.organizacaoA}/imoveis/${cenario.imovelDeA1}/`,
    );
    // A chave termina em um identificador aleatorio, e nao em algo
    // adivinhavel: conhecer a chave e poder ler o objeto.
    expect(autorizacao.objectKey).not.toContain('foto-1');
    expect(autorizacao.cabecalhos['content-type']).toBe('image/jpeg');
    expect(new Date(autorizacao.expiraEm).getTime()).toBeGreaterThan(
      Date.now(),
    );
    // Validade curta: dez minutos, nao um dia.
    expect(new Date(autorizacao.expiraEm).getTime()).toBeLessThan(
      Date.now() + 15 * 60 * 1000,
    );
  });

  it('o corretor NAO assina para o imovel do colega, e recebe 403', async () => {
    // 403 e nao 404: `imovel:ver` e `ORG` para o AGENT, entao ele esta vendo
    // aquele imovel na tela. Esconder a existencia do que ele acabou de ler
    // seria teatro.
    const resposta = await pedirUrl(
      cenario.agenteA1.cookie,
      cenario.imovelDeA2,
    );

    expect(resposta.status).toBe(403);
  });

  it('o gerente assina para qualquer imovel da casa', async () => {
    expect(
      (await pedirUrl(cenario.managerA.cookie, cenario.imovelDeA2)).status,
    ).toBe(200);
  });

  it('imovel de outra organizacao responde 404', async () => {
    expect(
      (await pedirUrl(cenario.ownerA.cookie, cenario.imovelDeB)).status,
    ).toBe(404);
  });

  it('recusa tipo de arquivo que nao e aceito', async () => {
    const resposta = await pedirUrl(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
      {
        contentType: 'application/x-msdownload',
      },
    );

    expect(resposta.status).toBe(400);
  });

  it('recusa arquivo maior que o limite antes de assinar', async () => {
    const resposta = await pedirUrl(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
      {
        tamanhoEmBytes: 9 * 1024 * 1024,
      },
    );

    expect(resposta.status).toBe(400);
  });

  it('PDF nao e aceito como foto, e e aceito como documento', async () => {
    expect(
      (
        await pedirUrl(cenario.agenteA1.cookie, cenario.imovelDeA1, {
          kind: 'PHOTO',
          contentType: 'application/pdf',
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await pedirUrl(cenario.agenteA1.cookie, cenario.imovelDeA1, {
          kind: 'DOCUMENT',
          contentType: 'application/pdf',
        })
      ).status,
    ).toBe(200);
  });
});

describe('o receptor do armazenamento confere a assinatura', () => {
  it('aceita o envio autorizado', async () => {
    const midia = await subirFoto(cenario.agenteA1.cookie, cenario.imovelDeA1);

    expect(midia.contentType).toBe('image/jpeg');

    // E o arquivo volta pela URL de leitura, que tambem e assinada.
    const leitura = await fetch(midia.url);

    expect(leitura.status).toBe(200);
    expect(leitura.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await leitura.arrayBuffer())).toEqual(JPEG);
  });

  it('recusa token alterado', async () => {
    const resposta = await pedirUrl(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );
    const autorizacao = (await resposta.json()) as Autorizacao;

    // Troca um caractere da assinatura. A chave e o prazo continuam os
    // mesmos; o que muda e a prova de que a API os emitiu.
    const url = new URL(autorizacao.url);
    const token = url.searchParams.get('token')!;
    url.searchParams.set(
      'token',
      token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'),
    );

    const envio = await fetch(url.toString(), {
      method: 'PUT',
      headers: autorizacao.cabecalhos,
      body: new Uint8Array(JPEG),
    });

    expect(envio.status).toBe(403);
  });

  it('recusa sem token nenhum', async () => {
    const envio = await fetch(`${app.url}/api/midia-local/enviar`, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: new Uint8Array(JPEG),
    });

    expect(envio.status).toBe(403);
  });

  it('recusa tipo diferente do que foi assinado', async () => {
    const resposta = await pedirUrl(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );
    const autorizacao = (await resposta.json()) as Autorizacao;

    // A URL foi pedida para JPEG. Isto e o que impede que ela sirva para
    // subir qualquer outra coisa.
    const envio = await fetch(autorizacao.url, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
      body: new Uint8Array(JPEG),
    });

    expect(envio.status).toBe(400);
  });

  it('recusa arquivo maior do que o autorizado', async () => {
    const resposta = await pedirUrl(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
      {
        tamanhoEmBytes: JPEG.length,
      },
    );
    const autorizacao = (await resposta.json()) as Autorizacao;

    const envio = await fetch(autorizacao.url, {
      method: 'PUT',
      headers: autorizacao.cabecalhos,
      body: new Uint8Array(Buffer.alloc(JPEG.length + 5000, 1)),
    });

    expect(envio.status).toBe(413);
  });

  it('a URL de leitura recusada nao entrega o arquivo', async () => {
    const midia = await subirFoto(cenario.agenteA1.cookie, cenario.imovelDeA1);

    const url = new URL(midia.url);
    url.searchParams.set('token', 'invalido.invalido');

    expect((await fetch(url.toString())).status).toBe(403);
  });
});

describe('a chave devolvida pelo cliente e conferida', () => {
  it('recusa chave de outra organizacao', async () => {
    // O cenario: alguem da organizacao B pede uma URL para o imovel dele, e
    // tenta registrar essa chave no imovel de A. Sem a conferencia de
    // prefixo, a resposta de A passaria a servir um objeto de B.
    const deB = await pedirUrl(cenario.ownerB.cookie, cenario.imovelDeB);
    const autorizacaoDeB = (await deB.json()) as Autorizacao;

    const resposta = await enviar(
      'POST',
      `/imoveis/${cenario.imovelDeA1}/midia`,
      cenario.agenteA1.cookie,
      {
        objectKey: autorizacaoDeB.objectKey,
        kind: 'PHOTO',
        contentType: 'image/jpeg',
        tamanhoEmBytes: JPEG.length,
      },
    );

    expect(resposta.status).toBe(404);
  });

  it('recusa chave de outro imovel da mesma organizacao', async () => {
    const doOutro = await pedirUrl(cenario.managerA.cookie, cenario.imovelDeA2);
    const autorizacao = (await doOutro.json()) as Autorizacao;

    const resposta = await enviar(
      'POST',
      `/imoveis/${cenario.imovelDeA1}/midia`,
      cenario.managerA.cookie,
      {
        objectKey: autorizacao.objectKey,
        kind: 'PHOTO',
        contentType: 'image/jpeg',
        tamanhoEmBytes: JPEG.length,
      },
    );

    expect(resposta.status).toBe(404);
  });

  it('recusa travessia de diretorio na chave', async () => {
    const resposta = await enviar(
      'POST',
      `/imoveis/${cenario.imovelDeA1}/midia`,
      cenario.agenteA1.cookie,
      {
        objectKey:
          `organizacoes/${cenario.organizacaoA}/imoveis/` +
          `${cenario.imovelDeA1}/../../../../etc/passwd`,
        kind: 'PHOTO',
        contentType: 'image/jpeg',
        tamanhoEmBytes: JPEG.length,
      },
    );

    expect(resposta.status).toBe(404);
  });
});

describe('capa', () => {
  it('a primeira foto vira capa sozinha', async () => {
    const primeira = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );

    expect(primeira.ehCapa).toBe(true);
  });

  it('a segunda nao rouba a capa', async () => {
    await subirFoto(cenario.agenteA1.cookie, cenario.imovelDeA1);
    const segunda = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );

    expect(segunda.ehCapa).toBe(false);
  });

  it('definir capa deixa exatamente uma', async () => {
    const primeira = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );
    const segunda = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );

    const resposta = await enviar(
      'POST',
      `/imoveis/${cenario.imovelDeA1}/midia/${segunda.id}/capa`,
      cenario.agenteA1.cookie,
    );

    expect(resposta.status).toBe(200);

    const midias = await listar(cenario.agenteA1.cookie, cenario.imovelDeA1);
    const capas = midias.filter((m) => m.ehCapa);

    expect(capas).toHaveLength(1);
    expect(capas[0].id).toBe(segunda.id);
    expect(midias.find((m) => m.id === primeira.id)?.ehCapa).toBe(false);
  });

  it('documento nunca e capa — nem sozinho, nem por escolha', async () => {
    // Sozinho: subir so um documento nao cria capa, porque documento nao
    // aparece no catalogo. Imovel com "capa" que ninguem pode ver seria pior
    // do que imovel sem capa.
    const autorizacao = (await (
      await pedirUrl(cenario.agenteA1.cookie, cenario.imovelDeA1, {
        kind: 'DOCUMENT',
        contentType: 'application/pdf',
      })
    ).json()) as Autorizacao;

    await fetch(autorizacao.url, {
      method: 'PUT',
      headers: autorizacao.cabecalhos,
      body: new Uint8Array(JPEG),
    });

    const registro = await enviar(
      'POST',
      `/imoveis/${cenario.imovelDeA1}/midia`,
      cenario.agenteA1.cookie,
      {
        objectKey: autorizacao.objectKey,
        kind: 'DOCUMENT',
        contentType: 'application/pdf',
        tamanhoEmBytes: JPEG.length,
      },
    );

    const documento = (await registro.json()) as Midia;

    expect(documento.ehCapa).toBe(false);

    // Por escolha: a rota recusa.
    const tentativa = await enviar(
      'POST',
      `/imoveis/${cenario.imovelDeA1}/midia/${documento.id}/capa`,
      cenario.agenteA1.cookie,
    );

    expect(tentativa.status).toBe(400);
  });

  it('remover a capa promove a proxima foto', async () => {
    const primeira = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );
    const segunda = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );

    expect(primeira.ehCapa).toBe(true);

    const remocao = await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA1}/midia/${primeira.id}`,
      cenario.agenteA1.cookie,
    );

    expect(remocao.status).toBe(204);

    const midias = await listar(cenario.agenteA1.cookie, cenario.imovelDeA1);

    expect(midias).toHaveLength(1);
    // Sem isto, o imovel ficaria sem capa e ninguem se lembraria de voltar
    // para marcar outra.
    expect(midias[0].id).toBe(segunda.id);
    expect(midias[0].ehCapa).toBe(true);
  });
});

describe('ordem, limite e edicao', () => {
  it('a ordem recebida e aplicada', async () => {
    const primeira = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );
    const segunda = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );
    const terceira = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );

    const resposta = await enviar(
      'POST',
      `/imoveis/${cenario.imovelDeA1}/midia/ordem`,
      cenario.agenteA1.cookie,
      { ids: [terceira.id, primeira.id, segunda.id] },
    );

    expect(resposta.status).toBe(200);

    const midias = ((await resposta.json()) as { midias: Midia[] }).midias;

    expect(midias.map((m) => m.id)).toEqual([
      terceira.id,
      primeira.id,
      segunda.id,
    ]);
    expect(midias.map((m) => m.posicao)).toEqual([0, 1, 2]);
  });

  it('recusa ordem parcial ou com id estranho', async () => {
    const primeira = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );
    await subirFoto(cenario.agenteA1.cookie, cenario.imovelDeA1);

    // Parcial: deixaria midia fora da ordem.
    expect(
      (
        await enviar(
          'POST',
          `/imoveis/${cenario.imovelDeA1}/midia/ordem`,
          cenario.agenteA1.cookie,
          { ids: [primeira.id] },
        )
      ).status,
    ).toBe(400);

    // Id de midia de outro imovel.
    const deOutro = await subirFoto(
      cenario.managerA.cookie,
      cenario.imovelDeA2,
    );

    expect(
      (
        await enviar(
          'POST',
          `/imoveis/${cenario.imovelDeA1}/midia/ordem`,
          cenario.agenteA1.cookie,
          { ids: [primeira.id, deOutro.id] },
        )
      ).status,
    ).toBe(400);
  });

  it('recusa a vigesima primeira midia', async () => {
    // Direto no banco: vinte voltas pelo fluxo completo custariam tempo de
    // suite para provar o que uma contagem prova.
    await prisma.propertyMedia.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        organizationId: cenario.organizacaoA,
        propertyId: cenario.imovelDeA1,
        objectKey: `organizacoes/${cenario.organizacaoA}/imoveis/${cenario.imovelDeA1}/x${i}.jpg`,
        kind: 'PHOTO' as const,
        position: i,
        isCover: i === 0,
      })),
    });

    const resposta = await pedirUrl(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );

    expect(resposta.status).toBe(400);
    // `message`, e nao `mensagem`: a convencao do projeto e corpo `{mensagem,
    // erros}` so para erro **de campo**, do ZodValidationPipe. Mensagem geral
    // sai no formato padrao do Nest.
    expect(((await resposta.json()) as { message: string }).message).toContain(
      '20',
    );
  });

  it('edita o texto alternativo, que e o unico campo editavel', async () => {
    const midia = await subirFoto(cenario.agenteA1.cookie, cenario.imovelDeA1);

    const resposta = await enviar(
      'PATCH',
      `/imoveis/${cenario.imovelDeA1}/midia/${midia.id}`,
      cenario.agenteA1.cookie,
      { textoAlternativo: 'Sala de estar com vista para o parque' },
    );

    expect(resposta.status).toBe(200);
    expect(((await resposta.json()) as Midia).textoAlternativo).toBe(
      'Sala de estar com vista para o parque',
    );
  });
});

describe('isolamento e leitura', () => {
  it('o corretor LE a midia do imovel do colega', async () => {
    // `imovel:ver` e `ORG` para os quatro papeis: o corretor precisa ver as
    // fotos de qualquer imovel da casa para oferece-lo ao cliente dele.
    await subirFoto(cenario.managerA.cookie, cenario.imovelDeA2);

    const midias = await listar(cenario.agenteA1.cookie, cenario.imovelDeA2);

    expect(midias).toHaveLength(1);
  });

  it('a midia de outra organizacao responde 404 na listagem', async () => {
    await subirFoto(cenario.ownerB.cookie, cenario.imovelDeB);

    expect(
      (
        await obter(
          `/imoveis/${cenario.imovelDeB}/midia`,
          cenario.ownerA.cookie,
        )
      ).status,
    ).toBe(404);
  });

  it('nao da para apagar midia passando o id dela em outro imovel', async () => {
    const deB = await subirFoto(cenario.ownerB.cookie, cenario.imovelDeB);

    // O imovel do caminho e de A, e quem pede e de A: a autorizacao passa. O
    // que impede o estrago e o `propertyId` no `where` da midia.
    const resposta = await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA1}/midia/${deB.id}`,
      cenario.ownerA.cookie,
    );

    expect(resposta.status).toBe(404);

    expect(await prisma.propertyMedia.count({ where: { id: deB.id } })).toBe(1);
  });
});

describe('auditoria', () => {
  it('registra adicao, capa e remocao', async () => {
    const primeira = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );
    const segunda = await subirFoto(
      cenario.agenteA1.cookie,
      cenario.imovelDeA1,
    );

    await enviar(
      'POST',
      `/imoveis/${cenario.imovelDeA1}/midia/${segunda.id}/capa`,
      cenario.agenteA1.cookie,
    );
    await enviar(
      'DELETE',
      `/imoveis/${cenario.imovelDeA1}/midia/${primeira.id}`,
      cenario.agenteA1.cookie,
    );

    const eventos = await prisma.activity.findMany({
      where: { entityType: 'Property', entityId: cenario.imovelDeA1 },
      select: { action: true, metadata: true },
      orderBy: { createdAt: 'asc' },
    });

    expect(eventos.map((e) => e.action)).toEqual([
      'imovel.midiaAdicionada',
      'imovel.midiaAdicionada',
      'imovel.capaDefinida',
      'imovel.midiaRemovida',
    ]);

    // A chave do objeto **nao** vai para a auditoria: ela e o endereco do
    // arquivo, e o log e lido por mais gente do que quem pode abrir a foto.
    expect(JSON.stringify(eventos)).not.toContain('organizacoes/');
  });
});
