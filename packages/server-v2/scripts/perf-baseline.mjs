#!/usr/bin/env node
import process from 'node:process';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const checkOnly = process.argv.includes('--check');
const config = {
  baseUrl: required('PERF_BASE_URL'),
  username: required('PERF_LOGIN_USERNAME'),
  password: required('PERF_LOGIN_PASSWORD'),
  storeId: optionalNumber('PERF_STORE_ID'),
  iterations: Math.max(1, optionalNumber('PERF_ITERATIONS') ?? 5),
  brainConversationId: process.env.PERF_BRAIN_CONVERSATION_ID?.trim() || null,
  brainMode: enumValue('PERF_BRAIN_MODE', ['skip', 'readback', 'execute'], 'skip'),
  brainQuestion: process.env.PERF_BRAIN_QUESTION?.trim() || '查询本月订单实收金额和平均客单价',
  brainRoleHint: process.env.PERF_BRAIN_ROLE_HINT?.trim() || 'finance',
  brainIterations: Math.max(1, optionalNumber('PERF_BRAIN_ITERATIONS') ?? 3),
  outputPath: process.env.PERF_OUTPUT_PATH?.trim() || null,
};

validateConfig(config, checkOnly);
if (checkOnly) {
  const missing = ['PERF_BASE_URL', 'PERF_LOGIN_USERNAME', 'PERF_LOGIN_PASSWORD', 'PERF_STORE_ID']
    .filter((name) => !process.env[name]?.trim());
  if (config.brainMode !== 'skip' && !config.brainConversationId) missing.push('PERF_BRAIN_CONVERSATION_ID');
  console.log(JSON.stringify({
    status: missing.length ? 'configuration_required' : 'ready',
    missing,
    configured: {
      baseUrl: Boolean(config.baseUrl),
      username: Boolean(config.username),
      password: Boolean(config.password),
      storeId: config.storeId !== undefined,
      brainMode: config.brainMode,
      brainConversationId: Boolean(config.brainConversationId),
      outputPath: Boolean(config.outputPath),
    },
  }, null, 2));
  process.exit(missing.length ? 1 : 0);
}

const apiBase = config.baseUrl.replace(/\/$/, '').endsWith('/api')
  ? config.baseUrl.replace(/\/$/, '')
  : `${config.baseUrl.replace(/\/$/, '')}/api`;

const startedAt = performance.now();
const connectionMs = await measureConnection(apiBase);
const login = await request('/auth/login', {
  method: 'POST',
  body: { username: config.username, password: config.password },
});
if (!login.ok) throw new Error(`登录失败: HTTP ${login.status}`);
const token = login.body?.token;
if (typeof token !== 'string' || !token) throw new Error('登录响应未返回 token');
const csrf = await fetchCsrf(token);

const headers = {
  authorization: `Bearer ${token}`,
  cookie: csrf.cookie,
  'x-csrf-token': csrf.token,
  'x-perf-baseline': '1',
  ...(config.storeId ? { 'x-store-id': String(config.storeId) } : {}),
};

const targets = [
  { name: 'health.ready', path: '/health/ready' },
  { name: 'dashboard.workbench', path: '/dashboard/workbench' },
  { name: 'dashboard.overview', path: '/dashboard/overview' },
];
if (config.brainMode === 'readback') {
  targets.push({
    name: 'brain.metric.readback',
    path: `/brain/conversations/${encodeURIComponent(config.brainConversationId)}/messages`,
    iterations: config.brainIterations,
  });
}
if (config.brainMode === 'execute') {
  targets.push({
    name: 'brain.metric.execute',
    path: `/brain/conversations/${encodeURIComponent(config.brainConversationId)}/messages`,
    method: 'POST',
    body: { message: config.brainQuestion, roleHint: config.brainRoleHint, timezone: 'Asia/Shanghai' },
    iterations: config.brainIterations,
  });
}

const measurements = {};
for (const target of targets) {
  measurements[target.name] = await benchmark(target, headers, target.iterations ?? config.iterations);
}

const report = {
  generatedAt: new Date().toISOString(),
  elapsedMs: Math.round(performance.now() - startedAt),
  connectionMs,
  loginMs: login.elapsedMs,
  config: {
    baseUrl: apiBase,
    storeId: config.storeId,
    iterations: config.iterations,
    brainMode: config.brainMode,
    brainIterations: config.brainIterations,
    brainConversationIdConfigured: Boolean(config.brainConversationId),
  },
  measurements,
  notes: brainNotes(config),
};
const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
if (config.outputPath) {
  const outputPath = resolve(process.cwd(), config.outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serializedReport, 'utf8');
}
console.log(serializedReport.trimEnd());

async function benchmark(target, requestHeaders, iterations) {
  const samples = [];
  const failures = [];
  const databaseDurations = [];
  const logicalQueryCounts = [];
  const databaseQueryCounts = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    const response = await request(target.path, {
      headers: requestHeaders,
      method: target.method,
      body: target.body,
    });
    const elapsedMs = performance.now() - started;
    samples.push(elapsedMs);
    if (!response.ok) failures.push({ iteration: index + 1, status: response.status });
    const dbMs = findNumber(response.body, ['databaseMs', 'databaseDurationMs', 'dbMs', 'queryDurationMs']);
    const logicalQueryCount = findNumber(response.body, ['queryCount']);
    const databaseQueryCount = findNumber(response.body, ['databaseQueryCount']);
    if (dbMs !== undefined) databaseDurations.push(dbMs);
    if (logicalQueryCount !== undefined) logicalQueryCounts.push(logicalQueryCount);
    if (databaseQueryCount !== undefined) databaseQueryCounts.push(databaseQueryCount);
  }
  return {
    iterations,
    failureRate: failures.length / iterations,
    failures,
    responseMs: summary(samples),
    databaseMs: databaseDurations.length ? summary(databaseDurations) : null,
    logicalQueryCount: logicalQueryCounts.length ? summary(logicalQueryCounts) : null,
    databaseQueryCount: databaseQueryCounts.length ? summary(databaseQueryCounts) : null,
  };
}

async function request(path, options = {}) {
  const started = performance.now();
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body, elapsedMs: round(performance.now() - started) };
}

async function fetchCsrf(token) {
  const response = await fetch(`${apiBase}/auth/csrf-token`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null);
  const csrfToken = body?.csrfToken;
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!response.ok || typeof csrfToken !== 'string' || !csrfToken || !cookie) {
    throw new Error(`CSRF token 获取失败: HTTP ${response.status}`);
  }
  return { token: csrfToken, cookie };
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: round(sorted[0] ?? 0),
    median: round(percentile(sorted, 0.5)),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1) ?? 0),
  };
}

function percentile(sorted, percentileValue) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function findNumber(value, keys) {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findNumber(item, keys);
      if (result !== undefined) return result;
    }
    return undefined;
  }
  for (const [key, item] of Object.entries(value)) {
    if (keys.includes(key) && typeof item === 'number') return item;
    const result = findNumber(item, keys);
    if (result !== undefined) return result;
  }
  return undefined;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value && checkOnly) return '';
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalNumber(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function enumValue(name, allowed, fallback) {
  const value = process.env[name]?.trim() || fallback;
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

function validateConfig(value, isCheckOnly = false) {
  if (value.brainMode !== 'skip' && !value.brainConversationId) {
    if (isCheckOnly) return;
    throw new Error('PERF_BRAIN_CONVERSATION_ID is required when PERF_BRAIN_MODE is readback or execute');
  }
}

function brainNotes(value) {
  if (value.brainMode === 'readback') {
    return ['Brain 指标路径使用既有会话消息只读回读；不会创建会话或发送新消息。'];
  }
  if (value.brainMode === 'execute') {
    return [
      `Brain 指标执行模式会向既有开发会话发送 ${value.brainIterations} 条确定性问数消息，并生成正常会话/运行审计记录；不会修改订单、库存或资金业务数据。`,
    ];
  }
  return ['PERF_BRAIN_MODE=skip，Brain 指标路径未执行。'];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function measureConnection(value) {
  const url = new URL(value);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const options = { host: url.hostname, port, servername: url.hostname };
    const socket = url.protocol === 'https:' ? connectTls(options) : connectTcp(options);
    const readyEvent = url.protocol === 'https:' ? 'secureConnect' : 'connect';
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('连接性能探测超时'));
    }, 10000);
    socket.once(readyEvent, () => {
      clearTimeout(timeout);
      const elapsed = round(performance.now() - started);
      socket.destroy();
      resolve(elapsed);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
