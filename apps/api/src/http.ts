import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { env } from './env.js';
import { registerRoutes } from './routes/index.js';
import { registerStaticAssets } from './static-assets.js';

export const buildApp = async () => {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    credentials: true,
    origin: env.WEB_ORIGIN
  });
  await app.register(sensible);
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(websocket);
  await app.register(registerRoutes, { prefix: '/api' });

  app.get('/healthz', async () => ({ status: 'ok' }));
  await registerStaticAssets(app);

  return app;
};
