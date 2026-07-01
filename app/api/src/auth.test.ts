import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authenticate, buildAuthToken, requireAdmin } from './auth.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await app.register(sensible);
  await app.register(jwt, { secret: 'test-secret-value-1234567890' });

  app.get('/protected', { preHandler: authenticate }, async (request) => ({ id: request.user.id }));
  app.get('/admin-only', { preHandler: requireAdmin }, async () => ({ ok: true }));

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('auth guards', () => {
  it('builds a signed token that verifies the user payload', async () => {
    const token = buildAuthToken(app, { id: 'user-1', role: 'MEMBER' });
    const decoded = app.jwt.verify<{ id: string; role: string }>(token);

    expect(decoded.id).toBe('user-1');
    expect(decoded.role).toBe('MEMBER');
  });

  it('rejects protected routes without a token', async () => {
    const response = await app.inject({ method: 'GET', url: '/protected' });
    expect(response.statusCode).toBe(401);
  });

  it('accepts protected routes with a valid token', async () => {
    const token = buildAuthToken(app, { id: 'user-2', role: 'MEMBER' });
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe('user-2');
  });

  it('forbids non-admins from admin-only routes', async () => {
    const token = buildAuthToken(app, { id: 'member', role: 'MEMBER' });
    const response = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows admins on admin-only routes', async () => {
    const token = buildAuthToken(app, { id: 'admin', role: 'ADMIN' });
    const response = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
  });
});
