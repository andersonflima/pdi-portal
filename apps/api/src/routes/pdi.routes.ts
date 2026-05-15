import { pdiPlanExportSchema, pdiPlanSchema } from '@pdi/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth.js';
import { prisma } from '../prisma.js';

const createPdiSchema = z.object({
  ownerId: z.string().optional(),
  title: z.string().min(3),
  objective: z.string().min(3),
  dueDate: z.string().datetime().optional()
});

const updatePdiSchema = z.object({
  ownerId: z.string().optional(),
  title: z.string().min(3).optional(),
  objective: z.string().min(3).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'DONE']).optional(),
  dueDate: z.string().datetime().nullable().optional()
});

const paramsSchema = z.object({
  id: z.string()
});

const toPlanAccessFilter = (user: { id: string; role: 'ADMIN' | 'MEMBER' }, planId: string) => ({
  id: planId,
  ...(user.role === 'ADMIN' ? {} : { ownerId: user.id })
});

const toPdiDto = (plan: {
  id: string;
  ownerId: string;
  title: string;
  objective: string;
  status: 'DRAFT' | 'ACTIVE' | 'DONE';
  dueDate: Date | null;
  createdAt: Date;
}) =>
  pdiPlanSchema.parse({
    ...plan,
    dueDate: plan.dueDate?.toISOString() ?? null,
    createdAt: plan.createdAt.toISOString()
  });

export const pdiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/pdi-plans', { preHandler: authenticate }, async (request) => {
    const where = request.user.role === 'ADMIN' ? {} : { ownerId: request.user.id };
    const plans = await prisma.pdiPlan.findMany({
      orderBy: { createdAt: 'desc' },
      where
    });

    return plans.map(toPdiDto);
  });

  app.post('/pdi-plans', { preHandler: authenticate }, async (request, reply) => {
    const input = createPdiSchema.parse(request.body);
    const ownerId = request.user.role === 'ADMIN' ? input.ownerId ?? request.user.id : request.user.id;
    const plan = await prisma.pdiPlan.create({
      data: {
        ownerId,
        title: input.title,
        objective: input.objective,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        board: {
          create: {
            title: `${input.title} board`,
            nodes: [],
            edges: []
          }
        }
      }
    });

    return reply.code(201).send(toPdiDto(plan));
  });

  app.get('/pdi-plans/:id/export', { preHandler: authenticate }, async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const plan = await prisma.pdiPlan.findFirst({
      include: { board: true },
      where: toPlanAccessFilter(request.user, id)
    });

    if (!plan) {
      throw app.httpErrors.notFound('PDI plan not found');
    }

    return pdiPlanExportSchema.parse({
      exportedAt: new Date().toISOString(),
      version: 1,
      plan: {
        title: plan.title,
        objective: plan.objective,
        status: plan.status,
        dueDate: plan.dueDate?.toISOString() ?? null
      },
      board: {
        title: plan.board?.title ?? `${plan.title} board`,
        nodes: plan.board?.nodes ?? [],
        edges: plan.board?.edges ?? []
      }
    });
  });

  app.post('/pdi-plans/import', { preHandler: authenticate }, async (request, reply) => {
    const input = pdiPlanExportSchema.parse(request.body);
    const plan = await prisma.pdiPlan.create({
      data: {
        ownerId: request.user.id,
        title: input.plan.title,
        objective: input.plan.objective,
        status: input.plan.status,
        dueDate: input.plan.dueDate ? new Date(input.plan.dueDate) : null,
        board: {
          create: {
            title: input.board.title,
            nodes: input.board.nodes,
            edges: input.board.edges
          }
        }
      }
    });

    return reply.code(201).send(toPdiDto(plan));
  });

  app.patch('/pdi-plans/:id', { preHandler: authenticate }, async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const input = updatePdiSchema.parse(request.body);
    const currentPlan = await prisma.pdiPlan.findUnique({ where: { id } });

    if (!currentPlan) {
      throw app.httpErrors.notFound('PDI plan not found');
    }

    if (request.user.role !== 'ADMIN' && currentPlan.ownerId !== request.user.id) {
      throw app.httpErrors.forbidden('PDI plan access denied');
    }

    const ownerId = request.user.role === 'ADMIN' ? input.ownerId : undefined;
    const plan = await prisma.pdiPlan.update({
      data: {
        objective: input.objective,
        ownerId,
        status: input.status,
        title: input.title,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate === null ? null : new Date(input.dueDate)
      },
      where: { id }
    });

    return toPdiDto(plan);
  });

  app.delete('/pdi-plans/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const currentPlan = await prisma.pdiPlan.findUnique({ where: { id } });

    if (!currentPlan) {
      throw app.httpErrors.notFound('PDI plan not found');
    }

    if (request.user.role !== 'ADMIN' && currentPlan.ownerId !== request.user.id) {
      throw app.httpErrors.forbidden('PDI plan access denied');
    }

    await prisma.pdiPlan.delete({ where: { id } });

    return reply.code(204).send();
  });
};
