import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { BrainCapabilityCatalogService } from '../src/brain/capability/brain-capability-catalog.service.js';
import { BrainCapabilityDefinitionSnapshotSourceService } from '../src/brain/capability/brain-capability-definition-snapshot-source.service.js';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { loadRegisteredBrainPermissionCodes } from '../src/brain/capability/brain-registered-permission-codes.provider.js';
import { BrainCapabilityScannerService } from '../src/brain/capability/brain-capability-scanner.service.js';
import { BrainCapabilitySemanticVerifierService } from '../src/brain/capability/brain-capability-semantic-verifier.service.js';
import { BrainOntologyRuntimeService } from '../src/brain/cognition/brain-ontology-runtime.service.js';
import { PublishedBusinessDefinitionSnapshotProviderService } from '../src/brain/cognition/published-business-definition-snapshot-provider.service.js';
import { BrainRuntimeConfigService } from '../src/brain/config/brain-runtime-config.service.js';
import { BrainSkillRegistryService } from '../src/brain/skills/brain-skill-registry.service.js';
import { BrainGovernanceControlPlaneService } from '../src/brain/governance/brain-governance-control-plane.service.js';
import { createReleaseFingerprint } from '../src/brain/governance/brain-capability-regeneration-fingerprint.js';
import { BrainActiveReleaseWarmupService } from '../src/brain/governance/brain-active-release-warmup.service.js';
import { BrainReleaseService } from '../src/brain/governance/brain-release.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { BusinessDefinitionProjectionCompilerService } from '../src/semantic-data/business-definition-projection-compiler.service.js';
import { BusinessDefinitionRegistryService } from '../src/semantic-data/business-definition-registry.service.js';

const options = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  loadWorkspaceEnvironment(resolve(process.cwd(), '..', '..'));
  assertApprovedDatabase(process.env.DATABASE_URL);
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  let runtimeReleaseId: number | undefined;
  try {
    await assertActorPermissions(prisma, options.actorId);
    const sourceRuntime = await resolveSourceRuntime(prisma, options.sourceRuntimeReleaseId);
    const sourcePolicy = await resolveSourcePolicy(prisma, options.sourcePolicySnapshotId);
    const evidenceReleaseId = options.evidenceReleaseId ?? Number(record(sourceRuntime.rollout).evaluationEvidenceReleaseId);
    const evidence = await resolveEvidenceRelease(prisma, evidenceReleaseId);
    const sourceRuntimeFingerprint = createReleaseFingerprint(sourceRuntime.items);
    const runtimeFingerprint = createReleaseFingerprint(evidence.items);
    const runtimeKeys = evidence.items.filter((item) => item.resourceType === 'skill').map((item) => item.resourceKey).sort();
    const policyKeys = sourcePolicy.items.map((item) => item.resourceKey).sort();
    if (JSON.stringify(runtimeKeys) !== JSON.stringify(policyKeys)) {
      throw new Error('runtime_policy_capability_keys_mismatch');
    }

    console.log(JSON.stringify({
      dryRun: !options.apply,
      activate: options.activate,
      actorId: options.actorId,
      sourceRuntimeRelease: summary(sourceRuntime),
      sourcePolicySnapshot: summary(sourcePolicy),
      evaluationEvidenceRelease: summary(evidence),
      releaseFingerprint: runtimeFingerprint,
      sourceRuntimeFingerprint,
      resourceBaseline: evidence.id === sourceRuntime.id ? 'active_runtime' : 'evaluation_evidence',
      policySnapshotKey: options.policySnapshotKey,
      runtimeReleaseKey: options.runtimeReleaseKey,
      governanceMode: 'shadow',
      capabilityCount: runtimeKeys.length,
    }, null, 2));
    if (!options.apply) return;

    const controlPlane = new BrainGovernanceControlPlaneService(prisma);
    let targetPolicy = await prisma.brainRelease.findUnique({
      where: { releaseKey: options.policySnapshotKey },
      include: { items: true },
    });
    if (!targetPolicy) {
      const transitioned = await controlPlane.createRuntimePolicyTransition({
        sourcePolicySnapshotId: sourcePolicy.id,
        runtimeStatus: 'shadow',
        actorId: options.actorId,
        reason: `runtime_shadow_from_policy_snapshot:${sourcePolicy.id}`,
      });
      targetPolicy = await controlPlane.createPolicySnapshot({
        releaseKey: options.policySnapshotKey,
        resourceVersionIds: transitioned.map((item) => item.id),
        actorId: options.actorId,
        note: `Governance runtime shadow derived from policy snapshot ${sourcePolicy.id}; no execution filtering.`,
      });
    }
    if (targetPolicy.scope !== 'governance_policy') throw new Error('target_policy_release_scope_invalid');
    if (targetPolicy.status === 'draft') targetPolicy = await controlPlane.publishPolicySnapshot(targetPolicy.id);
    if (targetPolicy.status !== 'active') throw new Error(`target_policy_release_not_active:${targetPolicy.status}`);
    const policySnapshotChecksum = String(record(targetPolicy.rollout).policySnapshotChecksum ?? '');
    if (!policySnapshotChecksum) throw new Error('target_policy_snapshot_checksum_missing');

    let targetRuntime = await prisma.brainRelease.findUnique({
      where: { releaseKey: options.runtimeReleaseKey },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!targetRuntime) {
      const releaseService = new BrainReleaseService(prisma);
      const created = await releaseService.createRelease({
        releaseKey: options.runtimeReleaseKey,
        scope: 'percentage',
        rollout: {
          mode: 'model',
          stage: 'governance_shadow',
          userPercentage: 100,
          evaluationEvidenceReleaseId: evidence.id,
          governancePolicyReleaseId: targetPolicy.id,
          governancePolicyMode: 'shadow',
          governancePolicySnapshotChecksum: policySnapshotChecksum,
          sourceRuntimeReleaseId: sourceRuntime.id,
          governanceShadow: true,
        },
        resourceVersionIds: evidence.items.map((item) => item.resourceVersionId),
        createdBy: options.actorId,
      });
      targetRuntime = await prisma.brainRelease.findUniqueOrThrow({
        where: { id: created.id },
        include: { items: { include: { resourceVersion: true } } },
      });
    }
    const rollout = record(targetRuntime.rollout);
    if (
      Number(rollout.governancePolicyReleaseId) !== targetPolicy.id ||
      rollout.governancePolicyMode !== 'shadow' ||
      rollout.evaluationOnly === true
    ) {
      throw new Error('target_runtime_release_contract_invalid');
    }
    if (createReleaseFingerprint(targetRuntime.items) !== runtimeFingerprint) {
      throw new Error('target_runtime_release_fingerprint_mismatch');
    }
    runtimeReleaseId = targetRuntime.id;

    console.log(JSON.stringify({
      applied: true,
      policySnapshot: summary(targetPolicy),
      runtimeRelease: summary(targetRuntime),
      activeRuntimeUnchanged: !options.activate,
    }, null, 2));
  } finally {
    await prisma.onModuleDestroy();
  }

  if (options.activate && runtimeReleaseId) {
    const activationPrisma = new PrismaService();
    await activationPrisma.onModuleInit();
    try {
      const runtimeConfig = new BrainRuntimeConfigService(new ConfigService(process.env));
      const definitionSource = new BrainCapabilityDefinitionSnapshotSourceService(
        new BusinessDefinitionRegistryService(activationPrisma, new BusinessDefinitionProjectionCompilerService()),
      );
      const semanticVerifier = new BrainCapabilitySemanticVerifierService(definitionSource);
      const catalog = new BrainCapabilityCatalogService(
        new BrainSkillRegistryService(activationPrisma),
        runtimeConfig,
        await loadRegisteredBrainPermissionCodes(activationPrisma),
        semanticVerifier,
      );
      const ontologyRuntime = new BrainOntologyRuntimeService(
        new PublishedBusinessDefinitionSnapshotProviderService(activationPrisma),
        runtimeConfig,
      );
      const warmup = new BrainActiveReleaseWarmupService(activationPrisma, ontologyRuntime, catalog);
      const releaseService = new BrainReleaseService(
        activationPrisma,
        semanticVerifier,
        catalog,
        new BrainCapabilityScannerService(),
        warmup,
      );
      const activated = await releaseService.activateRelease({ releaseId: runtimeReleaseId, activatedBy: options.actorId });
      const runtime = await releaseService.resolveRuntimeMode({ storeId: 1, userId: options.actorId, roleKey: 'store_manager' });
      console.log(JSON.stringify({
        activated: true,
        runtimeRelease: summary(activated),
        runtimeResolution: {
          releaseId: runtime.release?.id,
          mode: runtime.mode,
          capabilityCount: runtime.capabilityCandidates?.length ?? 0,
          governancePolicy: runtime.governancePolicy
            ? {
                releaseId: runtime.governancePolicy.releaseId,
                mode: runtime.governancePolicy.mode,
                policyCount: runtime.governancePolicy.policyCount,
                wouldBlockCount: runtime.governancePolicy.blockedCapabilityKeys.length,
              }
            : null,
        },
      }, null, 2));
    } finally {
      await activationPrisma.onModuleDestroy();
    }
  }
}

async function resolveSourceRuntime(prisma: PrismaService, releaseId?: number) {
  const release = releaseId
    ? await prisma.brainRelease.findFirst({
        where: { id: releaseId, scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
        include: { items: { include: { resourceVersion: true }, orderBy: { resourceVersionId: 'asc' } } },
      })
    : await prisma.brainRelease.findFirst({
        where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
        orderBy: { activatedAt: 'desc' },
        include: { items: { include: { resourceVersion: true }, orderBy: { resourceVersionId: 'asc' } } },
      });
  if (!release) throw new Error('source_runtime_release_not_found');
  if (release.status !== 'active') throw new Error(`source_runtime_release_not_active:${release.status}`);
  if (record(release.rollout).evaluationOnly === true) throw new Error('source_runtime_release_evaluation_only');
  if (!release.items.length) throw new Error('source_runtime_release_empty');
  return release;
}

async function resolveSourcePolicy(prisma: PrismaService, releaseId?: number) {
  const release = releaseId
    ? await prisma.brainRelease.findUnique({ where: { id: releaseId }, include: { items: { orderBy: { resourceKey: 'asc' } } } })
    : await prisma.brainRelease.findFirst({
        where: { scope: 'governance_policy', status: 'active' },
        orderBy: { activatedAt: 'desc' },
        include: { items: { orderBy: { resourceKey: 'asc' } } },
      });
  if (!release || release.scope !== 'governance_policy') throw new Error('source_policy_snapshot_not_found');
  if (release.status !== 'active') throw new Error(`source_policy_snapshot_not_active:${release.status}`);
  if (!release.items.length || release.items.some((item) => item.resourceType !== 'capability_policy')) {
    throw new Error('source_policy_snapshot_invalid');
  }
  return release;
}

async function resolveEvidenceRelease(prisma: PrismaService, releaseId: number) {
  if (!Number.isInteger(releaseId) || releaseId <= 0) throw new Error('evaluation_evidence_release_id_invalid');
  const release = await prisma.brainRelease.findUnique({
    where: { id: releaseId },
    include: { items: { include: { resourceVersion: true }, orderBy: { resourceVersionId: 'asc' } } },
  });
  if (!release) throw new Error('evaluation_evidence_release_not_found');
  const rollout = record(release.rollout);
  if (rollout.evaluationOnly !== true && !(release.status === 'active' && rollout.mode === 'shadow')) {
    throw new Error('evaluation_evidence_release_invalid');
  }
  const passingGate = await prisma.brainEvalRun.findFirst({
    where: { releaseId: release.id, status: 'completed' },
    orderBy: { createdAt: 'desc' },
  });
  const summaryValue = record(passingGate?.summary);
  if (summaryValue.gateMode !== 'release_gate' || summaryValue.canRelease !== true || Number(summaryValue.total ?? 0) <= 0) {
    throw new Error('evaluation_evidence_release_gate_failed');
  }
  return release;
}

async function assertActorPermissions(prisma: PrismaService, actorId: number) {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, status: true, roles: { select: { role: { select: { status: true, permissions: true } } } } },
  });
  if (!user || user.status !== 'active') throw new Error('rollout_actor_not_active');
  const permissions = new Set(
    user.roles.flatMap((item) => item.role.status === 'active' ? item.role.permissions : []),
  );
  if (permissions.has('*')) return;
  for (const permission of ['core:brain-governance:publish', 'core:brain-governance:release']) {
    if (!permissions.has(permission)) throw new Error(`rollout_actor_permission_missing:${permission}`);
  }
}

function parseArgs(argv: string[]) {
  const options = {
    apply: false,
    activate: false,
    yes: false,
    actorId: 1,
    sourceRuntimeReleaseId: undefined as number | undefined,
    sourcePolicySnapshotId: undefined as number | undefined,
    evidenceReleaseId: undefined as number | undefined,
    policySnapshotKey: 'ami-brain-governance-policy-runtime-shadow-416-20260801',
    runtimeReleaseKey: 'ami-brain-runtime-governance-shadow-416-20260801',
  };
  for (const argument of argv) {
    if (argument === '--apply') options.apply = true;
    else if (argument === '--activate') options.activate = true;
    else if (argument === '--yes') options.yes = true;
    else if (argument.startsWith('--actor-id=')) options.actorId = positiveInteger(argument.slice('--actor-id='.length), 'actor-id');
    else if (argument.startsWith('--source-runtime-release-id=')) options.sourceRuntimeReleaseId = positiveInteger(argument.slice('--source-runtime-release-id='.length), 'source-runtime-release-id');
    else if (argument.startsWith('--source-policy-snapshot-id=')) options.sourcePolicySnapshotId = positiveInteger(argument.slice('--source-policy-snapshot-id='.length), 'source-policy-snapshot-id');
    else if (argument.startsWith('--evidence-release-id=')) options.evidenceReleaseId = positiveInteger(argument.slice('--evidence-release-id='.length), 'evidence-release-id');
    else if (argument.startsWith('--policy-snapshot-key=')) options.policySnapshotKey = nonEmpty(argument.slice('--policy-snapshot-key='.length), 'policy-snapshot-key');
    else if (argument.startsWith('--runtime-release-key=')) options.runtimeReleaseKey = nonEmpty(argument.slice('--runtime-release-key='.length), 'runtime-release-key');
    else throw new Error(`unknown_argument:${argument}`);
  }
  if (options.activate && !options.apply) throw new Error('activate_requires_apply');
  if (options.apply && !options.yes) throw new Error('apply_requires_yes');
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

function nonEmpty(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function summary(value: { id: number; releaseKey: string; scope: string; status: unknown; items?: unknown[] }) {
  return {
    id: value.id,
    releaseKey: value.releaseKey,
    scope: value.scope,
    status: value.status,
    itemCount: value.items?.length,
  };
}
