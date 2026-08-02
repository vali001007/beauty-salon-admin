import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainGovernanceControlPlaneService } from './brain-governance-control-plane.service.js';
import { BrainGovernanceEventService } from './brain-governance-event.service.js';

const BLOCKING_TASK_STATUSES = [
  'pending',
  'validating',
  'classifying',
  'evaluating',
  'pending_approval',
  'revision_required',
  'failed',
] as const;

@Injectable()
export class BrainGovernancePolicyOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlane: BrainGovernanceControlPlaneService,
    private readonly events?: BrainGovernanceEventService,
  ) {}

  async preview(candidateKey: string) {
    const candidate = await this.prisma.brainGovernanceCandidate.findUnique({
      where: { candidateKey },
      include: {
        receipts: { select: { capabilities: { select: { capabilityKey: true } } } },
        tasks: {
          where: { status: { in: [...BLOCKING_TASK_STATUSES] } },
          select: { id: true, resourceKey: true, status: true, blockerCode: true },
        },
        policySnapshot: { include: { items: true } },
      },
    });
    if (!candidate) throw new NotFoundException('brain_governance_candidate_not_found');
    const active = await this.prisma.brainRelease.findFirst({
      where: { scope: 'governance_policy', status: 'active' },
      orderBy: { activatedAt: 'desc' },
      include: { items: true },
    });
    const policies = await this.latestPolicies();
    const affectedCapabilities = [...new Set(candidate.receipts.flatMap((receipt) =>
      receipt.capabilities.map((item) => item.capabilityKey)))].sort();
    const policyByKey = new Map(policies.map((policy) => [policy.resourceKey, policy]));
    const capabilityBlockers = affectedCapabilities.flatMap((capabilityKey) => {
      const policy = policyByKey.get(capabilityKey);
      if (!policy) return [{ code: 'capability_policy_missing', capabilityKey }];
      const snapshot = jsonRecord(policy.snapshot);
      if (snapshot.riskLevel === 'unclassified') return [{ code: 'risk_classification_required', capabilityKey }];
      const evidence = Array.isArray(snapshot.evidence) ? snapshot.evidence.map(jsonRecord) : [];
      const hasValidEvidence = evidence.some((item) => {
        const expiresAt = Date.parse(String(item.expiresAt ?? ''));
        return Number.isFinite(expiresAt) && expiresAt > Date.now();
      });
      if (!hasValidEvidence) return [{ code: 'valid_gate_receipt_missing', capabilityKey }];
      const riskLevel = String(snapshot.riskLevel ?? '');
      const whitelistStatus = String(snapshot.whitelistStatus ?? '');
      if (['low', 'medium'].includes(riskLevel) && whitelistStatus !== 'approved') {
        return [{ code: 'capability_approval_required', capabilityKey }];
      }
      if (['high', 'critical'].includes(riskLevel) && whitelistStatus !== 'not_allowed') {
        return [{ code: 'high_risk_whitelist_invalid', capabilityKey }];
      }
      return [];
    });
    const taskBlockers = (candidate.tasks ?? []).map((task) => ({
      code: task.blockerCode || `governance_task_${task.status}`,
      capabilityKey: task.resourceKey,
      taskId: task.id,
    }));
    const blockers = [...capabilityBlockers, ...taskBlockers];
    const diff = diffItems(active?.items ?? [], policies);
    const decision = blockers.length ? 'blocked' : diff.hasDiff ? 'create_snapshot' : 'reuse_active';
    return {
      candidate: {
        id: candidate.id,
        candidateKey: candidate.candidateKey,
        headCommit: candidate.headCommit,
        status: candidate.status,
      },
      decision,
      activeSnapshot: active,
      preparedSnapshot: candidate.policySnapshot,
      affectedCapabilities,
      diff,
      blockers,
      resourceVersionIds: policies.map((item) => item.id),
    };
  }

  async prepare(input: { candidateKey: string; actorId: number; note?: string }) {
    const preview = await this.preview(input.candidateKey);
    if (preview.decision === 'blocked') return { ...preview, snapshot: null };
    if (preview.decision === 'reuse_active') {
      if (!preview.activeSnapshot) throw new BadRequestException('active_policy_snapshot_missing');
      await this.prisma.brainGovernanceCandidate.update({
        where: { id: preview.candidate.id },
        data: { status: 'ready', policyDecision: 'reuse_active', policySnapshotId: preview.activeSnapshot.id },
      });
      await this.events?.record({
        candidateId: preview.candidate.id,
        eventType: 'policy_reused',
        entityType: 'policy_snapshot',
        entityId: preview.activeSnapshot.id,
        actorType: 'user',
        actorId: input.actorId,
        payload: { candidateKey: input.candidateKey, decision: 'reuse_active' },
      });
      return { ...preview, snapshot: preview.activeSnapshot };
    }
    if (preview.preparedSnapshot?.status === 'draft') {
      return { ...preview, decision: 'created', snapshot: preview.preparedSnapshot };
    }
    const releaseKey = `governance-candidate-${preview.candidate.id}-${preview.candidate.headCommit.slice(0, 12)}`;
    const existing = await this.prisma.brainRelease.findUnique({ where: { releaseKey }, include: { items: true } });
    const snapshot = existing ?? await this.controlPlane.createPolicySnapshot({
      releaseKey,
      resourceVersionIds: preview.resourceVersionIds,
      note: input.note ?? `candidate:${preview.candidate.candidateKey}`,
      actorId: input.actorId,
    });
    await this.prisma.brainGovernanceCandidate.update({
      where: { id: preview.candidate.id },
      data: { policyDecision: 'create_snapshot', policySnapshotId: snapshot.id },
    });
    await this.events?.record({
      candidateId: preview.candidate.id,
      eventType: 'policy_prepared',
      entityType: 'policy_snapshot',
      entityId: snapshot.id,
      actorType: 'user',
      actorId: input.actorId,
      payload: { candidateKey: input.candidateKey, releaseKey: snapshot.releaseKey },
    });
    return { ...preview, decision: 'created', snapshot };
  }

  async diffSnapshot(id: number) {
    const snapshot = await this.prisma.brainRelease.findFirst({
      where: { id, scope: 'governance_policy' },
      include: { items: true },
    });
    if (!snapshot) throw new NotFoundException('policy_snapshot_not_found');
    const previous = snapshot.previousReleaseId
      ? await this.prisma.brainRelease.findFirst({ where: { id: snapshot.previousReleaseId, scope: 'governance_policy' }, include: { items: true } })
      : null;
    return {
      snapshotId: snapshot.id,
      previousSnapshotId: previous?.id ?? null,
      ...diffReleaseItems(previous?.items ?? [], snapshot.items),
    };
  }

  private async latestPolicies() {
    const rows = await this.prisma.brainResourceVersion.findMany({
      where: { resourceType: 'capability_policy', status: { in: ['draft', 'active'] } },
      orderBy: [{ resourceKey: 'asc' }, { version: 'desc' }],
    });
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.resourceKey)) return false;
      seen.add(row.resourceKey);
      return true;
    });
  }
}

function diffItems(
  activeItems: Array<{ resourceKey: string; resourceVersionId: number; snapshot: Prisma.JsonValue }>,
  policies: Array<{ id: number; resourceKey: string; version: number; snapshot: Prisma.JsonValue }>,
) {
  const activeByKey = new Map(activeItems.map((item) => [item.resourceKey, item]));
  const currentKeys = new Set(policies.map((item) => item.resourceKey));
  const added: Array<Record<string, unknown>> = [];
  const changed: Array<Record<string, unknown>> = [];
  const unchanged: Array<Record<string, unknown>> = [];
  for (const policy of policies) {
    const active = activeByKey.get(policy.resourceKey);
    const entry = { capabilityKey: policy.resourceKey, resourceVersionId: policy.id, version: policy.version };
    if (!active) added.push(entry);
    else if (active.resourceVersionId !== policy.id) changed.push({ ...entry, previousResourceVersionId: active.resourceVersionId });
    else unchanged.push(entry);
  }
  const removed = activeItems.filter((item) => !currentKeys.has(item.resourceKey)).map((item) => ({ capabilityKey: item.resourceKey, previousResourceVersionId: item.resourceVersionId }));
  return { added, changed, removed, unchanged, hasDiff: Boolean(added.length || changed.length || removed.length) };
}

function diffReleaseItems(
  previous: Array<{ resourceKey: string; resourceVersionId: number }>,
  current: Array<{ resourceKey: string; resourceVersionId: number }>,
) {
  const previousByKey = new Map(previous.map((item) => [item.resourceKey, item.resourceVersionId]));
  const currentKeys = new Set(current.map((item) => item.resourceKey));
  const added = current.filter((item) => !previousByKey.has(item.resourceKey));
  const changed = current.filter((item) => previousByKey.has(item.resourceKey) && previousByKey.get(item.resourceKey) !== item.resourceVersionId);
  const unchanged = current.filter((item) => previousByKey.get(item.resourceKey) === item.resourceVersionId);
  const removed = previous.filter((item) => !currentKeys.has(item.resourceKey));
  return { added, changed, removed, unchanged, hasDiff: Boolean(added.length || changed.length || removed.length) };
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
