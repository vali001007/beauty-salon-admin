import { spawnSync } from 'child_process';
import { resolve } from 'path';

type Step = {
  name: string;
  script: string;
  description: string;
};

const packageRoot = resolve(import.meta.dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps: Step[] = [
  {
    name: 'migration-audit',
    script: 'agent:migration-audit',
    description: '只读检查阶段 6/7 migration SQL 文件完整性',
  },
  {
    name: 'schema-readiness',
    script: 'agent:schema-readiness:allow-pending',
    description: '只读检查数据库表和 Prisma migration 记录，允许输出 pending 状态',
  },
  {
    name: 'runtime-readiness',
    script: 'agent:runtime-readiness:allow-pending',
    description: '只读检查运行态 readiness；schema 未就绪时按预期停在前置检查',
  },
  {
    name: 'e2e-coverage-audit',
    script: 'agent:e2e-coverage:audit',
    description: '只读检查 T6.7/T7.13 API E2E 覆盖清单完整性',
  },
  {
    name: 'api-e2e',
    script: 'agent:api-e2e:allow-missing-auth',
    description: '只读 API E2E 预检；缺少 token/storeId 时按预期跳过',
  },
  {
    name: 'verification-plan',
    script: 'agent:verification-plan',
    description: '输出迁移授权后的关闭 T6.7/T7.13 命令顺序和验收门槛',
  },
  {
    name: 'post-migration-verify-plan',
    script: 'agent:post-migration-verify:plan',
    description: '输出迁移后严格验收计划、登录态参数状态和 API 覆盖范围',
  },
  {
    name: 'completion-audit',
    script: 'agent:completion-audit',
    description: '只读审计 T6.7/T7.13/P1/P2 未完成项是否具备打钩证据',
  },
];

const summary: Array<{ name: string; script: string; ok: boolean; exitCode: number | null }> = [];

for (const step of steps) {
  console.log(`\n=== ${step.name}: ${step.description} ===`);
  const result =
    process.platform === 'win32'
      ? spawnSync(`${npmCommand} run ${step.script}`, {
          cwd: packageRoot,
          stdio: 'inherit',
          shell: true,
        })
      : spawnSync(npmCommand, ['run', step.script], {
          cwd: packageRoot,
          stdio: 'inherit',
          shell: false,
        });
  if (result.error) {
    console.error(result.error);
  }
  const ok = result.status === 0;
  summary.push({ name: step.name, script: step.script, ok, exitCode: result.status });
  if (!ok) break;
}

const passed = summary.length === steps.length && summary.every((item) => item.ok);
console.log(`\n=== preflight summary ===`);
console.log(JSON.stringify({ passed, databaseReadinessSource: 'agent:schema-readiness output', summary }, null, 2));

if (!passed) {
  process.exitCode = 1;
}
