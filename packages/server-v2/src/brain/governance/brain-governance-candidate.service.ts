import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainGovernanceEventService } from './brain-governance-event.service.js';

const HASH_64 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{7,64}$/;
const CANDIDATE_STATUSES = [
  'collecting',
  'checking',
  'governing',
  'ready',
  'blocked',
  'releasing',
  'observing',
  'completed',
  'superseded',
] as const;

export interface BrainGovernanceCandidateIdentity {
  candidateKey: string;
  repository: string;
  eventName: string;
  branch?: string | null;
  baseCommit: string;
  mergeBaseCommit: string;
  headCommit: string;
  changedFilesChecksum: string;
  diffChecksum: string;
  sourceFingerprint: string;
  riskLevel: string;
}

@Injectable()
export class BrainGovernanceCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events?: BrainGovernanceEventService,
  ) {}

  async upsertFromReceipt(receipt: Record<string, unknown>) {
    return this.upsert({
      candidateKey: requiredString(receipt.candidateKey, 'candidate_key_missing'),
      repository: requiredString(receipt.repository, 'candidate_repository_missing'),
      eventName: requiredString(receipt.eventName, 'candidate_event_name_missing'),
      branch: optionalString(receipt.branch),
      baseCommit: commit(receipt.baseCommit, 'candidate_base_commit_invalid'),
      mergeBaseCommit: commit(receipt.mergeBaseCommit, 'candidate_merge_base_commit_invalid'),
      headCommit: commit(receipt.headCommit, 'candidate_head_commit_invalid'),
      changedFilesChecksum: hash(receipt.changedFilesChecksum, 'candidate_changed_files_checksum_invalid'),
      diffChecksum: hash(receipt.diffChecksum, 'candidate_diff_checksum_invalid'),
      sourceFingerprint: hash(receipt.sourceFingerprint, 'candidate_source_fingerprint_invalid'),
      riskLevel: requiredString(receipt.riskLevel, 'candidate_risk_level_missing'),
    });
  }

  async bindVerifiedReleaseReceipt(receipt: Record<string, unknown>) {
    const candidateKey = requiredString(receipt.candidateKey, 'candidate_key_missing');
    const candidate = await this.prisma.brainGovernanceCandidate.findUnique({ where: { candidateKey } });
    if (!candidate) throw new NotFoundException('brain_governance_candidate_not_found');
    const identity = {
      repository: requiredString(receipt.repository, 'candidate_repository_missing'),
      branch: optionalString(receipt.branch),
      baseCommit: commit(receipt.baseCommit, 'candidate_base_commit_invalid'),
      mergeBaseCommit: commit(receipt.mergeBaseCommit, 'candidate_merge_base_commit_invalid'),
      headCommit: commit(receipt.headCommit, 'candidate_head_commit_invalid'),
      changedFilesChecksum: hash(receipt.changedFilesChecksum, 'candidate_changed_files_checksum_invalid'),
      diffChecksum: hash(receipt.diffChecksum, 'candidate_diff_checksum_invalid'),
      sourceFingerprint: hash(receipt.sourceFingerprint, 'candidate_source_fingerprint_invalid'),
    };
    if (
      candidate.repository !== identity.repository
      || (candidate.branch && identity.branch && candidate.branch !== identity.branch)
      || candidate.baseCommit !== identity.baseCommit
      || candidate.mergeBaseCommit !== identity.mergeBaseCommit
      || candidate.headCommit !== identity.headCommit
      || candidate.changedFilesChecksum !== identity.changedFilesChecksum
      || candidate.diffChecksum !== identity.diffChecksum
      || candidate.sourceFingerprint !== identity.sourceFingerprint
    ) throw new ConflictException('candidate_release_receipt_identity_conflict');
    if (candidate.status === 'superseded') throw new ConflictException('candidate_superseded');
    return candidate;
  }

  async upsert(input: BrainGovernanceCandidateIdentity) {
    const existing = await this.prisma.brainGovernanceCandidate.findUnique({
      where: { candidateKey: input.candidateKey },
    });
    if (existing && !sameIdentity(existing, input)) {
      throw new ConflictException('candidate_identity_conflict');
    }
    if (existing?.status === 'superseded') {
      throw new ConflictException('candidate_superseded');
    }

    if (input.branch) {
      await this.prisma.brainGovernanceCandidate.updateMany({
        where: {
          repository: input.repository,
          branch: input.branch,
          headCommit: { not: input.headCommit },
          status: { notIn: ['completed', 'superseded'] },
        },
        data: { status: 'superseded', completedAt: new Date() },
      });
    }

    const candidate = await this.prisma.brainGovernanceCandidate.upsert({
      where: { candidateKey: input.candidateKey },
      create: {
        ...input,
        status: 'checking',
      },
      update: {
        riskLevel: input.riskLevel,
        status: existing?.status ?? 'checking',
      },
    });
    if (!existing) {
      await this.events?.record({
        candidateId: candidate.id,
        eventType: 'candidate_created',
        entityType: 'candidate',
        entityId: candidate.id,
        actorType: input.eventName === 'pull_request' || input.eventName === 'push' ? 'ci' : 'service',
        payload: { candidateKey: candidate.candidateKey, headCommit: candidate.headCommit, branch: candidate.branch },
      });
    }
    await this.events?.record({
      candidateId: candidate.id,
      eventType: 'candidate_check_started',
      entityType: 'candidate',
      entityId: candidate.id,
      actorType: input.eventName === 'pull_request' || input.eventName === 'push' ? 'ci' : 'service',
      payload: { riskLevel: candidate.riskLevel, diffChecksum: candidate.diffChecksum },
    });
    return candidate;
  }

  async list(input: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    riskLevel?: string;
    branch?: string;
    createdFrom?: string;
    createdTo?: string;
  }) {
    const page = positive(input.page, 1);
    const pageSize = bounded(input.pageSize, 20, 100);
    const status = input.status && CANDIDATE_STATUSES.includes(input.status as typeof CANDIDATE_STATUSES[number])
      ? input.status
      : undefined;
    const where: Prisma.BrainGovernanceCandidateWhereInput = {
      ...(status ? { status } : {}),
      ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      ...(input.branch ? { branch: input.branch } : {}),
      ...dateRange(input.createdFrom, input.createdTo),
      ...(input.search ? {
        OR: [
          { candidateKey: { contains: input.search, mode: 'insensitive' as const } },
          { repository: { contains: input.search, mode: 'insensitive' as const } },
          { branch: { contains: input.search, mode: 'insensitive' as const } },
          { headCommit: { contains: input.search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.brainGovernanceCandidate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { receipts: true, tasks: true } },
          policySnapshot: { select: { id: true, releaseKey: true, status: true, activatedAt: true } },
        },
      }),
      this.prisma.brainGovernanceCandidate.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(candidateKey: string) {
    const candidate = await this.prisma.brainGovernanceCandidate.findUnique({
      where: { candidateKey },
      include: {
        policySnapshot: { select: { id: true, releaseKey: true, status: true, activatedAt: true } },
        rolloutSequence: {
          include: {
            releases: { orderBy: { id: 'asc' }, select: { id: true, releaseKey: true, status: true, rolloutStage: true, activatedAt: true } },
          },
        },
        receipts: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            receiptKey: true,
            stage: true,
            status: true,
            trustLevel: true,
            verificationStatus: true,
            verificationError: true,
            provider: true,
            model: true,
            createdAt: true,
            expiresAt: true,
            gates: { orderBy: { gateKey: 'asc' } },
            capabilities: { orderBy: { capabilityKey: 'asc' } },
          },
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            taskType: true,
            resourceKey: true,
            riskLevel: true,
            status: true,
            blockerType: true,
            blockerCode: true,
            resolutionType: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!candidate) throw new NotFoundException('brain_governance_candidate_not_found');
    const affectedCapabilities = [...new Set(candidate.receipts.flatMap((receipt) =>
      receipt.capabilities.map((item) => item.capabilityKey)))].sort();
    return {
      ...candidate,
      affectedCapabilities,
      blockers: candidate.tasks.filter((task) =>
        task.blockerType !== 'none' && !['approved', 'rejected', 'cancelled'].includes(task.status)),
      rolloutSequence: candidate.rolloutSequence,
    };
  }
}

function sameIdentity(
  existing: {
    repository: string;
    eventName: string;
    baseCommit: string;
    mergeBaseCommit: string;
    headCommit: string;
    changedFilesChecksum: string;
    diffChecksum: string;
    sourceFingerprint: string;
  },
  input: BrainGovernanceCandidateIdentity,
) {
  return existing.repository === input.repository
    && existing.eventName === input.eventName
    && existing.baseCommit === input.baseCommit
    && existing.mergeBaseCommit === input.mergeBaseCommit
    && existing.headCommit === input.headCommit
    && existing.changedFilesChecksum === input.changedFilesChecksum
    && existing.diffChecksum === input.diffChecksum
    && existing.sourceFingerprint === input.sourceFingerprint;
}

function dateRange(from?: string, to?: string): Prisma.BrainGovernanceCandidateWhereInput {
  const gte = optionalDate(from);
  const lte = optionalDate(to);
  return gte || lte ? { createdAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {};
}

function optionalDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function requiredString(value: unknown, code: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new ConflictException(code);
  return text;
}

function optionalString(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function hash(value: unknown, code: string) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!HASH_64.test(text)) throw new ConflictException(code);
  return text;
}

function commit(value: unknown, code: string) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!GIT_COMMIT.test(text)) throw new ConflictException(code);
  return text;
}

function positive(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function bounded(value: number | undefined, fallback: number, max: number) {
  return Math.min(positive(value, fallback), max);
}
