import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

const staticRoot = resolve(fileURLToPath(new URL('../public', import.meta.url)));

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

const toSafeStaticPath = (requestUrl: string) => {
  const pathname = new URL(requestUrl, 'http://localhost').pathname;
  const relativePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const requestedPath = resolve(staticRoot, relativePath.replace(/^[/\\]/, ''));

  return requestedPath.startsWith(`${staticRoot}${sep}`) || requestedPath === staticRoot ? requestedPath : null;
};

const toExistingAssetPath = (requestUrl: string) => {
  const requestedPath = toSafeStaticPath(requestUrl);

  if (requestedPath && existsSync(requestedPath) && statSync(requestedPath).isFile()) {
    return requestedPath;
  }

  const indexPath = join(staticRoot, 'index.html');

  return existsSync(indexPath) ? indexPath : null;
};

export const registerStaticAssets = async (app: FastifyInstance) => {
  app.get('/*', async (request, reply) => {
    const requestUrl = request.raw.url ?? '/';

    if (requestUrl.startsWith('/api')) {
      return reply.notFound();
    }

    const assetPath = toExistingAssetPath(requestUrl);

    if (!assetPath) {
      return reply.notFound();
    }

    return reply.type(contentTypes[extname(assetPath)] ?? 'application/octet-stream').send(createReadStream(assetPath));
  });
};
