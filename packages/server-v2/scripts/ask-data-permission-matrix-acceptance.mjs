import { config as loadEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import {
  ASK_DATA_PERMISSION_ACCEPTANCE_PASSWORD_ENV,
  ASK_DATA_PERMISSION_ACCEPTANCE_ROLES,
  sameStringSet,
  sortedUnique,
} from './ask-data-permission-acceptance-contract.mjs';

const { Client } = pg;
const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '..', '..');
loadEnv({ path: resolve(packageRoot, '.env'), quiet: true });

const strict = process.argv.includes('--strict');
const apiBase = normalizeApiBase(
  process.env.ASK_DATA_PERMISSION_ACCEPTANCE_API_BASE ?? 'http://127.0.0.1:8080/api',
);
const apiUrl = new URL(apiBase);
if (!['127.0.0.1', 'localhost'].includes(apiUrl.hostname)) {
  throw new Error('权限验收账号密码只允许发送到本地 API。');
}
const password = process.env[ASK_DATA_PERMISSION_ACCEPTANCE_PASSWORD_ENV]?.trim() || '11111111';
const outputDir = resolve(repoRoot, 'docs', '04-测试数据', 'Ami-Ask权限矩阵真实验收-2026-08-02');
const jsonPath = resolve(outputDir, 'Ami-Ask权限矩阵真实验收结果-2026-08-02.json');
const markdownPath = resolve(outputDir, 'Ami-Ask权限矩阵真实验收报告-2026-08-02.md');

const startedAt = new Date();
const roleResults = [];
const auditExpectations = [];

for (const contract of ASK_DATA_PERMISSION_ACCEPTANCE_ROLES) {
  const roleStartedAt = performance.now();
  try {
    const actor = await login(contract.username, password);
    const roleValid = sameStringSet(actor.roles, [contract.roleKey]);
    const permissionValid = sameStringSet(actor.permissions, contract.permissions);
    if (!roleValid) throw new Error(`role_mismatch:${actor.roles.join(',')}`);
    if (!permissionValid) throw new Error('permission_mismatch');
    const catalog = await apiJson(actor, 'GET', '/ask-data/free-sql/catalog');
    const catalogViews = sortedUnique((catalog?.tables ?? []).map((item) => item.viewName));
    const expectedViews = contract.expectedViews === '*' ? catalogViews : sortedUnique(contract.expectedViews);
    const catalogValid =
      catalog?.mode === 'execute' &&
      catalog?.executeReady === true &&
      catalog?.totalCount === catalogViews.length &&
      (contract.expectedViews === '*'
        ? catalog.totalCount === contract.expectedViewCount
        : sameStringSet(catalogViews, expectedViews));
    if (!catalogValid) throw new Error(`catalog_mismatch:${catalog?.totalCount ?? 'missing'}`);
    const csrf = await fetchCsrf(actor);

    let authorizedResult = null;
    if (contract.question) {
      const queryStartedAt = performance.now();
      const response = await apiJson(actor, 'POST', '/ask-data/free-sql', { question: contract.question }, csrf);
      const durationMs = Math.round(performance.now() - queryStartedAt);
      if (!['success', 'no_data'].includes(response?.status)) {
        throw new Error(`authorized_query_${response?.queryMeta?.statusReason ?? response?.status ?? 'missing'}`);
      }
      const debugVisible = hasDebugSql(response);
      if (debugVisible !== contract.debugSqlVisible) throw new Error('debug_sql_visibility_mismatch');
      const auditId = numericAuditId(response);
      auditExpectations.push({ auditId, actor, status: response.status, sqlExpected: true });
      authorizedResult = {
        status: response.status,
        durationMs,
        auditId,
        debugSqlVisible: debugVisible,
        semanticRouteMode: response?.queryPlan?.semanticIntent?.routeMode ?? null,
      };
    }

    let deniedResult = null;
    if (contract.deniedQuestion) {
      const denied = await apiJson(actor, 'POST', '/ask-data/free-sql', { question: contract.deniedQuestion }, csrf);
      if (denied?.status !== 'blocked' || denied?.queryMeta?.statusReason !== 'permission_denied') {
        throw new Error(`denied_query_${denied?.queryMeta?.statusReason ?? denied?.status ?? 'missing'}`);
      }
      if (hasDebugSql(denied)) throw new Error('denied_query_debug_sql_visible');
      const auditId = numericAuditId(denied);
      auditExpectations.push({ auditId, actor, status: denied.status, sqlExpected: false });
      deniedResult = { status: denied.status, reason: denied.queryMeta.statusReason, auditId };
    }

    roleResults.push({
      key: contract.key,
      status: 'pass',
      userId: actor.userId,
      storeId: actor.storeId,
      catalogCount: catalog.totalCount,
      catalogViews,
      authorized: authorizedResult,
      denied: deniedResult,
      durationMs: Math.round(performance.now() - roleStartedAt),
    });
  } catch (error) {
    roleResults.push({
      key: contract.key,
      status: 'fail',
      reason: safeError(error),
      durationMs: Math.round(performance.now() - roleStartedAt),
    });
  }
}

let crossStore = { status: 'fail', httpStatus: null, deniedStoreId: null };
try {
  const adminContract = ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.find((item) => item.key === 'admin');
  const admin = await login(adminContract.username, password);
  const csrf = await fetchCsrf(admin);
  const deniedStoreId = pickDeniedStoreId(admin.storeIds);
  const response = await apiRaw({ ...admin, storeId: deniedStoreId }, 'POST', '/ask-data/free-sql', { question: adminContract.question }, csrf);
  if (response.status !== 403) throw new Error(`cross_store_http_${response.status}`);
  crossStore = { status: 'pass', httpStatus: 403, deniedStoreId };
} catch (error) {
  crossStore = { status: 'fail', httpStatus: null, deniedStoreId: null, reason: safeError(error) };
}

let audit = { status: 'fail', persisted: 0, expected: auditExpectations.length };
try {
  audit = await verifyAuditRows(auditExpectations);
} catch (error) {
  audit = { status: 'fail', persisted: 0, expected: auditExpectations.length, reason: safeError(error) };
}

const passedRoles = roleResults.filter((item) => item.status === 'pass').length;
const result = {
  status:
    passedRoles === ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.length &&
    crossStore.status === 'pass' &&
    audit.status === 'pass'
      ? 'pass'
      : 'fail',
  generatedAt: new Date().toISOString(),
  apiBase,
  connectionBoundary: 'development_admin_api_with_real_role_login',
  roleCount: ASK_DATA_PERMISSION_ACCEPTANCE_ROLES.length,
  passedRoles,
  crossStore,
  audit,
  totalDurationMs: Date.now() - startedAt.getTime(),
  roles: roleResults,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(markdownPath, renderMarkdown(result));
console.log(JSON.stringify({ ...result, roles: roleResults.map(compactRoleResult), report: markdownPath }, null, 2));
if (strict && result.status !== 'pass') process.exitCode = 1;

async function login(username, actorPassword) {
  const login = await publicJson('POST', '/auth/login', { username, password: actorPassword });
  const token = login?.token;
  const info = login?.user;
  if (typeof token !== 'string' || !info?.id) throw new Error('login_response_invalid');
  const storeIds = [...new Set((info.storeIds ?? info.stores ?? []).map(Number).filter((value) => Number.isInteger(value) && value > 0))];
  if (storeIds.length !== 1) throw new Error(`store_scope_count_${storeIds.length}`);
  return {
    token,
    userId: Number(info.id),
    storeId: storeIds[0],
    storeIds,
    roles: Array.isArray(info.roles) ? info.roles.map(String) : [],
    permissions: Array.isArray(info.permissions) ? info.permissions.map(String) : [],
  };
}

async function fetchCsrf(actor) {
  const response = await apiRaw(actor, 'GET', '/auth/csrf-token');
  const token = response.data?.csrfToken;
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (response.status < 200 || response.status >= 300 || typeof token !== 'string' || !cookie) {
    throw new Error('csrf_fetch_failed');
  }
  return { token, cookie };
}

async function publicJson(method, path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(70000),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(`${path}_http_${response.status}:${apiMessage(data)}`);
  return data;
}

async function apiJson(actor, method, path, body, csrf) {
  const response = await apiRaw(actor, method, path, body, csrf);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${path}_http_${response.status}:${apiMessage(response.data)}`);
  }
  return response.data;
}

async function apiRaw(actor, method, path, body, csrf) {
  const headers = {
    Authorization: `Bearer ${actor.token}`,
    'X-Store-Id': String(actor.storeId),
    'Content-Type': 'application/json',
  };
  if (csrf) {
    headers.Cookie = csrf.cookie;
    headers['X-CSRF-Token'] = csrf.token;
  }
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(70000),
  });
  return { status: response.status, data: await readJson(response), headers: response.headers };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`invalid_json_http_${response.status}`);
  }
}

async function verifyAuditRows(expectations) {
  if (!expectations.length) throw new Error('audit_expectations_empty');
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL_missing');
  const databaseUrl = new URL(connectionString);
  if (!databaseUrl.hostname.endsWith('.supabase.com') && !databaseUrl.hostname.endsWith('.supabase.co')) {
    throw new Error('audit_database_host_not_approved');
  }
  const client = new Client({
    connectionString,
    statement_timeout: 10000,
    query_timeout: 10000,
    application_name: 'ask_data_permission_matrix_acceptance',
  });
  await client.connect();
  try {
    const ids = expectations.map((item) => item.auditId);
    const query = await client.query(
      `SELECT id::text AS id, "userId" AS user_id, "storeId" AS store_id, status,
              "redactedSql" AS redacted_sql, "generatedSqlHash" AS generated_sql_hash,
              "safeSqlHash" AS safe_sql_hash
         FROM ask_data_free_sql_runs
        WHERE id = ANY($1::bigint[])`,
      [ids],
    );
    const rows = new Map(query.rows.map((row) => [String(row.id), row]));
    for (const expectation of expectations) {
      const row = rows.get(expectation.auditId);
      if (!row) throw new Error(`audit_missing_${expectation.auditId}`);
      if (Number(row.user_id) !== expectation.actor.userId) throw new Error(`audit_user_${expectation.auditId}`);
      if (Number(row.store_id) !== expectation.actor.storeId) throw new Error(`audit_store_${expectation.auditId}`);
      if (row.status !== expectation.status) throw new Error(`audit_status_${expectation.auditId}`);
      if (expectation.sqlExpected && (!row.redacted_sql || !row.generated_sql_hash || !row.safe_sql_hash)) {
        throw new Error(`audit_sql_evidence_${expectation.auditId}`);
      }
    }
    return { status: 'pass', persisted: rows.size, expected: expectations.length };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function renderMarkdown(value) {
  const rows = value.roles.map((role) => {
    const authorized = role.authorized?.status ?? '-';
    const denied = role.denied?.reason ?? '-';
    const debug = role.authorized ? String(role.authorized.debugSqlVisible) : '-';
    return `| ${role.key} | ${role.status} | ${role.catalogCount ?? '-'} | ${authorized} | ${denied} | ${debug} | ${role.durationMs} |`;
  });
  return [
    '# Ami Ask 权限矩阵真实验收报告',
    '',
    `- 生成时间：${value.generatedAt}`,
    `- 结果：${value.status}`,
    `- 连接边界：${value.connectionBoundary}`,
    `- 角色：${value.passedRoles}/${value.roleCount}`,
    `- 跨店伪造：${value.crossStore.status}（HTTP ${value.crossStore.httpStatus ?? '-'}）`,
    `- 审计落库：${value.audit.persisted}/${value.audit.expected}`,
    `- 总耗时：${value.totalDurationMs}ms`,
    '',
    '## 角色结果',
    '',
    '| 角色 | 结果 | 目录数 | 授权查询 | 越权查询 | SQL可见 | 耗时ms |',
    '|---|---|---:|---|---|---|---:|',
    ...rows,
    '',
    '## 边界说明',
    '',
    '- 本报告使用共享开发库和 development_admin 执行连接，证明真实登录、权限、单店范围和审计链路。',
    '- 本报告不是生产专用只读角色的最小权限证明。',
    '- 报告不记录密码、Token、完整 SQL 或客户明细。',
    '',
  ].join('\n');
}

function compactRoleResult(role) {
  return {
    key: role.key,
    status: role.status,
    reason: role.reason,
    catalogCount: role.catalogCount,
    authorizedStatus: role.authorized?.status,
    deniedReason: role.denied?.reason,
    debugSqlVisible: role.authorized?.debugSqlVisible,
    durationMs: role.durationMs,
  };
}

function numericAuditId(response) {
  const id = String(response?.auditRunId ?? '');
  if (!/^\d+$/.test(id)) throw new Error('audit_id_missing');
  return id;
}

function hasDebugSql(response) {
  return Boolean(response?.queryMeta?.generatedSql || response?.queryPlan?.generatedSql);
}

function pickDeniedStoreId(visibleStoreIds) {
  const visible = new Set(visibleStoreIds);
  let candidate = 1;
  while (visible.has(candidate)) candidate += 1;
  return candidate;
}

function normalizeApiBase(value) {
  const normalized = String(value).trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(normalized)) throw new Error('API base must be HTTP(S).');
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

function apiMessage(data) {
  const value = data?.message;
  return (Array.isArray(value) ? value.join(',') : String(value ?? 'request_failed')).slice(0, 300);
}

function safeError(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer <redacted>')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://<redacted>')
    .slice(0, 500);
}
