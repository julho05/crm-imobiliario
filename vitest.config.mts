import { config as carregarEnv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// A CLI do Vitest nao le .env sozinha. Carregamos aqui para que
// TEST_DATABASE_URL e IP_HASH_SECRET existam nos testes de integracao.
carregarEnv({ path: resolve(import.meta.dirname, '.env') });

// Uma configuracao para o monorepo inteiro. Os testes ficam ao lado do que
// testam (*.spec.ts) ou em apps/*/test.
export default defineConfig({
  test: {
    include: ['apps/**/*.spec.ts', 'packages/**/*.spec.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'apps/api/src/generated/**',
    ],
    environment: 'node',

    // Aplica as migrations no banco de teste antes de tudo.
    globalSetup: ['apps/api/test/apoio/setup-global.ts'],

    // Os testes de integracao compartilham um banco so. Rodando em paralelo,
    // a limpeza de um caso apagaria os dados de outro no meio do caminho.
    // Arquivos em sequencia; dentro de cada arquivo os casos ja sao sequenciais.
    //
    // Quando a suite crescer, o caminho e um banco por worker — nao voltar a
    // paralelizar sobre o mesmo banco.
    fileParallelism: false,

    // O hash Argon2id custa de proposito, e o cadastro gera um por chamada.
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // Sem testes ainda nao e motivo para o comando falhar.
    passWithNoTests: true,
  },
});
