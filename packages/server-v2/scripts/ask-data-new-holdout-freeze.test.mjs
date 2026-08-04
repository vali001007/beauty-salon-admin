import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const projectDir = resolve(import.meta.dirname, '..');

test('freezes 105 unseen questions with explicit boundary and corrected-view contracts', () => {
  const outputPath = join(mkdtempSync(join(tmpdir(), 'ami-ask-new-holdout-')), 'holdout.json');
  const result = spawnSync(
    process.execPath,
    [
      '--loader',
      'ts-node/esm',
      '--experimental-specifier-resolution=node',
      'prisma/ask-data-new-holdout-freeze.mjs',
      `--output=${outputPath}`,
    ],
    {
      cwd: projectDir,
      env: { ...process.env, TS_NODE_PROJECT: 'tsconfig.agent-eval-scripts.json', TS_NODE_TRANSPILE_ONLY: 'true' },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(report.summary.total, 105);
  assert.ok(report.summary.querySupported >= 70);
  assert.ok(report.summary.clarificationRequired >= 20);
  assert.ok(report.summary.adminSupportedAskNotOpen >= 3);
  assert.ok(report.summary.adminBackendUnsupported >= 3);
  assert.ok(report.summary.candidateViewCorrections >= 5);
  assert.equal(report.summary.goldLeakCount, 0);
  assert.equal(new Set([...report.queryContracts, ...report.boundaryContracts].map((item) => item.id)).size, 105);
  assert.ok(report.boundaryContracts.some((item) => item.id === 'ami_brain_2000:BQ0688' && item.allowedClarificationSlots.length === 2));
  assert.ok(report.queryContracts.some((item) => item.id === 'ami_brain_2000:BQ0696' && item.requiredViews.length === 2));
  assert.ok(report.queryContracts.some((item) => item.id === 'ami_brain_2000:BQ1301' && item.requiredViews[0] === 'agent_v3_project_service_sales_view'));
});

test('freezes Holdout v3 with full candidate audit, zero prior-set leakage and explicit product boundaries', () => {
  const outputPath = join(mkdtempSync(join(tmpdir(), 'ami-ask-new-holdout-v3-')), 'holdout-v3.json');
  const result = spawnSync(
    process.execPath,
    [
      '--loader',
      'ts-node/esm',
      '--experimental-specifier-resolution=node',
      'prisma/ask-data-new-holdout-freeze-v3.mjs',
      `--output=${outputPath}`,
    ],
    {
      cwd: projectDir,
      env: { ...process.env, TS_NODE_PROJECT: 'tsconfig.agent-eval-scripts.json', TS_NODE_TRANSPILE_ONLY: 'true' },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(report.version, 3);
  assert.equal(report.summary.total, 151);
  assert.equal(report.summary.priorSetLeakCount, 0);
  assert.ok(report.summary.querySupported >= 30);
  assert.ok(report.summary.clarificationRequired >= 50);
  assert.ok(report.summary.adminSupportedAskNotOpen >= 40);
  assert.ok(report.summary.adminBackendUnsupported >= 20);
  assert.ok(report.summary.brainContentOrAdvice >= 10);
  assert.equal(new Set([...report.queryContracts, ...report.boundaryContracts].map((item) => item.id)).size, 151);
  assert.ok(report.queryContracts.some((item) => item.id === 'ami_brain_2000:BQ0898'
    && item.requiredOutputFields.includes('arrival_conversion_rate')));
  assert.ok(report.queryContracts.some((item) => item.id === 'ami_brain_2000:BQ1562'
    && item.requiredViews[0] === 'ask_data_marketing_roi_view'));
  assert.ok(report.boundaryContracts.some((item) => item.id === 'ami_brain_2000:BQ1606'
    && item.supportClass === 'admin_backend_unsupported'));
});

test('freezes Holdout v4 with 80 queries, 50 clarifications, 50 boundaries and 34-view coverage', () => {
  const outputPath = join(mkdtempSync(join(tmpdir(), 'ami-ask-new-holdout-v4-')), 'holdout-v4.json');
  const result = spawnSync(
    process.execPath,
    [
      '--loader',
      'ts-node/esm',
      '--experimental-specifier-resolution=node',
      'prisma/ask-data-new-holdout-freeze-v4.mjs',
      `--output=${outputPath}`,
    ],
    {
      cwd: projectDir,
      env: { ...process.env, TS_NODE_PROJECT: 'tsconfig.agent-eval-scripts.json', TS_NODE_TRANSPILE_ONLY: 'true' },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(report.version, 4);
  assert.equal(report.summary.total, 180);
  assert.equal(report.summary.querySupported, 80);
  assert.equal(report.summary.clarificationRequired, 50);
  assert.equal(report.summary.boundary, 50);
  assert.equal(report.summary.coveredViews, 34);
  assert.equal(report.summary.exactPriorLeakCount, 0);
  assert.equal(report.summary.nearDuplicatePriorLeakCount, 0);
  assert.equal(report.reviewStatus.independentHumanSignoff, 'pending');
  assert.equal(new Set([...report.queryContracts, ...report.boundaryContracts].map((item) => item.id)).size, 180);
  assert.ok(report.queryContracts.some((item) => item.requiredViews.length === 2));
  assert.ok(report.boundaryContracts.some((item) => item.allowedClarificationSlots.length >= 2));
});

test('applies Holdout v4 adjudications without changing the frozen contract or first unseen result', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ami-ask-new-holdout-v4-adjudication-'));
  const ledgerPath = join(tempDir, 'ledger.json');
  const markdownPath = join(tempDir, 'ledger.md');
  const outputPath = join(tempDir, 'adjudicated.json');
  const frozenPath = resolve(projectDir, '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout合同-v4.json');
  const firstUnseenPath = resolve(projectDir, '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout语义评测-v4-first-unseen.json');
  const frozenBefore = readFileSync(frozenPath, 'utf8');
  const firstUnseenBefore = readFileSync(firstUnseenPath, 'utf8');
  const result = spawnSync(
    process.execPath,
    [
      'prisma/ask-data-new-holdout-adjudicate-v4.mjs',
      `--ledger=${ledgerPath}`,
      `--markdown=${markdownPath}`,
      `--output=${outputPath}`,
    ],
    { cwd: projectDir, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(readFileSync(frozenPath, 'utf8'), frozenBefore);
  assert.equal(readFileSync(firstUnseenPath, 'utf8'), firstUnseenBefore);
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  const adjudicated = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(ledger.frozenChecksum, '9e978450a214ae62b8b715be3e71f1835b0b14279bc0847be0fba310450b4b5f');
  assert.equal(ledger.policy.appendOnly, true);
  assert.ok(ledger.entries.some((item) => item.contractId.endsWith('V4-Q071')
    && item.patch.expectedMetricKeys.includes('inventory_usage_balance')));
  assert.ok(ledger.entries.some((item) => item.contractId.endsWith('V4-C046')
    && item.patch.allowedClarificationSlots.length === 1));
  assert.equal(adjudicated.summary.querySupported, 80);
  assert.equal(adjudicated.summary.clarificationRequired, 49);
  assert.equal(adjudicated.reviewStatus.independentHumanSignoff, 'pending');
});
