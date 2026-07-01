import { pdiPlanExportSchema, pdiPlanSchema } from '@pdi/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth.js';
import {
  createPdiPlan,
  deletePdiPlanById,
  findPdiPlanById,
  findPdiPlanWithBoardById,
  listPdiPlans,
  updatePdiPlan,
  upsertBoardByPdiPlanId
} from '../database.js';

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

const canAccessPlan = (user: { id: string; role: 'ADMIN' | 'MEMBER' }, ownerId: string) =>
  user.role === 'ADMIN' || ownerId === user.id;

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
    const plans = listPdiPlans(request.user);
    return plans.map(toPdiDto);
  });

  app.post('/pdi-plans', { preHandler: authenticate }, async (request, reply) => {
    const input = createPdiSchema.parse(request.body);
    const ownerId = request.user.role === 'ADMIN' ? input.ownerId ?? request.user.id : request.user.id;
    const plan = createPdiPlan({
      ownerId,
      title: input.title,
      objective: input.objective,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined
    });

    upsertBoardByPdiPlanId({
      pdiPlanId: plan.id,
      title: `${input.title} board`,
      nodes: [],
      edges: []
    });

    return reply.code(201).send(toPdiDto(plan));
  });

  app.get('/pdi-plans/:id/export', { preHandler: authenticate }, async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const plan = findPdiPlanWithBoardById(id);

    if (!plan || !canAccessPlan(request.user, plan.ownerId)) {
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
    const plan = createPdiPlan({
      ownerId: request.user.id,
      title: input.plan.title,
      objective: input.plan.objective,
      status: input.plan.status,
      dueDate: input.plan.dueDate ? new Date(input.plan.dueDate) : null
    });

    upsertBoardByPdiPlanId({
      pdiPlanId: plan.id,
      title: input.board.title,
      nodes: input.board.nodes,
      edges: input.board.edges
    });

    return reply.code(201).send(toPdiDto(plan));
  });

  app.patch('/pdi-plans/:id', { preHandler: authenticate }, async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const input = updatePdiSchema.parse(request.body);
    const currentPlan = findPdiPlanById(id);

    if (!currentPlan) {
      throw app.httpErrors.notFound('PDI plan not found');
    }

    if (!canAccessPlan(request.user, currentPlan.ownerId)) {
      throw app.httpErrors.forbidden('PDI plan access denied');
    }

    const ownerId = request.user.role === 'ADMIN' ? input.ownerId ?? currentPlan.ownerId : currentPlan.ownerId;
    const plan = updatePdiPlan({
      id,
      ownerId,
      objective: input.objective ?? currentPlan.objective,
      status: input.status ?? currentPlan.status,
      title: input.title ?? currentPlan.title,
      dueDate:
        input.dueDate === undefined
          ? currentPlan.dueDate
          : input.dueDate === null
            ? null
            : new Date(input.dueDate)
    });

    return toPdiDto(plan);
  });

  app.delete('/pdi-plans/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const currentPlan = findPdiPlanById(id);

    if (!currentPlan) {
      throw app.httpErrors.notFound('PDI plan not found');
    }

    if (!canAccessPlan(request.user, currentPlan.ownerId)) {
      throw app.httpErrors.forbidden('PDI plan access denied');
    }

    deletePdiPlanById(id);

    return reply.code(204).send();
  });
};
