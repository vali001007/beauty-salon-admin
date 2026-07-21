import { evaluateCapabilitySourceFreshness } from './brain-capability-source-freshness.js';

describe('evaluateCapabilitySourceFreshness', () => {
  const scan = {
    schemaVersion: 1,
    generatedAt: '2026-07-17T00:00:00.000Z',
    capabilities: [{
      key: 'gap_fill_touch_preview',
      sourceFingerprint: 'b'.repeat(64),
      implementationDependencies: ['BrainMarketingDomainAdapter', 'GapOpportunityService'],
    }],
    summary: { total: 1, draft: 1, blocked: 0, explicit: 1 },
  } as never;

  it('accepts a release snapshot that matches the current source fingerprint', () => {
    expect(evaluateCapabilitySourceFreshness([
      { key: 'gap_fill_touch_preview', sourceFingerprint: 'b'.repeat(64) },
    ], scan)).toEqual({ valid: true, issues: [] });
  });

  it('reports stale implementation dependencies with the current dependency summary', () => {
    expect(evaluateCapabilitySourceFreshness([
      { key: 'gap_fill_touch_preview', sourceFingerprint: 'a'.repeat(64) },
    ], scan)).toEqual({
      valid: false,
      issues: [{
        capabilityKey: 'gap_fill_touch_preview',
        code: 'stale_source_fingerprint',
        publishedFingerprint: 'a'.repeat(64),
        currentFingerprint: 'b'.repeat(64),
        implementationDependencies: ['BrainMarketingDomainAdapter', 'GapOpportunityService'],
      }],
    });
  });

  it('fails closed when a release capability no longer exists in source', () => {
    expect(evaluateCapabilitySourceFreshness([{ key: 'removed_capability', sourceFingerprint: 'a'.repeat(64) }], scan))
      .toEqual({
        valid: false,
        issues: [{ capabilityKey: 'removed_capability', code: 'source_capability_missing' }],
      });
  });
});
