import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { BUSINESS_OBJECT_CATALOG } from '../src/agent/knowledge/business-object.catalog.js';
import { buildGeneratedModels, computeSchemaHash, parsePrismaModels } from './generate-schema-graph.js';

type Risk = 'low' | 'medium' | 'high';

type SchemaFieldFinding = {
  model: string;
  field: string;
  type: string;
  risk: Risk;
  reason: string;
};

type SchemaCheckReport = {
  generatedAt: string;
  schemaHash: string;
  generatedHash: string | null;
  generatedInSync: boolean;
  generatedModelCount: number;
  schemaModelCount: number;
  missingGeneratedModels: string[];
  missingBusinessObjectMappings: string[];
  missingDisplayNames: SchemaFieldFinding[];
  sensitiveFields: SchemaFieldFinding[];
  sensitiveFieldsWithoutMark: SchemaFieldFinding[];
  gate: {
    passed: boolean;
    blockers: string[];
    warnings: string[];
  };
};

const IMPORTANT_FIELD_PATTERN = /(amount|price|cost|profit|margin|rate|balance|count|total|net|gross|revenue|income|discount|commission|gift|refund|payment|status|type|name|title|no|code|url|path|sku|phone)/i;
const SENSITIVE_FIELD_PATTERN = /phone|mobile|idcard|password|token|secret/i;

function main() {
  const root = resolve(process.cwd());
  const workspaceRoot = resolve(root, '../..');
  const schemaPath = resolve(root, 'prisma/schema.prisma');
  const generatedPath = resolve(root, 'src/agent/knowledge/generated/schema-graph.generated.ts');
  const reportPath = resolve(workspaceRoot, 'docs/04-测试数据/agent-knowledge-schema-check-report.json');

  const schema = readFileSync(schemaPath, 'utf8');
  const schemaHash = computeSchemaHash(schema);
  const schemaModels = parsePrismaModels(schema);
  const generatedText = existsSync(generatedPath) ? readFileSync(generatedPath, 'utf8') : '';
  const generatedHash = extractGeneratedHash(generatedText);
  const generatedModelNames = extractGeneratedModelNames(generatedText);
  const generatedModels = buildGeneratedModels(schema);

  const catalogModels = new Set(BUSINESS_OBJECT_CATALOG.flatMap((item) => item.sourceModels));
  const catalogDisplayFields = new Map(
    BUSINESS_OBJECT_CATALOG.flatMap((item) =>
      item.sourceModels.map((model) => [model, new Set(Object.keys(item.displayFields ?? {}))] as const),
    ),
  );

  const missingGeneratedModels = schemaModels.map((model) => model.name).filter((model) => !generatedModelNames.has(model));
  const missingBusinessObjectMappings = schemaModels
    .map((model) => model.name)
    .filter((model) => !catalogModels.has(model))
    .sort();

  const missingDisplayNames: SchemaFieldFinding[] = [];
  const sensitiveFields: SchemaFieldFinding[] = [];
  const sensitiveFieldsWithoutMark: SchemaFieldFinding[] = [];

  for (const model of generatedModels) {
    const displayFields = catalogDisplayFields.get(model.modelName) ?? new Set<string>();
    for (const field of model.fields) {
      if (isSensitiveField(field.name)) {
        const finding = {
          model: model.modelName,
          field: field.name,
          type: field.type,
          risk: 'high' as const,
          reason: '敏感字段必须在 SchemaGraph 中标记，防止 Agent 输出原始隐私数据。',
        };
        sensitiveFields.push(finding);
        if (!field.sensitive) sensitiveFieldsWithoutMark.push(finding);
      }

      if (
        model.objectType !== 'Unknown' &&
        !field.relation &&
        IMPORTANT_FIELD_PATTERN.test(field.name) &&
        !displayFields.has(field.name) &&
        !isLowValueTechnicalField(field.name)
      ) {
        missingDisplayNames.push({
          model: model.modelName,
          field: field.name,
          type: field.type,
          risk: displayNameRisk(field.name),
          reason: '重要业务字段缺少人工确认的中文展示名，当前只能使用自动 humanize 结果。',
        });
      }
    }
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!generatedHash) blockers.push('schema-graph.generated.ts 缺少 SCHEMA_GRAPH_SOURCE_HASH，请先运行 agent:knowledge:generate。');
  if (generatedHash && generatedHash !== schemaHash) blockers.push('schema.prisma 与 schema-graph.generated.ts hash 不一致，请重新生成 SchemaGraph。');
  if (missingGeneratedModels.length) blockers.push(`schema-graph.generated.ts 缺少 ${missingGeneratedModels.length} 个 Prisma model。`);
  if (sensitiveFieldsWithoutMark.length) blockers.push(`存在 ${sensitiveFieldsWithoutMark.length} 个敏感字段未标记 sensitive。`);
  if (missingBusinessObjectMappings.length) warnings.push(`存在 ${missingBusinessObjectMappings.length} 个 Prisma model 未映射到 BusinessObjectCatalog。`);
  if (missingDisplayNames.length) warnings.push(`存在 ${missingDisplayNames.length} 个重要字段缺少人工中文名。`);

  const report: SchemaCheckReport = {
    generatedAt: new Date().toISOString(),
    schemaHash,
    generatedHash,
    generatedInSync: Boolean(generatedHash && generatedHash === schemaHash && !missingGeneratedModels.length),
    generatedModelCount: generatedModelNames.size,
    schemaModelCount: schemaModels.length,
    missingGeneratedModels,
    missingBusinessObjectMappings,
    missingDisplayNames,
    sensitiveFields,
    sensitiveFieldsWithoutMark,
    gate: {
      passed: blockers.length === 0,
      blockers,
      warnings,
    },
  };

  writeJson(reportPath, report);
  printSummary(report);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  }
  if (!report.gate.passed) process.exitCode = 1;
}

function extractGeneratedHash(text: string) {
  return text.match(/SCHEMA_GRAPH_SOURCE_HASH\s*=\s*['"]([a-f0-9]{64})['"]/)?.[1] ?? text.match(/schemaHash:\s*([a-f0-9]{64})/)?.[1] ?? null;
}

function extractGeneratedModelNames(text: string) {
  return new Set([...text.matchAll(/"modelName":\s*"([^"]+)"/g)].map((match) => match[1]));
}

function displayNameRisk(field: string): Risk {
  if (/(amount|price|cost|profit|margin|rate|balance|revenue|income|commission|refund|payment|gift)/i.test(field)) return 'high';
  if (/(status|type|count|total|discount)/i.test(field)) return 'medium';
  return 'low';
}

function isLowValueTechnicalField(field: string) {
  return /^(id|createdAt|updatedAt|deletedAt|storeId|customerId|productId|projectId|orderId|userId)$/i.test(field);
}

function isSensitiveField(field: string) {
  if (/tokens$/i.test(field) && !/refreshTokens/i.test(field)) return false;
  return SENSITIVE_FIELD_PATTERN.test(field);
}

function printSummary(report: SchemaCheckReport) {
  console.log(
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        gate: report.gate,
        schemaHash: report.schemaHash,
        generatedHash: report.generatedHash,
        generatedInSync: report.generatedInSync,
        generatedModelCount: report.generatedModelCount,
        schemaModelCount: report.schemaModelCount,
        missingGeneratedModels: report.missingGeneratedModels.length,
        missingBusinessObjectMappings: report.missingBusinessObjectMappings.length,
        missingDisplayNames: report.missingDisplayNames.length,
        sensitiveFields: report.sensitiveFields.length,
        sensitiveFieldsWithoutMark: report.sensitiveFieldsWithoutMark.length,
        outputFile: 'docs/04-测试数据/agent-knowledge-schema-check-report.json',
      },
      null,
      2,
    ),
  );
}

function writeJson(path: string, data: unknown) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

main();
