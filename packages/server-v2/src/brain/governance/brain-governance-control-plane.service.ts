import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainGovernanceEventService } from './brain-governance-event.service.js';
import { BrainReleaseIdentityService } from './brain-release-identity.service.js';
import {
  BrainActiveReleaseWarmupService,
  type BrainActiveReleaseWarmupStatus,
} from './brain-active-release-warmup.service.js';
import {
  BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS,
  BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS,
} from './brain-release-product-profile.js';

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

const ACTIONABLE_TASK_STATUSES = [
  'pending',
  'validating',
  'classifying',
  'evaluating',
  'pending_approval',
  'revision_required',
  'failed',
] as const;

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
  private readonly logger = new Logger(BrainGovernanceControlPlaneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events?: BrainGovernanceEventService,
    @Optional() private readonly activeReleaseWarmup?: BrainActiveReleaseWarmupService,
    @Optional() private readonly releaseIdentity?: BrainReleaseIdentityService,
  ) {}

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
        select: { id: true, releaseKey: true, releaseFamily: true, displayCode: true, displayName: true, scope: true, status: true, activatedAt: true, createdAt: true, _count: { select: { items: true } } },
      }),
      this.prisma.brainRelease.findFirst({
        where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
        orderBy: { activatedAt: 'desc' },
        select: {
          id: true,
          releaseKey: true,
          releaseFamily: true,
          displayCode: true,
          displayName: true,
          scope: true,
          status: true,
          rollout: true,
          rolloutStage: true,
          activatedAt: true,
          rolloutSequence: { select: { runtimeVersionCode: true, displayName: true } },
        },
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
        ? {
            ...latestPolicySnapshot,
            itemCount: latestPolicySnapshot._count.items,
            _count: undefined,
            productIdentity: this.releaseIdentity?.productIdentity(latestPolicySnapshot) ?? null,
          }
        : null,
      runtimeRelease: runtimeRelease
        ? { ...runtimeRelease, productIdentity: this.releaseIdentity?.productIdentity(runtimeRelease) ?? null }
        : null,
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
      runtimeWarmup: this.runtimeWarmupSummary(),
    };
  }

  getRuntimeOntologyWarmup() {
    const status = this.activeReleaseWarmup?.getStatus();
    if (!status) return null;
    return {
      ...status,
      cacheStatus: warmupCacheStatus(status),
      artifactSource: warmupArtifactSource(status),
      failureCategory: warmupFailureCategory(status.failureReason),
      performanceTargetMs: 10_000,
      performanceTargetMet: status.state === 'ready' && status.latencyMs !== null && status.latencyMs < 10_000,
    };
  }

  async retryRuntimeOntologyWarmup() {
    if (!this.activeReleaseWarmup) throw new NotFoundException('Ontology 预热服务不可用');
    await this.activeReleaseWarmup.warmActiveReleases();
    return this.getRuntimeOntologyWarmup();
  }

  private runtimeWarmupSummary() {
    const status = this.activeReleaseWarmup?.getStatus();
    if (!status) return null;
    return {
      state: status.state,
      currentPhase: status.currentPhase,
      latencyMs: status.latencyMs,
      runtimeReleaseCount: status.activeReleaseCount,
      warmedReleaseCount: status.warmedReleaseCount,
      cacheStatus: warmupCacheStatus(status),
      artifactSource: warmupArtifactSource(status),
      phases: status.phases,
      completedAt: status.completedAt,
      failureCategory: warmupFailureCategory(status.failureReason),
      failureReason: status.failureReason,
      performanceTargetMs: 10_000,
      performanceTargetMet: status.state === 'ready' && status.latencyMs !== null && status.latencyMs < 10_000,
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
    candidateKey?: string;
    affectedOnly?: boolean;
    actionableOnly?: boolean;
    owner?: string;
    blockerType?: string;
  }) {
    const page = positive(input.page, 1);
    const pageSize = bounded(input.pageSize, 20, 100);
    const [latestRows, affectedRows, actionableTaskRows] = await Promise.all([
      this.prisma.brainResourceVersion.findMany({
        where: { resourceType: 'capability_policy' },
        distinct: ['resourceKey'],
        orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }, { id: 'desc' }],
        select: { id: true, resourceKey: true },
      }),
      input.candidateKey
        ? this.prisma.brainGateReceiptCapability.findMany({
            where: { receipt: { candidate: { candidateKey: input.candidateKey } } },
            distinct: ['capabilityKey'],
            orderBy: [{ capabilityKey: 'asc' }, { createdAt: 'desc' }],
            select: { capabilityKey: true, impactRuleId: true, changeType: true },
          })
        : Promise.resolve([]),
      input.actionableOnly || input.blockerType
        ? this.prisma.brainGovernanceTask.findMany({
            where: {
              resourceType: 'capability_policy',
              resourceKey: { not: null },
              status: { in: [...ACTIONABLE_TASK_STATUSES] },
              ...(input.candidateKey ? { candidate: { candidateKey: input.candidateKey } } : {}),
              ...(input.blockerType ? { blockerType: input.blockerType } : {}),
            },
            distinct: ['resourceKey'],
            select: { resourceKey: true },
          })
        : Promise.resolve([]),
    ]);
    const latestIds = latestRows.map((item) => item.id);
    const affectedKeys = affectedRows.map((item) => item.capabilityKey);
    const candidateImpactByCapability = new Map(affectedRows.map((item) => [item.capabilityKey, {
      impactRuleId: item.impactRuleId,
      changeType: item.changeType,
    }]));
    const actionableTaskKeys = actionableTaskRows.flatMap((item) => item.resourceKey ? [item.resourceKey] : []);
    if (input.affectedOnly && (!input.candidateKey || !affectedKeys.length)) {
      return { items: [], total: 0, page, pageSize };
    }
    if (input.blockerType && !actionableTaskKeys.length) {
      return { items: [], total: 0, page, pageSize };
    }
    const baseWhere = this.capabilityPolicyWhere(input);
    const filters: Prisma.BrainResourceVersionWhereInput[] = [baseWhere, { id: { in: latestIds } }];
    if (input.candidateKey) filters.push({ resourceKey: { in: affectedKeys } });
    if (input.blockerType) filters.push({ resourceKey: { in: actionableTaskKeys } });
    else if (input.actionableOnly) {
      filters.push({
        OR: [
          { resourceKey: { in: actionableTaskKeys } },
          { snapshot: { path: ['riskLevel'], equals: 'unclassified' } },
          { snapshot: { path: ['whitelistStatus'], equals: 'pending' } },
        ],
      });
    }
    const where: Prisma.BrainResourceVersionWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.brainResourceVersion.findMany({
        where,
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
      }),
      this.prisma.brainResourceVersion.count({ where }),
    ]);
    const rowKeys = rows.map((row) => row.resourceKey);
    const taskRows = rowKeys.length
      ? await this.prisma.brainGovernanceTask.findMany({
          where: {
            resourceType: 'capability_policy',
            resourceKey: { in: rowKeys },
            status: { in: [...ACTIONABLE_TASK_STATUSES] },
            ...(input.candidateKey ? { candidate: { candidateKey: input.candidateKey } } : {}),
          },
          select: { resourceKey: true, blockerType: true, blockerCode: true, status: true },
        })
      : [];
    const tasksByCapability = new Map<string, typeof taskRows>();
    for (const task of taskRows) {
      if (!task.resourceKey) continue;
      tasksByCapability.set(task.resourceKey, [...(tasksByCapability.get(task.resourceKey) ?? []), task]);
    }
    return {
      items: rows.map((row) => {
        const policy = this.policySnapshot(row.snapshot, row.resourceKey);
        const tasks = tasksByCapability.get(row.resourceKey) ?? [];
        return {
          ...row,
          policy,
          governance: {
            actionable: Boolean(tasks.length || policy.riskLevel === 'unclassified' || policy.whitelistStatus === 'pending'),
            blockerTypes: [...new Set(tasks.map((task) => task.blockerType).filter((value) => value !== 'none'))],
            blockerCodes: [...new Set(tasks.flatMap((task) => task.blockerCode ? [task.blockerCode] : []))],
            activeTaskCount: tasks.length,
            candidateImpact: candidateImpactByCapability.get(row.resourceKey) ?? null,
          },
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async getCapabilityPolicy(capabilityKey: string) {
    const key = nonEmpty(capabilityKey, 'capabilityKey');
    const [versions, receiptRows, candidateImpacts, tasks, auditEvents] = await Promise.all([
      this.prisma.brainResourceVersion.findMany({
        where: { resourceType: 'capability_policy', resourceKey: key },
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      this.prisma.brainGateReceipt.findMany({
        where: { capabilities: { some: { capabilityKey: key } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.brainGateReceiptCapability.findMany({
        where: { capabilityKey: key },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          impactRuleId: true,
          changeType: true,
          createdAt: true,
          receipt: {
            select: {
              id: true,
              receiptKey: true,
              stage: true,
              status: true,
              trustLevel: true,
              verificationStatus: true,
              expiresAt: true,
              candidate: {
                select: { id: true, candidateKey: true, branch: true, headCommit: true, status: true },
              },
            },
          },
        },
      }),
      this.prisma.brainGovernanceTask.findMany({
        where: { resourceType: 'capability_policy', resourceKey: key },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { candidate: { select: { id: true, candidateKey: true, branch: true, headCommit: true, status: true } } },
      }),
      this.prisma.brainGovernanceEvent.findMany({
        where: {
          OR: [
            { entityType: 'capability_policy', entityId: key },
            { entityType: 'governance_task', payload: { path: ['resourceKey'], equals: key } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    if (!versions.length) throw new NotFoundException('capability_policy_not_found');
    return {
      current: { ...versions[0], policy: this.policySnapshot(versions[0]!.snapshot, key) },
      history: versions.map((row) => ({ ...row, policy: this.policySnapshot(row.snapshot, key) })),
      evidence: receiptRows,
      candidateImpacts,
      tasks,
      auditEvents,
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
    return { taskId: task.id, status: task.status, resourceKey: capabilityKey };
  }

  async updateCapabilityOwners(input: {
    capabilityKey: string;
    owners: Record<string, unknown>;
    reason: string;
    actorId: number;
  }) {
    const capabilityKey = nonEmpty(input.capabilityKey, 'capabilityKey');
    const reason = nonEmpty(input.reason, 'reason');
    const owners = record(input.owners);
    if (!Object.values(owners).some((value) => typeof value === 'string' && value.trim())) {
      throw new BadRequestException('capability_policy_owner_required');
    }
    const current = await this.latestPolicy(capabilityKey);
    if (!current) throw new NotFoundException('capability_policy_not_found');
    const version = await this.createPolicyVersion({
      capabilityKey,
      actorId: input.actorId,
      snapshot: {
        ...current.policy,
        owners,
        reason,
        updatedAt: new Date().toISOString(),
      },
    });
    await this.events?.record({
      eventType: 'capability_owner_updated',
      entityType: 'capability_policy',
      entityId: capabilityKey,
      actorType: 'user',
      actorId: input.actorId,
      payload: { policyVersionId: version.id, owners, reason },
    });
    return { ...version, policy: this.policySnapshot(version.snapshot, capabilityKey) };
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
    return { taskId: task.id, status: task.status, resourceKey: capabilityKey };
  }

  async evaluateCandidate(input: { candidateKey: string; actorId: number }) {
    const candidate = await this.prisma.brainGovernanceCandidate.findUnique({
      where: { candidateKey: nonEmpty(input.candidateKey, 'candidateKey') },
      select: { id: true, status: true },
    });
    if (!candidate) throw new NotFoundException('brain_governance_candidate_not_found');
    const rows = await this.prisma.brainGateReceiptCapability.findMany({
      where: { receipt: { candidateId: candidate.id, status: 'passed' } },
      distinct: ['capabilityKey'],
      orderBy: { capabilityKey: 'asc' },
      select: { capabilityKey: true },
    });
    if (!rows.length) throw new ConflictException('candidate_capabilities_missing');
    const taskIds: number[] = [];
    for (const row of rows) {
      await this.ensureUnclassifiedPolicy(row.capabilityKey, input.actorId);
      const current = await this.latestPolicy(row.capabilityKey);
      if (!current) continue;
      const task = await this.createTask({
        taskType: 'evaluate',
        stage: 'candidate',
        resourceKey: row.capabilityKey,
        riskLevel: current.policy.riskLevel,
        payload: {
          capabilityKey: row.capabilityKey,
          stage: 'candidate',
          policyVersionId: current.id,
          policyChecksum: current.checksum,
          candidateId: candidate.id,
        },
        actorId: input.actorId,
        candidateId: candidate.id,
      });
      taskIds.push(task.id);
    }
    await this.prisma.brainGovernanceCandidate.update({
      where: { id: candidate.id },
      data: { status: 'governing' },
    });
    return { candidateId: candidate.id, taskIds, status: 'governing' };
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
      select: { id: true, candidateId: true, resourceKey: true, transitionLog: true },
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
    for (const task of pendingTasks) {
      await this.recordTaskEvent(
        { ...task, status: input.decision === 'approve' ? 'approved' : input.decision },
        input.decision === 'approve' ? 'task_approved' : input.decision === 'reject' ? 'task_rejected' : 'task_revision_required',
        { actorId: input.actorId, reason, policyVersionId: version.id },
      );
    }
    return { ...version, policy: this.policySnapshot(version.snapshot, capabilityKey) };
  }

  async listTasks(input: {
    page?: number;
    pageSize?: number;
    status?: string;
    resourceKey?: string;
    taskType?: string;
    search?: string;
    riskLevel?: string;
    candidateKey?: string;
    blockerType?: string;
    resolutionType?: string;
    actionableOnly?: boolean;
  }) {
    const page = positive(input.page, 1);
    const pageSize = bounded(input.pageSize, 20, 100);
    const where: Prisma.BrainGovernanceTaskWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.resourceKey ? { resourceKey: input.resourceKey } : {}),
      ...(input.taskType ? { taskType: input.taskType } : {}),
      ...(input.search ? { OR: [{ resourceKey: { contains: input.search, mode: 'insensitive' as const } }, { taskType: { contains: input.search, mode: 'insensitive' as const } }] } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      ...(input.candidateKey ? { candidate: { candidateKey: input.candidateKey } } : {}),
      ...(input.blockerType ? { blockerType: input.blockerType } : {}),
      ...(input.resolutionType ? { resolutionType: input.resolutionType } : {}),
      ...(input.actionableOnly ? {
        status: { in: ['pending', 'pending_approval', 'revision_required', 'failed'] },
        NOT: { blockerType: 'evidence' },
      } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.brainGovernanceTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          idempotencyKey: true,
          taskType: true,
          stage: true,
          resourceType: true,
          resourceKey: true,
          riskLevel: true,
          status: true,
          attemptCount: true,
          maxAttempts: true,
          availableAt: true,
          errorCode: true,
          errorMessage: true,
          createdBy: true,
          approvedBy: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          candidateId: true,
          receiptId: true,
          blockerType: true,
          blockerCode: true,
          resolutionType: true,
          supersededByTaskId: true,
          candidate: {
            select: {
              id: true,
              candidateKey: true,
              branch: true,
              headCommit: true,
              status: true,
              receipts: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { gates: { select: { gateKey: true, status: true } } },
              },
            },
          },
        },
      }),
      this.prisma.brainGovernanceTask.count({ where }),
    ]);
    const items = rows.map(({ candidate, ...task }) => ({
      ...task,
      candidate: candidate ? {
        id: candidate.id,
        candidateKey: candidate.candidateKey,
        branch: candidate.branch,
        headCommit: candidate.headCommit,
        status: candidate.status,
      } : null,
      requiredGates: candidate?.receipts[0]?.gates.map((gate) => gate.gateKey) ?? [],
    }));
    return { items, total, page, pageSize };
  }

  async getTask(id: number) {
    const row = await this.prisma.brainGovernanceTask.findUnique({
      where: { id },
      include: {
        candidate: {
          select: {
            id: true,
            candidateKey: true,
            branch: true,
            headCommit: true,
            status: true,
            receipts: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { gates: { select: { gateKey: true, status: true } } },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('brain_governance_task_not_found');
    const { candidate, ...task } = row;
    const transitions = Array.isArray(task.transitionLog) ? task.transitionLog : [];
    return {
      ...task,
      candidate: candidate ? {
        id: candidate.id,
        candidateKey: candidate.candidateKey,
        branch: candidate.branch,
        headCommit: candidate.headCommit,
        status: candidate.status,
      } : null,
      requiredGates: candidate?.receipts[0]?.gates.map((gate) => gate.gateKey) ?? [],
      timeline: transitions.map((entry, index) => {
        const item = record(entry);
        return {
          index,
          status: optionalString(item.status) ?? 'unknown',
          at: optionalString(item.at),
          actorId: Number.isInteger(Number(item.actorId)) ? Number(item.actorId) : null,
          reason: optionalString(item.reason),
          blockerType: optionalString(item.blockerType),
          blockerCode: optionalString(item.blockerCode),
        };
      }),
    };
  }

  async retryTask(id: number) {
    const task = await this.getTask(id);
    if (task.status === 'revision_required' && task.blockerType === 'evidence') {
      throw new ConflictException('governance_task_waiting_for_evidence');
    }
    if (task.status !== 'failed' || task.blockerType !== 'system') {
      throw new BadRequestException('brain_governance_task_not_retryable');
    }
    if (task.attemptCount >= task.maxAttempts) throw new BadRequestException('brain_governance_task_attempts_exhausted');
    const transitionLog = Array.isArray(task.transitionLog) ? task.transitionLog : [];
    const updated = await this.prisma.brainGovernanceTask.update({
      where: { id },
      data: {
        status: 'pending',
        availableAt: new Date(),
        errorCode: null,
        errorMessage: null,
        blockerType: 'none',
        blockerCode: null,
        resolutionType: null,
        completedAt: null,
        leasedAt: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        transitionLog: this.json([...transitionLog, { status: 'pending', at: new Date().toISOString(), reason: 'manual_retry' }]),
      },
    });
    await this.recordTaskEvent(updated, 'task_retried', { reason: 'manual_retry' });
    return updated;
  }

  async cancelTask(id: number, actorId: number) {
    const task = await this.getTask(id);
    if (['approved', 'rejected', 'failed', 'cancelled'].includes(task.status)) {
      throw new BadRequestException('brain_governance_task_not_cancellable');
    }
    const transitionLog = Array.isArray(task.transitionLog) ? task.transitionLog : [];
    const updated = await this.prisma.brainGovernanceTask.update({
      where: { id },
      data: {
        status: 'cancelled',
        blockerType: 'none',
        blockerCode: null,
        resolutionType: null,
        completedAt: new Date(),
        leaseOwner: null,
        leasedAt: null,
        leaseExpiresAt: null,
        transitionLog: this.json([...transitionLog, { status: 'cancelled', at: new Date().toISOString(), actorId }]),
      },
    });
    await this.recordTaskEvent(updated, 'task_cancelled', { actorId });
    return updated;
  }

  async ingestReceipt(
    input: Record<string, unknown>,
    actorId?: number,
    trustLevel: 'untrusted_dev' | 'trusted_candidate' | 'verified_release' = 'untrusted_dev',
  ) {
    const receiptKey = nonEmpty(input.receiptId ?? input.receiptKey, 'receiptKey');
    const expiresAt = new Date(String(input.expiresAt ?? ''));
    if (!Number.isFinite(expiresAt.getTime())) throw new BadRequestException('receipt_expires_at_invalid');
    const trusted = trustLevel === 'trusted_candidate' || trustLevel === 'verified_release';
    const storedStatus = trusted ? nonEmpty(input.status, 'status') : 'untrusted';
    if (trusted && storedStatus !== 'passed') throw new BadRequestException('trusted_receipt_must_pass');
    const verification = record(input.verification);
    const admissionEligible = trusted && verification.admissionEligible === true;
    const storedResult = {
      ...input,
      status: storedStatus,
      verification: {
        ...verification,
        status: trusted ? 'verified' : 'untrusted',
        trustLevel,
        admissionEligible,
      },
    };
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
      resultChecksum: trusted
        ? hash64(input.resultChecksum, 'resultChecksum')
        : sha256(Array.isArray(input.results) ? input.results : input),
      status: storedStatus,
      result: this.json(storedResult),
      createdBy: actorId,
      expiresAt,
      schemaVersion: Number.isInteger(Number(input.schemaVersion)) ? Number(input.schemaVersion) : 1,
      candidateId: optionalPositiveInteger(input.governanceCandidateId ?? input.candidateId),
      baseCommit: optionalString(input.baseCommit),
      headCommit: optionalString(input.headCommit),
      mergeBaseCommit: optionalString(input.mergeBaseCommit),
      identityChecksum: optionalHash64(input.identityChecksum),
      issuerType: trusted ? trustLevel === 'verified_release' ? 'release_service' : 'ci' : 'local',
      issuer: optionalString(verification.issuer ?? input.issuer),
      trustLevel,
      verificationStatus: trusted ? 'verified' : 'received',
      verificationError: null,
      verifiedAt: trusted ? new Date(String(verification.verifiedAt ?? new Date().toISOString())) : null,
      ingestedAt: new Date(),
      evalRunId: optionalPositiveInteger(input.evalRunId),
      evaluationReleaseId: optionalPositiveInteger(input.evaluationReleaseId),
    };
    const capabilities = trusted ? extractReceiptCapabilities(input) : [];
    const gates = trusted ? extractReceiptGates(input, expiresAt) : [];
    const receipt = await this.prisma.$transaction(async (tx) => {
      if (!trusted) {
        const existing = await tx.brainGateReceipt.findUnique({
          where: { receiptKey },
          select: { trustLevel: true, verificationStatus: true },
        });
        if (existing && (existing.trustLevel !== 'untrusted_dev' || existing.verificationStatus === 'verified')) {
          throw new ConflictException('trusted_receipt_key_reserved');
        }
      }
      const saved = await tx.brainGateReceipt.upsert({ where: { receiptKey }, create: { receiptKey, ...data }, update: data });
      if (trusted) {
        await tx.brainGateReceiptGate.deleteMany({ where: { receiptId: saved.id } });
        await tx.brainGateReceiptCapability.deleteMany({ where: { receiptId: saved.id } });
        if (gates.length) await tx.brainGateReceiptGate.createMany({ data: gates.map((gate) => ({ ...gate, receiptId: saved.id })) });
        if (capabilities.length) {
          await tx.brainGateReceiptCapability.createMany({
            data: capabilities.map((capabilityKey) => ({ receiptId: saved.id, capabilityKey })),
          });
        }
      }
      for (const capabilityKey of capabilities) {
        await tx.brainGateReceipt.updateMany({
          where: {
            id: { not: saved.id },
            stage: data.stage,
            status: 'passed',
            capabilities: { some: { capabilityKey } },
          },
          data: { status: 'stale' },
        });
      }
      return saved;
    });
    for (const capabilityKey of capabilities) await this.ensureUnclassifiedPolicy(capabilityKey, actorId);
    const rescheduledTaskIds = admissionEligible
      ? await this.rescheduleEvidenceBlockedTasks(receipt.id, data.candidateId, data.stage, capabilities, actorId ?? 0)
      : [];
    return { ...receipt, rescheduledTaskIds };
  }

  async listReceipts(input: {
    page?: number;
    pageSize?: number;
    candidateKey?: string;
    capabilityKey?: string;
    gateKey?: string;
    trustLevel?: string;
    verificationStatus?: string;
    status?: string;
  }) {
    const page = positive(input.page, 1);
    const pageSize = bounded(input.pageSize, 20, 100);
    const where: Prisma.BrainGateReceiptWhereInput = {
      ...(input.candidateKey ? { candidate: { candidateKey: input.candidateKey } } : {}),
      ...(input.capabilityKey ? { capabilities: { some: { capabilityKey: input.capabilityKey } } } : {}),
      ...(input.gateKey ? { gates: { some: { gateKey: input.gateKey } } } : {}),
      ...(input.trustLevel ? { trustLevel: input.trustLevel } : {}),
      ...(input.verificationStatus ? { verificationStatus: input.verificationStatus } : {}),
      ...(input.status ? { status: input.status } : {}),
    };
    const select = {
      id: true,
      receiptKey: true,
      stage: true,
      riskLevel: true,
      status: true,
      trustLevel: true,
      verificationStatus: true,
      verificationError: true,
      candidateId: true,
      provider: true,
      model: true,
      createdAt: true,
      expiresAt: true,
      candidate: { select: { candidateKey: true, repository: true, headCommit: true } },
      _count: { select: { gates: true, capabilities: true } },
    } satisfies Prisma.BrainGateReceiptSelect;
    const [items, total] = await Promise.all([
      this.prisma.brainGateReceipt.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, select }),
      this.prisma.brainGateReceipt.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getReceipt(id: number) {
    const receipt = await this.prisma.brainGateReceipt.findUnique({
      where: { id },
      include: {
        candidate: { select: { candidateKey: true, repository: true, baseCommit: true, mergeBaseCommit: true, headCommit: true } },
        gates: { orderBy: { gateKey: 'asc' } },
        capabilities: { orderBy: { capabilityKey: 'asc' } },
      },
    });
    if (!receipt) throw new NotFoundException('brain_gate_receipt_not_found');
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
    return {
      items: items.map((item) => ({
        ...item,
        productIdentity: this.releaseIdentity?.productIdentity(item) ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async createPolicySnapshot(input: { releaseKey: string; resourceVersionIds?: number[]; actorId: number; note?: string; displayName?: string }) {
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
    const existing = await this.prisma.brainRelease.findUnique({
      where: { releaseKey },
      include: { items: { select: { resourceVersionId: true } } },
    });
    if (existing) {
      assertReusablePolicySnapshot(existing, versions.map((version) => version.id));
      if (this.releaseIdentity && !existing.displayCode) {
        await this.releaseIdentity.assignPolicyIdentity(existing.id, input.displayName ?? 'Governance Policy');
      }
      return this.prisma.brainRelease.findUniqueOrThrow({ where: { id: existing.id }, include: { items: true } });
    }
    const previous = await this.prisma.brainRelease.findFirst({
      where: { scope: 'governance_policy', status: 'active' },
      orderBy: { activatedAt: 'desc' },
    });
    let created: { id: number; releaseKey: string; displayCode: string | null; items: Array<unknown> };
    let newlyCreated = false;
    try {
      created = await this.prisma.$transaction(async (tx) => {
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
      newlyCreated = true;
    } catch (error) {
      if (!isPrismaCode(error, 'P2002')) throw error;
      const raced = await this.prisma.brainRelease.findUnique({
        where: { releaseKey },
        include: { items: { select: { resourceVersionId: true } } },
      });
      if (!raced) throw error;
      assertReusablePolicySnapshot(raced, versions.map((version) => version.id));
      created = await this.prisma.brainRelease.findUniqueOrThrow({ where: { id: raced.id }, include: { items: true } });
    }
    const identified = this.releaseIdentity
      ? await this.releaseIdentity.assignPolicyIdentity(created.id, input.displayName ?? 'Governance Policy')
      : created;
    if (newlyCreated) await this.events?.record({
      eventType: 'policy_snapshot_created',
      entityType: 'policy_snapshot',
      entityId: created.id,
      actorType: 'user',
      actorId: input.actorId,
      payload: {
        releaseKey: created.releaseKey,
        displayCode: identified.displayCode,
        itemCount: created.items.length,
      },
    });
    return this.prisma.brainRelease.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
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
    const transitioned = await this.prisma.$transaction(async (tx) => {
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
    await this.events?.record({
      eventType: 'policy_runtime_transition_created',
      entityType: 'policy_snapshot',
      entityId: source.id,
      actorType: 'user',
      actorId: input.actorId,
      payload: { runtimeStatus: input.runtimeStatus, resourceVersionIds: transitioned.map((item) => item.id), reason },
    });
    return transitioned;
  }

  async createQueryOnlyPolicyVersions(input: { candidateKey: string; actorId: number }) {
    const candidate = await this.prisma.brainGovernanceCandidate.findUnique({
      where: { candidateKey: nonEmpty(input.candidateKey, 'candidateKey') },
      include: {
        receipts: {
          where: {
            status: 'passed',
            expiresAt: { gt: new Date() },
            trustLevel: { in: ['trusted_candidate', 'verified_release'] },
            verificationStatus: 'verified',
            result: { path: ['verification', 'admissionEligible'], equals: true },
          },
          orderBy: { createdAt: 'desc' },
          include: { capabilities: true },
        },
      },
    });
    if (!candidate) throw new NotFoundException('brain_governance_candidate_not_found');
    const active = await this.prisma.brainRelease.findFirst({
      where: { scope: 'governance_policy', status: 'active' },
      orderBy: { activatedAt: 'desc' },
      include: { items: { orderBy: { resourceKey: 'asc' } } },
    });
    if (!active) throw new BadRequestException('active_policy_snapshot_missing');

    const allowed = new Set<string>(BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS);
    const disabled = new Set<string>(BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS);
    const expected = new Set<string>([...allowed, ...disabled]);
    const actual = new Set(active.items.map((item) => item.resourceKey));
    const missing = [...expected].filter((key) => !actual.has(key));
    const extra = [...actual].filter((key) => !expected.has(key));
    if (missing.length || extra.length || active.items.length !== expected.size) {
      throw new BadRequestException(
        `brain_query_only_policy_manifest_mismatch:missing=${missing.join(',') || 'none'}:extra=${extra.join(',') || 'none'}`,
      );
    }

    const receiptByCapability = new Map<string, typeof candidate.receipts[number]>();
    for (const receipt of candidate.receipts) {
      for (const capability of receipt.capabilities) {
        if (!receiptByCapability.has(capability.capabilityKey)) receiptByCapability.set(capability.capabilityKey, receipt);
      }
    }
    const missingEvidence = [...expected].filter((key) => !receiptByCapability.has(key));
    if (missingEvidence.length) {
      throw new BadRequestException(`query_only_policy_valid_evidence_missing:${missingEvidence.sort().join(',')}`);
    }

    const policies = active.items.map((item) => {
      const current = this.policySnapshot(item.snapshot, item.resourceKey);
      const receipt = receiptByCapability.get(item.resourceKey)!;
      const isAllowed = allowed.has(item.resourceKey);
      return {
        capabilityKey: item.resourceKey,
        snapshot: {
          ...current,
          riskLevel: isAllowed ? 'low' as const : 'high' as const,
          mode: isAllowed ? 'readonly' as const : current.mode,
          whitelistStatus: isAllowed ? 'approved' as const : 'not_allowed' as const,
          runtimeEnforcementStatus: 'enforced' as const,
          evidence: [{
            receiptId: receipt.receiptKey,
            stage: receipt.stage,
            resultChecksum: receipt.resultChecksum,
            expiresAt: receipt.expiresAt.toISOString(),
            candidateKey: candidate.candidateKey,
          }],
          impact: {
            ...current.impact,
            productProfile: 'query_only_v1',
            admission: isAllowed ? 'approved_readonly' : 'denied_action',
            sourcePolicyReleaseId: active.id,
            candidateKey: candidate.candidateKey,
          },
          reason: isAllowed
            ? 'query_only_v1_readonly_capability_approved'
            : 'query_only_v1_action_capability_denied',
          updatedAt: new Date().toISOString(),
        } satisfies CapabilityPolicySnapshot,
      };
    });

    let result: { versions: Array<{ id: number; resourceKey: string }>; createdCount: number } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        result = await this.prisma.$transaction(async (tx) => {
          const existing = await tx.brainResourceVersion.findMany({
            where: { resourceType: 'capability_policy', resourceKey: { in: [...expected] } },
            select: { id: true, resourceKey: true, version: true, snapshot: true },
            orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }],
          });
          const latest = new Map<string, typeof existing[number]>();
          for (const row of existing) if (!latest.has(row.resourceKey)) latest.set(row.resourceKey, row);
          const reused: Array<{ id: number; resourceKey: string }> = [];
          const rows = policies.flatMap((policy) => {
            const current = latest.get(policy.capabilityKey);
            if (current && queryOnlyPolicyVersionMatches(current.snapshot, policy.snapshot)) {
              reused.push({ id: current.id, resourceKey: current.resourceKey });
              return [];
            }
            const snapshot = this.json(policy.snapshot);
            return [{
              resourceType: 'capability_policy',
              resourceKey: policy.capabilityKey,
              version: (current?.version ?? 0) + 1,
              status: 'draft',
              snapshot,
              checksum: sha256(snapshot),
              createdBy: input.actorId,
            }];
          });
          if (rows.length) await tx.brainResourceVersion.createMany({ data: rows });
          const created = rows.length
            ? await tx.brainResourceVersion.findMany({
                where: { resourceType: 'capability_policy', OR: rows.map((row) => ({ resourceKey: row.resourceKey, version: row.version })) },
                select: { id: true, resourceKey: true },
              })
            : [];
          const versions = [...reused, ...created].sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));
          if (versions.length !== expected.size) throw new ConflictException('query_only_policy_version_set_incomplete');
          return { versions, createdCount: created.length };
        }, {
          maxWait: 10_000,
          timeout: 30_000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        break;
      } catch (error) {
        if ((isPrismaCode(error, 'P2034') || isPrismaCode(error, 'P2002')) && attempt < 3) continue;
        if (isPrismaCode(error, 'P2034') || isPrismaCode(error, 'P2002')) {
          throw new ConflictException('query_only_policy_version_concurrency_conflict');
        }
        throw error;
      }
    }
    if (!result) throw new ConflictException('query_only_policy_version_concurrency_conflict');
    if (result.createdCount > 0) {
      await this.events?.record({
        candidateId: candidate.id,
        eventType: 'query_only_policy_versions_created',
        entityType: 'candidate',
        entityId: candidate.id,
        actorType: 'user',
        actorId: input.actorId,
        payload: {
          policyVersionCount: result.versions.length,
          createdPolicyVersionCount: result.createdCount,
          reusedPolicyVersionCount: result.versions.length - result.createdCount,
          allowedCapabilityCount: allowed.size,
          deniedCapabilityCount: disabled.size,
          sourcePolicyReleaseId: active.id,
        },
      });
    }
    return {
      sourcePolicyReleaseId: active.id,
      resourceVersionIds: result.versions.map((item) => item.id),
      allowedCapabilityCount: allowed.size,
      deniedCapabilityCount: disabled.size,
    };
  }

  async publishPolicySnapshot(id: number, actorId?: number) {
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
    const published = await this.prisma.$transaction(async (tx) => {
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
      await tx.brainGovernanceCandidate.updateMany({
        where: {
          policySnapshotId: id,
          status: { notIn: ['blocked', 'superseded', 'completed'] },
          tasks: { none: { status: { in: ['pending', 'validating', 'classifying', 'evaluating', 'pending_approval', 'revision_required', 'failed'] } } },
        },
        data: { status: 'ready' },
      });
      return tx.brainRelease.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
    await this.events?.record({
      eventType: 'policy_published',
      entityType: 'policy_snapshot',
      entityId: id,
      actorType: actorId ? 'user' : 'service',
      actorId,
      payload: { releaseKey: published.releaseKey, itemCount: published.items.length },
    });
    return published;
  }

  async rollbackPolicySnapshot(id: number, reason: string, actorId?: number) {
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
    const restored = await this.prisma.$transaction(async (tx) => {
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
    await this.events?.record({
      eventType: 'policy_rolled_back',
      entityType: 'policy_snapshot',
      entityId: id,
      actorType: actorId ? 'user' : 'service',
      actorId,
      payload: { restoredPolicySnapshotId: restored.id, reason },
    });
    return restored;
  }

  async processTask(id: number, leaseOwner = `brain-governance-${process.pid}`): Promise<boolean> {
    let leaseHeartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const taskBeforeClaim = await this.getTask(id);
      const now = new Date();
      const claimable = (taskBeforeClaim.status === 'pending' && taskBeforeClaim.availableAt <= now)
        || (['validating', 'classifying', 'evaluating'].includes(taskBeforeClaim.status)
          && Boolean(taskBeforeClaim.leaseExpiresAt && taskBeforeClaim.leaseExpiresAt < now));
      if (!claimable || taskBeforeClaim.attemptCount >= taskBeforeClaim.maxAttempts) return false;
      if (taskBeforeClaim.candidateId) {
        const candidate = await this.prisma.brainGovernanceCandidate.findUnique({
          where: { id: taskBeforeClaim.candidateId },
          select: { id: true, status: true },
        });
        if (candidate?.status === 'superseded') {
          const transitionLog = Array.isArray(taskBeforeClaim.transitionLog) ? taskBeforeClaim.transitionLog : [];
          const cancelled = await this.prisma.brainGovernanceTask.updateMany({
            where: {
              id,
              attemptCount: taskBeforeClaim.attemptCount,
              OR: [
                { status: 'pending', availableAt: { lte: now } },
                { status: { in: ['validating', 'classifying', 'evaluating'] }, leaseExpiresAt: { lt: now } },
              ],
            },
            data: {
              status: 'cancelled',
              blockerType: 'none',
              blockerCode: 'candidate_superseded',
              resolutionType: 'candidate_superseded',
              completedAt: now,
              leaseOwner: null,
              leasedAt: null,
              leaseExpiresAt: null,
              transitionLog: this.json([...transitionLog, {
                status: 'cancelled',
                at: now.toISOString(),
                reason: 'candidate_superseded',
              }]),
            },
          });
          if (cancelled.count === 1) {
            await this.recordTaskEvent(
              { ...taskBeforeClaim, status: 'cancelled' },
              'task_cancelled',
              { reason: 'candidate_superseded', candidateId: candidate.id },
            );
            return true;
          }
          return false;
        }
      }
      const claimed = await this.prisma.brainGovernanceTask.updateMany({
        where: {
          id,
          attemptCount: taskBeforeClaim.attemptCount,
          OR: [
            { status: 'pending', availableAt: { lte: now } },
            { status: { in: ['validating', 'classifying', 'evaluating'] }, leaseExpiresAt: { lt: now } },
          ],
        },
        data: { status: 'validating', attemptCount: { increment: 1 }, leasedAt: now, leaseExpiresAt: new Date(now.getTime() + 5 * 60 * 1000), leaseOwner },
      });
      if (claimed.count !== 1) return false;
      leaseHeartbeat = setInterval(() => {
        void this.renewTaskLease(id, leaseOwner).then((renewed) => {
          if (!renewed) this.logger.warn(`Governance task lease was not renewed: task=${id} owner=${leaseOwner}`);
        }).catch((error) => {
          this.logger.error(`Governance task lease renewal failed: task=${id} owner=${leaseOwner} error=${error instanceof Error ? error.message : String(error)}`);
        });
      }, 60_000);
      leaseHeartbeat.unref?.();
      const task = await this.getTask(id);
      const payload = record(task.payload);
      if (task.taskType === 'classify') {
        await this.transitionTask(id, 'classifying', leaseOwner);
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
          candidateId: task.candidateId ?? undefined,
        });
        await this.completeTask(id, 'approved', { policyVersionId: version.id, nextTaskId: evaluation.id }, leaseOwner);
        return true;
      }
      if (task.taskType === 'evaluate') {
        await this.transitionTask(id, 'evaluating', leaseOwner);
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
          await this.blockTask(id, 'business', 'risk_classification_required', 'edit_policy', leaseOwner);
          return true;
        }
        const receipt = await this.prisma.brainGateReceipt.findFirst({
          where: {
            status: 'passed',
            expiresAt: { gt: new Date() },
            stage: String(payload.stage ?? task.stage),
            trustLevel: { in: ['trusted_candidate', 'verified_release'] },
            verificationStatus: 'verified',
            capabilities: { some: { capabilityKey } },
            result: { path: ['verification', 'admissionEligible'], equals: true },
            ...(task.candidateId ? { candidateId: task.candidateId } : {}),
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!receipt) {
          await this.blockTask(id, 'evidence', 'valid_gate_receipt_missing', 'wait_ci', leaseOwner);
          return true;
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
        await this.completeTask(
          id,
          autoApproved ? 'approved' : 'pending_approval',
          { policyVersionId: version.id, autoApproved, receiptId: receipt.id },
          leaseOwner,
        );
        return true;
      }
      throw new Error(`unsupported_governance_task:${task.taskType}`);
    } catch (error) {
      if (error instanceof GovernanceTaskLeaseLostError) return false;
      const failedTask = await this.prisma.brainGovernanceTask.findUnique({ where: { id } }).catch(() => null);
      if (!failedTask) return false;
      const exhausted = failedTask.attemptCount >= failedTask.maxAttempts;
      const retryDelayMs = [60_000, 5 * 60_000, 20 * 60_000][Math.min(Math.max((failedTask?.attemptCount ?? 1) - 1, 0), 2)]!;
      const now = new Date();
      const updated = await this.prisma.brainGovernanceTask.updateMany({
        where: {
          id,
          leaseOwner,
          status: { in: ['validating', 'classifying', 'evaluating'] },
          leaseExpiresAt: { gt: now },
        },
        data: {
          status: exhausted ? 'failed' : 'pending',
          blockerType: 'system',
          blockerCode: exhausted ? 'governance_task_failed' : 'governance_task_retry_scheduled',
          resolutionType: 'retry_system',
          errorCode: exhausted ? 'governance_task_failed' : 'governance_task_retry_scheduled',
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          availableAt: exhausted ? now : new Date(now.getTime() + retryDelayMs),
          completedAt: exhausted ? now : null,
          leaseOwner: null,
          leasedAt: null,
          leaseExpiresAt: null,
        },
      }).catch(() => undefined);
      return updated?.count === 1;
    } finally {
      if (leaseHeartbeat) clearInterval(leaseHeartbeat);
    }
  }

  async renewTaskLease(id: number, leaseOwner: string, now = new Date()) {
    const renewed = await this.prisma.brainGovernanceTask.updateMany({
      where: {
        id,
        leaseOwner,
        status: { in: ['validating', 'classifying', 'evaluating'] },
        leaseExpiresAt: { gt: now },
      },
      data: {
        leaseExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      },
    });
    return renewed.count === 1;
  }

  private async createTask(input: {
    taskType: string;
    stage: string;
    resourceKey: string;
    riskLevel: string;
    payload: Record<string, unknown>;
    actorId: number;
    candidateId?: number;
    receiptId?: number;
  }) {
    const idempotencyKey = sha256({
      taskType: input.taskType,
      stage: input.stage,
      resourceKey: input.resourceKey,
      payload: input.payload,
      candidateId: input.candidateId ?? null,
      receiptId: input.receiptId ?? null,
    });
    const task = await this.prisma.brainGovernanceTask.upsert({
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
        candidateId: input.candidateId,
        receiptId: input.receiptId,
      },
      update: {},
    });
    await this.recordTaskEvent(task, 'task_created', { taskType: input.taskType, stage: input.stage });
    return task;
  }

  private async transitionTask(id: number, status: string, leaseOwner: string) {
    const task = await this.getTask(id);
    const log = Array.isArray(task.transitionLog) ? task.transitionLog : [];
    const now = new Date();
    const claim = await this.prisma.brainGovernanceTask.updateMany({
      where: {
        id,
        leaseOwner,
        status: { in: ['validating', 'classifying', 'evaluating'] },
        leaseExpiresAt: { gt: now },
      },
      data: {
        status,
        leaseExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        transitionLog: this.json([...log, { status, at: now.toISOString() }]),
      },
    });
    if (claim.count !== 1) throw new GovernanceTaskLeaseLostError(id, leaseOwner);
    const updated = await this.getTask(id);
    await this.recordTaskEvent(updated, taskEventType(status));
    return updated;
  }

  private async completeTask(id: number, status: string, result: Record<string, unknown>, leaseOwner: string) {
    const task = await this.getTask(id);
    const log = Array.isArray(task.transitionLog) ? task.transitionLog : [];
    const now = new Date();
    const claim = await this.prisma.brainGovernanceTask.updateMany({
      where: {
        id,
        leaseOwner,
        status: { in: ['validating', 'classifying', 'evaluating'] },
        leaseExpiresAt: { gt: now },
      },
      data: {
        status,
        result: this.json(result),
        blockerType: 'none',
        blockerCode: null,
        resolutionType: null,
        transitionLog: this.json([...log, { status, at: now.toISOString() }]),
        completedAt: ['approved', 'rejected', 'revision_required', 'failed', 'cancelled'].includes(status) ? now : null,
        leaseOwner: null,
        leasedAt: null,
        leaseExpiresAt: null,
      },
    });
    if (claim.count !== 1) throw new GovernanceTaskLeaseLostError(id, leaseOwner);
    const updated = await this.getTask(id);
    await this.recordTaskEvent(updated, taskEventType(status), result);
    return updated;
  }

  private async blockTask(id: number, blockerType: string, blockerCode: string, resolutionType: string, leaseOwner: string) {
    const task = await this.getTask(id);
    const log = Array.isArray(task.transitionLog) ? task.transitionLog : [];
    const now = new Date();
    const claim = await this.prisma.brainGovernanceTask.updateMany({
      where: {
        id,
        leaseOwner,
        status: { in: ['validating', 'classifying', 'evaluating'] },
        leaseExpiresAt: { gt: now },
      },
      data: {
        status: 'revision_required',
        result: this.json({ blockingReason: blockerCode, blockerType, resolutionType }),
        blockerType,
        blockerCode,
        resolutionType,
        attemptCount: { decrement: 1 },
        transitionLog: this.json([...log, { status: 'revision_required', at: now.toISOString(), blockerType, blockerCode }]),
        completedAt: now,
        leaseOwner: null,
        leasedAt: null,
        leaseExpiresAt: null,
      },
    });
    if (claim.count !== 1) throw new GovernanceTaskLeaseLostError(id, leaseOwner);
    const updated = await this.getTask(id);
    await this.recordTaskEvent(updated, blockerType === 'evidence' ? 'task_waiting_evidence' : 'task_revision_required', {
      blockerType,
      blockerCode,
      resolutionType,
    });
    return updated;
  }

  private async recordTaskEvent(
    task: { id: number; candidateId?: number | null; resourceKey?: string | null; status?: string },
    eventType: string,
    payload: Record<string, unknown> = {},
  ) {
    await this.events?.record({
      candidateId: task.candidateId ?? null,
      eventType,
      entityType: 'governance_task',
      entityId: task.id,
      actorType: 'system',
      payload: { resourceKey: task.resourceKey ?? null, status: task.status ?? null, ...payload },
    });
  }

  private async rescheduleEvidenceBlockedTasks(
    receiptId: number,
    candidateId: number | null,
    stage: string,
    capabilities: string[],
    actorId: number,
  ) {
    if (!capabilities.length) return [];
    const blocked = await this.prisma.brainGovernanceTask.findMany({
      where: {
        taskType: 'evaluate',
        stage,
        resourceKey: { in: capabilities },
        status: 'revision_required',
        OR: [
          { blockerType: 'evidence', blockerCode: 'valid_gate_receipt_missing' },
          { result: { path: ['blockingReason'], equals: 'valid_gate_receipt_missing' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    const blockedByCapability = new Map<string, typeof blocked>();
    for (const task of blocked) {
      if (!task.resourceKey) continue;
      const current = blockedByCapability.get(task.resourceKey) ?? [];
      current.push(task);
      blockedByCapability.set(task.resourceKey, current);
    }
    const taskIds: number[] = [];
    for (const capabilityKey of capabilities) {
      const current = await this.latestPolicy(capabilityKey);
      if (!current || current.policy.riskLevel === 'unclassified') continue;
      const next = await this.createTask({
        taskType: 'evaluate',
        stage,
        resourceKey: capabilityKey,
        riskLevel: current.policy.riskLevel,
        payload: {
          capabilityKey,
          stage,
          policyVersionId: current.id,
          policyChecksum: current.checksum,
          candidateId,
          receiptId,
        },
        actorId: blockedByCapability.get(capabilityKey)?.[0]?.createdBy || actorId,
        candidateId: candidateId ?? undefined,
        receiptId,
      });
      for (const task of blockedByCapability.get(capabilityKey) ?? []) {
        if (next.id === task.id) continue;
        await this.prisma.brainGovernanceTask.update({
          where: { id: task.id },
          data: { supersededByTaskId: next.id },
        });
      }
      taskIds.push(next.id);
    }
    if (candidateId && taskIds.length) {
      await this.prisma.brainGovernanceCandidate.update({
        where: { id: candidateId },
        data: { status: 'governing' },
      });
    }
    return taskIds;
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

  private capabilityPolicyWhere(input: { search?: string; riskLevel?: string; mode?: string; whitelistStatus?: string; runtimeStatus?: string; status?: string; owner?: string }): Prisma.BrainResourceVersionWhereInput {
    const filters: Prisma.BrainResourceVersionWhereInput[] = [{
      resourceType: 'capability_policy',
      ...(input.status ? { status: input.status } : {}),
      ...(input.search ? { resourceKey: { contains: input.search, mode: 'insensitive' } } : {}),
    }];
    if (input.riskLevel) filters.push({ snapshot: { path: ['riskLevel'], equals: input.riskLevel } });
    if (input.mode) filters.push({ snapshot: { path: ['mode'], equals: input.mode } });
    if (input.whitelistStatus) filters.push({ snapshot: { path: ['whitelistStatus'], equals: input.whitelistStatus } });
    if (input.runtimeStatus) filters.push({ snapshot: { path: ['runtimeEnforcementStatus'], equals: input.runtimeStatus } });
    if (input.owner) {
      const ownerValues: Prisma.InputJsonValue[] = [input.owner];
      const numericOwner = Number(input.owner);
      if (Number.isInteger(numericOwner) && numericOwner > 0) ownerValues.push(numericOwner);
      filters.push({
        OR: ['owner', 'primary', 'product', 'businessOwner', 'technicalOwner', 'team', 'userId'].flatMap((key) =>
          ownerValues.map((value) => ({ snapshot: { path: ['owners', key], equals: value } }))),
      });
    }
    return { AND: filters };
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

class GovernanceTaskLeaseLostError extends Error {
  constructor(id: number, leaseOwner: string) {
    super(`governance_task_lease_lost:${id}:${leaseOwner}`);
    this.name = 'GovernanceTaskLeaseLostError';
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

function optionalPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionalHash64(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return hash64(value, 'optionalHash64');
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

function taskEventType(status: string): string {
  if (status === 'pending_approval') return 'task_pending_approval';
  if (status === 'approved') return 'task_approved';
  if (status === 'rejected') return 'task_rejected';
  if (status === 'failed') return 'task_failed';
  if (status === 'cancelled') return 'task_cancelled';
  if (status === 'revision_required') return 'task_revision_required';
  return 'task_status_changed';
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

function queryOnlyPolicyVersionMatches(existing: Prisma.JsonValue, expected: CapabilityPolicySnapshot): boolean {
  const current = record(existing);
  const { updatedAt: _currentUpdatedAt, ...currentIdentity } = current;
  const { updatedAt: _expectedUpdatedAt, ...expectedIdentity } = expected;
  return stableJson(currentIdentity) === stableJson(expectedIdentity);
}

function assertReusablePolicySnapshot(
  release: { scope: string; status: string; items: Array<{ resourceVersionId: number }> },
  expectedResourceVersionIds: number[],
) {
  const actual = [...new Set(release.items.map((item) => item.resourceVersionId))].sort((left, right) => left - right);
  const expected = [...new Set(expectedResourceVersionIds)].sort((left, right) => left - right);
  const matches = actual.length === expected.length && actual.every((id, index) => id === expected[index]);
  if (release.scope !== 'governance_policy' || !['draft', 'active'].includes(release.status) || !matches) {
    throw new ConflictException('policy_snapshot_release_key_conflict');
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
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

function warmupCacheStatus(status: BrainActiveReleaseWarmupStatus): 'cold' | 'partial' | 'warm' {
  if (status.releases.length === 0) return 'cold';
  const persistentCount = status.releases.filter((release) => release.artifactSource === 'persistent').length;
  if (persistentCount === status.releases.length) return 'warm';
  return persistentCount > 0 ? 'partial' : 'cold';
}

function warmupArtifactSource(
  status: BrainActiveReleaseWarmupStatus,
): 'persistent' | 'computed' | 'memory' | 'mixed' | 'none' {
  const sources = new Set(status.releases.map((release) => release.artifactSource));
  if (sources.size === 0) return 'none';
  if (sources.size > 1) return 'mixed';
  return [...sources][0] ?? 'none';
}

function warmupFailureCategory(
  failureReason: string | null,
): 'database' | 'lineage' | 'validation' | 'system' | null {
  if (!failureReason) return null;
  const reason = failureReason.toLowerCase();
  if (
    ['timeout exceeded when trying to connect', 'connection', 'too many clients', 'remaining connection slots', 'socket']
      .some((fragment) => reason.includes(fragment))
  ) return 'database';
  if (['lineage', 'definition_refs_missing', 'definition_version', 'fingerprint'].some((fragment) => reason.includes(fragment))) {
    return 'lineage';
  }
  if (['validation', 'catalog_invalid', 'checksum', 'status_invalid', 'mode_invalid'].some((fragment) => reason.includes(fragment))) {
    return 'validation';
  }
  return 'system';
}

function policySnapshotChecksum(versions: Array<{ resourceKey: string; version: number; checksum: string }>): string {
  return sha256(versions.map((item) => ({ resourceKey: item.resourceKey, version: item.version, checksum: item.checksum })).sort((left, right) => left.resourceKey.localeCompare(right.resourceKey)));
}

function extractReceiptCapabilities(value: Record<string, unknown>): string[] {
  return uniqueStrings(record(value.plan).capabilities);
}

function extractReceiptGates(value: Record<string, unknown>, expiresAt: Date) {
  return (Array.isArray(value.results) ? value.results : [])
    .filter(isRecord)
    .map((result) => {
      const gateKey = optionalString(result.gateKey ?? result.gateId);
      if (!gateKey) return null;
      const command = Array.isArray(result.command) ? result.command : [];
      return {
        gateKey,
        status: optionalString(result.status) ?? 'unknown',
        inputChecksum: optionalHash64(result.inputChecksum) ?? sha256({ gateKey, command }),
        resultChecksum: optionalHash64(result.resultChecksum) ?? sha256(result),
        commandChecksum: sha256(command),
        durationMs: optionalPositiveInteger(result.durationMs),
        modelInvocationCount: Math.max(0, Number.isInteger(Number(result.modelInvocationCount)) ? Number(result.modelInvocationCount) : 0),
        artifactUri: optionalString(result.artifactUri),
        expiresAt,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
