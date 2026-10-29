import type { INestApplication } from '@nestjs/common';
import { FiltroDeLimiteAtingido } from './limite/limite-atingido';

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
  //
  // Desde o A11 isto tambem decide o limite de tentativas, e erra dos dois
  // lados: com saltos de menos, todo visitante aparece com o IP do proxy e
  // todos se bloqueiam juntos; com saltos de mais — ou sem proxy na frente —,
  // qualquer um forja `X-Forwarded-For` e escapa do limite.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  // 429 com `Retry-After` (A11). A excecao HTTP do Nest nao carrega cabecalho.
  app.useGlobalFilters(new FiltroDeLimiteAtingido());
}
