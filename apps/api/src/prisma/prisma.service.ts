import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

const HOSTS_LOCAIS = ['localhost', '127.0.0.1', '::1'];

/**
 * Monta a conexao do Prisma 7, que recebe a conexao por driver adapter em vez
 * da URL do schema. Para MySQL o adapter oficial e o @prisma/adapter-mariadb.
 *
 * ## Por que a configuracao e um objeto, e nao a URL direta
 *
 * O MySQL 8 autentica com `caching_sha2_password`. Em conexao **sem TLS**, o
 * cliente precisa da chave publica RSA do servidor para cifrar a senha, e o
 * driver se recusa a pedir essa chave sem permissao explicita — falha com
 * `ER_CANNOT_RETRIEVE_RSA_KEY`, e o pool devolve "failed to retrieve a
 * connection" depois de dez segundos.
 *
 * O detalhe que torna isso traicoeiro: o MySQL **guarda em cache** a
 * autenticacao bem-sucedida. Depois que qualquer cliente autentica (a CLI do
 * Prisma, por exemplo, que resolve isso sozinha), as conexoes seguintes usam o
 * caminho rapido e funcionam sem a chave. A aplicacao parece saudavel — ate o
 * container reiniciar, um `FLUSH PRIVILEGES` rodar, ou alguem clonar o projeto
 * em outra maquina. Foi assim que o problema apareceu aqui.
 *
 * ## Por que `allowPublicKeyRetrieval` e condicional
 *
 * Pedir a chave publica ao proprio servidor em canal nao cifrado abre espaco
 * para interceptacao: quem estiver no meio entrega a *sua* chave e le a senha.
 * Em `127.0.0.1` nao existe meio — o trafego nao sai da maquina — e o risco e
 * aceitavel. Fora disso, nao: a conexao precisa de TLS, e habilitar a busca da
 * chave seria trocar uma falha visivel por uma vulnerabilidade silenciosa.
 *
 * Quando a hospedagem gerenciada for avaliada (Fase 4), a conexao de producao
 * tera de usar TLS. Ver docs/architecture.md.
 */
function montarConfiguracaoDoPool() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL nao definida. Copie .env.example para .env na raiz do monorepo.',
    );
  }

  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    throw new Error(
      'DATABASE_URL invalida. Formato esperado: mysql://usuario:senha@host:porta/banco',
    );
  }

  const host = endereco.hostname;
  const ehLocal = HOSTS_LOCAIS.includes(host);
  const emProducao = process.env.NODE_ENV === 'production';
  const comTls = endereco.searchParams.get('ssl') === 'true';

  if (!ehLocal && !comTls) {
    // Aviso, e nao excecao: derrubar a API por causa disto em um ambiente de
    // homologacao seria pior do que registrar o problema. Em producao, a
    // conexao simplesmente vai falhar se o servidor exigir a chave.
    new Logger('PrismaService').warn(
      `Conexao com ${host} sem TLS. Em MySQL 8 isto pode falhar na ` +
        'autenticacao, e expoe a senha a interceptacao. Configure TLS.',
    );
  }

  return {
    host,
    port: endereco.port ? Number(endereco.port) : 3306,
    user: decodeURIComponent(endereco.username),
    // A senha vem percent-encoded na URL; sem decodificar, caractere especial
    // viraria senha errada.
    password: decodeURIComponent(endereco.password),
    database: endereco.pathname.replace(/^\//, ''),
    ssl: comTls,
    allowPublicKeyRetrieval: ehLocal && !emProducao,
    // Hospedagem gerenciada costuma limitar conexoes simultaneas por banco.
    // Precisa ser conferido contra o plano antes do deploy (Fase 4).
    connectionLimit: Number(process.env.DATABASE_POOL_LIMIT ?? 10),
  };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ adapter: new PrismaMariaDb(montarConfiguracaoDoPool()) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    // $connect() do Prisma nao garante que o pool consegue abrir conexao: o
    // erro de autenticacao so aparece na primeira consulta. Sem esta
    // verificacao, a API sobe anunciando sucesso e falha no primeiro pedido.
    await this.$queryRaw`SELECT 1`;

    this.logger.log('Conectado ao MySQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Usada pelo health check. Nao propaga o erro ao cliente: mensagem de erro
   * de banco entrega topologia e versao a quem perguntar.
   */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('MySQL inacessivel', error as Error);
      return false;
    }
  }
}
