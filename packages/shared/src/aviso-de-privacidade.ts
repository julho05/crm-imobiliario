/**
 * O aviso de privacidade que o formulario de interesse pede para aceitar.
 *
 * ## Por que mora aqui
 *
 * A API grava a versao em `Lead.privacyNoticeVersion`, e o site mostra o texto
 * daquela versao em `/privacidade`. Se cada lado tivesse a sua constante, um
 * dia o site exibiria um texto e o banco registraria o aceite de outro — e o
 * consentimento deixaria de provar o que diz provar.
 *
 * ## `rascunho`, e a trava que ele aciona
 *
 * **[DECIDIDO 29/10/2026]** O texto juridico depende de parecer (item D6 do
 * roadmap). Ate la, o aviso existe com texto provisorio e `rascunho: true`, e
 * a captura de lead **recusa em producao** enquanto for assim: a API responde
 * 503 e o anuncio nao mostra o formulario. Em desenvolvimento, onde nao ha dado
 * real, tudo funciona.
 *
 * O mesmo arranjo do `EMAIL_PROVIDER=log`: o pendente fica no codigo, visivel,
 * e nao chega a uma pessoa de verdade.
 *
 * ## Mudar o texto e mudar a versao
 *
 * Sempre as duas coisas juntas. O lead que aceitou a versao anterior continua
 * com ela gravada — e e isso que torna o registro uma prova, e nao uma
 * afirmacao reescrita a cada revisao (`docs/data-model.md` §7).
 */
export const AVISO_DE_PRIVACIDADE = {
  versao: '2026-10-rascunho',
  rascunho: true,
} as const;

/**
 * Se o formulario de interesse pode funcionar neste ambiente.
 *
 * Recebe o `NODE_ENV` em vez de le-lo: este pacote nao assume onde roda, e o
 * site e a API leem o ambiente cada um a seu modo.
 */
export function capturaDeLeadLiberada(nodeEnv: string | undefined): boolean {
  return !(AVISO_DE_PRIVACIDADE.rascunho && nodeEnv === 'production');
}
