import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

// O .env fica na raiz do monorepo, nao dentro de apps/api.
config({ path: resolve(__dirname, '../../../.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Mesma configuracao que os testes de HTTP exercitam.
  configurarApp(app);

  const port = Number(process.env.API_PORT ?? 3333);
  await app.listen(port);

  console.log(`API no ar em http://localhost:${port}`);
  console.log(`Health check:   http://localhost:${port}/api/health`);
}

void bootstrap();
