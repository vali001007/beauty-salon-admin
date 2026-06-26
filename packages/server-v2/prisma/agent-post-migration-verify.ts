import { spawnSync } from 'child_process';
import { resolve } from 'path';
import {
  agentE2eReadChecks,
  agentE2eWriteChecks,
  filterAgentE2eChecks,
  type AgentE2eGroup,
} from './agent-e2e-coverage.ts';

type VerifyStep = {
  name: string;
  script: string;
  args?: string[];
  description: string;
};

const packageRoot = resolve(import.meta.dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const includeWrite = process.argv.includes('--include-write');
const yes = process.argv.includes('--yes');
const planOnly = process.argv.includes('--plan-only');
const group = (process.argv.find((arg) => arg.startsWith('--group='))?.split('=')[1] ?? 'all') as AgentE2eGroup;
if (!['all', 'memory_archive', 'automation_engine'].includes(group)) {
  throw new Error('--group must be one of: all, memory_archive, automation_engine.');
}

function runtimeEnvStatus() {
  return {
    AGENT_E2E_API_BASE: process.env.AGENT_E2E_API_BASE ? 'configured' : 'optional, defaults to http://localhost:8080/api',
    AGENT_E2E_TOKEN: process.env.AGENT_E2E_TOKEN ? 'configured' : 'missing',
    AGENT_E2E_STORE_ID: process.env.AGENT_E2E_STORE_ID ? 'configured' : 'missing or derived from login user stores',
    AGENT_E2E_USERNAME: process.env.AGENT_E2E_USERNAME ? 'configured' : 'missing',
    AGENT_E2E_PASSWORD: process.env.AGENT_E2E_PASSWORD ? 'configured' : 'missing',
  };
}

function hasRuntimeAuthContext() {
  const hasTokenContext = Boolean(process.env.AGENT_E2E_TOKEN && process.env.AGENT_E2E_STORE_ID);
  const hasLoginContext = Boolean(process.env.AGENT_E2E_USERNAME && process.env.AGENT_E2E_PASSWORD);
  return hasTokenContext || hasLoginContext;
}

const steps: VerifyStep[] = [
  {
    name: 'migration-audit',
    script: 'agent:migration-audit',
    description: '确认阶段 6/7 migration SQL 文件结构完整',
  },
  {
    name: 'schema-readiness',
    script: 'agent:schema-readiness',
    args: [`--group=${group}`],
    description: '严格确认阶段 6/7 数据表和 Prisma migration 记录均已就绪',
  },
  {
    name: 'runtime-readiness',
    script: 'agent:runtime-readiness',
    args: [`--group=${group}`],
    description: '严格确认 5 张 Agent 新表可查询',
  },
  {
    name: 'api-e2e-read',
    script: 'agent:api-e2e',
    args: [`--group=${group}`],
    description: '使用 token 或账号密码自动登录验证 Agent API 读路径',
  },
];

if (includeWrite) {
  steps.push({
    name: 'api-e2e-write',
    script: 'agent:api-e2e',
    args: [`--group=${group}`, '--include-write', '--yes'],
    description: '显式验证记忆、每日归档和自动化运行态全链路写路径',
  });
}

if (planOnly) {
  console.log(
    JSON.stringify(
      {
        purpose: 'Strict post-migration verification for T6.7/T7.13',
        group,
        requiresMigrationApplied: true,
        requiresRuntimeEnv: runtimeEnvStatus(),
        authOptions: [
          'AGENT_E2E_TOKEN + AGENT_E2E_STORE_ID',
          'AGENT_E2E_USERNAME + AGENT_E2E_PASSWORD; AGENT_E2E_STORE_ID is optional if login user has storeIds/stores',
        ],
        includeWrite,
        apiCoverage: {
          readChecks: filterAgentE2eChecks(agentE2eReadChecks, group),
          writeChecks: includeWrite ? filterAgentE2eChecks(agentE2eWriteChecks, group) : [],
          writeChecksAvailableWith: '--include-write --yes',
        },
        steps,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (includeWrite && !yes) {
  console.error('Write-path verification requires --yes together with --include-write.');
  process.exit(1);
}

if (!hasRuntimeAuthContext()) {
  console.error(
    JSON.stringify(
      {
        error: 'missing_runtime_env',
        message: 'Post-migration verification requires login context for Agent API E2E.',
        group,
        requiredRuntimeEnv: runtimeEnvStatus(),
        authOptions: [
          'Set AGENT_E2E_TOKEN and AGENT_E2E_STORE_ID.',
          'Or set AGENT_E2E_USERNAME and AGENT_E2E_PASSWORD for automatic login.',
        ],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const summary: Array<{ name: string; script: string; ok: boolean; exitCode: number | null }> = [];

for (const step of steps) {
  console.log(`\n=== ${step.name}: ${step.description} ===`);
  const args = step.args ?? [];
  const result =
    process.platform === 'win32'
      ? spawnSync(`${npmCommand} run ${step.script}${args.length ? ` -- ${args.join(' ')}` : ''}`, {
          cwd: packageRoot,
          stdio: 'inherit',
          shell: true,
        })
      : spawnSync(npmCommand, ['run', step.script, ...(args.length ? ['--', ...args] : [])], {
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

console.log(`\n=== post-migration verification summary ===`);
console.log(JSON.stringify({ passed, group, includeWrite, summary }, null, 2));

if (!passed) {
  process.exitCode = 1;
}
