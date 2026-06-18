import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = resolve(repoRoot, 'packages/server-v2');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const checks = [
  {
    id: 'backend-core-tests',
    label: '后端核心链路测试',
    cwd: serverRoot,
    args: [
      'run',
      'test',
      '--',
      'customer-app.service.spec.ts',
      'marketing.service.spec.ts',
      'terminal.service.spec.ts',
      'promotion-assets.seed.spec.ts',
      'promotions.service.spec.ts',
    ],
    required: true,
  },
  {
    id: 'backend-build',
    label: '后端构建',
    cwd: serverRoot,
    args: ['run', 'build'],
    required: true,
  },
  {
    id: 'frontend-build',
    label: '管理端构建',
    cwd: repoRoot,
    args: ['run', 'build'],
    required: true,
  },
  {
    id: 'promotion-assets-verify',
    label: '真实权益资产入库校验',
    cwd: repoRoot,
    args: ['run', 'db:seed:promotion-assets:verify'],
    required: true,
    remediation: '执行 npm.cmd run db:seed:promotion-assets 后，再执行 npm.cmd run db:seed:promotion-assets:verify。',
  },
];

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

function quoteShellArg(value) {
  const text = String(value);
  return /[\s"'&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

const results = [];
for (const check of checks) {
  console.log(`\n=== ${check.label} (${check.id}) ===`);
  // Sequential by design: the final output is easier to read and failure cause is unambiguous.
  results.push(await runCheck(check));
}

const failed = results.filter((item) => !item.ok);
console.log('\n=== P0 精准营销推荐及权益匹配验收汇总 ===');
for (const result of results) {
  const status = result.ok ? 'PASS' : 'FAIL';
  console.log(`${status} ${result.label} (${result.durationMs}ms)`);
  if (!result.ok && result.remediation) {
    console.log(`  处理建议：${result.remediation}`);
  }
}

if (failed.length > 0) {
  process.exitCode = 1;
}
