import type { CanvasNode } from '@pdi/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase } from '../database.js';
import { softwareDeveloperRoadmapPlanTitle } from '../software-developer-roadmap-template.js';
import { authHeader, createTestApp, seedUser } from '../../test/app.js';

let app: FastifyInstance;
let member: { id: string; role: 'ADMIN' | 'MEMBER' };
let otherMember: { id: string; role: 'ADMIN' | 'MEMBER' };

const createPlan = async (
  owner: { id: string; role: 'ADMIN' | 'MEMBER' },
  title: string
): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/pdi-plans',
    headers: authHeader(app, owner),
    payload: { title, objective: 'Board objective' }
  });
  return response.json().id;
};

const frame = (id: string, x: number, y: number, width: number, height: number): CanvasNode => ({
  id,
  kind: 'FRAME',
  label: id,
  position: { x, y },
  style: { color: '#1f2937', width, height }
});

const note = (id: string, x: number, y: number): CanvasNode => ({
  id,
  kind: 'NOTE',
  label: id,
  position: { x, y },
  style: { color: '#2563eb', width: 50, height: 50 }
});

beforeAll(async () => {
  app = await createTestApp();
  member = await seedUser({ email: 'board-member@pdi.local', role: 'MEMBER' });
  otherMember = await seedUser({ email: 'board-other@pdi.local', role: 'MEMBER' });
});

afterAll(async () => {
  await app.close();
  closeDatabase();
});

describe('board routes', () => {
  it('requires authentication to read a board', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/pdi-plans/any/board' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for an unknown or inaccessible plan', async () => {
    const planId = await createPlan(member, 'Solo plan');

    const missing = await app.inject({
      method: 'GET',
      url: '/api/pdi-plans/does-not-exist/board',
      headers: authHeader(app, member)
    });
    expect(missing.statusCode).toBe(404);

    const denied = await app.inject({
      method: 'GET',
      url: `/api/pdi-plans/${planId}/board`,
      headers: authHeader(app, otherMember)
    });
    expect(denied.statusCode).toBe(404);
  });

  it('returns the empty board created alongside the plan', async () => {
    const planId = await createPlan(member, 'Empty board plan');

    const response = await app.inject({
      method: 'GET',
      url: `/api/pdi-plans/${planId}/board`,
      headers: authHeader(app, member)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().nodes).toEqual([]);
    expect(response.json().edges).toEqual([]);
  });

  it('saves a board through PUT', async () => {
    const planId = await createPlan(member, 'Savable board plan');

    const response = await app.inject({
      method: 'PUT',
      url: `/api/pdi-plans/${planId}/board`,
      headers: authHeader(app, member),
      payload: {
        title: 'My board',
        nodes: [note('n1', 10, 10)],
        edges: []
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('My board');
    expect(response.json().nodes).toHaveLength(1);
  });

  it('persists per-step progress and schedule fields across save and reload', async () => {
    const planId = await createPlan(member, 'Progress board plan');
    const trackedNode: CanvasNode = {
      ...note('task-1', 20, 20),
      kind: 'TASK',
      progress: 70,
      startDate: '2026-01-01T00:00:00.000Z',
      targetDate: '2026-03-01T00:00:00.000Z'
    };

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/pdi-plans/${planId}/board`,
      headers: authHeader(app, member),
      payload: { title: 'Tracked board', nodes: [trackedNode], edges: [] }
    });
    expect(saved.statusCode).toBe(200);

    const reloaded = await app.inject({
      method: 'GET',
      url: `/api/pdi-plans/${planId}/board`,
      headers: authHeader(app, member)
    });

    const persisted = reloaded.json().nodes.find((node: { id: string }) => node.id === 'task-1');
    expect(persisted.progress).toBe(70);
    expect(persisted.startDate).toBe('2026-01-01T00:00:00.000Z');
    expect(persisted.targetDate).toBe('2026-03-01T00:00:00.000Z');
  });

  it('recovers the roadmap template when a roadmap board is empty', async () => {
    const planId = await createPlan(member, softwareDeveloperRoadmapPlanTitle);

    const response = await app.inject({
      method: 'GET',
      url: `/api/pdi-plans/${planId}/board`,
      headers: authHeader(app, member)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().nodes.length).toBeGreaterThan(0);
  });

  it('normalizes frame parenting for an existing roadmap board', async () => {
    const planId = await createPlan(member, softwareDeveloperRoadmapPlanTitle);

    await app.inject({
      method: 'PUT',
      url: `/api/pdi-plans/${planId}/board`,
      headers: authHeader(app, member),
      payload: {
        title: 'Roadmap board',
        nodes: [frame('frame-1', 0, 0, 400, 400), note('note-1', 100, 100)],
        edges: []
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/pdi-plans/${planId}/board`,
      headers: authHeader(app, member)
    });

    expect(response.statusCode).toBe(200);
    const normalizedNote = response.json().nodes.find((node: { id: string }) => node.id === 'note-1');
    expect(normalizedNote.parentId).toBe('frame-1');
  });
});
