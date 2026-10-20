import { describe, expect, it } from 'vitest';
import {
  lerCookie,
  NOME_DO_COOKIE_DE_SESSAO,
  opcoesDoCookieDeSessao,
} from '../../src/autenticacao/cookie';

describe('lerCookie', () => {
  it('lê um cookie único', () => {
    expect(lerCookie('sessao=abc123', 'sessao')).toBe('abc123');
  });

  it('lê um cookie no meio de vários', () => {
    expect(lerCookie('tema=dark; sessao=abc123; outro=1', 'sessao')).toBe(
      'abc123',
    );
  });

  it('tolera espaços ao redor do nome e do valor', () => {
    expect(lerCookie('  sessao  =  abc123  ', 'sessao')).toBe('abc123');
  });

  it('não confunde cookie de nome parecido', () => {
    // Um split ingênuo por "sessao=" pegaria o valor errado aqui, e a sessão
    // antiga continuaria sendo aceita.
    expect(lerCookie('sessao_antiga=velho; sessao=novo', 'sessao')).toBe(
      'novo',
    );
    expect(lerCookie('xsessao=outro', 'sessao')).toBeUndefined();
  });

  it('preserva valor que contém sinal de igual', () => {
    expect(lerCookie('sessao=a=b=c', 'sessao')).toBe('a=b=c');
  });

  it('decodifica percent-encoding', () => {
    expect(lerCookie('sessao=a%20b', 'sessao')).toBe('a b');
  });

  it('devolve o valor cru quando o percent-encoding está quebrado', () => {
    // Entrada malformada não pode derrubar a requisição.
    expect(lerCookie('sessao=%E0%A4%A', 'sessao')).toBe('%E0%A4%A');
  });

  it('devolve undefined para cabeçalho ausente, vazio ou sem o cookie', () => {
    expect(lerCookie(undefined, 'sessao')).toBeUndefined();
    expect(lerCookie('', 'sessao')).toBeUndefined();
    expect(lerCookie('tema=dark', 'sessao')).toBeUndefined();
    expect(lerCookie('sessao', 'sessao')).toBeUndefined();
  });
});

describe('opções do cookie de sessão', () => {
  it('é httpOnly e SameSite=Lax', () => {
    const opcoes = opcoesDoCookieDeSessao();

    // httpOnly: JavaScript da página não lê o cookie, o que limita o estrago
    // de um XSS. Lax: o navegador não envia o cookie em requisição disparada
    // por outro site, cortando CSRF na maioria dos casos.
    expect(opcoes.httpOnly).toBe(true);
    expect(opcoes.sameSite).toBe('lax');
    expect(opcoes.path).toBe('/');
  });

  it('converte maxAge de segundos para milissegundos', () => {
    expect(opcoesDoCookieDeSessao(3600).maxAge).toBe(3_600_000);
  });

  it('omite maxAge quando não informado', () => {
    expect(opcoesDoCookieDeSessao().maxAge).toBeUndefined();
  });

  it('exige Secure em produção e dispensa fora dela', () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(opcoesDoCookieDeSessao().secure).toBe(true);

      process.env.NODE_ENV = 'development';
      // Em http://localhost o navegador descartaria um cookie Secure.
      expect(opcoesDoCookieDeSessao().secure).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('usa um nome que não revela a tecnologia por trás', () => {
    expect(NOME_DO_COOKIE_DE_SESSAO).toBe('sessao');
  });
});
