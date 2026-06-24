import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase } from './database.js';
import { createTestApp } from '../test/app.js';

// The public directory is produced by the web build and git-ignored, so it may be
// absent during isolated/CI test runs. Ensure a minimal SPA index exists and only
// clean up what this test created.
const staticRoot = fileURLToPath(new URL('../public', import.meta.url));
const indexPath = fileURLToPath(new URL('../public/index.html', import.meta.url));
let createdIndex = false;

let app: FastifyInstance;

beforeAll(async () => {
  if (!existsSync(indexPath)) {
    mkdirSync(staticRoot, { recursive: true });
    writeFileSync(indexPath, '<!doctype html><title>PDI</title>');
    createdIndex = true;
  }

  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  closeDatabase();

  if (createdIndex) {
    rmSync(indexPath, { force: true });
  }
});

describe('static assets', () => {
  it('serves the SPA index for the root path', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('falls back to the SPA index for unknown client routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/workspace/anything' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('returns 404 for unknown api routes instead of the SPA', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/totally-unknown' });

    expect(response.statusCode).toBe(404);
  });

  it('blocks path traversal and falls back to the SPA index', async () => {
    const response = await app.inject({ method: 'GET', url: '/../../../../etc/passwd' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('serves a real asset with its content type', async () => {
    const indexResponse = await app.inject({ method: 'GET', url: '/index.html' });

    expect(indexResponse.statusCode).toBe(200);
    expect(indexResponse.headers['content-type']).toContain('text/html');
  });
});
