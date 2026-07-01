import type { toCanvasNodes, toSaveBoard } from './canvas.mappers';

type SavedBoard = ReturnType<typeof toSaveBoard>;
type BoardPayload = Parameters<typeof toCanvasNodes>[0];

export type HistoryPayloadContext = {
  planId: string;
  lastPersistedPlanId: string | null;
  updatedAt: string;
};

/**
 * Rebuilds the board payload from a history snapshot. When the plan was never
 * persisted, a synthetic `local-history-<planId>` id is used so the mappers
 * still have a stable id to work with.
 */
export const buildHistoryBoardPayload = (parsed: SavedBoard, context: HistoryPayloadContext): BoardPayload =>
  ({
    edges: parsed.edges,
    id: context.lastPersistedPlanId ?? `local-history-${context.planId}`,
    nodes: parsed.nodes,
    pdiPlanId: context.planId,
    title: parsed.title,
    updatedAt: context.updatedAt
  }) as BoardPayload;
