import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildObserveViews, createObservePlan, parseObserveArgs } from './ami-brain-observe.mjs';

const manifest = {
  manifestVersion: 'test-v1',
  suites: {
    releaseCore: { caseCount: 2, caseIds: ['A', 'B'] },
    standardRegression: { caseCount: 3, caseIds: ['A', 'B', 'C'] },
    extendedRotation: { caseCount: 2, caseIds: ['D', 'E'] },
  },
};

test('observe plan derives suite counts and avoids repeated provider cases', () => {
  const options = parseObserveArgs([
    '--dry-run',
    '--run-key=observe-test',
    '--expected-release-id=452',
    '--store-id=6',
    '--production-health-url=https://example.test/health',
    '--expected-runtime-commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '--max-evaluated-cases=10',
  ]);
  const plan = createObservePlan({
    manifest,
    goldManifest: { cases: [{ id: 'G1' }] },
    options,
    environment: {
      DATABASE_URL: 'postgresql://example',
      BRAIN_OBSERVE_ENVIRONMENT: 'approved_development',
      LLM_PROVIDER: 'openai_responses',
      LLM_MODEL: 'test-model',
      LLM_API_KEY: 'secret',
    },
  });
  assert.deepEqual(plan.suiteCounts, {
    releaseCore: 2,
    standardRegression: 3,
    extendedRotation: 2,
    goldStandard: 1,
    uniqueExecutable: 5,
    estimatedEvaluatedCases: 6,
  });
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.stages.length, 2);
  assert.equal(plan.views[0].sourceStage, 'standard-regression');
});

test('observe plan blocks overlap, missing identity and budget overflow', () => {
  const options = parseObserveArgs(['--dry-run', '--run-key=blocked', '--max-evaluated-cases=2']);
  const plan = createObservePlan({
    manifest: {
      ...manifest,
      suites: { ...manifest.suites, extendedRotation: { caseCount: 2, caseIds: ['C', 'D'] } },
    },
    goldManifest: { cases: [] },
    options,
    environment: {},
  });
  assert.ok(plan.blockers.includes('standard_rotation_overlap'));
  assert.ok(plan.blockers.includes('observe_case_budget_exceeded'));
  assert.ok(plan.blockers.includes('expected_release_id_required'));
  assert.ok(plan.blockers.includes('database_url_required'));
});

test('observe views reuse standard results for release-core and assign failure owners', () => {
  const root = mkdtempSync(join(tmpdir(), 'ami-brain-observe-'));
  const runKey = 'view-test';
  for (const stage of ['standard-regression', 'extended-rotation']) mkdirSync(join(root, runKey, stage), { recursive: true });
  const standard = [
    { caseKey: 'A', deterministicPassed: true, failureCluster: null, metadata: { domain: 'appointment' } },
    { caseKey: 'B', deterministicPassed: false, failureCluster: 'permission_not_denied', metadata: { domain: 'finance' } },
    { caseKey: 'C', deterministicPassed: true, failureCluster: null, metadata: { domain: 'customer' } },
  ];
  const rotation = [
    { caseKey: 'D', deterministicPassed: false, failureCluster: 'timeout', metadata: { domain: 'inventory' } },
    { caseKey: 'E', deterministicPassed: true, failureCluster: null, metadata: { domain: 'inventory' } },
  ];
  writeFileSync(join(root, runKey, 'standard-regression', 'results.json'), JSON.stringify(standard));
  writeFileSync(join(root, runKey, 'standard-regression', 'summary.json'), JSON.stringify({ runId: 11, total: 3 }));
  writeFileSync(join(root, runKey, 'extended-rotation', 'results.json'), JSON.stringify(rotation));
  writeFileSync(join(root, runKey, 'extended-rotation', 'summary.json'), JSON.stringify({ runId: 12, total: 2 }));
  const views = buildObserveViews({
    manifest,
    options: { runKey, defaultOwner: 'default-owner' },
    executions: [
      { stage: 'standard-regression', runId: 11 },
      { stage: 'extended-rotation', runId: 12 },
    ],
    evalRoot: root,
  });
  assert.equal(views.releaseCore.total, 2);
  assert.equal(views.releaseCore.failed, 1);
  assert.equal(views.releaseCoreResults.length, 2);
  assert.equal(views.failureClusters.find((item) => item.cluster === 'permission_not_denied').owner, 'ami-brain-security');
  assert.equal(views.failureClusters.find((item) => item.cluster === 'timeout').owner, 'ami-brain-platform');
});
