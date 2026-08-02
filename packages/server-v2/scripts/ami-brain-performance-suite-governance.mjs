import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PERFORMANCE_BUCKET_POLICY,
  selectPerformanceCases,
  sha256,
  validatePerformanceManifest,
} from './ami-brain-performance-suite-core.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const CLASSIFICATION_PATH = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-classification-v2.csv');
const SUITE_MANIFEST_PATH = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json');
const OUTPUT_DIR = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-性能回归');
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'ami-brain-performance-suite-v1.json');
const REPORT_PATH = resolve(OUTPUT_DIR, 'Ami-Brain-60题性能回归题集报告-2026-07-29.md');

const classificationRaw = readFileSync(CLASSIFICATION_PATH, 'utf8');
const suiteManifestRaw = readFileSync(SUITE_MANIFEST_PATH, 'utf8');
const suite = JSON.parse(suiteManifestRaw);
const productLoopPath = resolve(REPO_ROOT, suite.productLoopEligibility.path);
const productLoopRaw = readFileSync(productLoopPath, 'utf8');
const rows = parseCsvObjects(classificationRaw);
const selected = selectPerformanceCases(rows, suite.suites.standardRegression.caseIds);
const generatedAt = existingGeneratedAt();
const buckets = Object.fromEntries(
  Object.entries(selected).map(([key, cases]) => {
    const policy = PERFORMANCE_BUCKET_POLICY[key];
    const caseIds = cases.map((item) => item.id);
    return [key, {
      label: policy.label,
      caseCount: policy.count,
      allowedTypes: policy.allowedTypes,
      budgetsMs: policy.budgetsMs,
      caseIds,
      caseIdsChecksum: sha256(caseIds.join('\n')),
      cases: cases.map((item) => ({
        id: item.id,
        domain: item.domain,
        role: item.role,
        type: item.type,
        difficulty: item.difficulty,
        timeSemantics: item.time_semantics,
        productFeatureKey: item.product_feature_key,
        question: item.question,
        expectedTarget: item.expected_target,
      })),
    }];
  }),
);
const allIds = Object.values(buckets).flatMap((bucket) => bucket.caseIds);
const manifest = {
  schemaVersion: 'ami-brain-performance-suite/v1',
  manifestVersion: '2026-07-29-v1',
  status: 'ready_for_execution',
  generatedAt,
  source: {
    classificationPath: relative(CLASSIFICATION_PATH),
    classificationChecksum: sha256(classificationRaw),
    suiteManifestPath: relative(SUITE_MANIFEST_PATH),
    suiteManifestChecksum: sha256(suiteManifestRaw),
    productLoopEligibilityPath: relative(productLoopPath),
    productLoopEligibilityChecksum: sha256(productLoopRaw),
    standardRegressionSuiteKey: suite.suites.standardRegression.key,
    standardRegressionCaseIdsChecksum: suite.suites.standardRegression.caseIdsChecksum,
  },
  policy: {
    executableStatus: 'current_release_test',
    selection: 'deterministic_domain_role_type_difficulty_time_diversity',
    missingTimingEvidence: 'blocking',
    measuredLatency: 'user_response_excluding_judge',
  },
  caseCount: allIds.length,
  caseIdsChecksum: sha256(allIds.join('\n')),
  buckets,
};
validatePerformanceManifest(manifest, { classificationRaw, suiteManifestRaw, productLoopRaw });
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(REPORT_PATH, renderReport(manifest), 'utf8');
console.log(JSON.stringify({
  manifest: relative(OUTPUT_PATH),
  report: relative(REPORT_PATH),
  caseCount: manifest.caseCount,
  caseIdsChecksum: manifest.caseIdsChecksum,
  buckets: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.caseCount])),
}, null, 2));

function parseCsvObjects(raw) {
  const table = parseCsv(raw.replace(/^\uFEFF/, ''));
  const headers = table.shift();
  return table.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quoted) {
      if (char === '"' && raw[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/u, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function existingGeneratedAt() {
  try {
    return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')).generatedAt;
  } catch {
    return '2026-07-29T00:00:00.000+08:00';
  }
}

function relative(path) {
  return path.replace(`${REPO_ROOT}/`, '');
}

function renderReport(manifest) {
  const rows = Object.entries(manifest.buckets).map(([key, bucket]) =>
    `| ${key} | ${bucket.label} | ${bucket.caseCount} | ${bucket.budgetsMs.p50} | ${bucket.budgetsMs.p95} | ${bucket.budgetsMs.max} |`,
  );
  return `# Ami Brain 60 题性能回归题集报告

> manifest：\`${manifest.manifestVersion}\`
> 总题数：${manifest.caseCount}
> case IDs checksum：\`${manifest.caseIdsChecksum}\`

## 固定分桶与预算

| bucket | 场景 | 题数 | P50 ms | P95 ms | max ms |
| --- | --- | ---: | ---: | ---: | ---: |
${rows.join('\n')}

## 准入边界

- 所有题均来自当前 standard-regression，并且产品闭环状态为 \`current_release_test\`。
- 固定题目 ID、来源 checksum、资格 checksum 和每个分桶 checksum；任一变化都必须重新生成。
- 性能只使用用户响应耗时；Judge 和总评测耗时单独记录，不混入产品延迟预算。
- 任一题缺少耗时，或任一分桶缺少完整运行证据，整套性能门禁均为 blocked。
`;
}
