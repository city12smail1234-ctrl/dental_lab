import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

/** Shared by the normal server (main.ts) and the Vercel serverless entry (serverless.ts), so both behave identically. */
export function configureApp(app: NestExpressApplication, opts: { shutdownHooks?: boolean } = {}) {
  const prod = process.env.NODE_ENV === 'production';
  app.set('trust proxy', 1);                      // behind the host's proxy: real client IPs for rate limiting
  app.use(helmet());
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  if (opts.shutdownHooks) app.enableShutdownHooks();

  // API documentation is open in development; in production it stays closed unless ENABLE_DOCS=true.
  if (!prod || process.env.ENABLE_DOCS === 'true') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('City Smile Dental Lab API').setVersion('1.0').addBearerAuth().build());
    SwaggerModule.setup('docs', app, doc);
  }
}
