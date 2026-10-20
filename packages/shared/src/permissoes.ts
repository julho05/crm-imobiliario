/**
 * Matriz de permissoes como DADO, nao como `if` espalhado.
 *
 * Implementa docs/permissions.md §4 e §7. A forma vem daquele documento: uma
 * tabela que se le em dez segundos, percorrida inteira por teste automatico,
 * em vez de sessenta testes escritos a mao dos quais quatro ficam faltando.
 *
 * ## Quem consome, e com que peso
 *
 * - **A API** usa para autorizar. E decisao.
 * - **O site** usa para esconder botao. E cortesia visual.
 *
 * Esconder botao **nao e seguranca**. Quem chamar o endpoint direto, sem
 * passar pela interface, tem de ser barrado pelo servidor. Os testes de
 * isolamento de docs/permissions.md §8 provam isso chamando a API sem
 * interface nenhuma.
 *
 * ## O que esta tabela NAO resolve
 *
 * Ela responde "este papel pode, em principio, fazer isto?". Nao responde:
 *
 * - se o registro pertence a organizacao ativa (passo 5 do §6)
 * - se o registro esta atribuido a este membro, quando o escopo e `OWN`
 *   (passo 6)
 * - se a sessao e valida e o membership esta ativo (passos 1 a 3)
 *
 * Usar `podeFazer()` sozinho como autorizacao deixa passar justamente a
 * travessia entre organizacoes. Ela e o passo 4, nao os sete.
 */

import { Role } from './enums';

/**
 * Sobre quais registros a permissao vale.
 *
 * - `ORG`: todos os registros da organizacao ativa
 * - `OWN`: so os atribuidos ao proprio membro
 * - `false`: sem acesso
 *
 * Em acoes que nao se referem a um registro especifico (criar, convidar), o
 * `ORG` significa simplesmente "pode", e `OWN` significa "pode, mas o
 * resultado nasce atribuido a si mesmo" — o caso do corretor que cria lead.
 */
export type Escopo = 'ORG' | 'OWN' | false;

/**
 * Acoes nomeadas `recurso:acao`. A lista e fechada de proposito: acao nova
 * exige decidir o escopo dos quatro papeis, em vez de aparecer com um padrao
 * silencioso.
 */
export type Acao =
  // Imoveis — docs/permissions.md §4.1
  | 'imovel:ver'
  | 'imovel:criar'
  | 'imovel:editar'
  | 'imovel:publicar'
  | 'imovel:alterarResponsavel'
  | 'imovel:arquivar'
  | 'imovel:excluir'
  // Leads e solicitacoes — §4.2
  | 'lead:ver'
  | 'lead:criar'
  | 'lead:editar'
  | 'lead:atribuir'
  | 'lead:verNaoAtribuidos'
  | 'lead:excluir'
  // Negociacoes, visitas e tarefas — §4.3
  | 'negociacao:ver'
  | 'negociacao:criar'
  | 'negociacao:editar'
  | 'negociacao:atribuir'
  | 'negociacao:excluir'
  // Equipe — §4.4
  | 'equipe:verMembros'
  | 'equipe:convidarAgent'
  | 'equipe:convidarManager'
  | 'equipe:convidarAdmin'
  | 'equipe:alterarPapel'
  | 'equipe:removerMembro'
  | 'equipe:transferirPropriedade'
  // Organizacao e vitrine — §4.5
  | 'organizacao:ver'
  | 'organizacao:editar'
  | 'organizacao:editarSlug'
  | 'organizacao:configurarVitrine'
  | 'organizacao:verPlano'
  | 'organizacao:alterarPlano'
  | 'organizacao:excluir'
  // Auditoria — §4.6
  | 'auditoria:verLogDaOrganizacao'
  | 'auditoria:verHistoricoDoRegistro'
  | 'auditoria:editarLog'
  // Perfil proprio — §4.7
  | 'perfil:editar';

/**
 * A matriz. Cada acao declara o escopo dos quatro papeis, sem omissao: o tipo
 * `Record` obriga a decidir, e e isso que impede permissao nascer por descuido.
 */
export const MATRIZ_DE_PERMISSOES: Record<Acao, Record<Role, Escopo>> = {
  // --- Imoveis -------------------------------------------------------------
  // Leitura e ORG para todos, inclusive AGENT: o corretor precisa poder
  // oferecer qualquer imovel da casa ao cliente dele. Restringir quebraria o
  // negocio (decisao de 19/10/2026).
  'imovel:ver': { OWNER: 'ORG', ADMIN: 'ORG', MANAGER: 'ORG', AGENT: 'ORG' },
  'imovel:criar': { OWNER: 'ORG', ADMIN: 'ORG', MANAGER: 'ORG', AGENT: 'ORG' },
  // Mas edita apenas os seus.
  'imovel:editar': { OWNER: 'ORG', ADMIN: 'ORG', MANAGER: 'ORG', AGENT: 'OWN' },
  'imovel:publicar': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: 'OWN',
  },
  'imovel:alterarResponsavel': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: false,
  },
  'imovel:arquivar': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: 'OWN',
  },
  'imovel:excluir': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: false,
    AGENT: false,
  },

  // --- Leads ---------------------------------------------------------------
  // Aqui a leitura E restrita, ao contrario dos imoveis. Lead e a moeda de
  // troca da imobiliaria: expor a carteira de um corretor aos colegas gera
  // conflito interno e faz o cliente abandonar o CRM (decisao de 19/10/2026).
  'lead:ver': { OWNER: 'ORG', ADMIN: 'ORG', MANAGER: 'ORG', AGENT: 'OWN' },
  // O corretor cria, mas o lead nasce atribuido a ele mesmo.
  'lead:criar': { OWNER: 'ORG', ADMIN: 'ORG', MANAGER: 'ORG', AGENT: 'OWN' },
  'lead:editar': { OWNER: 'ORG', ADMIN: 'ORG', MANAGER: 'ORG', AGENT: 'OWN' },
  'lead:atribuir': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: false,
  },
  'lead:verNaoAtribuidos': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: false,
  },
  // Exclusao existe para atender pedido de LGPD, nao para limpeza de rotina.
  'lead:excluir': { OWNER: 'ORG', ADMIN: 'ORG', MANAGER: false, AGENT: false },

  // --- Negociacoes, visitas e tarefas --------------------------------------
  // Seguem a visibilidade do lead: quem nao ve o lead nao ve a negociacao nem
  // a visita ligada a ele. Qualquer outra combinacao vaza por via indireta —
  // a agenda mostraria o nome do cliente de um colega.
  'negociacao:ver': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: 'OWN',
  },
  'negociacao:criar': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: 'OWN',
  },
  'negociacao:editar': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: 'OWN',
  },
  'negociacao:atribuir': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: false,
  },
  'negociacao:excluir': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'OWN',
    AGENT: false,
  },

  // --- Equipe --------------------------------------------------------------
  // O AGENT ve a lista, mas so nome e papel. A reducao de campos e do DTO,
  // nao da matriz: a matriz diz se ve, o DTO diz o que ve.
  'equipe:verMembros': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: 'ORG',
  },
  'equipe:convidarAgent': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: false,
  },
  'equipe:convidarManager': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: false,
    AGENT: false,
  },
  'equipe:convidarAdmin': {
    OWNER: 'ORG',
    ADMIN: false,
    MANAGER: false,
    AGENT: false,
  },
  // ATENCAO: para ADMIN isto e insuficiente por si so. Ver `podeAgirSobreMembro`.
  'equipe:alterarPapel': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: false,
    AGENT: false,
  },
  'equipe:removerMembro': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: false,
    AGENT: false,
  },
  'equipe:transferirPropriedade': {
    OWNER: 'ORG',
    ADMIN: false,
    MANAGER: false,
    AGENT: false,
  },

  // --- Organizacao ---------------------------------------------------------
  'organizacao:ver': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: 'ORG',
  },
  'organizacao:editar': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: false,
    AGENT: false,
  },
  'organizacao:editarSlug': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: false,
    AGENT: false,
  },
  'organizacao:configurarVitrine': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: false,
    AGENT: false,
  },
  'organizacao:verPlano': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: false,
  },
  'organizacao:alterarPlano': {
    OWNER: 'ORG',
    ADMIN: false,
    MANAGER: false,
    AGENT: false,
  },
  'organizacao:excluir': {
    OWNER: 'ORG',
    ADMIN: false,
    MANAGER: false,
    AGENT: false,
  },

  // --- Auditoria -----------------------------------------------------------
  'auditoria:verLogDaOrganizacao': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: false,
    AGENT: false,
  },
  'auditoria:verHistoricoDoRegistro': {
    OWNER: 'ORG',
    ADMIN: 'ORG',
    MANAGER: 'ORG',
    AGENT: 'OWN',
  },
  // Somente insercao pela aplicacao. Nenhum papel edita, nem o OWNER. Log que
  // o administrador pode editar nao serve de prova de nada.
  'auditoria:editarLog': {
    OWNER: false,
    ADMIN: false,
    MANAGER: false,
    AGENT: false,
  },

  // --- Perfil proprio ------------------------------------------------------
  // Sempre OWN, em qualquer papel. Aqui OWN significa o proprio `User`, nao o
  // `Membership`: nome, senha, foto e tema sao da pessoa, nao do vinculo.
  'perfil:editar': {
    OWNER: 'OWN',
    ADMIN: 'OWN',
    MANAGER: 'OWN',
    AGENT: 'OWN',
  },
};

/**
 * Passo 4 dos sete de docs/permissions.md §6: o papel pode, em principio,
 * executar esta acao? E com que alcance?
 *
 * Nao e autorizacao completa. Ver o aviso no topo deste arquivo.
 */
export function podeFazer(papel: Role, acao: Acao): Escopo {
  return MATRIZ_DE_PERMISSOES[acao][papel];
}

/** Atalho de leitura para quando o escopo nao interessa, so o sim ou nao. */
export function temAlgumAcesso(papel: Role, acao: Acao): boolean {
  return podeFazer(papel, acao) !== false;
}

/**
 * Regras de equipe que a matriz papel x acao nao consegue expressar, porque
 * dependem de **quem e o alvo**.
 *
 * As tres invioláveis de docs/permissions.md §4.4:
 *
 * 1. `ADMIN` nao altera nem remove `OWNER`, nem outro `ADMIN`.
 * 2. Ninguem altera o proprio papel — nem o `OWNER`. Sem isso, o unico
 *    `OWNER` poderia se rebaixar e deixar a organizacao sem dono.
 * 3. `OWNER` nao e removivel por esta via. Sair exige transferir a
 *    propriedade primeiro, numa operacao atomica.
 *
 * Deixar isso para cada controller seria convidar a falha: e exatamente o
 * caminho classico de escalada de privilegio.
 */
export function podeAgirSobreMembro(params: {
  papelDoAtor: Role;
  papelDoAlvo: Role;
  ehOProprioMembro: boolean;
  acao: 'equipe:alterarPapel' | 'equipe:removerMembro';
}): boolean {
  const { papelDoAtor, papelDoAlvo, ehOProprioMembro, acao } = params;

  if (!temAlgumAcesso(papelDoAtor, acao)) {
    return false;
  }

  // Regra 2: vale para todos, inclusive o OWNER.
  if (ehOProprioMembro) {
    return false;
  }

  // Regra 3.
  if (papelDoAlvo === Role.OWNER) {
    return false;
  }

  // Regra 1.
  if (papelDoAtor === Role.ADMIN && papelDoAlvo === Role.ADMIN) {
    return false;
  }

  return true;
}

/**
 * Qual papel cada papel consegue convidar. Serve para montar o seletor do
 * formulario de convite sem repetir a regra na interface.
 */
export function papeisQuePodeConvidar(papel: Role): Role[] {
  const candidatos: [Role, Acao][] = [
    [Role.ADMIN, 'equipe:convidarAdmin'],
    [Role.MANAGER, 'equipe:convidarManager'],
    [Role.AGENT, 'equipe:convidarAgent'],
  ];

  return candidatos
    .filter(([, acao]) => temAlgumAcesso(papel, acao))
    .map(([alvo]) => alvo);
}
