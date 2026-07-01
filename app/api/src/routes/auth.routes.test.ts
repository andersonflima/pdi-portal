import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, countPdiPlansByOwner } from '../database.js';
import { authHeader, createTestApp, seedUser } from '../../test/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  closeDatabase();
});

describe('auth routes', () => {
  it('reports bootstrap availability while there is no admin', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/bootstrap-status' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ canCreateAdmin: true });
  });

  it('rejects invalid bootstrap-admin payloads', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap-admin',
      payload: { email: 'not-an-email', name: 'A', password: 'short' }
    });

    expect(response.statusCode).toBe(500);
  });

  it('creates the first admin and then refuses a second bootstrap', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap-admin',
      payload: { email: 'boss@pdi.local', name: 'Boss', password: 'supersecret' }
    });

    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe('ADMIN');

    const statusAfter = await app.inject({ method: 'GET', url: '/api/auth/bootstrap-status' });
    expect(statusAfter.json()).toEqual({ canCreateAdmin: false });

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap-admin',
      payload: { email: 'other@pdi.local', name: 'Other', password: 'supersecret' }
    });

    expect(second.statusCode).toBe(409);
  });

  it('logs in with valid credentials and seeds a roadmap for members', async () => {
    await seedUser({ email: 'member-login@pdi.local', password: 'memberpass', role: 'MEMBER' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'member-login@pdi.local', password: 'memberpass' }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.email).toBe('member-login@pdi.local');
    expect(countPdiPlansByOwner(body.user.id)).toBeGreaterThan(0);
  });

  it('rejects invalid credentials', async () => {
    await seedUser({ email: 'wrong-pass@pdi.local', password: 'correct1', role: 'MEMBER' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'wrong-pass@pdi.local', password: 'incorrect' }
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects login for an unknown user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@pdi.local', password: 'whatever1' }
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns the current user for an authenticated request', async () => {
    const user = await seedUser({ email: 'me@pdi.local', role: 'ADMIN' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(app, user)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe('me@pdi.local');
  });

  it('requires a token on /auth/me', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when the authenticated user no longer exists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(app, { id: 'ghost-id', role: 'MEMBER' })
    });

    expect(response.statusCode).toBe(404);
  });
});
