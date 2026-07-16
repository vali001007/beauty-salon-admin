import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';

type BrainSkillRegistryRow = Record<string, unknown> & {
  skillKey: string;
  version: number;
  name: string;
  type: string;
  inputSchema: unknown;
  outputSchema: unknown;
  permissions: string[];
  riskLevel: unknown;
};

@Injectable()
export class BrainSkillRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async listEnabledSkills() {
    return this.listLatestEnabledSkills();
  }

  async listLatestEnabledSkills(): Promise<BrainSkillRegistryRow[]> {
    return this.db().$transaction(
      async (tx: any) => {
        const latestVersions = await tx.brainSkillRegistry.groupBy({
          by: ['skillKey'],
          where: { enabled: true },
          _max: { version: true },
        });
        const selectors = latestVersions.flatMap((item: { skillKey: string; _max?: { version?: number | null } }) => {
          const version = item._max?.version;
          return version == null ? [] : [{ skillKey: item.skillKey, version }];
        });
        if (selectors.length === 0) return [];

        return tx.brainSkillRegistry.findMany({
          where: { enabled: true, OR: selectors },
          orderBy: { skillKey: 'asc' },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async listLatestEnabledCapabilityCandidates(): Promise<BrainCapabilityCandidate[]> {
    return this.db().$transaction(
      async (tx: any) => {
        const latestVersions = await tx.brainSkillRegistry.groupBy({
          by: ['skillKey'],
          where: { enabled: true, sourceFingerprint: { not: null } },
          _max: { version: true },
        });
        const selectors = latestVersions.flatMap((item: { skillKey: string; _max?: { version?: number | null } }) => {
          const version = item._max?.version;
          return version == null ? [] : [{ skillKey: item.skillKey, version }];
        });
        if (!selectors.length) return [];
        const rows = await tx.brainSkillRegistry.findMany({
          where: { enabled: true, sourceFingerprint: { not: null }, OR: selectors },
          orderBy: { skillKey: 'asc' },
        });
        return rows.map((row: any) => this.toCapabilityCandidate(row));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  findEnabledSkill(skillKey: string) {
    return this.db().brainSkillRegistry.findFirst({
      where: { skillKey, enabled: true },
      orderBy: { version: 'desc' },
    });
  }

  private toCapabilityCandidate(row: BrainSkillRegistryRow): BrainCapabilityCandidate {
    const legacyAction = row.type === 'action';
    const value = row as typeof row & Record<string, unknown>;
    const legacyExecutionPolicy =
      value.readOnly === undefined &&
      value.sideEffect === undefined &&
      value.requiresConfirmation === undefined &&
      value.idempotency === undefined;

    return {
      key: row.skillKey,
      version: row.version,
      name: row.name,
      description: this.defaultOnlyWhenMissing(value.description, ''),
      skillType: row.type,
      domains: this.defaultOnlyWhenMissing(value.domains, []),
      intents: this.defaultOnlyWhenMissing(value.intents, []),
      inputSchema: row.inputSchema,
      outputSchema: row.outputSchema,
      requiredPermissions: row.permissions,
      allowedRoles: this.defaultOnlyWhenMissing(value.allowedRoles, []),
      readOnly: this.defaultOnlyWhenMissing(value.readOnly, !legacyAction),
      sideEffect: this.defaultOnlyWhenMissing(value.sideEffect, legacyAction),
      riskLevel: legacyAction && legacyExecutionPolicy && value.riskLevel === 'low' ? 'medium' : value.riskLevel,
      requiresConfirmation: this.defaultOnlyWhenMissing(value.requiresConfirmation, legacyAction),
      idempotency: this.defaultOnlyWhenMissing(value.idempotency, legacyAction ? 'required' : 'not_applicable'),
      timeoutMs: this.defaultOnlyWhenMissing(value.timeoutMs, 10_000),
      grounding: this.defaultOnlyWhenMissing(value.grounding, 'domain_service'),
      examples: this.defaultOnlyWhenMissing(value.examples, []),
      sourceFingerprint: value.sourceFingerprint,
      definitionRefs: value.definitionRefs,
      synonyms: this.defaultOnlyWhenMissing(value.synonyms, []),
      negativeExamples: this.defaultOnlyWhenMissing(value.negativeExamples, []),
      successSchema: this.defaultOnlyWhenMissing(value.successSchema, {}),
    };
  }

  private defaultOnlyWhenMissing<T>(value: unknown, fallback: T): unknown {
    return value === undefined ? fallback : value;
  }

  private db(): any {
    return this.prisma;
  }
}
