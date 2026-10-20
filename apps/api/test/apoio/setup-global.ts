import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { urlDoBancoDeTeste } from './banco-de-teste';

/**
 * Aplica as migrations no banco de teste, uma vez por execucao da suite.
 *
 * Usa `migrate deploy`, nunca `migrate dev`: o `dev` compara com o schema,
 * pode querer criar migration nova e usa shadow database. Em teste, o que se
 * quer e exatamente o que esta versionado em `prisma/migrations` — se o schema
 * e as migrations divergirem, quem deve reclamar e o `npm run db:drift`.
 *
 * Chama o CLI do Prisma pelo caminho do arquivo, com o proprio Node, em vez de
 * `npx` com `shell: true`. Shell ligado concatena argumentos sem escapar
 * (DEP0190 no Node), e tambem dependeria de resolucao de PATH diferente em
 * cada sistema.
 */
export default function setup() {
  const diretorioDaApi = resolve(import.meta.dirname, '../..');
  const require = createRequire(import.meta.url);
  const cliDoPrisma = require.resolve('prisma/build/index.js');

  execFileSync(process.execPath, [cliDoPrisma, 'migrate', 'deploy'], {
    cwd: diretorioDaApi,
    env: { ...process.env, DATABASE_URL: urlDoBancoDeTeste() },
    stdio: 'pipe',
  });
}
