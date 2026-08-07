import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO_ROOT,
  currentGitIdentity,
  ensurePostgresSecrets,
  ensureRuntimeLayout,
  normalizeSlot,
  parseArgs,
  parseEnvFile,
  readJson,
  redact,
  slotConfig,
  writeJson,
  writeSlotRuntime,
} from './ami-dev-common.mjs';

const args = parseArgs();
const command = args.positional[0] || 'status';

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function shellOutput(program, programArgs) {
  const result = spawnSync(program, programArgs, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 });
  if (result.error || result.status !== 0) return '';
  return result.stdout.trim();
}

function processStart(pid) {
  return shellOutput('ps', ['-p', String(pid), '-o', 'lstart=']).replace(/\s+/gu, ' ').trim();
}

function processGroup(pid) {
  return Number(shellOutput('ps', ['-p', String(pid), '-o', 'pgid=']).trim()) || null;
}

function processCwd(pid) {
  const output = shellOutput('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  return output.split('\n').find((line) => line.startsWith('n'))?.slice(1) || null;
}

function portPids(port) {
  return shellOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    .split('\n')
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function assertPortFree(port, slot) {
  const owners = portPids(port);
  if (owners.length) throw new Error(`slot ${slot} 端口 ${port} 已被 PID ${owners.join(',')} 占用，拒绝复用或递增。`);
}

function readLease(config) {
  if (!existsSync(config.leasePath)) throw new Error(`slot ${config.slot} 尚未分配，请先运行 dev:slot:allocate。`);
  const lease = readJson(config.leasePath);
  if (lease.worktree !== REPO_ROOT) {
    throw new Error(`slot ${config.slot} 属于其他 worktree：${lease.worktree}`);
  }
  return lease;
}

function allocate() {
  const paths = ensureRuntimeLayout();
  const requested = args.value('slot');
  const candidates = requested
    ? [normalizeSlot(requested)]
    : Array.from({ length: 99 }, (_, index) => `s${String(index + 1).padStart(2, '0')}`);
  const git = currentGitIdentity();
  const { env: postgresEnv } = ensurePostgresSecrets();

  for (const candidate of candidates) {
    const config = slotConfig(candidate);
    mkdirSync(config.slotDir, { recursive: true, mode: 0o700 });
    const lease = {
      schemaVersion: '1.0',
      slotId: config.slot,
      worktree: REPO_ROOT,
      branch: git.branch,
      commitAtAllocation: git.commit,
      createdAt: new Date().toISOString(),
      status: 'allocated',
      ports: { api: config.apiPort, admin: config.adminPort, kiosk: config.kioskPort },
      database: config.database,
      redisKeyPrefix: config.redisKeyPrefix,
      runtimeMode: args.value('mode', 'local-fast'),
    };
    try {
      writeJson(config.leasePath, lease, { exclusive: true });
      writeSlotRuntime(config, postgresEnv, lease.runtimeMode);
      console.log(JSON.stringify({ ...lease, runtimeEnvPath: config.runtimeEnvPath, credentialSource: paths.postgresEnv }, null, 2));
      return config.slot;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = readJson(config.leasePath);
      if (requested && existing.worktree === REPO_ROOT) {
        console.log(JSON.stringify({ ...existing, status: 'already_allocated', runtimeEnvPath: config.runtimeEnvPath }, null, 2));
        return config.slot;
      }
      if (requested) throw new Error(`slot ${config.slot} 已由 ${existing.worktree ?? '未知 worktree'} 占用。`);
    }
  }
  throw new Error('s01—s99 均已分配。');
}

function runChecked(program, programArgs, options = {}) {
  const result = spawnSync(program, programArgs, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 900_000,
    stdio: options.stdio ?? 'inherit',
  });
  if (result.error || result.status !== 0) {
    throw new Error(redact([`命令失败：${program} ${programArgs.join(' ')}`, result.error?.message, result.stderr].filter(Boolean).join('\n')));
  }
}

function selectWarmupPipeline(config, lease) {
  const explicit = args.value('pipeline');
  if (explicit && explicit !== 'shared' && explicit !== 'artifact') {
    throw new Error(`无效 warmup pipeline：${explicit}`);
  }
  if (lease.runtimeMode === 'brain-dev') return explicit ?? 'shared';
  if (lease.runtimeMode !== 'local-fast') return explicit ?? 'shared';
  if (explicit === 'shared') return 'shared';
  if (!existsSync(config.receiptPath)) return 'shared';
  const receipt = readJson(config.receiptPath);
  const git = currentGitIdentity();
  const matched =
    receipt.status === 'passed' &&
    receipt.identity?.commit === git.commit &&
    receipt.identity?.diffChecksum === git.diffChecksum &&
    receipt.identity?.database === config.database &&
    Array.isArray(receipt.builderVersions) &&
    receipt.builderVersions.length > 0 &&
    receipt.builderVersions.every((item) => typeof item.builderVersion === 'string' && item.builderVersion.length === 64);
  return matched ? 'artifact' : 'shared';
}

function startProcess(config, service, runtime) {
  const definitions = {
    api: {
      port: config.apiPort,
      args: ['--prefix', 'packages/server-v2', 'run', 'dev'],
    },
    admin: {
      port: config.adminPort,
      args: ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', String(config.adminPort), '--strictPort'],
    },
    kiosk: {
      port: config.kioskPort,
      args: ['--prefix', 'packages/Ami-Aura-Lite-Kiosk', 'run', 'dev:web', '--', '--host', '127.0.0.1', '--port', String(config.kioskPort), '--strictPort'],
    },
  };
  const definition = definitions[service];
  if (!definition) throw new Error(`未知服务：${service}`);
  assertPortFree(definition.port, config.slot);
  mkdirSync(config.logDir, { recursive: true, mode: 0o700 });
  const logPath = join(config.logDir, `${service}.log`);
  const logHandle = openSync(logPath, 'a', 0o600);
  const child = spawn('npm', definition.args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...runtime },
    detached: true,
    stdio: ['ignore', logHandle, logHandle],
  });
  child.unref();
  closeSync(logHandle);
  const deadline = Date.now() + 5000;
  let started = '';
  while (!started && Date.now() < deadline) {
    started = processStart(child.pid);
    if (!started) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  return {
    service,
    pid: child.pid,
    pgid: processGroup(child.pid) ?? child.pid,
    processStartedAt: started,
    recordedAt: new Date().toISOString(),
    cwd: REPO_ROOT,
    port: definition.port,
    logPath,
  };
}

async function waitForApi(config, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not_started';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${config.apiPort}/api/health`, { signal: AbortSignal.timeout(3000) });
      const body = await response.json();
      if (
        response.ok &&
        body?.status === 'ok' &&
        body?.runtime?.slotId === config.slot &&
        body?.runtime?.worktree === REPO_ROOT
      ) {
        return body;
      }
      lastError = `identity_mismatch:${JSON.stringify(body?.runtime ?? null)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`API liveness 未在 ${timeoutMs}ms 内通过：${lastError}`);
}

async function start() {
  const config = slotConfig(args.value('slot'));
  const lease = readLease(config);
  if (existsSync(config.processesPath)) {
    const previous = readJson(config.processesPath);
    if (previous.processes?.some((item) => processAlive(item.pid))) {
      throw new Error(`slot ${config.slot} 已有存活进程，请先 status/stop。`);
    }
  }
  const { env: postgresEnv } = ensurePostgresSecrets();
  const runtime = writeSlotRuntime(config, postgresEnv, lease.runtimeMode);
  const warmupPipeline = selectWarmupPipeline(config, lease);
  runtime.BRAIN_ONTOLOGY_WARMUP_PIPELINE = warmupPipeline;
  runChecked('node', ['scripts/ami-local-postgres.mjs', 'migrate', '--slot', config.slot]);
  if (!lease.seededAt || args.flag('seed')) {
    runChecked('node', ['scripts/ami-local-postgres.mjs', 'seed', '--slot', config.slot]);
    lease.seededAt = new Date().toISOString();
  }

  const services = String(args.value('services', 'api,admin,kiosk'))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const processes = [];
  try {
    for (const service of services) processes.push(startProcess(config, service, runtime));
    if (services.includes('api')) await waitForApi(config);
  } catch (error) {
    for (const item of processes.reverse()) {
      if (processAlive(item.pid) && processStart(item.pid) === item.processStartedAt && processCwd(item.pid) === REPO_ROOT) {
        try { process.kill(-item.pgid, 'SIGTERM'); } catch { /* best effort for processes started in this call */ }
      }
    }
    throw error;
  }
  writeJson(config.processesPath, { schemaVersion: '1.0', slotId: config.slot, worktree: REPO_ROOT, processes });
  lease.status = 'started';
  lease.startedAt = new Date().toISOString();
  lease.warmupPipeline = warmupPipeline;
  writeJson(config.leasePath, lease);
  console.log(JSON.stringify({ status: 'started', slotId: config.slot, services, ports: lease.ports, database: lease.database, warmupPipeline, processes }, null, 2));
}

async function healthIdentity(config) {
  try {
    const response = await fetch(`http://127.0.0.1:${config.apiPort}/api/health`, { signal: AbortSignal.timeout(2500) });
    const body = await response.json();
    return { httpStatus: response.status, body };
  } catch (error) {
    return { httpStatus: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function status() {
  const requested = args.value('slot');
  const paths = ensureRuntimeLayout();
  const slots = requested
    ? [normalizeSlot(requested)]
    : Array.from({ length: 99 }, (_, index) => `s${String(index + 1).padStart(2, '0')}`)
        .filter((slot) => existsSync(slotConfig(slot).leasePath));
  const reports = [];
  for (const slot of slots) {
    const config = slotConfig(slot);
    if (!existsSync(config.leasePath)) {
      reports.push({ slotId: slot, status: 'unallocated' });
      continue;
    }
    const lease = readJson(config.leasePath);
    const processRecord = existsSync(config.processesPath) ? readJson(config.processesPath) : { processes: [] };
    const processes = processRecord.processes.map((item) => ({
      ...item,
      alive: processAlive(item.pid),
      startMatches: processAlive(item.pid) && processStart(item.pid) === item.processStartedAt,
      cwdMatches: processAlive(item.pid) && processCwd(item.pid) === item.cwd,
      portPids: portPids(item.port),
    }));
    reports.push({
      slotId: slot,
      lease,
      runtimeEnvPath: config.runtimeEnvPath,
      processes,
      liveness: processes.some((item) => item.service === 'api' && item.alive) ? await healthIdentity(config) : null,
    });
  }
  console.log(JSON.stringify({ runtimeRoot: paths.root, slots: reports }, null, 2));
}

async function stop() {
  const config = slotConfig(args.value('slot'));
  const lease = readLease(config);
  if (!existsSync(config.processesPath)) {
    console.log(JSON.stringify({ status: 'already_stopped', slotId: config.slot, databasePreserved: config.database }, null, 2));
    return;
  }
  const record = readJson(config.processesPath);
  const apiIdentity = await healthIdentity(config);
  const stopped = [];
  for (const item of [...record.processes].reverse()) {
    if (!processAlive(item.pid)) continue;
    const startMatches = processStart(item.pid) === item.processStartedAt;
    const cwdMatches = processCwd(item.pid) === item.cwd && item.cwd === REPO_ROOT;
    const currentPgid = processGroup(item.pid);
    const owners = portPids(item.port);
    const portOwnedByGroup = owners.every((pid) => processGroup(pid) === item.pgid);
    const apiMatches = item.service !== 'api' || apiIdentity.httpStatus === null || (
      apiIdentity.body?.runtime?.slotId === config.slot && apiIdentity.body?.runtime?.worktree === REPO_ROOT
    );
    if (!startMatches || !cwdMatches || currentPgid !== item.pgid || !portOwnedByGroup || !apiMatches) {
      throw new Error(
        `拒绝停止 ${item.service}：所有权核对失败 ` +
        JSON.stringify({ startMatches, cwdMatches, currentPgid, recordedPgid: item.pgid, portOwnedByGroup, apiMatches }),
      );
    }
    process.kill(-item.pgid, 'SIGTERM');
    stopped.push({ service: item.service, pid: item.pid, pgid: item.pgid });
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && record.processes.some((item) => processAlive(item.pid))) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const survivors = record.processes.filter((item) => processAlive(item.pid));
  if (survivors.length) throw new Error(`slot ${config.slot} 仍有进程存活：${survivors.map((item) => item.pid).join(',')}`);
  unlinkSync(config.processesPath);
  lease.status = 'stopped';
  lease.stoppedAt = new Date().toISOString();
  writeJson(config.leasePath, lease);
  console.log(JSON.stringify({ status: 'stopped', slotId: config.slot, stopped, databasePreserved: config.database, volumePreserved: true }, null, 2));
}

function release() {
  const config = slotConfig(args.value('slot'));
  readLease(config);
  if (existsSync(config.processesPath)) {
    const record = readJson(config.processesPath);
    if (record.processes?.some((item) => processAlive(item.pid))) {
      throw new Error(`slot ${config.slot} 仍有存活进程，禁止释放。`);
    }
    unlinkSync(config.processesPath);
  }
  if (existsSync(config.runtimeEnvPath)) unlinkSync(config.runtimeEnvPath);
  unlinkSync(config.leasePath);
  console.log(JSON.stringify({ status: 'released', slotId: config.slot, databasePreserved: config.database, logsPreserved: config.logDir }, null, 2));
}

try {
  if (command === 'allocate') allocate();
  else if (command === 'start') await start();
  else if (command === 'status') await status();
  else if (command === 'stop') await stop();
  else if (command === 'release') release();
  else throw new Error(`未知 slot 命令：${command}`);
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
