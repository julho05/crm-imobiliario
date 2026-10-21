// Config flat do ESLint 10, uma so para o monorepo.
//
// Escolha deliberada: regras "recommended" do typescript-eslint, sem as
// variantes que exigem informacao de tipo. As com tipo sao mais poderosas e
// bem mais lentas, e num projeto que ainda nao tem codigo de dominio o ganho
// nao paga o custo. Revisitar quando os modulos de negocio existirem.

import tseslint from 'typescript-eslint';
import nextPlugin from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      // Saida compilada do seed. Pasta separada do `dist/` de proposito: o
      // `nest build` apaga e recria aquele, e compartilhar faria um apagar o
      // outro (ver apps/api/prisma/tsconfig.json).
      '**/dist-seed/**',
      '**/.next/**',
      '**/coverage/**',
      // Gerado pelo Prisma: nao e nosso codigo e nao passa no lint.
      'apps/api/src/generated/**',
      // Gerado pelo Next a cada "next dev".
      '**/AGENTS.md',
      '**/next-env.d.ts',
    ],
  },

  // Base para todo TypeScript do monorepo.
  ...tseslint.configs.recommended,

  {
    rules: {
      // Variavel nao usada e erro, exceto prefixada com _ (padrao comum para
      // parametro exigido pela assinatura mas irrelevante).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Em codigo que vai lidar com permissao e multi-tenant, "any" apaga
      // justamente a verificacao que interessa.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Decoradores do NestJS exigem classes com propriedades sem inicializador.
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // Regras do Next apenas no app web.
  ...nextPlugin.map((config) => ({
    ...config,
    files: ['apps/web/**/*.{ts,tsx}'],
  })),

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      // Regra do Pages Router: procura uma pasta "pages" que o App Router
      // nao tem, e avisa a cada execucao. Nao se aplica a este projeto.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // Por ultimo: desliga o que conflita com o Prettier.
  prettier,
);
