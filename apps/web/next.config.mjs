import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// O .env fica na raiz do monorepo, nao dentro de apps/web.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../.env') });

// Onde a API responde. Em producao, se site e API ficarem no mesmo processo
// de hospedagem, continua apontando para a porta interna.
const destinoDaApi = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3333';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Mesmo dominio para site e API (decisao de 20/10/2026).
  //
  // O navegador sempre fala com a propria origem do site, e o Next repassa
  // para a API. Dois ganhos concretos:
  //
  //   1. Sem CORS. Nao ha requisicao entre origens para o navegador barrar.
  //   2. O cookie de sessao funciona com `SameSite=Lax`, que corta CSRF.
  //      Em dominios separados seria obrigatorio `SameSite=None`, que o
  //      navegador envia em requisicao de terceiro.
  //
  // Sem isto, o desenvolvimento (site na 3000, API na 3333) seria entre
  // origens e se comportaria diferente da producao — e divergencia entre
  // ambientes aparece como defeito justamente no deploy.
  async rewrites() {
    return [
      {
        source: '/api/:caminho*',
        destination: `${destinoDaApi}/api/:caminho*`,
      },
    ];
  },
};

export default nextConfig;
