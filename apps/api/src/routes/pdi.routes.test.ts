import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase } from '../database.js';
import { authHeader, createTestApp, seedUser } from '../../test/app.js';

let app: FastifyInstance;
let admin: { id: string; role: 'ADMIN' | 'MEMBER' };
let member: { id: string; role: 'ADMIN' | 'MEMBER' };
let otherMember: { id: string; role: 'ADMIN' | 'MEMBER' };

const createPlan = async (
  owner: { id: string; role: 'ADMIN' | 'MEMBER' },
  payload: Record<string, unknown>
) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/pdi-plans',
    headers: authHeader(app, owner),
    payload
  });
  return response;
};

beforeAll(async () => {
  app = await createTestApp();
  admin = await seedUser({ email: 'pdi-admin@pdi.local', role: 'ADMIN' });
  member = await seedUser({ email: 'pdi-member@pdi.local', role: 'MEMBER' });
  otherMember = await seedUser({ email: 'pdi-other@pdi.local', role: 'MEMBER' });
});

afterAll(async () => {
  await app.close();
  closeDatabase();
});

describe('pdi routes', () => {
  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/pdi-plans' });
    expect(response.statusCode).toBe(401);
  });

  it('creates a plan owned by the member', async () => {
    const response = await createPlan(member, { title: 'Member plan', objective: 'Grow skills' });

    expect(response.statusCode).toBe(201);
    expect(response.json().ownerId).toBe(member.id);
  });

  it('lets an admin assign ownership and create a plan with a due date', async () => {
    const response = await createPlan(admin, {
      title: 'Admin assigned',
      objective: 'Lead the team',
      ownerId: member.id,
      dueDate: '2030-06-01T00:00:00.000Z'
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().ownerId).toBe(member.id);
  });

  it('rejects invalid create payloads', async () => {
    const response = await createPlan(member, { title: 'No', objective: 'x' });
    expect(response.statusCode).toBe(500);
  });

  it('lists only the members own plans', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/pdi-plans',
      headers: authHeader(app, member)
    });

    expect(response.statusCode).toBe(200);
    const plans = response.json();
    expect(plans.every((plan: { ownerId: string }) => plan.ownerId === member.id)).toBe(true);
  });

  it('updates a plan, honoring partial fields and due date semantics', async () => {
    const created = (await createPlan(member, { title: 'To update', objective: 'Initial' })).json();

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/pdi-plans/${created.id}`,
      headers: authHeader(app, member),
      payload: { status: 'ACTIVE', dueDate: '2031-01-01T00:00:00.000Z' }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().status).toBe('ACTIVE');
    expect(updated.json().dueDate).toBe('2031-01-01T00:00:00.000Z');

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/pdi-plans/${created.id}`,
      headers: authHeader(app, member),
      payload: { dueDate: null }
    });

    expect(cleared.json().dueDate).toBeNull();
  });

  it('returns 404 when updating an unknown plan', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/pdi-plans/missing',
      headers: authHeader(app, member),
      payload: { title: 'Nope' }
    });

    expect(response.statusCode).toBe(404);
  });

  it('forbids updating a plan owned by someone else', async () => {
    const created = (await createPlan(member, { title: 'Private', objective: 'Mine only' })).json();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/pdi-plans/${created.id}`,
      headers: authHeader(app, otherMember),
      payload: { title: 'Hijack' }
    });

    expect(response.statusCode).toBe(403);
  });

  it('exports a plan with its board', async () => {
    const created = (await createPlan(member, { title: 'Exportable', objective: 'Document me' })).json();

    const response = await app.inject({
      method: 'GET',
      url: `/api/pdi-plans/${created.id}/export`,
      headers: authHeader(app, member)
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version).toBe(1);
    expect(body.plan.title).toBe('Exportable');
    expect(Array.isArray(body.board.nodes)).toBe(true);
  });

  it('returns 404 when exporting an inaccessible plan', async () => {
    const created = (await createPlan(member, { title: 'Hidden', objective: 'Secret plan' })).json();

    const response = await app.inject({
      method: 'GET',
      url: `/api/pdi-plans/${created.id}/export`,
      headers: authHeader(app, otherMember)
    });

    expect(response.statusCode).toBe(404);
  });

  it('imports a plan from an export payload', async () => {
    const created = (await createPlan(member, { title: 'Source plan', objective: 'Export source' })).json();
    const exported = (
      await app.inject({
        method: 'GET',
        url: `/api/pdi-plans/${created.id}/export`,
        headers: authHeader(app, member)
      })
    ).json();

    const response = await app.inject({
      method: 'POST',
      url: '/api/pdi-plans/import',
      headers: authHeader(app, otherMember),
      payload: exported
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().ownerId).toBe(otherMember.id);
  });

  it('deletes a plan and guards ownership', async () => {
    const created = (await createPlan(member, { title: 'Deletable', objective: 'Remove me' })).json();

    const forbidden = await app.inject({
      method: 'DELETE',
      url: `/api/pdi-plans/${created.id}`,
      headers: authHeader(app, otherMember)
    });
    expect(forbidden.statusCode).toBe(403);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/pdi-plans/${created.id}`,
      headers: authHeader(app, member)
    });
    expect(deleted.statusCode).toBe(204);

    const missing = await app.inject({
      method: 'DELETE',
      url: `/api/pdi-plans/${created.id}`,
      headers: authHeader(app, member)
    });
    expect(missing.statusCode).toBe(404);
  });
});
