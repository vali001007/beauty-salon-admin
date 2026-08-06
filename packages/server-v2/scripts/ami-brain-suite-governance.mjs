import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertProductLoopRegistry,
  PRODUCT_LOOP_DATA_FACTS_PATH,
  resolveProductLoopEligibility,
  supplementalQuestionRegistry,
  SUPPLEMENTAL_QUESTION_REGISTRY_PATH,
} from './ami-brain-product-loop-registry.mjs';
import { inspectAmiBrainTestQuestionSource } from './ami-brain-test-question-governance-core.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const SOURCE_PATH = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-全领域实测问题集-2000.csv',
);
const OUTPUT_DIR = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-全领域题集治理');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'ami-brain-suite-manifest-v2.json');
const CLASSIFICATION_PATH = resolve(OUTPUT_DIR, 'ami-brain-suite-classification-v2.csv');
const REPORT_PATH = resolve(OUTPUT_DIR, 'Ami-Brain-2000题覆盖签名与分层精简报告-2026-07-28.md');
const PRODUCT_LOOP_PATH = resolve(OUTPUT_DIR, 'ami-brain-product-loop-eligibility-v1.json');
const NEXT_ITERATION_PATH = resolve(OUTPUT_DIR, 'ami-brain-next-iteration-feature-candidates-v1.json');
const METRIC_DEFINITION_PATH = resolve(OUTPUT_DIR, 'ami-brain-metric-definition-governance-required-v1.json');

const MANIFEST_VERSION = '2026-08-06-v6';
// Reviewed contract correction: BQ0823/BQ0824 and their quarter/14-day rotations now target
// card-recognized revenue or paid-vs-recognized comparison instead of unrelated order profit.
const FROZEN_BASELINE_V1_CHECKSUM = '75950821c4fa8604069b84be0021dc60ba722d569b6eb0597bf462a76c1dd4e7';
const RELEASE_CORE_TARGET = 350;
const STANDARD_MIN = 1000;
const STANDARD_TARGET = 1040;
const STANDARD_MAX = 1100;
const TARGETED_12 = [
  'BQ1924',
  'BQ1927',
  'BQ1930',
  'BQ1948',
  'BQ1949',
  'BQ1950',
  'BQ1951',
  'BQ1956',
  'BQ1957',
  'BQ1958',
  'BQ1961',
  'BQ1964',
];
const PRODUCT_JOURNEY_DEFINITIONS = [
  {
    caseId: 'BQ0627',
    journeyKeys: ['query', 'processing', 'failure_recovery'],
    expectedStatus: 'current_release_test',
    expectedSuite: 'standard-regression',
    fixtureReferences: [
      {
        path: 'src/app/pages/brain/BrainWorkspace.test.tsx',
        marker: 'BQ0627',
        questionMarker: '最近三个月的实收流水',
        evidenceKind: 'automated_test',
      },
      {
        path: 'packages/app/src/app/components/ChatInput.test.tsx',
        marker: 'BQ0627',
        questionMarker: '最近三个月的实收流水',
        evidenceKind: 'automated_test',
      },
    ],
  },
  {
    caseId: 'BQ0705',
    journeyKeys: ['new_conversation_isolation'],
    expectedStatus: 'current_release_test',
    expectedSuite: 'standard-regression',
    fixtureReferences: [
      {
        path: 'src/app/pages/brain/BrainWorkspace.test.tsx',
        marker: 'BQ0705',
        questionMarker: '今天各支付方式的金额分别多少',
        evidenceKind: 'automated_test',
      },
    ],
  },
  {
    caseId: 'BQ0500',
    journeyKeys: ['structured_result', 'empty_result'],
    expectedStatus: 'current_release_test',
    expectedSuite: 'release-core',
    fixtureReferences: [
      {
        path: 'src/app/pages/brain/components/BrainResponseRenderer.test.tsx',
        marker: 'BQ0500',
        questionMarker: '本月各项目的销量排行',
        evidenceKind: 'automated_test',
      },
      {
        path: 'packages/app/src/app/components/ChatMessage.test.tsx',
        marker: 'BQ0500',
        questionMarker: '本月各项目的销量排行',
        evidenceKind: 'automated_test',
      },
    ],
  },
  {
    caseId: 'BQ1965',
    journeyKeys: ['clarification'],
    expectedStatus: 'current_release_test',
    expectedSuite: 'release-core',
    fixtureReferences: [
      {
        path: 'packages/app/src/app/components/ChatMessage.test.tsx',
        marker: 'BQ1965',
        questionMarker: '本月怎么样',
        evidenceKind: 'automated_test',
      },
      {
        path: 'packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.brain.test.ts',
        marker: 'BQ1965',
        questionMarker: '本月怎么样',
        evidenceKind: 'automated_test',
      },
    ],
  },
  {
    caseId: 'BQ1933',
    journeyKeys: ['follow_up', 'multi_turn'],
    expectedStatus: 'current_release_test',
    expectedSuite: 'release-core',
    fixtureReferences: [
      {
        path: 'packages/app/src/app/components/ChatMessage.test.tsx',
        marker: 'BQ1933',
        questionMarker: '第1轮:先看上周流水 → 第2轮:跟昨天比呢',
        evidenceKind: 'automated_test',
      },
      {
        path: 'packages/Ami-Aura-Lite-Kiosk/src/app/services/agentRuntimeService.brain.test.ts',
        marker: 'BQ1933',
        questionMarker: '第1轮:先看上周流水 → 第2轮:跟昨天比呢',
        evidenceKind: 'automated_test',
      },
    ],
  },
  {
    caseId: 'BQ0211',
    journeyKeys: ['action_preview', 'action_decision', 'action_receipt'],
    expectedStatus: 'current_release_test',
    expectedSuite: 'release-core',
    fixtureReferences: [
      {
        path: 'src/app/pages/brain/components/BrainActionPreview.test.tsx',
        marker: 'BQ0211',
        questionMarker: '帮王静怡新建客户档案，电话138xxxx807',
        evidenceKind: 'automated_test',
      },
      {
        path: 'packages/app/src/api/brain-action-decision.test.ts',
        marker: 'BQ0211',
        questionMarker: '帮王静怡新建客户档案，电话138xxxx807',
        evidenceKind: 'automated_test',
      },
    ],
  },
  {
    caseId: 'BQ0355',
    journeyKeys: ['capability_boundary'],
    expectedStatus: 'next_iteration_feature',
    expectedSuite: 'next-iteration-feature',
    fixtureReferences: [
      {
        path: 'src/app/pages/brain/components/BrainResponseRenderer.test.tsx',
        marker: 'BQ0355',
        questionMarker: '哪个美容师上个月客户流失偏多',
        evidenceKind: 'automated_test',
      },
    ],
  },
  {
    caseId: 'BQ1921',
    journeyKeys: ['evidence_review_boundary'],
    expectedStatus: 'evidence_review_required',
    expectedSuite: 'evidence-review-required',
    fixtureReferences: [
      {
        path: 'docs/03-开发计划/01-AI智能体与问数能力/07-Ami-Brain-当前主线/Ami-Brain-跨端响应与产品状态合同-v1-2026-07-29.md',
        marker: 'BQ1921',
        questionMarker: '第1轮:先看今天流水 → 第2轮:跟双十一期间比呢',
        evidenceKind: 'boundary_document',
      },
    ],
  },
];
const SPECIAL_TYPES = new Set(['ambiguity', 'permission', 'multi_turn']);
const PROTECTED_TIME_SEMANTICS = new Set([
  'today',
  'natural_week',
  'natural_month',
  'rolling_30d',
  'campaign_period',
]);
const THRESHOLDS = [0.92, 0.9, 0.88, 0.86, 0.85, 0.84, 0.83, 0.82, 0.8];
const TIME_PATTERNS = [
  ['today', /今天|今日|当天/u],
  ['yesterday', /昨天|昨日/u],
  ['natural_week', /本周|这周|本星期|这星期/u],
  ['previous_week', /上周|上星期/u],
  ['natural_month', /本月|这个月|当月/u],
  ['previous_month', /上月|上个月/u],
  ['natural_year', /今年|本年/u],
  ['rolling_7d', /最近\s*7\s*天|近\s*7\s*天/u],
  ['rolling_14d', /最近\s*14\s*天|近\s*14\s*天/u],
  ['rolling_30d', /最近\s*30\s*天|近\s*30\s*天/u],
  ['rolling_3m', /最近三个月|近三个月|最近\s*3\s*个月/u],
  ['campaign_period', /五一假期|国庆期间|双十一期间|春节期间|节假日期间/u],
  ['half_year', /这半年|最近半年|近半年/u],
  ['quarter', /这个季度|本季度|上季度/u],
  ['year_over_year', /去年同期/u],
  ['weekend', /本周末|这周末/u],
];

const rawSource = readFileSync(SOURCE_PATH, 'utf8');
const sourceText = rawSource.replace(/^\uFEFF/, '');
const productLoopDataFactsRaw = readFileSync(PRODUCT_LOOP_DATA_FACTS_PATH, 'utf8');
const productLoopDataFacts = JSON.parse(productLoopDataFactsRaw);
const supplementalQuestionRegistryRaw = readFileSync(SUPPLEMENTAL_QUESTION_REGISTRY_PATH, 'utf8');
const supplementalRegistry = supplementalQuestionRegistry();
const sourceChecksum = sha256(sourceText);
if (sourceChecksum !== FROZEN_BASELINE_V1_CHECKSUM) {
  throw new Error(
    `frozen baseline changed; every new or changed question must be reviewed before governance:${sourceChecksum}`,
  );
}
const cases = parseCases(sourceText);
if (cases.length < 2000) {
  throw new Error(`baseline case count cannot shrink below the frozen 2000 cases, received ${cases.length}`);
}
assertProductLoopRegistry(REPO_ROOT);
const baselineProductLoopCases = cases.map((item) => ({
  ...item,
  productLoop: resolveProductLoopEligibility(item, { admission: 'frozen_baseline_v1' }),
}));
const baselineIds = new Set(baselineProductLoopCases.map((item) => item.id));
const duplicateSupplementalIds = supplementalRegistry.cases.filter((item) => baselineIds.has(item.id)).map((item) => item.id);
if (duplicateSupplementalIds.length) {
  throw new Error(`supplemental question ids overlap frozen baseline:${duplicateSupplementalIds.join(',')}`);
}
const supplementalProductLoopCases = supplementalRegistry.cases.map((item) => ({
  ...item,
  productLoop: resolveProductLoopEligibility(item, { supplementalRegistry }),
  source: 'supplemental_question_registry_v1',
}));
const productLoopCases = [...baselineProductLoopCases, ...supplementalProductLoopCases];
const currentReleaseCases = baselineProductLoopCases.filter((item) => item.productLoop.status === 'current_release_test');
const nextIterationCases = baselineProductLoopCases.filter((item) => item.productLoop.status === 'next_iteration_feature');
const evidenceReviewCases = baselineProductLoopCases.filter((item) => item.productLoop.status === 'evidence_review_required');
const metricDefinitionCases = baselineProductLoopCases.filter(
  (item) => item.productLoop.status === 'metric_definition_governance_required',
);
const allCurrentReleaseCases = productLoopCases.filter((item) => item.productLoop.status === 'current_release_test');
const allNextIterationCases = productLoopCases.filter((item) => item.productLoop.status === 'next_iteration_feature');
const allEvidenceReviewCases = productLoopCases.filter((item) => item.productLoop.status === 'evidence_review_required');
const allMetricDefinitionCases = productLoopCases.filter(
  (item) => item.productLoop.status === 'metric_definition_governance_required',
);
// Evidence-review and metric-definition-governance cases remain registered for traceability,
// but are excluded from executable suites.
// They must not block generation: the product policy explicitly separates uncertain evidence from
// current-release failures, next-iteration feature gaps and product metric-governance gaps.
const supplementalReleaseCoreCases = supplementalProductLoopCases.filter(
  (item) => item.productLoop.status === 'current_release_test' && item.productLoop.admission?.suiteAssignment === 'release-core',
);
const supplementalStandardCases = supplementalProductLoopCases.filter(
  (item) =>
    item.productLoop.status === 'current_release_test' && item.productLoop.admission?.suiteAssignment === 'standard-regression',
);
const supplementalRotationCases = supplementalProductLoopCases.filter(
  (item) =>
    item.productLoop.status === 'current_release_test' && item.productLoop.admission?.suiteAssignment === 'extended-rotation',
);

const ids = new Set(baselineProductLoopCases.map((item) => item.id));
for (const id of TARGETED_12) {
  if (!ids.has(id)) throw new Error(`targeted case is missing from baseline: ${id}`);
}

const originalPreflight140 = selectLegacyPreflight(baselineProductLoopCases).map((item) => item.id);
const currentReleaseIds = new Set(currentReleaseCases.map((item) => item.id));
const productLoopStatusById = new Map(baselineProductLoopCases.map((item) => [item.id, item.productLoop.status]));
const targetedCurrent = TARGETED_12.filter((id) => currentReleaseIds.has(id));
const targetedNextIteration = TARGETED_12.filter((id) => productLoopStatusById.get(id) === 'next_iteration_feature');
const targetedEvidenceReview = TARGETED_12.filter((id) => productLoopStatusById.get(id) === 'evidence_review_required');
const targetedMetricDefinition = TARGETED_12.filter(
  (id) => productLoopStatusById.get(id) === 'metric_definition_governance_required',
);
const originalEligiblePreflight = originalPreflight140.filter((id) => currentReleaseIds.has(id));
const preflight140 = uniqueById([
  ...originalEligiblePreflight.map((id) => baselineProductLoopCases.find((item) => item.id === id)),
  ...selectLegacyPreflight(currentReleaseCases),
].filter(Boolean)).slice(0, 140).map((item) => item.id);
if (preflight140.length !== 140) throw new Error(`eligible preflight count unavailable:${preflight140.length}/140`);
const preflightReplacements = preflight140.filter((id) => !originalPreflight140.includes(id));
const preflightNextIteration = originalPreflight140.filter(
  (id) => productLoopStatusById.get(id) === 'next_iteration_feature',
);
const preflightEvidenceReview = originalPreflight140.filter(
  (id) => productLoopStatusById.get(id) === 'evidence_review_required',
);
const preflightMetricDefinition = originalPreflight140.filter(
  (id) => productLoopStatusById.get(id) === 'metric_definition_governance_required',
);
const legacyRequired = new Set([...targetedCurrent, ...preflight140]);
const attempts = THRESHOLDS.map((threshold) => buildClusters(currentReleaseCases, threshold, legacyRequired));
const selectedAttempt = attempts
  .filter((attempt) => attempt.keepIds.size >= STANDARD_MIN && attempt.keepIds.size <= STANDARD_MAX)
  .sort((left, right) => {
    const distance = Math.abs(left.keepIds.size - STANDARD_TARGET) - Math.abs(right.keepIds.size - STANDARD_TARGET);
    return distance || right.threshold - left.threshold;
  })[0];

if (!selectedAttempt) {
  throw new Error(
    `no conservative threshold produced ${STANDARD_MIN}-${STANDARD_MAX} cases: ${attempts
      .map((item) => `${item.threshold}=${item.keepIds.size}`)
      .join(',')}`,
  );
}

const standardKeepIds = normalizeStandardKeepIds(
  currentReleaseCases,
  selectedAttempt.keepIds,
  legacyRequired,
  STANDARD_TARGET,
);
const baselineStandardIds = orderIds(baselineProductLoopCases, standardKeepIds);
const baselineRotationIds = currentReleaseCases.filter((item) => !standardKeepIds.has(item.id)).map((item) => item.id);
const baselineReleaseCoreIds = buildReleaseCore(currentReleaseCases, standardKeepIds, legacyRequired, RELEASE_CORE_TARGET);
const supplementalReleaseCoreIds = supplementalReleaseCoreCases.map((item) => item.id);
const standardIds = [
  ...baselineStandardIds,
  ...supplementalReleaseCoreIds,
  ...supplementalStandardCases.map((item) => item.id),
];
const rotationIds = [...baselineRotationIds, ...supplementalRotationCases.map((item) => item.id)];
const nextIterationIds = allNextIterationCases.map((item) => item.id);
const evidenceReviewIds = allEvidenceReviewCases.map((item) => item.id);
const metricDefinitionIds = allMetricDefinitionCases.map((item) => item.id);
const releaseCoreIds = [...baselineReleaseCoreIds, ...supplementalReleaseCoreIds];

assertSubset('legacy targeted eligible', targetedCurrent, releaseCoreIds);
assertSubset('legacy preflight', preflight140, releaseCoreIds);
assertSubset('release core', releaseCoreIds, standardIds);
if (baselineReleaseCoreIds.length !== RELEASE_CORE_TARGET) {
  throw new Error(`baseline release core count must be ${RELEASE_CORE_TARGET}, received ${baselineReleaseCoreIds.length}`);
}
if (releaseCoreIds.length < 300 || releaseCoreIds.length > 400) {
  throw new Error(`release core count outside policy: ${releaseCoreIds.length}`);
}
if (standardIds.length < STANDARD_MIN || standardIds.length > STANDARD_MAX) {
  throw new Error(`standard regression count outside policy: ${standardIds.length}`);
}
if (new Set([...standardIds, ...rotationIds, ...nextIterationIds, ...evidenceReviewIds, ...metricDefinitionIds]).size !== productLoopCases.length) {
  throw new Error('governed suites do not cover every registered question');
}

const productLoopCaseById = new Map(productLoopCases.map((item) => [item.id, item]));
const productJourneyCases = PRODUCT_JOURNEY_DEFINITIONS.map((definition) => {
  const item = productLoopCaseById.get(definition.caseId);
  if (!item) throw new Error(`product journey case is missing:${definition.caseId}`);
  const suite = releaseCoreIds.includes(item.id)
    ? 'release-core'
    : standardIds.includes(item.id)
      ? 'standard-regression'
      : rotationIds.includes(item.id)
        ? 'extended-rotation'
        : nextIterationIds.includes(item.id)
          ? 'next-iteration-feature'
          : evidenceReviewIds.includes(item.id)
            ? 'evidence-review-required'
            : metricDefinitionIds.includes(item.id)
              ? 'metric-definition-governance-required'
              : 'unassigned';
  if (item.productLoop.status !== definition.expectedStatus || suite !== definition.expectedSuite) {
    throw new Error(
      `product journey eligibility mismatch:${item.id}:${item.productLoop.status}:${suite}`,
    );
  }
  for (const reference of definition.fixtureReferences) {
    const fixturePath = resolve(REPO_ROOT, reference.path);
    const fixtureRaw = existsSync(fixturePath) ? readFileSync(fixturePath, 'utf8') : '';
    if (!fixtureRaw.includes(reference.marker)) {
      throw new Error(`product journey fixture marker missing:${item.id}:${reference.path}:${reference.marker}`);
    }
    if (reference.marker !== item.id || reference.questionMarker !== item.question || !fixtureRaw.includes(item.question)) {
      throw new Error(`product journey fixture question mismatch:${item.id}:${reference.path}`);
    }
    if (reference.evidenceKind === 'automated_test') {
      const registeredReferences = inspectAmiBrainTestQuestionSource({
        repoRoot: REPO_ROOT,
        eligibility: { schemaVersion: 'ami-brain-product-loop-eligibility/v1', cases: productLoopCases },
        path: reference.path,
      });
      if (!registeredReferences.some((candidate) => candidate.id === item.id)) {
        throw new Error(
          `product journey automated fixture is not a registered question literal:${item.id}:${reference.path}`,
        );
      }
    } else if (reference.evidenceKind !== 'boundary_document') {
      throw new Error(`product journey fixture evidence kind invalid:${item.id}:${reference.path}`);
    }
  }
  if (
    item.productLoop.status === 'current_release_test' &&
    !definition.fixtureReferences.some((reference) => reference.evidenceKind === 'automated_test')
  ) {
    throw new Error(`current product journey lacks automated test evidence:${item.id}`);
  }
  return {
    caseId: item.id,
    question: item.question,
    journeyKeys: definition.journeyKeys,
    status: item.productLoop.status,
    suite,
    executable: item.productLoop.status === 'current_release_test',
    fixtureReferences: definition.fixtureReferences,
  };
});
const currentProductJourneyCaseIds = productJourneyCases
  .filter((item) => item.status === 'current_release_test')
  .map((item) => item.caseId);

const generatedAt = existingGeneratedAt();
const baselineClassifications = baselineProductLoopCases.map((item) => {
  if (item.productLoop.status !== 'current_release_test') {
    return {
      ...item,
      status: item.productLoop.status === 'next_iteration_feature' ? 'NEXT_ITERATION' : 'REVIEW',
      representativeCaseId: item.id,
      similarity: 1,
      clusterId: `product-loop:${item.productLoop.featureKey}`,
      reason: item.productLoop.reason,
    };
  }
  const cluster = selectedAttempt.caseToCluster.get(item.id);
  const kept = standardKeepIds.has(item.id);
  const representative = kept ? item : closestRepresentative(item, cluster?.keptRepresentatives ?? []);
  const representativeCaseId = representative?.id ?? item.id;
  const similarity = kept ? 1 : similarityScore(item.normalizedQuestion, representative?.normalizedQuestion ?? '');
  return {
    ...item,
    status: kept ? 'KEEP' : 'ROTATE',
    representativeCaseId,
    similarity,
    clusterId: cluster?.id ?? `singleton:${item.id}`,
    reason: kept
      ? legacyRequired.has(item.id)
        ? 'legacy_gate_required'
        : 'coverage_representative'
      : 'same_metadata_and_near_duplicate_wording_with_noncritical_parameter_variation',
  };
});
const supplementalClassifications = supplementalProductLoopCases.map((item) => {
  const suiteAssignment = item.productLoop.admission?.suiteAssignment;
  const status =
    item.productLoop.status === 'next_iteration_feature'
      ? 'NEXT_ITERATION'
      : item.productLoop.status === 'evidence_review_required'
        ? 'REVIEW'
        : suiteAssignment === 'extended-rotation'
          ? 'ROTATE'
          : 'KEEP';
  return {
    ...item,
    status,
    representativeCaseId: item.id,
    similarity: 1,
    clusterId: `supplemental:${item.id}`,
    reason:
      item.productLoop.status === 'current_release_test'
        ? `supplemental_explicit_${suiteAssignment}`
        : item.productLoop.reason,
  };
});
const classifications = [...baselineClassifications, ...supplementalClassifications];

const manifest = {
  schemaVersion: 'ami-brain-suite-manifest/v1',
  manifestVersion: MANIFEST_VERSION,
  generatedAt,
  sourceBaseline: {
    key: 'ami_brain_full_domain_baseline_v1',
    label: 'Ami Brain 全领域实测原始基线 2000',
    path: relativeToRepo(SOURCE_PATH),
    checksum: sourceChecksum,
    caseCount: cases.length,
  },
    governancePolicy: {
    normalizationVersion: 'v1',
    selectedSimilarityThreshold: selectedAttempt.threshold,
    thresholdAttempts: attempts.map((item) => ({ threshold: item.threshold, keepCount: item.keepIds.size })),
    groupingFields: ['domain', 'role', 'type', 'expectedTarget', 'notes', 'actionClass'],
    standardRange: [STANDARD_MIN, STANDARD_MAX],
    standardTarget: STANDARD_TARGET,
    releaseCoreTarget: RELEASE_CORE_TARGET,
    protectedTypes: [...SPECIAL_TYPES],
    policy:
      'No baseline deletion. Near-duplicate variants with the same metadata may rotate; today, natural week, natural month and rolling 30-day boundaries retain representatives.',
    productLoopPolicy: {
      version: 'v2',
      requiredEvidence: ['management_entry', 'backend_api', 'data_facts'],
      eligibleStatus: 'current_release_test',
      excludedStatuses: ['next_iteration_feature', 'evidence_review_required', 'metric_definition_governance_required'],
      policy:
        'Frozen baseline cases currently use a per-case contract audit and remain subject to manual evidence review. Every supplemental or semantically changed test case must have a stable ID and question checksum. Unreviewed or unverified cases remain registered as evidence_review_required. Cases whose management entry, backend API and real facts exist but whose metric or data definition is not frozen remain registered as metric_definition_governance_required. Both statuses are excluded from every executable suite without blocking unrelated eligible cases. A current-release supplemental case additionally requires named review, current Ami Core management entry, formal backend API, question-required business facts and one explicit release-core, standard-regression or extended-rotation assignment.',
    },
  },
  legacySubsets: {
    targeted12: targetedCurrent,
    targeted12Original: TARGETED_12,
    targeted12NextIteration: targetedNextIteration,
    targeted12EvidenceReview: targetedEvidenceReview,
    targeted12MetricDefinition: targetedMetricDefinition,
    preflight140,
    preflight140Original: originalPreflight140,
    preflight140NextIteration: preflightNextIteration,
    preflight140EvidenceReview: preflightEvidenceReview,
    preflight140MetricDefinition: preflightMetricDefinition,
    preflight140Replacements: preflightReplacements,
  },
  productJourneys: {
    schemaVersion: 'ami-brain-product-journeys/v1',
    policy:
      'Product journey fixtures must reference registered question IDs. Current-release journeys stay inside release-core or standard-regression; next-iteration, evidence-review and metric-definition-governance journeys are UI boundary fixtures only and remain outside execution and pass-rate denominators.',
    currentReleaseCaseIdsChecksum: sha256(currentProductJourneyCaseIds.join('\n')),
    cases: productJourneyCases,
  },
  suites: {
    releaseCore: buildSuite(
      'ami_brain_release_core_v2',
      'Ami Brain 发布核心集',
      releaseCoreIds,
      undefined,
    ),
    standardRegression: buildSuite(
      'ami_brain_standard_regression_v2',
      'Ami Brain 标准回归集',
      standardIds,
      'ami_brain_release_core_v2',
    ),
    extendedRotation: buildSuite(
      'ami_brain_extended_rotation_v2',
      'Ami Brain 扩展轮换池',
      rotationIds,
      undefined,
    ),
    nextIterationFeature: buildSuite(
      'ami_brain_next_iteration_feature_v1',
      'Ami Brain 下一轮业务功能候选（本轮不执行）',
      nextIterationIds,
      undefined,
    ),
    evidenceReviewRequired: buildSuite(
      'ami_brain_evidence_review_required_v1',
      'Ami Brain 产品闭环证据待核对（本轮不执行）',
      evidenceReviewIds,
      undefined,
    ),
    metricDefinitionGovernanceRequired: buildSuite(
      'ami_brain_metric_definition_governance_required_v1',
      'Ami Brain 数据口径与指标定义待治理（本轮不执行）',
      metricDefinitionIds,
      undefined,
    ),
  },
  classificationSummary: {
    KEEP: classifications.filter((item) => item.status === 'KEEP').length,
    ROTATE: classifications.filter((item) => item.status === 'ROTATE').length,
    REMOVE: 0,
    REVIEW: classifications.filter((item) => item.status === 'REVIEW').length,
    NEXT_ITERATION: classifications.filter((item) => item.status === 'NEXT_ITERATION').length,
  },
};

const productLoopArtifact = {
  schemaVersion: 'ami-brain-product-loop-eligibility/v1',
  generatedAt,
  sourceBaselineChecksum: sourceChecksum,
  caseIdsChecksum: sha256(productLoopCases.map((item) => item.id).join('\n')),
  baselineCaseCount: baselineProductLoopCases.length,
  supplementalRegistry: {
    schemaVersion: supplementalRegistry.schemaVersion,
    path: relativeToRepo(SUPPLEMENTAL_QUESTION_REGISTRY_PATH),
    checksum: sha256(supplementalQuestionRegistryRaw),
    caseCount: supplementalProductLoopCases.length,
  },
  requiredEvidence: ['management_entry', 'backend_api', 'data_facts'],
  dataFactsAudit: {
    schemaVersion: productLoopDataFacts.schemaVersion,
    path: relativeToRepo(PRODUCT_LOOP_DATA_FACTS_PATH),
    checksum: sha256(productLoopDataFactsRaw),
    schemaChecksum: productLoopDataFacts.schemaChecksum,
    snapshotChecksum: productLoopDataFacts.snapshotChecksum,
    databaseHost: productLoopDataFacts.databaseHost,
    storeId: productLoopDataFacts.storeId,
  },
  summary: {
    currentReleaseTest: allCurrentReleaseCases.length,
    nextIterationFeature: allNextIterationCases.length,
    evidenceReviewRequired: allEvidenceReviewCases.length,
    metricDefinitionGovernanceRequired: allMetricDefinitionCases.length,
    baseline: {
      currentReleaseTest: currentReleaseCases.length,
      nextIterationFeature: nextIterationCases.length,
      evidenceReviewRequired: evidenceReviewCases.length,
      metricDefinitionGovernanceRequired: metricDefinitionCases.length,
    },
    supplemental: {
      currentReleaseTest: supplementalProductLoopCases.filter((item) => item.productLoop.status === 'current_release_test').length,
      nextIterationFeature: supplementalProductLoopCases.filter((item) => item.productLoop.status === 'next_iteration_feature').length,
      evidenceReviewRequired: supplementalProductLoopCases.filter((item) => item.productLoop.status === 'evidence_review_required').length,
      metricDefinitionGovernanceRequired: supplementalProductLoopCases.filter(
        (item) => item.productLoop.status === 'metric_definition_governance_required',
      ).length,
    },
  },
  cases: productLoopCases.map((item) => ({
    id: item.id,
    domain: item.domain,
    role: item.role,
    type: item.type,
    difficulty: item.difficulty,
    question: item.question,
    expectedTarget: item.expectedTarget,
    notes: item.notes,
    status: item.productLoop.status,
    featureKey: item.productLoop.featureKey,
    reason: item.productLoop.reason,
    missingComponents: item.productLoop.missingComponents,
    evidence: item.productLoop.evidence,
    ...(item.source ? { source: item.source, admission: item.productLoop.admission } : {}),
  })),
};
const productLoopArtifactRaw = `${JSON.stringify(productLoopArtifact, null, 2)}\n`;
manifest.productLoopEligibility = {
  schemaVersion: productLoopArtifact.schemaVersion,
  path: relativeToRepo(PRODUCT_LOOP_PATH),
  checksum: sha256(productLoopArtifactRaw),
  sourceBaselineChecksum: sourceChecksum,
  caseCount: productLoopCases.length,
  baselineCaseCount: baselineProductLoopCases.length,
  caseIdsChecksum: productLoopArtifact.caseIdsChecksum,
  supplementalRegistry: productLoopArtifact.supplementalRegistry,
  dataFactsAudit: productLoopArtifact.dataFactsAudit,
};
const nextIterationArtifact = {
  schemaVersion: 'ami-brain-next-iteration-feature-candidates/v1',
  generatedAt,
  sourceBaselineChecksum: sourceChecksum,
  caseCount: allNextIterationCases.length,
  excludedFrom: ['release-core', 'standard-regression', 'extended-rotation', 'pass_rate_denominator'],
  featureSummary: countBy(allNextIterationCases.map((item) => item.productLoop.featureKey)),
  cases: productLoopArtifact.cases.filter((item) => item.status === 'next_iteration_feature'),
};
const metricDefinitionArtifact = {
  schemaVersion: 'ami-brain-metric-definition-governance-required/v1',
  generatedAt,
  sourceBaselineChecksum: sourceChecksum,
  caseCount: allMetricDefinitionCases.length,
  excludedFrom: ['release-core', 'standard-regression', 'extended-rotation', 'pass_rate_denominator'],
  featureSummary: countBy(allMetricDefinitionCases.map((item) => item.productLoop.featureKey)),
  cases: productLoopArtifact.cases.filter((item) => item.status === 'metric_definition_governance_required'),
};

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(CLASSIFICATION_PATH, renderClassificationCsv(classifications), 'utf8');
writeFileSync(REPORT_PATH, renderReport({ manifest, classifications, attempts, cases: productLoopCases }), 'utf8');
writeFileSync(PRODUCT_LOOP_PATH, productLoopArtifactRaw, 'utf8');
writeFileSync(NEXT_ITERATION_PATH, `${JSON.stringify(nextIterationArtifact, null, 2)}\n`, 'utf8');
writeFileSync(METRIC_DEFINITION_PATH, `${JSON.stringify(metricDefinitionArtifact, null, 2)}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      manifest: relativeToRepo(MANIFEST_PATH),
      classification: relativeToRepo(CLASSIFICATION_PATH),
      report: relativeToRepo(REPORT_PATH),
      sourceChecksum,
      selectedThreshold: selectedAttempt.threshold,
      releaseCore: releaseCoreIds.length,
      standardRegression: standardIds.length,
      extendedRotation: rotationIds.length,
      nextIterationFeature: nextIterationIds.length,
      evidenceReviewRequired: evidenceReviewIds.length,
      metricDefinitionGovernanceRequiredCases: metricDefinitionIds.length,
      supplementalQuestions: supplementalProductLoopCases.length,
      supplementalEvidenceReviewRequired: allEvidenceReviewCases.length - evidenceReviewCases.length,
      supplementalMetricDefinitionGovernanceRequired: allMetricDefinitionCases.length - metricDefinitionCases.length,
      productLoopEligibility: relativeToRepo(PRODUCT_LOOP_PATH),
      nextIterationCandidates: relativeToRepo(NEXT_ITERATION_PATH),
      metricDefinitionGovernanceRequired: relativeToRepo(METRIC_DEFINITION_PATH),
    },
    null,
    2,
  ),
);

function parseCases(text) {
  const rows = parseCsv(text);
  const header = rows.shift();
  const expectedHeader = ['id', 'domain', 'role', 'type', 'difficulty', 'question', 'expected_target', 'notes'];
  if (!header || header.some((value, index) => value !== expectedHeader[index])) {
    throw new Error('baseline header is invalid');
  }
  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row, index) => {
      if (row.length !== expectedHeader.length) throw new Error(`invalid baseline row ${index + 2}`);
      const [id, domain, role, type, difficulty, question, expectedTarget, notes] = row.map((value) => value.trim());
      const timeSemantics = detectTimeSemantics(question);
      const coverage = buildCoverage({ domain, role, type, difficulty, question, expectedTarget, notes, timeSemantics });
      return {
        id,
        domain,
        role,
        type,
        difficulty,
        question,
        expectedTarget,
        notes,
        timeSemantics,
        normalizedQuestion: normalizeQuestion(question),
        coverageSignature: sha256(JSON.stringify(coverage)).slice(0, 16),
        coverage,
      };
    });
}

function buildCoverage(item) {
  const answerShape =
    item.type === 'query_single'
      ? 'single_fact'
      : item.type === 'query_cross'
        ? 'cross_domain_result'
        : item.type === 'analysis'
          ? 'analysis'
          : item.type === 'risk'
            ? 'risk_list'
            : item.type === 'advice'
              ? 'recommendation'
              : item.type === 'prediction'
                ? 'forecast'
                : item.type === 'action'
                  ? 'action_preview'
                  : item.type === 'ambiguity'
                    ? 'clarification'
                    : item.type === 'permission'
                      ? 'refusal_or_masking'
                      : 'multi_turn_result';
  const riskBoundary = [
    item.type === 'permission' ? 'permission' : null,
    item.type === 'action' ? 'confirmation' : null,
    item.type === 'ambiguity' ? 'ambiguity' : null,
    item.type === 'multi_turn' ? 'multi_turn' : null,
    /跨店|其他门店|别的门店/u.test(`${item.question}${item.notes}`) ? 'cross_store' : null,
  ].filter(Boolean);
  const dataBoundary = [
    /没有|为空|空数据|无数据/u.test(`${item.question}${item.notes}`) ? 'empty' : null,
    /全部|所有|全量/u.test(`${item.question}${item.notes}`) ? 'large_result' : null,
    /最高|最低|最多|最少|第一/u.test(`${item.question}${item.notes}`) ? 'extreme' : null,
  ].filter(Boolean);
  return {
    intent: item.type,
    capabilityTarget: item.expectedTarget,
    entityMetric: extractEntityMetric(item.expectedTarget),
    answerShape,
    actionClass: detectActionClass(item.type, item.question),
    timeSemantics: item.timeSemantics,
    permissionBoundary: item.role,
    riskBoundary,
    dataBoundary,
    difficulty: item.difficulty,
  };
}

function extractEntityMetric(value) {
  return value
    .replace(/\s+/gu, '')
    .split(/[、,，+与和\/]/u)
    .filter(Boolean)
    .slice(0, 6);
}

function detectActionClass(type, question) {
  if (type !== 'action') return 'not_action';
  if (/确认/u.test(question)) return 'confirm';
  if (/预览|试算/u.test(question)) return 'preview';
  if (/退款/u.test(question)) return 'refund';
  if (/充值/u.test(question)) return 'recharge';
  if (/调货|从别的店调/u.test(question)) return 'inventory_transfer';
  if (/采购单|下单|采购/u.test(question)) return 'purchase';
  if (/采纳|引用行业/u.test(question)) return 'industry_adopt';
  if (/排班/u.test(question)) return 'scheduling';
  if (/日结|结算/u.test(question)) return 'settlement';
  if (/新建|创建/u.test(question)) return 'create';
  if (/升级|修改|调整|改成/u.test(question)) return 'update';
  if (/发送|群发|触达/u.test(question)) return 'send';
  if (/生成/u.test(question)) return 'generate';
  return 'other_action';
}

function buildClusters(allCases, threshold, requiredIds) {
  const groups = new Map();
  for (const item of allCases) {
    const key = [
      item.domain,
      item.role,
      item.type,
      item.expectedTarget,
      item.notes,
      item.coverage.actionClass,
    ].join('|');
    const values = groups.get(key) ?? [];
    values.push(item);
    groups.set(key, values);
  }
  const keepIds = new Set(requiredIds);
  const clusters = [];
  const caseToCluster = new Map();
  let clusterIndex = 0;
  for (const values of groups.values()) {
    const localClusters = [];
    for (const item of values) {
      let best;
      for (const cluster of localClusters) {
        const score = similarityScore(item.normalizedQuestion, cluster.representative.normalizedQuestion);
        if (score >= threshold && (!best || score > best.score)) best = { cluster, score };
      }
      if (best) {
        best.cluster.members.push(item);
      } else {
        localClusters.push({ id: `C${String(++clusterIndex).padStart(4, '0')}`, representative: item, members: [item] });
      }
    }
    for (const cluster of localClusters) {
      const originalRepresentative = cluster.representative;
      const protectedMembers = cluster.members.filter(
        (item) => requiredIds.has(item.id) || PROTECTED_TIME_SEMANTICS.has(item.timeSemantics),
      );
      cluster.keptRepresentatives = uniqueById([originalRepresentative, ...protectedMembers]);
      cluster.representative = cluster.keptRepresentatives[0];
      for (const representative of cluster.keptRepresentatives) keepIds.add(representative.id);
      clusters.push(cluster);
      for (const member of cluster.members) caseToCluster.set(member.id, cluster);
    }
  }
  return { threshold, keepIds, clusters, caseToCluster };
}

function buildReleaseCore(allCases, standardSet, requiredSet, target) {
  const selected = new Set([...requiredSet].filter((id) => standardSet.has(id)));
  const standardCases = allCases.filter((item) => standardSet.has(item.id));
  const priority = (item) => {
    let score = 0;
    if (SPECIAL_TYPES.has(item.type)) score += 100;
    if (item.type === 'action') score += 60;
    if (item.difficulty === 'high') score += 50;
    if (item.difficulty === 'hard') score += 35;
    if (item.coverage.riskBoundary.length) score += 30;
    if (item.coverage.dataBoundary.length) score += 15;
    return score;
  };
  const groupKey = (item) => `${item.domain}|${item.role}|${item.type}`;
  const groups = new Map();
  for (const item of standardCases.sort((left, right) => priority(right) - priority(left) || left.id.localeCompare(right.id))) {
    const values = groups.get(groupKey(item)) ?? [];
    values.push(item);
    groups.set(groupKey(item), values);
  }
  const orderedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  let depth = 0;
  while (selected.size < target) {
    let added = false;
    for (const [, values] of orderedGroups) {
      const item = values[depth];
      if (!item || selected.has(item.id)) continue;
      selected.add(item.id);
      added = true;
      if (selected.size >= target) break;
    }
    if (!added && depth > standardCases.length) break;
    depth += 1;
  }
  if (selected.size < target) {
    for (const item of standardCases) {
      selected.add(item.id);
      if (selected.size >= target) break;
    }
  }
  return orderIds(allCases, selected).slice(0, target);
}

function selectLegacyPreflight(allCases) {
  const selected = new Map();
  for (const item of allCases) {
    if (SPECIAL_TYPES.has(item.type)) selected.set(item.id, item);
  }
  const groups = new Map();
  for (const item of allCases) {
    const key = `${item.domain}|${roleKey(item.role)}|${item.type}`;
    const values = groups.get(key) ?? [];
    values.push(item);
    groups.set(key, values);
  }
  for (const values of groups.values()) {
    for (const item of values) {
      if (selected.size >= 140) break;
      selected.set(item.id, item);
      break;
    }
    if (selected.size >= 140) break;
  }
  for (const item of allCases) {
    if (selected.size >= 140) break;
    selected.set(item.id, item);
  }
  return [...selected.values()].slice(0, 140);
}

function roleKey(role) {
  return {
    店长: 'store_manager',
    前台: 'receptionist',
    美容师: 'beautician',
    财务: 'finance',
    库存: 'inventory',
    营销: 'marketing',
    客服: 'customer_service',
  }[role];
}

function normalizeQuestion(value) {
  let normalized = value.normalize('NFKC').toLowerCase();
  for (const [, pattern] of TIME_PATTERNS) normalized = normalized.replace(pattern, '<time>');
  normalized = normalized
    .replace(/^第1轮[:：]/u, '')
    .replace(/[→>-]+第2轮[:：]/u, '<turn>')
    .replace(/^[\u4e00-\u9fff]{2,4}(?=的)/u, '<name>')
    .replace(/^([\u4e00-\u9fff]{2,4})(?=<time>)/u, '<name>')
    .replace(/(给|查|看|预测)([\u4e00-\u9fff]{2,4})(?=<time>|的)/gu, '$1<name>')
    .replace(/[0-9０-９]+(?:\.[0-9]+)?/gu, '<num>')
    .replace(/[一二三四五六七八九十百千万]+(?=天|周|月|年|个|次|元|件|人)/gu, '<num>')
    .replace(/[\s，。！？、,.!?：:；;（）()“”"'《》【】\[\]]+/gu, '');
  return normalized;
}

function detectTimeSemantics(value) {
  const matches = TIME_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([key]) => key);
  return matches.length ? matches.join('+') : 'none';
}

function similarityScore(left, right) {
  if (left === right) return 1;
  if (!left.length || !right.length) return 0;
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

function closestRepresentative(item, representatives) {
  let best;
  for (const representative of representatives) {
    const score = similarityScore(item.normalizedQuestion, representative.normalizedQuestion);
    if (!best || score > best.score) best = { item: representative, score };
  }
  return best?.item;
}

function uniqueById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function countBy(values) {
  return Object.fromEntries(
    [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map()).entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  );
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(previous[rightIndex] + 1, current[rightIndex - 1] + 1, substitution);
    }
    for (let index = 0; index <= right.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

function orderIds(allCases, selected) {
  return allCases.filter((item) => selected.has(item.id)).map((item) => item.id);
}

function buildSuite(key, label, caseIds, includesSuite) {
  return {
    key,
    label,
    caseCount: caseIds.length,
    caseIdsChecksum: sha256(caseIds.join('\n')),
    ...(includesSuite ? { includesSuite } : {}),
    caseIds,
  };
}

function normalizeStandardKeepIds(cases, selectedIds, requiredIds, target) {
  const result = new Set(selectedIds);
  if (result.size > target) {
    const required = new Set(requiredIds);
    const removable = [...cases]
      .filter((item) => result.has(item.id) && !required.has(item.id))
      .sort((left, right) => right.id.localeCompare(left.id));
    for (const item of removable) {
      if (result.size === target) break;
      result.delete(item.id);
    }
  }
  if (result.size < target) {
    const supplements = [...cases]
      .filter((item) => !result.has(item.id))
      .sort((left, right) => {
        const protectedType = Number(SPECIAL_TYPES.has(right.type)) - Number(SPECIAL_TYPES.has(left.type));
        if (protectedType) return protectedType;
        const protectedTime =
          Number(PROTECTED_TIME_SEMANTICS.has(right.timeSemantics)) -
          Number(PROTECTED_TIME_SEMANTICS.has(left.timeSemantics));
        return protectedTime || left.id.localeCompare(right.id);
      });
    for (const item of supplements) {
      if (result.size === target) break;
      result.add(item.id);
    }
  }
  if (result.size !== target) throw new Error(`standard regression target unavailable:${result.size}/${target}`);
  return result;
}

function assertSubset(label, subset, superset) {
  const values = new Set(superset);
  const missing = subset.filter((id) => !values.has(id));
  if (missing.length) throw new Error(`${label} is missing from parent suite: ${missing.join(',')}`);
}

function renderClassificationCsv(rows) {
  const header = [
    'id',
    'status',
    'representative_case_id',
    'similarity',
    'cluster_id',
    'domain',
    'role',
    'type',
    'difficulty',
    'time_semantics',
    'coverage_signature',
    'reason',
    'product_loop_status',
    'product_feature_key',
    'management_entry_status',
    'backend_api_status',
    'data_facts_status',
    'missing_components',
    'question',
    'expected_target',
    'notes',
  ];
  return `${header.join(',')}\n${rows
    .map((item) =>
      [
        item.id,
        item.status,
        item.representativeCaseId,
        item.similarity.toFixed(4),
        item.clusterId,
        item.domain,
        item.role,
        item.type,
        item.difficulty,
        item.timeSemantics,
        item.coverageSignature,
        item.reason,
        item.productLoop.status,
        item.productLoop.featureKey,
        item.productLoop.evidence?.managementEntry?.status ?? 'unverified',
        item.productLoop.evidence?.backendApi?.status ?? 'unverified',
        item.productLoop.evidence?.dataFacts?.status ?? 'unverified',
        item.productLoop.missingComponents.join('|'),
        item.question,
        item.expectedTarget,
        item.notes,
      ]
        .map(csv)
        .join(','),
    )
    .join('\n')}\n`;
}

function renderReport({ manifest, classifications, attempts, cases: allCases }) {
  const rotation = classifications.filter((item) => item.status === 'ROTATE');
  const clusters = new Map();
  for (const item of classifications) {
    const values = clusters.get(item.clusterId) ?? [];
    values.push(item);
    clusters.set(item.clusterId, values);
  }
  const largestClusters = [...clusters.values()]
    .filter((items) => items.length > 1)
    .sort((left, right) => right.length - left.length || left[0].id.localeCompare(right[0].id))
    .slice(0, 20);
  const distribution = (field, ids) => {
    const selected = new Set(ids);
    const counts = new Map();
    for (const item of allCases) {
      if (!selected.has(item.id)) continue;
      counts.set(item[field], (counts.get(item[field]) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  };
  const table = (values) => values.map(([key, count]) => `| ${key} | ${count} |`).join('\n');
  return `# Ami Brain 2000 题覆盖签名与分层精简报告

> 生成日期：2026-07-28
> manifest：\`${manifest.manifestVersion}\`
> 原始题库 SHA-256：\`${manifest.sourceBaseline.checksum}\`

## 1. 结论

- 原始基线：${manifest.sourceBaseline.caseCount} 题，未删除、未覆盖。
- release-core：${manifest.suites.releaseCore.caseCount} 题，包含原 targeted/preflight 中所有 current_release_test 题；被标记为 next_iteration_feature、evidence_review_required 或 metric_definition_governance_required 的原题保留 ID、排除状态和同风险补位记录。
- standard-regression：${manifest.suites.standardRegression.caseCount} 题，完整包含 release-core。
- extended-rotation：${manifest.suites.extendedRotation.caseCount} 题，只包含已具备产品闭环但暂不进入标准回归的轮换题。
- next-iteration-feature：${manifest.suites.nextIterationFeature.caseCount} 题，已确认管理入口、正式接口或持久化事实至少一项缺失，本轮不执行、不计通过率。
- evidence-review-required：${manifest.suites.evidenceReviewRequired.caseCount} 题；保留在治理清单中，本轮不执行、不计通过率，补齐证据后再重新分配。
- metric-definition-governance-required：${manifest.suites.metricDefinitionGovernanceRequired.caseCount} 题；管理入口、接口和真实事实存在，但数据口径或指标定义未冻结，本轮不执行、不计通过率，后续单独治理。
- 选定近似阈值：${manifest.governancePolicy.selectedSimilarityThreshold}；只有同元数据的近似变体进入轮换池，关键时间边界保留代表题。
- 分类：KEEP ${manifest.classificationSummary.KEEP}，ROTATE ${manifest.classificationSummary.ROTATE}，NEXT_ITERATION ${manifest.classificationSummary.NEXT_ITERATION}，REMOVE 0，REVIEW ${manifest.classificationSummary.REVIEW}。

产品闭环资格执行强制三证据规则：每题必须关联 Ami Core 管理入口、正式后端接口和持久化业务事实。三项齐全且指标口径冻结，才允许进入当前发布测试；缺任一项进入下一轮功能候选；证据无法确认则进入独立待核对清单；三项存在但数据口径或指标定义未冻结则进入口径治理清单。后三类均禁止进入任何可执行题集。

## 2. 阈值审计

| 阈值 | 标准回归保留题数 |
| ---: | ---: |
${attempts.map((item) => `| ${item.threshold} | ${item.keepIds.size} |`).join('\n')}

## 3. 标准回归分布

### 领域

| 领域 | 数量 |
| --- | ---: |
${table(distribution('domain', manifest.suites.standardRegression.caseIds))}

### 题型

| 题型 | 数量 |
| --- | ---: |
${table(distribution('type', manifest.suites.standardRegression.caseIds))}

### 角色

| 角色 | 数量 |
| --- | ---: |
${table(distribution('role', manifest.suites.standardRegression.caseIds))}

## 4. 最大近似簇

| 代表题 | 簇大小 | 时间语义 | 示例 |
| --- | ---: | --- | --- |
${largestClusters
  .map(
    (items) =>
      `| ${items.find((item) => item.status === 'KEEP')?.id ?? items[0].id} | ${items.length} | ${items[0].timeSemantics} | ${items
        .slice(0, 3)
        .map((item) => `${item.id} ${item.question}`)
        .join('；')} |`,
  )
  .join('\n')}

## 5. 轮换规则

- ROTATE 题仍保留在原始 CSV 和扩展轮换池，不做物理删除。
- 每道 ROTATE 题在分类 CSV 中记录代表题、相似度、覆盖签名和原因。
- 权限、歧义、多轮、跨店、动作确认和关键时间语义不得仅凭文本相似度移出标准回归。
- 首次切换必须运行原始 2000 题做漏检对照，严重失败召回率要求 100%。

## 6. 产物

- manifest：\`${relativeToRepo(MANIFEST_PATH)}\`
- 分类明细：\`${relativeToRepo(CLASSIFICATION_PATH)}\`
- 原始题库：\`${relativeToRepo(SOURCE_PATH)}\`

轮换题总数：${rotation.length}。
`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else value += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (quoted) throw new Error('unclosed CSV quote');
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function csv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function relativeToRepo(value) {
  return value.replace(`${REPO_ROOT}/`, '');
}

function existingGeneratedAt() {
  if (!existsSync(MANIFEST_PATH)) return new Date().toISOString();
  try {
    const existing = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    if (existing.manifestVersion === MANIFEST_VERSION && typeof existing.generatedAt === 'string') {
      return existing.generatedAt;
    }
  } catch {
    // A malformed previous artifact must not block deterministic regeneration.
  }
  return new Date().toISOString();
}
