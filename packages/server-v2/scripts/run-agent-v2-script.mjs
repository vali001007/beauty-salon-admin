import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , scriptArg, ...forwardedArgs] = process.argv;

if (!scriptArg) {
  console.error('Usage: node scripts/run-agent-v2-script.mjs <script.ts> [...args]');
  process.exit(1);
}

const cwd = process.cwd();
const scriptPath = resolve(cwd, scriptArg);
const tsNodeProject = resolve(cwd, 'tsconfig.agent-eval-scripts.json');

if (!existsSync(scriptPath)) {
  console.error(`Agent V2 script not found: ${scriptPath}`);
  process.exit(1);
}

if (!existsSync(tsNodeProject)) {
  console.error(`Agent V2 tsconfig not found: ${tsNodeProject}`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ['--loader', 'ts-node/esm', '--experimental-specifier-resolution=node', scriptPath, ...forwardedArgs],
  {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      TS_NODE_PROJECT: process.env.TS_NODE_PROJECT ?? tsNodeProject,
      TS_NODE_TRANSPILE_ONLY: process.env.TS_NODE_TRANSPILE_ONLY ?? 'true',
    },
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
