import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { env } from './env.js';
import { registerRoutes } from './routes/index.js';
import { registerStaticAssets } from './static-assets.js';

const localOriginPattern = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

const isAllowedOrigin = (origin: string | undefined) =>
  !origin || origin === env.WEB_ORIGIN || localOriginPattern.test(origin);

export const buildApp = async () => {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    }
  });
  await app.register(sensible);
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(websocket);
  await app.register(registerRoutes, { prefix: '/api' });

  app.get('/healthz', async () => ({ status: 'ok' }));
  await registerStaticAssets(app);

  return app;
};
