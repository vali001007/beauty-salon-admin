import { Injectable } from '@nestjs/common';
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

type BrainSkillSummaryRow = Record<string, unknown> & {
  skillKey: string;
  version: number;
};

@Injectable()
export class BrainSkillRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async listEnabledSkills() {
    return this.listLatestEnabledSkills();
  }

  async listEnabledSkillSummaries(): Promise<BrainSkillSummaryRow[]> {
    const rows = await this.db().brainSkillRegistry.findMany({
      where: { enabled: true },
      orderBy: [{ skillKey: 'asc' }, { version: 'desc' }],
      select: {
        id: true,
        skillKey: true,
        name: true,
        description: true,
        type: true,
        domains: true,
        intents: true,
        permissions: true,
        allowedRoles: true,
        readOnly: true,
        sideEffect: true,
        riskLevel: true,
        requiresConfirmation: true,
        idempotency: true,
        timeoutMs: true,
        grounding: true,
        definitionRefs: true,
        enabled: true,
        version: true,
        updatedAt: true,
      },
    }) as BrainSkillSummaryRow[];
    return this.latestBySkillKey(rows);
  }

  async listLatestEnabledSkills(): Promise<BrainSkillRegistryRow[]> {
    return this.listLatestRows({ enabled: true });
  }

  async listLatestEnabledCapabilityCandidates(): Promise<BrainCapabilityCandidate[]> {
    const rows = await this.listLatestRows({ enabled: true, sourceFingerprint: { not: null } });
    return rows.map((row) => this.toCapabilityCandidate(row));
  }

  findEnabledSkill(skillKey: string) {
    return this.db().brainSkillRegistry.findFirst({
      where: { skillKey, enabled: true },
      orderBy: { version: 'desc' },
    });
  }

  private async listLatestRows(where: Record<string, unknown>): Promise<BrainSkillRegistryRow[]> {
    const rows = await this.db().brainSkillRegistry.findMany({
      where,
      orderBy: [{ skillKey: 'asc' }, { version: 'desc' }],
    });
    return this.latestBySkillKey(rows);
  }

  private latestBySkillKey<T extends { skillKey: string }>(rows: T[]): T[] {
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.skillKey)) return false;
      seen.add(row.skillKey);
      return true;
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
