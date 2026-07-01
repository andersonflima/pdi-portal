import { toLocalEnv } from './corporate-env.mjs';
import { runCommand } from './run-command.mjs';

const env = toLocalEnv();

await runCommand('npm', ['run', 'db:push', '--prefix', 'app/api'], { env });
await runCommand('npm', ['run', 'db:seed', '--prefix', 'app/api'], { env });
