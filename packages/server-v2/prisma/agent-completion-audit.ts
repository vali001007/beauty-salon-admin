import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

type CheckboxState = 'checked' | 'unchecked' | 'missing';

type TaskGate = {
  task: string;
  title: string;
  gate: 'migration' | 'runtime-e2e';
  group: 'memory_archive' | 'automation_engine';
  requires: string[];
};

type ClosurePhase = {
  phase: 'migration' | 'runtime-e2e';
  group: TaskGate['group'];
  tasks: string[];
  requiredEvidence: string[];
  commands: string[];
};

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '..', '..');
const tasksPath = resolve(repoRoot, 'docs/03-开发计划/洞悉美业_智能体开发任务清单_tasks.md');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const taskGates: TaskGate[] = [
  {
    task: 'T6.7',
    title: '阶段 6 运行态验收',
    gate: 'runtime-e2e',
    group: 'memory_archive',
    requires: ['20260626123000_agent_memory_archive applied', 'agent:runtime-readiness passed', 'agent:api-e2e read/write passed'],
  },
  {
    task: 'T7.13',
    title: '阶段 7 运行态验收',
    gate: 'runtime-e2e',
    group: 'automation_engine',
    requires: ['20260626160000_agent_automation_engine applied', 'agent:runtime-readiness passed', 'agent:api-e2e read/write passed'],
  },
  {
    task: 'P1-3',
    title: '应用阶段 6 记忆归档数据库迁移',
    gate: 'migration',
    group: 'memory_archive',
    requires: ['20260626123000_agent_memory_archive applied'],
  },
  {
    task: 'P1-4',
    title: '完成阶段 6 运行态 E2E',
    gate: 'runtime-e2e',
    group: 'memory_archive',
    requires: ['T6.7 closed by strict post-migration verification'],
  },
  {
    task: 'P2-3',
    title: '应用阶段 7 自动化执行引擎数据库迁移',
    gate: 'migration',
    group: 'automation_engine',
    requires: ['20260626160000_agent_automation_engine applied'],
  },
  {
    task: 'P2-4',
    title: '完成阶段 7 运行态 E2E',
    gate: 'runtime-e2e',
    group: 'automation_engine',
    requires: ['T7.13 closed by strict post-migration verification'],
  },
];

function checkboxState(task: string, content: string): CheckboxState {
  if (new RegExp(`^- \\[x\\] ${task}\\b`, 'm').test(content)) return 'checked';
  if (new RegExp(`^- \\[ \\] ${task}\\b`, 'm').test(content)) return 'unchecked';
  return 'missing';
}

function taskLine(task: string, content: string) {
  return content.split(/\r?\n/).find((line) => new RegExp(`^- \\[[ x]\\] ${task}\\b`).test(line));
}

function checkedTaskLine(task: string, content: string) {
  const line = taskLine(task, content);
  return line ? line.replace(/^- \[[ x]\]/, '- [x]') : `- [x] ${task}`;
}

function countCheckboxes(content: string) {
  const checked = content.split(/\r?\n/).filter((line) => /^\s*- \[x\]/.test(line)).length;
  const unchecked = content.split(/\r?\n/).filter((line) => /^\s*- \[ \]/.test(line)).length;
  return { checked, unchecked };
}

function runScript(script: string) {
  const result =
    process.platform === 'win32'
      ? spawnSync(`${npmCommand} run ${script}`, { cwd: packageRoot, shell: true, encoding: 'utf8' })
      : spawnSync(npmCommand, ['run', script], { cwd: packageRoot, shell: false, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function extractLastJsonObject(text: string) {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (text[index] !== '{') continue;
    const candidate = text.slice(index).trim();
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // keep scanning; npm output may contain earlier braces from logs.
    }
  }
  return undefined;
}

const content = existsSync(tasksPath) ? readFileSync(tasksPath, 'utf8') : '';
const checkboxCounts = countCheckboxes(content);
const schemaRun = runScript('agent:schema-readiness:allow-pending');
const schema = extractLastJsonObject(schemaRun.stdout);
const schemaReady = schema?.ready === true;
const missingTables = Array.isArray(schema?.missingTables) ? schema.missingTables : [];
const missingMigrations = Array.isArray(schema?.missingMigrations) ? schema.missingMigrations : [];
const schemaGroups = Array.isArray(schema?.groups) ? (schema.groups as Array<Record<string, unknown>>) : [];

function groupReady(code: TaskGate['group']) {
  const group = schemaGroups.find((item) => item.code === code);
  return group?.ready === true;
}

function runtimeEvidenceReady(group: TaskGate['group']) {
  const hasStrictWriteVerify = content.includes('agent:post-migration-verify -- --include-write --yes');
  if (!hasStrictWriteVerify) return false;
  if (group === 'memory_archive') {
    return (
      content.includes('T6.7/P1-4') &&
      content.includes('创建记忆') &&
      content.includes('生成每日归档')
    );
  }
  return (
    content.includes('T7.13/P2-4') &&
    content.includes('自动化草稿') &&
    content.includes('审批通过') &&
    content.includes('归因')
  );
}

const gates = taskGates.map((task) => {
  const state = content ? checkboxState(task.task, content) : 'missing';
  const isGroupReady = groupReady(task.group);
  const hasRuntimeEvidence = runtimeEvidenceReady(task.group);
  const closableNow = task.gate === 'migration' ? isGroupReady : isGroupReady && hasRuntimeEvidence;
  const reason =
    task.gate === 'migration'
      ? isGroupReady
        ? '该阶段迁移已就绪，可结合实际 migration 命令记录后打钩'
        : '数据库迁移未应用，不能打钩'
      : isGroupReady
        ? hasRuntimeEvidence
          ? 'schema 已就绪，且任务清单已有严格 post-migration verification 和真实登录态 E2E 证据'
          : 'schema 已就绪，但仍需严格 post-migration verification 和真实登录态 E2E 证据'
        : '数据库迁移未应用，运行态 E2E 不能开始';
  return {
    task: task.task,
    title: task.title,
    gate: task.gate,
    group: task.group,
    groupReady: isGroupReady,
    runtimeEvidenceReady: task.gate === 'runtime-e2e' ? hasRuntimeEvidence : undefined,
    checkboxState: state,
    closableNow,
    reason,
    requires: task.requires,
  };
});

const invalidlyChecked = gates.filter((gate) => gate.checkboxState === 'checked' && !gate.closableNow);
const missingTaskLines = gates.filter((gate) => gate.checkboxState === 'missing');
const readyToClose = gates.filter((gate) => gate.checkboxState === 'unchecked' && gate.closableNow);
const blockedByMigration = gates.filter((gate) => gate.checkboxState === 'unchecked' && !gate.groupReady);
const pendingRuntimeE2e = gates.filter(
  (gate) => gate.checkboxState === 'unchecked' && gate.groupReady && gate.gate === 'runtime-e2e',
);
const allGatesClosed = gates.every((gate) => gate.checkboxState === 'checked' && gate.closableNow);

const closurePhases: ClosurePhase[] = [
  {
    phase: 'migration',
    group: 'memory_archive',
    tasks: ['P1-3'],
    requiredEvidence: [
      '_prisma_migrations 中存在已完成的 20260626123000_agent_memory_archive 记录',
      '当前 schema 中存在 agent_memories 和 agent_daily_archives',
      'agent:completion-audit 输出 P1-3 位于 readyToClose',
    ],
    commands: [
      'npm.cmd run db:migrate',
      'npm.cmd run agent:schema-readiness -- --group=memory_archive',
      'npm.cmd run agent:completion-audit',
    ],
  },
  {
    phase: 'migration',
    group: 'automation_engine',
    tasks: ['P2-3'],
    requiredEvidence: [
      '_prisma_migrations 中存在已完成的 20260626160000_agent_automation_engine 记录',
      '当前 schema 中存在 agent_automation_definitions、agent_automation_runs 和 agent_automation_effects',
      'agent:completion-audit 输出 P2-3 位于 readyToClose',
    ],
    commands: [
      'npm.cmd run db:migrate',
      'npm.cmd run agent:schema-readiness -- --group=automation_engine',
      'npm.cmd run agent:completion-audit',
    ],
  },
  {
    phase: 'runtime-e2e',
    group: 'memory_archive',
    tasks: ['T6.7', 'P1-4'],
    requiredEvidence: [
      'agent:runtime-readiness 成功探测 agent_memories 和 agent_daily_archives',
      'agent:api-e2e 读路径覆盖记忆、每日归档和质量报表',
      'agent:api-e2e -- --include-write --yes 成功创建并读回记忆、生成并读回每日归档，并校验质量报表 KPI 字段',
    ],
    commands: [
      'npm.cmd run agent:post-migration-verify -- --group=memory_archive',
      'npm.cmd run agent:post-migration-verify -- --group=memory_archive --include-write --yes',
      'npm.cmd run agent:completion-audit',
    ],
  },
  {
    phase: 'runtime-e2e',
    group: 'automation_engine',
    tasks: ['T7.13', 'P2-4'],
    requiredEvidence: [
      'agent:runtime-readiness 成功探测自动化定义、运行日志和效果归因表',
      'agent:api-e2e 读路径覆盖自动化触发器、列表、运行日志和效果记录',
      'agent:api-e2e -- --include-write --yes 成功覆盖自动化草稿、手动运行、待审批列表、审批通过、审批拒绝、恢复预演、效果归因、到期扫描和事件评估',
    ],
    commands: [
      'npm.cmd run agent:post-migration-verify -- --group=automation_engine',
      'npm.cmd run agent:post-migration-verify -- --group=automation_engine --include-write --yes',
      'npm.cmd run agent:completion-audit',
    ],
  },
];

const closurePlan = closurePhases.map((phase) => {
  const phaseGates = gates.filter((gate) => phase.tasks.includes(gate.task));
  const phaseReadyToClose = phaseGates.filter((gate) => gate.closableNow).map((gate) => gate.task);
  const phaseBlocked = phaseGates.filter((gate) => !gate.closableNow).map((gate) => gate.task);
  return {
    ...phase,
    readyToClose: phaseReadyToClose,
    blocked: phaseBlocked,
    markdownPatchTemplate: phase.tasks.map((task) => checkedTaskLine(task, content)).join('\n'),
    validationLogTemplate: `- ${new Date().toISOString().slice(0, 10)}：${phase.tasks.join('/')} 已关闭，依据：${phase.requiredEvidence.join('；')}。`,
  };
});

console.log(
  JSON.stringify(
    {
      passed: schemaRun.ok && invalidlyChecked.length === 0 && missingTaskLines.length === 0,
      tasksPath,
      checkboxCounts,
      schema: {
        ready: schemaReady,
        missingTables,
        missingMigrations,
      },
      gates,
      invalidlyChecked: invalidlyChecked.map((gate) => gate.task),
      missingTaskLines: missingTaskLines.map((gate) => gate.task),
      readyToClose: readyToClose.map((gate) => gate.task),
      blockedByMigration: blockedByMigration.map((gate) => gate.task),
      pendingRuntimeE2e: pendingRuntimeE2e.map((gate) => gate.task),
      closurePlan,
      nextAction: allGatesClosed
        ? 'All tracked migration and runtime E2E gates are closed with recorded evidence.'
        : readyToClose.length > 0
          ? 'Record migration command evidence, close ready migration tasks, then run strict runtime E2E.'
          : schemaReady
            ? 'Run agent:post-migration-verify with runtime auth, then run write-path E2E with --include-write --yes before closing runtime tasks.'
            : 'Apply pending migrations with explicit database write authorization before closing migration/runtime tasks.',
    },
    null,
    2,
  ),
);

if (!schemaRun.ok || invalidlyChecked.length > 0 || missingTaskLines.length > 0) {
  process.exitCode = 1;
}
