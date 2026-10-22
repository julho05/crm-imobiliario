import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  ArmazenamentoDeMidia,
  VALIDADE_DA_LEITURA_EM_SEGUNDOS,
  VALIDADE_DO_UPLOAD_EM_SEGUNDOS,
  type UrlDeUpload,
} from './armazenamento-de-midia';

/**
 * Armazenamento de desenvolvimento: disco local, URL assinada por HMAC.
 *
 * ## Por que assinar, se é só desenvolvimento
 *
 * Porque a assinatura **é** o mecanismo que o item B4 precisa provar. Um
 * adaptador que aceitasse qualquer envio em qualquer chave deixaria a parte
 * mais delicada do fluxo sem exercício nenhum: o teste passaria, o R2 entraria
 * depois, e só então se descobriria que o serviço nunca limitou nada.
 *
 * Aqui a URL carrega chave, tipo, tamanho e prazo, tudo dentro do que foi
 * assinado. Trocar qualquer um deles invalida a assinatura, e o receptor
 * recusa. É a mesma forma de uma URL pré-assinada do S3 — e é essa forma que
 * fica testada.
 *
 * ## O que ele deliberadamente não é
 *
 * Não é alternativa ao R2 em produção. `MIDIA_PROVIDER=local` é **recusado** em
 * produção na inicialização, como o `EMAIL_PROVIDER=log`, e por motivo parecido:
 * o disco da hospedagem gerenciada serviria a mídia pelo mesmo processo que
 * atende o corretor, gastando CPU e banda do plano compartilhado — exatamente o
 * que a decisão de 21/10/2026 evitou ao escolher o R2.
 */

type Carga = {
  k: string;
  t: string;
  /** Tamanho máximo aceito, em bytes. */
  b: number;
  /** Expiração, em segundos desde a época. */
  exp: number;
  /** `u` para envio, `r` para leitura. Separados para não trocarem de papel. */
  uso: 'u' | 'r';
};

@Injectable()
export class ArmazenamentoLocal extends ArmazenamentoDeMidia {
  private readonly diretorio = resolve(process.env.MIDIA_DIR ?? '.midia-dev');

  private readonly base = (
    process.env.API_PUBLIC_URL ?? 'http://localhost:3000'
  ).replace(/\/$/, '');

  async urlDeUpload(params: {
    objectKey: string;
    contentType: string;
    tamanhoEmBytes: number;
  }): Promise<UrlDeUpload> {
    const expiraEm = new Date(
      Date.now() + VALIDADE_DO_UPLOAD_EM_SEGUNDOS * 1000,
    );

    const token = this.assinar({
      k: params.objectKey,
      t: params.contentType,
      b: params.tamanhoEmBytes,
      exp: Math.floor(expiraEm.getTime() / 1000),
      uso: 'u',
    });

    return {
      url: `${this.base}/api/midia-local/enviar?token=${token}`,
      metodo: 'PUT',
      // O tipo vai assinado: enviar com outro `content-type` e recusado.
      cabecalhos: { 'content-type': params.contentType },
      expiraEm: expiraEm.toISOString(),
    };
  }

  async urlDeLeitura(objectKey: string): Promise<string> {
    const token = this.assinar({
      k: objectKey,
      t: '',
      b: 0,
      exp: Math.floor(Date.now() / 1000) + VALIDADE_DA_LEITURA_EM_SEGUNDOS,
      uso: 'r',
    });

    return `${this.base}/api/midia-local/objeto?token=${token}`;
  }

  async remover(objectKey: string): Promise<void> {
    // `force` para nao lancar quando o objeto ja nao existe. A remocao vem
    // depois de apagar a linha, e falhar aqui mostraria erro sobre uma foto
    // que, para quem olha, ja foi removida.
    await rm(this.caminhoDe(objectKey), { force: true });
  }

  /** Grava o arquivo. Chamado pelo receptor, depois de conferir o token. */
  async gravar(
    objectKey: string,
    conteudo: Buffer,
    contentType: string,
  ): Promise<void> {
    const caminho = this.caminhoDe(objectKey);

    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, conteudo);
    // O tipo vai num arquivo ao lado, porque o disco nao guarda metadado como
    // o object storage guarda. E so o adaptador de desenvolvimento precisa
    // disso: no R2 o `content-type` viaja com o objeto.
    await writeFile(`${caminho}.tipo`, contentType, 'utf8');
  }

  /** Lê o arquivo e o tipo. `null` quando o objeto não existe. */
  async ler(
    objectKey: string,
  ): Promise<{ conteudo: Buffer; contentType: string } | null> {
    try {
      const caminho = this.caminhoDe(objectKey);
      const conteudo = await readFile(caminho);
      const contentType = await readFile(`${caminho}.tipo`, 'utf8').catch(
        () => 'application/octet-stream',
      );

      return { conteudo, contentType };
    } catch {
      return null;
    }
  }

  /**
   * Confere o token e devolve a carga.
   *
   * `timingSafeEqual` em vez de `===`: comparação de string sai no primeiro
   * byte diferente, e o tempo da resposta conta quantos bytes acertaram. É a
   * mesma razão pela qual o `SessaoService` compara hash e não token.
   */
  conferir(token: string | undefined, uso: 'u' | 'r'): Carga | null {
    if (!token) {
      return null;
    }

    const [corpo, assinatura] = token.split('.');

    if (!corpo || !assinatura) {
      return null;
    }

    const esperada = this.hmac(corpo);
    const recebida = Buffer.from(assinatura, 'utf8');
    const calculada = Buffer.from(esperada, 'utf8');

    if (
      recebida.length !== calculada.length ||
      !timingSafeEqual(recebida, calculada)
    ) {
      return null;
    }

    let carga: Carga;

    try {
      carga = JSON.parse(
        Buffer.from(corpo, 'base64url').toString('utf8'),
      ) as Carga;
    } catch {
      return null;
    }

    if (carga.uso !== uso || carga.exp * 1000 < Date.now()) {
      return null;
    }

    return carga;
  }

  private assinar(carga: Carga): string {
    const corpo = Buffer.from(JSON.stringify(carga), 'utf8').toString(
      'base64url',
    );

    return `${corpo}.${this.hmac(corpo)}`;
  }

  private hmac(corpo: string): string {
    return createHmac('sha256', segredo()).update(corpo).digest('hex');
  }

  /**
   * Caminho no disco, com a travessia de diretório fechada.
   *
   * A chave é montada pelo servidor, mas chega de volta pelo cliente no passo
   * de registro, e um `../../` nela escreveria fora da pasta de mídia. Conferir
   * que o caminho resolvido continua **dentro** do diretório é o que fecha
   * isso — e é barato o bastante para não haver desculpa.
   */
  private caminhoDe(objectKey: string): string {
    const destino = resolve(join(this.diretorio, normalize(objectKey)));

    if (
      destino !== this.diretorio &&
      !destino.startsWith(this.diretorio + sep)
    ) {
      throw new Error('Chave de objeto invalida.');
    }

    return destino;
  }
}

/**
 * O segredo das assinaturas.
 *
 * Falha ruidosamente na ausência, como o `IP_HASH_SECRET`: um adaptador que
 * assinasse com um valor padrão aceitaria URLs forjadas por qualquer pessoa que
 * leia este arquivo — e aceitaria calado, que é o pior modo de falhar.
 */
function segredo(): string {
  const valor = process.env.MIDIA_SIGN_SECRET;

  if (!valor || valor.length < 32) {
    throw new Error(
      'MIDIA_SIGN_SECRET ausente ou curta demais (minimo 32 caracteres). ' +
        "Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  return valor;
}
