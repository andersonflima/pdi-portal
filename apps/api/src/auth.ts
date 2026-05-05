import type { FastifyInstance, FastifyRequest } from 'fastify';

type JwtUser = {
  id: string;
  role: 'ADMIN' | 'MEMBER';
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

export const authenticate = async (request: FastifyRequest) => {
  await request.jwtVerify();
};

export const requireAdmin = async (request: FastifyRequest) => {
  await request.jwtVerify();

  if (request.user.role !== 'ADMIN') {
    throw request.server.httpErrors.forbidden('Admin access required');
  }
};

export const buildAuthToken = (app: FastifyInstance, user: JwtUser) =>
  app.jwt.sign(user, { expiresIn: '8h' });
