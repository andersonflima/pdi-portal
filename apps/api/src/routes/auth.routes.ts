import { loginSchema, userSchema } from '@pdi/contracts';
import { compare } from 'bcryptjs';
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
