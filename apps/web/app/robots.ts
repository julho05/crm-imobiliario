import type { MetadataRoute } from 'next';

/**
 * `/robots.txt` — item **C7**.
 *
 * O robô de busca só tem o que fazer na vitrine (`/o/`). O painel exige sessão
 * e responderia a ele com a tela de entrada; as telas de conta não são
 * conteúdo; a API é JSON.
 *
 * `Disallow` não é proteção — quem quiser lê a lista e visita do mesmo jeito.
 * É só para o índice não se encher de telas de login.
 *
 * ## Sem sitemap, por decisão de 29/10/2026
 *
 * Um sitemap global listaria todas as organizações clientes, e qualquer
 * concorrente leria a carteira da plataforma. O robô chega aos anúncios pelos
 * links da vitrine.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/o/',
      disallow: [
        '/painel',
        '/api/',
        '/entrar',
        '/cadastro',
        '/recuperar-senha',
        '/redefinir-senha',
        '/convite',
      ],
    },
  };
}
