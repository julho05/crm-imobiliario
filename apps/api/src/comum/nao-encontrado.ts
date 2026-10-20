import { NotFoundException } from '@nestjs/common';

/**
 * 404 com mensagem neutra, para o caso de travessia entre organizacoes.
 *
 * Classe propria para que o motivo fique explicito na leitura do codigo: nao e
 * "esqueci de tratar", e "este 404 e deliberado e nao deve virar 403".
 *
 * Ver [permissions.md](../../../../docs/permissions.md) §6: um 403 confirmaria
 * que o registro ou a organizacao existem, o que permite mapear a base de
 * clientes um identificador por vez. O 403 fica reservado para o caso em que o
 * vinculo existe e so o papel nao alcanca a acao — ai nao ha nada a esconder,
 * porque a pessoa ja sabe que a organizacao existe: ela trabalha nela.
 *
 * Mora em `comum/` porque dois caminhos diferentes precisam do **mesmo** corpo
 * de resposta: a guarda de autorizacao e a troca de organizacao ativa. Se as
 * mensagens divergissem, a diferenca entre elas voltaria a contar o que este
 * 404 existe para esconder.
 */
export class NaoEncontrado extends NotFoundException {
  constructor() {
    super('Nao encontrado.');
  }
}
