import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const serverRoot = process.cwd();
const sourcePath = resolve(
  serverRoot,
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化.json',
);
const committedGoldPath = resolve(
  serverRoot,
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v5-Coverage-R2-商品项目贡献毛利/Ami-Ask统一Gold题库-v5-Coverage-R2-商品项目贡献毛利.json',
);
const committedManifestPath = resolve(
  serverRoot,
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v5-Coverage-R2-商品项目贡献毛利/Ami-Ask统一Gold发布级370题清单-Coverage-R2-商品项目贡献毛利.json',
);

test('item-margin Gold adds exactly ten governed contracts on the 37th Ask view', () => {
  const source = readJson(sourcePath);
  const coverage = readJson(committedGoldPath);
  assert.equal(coverage.version, 5);
  assert.equal(coverage.queryContracts.length, 460);
  assert.equal(coverage.queryContracts.length, source.queryContracts.length + 10);
  assert.deepEqual(coverage.boundaryContracts, source.boundaryContracts);
  assert.equal(coverage.boundaryChecksum, source.boundaryChecksum);
  assert.equal(coverage.summary.coveredViews, 37);
  assert.equal(coverage.summary.viewsAtLeastTen, 37);
  assert.equal(coverage.summary.missingToTen, 0);
  assert.equal(coverage.summary.coverageR2ItemMarginAddedQueryCount, 10);
  assert.equal(coverage.viewCounts.ask_data_item_margin_view, 10);

  const added = coverage.queryContracts.slice(source.queryContracts.length);
  assert.equal(added.length, 10);
  assert.equal(new Set(added.map((item) => item.id)).size, 10);
  for (const item of added) {
    assert.equal(item.supportClass, 'ask_query_supported');
    assert.equal(item.split, 'development');
    assert.deepEqual(item.acceptableViews, ['ask_data_item_margin_view']);
    assert.deepEqual(item.requiredViews, ['ask_data_item_margin_view']);
    assert.equal(item.mustClarify, false);
    assert.ok(item.requiredOutputFields.includes('attributed_cost'));
    assert.ok(item.requiredOutputFields.includes('estimated_cost_event_count'));
    assert.ok(item.requiredOutputFields.includes('cost_missing_event_count'));
    assert.ok(item.requiredAnswerFacts.includes('data_policy'));
  }
});

test('item-margin release Manifest has deterministic 37-view and 370-case coverage', () => {
  const coverage = readJson(committedGoldPath);
  const manifest = readJson(committedManifestPath);
  assert.equal(manifest.sourceQuestionCount, 460);
  assert.equal(manifest.selectedCaseCount, 370);
  assert.equal(manifest.viewCount, 37);
  assert.equal(manifest.coveredViews, 37);
  assert.equal(manifest.minimumViewCoverage, 10);
  assert.deepEqual(manifest.insufficientViews, []);
  assert.equal(new Set(manifest.selectedQuestions.map((item) => item.id)).size, 370);
  assert.equal(manifest.sourceGoldChecksum, coverage.checksum);
  assert.equal(manifest.viewCoverage.ask_data_item_margin_view, 10);
});

test('item-margin Gold and Manifest regenerate to the committed identity', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'ami-ask-item-margin-'));
  const generatedGoldPath = resolve(tempRoot, 'gold.json');
  const generatedManifestPath = resolve(tempRoot, 'manifest.json');
  try {
    execFileSync(process.execPath, [
      '--loader', 'ts-node/esm',
      '--experimental-specifier-resolution=node',
      'prisma/ask-data-coverage-r2-item-margin-gold.mjs',
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
      '--min-cases=370',
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
