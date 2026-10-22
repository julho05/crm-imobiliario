import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ArmazenamentoLocal } from './armazenamento-local';

/**
 * O armazenamento de desenvolvimento, do lado de dentro.
 *
 * ## Estas rotas existem **somente** com `MIDIA_PROVIDER=local`
 *
 * Elas são o bucket. Em produção o bucket é o R2, com domínio próprio, e o
 * `MidiaModule` nem registra este controller — a decisão está lá, na montagem
 * do módulo, e não num `if` espalhado por aqui.
 *
 * ## Por que não há guarda de sessão
 *
 * Porque a URL assinada **é** a autorização, e isso não é descuido: é a forma
 * do mecanismo que o item B4 precisa provar. No R2 o envio vai direto do
 * navegador para a Cloudflare, onde o cookie de sessão não existe nem chega —
 * quem autoriza é a assinatura que a API gerou depois de conferir a permissão.
 *
 * Um receptor que exigisse sessão aqui testaria um fluxo que não é o de
 * produção, e deixaria a assinatura sem exercício nenhum.
 *
 * O que a assinatura carrega: a chave, o tipo, o tamanho máximo e o prazo.
 * Trocar qualquer um invalida o token, e o envio é recusado.
 */
@Controller('midia-local')
export class MidiaLocalController {
  constructor(private readonly armazenamento: ArmazenamentoLocal) {}

  /**
   * Recebe o arquivo.
   *
   * O corpo é lido do fluxo à mão porque o analisador de corpo do Nest trata
   * JSON e formulários, e deixa passar `image/jpeg` e `application/pdf` sem
   * consumir — o que aqui é exatamente o que se quer. Ler com teto é o que
   * impede que um envio de 2 GB ocupe a memória do processo.
   */
  @Put('enviar')
  @HttpCode(200)
  async enviar(
    @Query('token') token: string,
    @Headers('content-type') contentType: string | undefined,
    @Req() requisicao: Request,
    @Res() resposta: Response,
  ) {
    const carga = this.armazenamento.conferir(token, 'u');

    if (!carga) {
      // 403, e nao 401: nao ha sessao a renovar. O que falhou foi a
      // assinatura — expirada, alterada ou inexistente.
      resposta.status(403).json({ mensagem: 'Autorizacao de envio invalida.' });
      return;
    }

    if (contentType !== carga.t) {
      // O tipo faz parte do que foi assinado. Sem esta conferencia, uma URL
      // pedida para JPEG serviria para subir qualquer coisa.
      resposta
        .status(400)
        .json({ mensagem: 'O tipo do arquivo nao e o que foi autorizado.' });
      return;
    }

    let conteudo: Buffer;

    try {
      conteudo = await lerCorpo(requisicao, carga.b);
    } catch {
      resposta
        .status(413)
        .json({ mensagem: 'Arquivo maior do que o autorizado.' });
      return;
    }

    await this.armazenamento.gravar(carga.k, conteudo, carga.t);

    resposta.status(200).json({ ok: true });
  }

  /** Serve o arquivo, também por URL assinada. */
  @Get('objeto')
  async objeto(@Query('token') token: string, @Res() resposta: Response) {
    const carga = this.armazenamento.conferir(token, 'r');

    if (!carga) {
      resposta.status(403).json({ mensagem: 'Link expirado ou invalido.' });
      return;
    }

    const objeto = await this.armazenamento.ler(carga.k);

    if (!objeto) {
      resposta.status(404).json({ mensagem: 'Arquivo nao encontrado.' });
      return;
    }

    resposta
      .setHeader('content-type', objeto.contentType)
      // `private` porque a URL expira: cache compartilhado guardaria o objeto
      // alem da validade do link que o autorizou.
      .setHeader('cache-control', 'private, max-age=300')
      .send(objeto.conteudo);
  }
}

/**
 * Lê o corpo da requisição com teto de bytes.
 *
 * Rejeita assim que passa do limite, em vez de ler tudo e conferir no fim: ler
 * primeiro significaria aceitar na memória o arquivo que se pretende recusar.
 */
function lerCorpo(requisicao: Request, maximo: number): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    const partes: Buffer[] = [];
    let total = 0;
    let estourou = false;

    requisicao.on('data', (parte: Buffer) => {
      if (estourou) {
        return;
      }

      total += parte.length;

      if (total > maximo) {
        // Rejeita e **para de acumular**, mas nao destroi a requisicao: quem
        // chama precisa do canal vivo para responder 413. Destruir o fluxo
        // aqui derrubava a conexao antes da resposta, e o cliente recebia 500
        // em vez da recusa — errado de um jeito que parece defeito do
        // servidor, quando e o limite funcionando.
        estourou = true;
        partes.length = 0;
        rejeitar(new Error('Corpo maior do que o autorizado.'));
        return;
      }

      partes.push(parte);
    });

    requisicao.on('end', () => resolver(Buffer.concat(partes)));
    requisicao.on('error', rejeitar);
  });
}
