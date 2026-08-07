import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  REPO_ROOT,
  SERVER_ROOT,
  currentGitIdentity,
  ensureRuntimeLayout,
  parseArgs,
  parseEnvFile,
  readJson,
  redact,
  writeJson,
} from './ami-dev-common.mjs';

const args = parseArgs();
const command = args.positional[0] || 'preflight';
const paths = ensureRuntimeLayout();

function requiredArgument(name) {
  const value = args.value(name);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Supabase preflight 缺少必填参数 --${name}。`);
  }
  return value.trim();
}

function questionManifestIdentity(manifestPath) {
  let parsed;
  const source = readFileSync(manifestPath, 'utf8');
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`问题 manifest 不是合法 JSON：${manifestPath}`);
  }
  const cases = Array.isArray(parsed.cases)
    ? parsed.cases
    : Array.isArray(parsed.questions)
      ? parsed.questions
      : null;
  const suites = parsed.suites && typeof parsed.suites === 'object'
    ? Object.values(parsed.suites)
    : [];
  let caseCount;
  let suiteCount = null;
  if (cases?.length) {
    const declaredCount = Number(parsed.caseCount ?? parsed.questionCount ?? cases.length);
    if (!Number.isInteger(declaredCount) || declaredCount !== cases.length) {
      throw new Error('问题 manifest 的声明数量与 cases/questions 实际数量不一致。');
    }
    caseCount = cases.length;
  } else if (suites.length) {
    const caseIds = new Set();
    for (const suite of suites) {
      if (!Array.isArray(suite?.caseIds) || Number(suite.caseCount) !== suite.caseIds.length) {
        throw new Error('问题 suite manifest 的每个 suite 必须包含 caseIds，且 caseCount 一致。');
      }
      for (const caseId of suite.caseIds) caseIds.add(String(caseId));
    }
    if (!caseIds.size) throw new Error('问题 suite manifest 不包含任何 caseId。');
    caseCount = caseIds.size;
    suiteCount = suites.length;
  } else {
    throw new Error('问题 manifest 必须包含非空 cases/questions 或 suites.*.caseIds。');
  }
  const manifestVersion = String(parsed.manifestVersion ?? parsed.schemaVersion ?? '').trim();
  if (!manifestVersion) throw new Error('问题 manifest 缺少 manifestVersion/schemaVersion。');
  return {
    source,
    manifestVersion,
    caseCount,
    suiteCount,
    checksum: createHash('sha256').update(source).digest('hex'),
  };
}

function approvedDatabaseIdentity(env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('Supabase preflight 缺少 DATABASE_URL。');
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const database = parsed.pathname.replace(/^\//u, '');
  const approvedHosts = String(args.value('approved-host', env.AMI_APPROVED_SUPABASE_HOSTS ?? ''))
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!approvedHosts.length) throw new Error('必须通过 --approved-host 或 AMI_APPROVED_SUPABASE_HOSTS 明确批准 Supabase Host。');
  if (!approvedHosts.includes(host)) throw new Error(`Supabase Host 未获批准：${host}`);
  if (!host.endsWith('.supabase.co') && !host.endsWith('.pooler.supabase.com')) {
    throw new Error(`目标不是 Supabase Host：${host}`);
  }
  return { protocol: parsed.protocol.replace(':', ''), host, port: parsed.port || '5432', database, schema: parsed.searchParams.get('schema') || 'public' };
}

function migrationInventory() {
  const root = join(SERVER_ROOT, 'prisma', 'migrations');
  const migrations = readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .sort()
    .map((name) => ({ name, bytes: readFileSync(join(root, name, 'migration.sql')) }));
  return {
    count: migrations.length,
    first: migrations[0]?.name ?? null,
    latest: migrations.at(-1)?.name ?? null,
    chainHash: createHash('sha256').update(migrations.map((item) => `${item.name}:${createHash('sha256').update(item.bytes).digest('hex')}`).join('\n')).digest('hex'),
  };
}

function leaseStatus() {
  if (!existsSync(paths.supabaseLease)) return { status: 'available', leasePath: paths.supabaseLease };
  const lease = readJson(paths.supabaseLease);
  const expired = Date.parse(lease.expiresAt) <= Date.now();
  return { status: expired ? 'expired' : 'leased', expired, leasePath: paths.supabaseLease, lease };
}

function acquireLease() {
  const envPath = resolve(args.value('env-file', join(SERVER_ROOT, '.env')));
  const env = parseEnvFile(envPath);
  const database = approvedDatabaseIdentity(env);
  const current = leaseStatus();
  if (current.status === 'leased') {
    throw new Error(`Supabase 写租约已由 ${current.lease.worktree} / ${current.lease.candidateId} 持有至 ${current.lease.expiresAt}。`);
  }
  if (current.status === 'expired') {
    if (!args.flag('take-expired')) throw new Error('Supabase 写租约已过期；核对持有者后使用 --take-expired 接管。');
    unlinkSync(paths.supabaseLease);
  }
  const git = currentGitIdentity();
  const ttlMinutes = Number(args.value('ttl-minutes', 60));
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 5 || ttlMinutes > 480) throw new Error('ttl-minutes 必须为 5—480。');
  const lease = {
    schemaVersion: '1.0',
    leaseId: randomUUID(),
    owner: args.value('owner', process.env.USER || 'unknown'),
    worktree: REPO_ROOT,
    branch: git.branch,
    commit: git.commit,
    diffChecksum: git.diffChecksum,
    candidateId: args.value('candidate-id', `local-${Date.now()}`),
    targetHost: database.host,
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
  };
  writeJson(paths.supabaseLease, lease, { exclusive: true });
  console.log(JSON.stringify({ status: 'acquired', leasePath: paths.supabaseLease, lease }, null, 2));
  return lease;
}

function releaseLease(expectedLeaseId) {
  if (!existsSync(paths.supabaseLease)) {
    console.log(JSON.stringify({ status: 'available', leasePath: paths.supabaseLease }, null, 2));
    return;
  }
  const lease = readJson(paths.supabaseLease);
  if (lease.worktree !== REPO_ROOT) throw new Error(`写租约属于其他 worktree：${lease.worktree}`);
  if (expectedLeaseId && lease.leaseId !== expectedLeaseId) throw new Error('lease id 不匹配，拒绝释放。');
  unlinkSync(paths.supabaseLease);
  console.log(JSON.stringify({ status: 'released', leaseId: lease.leaseId, candidateId: lease.candidateId }, null, 2));
}

async function preflight() {
  const manifestPath = resolve(requiredArgument('question-manifest'));
  const requestedStoreId = requiredArgument('store-id');
  const requestedReleaseId = requiredArgument('release-id');
  const requestedReleaseFingerprint = requiredArgument('release-fingerprint');
  const requestedPipeline = requiredArgument('pipeline');
  const envPath = resolve(args.value('env-file', join(SERVER_ROOT, '.env')));
  const env = parseEnvFile(envPath);
  const database = approvedDatabaseIdentity(env);
  const git = currentGitIdentity();
  const migrations = migrationInventory();
  if (!existsSync(manifestPath)) throw new Error(`问题 manifest 不存在：${manifestPath}`);
  const manifest = questionManifestIdentity(manifestPath);
  const required = {
    storeId: Number(requestedStoreId),
    releaseId: Number(requestedReleaseId),
    releaseFingerprint: requestedReleaseFingerprint,
    provider: args.value('provider', env.LLM_PROVIDER),
    model: args.value('model', env.LLM_MODEL),
    pipeline: requestedPipeline,
  };
  if (!Number.isInteger(required.storeId) || required.storeId <= 0) throw new Error('store-id 必须为正整数。');
  if (!Number.isInteger(required.releaseId) || required.releaseId <= 0) throw new Error('release-id 必须为正整数。');
  if (!/^[a-f0-9]{64}$/u.test(String(required.releaseFingerprint ?? ''))) throw new Error('release-fingerprint 必须为 64 位十六进制。');
  if (!required.provider || !required.model) throw new Error('provider/model 不能为空。');
  if (!['shared', 'artifact'].includes(required.pipeline)) throw new Error('pipeline 必须为 shared 或 artifact。');

  let liveHealth = null;
  const healthUrl = args.value('health-url');
  if (healthUrl) {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(15_000) });
    liveHealth = { status: response.status, body: await response.json() };
    if (!response.ok) throw new Error(`候选 readiness 未通过：HTTP ${response.status}`);
    if (liveHealth.body?.databaseTarget?.host !== database.host) throw new Error('readiness database Host 与冻结目标不一致。');
    const runtimeRelease = liveHealth.body?.brainRuntimeRelease;
    const warmupRelease = liveHealth.body?.brainActiveReleaseWarmup?.releases?.find(
      (item) => item?.releaseId === required.releaseId,
    );
    const observedRelease = runtimeRelease?.releaseId === required.releaseId ? runtimeRelease : warmupRelease;
    if (!observedRelease) throw new Error('readiness 未包含冻结的 Release ID。');
    if (observedRelease.releaseFingerprint !== required.releaseFingerprint) {
      throw new Error('readiness Release fingerprint 与冻结目标不一致。');
    }
  }

  const report = {
    status: 'frozen',
    generatedAt: new Date().toISOString(),
    candidateId: args.value('candidate-id', `candidate-${Date.now()}`),
    git,
    migrations,
    database,
    storeId: required.storeId,
    release: { id: required.releaseId, fingerprint: required.releaseFingerprint },
    model: { provider: required.provider, model: required.model, timeoutMs: Number(env.LLM_TIMEOUT_MS) || null, fallback: env.BRAIN_FALLBACK_POLICY ?? null },
    questionManifest: {
      path: manifestPath,
      manifestVersion: manifest.manifestVersion,
      caseCount: manifest.caseCount,
      suiteCount: manifest.suiteCount,
      checksum: manifest.checksum,
    },
    pipeline: required.pipeline,
    liveHealth,
    writeLease: leaseStatus(),
  };
  const output = resolve(args.value('output', join(paths.reportsDir, `supabase-preflight-${Date.now()}.json`)));
  writeJson(output, report);
  console.log(JSON.stringify({ status: report.status, candidateId: report.candidateId, output, database, release: report.release, pipeline: report.pipeline }, null, 2));
}

function withLease() {
  const separator = process.argv.indexOf('--');
  if (separator < 0 || !process.argv[separator + 1]) throw new Error('with-lease 用法：... with-lease [租约参数] -- <command> [args]');
  const lease = acquireLease();
  try {
    const program = process.argv[separator + 1];
    const programArgs = process.argv.slice(separator + 2);
    const result = spawnSync(program, programArgs, { cwd: REPO_ROOT, env: process.env, stdio: 'inherit' });
    if (result.error || result.status !== 0) process.exitCode = result.status ?? 1;
  } finally {
    releaseLease(lease.leaseId);
  }
}

try {
  if (command === 'lease-status') console.log(JSON.stringify(leaseStatus(), null, 2));
  else if (command === 'lease-acquire') acquireLease();
  else if (command === 'lease-release') releaseLease(args.value('lease-id'));
  else if (command === 'with-lease') withLease();
  else if (command === 'preflight') await preflight();
  else throw new Error(`未知 Supabase 验收命令：${command}`);
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
