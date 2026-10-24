import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const prod = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);                      // behind the host's proxy: real client IPs for rate limiting
  app.use(helmet());
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  // API documentation is open in development; in production it stays closed unless ENABLE_DOCS=true.
  if (!prod || process.env.ENABLE_DOCS === 'true') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('City Smile Dental Lab API').setVersion('1.0').addBearerAuth().build());
    SwaggerModule.setup('docs', app, doc);
  }

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on port ${port} (${prod ? 'production' : 'development'})`);
}
bootstrap();
