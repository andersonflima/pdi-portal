import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const webDist = resolve('apps/web/dist');
const apiPublic = resolve('apps/api/public');

if (!existsSync(webDist)) {
  throw new Error('Web dist not found. Run the web build before copying static assets.');
}

rmSync(apiPublic, { force: true, recursive: true });
mkdirSync(apiPublic, { recursive: true });
cpSync(webDist, apiPublic, { recursive: true });
