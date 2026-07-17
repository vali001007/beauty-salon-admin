import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  frontend: path.join(repoRoot, '.env.example'),
  backend: path.join(repoRoot, 'packages/server-v2/.env.example'),
  production: path.join(repoRoot, '.env.production.example'),
};

const envs = Object.fromEntries(
  Object.entries(paths).map(([name, filePath]) => [name, parseEnv(readFileSync(filePath, 'utf8'))]),
);
const errors = [];

for (const key of Object.keys(envs.frontend)) {
  if (!key.startsWith('VITE_') && !key.startsWith('E2E_')) {
    errors.push(`根 .env.example 包含非前端变量：${key}`);
  }
}

for (const key of Object.keys(envs.backend)) {
  if (!Object.hasOwn(envs.production, key)) {
    errors.push(`生产环境模板缺少后端变量：${key}`);
  }
}

const requiredProductionDefaults = {
  BRAIN_COGNITION_MODE: 'rules',
  BRAIN_PLANNER_MODE: 'rules',
  BRAIN_MODEL_SHADOW_PERCENT: '0',
  BRAIN_MODEL_CANARY_PERCENT: '0',
  BRAIN_SEMANTIC_EVIDENCE_WORKER_ENABLED: 'false',
  BRAIN_CAPABILITY_REGENERATION_WORKER_ENABLED: 'false',
  AGENT_V2_AUTO_PUBLISH_CRON: 'false',
  AGENT_V2_PRODUCTION_BACKEND_ENV_CONFIRMED: 'false',
  AGENT_V2_LEGACY_RETIREMENT_CONFIRMED: 'false',
  AGENT_V2_TEXT_TO_SQL_ENABLED: 'false',
  AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY: 'true',
};

for (const [key, expected] of Object.entries(requiredProductionDefaults)) {
  const actual = envs.production[key];
  if (actual !== expected) {
    errors.push(`生产安全默认值错误：${key}=${display(actual)}，期望 ${expected}`);
  }
}

if (envs.production.AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL === envs.production.DATABASE_URL) {
  errors.push('AGENT_V2_TEXT_TO_SQL_READONLY_DATABASE_URL 不得复用 DATABASE_URL');
}

if (errors.length) {
  console.error('[env-contract] FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('[env-contract] PASS');
console.log(`- frontend keys: ${Object.keys(envs.frontend).length}`);
console.log(`- backend keys: ${Object.keys(envs.backend).length}`);
console.log(`- production keys: ${Object.keys(envs.production).length}`);

function parseEnv(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    result[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return result;
}

function display(value) {
  return value === undefined ? '<missing>' : value || '<empty>';
}
