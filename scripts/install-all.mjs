import { libraryPackagePaths, packagePaths } from './package-paths.mjs';
import { runCommand } from './run-command.mjs';

for (const packagePath of packagePaths) {
  await runCommand('npm', ['install', '--no-audit', '--no-fund', '--prefix', packagePath]);
}

// Build shared library packages so their dist/ exists right after bootstrap.
// Consumers resolve `@pdi/*` through main/types (dist), so a clean checkout must
// build them before any test/typecheck/lint runs.
for (const packagePath of libraryPackagePaths) {
  await runCommand('npm', ['run', 'build', '--prefix', packagePath]);
}
