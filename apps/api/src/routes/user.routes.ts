import { userSchema } from '@pdi/contracts';
import { hash } from 'bcryptjs';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { prisma } from '../prisma.js';

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
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    return users.map(toUserDto);
  });

  app.post('/users', { preHandler: requireAdmin }, async (request, reply) => {
    const input = createUserSchema.parse(request.body);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hash(input.password, 10),
        role: input.role
      }
    });

    return reply.code(201).send(toUserDto(user));
  });
};
