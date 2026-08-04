import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const serverRoot = process.cwd();
const sourcePath = resolve(
  serverRoot,
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v3-Coverage-R2-供应商报价/Ami-Ask统一Gold题库-v3-Coverage-R2-供应商报价.json',
);
const committedGoldPath = resolve(
  serverRoot,
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化.json',
);
const committedManifestPath = resolve(
  serverRoot,
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化/Ami-Ask统一Gold发布级360题清单-Coverage-R2-反馈名单轻量化.json',
);
const correctedIds = [
  'ami_brain_2000:BQ0128',
  'agent_650:manager-025',
  'agent_650:manager-090',
].sort();
const supplierBoundaryCorrectedIds = [
  'agent_650:inventory-050',
  'agent_650:inventory-061',
].sort();
const supplierPromotedQueryId = 'agent_650:inventory-065';

test('feedback follow-up Gold changes only governed complaint-list and supplier-boundary contracts', () => {
  const source = readJson(sourcePath);
  const coverage = readJson(committedGoldPath);
  assert.equal(coverage.version, 4);
  assert.equal(coverage.queryContracts.length, source.queryContracts.length + 1);
  assert.equal(coverage.boundaryContracts.length, source.boundaryContracts.length - 1);
  assert.deepEqual(coverage.viewCounts, {
    ...source.viewCounts,
    ask_data_supplier_quote_terms_view: source.viewCounts.ask_data_supplier_quote_terms_view + 1,
  });
  assert.equal(coverage.summary.feedbackFollowUpContractCorrectionCount, 3);
  assert.equal(coverage.summary.supplierBoundaryContractCorrectionCount, 3);
  assert.match(coverage.boundaryChecksum, /^[a-f0-9]{64}$/);

  const changedIds = coverage.queryContracts
    .slice(0, source.queryContracts.length)
    .filter((item, index) => JSON.stringify(item) !== JSON.stringify(source.queryContracts[index]))
    .map((item) => item.id)
    .sort();
  assert.deepEqual(changedIds, correctedIds);
  const sourceBoundaryById = new Map(source.boundaryContracts.map((item) => [item.id, item]));
  const changedBoundaryIds = coverage.boundaryContracts
    .filter((item) => JSON.stringify(item) !== JSON.stringify(sourceBoundaryById.get(item.id)))
    .map((item) => item.id)
    .sort();
  assert.deepEqual(changedBoundaryIds, supplierBoundaryCorrectedIds);

  for (const id of correctedIds) {
    const item = coverage.queryContracts.find((candidate) => candidate.id === id);
    assert.ok(item, `missing corrected contract: ${id}`);
    assert.equal(item.requiredResultMode, 'detail');
    assert.ok(!item.requiredOutputFields.includes('feedback_count'));
    assert.ok(!item.requiredOutputFields.includes('average_rating'));
    for (const field of ['feedback_id', 'customer_id', 'customer_name_masked', 'feedback_type', 'rating']) {
      assert.ok(item.requiredOutputFields.includes(field), `${id} missing ${field}`);
    }
  }

  const valueStandard = coverage.boundaryContracts.find((item) => item.id === 'agent_650:inventory-050');
  assert.equal(valueStandard.supportClass, 'clarification_required');
  assert.equal(valueStandard.mustClarify, true);
  assert.deepEqual(valueStandard.allowedClarificationSlots, ['comparison_baseline']);
  assert.deepEqual(valueStandard.requiredViews, []);

  const historyTrend = coverage.boundaryContracts.find((item) => item.id === 'agent_650:inventory-061');
  assert.equal(historyTrend.supportClass, 'ask_scope_limit');
  assert.equal(historyTrend.mustClarify, false);
  assert.deepEqual(historyTrend.requiredViews, []);

  assert.ok(!coverage.boundaryContracts.some((item) => item.id === supplierPromotedQueryId));
  const alternativeQuote = coverage.queryContracts.find((item) => item.id === supplierPromotedQueryId);
  assert.equal(alternativeQuote.supportClass, 'ask_query_supported');
  assert.deepEqual(alternativeQuote.expectedMetricKeys, ['supplier_price_comparison']);
  assert.deepEqual(alternativeQuote.requiredViews, ['ask_data_supplier_quote_terms_view']);
});

test('feedback follow-up release Manifest retains deterministic 36-view coverage', () => {
  const coverage = readJson(committedGoldPath);
  const manifest = readJson(committedManifestPath);
  assert.equal(manifest.sourceQuestionCount, 450);
  assert.equal(manifest.selectedCaseCount, 360);
  assert.equal(manifest.viewCount, 36);
  assert.equal(manifest.coveredViews, 36);
  assert.equal(manifest.minimumViewCoverage, 10);
  assert.deepEqual(manifest.insufficientViews, []);
  assert.equal(new Set(manifest.selectedQuestions.map((item) => item.id)).size, 360);
  assert.equal(manifest.sourceGoldChecksum, coverage.checksum);

  for (const id of correctedIds) {
    const item = manifest.selectedQuestions.find((candidate) => candidate.id === id);
    assert.ok(item, `corrected contract absent from release Manifest: ${id}`);
    assert.ok(!item.requiredOutputFields.includes('feedback_count'));
  }
});

test('feedback follow-up Gold and Manifest regenerate to the committed identity', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'ami-ask-feedback-follow-up-'));
  const generatedGoldPath = resolve(tempRoot, 'gold.json');
  const generatedManifestPath = resolve(tempRoot, 'manifest.json');
  try {
    execFileSync(process.execPath, [
      '--loader', 'ts-node/esm',
      '--experimental-specifier-resolution=node',
      'prisma/ask-data-coverage-r2-feedback-follow-up-gold.mjs',
      `--source=${sourcePath}`,
      `--output=${generatedGoldPath}`,
    ], {
      cwd: serverRoot,
      env: {
        ...process.env,
        TS_NODE_PROJECT: 'tsconfig.agent-eval-scripts.json',
        TS_NODE_TRANSPILE_ONLY: 'true',
      },
      stdio: 'pipe',
    });
    execFileSync(process.execPath, [
      'prisma/ask-data-gold-e2e-manifest.mjs',
      '--release',
      '--per-view=10',
      '--min-cases=360',
      `--gold=${generatedGoldPath}`,
      `--output=${generatedManifestPath}`,
    ], { cwd: serverRoot, stdio: 'pipe' });

    const generatedGold = readJson(generatedGoldPath);
    const committedGold = readJson(committedGoldPath);
    const generatedManifest = readJson(generatedManifestPath);
    const committedManifest = readJson(committedManifestPath);
    assert.deepEqual(generatedGold.summary, committedGold.summary);
    assert.equal(generatedGold.boundaryChecksum, committedGold.boundaryChecksum);
    assert.deepEqual(generatedGold.queryContracts, committedGold.queryContracts);
    assert.deepEqual(generatedGold.boundaryContracts, committedGold.boundaryContracts);
    for (const key of [
      'sourceContractChecksum',
      'selectedQuestionsChecksum',
      'checksum',
      'viewCoverage',
      'selectedQuestions',
    ]) {
      assert.deepEqual(generatedManifest[key], committedManifest[key], `manifest mismatch: ${key}`);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
