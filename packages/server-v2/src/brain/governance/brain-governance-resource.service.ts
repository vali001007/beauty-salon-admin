import { BadRequestException, Injectable } from '@nestjs/common';
import { BrainRiskLevel, BrainSkillType, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

export type BrainGovernanceResourceType =
  | 'metric'
  | 'ontology_entity'
  | 'ontology_relation'
  | 'agent_profile'
  | 'skill'
  | 'inspection_rule';

@Injectable()
export class BrainGovernanceResourceService {
  constructor(private readonly prisma: PrismaService) {}

  listVersions(input?: { resourceType?: string; resourceKey?: string; status?: string }) {
    return this.prisma.brainResourceVersion.findMany({
      where: {
        ...(input?.resourceType ? { resourceType: input.resourceType } : {}),
        ...(input?.resourceKey ? { resourceKey: input.resourceKey } : {}),
        ...(input?.status ? { status: input.status } : {}),
      },
      orderBy: [{ resourceType: 'asc' }, { resourceKey: 'asc' }, { version: 'desc' }],
      take: 500,
    });
  }

  createDraft(input: {
    resourceType: BrainGovernanceResourceType;
    resourceKey: string;
    payload: Record<string, unknown>;
    createdBy: number;
  }) {
    const resourceKey = this.nonEmpty(input.resourceKey, 'resourceKey');
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.brainResourceVersion.findFirst({
        where: { resourceType: input.resourceType, resourceKey },
        orderBy: { version: 'desc' },
      });
      const version = (previous?.version ?? 0) + 1;
      const previousSnapshot = previous ? this.record(previous.snapshot) : {};
      const snapshot = { ...previousSnapshot, ...input.payload, resourceKey, version };
      const sourceResourceId = await this.persistSource(tx, input.resourceType, resourceKey, version, snapshot);
      return tx.brainResourceVersion.create({
        data: {
          resourceType: input.resourceType,
          resourceKey,
          version,
          status: 'draft',
          snapshot: this.toJson(snapshot),
          checksum: this.checksum(snapshot),
          sourceResourceId,
          createdBy: input.createdBy,
        },
      });
    });
  }

  async changeStatus(input: { id: number; status: 'draft' | 'active' | 'disabled' | 'archived' }) {
    const current = await this.prisma.brainResourceVersion.findUnique({ where: { id: input.id } });
    if (!current) throw new BadRequestException('brain_resource_version_not_found');
    if (input.status === 'active') throw new BadRequestException('brain_resource_activation_requires_release');
    return this.prisma.brainResourceVersion.update({
      where: { id: input.id },
      data: {
        status: input.status,
        activatedAt: current.activatedAt,
        archivedAt: input.status === 'archived' ? new Date() : current.archivedAt,
      },
    });
  }

  private async persistSource(
    tx: Prisma.TransactionClient,
    type: BrainGovernanceResourceType,
    key: string,
    version: number,
    payload: Record<string, unknown>,
  ) {
    switch (type) {
      case 'metric': {
        const row = await tx.brainMetric.create({
          data: {
            metricKey: key,
            name: this.nonEmpty(payload.name, 'name'),
            domain: this.nonEmpty(payload.domain, 'domain'),
            formula: this.json(payload.formula, 'formula'),
            sourceTables: this.json(payload.sourceTables, 'sourceTables'),
            defaultFilters: payload.defaultFilters == null ? undefined : this.json(payload.defaultFilters, 'defaultFilters'),
            permissions: this.json(payload.permissions, 'permissions'),
            description: this.nonEmpty(payload.description, 'description'),
            status: 'draft',
            version,
          },
        });
        return row.id;
      }
      case 'ontology_entity': {
        const row = await tx.brainOntologyEntity.create({
          data: {
            entityKey: key,
            domain: this.nonEmpty(payload.domain, 'domain'),
            name: this.nonEmpty(payload.name, 'name'),
            synonyms: this.json(payload.synonyms ?? [], 'synonyms'),
            attributes: this.json(payload.attributes ?? {}, 'attributes'),
            tableMap: this.json(payload.tableMap, 'tableMap'),
            status: 'draft',
            version,
          },
        });
        return row.id;
      }
      case 'ontology_relation': {
        const row = await tx.brainOntologyRelation.create({
          data: {
            relationKey: key,
            fromEntityKey: this.nonEmpty(payload.fromEntityKey, 'fromEntityKey'),
            toEntityKey: this.nonEmpty(payload.toEntityKey, 'toEntityKey'),
            name: this.nonEmpty(payload.name, 'name'),
            joinPath: this.json(payload.joinPath, 'joinPath'),
            status: 'draft',
            version,
          },
        });
        return row.id;
      }
      case 'agent_profile': {
        const row = await tx.brainAgentProfile.create({
          data: {
            roleKey: key,
            name: this.nonEmpty(payload.name, 'name'),
            systemPrompt: this.nonEmpty(payload.systemPrompt, 'systemPrompt'),
            allowedSkills: this.json(payload.allowedSkills ?? [], 'allowedSkills'),
            dataScopeRules: this.json(payload.dataScopeRules ?? {}, 'dataScopeRules'),
            knowledgePack: payload.knowledgePack == null ? undefined : this.json(payload.knowledgePack, 'knowledgePack'),
            enabled: false,
            version,
          },
        });
        return row.id;
      }
      case 'skill': {
        const row = await tx.brainSkillRegistry.create({
          data: {
            skillKey: key,
            name: this.nonEmpty(payload.name, 'name'),
            type: this.enumValue(payload.type, Object.values(BrainSkillType), 'type') as BrainSkillType,
            inputSchema: this.json(payload.inputSchema ?? {}, 'inputSchema'),
            outputSchema: this.json(payload.outputSchema ?? {}, 'outputSchema'),
            permissions: this.json(payload.permissions ?? [], 'permissions'),
            riskLevel: this.enumValue(payload.riskLevel ?? 'low', Object.values(BrainRiskLevel), 'riskLevel') as BrainRiskLevel,
            enabled: false,
            version,
          },
        });
        return row.id;
      }
      case 'inspection_rule': {
        const row = await tx.brainInspectionRule.create({
          data: {
            ruleKey: key,
            name: this.nonEmpty(payload.name, 'name'),
            domain: this.nonEmpty(payload.domain, 'domain'),
            scheduleCron: typeof payload.scheduleCron === 'string' ? payload.scheduleCron : undefined,
            eventTrigger: typeof payload.eventTrigger === 'string' ? payload.eventTrigger : undefined,
            condition: this.json(payload.condition ?? {}, 'condition'),
            suggestionTpl: this.json(payload.suggestionTpl ?? {}, 'suggestionTpl'),
            riskLevel: this.enumValue(payload.riskLevel ?? 'medium', Object.values(BrainRiskLevel), 'riskLevel') as BrainRiskLevel,
            enabled: false,
            version,
          },
        });
        return row.id;
      }
    }
  }

  private nonEmpty(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`missing_governance_field:${field}`);
    return value.trim();
  }

  private enumValue(value: unknown, allowed: string[], field: string) {
    if (typeof value !== 'string' || !allowed.includes(value)) throw new BadRequestException(`invalid_governance_field:${field}`);
    return value;
  }

  private json(value: unknown, field: string): Prisma.InputJsonValue {
    if (value === undefined) throw new BadRequestException(`missing_governance_field:${field}`);
    return this.toJson(value);
  }

  private record(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private checksum(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
