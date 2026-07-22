import http from 'node:http';
import https from 'node:https';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const checkOnly = args.has('--check-only');
const quiet = args.has('--quiet');
const wait = args.has('--wait');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080';
const healthPath = process.env.VITE_API_HEALTH_PATH || '/api/health/ready';
const apiHealthUrl = new URL(healthPath, apiTarget);
const waitTimeoutMs = Number(process.env.VITE_API_WAIT_TIMEOUT_MS || 120000);
const waitIntervalMs = Number(process.env.VITE_API_WAIT_INTERVAL_MS || 1500);
const apiWatchIntervalMs = Number(process.env.VITE_API_WATCH_INTERVAL_MS || 15000);
const apiWatchDisabled = args.has('--no-api-watch') || process.env.VITE_API_WATCH === '0';
const webCwd = path.resolve(repoRoot, getArg('--web-cwd', '.'));
const webScript = getArg('--web-script', 'dev:web');
const webHost = getArg('--web-host', process.env.VITE_DEV_HOST || '127.0.0.1');
const webPort = getArg('--web-port', process.env.VITE_DEV_PORT || '5173');
const webLabel = getArg('--web-label', 'admin web app');
const fullCommand = getArg('--full-command', 'npm.cmd run dev:full');

function getArg(name, fallback) {
  const index = rawArgs.indexOf(name);
  if (index === -1 || index + 1 >= rawArgs.length) {
    return fallback;
  }
  const value = rawArgs[index + 1];
  return value && !value.startsWith('--') ? value : fallback;
}

function requestApi() {
  return new Promise((resolve) => {
    const client = apiHealthUrl.protocol === 'https:' ? https : http;
    const req = client.request(
      apiHealthUrl,
      {
        method: 'GET',
        timeout: 3000,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve({
            ok: true,
            status: res.statusCode,
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', (error) => {
      resolve({
        ok: false,
        error,
      });
    });

    req.end();
  });
}

async function ensureApi(options = {}) {
  const shouldWait = Boolean(options.wait);
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < waitTimeoutMs) {
    const result = await requestApi();
    if (result.ok) {
      if (!quiet) {
        console.log(`[dev-local] API ready: ${apiHealthUrl.href} -> HTTP ${result.status}`);
      }
      return true;
    }

    lastError = result.error;
    if (!shouldWait) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, waitIntervalMs));
  }

  const message = lastError ? `${lastError.code || lastError.name || 'ERROR'} ${lastError.message || ''}`.trim() : 'unknown error';
  console.error(`[dev-local] API is not reachable: ${apiHealthUrl.href}`);
  console.error(`[dev-local] Last error: ${message}`);
  console.error('[dev-local] Start the backend with: npm.cmd run dev:api');
  console.error(`[dev-local] Or use the combined local command: ${fullCommand}`);
  return false;
}

function spawnNpm(label, commandArgs, cwd = repoRoot) {
  const child = spawn(npmCommand, commandArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: process.env,
    cwd,
  });

  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);

  child.on('error', (error) => {
    console.error(`[dev-local] Failed to start ${label}:`, error);
  });

  return child;
}

function stopChild(child) {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
  }
}

function isChildRunning(child) {
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

function startApi() {
  return spawnNpm('api', ['run', 'dev:api'], repoRoot);
}

if (checkOnly && process.env.VITE_API_MODE === 'mock') {
  console.log('[dev-local] VITE_API_MODE=mock, skip local API check.');
  process.exit(0);
}

if (checkOnly) {
  const ok = await ensureApi({ wait });
  process.exit(ok ? 0 : 1);
}

const initial = await requestApi();
let apiProcess = null;
let apiWatchRunning = false;

if (process.env.VITE_API_MODE === 'mock') {
  console.log(`[dev-local] VITE_API_MODE=mock, starting ${webLabel} only.`);
} else if (!initial.ok) {
  console.log('[dev-local] API is not running, starting server-v2 first...');
  apiProcess = startApi();
  const apiReady = await ensureApi({ wait: true });
  if (!apiReady) {
    stopChild(apiProcess);
    process.exit(1);
  }
} else {
  console.log(`[dev-local] API already running: ${apiHealthUrl.href} -> HTTP ${initial.status}`);
}

console.log(`[dev-local] Starting ${webLabel} on http://${webHost}:${webPort} ...`);
const webProcess = spawnNpm('web', ['run', webScript, '--', '--host', webHost, '--port', webPort], webCwd);
const children = [apiProcess, webProcess].filter(Boolean);
let apiWatchTimer = null;

async function watchApiHealth() {
  if (apiWatchRunning || process.env.VITE_API_MODE === 'mock') {
    return;
  }
  apiWatchRunning = true;
  try {
    const result = await requestApi();
    if (result.ok) {
      return;
    }

    const message = result.error
      ? `${result.error.code || result.error.name || 'ERROR'} ${result.error.message || ''}`.trim()
      : 'unknown error';
    console.error(`[dev-local] API health check failed: ${message}`);

    if (!isChildRunning(apiProcess)) {
      console.error('[dev-local] Restarting server-v2 for the running web app...');
      apiProcess = startApi();
      if (!children.includes(apiProcess)) {
        children.push(apiProcess);
      }
    }

    await ensureApi({ wait: true });
  } finally {
    apiWatchRunning = false;
  }
}

if (!apiWatchDisabled && process.env.VITE_API_MODE !== 'mock') {
  apiWatchTimer = setInterval(() => {
    void watchApiHealth();
  }, apiWatchIntervalMs);
}

function shutdown(code = 0) {
  if (apiWatchTimer) {
    clearInterval(apiWatchTimer);
  }
  for (const child of children) {
    stopChild(child);
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

for (const child of children) {
  child.on('exit', (code) => {
    shutdown(code ?? 0);
  });
}
