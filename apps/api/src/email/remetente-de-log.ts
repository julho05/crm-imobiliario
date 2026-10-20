import { Injectable, Logger } from '@nestjs/common';
import { RemetenteDeEmail, type Email } from './remetente-de-email';

/**
 * Adaptador de desenvolvimento: escreve o e-mail no log em vez de enviar.
 *
 * Serve para trabalhar nos fluxos de convite, verificacao e recuperacao sem
 * provedor contratado. Quem roda o projeto copia o link do terminal.
 *
 * ## Por que isto NAO pode subir em producao
 *
 * O corpo carrega o token em claro. Em producao, isso colocaria credencial de
 * uso unico no arquivo de log — que e copiado, agregado por ferramenta de
 * observabilidade e lido por mais gente do que a caixa de entrada da pessoa.
 * Um log vazado viraria convite e redefinicao de senha de qualquer um.
 *
 * O `EmailModule` recusa iniciar com este adaptador em producao. A protecao
 * fica **lá**, e nao so neste comentario, porque comentario nao impede deploy.
 */
/** Quantos e-mails ficam na memoria. O suficiente para inspecionar um fluxo. */
const LEMBRAR_OS_ULTIMOS = 20;

@Injectable()
export class RemetenteDeLog extends RemetenteDeEmail {
  private readonly logger = new Logger('Email');

  /**
   * Os ultimos e-mails "enviados", do mais recente para o mais antigo.
   *
   * Serve a duas coisas: pegar o link no teste sem raspar a saida do logger, e
   * inspecionar o ultimo convite durante o desenvolvimento sem rolar o
   * terminal. O token aparece aqui em claro — o que e aceitavel exatamente
   * porque este adaptador **nao sobe em producao**, e o `EmailModule` recusa
   * iniciar com ele lá.
   */
  readonly enviados: Email[] = [];

  /** O ultimo e-mail para um endereco, ou `undefined`. */
  ultimoPara(endereco: string): Email | undefined {
    return this.enviados.find((email) => email.para === endereco);
  }

  async enviar(email: Email): Promise<void> {
    this.enviados.unshift(email);
    this.enviados.length = Math.min(this.enviados.length, LEMBRAR_OS_ULTIMOS);

    this.logger.log(
      `\n` +
        `----- E-MAIL NAO ENVIADO (adaptador de desenvolvimento) -----\n` +
        `Para: ${email.para}\n` +
        `Assunto: ${email.assunto}\n\n` +
        `${email.corpo}\n` +
        `-------------------------------------------------------------`,
    );
  }
}
