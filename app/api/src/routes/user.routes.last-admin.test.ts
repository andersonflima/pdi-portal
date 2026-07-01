import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase } from '../database.js';
import { authHeader, createTestApp, seedUser } from '../../test/app.js';

// Isolated in its own file so the database holds exactly one admin, making the
// "last admin" guard deterministic.
let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  closeDatabase();
});

describe('user routes - last admin guard', () => {
  it('refuses to delete the only remaining admin', async () => {
    const onlyAdmin = await seedUser({ email: 'only-admin@pdi.local', role: 'ADMIN' });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/users/${onlyAdmin.id}`,
      // A different admin id avoids the self-delete guard so we reach the count guard.
      headers: authHeader(app, { id: 'requesting-admin', role: 'ADMIN' })
    });

    expect(response.statusCode).toBe(409);
  });
});
