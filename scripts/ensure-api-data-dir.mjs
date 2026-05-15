import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const apiDataDir = resolve(process.cwd(), 'data');

mkdirSync(apiDataDir, { recursive: true });
