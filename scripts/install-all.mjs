import { packagePaths } from './package-paths.mjs';
import { runCommand } from './run-command.mjs';

for (const packagePath of packagePaths) {
  await runCommand('npm', ['install', '--no-audit', '--no-fund', '--prefix', packagePath]);
}
