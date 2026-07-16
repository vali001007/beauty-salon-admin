import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  BusinessDefinitionKind,
  BusinessDefinitionSnapshotInput,
  BusinessDefinitionSnapshotProvider,
  PrismaRuntimeDataModel,
} from './business-definition-snapshot.types.js';
import { buildPrismaRuntimeDataModelFromClient } from './prisma-business-definition-data-model.js';

type UnknownRecord = Record<string, unknown>;

@Injectable()
export class PrismaBrainDefinitionSnapshotProviderService implements BusinessDefinitionSnapshotProvider {
  private runtimeDataModel?: PrismaRuntimeDataModel;

  constructor(private readonly prisma: PrismaService) {}

  async loadActiveDefinitions(): Promise<BusinessDefinitionSnapshotInput> {
    const [entities, relations, metrics, dimensions] = await this.prisma.$transaction(
      async (tx) =>
        Promise.all([
          tx.brainOntologyEntity.findMany({
            where: { status: 'active' },
            orderBy: [{ domain: 'asc' }, { entityKey: 'asc' }, { version: 'desc' }],
          }),
          tx.brainOntologyRelation.findMany({
            where: { status: 'active' },
            orderBy: [{ relationKey: 'asc' }, { version: 'desc' }],
          }),
          tx.brainMetric.findMany({
            where: { status: 'active' },
            orderBy: [{ domain: 'asc' }, { metricKey: 'asc' }, { version: 'desc' }],
          }),
          tx.brainDimension.findMany({
            where: { status: 'active' },
            orderBy: [{ domain: 'asc' }, { dimensionKey: 'asc' }, { version: 'desc' }],
          }),
        ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      entities: entities.map((item) => {
        const definition = {
          domain: item.domain,
          entityKey: item.entityKey,
          name: item.name,
          aliases: stringArray(item.synonyms),
          attributes: item.attributes,
          tableMap: item.tableMap,
          version: item.version,
        };
        return withMetadata('entity', item.entityKey, definition);
      }),
      relations: relations.map((item) => {
        const definition = {
          relationKey: item.relationKey,
          fromEntityKey: item.fromEntityKey,
          toEntityKey: item.toEntityKey,
          name: item.name,
          joinPath: item.joinPath,
          version: item.version,
        };
        return withMetadata('relation', item.relationKey, definition);
      }),
      metrics: metrics.map((item) => {
        const definition = {
          metricKey: item.metricKey,
          name: item.name,
          aliases: [],
          domain: item.domain,
          formula: item.formula,
          source: item.sourceTables,
          defaultFilters: item.defaultFilters,
          permissions: item.permissions,
          description: item.description,
          version: item.version,
        };
        return withMetadata('metric', item.metricKey, definition);
      }),
      dimensions: dimensions.map((item) => {
        const definition = {
          dimensionKey: item.dimensionKey,
          name: item.name,
          aliases: [],
          domain: item.domain,
          source: item.source,
          permissions: item.permissions,
          version: item.version,
        };
        return withMetadata('dimension', item.dimensionKey, definition);
      }),
    };
  }

  getRuntimeDataModel(): PrismaRuntimeDataModel {
    if (!this.runtimeDataModel) {
      this.runtimeDataModel = buildPrismaRuntimeDataModelFromClient(Prisma.dmmf.datamodel.models, this.prisma);
    }
    return this.runtimeDataModel;
  }
}

function withMetadata<T extends UnknownRecord>(kind: BusinessDefinitionKind, key: string, definition: T) {
  const fingerprint = createHash('sha256')
    .update(stableStringify(canonicalizeSourceDefinition(kind, definition)))
    .digest('hex');
  return {
    definitionKey: `${kind}:${key}`,
    definitionFingerprint: fingerprint,
    sourceFingerprint: fingerprint,
    ...definition,
  };
}

function canonicalizeSourceDefinition(kind: BusinessDefinitionKind, definition: UnknownRecord): UnknownRecord {
  const canonical = sortObjectKeys(definition) as UnknownRecord;
  if (kind === 'entity') {
    return { ...canonical, aliases: canonicalStringArray(canonical.aliases, true) };
  }
  if (kind === 'metric') {
    return {
      ...canonical,
      source: canonicalStableArray(canonical.source),
      permissions: canonicalStringArray(canonical.permissions, true),
    };
  }
  if (kind === 'dimension') {
    return { ...canonical, permissions: canonicalStringArray(canonical.permissions, true) };
  }
  return canonical;
}

function canonicalStringArray(value: unknown, deduplicate: boolean): unknown {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return sortObjectKeys(value);
  }
  const strings = value.map((item) => item.trim()).filter(Boolean);
  return (deduplicate ? Array.from(new Set(strings)) : strings).sort();
}

function canonicalStableArray(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return sortObjectKeys(value);
  }
  return value.map(sortObjectKeys).sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys(value[key])]),
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
