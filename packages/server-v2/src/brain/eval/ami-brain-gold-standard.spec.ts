import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  amiBrainGoldValueChecksum,
  assertAmiBrainGoldManifestContract,
  buildAmiBrainGoldAcceptanceStatus,
  compareAmiBrainGoldValue,
} from './ami-brain-gold-standard.js';

describe('Ami Brain gold standard deterministic comparison', () => {
  it('compares money exactly in fen without floating point rounding', () => {
    expect(compareAmiBrainGoldValue({ comparison: 'money_fen_exact', expected: '1,234.50元', actual: 1234.5 })).toMatchObject({
      passed: true,
      normalizedExpected: '123450',
      normalizedActual: '123450',
    });
    expect(compareAmiBrainGoldValue({ comparison: 'money_fen_exact', expected: '1.00', actual: '1.001' })).toMatchObject({
      passed: false,
      code: 'invalid_actual',
    });
  });

  it('requires integer counts and supports percent-form ratios with explicit tolerance', () => {
    expect(compareAmiBrainGoldValue({ comparison: 'integer_exact', expected: 9, actual: '9' }).passed).toBe(true);
    expect(compareAmiBrainGoldValue({ comparison: 'integer_exact', expected: 9, actual: '9 人' }).passed).toBe(true);
    expect(compareAmiBrainGoldValue({ comparison: 'integer_exact', expected: 9, actual: '9.0' }).passed).toBe(false);
    expect(
      compareAmiBrainGoldValue({ comparison: 'decimal_exact', expected: '12.50%', actual: 0.125, tolerance: '0.0001' }).passed,
    ).toBe(true);
  });

  it('compares id sets without row-order sensitivity but rejects duplicate actual rows', () => {
    expect(
      compareAmiBrainGoldValue({
        comparison: 'id_set_exact',
        expected: [{ customerId: 2 }, { customerId: 1 }],
        actual: [{ customerId: 1 }, { customerId: 2 }],
      }).passed,
    ).toBe(true);
    expect(
      compareAmiBrainGoldValue({
        comparison: 'id_set_exact',
        expected: [{ customerId: 1 }],
        actual: [{ customerId: 1 }, { customerId: 1 }],
      }),
    ).toMatchObject({ passed: false, code: 'duplicate_actual_rows' });
  });

  it('keeps ranking order strict and canonicalizes object key order', () => {
    expect(
      compareAmiBrainGoldValue({ comparison: 'ordered_rows', expected: [{ id: 1 }, { id: 2 }], actual: [{ id: 2 }, { id: 1 }] })
        .passed,
    ).toBe(false);
    expect(
      compareAmiBrainGoldValue({ comparison: 'json_exact', expected: { b: 2, a: 1 }, actual: { a: 1, b: 2 } }).passed,
    ).toBe(true);
  });

  it('normalizes governed boolean values', () => {
    expect(compareAmiBrainGoldValue({ comparison: 'boolean_exact', expected: true, actual: '已对平' }).passed).toBe(true);
    expect(compareAmiBrainGoldValue({ comparison: 'boolean_exact', expected: false, actual: '未对平' }).passed).toBe(true);
  });

  it('validates mapped candidate manifests without pretending snapshots are ready', () => {
    const cases = Array.from({ length: 100 }, (_, index) => ({
      goldCaseId: `GOLD-${index}`,
      sourceCaseId: `BQ-${index}`,
      expectedCapabilityKey: 'customer_facts',
      audit: { status: 'contract_mapped', resolverKey: 'customer.new_customer_count', queryVersion: 'v1-pending-implementation' },
      expectedSnapshot: { status: 'pending', generatedAt: null, value: null, checksum: null },
      releaseBlocking: true,
    }));
    const manifest = {
      schemaVersion: 'ami-brain-gold-standard/v1',
      status: 'candidate_pending_truth_snapshot',
      caseCount: 100,
      truthReadiness: {
        capabilityMapped: 100,
        auditContractMapped: 100,
        auditQueryReady: 0,
        snapshotReady: 0,
        releaseBlockingUntilReady: true,
      },
      cases,
    };
    expect(assertAmiBrainGoldManifestContract(manifest)).toBe(manifest);
    expect(() =>
      assertAmiBrainGoldManifestContract({
        ...manifest,
        status: 'ready',
      }),
    ).toThrow('ami_brain_gold_manifest_falsely_ready');
  });

  it('checksums canonical values deterministically', () => {
    expect(amiBrainGoldValueChecksum({ b: 2, a: 1 })).toBe(amiBrainGoldValueChecksum({ a: 1, b: 2 }));
  });

  it('keeps a mapped candidate blocked until audit queries, snapshots, and result comparisons are complete', () => {
    const manifest = candidateManifest();
    expect(
      buildAmiBrainGoldAcceptanceStatus({
        manifest,
        manifestChecksum: 'a'.repeat(64),
        currentSource: currentSource(manifest),
        results: [],
      }),
    ).toMatchObject({
      status: 'blocked',
      caseCount: 100,
      auditQueryReady: 0,
      snapshotReady: 0,
      evaluated: 0,
      passed: 0,
      blockingReasons: expect.arrayContaining([
        'manifest_not_ready',
        'audit_queries_not_ready',
        'truth_snapshots_not_ready',
        expect.stringContaining('missing_results:'),
      ]),
    });
  });

  it('accepts the finalized repository manifest only when it matches the current suite and eligibility source', () => {
    const path = resolve(
      process.cwd(),
      '../../docs/04-测试数据/Ami-Brain-事实金标准/ami-brain-gold-standard-manifest-v1.json',
    );
    const raw = readFileSync(path, 'utf8');
    const manifest = JSON.parse(raw) as Record<string, any>;
    const suitePath = resolve(
      process.cwd(),
      '../../docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json',
    );
    const suiteRaw = readFileSync(suitePath, 'utf8');
    const suite = JSON.parse(suiteRaw) as Record<string, any>;
    const productLoopRaw = readFileSync(resolve(process.cwd(), '../..', suite.productLoopEligibility.path), 'utf8');
    expect(assertAmiBrainGoldManifestContract(manifest)).toBe(manifest);
    expect(manifest).toMatchObject({
      status: 'ready',
      caseCount: 100,
      truthReadiness: { auditQueryReady: 100, snapshotReady: 100 },
    });
    const acceptance = buildAmiBrainGoldAcceptanceStatus({
      manifest,
      manifestChecksum: createHash('sha256').update(raw, 'utf8').digest('hex'),
      currentSource: {
        suiteManifestChecksum: createHash('sha256').update(suiteRaw, 'utf8').digest('hex'),
        productLoopEligibilityChecksum: createHash('sha256').update(productLoopRaw, 'utf8').digest('hex'),
        standardRegressionCaseIdsChecksum: suite.suites.standardRegression.caseIdsChecksum,
        standardRegressionCaseIds: suite.suites.standardRegression.caseIds,
      },
      results: manifest.cases.map((item: Record<string, unknown>) => ({ sourceCaseId: String(item.sourceCaseId), passed: true })),
    });
    expect(acceptance).toMatchObject({ status: 'ready', evaluated: 100, passed: 100, failed: 0, blockingReasons: [] });
  });

  it('blocks a ready gold manifest when its suite or eligibility source is stale', () => {
    const manifest = readyManifestFixture();
    const source = currentSource(manifest);
    const acceptance = buildAmiBrainGoldAcceptanceStatus({
      manifest,
      manifestChecksum: 'a'.repeat(64),
      currentSource: { ...source, suiteManifestChecksum: 'f'.repeat(64) },
      results: manifest.cases.map((item: Record<string, unknown>) => ({ sourceCaseId: String(item.sourceCaseId), passed: true })),
    });
    expect(acceptance.status).not.toBe('ready');
    expect(acceptance.blockingReasons).toContain('suite_manifest_identity_mismatch');
  });

  it('keeps evaluated and passed counts unique when one result is repeated three times', () => {
    const manifest = readyManifestFixture();
    const source = currentSource(manifest);
    const results = manifest.cases.map((item: Record<string, unknown>) => ({
      sourceCaseId: String(item.sourceCaseId),
      passed: true,
    }));
    results.push({ ...results[0]! }, { ...results[0]! });
    const acceptance = buildAmiBrainGoldAcceptanceStatus({
      manifest,
      manifestChecksum: 'a'.repeat(64),
      currentSource: source,
      results,
    });
    expect(acceptance).toMatchObject({ status: 'blocked', evaluated: 100, passed: 100 });
    expect(acceptance.blockingReasons).toContain('duplicate_results:BQ-0');
  });
});

function candidateManifest() {
  const cases = Array.from({ length: 100 }, (_, index) => ({
    goldCaseId: `GOLD-${index}`,
    sourceCaseId: `BQ-${index}`,
    expectedCapabilityKey: 'customer_facts',
    audit: { status: 'contract_mapped', resolverKey: 'customer.new_customer_count', queryVersion: 'v1-pending-implementation' },
    expectedSnapshot: { status: 'pending', generatedAt: null, value: null, checksum: null },
    releaseBlocking: true,
  }));
  return {
    schemaVersion: 'ami-brain-gold-standard/v1',
    manifestVersion: '2026-07-29-v1-candidate',
    status: 'candidate_pending_truth_snapshot',
    source: {
      suiteManifestChecksum: 'b'.repeat(64),
      productLoopEligibilityChecksum: 'c'.repeat(64),
      standardRegressionCaseIdsChecksum: 'd'.repeat(64),
    },
    caseCount: 100,
    truthReadiness: {
      capabilityMapped: 100,
      auditContractMapped: 100,
      auditQueryReady: 0,
      snapshotReady: 0,
      releaseBlockingUntilReady: true,
    },
    cases,
  };
}

function readyManifestFixture() {
  const manifest = candidateManifest() as Record<string, any>;
  manifest.status = 'ready';
  manifest.truthReadiness.auditQueryReady = 100;
  manifest.truthReadiness.snapshotReady = 100;
  manifest.cases = manifest.cases.map((item: Record<string, any>) => ({
    ...item,
    audit: { ...item.audit, status: 'ready', queryVersion: 'v1' },
    expectedSnapshot: {
      status: 'ready',
      generatedAt: '2026-07-29T00:00:00.000Z',
      value: 1,
      checksum: amiBrainGoldValueChecksum(1),
    },
  }));
  return manifest;
}

function currentSource(manifest: Record<string, any>) {
  return {
    suiteManifestChecksum: manifest.source.suiteManifestChecksum,
    productLoopEligibilityChecksum: manifest.source.productLoopEligibilityChecksum,
    standardRegressionCaseIdsChecksum: manifest.source.standardRegressionCaseIdsChecksum,
    standardRegressionCaseIds: manifest.cases.map((item: Record<string, unknown>) => String(item.sourceCaseId)),
  };
}
