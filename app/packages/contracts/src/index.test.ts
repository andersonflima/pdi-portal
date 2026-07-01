import { describe, expect, it } from 'vitest';
import {
  boardSchema,
  bootstrapAdminSchema,
  bootstrapStatusSchema,
  canvasEdgeSchema,
  canvasNodeSchema,
  loginSchema,
  pdiPlanExportSchema,
  pdiPlanSchema,
  pdiStatusSchema,
  saveBoardSchema,
  userRoleSchema,
  userSchema
} from './index.js';

const validNode = {
  id: 'node-1',
  kind: 'NOTE' as const,
  label: 'A note',
  position: { x: 10, y: 20 },
  style: { color: '#2563eb' }
};

const validEdge = {
  id: 'edge-1',
  source: 'node-1',
  target: 'node-2'
};

describe('auth schemas', () => {
  it('accepts the known user roles', () => {
    expect(userRoleSchema.parse('ADMIN')).toBe('ADMIN');
    expect(userRoleSchema.parse('MEMBER')).toBe('MEMBER');
    expect(userRoleSchema.safeParse('OWNER').success).toBe(false);
  });

  it('validates login input', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'secret1' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'not-email', password: 'secret1' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
  });

  it('enforces bootstrap admin constraints', () => {
    expect(
      bootstrapAdminSchema.safeParse({ email: 'a@b.com', name: 'Ana', password: 'longenough' }).success
    ).toBe(true);
    expect(bootstrapAdminSchema.safeParse({ email: 'a@b.com', name: 'A', password: 'longenough' }).success).toBe(
      false
    );
    expect(bootstrapAdminSchema.safeParse({ email: 'a@b.com', name: 'Ana', password: 'short' }).success).toBe(
      false
    );
  });

  it('parses user and bootstrap status payloads', () => {
    expect(
      userSchema.parse({ id: '1', name: 'Ana', email: 'a@b.com', role: 'ADMIN' }).role
    ).toBe('ADMIN');
    expect(bootstrapStatusSchema.parse({ canCreateAdmin: true }).canCreateAdmin).toBe(true);
  });
});

describe('pdi schemas', () => {
  it('validates pdi status values', () => {
    expect(pdiStatusSchema.options).toEqual(['DRAFT', 'ACTIVE', 'DONE']);
    expect(pdiStatusSchema.safeParse('ARCHIVED').success).toBe(false);
  });

  it('parses a pdi plan with a nullable due date', () => {
    const plan = pdiPlanSchema.parse({
      id: 'p1',
      ownerId: 'u1',
      title: 'Plan',
      objective: 'Objective',
      status: 'ACTIVE',
      dueDate: null,
      createdAt: '2026-01-01T00:00:00.000Z'
    });

    expect(plan.dueDate).toBeNull();
  });
});

describe('canvas node schema', () => {
  it('accepts a minimal valid node', () => {
    expect(canvasNodeSchema.safeParse(validNode).success).toBe(true);
  });

  it('rejects an unknown node kind', () => {
    expect(canvasNodeSchema.safeParse({ ...validNode, kind: 'GHOST' }).success).toBe(false);
  });

  it('requires a color in the style', () => {
    expect(canvasNodeSchema.safeParse({ ...validNode, style: {} }).success).toBe(false);
  });

  it('bounds the text font size between 8 and 96', () => {
    const withFont = (fontSize: number) => ({
      ...validNode,
      style: { color: '#000000', textStyle: { fontSize } }
    });

    expect(canvasNodeSchema.safeParse(withFont(8)).success).toBe(true);
    expect(canvasNodeSchema.safeParse(withFont(96)).success).toBe(true);
    expect(canvasNodeSchema.safeParse(withFont(7)).success).toBe(false);
    expect(canvasNodeSchema.safeParse(withFont(97)).success).toBe(false);
  });

  it('accepts optional progress and schedule fields', () => {
    const node = {
      ...validNode,
      progress: 70,
      startDate: '2026-01-01T00:00:00.000Z',
      targetDate: '2026-03-01T00:00:00.000Z'
    };

    expect(canvasNodeSchema.safeParse(node).success).toBe(true);
  });

  it('rejects out-of-range progress', () => {
    expect(canvasNodeSchema.safeParse({ ...validNode, progress: 120 }).success).toBe(false);
    expect(canvasNodeSchema.safeParse({ ...validNode, progress: -5 }).success).toBe(false);
  });

  it('accepts optional task items', () => {
    const node = {
      ...validNode,
      kind: 'TASK_LIST' as const,
      taskItems: [{ id: 't1', label: 'Do it', checked: false }]
    };

    expect(canvasNodeSchema.safeParse(node).success).toBe(true);
  });
});

describe('canvas edge schema', () => {
  it('accepts a minimal edge and optional style', () => {
    expect(canvasEdgeSchema.safeParse(validEdge).success).toBe(true);
    expect(
      canvasEdgeSchema.safeParse({ ...validEdge, style: { lineStyle: 'dashed', type: 'step' } }).success
    ).toBe(true);
  });

  it('rejects an invalid line style', () => {
    expect(canvasEdgeSchema.safeParse({ ...validEdge, style: { lineStyle: 'dotted' } }).success).toBe(false);
  });
});

describe('board schemas', () => {
  const board = {
    id: 'b1',
    pdiPlanId: 'p1',
    title: 'Board',
    nodes: [validNode],
    edges: [validEdge],
    updatedAt: '2026-01-01T00:00:00.000Z'
  };

  it('parses a full board', () => {
    expect(boardSchema.parse(board).nodes).toHaveLength(1);
  });

  it('derives saveBoard as a picked subset', () => {
    const parsed = saveBoardSchema.parse({ title: 'Board', nodes: [validNode], edges: [validEdge] });
    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('updatedAt');
  });
});

describe('pdi plan export schema', () => {
  const exportPayload = {
    exportedAt: '2026-01-01T00:00:00.000Z',
    version: 1 as const,
    plan: { title: 'Plan', objective: 'Objective', status: 'ACTIVE' as const, dueDate: null },
    board: { title: 'Board', nodes: [validNode], edges: [validEdge] }
  };

  it('accepts a valid export payload', () => {
    expect(pdiPlanExportSchema.safeParse(exportPayload).success).toBe(true);
  });

  it('requires version to be exactly 1', () => {
    expect(pdiPlanExportSchema.safeParse({ ...exportPayload, version: 2 }).success).toBe(false);
  });

  it('enforces minimum lengths on plan fields', () => {
    expect(
      pdiPlanExportSchema.safeParse({ ...exportPayload, plan: { ...exportPayload.plan, title: 'ab' } }).success
    ).toBe(false);
  });
});
