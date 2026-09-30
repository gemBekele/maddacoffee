import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  // Validation is handled per-route with ZodValidationPipe (see common/zod.pipe.ts).
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  new Logger('MADDA').log(`API running on http://localhost:${port}/api`);
}
bootstrap();
