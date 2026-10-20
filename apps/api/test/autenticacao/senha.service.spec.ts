import { describe, expect, it } from 'vitest';
import { SenhaService } from '../../src/autenticacao/senha.service';

const senhas = new SenhaService();

describe('SenhaService', () => {
  it('nunca devolve a senha em claro', async () => {
    const hash = await senhas.gerar('SenhaBoa123');

    expect(hash).not.toContain('SenhaBoa123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('gera hashes diferentes para a mesma senha', async () => {
    const [a, b] = await Promise.all([
      senhas.gerar('SenhaBoa123'),
      senhas.gerar('SenhaBoa123'),
    ]);

    // Salt aleatório por chamada. Se fossem iguais, duas pessoas com a mesma
    // senha teriam o mesmo hash, e uma tabela pré-computada quebraria as duas
    // de uma vez.
    expect(a).not.toBe(b);
  });

  it('embute algoritmo e parâmetros no hash', async () => {
    const hash = await senhas.gerar('SenhaBoa123');

    // É isso que permite subir o custo depois sem invalidar as senhas antigas:
    // cada hash carrega os parâmetros com que foi feito.
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);
  });

  it('aceita a senha correta e recusa a errada', async () => {
    const hash = await senhas.gerar('SenhaBoa123');

    expect(await senhas.conferir(hash, 'SenhaBoa123')).toBe(true);
    expect(await senhas.conferir(hash, 'SenhaBoa124')).toBe(false);
    expect(await senhas.conferir(hash, '')).toBe(false);
  });

  it('diferencia maiúsculas e minúsculas', async () => {
    const hash = await senhas.gerar('SenhaBoa123');

    expect(await senhas.conferir(hash, 'senhaboa123')).toBe(false);
  });

  it('devolve false em vez de estourar com hash ilegível', async () => {
    // Registro corrompido no banco não pode virar erro 500 no login: o 500
    // revelaria que aquele e-mail tem conta.
    for (const ruim of ['', 'nao-e-hash', '$argon2id$incompleto', '$2b$10$x']) {
      expect(await senhas.conferir(ruim, 'SenhaBoa123')).toBe(false);
    }
  });

  it('o hash descartável é um Argon2 válido e consome tempo de verdade', async () => {
    // A defesa contra enumeração por tempo só existe se este hash parsear.
    // Com formato inválido, a verificação falha na hora e a proteção
    // desaparece sem ninguém notar.
    expect(SenhaService.HASH_DESCARTAVEL).toMatch(/^\$argon2id\$v=19\$m=/);

    const hashReal = await senhas.gerar('SenhaBoa123');

    const inicioReal = performance.now();
    await senhas.conferir(hashReal, 'SenhaErrada123');
    const tempoReal = performance.now() - inicioReal;

    const inicioFalso = performance.now();
    await senhas.gastarTempoComoSeConferisse('SenhaErrada123');
    const tempoFalso = performance.now() - inicioFalso;

    // Não se compara tempo exato (a máquina varia); confere-se que o caminho
    // falso não é ordens de magnitude mais rápido, que é o que vazaria.
    expect(tempoFalso).toBeGreaterThan(tempoReal / 5);
  });
});
