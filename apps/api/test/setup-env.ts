import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll } from 'vitest';

// Each test file runs in its own worker, so a unique database path keeps the
// SQLite state fully isolated between test files even when running in parallel.
const tempRoot = resolve(process.cwd(), '.tmp-test');
mkdirSync(tempRoot, { recursive: true });

const databaseFile = resolve(tempRoot, `${randomUUID()}.db`);

process.env.DATABASE_URL = `file:${databaseFile}`;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-value-1234567890';
process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
process.env.PORT = process.env.PORT ?? '3333';

afterAll(() => {
  rmSync(databaseFile, { force: true });
  rmSync(`${databaseFile}-journal`, { force: true });
  rmSync(`${databaseFile}-wal`, { force: true });
  rmSync(`${databaseFile}-shm`, { force: true });
});
