import { boardSchema, saveBoardSchema } from '@pdi/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth.js';
import { findPdiPlanById, upsertBoardByPdiPlanId } from '../database.js';

const paramsSchema = z.object({
  pdiPlanId: z.string()
});

const liveQuerySchema = z.object({
  clientId: z.string().min(1),
  token: z.string().min(1)
});

const liveMessageSchema = z.object({
  clientId: z.string(),
  payload: saveBoardSchema,
  type: z.literal('BOARD_SYNC')
});

type LiveSocket = {
  close: (code?: number, reason?: string) => void;
  on: (event: 'close' | 'message', listener: (message?: unknown) => void) => void;
  readyState: number;
  send: (message: string) => void;
};

const liveRooms = new Map<string, Set<LiveSocket>>();

const toBoardDto = (board: {
  id: string;
  pdiPlanId: string;
  title: string;
  nodes: unknown[];
  edges: unknown[];
  updatedAt: Date;
}) =>
  boardSchema.parse({
    ...board,
    updatedAt: board.updatedAt.toISOString()
  });

const ensurePlanAccess = (user: { id: string; role: 'ADMIN' | 'MEMBER' }, pdiPlanId: string) => {
  const plan = findPdiPlanById(pdiPlanId);

  if (!plan) return null;
  if (user.role === 'ADMIN' || plan.ownerId === user.id) return plan;

  return null;
};

export const boardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/pdi-plans/:pdiPlanId/board/live', { websocket: true }, async (socket, request) => {
    const connection = socket as LiveSocket;
    const { pdiPlanId } = paramsSchema.parse(request.params);
    const { clientId, token } = liveQuerySchema.parse(request.query);
    const user = await app.jwt.verify<{ id: string; role: 'ADMIN' | 'MEMBER' }>(token);
    const plan = ensurePlanAccess(user, pdiPlanId);

    if (!plan) {
      connection.close(1008, 'PDI plan access denied');
      return;
    }

    const room = liveRooms.get(pdiPlanId) ?? new Set<LiveSocket>();
    room.add(connection);
    liveRooms.set(pdiPlanId, room);

    connection.on('message', async (message) => {
      const parsedMessage = liveMessageSchema.safeParse(JSON.parse(String(message)));

      if (!parsedMessage.success) return;

      const board = upsertBoardByPdiPlanId({
        pdiPlanId,
        title: parsedMessage.data.payload.title,
        nodes: parsedMessage.data.payload.nodes,
        edges: parsedMessage.data.payload.edges
      });
      const outbound = JSON.stringify({
        clientId,
        payload: toBoardDto(board),
        type: 'BOARD_SYNC'
      });

      for (const peer of room) {
        if (peer === connection || peer.readyState !== 1) continue;
        peer.send(outbound);
      }
    });

    connection.on('close', () => {
      room.delete(connection);
      if (room.size === 0) {
        liveRooms.delete(pdiPlanId);
      }
    });
  });

  app.get('/pdi-plans/:pdiPlanId/board', { preHandler: authenticate }, async (request) => {
    const { pdiPlanId } = paramsSchema.parse(request.params);
    const plan = ensurePlanAccess(request.user, pdiPlanId);

    if (!plan) {
      throw app.httpErrors.notFound('PDI plan not found');
    }

    const board = upsertBoardByPdiPlanId({
      pdiPlanId,
      title: `${plan.title} board`,
      nodes: [],
      edges: []
    });

    return toBoardDto(board);
  });

  app.put('/pdi-plans/:pdiPlanId/board', { preHandler: authenticate }, async (request) => {
    const { pdiPlanId } = paramsSchema.parse(request.params);
    const input = saveBoardSchema.parse(request.body);
    const plan = ensurePlanAccess(request.user, pdiPlanId);

    if (!plan) {
      throw app.httpErrors.notFound('PDI plan not found');
    }

    const board = upsertBoardByPdiPlanId({
      pdiPlanId,
      title: input.title,
      nodes: input.nodes,
      edges: input.edges
    });

    return toBoardDto(board);
  });
};
