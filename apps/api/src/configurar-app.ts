import type { INestApplication } from '@nestjs/common';

/**
 * Configuracao da aplicacao, compartilhada entre `main.ts` e os testes de HTTP.
 *
 * Existe para que o teste exercite **a mesma** configuracao que roda em
 * producao. Com o setup duplicado, o teste passaria com um prefixo de rota ou
 * um comportamento de proxy diferente do real — e o defeito apareceria so no
 * deploy, que e o pior momento para descobrir.
 */
export function configurarApp(app: INestApplication): void {
  // Todas as rotas sob /api. O Next repassa /api/* para ca, entao o caminho
  // e o mesmo visto do navegador e visto da API.
  app.setGlobalPrefix('api');

  // CORS foi REMOVIDO de proposito.
  //
  // Site e API ficam no mesmo dominio (decisao de 20/10/2026), e o navegador
  // conversa com a API atraves do rewrite do Next. Nao existe requisicao
  // entre origens para autorizar — e habilitar CORS com credenciais seria
  // abrir, sem necessidade, o caminho que o mesmo dominio fechou.
  //
  // Se algum dia a API precisar atender outra origem, isto volta, com lista
  // explicita de origens, nunca com reflexao do cabecalho Origin.

  // Confia no proxy para ler o IP real do cliente. Sem isto, req.ip devolve o
  // endereco do proxy e o hash de IP registrado perde sentido. O numero de
  // saltos precisa ser conferido contra a hospedagem na Fase 4.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
}
