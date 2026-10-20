import { Global, Module } from '@nestjs/common';
import { RemetenteDeEmail } from './remetente-de-email';
import { RemetenteDeLog } from './remetente-de-log';

/**
 * Escolhe o adaptador de e-mail.
 *
 * Hoje existe um so, o de log. Quando o provedor for decidido, entra aqui um
 * segundo `case` — e nada mais no projeto muda, porque todo mundo depende da
 * classe abstrata `RemetenteDeEmail`.
 */
function escolherRemetente(): RemetenteDeEmail {
  const provedor = process.env.EMAIL_PROVIDER ?? 'log';

  if (provedor === 'log') {
    // A recusa e aqui, na inicializacao, e nao no primeiro envio: falhar ao
    // subir e visivel no deploy. Falhar no primeiro convite seria descoberto
    // por um cliente, depois de o token ja ter ido para o log.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'EMAIL_PROVIDER=log nao e aceito em producao: o adaptador de ' +
          'desenvolvimento escreve o token em claro no log, e log vazado ' +
          'viraria convite e redefinicao de senha de qualquer pessoa. ' +
          'Configure um provedor real antes de subir.',
      );
    }

    return new RemetenteDeLog();
  }

  throw new Error(
    `EMAIL_PROVIDER="${provedor}" nao e conhecido. ` +
      'Hoje o unico valor aceito e "log", para desenvolvimento. ' +
      'O provedor de producao ainda nao foi escolhido (docs/roadmap.md).',
  );
}

/**
 * `@Global()` porque tres modulos diferentes enviam e-mail (equipe,
 * autenticacao e, mais tarde, captura de lead) e nenhum deles tem motivo para
 * saber como o envio e configurado.
 */
@Global()
@Module({
  providers: [{ provide: RemetenteDeEmail, useFactory: escolherRemetente }],
  exports: [RemetenteDeEmail],
})
export class EmailModule {}
