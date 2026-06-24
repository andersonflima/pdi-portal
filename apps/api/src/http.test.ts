import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase } from './database.js';
import { createTestApp } from '../test/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  closeDatabase();
});

describe('http app', () => {
  it('exposes a health check', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('allows the configured web origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://localhost:5173' }
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('allows localhost and 127.0.0.1 origins on any port', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://127.0.0.1:4200' }
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4200');
  });

  it('does not echo a disallowed origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://evil.example.com' }
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
