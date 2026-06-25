import { execFileSync } from 'node:child_process';

/**
 * Seeds the local database before the e2e run so the login flow has a known
 * Tech Lead account. The dev script only creates the schema (`db:setup`); the
 * e2e suite additionally needs seeded users to sign in.
 *
 * Honors E2E_API_PORT so the API can be started on an alternate port when the
 * default (3333) is taken by another local service.
 */
export default async function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: process.env['DATABASE_URL'] || 'file:../data/pdi.db',
    JWT_SECRET: process.env['JWT_SECRET'] || 'change-this-secret-before-production',
    PORT: process.env['E2E_API_PORT'] || process.env['PORT'] || '3333',
    WEB_ORIGIN: process.env['WEB_ORIGIN'] || 'http://localhost:5173'
  };

  execFileSync('npm', ['--prefix', 'apps/api', 'run', 'db:seed'], { stdio: 'inherit', env });
}
