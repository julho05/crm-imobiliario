/**
 * Item **C7** — o que sai para o robô de busca e para a prévia de link.
 *
 * Primeiro teste do `apps/web`, e não contradiz a decisão de 21/10/2026 (sem
 * teste de componente): são funções puras, sem DOM e sem dependência nova.
 *
 * Duas coisas que nenhum olho pega na tela, porque a tela não as mostra:
 *
 * 1. **O JSON-LD não pode fechar a própria tag.** Título com `</script>` vira
 *    script de terceiro na vitrine
 * 2. **A rua não pode ir para o índice**, mesmo com o endereço visível na
 *    página: o que o Google guarda sai do controle do corretor
 */

import { describe, expect, it } from 'vitest';
import type { ImovelPublico, OrganizacaoPublica } from './catalogo';
import {
  dadosDaOrganizacao,
  dadosDoAnuncio,
  descricaoDoImovel,
  serializarJsonLd,
} from './seo';

const organizacao: OrganizacaoPublica = {
  slug: 'aurora',
  nome: 'Aurora Imóveis',
  tipo: 'AGENCY',
  email: null,
  telefone: '(11) 3333-4444',
  apresentacao: null,
  logoUrl: null,
};

function imovel(ajuste: Partial<ImovelPublico> = {}): ImovelPublico {
  return {
    id: 'cmimovel0000000000000000',
    codigo: 'AP-001',
    slug: 'apartamento-em-pinheiros-ap-001',
    titulo: 'Apartamento em Pinheiros',
    descricao: 'Fica na Rua dos Pinheiros, 1200, perto do metrô.',
    tipo: 'APARTMENT',
    finalidade: 'SALE',
    status: 'AVAILABLE',
    preco: 850000,
    precoDeAluguel: null,
    condominio: null,
    iptu: null,
    dormitorios: 3,
    banheiros: 2,
    suites: 1,
    vagas: 1,
    areaTotal: 95,
    areaUtil: 85,
    estado: 'SP',
    cidade: 'São Paulo',
    bairro: 'Pinheiros',
    endereco: { rua: 'Rua dos Pinheiros', numero: '1200', complemento: null },
    caracteristicas: [],
    capa: null,
    fotos: [],
    publicadoEm: '2026-10-29T12:00:00.000Z',
    ...ajuste,
  };
}

/**
 * A descrição com espaços comuns. O `Intl` põe um espaço inseparável depois do
 * "R$" — certo para a página, invisível na comparação.
 */
function descricao(dados: ImovelPublico): string {
  return descricaoDoImovel(dados).replace(/\s/g, ' ');
}

describe('descricaoDoImovel', () => {
  it('monta tipo, finalidade, local, dormitórios, área e preço', () => {
    expect(descricao(imovel())).toBe(
      'Apartamento à venda em Pinheiros, São Paulo - SP · 3 dormitórios · 85 m² · R$ 850.000',
    );
  });

  it('omite o que não foi informado, em vez de escrever zero', () => {
    expect(
      descricaoDoImovel(
        imovel({
          dormitorios: null,
          areaUtil: null,
          areaTotal: null,
          preco: null,
        }),
      ),
    ).toBe('Apartamento à venda em Pinheiros, São Paulo - SP');
  });

  it('aluguel sai por mês, e um dormitório no singular', () => {
    expect(
      descricao(
        imovel({
          finalidade: 'RENT',
          preco: null,
          precoDeAluguel: 3200,
          dormitorios: 1,
        }),
      ),
    ).toBe(
      'Apartamento para alugar em Pinheiros, São Paulo - SP · 1 dormitório · 85 m² · R$ 3.200/mês',
    );
  });

  it('nunca leva a rua, nem do endereço visível nem do texto livre', () => {
    const texto = descricaoDoImovel(imovel());

    expect(texto).not.toContain('Rua dos Pinheiros');
    expect(texto).not.toContain('1200');
  });
});

describe('dadosDoAnuncio', () => {
  it('não leva rua, número nem texto livre do corretor', () => {
    const json = JSON.stringify(
      dadosDoAnuncio(organizacao, imovel(), 'https://exemplo.com.br'),
    );

    expect(json).not.toContain('Rua dos Pinheiros');
    expect(json).not.toContain('1200');
    expect(json).not.toContain('streetAddress');
    expect(json).not.toContain('postalCode');
  });

  it('o imóvel para venda e aluguel tem duas ofertas', () => {
    const dados = dadosDoAnuncio(
      organizacao,
      imovel({ finalidade: 'BOTH', precoDeAluguel: 4000 }),
      'https://exemplo.com.br',
    );

    expect(dados.offers).toHaveLength(2);
  });

  it('URL absoluta, com o código como identificador', () => {
    const dados = dadosDoAnuncio(
      organizacao,
      imovel(),
      'https://exemplo.com.br',
    );

    expect(dados.url).toBe(
      'https://exemplo.com.br/o/aurora/imovel/apartamento-em-pinheiros-ap-001',
    );
    expect(dados.identifier).toBe('AP-001');
  });

  it('só fotos como imagem, sem a planta', () => {
    const midia = {
      textoAlternativo: null,
      largura: null,
      altura: null,
    };
    const dados = dadosDoAnuncio(
      organizacao,
      imovel({
        fotos: [
          { ...midia, kind: 'PHOTO', url: 'https://m/foto.jpg' },
          { ...midia, kind: 'FLOORPLAN', url: 'https://m/planta.jpg' },
        ],
      }),
      'https://exemplo.com.br',
    );

    expect(dados.image).toEqual(['https://m/foto.jpg']);
  });
});

describe('dadosDaOrganizacao', () => {
  it('omite o contato que não existe, em vez de mandar null', () => {
    const dados = dadosDaOrganizacao(organizacao, 'https://exemplo.com.br');

    expect(dados).not.toHaveProperty('email');
    expect(dados.telephone).toBe('(11) 3333-4444');
  });
});

describe('serializarJsonLd', () => {
  it('um título com </script> não fecha a tag', () => {
    const texto = serializarJsonLd(
      dadosDoAnuncio(
        organizacao,
        imovel({ titulo: '</script><script>alert(1)</script>' }),
        'https://exemplo.com.br',
      ),
    );

    expect(texto).not.toContain('</script>');
    expect(texto).not.toContain('<');
    expect(texto).not.toContain('>');
  });

  it('continua sendo o mesmo JSON para quem o lê', () => {
    const dados = { name: 'A & B <Imóveis>', texto: 'linha\u2028outra' };

    expect(JSON.parse(serializarJsonLd(dados))).toEqual(dados);
  });
});
