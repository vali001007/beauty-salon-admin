import 'dotenv/config';
import { BrainGovernanceControlPlaneService } from '../src/brain/governance/brain-governance-control-plane.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const options = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  assertApprovedDatabase(process.env.DATABASE_URL);
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  try {
    const controlPlane = new BrainGovernanceControlPlaneService(prisma);
    const runtimeRelease = await resolveRuntimeRelease(prisma, options.runtimeReleaseId);
    const policies = runtimeRelease.items.map((item) => derivePolicy(item.resourceKey, item.snapshot));
    const releaseKey = options.releaseKey ?? `ami-brain-governance-policy-baseline-runtime-${runtimeRelease.id}-20260801`;

    console.log(JSON.stringify({
      dryRun: !options.apply,
      publish: options.publish,
      actorId: options.actorId,
      runtimeRelease: {
        id: runtimeRelease.id,
        releaseKey: runtimeRelease.releaseKey,
        status: runtimeRelease.status,
        scope: runtimeRelease.scope,
      },
      policySnapshotKey: releaseKey,
      policyCount: policies.length,
      riskDistribution: countBy(policies, (item) => item.riskLevel),
      modeDistribution: countBy(policies, (item) => item.mode),
    }, null, 2));

    if (!options.apply) return;

    for (const policy of policies) {
      const task = await controlPlane.classifyCapability({
        capabilityKey: policy.capabilityKey,
        riskLevel: policy.riskLevel,
        mode: policy.mode,
        reason: `baseline_from_active_runtime_release:${runtimeRelease.id}`,
        permissions: policy.permissions,
        owners: {
          sourceRuntimeReleaseId: runtimeRelease.id,
          sourceRuntimeReleaseKey: runtimeRelease.releaseKey,
        },
        actorId: options.actorId,
        actorPermissions: ['*'],
      });
      if (task.status === 'failed' || task.status === 'revision_required') {
        await controlPlane.retryTask(task.taskId);
      }
    }

    await waitForGovernanceTasks(prisma, policies.map((item) => item.capabilityKey));
    const latestPolicies = await latestPolicyVersions(prisma, policies.map((item) => item.capabilityKey));
    if (latestPolicies.length !== policies.length) {
      throw new Error(`governance_policy_count_mismatch:${latestPolicies.length}/${policies.length}`);
    }
    const unclassified = latestPolicies.filter((item) => record(item.snapshot).riskLevel === 'unclassified');
    if (unclassified.length) throw new Error(`governance_policy_unclassified:${unclassified.map((item) => item.resourceKey).join(',')}`);

    let snapshot = await prisma.brainRelease.findUnique({ where: { releaseKey }, include: { items: true } });
    if (!snapshot) {
      snapshot = await controlPlane.createPolicySnapshot({
        releaseKey,
        actorId: options.actorId,
        resourceVersionIds: latestPolicies.map((item) => item.id),
        note: `Initial governance baseline derived from active Runtime Release ${runtimeRelease.id}; runtime enforcement remains pending.`,
      });
    }
    if (options.publish && snapshot.status === 'draft') {
      snapshot = await controlPlane.publishPolicySnapshot(snapshot.id);
    }

    const activeRuntimeAfter = await prisma.brainRelease.findFirst({
      where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
      orderBy: { activatedAt: 'desc' },
      select: { id: true, releaseKey: true, status: true, scope: true },
    });
    if (activeRuntimeAfter?.id !== runtimeRelease.id) {
      throw new Error(`active_runtime_release_changed:${runtimeRelease.id}->${activeRuntimeAfter?.id ?? 'none'}`);
    }

    const taskSummary = await prisma.brainGovernanceTask.groupBy({
      by: ['status'],
      where: { resourceKey: { in: policies.map((item) => item.capabilityKey) } },
      _count: { _all: true },
    });
    console.log(JSON.stringify({
      applied: true,
      policySnapshot: {
        id: snapshot.id,
        releaseKey: snapshot.releaseKey,
        status: snapshot.status,
        scope: snapshot.scope,
        itemCount: snapshot.items.length,
      },
      activeRuntimeRelease: activeRuntimeAfter,
      taskSummary: Object.fromEntries(taskSummary.map((item) => [item.status, item._count._all])),
    }, null, 2));
  } finally {
    await prisma.onModuleDestroy();
  }
}

async function resolveRuntimeRelease(prisma: PrismaService, releaseId?: number) {
  const release = releaseId
    ? await prisma.brainRelease.findFirst({
        where: { id: releaseId, status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
        include: { items: { where: { resourceType: 'skill' }, orderBy: { resourceKey: 'asc' } } },
      })
    : await prisma.brainRelease.findFirst({
        where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
        orderBy: { activatedAt: 'desc' },
        include: { items: { where: { resourceType: 'skill' }, orderBy: { resourceKey: 'asc' } } },
      });
  if (!release) throw new Error('active_runtime_release_not_found');
  if (record(release.rollout).evaluationOnly === true) throw new Error('active_runtime_release_is_evaluation_only');
  if (!release.items.length) throw new Error('active_runtime_release_has_no_skills');
  return release;
}

function derivePolicy(capabilityKey: string, snapshotValue: unknown) {
  const snapshot = record(snapshotValue);
  const readOnly = snapshot.readOnly === true;
  const sideEffect = snapshot.sideEffect === true;
  const requiresConfirmation = snapshot.requiresConfirmation === true;
  const declaredRisk = String(snapshot.riskLevel ?? '');
  const riskLevel = declaredRisk === 'low' || declaredRisk === 'medium' || declaredRisk === 'high' || declaredRisk === 'critical'
    ? declaredRisk
    : sideEffect || requiresConfirmation
      ? 'high'
      : readOnly
        ? 'low'
        : 'unclassified';
  if (riskLevel === 'unclassified') throw new Error(`capability_risk_unclassified:${capabilityKey}`);
  if (riskLevel === 'low' && (!readOnly || sideEffect || requiresConfirmation)) {
    throw new Error(`low_risk_capability_not_readonly:${capabilityKey}`);
  }
  const mode = riskLevel === 'low' ? 'readonly' : riskLevel === 'medium' ? 'advisory' : riskLevel === 'high' ? 'preview' : 'alert';
  const permissions = uniqueStrings(snapshot.requiredPermissions ?? record(snapshot.executorBinding).requiredPermissions);
  return { capabilityKey, riskLevel, mode, permissions };
}

async function waitForGovernanceTasks(prisma: PrismaService, resourceKeys: string[]) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const running = await prisma.brainGovernanceTask.count({
      where: {
        resourceKey: { in: resourceKeys },
        status: { in: ['pending', 'validating', 'classifying', 'evaluating'] },
      },
    });
    if (running === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('governance_task_wait_timeout');
}

async function latestPolicyVersions(prisma: PrismaService, resourceKeys: string[]) {
  const rows = await prisma.brainResourceVersion.findMany({
    where: { resourceType: 'capability_policy', resourceKey: { in: resourceKeys } },
    orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }, { id: 'desc' }],
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.resourceKey)) latest.set(row.resourceKey, row);
  return [...latest.values()].sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));
}

function parseArgs(argv: string[]) {
  const options: { apply: boolean; publish: boolean; actorId: number; runtimeReleaseId?: number; releaseKey?: string } = {
    apply: false,
    publish: false,
    actorId: 1,
  };
  for (const argument of argv) {
    if (argument === '--apply') options.apply = true;
    else if (argument === '--publish') options.publish = true;
    else if (argument.startsWith('--actor-id=')) options.actorId = positiveInteger(argument.slice('--actor-id='.length), 'actor-id');
    else if (argument.startsWith('--runtime-release-id=')) options.runtimeReleaseId = positiveInteger(argument.slice('--runtime-release-id='.length), 'runtime-release-id');
    else if (argument.startsWith('--release-key=')) options.releaseKey = argument.slice('--release-key='.length).trim();
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (options.publish && !options.apply) throw new Error('publish_requires_apply');
  return options;
}

function assertApprovedDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error('DATABASE_URL_missing');
  const url = new URL(databaseUrl);
  if (['localhost', '127.0.0.1'].includes(url.hostname) || !url.hostname.endsWith('supabase.com')) {
    throw new Error(`database_target_not_approved:${url.hostname}`);
  }
}

function positiveInteger(value: string, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`invalid_${field}`);
  return number;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function uniqueStrings(value: unknown): string[] {
  return [...new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : [])].sort();
}

function countBy<T>(items: T[], select: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) counts[select(item)] = (counts[select(item)] ?? 0) + 1;
  return counts;
}
