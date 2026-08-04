import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AskDataNamedEntityResolver } from '../src/ask-data-free-sql/ask-data-entity-resolver.js';
import { AskDataIntentParser } from '../src/ask-data-free-sql/ask-data-intent-parser.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

type RuntimeContract = {
  id: string;
  question: string;
  supportClass: string;
  runtimeResolutionRequired: boolean;
  mustClarify: boolean;
  allowedClarificationSlots: string[];
};

const strict = process.argv.includes('--strict');
const storeId = positiveInt(argumentValue('--store-id='), 6);
const goldPath = resolve(
  process.cwd(),
  argumentValue('--gold=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold题库-v1.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask命名客户实体真实验收-v1.json',
);
const markdownPath = resolve(
  process.cwd(),
  argumentValue('--markdown=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask命名客户实体真实验收-v1.md',
);
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('database_url_missing');
const databaseHost = new URL(databaseUrl).hostname;
if (!databaseHost.endsWith('.supabase.com')) throw new Error('runtime_entity_eval_requires_approved_supabase_development_database');
if (process.env.NODE_ENV === 'production') throw new Error('runtime_entity_eval_forbidden_in_production');

const gold = JSON.parse(readFileSync(goldPath, 'utf8')) as {
  queryContracts: RuntimeContract[];
  boundaryContracts: RuntimeContract[];
};
const contracts = [...gold.queryContracts, ...gold.boundaryContracts].filter((item) => item.runtimeResolutionRequired);
const prisma = new PrismaService();
const parser = new AskDataIntentParser();
const resolver = new AskDataNamedEntityResolver(prisma);
const results = [];

try {
  for (const item of contracts) {
    const parsed = parser.parse(item.question, new Date('2026-08-02T00:00:00.000Z'));
    const resolved = await resolver.resolve(parsed.semanticIntent, storeId);
    const actualSlots = resolved.semanticIntent.ambiguities.map((ambiguity) => ambiguity.slot);
    const entityMentions = parsed.semanticIntent.entities.map((entity) => ({ type: entity.type, mention: entity.mention }));
    const allResolved = resolved.semanticIntent.entities
      .filter((entity) => /^(?:customer|客户|staff|员工)$/.test(entity.type))
      .every((entity) => Boolean(entity.resolvedValue));
    const expectedClarification = item.mustClarify;
    const actualClarification = Boolean(resolved.clarificationQuestion);
    const classificationMatched = expectedClarification === actualClarification;
    results.push({
      id: item.id,
      question: item.question,
      supportClass: item.supportClass,
      entityMentions,
      expectedSlots: item.allowedClarificationSlots,
      actualSlots,
      expectedClarification,
      actualClarification,
      classificationMatched,
      allResolved,
      clarificationReason: resolved.clarificationReason,
      clarificationQuestion: resolved.clarificationQuestion,
      passed: classificationMatched && (expectedClarification
        ? item.allowedClarificationSlots.some((slot) => actualSlots.includes(slot))
        : allResolved && entityMentions.length > 0),
    });
  }
} finally {
  await prisma.$disconnect();
}

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  connectionMode: 'development_admin_entity_resolution',
  databaseHost,
  storeId,
  caseCount: results.length,
  passedCount: results.filter((item) => item.passed).length,
  passRate: ratio(results.filter((item) => item.passed).length, results.length),
  results,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownPath, `${markdown(report)}\n`);
console.log(JSON.stringify({ outputPath, markdownPath, ...report, results: undefined }, null, 2));
if (strict && report.passRate < 1) process.exitCode = 1;

function markdown(input: typeof report) {
  return [
    '# Ami Ask 命名实体真实验收 v1', '',
    `- 开发门店：${input.storeId}`,
    `- 连接模式：\`${input.connectionMode}\`，只用于客户/员工姓名到内部 ID 的门店内唯一性解析，不代表生产只读 SQL 验收。`,
    `- 结果：${input.passedCount}/${input.caseCount}（${(input.passRate * 100).toFixed(1)}%）。`, '',
    '| ID | 问题 | 解析对象 | 预期 | 实际 | 结果 | 原因 |',
    '|---|---|---|---|---|---|---|',
    ...input.results.map((item) => `| ${item.id} | ${item.question} | ${item.entityMentions.map((entity) => entity.mention).join('、')} | ${item.expectedClarification ? '澄清 ID' : '解析稳定 ID'} | ${item.actualClarification ? '澄清 ID' : item.allResolved ? '已解析 ID' : '未解析'} | ${item.passed ? '通过' : '失败'} | ${item.clarificationReason ?? '-'} |`), '',
    '若运行时唯一性与 Gold 分类不一致，本验收失败并要求重分题目；不得把同名/不存在实体记为 SQL 失败，也不得把未按稳定 ID 过滤的全店聚合记为通过。',
  ].join('\n');
}

function argumentValue(prefix: string) { return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length); }
function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
function ratio(numerator: number, denominator: number) { return denominator ? Number((numerator / denominator).toFixed(4)) : 0; }
