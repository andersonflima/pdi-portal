import { runCommand } from './run-command.mjs';

await runCommand('npm', ['run', 'build', '--prefix', 'packages/contracts']);
await runCommand('npm', ['run', 'build', '--prefix', 'apps/api']);
await runCommand('npm', ['run', 'build', '--prefix', 'apps/web']);
await runCommand('node', ['scripts/copy-web-dist.mjs']);
