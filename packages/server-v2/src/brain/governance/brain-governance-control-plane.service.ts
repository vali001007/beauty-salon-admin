import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

export const BRAIN_GOVERNANCE_RISK_LEVELS = ['low', 'medium', 'high', 'critical', 'unclassified'] as const;
export const BRAIN_GOVERNANCE_MODES = ['readonly', 'preview', 'advisory', 'alert'] as const;
export const BRAIN_GOVERNANCE_WHITELIST_STATUSES = [
  'not_allowed',
  'pending',
  'approved',
  'suspended',
  'expired',
] as const;
export const BRAIN_GOVERNANCE_TASK_STATUSES = [
  'pending',
  'validating',
  'classifying',
  'evaluating',
  'pending_approval',
  'revision_required',
  'approved',
  'rejected',
  'failed',
  'cancelled',
] as const;

export type BrainGovernanceRiskLevel = (typeof BRAIN_GOVERNANCE_RISK_LEVELS)[number];
export type BrainGovernanceMode = (typeof BRAIN_GOVERNANCE_MODES)[number];
export type BrainGovernanceWhitelistStatus = (typeof BRAIN_GOVERNANCE_WHITELIST_STATUSES)[number];

export interface CapabilityPolicySnapshot {
  schemaVersion: 1;
  capabilityKey: string;
  riskLevel: BrainGovernanceRiskLevel;
  mode: BrainGovernanceMode;
  whitelistStatus: BrainGovernanceWhitelistStatus;
  runtimeEnforcementStatus: 'pending_runtime' | 'shadow' | 'enforced';
  permissions: string[];
  owners: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  impact: Record<string, unknown>;
  reason: string;
  updatedAt: string;
}

@Injectable()
export class BrainGovernanceControlPlaneService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const now = new Date();
    const [taskGroups, policyRows, latestPolicySnapshot, runtimeRelease, completedTasks] = await Promise.all([
      this.prisma.brainGovernanceTask.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.brainResourceVersion.findMany({
        where: { resourceType: 'capability_policy' },
        distinct: ['resourceKey'],
        orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }],
        select: { resourceKey: true, snapshot: true, createdAt: true },
      }),
      this.prisma.brainRelease.findFirst({
        where: { scope: 'governance_policy', status: { in: ['active', 'draft'] } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        select: { id: true, releaseKey: true, status: true, activatedAt: true, createdAt: true, _count: { select: { items: true } } },
      }),
      this.prisma.brainRelease.findFirst({
        where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
        orderBy: { activatedAt: 'desc' },
        select: { id: true, releaseKey: true, scope: true, status: true, rollout: true, activatedAt: true },
      }),
      this.prisma.brainGovernanceTask.findMany({
        where: { completedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
        select: { status: true, createdAt: true, completedAt: true, result: true },
        take: 1000,
      }),
    ]);

    const policies = policyRows.map((row) => this.policySnapshot(row.snapshot, row.resourceKey));
    const risk = countBy(policies, (item) => item.riskLevel);
    const whitelist = countBy(policies, (item) => effectiveWhitelistStatus(item, now));
    const runtimePending = policies.filter((item) => item.runtimeEnforcementStatus === 'pending_runtime').length;
    const taskCounts = Object.fromEntries(taskGroups.map((item) => [item.status, item._count._all]));
    const durations = completedTasks
      .map((task) => task.completedAt ? task.completedAt.getTime() - task.createdAt.getTime() : null)
      .filter((value): value is number => value !== null && value >= 0)
      .sort((left, right) => left - right);
    const autoApproved = completedTasks.filter((task) => record(task.result).autoApproved === true).length;
    const manualOverrides = completedTasks.filter((task) => record(task.result).manualOverride === true).length;
    const policyActive = latestPolicySnapshot?.status === 'active';
    const runtimeRollout = record(runtimeRelease?.rollout);
    const boundPolicyReleaseId = Number(runtimeRollout.governancePolicyReleaseId);
    const runtimeGovernanceMode = runtimeRollout.governancePolicyMode;
    const policyBound =
      Number.isInteger(boundPolicyReleaseId) &&
      boundPolicyReleaseId > 0 &&
      (runtimeGovernanceMode === 'shadow' || runtimeGovernanceMode === 'enforced');
    const runtimeConsistency = !policyActive || !runtimeRelease
      ? 'drift'
      : !policyBound
        ? 'policy_published_runtime_pending'
        : boundPolicyReleaseId !== latestPolicySnapshot.id
          ? 'drift'
          : runtimePending > 0
            ? 'policy_published_runtime_pending'
            : 'aligned';

    return {
      pending: {
        unclassified: policies.filter((item) => item.riskLevel === 'unclassified').length,
        evaluating: Number(taskCounts.evaluating ?? 0),
        pendingApproval: Number(taskCounts.pending_approval ?? 0),
        revisionRequired: Number(taskCounts.revision_required ?? 0),
      },
      risk: withZeroCounts(risk, BRAIN_GOVERNANCE_RISK_LEVELS),
      whitelist: withZeroCounts(whitelist, BRAIN_GOVERNANCE_WHITELIST_STATUSES),
      runtimePending,
      latestPolicySnapshot: latestPolicySnapshot
        ? { ...latestPolicySnapshot, itemCount: latestPolicySnapshot._count.items, _count: undefined }
        : null,
      runtimeRelease,
      runtimeConsistency,
      runtimeGovernance: policyBound
        ? {
            policyReleaseId: boundPolicyReleaseId,
            mode: runtimeGovernanceMode,
            aligned: runtimeConsistency === 'aligned',
          }
        : null,
      efficiency: {
        completed7d: completedTasks.length,
        p50DurationMs: percentile(durations, 0.5),
        p95DurationMs: percentile(durations, 0.95),
        autoAdmissionRate: completedTasks.length ? autoApproved / completedTasks.length : null,
        manualOverrideRate: completedTasks.length ? manualOverrides / completedTasks.length : null,
      },
    };
  }

  async listCapabilityPolicies(input: {
    page?: number;
    pageSize?: number;
    search?: string;
    riskLevel?: string;
    mode?: string;
    whitelistStatus?: string;
    runtimeStatus?: string;
    status?: string;
  }) {
    const page = positive(input.page, 1);
    const pageSize = bounded(input.pageSize, 20, 100);
    const where = this.capabilityPolicyWhere(input);
    const grouped = await this.prisma.brainResourceVersion.groupBy({ by: ['resourceKey'], where });
    const rows = await this.prisma.brainResourceVersion.findMany({
      where,
      distinct: ['resourceKey'],
      orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        resourceKey: true,
        version: true,
        status: true,
        snapshot: true,
        createdBy: true,
        createdAt: true,
        activatedAt: true,
      },
    });
    return {
      items: rows.map((row) => ({ ...row, policy: this.policySnapshot(row.snapshot, row.resourceKey) })),
      total: grouped.length,
      page,
      pageSize,
    };
  }

  async getCapabilityPolicy(capabilityKey: string) {
    const key = nonEmpty(capabilityKey, 'capabilityKey');
    const versions = await this.prisma.brainResourceVersion.findMany({
      where: { resourceType: 'capability_policy', resourceKey: key },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    if (!versions.length) throw new NotFoundException('capability_policy_not_found');
    const receiptRows = await this.prisma.brainGateReceipt.findMany({
      where: { result: { path: ['plan', 'capabilities'], array_contains: [key] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      current: { ...versions[0], policy: this.policySnapshot(versions[0]!.snapshot, key) },
      history: versions.map((row) => ({ ...row, policy: this.policySnapshot(row.snapshot, key) })),
      evidence: receiptRows,
    };
  }

  async classifyCapability(input: {
    capabilityKey: string;
    riskLevel: string;
    mode: string;
    reason: string;
    permissions?: string[];
    owners?: Record<string, unknown>;
    actorId: number;
    actorPermissions: string[];
  }) {
    const capabilityKey = nonEmpty(input.capabilityKey, 'capabilityKey');
    const riskLevel = enumValue(input.riskLevel, BRAIN_GOVERNANCE_RISK_LEVELS, 'riskLevel');
    const mode = enumValue(input.mode, BRAIN_GOVERNANCE_MODES, 'mode');
    const reason = nonEmpty(input.reason, 'reason');
    this.assertModeAllowed(riskLevel, mode);
    const current = await this.latestPolicy(capabilityKey);
    if (current && isRiskDowngrade(current.policy.riskLevel, riskLevel)) {
      if (!input.actorPermissions.includes('*') && !input.actorPermissions.includes('core:brain-governance:approve')) {
        throw new BadRequestException('risk_downgrade_requires_approve_permission');
      }
    }
    const payload = { capabilityKey, riskLevel, mode, reason, permissions: uniqueStrings(input.permissions), owners: input.owners ?? {} };
    const task = await this.createTask({ taskType: 'classify', stage: 'candidate', resourceKey: capabilityKey, riskLevel, payload, actorId: input.actorId });
    void this.processTask(task.id);
    return { taskId: task.id, status: task.status, resourceKey: capabilityKey };
  }

  async evaluateCapability(input: { capabilityKey: string; stage: string; actorId: number }) {
    const capabilityKey = nonEmpty(input.capabilityKey, 'capabilityKey');
    if (!['dev', 'candidate', 'release', 'observe'].includes(input.stage)) throw new BadRequestException('governance_stage_invalid');
    const current = await this.latestPolicy(capabilityKey);
    if (!current) throw new NotFoundException('capability_policy_not_found');
    const task = await this.createTask({
      taskType: 'evaluate',
      stage: input.stage,
      resourceKey: capabilityKey,
      riskLevel: current.policy.riskLevel,
      payload: { capabilityKey, stage: input.stage, policyVersionId: current.id, policyChecksum: current.checksum },
      actorId: input.actorId,
    });
    void this.processTask(task.id);
    return { taskId: task.id, status: task.status, resourceKey: capabilityKey };
  }

  async approveCapability(input: { capabilityKey: string; decision: string; reason: string; actorId: number }) {
    const capabilityKey = nonEmpty(input.capabilityKey, 'capabilityKey');
    const reason = nonEmpty(input.reason, 'reason');
    if (!['approve', 'reject', 'revision_required'].includes(input.decision)) throw new BadRequestException('approval_decision_invalid');
    const current = await this.latestPolicy(capabilityKey);
    if (!current) throw new NotFoundException('capability_policy_not_found');
    if (input.decision === 'approve') {
      if (current.policy.riskLevel === 'unclassified') throw new BadRequestException('unclassified_policy_cannot_be_admitted');
      this.assertModeAllowed(current.policy.riskLevel, current.policy.mode);
      if (current.policy.whitelistStatus !== 'pending') throw new BadRequestException('approval_requires_pending_evaluation');
      if (!current.policy.evidence.length || effectiveWhitelistStatus({ ...current.policy, whitelistStatus: 'approved' }, new Date()) === 'expired') {
        throw new BadRequestException('approval_requires_valid_evidence');
      }
    }
    const pendingTasks = await this.prisma.brainGovernanceTask.findMany({
      where: { resourceType: 'capability_policy', resourceKey: capabilityKey, status: 'pending_approval' },
      select: { id: true, transitionLog: true },
    });
    if (!pendingTasks.length) throw new BadRequestException('approval_task_not_pending');
    const whitelistStatus: BrainGovernanceWhitelistStatus = input.decision === 'approve'
      ? ['high', 'critical'].includes(current.policy.riskLevel) ? 'not_allowed' : 'approved'
      : 'not_allowed';
    const version = await this.createPolicyVersion({
      capabilityKey,
      actorId: input.actorId,
      snapshot: { ...current.policy, whitelistStatus, reason, updatedAt: new Date().toISOString() },
    });
    const completedAt = new Date();
    await this.prisma.$transaction(pendingTasks.map((task) => this.prisma.brainGovernanceTask.update({
      where: { id: task.id },
      data: {
        status: input.decision === 'approve' ? 'approved' : input.decision,
        approvedBy: input.actorId,
        completedAt,
        transitionLog: this.json([...(Array.isArray(task.transitionLog) ? task.transitionLog : []), { status: input.decision === 'approve' ? 'approved' : input.decision, at: completedAt.toISOString(), actorId: input.actorId }]),
        result: this.json({ decision: input.decision, reason, policyVersionId: version.id, manualOverride: true }),
      },
    })));
    return { ...version, policy: this.policySnapshot(version.snapshot, capabilityKey) };
  }

  async listTasks(input: { page?: number; pageSize?: number; status?: string; resourceKey?: string; taskType?: string; search?: string; riskLevel?: string }) {
    const page = positive(input.page, 1);
    const pageSize = bounded(input.pageSize, 20, 100);
    const where: Prisma.BrainGovernanceTaskWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.resourceKey ? { resourceKey: input.resourceKey } : {}),
      ...(input.taskType ? { taskType: input.taskType } : {}),
      ...(input.search ? { OR: [{ resourceKey: { contains: input.search, mode: 'insensitive' as const } }, { taskType: { contains: input.search, mode: 'insensitive' as const } }] } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.brainGovernanceTask.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.brainGovernanceTask.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getTask(id: number) {
    const task = await this.prisma.brainGovernanceTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('brain_governance_task_not_found');
    return task;
  }

  async retryTask(id: number) {
    const task = await this.getTask(id);
    if (!['failed', 'revision_required'].includes(task.status)) throw new BadRequestException('brain_governance_task_not_retryable');
    if (task.attemptCount >= task.maxAttempts) throw new BadRequestException('brain_governance_task_attempts_exhausted');
    const transitionLog = Array.isArray(task.transitionLog) ? task.transitionLog : [];
    const updated = await this.prisma.brainGovernanceTask.update({
      where: { id },
      data: {
        status: 'pending',
        availableAt: new Date(),
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        leasedAt: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        transitionLog: this.json([...transitionLog, { status: 'pending', at: new Date().toISOString(), reason: 'manual_retry' }]),
      },
    });
    void this.processTask(id);
    return updated;
  }

  async ingestReceipt(input: Record<string, unknown>, actorId?: number) {
    const receiptKey = nonEmpty(input.receiptId ?? input.receiptKey, 'receiptKey');
    const expiresAt = new Date(String(input.expiresAt ?? ''));
    if (!Number.isFinite(expiresAt.getTime())) throw new BadRequestException('receipt_expires_at_invalid');
    const data = {
      stage: nonEmpty(input.stage, 'stage'),
      riskLevel: nonEmpty(input.riskLevel, 'riskLevel'),
      changedFilesChecksum: hash64(input.changedFilesChecksum, 'changedFilesChecksum'),
      diffChecksum: hash64(input.diffChecksum, 'diffChecksum'),
      sourceFingerprint: hash64(input.sourceFingerprint, 'sourceFingerprint'),
      releaseFingerprint: optionalString(input.releaseFingerprint),
      suiteChecksum: hash64(input.suiteChecksum, 'suiteChecksum'),
      dataSnapshot: optionalString(input.dataSnapshot),
      provider: optionalString(input.provider),
      model: optionalString(input.model),
      timeoutMs: input.timeout === null || input.timeout === undefined ? null : Number(input.timeout),
      resultChecksum: hash64(input.resultChecksum, 'resultChecksum'),
      status: nonEmpty(input.status, 'status'),
      result: this.json(input),
      createdBy: actorId,
      expiresAt,
    };
    const capabilities = extractReceiptCapabilities(input);
    const receipt = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.brainGateReceipt.upsert({ where: { receiptKey }, create: { receiptKey, ...data }, update: data });
      for (const capabilityKey of capabilities) {
        await tx.brainGateReceipt.updateMany({
          where: {
            id: { not: saved.id },
            stage: data.stage,
            status: 'passed',
            result: { path: ['plan', 'capabilities'], array_contains: [capabilityKey] },
          },
          data: { status: 'stale' },
        });
      }
      return saved;
    });
    for (const capabilityKey of capabilities) await this.ensureUnclassifiedPolicy(capabilityKey, actorId);
    return receipt;
  }

  async listPolicySnapshots(input: { page?: number; pageSize?: number; status?: string; search?: string }) {
    const page = positive(input.page, 1);
    const pageSize = bounded(input.pageSize, 20, 100);
    const where = { scope: 'governance_policy', ...(input.status ? { status: input.status as never } : {}), ...(input.search ? { releaseKey: { contains: input.search, mode: 'insensitive' as const } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.brainRelease.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: true },
      }),
      this.prisma.brainRelease.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async createPolicySnapshot(input: { releaseKey: string; resourceVersionIds?: number[]; actorId: number; note?: string }) {
    const releaseKey = nonEmpty(input.releaseKey, 'releaseKey');
    const requestedIds = uniqueNumbers(input.resourceVersionIds);
    const versions = requestedIds.length
      ? await this.prisma.brainResourceVersion.findMany({ where: { id: { in: requestedIds }, resourceType: 'capability_policy' } })
      : await this.prisma.brainResourceVersion.findMany({
          where: { resourceType: 'capability_policy' },
          distinct: ['resourceKey'],
          orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }],
        });
    if (!versions.length || (requestedIds.length && versions.length !== requestedIds.length)) {
      throw new BadRequestException('policy_snapshot_resource_versions_incomplete');
    }
    for (const version of versions) {
      const policy = this.policySnapshot(version.snapshot, version.resourceKey);
      if (policy.riskLevel === 'unclassified') throw new BadRequestException(`policy_snapshot_unclassified:${version.resourceKey}`);
      if (effectiveWhitelistStatus(policy, new Date()) === 'expired') throw new BadRequestException(`policy_snapshot_evidence_expired:${version.resourceKey}`);
    }
    const previous = await this.prisma.brainRelease.findFirst({
      where: { scope: 'governance_policy', status: 'active' },
      orderBy: { activatedAt: 'desc' },
    });
    return this.prisma.$transaction(async (tx) => {
      const release = await tx.brainRelease.create({
        data: {
          releaseKey,
          scope: 'governance_policy',
          versionMap: this.json(Object.fromEntries(versions.map((item) => [`capability_policy:${item.resourceKey}`, item.version]))),
          rollout: this.json({ note: input.note ?? '', policySnapshotChecksum: policySnapshotChecksum(versions) }),
          status: 'draft',
          createdBy: input.actorId,
          previousReleaseId: previous?.id,
        },
      });
      await tx.brainReleaseItem.createMany({
        data: versions.map((version) => ({
          releaseId: release.id,
          resourceVersionId: version.id,
          resourceType: version.resourceType,
          resourceKey: version.resourceKey,
          version: version.version,
          snapshot: this.json(version.snapshot),
        })),
      });
      return tx.brainRelease.findUniqueOrThrow({ where: { id: release.id }, include: { items: true } });
    });
  }

  async createRuntimePolicyTransition(input: {
    sourcePolicySnapshotId: number;
    runtimeStatus: 'shadow' | 'enforced';
    actorId: number;
    reason: string;
  }) {
    const reason = nonEmpty(input.reason, 'reason');
    const source = await this.prisma.brainRelease.findUnique({
      where: { id: input.sourcePolicySnapshotId },
      include: { items: { orderBy: { resourceKey: 'asc' } } },
    });
    if (!source || source.scope !== 'governance_policy') throw new NotFoundException('policy_snapshot_not_found');
    if (source.status !== 'active') throw new BadRequestException('policy_runtime_transition_requires_active_snapshot');
    if (!source.items.length || source.items.some((item) => item.resourceType !== 'capability_policy')) {
      throw new BadRequestException('policy_snapshot_resource_type_invalid');
    }
    const policies = source.items.map((item) => this.policySnapshot(item.snapshot, item.resourceKey));
    const unclassified = policies.filter((policy) => policy.riskLevel === 'unclassified');
    if (unclassified.length) {
      throw new BadRequestException(`policy_runtime_transition_unclassified:${unclassified.map((item) => item.capabilityKey).join(',')}`);
    }
    const keys = policies.map((policy) => policy.capabilityKey);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.brainResourceVersion.findMany({
        where: { resourceType: 'capability_policy', resourceKey: { in: keys } },
        select: { resourceKey: true, version: true },
        orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }],
      });
      const latestVersion = new Map<string, number>();
      for (const row of existing) {
        if (!latestVersion.has(row.resourceKey)) latestVersion.set(row.resourceKey, row.version);
      }
      const createdAt = new Date();
      const rows = policies.map((policy) => {
        const snapshot = this.json({
          ...policy,
          runtimeEnforcementStatus: input.runtimeStatus,
          owners: {
            ...policy.owners,
            runtimeTransition: {
              sourcePolicySnapshotId: source.id,
              status: input.runtimeStatus,
              actorId: input.actorId,
              at: createdAt.toISOString(),
            },
          },
          impact: {
            ...policy.impact,
            runtimeTransition: { sourcePolicySnapshotId: source.id, status: input.runtimeStatus },
          },
          reason,
          updatedAt: createdAt.toISOString(),
        });
        return {
          resourceType: 'capability_policy',
          resourceKey: policy.capabilityKey,
          version: (latestVersion.get(policy.capabilityKey) ?? 0) + 1,
          status: 'draft',
          snapshot,
          checksum: sha256(snapshot),
          createdBy: input.actorId,
          createdAt,
        };
      });
      await tx.brainResourceVersion.createMany({ data: rows });
      return tx.brainResourceVersion.findMany({
        where: {
          resourceType: 'capability_policy',
          OR: rows.map((row) => ({ resourceKey: row.resourceKey, version: row.version })),
        },
        orderBy: { resourceKey: 'asc' },
      });
    }, { maxWait: 10_000, timeout: 30_000 });
  }

  async publishPolicySnapshot(id: number) {
    const release = await this.prisma.brainRelease.findUnique({ where: { id }, include: { items: true } });
    if (!release || release.scope !== 'governance_policy') throw new NotFoundException('policy_snapshot_not_found');
    if (release.status !== 'draft') throw new BadRequestException('policy_snapshot_not_draft');
    if (!release.items.length) throw new BadRequestException('policy_snapshot_empty');
    if (release.items.some((item) => item.resourceType !== 'capability_policy')) {
      throw new BadRequestException('policy_snapshot_resource_type_invalid');
    }
    const resourceVersionIds = release.items.map((item) => item.resourceVersionId);
    const resourceKeys = release.items.map((item) => item.resourceKey);
    const activatedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.brainRelease.updateMany({ where: { id, scope: 'governance_policy', status: 'draft' }, data: { status: 'active', activatedAt } });
      if (claim.count !== 1) throw new ConflictException('policy_snapshot_publish_conflict');
      await tx.brainRelease.updateMany({
        where: { scope: 'governance_policy', status: 'active', id: { not: id } },
        data: { status: 'archived' },
      });
      await tx.brainResourceVersion.updateMany({
        where: {
          resourceType: 'capability_policy',
          resourceKey: { in: resourceKeys },
          status: 'active',
          id: { notIn: resourceVersionIds },
        },
        data: { status: 'archived', archivedAt: activatedAt },
      });
      const activatedVersions = await tx.brainResourceVersion.updateMany({
        where: { id: { in: resourceVersionIds }, resourceType: 'capability_policy' },
        data: { status: 'active', activatedAt, archivedAt: null },
      });
      if (activatedVersions.count !== resourceVersionIds.length) {
        throw new ConflictException('policy_snapshot_resource_activation_incomplete');
      }
      return tx.brainRelease.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
  }

  async rollbackPolicySnapshot(id: number, reason: string) {
    const current = await this.prisma.brainRelease.findUnique({ where: { id }, include: { items: true } });
    if (!current || current.scope !== 'governance_policy') throw new NotFoundException('policy_snapshot_not_found');
    if (current.status !== 'active') throw new BadRequestException('policy_snapshot_not_active');
    if (!current.previousReleaseId) throw new BadRequestException('previous_policy_snapshot_not_found');
    const previous = await this.prisma.brainRelease.findUnique({ where: { id: current.previousReleaseId }, include: { items: true } });
    if (!previous || previous.scope !== 'governance_policy') throw new BadRequestException('previous_policy_snapshot_scope_invalid');
    if (current.items.some((item) => item.resourceType !== 'capability_policy')) throw new BadRequestException('policy_snapshot_resource_type_invalid');
    if (previous.items.some((item) => item.resourceType !== 'capability_policy')) throw new BadRequestException('previous_policy_snapshot_resource_type_invalid');
    const currentVersionIds = current.items.map((item) => item.resourceVersionId);
    const previousVersionIds = previous.items.map((item) => item.resourceVersionId);
    const previousResourceKeys = previous.items.map((item) => item.resourceKey);
    const rolledBackAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.brainRelease.updateMany({
        where: { id, scope: 'governance_policy', status: 'active' },
        data: { status: 'rolled_back', rolledBackAt, failureReason: nonEmpty(reason, 'reason') },
      });
      if (claim.count !== 1) throw new ConflictException('policy_snapshot_rollback_conflict');
      await tx.brainResourceVersion.updateMany({
        where: { id: { in: currentVersionIds }, resourceType: 'capability_policy' },
        data: { status: 'archived', archivedAt: rolledBackAt },
      });
      await tx.brainResourceVersion.updateMany({
        where: {
          resourceType: 'capability_policy',
          resourceKey: { in: previousResourceKeys },
          status: 'active',
          id: { notIn: previousVersionIds },
        },
        data: { status: 'archived', archivedAt: rolledBackAt },
      });
      const restoredVersions = await tx.brainResourceVersion.updateMany({
        where: { id: { in: previousVersionIds }, resourceType: 'capability_policy' },
        data: { status: 'active', activatedAt: rolledBackAt, archivedAt: null },
      });
      if (restoredVersions.count !== previousVersionIds.length) {
        throw new ConflictException('policy_snapshot_resource_rollback_incomplete');
      }
      return tx.brainRelease.update({ where: { id: previous.id }, data: { status: 'active', activatedAt: rolledBackAt, rolledBackAt: null, failureReason: null }, include: { items: true } });
    });
  }

  private async processTask(id: number) {
    try {
      const taskBeforeClaim = await this.getTask(id);
      const now = new Date();
      const claimable = (taskBeforeClaim.status === 'pending' && taskBeforeClaim.availableAt <= now)
        || (['validating', 'classifying', 'evaluating'].includes(taskBeforeClaim.status)
          && Boolean(taskBeforeClaim.leaseExpiresAt && taskBeforeClaim.leaseExpiresAt < now));
      if (!claimable || taskBeforeClaim.attemptCount >= taskBeforeClaim.maxAttempts) return;
      const claimed = await this.prisma.brainGovernanceTask.updateMany({
        where: {
          id,
          attemptCount: taskBeforeClaim.attemptCount,
          OR: [
            { status: 'pending', availableAt: { lte: now } },
            { status: { in: ['validating', 'classifying', 'evaluating'] }, leaseExpiresAt: { lt: now } },
          ],
        },
        data: { status: 'validating', attemptCount: { increment: 1 }, leasedAt: now, leaseExpiresAt: new Date(now.getTime() + 5 * 60 * 1000), leaseOwner: `inline-${process.pid}` },
      });
      if (claimed.count !== 1) return;
      const task = await this.getTask(id);
      const payload = record(task.payload);
      if (task.taskType === 'classify') {
        await this.transitionTask(id, 'classifying');
        const riskLevel = enumValue(payload.riskLevel, BRAIN_GOVERNANCE_RISK_LEVELS, 'riskLevel');
        const mode = enumValue(payload.mode, BRAIN_GOVERNANCE_MODES, 'mode');
        const whitelistStatus: BrainGovernanceWhitelistStatus = 'not_allowed';
        const version = await this.createPolicyVersion({
          capabilityKey: nonEmpty(payload.capabilityKey, 'capabilityKey'),
          actorId: task.createdBy,
          snapshot: {
            schemaVersion: 1,
            capabilityKey: nonEmpty(payload.capabilityKey, 'capabilityKey'),
            riskLevel,
            mode,
            whitelistStatus,
            runtimeEnforcementStatus: 'pending_runtime',
            permissions: uniqueStrings(payload.permissions),
            owners: record(payload.owners),
            evidence: [],
            impact: {},
            reason: nonEmpty(payload.reason, 'reason'),
            updatedAt: new Date().toISOString(),
          },
        });
        const capabilityKey = nonEmpty(payload.capabilityKey, 'capabilityKey');
        const evaluation = await this.createTask({
          taskType: 'evaluate',
          stage: task.stage,
          resourceKey: capabilityKey,
          riskLevel,
          payload: { capabilityKey, stage: task.stage, policyVersionId: version.id, policyChecksum: version.checksum },
          actorId: task.createdBy,
        });
        await this.completeTask(id, 'approved', { policyVersionId: version.id, nextTaskId: evaluation.id });
        void this.processTask(evaluation.id);
        return;
      }
      if (task.taskType === 'evaluate') {
        await this.transitionTask(id, 'evaluating');
        const capabilityKey = nonEmpty(payload.capabilityKey, 'capabilityKey');
        const requestedVersionId = Number(payload.policyVersionId);
        const policyVersion = Number.isInteger(requestedVersionId) && requestedVersionId > 0
          ? await this.prisma.brainResourceVersion.findFirst({ where: { id: requestedVersionId, resourceType: 'capability_policy', resourceKey: capabilityKey } })
          : null;
        const policyRow = policyVersion
          ? { ...policyVersion, policy: this.policySnapshot(policyVersion.snapshot, capabilityKey) }
          : await this.latestPolicy(capabilityKey);
        if (!policyRow) throw new Error('capability_policy_not_found');
        if (policyRow.policy.riskLevel === 'unclassified') {
          await this.completeTask(id, 'revision_required', { blockingReason: 'risk_classification_required' });
          return;
        }
        const receipt = await this.prisma.brainGateReceipt.findFirst({
          where: {
            status: 'passed',
            expiresAt: { gt: new Date() },
            stage: String(payload.stage ?? task.stage),
            result: { path: ['plan', 'capabilities'], array_contains: [capabilityKey] },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!receipt) {
          await this.completeTask(id, 'revision_required', { blockingReason: 'valid_gate_receipt_missing' });
          return;
        }
        const autoApproved = policyRow.policy.riskLevel === 'low' && policyRow.policy.mode === 'readonly';
        const version = await this.createPolicyVersion({
          capabilityKey,
          actorId: task.createdBy,
          snapshot: {
            ...policyRow.policy,
            whitelistStatus: autoApproved ? 'approved' : 'pending',
            evidence: [{ receiptId: receipt.receiptKey, stage: receipt.stage, resultChecksum: receipt.resultChecksum, expiresAt: receipt.expiresAt.toISOString() }],
            updatedAt: new Date().toISOString(),
          },
        });
        await this.completeTask(id, autoApproved ? 'approved' : 'pending_approval', { policyVersionId: version.id, autoApproved });
        return;
      }
      throw new Error(`unsupported_governance_task:${task.taskType}`);
    } catch (error) {
      await this.prisma.brainGovernanceTask.update({
        where: { id },
        data: {
          status: 'failed',
          errorCode: 'governance_task_failed',
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          completedAt: new Date(),
          leaseOwner: null,
          leasedAt: null,
          leaseExpiresAt: null,
        },
      }).catch(() => undefined);
    }
  }

  private async createTask(input: { taskType: string; stage: string; resourceKey: string; riskLevel: string; payload: Record<string, unknown>; actorId: number }) {
    const idempotencyKey = sha256({ taskType: input.taskType, stage: input.stage, resourceKey: input.resourceKey, payload: input.payload });
    return this.prisma.brainGovernanceTask.upsert({
      where: { idempotencyKey },
      create: {
        idempotencyKey,
        taskType: input.taskType,
        stage: input.stage,
        resourceType: 'capability_policy',
        resourceKey: input.resourceKey,
        riskLevel: input.riskLevel,
        payload: this.json(input.payload),
        transitionLog: this.json([{ status: 'pending', at: new Date().toISOString(), actorId: input.actorId }]),
        createdBy: input.actorId,
      },
      update: {},
    });
  }

  private async transitionTask(id: number, status: string) {
    const task = await this.getTask(id);
    const log = Array.isArray(task.transitionLog) ? task.transitionLog : [];
    return this.prisma.brainGovernanceTask.update({
      where: { id },
      data: { status, transitionLog: this.json([...log, { status, at: new Date().toISOString() }]) },
    });
  }

  private async completeTask(id: number, status: string, result: Record<string, unknown>) {
    const task = await this.getTask(id);
    const log = Array.isArray(task.transitionLog) ? task.transitionLog : [];
    return this.prisma.brainGovernanceTask.update({
      where: { id },
      data: {
        status,
        result: this.json(result),
        transitionLog: this.json([...log, { status, at: new Date().toISOString() }]),
        completedAt: ['approved', 'rejected', 'revision_required', 'failed', 'cancelled'].includes(status) ? new Date() : null,
        leaseOwner: null,
        leasedAt: null,
        leaseExpiresAt: null,
      },
    });
  }

  private async latestPolicy(capabilityKey: string) {
    const row = await this.prisma.brainResourceVersion.findFirst({
      where: { resourceType: 'capability_policy', resourceKey: capabilityKey },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
    });
    return row ? { ...row, policy: this.policySnapshot(row.snapshot, capabilityKey) } : null;
  }

  private async createPolicyVersion(input: { capabilityKey: string; snapshot: CapabilityPolicySnapshot; actorId: number }) {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.brainResourceVersion.findFirst({
        where: { resourceType: 'capability_policy', resourceKey: input.capabilityKey },
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        select: { version: true },
      });
      const snapshot = this.json(input.snapshot);
      return tx.brainResourceVersion.create({
        data: {
          resourceType: 'capability_policy',
          resourceKey: input.capabilityKey,
          version: (latest?.version ?? 0) + 1,
          status: 'draft',
          snapshot,
          checksum: sha256(snapshot),
          createdBy: input.actorId,
        },
      });
    });
  }

  private async ensureUnclassifiedPolicy(capabilityKey: string, actorId?: number) {
    if (await this.latestPolicy(capabilityKey)) return;
    try {
      await this.createPolicyVersion({
        capabilityKey,
        actorId: actorId ?? 0,
        snapshot: {
          schemaVersion: 1,
          capabilityKey,
          riskLevel: 'unclassified',
          mode: 'alert',
          whitelistStatus: 'not_allowed',
          runtimeEnforcementStatus: 'pending_runtime',
          permissions: [],
          owners: {},
          evidence: [],
          impact: { source: 'gate_receipt' },
          reason: 'awaiting_governance_classification',
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
  }

  private capabilityPolicyWhere(input: { search?: string; riskLevel?: string; mode?: string; whitelistStatus?: string; runtimeStatus?: string; status?: string }): Prisma.BrainResourceVersionWhereInput {
    return {
      resourceType: 'capability_policy',
      ...(input.status ? { status: input.status } : {}),
      ...(input.search ? { resourceKey: { contains: input.search, mode: 'insensitive' } } : {}),
      ...(input.riskLevel ? { snapshot: { path: ['riskLevel'], equals: input.riskLevel } } : {}),
      ...(input.mode ? { snapshot: { path: ['mode'], equals: input.mode } } : {}),
      ...(input.whitelistStatus ? { snapshot: { path: ['whitelistStatus'], equals: input.whitelistStatus } } : {}),
      ...(input.runtimeStatus ? { snapshot: { path: ['runtimeEnforcementStatus'], equals: input.runtimeStatus } } : {}),
    };
  }

  private policySnapshot(value: Prisma.JsonValue, capabilityKey: string): CapabilityPolicySnapshot {
    const payload = record(value);
    const riskLevel = BRAIN_GOVERNANCE_RISK_LEVELS.includes(payload.riskLevel as never) ? payload.riskLevel as BrainGovernanceRiskLevel : 'unclassified';
    const mode = BRAIN_GOVERNANCE_MODES.includes(payload.mode as never) ? payload.mode as BrainGovernanceMode : 'alert';
    const whitelistStatus = BRAIN_GOVERNANCE_WHITELIST_STATUSES.includes(payload.whitelistStatus as never)
      ? payload.whitelistStatus as BrainGovernanceWhitelistStatus
      : 'not_allowed';
    const runtimeStatus = ['pending_runtime', 'shadow', 'enforced'].includes(String(payload.runtimeEnforcementStatus))
      ? payload.runtimeEnforcementStatus as CapabilityPolicySnapshot['runtimeEnforcementStatus']
      : 'pending_runtime';
    const snapshot: CapabilityPolicySnapshot = {
      schemaVersion: 1,
      capabilityKey,
      riskLevel,
      mode,
      whitelistStatus,
      runtimeEnforcementStatus: runtimeStatus,
      permissions: uniqueStrings(payload.permissions),
      owners: record(payload.owners),
      evidence: Array.isArray(payload.evidence) ? payload.evidence.filter(isRecord) : [],
      impact: record(payload.impact),
      reason: typeof payload.reason === 'string' ? payload.reason : '',
      updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date(0).toISOString(),
    };
    return { ...snapshot, whitelistStatus: effectiveWhitelistStatus(snapshot, new Date()) };
  }

  private assertModeAllowed(riskLevel: BrainGovernanceRiskLevel, mode: BrainGovernanceMode) {
    if (riskLevel === 'unclassified') {
      if (mode !== 'alert') throw new BadRequestException('unclassified_policy_requires_alert_mode');
      return;
    }
    if (riskLevel === 'low' && mode !== 'readonly') throw new BadRequestException('low_risk_policy_requires_readonly_mode');
    if (riskLevel === 'medium' && !['preview', 'advisory'].includes(mode)) throw new BadRequestException('medium_risk_policy_requires_preview_or_advisory_mode');
    if (riskLevel === 'critical' && mode !== 'alert') throw new BadRequestException('critical_policy_requires_alert_mode');
    if (riskLevel === 'high' && mode === 'readonly') throw new BadRequestException('high_risk_policy_cannot_use_readonly_whitelist');
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`missing_governance_field:${field}`);
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) throw new BadRequestException(`governance_enum_invalid:${field}`);
  return value as T[number];
}

function uniqueStrings(value: unknown): string[] {
  return [...new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : [])].sort();
}

function uniqueNumbers(value: unknown): number[] {
  return [...new Set(Array.isArray(value) ? value.map(Number).filter((item) => Number.isInteger(item) && item > 0) : [])].sort((left, right) => left - right);
}

function positive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function bounded(value: unknown, fallback: number, max: number): number {
  return Math.min(positive(value, fallback), max);
}

function riskRank(value: BrainGovernanceRiskLevel): number {
  return ['low', 'medium', 'high', 'critical', 'unclassified'].indexOf(value);
}

function isRiskDowngrade(current: BrainGovernanceRiskLevel, next: BrainGovernanceRiskLevel): boolean {
  if (current === 'unclassified' || next === 'unclassified') return false;
  return riskRank(next) < riskRank(current);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function hash64(value: unknown, field: string): string {
  const text = nonEmpty(value, field);
  if (!/^[a-f0-9]{64}$/i.test(text)) throw new BadRequestException(`governance_hash_invalid:${field}`);
  return text.toLowerCase();
}

function countBy<T>(items: T[], select: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) result[select(item)] = (result[select(item)] ?? 0) + 1;
  return result;
}

function withZeroCounts(value: Record<string, number>, keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, value[key] ?? 0]));
}

function effectiveWhitelistStatus(policy: CapabilityPolicySnapshot, now: Date): BrainGovernanceWhitelistStatus {
  if (policy.whitelistStatus !== 'approved') return policy.whitelistStatus;
  const expiries = policy.evidence.map((item) => Date.parse(String(item.expiresAt ?? ''))).filter(Number.isFinite);
  return expiries.length && Math.min(...expiries) <= now.getTime() ? 'expired' : policy.whitelistStatus;
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))] ?? null;
}

function policySnapshotChecksum(versions: Array<{ resourceKey: string; version: number; checksum: string }>): string {
  return sha256(versions.map((item) => ({ resourceKey: item.resourceKey, version: item.version, checksum: item.checksum })).sort((left, right) => left.resourceKey.localeCompare(right.resourceKey)));
}

function extractReceiptCapabilities(value: Record<string, unknown>): string[] {
  return uniqueStrings(record(value.plan).capabilities);
}
