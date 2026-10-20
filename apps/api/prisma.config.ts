import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Duas mudancas do Prisma 7 que obrigam este arquivo a existir:
//   1. `url` saiu do bloco `datasource` do schema. A URL de conexao usada
//      pelo Migrate mora aqui.
//   2. A CLI nao le mais o .env sozinha. Carregamos na mao, e da raiz do
//      monorepo, nao de apps/api.
loadEnv({ path: resolve(__dirname, '../../.env') });

// Opcional. So o "migrate diff --from-migrations" exige um shadow database
// explicito; o "migrate dev" cria e descarta o seu sozinho. Quem nao definir
// a variavel continua com o fluxo normal funcionando.
//
// O nome do banco precisa casar com o padrao `prisma_migrate_shadow_db%`,
// unico em que o usuario de desenvolvimento tem permissao de criar
// (ver docker/mysql/init/01-shadow-db.sh).
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
