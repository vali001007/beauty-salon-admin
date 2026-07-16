import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { BrainCapabilityGenerationProposal } from './brain-capability-codegen.service.js';
import { BrainCapabilityPublishedGateService } from './brain-capability-published-gate.service.js';

const SERIALIZABLE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 30_000,
} as const;

@Injectable()
export class BrainGeneratedCapabilityDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publishedGate: BrainCapabilityPublishedGateService,
  ) {}

  async createDraft(input: {
    proposal: BrainCapabilityGenerationProposal;
    createdBy: number;
    generatedByJobId?: number;
    leaseOwner?: string;
    workspaceRoot?: string;
  }) {
    if (input.generatedByJobId && (!input.leaseOwner || !input.workspaceRoot)) {
      throw new ConflictException('regeneration_lease_context_required');
    }
    const verified = await this.publishedGate.verify({
      proposal: input.proposal,
      workspaceRoot: input.workspaceRoot ?? (await detectWorkspaceRoot()),
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx: any) => {
          if (input.generatedByJobId) {
            const lease = await tx.$queryRaw(Prisma.sql`
              UPDATE "brain_capability_regeneration_job"
              SET "leaseExpiresAt" = NOW() + INTERVAL '5 minutes',
                  "updatedAt" = NOW()
              WHERE "id" = ${input.generatedByJobId}
                AND "leaseOwner" = ${input.leaseOwner}
                AND "status" = 'leased'
                AND "leaseExpiresAt" > NOW()
              RETURNING "id"
            `) as Array<{ id: number }>;
            if (lease.length !== 1) throw new ConflictException('regeneration_lease_lost');
            const existing = await tx.brainResourceVersion.findFirst({
              where: {
                generatedByRegenerationJobId: input.generatedByJobId,
                resourceType: 'skill',
                resourceKey: verified.manifest.key,
              },
            });
            if (existing) {
              this.assertExistingMatches(existing.snapshot, input.proposal);
              return existing;
            }
          }

          const previous = await tx.brainResourceVersion.findFirst({
            where: { resourceType: 'skill', resourceKey: verified.manifest.key },
            orderBy: { version: 'desc' },
          });
          const version = (previous?.version ?? 0) + 1;
          const manifest = { ...verified.manifest, version };
          const source = await this.createRegistrySource(tx, manifest, version);
          const snapshot = {
            ...manifest,
            generatedCapability: true,
            sourceProposalVersion: input.proposal.manifest.version,
            sourceProposalFingerprint: input.proposal.proposalFingerprint,
            executorBinding: input.proposal.executorBinding,
            governanceOverlay: input.proposal.governanceOverlay ?? null,
            registryVersion: version,
            resourceKey: manifest.key,
          };
          return tx.brainResourceVersion.create({
            data: {
              resourceType: 'skill',
              resourceKey: manifest.key,
              version,
              status: 'draft',
              snapshot: this.json(snapshot),
              checksum: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
              sourceResourceId: source.id,
              generatedByRegenerationJobId: input.generatedByJobId,
              createdBy: input.createdBy,
            },
          });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        if ((isPrismaCode(error, 'P2034') || isPrismaCode(error, 'P2002')) && attempt < 3) continue;
        if (isPrismaCode(error, 'P2034') || isPrismaCode(error, 'P2002')) throw new ConflictException('generated_capability_version_conflict');
        throw error;
      }
    }
    throw new ConflictException('generated_capability_version_conflict');
  }

  private assertExistingMatches(snapshotValue: unknown, proposal: BrainCapabilityGenerationProposal) {
    const snapshot = record(snapshotValue);
    if (
      snapshot.sourceProposalFingerprint !== proposal.proposalFingerprint ||
      snapshot.sourceFingerprint !== proposal.sourceFingerprint
    ) {
      throw new ConflictException('generated_capability_existing_fingerprint_mismatch');
    }
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async createRegistrySource(
    tx: any,
    manifest: Omit<BrainCapabilityGenerationProposal['manifest'], 'version'> & { version: number },
    version: number,
  ) {
    const data = {
      skillKey: manifest.key,
      name: manifest.name,
      description: manifest.description,
      type: manifest.sideEffect ? 'action' : 'query',
      domains: this.json(manifest.domains),
      intents: this.json(manifest.intents),
      inputSchema: this.json(manifest.inputSchema),
      outputSchema: this.json(manifest.outputSchema),
      permissions: this.json(manifest.requiredPermissions),
      allowedRoles: this.json(manifest.allowedRoles),
      readOnly: manifest.readOnly,
      sideEffect: manifest.sideEffect,
      riskLevel: manifest.riskLevel,
      requiresConfirmation: manifest.requiresConfirmation,
      idempotency: manifest.idempotency,
      timeoutMs: manifest.timeoutMs,
      grounding: manifest.grounding,
      examples: this.json(manifest.examples),
      sourceFingerprint: manifest.sourceFingerprint,
      definitionRefs: this.json(manifest.definitionRefs),
      synonyms: this.json(manifest.synonyms),
      negativeExamples: this.json(manifest.negativeExamples),
      successSchema: this.json(manifest.successSchema),
      enabled: false,
      version,
    };
    try {
      return await tx.brainSkillRegistry.create({ data });
    } catch (error) {
      if (!isUnknownPrismaArgumentError(error)) throw error;
      const rows = await tx.$queryRaw(Prisma.sql`
        INSERT INTO "brain_skill_registry" (
          "skillKey", "name", "description", "type", "domains", "intents", "inputSchema", "outputSchema",
          "permissions", "allowedRoles", "readOnly", "sideEffect", "riskLevel", "requiresConfirmation",
          "idempotency", "timeoutMs", "grounding", "examples", "sourceFingerprint", "definitionRefs", "synonyms",
          "negativeExamples", "successSchema", "enabled", "version", "createdAt", "updatedAt"
        ) VALUES (
          ${data.skillKey}, ${data.name}, ${data.description}, ${data.type}::"BrainSkillType",
          ${JSON.stringify(data.domains)}::jsonb, ${JSON.stringify(data.intents)}::jsonb,
          ${JSON.stringify(data.inputSchema)}::jsonb, ${JSON.stringify(data.outputSchema)}::jsonb,
          ${JSON.stringify(data.permissions)}::jsonb, ${JSON.stringify(data.allowedRoles)}::jsonb,
          ${data.readOnly}, ${data.sideEffect}, ${data.riskLevel}::"BrainRiskLevel", ${data.requiresConfirmation},
          ${data.idempotency}, ${data.timeoutMs}, ${data.grounding}, ${JSON.stringify(data.examples)}::jsonb,
          ${data.sourceFingerprint}, ${JSON.stringify(data.definitionRefs)}::jsonb, ${JSON.stringify(data.synonyms)}::jsonb,
          ${JSON.stringify(data.negativeExamples)}::jsonb, ${JSON.stringify(data.successSchema)}::jsonb,
          ${data.enabled}, ${data.version}, NOW(), NOW()
        )
        RETURNING "id"
      `) as Array<{ id: number }>;
      if (rows.length !== 1) throw new Error('generated_capability_registry_source_insert_failed');
      return rows[0]!;
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
}
function isUnknownPrismaArgumentError(error: unknown): boolean {
  return error instanceof Error && /Unknown argument [`']?[A-Za-z]/.test(error.message);
}
async function detectWorkspaceRoot(): Promise<string> {
  const candidates = [process.cwd(), resolve(process.cwd(), '..', '..')];
  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, 'packages/server-v2/prisma/schema.prisma'));
      return candidate;
    } catch {}
  }
  throw new Error('generated_capability_workspace_root_not_found');
}
