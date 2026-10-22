import type { Role, TaskStatus, VisitStatus } from '@app/shared';

/**
 * Visitas e tarefas como a API as devolve, e os utilitários de período.
 *
 * Espelha `apps/api/src/agenda/resposta.ts`. Não é importado de lá de
 * propósito: `packages/shared` não pode depender de `apps/`, e o site também
 * não deve alcançar o código interno da API.
 */

/**
 * O cliente como a agenda o mostra: **nome e telefone**, e nada mais.
 *
 * Esse recorte é a decisão de 21/10/2026, e não economia de campos. Quem
 * conduz a visita do cliente de um colega precisa saber com quem vai se
 * encontrar e como avisar que está atrasado — e não precisa das anotações, da
 * origem nem do histórico daquela pessoa.
 *
 * `acessivel` diz se vale oferecer o link para a ficha. Sem ele, a tela
 * ofereceria um link que responde 404, e quem clicasse concluiria que o
 * sistema está quebrado — quando ele está funcionando exatamente como deve.
 */
export type ClienteDaAgenda = {
  id: string;
  nomeCompleto: string;
  telefone: string | null;
  acessivel: boolean;
};

export type Visita = {
  id: string;
  imovel: { id: string; codigo: string; titulo: string };
  cliente: ClienteDaAgenda | null;
  responsavel: { membershipId: string; nome: string };
  inicioEm: string;
  fimEm: string;
  situacao: VisitStatus;
  observacoes: string | null;
  minha: boolean;
  criadaEm: string;
  atualizadaEm: string;
};

export type Tarefa = {
  id: string;
  titulo: string;
  situacao: TaskStatus;
  venceEm: string | null;
  concluidaEm: string | null;
  cliente: ClienteDaAgenda | null;
  negociacao: { id: string; etapa: string } | null;
  imovel: { id: string; codigo: string; titulo: string } | null;
  responsavel: { membershipId: string; nome: string };
  minha: boolean;
  /** Calculado no servidor: depende do relógio, e o do navegador pode errar. */
  vencida: boolean;
  criadaEm: string;
  atualizadaEm: string;
};

export type PaginaDeTarefas = {
  tarefas: Tarefa[];
  total: number;
  pagina: number;
  porPagina: number;
};

/**
 * Membro da equipe, de `GET /equipe/membros` — nome e papel, **sem e-mail**.
 *
 * A ausência do e-mail é deliberada: §4.4 dá ao `AGENT` acesso a "nome e papel"
 * dos colegas, não à agenda de contatos da imobiliária.
 */
export type MembroDaEquipe = {
  membershipId: string;
  nome: string;
  papel: Role;
  euMesmo: boolean;
};

export type Periodo = 'dia' | 'semana' | 'mes';

/**
 * O recorte que a tela pede à API.
 *
 * Os limites são **locais**, e não UTC: "esta semana" para quem está em
 * Brasília termina às 23h59 de sábado no relógio dela, não às 21h. Converter
 * no fim, com `toISOString()`, é o que produz o instante com fuso que o
 * contrato exige — e é por isso que a conversão mora aqui, num lugar só, em
 * vez de ser escrita em cada tela.
 *
 * A semana começa no **domingo**, convenção dos calendários brasileiros.
 */
export function janelaDe(
  referencia: Date,
  periodo: Periodo,
): { de: string; ate: string } {
  const inicio = new Date(referencia);
  inicio.setHours(0, 0, 0, 0);

  if (periodo === 'semana') {
    inicio.setDate(inicio.getDate() - inicio.getDay());
  }

  if (periodo === 'mes') {
    inicio.setDate(1);
  }

  const fim = new Date(inicio);

  if (periodo === 'dia') {
    fim.setDate(fim.getDate() + 1);
  } else if (periodo === 'semana') {
    fim.setDate(fim.getDate() + 7);
  } else {
    // `setMonth` cuida da virada de ano sozinho, e de meses de tamanhos
    // diferentes: somar 30 dias erraria em fevereiro e em julho.
    fim.setMonth(fim.getMonth() + 1);
  }

  return { de: inicio.toISOString(), ate: fim.toISOString() };
}

/** Anda para o período anterior ou seguinte, mantendo o tipo de recorte. */
export function deslocar(
  referencia: Date,
  periodo: Periodo,
  passos: number,
): Date {
  const movida = new Date(referencia);

  if (periodo === 'dia') {
    movida.setDate(movida.getDate() + passos);
  } else if (periodo === 'semana') {
    movida.setDate(movida.getDate() + passos * 7);
  } else {
    movida.setMonth(movida.getMonth() + passos);
  }

  return movida;
}

/** O que o cabeçalho da agenda diz sobre o período em que a pessoa está. */
export function rotuloDoPeriodo(referencia: Date, periodo: Periodo): string {
  if (periodo === 'dia') {
    return referencia.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
  }

  if (periodo === 'mes') {
    return referencia.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }

  const { de, ate } = janelaDe(referencia, 'semana');
  const primeiro = new Date(de);
  // `ate` é exclusivo: o último dia mostrado é o anterior a ele.
  const ultimo = new Date(new Date(ate).getTime() - 1);

  const curto = (data: Date) =>
    data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  return `${curto(primeiro)} a ${curto(ultimo)}`;
}

/**
 * Agrupa por dia **local**, preservando a ordem que o servidor já deu.
 *
 * A chave é a data local formatada, e não o começo do ISO: `2026-10-25T02:00Z`
 * é dia 24 no Brasil, e cortar a string mostraria a visita no dia errado.
 */
export function agruparPorDia(visitas: Visita[]): [string, Visita[]][] {
  const grupos = new Map<string, Visita[]>();

  for (const visita of visitas) {
    const chave = new Date(visita.inicioEm).toLocaleDateString('pt-BR');
    const lista = grupos.get(chave) ?? [];
    lista.push(visita);
    grupos.set(chave, lista);
  }

  return [...grupos.entries()];
}

/** Dia por extenso, para o cabeçalho de cada grupo. */
export function formatarDiaLongo(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

/** Só a hora, para a linha da visita. */
export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `true` quando o instante cai no dia de hoje, no relógio de quem olha. */
export function ehHoje(iso: string): boolean {
  const data = new Date(iso);
  const hoje = new Date();

  return data.toDateString() === hoje.toDateString();
}

/**
 * ISO com fuso a partir do que o `datetime-local` entrega.
 *
 * O campo nativo devolve `"2026-10-25T14:00"` — hora local **sem fuso**, que o
 * contrato recusa de propósito, porque sem o fuso o servidor teria de adivinhar
 * e erraria duas vezes por ano. `new Date()` interpreta esse texto no fuso do
 * navegador, e `toISOString()` acrescenta o `Z`.
 *
 * Devolve `null` para texto vazio ou data impossível: quem chama decide se isso
 * é erro de campo ou campo não preenchido.
 */
export function isoDeCampoLocal(valor: string): string | null {
  if (valor.trim() === '') {
    return null;
  }

  const data = new Date(valor);

  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/**
 * O caminho de volta: ISO para o valor do `datetime-local`.
 *
 * O campo não aceita fuso nem segundos, e precisa da hora **local** — então não
 * dá para recortar o ISO, que está em UTC. Montar casa por casa a partir dos
 * getters locais é o que faz a edição mostrar a hora que a pessoa marcou.
 */
export function campoLocalDeIso(iso: string | null): string {
  if (!iso) {
    return '';
  }

  const data = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, '0');

  return (
    `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}` +
    `T${dois(data.getHours())}:${dois(data.getMinutes())}`
  );
}

/**
 * Situações de visita que a mudança aceita.
 *
 * `SCHEDULED` fica de fora porque é o estado inicial, e o contrato não a aceita
 * como destino: "voltar para agendada" uma visita cancelada confundiria o
 * histórico, e o certo ali é marcar outra visita.
 */
export const SITUACOES_DE_VISITA_ALCANCAVEIS: VisitStatus[] = [
  'CONFIRMED',
  'DONE',
  'CANCELED',
  'NO_SHOW',
];
