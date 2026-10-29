/**
 * Contratos compartilhados entre a API (NestJS) e o site (Next.js).
 *
 * ## Regra de dependencia
 *
 * Este pacote **nao importa nada de `apps/`**. A seta aponta sempre no mesmo
 * sentido: `apps/api` e `apps/web` dependem de `@app/shared`, e nunca o
 * contrario. E o que torna o ciclo impossivel por construcao, em vez de
 * depender de disciplina.
 *
 * Consequencia pratica: nada aqui pode importar o client do Prisma, que vive
 * dentro de `apps/api/src/generated/`. A paridade entre estes enums e o
 * schema do Prisma e garantida por teste, nao por importacao.
 *
 * ## O que entra
 *
 * Enums com uso na interface, rotulos em portugues, primitivos de validacao e
 * schemas de entrada que front e back usam **os mesmos**. Regra de negocio
 * que dependa de banco ou de permissao nao entra: isso e do servidor.
 */

export * from './enums';
export * from './permissoes';
export * from './rotulos';
export * from './primitivos';
export * from './aviso-de-privacidade';
export * from './schemas/autenticacao';
export * from './schemas/captura-de-lead';
export * from './schemas/catalogo';
export * from './schemas/imovel';
export * from './schemas/lead';
export * from './schemas/negociacao';
export * from './schemas/agenda';
export * from './schemas/painel';
export * from './schemas/midia';
