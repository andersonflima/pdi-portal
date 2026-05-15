import { closeDatabase } from './database.js';
import { env } from './env.js';
import { buildApp } from './http.js';

const start = async () => {
  const app = await buildApp();

  const close = async () => {
    await app.close();
    closeDatabase();
  };

  process.on('SIGINT', close);
  process.on('SIGTERM', close);

  await app.listen({ host: '0.0.0.0', port: env.PORT });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
