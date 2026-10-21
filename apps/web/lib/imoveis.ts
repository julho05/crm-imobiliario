import type {
  AddressVisibility,
  PropertyPurpose,
  PropertyStatus,
  PropertyType,
} from '@app/shared';

/**
 * O imovel como a API do CRM o devolve, e os utilitarios de exibicao.
 *
 * Fica em `lib/` e nao dentro de uma tela porque a lista, o formulario e,
 * depois, o dashboard leem a mesma resposta. Duplicar o tipo por tela
 * garantiria que um campo novo fosse acrescentado em um lugar so.
 *
 * O tipo espelha `apps/api/src/imoveis/resposta.ts`. Nao e importado de la de
 * proposito: `packages/shared` nao pode depender de `apps/`, e o site tambem
 * nao deve alcancar o codigo interno da API. A paridade e conferida pelo
 * compilador no momento do uso — campo que a API deixar de enviar aparece como
 * `undefined` em tempo de execucao, e e por isso que as telas nao assumem
 * presenca de campo opcional.
 */
export type Imovel = {
  id: string;
  codigo: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  tipo: PropertyType;
  finalidade: PropertyPurpose;
  status: PropertyStatus;
  preco: number | null;
  precoDeAluguel: number | null;
  condominio: number | null;
  iptu: number | null;
  dormitorios: number | null;
  banheiros: number | null;
  suites: number | null;
  vagas: number | null;
  areaTotal: number | null;
  areaUtil: number | null;
  estado: string;
  cidade: string;
  bairro: string;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  visibilidadeDoEndereco: AddressVisibility;
  responsavel: { membershipId: string; nome: string } | null;
  publicadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

export type PaginaDeImoveis = {
  imoveis: Imovel[];
  total: number;
  pagina: number;
  porPagina: number;
};

/**
 * Dinheiro em BRL.
 *
 * `undefined` e `null` viram travessao, nao "R$ 0,00": preco ausente e preco
 * zero sao coisas diferentes, e mostrar zero onde nao ha informacao faz o
 * corretor anunciar errado.
 */
export function formatarDinheiro(valor: number | null): string {
  if (valor === null) {
    return '—';
  }

  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

/** Area em m², com o mesmo tratamento de ausencia. */
export function formatarArea(valor: number | null): string {
  if (valor === null) {
    return '—';
  }

  return `${valor.toLocaleString('pt-BR', {
    maximumFractionDigits: 2,
  })} m²`;
}

/**
 * O preco que importa, conforme a finalidade.
 *
 * `BOTH` mostra os dois, porque esconder um deles num imovel que aceita venda e
 * locacao e justamente a informacao que o cliente ligou para perguntar.
 */
export function precoPorFinalidade(imovel: Imovel): string {
  switch (imovel.finalidade) {
    case 'SALE':
      return formatarDinheiro(imovel.preco);
    case 'RENT':
      return `${formatarDinheiro(imovel.precoDeAluguel)}/mes`;
    case 'BOTH':
      return `${formatarDinheiro(imovel.preco)} · ${formatarDinheiro(
        imovel.precoDeAluguel,
      )}/mes`;
  }
}

/**
 * Quem pode editar este imovel?
 *
 * **Isto nao autoriza nada.** Serve para nao mostrar um botao que vai responder
 * 403 — o §5 do mapa de telas chama isso de cortesia visual. A decisao de
 * verdade e do servidor, em cada requisicao.
 *
 * A regra espelha a matriz: `imovel:editar` e `ORG` para `OWNER`, `ADMIN` e
 * `MANAGER`, e `OWN` para `AGENT`. Em vez de repetir a tabela aqui, recebe o
 * escopo de quem chamou, que o tirou de `podeFazer()`.
 */
export function ehResponsavel(
  imovel: Imovel,
  membershipId: string | undefined,
): boolean {
  return (
    membershipId !== undefined &&
    imovel.responsavel?.membershipId === membershipId
  );
}
