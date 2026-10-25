import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

// Entry for Vercel (serverless). The app is created once per warm instance and reused for the next requests.
let server: Promise<express.Express> | undefined;
function getServer() {
  server ??= (async () => {
    const instance = express();
    const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(instance), { logger: ['error', 'warn'] });
    configureApp(app);
    await app.init();
    return instance;
  })();
  return server;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try { (await getServer())(req, res); }
  catch (e) { server = undefined; res.statusCode = 500; res.end(JSON.stringify({ message: 'API failed to start', detail: (e as Error).message })); }
}
