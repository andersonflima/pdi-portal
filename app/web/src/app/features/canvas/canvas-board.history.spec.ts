import { describe, expect, it } from 'vitest';
import { buildHistoryBoardPayload } from './canvas-board.history';
import { toSaveBoard } from './canvas.mappers';

const parsed = toSaveBoard('My board', [], []);

describe('buildHistoryBoardPayload', () => {
  it('uses the persisted plan id when the plan was already saved', () => {
    const payload = buildHistoryBoardPayload(parsed, {
      planId: 'plan-1',
      lastPersistedPlanId: 'persisted-1',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(payload).toMatchObject({
      id: 'persisted-1',
      pdiPlanId: 'plan-1',
      title: 'My board',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });
  });

  it('falls back to a synthetic local-history id when never persisted', () => {
    const payload = buildHistoryBoardPayload(parsed, {
      planId: 'plan-1',
      lastPersistedPlanId: null,
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(payload.id).toBe('local-history-plan-1');
  });

  it('carries nodes and edges through from the snapshot', () => {
    const payload = buildHistoryBoardPayload(parsed, {
      planId: 'plan-1',
      lastPersistedPlanId: null,
      updatedAt: 'now'
    });

    expect(payload.nodes).toBe(parsed.nodes);
    expect(payload.edges).toBe(parsed.edges);
  });
});
