import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * 429 — limite de tentativas atingido (A11).
 *
 * Carrega quantos segundos faltam para liberar, que vira o cabecalho
 * `Retry-After`. A excecao HTTP do Nest nao carrega cabecalho, e por isso
 * existe o filtro abaixo.
 */
export class LimiteAtingido extends HttpException {
  constructor(readonly segundosParaLiberar: number) {
    super(
      { mensagem: mensagemDeEspera(segundosParaLiberar) },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Escreve o `Retry-After` e o corpo de sempre.
 *
 * Registrado em `configurarApp`, que e compartilhado com os testes — o
 * cabecalho que o teste confere e o mesmo que sai em producao.
 */
@Catch(LimiteAtingido)
export class FiltroDeLimiteAtingido implements ExceptionFilter {
  catch(excecao: LimiteAtingido, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();

    resposta
      .status(excecao.getStatus())
      .setHeader('Retry-After', String(excecao.segundosParaLiberar))
      .json(excecao.getResponse());
  }
}

/**
 * Em minutos, arredondado para cima: "tente em 0 minutos" nao ajuda ninguem.
 *
 * A mensagem nao diz qual limite estourou nem quantas tentativas restavam.
 * Quem testa senhas em sequencia nao precisa dessa ajuda para se calibrar.
 */
function mensagemDeEspera(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60));

  return `Muitas tentativas seguidas. Tente de novo em ${minutos} ${
    minutos === 1 ? 'minuto' : 'minutos'
  }.`;
}
