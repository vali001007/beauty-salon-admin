import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const projectDir = resolve(import.meta.dirname, '..');

test('builds a stable, unique Gold set with at least 10 distinct questions for all 34 views', () => {
  const first = runGovernance();
  const second = runGovernance();

  assert.equal(first.summary.queryCaseCount, 429);
  assert.equal(first.summary.boundaryCaseCount, 585);
  assert.equal(first.summary.uniqueQuestionCount, 1014);
  assert.equal(first.summary.coveredViews, 34);
  assert.equal(first.summary.viewsAtLeastTen, 34);
  assert.equal(first.summary.missingToTen, 0);
  assert.equal(first.viewCounts.ask_data_transfer_status_view, 10);
  assert.equal(first.viewCounts.ask_data_customer_lifecycle_view, 10);
  assert.equal(first.boundaryContracts.filter((item) => item.runtimeResolutionRequired).length, 13);
  assert.ok(first.summary.holdoutRate >= 0.18 && first.summary.holdoutRate <= 0.22);

  assert.deepEqual(first.summary.adminMetricCorrections, {
    admin_backend_unsupported: 1,
    admin_supported_ask_not_open: 10,
    ask_query_supported: 50,
    clarification_required: 7,
  });

  assert.equal(first.queryContracts.some((item) => item.mustClarify), false);
  assert.equal(first.queryContracts.filter((item) => !item.requiredOutputFields.length).length, 0);
  assert.equal(first.queryContracts.filter((item) => !item.requiredResultMode).length, 0);
  assert.equal(first.boundaryContracts.filter((item) => item.mustClarify).length, 148);
  assert.equal(new Set(first.queryContracts.map((item) => item.id)).size, 429);
  assert.equal(new Set(first.queryContracts.map((item) => item.checksum)).size, 429);
  assert.deepEqual(
    first.queryContracts.map(stableContractIdentity),
    second.queryContracts.map(stableContractIdentity),
  );

  const releaseManifest = runReleaseManifest(first);
  assert.equal(releaseManifest.selectionMode, 'release');
  assert.equal(releaseManifest.targetPerView, 10);
  assert.equal(releaseManifest.minimumCaseCount, 340);
  assert.equal(releaseManifest.selectedCaseCount, 340);
  assert.equal(releaseManifest.coveredViews, 34);
  assert.ok(releaseManifest.minimumViewCoverage >= 10);
  assert.deepEqual(releaseManifest.insufficientViews, []);
  assert.equal(new Set(releaseManifest.selectedQuestions.map((item) => item.id)).size, 340);
  assert.equal(new Set(releaseManifest.selectedQuestions.map((item) => item.questionChecksum)).size, 340);
  assert.ok(releaseManifest.multiViewCaseCount >= 2);
});

test('uses the last repeated output argument so package-script defaults cannot overwrite frozen evidence', () => {
  const gold = runGovernance();
  const outputDir = mkdtempSync(join(tmpdir(), 'ami-ask-release-output-'));
  const goldPath = join(outputDir, 'gold.json');
  const defaultOutputPath = join(outputDir, 'default.json');
  const requestedOutputPath = join(outputDir, 'requested.json');
  writeFileSync(goldPath, `${JSON.stringify(gold, null, 2)}\n`);

  const result = spawnSync(
    process.execPath,
    [
      'prisma/ask-data-gold-e2e-manifest.mjs',
      '--release',
      '--per-view=10',
      '--min-cases=340',
      `--gold=${goldPath}`,
      `--output=${defaultOutputPath}`,
      `--output=${requestedOutputPath}`,
    ],
    { cwd: projectDir, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.throws(() => readFileSync(defaultOutputPath, 'utf8'), { code: 'ENOENT' });
  assert.equal(JSON.parse(readFileSync(requestedOutputPath, 'utf8')).selectedCaseCount, 340);
});

function runGovernance() {
  const outputDir = mkdtempSync(join(tmpdir(), 'ami-ask-gold-'));
  const outputPath = join(outputDir, 'gold.json');
  const methodologyPath = join(outputDir, 'methodology.md');
  const result = spawnSync(
    process.execPath,
    [
      '--loader',
      'ts-node/esm',
      '--experimental-specifier-resolution=node',
      'prisma/ask-data-eval-governance.mjs',
      `--output=${outputPath}`,
      `--methodology=${methodologyPath}`,
    ],
    {
      cwd: projectDir,
      env: {
        ...process.env,
        TS_NODE_PROJECT: 'tsconfig.agent-eval-scripts.json',
        TS_NODE_TRANSPILE_ONLY: 'true',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(readFileSync(outputPath, 'utf8'));
}

function runReleaseManifest(gold) {
  const outputDir = mkdtempSync(join(tmpdir(), 'ami-ask-release-manifest-'));
  const goldPath = join(outputDir, 'gold.json');
  const outputPath = join(outputDir, 'release-manifest.json');
  writeFileSync(goldPath, `${JSON.stringify(gold, null, 2)}\n`);
  const result = spawnSync(
    process.execPath,
    [
      'prisma/ask-data-gold-e2e-manifest.mjs',
      '--release',
      '--per-view=10',
      '--min-cases=340',
      `--gold=${goldPath}`,
      `--output=${outputPath}`,
    ],
    { cwd: projectDir, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(readFileSync(outputPath, 'utf8'));
}

function stableContractIdentity(item) {
  return {
    id: item.id,
    checksum: item.checksum,
    split: item.split,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
  };
}
