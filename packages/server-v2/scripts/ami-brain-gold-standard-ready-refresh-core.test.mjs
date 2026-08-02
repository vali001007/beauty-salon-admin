import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { refreshReadyGoldManifestGroup } from './ami-brain-gold-standard-ready-refresh-core.mjs';

test('rebinds a refreshed ready truth group and records changed cases', () => {
  const manifest = readyManifest();
  const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`;
  const artifact = truthArtifact(manifestRaw);
  const artifactRaw = `${JSON.stringify(artifact, null, 2)}\n`;
  const refreshed = refreshReadyGoldManifestGroup({
    manifest,
    manifestRaw,
    artifact,
    artifactRaw,
    groupKey: 'finance',
    expectedCount: 1,
    nextManifestVersion: 'v2',
    refreshedAt: '2026-07-31T00:00:00.000Z',
  });
  assert.equal(refreshed.manifestVersion, 'v2');
  assert.equal(refreshed.cases[0].expectedSnapshot.value, 0.6678);
  assert.equal(refreshed.cases[0].expectedSnapshot.truthArtifactChecksum, sha256(artifactRaw));
  assert.deepEqual(refreshed.truthRefreshHistory.at(-1).changedCaseIds, ['BQ1268']);
});

test('rejects stale artifacts and same-version refreshes', () => {
  const manifest = readyManifest();
  const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`;
  const artifact = truthArtifact(manifestRaw);
  const input = {
    manifest,
    manifestRaw,
    artifact,
    artifactRaw: `${JSON.stringify(artifact, null, 2)}\n`,
    groupKey: 'finance',
    expectedCount: 1,
    nextManifestVersion: 'v2',
    refreshedAt: '2026-07-31T00:00:00.000Z',
  };
  assert.throws(
    () => refreshReadyGoldManifestGroup({ ...input, nextManifestVersion: 'v1' }),
    /requires a new manifest version/u,
  );
  assert.throws(
    () => refreshReadyGoldManifestGroup({ ...input, artifact: { ...artifact, manifestChecksum: 'f'.repeat(64) } }),
    /artifact invalid:finance/u,
  );
});

function readyManifest() {
  const artifactPath = 'docs/04-测试数据/Ami-Brain-事实金标准/ami-brain-gold-standard-truth-finance-v1.json';
  const cases = Array.from({ length: 100 }, (_, index) => ({
    goldCaseId: index === 0 ? 'GOLD-BQ1268' : `GOLD-BQ${String(index).padStart(4, '0')}`,
    sourceCaseId: index === 0 ? 'BQ1268' : `BQ${String(index).padStart(4, '0')}`,
    groupKey: index === 0 ? 'finance' : 'customer',
    audit: {
      status: 'ready',
      resolverKey: index === 0 ? 'finance.gross_margin' : 'customer.new_customer_count',
      comparison: index === 0 ? 'decimal_exact' : 'integer_exact',
    },
    expectedSnapshot: {
      status: 'ready',
      generatedAt: '2026-07-29T00:00:00.000Z',
      sourceRowCount: 1,
      sourceChecksum: 'a'.repeat(64),
      value: index === 0 ? 2847.48 : 1,
      checksum: index === 0 ? sha256('2847.48') : sha256('1'),
      truthArtifactPath: artifactPath,
      truthArtifactChecksum: 'b'.repeat(64),
    },
  }));
  return {
    schemaVersion: 'ami-brain-gold-standard/v1',
    manifestVersion: 'v1',
    status: 'ready',
    caseCount: 100,
    source: {},
    truthArtifacts: [
      {
        groupKey: 'finance',
        path: artifactPath,
        checksum: 'b'.repeat(64),
        truthVersion: 'finance-v1-old',
        generatedAt: '2026-07-29T00:00:00.000Z',
        caseCount: 1,
        sourceDatasetChecksum: 'c'.repeat(64),
      },
    ],
    cases,
  };
}

function truthArtifact(manifestRaw) {
  return {
    schemaVersion: 'ami-brain-gold-standard-truth/v1',
    truthVersion: 'finance-v1-new',
    status: 'ready',
    generatedAt: '2026-07-31T00:00:00.000Z',
    groupKey: 'finance',
    manifestChecksum: sha256(manifestRaw),
    groupCaseCount: 1,
    readyCaseCount: 1,
    blockedCaseCount: 0,
    remainingCaseCount: 0,
    sourceDatasetChecksum: 'd'.repeat(64),
    snapshots: [
      {
        goldCaseId: 'GOLD-BQ1268',
        sourceCaseId: 'BQ1268',
        resolverKey: 'finance.gross_margin',
        queryVersion: 'v1',
        evaluationQuestion: '2026年6月29日的毛利率',
        snapshotAt: '2026-07-31T00:00:00.000Z',
        sourceRowCount: 1,
        sourceChecksum: 'e'.repeat(64),
        value: 0.6678,
        valueChecksum: sha256('0.6678'),
        comparison: 'decimal_exact',
        definition: '毛利率 = 毛利 / 收入',
        status: 'ready',
      },
    ],
  };
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
