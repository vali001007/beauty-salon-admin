import { BadRequestException, ConflictException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainCapabilitySemanticVerifierService } from '../capability/brain-capability-semantic-verifier.service.js';
import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';
import type { BrainEvaluationReleaseSnapshot } from './brain-evaluation-release-snapshot.js';
import {
  createReleaseFingerprint,
  lockReleaseResources,
} from './brain-capability-regeneration-fingerprint.js';

@Injectable()
export class BrainReleaseService {
  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly semanticVerifier?: BrainCapabilitySemanticVerifierService,
  ) {}

  buildRollbackPlan(currentReleaseKey: string, previousReleaseKey: string) {
    return {
      currentReleaseKey,
      previousReleaseKey,
      steps: ['disable_current_release', 'enable_previous_release', 'record_release_log'],
    };
  }

  async createRolloutSequence(input: { releaseKey: string; resourceVersionIds: number[]; createdBy: number }) {
    const stages = [
      { suffix: 'shadow', rollout: { stage: 'shadow', mode: 'shadow', userPercentage: 100 } },
      { suffix: 'canary-5', rollout: { stage: 'canary_5', mode: 'model', userPercentage: 5 } },
      { suffix: 'canary-20', rollout: { stage: 'canary_20', mode: 'model', userPercentage: 20 } },
      { suffix: 'canary-50', rollout: { stage: 'canary_50', mode: 'model', userPercentage: 50 } },
      { suffix: 'full', rollout: { stage: 'full', mode: 'model', userPercentage: 100 } },
    ] as const;
    const releases: unknown[] = [];
    let previousReleaseId: number | undefined;
    for (const stage of stages) {
      const created = await this.createRelease({
        releaseKey: `${input.releaseKey}-${stage.suffix}`,
        scope: 'percentage',
        rollout: stage.rollout,
        resourceVersionIds: input.resourceVersionIds,
        createdBy: input.createdBy,
      });
      const release = previousReleaseId
        ? await this.requirePrisma().brainRelease.update({
            where: { id: created.id },
            data: { previousReleaseId },
          })
        : created;
      releases.push(release);
      previousReleaseId = created.id;
    }
    return { items: releases, stages: stages.map((stage) => stage.rollout.stage) };
  }

  async rejectRelease(input: { releaseId: number; reason: string }) {
    const prisma = this.requirePrisma();
    const reason = this.nonEmpty(input.reason, 'reason');
    const claim = await prisma.brainRelease.updateMany({
      where: { id: input.releaseId, status: 'draft' },
      data: { status: 'archived', failureReason: reason },
    });
    if (claim.count !== 1) throw new BadRequestException('release_not_draft');
    return prisma.brainRelease.update({ where: { id: input.releaseId }, data: { failureReason: reason } });
  }

  async resolveRuntimeMode(input: {
    storeId: number;
    userId: number;
    roleKey: string;
    evaluationReleaseId?: number;
  }) {
    const evaluationRequested = input.evaluationReleaseId !== undefined;
    if (evaluationRequested) {
      const snapshot = await this.freezeEvaluationRelease(input.evaluationReleaseId!);
      return {
        mode: snapshot.mode,
        declaredMode: snapshot.declaredMode,
        release: { id: snapshot.releaseId, status: snapshot.releaseStatus },
        capabilityCandidates: snapshot.capabilityCandidates,
        releaseSnapshot: snapshot,
      };
    }
    const release = await this.selectRelease(input);
    const rollout = release ? this.record(release.rollout) : {};
    const declaredMode = rollout.mode;
    const capabilityCandidates = undefined;
    const mode = declaredMode;
    return mode === 'rules' || mode === 'shadow' || mode === 'model'
      ? { mode, declaredMode, release, capabilityCandidates }
      : { mode: undefined, declaredMode: undefined, release, capabilityCandidates };
  }

  async freezeEvaluationRelease(releaseId: number): Promise<BrainEvaluationReleaseSnapshot> {
    const release = await this.selectEvaluationRelease(releaseId);
    const declaredMode = this.record(release.rollout).mode;
    if (declaredMode !== 'rules' && declaredMode !== 'shadow' && declaredMode !== 'model') {
      throw new BadRequestException('evaluation_release_mode_invalid');
    }
    const capabilityCandidates = release.items
      .filter((item) => item.resourceType === 'skill')
      .map((item) => this.record(item.snapshot) as unknown as BrainCapabilityCandidate);
    return deepCloneFreeze({
      releaseId: release.id,
      releaseStatus: release.status as 'draft' | 'active',
      releaseFingerprint: createReleaseFingerprint(release.items),
      declaredMode,
      mode: declaredMode === 'rules' ? 'rules' : 'model',
      resourceVersionIds: release.items.map((item) => item.resourceVersionId).sort((left, right) => left - right),
      capabilityKeys: capabilityCandidates
        .map((candidate) => candidate.key)
        .filter((key): key is string => typeof key === 'string')
        .sort(),
      capabilityCandidates,
    });
  }

  async createRelease(input: {
    releaseKey: string;
    scope: string;
    rollout: Record<string, unknown>;
    resourceVersionIds: number[];
    createdBy: number;
  }) {
    const prisma = this.requirePrisma();
    const releaseKey = this.nonEmpty(input.releaseKey, 'releaseKey');
    const versions = await prisma.brainResourceVersion.findMany({ where: { id: { in: input.resourceVersionIds } } });
    if (!versions.length || versions.length !== new Set(input.resourceVersionIds).size) {
      throw new BadRequestException('release_resource_versions_incomplete');
    }
    this.assertResourcesManagedHere(versions);
    const duplicateKeys = new Set<string>();
    for (const version of versions) {
      const key = `${version.resourceType}:${version.resourceKey}`;
      if (duplicateKeys.has(key)) throw new BadRequestException(`duplicate_release_resource:${key}`);
      duplicateKeys.add(key);
    }
    const previous = await prisma.brainRelease.findFirst({
      where: { status: 'active' },
      orderBy: { activatedAt: 'desc' },
    });
    const versionMap = Object.fromEntries(
      versions.map((item) => [`${item.resourceType}:${item.resourceKey}`, item.version]),
    );
    return prisma.$transaction(async (tx) => {
      const release = await tx.brainRelease.create({
        data: {
          releaseKey,
          scope: input.scope || 'global',
          rollout: this.toJson(input.rollout ?? {}),
          versionMap: this.toJson(versionMap),
          status: 'draft',
          previousReleaseId: previous?.id,
          createdBy: input.createdBy,
        },
      });
      await tx.brainReleaseItem.createMany({
        data: versions.map((version) => ({
          releaseId: release.id,
          resourceVersionId: version.id,
          resourceType: version.resourceType,
          resourceKey: version.resourceKey,
          version: version.version,
          snapshot: this.toJson(version.snapshot),
        })),
      });
      return release;
    });
  }

  async activateRelease(input: { releaseId: number; activatedBy: number }) {
    const prisma = this.requirePrisma();
    const release = await prisma.brainRelease.findUnique({
      where: { id: input.releaseId },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!release || release.status !== 'draft') throw new BadRequestException('release_not_draft');
    const releaseFingerprint = createReleaseFingerprint(release.items);
    const regenerationDelegate = (prisma as unknown as {
      brainCapabilityRegenerationJob?: {
        findFirst(input: Record<string, unknown>): Promise<{ id: number; status?: string } | null>;
      };
    }).brainCapabilityRegenerationJob;
    const regeneration = regenerationDelegate
      ? await regenerationDelegate.findFirst({
          where: { releaseFingerprint },
          select: { id: true, status: true },
        })
      : null;
    if (regeneration) throw new BadRequestException('modification_superseded');
    if (!release.items.length) throw new BadRequestException('release_has_no_resource_items');
    this.assertReleaseItemsConsistent(release.items);
    const evalRun = await prisma.brainEvalRun.findFirst({
      where: { releaseId: release.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
    const summary = evalRun ? this.record(evalRun.summary) : {};
    if (!evalRun) throw new BadRequestException('release_eval_gate_failed');
    this.assertReleaseEvalSummary(summary, releaseFingerprint);
    await this.validateGeneratedCapabilities(release.items.map((item) => item.resourceVersion));
    await this.validateDependencies(release.items.map((item) => item.resourceVersion));

    return this.runSerializable('release_activation_conflict', async (tx) => {
      await lockReleaseResources(tx, release.id);
      const lockedRelease = await tx.brainRelease.findUnique({
        where: { id: release.id },
        include: { items: { include: { resourceVersion: true } } },
      });
      if (!lockedRelease || lockedRelease.status !== 'draft') throw new BadRequestException('release_not_draft');
      const lockedFingerprint = createReleaseFingerprint(lockedRelease.items);
      const lockedEvalRun = await tx.brainEvalRun.findFirst({
        where: { releaseId: lockedRelease.id, status: 'completed' },
        orderBy: { createdAt: 'desc' },
      });
      if (!lockedEvalRun) throw new BadRequestException('release_eval_gate_failed');
      this.assertReleaseEvalSummary(this.record(lockedEvalRun.summary), lockedFingerprint);
      const modification = await tx.brainCapabilityRegenerationJob.findFirst({
        where: { releaseFingerprint: lockedFingerprint },
        select: { id: true, status: true },
      });
      if (modification) throw new BadRequestException('modification_superseded');
      const activatedAt = new Date();
      const claim = await tx.brainRelease.updateMany({
        where: { id: lockedRelease.id, status: 'draft' },
        data: { status: 'active', activatedAt, failureReason: null },
      });
      if (claim.count !== 1) throw new ConflictException('release_activation_conflict');
      if (lockedRelease.scope === 'global') {
        await tx.brainRelease.updateMany({
          where: { status: 'active', id: { not: lockedRelease.id } },
          data: { status: 'archived' },
        });
      }
      for (const item of lockedRelease.items) {
        await tx.brainResourceVersion.updateMany({
          where: { resourceType: item.resourceType, resourceKey: item.resourceKey, status: 'active' },
          data: { status: 'archived', archivedAt: activatedAt },
        });
        await tx.brainResourceVersion.update({
          where: { id: item.resourceVersionId },
          data: { status: 'active', activatedAt, archivedAt: null },
        });
        await this.activateSource(tx, item.resourceVersion);
      }
      return tx.brainRelease.update({
        where: { id: lockedRelease.id },
        data: { activatedAt, failureReason: null },
        include: { items: true },
      });
    });
  }

  async rollbackRelease(input: { releaseId: number; reason: string }) {
    const prisma = this.requirePrisma();
    const current = await prisma.brainRelease.findUnique({
      where: { id: input.releaseId },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!current || current.status !== 'active') throw new BadRequestException('release_not_active');
    const previous = current.previousReleaseId
      ? await prisma.brainRelease.findUnique({
          where: { id: current.previousReleaseId },
          include: { items: { include: { resourceVersion: true } } },
        })
      : null;
    if (!previous) throw new BadRequestException('previous_release_not_found');
    this.assertReleaseItemsConsistent(previous.items);
    const previousVersions = previous.items.map((item) => item.resourceVersion);
    await this.validateGeneratedCapabilities(previousVersions);
    await this.validateDependencies(previousVersions);
    return this.runSerializable('release_rollback_conflict', async (tx) => {
      const rolledBackAt = new Date();
      const claim = await tx.brainRelease.updateMany({
        where: { id: current.id, status: 'active' },
        data: { status: 'rolled_back', rolledBackAt, failureReason: input.reason },
      });
      if (claim.count !== 1) throw new ConflictException('release_rollback_conflict');
      await this.deactivateSupersededResources(tx, current.items ?? [], previous.items, rolledBackAt);
      for (const item of previous.items) {
        await tx.brainResourceVersion.updateMany({
          where: {
            resourceType: item.resourceType,
            resourceKey: item.resourceKey,
            status: 'active',
            id: { not: item.resourceVersionId },
          },
          data: { status: 'archived', archivedAt: rolledBackAt },
        });
        await tx.brainResourceVersion.update({
          where: { id: item.resourceVersionId },
          data: { status: 'active', activatedAt: rolledBackAt, archivedAt: null },
        });
        await this.activateSource(tx, item.resourceVersion);
      }
      return tx.brainRelease.update({
        where: { id: previous.id },
        data: { status: 'active', activatedAt: rolledBackAt, rolledBackAt: null, failureReason: null },
        include: { items: true },
      });
    });
  }

  async rollbackToRules(input: { releaseId: number; reason: string }) {
    const prisma = this.requirePrisma();
    const current = await prisma.brainRelease.findUnique({
      where: { id: input.releaseId },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!current || current.status !== 'active') throw new BadRequestException('release_not_active');
    if (this.record(current.rollout).mode === 'rules') throw new BadRequestException('release_already_rules');

    let previousReleaseId = current.previousReleaseId;
    let target: BrainReleaseWithItems | null = null;
    for (let depth = 0; previousReleaseId && depth < 20; depth += 1) {
      const candidate = await prisma.brainRelease.findUnique({
        where: { id: previousReleaseId },
        include: { items: { include: { resourceVersion: true } } },
      });
      if (!candidate) break;
      if (this.record(candidate.rollout).mode === 'rules') {
        target = candidate;
        break;
      }
      previousReleaseId = candidate.previousReleaseId;
    }
    if (!target) throw new BadRequestException('rules_release_not_found');

    this.assertReleaseItemsConsistent(target.items);
    const targetVersions = target.items.map((item) => item.resourceVersion);
    await this.validateGeneratedCapabilities(targetVersions);
    await this.validateDependencies(targetVersions);

    return this.runSerializable('release_rules_rollback_conflict', async (tx) => {
      const rolledBackAt = new Date();
      const claim = await tx.brainRelease.updateMany({
        where: { id: current.id, status: 'active' },
        data: { status: 'rolled_back', rolledBackAt, failureReason: input.reason },
      });
      if (claim.count !== 1) throw new ConflictException('release_rules_rollback_conflict');
      await tx.brainRelease.updateMany({
        where: { status: 'active', id: { not: target.id } },
        data: { status: 'archived' },
      });
      await this.deactivateSupersededResources(tx, current.items ?? [], target.items, rolledBackAt);
      for (const item of target.items) {
        await tx.brainResourceVersion.updateMany({
          where: {
            resourceType: item.resourceType,
            resourceKey: item.resourceKey,
            status: 'active',
            id: { not: item.resourceVersionId },
          },
          data: { status: 'archived', archivedAt: rolledBackAt },
        });
        await tx.brainResourceVersion.update({
          where: { id: item.resourceVersionId },
          data: { status: 'active', activatedAt: rolledBackAt, archivedAt: null },
        });
        await this.activateSource(tx, item.resourceVersion);
      }
      return tx.brainRelease.update({
        where: { id: target.id },
        data: { status: 'active', activatedAt: rolledBackAt, rolledBackAt: null, failureReason: null },
        include: { items: true },
      });
    });
  }

  listReleases() {
    return this.requirePrisma().brainRelease.findMany({
      orderBy: { createdAt: 'desc' },
      include: { items: true },
      take: 100,
    });
  }

  async selectRelease(input: { storeId: number; userId: number; roleKey: string }) {
    const releases = await this.requirePrisma().brainRelease.findMany({
      where: { status: 'active' },
      orderBy: { activatedAt: 'desc' },
      include: { items: true },
    });
    return releases.find((release) => this.matchesRollout(release.scope, this.record(release.rollout), input)) ?? null;
  }

  private async selectEvaluationRelease(releaseId: number) {
    if (!Number.isInteger(releaseId) || releaseId <= 0) throw new BadRequestException('evaluation_release_id_invalid');
    const release = await this.requirePrisma().brainRelease.findUnique({
      where: { id: releaseId },
      include: { items: { include: { resourceVersion: true } } },
    });
    if (!release) throw new BadRequestException('evaluation_release_not_found');
    if (release.status !== 'draft' && release.status !== 'active') {
      throw new BadRequestException('evaluation_release_not_evaluable');
    }
    return release;
  }

  private async validateDependencies(
    versions: Array<{ resourceType: string; resourceKey: string; snapshot: Prisma.JsonValue }>,
  ) {
    const prisma = this.requirePrisma();
    const roles = await prisma.role.findMany({ where: { status: 'active' }, select: { permissions: true } });
    const registeredPermissions = new Set(
      roles.flatMap((role) => role.permissions).filter((permission) => permission !== '*'),
    );
    const releaseSkillKeys = new Set(
      versions.filter((item) => item.resourceType === 'skill').map((item) => item.resourceKey),
    );
    const activeSkills = await prisma.brainSkillRegistry.findMany({
      where: { enabled: true },
      select: { skillKey: true },
    });
    const availableSkills = new Set([...activeSkills.map((item) => item.skillKey), ...releaseSkillKeys]);
    for (const version of versions) {
      const snapshot = this.record(version.snapshot);
      const permissions = this.extractPermissions(snapshot);
      const unknownPermissions = permissions.filter((permission) => !registeredPermissions.has(permission));
      if (unknownPermissions.length)
        throw new BadRequestException(`release_unregistered_permissions:${unknownPermissions.join(',')}`);
      if (version.resourceType === 'agent_profile') {
        const skills = Array.isArray(snapshot.allowedSkills)
          ? snapshot.allowedSkills.filter((item): item is string => typeof item === 'string')
          : [];
        const missingSkills = skills.filter((skill) => !availableSkills.has(skill));
        if (missingSkills.length) throw new BadRequestException(`release_missing_skills:${missingSkills.join(',')}`);
      }
    }
  }

  private assertReleaseEvalSummary(summary: Record<string, unknown>, releaseFingerprint: string) {
    if (summary.canRelease !== true || Number(summary.total ?? 0) <= 0) {
      throw new BadRequestException('release_eval_gate_failed');
    }
    const releaseGate = this.record(summary.releaseGate as Prisma.JsonValue);
    if (
      summary.gateMode !== 'release_gate' ||
      summary.coverageComplete !== true ||
      releaseGate.passed !== true ||
      !Array.isArray(summary.requiredCapabilityKeys) ||
      !Array.isArray(summary.requiredCaseKeys)
    ) {
      throw new BadRequestException('release_eval_gate_incomplete');
    }
    if (summary.releaseFingerprint !== releaseFingerprint) {
      throw new BadRequestException('release_eval_fingerprint_mismatch');
    }
  }

  private async validateGeneratedCapabilities(
    versions: Array<{
      resourceType: string;
      sourceResourceId: number | null;
      snapshot: Prisma.JsonValue;
    }>,
  ) {
    const prisma = this.requirePrisma();
    const generatedVersions = versions.filter((version) => {
      if (version.resourceType !== 'skill') return false;
      const snapshot = this.record(version.snapshot);
      return snapshot.generatedCapability === true;
    });
    if (!generatedVersions.length) return;
    if (!this.semanticVerifier) throw new BadRequestException('generated_capability_verifier_unavailable');
    const sourceIds = generatedVersions.map((version) => {
      if (!version.sourceResourceId) throw new BadRequestException('generated_capability_source_missing');
      return version.sourceResourceId;
    });
    const sourceRows = await prisma.brainSkillRegistry.findMany({ where: { id: { in: sourceIds } } });
    const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
    const inputs = generatedVersions.map((version) => {
      const sourceRow = sourceById.get(version.sourceResourceId!);
      if (!sourceRow) throw new BadRequestException('generated_capability_source_missing');
      return { snapshot: version.snapshot, sourceRow };
    });
    await this.semanticVerifier.verifyStoredCapabilities(inputs);
  }

  private async runSerializable<T>(conflictCode: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    const prisma = this.requirePrisma();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (isPrismaCode(error, 'P2034') && attempt < 3) continue;
        if (isPrismaCode(error, 'P2034')) throw new ConflictException(conflictCode);
        throw error;
      }
    }
    throw new ConflictException(conflictCode);
  }

  private extractPermissions(snapshot: Record<string, unknown>) {
    const direct = Array.isArray(snapshot.permissions)
      ? snapshot.permissions.filter((item): item is string => typeof item === 'string')
      : [];
    const scope = this.record(snapshot.dataScopeRules as Prisma.JsonValue);
    const scoped = Array.isArray(scope.requiredPermissions)
      ? scope.requiredPermissions.filter((item): item is string => typeof item === 'string')
      : [];
    return [...new Set([...direct, ...scoped])];
  }

  private async activateSource(
    tx: Prisma.TransactionClient,
    version: { resourceType: string; resourceKey: string; sourceResourceId: number | null },
  ) {
    this.assertResourceManagedHere(version.resourceType);
    if (!version.sourceResourceId) return;
    switch (version.resourceType) {
      case 'metric':
        await tx.brainMetric.updateMany({
          where: { metricKey: version.resourceKey, status: 'active' },
          data: { status: 'archived' },
        });
        await tx.brainMetric.update({ where: { id: version.sourceResourceId }, data: { status: 'active' } });
        break;
      case 'ontology_entity':
        await tx.brainOntologyEntity.updateMany({
          where: { entityKey: version.resourceKey, status: 'active' },
          data: { status: 'archived' },
        });
        await tx.brainOntologyEntity.update({ where: { id: version.sourceResourceId }, data: { status: 'active' } });
        break;
      case 'ontology_relation':
        await tx.brainOntologyRelation.updateMany({
          where: { relationKey: version.resourceKey, status: 'active' },
          data: { status: 'archived' },
        });
        await tx.brainOntologyRelation.update({ where: { id: version.sourceResourceId }, data: { status: 'active' } });
        break;
      case 'agent_profile':
        await tx.brainAgentProfile.updateMany({
          where: { roleKey: version.resourceKey, enabled: true },
          data: { enabled: false },
        });
        await tx.brainAgentProfile.update({ where: { id: version.sourceResourceId }, data: { enabled: true } });
        break;
      case 'skill':
        await tx.brainSkillRegistry.updateMany({
          where: { skillKey: version.resourceKey, enabled: true },
          data: { enabled: false },
        });
        await tx.brainSkillRegistry.update({ where: { id: version.sourceResourceId }, data: { enabled: true } });
        break;
      case 'inspection_rule':
        await tx.brainInspectionRule.updateMany({
          where: { ruleKey: version.resourceKey, enabled: true },
          data: { enabled: false },
        });
        await tx.brainInspectionRule.update({ where: { id: version.sourceResourceId }, data: { enabled: true } });
        break;
    }
  }

  private async deactivateSupersededResources(
    tx: Prisma.TransactionClient,
    currentItems: Array<{
      resourceVersionId: number;
      resourceVersion: { resourceType: string; resourceKey: string; sourceResourceId: number | null };
    }>,
    targetItems: Array<{ resourceVersionId: number }>,
    archivedAt: Date,
  ) {
    const targetVersionIds = new Set(targetItems.map((item) => item.resourceVersionId));
    for (const item of currentItems) {
      if (targetVersionIds.has(item.resourceVersionId)) continue;
      await tx.brainResourceVersion.updateMany({
        where: { id: item.resourceVersionId, status: 'active' },
        data: { status: 'archived', archivedAt },
      });
      await this.deactivateSource(tx, item.resourceVersion);
    }
  }

  private async deactivateSource(
    tx: Prisma.TransactionClient,
    version: { resourceType: string; sourceResourceId: number | null },
  ) {
    this.assertResourceManagedHere(version.resourceType);
    if (!version.sourceResourceId) return;
    switch (version.resourceType) {
      case 'agent_profile':
        await tx.brainAgentProfile.updateMany({ where: { id: version.sourceResourceId }, data: { enabled: false } });
        break;
      case 'skill':
        await tx.brainSkillRegistry.updateMany({ where: { id: version.sourceResourceId }, data: { enabled: false } });
        break;
      case 'inspection_rule':
        await tx.brainInspectionRule.updateMany({ where: { id: version.sourceResourceId }, data: { enabled: false } });
        break;
    }
  }

  private assertResourcesManagedHere(resources: Array<{ resourceType: string }>) {
    for (const resource of resources) this.assertResourceManagedHere(resource.resourceType);
  }

  private assertReleaseItemsConsistent(
    items: Array<{
      id?: number;
      resourceType: string;
      resourceKey: string;
      resourceVersion: { resourceType: string; resourceKey: string };
    }>,
  ) {
    for (const item of items) {
      this.assertResourceManagedHere(item.resourceType);
      this.assertResourceManagedHere(item.resourceVersion.resourceType);
      if (
        item.resourceType !== item.resourceVersion.resourceType ||
        item.resourceKey !== item.resourceVersion.resourceKey
      ) {
        throw new BadRequestException(
          `release_resource_item_mismatch:${item.id ?? `${item.resourceType}:${item.resourceKey}`}`,
        );
      }
    }
  }

  private assertResourceManagedHere(resourceType: string) {
    if (resourceType === 'metric' || resourceType === 'ontology_entity' || resourceType === 'ontology_relation') {
      throw new BadRequestException(`business_definition_registry_required:${resourceType}`);
    }
  }

  private matchesRollout(
    scope: string,
    rollout: Record<string, unknown>,
    input: { storeId: number; userId: number; roleKey: string },
  ) {
    if (scope === 'global') return true;
    const storeIds = Array.isArray(rollout.storeIds) ? rollout.storeIds.map(Number) : [];
    const roleKeys = Array.isArray(rollout.roleKeys) ? rollout.roleKeys.map(String) : [];
    if (scope === 'store') return storeIds.includes(input.storeId);
    if (scope === 'role')
      return roleKeys.includes(input.roleKey) && (!storeIds.length || storeIds.includes(input.storeId));
    if (scope === 'percentage') {
      const percentage = Math.max(0, Math.min(100, Number(rollout.userPercentage ?? 0)));
      return this.bucket(`${input.storeId}:${input.userId}:${input.roleKey}`) < percentage;
    }
    return false;
  }

  private bucket(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    return hash % 100;
  }

  private requirePrisma() {
    if (!this.prisma) throw new Error('brain_release_prisma_unavailable');
    return this.prisma;
  }

  private nonEmpty(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`missing_release_field:${field}`);
    return value.trim();
  }

  private record(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
}

function deepCloneFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => deepCloneFreeze(item))) as T;
  if (value != null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, deepCloneFreeze(item)]),
      ),
    ) as T;
  }
  return value;
}

type BrainReleaseWithItems = Prisma.BrainReleaseGetPayload<{
  include: { items: { include: { resourceVersion: true } } };
}>;
