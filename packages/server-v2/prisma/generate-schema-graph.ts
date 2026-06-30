import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { BUSINESS_OBJECT_CATALOG } from '../src/agent/knowledge/business-object.catalog.js';
import type { BusinessObjectType } from '../src/agent/knowledge/knowledge.types.js';
import type { SchemaGraphGeneratedModel, SchemaGraphRelation } from '../src/agent/knowledge/schema-graph.types.js';

type PrismaField = {
  name: string;
  rawType: string;
  type: string;
  attributes: string;
  optional: boolean;
  list: boolean;
  id: boolean;
  unique: boolean;
  indexed: boolean;
  relation: boolean;
};

type PrismaModel = {
  name: string;
  fields: PrismaField[];
  indexes: string[][];
};

const SCALAR_TYPES = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes', 'Unsupported']);

function main() {
  const root = resolve(process.cwd());
  const schemaPath = resolve(root, 'prisma/schema.prisma');
  const outputPath = resolve(root, 'src/agent/knowledge/generated/schema-graph.generated.ts');
  const schema = readFileSync(schemaPath, 'utf8');
  const models = parsePrismaModels(schema);
  const modelNames = new Set(models.map((model) => model.name));
  const generated = models.map((model) => toGeneratedModel(model, modelNames));
  writeGeneratedFile(generated, outputPath);
  console.log(
    JSON.stringify(
      {
        generatedModels: generated.length,
        outputPath,
      },
      null,
      2,
    ),
  );
}

function parsePrismaModels(schema: string): PrismaModel[] {
  const models: PrismaModel[] = [];
  const modelRegex = /^model\s+(\w+)\s+\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(schema))) {
    const name = match[1];
    const body = match[2];
    const rawLines = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//'));
    const indexes = rawLines.filter((line) => line.startsWith('@@')).flatMap(parseModelIndexFields);
    const indexedFields = new Set(indexes.flat());
    const fields = rawLines
      .filter((line) => !line.startsWith('@@'))
      .map(parseFieldLine)
      .filter(Boolean)
      .map((field) => ({ ...field, indexed: field.indexed || indexedFields.has(field.name) })) as PrismaField[];
    models.push({ name, fields, indexes });
  }
  return models;
}

function parseFieldLine(line: string): PrismaField | null {
  const [name, rawType, ...rest] = line.split(/\s+/);
  if (!name || !rawType) return null;
  const attributes = rest.join(' ');
  const optional = rawType.endsWith('?');
  const list = rawType.endsWith('[]');
  const type = rawType.replace(/[?\[\]]/g, '');
  return {
    name,
    rawType,
    type,
    attributes,
    optional,
    list,
    id: attributes.includes('@id'),
    unique: attributes.includes('@unique'),
    indexed: false,
    relation: false,
  };
}

function parseModelIndexFields(line: string) {
  const matched = line.match(/\[(.*?)\]/);
  if (!matched) return [];
  return [
    matched[1]
      .split(',')
      .map((item) => item.trim().replace(/\(.+\)$/, ''))
      .filter(Boolean),
  ];
}

function toGeneratedModel(model: PrismaModel, modelNames: Set<string>): SchemaGraphGeneratedModel {
  const businessObject = BUSINESS_OBJECT_CATALOG.find((item) => item.sourceModels.includes(model.name));
  const queryableFields = new Set(businessObject?.queryableFields ?? []);
  const displayFields = businessObject?.displayFields ?? {};
  const relations = buildRelations(model, modelNames);
  const sourceModels = businessObject?.sourceModels ?? [model.name];
  const fields = model.fields.map((field) => {
    const relation = modelNames.has(field.type) && !SCALAR_TYPES.has(field.type);
    const displayName = displayFields[field.name] ?? humanizeField(field.name);
    return {
      name: field.name,
      displayName,
      type: field.type,
      queryable: queryableFields.has(field.name) || field.id || field.unique || field.indexed || isCommonQueryableField(field.name),
      displayable: Boolean(displayFields[field.name]) || isCommonDisplayField(field.name),
      sensitive: isSensitiveField(field.name),
      optional: field.optional,
      list: field.list,
      id: field.id,
      unique: field.unique,
      indexed: field.indexed,
      relation,
    };
  });
  return {
    modelName: model.name,
    objectType: businessObject?.objectType ?? ('Unknown' as BusinessObjectType),
    displayName: businessObject?.displayName ?? model.name,
    description: businessObject?.description ?? `Prisma 模型 ${model.name}`,
    storeScoped: model.fields.some((field) => field.name === 'storeId') || model.fields.some((field) => field.type === 'Store'),
    sourceModels,
    fields,
    relations,
    generatedFrom: 'prisma',
  };
}

function buildRelations(model: PrismaModel, modelNames: Set<string>): SchemaGraphRelation[] {
  return model.fields
    .filter((field) => modelNames.has(field.type) && !SCALAR_TYPES.has(field.type))
    .map((field) => {
      const relationArgs = parseRelationArgs(field.attributes);
      return {
        fromModel: model.name,
        toModel: field.type,
        relationType: field.list ? 'one_to_many' : relationArgs.fields.length ? 'many_to_one' : 'one_to_one',
        joinFields:
          relationArgs.fields.length && relationArgs.references.length
            ? relationArgs.fields.map((from, index) => ({ from, to: relationArgs.references[index] ?? 'id' }))
            : [{ from: field.name, to: 'id' }],
        businessMeaning: `Prisma relation: ${model.name}.${field.name} -> ${field.type}`,
      } satisfies SchemaGraphRelation;
    });
}

function parseRelationArgs(attributes: string) {
  const relation = attributes.match(/@relation\((.*?)\)/);
  if (!relation) return { fields: [] as string[], references: [] as string[] };
  return {
    fields: parseRelationArray(relation[1], 'fields'),
    references: parseRelationArray(relation[1], 'references'),
  };
}

function parseRelationArray(text: string, key: string) {
  const matched = text.match(new RegExp(`${key}:\\s*\\[(.*?)\\]`));
  if (!matched) return [];
  return matched[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function writeGeneratedFile(models: SchemaGraphGeneratedModel[], outputPath: string) {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const content = `// Auto-generated by prisma/generate-schema-graph.ts. Do not edit manually.\nimport type { SchemaGraphGeneratedModel } from '../schema-graph.types.js';\n\nexport const SCHEMA_GRAPH_GENERATED_MODELS: SchemaGraphGeneratedModel[] = ${JSON.stringify(models, null, 2)};\n`;
  writeFileSync(outputPath, content, 'utf8');
}

function isCommonQueryableField(field: string) {
  return /^(id|storeId|customerId|productId|projectId|beauticianId|orderNo|checkoutGroupNo|status|name|title|phone|sku|slug)$/i.test(field);
}

function isCommonDisplayField(field: string) {
  return /^(id|name|title|status|createdAt|updatedAt|orderNo|checkoutGroupNo|customerName|totalAmount|netAmount|shareUrl|miniappPath|qrCodeUrl)$/i.test(field);
}

function isSensitiveField(field: string) {
  return /phone|mobile|idcard|password|token|secret/i.test(field);
}

function humanizeField(field: string) {
  if (field === 'id') return 'ID';
  return field
    .replace(/Id$/, 'ID')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
}

main();
