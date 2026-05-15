import { userSchema } from '@pdi/contracts';
import { hash } from 'bcryptjs';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { createUser, isUniqueUserEmailError, listUsers } from '../database.js';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER')
});

const toUserDto = (user: {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
}) => userSchema.parse(user);

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get('/users', { preHandler: requireAdmin }, async () => {
    const users = listUsers();
    return users.map(toUserDto);
  });

  app.post('/users', { preHandler: requireAdmin }, async (request, reply) => {
    const input = createUserSchema.parse(request.body);

    try {
      const user = createUser({
        email: input.email,
        name: input.name,
        passwordHash: await hash(input.password, 10),
        role: input.role
      });

      return reply.code(201).send(toUserDto(user));
    } catch (error) {
      if (isUniqueUserEmailError(error)) {
        throw app.httpErrors.conflict('User email already exists');
      }

      throw error;
    }
  });
};
