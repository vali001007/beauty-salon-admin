import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BusinessDefinitionRegistryService } from '../../semantic-data/business-definition-registry.service.js';
import {
  createReleaseFingerprint,
  lockReleaseResources,
  selectAffectedCapability,
} from './brain-capability-regeneration-fingerprint.js';
import {
  BrainCapabilityRegenerationService,
  publicErrorMessage,
} from './brain-capability-regeneration.service.js';
import { BrainCapabilityRequirementInterpreterService } from './brain-capability-requirement-interpreter.service.js';

@Injectable()
export class BrainGovernanceApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessDefinitions: BusinessDefinitionRegistryService,
    private readonly interpreter: BrainCapabilityRequirementInterpreterService,
    private readonly regeneration: BrainCapabilityRegenerationService,
  ) {}

  async submitModificationRequirement(input: { releaseId: number; requirement: string; createdBy: number }) {
    const requirement = this.normalizeRequirement(input.requirement);
    if (!requirement) throw new BadRequestException('modification_requirement_required');
    const initialRelease = await this.loadRelease(this.prisma, input.releaseId);
    if (!initialRelease || initialRelease.status !== 'draft') throw new BadRequestException('release_not_draft');
    if (this.requiresBusinessDefinitionChange(requirement)) {
      return this.submitBusinessDefinitionChange(initialRelease, requirement, input.createdBy);
    }

    const inferredChanges = await this.interpreter.interpret({ requirement, createdBy: input.createdBy });
    const created = await this.createStableRequest({
      initialRelease,
      requirement,
      createdBy: input.createdBy,
      requestType: 'capability_regeneration',
      inferredChanges,
    });
    const job = this.regeneration.toPublicJob(created.job as Record<string, unknown>);
    return {
      requestType: 'capability_regeneration' as const,
      status: job.status,
      request: requestSummary(created.request),
      job,
    };
  }

  private async submitBusinessDefinitionChange(
    initialRelease: ReleaseRecord,
    requirement: string,
    createdBy: number,
  ) {
    const created = await this.createStableRequest({
      initialRelease,
      requirement,
      createdBy,
      requestType: 'business_definition_change',
      inferredChanges: { requestedAreas: this.businessDefinitionAreas(requirement) },
    });
    const definitionKey = `change_request.brain.release_${initialRelease.id}.${created.idempotencyKey.slice(0, 16)}`;
    try {
      const draft = await this.businessDefinitions.createOrReuseDraft({
        definitionKey, kind: 'query_definition', domain: 'governance',
        name: `Ami Brain 业务口径变更请求 ${initialRelease.releaseKey}`,
        ownerType: 'ami_brain_release', ownerId: String(initialRelease.id), lifecycleStatus: 'candidate', schemaVersion: '1.0',
        payload: {
          requestType: 'business_definition_change_request', releaseId: initialRelease.id,
          releaseKey: initialRelease.releaseKey, requirement, requestedAreas: this.businessDefinitionAreas(requirement),
        },
        timezone: 'Asia/Shanghai', storeScope: { scope: 'governance_request' },
        evidence: [{ sourceType: 'governance_request', sourcePath: `brain/releases/${initialRelease.id}`, evidenceKind: 'user_modification_requirement', confidence: 1 }],
        createdBy, candidateDiagnostics: { source: 'ami_brain_governance', blockedReasons: [] },
      });
      await this.prisma.brainCapabilityRegenerationJob.update({
        where: { id: Number(created.job.id) },
        data: {
          errorCode: 'business_definition_change_pending',
          errorMessage: '业务口径修改待审批，旧发布已失效。',
          report: this.json(businessDefinitionReport(draft.id, definitionKey)),
        },
      });
      return {
        requestType: 'business_definition' as const,
        status: 'blocked' as const,
        request: requestSummary(created.request),
        draft,
        job: await this.regeneration.getPublicJob(Number(created.job.id)),
        redirectTo: `/system/business-definitions?definitionKey=${encodeURIComponent(definitionKey)}`,
      };
    } catch (error) {
      await this.prisma.brainCapabilityRegenerationJob.update({
        where: { id: Number(created.job.id) },
        data: {
          errorCode: 'business_definition_registry_failed',
          errorMessage: '业务口径草稿创建失败，请处理后重试。',
          report: this.json({
            ...businessDefinitionReport(null, definitionKey),
            blockingReasons: ['业务口径草稿创建失败，请处理后重试。'],
            registryError: publicErrorMessage(error),
          }),
        },
      });
      return {
        requestType: 'business_definition' as const,
        status: 'blocked' as const,
        request: requestSummary(created.request),
        draft: null,
        job: await this.regeneration.getPublicJob(Number(created.job.id)),
        redirectTo: `/system/business-definitions?definitionKey=${encodeURIComponent(definitionKey)}`,
      };
    }
  }

  private async createStableRequest(input: {
    initialRelease: ReleaseRecord;
    requirement: string;
    createdBy: number;
    requestType: 'capability_regeneration' | 'business_definition_change';
    inferredChanges: unknown;
  }) {
    let idempotencyKey = this.idempotencyKey(
      input.initialRelease.id,
      createReleaseFingerprint(input.initialRelease.items),
      input.requirement,
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockReleaseResources(tx, input.initialRelease.id);
        const release = await this.loadRelease(tx, input.initialRelease.id);
        if (!release || release.status !== 'draft') throw new BadRequestException('release_not_draft');
        const releaseFingerprint = createReleaseFingerprint(release.items);
        const affectedCapabilities = input.requestType === 'capability_regeneration'
          ? selectAffectedCapability(release.items, input.requirement)
          : [];
        const ambiguous = input.requestType === 'capability_regeneration' && affectedCapabilities.length !== 1;
        const businessDefinition = input.requestType === 'business_definition_change';
        idempotencyKey = this.idempotencyKey(release.id, releaseFingerprint, input.requirement);
        const resourceKey = `regeneration.${idempotencyKey}`;
        const snapshot = {
          requestType: input.requestType,
          releaseId: release.id,
          releaseKey: release.releaseKey,
          releaseFingerprint,
          affectedCapabilities,
          requirement: input.requirement,
          inferredChanges: input.inferredChanges,
          naturalLanguageOnly: true,
          approvalActions: ['approve', 'modify', 'reject'],
        };
        const request = await tx.brainResourceVersion.create({
          data: {
            resourceType: 'capability_change_request', resourceKey, version: 1, status: 'draft',
            snapshot: this.json(snapshot), checksum: this.sha256(snapshot), sourceResourceId: null, createdBy: input.createdBy,
          },
        });
        const errorCode = businessDefinition
          ? 'business_definition_change_pending'
          : ambiguous ? 'affected_capability_ambiguous' : null;
        const errorMessage = businessDefinition
          ? '业务口径修改待审批，旧发布已失效。'
          : ambiguous ? '无法唯一确定需要修改的能力，请在修改要求中写明能力名称。' : null;
        const blocked = businessDefinition || ambiguous;
        const job = await tx.brainCapabilityRegenerationJob.create({
          data: {
            releaseId: release.id, requestVersionId: request.id, idempotencyKey, releaseFingerprint,
            requirement: input.requirement, inferredChanges: this.json(input.inferredChanges),
            affectedCapabilities: this.json(affectedCapabilities), status: blocked ? 'blocked' : 'queued',
            attemptCount: 0, maxAttempts: 3, availableAt: new Date(), errorCode, errorMessage,
            report: blocked ? this.json(businessDefinition
              ? businessDefinitionReport(null, null)
              : blockedReport('无法唯一确定需要修改的能力，请写明能力名称。')) : undefined,
            generatedResourceVersionIds: this.json([]), completedAt: blocked ? new Date() : null, createdBy: input.createdBy,
          },
        });
        return { request, job, idempotencyKey };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isPrismaCode(error, 'P2002') || !idempotencyKey) throw error;
      const existing = await this.prisma.brainCapabilityRegenerationJob.findUnique({
        where: { idempotencyKey }, include: { requestVersion: true },
      });
      if (!existing) throw error;
      return { request: existing.requestVersion, job: existing, idempotencyKey };
    }
  }

  private async loadRelease(client: PrismaService | Prisma.TransactionClient, releaseId: number): Promise<ReleaseRecord | null> {
    const release = await client.brainRelease.findUnique({
      where: { id: releaseId },
      include: { items: { include: { resourceVersion: { select: { checksum: true, snapshot: true } } } } },
    });
    return release as unknown as ReleaseRecord | null;
  }

  private requiresBusinessDefinitionChange(requirement: string) {
    return /(指标公式|计算公式|状态口径|时间口径|实体关系|关联关系|实收.*(?:包含|排除)|复购.*(?:按|定义)|毛利.*(?:包含|排除))/.test(requirement);
  }
  private businessDefinitionAreas(requirement: string) {
    const areas: string[] = [];
    if (/(指标公式|计算公式|实收|复购|毛利)/.test(requirement)) areas.push('metric_formula');
    if (/状态口径/.test(requirement)) areas.push('status_dictionary');
    if (/时间口径/.test(requirement)) areas.push('time_policy');
    if (/(实体关系|关联关系)/.test(requirement)) areas.push('entity_relation');
    return areas;
  }
  private normalizeRequirement(value: string) { return value.normalize('NFKC').replace(/\s+/g, ' ').trim(); }
  private idempotencyKey(releaseId: number, releaseFingerprint: string, requirement: string) { return this.sha256({ releaseId, releaseFingerprint, requirement }); }
  private sha256(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
  private json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
}

type ReleaseRecord = {
  id: number;
  releaseKey: string;
  status: string;
  items: Array<{ resourceVersionId: number; resourceType: string; resourceKey: string; resourceVersion: { checksum: string; snapshot?: unknown } }>;
};

function requestSummary(request: Record<string, unknown>) {
  return {
    id: Number(request.id), resourceType: String(request.resourceType), resourceKey: String(request.resourceKey),
    version: Number(request.version), status: String(request.status), createdAt: request.createdAt,
  };
}
function blockedReport(message: string) {
  return { progress: 100, affectedCapabilities: [], staticGatesPassed: 0, contractCompileSecurity: [], risk: { overall: 'blocked' }, blockingReasons: [message] };
}
function businessDefinitionReport(definitionDraftId: number | null, definitionKey: string | null) {
  return {
    ...blockedReport('业务口径修改待审批，旧发布已失效。'),
    businessDefinition: { status: 'pending', definitionDraftId, definitionKey },
  };
}
function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
}
