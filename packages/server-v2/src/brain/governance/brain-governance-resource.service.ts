import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
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

export interface BrainSkillGovernanceSummary {
  versionId: number;
  skillId: number | null;
  skillKey: string;
  name: string;
  description: string;
  version: number;
  status: string;
  updatedAt: Date;
  activeVersionId: number | null;
  activeVersion: number | null;
  enabled: boolean;
  historyCount: number;
  domains: string[];
  entities: string[];
  metrics: string[];
}

interface BrainSkillGovernanceRawSummary extends Omit<BrainSkillGovernanceSummary, 'domains' | 'entities' | 'metrics'> {
  domains: Prisma.JsonValue | null;
  definitionRefs: Prisma.JsonValue | null;
}

export interface BrainSkillGovernanceHistoryItem {
  versionId: number;
  skillId: number | null;
  skillKey: string;
  name: string;
  description: string;
  version: number;
  status: string;
  enabled: boolean;
  type: string | null;
  riskLevel: string | null;
  permissions: Prisma.JsonValue | null;
  updatedAt: Date;
  activatedAt: Date | null;
  archivedAt: Date | null;
}

export type BrainSemanticGovernanceResourceType = 'metric' | 'ontology_entity' | 'ontology_relation';

export interface BrainSemanticGovernanceSummary {
  id: number;
  resourceType: BrainSemanticGovernanceResourceType;
  resourceKey: string;
  name: string;
  version: number;
  status: string;
  semanticDescription: string;
  dataTables: string[];
  fuzzyTerms: string[];
  hitCount: number;
  sampleCount: number;
  hitRate: number | null;
  updatedAt: Date;
  managed: boolean;
  enabled: boolean;
  definitionId: number | null;
  definitionKey: string | null;
  definitionVersionId: number | null;
  historyCount: number;
}

export interface BrainSemanticGraphNode {
  id: string;
  key: string;
  label: string;
  kind: 'entity' | 'relation' | 'metric' | 'table';
  status: string;
  version: number | null;
  description: string;
  dataTables: string[];
  fuzzyTerms: string[];
}

export interface BrainSemanticGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'relation_from' | 'relation_to' | 'metric_entity' | 'backed_by';
  label: string;
}

export type BrainSemanticGovernanceHistoryItem = Omit<
  BrainSemanticGovernanceSummary,
  'hitCount' | 'sampleCount' | 'hitRate' | 'historyCount'
>;

interface BrainSemanticGovernanceRawRow {
  id: number;
  resourceKey: string;
  name: string;
  version: number;
  sourceStatus: string;
  sourceDescription: string | null;
  sourceMetadata: Prisma.JsonValue | null;
  sourceFuzzyTerms: Prisma.JsonValue | null;
  definitionId: number | null;
  definitionKey: string | null;
  definitionStatus: string | null;
  currentPublishedVersionId: number | null;
  definitionVersionId: number | null;
  definitionLifecycleStatus: string | null;
  definitionPayload: Prisma.JsonValue | null;
  updatedAt: Date;
  historyCount: number;
}

interface BrainSemanticHitRow {
  definitionKey: string;
  hitCount: number;
}

interface BrainPublishedSemanticDefinitionRow {
  id: number;
  definitionKey: string;
  name: string;
  status: string;
  currentPublishedVersionId: number;
  updatedAt: Date;
  currentPublishedVersion: {
    id: number;
    version: number;
    payload: Prisma.JsonValue;
    lifecycleStatus: string;
    publishedAt: Date | null;
    createdAt: Date;
  };
  _count: { versions: number };
}

@Injectable()
export class BrainGovernanceResourceService {
  constructor(private readonly prisma: PrismaService) {}

  listVersions(input?: {
    resourceType?: string;
    resourceKey?: string;
    status?: string;
    includeSnapshot?: boolean;
    take?: number;
  }) {
    const take = Math.max(1, Math.min(500, Number(input?.take) || 500));
    return this.prisma.brainResourceVersion.findMany({
      where: {
        ...(input?.resourceType ? { resourceType: input.resourceType } : {}),
        ...(input?.resourceKey ? { resourceKey: input.resourceKey } : {}),
        ...(input?.status ? { status: input.status } : {}),
      },
      orderBy: [{ resourceType: 'asc' }, { resourceKey: 'asc' }, { version: 'desc' }],
      take,
      ...(input?.includeSnapshot === false
        ? {
            select: {
              id: true,
              resourceType: true,
              resourceKey: true,
              version: true,
              status: true,
              createdAt: true,
            },
          }
        : {}),
    });
  }

  async listSkillGovernanceSummaries(input?: { take?: number }): Promise<BrainSkillGovernanceSummary[]> {
    const take = Math.max(1, Math.min(200, Number(input?.take) || 100));
    const rows = await this.prisma.$queryRaw<BrainSkillGovernanceRawSummary[]>(Prisma.sql`
      WITH ranked_versions AS (
        SELECT
          version_row.*,
          ROW_NUMBER() OVER (
            PARTITION BY version_row."resourceKey"
            ORDER BY version_row."version" DESC, version_row."id" DESC
          ) AS row_number,
          (COUNT(*) OVER (PARTITION BY version_row."resourceKey"))::int AS history_count
        FROM "brain_resource_version" version_row
        WHERE version_row."resourceType" = 'skill'
      ),
      active_versions AS (
        SELECT DISTINCT ON (version_row."resourceKey")
          version_row."resourceKey",
          version_row."id" AS active_version_id,
          version_row."version" AS active_version,
          COALESCE(skill_row."enabled", false) AS enabled
        FROM "brain_resource_version" version_row
        LEFT JOIN "brain_skill_registry" skill_row
          ON skill_row."id" = version_row."sourceResourceId"
        WHERE version_row."resourceType" = 'skill'
          AND version_row."status" = 'active'
        ORDER BY version_row."resourceKey", version_row."version" DESC, version_row."id" DESC
      )
      SELECT
        latest."id" AS "versionId",
        latest."sourceResourceId" AS "skillId",
        latest."resourceKey" AS "skillKey",
        COALESCE(NULLIF(latest."snapshot" ->> 'name', ''), latest."resourceKey") AS "name",
        COALESCE(latest."snapshot" ->> 'description', '') AS "description",
        latest."snapshot" -> 'domains' AS "domains",
        latest."snapshot" -> 'definitionRefs' AS "definitionRefs",
        latest."version" AS "version",
        latest."status" AS "status",
        latest."createdAt" AS "updatedAt",
        active.active_version_id AS "activeVersionId",
        active.active_version AS "activeVersion",
        COALESCE(active.enabled, false) AS "enabled",
        latest.history_count AS "historyCount"
      FROM ranked_versions latest
      LEFT JOIN active_versions active ON active."resourceKey" = latest."resourceKey"
      WHERE latest.row_number = 1
      ORDER BY latest."createdAt" DESC, latest."resourceKey" ASC
      LIMIT ${take}
    `);
    return rows.map(({ definitionRefs, ...row }) => ({
      ...row,
      domains: uniqueStrings(collectStrings(row.domains)),
      entities: skillDefinitionKeys(definitionRefs, 'entity.'),
      metrics: skillDefinitionKeys(definitionRefs, 'metric.'),
    }));
  }

  listSkillGovernanceHistory(input: {
    skillKey: string;
    take?: number;
  }): Promise<BrainSkillGovernanceHistoryItem[]> {
    const skillKey = this.nonEmpty(input.skillKey, 'skillKey');
    const take = Math.max(1, Math.min(200, Number(input.take) || 100));
    return this.prisma.$queryRaw<BrainSkillGovernanceHistoryItem[]>(Prisma.sql`
      SELECT
        version_row."id" AS "versionId",
        version_row."sourceResourceId" AS "skillId",
        version_row."resourceKey" AS "skillKey",
        COALESCE(NULLIF(version_row."snapshot" ->> 'name', ''), version_row."resourceKey") AS "name",
        COALESCE(version_row."snapshot" ->> 'description', '') AS "description",
        version_row."version" AS "version",
        version_row."status" AS "status",
        COALESCE(skill_row."enabled", false) AS "enabled",
        version_row."snapshot" ->> 'type' AS "type",
        version_row."snapshot" ->> 'riskLevel' AS "riskLevel",
        version_row."snapshot" -> 'permissions' AS "permissions",
        version_row."createdAt" AS "updatedAt",
        version_row."activatedAt" AS "activatedAt",
        version_row."archivedAt" AS "archivedAt"
      FROM "brain_resource_version" version_row
      LEFT JOIN "brain_skill_registry" skill_row
        ON skill_row."id" = version_row."sourceResourceId"
      WHERE version_row."resourceType" = 'skill'
        AND version_row."resourceKey" = ${skillKey}
      ORDER BY version_row."version" DESC, version_row."id" DESC
      LIMIT ${take}
    `);
  }

  async setPublishedSkillEnabled(input: { skillKey: string; enabled: boolean }) {
    const skillKey = this.nonEmpty(input.skillKey, 'skillKey');
    return this.prisma.$transaction(async (tx) => {
      const activeVersion = await tx.brainResourceVersion.findFirst({
        where: {
          resourceType: 'skill',
          resourceKey: skillKey,
          status: 'active',
          sourceResourceId: { not: null },
        },
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        select: { id: true, version: true, sourceResourceId: true },
      });
      if (!activeVersion?.sourceResourceId) {
        throw new BadRequestException('skill_enable_requires_active_version');
      }
      if (input.enabled) {
        await tx.brainSkillRegistry.updateMany({
          where: { skillKey, enabled: true },
          data: { enabled: false },
        });
      }
      const skill = await tx.brainSkillRegistry.update({
        where: { id: activeVersion.sourceResourceId },
        data: { enabled: input.enabled },
        select: { id: true, skillKey: true, name: true, version: true, enabled: true, updatedAt: true },
      });
      return {
        ...skill,
        activeVersionId: activeVersion.id,
        activeVersion: activeVersion.version,
      };
    });
  }

  async listSemanticGovernanceSummaries(input: {
    resourceType: BrainSemanticGovernanceResourceType;
    storeId: number;
    take?: number;
  }): Promise<BrainSemanticGovernanceSummary[]> {
    const take = Math.max(1, Math.min(200, Number(input.take) || 100));
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [rows, definitions, sampleCount, hitRows] = await Promise.all([
      this.querySemanticRows(input.resourceType, { take }),
      this.listPublishedSemanticDefinitions(input.resourceType, take),
      this.prisma.brainRun.count({
        where: { storeId: input.storeId, status: 'completed', createdAt: { gte: since } },
      }),
      this.prisma.$queryRaw<BrainSemanticHitRow[]>(Prisma.sql`
        SELECT
          evidence."definitionKey" AS "definitionKey",
          COUNT(DISTINCT evidence."runId")::int AS "hitCount"
        FROM "business_semantic_evidence" evidence
        WHERE evidence."storeId" = ${input.storeId}
          AND evidence."runId" IS NOT NULL
          AND evidence."firstSeenAt" >= ${since}
        GROUP BY evidence."definitionKey"
      `),
    ]);
    const hits = new Map(hitRows.map((row) => [row.definitionKey, Number(row.hitCount) || 0]));
    const governed = definitions.map((definition) => {
      const hitCount = hits.get(definition.definitionKey) ?? 0;
      return {
        ...this.mapSemanticDefinition(input.resourceType, definition),
        hitCount,
        sampleCount,
        hitRate: sampleCount > 0 ? hitCount / sampleCount : null,
        historyCount: definition._count.versions,
      };
    });
    const governedKeys = new Set(
      definitions.flatMap((definition) => [definition.definitionKey, semanticCoreKey(input.resourceType, definition.definitionKey)]),
    );
    const legacy = rows.filter((row) => !governedKeys.has(row.resourceKey)).map((row) => {
      const hitCount = hits.get(row.definitionKey ?? row.resourceKey) ?? hits.get(row.resourceKey) ?? 0;
      return {
        ...this.mapSemanticRow(input.resourceType, row),
        hitCount,
        sampleCount,
        hitRate: sampleCount > 0 ? hitCount / sampleCount : null,
        historyCount: Number(row.historyCount) || 1,
      };
    });
    return [...governed, ...legacy]
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
      .slice(0, take);
  }

  async listSemanticGovernanceHistory(input: {
    resourceType: BrainSemanticGovernanceResourceType;
    resourceKey: string;
    take?: number;
  }): Promise<BrainSemanticGovernanceHistoryItem[]> {
    const resourceKey = this.nonEmpty(input.resourceKey, 'resourceKey');
    const take = Math.max(1, Math.min(200, Number(input.take) || 100));
    const definition = await this.findSemanticDefinition(input.resourceType, resourceKey);
    if (definition) {
      return definition.versions.slice(0, take).map((version) => this.mapSemanticDefinitionVersion(
        input.resourceType,
        definition,
        version,
      ));
    }
    const rows = await this.querySemanticRows(input.resourceType, { resourceKey, take });
    return rows.map((row) => this.mapSemanticRow(input.resourceType, row));
  }

  async setPublishedSemanticEnabled(input: {
    resourceType: BrainSemanticGovernanceResourceType;
    resourceKey: string;
    enabled: boolean;
  }) {
    const resourceKey = this.nonEmpty(input.resourceKey, 'resourceKey');
    const definition = await this.prisma.businessDefinition.findUnique({
      where: {
        kind_definitionKey: {
          kind: semanticDefinitionKind(input.resourceType) as never,
          definitionKey: resourceKey,
        },
      },
      select: { id: true, currentPublishedVersionId: true },
    });
    if (!definition?.currentPublishedVersionId) {
      throw new BadRequestException('semantic_enable_requires_governed_published_version');
    }
    const version = await this.prisma.businessDefinitionVersion.findUnique({
      where: { id: definition.currentPublishedVersionId },
      include: { definition: true },
    });
    if (
      !version ||
      version.lifecycleStatus !== 'published' ||
      version.definition.currentPublishedVersionId !== version.id
    ) {
      throw new BadRequestException('semantic_enable_requires_current_published_version');
    }
    const updatedDefinition = await this.prisma.businessDefinition.update({
      where: { id: version.definitionId },
      data: { status: input.enabled ? 'active' : 'archived' },
      select: {
        id: true,
        definitionKey: true,
        kind: true,
        name: true,
        status: true,
        currentPublishedVersionId: true,
        updatedAt: true,
      },
    });
    return { ...updatedDefinition, enabled: updatedDefinition.status === 'active' };
  }

  async getSemanticGraph() {
    const definitions = await this.prisma.businessDefinition.findMany({
      where: {
        kind: { in: ['entity', 'relation', 'metric'] },
        currentPublishedVersionId: { not: null },
      },
      select: {
        definitionKey: true,
        kind: true,
        name: true,
        status: true,
        currentPublishedVersion: { select: { version: true, payload: true } },
      },
      orderBy: [{ kind: 'asc' }, { definitionKey: 'asc' }],
    });
    const nodes: BrainSemanticGraphNode[] = [];
    const edges: BrainSemanticGraphEdge[] = [];
    const edgeIds = new Set<string>();
    const entityByModel = new Map<string, string>();
    const tableNames = new Set<string>();

    for (const definition of definitions) {
      const payload = this.record(definition.currentPublishedVersion?.payload ?? {});
      const kind = definition.kind as 'entity' | 'relation' | 'metric';
      const dataTables = uniqueStrings(collectNamedStrings(payload, TABLE_METADATA_KEYS));
      const fuzzyTerms = uniqueStrings(collectNamedStrings(payload, FUZZY_TERM_KEYS));
      nodes.push({
        id: definition.definitionKey,
        key: definition.definitionKey,
        label: firstNonEmptyString(payload.displayName, payload.label, fuzzyTerms[0], definition.name, definition.definitionKey),
        kind,
        status: definition.status,
        version: definition.currentPublishedVersion?.version ?? null,
        description: firstNonEmptyString(payload.semanticDescription, payload.description),
        dataTables,
        fuzzyTerms,
      });
      dataTables.forEach((table) => tableNames.add(table));
      if (kind === 'entity') {
        for (const model of uniqueStrings([
          ...collectNamedStrings(payload, new Set(['model', 'table'])),
          ...dataTables,
        ])) entityByModel.set(model, definition.definitionKey);
      }
    }

    for (const definition of definitions) {
      const payload = this.record(definition.currentPublishedVersion?.payload ?? {});
      const kind = definition.kind as 'entity' | 'relation' | 'metric';
      const dataTables = uniqueStrings(collectNamedStrings(payload, TABLE_METADATA_KEYS));
      if (kind === 'relation') {
        const fromEntity = entityByModel.get(firstNonEmptyString(payload.fromModel, payload.sourceModel));
        const toEntity = entityByModel.get(firstNonEmptyString(payload.toModel, payload.targetModel));
        if (fromEntity) addGraphEdge(edges, edgeIds, fromEntity, definition.definitionKey, 'relation_from', '起点');
        if (toEntity) addGraphEdge(edges, edgeIds, definition.definitionKey, toEntity, 'relation_to', '指向');
      }
      if (kind === 'metric') {
        for (const model of dataTables) {
          const entity = entityByModel.get(model);
          if (entity) addGraphEdge(edges, edgeIds, definition.definitionKey, entity, 'metric_entity', '度量');
        }
      }
      for (const table of dataTables) {
        addGraphEdge(edges, edgeIds, definition.definitionKey, `table:${table}`, 'backed_by', '数据表');
      }
    }

    for (const table of [...tableNames].sort((left, right) => left.localeCompare(right))) {
      nodes.push({
        id: `table:${table}`,
        key: table,
        label: table,
        kind: 'table',
        status: 'active',
        version: null,
        description: '业务口径关联的真实数据模型或表。',
        dataTables: [table],
        fuzzyTerms: [],
      });
    }

    return {
      nodes,
      edges,
      summary: {
        entities: nodes.filter((node) => node.kind === 'entity').length,
        relations: nodes.filter((node) => node.kind === 'relation').length,
        metrics: nodes.filter((node) => node.kind === 'metric').length,
        tables: nodes.filter((node) => node.kind === 'table').length,
        edges: edges.length,
      },
    };
  }

  async createDraft(input: {
    resourceType: BrainGovernanceResourceType;
    resourceKey: string;
    payload: Record<string, unknown>;
    createdBy: number;
  }) {
    this.assertResourceManagedHere(input.resourceType);
    if (input.resourceType === 'skill') this.assertLegacySkillPayload(input.payload);
    const resourceKey = this.nonEmpty(input.resourceKey, 'resourceKey');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const previous = await tx.brainResourceVersion.findFirst({
              where: { resourceType: input.resourceType, resourceKey },
              orderBy: { version: 'desc' },
            });
            const version = (previous?.version ?? 0) + 1;
            const previousSnapshot = previous ? this.record(previous.snapshot) : {};
            if (input.resourceType === 'skill' && previousSnapshot.generatedCapability === true) {
              throw new BadRequestException('generated_capability_governance_pipeline_required');
            }
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
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if ((isPrismaCode(error, 'P2034') || isPrismaCode(error, 'P2002')) && attempt < 3) continue;
        if (isPrismaCode(error, 'P2034') || isPrismaCode(error, 'P2002')) {
          throw new ConflictException('brain_resource_version_conflict');
        }
        throw error;
      }
    }
    throw new ConflictException('brain_resource_version_conflict');
  }

  async changeStatus(input: { id: number; status: 'draft' | 'active' | 'disabled' | 'archived' }) {
    const current = await this.prisma.brainResourceVersion.findUnique({ where: { id: input.id } });
    if (!current) throw new BadRequestException('brain_resource_version_not_found');
    this.assertResourceManagedHere(current.resourceType as BrainGovernanceResourceType);
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
    this.assertResourceManagedHere(type);
    switch (type) {
      case 'metric': {
        const row = await tx.brainMetric.create({
          data: {
            metricKey: key,
            name: this.nonEmpty(payload.name, 'name'),
            domain: this.nonEmpty(payload.domain, 'domain'),
            formula: this.json(payload.formula, 'formula'),
            sourceTables: this.json(payload.sourceTables, 'sourceTables'),
            defaultFilters:
              payload.defaultFilters == null ? undefined : this.json(payload.defaultFilters, 'defaultFilters'),
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
            knowledgePack:
              payload.knowledgePack == null ? undefined : this.json(payload.knowledgePack, 'knowledgePack'),
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
            riskLevel: this.enumValue(
              payload.riskLevel ?? 'low',
              Object.values(BrainRiskLevel),
              'riskLevel',
            ) as BrainRiskLevel,
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
            riskLevel: this.enumValue(
              payload.riskLevel ?? 'medium',
              Object.values(BrainRiskLevel),
              'riskLevel',
            ) as BrainRiskLevel,
            enabled: false,
            version,
          },
        });
        return row.id;
      }
    }
  }

  private assertResourceManagedHere(type: BrainGovernanceResourceType) {
    if (type === 'metric' || type === 'ontology_entity' || type === 'ontology_relation') {
      throw new BadRequestException(`business_definition_registry_required:${type}`);
    }
  }

  private querySemanticRows(
    resourceType: BrainSemanticGovernanceResourceType,
    input: { resourceKey?: string; take: number },
  ): Promise<BrainSemanticGovernanceRawRow[]> {
    const keyFilter = input.resourceKey ? Prisma.sql`AND source_row."resourceKey" = ${input.resourceKey}` : Prisma.empty;
    const latestFilter = input.resourceKey ? Prisma.empty : Prisma.sql`AND source_row.row_number = 1`;
    if (resourceType === 'metric') {
      return this.prisma.$queryRaw<BrainSemanticGovernanceRawRow[]>(Prisma.sql`
        WITH source_row AS (
          SELECT
            metric."id", metric."metricKey" AS "resourceKey", metric."name", metric."version",
            metric."status" AS "sourceStatus", metric."description" AS "sourceDescription",
            metric."sourceTables" AS "sourceMetadata", '[]'::jsonb AS "sourceFuzzyTerms",
            metric."businessDefinitionVersionId", metric."updatedAt",
            ROW_NUMBER() OVER (PARTITION BY metric."metricKey" ORDER BY metric."version" DESC, metric."id" DESC) AS row_number,
            (COUNT(*) OVER (PARTITION BY metric."metricKey"))::int AS "historyCount"
          FROM "brain_metric" metric
        )
        SELECT
          source_row."id", source_row."resourceKey", source_row."name", source_row."version",
          source_row."sourceStatus", source_row."sourceDescription", source_row."sourceMetadata",
          source_row."sourceFuzzyTerms", source_row."updatedAt", source_row."historyCount",
          definition."id" AS "definitionId", definition."definitionKey", definition."status" AS "definitionStatus",
          definition."currentPublishedVersionId", version."id" AS "definitionVersionId",
          version."lifecycleStatus" AS "definitionLifecycleStatus", version."payload" AS "definitionPayload"
        FROM source_row
        LEFT JOIN "business_definition_version" version ON version."id" = source_row."businessDefinitionVersionId"
        LEFT JOIN "business_definition" definition ON definition."id" = version."definitionId"
        WHERE 1 = 1 ${keyFilter} ${latestFilter}
        ORDER BY source_row."resourceKey" ASC, source_row."version" DESC, source_row."id" DESC
        LIMIT ${input.take}
      `);
    }
    if (resourceType === 'ontology_entity') {
      return this.prisma.$queryRaw<BrainSemanticGovernanceRawRow[]>(Prisma.sql`
        WITH source_row AS (
          SELECT
            entity."id", entity."entityKey" AS "resourceKey", entity."name", entity."version",
            entity."status" AS "sourceStatus", NULL::text AS "sourceDescription",
            entity."tableMap" AS "sourceMetadata", entity."synonyms" AS "sourceFuzzyTerms",
            entity."businessDefinitionVersionId", entity."updatedAt",
            ROW_NUMBER() OVER (PARTITION BY entity."entityKey" ORDER BY entity."version" DESC, entity."id" DESC) AS row_number,
            (COUNT(*) OVER (PARTITION BY entity."entityKey"))::int AS "historyCount"
          FROM "brain_ontology_entity" entity
        )
        SELECT
          source_row."id", source_row."resourceKey", source_row."name", source_row."version",
          source_row."sourceStatus", source_row."sourceDescription", source_row."sourceMetadata",
          source_row."sourceFuzzyTerms", source_row."updatedAt", source_row."historyCount",
          definition."id" AS "definitionId", definition."definitionKey", definition."status" AS "definitionStatus",
          definition."currentPublishedVersionId", version."id" AS "definitionVersionId",
          version."lifecycleStatus" AS "definitionLifecycleStatus", version."payload" AS "definitionPayload"
        FROM source_row
        LEFT JOIN "business_definition_version" version ON version."id" = source_row."businessDefinitionVersionId"
        LEFT JOIN "business_definition" definition ON definition."id" = version."definitionId"
        WHERE 1 = 1 ${keyFilter} ${latestFilter}
        ORDER BY source_row."resourceKey" ASC, source_row."version" DESC, source_row."id" DESC
        LIMIT ${input.take}
      `);
    }
    return this.prisma.$queryRaw<BrainSemanticGovernanceRawRow[]>(Prisma.sql`
      WITH source_row AS (
        SELECT
          relation."id", relation."relationKey" AS "resourceKey", relation."name", relation."version",
          relation."status" AS "sourceStatus", (relation."fromEntityKey" || ' → ' || relation."toEntityKey") AS "sourceDescription",
          relation."joinPath" AS "sourceMetadata", '[]'::jsonb AS "sourceFuzzyTerms",
          relation."businessDefinitionVersionId", relation."updatedAt",
          ROW_NUMBER() OVER (PARTITION BY relation."relationKey" ORDER BY relation."version" DESC, relation."id" DESC) AS row_number,
          (COUNT(*) OVER (PARTITION BY relation."relationKey"))::int AS "historyCount"
        FROM "brain_ontology_relation" relation
      )
      SELECT
        source_row."id", source_row."resourceKey", source_row."name", source_row."version",
        source_row."sourceStatus", source_row."sourceDescription", source_row."sourceMetadata",
        source_row."sourceFuzzyTerms", source_row."updatedAt", source_row."historyCount",
        definition."id" AS "definitionId", definition."definitionKey", definition."status" AS "definitionStatus",
        definition."currentPublishedVersionId", version."id" AS "definitionVersionId",
        version."lifecycleStatus" AS "definitionLifecycleStatus", version."payload" AS "definitionPayload"
      FROM source_row
      LEFT JOIN "business_definition_version" version ON version."id" = source_row."businessDefinitionVersionId"
      LEFT JOIN "business_definition" definition ON definition."id" = version."definitionId"
      WHERE 1 = 1 ${keyFilter} ${latestFilter}
      ORDER BY source_row."resourceKey" ASC, source_row."version" DESC, source_row."id" DESC
      LIMIT ${input.take}
    `);
  }

  private mapSemanticRow(
    resourceType: BrainSemanticGovernanceResourceType,
    row: BrainSemanticGovernanceRawRow,
  ): BrainSemanticGovernanceHistoryItem {
    const payload = this.record(row.definitionPayload ?? {});
    const semanticDescription = firstNonEmptyString(
      payload.semanticDescription,
      payload.description,
      row.sourceDescription,
    );
    const dataTables = uniqueStrings([
      ...collectStrings(row.sourceMetadata),
      ...collectNamedStrings(row.sourceMetadata, TABLE_METADATA_KEYS),
      ...collectNamedStrings(payload, TABLE_METADATA_KEYS),
    ]);
    const fuzzyTerms = uniqueStrings([
      ...collectStrings(row.sourceFuzzyTerms),
      ...collectNamedStrings(payload, FUZZY_TERM_KEYS),
    ]);
    const managed = Boolean(row.definitionId && row.definitionVersionId);
    const enabled = managed
      ? row.definitionStatus === 'active' &&
        row.definitionLifecycleStatus === 'published' &&
        row.currentPublishedVersionId === row.definitionVersionId
      : row.sourceStatus === 'active';
    return {
      id: row.id,
      resourceType,
      resourceKey: row.resourceKey,
      name: row.name,
      version: Number(row.version) || 1,
      status: managed ? (enabled ? 'active' : 'disabled') : row.sourceStatus,
      semanticDescription,
      dataTables,
      fuzzyTerms,
      updatedAt: row.updatedAt,
      managed,
      enabled,
      definitionId: row.definitionId,
      definitionKey: row.definitionKey,
      definitionVersionId: row.definitionVersionId,
    };
  }

  private listPublishedSemanticDefinitions(
    resourceType: BrainSemanticGovernanceResourceType,
    take: number,
  ): Promise<BrainPublishedSemanticDefinitionRow[]> {
    return this.prisma.businessDefinition.findMany({
      where: {
        kind: semanticDefinitionKind(resourceType) as never,
        currentPublishedVersionId: { not: null },
      },
      select: {
        id: true,
        definitionKey: true,
        name: true,
        status: true,
        currentPublishedVersionId: true,
        updatedAt: true,
        currentPublishedVersion: {
          select: {
            id: true,
            version: true,
            payload: true,
            lifecycleStatus: true,
            publishedAt: true,
            createdAt: true,
          },
        },
        _count: { select: { versions: true } },
      },
      orderBy: [{ name: 'asc' }, { definitionKey: 'asc' }],
      take,
    }) as unknown as Promise<BrainPublishedSemanticDefinitionRow[]>;
  }

  private findSemanticDefinition(resourceType: BrainSemanticGovernanceResourceType, resourceKey: string) {
    return this.prisma.businessDefinition.findUnique({
      where: {
        kind_definitionKey: {
          kind: semanticDefinitionKind(resourceType) as never,
          definitionKey: resourceKey,
        },
      },
      select: {
        id: true,
        definitionKey: true,
        name: true,
        status: true,
        currentPublishedVersionId: true,
        updatedAt: true,
        versions: {
          orderBy: [{ version: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            version: true,
            payload: true,
            lifecycleStatus: true,
            publishedAt: true,
            createdAt: true,
          },
        },
      },
    });
  }

  private mapSemanticDefinition(
    resourceType: BrainSemanticGovernanceResourceType,
    definition: BrainPublishedSemanticDefinitionRow,
  ): BrainSemanticGovernanceHistoryItem {
    return this.mapSemanticDefinitionVersion(resourceType, definition, definition.currentPublishedVersion);
  }

  private mapSemanticDefinitionVersion(
    resourceType: BrainSemanticGovernanceResourceType,
    definition: {
      id: number;
      definitionKey: string;
      name: string;
      status: string;
      currentPublishedVersionId: number | null;
      updatedAt: Date;
    },
    version: {
      id: number;
      version: number;
      payload: Prisma.JsonValue;
      lifecycleStatus: string;
      publishedAt: Date | null;
      createdAt: Date;
    },
  ): BrainSemanticGovernanceHistoryItem {
    const payload = this.record(version.payload);
    const enabled = definition.status === 'active' &&
      definition.currentPublishedVersionId === version.id &&
      version.lifecycleStatus === 'published';
    return {
      id: version.id,
      resourceType,
      resourceKey: definition.definitionKey,
      name: definition.name,
      version: version.version,
      status: version.lifecycleStatus === 'published' ? (enabled ? 'active' : 'disabled') : version.lifecycleStatus,
      semanticDescription: firstNonEmptyString(payload.semanticDescription, payload.description),
      dataTables: uniqueStrings(collectNamedStrings(payload, TABLE_METADATA_KEYS)),
      fuzzyTerms: uniqueStrings(collectNamedStrings(payload, FUZZY_TERM_KEYS)),
      updatedAt: version.publishedAt ?? version.createdAt ?? definition.updatedAt,
      managed: true,
      enabled,
      definitionId: definition.id,
      definitionKey: definition.definitionKey,
      definitionVersionId: version.id,
    };
  }

  private assertLegacySkillPayload(payload: Record<string, unknown>) {
    const generatedFields = [
      'sourceFingerprint',
      'definitionRefs',
      'synonyms',
      'negativeExamples',
      'examples',
      'domains',
      'intents',
      'description',
      'successSchema',
    ];
    for (const field of generatedFields) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        throw new BadRequestException(`generated_capability_field_forbidden:${field}`);
      }
    }
  }

  private nonEmpty(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`missing_governance_field:${field}`);
    return value.trim();
  }

  private enumValue(value: unknown, allowed: string[], field: string) {
    if (typeof value !== 'string' || !allowed.includes(value))
      throw new BadRequestException(`invalid_governance_field:${field}`);
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

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code);
}

const TABLE_METADATA_KEYS = new Set([
  'model',
  'models',
  'table',
  'tables',
  'sourceModel',
  'sourceModels',
  'sourceTable',
  'sourceTables',
  'targetModel',
  'targetTable',
  'fromModel',
  'toModel',
]);

const FUZZY_TERM_KEYS = new Set(['alias', 'aliases', 'synonym', 'synonyms', 'fuzzyTerms']);

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function collectNamedStrings(value: unknown, keys: Set<string>): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectNamedStrings(item, keys));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    keys.has(key) ? collectStrings(item) : collectNamedStrings(item, keys),
  );
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  return [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 20);
}

function skillDefinitionKeys(value: unknown, prefix: 'entity.' | 'metric.') {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const definitionKey = (item as Record<string, unknown>).definitionKey;
      return typeof definitionKey === 'string' && definitionKey.startsWith(prefix)
        ? [definitionKey.slice(prefix.length)]
        : [];
    }),
  );
}

function addGraphEdge(
  edges: BrainSemanticGraphEdge[],
  edgeIds: Set<string>,
  source: string,
  target: string,
  kind: BrainSemanticGraphEdge['kind'],
  label: string,
) {
  const id = `${kind}:${source}->${target}`;
  if (edgeIds.has(id) || source === target) return;
  edgeIds.add(id);
  edges.push({ id, source, target, kind, label });
}

function semanticDefinitionKind(resourceType: BrainSemanticGovernanceResourceType) {
  if (resourceType === 'metric') return 'metric';
  if (resourceType === 'ontology_entity') return 'entity';
  return 'relation';
}

function semanticCoreKey(resourceType: BrainSemanticGovernanceResourceType, definitionKey: string) {
  const prefix = `${semanticDefinitionKind(resourceType)}.`;
  return definitionKey.startsWith(prefix) ? definitionKey.slice(prefix.length) : definitionKey;
}
