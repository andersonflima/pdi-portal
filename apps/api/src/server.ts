import { env } from './env.js';
import { buildApp } from './http.js';
import { prisma } from './prisma.js';

const start = async () => {
  const app = await buildApp();

  const close = async () => {
    await app.close();
    await prisma.$disconnect();
  };

  process.on('SIGINT', close);
  process.on('SIGTERM', close);

  await app.listen({ host: '0.0.0.0', port: env.PORT });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
