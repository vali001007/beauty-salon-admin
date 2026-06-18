import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = resolve(repoRoot, 'packages/server-v2');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const serverSpecs = [
  'dimension-registry.service.spec.ts',
  'query-planner.service.spec.ts',
  'query-safety-guard.service.spec.ts',
  'query-template-registry.service.spec.ts',
  'response-composer.service.spec.ts',
  'semantic-query-executor.service.spec.ts',
  'business-query.service.spec.ts',
  'business-task-preparser.service.spec.ts',
  'agent.controller.spec.ts',
];

const checks = [
  {
    id: 'server-query-hub-tests',
    label: '后端智能问答查询中枢核心测试',
    cwd: serverRoot,
    args: ['run', 'test', '--', ...serverSpecs],
  },
  {
    id: 'server-build',
    label: '后端构建检查',
    cwd: serverRoot,
    args: ['run', 'build'],
  },
];

function quoteShellArg(value) {
  const text = String(value);
  return /[\s"'&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function runCheck(check) {
  return new Promise((resolveCheck) => {
    const startedAt = Date.now();
    const command = [npmCommand, ...check.args.map(quoteShellArg)].join(' ');
    const child = spawn(command, {
      cwd: check.cwd,
      shell: true,
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      resolveCheck({
        ...check,
        code,
        durationMs: Date.now() - startedAt,
        ok: code === 0,
      });
    });

    child.on('error', (error) => {
      console.error(`[${check.id}] 启动失败`, error);
      resolveCheck({
        ...check,
        code: 1,
        durationMs: Date.now() - startedAt,
        ok: false,
      });
    });
  });
}

const results = [];
for (const check of checks) {
  console.log(`\n=== ${check.label} (${check.id}) ===`);
  results.push(await runCheck(check));
}

const failed = results.filter((item) => !item.ok);
console.log('\n=== Ami 智能问答查询中枢门禁汇总 ===');
for (const result of results) {
  const status = result.ok ? 'PASS' : 'FAIL';
  console.log(`${status} ${result.label} (${result.durationMs}ms)`);
}

if (failed.length > 0) process.exitCode = 1;
