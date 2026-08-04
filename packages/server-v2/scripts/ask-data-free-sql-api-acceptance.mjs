import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const packageRoot = resolve(import.meta.dirname, '..');
const acceptancePrefix = 'ASK_DATA_FREE_SQL_ACCEPTANCE_';

if (isMainModule()) {
  await main();
}

async function main() {
  loadEnv({ path: resolve(packageRoot, '.env'), quiet: true });
  const options = parseOptions();
  try {
    const result =
      options.mode === 'legacy'
        ? await runLegacyAcceptance(options)
        : options.mode === 'semantic_legacy'
          ? await runSemanticLegacyAcceptance(options)
        : options.mode === 'development_admin'
          ? await runDevelopmentAdminAcceptance(options)
          : await runExecuteAcceptance(options);
    print(result, options.strict);
  } catch (error) {
    print(
      {
        status: 'fail',
        mode: options.mode,
        reason: safeErrorMessage(error),
      },
      options.strict,
    );
  }
}

function parseOptions() {
  const modeArg = process.argv.find((value) => value.startsWith('--mode='))?.split('=').slice(1).join('=');
  const mode = modeArg ?? process.env.ASK_DATA_FREE_SQL_ACCEPTANCE_MODE ?? 'execute';
  if (!['execute', 'legacy', 'semantic_legacy', 'development_admin'].includes(mode)) {
    throw new Error('--mode must be execute, legacy, semantic_legacy or development_admin.');
  }
  return {
    mode,
    strict: process.argv.includes('--strict'),
    baseUrl: normalizeApiBase(
      process.env.ASK_DATA_FREE_SQL_ACCEPTANCE_API_BASE ?? 'http://localhost:8080/api',
    ),
    question:
      process.env.ASK_DATA_FREE_SQL_ACCEPTANCE_QUESTION ?? '本月项目收入按项目排行',
    userQuestion:
      process.env.ASK_DATA_FREE_SQL_ACCEPTANCE_USER_QUESTION ??
      process.env.ASK_DATA_FREE_SQL_ACCEPTANCE_QUESTION ??
      '本月项目收入按项目排行',
    userDeniedQuestion:
      process.env.ASK_DATA_FREE_SQL_ACCEPTANCE_USER_DENIED_QUESTION ?? '本月营业额、退款和净收分别是多少？',
    userRequiredPermissions: csvValues(
      process.env.ASK_DATA_FREE_SQL_ACCEPTANCE_USER_REQUIRED_PERMISSIONS ??
        'core:order:projects,core:store:projects',
    ),
    expectedConnectionMode: process.env.ASK_DATA_FREE_SQL_ACCEPTANCE_EXPECT_CONNECTION_MODE?.trim(),
    legacyQuestion:
      process.env.ASK_DATA_FREE_SQL_ACCEPTANCE_LEGACY_QUESTION ?? '上个月收入按项目看',
  };
}

async function runExecuteAcceptance(options) {
  const missing = missingAuthActors(['ADMIN', 'USER']);
  if (missing.length) {
    return {
      status: options.strict ? 'fail' : 'skip',
      mode: 'execute',
      reason: `missing_auth:${missing.join(',')}`,
      required:
        'Provide a token, or username + password, for both ADMIN and USER acceptance actors.',
    };
  }

  const [admin, user] = await Promise.all([
    resolveActor(options.baseUrl, 'ADMIN'),
    resolveActor(options.baseUrl, 'USER'),
  ]);
  assertAcceptancePermissions(admin, user, options.userRequiredPermissions);
  const [adminCatalog, userCatalog] = await Promise.all([
    apiJson(options.baseUrl, admin, 'GET', '/ask-data/free-sql/catalog'),
    apiJson(options.baseUrl, user, 'GET', '/ask-data/free-sql/catalog'),
  ]);
  assertCatalogExecute(adminCatalog, 'admin');
  assertCatalogExecute(userCatalog, 'user');
  assertCatalogConnectionMode(adminCatalog, options.expectedConnectionMode, 'admin');
  assertCatalogConnectionMode(userCatalog, options.expectedConnectionMode, 'user');

  const [adminCsrf, userCsrf] = await Promise.all([
    fetchCsrf(options.baseUrl, admin),
    fetchCsrf(options.baseUrl, user),
  ]);
  const [adminResponse, userResponse] = await Promise.all([
    apiJson(options.baseUrl, admin, 'POST', '/ask-data/free-sql', { question: options.question }, adminCsrf),
    apiJson(options.baseUrl, user, 'POST', '/ask-data/free-sql', { question: options.userQuestion }, userCsrf),
  ]);

  assertSuccessfulQuery(adminResponse, 'admin');
  assertSuccessfulQuery(userResponse, 'user');
  if (!hasDebugSql(adminResponse)) throw new Error('admin_debug_sql_missing');
  if (hasDebugSql(userResponse)) throw new Error('ordinary_user_debug_sql_visible');

  const deniedResponse = await apiJson(
    options.baseUrl,
    user,
    'POST',
    '/ask-data/free-sql',
    { question: options.userDeniedQuestion },
    userCsrf,
  );
  if (deniedResponse?.status !== 'blocked' || deniedResponse?.queryMeta?.statusReason !== 'permission_denied') {
    throw new Error(
      `ordinary_user_denied_query_expected_permission_denied_got_${String(
        deniedResponse?.queryMeta?.statusReason ?? deniedResponse?.status ?? 'missing',
      )}`,
    );
  }
  if (hasDebugSql(deniedResponse)) throw new Error('ordinary_user_denied_query_debug_sql_visible');

  const adminAuditId = numericAuditId(adminResponse, 'admin');
  const userAuditId = numericAuditId(userResponse, 'user');
  const deniedStoreId = pickDeniedStoreId(user.storeIds);
  const crossStoreActor = { ...user, storeId: deniedStoreId };
  const crossStore = await apiRaw(
    options.baseUrl,
    crossStoreActor,
    'POST',
    '/ask-data/free-sql',
    { question: options.userQuestion },
    userCsrf,
  );
  if (crossStore.status !== 403) {
    throw new Error(`cross_store_expected_403_got_${crossStore.status}`);
  }

  const auditEvidence = await verifyAuditRows([
    { auditId: adminAuditId, actor: admin, response: adminResponse },
    { auditId: userAuditId, actor: user, response: userResponse },
  ]);

  return {
    status: 'pass',
    mode: 'execute',
    catalog: {
      admin: 'execute',
      user: 'execute',
      connectionMode: adminCatalog.connectionMode ?? 'unavailable',
    },
    admin: {
      userId: admin.userId,
      storeId: admin.storeId,
      queryStatus: adminResponse.status,
      debugSqlVisible: true,
      auditPersisted: auditEvidence.has(adminAuditId),
    },
    ordinaryUser: {
      userId: user.userId,
      storeId: user.storeId,
      queryStatus: userResponse.status,
      debugSqlVisible: false,
      auditPersisted: auditEvidence.has(userAuditId),
      deniedQueryStatus: deniedResponse.status,
      deniedReason: deniedResponse.queryMeta.statusReason,
    },
    crossStore: { deniedStoreId, httpStatus: 403 },
  };
}

async function runDevelopmentAdminAcceptance(options) {
  const missing = missingAuthActors(['ADMIN']);
  if (missing.length) {
    return {
      status: options.strict ? 'fail' : 'skip',
      mode: 'development_admin',
      reason: 'missing_auth:ADMIN',
      required: 'Provide an ADMIN token, or ADMIN username + password.',
    };
  }
  const admin = await resolveActor(options.baseUrl, 'ADMIN');
  assertAdminPermissions(admin);
  const catalog = await apiJson(options.baseUrl, admin, 'GET', '/ask-data/free-sql/catalog');
  if (
    catalog?.mode !== 'execute' ||
    catalog?.executeReady !== true ||
    catalog?.connectionMode !== 'development_admin'
  ) {
    throw new Error('development_admin_catalog_not_ready');
  }
  const csrf = await fetchCsrf(options.baseUrl, admin);
  const response = await apiJson(
    options.baseUrl,
    admin,
    'POST',
    '/ask-data/free-sql',
    { question: options.question },
    csrf,
  );
  assertSuccessfulQuery(response, 'admin');
  if (!hasDebugSql(response)) throw new Error('admin_debug_sql_missing');
  if (response?.queryMeta?.connectionMode !== 'development_admin') {
    throw new Error('development_admin_query_marker_missing');
  }
  if (
    !Array.isArray(response?.limitations) ||
    !response.limitations.some((item) => String(item).includes('开发环境管理员数据库连接冒烟模式'))
  ) {
    throw new Error('development_admin_warning_missing');
  }
  const auditId = numericAuditId(response, 'admin');
  const auditEvidence = await verifyAuditRows([{ auditId, actor: admin, response }]);
  const deniedStoreId = pickDeniedStoreId(admin.storeIds);
  const crossStore = await apiRaw(
    options.baseUrl,
    { ...admin, storeId: deniedStoreId },
    'POST',
    '/ask-data/free-sql',
    { question: options.question },
    csrf,
  );
  if (crossStore.status !== 403) throw new Error(`cross_store_expected_403_got_${crossStore.status}`);
  return {
    status: 'pass',
    mode: 'development_admin',
    userId: admin.userId,
    storeId: admin.storeId,
    queryStatus: response.status,
    connectionMode: 'development_admin',
    debugSqlVisible: true,
    auditPersisted: auditEvidence.has(auditId),
    crossStoreHttpStatus: 403,
    acceptanceBoundary: 'development_functional_smoke_only',
  };
}

async function runLegacyAcceptance(options) {
  const missing = missingAuthActors(['ADMIN']);
  if (missing.length) {
    return {
      status: options.strict ? 'fail' : 'skip',
      mode: 'legacy',
      reason: 'missing_auth:ADMIN',
      required: 'Provide an ADMIN token, or ADMIN username + password.',
    };
  }
  const admin = await resolveActor(options.baseUrl, 'ADMIN');
  const catalog = await apiJson(options.baseUrl, admin, 'GET', '/ask-data/free-sql/catalog');
  if (catalog?.mode !== 'legacy' || catalog?.enabled !== false) {
    throw new Error('legacy_catalog_mode_not_active');
  }
  const csrf = await fetchCsrf(options.baseUrl, admin);
  const response = await apiJson(
    options.baseUrl,
    admin,
    'POST',
    '/ask-data/free-sql',
    { question: options.legacyQuestion },
    csrf,
  );
  if (!['success', 'no_data'].includes(response?.status)) {
    throw new Error(`legacy_query_status_${String(response?.status ?? 'missing')}`);
  }
  if (response?.queryPlan?.planner !== 'legacy') throw new Error('legacy_planner_missing');
  if (hasDebugSql(response)) throw new Error('legacy_response_must_not_contain_debug_sql');
  if (!Array.isArray(response?.limitations) || !response.limitations.some((item) => String(item).includes('固定模板'))) {
    throw new Error('legacy_fallback_limitation_missing');
  }
  return {
    status: 'pass',
    mode: 'legacy',
    catalogMode: 'legacy',
    queryStatus: response.status,
    planner: 'legacy',
    fixedTemplateFallback: true,
  };
}

async function runSemanticLegacyAcceptance(options) {
  const missing = missingAuthActors(['ADMIN']);
  if (missing.length) {
    return {
      status: options.strict ? 'fail' : 'skip',
      mode: 'semantic_legacy',
      reason: 'missing_auth:ADMIN',
      required: 'Provide an ADMIN token, or ADMIN username + password.',
    };
  }
  const admin = await resolveActor(options.baseUrl, 'ADMIN');
  assertAdminPermissions(admin);
  const catalog = await apiJson(options.baseUrl, admin, 'GET', '/ask-data/free-sql/catalog');
  if (catalog?.mode !== 'execute' || catalog?.executeReady !== true) {
    throw new Error('semantic_legacy_catalog_not_execute_ready');
  }
  const csrf = await fetchCsrf(options.baseUrl, admin);
  const response = await apiJson(
    options.baseUrl,
    admin,
    'POST',
    '/ask-data/free-sql',
    { question: options.question },
    csrf,
  );
  assertSuccessfulQuery(response, 'admin');
  if (!hasDebugSql(response)) throw new Error('semantic_legacy_admin_debug_sql_missing');
  if (response?.queryPlan?.semanticIntent) throw new Error('semantic_router_still_active_after_disable');
  return {
    status: 'pass',
    mode: 'semantic_legacy',
    catalogMode: catalog.mode,
    queryStatus: response.status,
    planner: response?.queryPlan?.planner ?? 'missing',
    semanticIntentPresent: false,
    oldSelectorFallback: true,
  };
}

function actorConfig(actor) {
  const prefix = `${acceptancePrefix}${actor}_`;
  return {
    token: process.env[`${prefix}TOKEN`]?.trim(),
    username: process.env[`${prefix}USERNAME`]?.trim(),
    password: process.env[`${prefix}PASSWORD`],
    storeId: positiveInteger(process.env[`${prefix}STORE_ID`]),
  };
}

function missingAuthActors(actors) {
  return actors.filter((actor) => {
    const config = actorConfig(actor);
    return !(config.token || (config.username && config.password));
  });
}

async function resolveActor(baseUrl, actorName) {
  const config = actorConfig(actorName);
  let token = config.token;
  let loginUser;
  if (!token) {
    const login = await publicJson(baseUrl, 'POST', '/auth/login', {
      username: config.username,
      password: config.password,
    });
    token = typeof login?.token === 'string' ? login.token : undefined;
    loginUser = login?.user;
    if (!token) throw new Error(`${actorName.toLowerCase()}_login_token_missing`);
  }
  const info = loginUser?.id ? loginUser : await apiJson(baseUrl, { token, storeId: config.storeId ?? 1 }, 'GET', '/auth/user-info');
  const storeIds = normalizeStoreIds(info?.storeIds ?? info?.stores);
  const storeId = config.storeId ?? storeIds[0];
  if (!storeId || !storeIds.includes(storeId)) {
    throw new Error(`${actorName.toLowerCase()}_store_scope_missing`);
  }
  const userId = positiveInteger(info?.id);
  if (!userId) throw new Error(`${actorName.toLowerCase()}_user_id_missing`);
  const permissions = Array.isArray(info?.permissions) ? info.permissions.map(String) : [];
  return { token, storeId, storeIds, userId, permissions };
}

async function fetchCsrf(baseUrl, actor) {
  const response = await apiRaw(baseUrl, actor, 'GET', '/auth/csrf-token');
  const token = response.data?.csrfToken;
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (response.status < 200 || response.status >= 300 || typeof token !== 'string' || !cookie) {
    throw new Error('csrf_token_fetch_failed');
  }
  return { token, cookie };
}

async function publicJson(baseUrl, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(70000),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(`${path}_http_${response.status}:${apiMessage(data)}`);
  return data;
}

async function apiJson(baseUrl, actor, method, path, body, csrf) {
  const response = await apiRaw(baseUrl, actor, method, path, body, csrf);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${path}_http_${response.status}:${apiMessage(response.data)}`);
  }
  return response.data;
}

async function apiRaw(baseUrl, actor, method, path, body, csrf) {
  const headers = {
    Authorization: `Bearer ${actor.token}`,
    'X-Store-Id': String(actor.storeId),
    'Content-Type': 'application/json',
  };
  if (csrf) {
    headers.Cookie = csrf.cookie;
    headers['X-CSRF-Token'] = csrf.token;
  }
  const response = await fetch(`${baseUrl}${path}`, {
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
    throw new Error(`invalid_json_response_http_${response.status}`);
  }
}

function assertCatalogExecute(catalog, actor) {
  if (catalog?.mode !== 'execute' || catalog?.enabled !== true || catalog?.executeReady !== true) {
    throw new Error(`${actor}_catalog_not_execute_ready`);
  }
}

function assertCatalogConnectionMode(catalog, expected, actor) {
  if (expected && catalog?.connectionMode !== expected) {
    throw new Error(`${actor}_catalog_connection_mode_expected_${expected}_got_${String(catalog?.connectionMode)}`);
  }
}

function assertSuccessfulQuery(response, actor) {
  if (!['success', 'no_data'].includes(response?.status)) {
    const reason = response?.queryMeta?.statusReason ?? response?.status ?? 'missing';
    throw new Error(`${actor}_query_not_successful:${String(reason)}`);
  }
  if (response?.queryPlan?.planner !== 'llm') throw new Error(`${actor}_llm_planner_missing`);
}

export function hasDebugSql(response) {
  return Boolean(response?.queryMeta?.generatedSql || response?.queryPlan?.generatedSql);
}

function assertAcceptancePermissions(admin, user, requiredPermissions) {
  assertAdminPermissions(admin);
  if (canViewDebugSqlPermission(user.permissions)) throw new Error('ordinary_user_has_debug_permission');
  for (const permission of ['core:dashboard:view', ...requiredPermissions]) {
    if (!hasPermission(user.permissions, permission)) throw new Error(`ordinary_user_permission_missing:${permission}`);
  }
}

function assertAdminPermissions(admin) {
  if (!canViewDebugSqlPermission(admin.permissions)) throw new Error('admin_debug_permission_missing');
  for (const permission of ['core:order:projects', 'core:store:projects']) {
    if (!hasPermission(admin.permissions, permission)) throw new Error(`admin_permission_missing:${permission}`);
  }
}

export function canViewDebugSqlPermission(permissions) {
  return (
    permissions.includes('*') ||
    permissions.includes('core:system:logs') ||
    permissions.includes('core:agent-governance:view')
  );
}

function hasPermission(permissions, permission) {
  return permissions.includes('*') || permissions.includes(permission);
}

function numericAuditId(response, actor) {
  const id = String(response?.auditRunId ?? '');
  if (!/^\d+$/.test(id)) throw new Error(`${actor}_audit_not_persisted`);
  return id;
}

async function verifyAuditRows(expectations) {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL_missing_for_audit_verification');
  const databaseUrl = new URL(connectionString);
  if (!isApprovedDatabaseHost(databaseUrl.hostname)) {
    throw new Error('unapproved_database_host_for_audit_verification');
  }
  const client = new Client({
    connectionString,
    statement_timeout: 10000,
    query_timeout: 10000,
    application_name: 'ask_data_free_sql_api_acceptance',
  });
  await client.connect();
  try {
    const ids = expectations.map((item) => item.auditId);
    const result = await client.query(
      `SELECT id::text AS id, "userId" AS user_id, "storeId" AS store_id, status,
              "redactedSql" AS redacted_sql, "generatedSqlHash" AS generated_sql_hash,
              "safeSqlHash" AS safe_sql_hash
         FROM ask_data_free_sql_runs
        WHERE id = ANY($1::bigint[])`,
      [ids],
    );
    const rows = new Map(result.rows.map((row) => [String(row.id), row]));
    for (const expected of expectations) {
      const row = rows.get(expected.auditId);
      if (!row) throw new Error(`audit_row_missing:${expected.auditId}`);
      if (Number(row.user_id) !== expected.actor.userId) throw new Error(`audit_user_mismatch:${expected.auditId}`);
      if (Number(row.store_id) !== expected.actor.storeId) throw new Error(`audit_store_mismatch:${expected.auditId}`);
      if (row.status !== expected.response.status) throw new Error(`audit_status_mismatch:${expected.auditId}`);
      if (!row.redacted_sql || !row.generated_sql_hash || !row.safe_sql_hash) {
        throw new Error(`audit_sql_evidence_missing:${expected.auditId}`);
      }
    }
    return rows;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function pickDeniedStoreId(visibleStoreIds) {
  const visible = new Set(normalizeStoreIds(visibleStoreIds));
  let candidate = 1;
  while (visible.has(candidate)) candidate += 1;
  return candidate;
}

function normalizeStoreIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(positiveInteger).filter(Boolean))];
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function csvValues(value) {
  return [...new Set(String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean))];
}

export function normalizeApiBase(value) {
  const trimmed = String(value ?? '').trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(trimmed)) throw new Error('API base must be an HTTP(S) URL.');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function isApprovedDatabaseHost(hostname) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized.endsWith('.supabase.com') ||
    normalized.endsWith('.supabase.co')
  );
}

function apiMessage(data) {
  const value = data?.message;
  if (Array.isArray(value)) return value.map(String).join(',').slice(0, 300);
  return String(value ?? 'request_failed').slice(0, 300);
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer <redacted>')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://<redacted>')
    .slice(0, 500);
}

function print(result, strict) {
  console.log(JSON.stringify(result, null, 2));
  if (strict && result.status !== 'pass') process.exitCode = 1;
}

function isMainModule() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}
