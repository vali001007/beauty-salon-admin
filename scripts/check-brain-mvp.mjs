import { spawnSync } from 'node:child_process';

const commands = [
  ['npm.cmd', ['--prefix', 'packages/server-v2', 'run', 'db:generate']],
  ['npm.cmd', ['--prefix', 'packages/server-v2', 'run', 'brain:mvp-seed:dry-run']],
  ['npm.cmd', ['--prefix', 'packages/server-v2', 'run', 'brain:mvp-readiness']],
  ['npm.cmd', ['--prefix', 'packages/server-v2', 'run', 'test', '--', 'brain', '--runInBand']],
  [
    'npx.cmd',
    [
      'vitest',
      'run',
      'src/api/real/brain.test.ts',
      'src/app/pages/brain/BrainWorkspace.test.tsx',
      'src/app/pages/brain/BrainGovernanceCenter.test.tsx',
    ],
  ],
  ['npm.cmd', ['run', 'build']],
  ['npm.cmd', ['run', 'check:api']],
  ['git', ['diff', '--check']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
