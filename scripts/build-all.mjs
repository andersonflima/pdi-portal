import { runCommand } from './run-command.mjs';

await runCommand('npm', ['run', 'build', '--prefix', 'packages/contracts']);
await runCommand('npm', ['run', 'build', '--prefix', 'app/api']);
await runCommand('npm', ['run', 'build', '--prefix', 'app/web']);
await runCommand('node', ['scripts/copy-web-dist.mjs']);
