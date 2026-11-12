import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { DomainExceptionFilter } from './infrastructure/api/filters/domain-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefixo global para a API
  app.setGlobalPrefix('api/v1');

  // ValidationPipe global exigido pelo class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Filtro global de exceções para mapeamento correto de status HTTP
  app.useGlobalFilters(new DomainExceptionFilter());

// Configuração do Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('Jungle Gaming Wagering API')
    .setDescription('API de processamento financeiro distribuído para iGaming')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Idempotency-Key',
        in: 'header',
        description: 'Chave de idempotência do provedor (obrigatória para transações)',
      },
      'Idempotency-Key', 
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`[Server] Aplicação a correr na porta ${port}`);
  console.log(`[Swagger] Documentação disponível em http://localhost:${port}/docs`);
}

bootstrap();