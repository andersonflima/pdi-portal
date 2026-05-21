import { userSchema } from '@pdi/contracts';
import { hash } from 'bcryptjs';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import {
  countAdmins,
  createUser,
  deleteUserById,
  findUserById,
  isUniqueUserEmailError,
  listUsers,
  withTransaction
} from '../database.js';
import { upsertDefaultRoadmapForUser } from '../default-roadmap-plan.js';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER')
});

const userParamsSchema = z.object({
  id: z.string().min(1)
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
    const passwordHash = await hash(input.password, 10);

    try {
      const user = withTransaction(() => {
        const createdUser = createUser({
          email: input.email,
          name: input.name,
          passwordHash,
          role: input.role
        });

        if (createdUser.role === 'MEMBER') {
          upsertDefaultRoadmapForUser({ ownerId: createdUser.id });
        }

        return createdUser;
      });

      return reply.code(201).send(toUserDto(user));
    } catch (error) {
      if (isUniqueUserEmailError(error)) {
        throw app.httpErrors.conflict('User email already exists');
      }

      throw error;
    }
  });

  app.delete('/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = userParamsSchema.parse(request.params);

    if (id === request.user.id) {
      throw app.httpErrors.badRequest('Tech Lead cannot delete own account');
    }

    const user = findUserById(id);

    if (!user) {
      throw app.httpErrors.notFound('User not found');
    }

    if (user.role === 'ADMIN' && countAdmins() <= 1) {
      throw app.httpErrors.conflict('Cannot delete the last Tech Lead');
    }

    const deleted = deleteUserById(id);

    if (!deleted) {
      throw app.httpErrors.notFound('User not found');
    }

    return reply.code(204).send();
  });
};
