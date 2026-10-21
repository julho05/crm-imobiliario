'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import {
  AddressVisibility,
  criarImovelSchema,
  PropertyPurpose,
  PropertyType,
  ROTULOS_DE_FINALIDADE,
  ROTULOS_DE_TIPO_DE_IMOVEL,
  ROTULOS_DE_VISIBILIDADE_DE_ENDERECO,
  UFS_DO_BRASIL,
} from '@app/shared';
import { Aviso } from '@/components/aviso';
import { Campo, CampoSelecao, CampoTexto } from '@/components/campo';
import { Button } from '@/components/ui/button';
import { chamarApi, ErroDaApi } from '@/lib/api';
import {
  focarPrimeiroErro,
  validar,
  type ErrosDoFormulario,
} from '@/lib/formulario';
import type { Imovel } from '@/lib/imoveis';

/**
 * Formulario de imovel — serve `/painel/imoveis/novo` e `/[id]/editar`.
 *
 * ## Um componente para as duas telas
 *
 * Dezenove campos, a regra de preco por finalidade e o aviso de endereco na
 * descricao. Mantidos em dois arquivos, divergiriam — e divergiriam na
 * validacao, que e a parte que importa.
 *
 * ## O que a tela protege, e que nenhum banco resolve
 *
 * O §5 do mapa de telas aponta dois furos, e os dois sao de interface:
 *
 * 1. **O controle de visibilidade do endereco fica visivel**, com a explicacao
 *    do que o publico vera. Escondido em "avancado", ninguem o encontraria, e o
 *    padrao restritivo seria tomado por limitacao do sistema.
 * 2. **O aviso na descricao** quando a visibilidade nao e `FULL`
 *    (**[DECIDIDO 19/10/2026]**). E o furo real: o corretor configura o
 *    endereco como oculto e escreve "Rua das Flores, 120" no texto livre. O
 *    banco nao tem como saber; a tela tem como avisar.
 *
 * ## A validacao daqui nao e autoridade
 *
 * Usa `criarImovelSchema`, o mesmo de `@app/shared` que a API aplica. Serve
 * para responder antes da ida ao servidor. O servidor valida de novo, e e ele
 * quem decide — inclusive sobre colisao de codigo, que so o banco sabe.
 */

type Valores = Record<string, string>;

/** Campos que a API recebe como numero, e o formulario como texto. */
const NUMERICOS = [
  'preco',
  'precoDeAluguel',
  'condominio',
  'iptu',
  'dormitorios',
  'banheiros',
  'suites',
  'vagas',
  'areaTotal',
  'areaUtil',
] as const;

/** Campos de texto que, vazios, significam "apague" na edicao. */
const TEXTOS_APAGAVEIS = [
  'descricao',
  'cep',
  'rua',
  'numero',
  'complemento',
] as const;

function valoresIniciais(imovel?: Imovel): Valores {
  if (!imovel) {
    return {
      codigo: '',
      titulo: '',
      descricao: '',
      tipo: '',
      finalidade: '',
      preco: '',
      precoDeAluguel: '',
      condominio: '',
      iptu: '',
      dormitorios: '',
      banheiros: '',
      suites: '',
      vagas: '',
      areaTotal: '',
      areaUtil: '',
      estado: '',
      cidade: '',
      bairro: '',
      cep: '',
      rua: '',
      numero: '',
      complemento: '',
      visibilidadeDoEndereco: AddressVisibility.NEIGHBORHOOD_ONLY,
    };
  }

  const texto = (valor: string | number | null) =>
    valor === null ? '' : String(valor);

  return {
    codigo: imovel.codigo,
    titulo: imovel.titulo,
    descricao: texto(imovel.descricao),
    tipo: imovel.tipo,
    finalidade: imovel.finalidade,
    preco: texto(imovel.preco),
    precoDeAluguel: texto(imovel.precoDeAluguel),
    condominio: texto(imovel.condominio),
    iptu: texto(imovel.iptu),
    dormitorios: texto(imovel.dormitorios),
    banheiros: texto(imovel.banheiros),
    suites: texto(imovel.suites),
    vagas: texto(imovel.vagas),
    areaTotal: texto(imovel.areaTotal),
    areaUtil: texto(imovel.areaUtil),
    estado: imovel.estado,
    cidade: imovel.cidade,
    bairro: imovel.bairro,
    cep: texto(imovel.cep),
    rua: texto(imovel.rua),
    numero: texto(imovel.numero),
    complemento: texto(imovel.complemento),
    visibilidadeDoEndereco: imovel.visibilidadeDoEndereco,
  };
}

/**
 * Converte o formulario no corpo da requisicao.
 *
 * Tres traducoes, e cada uma existe por um motivo:
 *
 * - **Texto para numero**, porque `<input type="number">` entrega string e o
 *   contrato pede numero. Vazio vira `undefined` na criacao e `null` na edicao:
 *   "nao informei" e "apague o que estava la" sao pedidos diferentes, e so a
 *   edicao tem o segundo.
 * - **Virgula para ponto**, porque quem digita preco em portugues escreve
 *   `450000,50`. Recusar isso seria exigir que a pessoa pense em como o
 *   JavaScript le numero.
 * - **Vazio para `undefined`** nos textos opcionais da criacao, para nao
 *   gravar string vazia onde o banco aceita nulo.
 */
function paraCorpo(
  valores: Valores,
  ehEdicao: boolean,
): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};

  for (const [campo, valor] of Object.entries(valores)) {
    const bruto = valor.trim();
    const numerico = (NUMERICOS as readonly string[]).includes(campo);
    const apagavel = (TEXTOS_APAGAVEIS as readonly string[]).includes(campo);

    if (bruto === '') {
      // Na edicao, campo opcional esvaziado e pedido de remocao. Na criacao,
      // e simplesmente ausencia.
      if (ehEdicao && (numerico || apagavel)) {
        corpo[campo] = null;
      }

      continue;
    }

    corpo[campo] = numerico ? Number(bruto.replace(',', '.')) : bruto;
  }

  return corpo;
}

export function FormularioDeImovel({ imovel }: { imovel?: Imovel }) {
  const router = useRouter();
  const formulario = useRef<HTMLFormElement>(null);
  const ehEdicao = imovel !== undefined;

  const [valores, setValores] = useState<Valores>(() =>
    valoresIniciais(imovel),
  );
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function mudar(campo: string, valor: string) {
    setValores((atuais) => ({ ...atuais, [campo]: valor }));

    // Limpa o erro do campo ao primeiro toque: manter a mensagem embaixo de um
    // campo que a pessoa esta corrigindo faz parecer que a correcao nao valeu.
    if (erros[campo]) {
      setErros(({ [campo]: _, ...resto }) => resto);
    }
  }

  const exigeVenda =
    valores.finalidade === PropertyPurpose.SALE ||
    valores.finalidade === PropertyPurpose.BOTH;
  const exigeAluguel =
    valores.finalidade === PropertyPurpose.RENT ||
    valores.finalidade === PropertyPurpose.BOTH;

  const enderecoParcial =
    valores.visibilidadeDoEndereco !== AddressVisibility.FULL;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setFalha(null);

    const corpo = paraCorpo(valores, ehEdicao);

    // Na criacao da para validar o conjunto inteiro aqui. Na edicao, nao: a
    // coerencia entre preco e finalidade depende do que esta gravado, e so o
    // servidor tem o registro. Validar pela metade aqui recusaria envio
    // legitimo.
    if (!ehEdicao) {
      const resultado = validar(criarImovelSchema, corpo);

      if (!resultado.ok) {
        setErros(resultado.erros);
        focarPrimeiroErro(formulario.current, resultado.erros);
        return;
      }
    }

    setEnviando(true);

    try {
      const salvo = await chamarApi<Imovel>(
        ehEdicao ? `/imoveis/${imovel.id}` : '/imoveis',
        { metodo: ehEdicao ? 'PATCH' : 'POST', corpo },
      );

      router.push(`/painel/imoveis/${salvo.id}/editar?salvo=1`);
      router.refresh();
    } catch (erro) {
      if (erro instanceof ErroDaApi) {
        const porCampo = erro.porCampo;

        if (Object.keys(porCampo).length > 0) {
          setErros(porCampo);
          focarPrimeiroErro(formulario.current, porCampo);
        } else {
          setFalha(erro.message);
        }
      } else {
        setFalha('Nao foi possivel salvar o imovel.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="grid gap-8">
      {falha ? <Aviso tom="erro">{falha}</Aviso> : null}

      <Secao
        titulo="Identificacao"
        descricao="Como este imovel aparece na sua lista e no anuncio."
      >
        <Campo
          nome="titulo"
          rotulo="Titulo"
          value={valores.titulo}
          onChange={(e) => mudar('titulo', e.target.value)}
          erro={erros.titulo}
          ajuda="Aparece como chamada do anuncio."
          autoComplete="off"
        />

        <Campo
          nome="codigo"
          rotulo="Codigo de referencia"
          value={valores.codigo}
          onChange={(e) => mudar('codigo', e.target.value)}
          erro={erros.codigo}
          ajuda={
            ehEdicao
              ? 'Usado nos anuncios e no atendimento.'
              : 'Deixe em branco para gerar automaticamente (AP-001).'
          }
          autoComplete="off"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelecao
            nome="tipo"
            rotulo="Tipo"
            value={valores.tipo}
            onChange={(e) => mudar('tipo', e.target.value)}
            erro={erros.tipo}
            textoVazio="Selecione"
            opcoes={Object.values(PropertyType).map((tipo) => ({
              valor: tipo,
              rotulo: ROTULOS_DE_TIPO_DE_IMOVEL[tipo],
            }))}
          />

          <CampoSelecao
            nome="finalidade"
            rotulo="Finalidade"
            value={valores.finalidade}
            onChange={(e) => mudar('finalidade', e.target.value)}
            erro={erros.finalidade}
            textoVazio="Selecione"
            opcoes={Object.values(PropertyPurpose).map((finalidade) => ({
              valor: finalidade,
              rotulo: ROTULOS_DE_FINALIDADE[finalidade],
            }))}
          />
        </div>

        <CampoTexto
          nome="descricao"
          rotulo="Descricao"
          value={valores.descricao}
          onChange={(e) => mudar('descricao', e.target.value)}
          erro={erros.descricao}
          rows={6}
          ajuda={
            enderecoParcial ? (
              // O furo que nenhum desenho de banco resolve: o endereco
              // configurado como oculto, escrito a mao no texto livre.
              <span className="text-warning-foreground flex items-start gap-1.5">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  Este texto e publico. Voce escolheu nao mostrar o endereco
                  completo — evite escrever rua, numero ou pontos de referencia
                  exatos aqui.
                </span>
              </span>
            ) : (
              'Este texto e publico.'
            )
          }
        />
      </Secao>

      <Secao
        titulo="Valores"
        descricao="O preco exigido acompanha a finalidade escolhida."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {exigeVenda ? (
            <Campo
              nome="preco"
              rotulo="Preco de venda"
              inputMode="decimal"
              value={valores.preco}
              onChange={(e) => mudar('preco', e.target.value)}
              erro={erros.preco}
              ajuda="Em reais."
            />
          ) : null}

          {exigeAluguel ? (
            <Campo
              nome="precoDeAluguel"
              rotulo="Valor do aluguel"
              inputMode="decimal"
              value={valores.precoDeAluguel}
              onChange={(e) => mudar('precoDeAluguel', e.target.value)}
              erro={erros.precoDeAluguel}
              ajuda="Por mes, em reais."
            />
          ) : null}

          <Campo
            nome="condominio"
            rotulo="Condominio"
            inputMode="decimal"
            value={valores.condominio}
            onChange={(e) => mudar('condominio', e.target.value)}
            erro={erros.condominio}
          />

          <Campo
            nome="iptu"
            rotulo="IPTU"
            inputMode="decimal"
            value={valores.iptu}
            onChange={(e) => mudar('iptu', e.target.value)}
            erro={erros.iptu}
          />
        </div>

        {valores.finalidade === '' ? (
          <p className="text-muted-foreground text-xs">
            Selecione a finalidade para informar os valores.
          </p>
        ) : null}
      </Secao>

      <Secao
        titulo="Caracteristicas"
        descricao="Opcionais. Deixe em branco o que ainda nao souber — campo vazio e filtrado corretamente, numero inventado nao."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo
            nome="dormitorios"
            rotulo="Dormitorios"
            inputMode="numeric"
            value={valores.dormitorios}
            onChange={(e) => mudar('dormitorios', e.target.value)}
            erro={erros.dormitorios}
          />
          <Campo
            nome="banheiros"
            rotulo="Banheiros"
            inputMode="numeric"
            value={valores.banheiros}
            onChange={(e) => mudar('banheiros', e.target.value)}
            erro={erros.banheiros}
          />
          <Campo
            nome="suites"
            rotulo="Suites"
            inputMode="numeric"
            value={valores.suites}
            onChange={(e) => mudar('suites', e.target.value)}
            erro={erros.suites}
          />
          <Campo
            nome="vagas"
            rotulo="Vagas"
            inputMode="numeric"
            value={valores.vagas}
            onChange={(e) => mudar('vagas', e.target.value)}
            erro={erros.vagas}
          />
          <Campo
            nome="areaTotal"
            rotulo="Area total (m²)"
            inputMode="decimal"
            value={valores.areaTotal}
            onChange={(e) => mudar('areaTotal', e.target.value)}
            erro={erros.areaTotal}
          />
          <Campo
            nome="areaUtil"
            rotulo="Area util (m²)"
            inputMode="decimal"
            value={valores.areaUtil}
            onChange={(e) => mudar('areaUtil', e.target.value)}
            erro={erros.areaUtil}
          />
        </div>
      </Secao>

      <Secao
        titulo="Endereco"
        descricao="Bairro, cidade e UF sao obrigatorios. O que o publico ve depende da escolha abaixo."
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
          <Campo
            nome="cidade"
            rotulo="Cidade"
            value={valores.cidade}
            onChange={(e) => mudar('cidade', e.target.value)}
            erro={erros.cidade}
            autoComplete="address-level2"
          />
          <CampoSelecao
            nome="estado"
            rotulo="UF"
            value={valores.estado}
            onChange={(e) => mudar('estado', e.target.value)}
            erro={erros.estado}
            textoVazio="—"
            opcoes={UFS_DO_BRASIL.map((uf) => ({ valor: uf, rotulo: uf }))}
          />
        </div>

        <Campo
          nome="bairro"
          rotulo="Bairro"
          value={valores.bairro}
          onChange={(e) => mudar('bairro', e.target.value)}
          erro={erros.bairro}
        />

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Campo
            nome="rua"
            rotulo="Rua"
            value={valores.rua}
            onChange={(e) => mudar('rua', e.target.value)}
            erro={erros.rua}
            autoComplete="off"
          />
          <Campo
            nome="numero"
            rotulo="Numero"
            value={valores.numero}
            onChange={(e) => mudar('numero', e.target.value)}
            erro={erros.numero}
            autoComplete="off"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nome="complemento"
            rotulo="Complemento"
            value={valores.complemento}
            onChange={(e) => mudar('complemento', e.target.value)}
            erro={erros.complemento}
          />
          <Campo
            nome="cep"
            rotulo="CEP"
            inputMode="numeric"
            value={valores.cep}
            onChange={(e) => mudar('cep', e.target.value)}
            erro={erros.cep}
          />
        </div>

        <CampoSelecao
          nome="visibilidadeDoEndereco"
          rotulo="O que o publico ve do endereco"
          value={valores.visibilidadeDoEndereco}
          onChange={(e) => mudar('visibilidadeDoEndereco', e.target.value)}
          erro={erros.visibilidadeDoEndereco}
          opcoes={Object.values(AddressVisibility).map((visibilidade) => ({
            valor: visibilidade,
            rotulo: ROTULOS_DE_VISIBILIDADE_DE_ENDERECO[visibilidade],
          }))}
          ajuda={EXPLICACAO_DE_VISIBILIDADE[valores.visibilidadeDoEndereco]}
        />
      </Secao>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enviando}>
          {enviando
            ? 'Salvando...'
            : ehEdicao
              ? 'Salvar alteracoes'
              : 'Cadastrar imovel'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={enviando}
          onClick={() => router.push('/painel/imoveis')}
        >
          Cancelar
        </Button>

        {ehEdicao ? null : (
          <p className="text-muted-foreground text-xs">
            O imovel nasce como rascunho. Publicar e um passo separado.
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * O que cada opcao significa, em vez do rotulo seco.
 *
 * "Somente o bairro" nao diz a quem cadastra que a rua ficara oculta no
 * anuncio. Dizer em uma linha, embaixo do campo, e o que torna a escolha
 * informada — e o §5 do mapa de telas pede exatamente isso.
 */
const EXPLICACAO_DE_VISIBILIDADE: Record<string, string> = {
  [AddressVisibility.FULL]:
    'O anuncio mostra rua, numero e localizacao exata no mapa.',
  [AddressVisibility.STREET_ONLY]:
    'O anuncio mostra a rua, sem o numero. A localizacao no mapa fica aproximada.',
  [AddressVisibility.NEIGHBORHOOD_ONLY]:
    'O anuncio mostra apenas bairro e cidade. Nem rua, nem numero, nem CEP.',
};

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-4">
      {/* `fieldset` e `legend` de verdade: o leitor de tela anuncia a secao ao
          entrar nela, o que num formulario de dezenove campos e a diferenca
          entre saber e nao saber onde se esta. */}
      <legend className="grid gap-1">
        <span className="text-navy text-sm font-semibold dark:text-foreground">
          {titulo}
        </span>
        <span className="text-muted-foreground text-xs font-normal">
          {descricao}
        </span>
      </legend>

      {children}
    </fieldset>
  );
}
