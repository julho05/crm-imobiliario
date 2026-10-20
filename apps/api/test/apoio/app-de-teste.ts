import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  type Abstract,
  type INestApplication,
  type Type,
} from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/configurar-app';
import { urlDoBancoDeTeste } from './banco-de-teste';

/**
 * Sobe a aplicacao inteira, em porta aleatoria, apontada para o banco de teste.
 *
 * E a aplicacao de verdade — mesmo `AppModule`, mesmo `configurarApp`, mesmos
 * pipes e guardas. O que se quer provar aqui so existe no caminho HTTP
 * completo: os atributos do cookie, os codigos de status, o formato do erro de
 * validacao e o que **nao** aparece no corpo da resposta.
 *
 * Nao usa `@nestjs/testing` de proposito: nao precisamos substituir provedor
 * nenhum, e uma dependencia a menos.
 */
export type AppDeTeste = {
  url: string;
  encerrar: () => Promise<void>;
  /**
   * Pega um provedor do grafo da aplicacao.
   *
   * Usado para ler o adaptador de e-mail e recuperar o link que foi "enviado"
   * — e o unico jeito de testar convite, verificacao e recuperacao, porque o
   * banco guarda apenas o **hash** do token. Serve para **ler**, nao para
   * substituir: a aplicacao sob teste continua inteira.
   */
  provedor: <T>(token: Type<T> | Abstract<T>) => T;
};

/**
 * `modulosExtras` acrescenta modulos que existem **somente no teste** — o caso
 * das rotas que exercitam a guarda de autorizacao antes de haver rota de
 * recurso em producao. O `AppModule` continua inteiro no grafo: a ideia e
 * somar rotas a aplicacao real, nunca substituir parte dela por dublê.
 */
export async function subirAppDeTeste(
  modulosExtras: Type[] = [],
): Promise<AppDeTeste> {
  // Precisa vir antes da criacao do app: o PrismaService le DATABASE_URL no
  // construtor. Sem isto, os testes rodariam contra o banco de desenvolvimento.
  process.env.DATABASE_URL = urlDoBancoDeTeste();

  const raiz =
    modulosExtras.length > 0 ? comModulosExtras(modulosExtras) : AppModule;

  const app: INestApplication = await NestFactory.create(raiz, {
    // Sem os logs do Nest: a saida dos testes precisa mostrar falha de teste,
    // nao rotina de inicializacao.
    logger: false,
  });

  configurarApp(app);

  // Porta 0: o sistema escolhe uma livre. Porta fixa colidiria com a API que a
  // pessoa deixou rodando enquanto trabalhava.
  await app.listen(0);

  const endereco = app.getHttpServer().address();
  const porta =
    typeof endereco === 'object' && endereco !== null ? endereco.port : 0;

  return {
    url: `http://127.0.0.1:${porta}`,
    encerrar: () => app.close(),
    provedor: (token) => app.get(token),
  };
}

/**
 * Monta uma raiz que importa o `AppModule` e mais os modulos do teste.
 *
 * O decorador e aplicado como funcao porque a classe nasce aqui, em tempo de
 * execucao, e a lista de modulos so se conhece na chamada.
 */
function comModulosExtras(modulosExtras: Type[]): Type {
  class RaizDeTeste {}

  Module({ imports: [AppModule, ...modulosExtras] })(RaizDeTeste);

  return RaizDeTeste;
}

/** Extrai o valor de um cookie do cabecalho `Set-Cookie` da resposta. */
export function cookieDaResposta(
  resposta: Response,
  nome: string,
): { valor: string; atributos: string } | undefined {
  const cabecalhos = resposta.headers.getSetCookie();

  for (const bruto of cabecalhos) {
    const [par, ...resto] = bruto.split(';');
    const separador = par.indexOf('=');

    if (par.slice(0, separador).trim() === nome) {
      return {
        valor: par.slice(separador + 1),
        atributos: resto.join(';'),
      };
    }
  }

  return undefined;
}
