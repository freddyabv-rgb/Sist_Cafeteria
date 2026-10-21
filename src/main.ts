import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { BeneventoTokens } from './platform/theme/benevento-tokens';

async function bootstrap() {
  const logger = new Logger('CoffeeOS-Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`=======================================================`);
  logger.log(`  ${BeneventoTokens.brand.name} - ${BeneventoTokens.brand.tagline}`);
  logger.log(`  CoffeeOS Servidor Local en ejecución`);
  logger.log(`  Puerto LAN: http://localhost:${port}`);
  logger.log(`  Outbox Engine & Print Bridge Activos`);
  logger.log(`=======================================================`);
}

bootstrap();
