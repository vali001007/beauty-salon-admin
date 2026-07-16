import type { PrismaRuntimeDataModel } from './business-definition-snapshot.types.js';

interface PrismaDmmfField {
  readonly name: string;
  readonly kind: string;
  readonly type: string;
  readonly isList?: boolean;
}

interface PrismaDmmfModel {
  readonly name: string;
  readonly fields: readonly PrismaDmmfField[];
}

export function buildPrismaRuntimeDataModelFromClient(
  models: readonly PrismaDmmfModel[],
  prisma: unknown,
): PrismaRuntimeDataModel {
  return buildPrismaRuntimeDataModel(models, readInlineSchema(prisma));
}

export function buildPrismaRuntimeDataModel(
  models: readonly PrismaDmmfModel[],
  inlineSchema?: string,
): PrismaRuntimeDataModel {
  const schemaCardinality = inlineSchema ? parseSchemaCardinality(inlineSchema) : undefined;
  const schemaModels = schemaCardinality
    ? new Set([...schemaCardinality.keys()].map((key) => key.slice(0, key.indexOf('.'))))
    : undefined;
  const runtimeModels = Object.fromEntries(
    models.filter((model) => !schemaModels || schemaModels.has(model.name)).map((model) => [
      model.name,
      Object.freeze({
        fields: Object.freeze(
          model.fields
            .filter((field) => !schemaCardinality || schemaCardinality.has(`${model.name}.${field.name}`))
            .map((field) =>
            Object.freeze({
              name: field.name,
              kind: field.kind,
              type: field.type,
              isList: resolveIsList(model.name, field, schemaCardinality),
            }),
            ),
        ),
      }),
    ]),
  );

  return Object.freeze({ models: Object.freeze(runtimeModels) });
}

function resolveIsList(
  modelName: string,
  field: PrismaDmmfField,
  schemaCardinality: ReadonlyMap<string, boolean> | undefined,
): boolean {
  if (typeof field.isList === 'boolean') return field.isList;
  const schemaValue = schemaCardinality?.get(`${modelName}.${field.name}`);
  if (typeof schemaValue === 'boolean') return schemaValue;
  throw new Error(`prisma_dmmf_cardinality_missing:${modelName}.${field.name}`);
}

function readInlineSchema(prisma: unknown): string | undefined {
  if (!isRecord(prisma)) return undefined;
  const engineConfig = prisma._engineConfig;
  if (!isRecord(engineConfig)) return undefined;
  return typeof engineConfig.inlineSchema === 'string' ? engineConfig.inlineSchema : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSchemaCardinality(schema: string): ReadonlyMap<string, boolean> {
  const cardinality = new Map<string, boolean>();
  let currentModel: string | undefined;
  let inBlockComment = false;

  for (const sourceLine of schema.split(/\r?\n/)) {
    let line = sourceLine;
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end < 0) continue;
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    const blockStart = line.indexOf('/*');
    if (blockStart >= 0) {
      const blockEnd = line.indexOf('*/', blockStart + 2);
      if (blockEnd >= 0) line = `${line.slice(0, blockStart)} ${line.slice(blockEnd + 2)}`;
      else {
        line = line.slice(0, blockStart);
        inBlockComment = true;
      }
    }
    line = line.replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    if (!currentModel) {
      const modelMatch = /^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(line);
      if (modelMatch) currentModel = modelMatch[1];
      continue;
    }
    if (line.startsWith('}')) {
      currentModel = undefined;
      continue;
    }
    if (line.startsWith('@@')) continue;

    const fieldMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+([^\s]+)/.exec(line);
    if (!fieldMatch) continue;
    cardinality.set(`${currentModel}.${fieldMatch[1]}`, fieldMatch[2].endsWith('[]'));
  }

  return cardinality;
}
