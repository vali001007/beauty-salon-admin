const hasToken = Boolean(process.env.AGENT_E2E_TOKEN);
const hasStoreId = Boolean(process.env.AGENT_E2E_STORE_ID);
const hasBaseUrl = Boolean(process.env.AGENT_E2E_API_BASE);
const hasUsername = Boolean(process.env.AGENT_E2E_USERNAME);
const hasPassword = Boolean(process.env.AGENT_E2E_PASSWORD);

const plan = {
  purpose: 'T6.7/T7.13 Agent runtime verification plan',
  writeSafety: {
    scriptWritesDatabase: false,
    migrationRequiresManualAuthorization: true,
    writeE2eRequiresExplicitFlags: ['--include-write', '--yes'],
  },
  pendingMigrations: [
    {
      task: 'T6.7',
      name: '20260626123000_agent_memory_archive',
      creates: ['agent_memories', 'agent_daily_archives'],
    },
    {
      task: 'T7.13',
      name: '20260626160000_agent_automation_engine',
      creates: ['agent_automation_definitions', 'agent_automation_runs', 'agent_automation_effects'],
    },
  ],
  requiredRuntimeEnv: {
    AGENT_E2E_API_BASE: hasBaseUrl ? 'configured' : 'optional, defaults to http://localhost:8080/api',
    AGENT_E2E_TOKEN: hasToken ? 'configured' : 'missing',
    AGENT_E2E_STORE_ID: hasStoreId ? 'configured' : 'missing or derived from login user stores',
    AGENT_E2E_USERNAME: hasUsername ? 'configured' : 'missing',
    AGENT_E2E_PASSWORD: hasPassword ? 'configured' : 'missing',
  },
  authOptions: {
    token: 'AGENT_E2E_TOKEN + AGENT_E2E_STORE_ID',
    login:
      'AGENT_E2E_USERNAME + AGENT_E2E_PASSWORD; AGENT_E2E_STORE_ID is optional if the login response includes storeIds/stores',
  },
  commandOrderAfterMigrationAuthorization: [
    {
      step: 1,
      command: 'npm.cmd run db:migrate',
      cwd: 'packages/server-v2',
      note: 'local development migration; requires explicit database write authorization',
    },
    {
      step: 2,
      command: 'npm.cmd run agent:schema-readiness',
      cwd: 'packages/server-v2',
      expected: 'ready=true and no missing migrations/tables',
    },
    {
      step: 3,
      command: 'npm.cmd run agent:runtime-readiness',
      cwd: 'packages/server-v2',
      expected: 'five Agent tables are queryable',
    },
    {
      step: 4,
      command: 'npm.cmd run agent:api-e2e',
      cwd: 'packages/server-v2',
      expected: 'read path passes with token auth or automatic username/password login',
    },
    {
      step: 5,
      command: 'npm.cmd run agent:api-e2e -- --include-write --yes',
      cwd: 'packages/server-v2',
      expected:
        'write path passes for memory, daily archive generation, automation draft creation, manual run, approval/rejection, recovery, attribution, due scan, and event evaluation',
    },
  ],
  groupedClosureCommands: [
    {
      group: 'memory_archive',
      closes: ['P1-3', 'T6.7', 'P1-4'],
      commands: [
        'npm.cmd run agent:schema-readiness -- --group=memory_archive',
        'npm.cmd run agent:runtime-readiness -- --group=memory_archive',
        'npm.cmd run agent:api-e2e -- --group=memory_archive',
        'npm.cmd run agent:api-e2e -- --group=memory_archive --include-write --yes',
        'npm.cmd run agent:completion-audit',
      ],
    },
    {
      group: 'automation_engine',
      closes: ['P2-3', 'T7.13', 'P2-4'],
      commands: [
        'npm.cmd run agent:schema-readiness -- --group=automation_engine',
        'npm.cmd run agent:runtime-readiness -- --group=automation_engine',
        'npm.cmd run agent:api-e2e -- --group=automation_engine',
        'npm.cmd run agent:api-e2e -- --group=automation_engine --include-write --yes',
        'npm.cmd run agent:completion-audit',
      ],
    },
  ],
  completionGate: {
    canCheckT67: 'schema readiness ready=true, runtime readiness probes agent_memories and agent_daily_archives, E2E covers memory/archive APIs',
    canCheckT713:
      'schema readiness ready=true, runtime readiness probes automation tables, E2E covers automation triggers/list/runs/effects/drafts',
  },
};

console.log(JSON.stringify(plan, null, 2));
