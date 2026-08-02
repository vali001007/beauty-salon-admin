import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { productLoopFeatureDefinitions } from './ami-brain-product-loop-registry.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const OUTPUT_DIR = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-全领域题集治理');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'ami-brain-product-loop-data-facts-v1.json');
const SCHEMA_PATH = resolve(SERVER_ROOT, 'prisma/schema.prisma');
const STORE_ID = 6;
const APPROVED_HOST = 'aws-1-ap-northeast-1.pooler.supabase.com';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const databaseHost = new URL(databaseUrl).hostname;
if (databaseHost !== APPROVED_HOST) throw new Error(`unapproved database host:${databaseHost}`);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 }),
});
try {
  const modelDefinitions = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  const modelNames = [...new Set(productLoopFeatureDefinitions().flatMap((feature) => feature.models))].sort();
  const modelCounts = {};
  for (const modelName of modelNames) {
    const definition = modelDefinitions.get(modelName);
    const delegate = prisma[lowerFirst(modelName)];
    if (!definition || !delegate?.count) {
      modelCounts[modelName] = { status: 'unavailable', count: null, scope: null };
      continue;
    }
    const storeScoped = definition.fields.some((field) => field.name === 'storeId');
    try {
      const count = await delegate.count({ where: storeScoped ? { storeId: STORE_ID } : undefined });
      modelCounts[modelName] = {
        status: 'queried',
        count,
        scope: storeScoped ? `storeId=${STORE_ID}` : 'global',
      };
    } catch (error) {
      modelCounts[modelName] = {
        status: 'query_failed',
        count: null,
        scope: storeScoped ? `storeId=${STORE_ID}` : 'global',
        errorCode: String(error?.code ?? error?.name ?? 'unknown'),
      };
    }
  }
  const features = Object.fromEntries(productLoopFeatureDefinitions().map((feature) => {
    const facts = feature.models.map((model) => ({ model, ...modelCounts[model] }));
    const primary = facts[0];
    const queryComplete = facts.every((item) => item.status === 'queried');
    const hasPrimaryFacts = primary?.count > 0;
    return [feature.featureKey, {
      domain: feature.domain,
      expectedTargets: feature.expectedTargets,
      status: queryComplete && hasPrimaryFacts ? 'present' : 'evidence_review_required',
      reason: !queryComplete
        ? '至少一个事实模型无法完成只读计数。'
        : hasPrimaryFacts
          ? '核心事实模型存在真实记录，全部声明的数据来源均已完成只读计数。'
          : '核心事实模型当前没有真实记录，不能证明该功能具备可测试业务事实。',
      primaryModel: feature.models[0],
      modelFacts: facts,
    }];
  }));
  const schemaRaw = readFileSync(SCHEMA_PATH, 'utf8');
  const snapshotBody = JSON.stringify({ storeId: STORE_ID, modelCounts });
  const schemaChecksum = sha256(schemaRaw);
  const snapshotChecksum = sha256(snapshotBody);
  const artifact = {
    schemaVersion: 'ami-brain-product-loop-data-facts/v1',
    generatedAt: stableGeneratedAt(schemaChecksum, snapshotChecksum),
    environment: 'approved_supabase_development_read_only',
    databaseHost,
    storeId: STORE_ID,
    schemaPath: relative(SCHEMA_PATH),
    schemaChecksum,
    snapshotChecksum,
    summary: {
      featureCount: Object.keys(features).length,
      present: Object.values(features).filter((item) => item.status === 'present').length,
      evidenceReviewRequired: Object.values(features).filter((item) => item.status !== 'present').length,
    },
    features,
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: relative(OUTPUT_PATH),
    databaseHost,
    storeId: STORE_ID,
    summary: artifact.summary,
    unresolvedFeatures: Object.entries(features).filter(([, value]) => value.status !== 'present').map(([key]) => key),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}

function lowerFirst(value) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function relative(path) {
  return path.replace(`${REPO_ROOT}/`, '');
}

function stableGeneratedAt(schemaChecksum, snapshotChecksum) {
  try {
    const previous = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
    if (
      previous.schemaChecksum === schemaChecksum &&
      previous.snapshotChecksum === snapshotChecksum &&
      previous.databaseHost === databaseHost &&
      previous.storeId === STORE_ID
    ) {
      return previous.generatedAt;
    }
  } catch {
    // A missing or invalid previous artifact starts a new auditable snapshot.
  }
  return new Date().toISOString();
}
