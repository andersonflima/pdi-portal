import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, countPdiPlansByOwner } from '../database.js';
import { authHeader, createTestApp, seedUser } from '../../test/app.js';

let app: FastifyInstance;
let admin: { id: string; role: 'ADMIN' | 'MEMBER' };

beforeAll(async () => {
  app = await createTestApp();
  admin = await seedUser({ email: 'root-admin@pdi.local', role: 'ADMIN' });
});

afterAll(async () => {
  await app.close();
  closeDatabase();
});

describe('user routes', () => {
  it('forbids members from listing users', async () => {
    const member = await seedUser({ email: 'plain-member@pdi.local', role: 'MEMBER' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: authHeader(app, member)
    });

    expect(response.statusCode).toBe(403);
  });

  it('lets an admin create a member and seeds the default roadmap', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authHeader(app, admin),
      payload: { email: 'created-member@pdi.local', name: 'Created Member', password: 'memberpass' }
    });

    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created.role).toBe('MEMBER');
    expect(countPdiPlansByOwner(created.id)).toBeGreaterThan(0);
  });

  it('rejects duplicate emails with a conflict', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authHeader(app, admin),
      payload: { email: 'dup-user@pdi.local', name: 'Dup', password: 'password1', role: 'ADMIN' }
    });

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: authHeader(app, admin),
      payload: { email: 'dup-user@pdi.local', name: 'Dup', password: 'password1', role: 'ADMIN' }
    });

    expect(conflict.statusCode).toBe(409);
  });

  it('lists users for an admin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: authHeader(app, admin)
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
    expect(response.json().length).toBeGreaterThan(0);
  });

  it('prevents an admin from deleting their own account', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/users/${admin.id}`,
      headers: authHeader(app, admin)
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when deleting an unknown user', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/users/ghost',
      headers: authHeader(app, admin)
    });

    expect(response.statusCode).toBe(404);
  });

  it('deletes an existing member', async () => {
    const victim = await seedUser({ email: 'victim@pdi.local', role: 'MEMBER' });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/users/${victim.id}`,
      headers: authHeader(app, { id: 'some-admin', role: 'ADMIN' })
    });

    expect(response.statusCode).toBe(204);
  });
});
