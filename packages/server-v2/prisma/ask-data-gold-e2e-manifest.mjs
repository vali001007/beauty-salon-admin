import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const goldPath = resolve(
  process.cwd(),
  argumentValue('--gold=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold题库-v1.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold真实E2E抽样-v1.json',
);
const perView = positiveInt(argumentValue('--per-view='), 3);
const multiViewCount = positiveInt(argumentValue('--multi-view='), 5);
const releaseMode = process.argv.includes('--release');
const gold = JSON.parse(readFileSync(goldPath, 'utf8'));
const views = [...new Set(gold.queryContracts.flatMap((item) => item.requiredViews))].sort();
const minimumCaseCount = positiveInt(argumentValue('--min-cases='), releaseMode ? perView * views.length : 0);
const selected = [];
const selectedIds = new Set();

if (releaseMode) selectReleaseCases();
else selectQuickCases();

const selectedQuestions = selected.map((item) => ({
  id: item.id,
  domain: item.sourceRole,
  role: item.sourceRole,
  type: item.supportClass,
  difficulty: item.split === 'holdout' ? 'holdout' : 'development',
  question: item.question,
  expected_target: item.expectedMetricKeys.join(','),
  notes: `requiredViews=${item.requiredViews.join(',')}; requiredAnswerFacts=${item.requiredAnswerFacts.join(',')}`,
  expectedView: item.requiredViews[0],
  expectedViewLabel: item.requiredViews[0],
  expectedMetricKeys: item.expectedMetricKeys,
  acceptableViews: item.acceptableViews,
  requiredViews: item.requiredViews,
  requiredOutputFields: item.requiredOutputFields,
  requiredResultMode: item.requiredResultMode,
  requiredAnswerFacts: item.requiredAnswerFacts,
  split: item.split,
  questionChecksum: item.checksum,
}));

const sourceContractChecksum = createHash('sha256').update(JSON.stringify(gold.queryContracts.map(contractIdentity))).digest('hex');
const selectedQuestionsChecksum = createHash('sha256').update(JSON.stringify(selectedQuestions.map(selectedIdentity))).digest('hex');
const viewCoverage = Object.fromEntries(views.map((viewName) => [
  viewName,
  selectedQuestions.filter((item) => item.requiredViews.includes(viewName)).length,
]));
const insufficientViews = views.filter((viewName) => viewCoverage[viewName] < perView);
if (insufficientViews.length) {
  throw new Error(`insufficient_view_coverage:${insufficientViews.map((viewName) => `${viewName}:${viewCoverage[viewName]}`).join(',')}`);
}
if (selectedQuestions.length < minimumCaseCount) {
  throw new Error(`insufficient_release_cases:${selectedQuestions.length}:${minimumCaseCount}`);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  sourcePath: goldPath,
  sourceQuestionCount: gold.queryContracts.length,
  selectionMode: releaseMode ? 'release' : 'quick',
  targetPerView: perView,
  minimumCaseCount,
  viewCount: views.length,
  coveredViews: new Set(selectedQuestions.flatMap((item) => item.requiredViews)).size,
  viewCoverage,
  minimumViewCoverage: Math.min(...Object.values(viewCoverage)),
  selectedCaseCount: selectedQuestions.length,
  multiViewCaseCount: selectedQuestions.filter((item) => item.requiredViews.length > 1).length,
  holdoutCaseCount: selectedQuestions.filter((item) => item.split === 'holdout').length,
  sourceGoldChecksum: gold.checksum,
  sourceContractChecksum,
  selectedQuestionsChecksum,
  checksum: createHash('sha256').update(JSON.stringify({
    sourceGoldChecksum: gold.checksum,
    sourceContractChecksum,
    selectedQuestionsChecksum,
  })).digest('hex'),
  insufficientViews,
  selectedQuestions,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...manifest, selectedQuestions: undefined }, null, 2));

function add(item) {
  if (selectedIds.has(item.id)) return;
  selectedIds.add(item.id);
  selected.push(item);
}

function selectQuickCases() {
  for (const viewName of views) {
    const candidates = gold.queryContracts
      .filter((item) => item.requiredViews.length === 1 && item.requiredViews[0] === viewName)
      .sort(compareContracts);
    const picked = candidates.slice(0, perView);
    if (picked.length < perView) throw new Error(`insufficient_single_view_cases:${viewName}:${picked.length}`);
    for (const item of picked) add(item);
  }

  const multiView = gold.queryContracts
    .filter((item) => item.requiredViews.length > 1)
    .sort(compareContracts)
    .slice(0, multiViewCount);
  for (const item of multiView) add(item);
}

function selectReleaseCases() {
  for (const viewName of views) {
    const candidates = gold.queryContracts
      .filter((item) => item.requiredViews.length === 1 && item.requiredViews[0] === viewName)
      .sort(compareReleaseContracts)
      .slice(0, perView);
    for (const item of candidates) add(item);
  }

  while (true) {
    const coverage = currentViewCoverage();
    const deficits = views.filter((viewName) => coverage[viewName] < perView);
    if (!deficits.length) break;
    const best = gold.queryContracts
      .filter((item) => !selectedIds.has(item.id) && item.requiredViews.length > 1)
      .map((item) => ({
        item,
        gain: item.requiredViews.filter((viewName) => deficits.includes(viewName)).length,
      }))
      .filter((candidate) => candidate.gain > 0)
      .sort((left, right) => right.gain - left.gain || compareReleaseContracts(left.item, right.item))[0];
    if (!best) throw new Error(`insufficient_multi_view_coverage:${deficits.join(',')}`);
    add(best.item);
  }

  for (const item of [...gold.queryContracts].sort(compareReleaseContracts)) {
    if (selected.length >= minimumCaseCount) break;
    add(item);
  }
}

function currentViewCoverage() {
  return Object.fromEntries(views.map((viewName) => [
    viewName,
    selected.filter((item) => item.requiredViews.includes(viewName)).length,
  ]));
}

function compareContracts(left, right) {
  if (left.split !== right.split) return left.split === 'holdout' ? -1 : 1;
  return left.id.localeCompare(right.id);
}

function compareReleaseContracts(left, right) {
  if (left.split !== right.split) return left.split === 'development' ? -1 : 1;
  return left.id.localeCompare(right.id);
}

function contractIdentity(item) {
  return {
    id: item.id,
    checksum: item.checksum,
    split: item.split,
    supportClass: item.supportClass,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredDimensionKeys: item.requiredDimensionKeys,
    requiredAnswerFacts: item.requiredAnswerFacts,
    runtimeResolutionRequired: item.runtimeResolutionRequired,
    mustClarify: item.mustClarify,
    allowedClarificationSlots: item.allowedClarificationSlots,
    forbiddenClaims: item.forbiddenClaims,
  };
}

function selectedIdentity(item) {
  return {
    id: item.id,
    questionChecksum: item.questionChecksum,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredAnswerFacts: item.requiredAnswerFacts,
  };
}

function argumentValue(prefix) {
  return [...process.argv].reverse().find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
