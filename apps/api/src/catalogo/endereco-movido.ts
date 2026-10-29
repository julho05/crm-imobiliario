import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * 308 — a vitrine mudou de endereço (item **C3**).
 *
 * Lançada pelo `CatalogoService` quando o slug pedido está no histórico de uma
 * organização ativa. Carrega o slug atual, que vira o cabeçalho `Location` e
 * também vai no corpo: o site lê o corpo para montar o endereço **da página**
 * (`/o/novo/...`), que não é o endereço da API.
 *
 * ## 308, e não 301
 *
 * Decisão de 29/10/2026. Os dois são permanentes, e o robô de busca os trata
 * igual. O 308 preserva o método: o envio do formulário de interesse feito de
 * uma página aberta antes da troca continua sendo um `POST` no endereço novo,
 * em vez de virar um `GET` sem corpo. E é o que o Next emite do lado do site.
 */
export class EnderecoMovido extends HttpException {
  constructor(readonly slugAtual: string) {
    super(
      { mensagem: 'Este endereco mudou.', slugAtual },
      HttpStatus.PERMANENT_REDIRECT,
    );
  }
}

/**
 * Escreve o `Location` trocando só o segmento do slug — o resto do caminho e a
 * consulta (filtros, página) seguem iguais.
 */
@Catch(EnderecoMovido)
export class FiltroDeEnderecoMovido implements ExceptionFilter {
  catch(excecao: EnderecoMovido, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const requisicao = contexto.getRequest<Request>();
    const resposta = contexto.getResponse<Response>();

    resposta
      .status(excecao.getStatus())
      .setHeader(
        'Location',
        requisicao.originalUrl.replace(
          /^(.*?\/publico\/organizacoes\/)[^/?]+/,
          `$1${excecao.slugAtual}`,
        ),
      )
      .json(excecao.getResponse());
  }
}
