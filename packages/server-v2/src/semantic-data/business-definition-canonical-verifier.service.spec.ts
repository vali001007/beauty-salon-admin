import {
  BusinessDefinitionCanonicalVerifierService,
  type BusinessDefinitionCanonicalQueryAdapter,
  type BusinessDefinitionFixtureSource,
} from './business-definition-canonical-verifier.service.js';

describe('BusinessDefinitionCanonicalVerifierService', () => {
  it('fails closed when no fixture source or query adapter is configured', async () => {
    const verifier = new BusinessDefinitionCanonicalVerifierService();

    await expect(verifier.verify(baseInput())).resolves.toMatchObject({
      passed: false,
      code: 'canonical_verifier_unavailable',
    });
  });

  it('rejects a malformed canonical query reference before execution', async () => {
    const verifier = new BusinessDefinitionCanonicalVerifierService(fixtureSource(), [passingAdapter()]);

    await expect(
      verifier.verify({ ...baseInput(), canonicalQueryRef: 'forged ref; drop table' }),
    ).resolves.toMatchObject({
      passed: false,
      code: 'invalid_canonical_query_ref',
    });
  });

  it('rejects an unknown nonempty canonical query reference', async () => {
    const verifier = new BusinessDefinitionCanonicalVerifierService(fixtureSource(), [
      { ...passingAdapter(), supports: jest.fn().mockReturnValue(false) },
    ]);

    await expect(verifier.verify(baseInput())).resolves.toMatchObject({
      passed: false,
      code: 'unknown_canonical_query_ref',
    });
  });

  it('rejects an unknown nonempty fixture key', async () => {
    const verifier = new BusinessDefinitionCanonicalVerifierService({ load: jest.fn().mockResolvedValue(null) }, [
      passingAdapter(),
    ]);

    await expect(verifier.verify(baseInput())).resolves.toMatchObject({ passed: false, code: 'unknown_fixture_set' });
  });

  it('rejects expected and actual result mismatch', async () => {
    const verifier = new BusinessDefinitionCanonicalVerifierService(fixtureSource(), [
      { ...passingAdapter(), execute: jest.fn().mockResolvedValue({ total: 99 }) },
    ]);

    await expect(verifier.verify(baseInput())).resolves.toMatchObject({
      passed: false,
      code: 'canonical_result_mismatch',
      comparedCases: 1,
    });
  });

  it('rejects adapter execution failure', async () => {
    const verifier = new BusinessDefinitionCanonicalVerifierService(fixtureSource(), [
      { ...passingAdapter(), execute: jest.fn().mockRejectedValue(new Error('database unavailable')) },
    ]);

    await expect(verifier.verify(baseInput())).resolves.toMatchObject({
      passed: false,
      code: 'canonical_execution_failed',
    });
  });

  it('passes only after loading fixtures and comparing every executed result', async () => {
    const source = fixtureSource();
    const adapter = passingAdapter();
    const verifier = new BusinessDefinitionCanonicalVerifierService(source, [adapter]);

    await expect(verifier.verify(baseInput())).resolves.toEqual({
      passed: true,
      code: 'canonical_verification_passed',
      comparedCases: 1,
      mismatches: [],
    });
    expect(source.load).toHaveBeenCalledWith('finance.net_revenue.v1');
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalQueryRef: 'finance_metrics.net_revenue',
        timezone: 'Asia/Shanghai',
        storeScope: { mode: 'current_store' },
        fixtureCase: expect.objectContaining({ caseKey: 'base' }),
      }),
    );
  });
});

function baseInput() {
  return {
    version: {
      id: 21,
      definitionId: 10,
      version: 1,
      schemaVersion: '1.0',
      payload: { aggregation: 'sum' },
      lifecycleStatus: 'draft',
      fingerprint: 'a'.repeat(64),
      sourceFingerprint: 'b'.repeat(64),
      validationStatus: 'pending',
      timezone: 'Asia/Shanghai',
      storeScope: { mode: 'current_store' },
      definition: {
        id: 10,
        definitionKey: 'metric.net_revenue',
        kind: 'metric',
        domain: 'finance',
        name: '净收入',
        ownerType: 'system',
      },
    },
    canonicalQueryRef: 'finance_metrics.net_revenue',
    fixtureSetKey: 'finance.net_revenue.v1',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
  } as any;
}

function fixtureSource(): BusinessDefinitionFixtureSource & { load: jest.Mock } {
  return {
    load: jest.fn().mockResolvedValue({
      fixtureSetKey: 'finance.net_revenue.v1',
      cases: [{ caseKey: 'base', input: { storeId: 6 }, expected: { total: 100 } }],
    }),
  };
}

function passingAdapter(): BusinessDefinitionCanonicalQueryAdapter & { supports: jest.Mock; execute: jest.Mock } {
  return {
    supports: jest.fn().mockReturnValue(true),
    execute: jest.fn().mockResolvedValue({ total: 100 }),
  };
}
