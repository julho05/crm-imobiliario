import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// O .env fica na raiz do monorepo, nao dentro de apps/api.
config({ path: resolve(__dirname, '../../../.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS estrito: so o front conhecido, e com credenciais para o cookie
  // de sessao funcionar (ver docs/architecture.md).
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 3333);
  await app.listen(port);

  console.log(`API no ar em http://localhost:${port}`);
  console.log(`Health check:   http://localhost:${port}/health`);
}

void bootstrap();
