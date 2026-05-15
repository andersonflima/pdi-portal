import { spawn } from 'node:child_process';
import { toLocalEnv } from './corporate-env.mjs';
import { runCommand } from './run-command.mjs';

const env = toLocalEnv();

await runCommand('npm', ['run', 'db:setup'], { env });

const processes = [
  spawn('npm', ['run', 'dev', '--prefix', 'apps/api'], {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  }),
  spawn('npm', ['run', 'dev', '--prefix', 'apps/web'], {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
];

const stopAll = () => {
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
};

process.once('SIGINT', () => {
  stopAll();
  process.exit(130);
});

process.once('SIGTERM', () => {
  stopAll();
  process.exit(143);
});

await new Promise((resolve, reject) => {
  for (const child of processes) {
    child.once('error', reject);
    child.once('exit', (code) => {
      stopAll();

      if (code === 0 || code === null) {
        resolve();
        return;
      }

      reject(new Error(`Development process exited with code ${code}`));
    });
  }
});
