import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { ROTULOS_DE_TIPO_DE_ORGANIZACAO } from '@app/shared';
import { telefoneParaLink, type OrganizacaoPublica } from '@/lib/catalogo';

/**
 * A faixa de identidade no topo da vitrine e do anúncio.
 *
 * A vitrine é da imobiliária, não da plataforma: o nome no topo é o dela, e o
 * nome do produto não aparece. É ela que o cliente procurou.
 *
 * Na vitrine o nome é o `<h1>`. No anúncio, o `<h1>` é o título do imóvel, e o
 * nome vira um link de volta para a vitrine — por isso `naVitrine`.
 */
export function CabecalhoDaOrganizacao({
  organizacao,
  naVitrine,
}: {
  organizacao: OrganizacaoPublica;
  naVitrine: boolean;
}) {
  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
        {organizacao.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organizacao.logoUrl}
            alt=""
            className="size-10 shrink-0 rounded-md bg-white object-contain"
          />
        )}

        <div className="min-w-0">
          {naVitrine ? (
            <h1 className="truncate text-lg font-semibold">
              {organizacao.nome}
            </h1>
          ) : (
            <Link
              href={`/o/${organizacao.slug}`}
              className="block truncate text-lg font-semibold hover:underline"
            >
              {organizacao.nome}
            </Link>
          )}
          <p className="text-gold text-xs">
            {ROTULOS_DE_TIPO_DE_ORGANIZACAO[organizacao.tipo]}
          </p>
        </div>
      </div>
    </header>
  );
}

/**
 * Telefone e e-mail públicos, como links.
 *
 * Não desenha nada quando a organização não tem nenhum dos dois: um bloco
 * "Contato" vazio parece defeito, e hoje ainda não existe tela que preencha
 * esses campos.
 */
export function ContatoDaOrganizacao({
  organizacao,
}: {
  organizacao: OrganizacaoPublica;
}) {
  if (!organizacao.telefone && !organizacao.email) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {organizacao.telefone && (
        <li>
          <a
            href={`tel:${telefoneParaLink(organizacao.telefone)}`}
            className="inline-flex items-center gap-2 hover:underline"
          >
            <Phone className="size-4 shrink-0" aria-hidden="true" />
            {organizacao.telefone}
          </a>
        </li>
      )}
      {organizacao.email && (
        <li>
          <a
            href={`mailto:${organizacao.email}`}
            className="inline-flex items-center gap-2 break-all hover:underline"
          >
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            {organizacao.email}
          </a>
        </li>
      )}
    </ul>
  );
}
