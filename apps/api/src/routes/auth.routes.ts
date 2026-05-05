import { bootstrapAdminSchema, bootstrapStatusSchema, loginSchema, userSchema } from '@pdi/contracts';
import { compare, hash } from 'bcryptjs';
import type { FastifyPluginAsync } from 'fastify';
import { buildAuthToken, authenticate } from '../auth.js';
import { prisma } from '../prisma.js';

const toUserDto = (user: {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
}) => userSchema.parse(user);

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/bootstrap-status', async () => {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    return bootstrapStatusSchema.parse({ canCreateAdmin: adminCount === 0 });
  });

  app.post('/auth/bootstrap-admin', async (request, reply) => {
    const input = bootstrapAdminSchema.parse(request.body);

    const user = await prisma.$transaction(async (transaction) => {
      const adminCount = await transaction.user.count({ where: { role: 'ADMIN' } });

      if (adminCount > 0) {
        throw app.httpErrors.conflict('Admin bootstrap already completed');
      }

      return transaction.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await hash(input.password, 10),
          role: 'ADMIN'
        }
      });
    });

    return reply.code(201).send({
      token: buildAuthToken(app, { id: user.id, role: user.role }),
      user: toUserDto(user)
    });
  });

  app.post('/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw app.httpErrors.unauthorized('Invalid credentials');
    }

    return reply.send({
      token: buildAuthToken(app, { id: user.id, role: user.role }),
      user: toUserDto(user)
    });
  });

  app.get('/auth/me', { preHandler: authenticate }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.id } });
    return toUserDto(user);
  });
};
