import { runCommand } from './run-command.mjs';

await runCommand('npm', ['run', 'build', '--prefix', 'app/packages/contracts']);
await runCommand('npm', ['run', 'build', '--prefix', 'app/api']);
await runCommand('npm', ['run', 'build', '--prefix', 'app/web']);
await runCommand('node', ['app/scripts/copy-web-dist.mjs']);
