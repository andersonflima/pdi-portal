import { hash } from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/http.js';
import { createUser } from '../src/database.js';

export type SeededUser = {
  id: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
};

export const createTestApp = async (): Promise<FastifyInstance> => {
  const app = await buildApp();
  await app.ready();
  return app;
};

export const seedUser = async (input: {
  email: string;
  name?: string;
  password?: string;
  role: 'ADMIN' | 'MEMBER';
}): Promise<SeededUser> => {
  const passwordHash = await hash(input.password ?? 'password123', 4);
  const user = createUser({
    email: input.email,
    name: input.name ?? input.email,
    passwordHash,
    role: input.role
  });

  return { id: user.id, email: user.email, role: user.role };
};

export const authHeader = (app: FastifyInstance, user: { id: string; role: 'ADMIN' | 'MEMBER' }) => ({
  authorization: `Bearer ${app.jwt.sign({ id: user.id, role: user.role })}`
});
