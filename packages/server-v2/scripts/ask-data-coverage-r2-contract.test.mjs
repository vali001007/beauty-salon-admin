import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const serverRoot = process.cwd();
const sourcePath = resolve(
  serverRoot,
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold题库-v1.json',
);
const committedGoldPath = resolve(
  serverRoot,
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v2-Coverage-R2/Ami-Ask统一Gold题库-v2-Coverage-R2.json',
);
const committedManifestPath = resolve(
  serverRoot,
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v2-Coverage-R2/Ami-Ask统一Gold发布级350题清单-Coverage-R2.json',
);
const inventoryView = 'ask_data_inventory_turnover_view';
const expectedIds = Array.from({ length: 10 }, (_, index) => (
  `ask_supplemental:R2-INV-${String(index + 1).padStart(3, '0')}`
));

test('Coverage R2 Gold adds exactly ten governed development questions without mutating v1', () => {
  const source = readJson(sourcePath);
  const coverage = readJson(committedGoldPath);
  const added = coverage.queryContracts.filter((item) => item.sourceId?.startsWith('R2-INV-'));

  assert.equal(source.queryContracts.length, 429);
  assert.equal(coverage.version, 2);
  assert.equal(coverage.queryContracts.length, 439);
  assert.equal(coverage.boundaryContracts.length, source.boundaryContracts.length);
  assert.deepEqual(coverage.queryContracts.slice(0, source.queryContracts.length), source.queryContracts);
  assert.deepEqual(coverage.boundaryContracts, source.boundaryContracts);
  assert.deepEqual(added.map((item) => item.id).sort(), expectedIds);
  assert.equal(new Set(added.map((item) => item.checksum)).size, 10);

  for (const item of added) {
    assert.equal(item.split, 'development', `${item.id} must not be reported as holdout`);
    assert.equal(item.supportClass, 'ask_query_supported');
    assert.equal(item.mustClarify, false);
    assert.deepEqual(item.acceptableViews, [inventoryView]);
    assert.deepEqual(item.requiredViews, [inventoryView]);
    assert.ok(item.expectedMetricKeys.length === 1);
    assert.ok(item.requiredOutputFields.length > 0);
    assert.ok(item.requiredAnswerFacts.includes('data_policy'));
  }

  assert.equal(coverage.summary.coverageR2AddedQueryCount, 10);
  assert.equal(coverage.summary.coveredViews, 35);
  assert.equal(coverage.summary.viewsAtLeastTen, 35);
  assert.equal(coverage.summary.missingToTen, 0);
  assert.equal(coverage.viewCounts[inventoryView], 10);
  assert.equal(coverage.checksum, goldChecksum(coverage.queryContracts));
});

test('Coverage R2 release Manifest is a deterministic 35 by 10 contract', () => {
  const coverage = readJson(committedGoldPath);
  const manifest = readJson(committedManifestPath);
  const selectedIds = manifest.selectedQuestions.map((item) => item.id);
  const selectedInventory = manifest.selectedQuestions.filter((item) => item.requiredViews.includes(inventoryView));

  assert.equal(manifest.selectionMode, 'release');
  assert.equal(manifest.sourceQuestionCount, 439);
  assert.equal(manifest.targetPerView, 10);
  assert.equal(manifest.minimumCaseCount, 350);
  assert.equal(manifest.selectedCaseCount, 350);
  assert.equal(manifest.viewCount, 35);
  assert.equal(manifest.coveredViews, 35);
  assert.equal(manifest.minimumViewCoverage, 10);
  assert.deepEqual(manifest.insufficientViews, []);
  assert.equal(new Set(selectedIds).size, 350);
  assert.equal(manifest.viewCoverage[inventoryView], 10);
  assert.deepEqual(selectedInventory.map((item) => item.id).sort(), expectedIds);
  assert.equal(manifest.sourceGoldChecksum, coverage.checksum);

  const contractById = new Map(coverage.queryContracts.map((item) => [item.id, item]));
  for (const item of manifest.selectedQuestions) {
    const contract = contractById.get(item.id);
    assert.ok(contract, `manifest item missing from Gold: ${item.id}`);
    assert.equal(item.questionChecksum, contract.checksum);
    assert.deepEqual(item.expectedMetricKeys, contract.expectedMetricKeys);
    assert.deepEqual(item.requiredViews, contract.requiredViews);
    assert.deepEqual(item.requiredOutputFields, contract.requiredOutputFields);
    assert.equal(item.requiredResultMode, contract.requiredResultMode);
    assert.deepEqual(item.requiredAnswerFacts, contract.requiredAnswerFacts);
  }
});

test('Coverage R2 Gold and Manifest regenerate to the committed contract identity', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'ami-ask-coverage-r2-'));
  const generatedGoldPath = resolve(tempRoot, 'gold.json');
  const generatedManifestPath = resolve(tempRoot, 'manifest.json');

  try {
    execFileSync(process.execPath, [
      '--loader', 'ts-node/esm',
      '--experimental-specifier-resolution=node',
      'prisma/ask-data-coverage-r2-gold.mjs',
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
      '--min-cases=350',
      `--gold=${generatedGoldPath}`,
      `--output=${generatedManifestPath}`,
    ], { cwd: serverRoot, stdio: 'pipe' });

    const generatedGold = readJson(generatedGoldPath);
    const committedGold = readJson(committedGoldPath);
    const generatedManifest = readJson(generatedManifestPath);
    const committedManifest = readJson(committedManifestPath);

    assert.equal(generatedGold.checksum, committedGold.checksum);
    assert.deepEqual(generatedGold.summary, committedGold.summary);
    assert.deepEqual(generatedGold.viewCounts, committedGold.viewCounts);
    assert.deepEqual(generatedGold.queryContracts, committedGold.queryContracts);
    assert.deepEqual(generatedGold.boundaryContracts, committedGold.boundaryContracts);

    for (const key of [
      'sourceQuestionCount',
      'selectionMode',
      'targetPerView',
      'minimumCaseCount',
      'viewCount',
      'coveredViews',
      'viewCoverage',
      'minimumViewCoverage',
      'selectedCaseCount',
      'multiViewCaseCount',
      'holdoutCaseCount',
      'sourceGoldChecksum',
      'sourceContractChecksum',
      'selectedQuestionsChecksum',
      'checksum',
      'insufficientViews',
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

function goldChecksum(queryContracts) {
  return createHash('sha256')
    .update(JSON.stringify(queryContracts.map((item) => item.checksum)))
    .digest('hex');
}
