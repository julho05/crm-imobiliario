/**
 * Testes do pipe de validacao.
 *
 * Valem tambem como prova de que a API consegue consumir `@app/shared`: se a
 * resolucao do pacote compartilhado quebrar, estes testes param primeiro.
 */

import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { capturaDeLeadSchema, loginSchema } from '@app/shared';
import { ZodValidationPipe } from '../src/validacao/zod-validation.pipe';

const ID_VALIDO = 'a'.repeat(25);

describe('ZodValidationPipe', () => {
  it('devolve os dados já normalizados quando a entrada é válida', () => {
    const pipe = new ZodValidationPipe(loginSchema);

    const dados = pipe.transform({
      email: '  Maria@Exemplo.COM ',
      senha: 'SenhaBoa123',
    });

    // Normalização acontece no schema, não no controller: quem recebe já
    // trabalha com o e-mail em minúsculas e sem espaços.
    expect(dados.email).toBe('maria@exemplo.com');
    expect(dados.permanecerConectado).toBe(false);
  });

  it('lança BadRequest com erro por campo', () => {
    const pipe = new ZodValidationPipe(loginSchema);

    try {
      pipe.transform({ email: 'nao-e-email', senha: '' });
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(BadRequestException);

      const corpo = (erro as BadRequestException).getResponse() as {
        mensagem: string;
        erros: { campo: string; mensagem: string }[];
      };

      expect(corpo.mensagem).toBe('Dados invalidos.');
      expect(corpo.erros.map((e) => e.campo).sort()).toEqual([
        'email',
        'senha',
      ]);
      expect(corpo.erros.every((e) => e.mensagem.length > 0)).toBe(true);
    }
  });

  it('rejeita entrada que não é objeto', () => {
    const pipe = new ZodValidationPipe(loginSchema);

    expect(() => pipe.transform('texto solto')).toThrow(BadRequestException);
    expect(() => pipe.transform(null)).toThrow(BadRequestException);
  });

  it('descarta campo não declarado no schema', () => {
    const pipe = new ZodValidationPipe(loginSchema);

    const dados = pipe.transform({
      email: 'maria@exemplo.com',
      senha: 'SenhaBoa123',
      // Um cliente mal-intencionado tentando escalar papel pela porta da
      // entrada. O schema não declara isto, então não sai do outro lado.
      papel: 'OWNER',
      organizationId: 'outra-organizacao',
    });

    expect(dados).not.toHaveProperty('papel');
    expect(dados).not.toHaveProperty('organizationId');
  });

  it('exige o consentimento na captura de lead', () => {
    const pipe = new ZodValidationPipe(capturaDeLeadSchema);

    expect(() =>
      pipe.transform({
        propertyId: ID_VALIDO,
        nomeCompleto: 'João da Silva',
        telefone: '11988887777',
        consentiuComAPrivacidade: false,
      }),
    ).toThrow(BadRequestException);
  });

  it('aponta o campo certo quando falta telefone e e-mail no lead', () => {
    const pipe = new ZodValidationPipe(capturaDeLeadSchema);

    try {
      pipe.transform({
        propertyId: ID_VALIDO,
        nomeCompleto: 'João da Silva',
        consentiuComAPrivacidade: true,
      });
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      const corpo = (erro as BadRequestException).getResponse() as {
        erros: { campo: string; mensagem: string }[];
      };

      expect(corpo.erros[0].campo).toBe('telefone');
      expect(corpo.erros[0].mensagem).toContain('ao menos um');
    }
  });
});
