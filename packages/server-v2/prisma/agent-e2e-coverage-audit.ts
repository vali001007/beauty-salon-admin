import { agentE2eReadChecks, agentE2eWriteChecks } from './agent-e2e-coverage.ts';

type CoverageIssue = {
  code: string;
  message: string;
};

const requiredReadKeys = [
  'schema-readiness',
  'memories',
  'daily-archives',
  'quality-report',
  'automation-triggers',
  'automations',
  'automation-runs',
  'automation-effects',
];

const requiredWriteKeys = [
  'create-memory',
  'generate-archive',
  'create-automation-draft',
  'manual-run-automation',
  'list-pending-approvals',
  'approve-automation-run',
  'reject-automation-run',
  'recover-automation',
  'attribute-automation-effect',
  'run-due-automations',
  'evaluate-automation-event',
];
const issues: CoverageIssue[] = [];

function checkDuplicateKeys(keys: string[], scope: string) {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      issues.push({ code: 'duplicate_key', message: `${scope} has duplicate key: ${key}` });
    }
    seen.add(key);
  }
}

function checkRequiredKeys(keys: string[], required: string[], scope: string) {
  for (const key of required) {
    if (!keys.includes(key)) {
      issues.push({ code: 'missing_key', message: `${scope} is missing required key: ${key}` });
    }
  }
}

function checkTasks() {
  const allChecks = [...agentE2eReadChecks, ...agentE2eWriteChecks];
  const taskCounts = allChecks.reduce<Record<string, number>>((acc, check) => {
    acc[check.task] = (acc[check.task] ?? 0) + 1;
    return acc;
  }, {});
  if (!taskCounts['T6.7']) {
    issues.push({ code: 'missing_task', message: 'coverage is missing T6.7 endpoints' });
  }
  if (!taskCounts['T7.13']) {
    issues.push({ code: 'missing_task', message: 'coverage is missing T7.13 endpoints' });
  }
  return taskCounts;
}

function checkGroups() {
  const allChecks = [...agentE2eReadChecks, ...agentE2eWriteChecks];
  const allowedGroups = new Set(['all', 'memory_archive', 'automation_engine']);
  const groupCounts = allChecks.reduce<Record<string, number>>((acc, check) => {
    acc[check.group] = (acc[check.group] ?? 0) + 1;
    if (!allowedGroups.has(check.group)) {
      issues.push({ code: 'invalid_group', message: `${check.key} has invalid group: ${check.group}` });
    }
    return acc;
  }, {});
  if (!groupCounts.memory_archive) {
    issues.push({ code: 'missing_group', message: 'coverage is missing memory_archive endpoints' });
  }
  if (!groupCounts.automation_engine) {
    issues.push({ code: 'missing_group', message: 'coverage is missing automation_engine endpoints' });
  }
  return groupCounts;
}

function checkPathPlaceholders() {
  for (const check of [...agentE2eReadChecks, ...agentE2eWriteChecks]) {
    if (!check.path.startsWith('/agent/')) {
      issues.push({ code: 'invalid_path', message: `${check.key} path must start with /agent/: ${check.path}` });
    }
  }
}

const readKeys = agentE2eReadChecks.map((check) => check.key);
const writeKeys = agentE2eWriteChecks.map((check) => check.key);
checkDuplicateKeys(readKeys, 'readChecks');
checkDuplicateKeys(writeKeys, 'writeChecks');
checkRequiredKeys(readKeys, requiredReadKeys, 'readChecks');
checkRequiredKeys(writeKeys, requiredWriteKeys, 'writeChecks');
const taskCounts = checkTasks();
const groupCounts = checkGroups();
checkPathPlaceholders();

const passed = issues.length === 0;
console.log(
  JSON.stringify(
    {
      passed,
      counts: {
        readChecks: agentE2eReadChecks.length,
        writeChecks: agentE2eWriteChecks.length,
        byTask: taskCounts,
        byGroup: groupCounts,
      },
      issues,
    },
    null,
    2,
  ),
);

if (!passed) {
  process.exitCode = 1;
}
