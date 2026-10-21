import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Campos de formulario com rotulo, ajuda e erro.
 *
 * Existem para que a parte acessivel nao dependa de ninguem lembrar dela em
 * cada tela. O que eles garantem sempre:
 *
 * - `aria-invalid` no campo com erro, e nao apenas a borda vermelha. Cor nunca
 *   e o unico indicador de estado ([CLAUDE.md](../../../CLAUDE.md))
 * - `aria-describedby` apontando para a mensagem, para que o leitor de tela a
 *   anuncie junto com o campo, em vez de deixar a pessoa adivinhar
 * - `role="alert"` na mensagem, para que ela seja lida quando aparecer
 * - `name` igual a chave do schema, que e o que permite ao `focarPrimeiroErro`
 *   achar o campo
 *
 * As tres variantes — texto, selecao e texto longo — compartilham o
 * `EnvelopeDeCampo`. A regra acessivel e escrita **uma vez**: tres copias
 * divergiriam, e a que divergisse seria descoberta por alguem usando leitor de
 * tela, nao por nos.
 */

type PropriedadesComuns = {
  nome: string;
  rotulo: string;
  erro?: string;
  ajuda?: React.ReactNode;
  className?: string;
};

/**
 * Monta rotulo, ajuda e erro em volta do controle, e entrega a ele os
 * atributos de acessibilidade por `children` como funcao.
 */
function EnvelopeDeCampo({
  nome,
  rotulo,
  erro,
  ajuda,
  className,
  children,
}: PropriedadesComuns & {
  children: (atributos: {
    id: string;
    name: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}) {
  const idDaAjuda = `${nome}-ajuda`;
  const idDoErro = `${nome}-erro`;

  const descricao =
    [erro ? idDoErro : null, ajuda ? idDaAjuda : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={nome}>{rotulo}</Label>

      {children({
        id: nome,
        name: nome,
        'aria-invalid': erro ? true : undefined,
        'aria-describedby': descricao,
      })}

      {ajuda ? (
        <p id={idDaAjuda} className="text-muted-foreground text-xs">
          {ajuda}
        </p>
      ) : null}

      {erro ? (
        <p id={idDoErro} role="alert" className="text-destructive text-xs">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

export function Campo({
  nome,
  rotulo,
  erro,
  ajuda,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'name' | 'id'> & PropriedadesComuns) {
  return (
    <EnvelopeDeCampo
      nome={nome}
      rotulo={rotulo}
      erro={erro}
      ajuda={ajuda}
      className={className}
    >
      {(atributos) => <Input {...atributos} {...props} />}
    </EnvelopeDeCampo>
  );
}

/**
 * Campo de selecao.
 *
 * `opcoes` em vez de `children` de proposito: a lista de opcoes quase sempre
 * sai de um `Record` de rotulos de `@app/shared`, e receber o dado pronto evita
 * que cada tela escreva o proprio `map` — e esqueca a opcao vazia.
 *
 * `textoVazio` acrescenta uma opcao sem valor no topo, para campo opcional ou
 * para obrigar a escolha explicita. Sem ela, o seletor ja nasce com a primeira
 * opcao marcada, e a pessoa envia um valor que nunca escolheu.
 */
export function CampoSelecao({
  nome,
  rotulo,
  erro,
  ajuda,
  className,
  opcoes,
  textoVazio,
  ...props
}: Omit<React.ComponentProps<'select'>, 'name' | 'id' | 'children'> &
  PropriedadesComuns & {
    opcoes: { valor: string; rotulo: string }[];
    textoVazio?: string;
  }) {
  return (
    <EnvelopeDeCampo
      nome={nome}
      rotulo={rotulo}
      erro={erro}
      ajuda={ajuda}
      className={className}
    >
      {(atributos) => (
        <Select {...atributos} {...props}>
          {textoVazio === undefined ? null : (
            <option value="">{textoVazio}</option>
          )}
          {opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </Select>
      )}
    </EnvelopeDeCampo>
  );
}

export function CampoTexto({
  nome,
  rotulo,
  erro,
  ajuda,
  className,
  ...props
}: Omit<React.ComponentProps<'textarea'>, 'name' | 'id'> & PropriedadesComuns) {
  return (
    <EnvelopeDeCampo
      nome={nome}
      rotulo={rotulo}
      erro={erro}
      ajuda={ajuda}
      className={className}
    >
      {(atributos) => <Textarea {...atributos} {...props} />}
    </EnvelopeDeCampo>
  );
}
