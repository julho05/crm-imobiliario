/**
 * Cadastro e edicao de imovel — item **B1** do
 * [roadmap.md](../../../../docs/roadmap.md).
 *
 * ## O que e obrigatorio, e por que tao pouco
 *
 * **[DECIDIDO 21/10/2026]** O contrato exige o piso do banco — titulo, tipo,
 * finalidade, UF, cidade e bairro — mais o preco coerente com a finalidade.
 * Area, dormitorios, descricao e endereco detalhado ficam opcionais.
 *
 * A alternativa era exigir area e dormitorios em imovel residencial, para que
 * os filtros do catalogo nascessem confiaveis. Foi recusada: o corretor
 * cadastra o imovel com o que tem em maos na hora da visita, e campo
 * obrigatorio que ele ainda nao sabe produz numero inventado — pior para o
 * filtro do que o campo vazio, porque o vazio se detecta e o errado nao.
 *
 * A consequencia fica registrada para a Fase 3: filtro por area e por
 * dormitorios tem de **excluir** o imovel sem o valor, nunca trata-lo como
 * zero (item C4).
 *
 * ## O que este schema nao aceita, de proposito
 *
 * - **`organizationId`** — vem da sessao, nunca do cliente. E a regra de
 *   [permissions.md](../../../../docs/permissions.md) §6, passo 2.
 * - **`status` e `publishedAt`** — publicacao e o item B2, com endpoint e
 *   auditoria proprios. Imovel nasce `DRAFT` e muda de estado por rota
 *   dedicada, porque "editei o titulo" e "coloquei no ar" sao eventos
 *   diferentes e o log precisa distingui-los.
 * - **`slug`** — derivado do titulo e do codigo no servidor. Slug editavel
 *   pelo cliente e URL publica que muda sem aviso.
 * - **`ownerMemberId`** — atribuir responsavel exige
 *   `imovel:alterarResponsavel`, que o `AGENT` nao tem. Aceitar o campo aqui
 *   deixaria o corretor cadastrar imovel no nome de um colega.
 */

import { z } from 'zod';
import { PropertyPurpose, PropertyType } from '../enums';
import { ufSchema } from '../primitivos';

/**
 * Codigo de referencia do imovel, unico por organizacao.
 *
 * **[DECIDIDO 21/10/2026]** Opcional na entrada: ausente, o servidor gera um
 * sequencial por organizacao (`AP-001`). Presente, vale o que a pessoa
 * escreveu — a imobiliaria que ja numera imoveis ha anos usa essa numeracao no
 * anuncio e no WhatsApp, e nao da para pedir que ela abandone a referencia que
 * os clientes dela conhecem.
 *
 * Maiusculas por normalizacao, e nao por gosto: sem isso `ap-001` e `AP-001`
 * seriam dois codigos distintos para o indice unico e o mesmo codigo para
 * quem le.
 */
export const codigoDeImovelSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Informe o codigo ou deixe em branco para gerar automaticamente.')
  .max(32, 'O codigo pode ter no maximo 32 caracteres.')
  .regex(
    /^[A-Z0-9]+(?:[-/][A-Z0-9]+)*$/,
    'Use apenas letras, numeros, hifen e barra entre os grupos.',
  );

/**
 * Dinheiro na entrada: numero, nunca string formatada.
 *
 * O teto de R$ 999.999.999,99 cabe folgado em `Decimal(12,2)` e ainda recusa o
 * dedo escorregado no teclado numerico. O `multipleOf` barra centavo fracionado
 * — `1000.555` seria arredondado em silencio pelo banco.
 */
const dinheiroSchema = z
  .number()
  .nonnegative('O valor nao pode ser negativo.')
  .max(999_999_999.99, 'Valor acima do limite aceito.')
  .multipleOf(0.01, 'Use no maximo duas casas decimais.');

/** Contagem de ambientes e vagas. Teto generoso, mas finito. */
const contagemSchema = z
  .number()
  .int('Informe um numero inteiro.')
  .min(0, 'A contagem nao pode ser negativa.')
  .max(99, 'Contagem acima do limite aceito.');

/** Area em metros quadrados. */
const areaSchema = z
  .number()
  .positive('A area precisa ser maior que zero.')
  .max(9_999_999.99, 'Area acima do limite aceito.')
  .multipleOf(0.01, 'Use no maximo duas casas decimais.');

/**
 * Os campos do imovel, **sem** refinamento.
 *
 * Fica separado do contrato final por uma armadilha concreta, anotada em
 * `CLAUDE.md`: no Zod 4, `.pick()` e `.partial()` sobre um objeto que ja passou
 * por `.refine()` compilam e **falham em tempo de execucao**. Derivar a edicao
 * parcial do schema de criacao refinado estouraria ao carregar o modulo.
 */
const camposDoImovel = z.object({
  codigo: codigoDeImovelSchema.optional(),
  titulo: z
    .string()
    .trim()
    .min(4, 'O titulo precisa de pelo menos 4 caracteres.')
    .max(191, 'Titulo muito longo.'),
  descricao: z.string().trim().max(20_000, 'Descricao muito longa.').optional(),
  tipo: z.enum(PropertyType, 'Selecione o tipo do imovel.'),
  finalidade: z.enum(PropertyPurpose, 'Selecione a finalidade.'),

  preco: dinheiroSchema.optional(),
  precoDeAluguel: dinheiroSchema.optional(),
  condominio: dinheiroSchema.optional(),
  iptu: dinheiroSchema.optional(),

  dormitorios: contagemSchema.optional(),
  banheiros: contagemSchema.optional(),
  suites: contagemSchema.optional(),
  vagas: contagemSchema.optional(),
  areaTotal: areaSchema.optional(),
  areaUtil: areaSchema.optional(),

  estado: ufSchema,
  cidade: z
    .string()
    .trim()
    .min(2, 'Informe a cidade.')
    .max(191, 'Nome de cidade muito longo.'),
  bairro: z
    .string()
    .trim()
    .min(2, 'Informe o bairro.')
    .max(191, 'Nome de bairro muito longo.'),
  cep: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 8, 'CEP invalido.')
    .optional(),
  rua: z.string().trim().max(191, 'Nome de rua muito longo.').optional(),
  numero: z.string().trim().max(32, 'Numero muito longo.').optional(),
  complemento: z
    .string()
    .trim()
    .max(191, 'Complemento muito longo.')
    .optional(),
});

/**
 * O preco combina com a finalidade?
 *
 * Funcao solta, e nao `.refine()` dentro do objeto, porque os dois lados
 * precisam dela de formas diferentes: na criacao todos os campos estao
 * presentes; na edicao parcial a finalidade pode nem vir na requisicao, e a
 * conferencia tem de rodar sobre o **resultado** da mesclagem com o que ja
 * esta no banco. Mesma regra, uma implementacao.
 *
 * E o criterio de aceitacao do B1: `finalidade = BOTH` exige os dois precos.
 */
export function precoFaltandoParaAFinalidade(valores: {
  finalidade: PropertyPurpose;
  preco?: number | null;
  precoDeAluguel?: number | null;
}): 'preco' | 'precoDeAluguel' | null {
  const exigeVenda =
    valores.finalidade === PropertyPurpose.SALE ||
    valores.finalidade === PropertyPurpose.BOTH;
  const exigeAluguel =
    valores.finalidade === PropertyPurpose.RENT ||
    valores.finalidade === PropertyPurpose.BOTH;

  if (exigeVenda && valores.preco == null) {
    return 'preco';
  }

  if (exigeAluguel && valores.precoDeAluguel == null) {
    return 'precoDeAluguel';
  }

  return null;
}

/** Mensagem unica para o preco que falta, usada na criacao e na edicao. */
export function mensagemDePrecoFaltando(
  campo: 'preco' | 'precoDeAluguel',
): string {
  return campo === 'preco'
    ? 'Informe o preco de venda para esta finalidade.'
    : 'Informe o valor do aluguel para esta finalidade.';
}

/** Cadastro de imovel. Nasce `DRAFT`; publicar e o item B2. */
export const criarImovelSchema = camposDoImovel.check((ctx) => {
  const faltando = precoFaltandoParaAFinalidade(ctx.value);

  if (faltando) {
    ctx.issues.push({
      code: 'custom',
      input: ctx.value,
      path: [faltando],
      message: mensagemDePrecoFaltando(faltando),
    });
  }
});
export type EntradaDeCriarImovel = z.infer<typeof criarImovelSchema>;

/**
 * Edicao de imovel: todos os campos opcionais, nenhum obrigatorio por si.
 *
 * A coerencia entre preco e finalidade **nao** e conferida aqui, e isso e
 * deliberado: quem envia apenas `{ finalidade: 'BOTH' }` nao enviou preco
 * nenhum, mas pode ja ter os dois gravados. So o servidor, com o registro em
 * maos, sabe responder — e ele usa `precoFaltandoParaAFinalidade` sobre o
 * resultado da mesclagem.
 *
 * `null` e aceito onde o campo e opcional no banco, e significa "apague este
 * valor". Sem isso nao haveria como remover um condominio digitado por engano:
 * omitir o campo quer dizer "nao mexa", que e coisa diferente.
 */
export const atualizarImovelSchema = camposDoImovel
  .partial()
  .extend({
    descricao: camposDoImovel.shape.descricao.nullable().optional(),
    preco: dinheiroSchema.nullable().optional(),
    precoDeAluguel: dinheiroSchema.nullable().optional(),
    condominio: dinheiroSchema.nullable().optional(),
    iptu: dinheiroSchema.nullable().optional(),
    dormitorios: contagemSchema.nullable().optional(),
    banheiros: contagemSchema.nullable().optional(),
    suites: contagemSchema.nullable().optional(),
    vagas: contagemSchema.nullable().optional(),
    areaTotal: areaSchema.nullable().optional(),
    areaUtil: areaSchema.nullable().optional(),
    cep: camposDoImovel.shape.cep.nullable().optional(),
    rua: camposDoImovel.shape.rua.nullable().optional(),
    numero: camposDoImovel.shape.numero.nullable().optional(),
    complemento: camposDoImovel.shape.complemento.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Nenhum campo para atualizar.',
  });
export type EntradaDeAtualizarImovel = z.infer<typeof atualizarImovelSchema>;

/**
 * Filtros da listagem do **CRM** — nao confundir com `filtrosDoCatalogoSchema`,
 * que serve ao visitante sem conta.
 *
 * A diferenca nao e de conveniencia. Aqui existe `apenasMeus` e filtro por
 * `status`, porque quem consulta e membro da organizacao e tem direito a ver
 * rascunho e imovel vendido. O catalogo publico nao tem nem um nem outro, e
 * tampouco aceita filtro por rua ou CEP — o que contornaria
 * `addressVisibility` pela porta da busca.
 */
export const filtrosDeImoveisSchema = z.object({
  termo: z.string().trim().max(120).optional(),
  tipo: z.enum(PropertyType).optional(),
  finalidade: z.enum(PropertyPurpose).optional(),
  cidade: z.string().trim().max(191).optional(),
  bairro: z.string().trim().max(191).optional(),
  estado: ufSchema.optional(),
  /**
   * Restringe aos imoveis sob responsabilidade de quem consulta. E conveniencia
   * de interface ("meus imoveis"), **nao** mecanismo de seguranca: o escopo de
   * verdade vem da matriz de permissoes, no servidor.
   */
  apenasMeus: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type FiltrosDeImoveis = z.infer<typeof filtrosDeImoveisSchema>;
