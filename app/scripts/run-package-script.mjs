import { packagePaths } from './package-paths.mjs';
import { runCommand } from './run-command.mjs';

const scriptName = process.argv[2];

if (!scriptName) {
  throw new Error('Missing package script name.');
}

for (const packagePath of packagePaths) {
  await runCommand('npm', ['run', scriptName, '--prefix', packagePath]);
}
