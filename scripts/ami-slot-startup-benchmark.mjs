import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  REPO_ROOT,
  ensureRuntimeLayout,
  parseArgs,
  readJson,
  redact,
  slotConfig,
  writeJson,
} from './ami-dev-common.mjs';

const args = parseArgs();
const config = slotConfig(args.value('slot'));
const samples = Number(args.value('samples', 10));
if (!Number.isInteger(samples) || samples < 1 || samples > 30) throw new Error('samples 必须为 1—30 的整数。');

function runSlot(command) {
  const result = spawnSync('node', ['scripts/ami-dev-slot.mjs', command, '--slot', config.slot, '--services', 'api'], {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: 'utf8',
    timeout: 240_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(redact([result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n')));
  }
  return result.stdout;
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

async function main() {
  const lease = readJson(config.leasePath);
  if (lease.worktree !== REPO_ROOT) throw new Error(`slot ${config.slot} 属于其他 worktree。`);
  const values = [];
  const readinessValues = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    runSlot('start');
    values.push(Math.round(performance.now() - startedAt));
    try {
      const readyStartedAt = performance.now();
      const response = await fetch(`http://127.0.0.1:${config.apiPort}/api/health/ready`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`readiness 返回 HTTP ${response.status}`);
      const body = await response.json();
      if (body?.runtime?.slotId !== config.slot || body?.databaseTarget?.database !== config.database) {
        throw new Error('readiness slot/database 身份不匹配。');
      }
      readinessValues.push(Math.round(performance.now() - readyStartedAt));
    } finally {
      runSlot('stop');
    }
  }
  const report = {
    schemaVersion: 'ami-slot-startup-benchmark/v1',
    generatedAt: new Date().toISOString(),
    slotId: config.slot,
    worktree: REPO_ROOT,
    database: config.database,
    services: ['api'],
    includes: ['migration deploy', 'API watcher spawn', 'liveness identity check'],
    startup: {
      samples,
      minMs: Math.min(...values),
      medianMs: percentile(values, 0.5),
      p95Ms: percentile(values, 0.95),
      maxMs: Math.max(...values),
      valuesMs: values,
    },
    readinessProbe: {
      samples,
      minMs: Math.min(...readinessValues),
      medianMs: percentile(readinessValues, 0.5),
      p95Ms: percentile(readinessValues, 0.95),
      maxMs: Math.max(...readinessValues),
      valuesMs: readinessValues,
    },
    finalState: 'stopped',
    databasePreserved: true,
    volumePreserved: true,
  };
  const paths = ensureRuntimeLayout();
  const output = resolve(args.value('output', join(paths.reportsDir, `slot-startup-${config.slot}-${Date.now()}.json`)));
  writeJson(output, report);
  console.log(JSON.stringify({ status: 'completed', output, slotId: config.slot, startup: report.startup }, null, 2));
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
