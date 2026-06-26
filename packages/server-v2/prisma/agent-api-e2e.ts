import { config } from 'dotenv';
import { resolve } from 'path';
import { agentE2eReadChecks, agentE2eWriteChecks, filterAgentE2eChecks, type AgentE2eGroup } from './agent-e2e-coverage.ts';
config({ path: resolve(import.meta.dirname, '..', '.env') });

type E2eArgs = {
  baseUrl: string;
  token?: string;
  storeId?: string;
  username?: string;
  password?: string;
  personaCode: string;
  group: AgentE2eGroup;
  includeWrite: boolean;
  confirmed: boolean;
  allowMissingAuth: boolean;
};

type StepResult = {
  key: string;
  status: 'pass' | 'skip' | 'fail';
  message: string;
  evidence?: unknown;
};

function parseArgs(): E2eArgs {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    if (raw.includes('=')) {
      const [key, ...value] = raw.replace(/^--/, '').split('=');
      args.set(key, value.join('='));
    } else {
      flags.add(raw.replace(/^--/, ''));
    }
  }
  const group = (args.get('group') ?? process.env.AGENT_E2E_GROUP ?? 'all') as AgentE2eGroup;
  if (!['all', 'memory_archive', 'automation_engine'].includes(group)) {
    throw new Error('--group must be one of: all, memory_archive, automation_engine.');
  }
  return {
    baseUrl: (args.get('baseUrl') ?? process.env.AGENT_E2E_API_BASE ?? 'http://localhost:8080/api').replace(/\/$/, ''),
    token: args.get('token') ?? process.env.AGENT_E2E_TOKEN,
    storeId: args.get('storeId') ?? process.env.AGENT_E2E_STORE_ID,
    username: args.get('username') ?? process.env.AGENT_E2E_USERNAME,
    password: args.get('password') ?? process.env.AGENT_E2E_PASSWORD,
    personaCode: args.get('personaCode') ?? process.env.AGENT_E2E_PERSONA_CODE ?? 'manager',
    group,
    includeWrite: flags.has('include-write'),
    confirmed: flags.has('yes'),
    allowMissingAuth: flags.has('allow-missing-auth'),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function requestJson<T>(
  args: E2eArgs,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  csrf?: { token: string; cookie: string },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.token}`,
    'X-Store-Id': String(args.storeId),
    'Content-Type': 'application/json',
  };
  if (csrf) {
    headers['Cookie'] = csrf.cookie;
    headers['X-CSRF-Token'] = csrf.token;
  }
  const response = await fetch(`${args.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
  }
  return data as T;
}

type LoginResponse = {
  token?: string;
  user?: {
    storeIds?: unknown[];
    stores?: unknown[];
  };
};

function firstStoreIdFromLogin(data: LoginResponse) {
  const candidates = Array.isArray(data.user?.storeIds) && data.user.storeIds.length > 0 ? data.user.storeIds : data.user?.stores;
  const value = Array.isArray(candidates) ? candidates[0] : undefined;
  return value === undefined || value === null ? undefined : String(value);
}

async function resolveAuthContext(args: E2eArgs): Promise<E2eArgs & { authSource: 'token' | 'login' }> {
  if (args.token && args.storeId) {
    return { ...args, authSource: 'token' };
  }
  if (!args.token && args.username && args.password) {
    const response = await fetch(`${args.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: args.username, password: args.password }),
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as LoginResponse) : {};
    if (!response.ok || !data.token) {
      throw new Error(`Login failed: ${response.status} ${text}`);
    }
    const storeId = args.storeId ?? firstStoreIdFromLogin(data);
    if (!storeId) {
      throw new Error('Login succeeded but no storeId was provided or returned. Set AGENT_E2E_STORE_ID explicitly.');
    }
    return { ...args, token: data.token, storeId, authSource: 'login' };
  }
  throw new Error(
    'Missing auth context. Provide AGENT_E2E_TOKEN + AGENT_E2E_STORE_ID, or AGENT_E2E_USERNAME + AGENT_E2E_PASSWORD with a user bound to a store.',
  );
}

async function fetchCsrf(args: E2eArgs) {
  const response = await fetch(`${args.baseUrl}/auth/csrf-token`, {
    headers: {
      Authorization: `Bearer ${args.token}`,
      'X-Store-Id': String(args.storeId),
    },
  });
  const data = (await response.json()) as { csrfToken?: string };
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  if (!response.ok || !data.csrfToken || !cookie) {
    throw new Error(`Failed to fetch CSRF token: ${response.status}`);
  }
  return { token: data.csrfToken, cookie };
}

function pageCount(value: unknown) {
  if (!isObject(value)) return 0;
  const items = value.items;
  return Array.isArray(items) ? items.length : 0;
}

function objectId(value: unknown, label: string) {
  if (!isObject(value)) throw new Error(`${label} response is not an object.`);
  const id = value.id;
  if (typeof id === 'number' || typeof id === 'string') return Number(id);
  throw new Error(`${label} response does not include id.`);
}

function nestedObjectId(value: unknown, key: string, label: string) {
  if (!isObject(value)) throw new Error(`${label} response is not an object.`);
  return objectId(value[key], `${label}.${key}`);
}

function nestedString(value: unknown, key: string, field: string, label: string) {
  if (!isObject(value)) throw new Error(`${label} response is not an object.`);
  const nested = value[key];
  if (!isObject(nested)) throw new Error(`${label}.${key} response is not an object.`);
  const result = nested[field];
  if (typeof result !== 'string') throw new Error(`${label}.${key}.${field} is missing.`);
  return result;
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertNumber(value: unknown, label: string) {
  if (typeof value !== 'number') throw new Error(`${label} must be a number.`);
  return value;
}

function assertMin(value: number, min: number, label: string) {
  if (value < min) throw new Error(`${label} expected >= ${min}, got ${value}.`);
}

function pageHasId(value: unknown, id: number) {
  if (!isObject(value) || !Array.isArray(value.items)) return false;
  return value.items.some((item) => isObject(item) && Number(item.id) === id);
}

function nestedObject(value: unknown, key: string, label: string) {
  if (!isObject(value)) throw new Error(`${label} response is not an object.`);
  const nested = value[key];
  if (!isObject(nested)) throw new Error(`${label}.${key} response is not an object.`);
  return nested;
}

async function runReadOnlyChecks(args: E2eArgs): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const schema = await requestJson<Record<string, unknown>>(args, 'GET', '/agent/schema-readiness');
  const schemaReady =
    args.group === 'all'
      ? schema.ready === true
      : Array.isArray(schema.groups) &&
        schema.groups.some((group) => isObject(group) && group.code === args.group && group.ready === true);
  results.push({
    key: 'schema-readiness',
    status: schemaReady ? 'pass' : 'fail',
    message: schemaReady ? `Agent schema ready for ${args.group}.` : `Agent schema is not ready for ${args.group}.`,
    evidence: args.group === 'all' ? schema : { group: args.group, schema },
  });
  if (!schemaReady) return results;

  for (const check of filterAgentE2eChecks(agentE2eReadChecks, args.group).filter((item) => item.key !== 'schema-readiness')) {
    const path = check.path.replace('{personaCode}', encodeURIComponent(args.personaCode));
    const data = await requestJson<unknown>(args, 'GET', path);
    results.push({
      key: check.key,
      status: 'pass',
      message: `${check.key} endpoint returned successfully.`,
      evidence: Array.isArray(data) ? { count: data.length } : { itemCount: pageCount(data) },
    });
  }
  return results;
}

async function runWriteChecks(args: E2eArgs): Promise<StepResult[]> {
  if (!args.includeWrite) {
    return [{ key: 'write-checks', status: 'skip', message: 'Write checks skipped. Pass --include-write --yes to enable.' }];
  }
  if (!args.confirmed) {
    return [{ key: 'write-checks', status: 'fail', message: 'Write checks require --yes confirmation.' }];
  }
  const csrf = await fetchCsrf(args);
  const results: StepResult[] = [];
  if (args.group === 'all' || args.group === 'memory_archive') {
    const memory = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      '/agent/memories',
      {
        personaCode: args.personaCode,
        memoryType: 'runtime_e2e',
        title: `运行态验收记忆 ${new Date().toISOString()}`,
        content: 'Agent runtime E2E verification memory. Safe to archive.',
        importance: 1,
      },
      csrf,
    );
    const archive = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      '/agent/daily-archives/generate',
      { personaCode: args.personaCode },
      csrf,
    );
    const memoryId = objectId(memory, 'memory');
    assertEqual(memory.status, 'active', 'memory.status');
    assertEqual(memory.memoryType, 'runtime_e2e', 'memory.memoryType');
    assertEqual(memory.personaCode, args.personaCode, 'memory.personaCode');
    const archiveId = objectId(archive, 'archive');
    assertEqual(archive.status, 'generated', 'archive.status');
    const memoriesAfterWrite = await requestJson<unknown>(
      args,
      'GET',
      `/agent/memories?personaCode=${encodeURIComponent(args.personaCode)}&memoryType=runtime_e2e&limit=10`,
    );
    if (!pageHasId(memoriesAfterWrite, memoryId)) {
      throw new Error(`Created memory ${memoryId} was not found in memory list.`);
    }
    const archivesAfterWrite = await requestJson<unknown>(
      args,
      'GET',
      `/agent/daily-archives?personaCode=${encodeURIComponent(args.personaCode)}&pageSize=10`,
    );
    if (!pageHasId(archivesAfterWrite, archiveId)) {
      throw new Error(`Generated archive ${archiveId} was not found in archive list.`);
    }
    const qualityReportAfterWrite = await requestJson<Record<string, unknown>>(
      args,
      'GET',
      `/agent/quality-report?personaCode=${encodeURIComponent(args.personaCode)}&days=7`,
    );
    const qualityKpis = nestedObject(qualityReportAfterWrite, 'kpis', 'qualityReportAfterWrite');
    assertNumber(qualityKpis.runCount, 'qualityReport.kpis.runCount');
    assertNumber(qualityKpis.successRate, 'qualityReport.kpis.successRate');
    results.push(
      { key: 'create-memory', status: 'pass', message: 'Created and read back runtime E2E memory.', evidence: { id: memoryId } },
      { key: 'generate-archive', status: 'pass', message: 'Generated and read back daily archive.', evidence: { id: archiveId, status: archive.status } },
    );
  }
  if (args.group === 'all' || args.group === 'automation_engine') {
    const automation = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      '/agent/automations/drafts',
      {
        personaCode: args.personaCode,
        goal: '运行态验收自动化草稿',
        triggerType: 'sleeping_customer',
        riskLevel: 'medium',
      },
      csrf,
    );
    const automationId = objectId(automation, 'automation');
    assertEqual(automation.status, 'draft', 'automation.status');
    const approvedRun = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      `/agent/automations/${automationId}/run`,
      { mode: 'manual_e2e_approve', dryRun: false, input: { source: 'agent-api-e2e', branch: 'approve' } },
      csrf,
    );
    const approvedRunId = nestedObjectId(approvedRun, 'run', 'approvedRun');
    assertEqual(nestedString(approvedRun, 'run', 'status', 'approvedRun'), 'waiting_approval', 'approvedRun.run.status');
    assertEqual(approvedRun.approvalRequired, true, 'approvedRun.approvalRequired');
    const pendingApprovals = await requestJson<unknown>(
      args,
      'GET',
      `/agent/automations/pending-approvals?definitionId=${automationId}&personaCode=${encodeURIComponent(args.personaCode)}&pageSize=5`,
    );
    assertMin(pageCount(pendingApprovals), 1, 'pending approval count');
    const approveResult = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      `/agent/automations/runs/${approvedRunId}/approve`,
      { comment: 'Agent runtime E2E approval.' },
      csrf,
    );
    assertEqual(approveResult.approved, true, 'approveResult.approved');
    assertEqual(nestedString(approveResult, 'run', 'status', 'approveResult'), 'completed', 'approveResult.run.status');
    const rejectedRun = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      `/agent/automations/${automationId}/run`,
      { mode: 'manual_e2e_reject', dryRun: false, input: { source: 'agent-api-e2e', branch: 'reject' } },
      csrf,
    );
    const rejectedRunId = nestedObjectId(rejectedRun, 'run', 'rejectedRun');
    assertEqual(nestedString(rejectedRun, 'run', 'status', 'rejectedRun'), 'waiting_approval', 'rejectedRun.run.status');
    const rejectResult = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      `/agent/automations/runs/${rejectedRunId}/reject`,
      { comment: 'Agent runtime E2E rejection.' },
      csrf,
    );
    assertEqual(rejectResult.approved, false, 'rejectResult.approved');
    assertEqual(nestedString(rejectResult, 'run', 'status', 'rejectResult'), 'cancelled', 'rejectResult.run.status');
    const recoverResult = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      `/agent/automations/${automationId}/recover`,
      { maxFailures: 3 },
      csrf,
    );
    if (!['retry_scheduled', 'paused'].includes(String(recoverResult.status))) {
      throw new Error(`recoverResult.status expected retry_scheduled or paused, got ${String(recoverResult.status)}.`);
    }
    const attribution = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      '/agent/automations/effects/attribute',
      {
        definitionId: automationId,
        runId: approvedRunId,
        effectType: 'runtime_e2e_attribution',
        objectType: 'agent_automation',
        objectId: automationId,
        metricKey: 'runtime_e2e_attributed',
        impact: { source: 'agent-api-e2e', value: 1 },
      },
      csrf,
    );
    const attributionId = objectId(attribution, 'attribution');
    assertEqual(attribution.status, 'attributed', 'attribution.status');
    const dueRun = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      '/agent/automations/due/run',
      { now: new Date().toISOString(), limit: 5, dryRun: true },
      csrf,
    );
    assertNumber(dueRun.checkedCount, 'dueRun.checkedCount');
    assertNumber(dueRun.triggeredCount, 'dueRun.triggeredCount');
    const eventEvaluation = await requestJson<Record<string, unknown>>(
      args,
      'POST',
      '/agent/automations/events/evaluate',
      { eventType: 'dormant_customer', payload: { source: 'agent-api-e2e' }, limit: 5, dryRun: true },
      csrf,
    );
    assertNumber(eventEvaluation.matchedCount, 'eventEvaluation.matchedCount');
    results.push(
      { key: 'create-automation-draft', status: 'pass', message: 'Created automation draft.', evidence: { id: automationId, status: automation.status } },
      { key: 'manual-run-automation', status: 'pass', message: 'Created approval-required automation run.', evidence: { id: approvedRunId } },
      { key: 'list-pending-approvals', status: 'pass', message: 'Listed pending approvals.', evidence: { itemCount: pageCount(pendingApprovals) } },
      { key: 'approve-automation-run', status: 'pass', message: 'Approved automation run.', evidence: { id: approvedRunId, approved: approveResult.approved } },
      { key: 'reject-automation-run', status: 'pass', message: 'Rejected automation run.', evidence: { id: rejectedRunId, approved: rejectResult.approved } },
      { key: 'recover-automation', status: 'pass', message: 'Created recovery preview or fuse decision.', evidence: { status: recoverResult.status } },
      { key: 'attribute-automation-effect', status: 'pass', message: 'Recorded automation attribution effect.', evidence: { id: attributionId } },
      { key: 'run-due-automations', status: 'pass', message: 'Ran due automation scan.', evidence: { triggeredCount: dueRun.triggeredCount, checkedCount: dueRun.checkedCount } },
      { key: 'evaluate-automation-event', status: 'pass', message: 'Evaluated automation event.', evidence: { matchedCount: eventEvaluation.matchedCount } },
    );
  }
  return results;
}

async function main() {
  const args = parseArgs();
  const canResolveByToken = Boolean(args.token && args.storeId);
  const canResolveByLogin = Boolean(!args.token && args.username && args.password);
  if (!canResolveByToken && !canResolveByLogin && args.allowMissingAuth) {
    console.log(JSON.stringify({
      ready: false,
      skipped: true,
      reason: 'missing_auth',
      required: [
        '--token/AGENT_E2E_TOKEN + --storeId/AGENT_E2E_STORE_ID',
        'or --username/AGENT_E2E_USERNAME + --password/AGENT_E2E_PASSWORD with a store-bound user',
      ],
      group: args.group,
      coverage: {
        readChecks: filterAgentE2eChecks(agentE2eReadChecks, args.group),
        writeChecks: filterAgentE2eChecks(agentE2eWriteChecks, args.group),
      },
    }, null, 2));
    return;
  }
  const resolvedArgs = await resolveAuthContext(args);
  const readResults = await runReadOnlyChecks(resolvedArgs);
  const writeResults = readResults.some((item) => item.status === 'fail') ? [] : await runWriteChecks(resolvedArgs);
  const results = [...readResults, ...writeResults];
  const failed = results.filter((item) => item.status === 'fail');
  console.log(JSON.stringify({
    passed: failed.length === 0,
    baseUrl: resolvedArgs.baseUrl,
    storeId: resolvedArgs.storeId,
    personaCode: resolvedArgs.personaCode,
    group: resolvedArgs.group,
    authSource: resolvedArgs.authSource,
    coverage: {
      readChecks: filterAgentE2eChecks(agentE2eReadChecks, resolvedArgs.group),
      writeChecks: resolvedArgs.includeWrite ? filterAgentE2eChecks(agentE2eWriteChecks, resolvedArgs.group) : [],
    },
    results,
  }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
