import { bootstrapAdminSchema, bootstrapStatusSchema, loginSchema, userSchema } from '@pdi/contracts';
import { compare, hash } from 'bcryptjs';
import type { FastifyPluginAsync } from 'fastify';
import { buildAuthToken, authenticate } from '../auth.js';
import {
  countAdmins,
  countPdiPlansByOwner,
  createUser,
  findUserByEmail,
  findUserById,
  isUniqueUserEmailError,
  withTransaction
} from '../database.js';
import { upsertDefaultRoadmapForUser } from '../default-roadmap-plan.js';

const toUserDto = (user: {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
}) => userSchema.parse(user);

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/bootstrap-status', async () => {
    const adminCount = countAdmins();
    return bootstrapStatusSchema.parse({ canCreateAdmin: adminCount === 0 });
  });

  app.post('/auth/bootstrap-admin', async (request, reply) => {
    const input = bootstrapAdminSchema.parse(request.body);
    const passwordHash = await hash(input.password, 10);

    try {
      const user = withTransaction(() => {
        const adminCount = countAdmins();

        if (adminCount > 0) {
          throw app.httpErrors.conflict('Admin bootstrap already completed');
        }

        return createUser({
          email: input.email,
          name: input.name,
          passwordHash,
          role: 'ADMIN'
        });
      });

      return reply.code(201).send({
        token: buildAuthToken(app, { id: user.id, role: user.role }),
        user: toUserDto(user)
      });
    } catch (error) {
      if (isUniqueUserEmailError(error)) {
        throw app.httpErrors.conflict('Admin bootstrap already completed');
      }

      throw error;
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = findUserByEmail(input.email);

    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw app.httpErrors.unauthorized('Invalid credentials');
    }

    if (user.role === 'MEMBER' && countPdiPlansByOwner(user.id) === 0) {
      upsertDefaultRoadmapForUser({ ownerId: user.id });
    }

    return reply.send({
      token: buildAuthToken(app, { id: user.id, role: user.role }),
      user: toUserDto(user)
    });
  });

  app.get('/auth/me', { preHandler: authenticate }, async (request) => {
    const user = findUserById(request.user.id);

    if (!user) {
      throw app.httpErrors.notFound('User not found');
    }

    return toUserDto(user);
  });
};
