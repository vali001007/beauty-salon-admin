import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAgentEvalQuestionMarkdown } from '../src/agent/agent-eval-question-bank.js';

type EvalLayer = { layer?: string; passed?: boolean; score?: number; checked?: number; failures?: string[] };
type EvalRecord = {
  questionId: string;
  question: string;
  sourceCategory: string;
  persona: string;
  status: string;
  contractPassed?: boolean;
  runId?: number;
  brainStatus?: string;
  latencyMs?: number;
  answer?: string;
  citations?: Array<{ sourceType?: string; sourceId?: string; label?: string }>;
  domains?: string[];
  capabilityKeys?: string[];
  layers?: Record<string, EvalLayer | undefined> & { intent?: EvalLayer; tool?: EvalLayer };
  grader?: {
    reason?: string;
    expectedIntent?: string;
    actualIntent?: string;
    expectedShape?: string;
    actualShape?: string;
  };
  failureReason?: string;
  error?: string;
};

type EvalResultFile = {
  metadata: {
    generatedAt?: string;
    releaseId?: number;
    storeId?: number;
    questionCount?: number;
  };
  summary: {
    total?: number;
    contractPassed?: number;
    providerUnavailableCount?: number;
    contractPassRate?: number;
  };
  records: EvalRecord[];
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const questionFile = resolve(
  repoRoot,
  'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md',
);
const resultFile = resolve(
  repoRoot,
  'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/ami-brain-eval-run-2026-07-21-release362-final-650/ami-brain-model-driven-eval-results-2026-07-15.json',
);
const outputFile = resolve(
  repoRoot,
  'packages/server-v2/src/brain/eval/generated/ami-brain-650-eval-catalog.ts',
);

for (const file of [questionFile, resultFile]) {
  if (!existsSync(file)) throw new Error(`eval_catalog_source_missing:${file}`);
}

const bank = parseAgentEvalQuestionMarkdown(readFileSync(questionFile, 'utf8'));
const result = JSON.parse(readFileSync(resultFile, 'utf8')) as EvalResultFile;
const records = new Map(result.records.map((record) => [record.questionId, record]));

if (bank.questions.length !== 650 || result.records.length !== 650) {
  throw new Error(`eval_catalog_requires_650:questions=${bank.questions.length}:records=${result.records.length}`);
}

const items = bank.questions.map((question) => {
  const record = records.get(question.id);
  if (!record) throw new Error(`eval_catalog_result_missing:${question.id}`);
  const providerUnavailable = record.status === 'provider_unavailable';
  const passed = providerUnavailable ? null : record.contractPassed === true;
  const failureReason = record.failureReason ?? record.error ?? null;
  return {
    questionId: question.id,
    question: question.input,
    questionType: question.sourceCategory,
    intentType: question.expectedSemanticIntent ?? question.expectedIntentType ?? 'unknown',
    persona: question.persona,
    semanticKeys: uniqueStrings([
      ...(question.expectedDomains ?? []).map((value) => `domain.${value}`),
      ...(question.expectedEntities ?? []).map((value) => `entity.${value}`),
      ...(question.expectedMetrics ?? []).map((value) => `metric.${value}`),
      ...(question.expectedDimensions ?? []).map((value) => `dimension.${value}`),
      ...(record.domains ?? []).map((value) => `domain.${value}`),
      ...(record.capabilityKeys ?? []).map((value) => `capability.${value}`),
    ]).slice(0, 12),
    dataTables: uniqueStrings(question.expectedDataSources ?? []).slice(0, 12),
    passed,
    status: record.status,
    hitRate: providerUnavailable ? null : semanticHitRate(record.layers),
    runId: record.runId ?? null,
    failureReason,
    diagnosis: diagnosis(record, passed, failureReason),
    improvementSuggestion: improvementSuggestion(record, passed, failureReason),
    testHistory: [{
      releaseId: result.metadata.releaseId ?? null,
      generatedAt: result.metadata.generatedAt ?? null,
      runId: record.runId ?? null,
      status: record.status,
      brainStatus: record.brainStatus ?? null,
      passed,
      latencyMs: typeof record.latencyMs === 'number' ? record.latencyMs : null,
      answer: record.answer ?? '',
      graderReason: record.grader?.reason ?? null,
      expectedIntent: record.grader?.expectedIntent ?? null,
      actualIntent: record.grader?.actualIntent ?? null,
      expectedShape: record.grader?.expectedShape ?? null,
      actualShape: record.grader?.actualShape ?? null,
      capabilityKeys: uniqueStrings(record.capabilityKeys ?? []),
      citations: (record.citations ?? []).map((citation) => ({
        sourceType: citation.sourceType ?? 'unknown',
        sourceId: citation.sourceId ?? 'unknown',
        label: citation.label ?? citation.sourceId ?? '未命名依据',
      })),
      layers: Object.entries(record.layers ?? {}).flatMap(([key, layer]) => layer ? [{
        layer: layer.layer ?? key,
        passed: typeof layer.passed === 'boolean' ? layer.passed : null,
        score: typeof layer.score === 'number' ? layer.score : null,
        checked: typeof layer.checked === 'number' ? layer.checked : null,
        failures: uniqueStrings(layer.failures ?? []),
      }] : []),
    }],
  };
});

const availableHitRates = items.map((item) => item.hitRate).filter((value): value is number => value !== null);
const passed = items.filter((item) => item.passed === true).length;
const unavailable = items.filter((item) => item.passed === null).length;
const snapshot = {
  metadata: {
    generatedAt: result.metadata.generatedAt ?? new Date().toISOString(),
    sourceGeneratedAt: result.metadata.generatedAt ?? null,
    releaseId: result.metadata.releaseId ?? null,
    storeId: result.metadata.storeId ?? null,
    total: items.length,
    passed,
    failed: items.length - passed - unavailable,
    unavailable,
    passRate: result.summary.contractPassRate ?? (items.length - unavailable > 0 ? passed / (items.length - unavailable) : null),
    averageHitRate: availableHitRates.length
      ? availableHitRates.reduce((sum, value) => sum + value, 0) / availableHitRates.length
      : null,
    sourceQuestionFile: 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md',
    sourceResultFile: 'ami-brain-eval-run-2026-07-21-release362-final-650/ami-brain-model-driven-eval-results-2026-07-15.json',
  },
  items,
};

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(
  outputFile,
  `import type { BrainEvalCatalogSnapshot } from '../brain-eval-catalog.types.js';\n\nconst snapshot: BrainEvalCatalogSnapshot = ${JSON.stringify(snapshot)};\n\nexport default snapshot;\n`,
  'utf8',
);
console.log(JSON.stringify({ outputFile, total: items.length, passed: snapshot.metadata.passed, failed: snapshot.metadata.failed, unavailable }));

function semanticHitRate(layers: EvalRecord['layers']) {
  const scores = [layers?.intent?.score, layers?.tool?.score].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (!scores.length) return null;
  return Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 1000) / 1000;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function diagnosis(record: EvalRecord, passed: boolean | null, failureReason: string | null) {
  if (passed === null) return '基础设施异常，本题未形成可用于发布判断的有效结果。';
  if (passed) return '意图、能力、执行与回答契约通过，未发现阻塞问题。';
  if (record.grader?.reason) return record.grader.reason;
  if (failureReason?.includes('intent_mismatch')) return '意图识别或回答形态与题目预期不一致。';
  if (failureReason?.includes('metric_missing')) return '回答缺少题目要求的受治理指标。';
  if (failureReason?.includes('capability_any_of_missing')) return '能力路由未命中题目允许的任一业务能力。';
  return `评测未通过：${failureReason ?? record.status}`;
}

function improvementSuggestion(record: EvalRecord, passed: boolean | null, failureReason: string | null) {
  const failures = Object.values(record.layers ?? {}).flatMap((layer) => layer?.failures ?? []);
  const evidence = [failureReason ?? '', ...failures].join('|');
  if (passed === null) return '恢复模型或依赖服务后重试，继续将该题排除在通过率分母之外。';
  if (passed) return '保持当前语义和能力绑定，并纳入后续版本回归监控。';
  if (evidence.includes('intent_mismatch') || evidence.includes('answer_shape_mismatch')) {
    return '补充该问法的意图正反例，校准目标意图与回答形态后重新回归。';
  }
  if (evidence.includes('metric_missing')) {
    return '补齐指标定义及能力 definitionRefs，确认指标已发布并可被当前角色访问。';
  }
  if (evidence.includes('capability_any_of_missing')) {
    return '补齐并发布对应业务能力，检查能力候选、角色授权和领域绑定。';
  }
  if (evidence.includes('plan_')) return '修正规划模板与必需节点，确保执行计划覆盖题目目标。';
  if (evidence.includes('grounding_missing')) return '补齐真实数据引用和口径证据，禁止无依据回答进入通过结果。';
  if (evidence.includes('brain_status:failed') || record.status === 'metric_failed') {
    return '排查语义查询及能力执行失败原因，修复后对该题执行定向回归。';
  }
  return '依据失败层逐项修复，并对该题及同类问法执行定向回归。';
}
