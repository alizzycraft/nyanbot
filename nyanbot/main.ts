console.log('main.ts loaded');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('Bootstrapping application');
  // Create a standalone application context and set console log levels
  await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
}
void bootstrap();
