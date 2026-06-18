import { config } from 'dotenv';
config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';

function readCorsOrigins() {
  const configuredCorsOrigins =
    process.env.CORS_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  if (process.env.NODE_ENV === 'production') {
    if (!configuredCorsOrigins.length) {
      throw new Error('CORS_ORIGINS must be configured in production.');
    }
    return configuredCorsOrigins;
  }

  return Array.from(
    new Set([
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5175',
      'http://localhost:5177',
      'http://127.0.0.1:5177',
      ...configuredCorsOrigins,
    ]),
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const bodyLimit = process.env.REQUEST_BODY_LIMIT || '12mb';
  const corsOrigins = readCorsOrigins();

  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  app.use(cookieParser());

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Ami Core API')
    .setDescription('美容院管理系统 API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 8080;
  await app.listen(port);
  console.log(`Ami Core API running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();
