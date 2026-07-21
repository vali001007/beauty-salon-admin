import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assertGeneratedCapabilityContract, type BrainCapabilityGenerationProposal } from '../capability/brain-capability-codegen.service.js';
import { BrainCapabilityCodegenService } from '../capability/brain-capability-codegen.service.js';
import { BrainCapabilityGenerationGateService } from '../capability/brain-capability-generation-gate.service.js';
import { BrainCapabilityScannerService } from '../capability/brain-capability-scanner.service.js';
import type { BrainCapabilityCandidate, BrainCapabilityScanReport } from '../capability/brain-capability-scan.types.js';
import { BrainCapabilitySemanticVerifierService } from '../capability/brain-capability-semantic-verifier.service.js';
import { BrainGeneratedCapabilityDraftService } from '../capability/brain-generated-capability-draft.service.js';
import { BrainCapabilityGovernancePolicyService, type BrainCapabilityInferredChanges } from './brain-capability-governance-policy.service.js';

export interface BrainCapabilityRegenerationExecutionResult {
  status: 'completed' | 'blocked';
  report: Record<string, unknown>;
  generatedResourceVersionIds: number[];
}

export type BrainCapabilityRegenerationJobStatus = 'queued' | 'leased' | 'retry_scheduled' | 'completed' | 'blocked' | 'dead_letter';

export interface BrainCapabilityRegenerationPublicJob {
  id: number;
  releaseId: number;
  status: BrainCapabilityRegenerationJobStatus;
  progress: number;
  affectedCapabilities: string[];
  staticGatesPassed: number;
  contractCompileSecurity: string[];
  risk: Record<string, unknown>;
  blockingReasons: string[];
  generatedResourceVersionIds: number[];
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  nextAction: 'retry' | 'modify_requirement' | 'complete_business_definition' | 'none';
  availableAt: string | null;
  leasedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

@Injectable()
export class BrainCapabilityRegenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scanner: BrainCapabilityScannerService,
    private readonly codegen: BrainCapabilityCodegenService,
    private readonly policy: BrainCapabilityGovernancePolicyService,
    private readonly semanticVerifier: BrainCapabilitySemanticVerifierService,
    private readonly gates: BrainCapabilityGenerationGateService,
    private readonly drafts: BrainGeneratedCapabilityDraftService,
  ) {}

  async executeJob(jobId: number, leaseOwner: string, workspaceRoot: string): Promise<BrainCapabilityRegenerationExecutionResult> {
    const job = await this.prisma.brainCapabilityRegenerationJob.findUnique({
      where: { id: jobId },
      include: { release: { include: { items: true } }, requestVersion: true },
    });
    if (!job) throw new NotFoundException('regeneration_job_not_found');
    if (job.requestVersion.resourceType !== 'capability_change_request') throw new BadRequestException('regeneration_request_version_invalid');
    const affectedCapabilities = strings(job.affectedCapabilities);
    if (!affectedCapabilities.length) return this.blocked([], ['affected_capability_ambiguous']);

    const scanned = await this.scanner.scan({ workspaceRoot, explicitOnly: true });
    const byKey = new Map(scanned.capabilities.map((item) => [item.key, item]));
    const missing = affectedCapabilities.filter((key) => !byKey.has(key));
    if (missing.length) return this.blocked(affectedCapabilities, ['affected_capability_not_found', ...missing.map((key) => `affected_capability_not_found:${key}`)]);
    const capabilities = affectedCapabilities.map((key) => byKey.get(key)!);
    const generated = await this.codegen.generate({
      scan: this.filteredScan(scanned, capabilities),
      workspaceRoot,
      generationMode: 'published_registry',
    });
    if (generated.blocked.length) return this.blocked(affectedCapabilities, generated.blocked.flatMap((item) => item.reasons));
    const proposalByKey = new Map(generated.proposals.map((item) => [item.capabilityKey, item]));
    const prepared: Array<{ capability: BrainCapabilityCandidate; proposal: BrainCapabilityGenerationProposal; risk: Record<string, unknown>; staticGatesPassed: number; gates: string[] }> = [];

    for (const capability of capabilities) {
      await this.renewLease(job.id, leaseOwner);
      const proposal = proposalByKey.get(capability.key);
      if (!proposal) return this.blocked(affectedCapabilities, [`capability_proposal_missing:${capability.key}`]);
      const policyResult = this.policy.apply({
        capability,
        proposal,
        requirement: job.requirement,
        inferredChanges: record(job.inferredChanges) as unknown as BrainCapabilityInferredChanges,
      });
      if (policyResult.status === 'blocked') return this.blocked(affectedCapabilities, policyResult.reasons, policyResult.riskReport);
      try {
        assertGeneratedCapabilityContract(policyResult.proposal.contractArtifact);
        await this.semanticVerifier.verifyProposal(policyResult.proposal);
        const gateReport = await this.gates.evaluate({ capability: policyResult.capability, proposal: policyResult.proposal, workspaceRoot });
        if (!gateReport.passed) return this.blocked(affectedCapabilities, gateReport.gates.filter((gate) => !gate.passed).flatMap((gate) => gate.reasons), policyResult.riskReport);
        prepared.push({
          capability: policyResult.capability,
          proposal: policyResult.proposal,
          risk: policyResult.riskReport,
          staticGatesPassed: gateReport.gates.filter((gate) => gate.passed).length,
          gates: gateReport.gates.filter((gate) => gate.passed).map((gate) => gate.gate),
        });
      } catch (error) {
        return this.blocked(affectedCapabilities, [publicErrorMessage(error)], policyResult.riskReport);
      }
    }

    const versions = [];
    for (const item of prepared) {
      await this.renewLease(job.id, leaseOwner);
      versions.push(await this.drafts.createDraft({ proposal: item.proposal, createdBy: job.createdBy, generatedByJobId: job.id, leaseOwner, workspaceRoot }));
    }
    return {
      status: 'completed',
      generatedResourceVersionIds: versions.map((item) => item.id),
      report: {
        progress: 100,
        affectedCapabilities,
        staticGatesPassed: prepared.reduce((sum, item) => sum + item.staticGatesPassed, 0),
        contractCompileSecurity: unique(prepared.flatMap((item) => item.gates)).filter((gate) => ['contract', 'compile', 'security'].includes(gate)),
        risk: { overall: highestRisk(prepared.map((item) => String(item.risk.overall ?? 'low'))), items: prepared.map((item) => ({ capabilityKey: item.capability.key, ...item.risk })) },
        blockingReasons: [],
        nextStep: 'create_new_release',
      },
    };
  }

  async listPublicJobs(releaseId?: number) {
    const jobs = await this.prisma.brainCapabilityRegenerationJob.findMany({ where: releaseId ? { releaseId } : undefined, orderBy: { createdAt: 'desc' }, take: 100 });
    return { items: jobs.map((job) => this.toPublicJob(job)) };
  }

  async getPublicJob(id: number) {
    const job = await this.prisma.brainCapabilityRegenerationJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('regeneration_job_not_found');
    return this.toPublicJob(job);
  }

  async retryJob(id: number) {
    const job = await this.prisma.brainCapabilityRegenerationJob.findUnique({ where: { id } });
    if (!job || !retryDisposition(job as unknown as Record<string, unknown>).retryable) {
      throw new BadRequestException('regeneration_job_not_retryable');
    }
    const result = await this.prisma.brainCapabilityRegenerationJob.updateMany({
      where: { id, status: { in: ['blocked', 'dead_letter'] } },
      data: {
        status: 'queued', attemptCount: 0, availableAt: new Date(), leasedAt: null, leaseExpiresAt: null, leaseOwner: null,
        errorCode: null, errorMessage: null, report: Prisma.DbNull, generatedResourceVersionIds: this.json([]), completedAt: null,
      },
    });
    if (result.count !== 1) throw new BadRequestException('regeneration_job_not_retryable');
    return this.getPublicJob(id);
  }

  toPublicJob(job: Record<string, unknown>): BrainCapabilityRegenerationPublicJob {
    const report = record(job.report);
    const disposition = retryDisposition(job);
    return {
      id: number(job.id), releaseId: number(job.releaseId), status: publicStatus(job.status),
      progress: Number(report.progress ?? progressForStatus(String(job.status ?? ''))),
      affectedCapabilities: strings(job.affectedCapabilities),
      staticGatesPassed: Number(report.staticGatesPassed ?? 0),
      contractCompileSecurity: strings(report.contractCompileSecurity),
      risk: publicRecord(report.risk, ['overall', 'summary', 'items']),
      blockingReasons: strings(report.blockingReasons).map(publicErrorMessage),
      errorCode: safeCode(job.errorCode),
      errorMessage: job.errorMessage ? publicErrorMessage(job.errorMessage) : null,
      retryable: disposition.retryable,
      nextAction: disposition.nextAction,
      generatedResourceVersionIds: numbers(job.generatedResourceVersionIds),
      availableAt: iso(job.availableAt), leasedAt: iso(job.leasedAt), completedAt: iso(job.completedAt), createdAt: iso(job.createdAt), updatedAt: iso(job.updatedAt),
    };
  }

  private async renewLease(id: number, leaseOwner: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      UPDATE "brain_capability_regeneration_job"
      SET "leaseExpiresAt" = NOW() + INTERVAL '5 minutes',
          "updatedAt" = NOW()
      WHERE "id" = ${id}
        AND "leaseOwner" = ${leaseOwner}
        AND "status" = 'leased'
        AND "leaseExpiresAt" > NOW()
      RETURNING "id"
    `);
    if (rows.length !== 1) throw new ConflictException('regeneration_lease_lost');
  }

  private blocked(affectedCapabilities: string[], reasons: string[], risk: Record<string, unknown> = { overall: 'blocked' }): BrainCapabilityRegenerationExecutionResult {
    return { status: 'blocked', generatedResourceVersionIds: [], report: {
      progress: 100, affectedCapabilities, staticGatesPassed: 0, contractCompileSecurity: [], risk,
      blockingReasons: unique(reasons.map(publicErrorMessage)), nextStep: 'modify_or_retry',
    } };
  }

  private filteredScan(source: BrainCapabilityScanReport, capabilities: BrainCapabilityCandidate[]): BrainCapabilityScanReport {
    return { ...source, capabilities, summary: {
      total: capabilities.length,
      draft: capabilities.filter((item) => item.status === 'draft').length,
      blocked: capabilities.filter((item) => item.status === 'blocked').length,
      explicit: capabilities.filter((item) => item.explicit).length,
    } };
  }

  private json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
}

export function publicErrorMessage(value: unknown): string {
  const text = typeof value === 'string' ? value : value instanceof Error ? value.message : String(value ?? '');
  return text
    .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s:]+[\\/])+[^\s:]+(?::\d+(?::\d+)?)?/g, '[internal path]')
    .replace(/\bTS\d{4}\b[^\r\n]*/g, '[internal diagnostic]')
    .replace(/\s+at\s+[^\r\n]+/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function numbers(value: unknown): number[] { return Array.isArray(value) ? value.map(Number).filter(Number.isInteger) : []; }
function number(value: unknown): number { return Number(value); }
function iso(value: unknown): string | null { return value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null; }
function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
function safeCode(value: unknown): string | null { return typeof value === 'string' && /^[a-z0-9_:-]{1,80}$/i.test(value) ? value : null; }
function publicStatus(value: unknown): BrainCapabilityRegenerationJobStatus {
  const status = String(value ?? '');
  return ['queued', 'leased', 'retry_scheduled', 'completed', 'blocked', 'dead_letter'].includes(status)
    ? status as BrainCapabilityRegenerationJobStatus
    : 'blocked';
}
function highestRisk(values: string[]): string { const order = ['low', 'medium', 'high', 'critical', 'blocked']; return values.reduce((current, value) => order.indexOf(value) > order.indexOf(current) ? value : current, 'low'); }
function progressForStatus(status: string): number { return ['completed', 'blocked', 'dead_letter'].includes(status) ? 100 : status === 'leased' ? 50 : 0; }
function publicRecord(value: unknown, keys: string[]): Record<string, unknown> { const source = record(value); return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]])); }

const PERMANENT_REGENERATION_ERROR_CODES = new Set([
  'business_definition_change_pending',
  'business_definition_registry_failed',
  'affected_capability_ambiguous',
]);

function retryDisposition(job: Record<string, unknown>): {
  retryable: boolean;
  nextAction: BrainCapabilityRegenerationPublicJob['nextAction'];
} {
  const status = publicStatus(job.status);
  const errorCode = safeCode(job.errorCode);
  const affectedCapabilities = strings(job.affectedCapabilities);
  const blockingReasons = strings(record(job.report).blockingReasons);
  if (status === 'completed') return { retryable: false, nextAction: 'none' };
  if (errorCode === 'business_definition_change_pending' || errorCode === 'business_definition_registry_failed') {
    return { retryable: false, nextAction: 'complete_business_definition' };
  }
  if (
    errorCode === 'affected_capability_ambiguous'
    || affectedCapabilities.length === 0
    || blockingReasons.some(isPermanentPolicyBlocker)
  ) {
    return { retryable: false, nextAction: 'modify_requirement' };
  }
  if (PERMANENT_REGENERATION_ERROR_CODES.has(errorCode ?? '')) {
    return { retryable: false, nextAction: 'modify_requirement' };
  }
  if (status === 'blocked' || status === 'dead_letter') return { retryable: true, nextAction: 'retry' };
  return { retryable: false, nextAction: 'none' };
}

function isPermanentPolicyBlocker(reason: string): boolean {
  return reason.startsWith('prohibited_request:')
    || reason.startsWith('requirement_interpretation_')
    || reason === 'requirement_no_supported_change'
    || reason === 'runtime_redaction_policy_unavailable'
    || reason === 'runtime_confirmation_policy_unavailable'
    || reason === 'additional_permission_invalid'
    || reason === 'rollout_percentage_invalid'
    || reason.endsWith('_forbidden');
}
