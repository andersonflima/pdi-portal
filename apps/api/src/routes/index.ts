import type { FastifyPluginAsync } from 'fastify';
import { authRoutes } from './auth.routes.js';
import { boardRoutes } from './board.routes.js';
import { pdiRoutes } from './pdi.routes.js';
import { userRoutes } from './user.routes.js';

export const registerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(pdiRoutes);
  await app.register(boardRoutes);
};
