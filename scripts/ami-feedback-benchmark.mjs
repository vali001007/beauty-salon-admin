import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  ensurePostgresSecrets,
  ensureRuntimeLayout,
  parseArgs,
  parseEnvFile,
  redact,
  slotConfig,
  writeJson,
} from './ami-dev-common.mjs';

const args = parseArgs();
const samples = Number(args.value('samples', 10));
if (!Number.isInteger(samples) || samples < 1 || samples > 100) {
  throw new Error('samples 必须为 1—100 的整数。');
}

function required(name) {
  const value = args.value(name);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少必填参数 --${name}。`);
  return value.trim();
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * fraction) - 1));
  return ordered[index];
}

function summary(values) {
  return {
    samples: values.length,
    minMs: Math.min(...values),
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: Math.max(...values),
    valuesMs: values,
  };
}

async function timedRequest(url, init, expectedStatuses = [200]) {
  const startedAt = performance.now();
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => null);
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${url} 返回 HTTP ${response.status}：${JSON.stringify(body)?.slice(0, 500)}`);
  }
  return { elapsedMs, status: response.status, body };
}

function credentials() {
  const slot = args.value('slot');
  if (slot) {
    const config = slotConfig(slot);
    const runtime = parseEnvFile(config.runtimeEnvPath);
    const { env } = ensurePostgresSecrets();
    return {
      username: runtime.AMI_LOCAL_FIXTURE_USERNAME,
      password: env.AMI_LOCAL_FIXTURE_PASSWORD,
      slotId: config.slot,
    };
  }
  const passwordEnv = args.value('password-env', 'AMI_BENCHMARK_PASSWORD');
  const password = process.env[passwordEnv]?.trim();
  if (!password) throw new Error(`缺少环境变量 ${passwordEnv}，拒绝从命令行接收密码。`);
  return { username: required('username'), password, slotId: null };
}

async function login(apiBaseUrl, auth) {
  const result = await timedRequest(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': randomUUID() },
    body: JSON.stringify({ username: auth.username, password: auth.password }),
  });
  if (!result.body?.token) throw new Error('登录响应缺少 token。');
  return result;
}

async function main() {
  const name = required('name');
  const apiBaseUrl = required('api-base-url').replace(/\/$/u, '');
  const pageUrl = args.value('page-url')?.trim() || null;
  const storeId = Number(required('store-id'));
  if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('store-id 必须为正整数。');
  const auth = credentials();

  const loginValues = [];
  let token = null;
  for (let index = 0; index < samples; index += 1) {
    const result = await login(apiBaseUrl, auth);
    loginValues.push(result.elapsedMs);
    token = result.body.token;
  }

  const headers = { authorization: `Bearer ${token}`, 'x-request-id': randomUUID() };
  const readinessValues = [];
  let readiness = null;
  for (let index = 0; index < samples; index += 1) {
    const result = await timedRequest(`${apiBaseUrl}/api/health/ready`);
    readinessValues.push(result.elapsedMs);
    readiness = result.body;
  }

  const bootstrapValues = [];
  let bootstrap = null;
  for (let index = 0; index < samples; index += 1) {
    const result = await timedRequest(`${apiBaseUrl}/api/terminal/bootstrap?storeId=${storeId}`, { headers });
    bootstrapValues.push(result.elapsedMs);
    bootstrap = result.body;
  }

  const pageValues = [];
  if (pageUrl) {
    for (let index = 0; index < samples; index += 1) {
      const result = await timedRequest(pageUrl, { headers: { 'cache-control': 'no-cache' } });
      pageValues.push(result.elapsedMs);
    }
  }

  let consumeReplay = null;
  const replayKey = args.value('consume-replay-key')?.trim();
  if (replayKey) {
    const payload = {
      idempotencyKey: replayKey,
      customerId: Number(required('consume-customer-id')),
      customerCardId: Number(required('consume-customer-card-id')),
      projectId: Number(required('consume-project-id')),
      beauticianId: Number(required('consume-beautician-id')),
      operatorId: Number(required('consume-operator-id')),
      times: Number(args.value('consume-times', 1)),
    };
    if (Object.values(payload).some((value) => typeof value === 'number' && (!Number.isInteger(value) || value <= 0))) {
      throw new Error('核销 replay 参数必须为正整数。');
    }
    const values = [];
    for (let index = 0; index < samples; index += 1) {
      const result = await timedRequest(
        `${apiBaseUrl}/api/terminal/cards/consume`,
        {
          method: 'POST',
          headers: {
            ...headers,
            'content-type': 'application/json',
            'idempotency-key': replayKey,
            'x-request-id': randomUUID(),
          },
          body: JSON.stringify(payload),
        },
        [200, 201],
      );
      if (result.body?.idempotencyStatus !== 'replayed') {
        throw new Error(`核销 replay 第 ${index + 1} 次未返回 replayed。`);
      }
      values.push(result.elapsedMs);
    }
    consumeReplay = summary(values);
  }

  const report = {
    schemaVersion: 'ami-feedback-benchmark/v1',
    name,
    generatedAt: new Date().toISOString(),
    target: {
      apiBaseUrl,
      pageUrl,
      storeId,
      slotId: auth.slotId,
      databaseTarget: readiness?.databaseTarget ?? null,
      runtime: readiness?.runtime ?? null,
      storeName: bootstrap?.currentStore?.name ?? null,
    },
    measurements: {
      login: summary(loginValues),
      readiness: summary(readinessValues),
      bootstrap: summary(bootstrapValues),
      pageHttp: pageValues.length ? summary(pageValues) : null,
      consumeReplay,
      observedWarmup: readiness?.brainActiveReleaseWarmup ?? null,
    },
  };
  const paths = ensureRuntimeLayout();
  const output = resolve(args.value('output', join(paths.reportsDir, `feedback-benchmark-${name}-${Date.now()}.json`)));
  writeJson(output, report);
  console.log(JSON.stringify({
    status: 'completed',
    output,
    name,
    mediansMs: {
      login: report.measurements.login.medianMs,
      readiness: report.measurements.readiness.medianMs,
      bootstrap: report.measurements.bootstrap.medianMs,
      pageHttp: report.measurements.pageHttp?.medianMs ?? null,
      consumeReplay: report.measurements.consumeReplay?.medianMs ?? null,
      observedWarmup: report.measurements.observedWarmup?.latencyMs ?? null,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
